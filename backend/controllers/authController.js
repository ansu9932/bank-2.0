const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Account, OTP, Session, Notification } = require('../models');
const { generateToken } = require('../middleware/auth');
const { sendOTPEmail, sendLoginAlertEmail, sendPasswordResetEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const {
  generateOTP, hashValue, getOTPExpiry, generateSecureToken,
  getSecureLinkExpiry, detectDevice, isExpired,
} = require('../utils/helpers');
const { success, error, badRequest, unauthorized, notFound } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { SecureLink } = require('../models');

// ─── Login ─────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return badRequest(res, 'Username and password are required.');

    const user = await User.findOne({
      where: { [Op.or]: [{ username }, { email: username }] },
    });

    if (!user) {
      return unauthorized(res, 'Invalid credentials.');
    }

    // Check lockout
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return unauthorized(res, `Account locked. Try again in ${remaining} minute(s).`);
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const attempts = user.login_attempts + 1;
      const updates = { login_attempts: attempts };
      if (attempts >= 5) {
        updates.locked_until = new Date(Date.now() + 30 * 60 * 1000); // 30 min lock
      }
      await user.update(updates);

      await createAuditLog({
        userId: user.id,
        action: 'LOGIN_FAILED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'failure',
        description: `Failed login attempt ${attempts}`,
      });

      return unauthorized(res, attempts >= 5
        ? 'Too many failed attempts. Account locked for 30 minutes.'
        : `Invalid credentials. ${5 - attempts} attempts remaining.`);
    }

    // Check account status
    if (user.account_status === 'pending') return unauthorized(res, 'Account setup not completed.');
    if (user.account_status === 'frozen') return unauthorized(res, 'Account is frozen. Contact support.');
    if (user.account_status === 'closed') return unauthorized(res, 'Account is closed.');

    // Reset login attempts
    await user.update({ login_attempts: 0, locked_until: null, last_login: new Date() });

    // Create session
    const session = await Session.create({
      user_id: user.id,
      token_hash: 'temp',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      device_type: detectDevice(req.headers['user-agent']),
      is_active: true,
      last_activity: new Date(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const token = generateToken(user.id, session.id);
    await session.update({ token_hash: hashValue(token) });

    // Send login alert (async, don't wait)
    sendLoginAlertEmail(user.email, user.first_name, {
      time: new Date().toLocaleString(),
      ip: req.ip,
      device: detectDevice(req.headers['user-agent']),
      location: 'Unknown',
    }).catch(() => {});

    await createAuditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success',
    });

    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return success(res, {
      token,
      user: {
        id: user.id,
        customerId: user.customer_id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        accountStatus: user.account_status,
        kycStatus: user.kyc_status,
        darkMode: user.dark_mode,
        twoFactorEnabled: user.two_factor_enabled,
      },
    }, 'Login successful.');
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    return error(res, 'Login failed. Please try again.');
  }
};

// ─── Logout ────────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    if (req.session) {
      await req.session.update({ is_active: false, logout_at: new Date() });
    }
    res.clearCookie('accessToken');
    return success(res, {}, 'Logged out successfully.');
  } catch (err) {
    logger.error(`Logout error: ${err.message}`);
    return error(res, 'Logout failed.');
  }
};

// ─── Get Current User ──────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password_hash', 'security_pin'] },
    });
    return success(res, { user });
  } catch (err) {
    return error(res, 'Failed to fetch user.');
  }
};

// ─── Send OTP ──────────────────────────────────────────────────────────────────
exports.sendOTP = async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email || !purpose) return badRequest(res, 'Email and purpose are required.');

    // Invalidate old OTPs
    await OTP.update({ used: true }, { where: { email, purpose, used: false } });

    const otp = generateOTP();
    const otpHash = hashValue(otp);
    const expiresAt = getOTPExpiry(5);

    await OTP.create({
      email,
      otp_hash: otpHash,
      purpose,
      expires_at: expiresAt,
      ip_address: req.ip,
    });

    await sendOTPEmail(email, otp, purpose);

    return success(res, { expiresIn: 300 }, 'OTP sent to your email address.');
  } catch (err) {
    logger.error(`Send OTP error: ${err.message}`);
    return error(res, 'Failed to send OTP. Please try again.');
  }
};

// ─── Verify OTP ────────────────────────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;
    if (!email || !otp || !purpose) return badRequest(res, 'Email, OTP, and purpose are required.');

    const record = await OTP.findOne({
      where: { email, purpose, used: false },
      order: [['created_at', 'DESC']],
    });

    if (!record) return badRequest(res, 'No active OTP found. Please request a new one.');

    if (record.attempts >= 5) {
      await record.update({ used: true });
      return badRequest(res, 'Maximum OTP attempts exceeded. Please request a new OTP.');
    }

    if (isExpired(record.expires_at)) {
      await record.update({ used: true });
      return badRequest(res, 'OTP has expired. Please request a new one.');
    }

    const otpHash = hashValue(otp);
    if (record.otp_hash !== otpHash) {
      await record.increment('attempts');
      return badRequest(res, `Invalid OTP. ${4 - record.attempts} attempts remaining.`);
    }

    await record.update({ used: true });
    return success(res, { verified: true }, 'OTP verified successfully.');
  } catch (err) {
    logger.error(`Verify OTP error: ${err.message}`);
    return error(res, 'OTP verification failed.');
  }
};

