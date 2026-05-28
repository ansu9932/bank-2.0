import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { RiMailLine, RiCheckDoubleLine, RiRefreshLine } from 'react-icons/ri';
import api from '../../../services/api';
import toast from 'react-hot-toast';

export default function StepOTPVerify({ email, verified, onVerified }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [sent, setSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const refs = useRef([]);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const sendOTP = async () => {
    if (!email) { toast.error('Email is required. Please go back to step 1.'); return; }
    setSendingOtp(true);
    try {
      await api.post('/auth/send-otp', { email, purpose: 'email_verification' });
      setSent(true);
      setCountdown(300); // 5 min
      toast.success(`OTP sent to ${email}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const newOtp = [...otp];
    newOtp[i] = val;
    setOtp(newOtp);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const arr = pasted.split('').concat(Array(6).fill('')).slice(0, 6);
    setOtp(arr);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const verifyOTP = async () => {
    const code = otp.join('');
    if (code.length !== 6) { toast.error('Enter the complete 6-digit OTP'); return; }
    setVerifying(true);
    try {
      await api.post('/auth/verify-otp', { email, otp: code, purpose: 'email_verification' });
      toast.success('Email verified successfully!');
      onVerified();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Incorrect OTP');
    } finally {
      setVerifying(false);
    }
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (verified) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="text-center py-8">
        <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-4">
          <RiCheckDoubleLine className="text-green-400 text-4xl" />
        </div>
        <h3 className="text-white font-semibold text-xl mb-2">Email Verified! ✅</h3>
        <p className="text-dark-300 text-sm">Your email <strong className="text-white">{email}</strong> has been verified.</p>
        <p className="text-dark-400 text-xs mt-2">You can now proceed to the final step.</p>
      </motion.div>
    );
  }

  return (
    <div>
      <h3 className="font-display text-xl font-700 text-white mb-1">Email Verification</h3>
      <p className="text-dark-300 text-sm mb-6">We'll send a 6-digit OTP to verify your email address.</p>

      {/* Email display */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-dark-700 border border-white/[0.06] mb-6">
        <div className="w-10 h-10 rounded-full bg-brand-500/15 flex items-center justify-center flex-shrink-0">
          <RiMailLine className="text-brand-400 text-xl" />
        </div>
        <div>
          <p className="text-dark-300 text-xs">OTP will be sent to</p>
          <p className="text-white font-medium text-sm">{email || 'No email provided'}</p>
        </div>
      </div>

      {!sent ? (
        <button onClick={sendOTP} disabled={sendingOtp || !email} className="btn-primary w-full py-3.5">
          {sendingOtp ? <><div className="spinner w-4 h-4" /> Sending OTP...</> : '📤 Send OTP to Email'}
        </button>
      ) : (
        <>
          <p className="text-dark-300 text-sm mb-4 text-center">
            Enter the 6-digit OTP sent to your email
            {countdown > 0 && <span className="text-brand-400 font-medium ml-2">(expires in {formatTime(countdown)})</span>}
          </p>

          {/* OTP inputs */}
          <div className="flex gap-3 justify-center mb-6" onPaste={handlePaste}>
            {otp.map((digit, i) => (
              <input
                key={i} ref={(el) => (refs.current[i] = el)}
                type="text" inputMode="numeric" maxLength={1}
                value={digit} onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className="otp-input"
              />
            ))}
          </div>

          <button onClick={verifyOTP} disabled={verifying || otp.join('').length < 6} className="btn-primary w-full py-3.5 mb-3">
            {verifying ? <><div className="spinner w-4 h-4" /> Verifying...</> : '✅ Verify OTP'}
          </button>

          <div className="text-center">
            <button
              onClick={sendOTP} disabled={countdown > 0 || sendingOtp}
              className="text-brand-400 hover:text-brand-300 text-sm flex items-center gap-1.5 mx-auto disabled:opacity-40"
            >
              <RiRefreshLine /> Resend OTP {countdown > 0 ? `in ${formatTime(countdown)}` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
