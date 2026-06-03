import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiQrCodeLine, RiShieldCheckLine, RiCheckLine, RiLoader4Line,
  RiSecurePaymentLine, RiArrowLeftLine, RiRefreshLine, RiBankCardLine,
} from 'react-icons/ri';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { fetchAccount } from '../../store/slices/accountSlice';
import { fetchTransactions } from '../../store/slices/transactionSlice';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · INSTANT UPI DEPOSIT
   Generates a dynamic single-use Razorpay UPI QR, renders it in a premium
   dark frame, then polls the backend until the secure webhook credits the
   balance — finishing with a sleek success animation + global balance refresh.
   Theme: matte-black #0d0e12 · charcoal surfaces · crimson #c8102e accents.
   ────────────────────────────────────────────────────────────────────────── */

const CRIMSON = '#c8102e';
const QUICK_ADD = [500, 1000, 5000];
const POLL_INTERVAL_MS = 4000;

// View phases: 'form' → 'qr' (awaiting payment) → 'success'
export default function DepositFunds() {
  const dispatch = useDispatch();
  const { account } = useSelector((s) => s.account);

  const [phase, setPhase] = useState('form');
  const [amount, setAmount] = useState('');
  const [generating, setGenerating] = useState(false);
  const [order, setOrder] = useState(null);          // { orderRef, qrId, image_url, amount }
  const [creditedAmount, setCreditedAmount] = useState(0);
  const [newBalance, setNewBalance] = useState(null);

  const pollRef = useRef(null);

  // Always make sure the account balance is loaded for the header.
  useEffect(() => {
    if (!account) dispatch(fetchAccount());
  }, [account, dispatch]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Clean up the polling timer when the component unmounts.
  useEffect(() => () => stopPolling(), [stopPolling]);

  const numericAmount = parseFloat(amount) || 0;

  const handleQuickAdd = (inc) => {
    setAmount((prev) => String((parseFloat(prev) || 0) + inc));
  };

  const handleAmountChange = (e) => {
    const v = e.target.value;
    // Allow only digits and a single decimal point.
    if (/^\d*\.?\d*$/.test(v)) setAmount(v);
  };

  // ── Poll the backend until the webhook credits the deposit ────────────────
  const startPolling = useCallback((orderRef) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/payments/status/${orderRef}`);
        if (data?.data?.status === 'paid') {
          stopPolling();
          setCreditedAmount(data.data.amount);
          setNewBalance(data.data.balance);
          setPhase('success');
          // Trigger a global Redux balance + ledger refresh.
          dispatch(fetchAccount());
          dispatch(fetchTransactions({ limit: 50, page: 1 }));
          toast.success('Funds credited to your account!');
        }
      } catch {
        // Transient polling failure — keep trying silently.
      }
    }, POLL_INTERVAL_MS);
  }, [dispatch, stopPolling]);

  // ── Generate the secure QR ─────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (numericAmount <= 0) { toast.error('Please enter a valid amount.'); return; }
    setGenerating(true);
    try {
      const { data } = await api.post('/payments/create-qr', { amount: numericAmount });
      const payload = data?.data;
      if (!payload?.image_url || !payload?.orderRef) {
        throw new Error('Malformed QR response');
      }
      setOrder(payload);
      setPhase('qr');
      startPolling(payload.orderRef);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Could not generate the payment QR. Please try again.';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  // ── Reset back to the amount form ──────────────────────────────────────────
  const handleReset = () => {
    stopPolling();
    setOrder(null);
    setCreditedAmount(0);
    setNewBalance(null);
    setAmount('');
    setPhase('form');
  };

  const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <div className="w-full max-w-full" style={{ background: '#0d0e12' }}>
      <div className="max-w-2xl mx-auto px-1 py-6 sm:py-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center border border-brand-500/30"
            style={{ background: 'rgba(200,16,46,0.12)', boxShadow: `0 0 22px ${CRIMSON}33` }}>
            <RiSecurePaymentLine className="text-2xl" style={{ color: '#ff3d52' }} />
          </div>
          <div>
            <h1 className="font-display font-bold text-white text-xl leading-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Add Money
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">Instant UPI top-up · credited in real time</p>
          </div>
          {account && (
            <div className="ml-auto text-right">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest">Balance</p>
              <p className="text-white font-semibold text-sm tabular-nums">
                {fmt(account.balance)}
              </p>
            </div>
          )}
        </div>

        {/* ── Main card ──────────────────────────────────────────────────── */}
        <div className="bg-[#15161c] border border-white/[0.06] rounded-3xl overflow-hidden"
          style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)' }}>

          <AnimatePresence mode="wait">

            {/* ── Phase 1: amount form ────────────────────────────────────── */}
            {phase === 'form' && (
              <motion.div key="form"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                className="p-6 sm:p-8">
                <label className="block text-slate-300 text-xs font-medium uppercase tracking-widest mb-3">
                  Deposit Amount
                </label>

                {/* Amount input */}
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-semibold text-slate-400">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0"
                    autoFocus
                    className="w-full bg-[#0d0e12] border border-white/[0.08] rounded-2xl pl-12 pr-5 py-5 text-3xl font-bold text-white outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 tabular-nums"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  />
                </div>

                {/* Quick-add chips */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {QUICK_ADD.map((inc) => (
                    <button key={inc} type="button" onClick={() => handleQuickAdd(inc)}
                      className="py-2.5 rounded-xl text-sm font-semibold text-slate-200 border border-white/[0.08] bg-white/[0.03] hover:border-brand-500/50 hover:text-white hover:bg-brand-500/10 transition-all active:scale-95">
                      +₹{inc.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>

                {/* Generate button */}
                <button type="button" onClick={handleGenerate} disabled={generating || numericAmount <= 0}
                  className="w-full mt-7 py-4 rounded-2xl font-semibold text-sm tracking-wide uppercase text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`, boxShadow: `0 0 28px ${CRIMSON}44` }}>
                  {generating
                    ? <><RiLoader4Line className="animate-spin text-lg" /> Generating…</>
                    : <><RiQrCodeLine className="text-lg" /> Generate Secure QR</>}
                </button>

                <div className="flex items-center justify-center gap-2 mt-5 text-slate-500 text-xs">
                  <RiShieldCheckLine style={{ color: '#ff3d52' }} />
                  <span>Payments are processed over an encrypted UPI network</span>
                </div>
              </motion.div>
            )}

            {/* ── Phase 2: live QR + waiting ──────────────────────────────── */}
            {phase === 'qr' && order && (
              <motion.div key="qr"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                className="p-6 sm:p-8 flex flex-col items-center text-center">

                <p className="text-slate-300 text-sm mb-1">
                  Scan to pay <span className="text-white font-bold">{fmt(order.amount)}</span>
                </p>
                <p className="text-slate-500 text-xs mb-6">Use any UPI app — GPay, PhonePe, Paytm or your bank app</p>

                {/* QR frame */}
                <motion.div
                  initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="relative rounded-3xl p-4 bg-white"
                  style={{ boxShadow: `0 0 40px ${CRIMSON}44, 0 18px 50px rgba(0,0,0,0.5)` }}>
                  <img
                    src={order.image_url}
                    alt="UPI payment QR code"
                    className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-xl"
                  />
                  {/* Crimson corner brackets */}
                  {['top-2 left-2 border-t-2 border-l-2', 'top-2 right-2 border-t-2 border-r-2',
                    'bottom-2 left-2 border-b-2 border-l-2', 'bottom-2 right-2 border-b-2 border-r-2'].map((c, i) => (
                    <div key={i} className={`absolute w-6 h-6 ${c} rounded-sm`} style={{ borderColor: CRIMSON }} />
                  ))}
                </motion.div>

                {/* Pulsing waiting state */}
                <div className="mt-7 w-full rounded-2xl border border-brand-500/25 px-5 py-4"
                  style={{ background: 'rgba(200,16,46,0.06)' }}>
                  <div className="flex items-center justify-center gap-3">
                    <motion.span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: CRIMSON }}
                      animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1], boxShadow: [`0 0 0 0 ${CRIMSON}66`, `0 0 0 8px ${CRIMSON}00`, `0 0 0 0 ${CRIMSON}00`] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <p className="text-sm font-medium" style={{ color: '#ff8090' }}>
                      Waiting for secure payment network confirmation…
                    </p>
                  </div>
                  <p className="text-slate-400 text-xs mt-1.5">Do not close this panel.</p>
                </div>

                <button type="button" onClick={handleReset}
                  className="mt-6 inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
                  <RiArrowLeftLine /> Cancel and change amount
                </button>
              </motion.div>
            )}

            {/* ── Phase 3: success ────────────────────────────────────────── */}
            {phase === 'success' && (
              <motion.div key="success"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-8 sm:p-10 flex flex-col items-center text-center">

                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                  className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
                  style={{ background: 'rgba(34,197,94,0.12)', border: '2px solid rgba(34,197,94,0.5)' }}>
                  <motion.div
                    initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 14 }}>
                    <RiCheckLine className="text-5xl text-green-400" />
                  </motion.div>
                </motion.div>

                <h2 className="font-display font-bold text-white text-2xl tracking-tight"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Deposit Successful
                </h2>
                <p className="text-green-400 font-semibold text-lg mt-1">{fmt(creditedAmount)} added</p>

                {newBalance != null && (
                  <div className="mt-6 w-full max-w-xs rounded-2xl border border-white/[0.06] bg-[#0d0e12] px-5 py-4 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-400 text-sm">
                      <RiBankCardLine /> Updated balance
                    </span>
                    <span className="text-white font-bold tabular-nums">{fmt(newBalance)}</span>
                  </div>
                )}

                <button type="button" onClick={handleReset}
                  className="w-full max-w-xs mt-7 py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase text-white flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`, boxShadow: `0 0 24px ${CRIMSON}44` }}>
                  <RiRefreshLine className="text-lg" /> Make Another Deposit
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer note */}
        <p className="text-center text-slate-600 text-[11px] mt-5">
          Powered by Razorpay UPI · Alister Bank holds funds in insured custody
        </p>
      </div>
    </div>
  );
}
