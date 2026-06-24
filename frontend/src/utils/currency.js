// ─────────────────────────────────────────────────────────────────────────────
// Centralized USD currency formatting helpers.
//
// The application displays balances, transactions and fees in US Dollars.
// Use these helpers (or the `$` + en-US locale convention) everywhere instead
// of the previous Indian-rupee (₹ / en-IN) formatting.
// ─────────────────────────────────────────────────────────────────────────────

/** Symbol shown alongside amounts. */
export const CURRENCY_SYMBOL = '$';

/** ISO currency code persisted on accounts / used by Intl formatters. */
export const CURRENCY_CODE = 'USD';

/** Locale used for grouping / decimal formatting. */
export const CURRENCY_LOCALE = 'en-US';

/**
 * Format a numeric amount as USD, e.g. 1234.5 → "$1,234.50".
 * Falls back to $0 for NaN / null / undefined input.
 */
export const formatUSD = (value, { decimals = 2 } = {}) =>
  CURRENCY_SYMBOL +
  Number(value || 0).toLocaleString(CURRENCY_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/**
 * Compact USD formatter for charts / tight UI, e.g. 1_500_000 → "$1.50M".
 */
export const formatUSDShort = (value) => {
  const n = Number(value || 0);
  if (n >= 1e9) return CURRENCY_SYMBOL + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return CURRENCY_SYMBOL + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return CURRENCY_SYMBOL + (n / 1e3).toFixed(1) + 'K';
  return CURRENCY_SYMBOL + Math.round(n);
};
