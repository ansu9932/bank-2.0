const router = require('express').Router();
const { protect } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');

// ─── Public webhook ───────────────────────────────────────────────────────────
// Razorpay → server-to-server notifications. No user auth; integrity is enforced
// cryptographically via the x-razorpay-signature header inside the controller.
router.post('/webhook', paymentController.webhook);

// ─── Authenticated user endpoints ──────────────────────────────────────────────
router.post('/create-qr', protect, paymentController.createQR);
router.get('/status/:orderRef', protect, paymentController.getStatus);

module.exports = router;
