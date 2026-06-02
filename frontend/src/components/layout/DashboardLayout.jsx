import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { RiMenuLine, RiBankLine, RiCloseLine } from 'react-icons/ri';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { fetchAccount } from '../../store/slices/accountSlice';
import { fetchNotifications } from '../../store/slices/notificationSlice';
import { fetchTransactions } from '../../store/slices/transactionSlice';
import { toggleMobileSidebar, closeMobileSidebar } from '../../store/slices/uiSlice';

export default function DashboardLayout() {
  const dispatch = useDispatch();
  const { sidebarMobileOpen } = useSelector((s) => s.ui);

  // ── Initial data load + notification polling ──────────────────────────────
  useEffect(() => {
    dispatch(fetchAccount());
    dispatch(fetchNotifications());
    dispatch(fetchTransactions({ limit: 20 }));
    const interval = setInterval(() => dispatch(fetchNotifications()), 30000);
    return () => clearInterval(interval);
  }, [dispatch]);

  const openDrawer  = () => dispatch(toggleMobileSidebar());
  const closeDrawer = () => dispatch(closeMobileSidebar());


  return (
    <div className="flex h-screen overflow-hidden bg-dark-900">

      {/* ── 1. DESKTOP SIDEBAR — hidden on mobile, fixed column on md+ ─────── */}
      <aside className="hidden md:flex md:w-64 flex-shrink-0 flex-col bg-dark-800 border-r border-white/[0.05]">
        <Sidebar />
      </aside>

      {/* ── 3a. MOBILE BACKDROP — dismiss drawer on outside click ─────────── */}
      <div
        onClick={closeDrawer}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden transition-opacity duration-300 ${
          sidebarMobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* ── 3b. MOBILE SLIDE-OUT DRAWER ───────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-dark-800 border-r border-white/[0.05] flex flex-col transform transition-transform duration-300 ease-in-out md:hidden ${
          sidebarMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer close button */}
        <button
          onClick={closeDrawer}
          aria-label="Close menu"
          className="absolute top-4 right-3 p-2 rounded-lg text-dark-200 hover:text-white hover:bg-white/[0.06] transition-colors z-10"
        >
          <RiCloseLine className="text-xl" />
        </button>
        <Sidebar onNavigate={closeDrawer} />
      </aside>


      {/* ── 4. MAIN COLUMN — full width on mobile, scrolls vertically ─────── */}
      <div className="flex-1 flex flex-col min-w-0 w-full">

        {/* ── 2. STICKY MOBILE TOP BAR — logo + hamburger (mobile only) ───── */}
        <header className="flex md:hidden items-center justify-between h-14 px-4 flex-shrink-0 sticky top-0 z-30 border-b border-white/[0.05] bg-dark-800/80 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-glow">
              <RiBankLine className="text-white text-base" />
            </div>
            <span className="font-display font-700 text-white text-sm">Alister Bank</span>
          </div>
          <button
            onClick={openDrawer}
            aria-label="Open navigation menu"
            className="p-2 rounded-xl text-dark-200 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <RiMenuLine className="text-2xl" />
          </button>
        </header>

        {/* Desktop header (rich controls) — md+ only */}
        <div className="hidden md:block flex-shrink-0">
          <Topbar />
        </div>

        {/* Scrollable content panel */}
        <main className="flex-1 w-full overflow-y-auto overflow-x-hidden p-4 lg:p-6 page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
