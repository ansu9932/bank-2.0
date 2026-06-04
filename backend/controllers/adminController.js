const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Account, Transaction, KYCDocument, AdminUser, AuditLog, Notification, SupportTicket, SecureLink } = require('../models');
const { generateAdminToken } = require('../middleware/auth');
const {
  generateAccountNumber, generateIFSC, generateSecureToken, getSecureLinkExpiry, getOnboardingLinkExpiry,
} = require('../utils/helpers');
const { sendAccountApprovedEmail, sendVideoKYCEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound, created, unauthorized } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { paginate } = require('../utils/helpers');

// ─── Admin Login ──────────────────────────────────────────────────────────────
exports.adminLogin = async (req, res) => {
  try {
    // Defensively capture any common naming variations from the frontend request body payload
    const identifier = req.body.username || req.body.email || req.body.usernameOrEmail || req.body.login;
    const { password } = req.body;

    if (!identifier || !password) {
      return badRequest(res, 'Username or Email and password are required.');
    }

    // Lookup using the extracted identifier against both the username and email columns
    const admin = await AdminUser.findOne({ 
      where: { 
        [Op.or]: [
          { username: identifier }, 
          { email: identifier }
        ] 
      } 
    });
    
    if (!admin || !admin.is_active) {
      return unauthorized(res, 'Invalid credentials or account inactive.');
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) return unauthorized(res, 'Invalid credentials.');

    await admin.update({ last_login: new Date() });

    const token = generateAdminToken(admin.id);

    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 12 * 60 * 60 * 1000,
    });

    await createAuditLog({ adminId: admin.id, action: 'ADMIN_LOGIN', ipAddress: req.ip, status: 'success' });

    return success(res, {
      token,
      admin: { id: admin.id, username: admin.username, fullName: admin.full_name, role: admin.role },
    }, 'Admin login successful.');
  } catch (err) {
    logger.error(`Admin login error: ${err.message}`);
    return error(res, 'Login failed.');
  }
};

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers, pendingKYC, activeAccounts, frozenAccounts,
      totalTransactions, todayTx, pendingTickets,
    ] = await Promise.all([
      User.count(),
      User.count({ where: { kyc_status: { [Op.in]: ['under_review', 'video_kyc_pending'] } } }),
      Account.count({ where: { status: 'active' } }),
      Account.count({ where: { status: 'frozen' } }),
      Transaction.count({ where: { status: 'success' } }),
      Transaction.count({
        where: {
          status: 'success',
          created_at: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      SupportTicket.count({ where: { status: { [Op.in]: ['open', 'in_progress'] } } }),
    ]);

    // Transaction volume
    const volumeResult = await Transaction.findAll({
      attributes: [
        [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'totalVolume'],
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
      ],
      where: { status: 'success', transaction_type: 'debit' },
      raw: true,
    });

    // Monthly chart data
    const monthlyData = await Transaction.findAll({
      attributes: [
        [require('sequelize').fn('DATE_FORMAT', require('sequelize').col('created_at'), '%Y-%m'), 'month'],
        [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'total'],
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
        'transaction_type',
      ],
      where: {
        status: 'success',
        created_at: { [Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 6)) },
      },
      group: ['month', 'transaction_type'],
      order: [['month', 'ASC']],
      raw: true,
    });

    // Flagged transactions
    const flaggedCount = await Transaction.count({ where: { is_flagged: true, status: 'success' } });

    return success(res, {
      totalUsers,
      pendingKYC,
      activeAccounts,
      frozenAccounts,
      totalTransactions,
      todayTransactions: todayTx,
      pendingTickets,
      totalVolume: volumeResult[0]?.totalVolume || 0,
      flaggedTransactions: flaggedCount,
      monthlyData,
    });
  } catch (err) {
    logger.error(`Admin dashboard stats error: ${err.message}`);
    return error(res, 'Failed to fetch stats.');
  }
};

