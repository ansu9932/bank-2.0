const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const { Account, Transaction, User, Notification } = require('../models');
const opfin = require('../utils/opfin');
const { resolveUpiProvider, isValidVpa } = require('../utils/upiProviders');
const { generateReferenceNumber } = require('../utils/helpers');
const { sendTransferAlertEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound } = require('../utils/apiResponse');
const logger = require('../utils/logger');

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

exports.resumePendingNeftSettlements = resumePendingNeftSettlements;
exports.scheduleNeftSettlement = scheduleNeftSettlement;
