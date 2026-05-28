import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import {
  RiSendPlaneLine, RiCheckDoubleLine, RiArrowLeftLine,
  RiBankLine, RiGroupLine, RiInformationLine,
} from 'react-icons/ri';
import { initiateTransfer, clearTransferState, fetchBeneficiaries } from '../../store/slices/transactionSlice';
import { fetchAccount } from '../../store/slices/accountSlice';
import toast from 'react-hot-toast';

const MODES = [
  { value: 'IMPS', label: 'IMPS', desc: 'Instant · 24/7 · Up to ₹2L' },
  { value: 'NEFT', label: 'NEFT', desc: 'Batch · 30 min · Any amount' },
  { value: 'RTGS', label: 'RTGS', desc: 'Real-time · Min ₹2L' },
  { value: 'INTERNAL', label: 'Own Bank', desc: 'Instant · Alister Bank' },
];

export default function TransferPage() {
  const dispatch = useDispatch();
  const { beneficiaries, transferLoading, lastTransfer, error } = useSelector(s => s.transaction);
  const { account } = useSelector(s => s.account);
  const [step, setStep] = useState('form'); // form | confirm | success
  const [form, setForm] = useState({
    toAccountNumber: '', toAccountName: '', toBankName: '',
    toIfsc: '', amount: '', transferMode: 'IMPS',
    description: '', securityPin: '', scheduledAt: '',
  });
  const [showBeneficiaries, setShowBeneficiaries] = useState(false);

  useEffect(() => {
    dispatch(fetchBeneficiaries());
    return () => dispatch(clearTransferState());
  }, []);

  useEffect(() => {
    if (lastTransfer) setStep('success');
  }, [lastTransfer]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleConfirm = () => {
    if (!form.toAccountNumber) { toast.error('Recipient account number is required'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    if (!form.securityPin || form.securityPin.length !== 4) { toast.error('Enter your 4-digit security PIN'); return; }
    if (parseFloat(form.amount) > parseFloat(account?.available_balance || 0)) {
      toast.error('Insufficient balance'); return;
    }
    setStep('confirm');
  };

  const handleTransfer = async () => {
    const result = await dispatch(initiateTransfer(form));
    if (initiateTransfer.rejected.match(result)) {
      toast.error(result.payload || 'Transfer failed');
      setStep('form');
    } else {
      dispatch(fetchAccount());
    }
  };

  const selectBeneficiary = (b) => {
    setForm(f => ({
      ...f,
      toAccountNumber: b.account_number,
      toAccountName: b.account_name,
      toBankName: b.bank_name || '',
      toIfsc: b.ifsc_code || '',
    }));
    setShowBeneficiaries(false);
  };

  if (step === 'success') return (
    <div className="max-w-md mx-auto">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="glass-card p-10 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
          <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-5">
            <RiCheckDoubleLine className="text-green-400 text-4xl" />
          </div>
        </motion.div>
        <h2 className="font-display text-2xl font-700 text-white mb-2">Transfer Successful!</h2>
        <p className="text-dark-200 text-sm mb-4">
          ₹{parseFloat(form.amount).toLocaleString('en-IN')} transferred to {form.toAccountName || form.toAccountNumber}
        </p>
        <div className="bg-dark-700/50 rounded-xl p-4 mb-5 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-dark-300">Reference</span>
            <span className="text-white font-mono text-xs">{lastTransfer?.referenceNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-dark-300">New Balance</span>
            <span className="text-white font-bold">₹{parseFloat(lastTransfer?.balanceAfter || 0).toLocaleString('en-IN')}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setStep('form'); setForm(f => ({...f, amount:'', toAccountNumber:'', toAccountName:'', securityPin:''})); dispatch(clearTransferState()); }} className="btn-secondary flex-1 justify-center">New Transfer</button>
          <button onClick={() => window.open('/api/transactions/download-statement', '_blank')} className="btn-primary flex-1 justify-center">Download Receipt</button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="page-title">Transfer Money</h1>
        <p className="text-dark-300 text-sm mt-0.5">Send money via NEFT, RTGS, or IMPS</p>
      </div>

      <div className="glass-card p-6">
        <AnimatePresence mode="wait">
          {step === 'form' && (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Transfer mode */}
              <div className="mb-5">
                <label className="form-label">Transfer Mode</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MODES.map(m => (
                    <button key={m.value} type="button" onClick={() => setForm(f => ({ ...f, transferMode: m.value }))}
                      className={`p-3 rounded-xl border transition-all text-left ${form.transferMode === m.value ? 'border-brand-500 bg-brand-500/10' : 'border-white/[0.08] hover:border-white/20'}`}>
                      <p className={`text-sm font-bold ${form.transferMode === m.value ? 'text-brand-400' : 'text-white'}`}>{m.label}</p>
                      <p className="text-dark-400 text-[10px] mt-0.5">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="form-label mb-0">Recipient Account Number</label>
                  <button onClick={() => setShowBeneficiaries(!showBeneficiaries)}
                    className="text-brand-400 text-xs flex items-center gap-1 hover:text-brand-300">
                    <RiGroupLine /> From Beneficiaries
                  </button>
                </div>
                <input type="text" value={form.toAccountNumber} onChange={set('toAccountNumber')}
                  placeholder="Enter 13-digit account number" className="input-field" />

                {/* Beneficiary dropdown */}
                <AnimatePresence>
                  {showBeneficiaries && beneficiaries.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-dark-700 border border-white/[0.08] rounded-xl mt-1 overflow-hidden max-h-48 overflow-y-auto">
                      {beneficiaries.map(b => (
                        <button key={b.id} onClick={() => selectBeneficiary(b)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] border-b border-white/[0.04] last:border-0 text-left">
                          <div className="w-8 h-8 rounded-full bg-brand-500/15 flex items-center justify-center flex-shrink-0">
                            <span className="text-brand-400 text-xs font-bold">{b.nickname?.[0]}</span>
                          </div>
                          <div>
                            <p className="text-white text-sm">{b.nickname}</p>
                            <p className="text-dark-300 text-xs">{b.account_number} · {b.bank_name}</p>
                          </div>
                          {b.is_verified && <span className="badge badge-success ml-auto text-[10px]">Verified</span>}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="form-label">Account Holder Name</label>
                  <input type="text" value={form.toAccountName} onChange={set('toAccountName')}
                    placeholder="Recipient name" className="input-field" />
                </div>
                <div>
                  <label className="form-label">Bank Name</label>
                  <input type="text" value={form.toBankName} onChange={set('toBankName')}
                    placeholder="e.g. HDFC Bank" className="input-field" />
                </div>
                <div>
                  <label className="form-label">IFSC Code</label>
                  <input type="text" value={form.toIfsc} onChange={set('toIfsc')}
                    placeholder="HDFC0001234" className="input-field uppercase" />
                </div>
                <div>
                  <label className="form-label">Amount (₹)</label>
                  <input type="number" value={form.amount} onChange={set('amount')}
                    placeholder="0.00" min="1" className="input-field" />
                  {account && (
                    <p className="text-dark-400 text-xs mt-1">
                      Available: ₹{parseFloat(account.available_balance || 0).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="form-label">Description / Narration</label>
                  <input type="text" value={form.description} onChange={set('description')}
                    placeholder="Optional note" className="input-field" />
                </div>
                <div>
                  <label className="form-label">Schedule Transfer (Optional)</label>
                  <input type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')}
                    min={new Date().toISOString().slice(0, 16)} className="input-field" />
                </div>
              </div>

              {/* PIN */}
              <div className="bg-dark-700/50 rounded-xl p-4 mb-5">
                <label className="form-label">Security PIN</label>
                <input type="password" inputMode="numeric" maxLength={4} value={form.securityPin} onChange={set('securityPin')}
                  placeholder="Enter 4-digit PIN" className="input-field" pattern="\d{4}" />
                <p className="text-dark-400 text-xs mt-1.5 flex items-center gap-1">
                  <RiInformationLine /> Your PIN is required to authorize transfers
                </p>
              </div>

              <button onClick={handleConfirm} className="btn-primary w-full py-3.5">
                <RiSendPlaneLine /> Review Transfer
              </button>
            </motion.div>
          )}

          {step === 'confirm' && (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <h3 className="text-white font-semibold text-lg mb-5">Confirm Transfer</h3>
              <div className="space-y-0 rounded-2xl overflow-hidden border border-white/[0.06]">
                {[
                  { label: 'To Account', value: form.toAccountNumber },
                  { label: 'Account Name', value: form.toAccountName || 'Not specified' },
                  { label: 'Bank', value: form.toBankName || 'External Bank' },
                  { label: 'IFSC', value: form.toIfsc || 'N/A' },
                  { label: 'Mode', value: form.transferMode },
                  { label: 'Description', value: form.description || 'Transfer' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between px-4 py-3.5 border-b border-white/[0.05] last:border-0">
                    <span className="text-dark-300 text-sm">{label}</span>
                    <span className="text-white text-sm font-medium">{value}</span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-4 bg-brand-500/10">
                  <span className="text-white font-bold">Amount</span>
                  <span className="text-brand-400 font-bold text-xl">
                    ₹{parseFloat(form.amount).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setStep('form')} className="btn-secondary flex-1 justify-center">
                  <RiArrowLeftLine /> Edit
                </button>
                <button onClick={handleTransfer} disabled={transferLoading} className="btn-primary flex-1 justify-center">
                  {transferLoading ? <><div className="spinner w-4 h-4" /> Processing...</> : <><RiSendPlaneLine /> Confirm Transfer</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
