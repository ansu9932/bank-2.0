const { randomUUID } = require('crypto');
const sequelize = require('../config/database');
const { Account, Transaction, User, Notification } = require('../models');
const { createUpiQr, validateWebhookSignature, isConfigured } = require('../utils/razorpay');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// Deposit guardrails (INR).
const MIN_DEPOSIT = 1;
const MAX_DEPOSIT = 200000;
const QR_TTL_SECONDS = 60 * 60; // single-use QR valid for 1 hour
const DEPOSIT_DESCRIPTION = 'Instant Funds Deposited via Secure UPI QR';

/**
 * Build a compact, unique order reference. Lives in the Razorpay `notes` and is
 * mirrored into the credited transaction's `narration`, letting the dashboard
 * poll deposit status without an extra table.
 */
function buildOrderRef() {
  return `DEP-${randomUUID().replace(/-/g, '').slice(0, 22)}`;
}

// ─── Create UPI QR ──────────────────────────────────────────────────────────
// POST /api/payments/create-qr   (protected)
exports.createQR = async (req, res) => {
  try {
    if (!isConfigured()) {
      return error(res, 'Payment gateway is not configured. Please try again later.', 503);
    }

    const amount = parseFloat(req.body.amount);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return badRequest(res, 'Please enter a valid deposit amount.');
    }
    if (amount < MIN_DEPOSIT) return badRequest(res, `Minimum deposit is ₹${MIN_DEPOSIT}.`);
    if (amount > MAX_DEPOSIT) return badRequest(res, `Maximum deposit per QR is ₹${MAX_DEPOSIT.toLocaleString('en-IN')}.`);

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'No active bank account found for this profile.');

    const userName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Customer';
    const orderRef = buildOrderRef();

    // Inject the logged-in user's tracking details so UPI apps render the payee
    // cleanly as "Alister Bank - <User Name>".
    const description = `Alister Bank - ${userName}`.slice(0, 250);
    const notes = {
      orderRef,
      userId: String(req.user.id),
      accountId: String(account.id),
      userName,
      purpose: 'wallet_topup',
    };

    const qr = await createUpiQr({
      amount,
      description,
      notes,
      closeBy: Math.floor(Date.now() / 1000) + QR_TTL_SECONDS,
    });

    return success(res, {
      orderRef,
      qrId: qr.id,
      image_url: qr.image_url,
      amount,
      currency: 'INR',
      description,
      status: qr.status,
      expiresAt: qr.close_by ? new Date(qr.close_by * 1000).toISOString() : null,
    }, 'Secure UPI QR generated. Scan to complete your deposit.');
  } catch (err) {
    logger.error(`create-qr error: ${err.message}`);
    if (err.message === 'RAZORPAY_NOT_CONFIGURED') {
      return error(res, 'Payment gateway is not configured. Please try again later.', 503);
    }
    return error(res, 'Could not generate the payment QR. Please try again.');
  }
};

