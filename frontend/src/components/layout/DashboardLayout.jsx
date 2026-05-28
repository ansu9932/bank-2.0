import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { fetchAccount } from '../../store/slices/accountSlice';
import { fetchNotifications } from '../../store/slices/notificationSlice';
import { fetchTransactions } from '../../store/slices/transactionSlice';
import { useSelector } from 'react-redux';
import { closeMobileSidebar } from '../../store/slices/uiSlice';

export default function DashboardLayout() {
  const dispatch = useDispatch();
  const { sidebarOpen, sidebarMobileOpen } = useSelector(s => s.ui);

  useEffect(() => {
    dispatch(fetchAccount());
    dispatch(fetchNotifications());
    dispatch(fetchTransactions({ limit: 20 }));

    // Poll notifications every 30 seconds
    const interval = setInterval(() => dispatch(fetchNotifications()), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-dark-900">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-30 lg:hidden"
            onClick={() => dispatch(closeMobileSidebar())}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300`}>
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
