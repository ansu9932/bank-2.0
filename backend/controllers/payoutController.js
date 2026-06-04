const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const { Account, Transaction, User, Notification } = require('../models');
const {
  isPayoutConfigured, createContact, createBankFundAccount,
  createVpaFundAccount, createPayout, validateVpa,
} = require('../utils/razorpay');
const { evaluateDailyLimit } = require('../utils/transferLimits');
const { generateReferenceNumber } = require('../utils/helpers');
const { sendTransferAlertEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound, forbidden } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// Supported outgoing rails. RTGS intentionally omitted per product spec.
const ALLOWED_MODES = ['IMPS', 'NEFT', 'UPI'];
// Instant rails settle immediately → success. NEFT is batch-cleared → processing
// (our internal "pending_settlement") until the simulated clearing window lapses.
const INSTANT_MODES = ['IMPS', 'UPI'];

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// ─── Validate VPA (real-time UPI lookup) ──────────────────────────────────────
// POST /api/payments/validate-vpa   (protected)
exports.validateVpaHandler = async (req, res) => {
  try {
    const { vpa } = req.body;
    if (!vpa || !/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(String(vpa).trim())) {
      return badRequest(res, 'Please enter a valid UPI ID (e.g. username@okaxis).');
    }
    if (!isPayoutConfigured()) {
      return error(res, 'Payout gateway is not configured. Please try again later.', 503);
    }

    const result = await validateVpa(vpa);
    if (!result.valid) {
      return success(res, { valid: false }, 'This UPI ID could not be verified.');
    }
    return success(res, {
      valid: true,
      customerName: result.customerName,
      provider: result.provider,
      vpa: result.vpa,
    }, 'UPI ID verified.');
  } catch (err) {
    logger.error(`validate-vpa error: ${err.message}`);
    if (err.message === 'RAZORPAY_NOT_CONFIGURED') {
      return error(res, 'Payout gateway is not configured. Please try again later.', 503);
    }
    return error(res, 'Could not validate the UPI ID right now. Please try again.');
  }
};

