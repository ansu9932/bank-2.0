const crypto = require('crypto');
const { randomUUID } = require('crypto');
const axios = require('axios');
const sequelize = require('../config/database');
const { Account, Transaction, Notification, User } = require('../models');
const { createUpiQr, isConfigured } = require('../utils/razorpay');
const { createAuditLog } = require('../middleware/auditLogger');
const { sendTransferAlertEmail } = require('../services/emailService');
const { success, error, badRequest, notFound } = require('../utils/apiResponse');
const { normalizeTransferMethods } = require('../utils/transferMethods');
const logger = require('../utils/logger');

// ─── Config ──────────────────────────────────────────────────────────────────
const MIN_DEPOSIT = 1;
const MAX_DEPOSIT = 100000;           // UPI/QR per-transaction ceiling ($1L)
const QR_TTL_SECONDS = 60 * 60; // single-use QR valid for 1 hour
const DEPOSIT_DESCRIPTION = 'Instant Funds Deposited via Secure UPI QR';
const PENDING_DESCRIPTION = 'UPI deposit via Secure QR (awaiting payment)';

// The DB enum has no literal "completed" — `success` is the app-wide canonical
// completed state. We persist `success` and translate to the public API string.
const DB_COMPLETED = 'success';
const API_COMPLETED = 'completed';
const API_PENDING = 'pending';

/** Compact, unique order reference embedded in Razorpay notes + reference_number. */
function buildOrderRef() {
  return `DEP-${randomUUID().replace(/-/g, '').slice(0, 22)}`;
}

/**
 * Cryptographically verify a Razorpay webhook using the standard `crypto` lib.
 * Razorpay signs the EXACT raw request body with HMAC-SHA256 keyed on the
 * webhook secret; the hex digest must equal the `x-razorpay-signature` header.
 *
 * @param {Buffer|string} rawBody  Unmodified request body bytes.
 * @param {string} signature       `x-razorpay-signature` header value.
 * @param {string} secret          process.env.RAZORPAY_WEBHOOK_SECRET.
 * @returns {boolean} true only on an authentic, timing-safe match.
 */
function verifyRazorpaySignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  try {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const receivedBuf = Buffer.from(String(signature), 'utf8');
    // Length check guards timingSafeEqual against throwing on mismatched sizes.
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch (err) {
    logger.error(`Razorpay signature verification error: ${err.message}`);
    return false;
  }
}

