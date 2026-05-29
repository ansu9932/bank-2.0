const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/security');
const { badRequest } = require('../utils/apiResponse');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array());
  next();
};

router.post('/login', authLimiter, [
  body('username').notEmpty().withMessage('Username/email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], validate, authController.login);

router.post('/logout', protect, authController.logout);
router.get('/me', protect, authController.getMe);

router.post('/send-otp', otpLimiter, [
  body('email').isEmail().withMessage('Valid email is required'),
  body('purpose').notEmpty().withMessage('Purpose is required'),
], validate, authController.sendOTP);

router.post('/verify-otp', [
  body('email').isEmail(),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric(),
  body('purpose').notEmpty(),
], validate, authController.verifyOTP);

router.post('/change-password', protect, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], validate, authController.changePassword);

router.post('/forgot-password', authLimiter, [
  body('email').isEmail(),
], validate, authController.forgotPassword);

router.post('/reset-password', [
  body('token').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], validate, authController.resetPassword);

router.post('/setup-account', [
  body('token').notEmpty(),
  body('username').isLength({ min: 5 }),
  body('password').isLength({ min: 8 }),
  body('securityPin').isLength({ min: 4, max: 4 }).isNumeric(),
], validate, authController.setupAccount);

router.get('/verify-setup/:token', authController.verifySetup);

module.exports = router;
