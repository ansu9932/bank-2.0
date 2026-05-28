import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RiBankLine, RiLockLine, RiEyeLine, RiEyeOffLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [form, setForm] = useState({ newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) { toast.error('Passwords do not match'); return; }
    if (form.newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: form.newPassword });
      toast.success('Password reset successful!');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed. Link may be expired.');
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
          <h2 className="font-display text-2xl font-700 text-white mb-1">Reset Password</h2>
          <p className="text-dark-200 text-sm mb-6">Create a new secure password for your account.</p>
          {!token ? (
            <p className="text-red-400 text-sm">Invalid or missing reset token. <Link to="/forgot-password" className="text-brand-400">Request new link</Link></p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { key: 'newPassword', label: 'New Password', placeholder: 'Min. 8 characters' },
                { key: 'confirm', label: 'Confirm Password', placeholder: 'Repeat your password' },
              ].map(f => (
                <div key={f.key}>
                  <label className="form-label">{f.label}</label>
                  <div className="relative">
                    <RiLockLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
                    <input
                      type={show ? 'text' : 'password'}
                      value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder} className="input-field pl-10 pr-10"
                    />
                    <button type="button" onClick={() => setShow(!show)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-dark-300 hover:text-white">
                      {show ? <RiEyeOffLine /> : <RiEyeLine />}
                    </button>
                  </div>
                </div>
              ))}
              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5">
                {loading ? <><div className="spinner w-4 h-4" /> Resetting...</> : 'Reset Password'}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
