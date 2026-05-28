import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RiBankLine, RiCheckLine, RiArrowLeftLine, RiArrowRightLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';

// Step components
import StepPersonal from './steps/StepPersonal';
import StepAddress from './steps/StepAddress';
import StepDocuments from './steps/StepDocuments';
import StepOTPVerify from './steps/StepOTPVerify';
import StepReview from './steps/StepReview';

const STEPS = [
  { id: 1, label: 'Personal Info', icon: '👤' },
  { id: 2, label: 'Address',       icon: '📍' },
  { id: 3, label: 'Documents',     icon: '📄' },
  { id: 4, label: 'Verification',  icon: '🔐' },
  { id: 5, label: 'Review',        icon: '✅' },
];

const initForm = {
  // Personal
  firstName: '', lastName: '', email: '', phone: '',
  dateOfBirth: '', gender: '', fatherName: '', motherName: '',
  maritalStatus: '', nationality: 'Indian', occupation: '', annualIncome: '',
  accountType: 'savings',
  // Address
  addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', country: 'India',
  // Documents
  aadhaarNumber: '', panNumber: '', passportNumber: '',
  // Files
  files: {},
};

export default function AccountOpeningPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initForm);
  const [loading, setLoading] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [customerId, setCustomerId] = useState('');

  const updateForm = (updates) => setForm(prev => ({ ...prev, ...updates }));

  const next = () => setStep(s => Math.min(s + 1, 5));
  const prev = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    if (!otpVerified) { toast.error('Please verify your email first.'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      // Append all form fields
      Object.entries(form).forEach(([k, v]) => {
        if (k !== 'files' && v) fd.append(k, v);
      });
      // Append files
      Object.entries(form.files).forEach(([k, v]) => { if (v) fd.append(k, v); });

      const { data } = await api.post('/account/open', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCustomerId(data.data.customerId);
      setSubmitted(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900 p-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-10 text-center max-w-md w-full">
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}
            className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-6"
          >
            <span className="text-4xl">🎉</span>
          </motion.div>
          <h2 className="font-display text-2xl font-700 text-white mb-3">Application Submitted!</h2>
          <p className="text-dark-200 text-sm mb-4 leading-relaxed">
            Your application is under review. Check your email for updates.
          </p>
          <div className="bg-dark-700 rounded-xl p-4 mb-6">
            <p className="text-dark-300 text-xs mb-1">Your Customer ID</p>
            <p className="font-display text-2xl font-700 text-brand-400 tracking-widest">{customerId}</p>
            <p className="text-dark-400 text-xs mt-1">Save this for future reference</p>
          </div>
          <div className="text-left bg-dark-700/50 rounded-xl p-4 mb-6 space-y-2">
            {[
              { icon: '📧', text: 'KYC review email sent to your inbox' },
              { icon: '🎥', text: 'Video KYC link will arrive in ~10 minutes' },
              { icon: '✅', text: 'Account approved & setup link within 20 min' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm text-dark-200">
                <span>{item.icon}</span><span>{item.text}</span>
              </div>
            ))}
          </div>
          <Link to="/login" className="btn-primary w-full justify-center">Go to Login</Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 py-8 px-4">
      {/* Header */}
      <div className="max-w-3xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
              <RiBankLine className="text-white text-lg" />
            </div>
            <p className="font-display font-700 text-white">ALISTER BANK</p>
          </div>
          <Link to="/login" className="text-dark-300 hover:text-white text-sm transition-colors flex items-center gap-1.5">
            <RiArrowLeftLine /> Back to Login
          </Link>
        </div>
        <div className="mt-6">
          <h1 className="font-display text-2xl font-700 text-white">Open Your Account</h1>
          <p className="text-dark-200 text-sm mt-1">Complete in 5 simple steps — takes about 5 minutes</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="max-w-3xl mx-auto mb-6">
        <div className="flex items-center gap-0">
          {STEPS.map((s, idx) => (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center">
                <motion.div
                  animate={{
                    backgroundColor: step > s.id ? '#22c55e' : step === s.id ? '#c8102e' : '#1e1e2e',
                    borderColor: step >= s.id ? (step > s.id ? '#22c55e' : '#c8102e') : 'rgba(255,255,255,0.1)',
                  }}
                  className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold text-white"
                >
                  {step > s.id ? <RiCheckLine /> : <span>{s.icon}</span>}
                </motion.div>
                <p className={`text-xs mt-1.5 hidden sm:block transition-colors ${step >= s.id ? 'text-white' : 'text-dark-400'}`}>
                  {s.label}
                </p>
              </div>
              {idx < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 mx-1 mb-4 rounded-full transition-colors duration-500"
                  style={{ backgroundColor: step > s.id ? '#22c55e' : 'rgba(255,255,255,0.08)' }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="max-w-3xl mx-auto">
        <div className="glass-card p-6 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
            >
              {step === 1 && <StepPersonal form={form} update={updateForm} />}
              {step === 2 && <StepAddress form={form} update={updateForm} />}
              {step === 3 && <StepDocuments form={form} update={updateForm} />}
              {step === 4 && (
                <StepOTPVerify
                  email={form.email}
                  verified={otpVerified}
                  onVerified={() => setOtpVerified(true)}
                />
              )}
              {step === 5 && <StepReview form={form} />}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/[0.05]">
            <button
              onClick={prev} disabled={step === 1}
              className="btn-secondary disabled:opacity-30"
            >
              <RiArrowLeftLine /> Previous
            </button>

            {step < 5 ? (
              <button onClick={next} className="btn-primary">
                Next <RiArrowRightLine />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading || !otpVerified} className="btn-primary">
                {loading ? <><div className="spinner w-4 h-4" /> Submitting...</> : '🚀 Submit Application'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
