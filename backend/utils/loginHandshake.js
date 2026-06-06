const crypto = require('crypto');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · LOGIN HANDSHAKE (HDFC-style ephemeral SSO nonce)
   Issues a short-lived, single-use cryptographic state token that the client
   must echo back with the credential payload. The token is bound to the
   client IP and expires quickly, blocking session replay / CSRF on the login
   gateway — mirroring enterprise banking "secure handshake" redirects.

   Stored in-memory only: the token is meant to live for seconds, is never a
   credential, and intentionally does NOT survive a restart (a fresh page load
   simply mints a new one). This avoids any DB schema change.
   ────────────────────────────────────────────────────────────────────────── */

const TTL_MS = 5 * 60 * 1000; // 5 minutes — generous for slow form fills
const store = new Map(); // token -> { expiresAt, ip, used }

/** Drop expired/used entries so the map can't grow unbounded. */
function sweep() {
  const now = Date.now();
  for (const [token, meta] of store.entries()) {
    if (meta.used || now > meta.expiresAt) store.delete(token);
  }
}

// Periodic cleanup; unref so it never keeps the process alive on shutdown.
const sweepTimer = setInterval(sweep, 60 * 1000);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

/**
 * Issue a new handshake token bound to the requesting IP.
 * @param {string} ip
 * @param {string} [purpose='login'] Namespace so a login nonce can't be replayed
 *   as a registration nonce (and vice-versa).
 * @returns {{ token: string, expiresIn: number }}
 */
function issueHandshake(ip, purpose = 'login') {
  const token = crypto.randomBytes(32).toString('hex');
  store.set(token, { expiresAt: Date.now() + TTL_MS, ip: ip || null, used: false, purpose });
  return { token, expiresIn: Math.floor(TTL_MS / 1000) };
}

/**
 * Validate (and single-use consume) a handshake token.
 * Returns a reason code so the caller can message precisely.
 * @param {string} token
 * @param {string} ip
 * @param {string} [purpose='login'] Must match the purpose the token was issued
 *   for; a mismatch is treated as an invalid token.
 * @returns {{ valid: boolean, reason?: 'missing'|'invalid'|'expired'|'used'|'ip_mismatch' }}
 */
function consumeHandshake(token, ip, purpose = 'login') {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' };

  const meta = store.get(token);
  if (!meta) return { valid: false, reason: 'invalid' };
  // Cross-purpose replay protection (e.g. a login token submitted to onboarding).
  if ((meta.purpose || 'login') !== purpose) { store.delete(token); return { valid: false, reason: 'invalid' }; }
  if (meta.used) { store.delete(token); return { valid: false, reason: 'used' }; }
  if (Date.now() > meta.expiresAt) { store.delete(token); return { valid: false, reason: 'expired' }; }
  // IP binding (soft): only enforce when both IPs are known. Proxies can shift
  // the apparent IP, so a mismatch is treated as a replay signal here.
  if (meta.ip && ip && meta.ip !== ip) { store.delete(token); return { valid: false, reason: 'ip_mismatch' }; }

  // Single-use: consume immediately.
  store.delete(token);
  return { valid: true };
}

module.exports = { issueHandshake, consumeHandshake, TTL_MS };
