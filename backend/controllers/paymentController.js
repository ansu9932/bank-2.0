const crypto = require('crypto');
const { randomUUID } = require('crypto');
const axios = require('axios');
const sequelize = require('../config/database');
const { Account, Transaction, Notification, User } = require('../models');
const { createUpiQr, isConfigured } = require('../utils/razorpay');
const { createAuditLog } = require('../middleware/auditLogger');
const { sendTransferAlertEmail } = require('../services/emailService');
const { success, error, badRequest, notFound } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// ─── Config ──────────────────────────────────────────────────────────────────
const MIN_DEPOSIT = 1;
const MAX_DEPOSIT = 100000;           // UPI/QR per-transaction ceiling (₹1L)
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
 * Turn Razorpay's BRANDED QR poster (Powered-by-Razorpay header, BHIM/UPI band,
 * the QR, "Scan & Pay" text, GPay/PhonePe/Paytm icons, merchant name) into a
 * CLEAN, branding-free square QR returned as a data: URI.
 *
 * Layered strategy — each step falls back to the next, so we always return at
 * least the original poster and never fail QR creation:
 *
 *   1) DECODE + REGENERATE (best): read the QR payload out of the poster with
 *      jsQR and regenerate a pristine square QR from that EXACT payload via the
 *      `qrcode` lib. No branding, full quiet zone, crisp at any size, and it
 *      scans to the same UPI intent so payment still captures through Razorpay.
 *   2) PROPORTIONAL CROP: if decode fails, sharp extracts the centred QR square
 *      (~36%-68% down the poster, computed from the image's own dimensions).
 *   3) RAW POSTER: inline the original image unchanged.
 *
 * @param {string} posterUrl  Razorpay `qr.image_url`.
 * @returns {Promise<string>} A `data:image/...;base64,...` URI.
 */
async function buildCleanQrDataUri(posterUrl) {
  const { data } = await axios.get(posterUrl, { responseType: 'arraybuffer', timeout: 8000 });
  const buffer = Buffer.from(data);

  // ── 1) decode the poster's QR, then regenerate a clean square QR ─────────────
  try {
    const sharp = require('sharp');
    const jsQR = require('jsqr');
    const QRCode = require('qrcode');
    const { data: rgba, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(rgba), info.width, info.height);
    if (decoded && decoded.data) {
      return QRCode.toDataURL(decoded.data, {
        margin: 2,                  // built-in quiet zone (modules)
        width: 600,                 // crisp; CSS scales it down to the frame
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      });
    }
    logger.warn('QR poster decode returned no payload; falling back to crop.');
  } catch (decodeErr) {
    logger.error(`QR decode/regenerate failed: ${decodeErr.message}`);
  }

  // ── 2) proportional crop of the QR square out of the poster ──────────────────
  try {
    const sharp = require('sharp');
    const meta = await sharp(buffer).metadata();
    const W = meta.width;
    const H = meta.height;
    if (W && H) {
      // Razorpay poster layout, as fractions of HEIGHT: the QR square sits
      // roughly between these two lines, horizontally centred. The square's
      // side === its vertical span. Tune these two constants if the crop is off.
      const QR_TOP_FRAC = 0.36;
      const QR_BOTTOM_FRAC = 0.68;
      let size = Math.round((QR_BOTTOM_FRAC - QR_TOP_FRAC) * H);
      size = Math.min(size, W, H);                         // stay within bounds
      let left = Math.max(0, Math.min(Math.round((W - size) / 2), W - size));
      let top = Math.max(0, Math.min(Math.round(QR_TOP_FRAC * H), H - size));
      const cropped = await sharp(buffer)
        .extract({ left, top, width: size, height: size })
        .resize(600, 600, { fit: 'contain', background: '#ffffff' })
        .png()
        .toBuffer();
      return `data:image/png;base64,${cropped.toString('base64')}`;
    }
  } catch (cropErr) {
    logger.error(`QR proportional crop failed: ${cropErr.message}`);
  }

  // ── 3) raw poster (never breaks QR creation) ─────────────────────────────────
  return `data:image/png;base64,${buffer.toString('base64')}`;
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
    if (amount < MIN_DEPOSIT) return badRequest(res, `Minimum deposit is ₹${MIN_DEPOSIT}.`);
    if (amount > MAX_DEPOSIT) {
      return badRequest(res, `Maximum deposit per QR is ₹${MAX_DEPOSIT.toLocaleString('en-IN')}.`);
    }

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'No active bank account found for this profile.');

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

    // Convert Razorpay's branded QR poster into a CLEAN, branding-free square QR
    // (decode + regenerate, else crop, else raw) and inline it as a data: URI so
    // the frontend renders only the scannable QR with no logos/app-icons/text.
    // Any failure falls back to the raw Razorpay image rather than breaking the
    // QR flow.
    let qrImage = qr.image_url;
    try {
      qrImage = await buildCleanQrDataUri(qr.image_url);
    } catch (imgErr) {
      logger.error(`QR image processing failed (${orderRef}); falling back to image_url: ${imgErr.message}`);
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

    logger.info(`UPI QR created: orderRef=${orderRef} qrId=${qr.id} amount=₹${amount} user=${req.user.id}`);

    return success(res, {
      orderRef,
      qrId: qr.id,
      image_url: qrImage,
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
      title: `₹${paymentAmount.toLocaleString('en-IN')} added to your account`,
      message: `${DEPOSIT_DESCRIPTION}. Ref: ${paymentId || orderRef}`,
      type: 'transaction',
      priority: 'high',
    }, { transaction: t });

    await t.commit();
    logger.info(`Deposit credited: ₹${paymentAmount} → account ${locked.id} (orderRef=${orderRef}, payment=${paymentId}).`);

    createAuditLog({
      userId: locked.user_id,
      action: 'DEPOSIT_CREDITED',
      entityType: 'Transaction',
      entityId: String(orderRef || paymentId).slice(0, 100),
      status: 'success',
      description: `UPI deposit of ₹${paymentAmount} credited.`,
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
        time: new Date().toLocaleString('en-IN'),
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

    // 2) Act only on a confirmed successful capture / QR credit / payment link.
    if (event === 'payment.captured' || event === 'qr_code.credited' || event === 'payment_link.paid') {
      // The payment may arrive under different payload keys depending on the
      // event: `payment.entity` (captured/qr), and for a paid Payment Link the
      // payload carries both `payment.entity` and `payment_link.entity`.
      const paymentEntity = payload.payment?.entity;
      const linkEntity = payload.payment_link?.entity;
      const qrEntity = payload.qr_code?.entity;

      const notes = paymentEntity?.notes || linkEntity?.notes || qrEntity?.notes || {};
      const orderRef = notes.orderRef || null;
      const paymentId = paymentEntity?.id || linkEntity?.id || null;
      const amountPaise = paymentEntity?.amount ?? linkEntity?.amount;

      if (!orderRef && !paymentId) {
        logger.warn(`Webhook ${event} had no payment/link entity — acknowledged.`);
        return res.status(200).json({ success: true, received: true });
      }

      logger.info(`Crediting deposit — event=${event} orderRef=${orderRef} payment=${paymentId} amount(paise)=${amountPaise}`);

      await creditDeposit({
        orderRef,
        paymentId,
        amountPaise,
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