// ─── Get All Users ────────────────────────────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, kycStatus } = req.query;
    const where = {};
    if (status) where.account_status = status;
    if (kycStatus) where.kyc_status = kycStatus;
    if (search) {
      where[Op.or] = [
        { email: { [Op.like]: `%${search}%` } },
        { customer_id: { [Op.like]: `%${search}%` } },
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
      ];
    }

    const { limit: lim, offset } = paginate(page, limit);
    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password_hash', 'security_pin'] },
      include: [{ model: Account, as: 'account', attributes: ['account_number', 'balance', 'status'] }],
      order: [['created_at', 'DESC']],
      limit: lim,
      offset,
    });

    return success(res, {
      users: rows,
      pagination: { total: count, page: parseInt(page), limit: lim, totalPages: Math.ceil(count / lim) },
    });
  } catch (err) {
    logger.error(`Get users error: ${err.message}`);
    return error(res, 'Failed to fetch users.');
  }
};

// ─── Get User Details ─────────────────────────────────────────────────────────
exports.getUserDetails = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password_hash', 'security_pin'] },
      include: [
        { model: Account, as: 'account' },
        { model: KYCDocument, as: 'documents' },
      ],
    });
    if (!user) return notFound(res, 'User not found.');
    return success(res, { user });
  } catch (err) {
    return error(res, 'Failed to fetch user details.');
  }
};

// ─── Approve KYC ─────────────────────────────────────────────────────────────
exports.approveKYC = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return notFound(res, 'User not found.');
    if (user.kyc_status === 'approved') return badRequest(res, 'KYC already approved.');

    if (!user.video_kyc_completed) {
      // Send Video KYC link — strict 24-hour onboarding expiry written to DB.
      const token = generateSecureToken();
      const expiresAt = getOnboardingLinkExpiry();

      await SecureLink.create({
        user_id: user.id,
        token,
        purpose: 'video_kyc',
        expires_at: expiresAt,
      });

      const kycLink = `${process.env.FRONTEND_URL}/video-kyc?token=${token}`;
      await sendVideoKYCEmail(user.email, user.first_name, kycLink);

      await user.update({ kyc_status: 'video_kyc_pending' });

      await createAuditLog({
        adminId: req.admin.id,
        userId: user.id,
        action: 'VIDEO_KYC_LINK_SENT',
        entityType: 'User',
        entityId: user.id,
        ipAddress: req.ip,
        status: 'success',
      });

      return success(res, {}, 'Video KYC link sent to user.');
    }

    // Create bank account
    const accountNumber = generateAccountNumber();
    const ifscCode = generateIFSC('000001');

    const account = await Account.create({
      user_id: user.id,
      account_number: accountNumber,
      ifsc_code: ifscCode,
      swift_code: process.env.BANK_SWIFT || 'ALSTINBB',
      account_type: user.account_type,
      balance: 0.00,
      available_balance: 0.00,
      currency: 'INR',
      status: 'active',
    });

    // Send approval email with setup link
    const setupToken = generateSecureToken();
    await SecureLink.create({
      user_id: user.id,
      token: setupToken,
      purpose: 'account_setup',
      expires_at: getOnboardingLinkExpiry(),
    });

    const setupLink = `${process.env.FRONTEND_URL}/account-setup?token=${setupToken}`;
    await sendAccountApprovedEmail(user.email, user.first_name, setupLink, accountNumber);

    await user.update({ kyc_status: 'approved' });

    // Approve all documents
    await KYCDocument.update(
      { status: 'approved', reviewed_by: req.admin.id, reviewed_at: new Date() },
      { where: { user_id: user.id } }
    );

    await Notification.create({
      user_id: user.id,
      title: 'KYC Approved! 🎉',
      message: 'Your KYC verification is complete. Check your email to set up your account.',
      type: 'kyc',
      priority: 'high',
    });

    await createAuditLog({
      adminId: req.admin.id,
      userId: user.id,
      action: 'KYC_APPROVED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, { accountNumber }, 'KYC approved. Setup link sent to user.');
  } catch (err) {
    logger.error(`Approve KYC error: ${err.message}`);
    return error(res, 'Failed to approve KYC.');
  }
};

// ─── Reject KYC ──────────────────────────────────────────────────────────────
exports.rejectKYC = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByPk(req.params.id);
    if (!user) return notFound(res, 'User not found.');

    await user.update({ kyc_status: 'rejected' });

    await KYCDocument.update(
      { status: 'rejected', rejection_reason: reason || 'Documents not acceptable' },
      { where: { user_id: user.id } }
    );

    await Notification.create({
      user_id: user.id,
      title: 'KYC Application Rejected',
      message: `Your KYC application was rejected. Reason: ${reason || 'Documents not acceptable'}. Please contact support.`,
      type: 'kyc',
      priority: 'urgent',
    });

    await createAuditLog({
      adminId: req.admin.id,
      userId: user.id,
      action: 'KYC_REJECTED',
      entityType: 'User',
      entityId: user.id,
      newValues: { reason },
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {}, 'KYC rejected. User notified.');
  } catch (err) {
    return error(res, 'Failed to reject KYC.');
  }
};

