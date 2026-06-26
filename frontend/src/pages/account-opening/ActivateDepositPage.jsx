import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  RiBankLine, RiShieldCheckLine, RiCheckLine, RiLoader4Line,
  RiBankCardLine, RiLock2Line, RiFlaskLine,
} from 'react-icons/ri';
import toast from 'react-hot-toast';
import api from '../../services/api';
import BackToHome from '../../components/common/BackToHome';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · ACTIVATION DEPOSIT (SANDBOX / SIMULATION)
   Onboarding step shown after Video KYC approval. The user is asked to deposit
   the minimum balance to activate their account. THIS IS A SIMULATION — no real
   payment is processed and no card is charged. A deposit is only accepted when
   the entered card matches the admin-managed sandbox allow-list.
   ────────────────────────────────────────────────────────────────────────── */

const CRIMSON = '#c8102e';
const PAGE_BG = { background: 'linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 50%, #2D0000 100%)' };

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Group a card number into 4-digit blocks for display.
const groupCard = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();

export default function ActivateDepositPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [phase, setPhase] = useState('loading'); // loading | invalid | form | done
  const [info, setInfo] = useState(null);        // { accountNumber, holderName, minimumDeposit }
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const [card, setCard] = useState({ cardNumber: '', cardHolder: '', expiry: '', cvv: '' });
  const [amount, setAmount] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) { setPhase('invalid'); return; }
      try {
        const { data } = await api.get(`/account/activation-deposit/verify/${token}`);
        if (!active) return;
        const d = data?.data;
        setInfo(d);
        setAmount(String(d?.minimumDeposit ?? ''));
        if (d?.alreadyDeposited) { setPhase('done'); setResult({ alreadyDeposited: true }); }
        else setPhase('form');
      } catch (err) {
        if (!active) return;
        setPhase('invalid');
        toast.error(err.response?.data?.message || 'This activation link is invalid or expired.');
      }
    })();
    return () => { active = false; };
  }, [token]);

  const setExpiry = (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 3) v = `${v.slice(0, 2)}/${v.slice(2)}`;
    setCard((c) => ({ ...c, expiry: v }));
  };

  const submit = async () => {
    const digits = card.cardNumber.replace(/\D/g, '');
    if (digits.length < 12) { toast.error('Enter a valid card number.'); return; }
    if (!card.cardHolder.trim()) { toast.error('Enter the cardholder name.'); return; }
    if (!/^\d{2}\/\d{2}$/.test(card.expiry)) { toast.error('Enter a valid expiry (MM/YY).'); return; }
    if (!/^\d{3,4}$/.test(card.cvv)) { toast.error('Enter a valid CVV.'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt < (info?.minimumDeposit || 0)) {
      toast.error(`Minimum activation deposit is ${fmt(info?.minimumDeposit)}.`);
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/account/activation-deposit/submit', {
        token,
        cardNumber: digits,
        cardHolder: card.cardHolder.trim(),
        expiry: card.expiry,
        cvv: card.cvv,
        amount: amt,
      });
      setResult(data?.data || {});
      setPhase('done');
      toast.success('Activation deposit received!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not process your activation deposit.');
    } finally {
      setSubmitting(false);
    }
  };

  // Reusable trust/sandbox banner.
  const SandboxBadge = (
    <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium"
      style={{ background: 'rgba(245,196,81,0.12)', border: '1px solid rgba(245,196,81,0.35)', color: '#f5c451' }}>
      <RiFlaskLine /> Sandbox / Simulation — no real payment is processed
    </div>
  );

  return (
    <div className="min-h-screen py-10 px-4 relative" style={PAGE_BG}>
      <BackToHome />
      <div className="relative z-[1] max-w-lg mx-auto">

        {/* Brand */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 18px rgba(204,0,0,0.4)' }}>
            <RiBankLine className="text-white text-xl" />
          </div>
          <p className="font-bold text-white tracking-wide text-lg">ALISTER BANK</p>
        </div>

        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-24 text-white/70">
            <RiLoader4Line className="animate-spin text-3xl mb-3" style={{ color: '#ff3d52' }} />
            Verifying your activation link…
          </div>
        )}

        {phase === 'invalid' && (
          <div className="rounded-[20px] p-8 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderTop: '2px solid rgba(204,0,0,0.5)' }}>
            <h2 className="text-xl font-bold text-white mb-2">Activation link invalid</h2>
            <p className="text-white/50 text-sm mb-6">This activation link is invalid or has expired. Please contact support for a new one.</p>
            <Link to="/login" className="inline-block px-6 py-3 rounded-xl text-white font-semibold text-sm"
              style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)` }}>Go to Login</Link>
          </div>
        )}

        {phase === 'form' && info && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-[20px] overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderTop: '2px solid rgba(204,0,0,0.5)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>

            <div className="p-6 sm:p-8">
              <div className="text-center mb-5">
                <h1 className="text-xl sm:text-2xl font-bold text-white">Activate Your Account</h1>
                <p className="text-white/50 text-sm mt-1">Deposit the minimum balance to activate your account.</p>
                <div className="mt-3 flex justify-center">{SandboxBadge}</div>
              </div>

              {/* Destination account card — which account is being funded */}
              <div className="rounded-2xl p-5 mb-6 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #c8102e 0%, #8b0000 55%, #3d0010 100%)' }}>
                <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/[0.05]" />
                <p className="text-white/70 text-[11px] uppercase tracking-widest">Funding Account</p>
                <p className="text-white font-mono text-lg tracking-widest mt-1">{info.accountNumber}</p>
                <div className="flex items-end justify-between mt-4">
                  <div>
                    <p className="text-white/50 text-[10px] uppercase tracking-widest">Account Holder</p>
                    <p className="text-white text-sm font-medium uppercase tracking-wide">{info.holderName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/50 text-[10px] uppercase tracking-widest">Min. Deposit</p>
                    <p className="text-white text-sm font-semibold">{fmt(info.minimumDeposit)}</p>
                  </div>
                </div>
              </div>

              {/* Card section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
                  <RiBankCardLine style={{ color: '#ff3d52' }} /> Pay with Credit Card
                </div>

                <div>
                  <label className="block text-white/50 text-xs mb-1.5">Card Number</label>
                  <input value={card.cardNumber} onChange={(e) => setCard((c) => ({ ...c, cardNumber: groupCard(e.target.value) }))}
                    inputMode="numeric" placeholder="1234 5678 9012 3456"
                    className="w-full bg-[#0d0e12] border border-white/[0.1] rounded-xl px-4 py-3 text-white tracking-widest outline-none focus:border-brand-500 font-mono" />
                </div>

                <div>
                  <label className="block text-white/50 text-xs mb-1.5">Cardholder Name</label>
                  <input value={card.cardHolder} onChange={(e) => setCard((c) => ({ ...c, cardHolder: e.target.value }))}
                    placeholder="Name on card"
                    className="w-full bg-[#0d0e12] border border-white/[0.1] rounded-xl px-4 py-3 text-white outline-none focus:border-brand-500" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/50 text-xs mb-1.5">Expiry (MM/YY)</label>
                    <input value={card.expiry} onChange={setExpiry} inputMode="numeric" placeholder="MM/YY"
                      className="w-full bg-[#0d0e12] border border-white/[0.1] rounded-xl px-4 py-3 text-white outline-none focus:border-brand-500 font-mono" />
                  </div>
                  <div>
                    <label className="block text-white/50 text-xs mb-1.5">CVV</label>
                    <input value={card.cvv} onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                      inputMode="numeric" placeholder="•••" type="password"
                      className="w-full bg-[#0d0e12] border border-white/[0.1] rounded-xl px-4 py-3 text-white outline-none focus:border-brand-500 font-mono" />
                  </div>
                </div>

                <div>
                  <label className="block text-white/50 text-xs mb-1.5">Deposit Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50">₹</span>
                    <input value={amount} onChange={(e) => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) setAmount(v); }}
                      inputMode="decimal"
                      className="w-full bg-[#0d0e12] border border-white/[0.1] rounded-xl pl-8 pr-4 py-3 text-white outline-none focus:border-brand-500 tabular-nums" />
                  </div>
                  <p className="text-white/40 text-[11px] mt-1">Minimum {fmt(info.minimumDeposit)} required to activate.</p>
                </div>

                <button onClick={submit} disabled={submitting}
                  className="w-full mt-2 py-3.5 rounded-xl font-semibold text-sm tracking-wide uppercase text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`, boxShadow: `0 0 24px ${CRIMSON}44` }}>
                  {submitting ? <><RiLoader4Line className="animate-spin text-lg" /> Processing…</> : <><RiLock2Line /> Deposit {fmt(parseFloat(amount) || 0)} & Activate</>}
                </button>

                <div className="flex items-center justify-center gap-2 mt-2 text-white/40 text-xs">
                  <RiShieldCheckLine style={{ color: '#ff3d52' }} />
                  <span>Encrypted onboarding · Simulated sandbox environment</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-[20px] p-8 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderTop: '2px solid rgba(34,197,94,0.5)' }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: 'rgba(34,197,94,0.12)', border: '2px solid rgba(34,197,94,0.5)' }}>
              <RiCheckLine className="text-4xl text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">
              {result?.alreadyDeposited ? 'Already Activated' : 'Activation Deposit Received'}
            </h2>
            {!result?.alreadyDeposited && result?.credited != null && (
              <p className="text-green-400 font-semibold text-lg">{fmt(result.credited)} credited</p>
            )}
            <p className="text-white/50 text-sm mt-3 mb-2">
              Your account setup link will arrive in your email shortly (about a minute). Use it to set your username, password and security PIN.
            </p>
            <div className="mt-4 flex justify-center">{SandboxBadge}</div>
            <Link to="/login" className="inline-block mt-6 px-6 py-3 rounded-xl text-white font-semibold text-sm"
              style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)` }}>Go to Login</Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
