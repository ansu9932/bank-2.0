import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RiBankLine, RiMailLine, RiArrowLeftLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) { toast.error('Email is required'); return; }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
      toast.success('Reset link sent! Check your email.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
            <RiBankLine className="text-white text-lg" />
          </div>
          <p className="font-display font-700 text-white text-lg">ALISTER BANK</p>
        </div>

        <div className="glass-card p-8">
          {!sent ? (
            <>
              <div className="mb-7">
                <h2 className="font-display text-2xl font-700 text-white mb-1">Forgot Password?</h2>
                <p className="text-dark-200 text-sm">Enter your email to receive a reset link (expires in 5 minutes).</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="form-label">Email Address</label>
                  <div className="relative">
                    <RiMailLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="your@email.com" className="input-field pl-10"
                    />
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full py-3.5">
                  {loading ? <><div className="spinner w-4 h-4" /> Sending...</> : 'Send Reset Link'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📧</span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">Check your email</h3>
              <p className="text-dark-200 text-sm mb-4">
                We've sent a secure password reset link to <strong className="text-white">{email}</strong>. The link expires in 5 minutes.
              </p>
              <p className="text-dark-400 text-xs">Didn't receive it? Check spam or <button onClick={() => setSent(false)} className="text-brand-400">try again</button></p>
            </div>
          )}

          <Link to="/login" className="flex items-center gap-2 text-dark-300 hover:text-white text-sm mt-6 transition-colors">
            <RiArrowLeftLine /> Back to login
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