// ─── KYC Review Queue (video_kyc_pending + under_review, with documents) ──────
const toWebPath = (p) => {
  if (!p) return null;
  const norm = String(p).replace(/\\/g, '/');
  const m = norm.match(/uploads\/.*/);
  return m ? `/${m[0]}` : norm;
};

exports.getKYCQueue = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { kyc_status: { [Op.in]: ['video_kyc_pending', 'under_review'] } },
      attributes: { exclude: ['password_hash', 'security_pin'] },
      include: [
        { model: Account, as: 'account', attributes: ['account_number', 'status', 'account_type', 'balance'] },
        { model: KYCDocument, as: 'documents' },
      ],
      order: [['updated_at', 'DESC']],
      limit: 100,
    });

    const queue = users.map((u) => {
      const json = u.toJSON();
      json.documents = (json.documents || []).map((d) => ({
        ...d,
        document_url: toWebPath(d.file_path),
      }));
      return json;
    });

    return success(res, { queue, count: queue.length });
  } catch (err) {
    logger.error(`KYC queue error: ${err.message}`);
    return error(res, 'Failed to fetch KYC review queue.');
  }
};

// ─── KYC Review Decision (approve → activate account / reject) ───────────────
exports.reviewKYC = async (req, res) => {
  try {
    const { decision, reason } = req.body;
    if (!['approve', 'reject'].includes(decision)) {
      return badRequest(res, 'decision must be either "approve" or "reject".');
    }

    const user = await User.findByPk(req.params.id, { include: [{ model: Account, as: 'account' }] });
    if (!user) return notFound(res, 'User not found.');

    if (decision === 'reject') {
      await user.update({ kyc_status: 'rejected' });
      await KYCDocument.update(
        { status: 'rejected', rejection_reason: reason || 'Biometric verification failed.', reviewed_by: req.admin.id, reviewed_at: new Date() },
        { where: { user_id: user.id } }
      );
      await Notification.create({
        user_id: user.id,
        title: 'KYC Rejected',
        message: `Your identity verification was rejected. Reason: ${reason || 'Biometric verification failed.'} Please contact support Simon.`,
        type: 'kyc',
        priority: 'urgent',
      });
      await createAuditLog({
        adminId: req.admin.id, userId: user.id, action: 'KYC_REVIEW_REJECTED',
        entityType: 'User', entityId: user.id, newValues: { reason }, ipAddress: req.ip, status: 'success',
      });
      return success(res, { kyc_status: 'rejected' }, 'KYC submission rejected. User notified.');
    }

    let account = user.account || (await Account.findOne({ where: { user_id: user.id } }));
    if (!account) {
      account = await Account.create({
        user_id: user.id,
        account_number: generateAccountNumber(),
        ifsc_code: generateIFSC('000001'),
        swift_code: process.env.BANK_SWIFT || 'ALSTINBB',
        account_type: user.account_type,
        balance: 0.00,
        available_balance: 0.00,
        currency: 'INR',
        status: 'active',
      });
    } else {
      await account.update({ status: 'active' });
    }

    await user.update({ kyc_status: 'approved', account_status: 'active' });
    await KYCDocument.update(
      { status: 'approved', reviewed_by: req.admin.id, reviewed_at: new Date() },
      { where: { user_id: user.id } }
    );

    if (!user.setup_completed) {
      const setupToken = generateSecureToken();
      await SecureLink.create({
        user_id: user.id, token: setupToken, purpose: 'account_setup', expires_at: getOnboardingLinkExpiry(),
      });
      const setupLink = `${process.env.FRONTEND_URL}/account-setup?token=${setupToken}`;
      try {
        await sendAccountApprovedEmail(user.email, user.first_name, setupLink, account.account_number);
      } catch (mailErr) {
        logger.error(`Approval email failed: ${mailErr.message}`);
      }
    }

    await Notification.create({
      user_id: user.id,
      title: 'KYC Approved! 🎉',
      message: 'Your identity verification passed and your account is now active.',
      type: 'kyc',
      priority: 'high',
    });
    await createAuditLog({
      adminId: req.admin.id, userId: user.id, action: 'KYC_REVIEW_APPROVED',
      entityType: 'User', entityId: user.id, ipAddress: req.ip, status: 'success',
    });

    return success(res, {
      kyc_status: 'approved',
      account_status: 'active',
      accountNumber: account.account_number,
    }, 'KYC approved — account activated.');
  } catch (err) {
    logger.error(`KYC review error: ${err.message}`);
    return error(res, 'Failed to process KYC review.');
  }
};

