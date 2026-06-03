const axios = require('axios');
const logger = require('./logger');

/**
 * Cloudflare Turnstile — server-side token verification.
 *
 * Performs the secure server-to-server "siteverify" handshake. The frontend
 * obtains a one-time token from the Turnstile widget and forwards it with the
 * login payload; this confirms with Cloudflare that the token is genuine before
 * we run any password hashing or database lookups.
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * @param {string} token     The Turnstile response token from the client.
 * @param {string} [remoteIp] The end-user's IP (optional, hardens validation).
 * @returns {Promise<boolean>} true only when Cloudflare confirms success.
 */
async function verifyTurnstileToken(token, remoteIp) {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

  // If no secret is configured (e.g. local dev without the key) skip the check
  // but log loudly. In any environment where the key IS set, verification is
  // strictly enforced and fails closed on any error.
  if (!secret) {
    logger.warn('CLOUDFLARE_TURNSTILE_SECRET_KEY is not set — skipping Turnstile verification.');
    return true;
  }

  // No token supplied → cannot be a verified human request.
  if (!token || typeof token !== 'string') return false;

  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    if (remoteIp) params.append('remoteip', remoteIp);

    const { data } = await axios.post(TURNSTILE_VERIFY_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 8000,
    });

    if (!data || data.success !== true) {
      logger.warn(`Turnstile verification rejected: ${JSON.stringify(data?.['error-codes'] || data)}`);
      return false;
    }
    return true;
  } catch (err) {
    // Network/timeout/5xx from Cloudflare → fail closed (treat as not verified).
    logger.error(`Turnstile verification request failed: ${err.message}`);
    return false;
  }
}

module.exports = { verifyTurnstileToken, TURNSTILE_VERIFY_URL };
