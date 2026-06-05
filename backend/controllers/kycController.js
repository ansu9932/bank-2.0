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
    // ── Expanded diagnostics: print the exact status + body shape Cashfree
    //    returned so a structure/version mismatch is visible in Hostinger logs.
    //    (panVerify already logs the raw body; this captures anything attached
    //    to the thrown error too.) Never logs identity PII values.
    const upstreamStatus = err?.response?.status ?? err?.status ?? 'n/a';
    const upstreamBody = err?.response?.data ?? err?.body ?? null;
    logger.error(
      `[verify-pan] handler caught: code=${err.code || 'NONE'} msg=${err.message} `
      + `upstreamStatus=${upstreamStatus} upstreamBody=${
        (() => { try { return typeof upstreamBody === 'string' ? upstreamBody : JSON.stringify(upstreamBody); } catch { return String(upstreamBody); } })()
      }`,
    );
    if (err.stack) logger.error(err.stack);

    // Honest, catchable mapping — the Node thread always survives; we always
    // return clean JSON, never an unhandled rejection.
    if (err.code === 'CASHFREE_NOT_CONFIGURED') {
      return error(res, 'Identity verification is temporarily unavailable. Please try again shortly.', 503);
    }
    // Gateway rejected / response mismatch → clean 400 JSON to the proxy
    // (per ops preference) rather than a 502 the load balancer obscures.
    if (err.code === 'CASHFREE_UPSTREAM') {
      return badRequest(res, 'Could not complete PAN verification. Please re-check the number and try again.');
    }
    return badRequest(res, 'Could not verify PAN right now. Please try again.');
  }
};
