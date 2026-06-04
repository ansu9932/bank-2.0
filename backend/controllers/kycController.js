const { verifyPan, isValidPanFormat, isConfigured } = require('../utils/panVerify');
const { success, badRequest, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · KYC VERIFICATION (Cashfree Secure ID)
   PAN → legal-name lookup proxy used by the onboarding wizard. Cashfree client
   credentials stay server-side; the client only ever sends the PAN and receives
   back the verified registered_name (or an honest failure status). No result is
   ever fabricated — a network/config/upstream fault returns a real 5xx.
   ────────────────────────────────────────────────────────────────────────── */

// ─── Verify PAN & fetch registered name ───────────────────────────────────────
// POST /api/kyc/verify-pan   Body: { pan }
exports.verifyPanController = async (req, res) => {
  try {
    const pan = String(req.body.pan || '').toUpperCase().trim();

    if (!pan) return badRequest(res, 'PAN number is required.');
    if (!isValidPanFormat(pan)) {
      return badRequest(res, 'Enter a valid 10-character PAN (e.g. ABCDE1234F).');
    }

    const result = await verifyPan(pan);

    // 200 covers both "valid" and "PAN not found" — both are normal outcomes the
    // client handles inline. Only the registered name + status are echoed back;
    // the raw Cashfree payload is never forwarded to the browser.
    return success(res, {
      pan,
      verified: result.verified,
      name: result.verified ? result.name : null,
      status: result.status,
      message: result.message,
    }, result.verified ? 'PAN verified successfully.' : 'PAN verification completed.');
  } catch (err) {
    // Honest failure mapping — never silently pass the user through.
    if (err.code === 'CASHFREE_NOT_CONFIGURED') {
      logger.error('verify-pan: Cashfree credentials not configured.');
      return error(res, 'Identity verification is temporarily unavailable. Please try again shortly.', 503);
    }
    if (err.code === 'CASHFREE_UPSTREAM') {
      logger.error(`verify-pan: Cashfree upstream failure: ${err.message}`);
      return error(res, 'Could not reach the identity verification service. Please try again.', 502);
    }
    logger.error(`verify-pan unexpected error: ${err.message}\n${err.stack}`);
    return error(res, 'Could not verify PAN right now. Please try again.');
  }
};