// ─── Create UPI QR ─────────────────────────────────────────────────────────────
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
    if (amount < MIN_DEPOSIT) return badRequest(res, `Minimum deposit is $${MIN_DEPOSIT}.`);
    if (amount > MAX_DEPOSIT) {
      return badRequest(res, `Maximum deposit per QR is $${MAX_DEPOSIT.toLocaleString('en-US')}.`);
    }

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'No active bank account found for this profile.');

    // ── Add Money lock ────────────────────────────────────────────────────────
    // Deposits are an admin-activated feature, disabled by default per account.
    if (!normalizeTransferMethods(account.transfer_methods).add_money) {
      return error(res, 'Add Money is currently disabled on your account. Please contact Alister Bank to enable it.', 403);
    }

    const userName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Customer';
    const orderRef = buildOrderRef();

    // Inject the user's tracking details so UPI apps render the payee cleanly
    // as "Alister Bank - <User Name>" and the webhook can resolve the account.
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

    // Fetch the QR image from Razorpay and inline it as a base64 data URI so the
    // frontend never has to load a cross-origin image (avoids CSP/img-src and
    // hotlink issues, and renders instantly). If the fetch fails for any reason
    // we fall back to the raw Razorpay image_url rather than failing the whole
    // QR creation.
    let qrImage = qr.image_url;
    try {
      const imgResponse = await axios.get(qr.image_url, { responseType: 'arraybuffer', timeout: 8000 });
      const base64 = Buffer.from(imgResponse.data).toString('base64');
      const mimeType = imgResponse.headers['content-type'] || 'image/png';
      qrImage = `data:${mimeType};base64,${base64}`;
    } catch (imgErr) {
      logger.error(`QR image fetch failed (${orderRef}); falling back to image_url: ${imgErr.message}`);
    }

    // Pre-create the deposit as a PENDING ledger record keyed on orderRef. The
    // webhook later flips this to completed and credits the balance.
    try {
      await Transaction.create({
        account_id: account.id,
        reference_number: orderRef,
        transaction_type: 'credit',
        transfer_mode: 'IMPS',
        amount,
        description: PENDING_DESCRIPTION,
        narration: `Razorpay UPI · ${orderRef}`,
        category: 'deposit',
        status: 'pending',
        from_account_name: 'UPI Instant Deposit',
        tags: { provider: 'razorpay', qrId: qr.id, orderRef, userId: String(req.user.id) },
      });
    } catch (txErr) {
      // Non-fatal: the webhook has a fallback that creates the record on credit.
      logger.error(`Pending deposit record creation failed (${orderRef}): ${txErr.message}`);
    }

    logger.info(`UPI QR created: orderRef=${orderRef} qrId=${qr.id} amount=$${amount} user=${req.user.id}`);

    return success(res, {
      orderRef,
      qrId: qr.id,
      image_url: qrImage,
      amount,
      currency: 'USD',
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

/**
 * Atomically credit a verified UPI deposit (idempotent on orderRef).
 * Flips the pending transaction → success and increments the account balance.
 * @returns {Promise<boolean>} true when a fresh credit was applied.
 */
async function creditDeposit({ orderRef, paymentId, amountPaise, notes }) {
  const paymentAmount = Number(amountPaise) / 100;
  if (!paymentAmount || Number.isNaN(paymentAmount) || paymentAmount <= 0) {
    logger.warn(`creditDeposit skipped — invalid amount (orderRef=${orderRef}, payment=${paymentId}).`);
    return false;
  }

  // Locate the pending ledger record by orderRef (the stable correlation key).
  let txn = orderRef
    ? await Transaction.findOne({ where: { reference_number: orderRef } })
    : null;

  // Idempotency: a second webhook delivery for an already-credited deposit.
  if (txn && txn.status === DB_COMPLETED) {
    logger.info(`creditDeposit skipped — orderRef ${orderRef} already completed.`);
    return false;
  }

  // Resolve the destination account: prefer the pending record, fall back to notes.
  let account = null;
  if (txn?.account_id) account = await Account.findOne({ where: { id: txn.account_id } });
  if (!account && notes?.accountId) account = await Account.findOne({ where: { id: notes.accountId } });
  if (!account && notes?.userId) account = await Account.findOne({ where: { user_id: notes.userId } });
  if (!account) {
    logger.error(`creditDeposit failed — no account resolved (orderRef=${orderRef}, payment=${paymentId}).`);
    return false;
  }

  const t = await sequelize.transaction();
  try {
    // Lock the account row to prevent lost updates under concurrent credits.
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

    const mergedTags = {
      provider: 'razorpay',
      orderRef: orderRef || null,
      paymentId: paymentId || null,
    };

    if (txn) {
      // pending → completed
      await txn.update({
        status: DB_COMPLETED,
        amount: paymentAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: DEPOSIT_DESCRIPTION,
        processed_at: new Date(),
        tags: { ...(txn.tags || {}), ...mergedTags },
      }, { transaction: t });
    } else {
      // Fallback: no pending record existed — create the completed credit fresh.
      txn = await Transaction.create({
        account_id: locked.id,
        reference_number: orderRef || paymentId,
        transaction_type: 'credit',
        transfer_mode: 'IMPS',
        amount: paymentAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: DEPOSIT_DESCRIPTION,
        narration: `Razorpay UPI · ${orderRef || paymentId}`,
        category: 'deposit',
        status: DB_COMPLETED,
        from_account_name: 'UPI Instant Deposit',
        processed_at: new Date(),
        tags: mergedTags,
      }, { transaction: t });
    }

    await Notification.create({
      user_id: locked.user_id,
      title: `$${paymentAmount.toLocaleString('en-US')} added to your account`,
      message: `${DEPOSIT_DESCRIPTION}. Ref: ${paymentId || orderRef}`,
      type: 'transaction',
      priority: 'high',
    }, { transaction: t });

    await t.commit();
    logger.info(`Deposit credited: $${paymentAmount} → account ${locked.id} (orderRef=${orderRef}, payment=${paymentId}).`);

    createAuditLog({
      userId: locked.user_id,
      action: 'DEPOSIT_CREDITED',
      entityType: 'Transaction',
      entityId: String(orderRef || paymentId).slice(0, 100),
      status: 'success',
      description: `UPI deposit of $${paymentAmount} credited.`,
    }).catch(() => {});

    // Transaction alert email — every successful CREDIT notifies the user.
    User.findByPk(locked.user_id).then((u) => {
      if (!u?.email) return;
      return sendTransferAlertEmail(u.email, u.first_name || 'Customer', {
        type: 'credit',
        amount: paymentAmount.toFixed(2),
        reference: orderRef || paymentId,
        counterparty: 'UPI Instant Deposit',
        mode: 'UPI',
        balance: balanceAfter.toFixed(2),
        time: new Date().toLocaleString('en-US'),
      });
    }).catch((e) => logger.error(`Deposit credit email failed: ${e.message}`));

    return true;
  } catch (err) {
    await t.rollback();
    logger.error(`creditDeposit transaction failed (orderRef=${orderRef}, payment=${paymentId}): ${err.message}`);
    throw err;
  }
}

// ─── Webhook listener ────────────────────────────────────────────────────────
// POST /api/payments/webhook   (public, signature-verified)
exports.webhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const rawBody = req.rawBody || JSON.stringify(req.body || {});

    // 1) Strict cryptographic signature validation.
    if (!verifyRazorpaySignature(rawBody, signature, secret)) {
      logger.warn('Razorpay webhook REJECTED — invalid or missing signature.');
      return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
    }

    const event = req.body?.event;
    const payload = req.body?.payload || {};
    logger.info(`Razorpay webhook verified — event=${event}`);

    // 2) Act only on a confirmed successful capture / QR credit.
    if (event === 'payment.captured' || event === 'qr_code.credited') {
      const paymentEntity = payload.payment?.entity;
      if (!paymentEntity) {
        logger.warn(`Webhook ${event} had no payment entity — acknowledged.`);
        return res.status(200).json({ success: true, received: true });
      }

      const notes = paymentEntity.notes || payload.qr_code?.entity?.notes || {};
      const orderRef = notes.orderRef || null;

      logger.info(`Crediting deposit — orderRef=${orderRef} payment=${paymentEntity.id} amount(paise)=${paymentEntity.amount}`);

      await creditDeposit({
        orderRef,
        paymentId: paymentEntity.id,
        amountPaise: paymentEntity.amount,
        notes,
      });

      return res.status(200).json({ success: true, received: true });
    }

    // 3) Acknowledge unrelated events so Razorpay stops retrying.
    return res.status(200).json({ success: true, received: true, ignored: event });
  } catch (err) {
    logger.error(`Webhook processing error: ${err.message}`);
    // Non-2xx → Razorpay retries delivery (good for transient DB failures).
    return res.status(500).json({ success: false, message: 'Webhook processing failed.' });
  }
};

// ─── Poll deposit status ─────────────────────────────────────────────────────
// GET /api/payments/status/:orderRef   (protected)
exports.getStatus = async (req, res) => {
  try {
    const { orderRef } = req.params;
    if (!orderRef) return badRequest(res, 'Order reference is required.');

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');

    const txn = await Transaction.findOne({
      where: { account_id: account.id, reference_number: orderRef, category: 'deposit' },
    });

    if (txn && txn.status === DB_COMPLETED) {
      return res.status(200).json({
        success: true,
        status: API_COMPLETED,
        amount: parseFloat(txn.amount),
        balance: parseFloat(account.balance),
        available_balance: parseFloat(account.available_balance),
        paymentId: (txn.tags && txn.tags.paymentId) || txn.reference_number,
      });
    }

    return res.status(200).json({ success: true, status: API_PENDING });
  } catch (err) {
    logger.error(`Deposit status error: ${err.message}`);
    return error(res, 'Failed to fetch deposit status.');
  }
};
