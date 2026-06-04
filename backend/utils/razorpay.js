const axios = require('axios');
const logger = require('./logger');

/**
 * Razorpay SDK wrapper — Alister Bank UPI deposit + RazorpayX payout pipeline.
 *
 * The SDK is required defensively: if the `razorpay` package is not yet
 * installed (e.g. fresh clone before `npm install`) the whole server must NOT
 * crash on boot. Instead we degrade gracefully and the payment endpoints
 * surface a clean 503 until the dependency + keys are present.
 */
let Razorpay = null;
try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  Razorpay = require('razorpay');
} catch (err) {
  logger.warn(
    'Razorpay SDK not installed. Run `npm install razorpay` to enable UPI deposits. '
    + 'Payment endpoints will respond with 503 until the SDK and keys are configured.'
  );
}

// RazorpayX (Payouts) + core API base. The Payouts/Contacts/Fund-Account and
// VPA-validation endpoints are plain REST calls authenticated with the same
// key_id:key_secret pair via HTTP Basic auth, so we use axios directly rather
// than the SDK (which focuses on the core payments surface).
const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

let instance = null;

/**
 * Lazily build (and cache) a singleton Razorpay client from env keys.
 * @returns {object|null} configured client, or null when unavailable.
 */
function getRazorpayInstance() {
  if (!Razorpay) return null;
  if (instance) return instance;

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    logger.warn('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured.');
    return null;
  }

  instance = new Razorpay({ key_id, key_secret });
  return instance;
}

/**
 * Whether the payment pipeline is fully ready (SDK installed + keys present).
 * @returns {boolean}
 */
function isConfigured() {
  return Boolean(getRazorpayInstance());
}

/**
 * Create a dynamic, single-use UPI QR code for a fixed deposit amount.
 *
 * @param {object} params
 * @param {number} params.amount      Amount in INR (rupees).
 * @param {string} params.description Human-readable label shown on UPI apps.
 * @param {object} params.notes       Metadata propagated to the captured payment.
 * @param {number} [params.closeBy]   Unix epoch (seconds) when the QR expires.
 * @returns {Promise<object>} The Razorpay QR code entity.
 */
async function createUpiQr({ amount, description, notes, closeBy }) {
  const client = getRazorpayInstance();
  if (!client) throw new Error('RAZORPAY_NOT_CONFIGURED');

  const payload = {
    type: 'upi_qr',
    name: 'Alister Bank',
    usage: 'single_use',
    fixed_amount: true,
    payment_amount: Math.round(Number(amount) * 100), // paise
    description,
    notes,
  };
  if (closeBy) payload.close_by = closeBy;

  return client.qrCode.create(payload);
}

/**
 * Cryptographically validate an incoming Razorpay webhook signature.
 *
 * @param {string|Buffer} body      The RAW request body (exact bytes received).
 * @param {string} signature        Value of the `x-razorpay-signature` header.
 * @param {string} secret           The configured webhook secret.
 * @returns {boolean} true only when the signature is authentic.
 */
function validateWebhookSignature(body, signature, secret) {
  if (!Razorpay || typeof Razorpay.validateWebhookSignature !== 'function') {
    logger.error('Razorpay SDK unavailable — cannot validate webhook signature.');
    return false;
  }
  if (!signature || !secret) return false;

  try {
    const rawBody = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
    return Razorpay.validateWebhookSignature(rawBody, signature, secret);
  } catch (err) {
    logger.error(`Razorpay signature validation error: ${err.message}`);
    return false;
  }
}

// ─── RazorpayX Payouts + VPA validation (REST via axios) ──────────────────────

/**
 * Build an authenticated axios client for the Razorpay REST API.
 * @returns {import('axios').AxiosInstance|null} null when keys are missing.
 */
function getPayoutClient() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    logger.warn('RazorpayX payout keys (RAZORPAY_KEY_ID/SECRET) are not configured.');
    return null;
  }
  return axios.create({
    baseURL: RAZORPAY_API_BASE,
    auth: { username: key_id, password: key_secret },
    headers: { 'Content-Type': 'application/json' },
    timeout: 20000,
  });
}

/**
 * Whether payouts are fully configured: keys present AND a RazorpayX source
 * account number is set (funds are debited from this virtual account).
 * @returns {boolean}
 */
function isPayoutConfigured() {
  return Boolean(
    process.env.RAZORPAY_KEY_ID
    && process.env.RAZORPAY_KEY_SECRET
    && process.env.RAZORPAYX_ACCOUNT_NUMBER
  );
}

/** Normalize axios errors into a single, log-safe message. */
function payoutError(err, label) {
  const apiMsg = err?.response?.data?.error?.description
    || err?.response?.data?.message
    || err?.message
    || 'Unknown payout error';
  logger.error(`RazorpayX ${label} failed: ${apiMsg}`);
  const e = new Error(apiMsg);
  e.isPayoutError = true;
  e.status = err?.response?.status;
  return e;
}

