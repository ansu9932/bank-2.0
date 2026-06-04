import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import {
  RiSendPlaneLine, RiCheckDoubleLine, RiArrowLeftLine, RiInformationLine,
  RiBankLine, RiSmartphoneLine, RiShieldCheckLine, RiLoader4Line,
  RiTimer2Line, RiCheckLine, RiErrorWarningLine, RiWallet3Line,
} from 'react-icons/ri';
import api from '../../services/api';
import { fetchAccount } from '../../store/slices/accountSlice';
import toast from 'react-hot-toast';

const CRIMSON = '#c8102e';

// RTGS removed per product spec. UPI added as a first-class rail.
const MODES = [
  { value: 'IMPS', label: 'IMPS', desc: 'Instant · 24/7 · Up to ₹2L', kind: 'bank', icon: RiBankLine },
  { value: 'NEFT', label: 'NEFT', desc: 'Batch settled · Any amount', kind: 'bank', icon: RiBankLine },
  { value: 'UPI', label: 'UPI Transfer', desc: 'Instant · Pay to any UPI ID', kind: 'upi', icon: RiSmartphoneLine },
];

// Structural VPA check used to gate the debounced lookup.
const VPA_REGEX = /^[\w.\-]{2,}@[a-zA-Z][\w.\-]{1,}$/;
const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function TransferPage() {
  const dispatch = useDispatch();
  const { account } = useSelector((s) => s.account);

  const [step, setStep] = useState('form'); // form | confirm | success
  const [mode, setMode] = useState('IMPS');
  const [form, setForm] = useState({
    beneficiaryName: '', accountNumber: '', confirmAccountNumber: '',
    ifsc: '', vpa: '', amount: '', description: '', securityPin: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // ── Daily transfer-limit state (matte-black header chip) ──────────────────
  const [limitInfo, setLimitInfo] = useState(null); // { dailyTransferLimit, usedDailyLimit, remaining }

  // ── Real-time UPI provider lookup state ───────────────────────────────────
  const [vpaStatus, setVpaStatus] = useState('idle'); // idle | checking | verified | invalid
  const [vpaProvider, setVpaProvider] = useState('');
  const vpaDebounceRef = useRef(null);

  const isUpi = mode === 'UPI';

  const loadLimit = useCallback(async () => {
    try {
      const { data } = await api.get('/payments/transfer-limit');
      setLimitInfo(data.data);
    } catch {
      // Fall back to the account slice values if the endpoint is unavailable.
      if (account?.daily_transfer_limit != null) {
        const limit = parseFloat(account.daily_transfer_limit);
        const used = parseFloat(account.daily_transferred || 0);
        setLimitInfo({ dailyTransferLimit: limit, usedDailyLimit: used, remaining: Math.max(limit - used, 0) });
      }
    }
  }, [account]);

  useEffect(() => {
    dispatch(fetchAccount());
    loadLimit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // ── Debounced UPI provider lookup (400ms) ─────────────────────────────────
  const onVpaChange = (e) => {
    const value = e.target.value.trim();
    setForm((f) => ({ ...f, vpa: value }));
    setVpaProvider('');

    if (vpaDebounceRef.current) clearTimeout(vpaDebounceRef.current);

    if (!VPA_REGEX.test(value)) {
      setVpaStatus('idle');
      return;
    }
    setVpaStatus('checking');
    vpaDebounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/payments/lookup-upi-provider', { vpa: value });
        if (data?.data?.verifiedProvider) {
          setVpaStatus('verified');
          setVpaProvider(data.data.verifiedProvider);
        } else {
          setVpaStatus('invalid');
        }
      } catch {
        setVpaStatus('invalid');
      }
    }, 400);
  };

  // Clean up the debounce timer on unmount.
  useEffect(() => () => { if (vpaDebounceRef.current) clearTimeout(vpaDebounceRef.current); }, []);

  const switchMode = (m) => {
    setMode(m);
    setVpaStatus('idle');
    setVpaProvider('');
  };

  const validateForm = () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return false; }
    if (account && amount > parseFloat(account.available_balance || 0)) {
      toast.error('Insufficient balance'); return false;
    }
    if (limitInfo && amount > limitInfo.remaining) {
      toast.error(`Exceeds remaining daily limit (${fmtINR(limitInfo.remaining)})`); return false;
    }
    if (isUpi) {
      if (!VPA_REGEX.test(form.vpa)) { toast.error('Enter a valid UPI ID (e.g. username@okaxis)'); return false; }
    } else {
      if (!form.beneficiaryName) { toast.error('Beneficiary name is required'); return false; }
      if (!form.accountNumber) { toast.error('Account number is required'); return false; }
      if (form.accountNumber !== form.confirmAccountNumber) { toast.error('Account numbers do not match'); return false; }
      if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(form.ifsc.trim())) { toast.error('Enter a valid IFSC code'); return false; }
    }
    return true;
  };

  const handleReview = () => {
    if (!validateForm()) return;
    setStep('confirm');
  };

  const handleSubmit = async () => {
    if (!form.securityPin || form.securityPin.length !== 4) {
      toast.error('Enter your 4-digit security PIN'); return;
    }
    setSubmitting(true);
    try {
      const payload = {
        mode,
        amount: parseFloat(form.amount),
        description: form.description,
        securityPin: form.securityPin,
        ...(isUpi
          ? { vpa: form.vpa.trim(), beneficiaryName: form.beneficiaryName || 'UPI Beneficiary' }
          : {
            beneficiaryName: form.beneficiaryName,
            accountNumber: form.accountNumber,
            confirmAccountNumber: form.confirmAccountNumber,
            ifsc: form.ifsc.trim().toUpperCase(),
          }),
      };
      const { data } = await api.post('/payments/disburse-payout', payload);
      setResult(data.data);
      setStep('success');
      dispatch(fetchAccount());
      loadLimit();
      toast.success(data.message || 'Transfer submitted');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Transfer failed. Please try again.');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setForm({
      beneficiaryName: '', accountNumber: '', confirmAccountNumber: '',
      ifsc: '', vpa: '', amount: '', description: '', securityPin: '',
    });
    setResult(null);
    setVpaStatus('idle');
    setVpaProvider('');
    setMode('IMPS');
    setStep('form');
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'success' && result) {
    const isPending = result.status === 'pending_settlement';
    return (
      <div className="max-w-md mx-auto">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="glass-card p-10 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 border-2 ${
              isPending ? 'bg-amber-500/10 border-amber-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
              {isPending
                ? <RiTimer2Line className="text-amber-400 text-4xl" />
                : <RiCheckDoubleLine className="text-green-400 text-4xl" />}
            </div>
          </motion.div>
          <h2 className="font-display text-2xl font-700 text-white mb-2">
            {isPending ? 'NEFT Transfer Initiated' : 'Transfer Successful!'}
          </h2>
          <p className="text-dark-200 text-sm mb-4">
            {fmtINR(result.amount)} {isPending ? 'is processing and will settle shortly.' : 'sent successfully.'}
          </p>
          <div className="bg-dark-700/50 rounded-xl p-4 mb-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-dark-300">Reference</span>
              <span className="text-white font-mono text-xs">{result.referenceNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-dark-300">Mode</span>
              <span className="text-white font-medium">{result.mode}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-dark-300">Status</span>
              <span className={isPending ? 'text-amber-400 font-medium' : 'text-green-400 font-medium'}>
                {isPending ? 'Pending Settlement' : 'Completed'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-dark-300">New Balance</span>
              <span className="text-white font-bold">{fmtINR(result.balance)}</span>
            </div>
          </div>
          <button onClick={resetAll} className="btn-primary w-full justify-center">New Transfer</button>
        </motion.div>
      </div>
    );
  }

  const remaining = limitInfo?.remaining ?? null;
  const dailyLimit = limitInfo?.dailyTransferLimit ?? (account ? parseFloat(account.daily_transfer_limit || 0) : null);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header + matte-black daily-limit statistics container */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Transfer Money</h1>
          <p className="text-dark-300 text-sm mt-0.5">Send money via IMPS, NEFT, or UPI</p>
        </div>
        {dailyLimit != null && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl px-4 py-2.5 border"
            style={{ background: '#0d0e12', borderColor: 'rgba(200,16,46,0.35)', boxShadow: `0 0 18px ${CRIMSON}22` }}>
            <div className="flex items-center gap-2">
              <RiWallet3Line style={{ color: CRIMSON }} />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-dark-300">Daily Transfer Limit</p>
                <p className="text-white font-bold text-sm tabular-nums">
                  {fmtINR(dailyLimit)}
                  <span className="text-dark-400 font-normal">
                    {limitInfo?.usedDailyLimit != null ? '' : ' (Default)'}
                  </span>
                </p>
                {remaining != null && (
                  <p className="text-[11px] mt-0.5" style={{ color: '#ff6b81' }}>
                    {fmtINR(remaining)} remaining today
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="glass-card p-6">
        <AnimatePresence mode="wait">
          {step === 'form' && (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Mode tabs */}
              <div className="mb-5">
                <label className="form-label">Transfer Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {MODES.map((m) => {
                    const Icon = m.icon;
                    const active = mode === m.value;
                    return (
                      <button key={m.value} type="button" onClick={() => switchMode(m.value)}
                        className={`p-3 rounded-xl border transition-all text-left ${active ? 'border-brand-500 bg-brand-500/10' : 'border-white/[0.08] hover:border-white/20'}`}>
                        <Icon className={active ? 'text-brand-400' : 'text-dark-300'} />
                        <p className={`text-sm font-bold mt-1 ${active ? 'text-brand-400' : 'text-white'}`}>{m.label}</p>
                        <p className="text-dark-400 text-[10px] mt-0.5 leading-tight">{m.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* UPI tab */}
              {isUpi ? (
                <div className="mb-4">
                  <label className="form-label">Enter UPI ID / VPA</label>
                  <input type="text" value={form.vpa} onChange={onVpaChange}
                    placeholder="e.g. username@okaxis" className="input-field" autoComplete="off" />
                  {/* Real-time provider feedback */}
                  <div className="min-h-[22px] mt-1.5">
                    {vpaStatus === 'checking' && (
                      <p className="text-dark-300 text-xs flex items-center gap-1.5">
                        <RiLoader4Line className="animate-spin" /> Looking up provider…
                      </p>
                    )}
                    {vpaStatus === 'verified' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                        <RiCheckLine /> {vpaProvider}
                      </span>
                    )}
                    {vpaStatus === 'invalid' && (
                      <p className="text-xs flex items-center gap-1.5" style={{ color: '#ff6b81' }}>
                        <RiErrorWarningLine /> Could not resolve this UPI ID.
                      </p>
                    )}
                  </div>
                  {/* Optional beneficiary name for UPI */}
                  <div className="mt-3">
                    <label className="form-label">Beneficiary Name (optional)</label>
                    <input type="text" value={form.beneficiaryName} onChange={set('beneficiaryName')}
                      placeholder="Name to label this payout" className="input-field" />
                  </div>
                </div>
              ) : (
                /* Bank tabs (IMPS / NEFT) */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="sm:col-span-2">
                    <label className="form-label">Beneficiary Name</label>
                    <input type="text" value={form.beneficiaryName} onChange={set('beneficiaryName')}
                      placeholder="Full name as per bank" className="input-field" />
                  </div>
                  <div>
                    <label className="form-label">Bank Account Number</label>
                    <input type="text" value={form.accountNumber} onChange={set('accountNumber')}
                      placeholder="Recipient account number" className="input-field" autoComplete="off" />
                  </div>
                  <div>
                    <label className="form-label">Confirm Account Number</label>
                    <input type="text" value={form.confirmAccountNumber} onChange={set('confirmAccountNumber')}
                      placeholder="Re-enter account number" className="input-field" autoComplete="off"
                      onPaste={(e) => e.preventDefault()} />
                    {form.confirmAccountNumber && form.accountNumber !== form.confirmAccountNumber && (
                      <p className="text-xs mt-1" style={{ color: '#ff6b81' }}>Account numbers do not match</p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="form-label">IFSC Code</label>
                    <input type="text" value={form.ifsc} onChange={set('ifsc')}
                      placeholder="HDFC0001234" className="input-field uppercase" />
                  </div>
                </div>
              )}

              {/* Amount + description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="form-label">Amount (₹)</label>
                  <input type="number" value={form.amount} onChange={set('amount')}
                    placeholder="0.00" min="1" className="input-field" />
                  {account && (
                    <p className="text-dark-400 text-xs mt-1">
                      Available: {fmtINR(account.available_balance)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label">Description / Narration</label>
                  <input type="text" value={form.description} onChange={set('description')}
                    placeholder="Optional note" className="input-field" maxLength={30} />
                </div>
              </div>

              <button onClick={handleReview} className="btn-primary w-full py-3.5">
                <RiSendPlaneLine /> Review Transfer
              </button>
            </motion.div>
          )}

          {step === 'confirm' && (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <h3 className="text-white font-semibold text-lg mb-5">Confirm Transfer</h3>
              <div className="space-y-0 rounded-2xl overflow-hidden border border-white/[0.06]">
                {(isUpi
                  ? [
                    { label: 'UPI ID', value: form.vpa },
                    { label: 'Provider', value: vpaProvider || 'UPI' },
                    { label: 'Mode', value: 'UPI' },
                    { label: 'Description', value: form.description || 'Transfer' },
                  ]
                  : [
                    { label: 'Beneficiary', value: form.beneficiaryName },
                    { label: 'Account', value: form.accountNumber },
                    { label: 'IFSC', value: form.ifsc.toUpperCase() },
                    { label: 'Mode', value: mode },
                    { label: 'Description', value: form.description || 'Transfer' },
                  ]
                ).map(({ label, value }) => (
                  <div key={label} className="flex justify-between px-4 py-3.5 border-b border-white/[0.05] last:border-0">
                    <span className="text-dark-300 text-sm">{label}</span>
                    <span className="text-white text-sm font-medium text-right break-all ml-3">{value}</span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-4 bg-brand-500/10">
                  <span className="text-white font-bold">Amount</span>
                  <span className="font-bold text-xl" style={{ color: '#ff4060' }}>
                    {fmtINR(form.amount)}
                  </span>
                </div>
              </div>

              {/* Security PIN */}
              <div className="bg-dark-700/50 rounded-xl p-4 my-5">
                <label className="form-label">Security PIN</label>
                <input type="password" inputMode="numeric" maxLength={4} value={form.securityPin}
                  onChange={set('securityPin')} placeholder="Enter 4-digit PIN" className="input-field" />
                <p className="text-dark-400 text-xs mt-1.5 flex items-center gap-1">
                  <RiShieldCheckLine /> Your PIN authorizes this transfer
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('form')} disabled={submitting}
                  className="btn-secondary flex-1 justify-center">
                  <RiArrowLeftLine /> Edit
                </button>
                <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex-1 justify-center">
                  {submitting ? <><RiLoader4Line className="animate-spin" /> Processing…</> : <><RiSendPlaneLine /> Confirm Transfer</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer note */}
      <p className="text-center text-dark-400 text-[11px] flex items-center justify-center gap-1.5">
        <RiInformationLine /> Powered by RazorpayX Payroll · Funds are held in insured custody
      </p>
    </div>
  );
}