// ─── Internal: credit a verified UPI deposit atomically ──────────────────────
// Returns true when a fresh credit was applied, false when skipped (duplicate /
// unresolvable). Safe to call multiple times for the same payment (idempotent).
async function creditDeposit({ paymentId, amountPaise, notes }) {
  const paymentAmount = Number(amountPaise) / 100;
  if (!paymentId || !paymentAmount || paymentAmount <= 0) {
    logger.warn(`creditDeposit skipped — invalid payload (paymentId=${paymentId}).`);
    return false;
  }

  // Idempotency: a transaction keyed on the Razorpay payment id already credited.
  const existing = await Transaction.findOne({ where: { reference_number: paymentId } });
  if (existing) {
    logger.info(`creditDeposit skipped — payment ${paymentId} already processed.`);
    return false;
  }

  // Resolve the destination account from the payment metadata notes.
  let account = null;
  if (notes?.accountId) {
    account = await Account.findOne({ where: { id: notes.accountId } });
  }
  if (!account && notes?.userId) {
    account = await Account.findOne({ where: { user_id: notes.userId } });
  }
  if (!account) {
    logger.error(`creditDeposit failed — no account resolved for payment ${paymentId}.`);
    return false;
  }

  const orderRef = notes?.orderRef || null;

  const t = await sequelize.transaction();
  try {
    // Lock + re-read inside the transaction to avoid lost updates.
    const locked = await Account.findOne({
      where: { id: account.id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const balanceBefore = parseFloat(locked.balance);
    const balanceAfter = balanceBefore + paymentAmount;

    await locked.update({
      balance: balanceAfter,
      available_balance: parseFloat(locked.available_balance) + paymentAmount,
    }, { transaction: t });

    await Transaction.create({
      account_id: locked.id,
      reference_number: paymentId, // razorpay_payment_id
      transaction_type: 'credit',
      transfer_mode: 'IMPS',
      amount: paymentAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: DEPOSIT_DESCRIPTION,
      narration: orderRef,
      category: 'deposit',
      status: 'success',
      from_account_name: 'UPI Instant Deposit',
      processed_at: new Date(),
      tags: { provider: 'razorpay', paymentId, orderRef },
    }, { transaction: t });

    await Notification.create({
      user_id: locked.user_id,
      title: `₹${paymentAmount.toLocaleString('en-IN')} added to your account`,
      message: `${DEPOSIT_DESCRIPTION}. Ref: ${paymentId}`,
      type: 'transaction',
      priority: 'high',
    }, { transaction: t });

    await t.commit();
    logger.info(`Deposit credited: ₹${paymentAmount} → account ${locked.id} (payment ${paymentId}).`);

    createAuditLog({
      userId: locked.user_id,
      action: 'DEPOSIT_CREDITED',
      entityType: 'Transaction',
      entityId: paymentId,
      status: 'success',
      description: `UPI deposit of ₹${paymentAmount} credited.`,
    }).catch(() => {});

    return true;
  } catch (err) {
    await t.rollback();
    logger.error(`creditDeposit transaction failed for payment ${paymentId}: ${err.message}`);
    throw err;
  }
}

// ─── Webhook listener ────────────────────────────────────────────────────────
// POST /api/payments/webhook   (public, signature-verified)
exports.webhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Validate the cryptographic signature against the EXACT raw bytes received.
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const isValid = validateWebhookSignature(rawBody, signature, secret);
    if (!isValid) {
      logger.warn('Razorpay webhook rejected — invalid signature.');
      return res.status(400).json({ status: false, message: 'Invalid webhook signature.' });
    }

    const event = req.body?.event;
    const payload = req.body?.payload || {};

    // Only act on a confirmed successful capture / QR credit.
    if (event === 'payment.captured' || event === 'qr_code.credited') {
      const paymentEntity = payload.payment?.entity;
      if (!paymentEntity) {
        return res.status(200).json({ received: true, note: 'No payment entity in payload.' });
      }

      const notes = paymentEntity.notes
        || payload.qr_code?.entity?.notes
        || {};

      await creditDeposit({
        paymentId: paymentEntity.id,
        amountPaise: paymentEntity.amount,
        notes,
      });

      return res.status(200).json({ received: true });
    }

    // Any other event is acknowledged so Razorpay does not retry.
    return res.status(200).json({ received: true, ignored: event });
  } catch (err) {
    logger.error(`Webhook processing error: ${err.message}`);
    // Non-2xx → Razorpay will retry delivery for transient failures.
    return res.status(500).json({ status: false, message: 'Webhook processing failed.' });
  }
};

// ─── Poll deposit status ─────────────────────────────────────────────────────
// GET /api/payments/status/:ref   (protected)
// The dashboard polls this after rendering the QR; once the webhook credits the
// balance a matching transaction exists and we report "paid".
exports.getStatus = async (req, res) => {
  try {
    const { ref } = req.params;
    if (!ref) return badRequest(res, 'Order reference is required.');

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');

    const txn = await Transaction.findOne({
      where: { account_id: account.id, narration: ref, category: 'deposit', status: 'success' },
    });

    if (txn) {
      return success(res, {
        status: 'paid',
        paymentId: txn.reference_number,
        amount: parseFloat(txn.amount),
        balance: parseFloat(account.balance),
        available_balance: parseFloat(account.available_balance),
      }, 'Deposit credited successfully.');
    }

    return success(res, { status: 'pending' }, 'Awaiting payment confirmation.');
  } catch (err) {
    logger.error(`Deposit status error: ${err.message}`);
    return error(res, 'Failed to fetch deposit status.');
  }
};
