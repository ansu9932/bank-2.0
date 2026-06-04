const router = require('express').Router();
const kycController = require('../controllers/kycController');
const { otpLimiter } = require('../middleware/security');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · KYC ROUTES (Cashfree Secure ID)
   Public (pre-login) onboarding verification helpers. The PAN endpoint is
   rate-limited (reusing the OTP limiter: 5 requests / 10 min / IP) because it
   proxies the metered Cashfree verification suite and is reachable before auth.
   ────────────────────────────────────────────────────────────────────────── */

// POST /api/kyc/verify-pan — PAN → registered-name lookup via Cashfree /pan/advance.
router.post('/verify-pan', otpLimiter, kycController.verifyPanController);

module.exports = router;