// ─── Create Payout (bank account or UPI) ──────────────────────────────────────
// POST /api/payments/payout   (protected)
exports.createPayoutHandler = async (req, res) => {
  try {
    if (!isPayoutConfigured()) {
      return error(res, 'Payout gateway is not configured. Please try again later.', 503);
    }

    const {
      mode, amount, beneficiaryName, accountNumber, ifsc, vpa,
      description, securityPin,
    } = req.body;

    // ── Basic validation ────────────────────────────────────────────────────
    const upperMode = String(mode || '').toUpperCase();
    if (!ALLOWED_MODES.includes(upperMode)) {
      return badRequest(res, 'Select a valid transfer mode (IMPS, NEFT, or UPI).');
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return badRequest(res, 'Enter a valid transfer amount.');
    }

    const isUpi = upperMode === 'UPI';
    if (isUpi) {
      if (!vpa || !/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(String(vpa).trim())) {
        return badRequest(res, 'Enter a valid UPI ID (e.g. username@okaxis).');
      }
    } else {
      if (!beneficiaryName) return badRequest(res, 'Beneficiary name is required.');
      if (!accountNumber) return badRequest(res, 'Account number is required.');
      if (!ifsc || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(String(ifsc).trim())) {
        return badRequest(res, 'Enter a valid IFSC code.');
      }
    }

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'No active bank account found for this profile.');
    if (account.status === 'frozen') return forbidden(res, 'Your account is frozen. Contact support.');

    // ── Security PIN verification ─────────────────────────────────────────────
    const user = await User.findByPk(req.user.id);
    if (!user?.security_pin) return badRequest(res, 'No security PIN set. Please contact support.');
    const pinValid = await bcrypt.compare(String(securityPin || ''), user.security_pin);
    if (!pinValid) return badRequest(res, 'Incorrect security PIN.');

    // ── Sufficient balance ────────────────────────────────────────────────────
    if (parseFloat(account.available_balance) < parsedAmount) {
      return badRequest(res, 'Insufficient balance for this transfer.');
    }

    // ── Daily transfer-limit enforcement ──────────────────────────────────────
    const limitEval = await evaluateDailyLimit(
      account.id, parsedAmount, account.daily_transfer_limit
    );
    if (!limitEval.allowed) {
      return badRequest(
        res,
        `Daily transfer limit exceeded. Remaining allowance: ${fmtINR(limitEval.remaining)}`
      );
    }

    const beneLabel = isUpi ? String(vpa).trim() : `${beneficiaryName} · ${accountNumber}`;
    const referenceNumber = generateReferenceNumber(upperMode);

    // ── RazorpayX: Contact → Fund Account → Payout ────────────────────────────
    let payout;
    try {
      const contact = await createContact({
        name: isUpi ? (beneficiaryName || 'UPI Beneficiary') : beneficiaryName,
        referenceId: referenceNumber,
      });

      const fundAccount = isUpi
        ? await createVpaFundAccount({ contactId: contact.id, vpa: String(vpa).trim() })
        : await createBankFundAccount({
          contactId: contact.id,
          name: beneficiaryName,
          ifsc,
          accountNumber,
        });

      payout = await createPayout({
        fundAccountId: fundAccount.id,
        amount: parsedAmount,
        mode: upperMode,
        referenceId: referenceNumber,
        narration: (description || 'Alister Bank Payout').slice(0, 30),
      });
    } catch (gwErr) {
      logger.error(`Payout gateway error (${referenceNumber}): ${gwErr.message}`);
      const msg = gwErr.message === 'RAZORPAY_NOT_CONFIGURED'
        ? 'Payout gateway is not configured. Please try again later.'
        : `Payout could not be initiated: ${gwErr.message}`;
      return error(res, msg, gwErr.message === 'RAZORPAY_NOT_CONFIGURED' ? 503 : 502);
    }

    // ── Settlement timing engine ──────────────────────────────────────────────
    // Instant rails (UPI/IMPS) → debit & mark success now. NEFT → debit now
    // (funds reserved) but mark 'processing' (pending_settlement); a cron loop
    // flips it to 'success' after a simulated clearing window.
    const isInstant = INSTANT_MODES.includes(upperMode);
    const txnStatus = isInstant ? 'success' : 'processing';

    const t = await sequelize.transaction();
    let result;
    try {
      const locked = await Account.findOne({
        where: { id: account.id }, transaction: t, lock: t.LOCK.UPDATE,
      });

      const balanceBefore = parseFloat(locked.balance);
      const balanceAfter = balanceBefore - parsedAmount;
      if (balanceAfter < 0) throw new Error('Insufficient balance');

      // Debit funds immediately for every rail (reserved while NEFT clears).
      await locked.update({
        balance: balanceAfter,
        available_balance: parseFloat(locked.available_balance) - parsedAmount,
        daily_transferred: parseFloat(locked.daily_transferred || 0) + parsedAmount,
      }, { transaction: t });

      const txn = await Transaction.create({
        account_id: locked.id,
        reference_number: referenceNumber,
        transaction_type: 'debit',
        transfer_mode: upperMode === 'UPI' ? 'IMPS' : upperMode, // enum lacks 'UPI'
        amount: parsedAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: description || `Payout to ${beneLabel}`,
        narration: isUpi ? `UPI ${String(vpa).trim()}` : `${upperMode} ${accountNumber}`,
        category: 'payout',
        status: txnStatus,
        to_account_number: isUpi ? null : accountNumber,
        to_account_name: isUpi ? null : beneficiaryName,
        to_ifsc: isUpi ? null : String(ifsc).toUpperCase(),
        processed_at: isInstant ? new Date() : null,
        ip_address: req.ip,
        tags: {
          provider: 'razorpayx',
          railMode: upperMode,          // preserves true UPI vs IMPS distinction
          payoutId: payout?.id || null,
          payoutStatus: payout?.status || null,
          vpa: isUpi ? String(vpa).trim() : null,
          settlement: isInstant ? 'instant' : 'pending_settlement',
        },
      }, { transaction: t });

      await Notification.create({
        user_id: locked.user_id,
        title: isInstant
          ? `${fmtINR(parsedAmount)} sent via ${upperMode}`
          : `${fmtINR(parsedAmount)} NEFT transfer initiated`,
        message: isInstant
          ? `Your ${upperMode} transfer to ${beneLabel} is complete. Ref: ${referenceNumber}`
          : `Your NEFT transfer to ${beneLabel} is processing and will settle shortly. Ref: ${referenceNumber}`,
        type: 'transaction',
        priority: 'high',
      }, { transaction: t });

      await t.commit();
      result = { transactionId: txn.id, balanceAfter };
    } catch (txErr) {
      await t.rollback();
      logger.error(`Payout ledger write failed (${referenceNumber}): ${txErr.message}`);
      return error(res, 'Transfer could not be completed. Please try again.');
    }

    // Async side-effects (don't block the response).
    sendTransferAlertEmail(user.email, user.first_name, {
      type: 'debit',
      amount: parsedAmount.toFixed(2),
      reference: referenceNumber,
      counterparty: beneLabel,
      mode: upperMode,
      balance: result.balanceAfter,
      time: new Date().toLocaleString(),
    }).catch(() => {});

    createAuditLog({
      userId: req.user.id,
      action: 'PAYOUT_INITIATED',
      entityType: 'Transaction',
      entityId: referenceNumber,
      ipAddress: req.ip,
      status: 'success',
      description: `${upperMode} payout of ${fmtINR(parsedAmount)} to ${beneLabel} (${txnStatus}).`,
    }).catch(() => {});

    return success(res, {
      referenceNumber,
      transactionId: result.transactionId,
      mode: upperMode,
      amount: parsedAmount,
      status: isInstant ? 'completed' : 'pending_settlement',
      balance: result.balanceAfter,
      available_balance: result.balanceAfter,
      remainingDailyLimit: limitEval.remainingAfter,
    }, isInstant
      ? 'Transfer completed successfully.'
      : 'NEFT transfer initiated — it will settle shortly.');
  } catch (err) {
    logger.error(`createPayout error: ${err.message}`);
    return error(res, 'Transfer failed. Please try again.');
  }
};

// ─── Get current daily transfer-limit usage ───────────────────────────────────
// GET /api/payments/transfer-limit   (protected)
exports.getTransferLimit = async (req, res) => {
  try {
    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');

    const evalResult = await evaluateDailyLimit(account.id, 0, account.daily_transfer_limit);
    return success(res, {
      dailyTransferLimit: parseFloat(account.daily_transfer_limit),
      spentToday: evalResult.spentToday,
      remaining: evalResult.remaining,
      customDailyLimitSet: account.custom_daily_limit_set,
      availableBalance: parseFloat(account.available_balance),
    });
  } catch (err) {
    logger.error(`getTransferLimit error: ${err.message}`);
    return error(res, 'Failed to fetch transfer limit.');
  }
};