// ─── Freeze / Unfreeze Account ────────────────────────────────────────────────
exports.toggleFreezeAccount = async (req, res) => {
  try {
    const { action, reason } = req.body;
    const account = await Account.findOne({ where: { user_id: req.params.id } });
    if (!account) return notFound(res, 'Account not found.');

    const newStatus = action === 'freeze' ? 'frozen' : 'active';
    await account.update({ status: newStatus });
    await User.update({ account_status: newStatus }, { where: { id: req.params.id } });

    await Notification.create({
      user_id: req.params.id,
      title: `Account ${newStatus === 'frozen' ? 'Frozen' : 'Unfrozen'}`,
      message: newStatus === 'frozen'
        ? `Your account has been frozen. Reason: ${reason || 'Policy violation'}. Contact support.`
        : 'Your account has been unfrozen and is now active.',
      type: 'security',
      priority: 'urgent',
    });

    await createAuditLog({
      adminId: req.admin.id,
      userId: req.params.id,
      action: `ACCOUNT_${action.toUpperCase()}`,
      entityType: 'Account',
      entityId: account.id,
      newValues: { status: newStatus, reason },
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {}, `Account ${newStatus} successfully.`);
  } catch (err) {
    return error(res, 'Failed to update account status.');
  }
};

// ─── Manual Credit/Debit ──────────────────────────────────────────────────────
exports.manualTransaction = async (req, res) => {
  try {
    const { type, amount, description, reason } = req.body;
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) return badRequest(res, 'Invalid amount.');

    const account = await Account.findOne({ where: { user_id: req.params.id } });
    if (!account) return notFound(res, 'Account not found.');

    const balanceBefore = parseFloat(account.balance);
    let balanceAfter;

    if (type === 'debit') {
      if (balanceBefore < parsedAmount) return badRequest(res, 'Insufficient balance to debit.');
      balanceAfter = balanceBefore - parsedAmount;
    } else {
      balanceAfter = balanceBefore + parsedAmount;
    }

    await account.update({ balance: balanceAfter, available_balance: balanceAfter });

    const { generateReferenceNumber } = require('../utils/helpers');
    await Transaction.create({
      account_id: account.id,
      reference_number: generateReferenceNumber('ADM'),
      transaction_type: type,
      transfer_mode: 'SYSTEM',
      amount: parsedAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: description || `Admin ${type} - ${reason || ''}`,
      status: 'success',
      processed_at: new Date(),
    });

    await createAuditLog({
      adminId: req.admin.id,
      userId: req.params.id,
      action: `ADMIN_MANUAL_${type.toUpperCase()}`,
      entityType: 'Account',
      entityId: account.id,
      newValues: { amount, type, reason },
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, { newBalance: balanceAfter }, `₹${parsedAmount} ${type}ed successfully.`);
  } catch (err) {
    logger.error(`Manual transaction error: ${err.message}`);
    return error(res, 'Failed to process manual transaction.');
  }
};

// ─── Get All Transactions ─────────────────────────────────────────────────────
exports.getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 30, flagged, type, startDate, endDate, search } = req.query;
    const where = {};
    if (flagged === 'true') where.is_flagged = true;
    if (type) where.transaction_type = type;
    if (startDate && endDate) {
      where.created_at = { [Op.between]: [new Date(startDate), new Date(endDate + 'T23:59:59')] };
    }
    if (search) {
      where[Op.or] = [
        { reference_number: { [Op.like]: `%${search}%` } },
        { to_account_name: { [Op.like]: `%${search}%` } },
      ];
    }

    const { limit: lim, offset } = paginate(page, limit);
    const { count, rows } = await Transaction.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: lim,
      offset,
    });

    return success(res, {
      transactions: rows,
      pagination: { total: count, page: parseInt(page), totalPages: Math.ceil(count / lim) },
    });
  } catch (err) {
    return error(res, 'Failed to fetch transactions.');
  }
};