/**
 * Create (or reference) a RazorpayX Contact for the beneficiary.
 * @param {object} p
 * @param {string} p.name
 * @param {string} [p.referenceId] idempotency-friendly external id
 * @returns {Promise<object>} contact entity
 */
async function createContact({ name, referenceId, type = 'customer' }) {
  const client = getPayoutClient();
  if (!client) throw new Error('RAZORPAY_NOT_CONFIGURED');
  try {
    const { data } = await client.post('/contacts', {
      name: String(name || 'Beneficiary').slice(0, 50),
      type,
      reference_id: referenceId,
    });
    return data;
  } catch (err) {
    throw payoutError(err, 'createContact');
  }
}

/**
 * Create a bank-account fund account for a contact.
 * @param {object} p
 * @param {string} p.contactId
 * @param {string} p.name beneficiary name on the account
 * @param {string} p.ifsc
 * @param {string} p.accountNumber
 * @returns {Promise<object>} fund account entity
 */
async function createBankFundAccount({ contactId, name, ifsc, accountNumber }) {
  const client = getPayoutClient();
  if (!client) throw new Error('RAZORPAY_NOT_CONFIGURED');
  try {
    const { data } = await client.post('/fund_accounts', {
      contact_id: contactId,
      account_type: 'bank_account',
      bank_account: {
        name: String(name || 'Beneficiary').slice(0, 120),
        ifsc: String(ifsc || '').toUpperCase(),
        account_number: String(accountNumber || ''),
      },
    });
    return data;
  } catch (err) {
    throw payoutError(err, 'createBankFundAccount');
  }
}

/**
 * Create a VPA (UPI) fund account for a contact.
 * @param {object} p
 * @param {string} p.contactId
 * @param {string} p.vpa
 * @returns {Promise<object>} fund account entity
 */
async function createVpaFundAccount({ contactId, vpa }) {
  const client = getPayoutClient();
  if (!client) throw new Error('RAZORPAY_NOT_CONFIGURED');
  try {
    const { data } = await client.post('/fund_accounts', {
      contact_id: contactId,
      account_type: 'vpa',
      vpa: { address: String(vpa || '').trim() },
    });
    return data;
  } catch (err) {
    throw payoutError(err, 'createVpaFundAccount');
  }
}

/**
 * Execute a payout from the RazorpayX source account to a fund account.
 * @param {object} p
 * @param {string} p.fundAccountId
 * @param {number} p.amount       rupees (converted to paise internally)
 * @param {string} p.mode         'UPI' | 'IMPS' | 'NEFT' | 'RTGS'
 * @param {string} [p.referenceId]
 * @param {string} [p.narration]
 * @returns {Promise<object>} payout entity
 */
async function createPayout({ fundAccountId, amount, mode, referenceId, narration }) {
  const client = getPayoutClient();
  if (!client) throw new Error('RAZORPAY_NOT_CONFIGURED');
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  if (!accountNumber) throw new Error('RAZORPAYX_ACCOUNT_NUMBER not configured');
  try {
    const { data } = await client.post('/payouts', {
      account_number: accountNumber,
      fund_account_id: fundAccountId,
      amount: Math.round(Number(amount) * 100), // paise
      currency: 'INR',
      mode,                                       // UPI | IMPS | NEFT | RTGS
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: referenceId,
      narration: String(narration || 'Alister Bank Payout').slice(0, 30),
    });
    return data;
  } catch (err) {
    throw payoutError(err, 'createPayout');
  }
}

/**
 * Validate a UPI VPA via Razorpay's validation API and return the registered
 * customer name + provider so the UI can confirm the payee in real time.
 * @param {string} vpa
 * @returns {Promise<{ valid: boolean, customerName: string|null,
 *   provider: string|null, vpa: string }>}
 */
async function validateVpa(vpa) {
  const client = getPayoutClient();
  if (!client) throw new Error('RAZORPAY_NOT_CONFIGURED');
  const address = String(vpa || '').trim();
  try {
    const { data } = await client.post('/payments/validate/vpa', { vpa: address });
    const provider = address.includes('@') ? address.split('@')[1] : null;
    return {
      valid: data?.success === true || Boolean(data?.customer_name),
      customerName: data?.customer_name || null,
      provider: data?.provider || provider,
      vpa: address,
    };
  } catch (err) {
    // A 400 here generally means the VPA is simply invalid — surface a clean
    // negative result instead of throwing, so the UI can show "not found".
    if (err?.response?.status === 400) {
      return { valid: false, customerName: null, provider: null, vpa: address };
    }
    throw payoutError(err, 'validateVpa');
  }
}

module.exports = {
  getRazorpayInstance,
  isConfigured,
  createUpiQr,
  validateWebhookSignature,
  // RazorpayX payouts + VPA validation
  isPayoutConfigured,
  createContact,
  createBankFundAccount,
  createVpaFundAccount,
  createPayout,
  validateVpa,
};
