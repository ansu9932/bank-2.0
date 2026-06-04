const axios = require('axios');
const logger = require('./logger');

/**
 * PAN verification client (KYC name auto-fetch).
 *
 * Connects to a configurable third-party KYC aggregator gateway that exposes a
 * PAN → legal-name lookup. The gateway URL + API key are read from env so the
 * provider can be swapped without code changes:
 *
 *   PAN_VERIFY_API_URL   Full endpoint, e.g. https://api.<aggregator>.com/pan/verify
 *   PAN_VERIFY_API_KEY   Bearer/API key issued by the aggregator
 *
 * The module degrades gracefully:
 *   • If credentials are absent, isConfigured() is false and the controller
 *     returns a clean "verification unavailable" fallback (NOT a hard failure),
 *     so onboarding is never blocked by a missing integration.
 *   • In non-production, setting PAN_VERIFY_ALLOW_MOCK=true returns a clearly
 *     LABELLED mock name so the end-to-end flow can be exercised locally
 *     without a live aggregator. This is never used when NODE_ENV=production.
 */

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const REQUEST_TIMEOUT_MS = 15000;

function isConfigured() {
  return Boolean(process.env.PAN_VERIFY_API_URL && process.env.PAN_VERIFY_API_KEY);
}

function mockEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.PAN_VERIFY_ALLOW_MOCK === 'true';
}

/** Structural PAN validation. @returns {boolean} */
function isValidPanFormat(pan) {
  return PAN_RE.test(String(pan || '').toUpperCase().trim());
}

/**
 * Verify a PAN against the configured aggregator and extract the legal name.
 *
 * @param {string} pan 10-char PAN (case-insensitive; upper-cased internally).
 * @returns {Promise<{verified: boolean, name: string|null, message: string, source: string}>}
 *   Never throws for "PAN not found" / upstream issues — those resolve as
 *   { verified:false, ... } so the caller can return a graceful 200 fallback.
 *   Only truly unexpected programming errors propagate.
 */
async function verifyPan(pan) {
  const normalized = String(pan || '').toUpperCase().trim();

  if (!isValidPanFormat(normalized)) {
    return { verified: false, name: null, message: 'Invalid PAN format.', source: 'validation' };
  }

  // ── No live integration configured ────────────────────────────────────────
  if (!isConfigured()) {
    if (mockEnabled()) {
      // Clearly-labelled non-production mock. Deterministic from the PAN so the
      // same input yields a stable name during local testing.
      logger.warn(`[panVerify] Using LABELLED MOCK for ${normalized} (no aggregator configured; non-prod mock enabled).`);
      return {
        verified: true,
        name: `Test User ${normalized.slice(0, 5)}`,
        message: 'Verified (mock — non-production).',
        source: 'mock',
      };
    }
    return {
      verified: false,
      name: null,
      message: 'PAN verification service is not configured. Your PAN will be verified manually during review.',
      source: 'unconfigured',
    };
  }

  // ── Live aggregator call ────────────────────────────────────────────────────
  try {
    const { data } = await axios.post(
      process.env.PAN_VERIFY_API_URL,
      { pan: normalized },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.PAN_VERIFY_API_KEY}`,
        },
        timeout: REQUEST_TIMEOUT_MS,
      }
    );

    // Aggregators vary in shape; accept the common field names defensively.
    const name = data?.name || data?.full_name || data?.registered_name
      || data?.data?.name || data?.data?.full_name || null;
    const validFlag = data?.valid ?? data?.verified ?? data?.data?.valid;
    const verified = Boolean(name) && (validFlag === undefined ? true : Boolean(validFlag));

    if (verified) {
      return { verified: true, name: String(name).trim(), message: 'PAN verified.', source: 'aggregator' };
    }
    return {
      verified: false,
      name: null,
      message: 'PAN could not be verified with the tax registry. Please re-check the number.',
      source: 'aggregator',
    };
  } catch (err) {
    const apiMsg = err?.response?.data?.message || err?.response?.data?.error || err.message;
    logger.error(`[panVerify] aggregator error for ${normalized}: ${typeof apiMsg === 'string' ? apiMsg : JSON.stringify(apiMsg)}`);
    // Upstream/network failure → graceful, non-blocking fallback.
    return {
      verified: false,
      name: null,
      message: 'PAN verification is temporarily unavailable. You can continue; we will verify during review.',
      source: 'error',
    };
  }
}

module.exports = { isConfigured, isValidPanFormat, verifyPan };