// ─── Get Audit Logs ───────────────────────────────────────────────────────────
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, action } = req.query;
    const where = {};
    if (userId) where.user_id = userId;
    if (action) where.action = { [Op.like]: `%${action}%` };

    const { limit: lim, offset = 0 } = paginate(page, limit);
    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: lim,
      offset,
    });

    return success(res, {
      logs: rows,
      pagination: { total: count, page: parseInt(page), totalPages: Math.ceil(count / lim) },
    });
  } catch (err) {
    return error(res, 'Failed to fetch audit logs.');
  }
};

// ─── Support Tickets ──────────────────────────────────────────────────────────
exports.getAdminTickets = async (req, res) => {
  try {
    const { status, priority } = req.query;
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tickets = await SupportTicket.findAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'email', 'customer_id'] }],
      order: [['created_at', 'DESC']],
      limit: 100,
    });
    return success(res, { tickets });
  } catch (err) {
    return error(res, 'Failed to fetch tickets.');
  }
};

exports.updateTicket = async (req, res) => {
  try {
    const { status, resolution } = req.body;
    const ticket = await SupportTicket.findByPk(req.params.id);
    if (!ticket) return notFound(res, 'Ticket not found.');

    await ticket.update({
      status,
      resolution,
      assigned_to: req.admin.id,
      resolved_at: status === 'resolved' ? new Date() : null,
    });

    return success(res, {}, 'Ticket updated.');
  } catch (err) {
    return error(res, 'Failed to update ticket.');
  }
};

// ─── Update User Daily Transfer Limit ─────────────────────────────────────────
// PATCH /api/admin/users/:id/update-limit   (admin only)
// Overwrites the user's daily transfer limit and flags it as an explicit
// administrative override (custom_daily_limit_set = true) so the nightly reset
// preserves the pinned value rather than reverting to the platform default.
exports.updateTransferLimit = async (req, res) => {
  try {
    const { dailyTransferLimit } = req.body;
    const parsedLimit = parseFloat(dailyTransferLimit);

    if (Number.isNaN(parsedLimit) || parsedLimit < 0) {
      return badRequest(res, 'Please provide a valid daily transfer limit (₹0 or greater).');
    }
    if (parsedLimit > 100000000) {
      return badRequest(res, 'Daily transfer limit cannot exceed ₹10,00,00,000.');
    }

    const account = await Account.findOne({ where: { user_id: req.params.id } });
    if (!account) return notFound(res, 'Account not found for this user.');

    const previousLimit = parseFloat(account.daily_transfer_limit);

    await account.update({
      daily_transfer_limit: parsedLimit,
      custom_daily_limit_set: true,
    });

    await Notification.create({
      user_id: req.params.id,
      title: 'Daily Transfer Limit Updated',
      message: `Your daily transfer limit has been updated to ₹${parsedLimit.toLocaleString('en-IN')}.`,
      type: 'security',
      priority: 'medium',
    });

    await createAuditLog({
      adminId: req.admin.id,
      userId: req.params.id,
      action: 'DAILY_LIMIT_UPDATED',
      entityType: 'Account',
      entityId: account.id,
      oldValues: { daily_transfer_limit: previousLimit },
      newValues: { daily_transfer_limit: parsedLimit },
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {
      dailyTransferLimit: parsedLimit,
      customDailyLimitSet: true,
    }, `Daily transfer limit updated to ₹${parsedLimit.toLocaleString('en-IN')}.`);
  } catch (err) {
    logger.error(`Update transfer limit error: ${err.message}`);
    return error(res, 'Failed to update transfer limit.');
  }
};

// ─── Flag Transaction ─────────────────────────────────────────────────────────
exports.flagTransaction = async (req, res) => {
  try {
    const { reason } = req.body;
    const tx = await Transaction.findByPk(req.params.id);
    if (!tx) return notFound(res, 'Transaction not found.');

    await tx.update({ is_flagged: true, flag_reason: reason });

    await createAuditLog({
      adminId: req.admin.id,
      action: 'TRANSACTION_FLAGGED',
      entityType: 'Transaction',
      entityId: tx.id,
      newValues: { reason },
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {}, 'Transaction flagged.');
  } catch (err) {
    return error(res, 'Failed to flag transaction.');
  }
};