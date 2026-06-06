const router = require('express').Router();
const adminController = require('../controllers/adminController');
const requestController = require('../controllers/requestController');
const { adminProtect, requireRole } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

router.post('/login', authLimiter, adminController.adminLogin);

// All routes below require admin auth
router.use(adminProtect);

router.get('/dashboard', adminController.getDashboardStats);

// Users
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserDetails);
// Stream a user's KYC document (Aadhaar/PAN/passport) — admin-token + role protected.
router.get('/users/:id/documents/:docId', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.getUserDocument);
router.post('/users/:id/approve-kyc', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.approveKYC);
router.post('/users/:id/reject-kyc', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.rejectKYC);

// Dedicated Video-KYC review dashboard
router.get('/kyc-queue', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.getKYCQueue);
router.post('/users/:id/kyc-review', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.reviewKYC);

router.post('/users/:id/freeze', requireRole('super_admin', 'admin'), adminController.toggleFreezeAccount);
router.post('/users/:id/manual-transaction', requireRole('super_admin', 'admin'), adminController.manualTransaction);
router.post('/modify-user-ceiling/:userId', requireRole('super_admin', 'admin'), adminController.modifyUserCeiling);

// Transactions
router.get('/transactions', adminController.getAllTransactions);
router.post('/transactions/:id/flag', requireRole('super_admin', 'admin'), adminController.flagTransaction);

// Audit & Tickets
router.get('/audit-logs', requireRole('super_admin', 'admin'), adminController.getAuditLogs);
router.get('/tickets', adminController.getAdminTickets);
router.put('/tickets/:id', adminController.updateTicket);

// Service Requests (Debit Card / Cheque Book) — list + process (approve/decline)
router.get('/service-requests', requestController.adminListRequests);
router.patch('/service-requests/:id', requireRole('super_admin', 'admin'), requestController.adminProcessRequest);

// Permanently delete a specific user's card.
router.delete('/user/:userId/card/:cardId', requireRole('super_admin', 'admin'), requestController.adminDeleteUserCard);

module.exports = router;
