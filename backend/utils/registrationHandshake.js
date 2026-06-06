const crypto = require('crypto');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · REGISTRATION HANDSHAKE (HDFC-style ephemeral onboarding nonce)
   Issues a short-lived, single-use cryptographic tracking token (anti-CSRF
   registration nonce) that the multi-step "Open Account" wizard mints the
   moment its first step mounts. The client reflects it into the URL and echoes
   it back in the request headers when it fires the compiled form data, so the
   onboarding gateway can block replay / CSRF on the account-creation pipeline —
   mirroring enterprise banking "secure handshake" redirects.

   Kept in a DEDICATED in-memory store (separate from the login handshake) so
   onboarding and login nonces never collide. The token lives for minutes, is
   never a credential, and intentionally does NOT survive a restart (a fresh
   page load simply mints a new one). No DB schema change required.
   ────────────────────────────────────────────────────────────────────────── */

const TTL_MS = 10 * 60 * 1000; // 10 minutes — generous for a 5-step funnel
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
 * Issue a new registration handshake token bound to the requesting IP.
 * @param {string} ip
 * @returns {{ token: string, expiresIn: number }}
 */
function issueRegistrationHandshake(ip) {
  const token = crypto.randomBytes(32).toString('hex');
  store.set(token, { expiresAt: Date.now() + TTL_MS, ip: ip || null, used: false });
  return { token, expiresIn: Math.floor(TTL_MS / 1000) };
}

/**
 * Validate (and single-use consume) a registration handshake token.
 * Returns a reason code so the caller can message precisely.
 * @param {string} token
 * @param {string} ip
 * @returns {{ valid: boolean, reason?: 'missing'|'invalid'|'expired'|'used'|'ip_mismatch' }}
 */
function consumeRegistrationHandshake(token, ip) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' };

  // Cheap structural check first: the token is always 32 random bytes as hex
  // (64 lowercase hex chars). Anything else is malformed and can be rejected
  // before touching the store.
  if (!/^[a-f0-9]{64}$/.test(token)) return { valid: false, reason: 'invalid' };

  const meta = store.get(token);
  if (!meta) return { valid: false, reason: 'invalid' };
  if (meta.used) { store.delete(token); return { valid: false, reason: 'used' }; }
  if (Date.now() > meta.expiresAt) { store.delete(token); return { valid: false, reason: 'expired' }; }
  // IP binding (soft): only enforce when both IPs are known. Proxies can shift
  // the apparent IP, so a mismatch is treated as a replay signal here.
  if (meta.ip && ip && meta.ip !== ip) { store.delete(token); return { valid: false, reason: 'ip_mismatch' }; }

  // Single-use: consume immediately.
  store.delete(token);
  return { valid: true };
}

module.exports = { issueRegistrationHandshake, consumeRegistrationHandshake, TTL_MS };
