const router = require('express').Router();
const kycController = require('../controllers/kycController');
const { otpLimiter } = require('../middleware/security');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · KYC ROUTES
   Public (pre-login) onboarding verification helpers. The PAN endpoint is
   rate-limited (reusing the OTP limiter: 5 requests / 10 min / IP) because it
   proxies a metered third-party aggregator and is reachable before auth.
   ────────────────────────────────────────────────────────────────────────── */

// POST /api/kyc/verify-pan — PAN → legal-name lookup for the onboarding wizard.
router.post('/verify-pan', otpLimiter, kycController.verifyPanController);

module.exports = router;
