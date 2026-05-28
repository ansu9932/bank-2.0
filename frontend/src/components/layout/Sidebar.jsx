import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import {
  RiDashboardLine, RiExchangeLine, RiSendPlaneLine,
  RiGroupLine, RiFileTextLine, RiBarChartLine,
  RiUserLine, RiShieldLine, RiCustomerService2Line,
  RiLogoutBoxLine, RiBankLine, RiMenuLine,
} from 'react-icons/ri';
import { logout } from '../../store/slices/authSlice';
import { closeMobileSidebar } from '../../store/slices/uiSlice';

const navItems = [
  { to: '/dashboard',               icon: RiDashboardLine,     label: 'Dashboard' },
  { to: '/dashboard/transactions',  icon: RiExchangeLine,      label: 'Transactions' },
  { to: '/dashboard/transfer',      icon: RiSendPlaneLine,     label: 'Transfer' },
  { to: '/dashboard/beneficiaries', icon: RiGroupLine,         label: 'Beneficiaries' },
  { to: '/dashboard/statement',     icon: RiFileTextLine,      label: 'Statement' },
  { to: '/dashboard/analytics',     icon: RiBarChartLine,      label: 'Analytics' },
];

const settingsItems = [
  { to: '/dashboard/profile',  icon: RiUserLine,             label: 'Profile' },
  { to: '/dashboard/security', icon: RiShieldLine,           label: 'Security' },
  { to: '/dashboard/support',  icon: RiCustomerService2Line, label: 'Support' },
];

export default function Sidebar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);
  const { sidebarOpen, sidebarMobileOpen } = useSelector(s => s.ui);

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/[0.05]">
        <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shadow-glow flex-shrink-0">
          <RiBankLine className="text-white text-lg" />
        </div>
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              <p className="font-display font-700 text-white text-base">Alister Bank</p>
              <p className="text-dark-300 text-xs">Digital Banking</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-dark-400 text-xs font-medium px-3 mb-2 uppercase tracking-widest">Banking</p>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to} to={to} end={to === '/dashboard'}
            onClick={() => dispatch(closeMobileSidebar())}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon className="text-lg flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-sm">{label}</motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        ))}

        <p className="text-dark-400 text-xs font-medium px-3 mb-2 mt-5 uppercase tracking-widest">Settings</p>
        {settingsItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to} to={to}
            onClick={() => dispatch(closeMobileSidebar())}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon className="text-lg flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-sm">{label}</motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="px-3 pb-4 border-t border-white/[0.05] pt-4">
        {sidebarOpen && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] mb-2">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-brand-400 text-xs font-bold">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-dark-300 text-xs truncate">{user?.customerId}</p>
            </div>
          </div>
        )}
        <button onClick={handleLogout} className="nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <RiLogoutBoxLine className="text-lg flex-shrink-0" />
          {sidebarOpen && <span className="text-sm">Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: sidebarOpen ? 240 : 68 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="hidden lg:flex flex-col h-full bg-dark-800 border-r border-white/[0.05] overflow-hidden flex-shrink-0"
      >
        {sidebarContent}
      </motion.aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {sidebarMobileOpen && (
          <motion.aside
            initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="fixed left-0 top-0 bottom-0 w-64 z-40 lg:hidden bg-dark-800 border-r border-white/[0.05]"
          >
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
