const axios = require('axios');
const { randomUUID } = require('crypto');
const logger = require('./logger');

/**
 * Cashfree Secure ID — PAN verification client (KYC name auto-fetch).
 *
 * Wires the onboarding PAN lookup to Cashfree's Verification (Secure ID) suite.
 * Credentials + environment are read from env and never leave the server:
 *
 *   CASHFREE_CLIENT_ID        Cashfree appId        → sent as `x-client-id`
 *   CASHFREE_CLIENT_SECRET    Cashfree secretKey    → sent as `x-client-secret`
 *   CASHFREE_ENV              'production' | 'sandbox' (default: 'sandbox')
 *   CASHFREE_VERIFICATION_BASE_URL  (optional) explicit base-URL override
 *
 * Endpoint: <base>/pan/advance  (POST)
 *   base = https://api.cashfree.com/verification        (production)
 *          https://sandbox.cashfree.com/verification    (sandbox)
 *
 * Design notes:
 *   • No fabricated results. There is NO mock and NO "verify during review"
 *     auto-pass — a verification only succeeds when Cashfree returns a valid
 *     PAN + registered_name.
 *   • "PAN not found / invalid" is a normal API outcome and resolves to
 *     { verified:false } (HTTP 200 upstream) so the client can prompt a re-check.
 *   • Genuine faults (missing config, network/timeout, upstream 4xx/5xx) THROW a
 *     structured error so the controller can return an honest 5xx instead of
 *     silently passing the user through.
 */

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const REQUEST_TIMEOUT_MS = 15000;
const PAN_RESOURCE_PATH = '/pan/advance';

/** Resolve the Cashfree Verification base URL from the environment switch. */
function baseUrl() {
  if (process.env.CASHFREE_VERIFICATION_BASE_URL) {
    return process.env.CASHFREE_VERIFICATION_BASE_URL.replace(/\/+$/, '');
  }
  const env = String(process.env.CASHFREE_ENV || 'sandbox').toLowerCase();
  return env === 'production' || env === 'prod'
    ? 'https://api.cashfree.com/verification'
    : 'https://sandbox.cashfree.com/verification';
}

/** True only when both Cashfree credentials are present. */
function isConfigured() {
  return Boolean(process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET);
}

/** Structural PAN validation (ABCDE1234F). @returns {boolean} */
function isValidPanFormat(pan) {
  return PAN_RE.test(String(pan || '').toUpperCase().trim());
}

/** Build a structured, classifiable error for the controller to map to a status. */
function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Verify a PAN with Cashfree and extract the registered legal name.
 *
 * @param {string} pan 10-char PAN (case-insensitive; upper-cased internally).
 * @returns {Promise<{verified:boolean, name:string|null, status:string, message:string, verificationId:string|null}>}
 *   Resolves for both "valid" and "invalid PAN" (a normal upstream outcome).
 * @throws {Error} with `.code` of CASHFREE_NOT_CONFIGURED | CASHFREE_UPSTREAM
 *   for config/network/upstream faults — never fabricate a pass on failure.
 */
async function verifyPan(pan) {
  const normalized = String(pan || '').toUpperCase().trim();

  if (!isValidPanFormat(normalized)) {
    return { verified: false, name: null, status: 'INVALID_FORMAT', message: 'Invalid PAN format.', verificationId: null };
  }

  if (!isConfigured()) {
    throw makeError('CASHFREE_NOT_CONFIGURED', 'Cashfree verification credentials are not configured.');
  }

  // Unique, traceable id Cashfree echoes back and logs against this request.
  const verificationId = `ALB-PAN-${randomUUID().replace(/-/g, '').slice(0, 20)}`;

  let data;
  try {
    ({ data } = await axios.post(
      `${baseUrl()}${PAN_RESOURCE_PATH}`,
      { pan: normalized, verification_id: verificationId },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': process.env.CASHFREE_CLIENT_ID,
          'x-client-secret': process.env.CASHFREE_CLIENT_SECRET,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    ));
  } catch (err) {
    const status = err?.response?.status;
    const apiMsg = err?.response?.data?.message || err?.response?.data?.error || err.message;
    logger.error(`[cashfree:pan] ${verificationId} upstream error${status ? ` [${status}]` : ''}: ${typeof apiMsg === 'string' ? apiMsg : JSON.stringify(apiMsg)}`);
    throw makeError('CASHFREE_UPSTREAM', 'PAN verification service is currently unavailable.');
  }

  // Cashfree returns registered_name + a validity signal (valid:true / status:"VALID").
  const registeredName = data?.registered_name || data?.data?.registered_name || null;
  const isValid = data?.valid === true || String(data?.status || data?.data?.status || '').toUpperCase() === 'VALID';

  if (isValid && registeredName) {
    return {
      verified: true,
      name: String(registeredName).trim(),
      status: 'VALID',
      message: 'PAN verified with the income tax registry.',
      verificationId,
    };
  }

  // Valid API call, but the PAN is not valid / has no name — a normal outcome.
  return {
    verified: false,
    name: null,
    status: String(data?.status || data?.data?.status || 'INVALID').toUpperCase(),
    message: 'This PAN could not be verified with the income tax registry. Please re-check the number.',
    verificationId,
  };
}

module.exports = { isConfigured, isValidPanFormat, verifyPan };
