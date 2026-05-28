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

router.get('/verify-setup/:token', accountController.verifySetupLink);

// Protected routes
router.get('/details', protect, accountController.getAccountDetails);
router.put('/profile', protect, accountController.updateProfile);
router.post('/request-card', protect, requireActiveAccount, accountController.requestCard);

module.exports = router;