// ─── Change Password ───────────────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) return badRequest(res, 'Current password is incorrect.');

    if (newPassword.length < 8) return badRequest(res, 'New password must be at least 8 characters.');

    const hash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    await user.update({ password_hash: hash });

    // Invalidate all sessions
    await Session.update({ is_active: false }, { where: { user_id: user.id } });

    await createAuditLog({
      userId: user.id,
      action: 'PASSWORD_CHANGED',
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {}, 'Password changed successfully. Please log in again.');
  } catch (err) {
    logger.error(`Change password error: ${err.message}`);
    return error(res, 'Failed to change password.');
  }
};

// ─── Forgot Password ───────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) return success(res, {}, 'If an account exists, a reset link has been sent.');

    const token = generateSecureToken();
    const expiresAt = getSecureLinkExpiry(5);

    await SecureLink.create({
      user_id: user.id,
      token,
      purpose: 'password_reset',
      expires_at: expiresAt,
      ip_address: req.ip,
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, user.first_name, resetLink);

    return success(res, {}, 'Password reset link sent to your email (expires in 5 minutes).');
  } catch (err) {
    logger.error(`Forgot password error: ${err.message}`);
    return error(res, 'Failed to process request.');
  }
};

// ─── Reset Password ────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return badRequest(res, 'Token and new password are required.');

    const link = await SecureLink.findOne({ where: { token, purpose: 'password_reset', used: false } });
    if (!link) return badRequest(res, 'Invalid or expired reset link.');
    if (isExpired(link.expires_at)) {
      await link.update({ used: true });
      return badRequest(res, 'Reset link has expired.');
    }

    if (newPassword.length < 8) return badRequest(res, 'Password must be at least 8 characters.');

    const hash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    await User.update({ password_hash: hash }, { where: { id: link.user_id } });
    await link.update({ used: true, used_at: new Date() });

    await Session.update({ is_active: false }, { where: { user_id: link.user_id } });

    return success(res, {}, 'Password reset successfully. Please log in.');
  } catch (err) {
    logger.error(`Reset password error: ${err.message}`);
    return error(res, 'Failed to reset password.');
  }
};

// ─── Verify Setup Link ────────────────────────────────────────────────────────
exports.verifySetup = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return badRequest(res, 'Token is required.');

    const link = await SecureLink.findOne({ 
      where: { token, purpose: 'account_setup', used: false } 
    });

    if (!link) return badRequest(res, 'Invalid or expired setup link.');
    if (isExpired(link.expires_at)) {
      await link.update({ used: true });
      return badRequest(res, 'Setup link has expired.');
    }

    const user = await User.findByPk(link.user_id, {
      attributes: ['id', 'first_name', 'last_name', 'email']
    });

    if (!user) return notFound(res, 'Associated user account not found.');

    return success(res, { 
      token,
      user: {
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      }
    }, 'Setup link verified successfully.');
  } catch (err) {
    logger.error(`Verify setup error: ${err.message}`);
    return error(res, 'Verification process failed.');
  }
};

// ─── Account Setup (after approval) ───────────────────────────────────────────
exports.setupAccount = async (req, res) => {
  try {
    const { token, username, password, securityPin } = req.body;
    if (!token || !username || !password || !securityPin)
      return badRequest(res, 'All fields are required.');

    const link = await SecureLink.findOne({ where: { token, purpose: 'account_setup', used: false } });
    if (!link) return badRequest(res, 'Invalid or expired setup link.');
    if (isExpired(link.expires_at)) {
      await link.update({ used: true });
      return badRequest(res, 'Setup link has expired. Please contact support.');
    }

    // Validations
    if (username.length < 5) return badRequest(res, 'Username must be at least 5 characters.');
    if (password.length < 8) return badRequest(res, 'Password must be at least 8 characters.');
    if (!/^\d{4}$/.test(securityPin)) return badRequest(res, 'Security PIN must be exactly 4 digits.');

    // Check username availability
    const existing = await User.findOne({ where: { username } });
    if (existing) return badRequest(res, 'Username already taken. Please choose another.');

    const [passwordHash, pinHash] = await Promise.all([
      bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12),
      bcrypt.hash(securityPin, parseInt(process.env.BCRYPT_ROUNDS) || 12),
    ]);

    await User.update({
      username,
      password_hash: passwordHash,
      security_pin: pinHash,
      account_status: 'active',
      setup_completed: true,
    }, { where: { id: link.user_id } });

    await link.update({ used: true, used_at: new Date() });

    // Create welcome notification
    await Notification.create({
      user_id: link.user_id,
      title: 'Welcome to Alister Bank! 🎉',
      message: 'Your account is now active. Start exploring your banking dashboard.',
      type: 'kyc',
      priority: 'high',
    });

    await createAuditLog({
      userId: link.user_id,
      action: 'ACCOUNT_SETUP_COMPLETED',
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {}, 'Account setup complete. You can now log in.');
  } catch (err) {
    logger.error(`Account setup error: ${err.message}`);
    return error(res, 'Account setup failed.');
  }
};