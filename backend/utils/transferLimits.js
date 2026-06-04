const { Op } = require('sequelize');
const { Transaction } = require('../models');

/**
 * Daily transfer-limit helpers (Alister Bank payouts).
 *
 * The platform tracks how much a user has sent OUT within the current calendar
 * day. The reference brief specifies "00:00 to 23:59 UTC/IST"; we anchor the
 * window to the Indian Standard Time calendar day (UTC+5:30, no DST) and convert
 * the boundaries to UTC so the query is correct regardless of server timezone.
 *
 * Schema mapping note: the live `transactions` table enums cannot be altered on
 * boot (sync is locked to alter:false), so we map the brief's conceptual states
 * onto the existing columns:
 *   - "type: transfer"      -> transaction_type:'debit' AND (category:'payout'
 *                              OR transfer_mode in NEFT/RTGS/IMPS/INTERNAL)
 *   - "status: completed"   -> status:'success'
 *   - "status: pending"     -> status:'pending' | 'processing'
 * In-flight (pending/processing) debits count toward the daily usage so a
 * batched NEFT cannot be used to bypass the cap.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30
const DAY_MS = 24 * 60 * 60 * 1000;
const TRANSFER_MODES = ['NEFT', 'RTGS', 'IMPS', 'INTERNAL'];
const COUNTED_STATUSES = ['pending', 'processing', 'success'];

/**
 * Compute the UTC boundaries of the current IST calendar day.
 * @param {Date} [now]
 * @returns {{ startUtc: Date, endUtc: Date }}
 */
function istDayRangeUtc(now = new Date()) {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const istMidnightAsUtc = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
    0, 0, 0, 0,
  );
  const startUtc = new Date(istMidnightAsUtc - IST_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + DAY_MS - 1);
  return { startUtc, endUtc };
}

/**
 * Total amount transferred OUT of an account within the current IST day.
 * @param {string} accountId
 * @param {object} [opts]
 * @param {import('sequelize').Transaction} [opts.transaction] active DB txn
 * @returns {Promise<number>} rupees transferred today
 */
async function getDailyTransferred(accountId, { transaction } = {}) {
  const { startUtc, endUtc } = istDayRangeUtc();
  const total = await Transaction.sum('amount', {
    where: {
      account_id: accountId,
      transaction_type: 'debit',
      status: { [Op.in]: COUNTED_STATUSES },
      created_at: { [Op.between]: [startUtc, endUtc] },
      [Op.or]: [
        { category: 'payout' },
        { transfer_mode: { [Op.in]: TRANSFER_MODES } },
      ],
    },
    transaction,
  });
  return parseFloat(total || 0);
}

/**
 * Evaluate a requested transfer against the user's daily allowance.
 * @param {string} accountId
 * @param {number} requestedAmount
 * @param {number} dailyLimit
 * @param {object} [opts] passthrough (e.g. active DB transaction)
 * @returns {Promise<{ allowed: boolean, spentToday: number, dailyLimit: number,
 *   remaining: number, remainingAfter: number }>}
 */
async function evaluateDailyLimit(accountId, requestedAmount, dailyLimit, opts = {}) {
  const spentToday = await getDailyTransferred(accountId, opts);
  const limit = parseFloat(dailyLimit || 0);
  const amount = parseFloat(requestedAmount || 0);
  const remaining = Math.max(limit - spentToday, 0);
  const allowed = spentToday + amount <= limit;
  return {
    allowed,
    spentToday,
    dailyLimit: limit,
    remaining,
    remainingAfter: Math.max(limit - spentToday - amount, 0),
  };
}

module.exports = {
  istDayRangeUtc,
  getDailyTransferred,
  evaluateDailyLimit,
  TRANSFER_MODES,
};
