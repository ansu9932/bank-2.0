import React, { useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import {
  RiDashboardLine,
  RiExchangeLine,
  RiSendPlaneLine,
  RiGroupLine,
  RiFileTextLine,
  RiBarChartLine,
  RiUserLine,
  RiShieldLine,
  RiCustomerService2Line,
  RiLogoutBoxLine,
  RiBankLine,
  RiShieldCheckLine,
  RiFileShield2Line,
} from 'react-icons/ri';
import { logout } from '../../store/slices/authSlice';
import { closeMobileSidebar } from '../../store/slices/uiSlice';

// ─── Route definitions ────────────────────────────────────────────────────────

/**
 * Admin navigation links — rendered when user.role === 'admin'.
 * These paths must match the routes defined in App.jsx exactly.
 */
const ADMIN_NAV_ITEMS = [
  {
    to: '/admin',
    icon: RiDashboardLine,
    label: 'Dashboard',
    end: true,
  },
  {
    to: '/admin/users',
    icon: RiGroupLine,
    label: 'Users & KYC',
    end: false,
  },
  {
    to: '/admin/transactions',
    icon: RiExchangeLine,
    label: 'Transactions',
    end: false,
  },
  {
    to: '/admin/tickets',
    icon: RiCustomerService2Line,
    label: 'Tickets',
    end: false,
  },
  {
    to: '/admin/audit',
    icon: RiFileShield2Line,
    label: 'Audit Logs',
    end: false,
  },
];

/**
 * Customer navigation links — rendered when user.role === 'user' or any other
 * non-admin role, and also when no user is present (safe fallback).
 */
const CUSTOMER_NAV_ITEMS = [
  {
    to: '/dashboard',
    icon: RiDashboardLine,
    label: 'Dashboard',
    end: true,
  },
  {
    to: '/dashboard/transactions',
    icon: RiExchangeLine,
    label: 'Transactions',
    end: false,
  },
  {
    to: '/dashboard/transfer',
    icon: RiSendPlaneLine,
    label: 'Transfer Money',
    end: false,
  },
  {
    to: '/dashboard/beneficiaries',
    icon: RiGroupLine,
    label: 'Beneficiaries',
    end: false,
  },
  {
    to: '/dashboard/statement',
    icon: RiFileTextLine,
    label: 'Statement',
    end: false,
  },
  {
    to: '/dashboard/analytics',
    icon: RiBarChartLine,
    label: 'Analytics',
    end: false,
  },
];

/**
 * Customer settings links — rendered only for non-admin users, below a
 * "Settings" section header in the sidebar nav.
 */
const CUSTOMER_SETTINGS_ITEMS = [
  {
    to: '/dashboard/profile',
    icon: RiUserLine,
    label: 'Profile Settings',
    end: false,
  },
  {
    to: '/dashboard/security',
    icon: RiShieldLine,
    label: 'Security',
    end: false,
  },
  {
    to: '/dashboard/support',
    icon: RiCustomerService2Line,
    label: 'Support',
    end: false,
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Safely reads the logged-in user from Redux state, then falls back to
 * localStorage if the Redux store has not yet been hydrated (e.g. hard refresh
 * before getMe resolves).  Returns a plain object — never null/undefined.
 */
function useSafeUser(reduxUser) {
  return useMemo(() => {
    if (reduxUser && typeof reduxUser === 'object') {
      return reduxUser;
    }
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {
      // JSON.parse failed — ignore and fall through
    }
    return {};
  }, [reduxUser]);
}

// ─── Single NavLink item ───────────────────────────────────────────────────────

/**
 * Renders one nav link with the correct active styling.
 * Uses useLocation internally so that exact-path matching works even when
 * React Router's `end` prop alone isn't enough (e.g. nested admin routes).
 */
function SidebarNavItem({ to, icon: Icon, label, end, sidebarOpen, currentPath, onClick }) {
  // Determine active state manually via useLocation so we can apply identical
  // logic regardless of whether we are in an admin or customer context.
  // When `end` is true the path must match exactly; otherwise it only needs
  // to start with the target path.
  const isActive = end
    ? currentPath === to
    : currentPath === to || currentPath.startsWith(to + '/');

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={() =>
        `nav-item${isActive ? ' active' : ''}`
      }
    >
      <Icon className="text-lg flex-shrink-0" />
      <AnimatePresence>
        {sidebarOpen && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.18 }}
            className="text-sm overflow-hidden whitespace-nowrap"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </NavLink>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Sidebar() {
  const dispatch   = useDispatch();
  const navigate   = useNavigate();
  const location   = useLocation();
  const currentPath = location.pathname;

  // ── Redux state ─────────────────────────────────────────────────────────────
  const reduxUser          = useSelector((state) => state.auth.user);
  const { sidebarOpen, sidebarMobileOpen } = useSelector((state) => state.ui);

  // ── Safe user with localStorage fallback ────────────────────────────────────
  const user = useSafeUser(reduxUser);

  // ── Role detection ───────────────────────────────────────────────────────────
  // The role field is set on the user object by the auth slice after login.
  // We normalise it to lowercase to guard against casing inconsistencies.
  const rawRole    = typeof user.role === 'string' ? user.role.toLowerCase().trim() : '';
  const isAdmin    = rawRole === 'admin';

  // ── Navigation items based on role ───────────────────────────────────────────
  const primaryNavItems   = isAdmin ? ADMIN_NAV_ITEMS   : CUSTOMER_NAV_ITEMS;
  const secondaryNavItems = isAdmin ? []                : CUSTOMER_SETTINGS_ITEMS;

  // ── Display name helpers ─────────────────────────────────────────────────────
  const displayFirstName = user.firstName  || user.first_name  || user.fullName?.split(' ')[0] || 'User';
  const displayLastName  = user.lastName   || user.last_name   || user.fullName?.split(' ')[1] || '';
  const displayCustomerId = user.customerId || user.customer_id || (isAdmin ? 'Administrator' : '');
  const avatarInitials   = `${displayFirstName[0] ?? ''}${displayLastName[0] ?? ''}`.toUpperCase() || 'U';

  // ── Logout handler ───────────────────────────────────────────────────────────
  const handleLogout = async () => {
    // Dispatch the Redux logout thunk (which calls /auth/logout on the server
    // and clears Redux state).
    await dispatch(logout());

    // Also ensure both localStorage session keys are gone, in case the thunk
    // only cleared 'token'.  The api.js interceptor would handle a 401, but
    // explicit cleanup here is safer.
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('user');

    // Navigate to the correct login page based on which context we were in.
    if (isAdmin) {
      navigate('/admin/login', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  // ── Close mobile sidebar on link click ──────────────────────────────────────
  const handleLinkClick = () => {
    dispatch(closeMobileSidebar());
  };

  // ─── Sidebar inner content ────────────────────────────────────────────────
  // Extracted into a variable so the identical JSX can be used for both the
  // desktop aside and the mobile drawer without duplication.
  const sidebarContent = (
    <div className="flex flex-col h-full">

      {/* ── Logo / brand block ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/[0.05] flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shadow-glow flex-shrink-0">
          {isAdmin
            ? <RiShieldCheckLine className="text-white text-lg" />
            : <RiBankLine        className="text-white text-lg" />
          }
        </div>

        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              key="brand-text"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x:   0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <p className="font-display font-700 text-white text-base leading-tight">
                Alister Bank
              </p>
              <p className="text-dark-300 text-xs">
                {isAdmin ? 'Admin Panel' : 'Digital Banking'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Primary navigation ──────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">

        {/* Section header — Banking / Administration */}
        {sidebarOpen && (
          <p className="text-dark-400 text-xs font-medium px-3 mb-2 uppercase tracking-widest select-none">
            {isAdmin ? 'Administration' : 'Banking'}
          </p>
        )}

        {primaryNavItems.map((item) => (
          <SidebarNavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            end={item.end}
            sidebarOpen={sidebarOpen}
            currentPath={currentPath}
            onClick={handleLinkClick}
          />
        ))}

        {/* ── Secondary / settings nav (customer only) ─────────────────── */}
        {secondaryNavItems.length > 0 && (
          <>
            {sidebarOpen && (
              <p className="text-dark-400 text-xs font-medium px-3 mb-2 mt-5 uppercase tracking-widest select-none">
                Settings
              </p>
            )}

            {!sidebarOpen && (
              /* Spacer to visually separate the two groups when collapsed */
              <div className="my-3 mx-3 border-t border-white/[0.06]" />
            )}

            {secondaryNavItems.map((item) => (
              <SidebarNavItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                end={item.end}
                sidebarOpen={sidebarOpen}
                currentPath={currentPath}
                onClick={handleLinkClick}
              />
            ))}
          </>
        )}
      </nav>

      {/* ── User identity block + logout ────────────────────────────────── */}
      <div className="px-3 pb-4 pt-3 border-t border-white/[0.05] flex-shrink-0">

        {/* User info card — only visible when sidebar is expanded */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              key="user-info"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] mb-2"
            >
              {/* Avatar badge */}
              <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-brand-400 text-xs font-bold">
                  {avatarInitials}
                </span>
              </div>

              {/* Name + ID */}
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate leading-tight">
                  {displayFirstName} {displayLastName}
                </p>
                <p className="text-dark-300 text-xs truncate">
                  {displayCustomerId}
                </p>
              </div>

              {/* Role pill */}
              {isAdmin && (
                <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
                  ADMIN
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <RiLogoutBoxLine className="text-lg flex-shrink-0" />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.span
                key="logout-label"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
                className="text-sm overflow-hidden whitespace-nowrap"
              >
                Logout
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Desktop sidebar — animated width collapse ──────────────────── */}
      <motion.aside
        animate={{ width: sidebarOpen ? 240 : 68 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="hidden lg:flex flex-col h-full bg-dark-800 border-r border-white/[0.05] overflow-hidden flex-shrink-0"
      >
        {sidebarContent}
      </motion.aside>

      {/* ── Mobile sidebar — slide-in drawer ───────────────────────────── */}
      <AnimatePresence>
        {sidebarMobileOpen && (
          <motion.aside
            key="mobile-sidebar"
            initial={{ x: -280 }}
            animate={{ x:    0 }}
            exit={{ x: -280 }}
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
