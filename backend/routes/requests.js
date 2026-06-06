const router = require('express').Router();
const { protect, requireActiveAccount } = require('../middleware/auth');
const requestController = require('../controllers/requestController');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · SERVICE REQUEST ROUTES (user-facing)
   Debit-card / cheque-book submission. Every route requires an authenticated,
   active account. The duplicate gate + confirmation email live in the
   controller. Admin review routes are mounted under /api/admin (see admin.js).
   ────────────────────────────────────────────────────────────────────────── */

router.post('/debit-card', protect, requireActiveAccount, requestController.requestDebitCard);
router.post('/checkbook', protect, requireActiveAccount, requestController.requestCheckbook);
router.get('/mine', protect, requestController.getMyRequests);

module.exports = router;
