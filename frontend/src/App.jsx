import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useSelector, useDispatch } from 'react-redux';
import { getMe } from './store/slices/authSlice';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

// Account opening flow
import AccountOpeningPage from './pages/account-opening/AccountOpeningPage';
import CyberVideoKYC from './pages/account-opening/CyberVideoKYC';
import AccountSetupPage from './pages/account-opening/AccountSetupPage';

// Dashboard
import DashboardLayout from './components/layout/DashboardLayout';
import DashboardPage from './pages/dashboard/DashboardPage';
import TransactionsPage from './pages/dashboard/TransactionsPage';
import TransferPage from './pages/dashboard/TransferPage';
import DepositFunds from './pages/dashboard/DepositFunds';
import BeneficiariesPage from './pages/dashboard/BeneficiariesPage';
import StatementPage from './pages/dashboard/StatementPage';
import ProfilePage from './pages/dashboard/ProfilePage';
import SecurityPage from './pages/dashboard/SecurityPage';
import SupportPage from './pages/dashboard/SupportPage';
import AnalyticsPage from './pages/dashboard/AnalyticsPage';

// Admin
import AdminLayout from './components/layout/AdminLayout';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage';
import AdminKYCReviewPage from './pages/admin/AdminKYCReviewPage';
import AdminTransactionsPage from './pages/admin/AdminTransactionsPage';
import AdminAuditPage from './pages/admin/AdminAuditPage';
import AdminTicketsPage from './pages/admin/AdminTicketsPage';

// Guards
const PrivateRoute = ({ children }) => {
  const { isAuthenticated, user } = useSelector(s => s.auth);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.account_status === 'pending') return <Navigate to="/account-setup" replace />;
  return children;
};

const AdminRoute = ({ children }) => {
  const adminToken = localStorage.getItem('adminToken');
  if (!adminToken) return <Navigate to="/admin/login" replace />;
  return children;
};

const GuestRoute = ({ children }) => {
  const { isAuthenticated } = useSelector(s => s.auth);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
};

export default function App() {
  const dispatch = useDispatch();
  const { isAuthenticated } = useSelector(s => s.auth);

  useEffect(() => {
    if (isAuthenticated) dispatch(getMe());
  }, []);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1e1e2e',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#1e1e2e' } },
          error:   { iconTheme: { primary: '#c8102e', secondary: '#1e1e2e' } },
        }}
      />

      <Routes>
        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Auth */}
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Account Opening */}
        <Route path="/open-account" element={<AccountOpeningPage />} />
        {/* Live production Video KYC — email secure links land here (?token=...) */}
        <Route path="/video-kyc" element={<CyberVideoKYC />} />
        {/* Public showcase / demo of the same cyber wizard (no token = demo mode) */}
        <Route path="/cyber-kyc" element={<CyberVideoKYC />} />
        <Route path="/account-setup" element={<AccountSetupPage />} />

        {/* Dashboard */}
        <Route path="/dashboard" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="transfer" element={<TransferPage />} />
          <Route path="deposit" element={<DepositFunds />} />
          <Route path="beneficiaries" element={<BeneficiariesPage />} />
          <Route path="statement" element={<StatementPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="support" element={<SupportPage />} />
        </Route>

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:id" element={<AdminUserDetailPage />} />
          <Route path="kyc-review" element={<AdminKYCReviewPage />} />
          <Route path="transactions" element={<AdminTransactionsPage />} />
          {/* audit — matches the /admin/audit path used in Sidebar and AdminLayout */}
          <Route path="audit" element={<AdminAuditPage />} />
          {/* audit-logs — alias so old bookmarks still work */}
          <Route path="audit-logs" element={<AdminAuditPage />} />
          <Route path="tickets" element={<AdminTicketsPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
