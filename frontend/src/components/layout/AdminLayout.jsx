import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  RiDashboardLine, RiGroupLine, RiExchangeLine,
  RiFileShield2Line, RiCustomerService2Line,
  RiLogoutBoxLine, RiBankLine, RiShieldLine,
} from 'react-icons/ri';

const navItems = [
  { to: '/admin', icon: RiDashboardLine, label: 'Dashboard', end: true },
  { to: '/admin/users', icon: RiGroupLine, label: 'Users & KYC' },
  { to: '/admin/transactions', icon: RiExchangeLine, label: 'Transactions' },
  { to: '/admin/tickets', icon: RiCustomerService2Line, label: 'Tickets' },
  { to: '/admin/audit', icon: RiFileShield2Line, label: 'Audit Logs' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-dark-900">
      {/* Admin sidebar */}
      <aside className="w-56 flex flex-col bg-dark-800 border-r border-white/[0.05] flex-shrink-0">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.05]">
          <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center">
            <RiShieldLine className="text-white text-sm" />
          </div>
          <div>
            <p className="font-display font-700 text-white text-sm">Admin Panel</p>
            <p className="text-dark-400 text-[10px]">Alister Bank</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon className="text-lg flex-shrink-0" />
              <span className="text-sm">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-4 border-t border-white/[0.05] pt-3">
          <button onClick={handleLogout} className="nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <RiLogoutBoxLine className="text-lg" />
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center px-6 border-b border-white/[0.05] bg-dark-800/50">
          <div className="flex items-center gap-2">
            <RiBankLine className="text-brand-400" />
            <p className="text-white text-sm font-medium">Alister Bank — Administration</p>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
