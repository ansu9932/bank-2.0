const { verifyPan, isValidPanFormat } = require('../utils/panVerify');
const { success, badRequest, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · KYC VERIFICATION
   PAN → legal-name lookup proxy used by the onboarding wizard. Keeps the
   aggregator credentials server-side; the client only ever sends the PAN and
   receives back the verified legal name (or a graceful fallback message).
   ────────────────────────────────────────────────────────────────────────── */

// ─── Verify PAN & fetch legal name ────────────────────────────────────────────
// POST /api/kyc/verify-pan   Body: { pan }
exports.verifyPanController = async (req, res) => {
  try {
    const pan = String(req.body.pan || '').toUpperCase().trim();

    if (!pan) return badRequest(res, 'PAN number is required.');
    if (!isValidPanFormat(pan)) {
      return badRequest(res, 'Enter a valid 10-character PAN (e.g. ABCDE1234F).');
    }

    const result = await verifyPan(pan);

    // Always 200: a non-verified result is a normal, expected outcome the client
    // handles inline (it never blocks onboarding). Only echo the legal name and
    // status — never the upstream raw payload.
    return success(res, {
      pan,
      verified: result.verified,
      name: result.verified ? result.name : null,
      message: result.message,
    }, result.verified ? 'PAN verified successfully.' : 'PAN verification completed.');
  } catch (err) {
    // Truly unexpected (programming) error — log full context, return clean JSON.
    logger.error(`verify-pan error: ${err.message}\n${err.stack}`);
    return error(res, 'Could not verify PAN right now. Please try again.');
  }
};
