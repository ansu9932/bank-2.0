import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { RiEyeLine, RiEyeOffLine, RiBankLine, RiLockLine, RiUserLine, RiShieldCheckLine } from 'react-icons/ri';
import { login, clearError } from '../../store/slices/authSlice';
import api from '../../services/api';
import toast from 'react-hot-toast';
import useEntryPageGuard from '../../hooks/useEntryPageGuard';

// Absolute lifespan of the login screen, mirroring the backend login handshake
// TTL (exactly 10 minutes). If the page sits open/idle past this window, the
// handshake the user holds is already dead server-side, so we proactively wipe
// state and bounce to the public homepage.
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector(s => s.auth);
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  // HDFC-style ephemeral handshake token. Fetched on mount, mirrored into the
  // URL as ?h=, and echoed back on submit so the backend can block replays.
  const [handshakeToken, setHandshakeToken] = useState('');
  const fetchedRef = useRef(false);
  // Wall-clock moment the handshake initialized; drives the idle-expiry timer.
  const handshakeStartRef = useRef(0);

  // Navigation guard: wipe credentials/temp state if the user leaves the login
  // page, and redirect to the homepage on a non-whitelisted exit.
  const { allowNavigation, runCleanup } = useEntryPageGuard({
    resetState: () => { setForm({ username: '', password: '' }); setShowPwd(false); },
  });

  // ── Secure handshake bootstrap ───────────────────────────────────────────
  // Mint a short-lived state token, then reflect it in the address bar so the
  // login gateway behaves like an enterprise SSO redirect handshake.
  const initHandshake = async () => {
    try {
      const { data } = await api.get('/auth/login-handshake');
      const token = data?.data?.handshakeToken;
      if (token) {
        setHandshakeToken(token);
        handshakeStartRef.current = Date.now();
        const url = new URL(window.location.href);
        url.searchParams.set('h', token);
        window.history.replaceState({}, '', url);
      }
    } catch {
      // Non-fatal: surfaced on submit if still missing.
      setHandshakeToken('');
    }
  };

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    initHandshake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Idle / expiry watchdog ─────────────────────────────────────────────────
  // Poll elapsed time since the handshake initialized. Once the 10-minute login
  // window is exceeded, forcefully break the active state: clear the in-memory
  // form + transient storage/tokens, then redirect to the public homepage.
  useEffect(() => {
    const id = setInterval(() => {
      const startedAt = handshakeStartRef.current;
      if (startedAt && Date.now() - startedAt > LOGIN_WINDOW_MS) {
        clearInterval(id);
        runCleanup();            // reset form + wipe session/local storage + cookies
        setHandshakeToken('');
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('h');
          window.history.replaceState({}, '', url);
        } catch { /* ignore */ }
        toast.error('Your secure login session expired. Redirecting to home…');
        window.location.replace('/');
      }
    }, 15 * 1000); // check every 15s — cheap, and well within the 10-min window
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) { toast.error(error); dispatch(clearError()); }
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) { toast.error('Please fill all fields'); return; }
    // Prefer in-state token; fall back to the URL param if state was reset.
    const tokenFromUrl = new URLSearchParams(window.location.search).get('h');
    const hToken = handshakeToken || tokenFromUrl || '';
    if (!hToken) {
      toast.error('Secure session not ready. Refreshing…');
      await initHandshake();
      return;
    }
    const result = await dispatch(login({ ...form, handshakeToken: hToken }));
    if (login.fulfilled.match(result)) {
      allowNavigation(); // sanctioned success exit → no redirect-home
      toast.success('Welcome back!');
      navigate('/dashboard');
    } else {
      // Handshake is single-use; on any failure mint a fresh one for the retry.
      initHandshake();
    }
  };

  return (
    <div className="min-h-screen flex bg-dark-900 overflow-hidden">
      {/* Left — branding panel */}
      <motion.div
        initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
        className="hidden lg:flex flex-col justify-between w-[480px] bg-dark-800 border-r border-white/[0.05] p-12 relative overflow-hidden flex-shrink-0"
      >
        {/* Background decorations */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-brand-500/5 blur-3xl" />

        {/* Logo */}
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-11 h-11 rounded-2xl bg-brand-500 flex items-center justify-center shadow-glow">
              <RiBankLine className="text-white text-2xl" />
            </div>
            <div>
              <p className="font-display font-700 text-white text-xl tracking-wide">ALISTER BANK</p>
              <p className="text-dark-300 text-xs tracking-widest uppercase">Digital Banking</p>
            </div>
          </div>

          <h1 className="font-display text-4xl font-700 text-white leading-tight mb-4">
            Banking that<br />
            <span className="text-gradient-red">works for you.</span>
          </h1>
          <p className="text-dark-200 text-base leading-relaxed">
            Secure, modern digital banking with real-time transactions, instant transfers, and powerful financial insights.
          </p>
        </div>

        {/* Features */}
        <div className="space-y-4">
          {[
            { icon: '🔒', label: 'Bank-grade 256-bit encryption' },
            { icon: '⚡', label: 'Instant IMPS/NEFT/RTGS transfers' },
            { icon: '📊', label: 'Smart spending analytics' },
            { icon: '🌍', label: 'International banking standards' },
          ].map((f, i) => (
            <motion.div
              key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="flex items-center gap-3"
            >
              <span className="text-lg">{f.icon}</span>
              <p className="text-dark-200 text-sm">{f.label}</p>
            </motion.div>
          ))}
        </div>

        <p className="text-dark-400 text-xs">© 2024 Alister Bank. IFSC: ALST0000001 · SWIFT: ALSTINBB</p>
      </motion.div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
              <RiBankLine className="text-white text-lg" />
            </div>
            <p className="font-display font-700 text-white text-lg">ALISTER BANK</p>
          </div>

          <div className="glass-card p-8">
            <div className="mb-7">
              <h2 className="font-display text-2xl font-700 text-white mb-1">Welcome back</h2>
              <p className="text-dark-200 text-sm">Sign in to your account to continue</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">Username or Email</label>
                <div className="relative">
                  <RiUserLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300 text-base" />
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    placeholder="Enter username or email"
                    className="input-field pl-10"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Password</label>
                <div className="relative">
                  <RiLockLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300 text-base" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Enter your password"
                    className="input-field pl-10 pr-10"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-dark-300 hover:text-white transition-colors">
                    {showPwd ? <RiEyeOffLine /> : <RiEyeLine />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                
                <Link to="/forgot-password" className="text-brand-400 hover:text-brand-300 text-sm transition-colors">
                  Forgot password?
                </Link>
              </div>

              {/* Cloudflare Turnstile removed — direct submission to core endpoints. */}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 mt-2">
                {loading ? <><div className="spinner w-4 h-4" /> Signing in...</> : 'Sign In'}
              </button>
            </form>

            <div className="mt-5 text-center">
              <p className="text-dark-300 text-sm">
                Don't have an account?{' '}
                <Link to="/open-account" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                  Open Account
                </Link>
              </p>
            </div>
          </div>

          {/* Security note */}
          <div className="flex items-center justify-center gap-2 mt-6 text-dark-400 text-xs">
            <RiShieldCheckLine className="text-brand-500 text-base" />
            <span>Your connection is encrypted with bank-grade TLS security</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
