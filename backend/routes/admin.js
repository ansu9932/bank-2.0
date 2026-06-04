const router = require('express').Router();
const adminController = require('../controllers/adminController');
const { adminProtect, requireRole } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

router.post('/login', authLimiter, adminController.adminLogin);

// All routes below require admin auth
router.use(adminProtect);

router.get('/dashboard', adminController.getDashboardStats);

// Users
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserDetails);
router.post('/users/:id/approve-kyc', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.approveKYC);
router.post('/users/:id/reject-kyc', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.rejectKYC);

// Dedicated Video-KYC review dashboard
router.get('/kyc-queue', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.getKYCQueue);
router.post('/users/:id/kyc-review', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.reviewKYC);

router.post('/users/:id/freeze', requireRole('super_admin', 'admin'), adminController.toggleFreezeAccount);
router.post('/users/:id/manual-transaction', requireRole('super_admin', 'admin'), adminController.manualTransaction);
router.patch('/users/:id/update-limit', requireRole('super_admin', 'admin'), adminController.updateTransferLimit);

// Transactions
router.get('/transactions', adminController.getAllTransactions);
router.post('/transactions/:id/flag', requireRole('super_admin', 'admin'), adminController.flagTransaction);

// Audit & Tickets
router.get('/audit-logs', requireRole('super_admin', 'admin'), adminController.getAuditLogs);
router.get('/tickets', adminController.getAdminTickets);
router.put('/tickets/:id', adminController.updateTicket);

module.exports = router;
