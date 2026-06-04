const { randomUUID } = require('crypto');
const { Account, Transaction } = require('../models');
const { createOrder, isConfigured } = require('../utils/razorpay');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · CONDITIONAL DEPOSIT GATEWAY
   High-value deposits (> ₹2,00,000) cannot use UPI/QR (NPCI per-txn cap), so
   they open the Razorpay Checkout widget against a server-created Order with a
   forced method preference (Card or Net Banking). The shared webhook in
   paymentController credits the balance on `payment.captured`.
   ────────────────────────────────────────────────────────────────────────── */

// ₹2,00,000 — the UPI/QR per-transaction ceiling.
const UPI_QR_CAP = 200000;
const MIN_DEPOSIT = 1;
// Razorpay hard cap for a single order (₹5,00,00,000). Keeps payloads sane.
const MAX_DEPOSIT = 50000000;

// Methods routed through the Checkout Order flow (this controller).
const CHECKOUT_METHODS = ['card', 'netbanking'];
// Methods that belong to the QR flow and must be rejected above the cap.
const QR_METHODS = ['upi', 'qr'];

const DEPOSIT_PENDING_DESCRIPTION = 'Deposit via Razorpay Checkout (awaiting payment)';

/** Compact, unique order reference embedded in Razorpay notes + reference_number. */
function buildOrderRef() {
  return `DEP-${randomUUID().replace(/-/g, '').slice(0, 22)}`;
}

// ─── Create a Checkout deposit order ──────────────────────────────────────────
// POST /api/payments/create-deposit-order   (protected)
// Body: { amount, paymentMethod }  where paymentMethod ∈ 'card' | 'netbanking'
//       (and 'upi'/'qr' are explicitly rejected above the ₹2L cap).
exports.createDepositOrder = async (req, res) => {
  try {
    if (!isConfigured()) {
      return error(res, 'Payment gateway is not configured. Please try again later.', 503);
    }

    const amount = parseFloat(req.body.amount);
    const paymentMethod = String(req.body.paymentMethod || '').toLowerCase().trim();

    // ── Amount validation ─────────────────────────────────────────────────────
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return badRequest(res, 'Please enter a valid deposit amount.');
    }
    if (amount < MIN_DEPOSIT) return badRequest(res, `Minimum deposit is ₹${MIN_DEPOSIT}.`);
    if (amount > MAX_DEPOSIT) {
      return badRequest(res, `Maximum deposit per transaction is ₹${MAX_DEPOSIT.toLocaleString('en-IN')}.`);
    }

    // ── Conditional rule: UPI/QR is hard-capped at ₹2,00,000 ──────────────────
    if (amount > UPI_QR_CAP && QR_METHODS.includes(paymentMethod)) {
      return badRequest(
        res,
        `UPI/QR payments are capped at ₹${UPI_QR_CAP.toLocaleString('en-IN')}. Please choose Card or Net Banking for this amount.`
      );
    }

    // This controller only services the Checkout rails (card / netbanking).
    // UPI/QR deposits continue to use POST /api/payments/create-qr.
    if (!CHECKOUT_METHODS.includes(paymentMethod)) {
      return badRequest(res, 'Select a valid payment method: Card or Net Banking.');
    }

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'No active bank account found for this profile.');

    const userName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Customer';
    const orderRef = buildOrderRef();

    const notes = {
      orderRef,
      userId: String(req.user.id),
      accountId: String(account.id),
      userName,
      purpose: 'wallet_topup',
      method: paymentMethod,
    };

    // ── Create the Razorpay Order (amount mapped to paise inside createOrder) ─
    const order = await createOrder({ amount, receipt: orderRef, notes });

    // Pre-create the PENDING ledger record keyed on orderRef. The shared webhook
    // (payment.captured) flips this to completed and credits the balance.
    try {
      await Transaction.create({
        account_id: account.id,
        reference_number: orderRef,
        transaction_type: 'credit',
        transfer_mode: 'IMPS',
        amount,
        description: DEPOSIT_PENDING_DESCRIPTION,
        narration: `Razorpay ${paymentMethod} · ${orderRef}`,
        category: 'deposit',
        status: 'pending',
        from_account_name: `${paymentMethod === 'card' ? 'Card' : 'Net Banking'} Deposit`,
        tags: {
          provider: 'razorpay',
          rzpOrderId: order.id,
          orderRef,
          method: paymentMethod,
          userId: String(req.user.id),
        },
      });
    } catch (txErr) {
      // Non-fatal: the webhook has a fallback that creates the record on credit.
      logger.error(`Pending deposit record creation failed (${orderRef}): ${txErr.message}`);
    }

    // Method config forwarded to the Razorpay Checkout widget so the chosen rail
    // is preferred/forced in the UI.
    const methodConfig = paymentMethod === 'card'
      ? { card: true, netbanking: false, upi: false, wallet: false, paylater: false }
      : { netbanking: true, card: false, upi: false, wallet: false, paylater: false };

    logger.info(`Deposit order created: orderRef=${orderRef} rzpOrder=${order.id} amount=₹${amount} method=${paymentMethod} user=${req.user.id}`);

    createAuditLog({
      userId: req.user.id,
      action: 'DEPOSIT_ORDER_CREATED',
      entityType: 'Transaction',
      entityId: orderRef,
      ipAddress: req.ip,
      status: 'success',
      description: `Checkout deposit order of ₹${amount} via ${paymentMethod}.`,
    }).catch(() => {});

    return success(res, {
      orderRef,
      orderId: order.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount,
      amountPaise: order.amount,
      currency: order.currency || 'INR',
      paymentMethod,
      methodConfig,
      name: 'Alister Bank',
      description: `Wallet top-up · ${userName}`,
      prefill: {
        name: userName,
        email: req.user.email || '',
        contact: req.user.phone || '',
      },
    }, 'Deposit order created. Complete payment to credit your account.');
  } catch (err) {
    logger.error(`create-deposit-order error: ${err.message}`);
    if (err.message === 'RAZORPAY_NOT_CONFIGURED') {
      return error(res, 'Payment gateway is not configured. Please try again later.', 503);
    }
    return error(res, 'Could not create the deposit order. Please try again.');
  }
};
