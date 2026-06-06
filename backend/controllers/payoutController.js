const bcrypt = require('bcryptjs');
const axios = require('axios');
const sequelize = require('../config/database');
const { Account, Transaction, User, Notification } = require('../models');
const opfin = require('../utils/opfin');
const { resolveUpiProvider, isValidVpa } = require('../utils/upiProviders');
const { generateReferenceNumber } = require('../utils/helpers');
const { sendTransferAlertEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// Razorpay's public IFSC repository (no auth required).
const IFSC_LOOKUP_BASE = 'https://ifsc.razorpay.com';
const IFSC_REGEX = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;

// Supported outgoing rails. RTGS intentionally excluded per product spec.
const ALLOWED_MODES = ['IMPS', 'NEFT', 'UPI'];
// IMPS + UPI settle instantly; NEFT is batch-cleared (pending → completed).
const INSTANT_MODES = ['IMPS', 'UPI'];

// Simulated NEFT batch-clearing delay (ms). Default 3 min mirrors real-world
// half-hourly NEFT cycles at a demo-friendly cadence; override via env.
const NEFT_SETTLEMENT_MS = (parseInt(process.env.NEFT_SETTLEMENT_MINUTES, 10) || 3) * 60 * 1000;

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * In-memory tracker of pending NEFT settlement timers so they can be inspected
 * or cleared (e.g. on graceful shutdown). Keyed by transaction reference.
 */
const pendingNeftTimers = new Map();

/**
 * Promote a pending_settlement NEFT payout to completed after the simulated
 * clearing window. Idempotent: re-checks the row before flipping it.
 * @param {string} transactionId
 * @param {string} referenceNumber
 */
function scheduleNeftSettlement(transactionId, referenceNumber) {
  const timer = setTimeout(async () => {
    try {
      const txn = await Transaction.findByPk(transactionId);
      if (!txn || txn.status !== 'processing') {
        pendingNeftTimers.delete(referenceNumber);
        return;
      }
      await txn.update({
        status: 'success',
        processed_at: new Date(),
        tags: { ...(txn.tags || {}), settlement: 'settled' },
      });

      const account = await Account.findByPk(txn.account_id);
      if (account) {
        await Notification.create({
          user_id: account.user_id,
          title: `NEFT transfer of ${fmtINR(txn.amount)} settled`,
          message: `Your NEFT transfer (Ref: ${referenceNumber}) has cleared successfully.`,
          type: 'transaction',
          priority: 'medium',
        });
      }
      logger.info(`NEFT payout settled (simulated): ${referenceNumber}`);
    } catch (err) {
      logger.error(`NEFT settlement timer error for ${referenceNumber}: ${err.message}`);
    } finally {
      pendingNeftTimers.delete(referenceNumber);
    }
  }, NEFT_SETTLEMENT_MS);

  // Don't let the timer keep the event loop alive on shutdown.
  if (typeof timer.unref === 'function') timer.unref();
  pendingNeftTimers.set(referenceNumber, timer);
}

/**
 * On boot, re-arm settlement timers for any NEFT payouts still 'processing'
 * (e.g. left mid-flight by a restart). Exported so server.js can call it.
 */
async function resumePendingNeftSettlements() {
  try {
    const pending = await Transaction.findAll({
      where: { status: 'processing', transfer_mode: 'NEFT', category: 'payout' },
      limit: 200,
    });
    pending.forEach((txn) => scheduleNeftSettlement(txn.id, txn.reference_number));
    if (pending.length) logger.info(`Re-armed ${pending.length} pending NEFT settlement timer(s).`);
  } catch (err) {
    logger.error(`resumePendingNeftSettlements error: ${err.message}`);
  }
}

// ─── Real-time UPI provider lookup ────────────────────────────────────────────
// POST /api/payments/lookup-upi-provider   (protected)
exports.lookupUpiProvider = async (req, res) => {
  try {
    const { vpa } = req.body;
    if (!vpa || !isValidVpa(vpa)) {
      return badRequest(res, 'Please enter a valid UPI ID (e.g. username@okaxis).');
    }
    const { provider, known } = resolveUpiProvider(vpa);
    return success(res, {
      success: true,
      verifiedProvider: known ? provider : `${provider}`,
      known,
      vpa: String(vpa).trim(),
    }, 'UPI handle resolved.');
  } catch (err) {
    logger.error(`lookup-upi-provider error: ${err.message}`);
    return error(res, 'Could not resolve the UPI provider right now.');
  }
};

// ─── Real-time IFSC branch verification ───────────────────────────────────────
// GET /api/payments/verify-ifsc/:ifscCode   (protected)
// Looks up the bank/branch from Razorpay's public IFSC repository so the client
// can confirm the routing destination in real time.
exports.verifyIfsc = async (req, res) => {
  try {
    const ifscCode = String(req.params.ifscCode || '').trim().toUpperCase();

    // Structural guard before hitting the external service.
    if (!IFSC_REGEX.test(ifscCode)) {
      return badRequest(res, 'Invalid IFSC Code structure.');
    }

    try {
      const { data } = await axios.get(`${IFSC_LOOKUP_BASE}/${ifscCode}`, {
        timeout: 8000,
        // The repo returns 404 (sometimes with an empty body) for unknown codes;
        // treat any non-2xx as "not found" rather than throwing.
        validateStatus: (s) => s >= 200 && s < 500,
      });

      // Razorpay returns the literal string "Not Found" / 404 for invalid codes.
      if (!data || typeof data !== 'object' || !data.BANK) {
        return res.status(404).json({
          success: false,
          message: 'Invalid IFSC Code. No matching bank branch found.',
        });
      }

      return success(res, {
        ifsc: ifscCode,
        bank: data.BANK,
        branch: data.BRANCH,
        city: data.CITY,
        state: data.STATE,
      }, 'IFSC verified.');
    } catch (lookupErr) {
      // Network/timeout against the public repo.
      logger.error(`IFSC lookup network error (${ifscCode}): ${lookupErr.message}`);
      return error(res, 'Could not verify the IFSC code right now. Please try again.', 502);
    }
  } catch (err) {
    logger.error(`verify-ifsc error: ${err.message}`);
    return error(res, 'Could not verify the IFSC code.');
  }
};

// ─── Disburse Payout (Opfin unified API) ──────────────────────────────────────
// POST /api/payments/disburse-payout   (protected + verifyLimits)
// verifyLimits has already: rolled the 24h window, validated the amount against
// the daily ceiling, and attached req.transferAccount + req.transferLimitSnapshot.
exports.disbursePayout = async (req, res) => {
  try {
    const {
      mode, amount, beneficiaryName, accountNumber, confirmAccountNumber,
      ifsc, vpa, email, description, securityPin,
    } = req.body;

    const upperMode = String(mode || '').toUpperCase();
    if (!ALLOWED_MODES.includes(upperMode)) {
      return badRequest(res, 'Select a valid transfer mode (IMPS, NEFT, or UPI).');
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return badRequest(res, 'Enter a valid transfer amount.');
    }

    const isUpi = upperMode === 'UPI';

    // ── Field validation per rail ─────────────────────────────────────────────
    if (isUpi) {
      if (!isValidVpa(vpa)) return badRequest(res, 'Enter a valid UPI ID (e.g. username@okaxis).');
    } else {
      if (!beneficiaryName) return badRequest(res, 'Beneficiary name is required.');
      if (!accountNumber) return badRequest(res, 'Account number is required.');
      if (confirmAccountNumber !== undefined && String(accountNumber) !== String(confirmAccountNumber)) {
        return badRequest(res, 'Account number and confirmation do not match.');
      }
      if (!ifsc || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(String(ifsc).trim())) {
        return badRequest(res, 'Enter a valid IFSC code.');
      }
    }

    // The verifyLimits middleware resolved + attached the account. Fall back to a
    // direct lookup so the controller is also safe if mounted without it.
    const account = req.transferAccount || await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'No active bank account found for this profile.');

    // ── Security PIN verification ─────────────────────────────────────────────
    const user = await User.findByPk(req.user.id);
    if (!user?.security_pin) return badRequest(res, 'No security PIN set. Please contact support.');
    const pinValid = await bcrypt.compare(String(securityPin || ''), user.security_pin);
    if (!pinValid) return badRequest(res, 'Incorrect security PIN.');

    // ── Sufficient balance ────────────────────────────────────────────────────
    if (parseFloat(account.available_balance) < parsedAmount) {
      return badRequest(res, 'Insufficient balance for this transfer.');
    }

    if (!opfin.isConfigured()) {
      return error(res, 'Payout gateway is not configured. Please try again later.', 503);
    }

    const beneEmail = email || user.email;
    const beneLabel = isUpi ? String(vpa).trim() : `${beneficiaryName} · ${accountNumber}`;
    const referenceNumber = generateReferenceNumber(isUpi ? 'UPI' : upperMode);

    // ── Opfin unified-API dispatch (people / create) ──────────────────────────
    let opfinResponse;
    try {
      opfinResponse = isUpi
        ? await opfin.createUpiBeneficiary({
          name: beneficiaryName || 'UPI Beneficiary',
          email: beneEmail,
          vpa: String(vpa).trim(),
        })
        : await opfin.createBankBeneficiary({
          name: beneficiaryName,
          email: beneEmail,
          accountNumber,
          ifsc,
        });
    } catch (gwErr) {
      logger.error(`Opfin dispatch error (${referenceNumber}): ${gwErr.message}`);
      const msg = gwErr.message === 'OPFIN_NOT_CONFIGURED'
        ? 'Payout gateway is not configured. Please try again later.'
        : `Payout could not be initiated: ${gwErr.message}`;
      return error(res, msg, gwErr.message === 'OPFIN_NOT_CONFIGURED' ? 503 : 502);
    }

    const opfinPersonId = opfinResponse?.data?.id
      || opfinResponse?.id
      || opfinResponse?.people?.id
      || null;

    // ── Settlement timing: instant (UPI/IMPS) vs NEFT (pending → completed) ───
    const isInstant = INSTANT_MODES.includes(upperMode);
    const txnStatus = isInstant ? 'success' : 'processing'; // 'processing' = pending_settlement

    const t = await sequelize.transaction();
    let writeResult;
    try {
      const locked = await Account.findOne({
        where: { id: account.id }, transaction: t, lock: t.LOCK.UPDATE,
      });

      const balanceBefore = parseFloat(locked.balance);
      const balanceAfter = balanceBefore - parsedAmount;
      if (balanceAfter < 0) throw new Error('Insufficient balance');

      // Debit immediately for all rails; increment the used daily limit.
      await locked.update({
        balance: balanceAfter,
        available_balance: parseFloat(locked.available_balance) - parsedAmount,
        daily_transferred: parseFloat(locked.daily_transferred || 0) + parsedAmount,
      }, { transaction: t });

      const txn = await Transaction.create({
        account_id: locked.id,
        reference_number: referenceNumber,
        transaction_type: 'debit',
        transfer_mode: isUpi ? 'IMPS' : upperMode, // enum has no 'UPI'
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
          provider: 'opfin',
          railMode: upperMode,                 // preserves true UPI vs IMPS
          opfinPersonId,
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
      writeResult = { transactionId: txn.id, balanceAfter };
    } catch (txErr) {
      await t.rollback();
      logger.error(`Payout ledger write failed (${referenceNumber}): ${txErr.message}`);
      return error(res, 'Transfer could not be completed. Please try again.');
    }

    // ── NEFT: schedule the simulated batch settlement ─────────────────────────
    if (!isInstant) {
      scheduleNeftSettlement(writeResult.transactionId, referenceNumber);
    }

    // Async side-effects (don't block the response).
    sendTransferAlertEmail(user.email, user.first_name, {
      type: 'debit',
      amount: parsedAmount.toFixed(2),
      reference: referenceNumber,
      counterparty: beneLabel,
      mode: upperMode,
      balance: writeResult.balanceAfter,
      time: new Date().toLocaleString(),
    }).catch(() => {});

    createAuditLog({
      userId: req.user.id,
      action: 'PAYOUT_DISBURSED',
      entityType: 'Transaction',
      entityId: referenceNumber,
      ipAddress: req.ip,
      status: 'success',
      description: `${upperMode} payout of ${fmtINR(parsedAmount)} to ${beneLabel} (${txnStatus}).`,
    }).catch(() => {});

    const snapshot = req.transferLimitSnapshot;
    return success(res, {
      referenceNumber,
      transactionId: writeResult.transactionId,
      mode: upperMode,
      amount: parsedAmount,
      status: isInstant ? 'completed' : 'pending_settlement',
      balance: writeResult.balanceAfter,
      available_balance: writeResult.balanceAfter,
      remainingDailyLimit: snapshot ? snapshot.remainingAfter
        : Math.max(parseFloat(account.daily_transfer_limit) - parseFloat(account.daily_transferred || 0) - parsedAmount, 0),
    }, isInstant
      ? 'Transfer completed successfully.'
      : 'NEFT transfer initiated — it will settle shortly.');
  } catch (err) {
    logger.error(`disbursePayout error: ${err.message}`);
    return error(res, 'Transfer failed. Please try again.');
  }
};

// ─── Get current daily transfer-limit usage ───────────────────────────────────
// GET /api/payments/transfer-limit   (protected)
exports.getTransferLimit = async (req, res) => {
  try {
    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');

    // Mirror the verifyLimits 24h roll so the displayed "used" is never stale.
    const now = Date.now();
    const lastReset = account.last_limit_reset ? new Date(account.last_limit_reset).getTime() : null;
    let used = parseFloat(account.daily_transferred || 0);
    if (lastReset === null || (now - lastReset) >= 24 * 60 * 60 * 1000) {
      await account.update({ daily_transferred: 0, last_limit_reset: new Date() });
      used = 0;
    }

    const limit = parseFloat(account.daily_transfer_limit || 0);
    return success(res, {
      dailyTransferLimit: limit,
      usedDailyLimit: used,
      remaining: Math.max(limit - used, 0),
      availableBalance: parseFloat(account.available_balance),
    });
  } catch (err) {
    logger.error(`getTransferLimit error: ${err.message}`);
    return error(res, 'Failed to fetch transfer limit.');
  }
};

// ─── Internal Transfer (Alister → Alister) ────────────────────────────────────
// POST /api/payments/internal-transfer   (protected + verifyLimits)
// On-us transfer between two Alister Bank accounts. No external gateway: we
// verify the recipient account exists locally, then perform a single atomic
// ledger transaction — debit the sender, credit the recipient, and write a
// matching pair of COMPLETED transaction records. The verifyLimits middleware
// has already rolled the 24h window and confirmed the daily ceiling.
exports.internalTransfer = async (req, res) => {
  try {
    const {
      amount, accountNumber, confirmAccountNumber, beneficiaryName,
      description, securityPin,
    } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return badRequest(res, 'Enter a valid transfer amount.');
    }
    if (!accountNumber) return badRequest(res, 'Recipient Alister account number is required.');
    if (confirmAccountNumber !== undefined && String(accountNumber) !== String(confirmAccountNumber)) {
      return badRequest(res, 'Account number and confirmation do not match.');
    }

    // The verifyLimits middleware resolved + attached the sender account. Fall
    // back to a direct lookup so the controller is also safe if mounted alone.
    const senderAccount = req.transferAccount
      || await Account.findOne({ where: { user_id: req.user.id } });
    if (!senderAccount) return notFound(res, 'No active bank account found for this profile.');
    if (senderAccount.status === 'frozen') {
      return error(res, 'Your account is frozen. Contact support.', 403);
    }

    // Prevent self-transfer.
    if (String(senderAccount.account_number) === String(accountNumber)) {
      return badRequest(res, 'You cannot transfer to your own account.');
    }

    // ── Recipient must be a real, active Alister account ──────────────────────
    const recipientAccount = await Account.findOne({ where: { account_number: String(accountNumber).trim() } });
    if (!recipientAccount) {
      return badRequest(res, 'Recipient Alister account not found. Please verify the account number.');
    }
    if (recipientAccount.status !== 'active') {
      return badRequest(res, 'Recipient account is not active and cannot receive funds.');
    }

    // ── Security PIN verification ─────────────────────────────────────────────
    const user = await User.findByPk(req.user.id);
    if (!user?.security_pin) return badRequest(res, 'No security PIN set. Please contact support.');
    const pinValid = await bcrypt.compare(String(securityPin || ''), user.security_pin);
    if (!pinValid) return badRequest(res, 'Incorrect security PIN.');

    // ── Sufficient balance ────────────────────────────────────────────────────
    if (parseFloat(senderAccount.available_balance) < parsedAmount) {
      return badRequest(res, 'Insufficient balance for this transfer.');
    }

    const recipientUser = await User.findByPk(recipientAccount.user_id);
    const recipientName = recipientUser
      ? `${recipientUser.first_name || ''} ${recipientUser.last_name || ''}`.trim()
      : (beneficiaryName || 'Alister Account');
    const senderName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Alister Account';
    const referenceNumber = generateReferenceNumber('ALST');

    // ── Atomic ledger transaction ─────────────────────────────────────────────
    const t = await sequelize.transaction();
    let writeResult;
    try {
      // Lock BOTH rows (lowest id first) to avoid deadlocks under concurrency.
      const [firstId, secondId] = [senderAccount.id, recipientAccount.id].sort();
      const lockedA = await Account.findOne({ where: { id: firstId }, transaction: t, lock: t.LOCK.UPDATE });
      const lockedB = await Account.findOne({ where: { id: secondId }, transaction: t, lock: t.LOCK.UPDATE });
      const lockedSender = lockedA.id === senderAccount.id ? lockedA : lockedB;
      const lockedRecipient = lockedA.id === recipientAccount.id ? lockedA : lockedB;

      const senderBalanceBefore = parseFloat(lockedSender.balance);
      const senderBalanceAfter = senderBalanceBefore - parsedAmount;
      if (senderBalanceAfter < 0) throw new Error('Insufficient balance');

      const recipientBalanceBefore = parseFloat(lockedRecipient.balance);
      const recipientBalanceAfter = recipientBalanceBefore + parsedAmount;

      // Debit sender (+ increment daily usage), credit recipient.
      await lockedSender.update({
        balance: senderBalanceAfter,
        available_balance: parseFloat(lockedSender.available_balance) - parsedAmount,
        daily_transferred: parseFloat(lockedSender.daily_transferred || 0) + parsedAmount,
      }, { transaction: t });

      await lockedRecipient.update({
        balance: recipientBalanceAfter,
        available_balance: parseFloat(lockedRecipient.available_balance) + parsedAmount,
      }, { transaction: t });

      // Sender's debit leg (completed).
      const debitTxn = await Transaction.create({
        account_id: lockedSender.id,
        reference_number: referenceNumber,
        transaction_type: 'debit',
        transfer_mode: 'INTERNAL',
        amount: parsedAmount,
        balance_before: senderBalanceBefore,
        balance_after: senderBalanceAfter,
        description: description || `Alister transfer to ${recipientName}`,
        narration: `INTERNAL ${recipientAccount.account_number}`,
        category: 'transfer',
        status: 'success',
        to_account_number: recipientAccount.account_number,
        to_account_name: recipientName,
        to_ifsc: recipientAccount.ifsc_code,
        from_account_number: lockedSender.account_number,
        from_account_name: senderName,
        processed_at: new Date(),
        ip_address: req.ip,
        tags: { provider: 'internal', railMode: 'ALISTER', counterpartyAccountId: lockedRecipient.id },
      }, { transaction: t });

      // Recipient's credit leg (completed). Distinct reference suffix to satisfy
      // the unique reference_number constraint while staying easy to correlate.
      await Transaction.create({
        account_id: lockedRecipient.id,
        reference_number: `${referenceNumber}-CR`,
        transaction_type: 'credit',
        transfer_mode: 'INTERNAL',
        amount: parsedAmount,
        balance_before: recipientBalanceBefore,
        balance_after: recipientBalanceAfter,
        description: description || `Alister transfer from ${senderName}`,
        narration: `INTERNAL ${lockedSender.account_number}`,
        category: 'transfer',
        status: 'success',
        to_account_number: recipientAccount.account_number,
        to_account_name: recipientName,
        from_account_number: lockedSender.account_number,
        from_account_name: senderName,
        processed_at: new Date(),
        ip_address: req.ip,
        tags: { provider: 'internal', railMode: 'ALISTER', counterpartyAccountId: lockedSender.id, linkedRef: referenceNumber },
      }, { transaction: t });

      // Notify both parties.
      await Notification.create({
        user_id: lockedSender.user_id,
        title: `${fmtINR(parsedAmount)} sent to ${recipientName}`,
        message: `Your Alister transfer to ${recipientName} is complete. Ref: ${referenceNumber}`,
        type: 'transaction',
        priority: 'high',
      }, { transaction: t });

      if (lockedRecipient.user_id) {
        await Notification.create({
          user_id: lockedRecipient.user_id,
          title: `${fmtINR(parsedAmount)} received from ${senderName}`,
          message: `You received an Alister transfer from ${senderName}. Ref: ${referenceNumber}`,
          type: 'transaction',
          priority: 'high',
        }, { transaction: t });
      }

      await t.commit();
      writeResult = { transactionId: debitTxn.id, senderBalanceAfter };
    } catch (txErr) {
      await t.rollback();
      logger.error(`Internal transfer ledger write failed (${referenceNumber}): ${txErr.message}`);
      return error(res, 'Transfer could not be completed. Please try again.');
    }

    // Async side-effects (don't block the response).
    sendTransferAlertEmail(user.email, user.first_name, {
      type: 'debit',
      amount: parsedAmount.toFixed(2),
      reference: referenceNumber,
      counterparty: `${recipientName} · ${recipientAccount.account_number}`,
      mode: 'ALISTER',
      balance: writeResult.senderBalanceAfter,
      time: new Date().toLocaleString(),
    }).catch(() => {});

    // Recipient CREDIT alert — every successful credit notifies the receiver too.
    if (recipientUser?.email) {
      sendTransferAlertEmail(recipientUser.email, recipientUser.first_name || 'Customer', {
        type: 'credit',
        amount: parsedAmount.toFixed(2),
        reference: referenceNumber,
        counterparty: `${senderName} · ${senderAccount.account_number}`,
        mode: 'ALISTER',
        balance: (parseFloat(recipientAccount.balance) + parsedAmount).toFixed(2),
        time: new Date().toLocaleString(),
      }).catch(() => {});
    }

    createAuditLog({
      userId: req.user.id,
      action: 'INTERNAL_TRANSFER',
      entityType: 'Transaction',
      entityId: referenceNumber,
      ipAddress: req.ip,
      status: 'success',
      description: `Internal Alister transfer of ${fmtINR(parsedAmount)} to ${recipientAccount.account_number}.`,
    }).catch(() => {});

    const snapshot = req.transferLimitSnapshot;
    return success(res, {
      referenceNumber,
      transactionId: writeResult.transactionId,
      mode: 'ALISTER',
      amount: parsedAmount,
      status: 'completed',
      balance: writeResult.senderBalanceAfter,
      available_balance: writeResult.senderBalanceAfter,
      recipientName,
      remainingDailyLimit: snapshot ? snapshot.remainingAfter
        : Math.max(parseFloat(senderAccount.daily_transfer_limit) - parseFloat(senderAccount.daily_transferred || 0) - parsedAmount, 0),
    }, 'Transfer completed successfully.');
  } catch (err) {
    logger.error(`internalTransfer error: ${err.message}`);
    return error(res, 'Transfer failed. Please try again.');
  }
};

exports.resumePendingNeftSettlements = resumePendingNeftSettlements;
exports.scheduleNeftSettlement = scheduleNeftSettlement;
