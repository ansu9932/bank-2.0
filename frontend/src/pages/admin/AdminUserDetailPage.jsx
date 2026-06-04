import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RiArrowLeftLine, RiCheckLine, RiCloseLine, RiLockLine, RiLockUnlockLine, RiAddCircleLine, RiSubtractLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manualTx, setManualTx] = useState({ type: 'credit', amount: '', description: '', reason: '' });
  const [txLoading, setTxLoading] = useState(false);
  const [limitValue, setLimitValue] = useState('');
  const [limitLoading, setLimitLoading] = useState(false);
  const headers = { Authorization: `Bearer ${localStorage.getItem('adminToken')}` };

  const fetch = async () => {
    try {
      const { data } = await api.get(`/admin/users/${id}`, { headers });
      setUser(data.data.user);
      if (data.data.user?.account?.daily_transfer_limit != null) {
        setLimitValue(String(parseFloat(data.data.user.account.daily_transfer_limit)));
      }
    } catch { toast.error('Failed to load user'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [id]);

  const approveKYC = async () => {
    try {
      const { data } = await api.post(`/admin/users/${id}/approve-kyc`, {}, { headers });
      toast.success(data.message);
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const rejectKYC = async () => {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    try {
      await api.post(`/admin/users/${id}/reject-kyc`, { reason }, { headers });
      toast.success('KYC rejected');
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const toggleFreeze = async () => {
    const isActive = user.account_status === 'active';
    const reason = isActive ? prompt('Reason for freezing:') : '';
    try {
      await api.post(`/admin/users/${id}/freeze`, { action: isActive ? 'freeze' : 'unfreeze', reason }, { headers });
      toast.success(`Account ${isActive ? 'frozen' : 'unfrozen'}`);
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const submitManualTx = async () => {
    if (!manualTx.amount) { toast.error('Amount is required'); return; }
    setTxLoading(true);
    try {
      await api.post(`/admin/users/${id}/manual-transaction`, manualTx, { headers });
      toast.success('Transaction applied!');
      setManualTx({ type: 'credit', amount: '', description: '', reason: '' });
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setTxLoading(false); }
  };

  const updateLimit = async () => {
    const parsed = parseFloat(limitValue);
    if (Number.isNaN(parsed) || parsed < 0) { toast.error('Enter a valid limit amount'); return; }
    setLimitLoading(true);
    try {
      const { data } = await api.patch(`/admin/users/${id}/update-limit`,
        { dailyTransferLimit: parsed }, { headers });
      toast.success(data.message || 'Daily transfer limit updated');
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update limit'); }
    finally { setLimitLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner w-8 h-8" style={{ borderWidth: 3 }} /></div>;
  if (!user) return <p className="text-dark-300">User not found.</p>;

  const kycColor = { pending: 'yellow', under_review: 'blue', video_kyc_pending: 'purple', approved: 'green', rejected: 'red' }[user.kyc_status] || 'gray';

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to="/admin/users" className="p-2 rounded-xl hover:bg-white/[0.05] text-dark-300 hover:text-white">
          <RiArrowLeftLine />
        </Link>
        <div>
          <h1 className="page-title">{user.first_name} {user.last_name}</h1>
          <p className="text-dark-300 text-sm">{user.customer_id} · {user.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* User info */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-5">
            <p className="text-white font-semibold mb-3">Personal Details</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Phone', user.phone], ['Date of Birth', user.date_of_birth],
                ['Gender', user.gender], ['Occupation', user.occupation],
                ['Nationality', user.nationality], ['Annual Income', `₹${(user.annual_income||0).toLocaleString('en-IN')}`],
                ['PAN Number', user.pan_number], ['Aadhaar', user.aadhaar_number ? '****' + user.aadhaar_number.slice(-4) : '—'],
                ['Address', `${user.address_line1}, ${user.city}, ${user.state} - ${user.pincode}`],
              ].map(([k,v]) => (
                <div key={k}>
                  <p className="text-dark-400 text-xs">{k}</p>
                  <p className="text-white text-sm mt-0.5">{v || '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Account */}
          {user.account && (
            <div className="glass-card p-5">
              <p className="text-white font-semibold mb-3">Account Details</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Account Number', user.account.account_number],
                  ['Balance', `₹${parseFloat(user.account.balance).toLocaleString('en-IN')}`],
                  ['IFSC Code', user.account.ifsc_code],
                  ['Account Type', user.account.account_type?.toUpperCase()],
                  ['Status', user.account.status],
                  ['Daily Transfer Limit', `₹${parseFloat(user.account.daily_transfer_limit || 0).toLocaleString('en-IN')}`],
                ].map(([k,v]) => (
                  <div key={k}>
                    <p className="text-dark-400 text-xs">{k}</p>
                    <p className="text-white text-sm mt-0.5">{v || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KYC Documents */}
          {user.documents?.length > 0 && (
            <div className="glass-card p-5">
              <p className="text-white font-semibold mb-3">KYC Documents</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {user.documents.map(doc => (
                  <a key={doc.id} href={`/${doc.file_path}`} target="_blank" rel="noreferrer"
                    className="glass-card-hover p-3 text-center">
                    <span className="text-2xl">📄</span>
                    <p className="text-dark-200 text-xs mt-1 capitalize">{doc.document_type.replace('_',' ')}</p>
                    <span className={`badge text-[10px] mt-1 ${doc.status === 'approved' ? 'badge-success' : doc.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>{doc.status}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions sidebar */}
        <div className="space-y-4">
          {/* Status */}
          <div className="glass-card p-4">
            <p className="text-white font-semibold mb-3 text-sm">Status</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-dark-300 text-xs">KYC Status</span>
                <span className={`badge badge-${kycColor === 'green' ? 'success' : kycColor === 'red' ? 'danger' : 'warning'} text-[10px]`}>
                  {user.kyc_status?.replace(/_/g,' ')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-dark-300 text-xs">Account</span>
                <span className={`badge ${user.account_status === 'active' ? 'badge-success' : user.account_status === 'frozen' ? 'badge-danger' : 'badge-warning'} text-[10px]`}>
                  {user.account_status}
                </span>
              </div>
            </div>
          </div>

          {/* KYC Actions */}
          {['pending','under_review','video_kyc_pending'].includes(user.kyc_status) && (
            <div className="glass-card p-4">
              <p className="text-white font-semibold mb-3 text-sm">KYC Actions</p>
              <div className="space-y-2">
                <button onClick={approveKYC} className="btn-primary w-full justify-center py-2.5 text-sm">
                  <RiCheckLine /> Approve KYC
                </button>
                <button onClick={rejectKYC} className="btn-secondary w-full justify-center py-2.5 text-sm border-red-500/20 text-red-400">
                  <RiCloseLine /> Reject KYC
                </button>
              </div>
            </div>
          )}

          {/* Freeze */}
          {user.account && (
            <div className="glass-card p-4">
              <p className="text-white font-semibold mb-3 text-sm">Account Control</p>
              <button onClick={toggleFreeze}
                className={`w-full justify-center py-2.5 text-sm ${user.account_status === 'active' ? 'btn-secondary border-red-500/20 text-red-400' : 'btn-primary'}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {user.account_status === 'active' ? <><RiLockLine />Freeze Account</> : <><RiLockUnlockLine />Unfreeze Account</>}
              </button>
            </div>
          )}

          {/* Manual Tx */}
          {user.account && (
            <div className="glass-card p-4">
              <p className="text-white font-semibold mb-3 text-sm">Manual Transaction</p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1">
                  {['credit','debit'].map(t => (
                    <button key={t} onClick={() => setManualTx(f => ({...f, type: t}))}
                      className={`py-2 rounded-lg text-xs font-medium transition-all ${manualTx.type === t ? (t === 'credit' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400') : 'bg-dark-700 text-dark-300'}`}>
                      {t.charAt(0).toUpperCase()+t.slice(1)}
                    </button>
                  ))}
                </div>
                <input type="number" placeholder="Amount (₹)" value={manualTx.amount}
                  onChange={e => setManualTx(f => ({...f, amount: e.target.value}))}
                  className="input-field text-sm py-2" />
                <input type="text" placeholder="Description" value={manualTx.description}
                  onChange={e => setManualTx(f => ({...f, description: e.target.value}))}
                  className="input-field text-sm py-2" />
                <input type="text" placeholder="Reason" value={manualTx.reason}
                  onChange={e => setManualTx(f => ({...f, reason: e.target.value}))}
                  className="input-field text-sm py-2" />
                <button onClick={submitManualTx} disabled={txLoading} className="btn-primary w-full justify-center py-2.5 text-sm">
                  {txLoading ? <><div className="spinner w-3 h-3" /> Processing...</> : `Apply ${manualTx.type}`}
                </button>
              </div>
            </div>
          )}

          {/* Daily Transfer Limit */}
          {user.account && (
            <div className="glass-card p-4">
              <p className="text-white font-semibold mb-1 text-sm">Modify Daily Transfer Limit</p>
              <p className="text-dark-400 text-xs mb-3">
                Current: ₹{parseFloat(user.account.daily_transfer_limit || 0).toLocaleString('en-IN')}
                {user.account.custom_daily_limit_set
                  ? <span className="text-brand-400"> · custom</span>
                  : <span className="text-dark-400"> · default</span>}
              </p>
              <div className="space-y-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-300 text-sm">₹</span>
                  <input type="number" min="0" step="1000" placeholder="Daily limit (₹)"
                    value={limitValue} onChange={(e) => setLimitValue(e.target.value)}
                    className="input-field text-sm py-2 pl-7" />
                </div>
                <button onClick={updateLimit} disabled={limitLoading}
                  className="btn-primary w-full justify-center py-2.5 text-sm">
                  {limitLoading ? <><div className="spinner w-3 h-3" /> Updating...</> : 'Update Limits'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
