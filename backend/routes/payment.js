const router = require('express').Router();
const { protect } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');
const payoutController = require('../controllers/payoutController');

// ─── Public webhook ───────────────────────────────────────────────────────────
// Razorpay → server-to-server notifications. No user auth; integrity is enforced
// cryptographically via the x-razorpay-signature header inside the controller.
router.post('/webhook', paymentController.webhook);

// ─── Authenticated user endpoints ──────────────────────────────────────────────
router.post('/create-qr', protect, paymentController.createQR);
router.get('/status/:ref', protect, paymentController.getStatus);

// ─── Outgoing payouts (RazorpayX) ──────────────────────────────────────────────
router.post('/validate-vpa', protect, payoutController.validateVpaHandler);
router.post('/payout', protect, payoutController.createPayoutHandler);
router.get('/transfer-limit', protect, payoutController.getTransferLimit);

module.exports = router;
