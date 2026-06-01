const router = require('express').Router();
const { body } = require('express-validator');
const accountController = require('../controllers/accountController');
const { protect, requireActiveAccount } = require('../middleware/auth');
const { kycUpload, kycFields, videoUpload, profileUpload } = require('../middleware/upload');

router.post('/open',
  kycUpload.fields(kycFields),
  accountController.openAccount
);

router.get('/verify-video-kyc/:token', accountController.verifyVideoKYCLink);
router.post('/submit-video-kyc',
  videoUpload.single('video'),
  accountController.submitVideoKYC
);

// Cyber Video KYC — still-image capture upload (accepts PNG/JPG snapshot).
// Auth is resolved inside the controller via secure-link token OR Bearer JWT,
// so it serves both the pre-login onboarding flow and logged-in users.
router.post('/kyc/upload',
  kycUpload.single('document'),
  accountController.uploadKYCCapture
);

router.get('/verify-setup/:token', accountController.verifySetupLink);

// Protected routes
router.get('/details', protect, accountController.getAccountDetails);
router.put('/profile', protect, accountController.updateProfile);
router.post('/request-card', protect, requireActiveAccount, accountController.requestCard);

module.exports = router;
