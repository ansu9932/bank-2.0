import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldAlert, LifeBuoy, ArrowRight, Clock } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · EXPIRED ONBOARDING LINK
   Professional terminal screen rendered the instant an expired/invalid secure
   onboarding link (Video KYC or Account Setup) is opened. The entry process is
   halted — no camera, no forms — and the user is given clear next steps.
   Theme: matte-black #0d0e12 · deep-crimson accents · crisp modern type.
   ────────────────────────────────────────────────────────────────────────── */

const CRIMSON = '#c8102e';

export default function ExpiredLinkPage({
  supportEmail = 'support@alisterbank.com',
  onRequestNew,
}) {
  const navigate = useNavigate();

  const handleRequestNew = () => {
    if (typeof onRequestNew === 'function') onRequestNew();
    else navigate('/open-account');
  };

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden px-5 py-12"
      style={{ background: '#0d0e12' }}
    >
      {/* Ambient crimson glows */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[620px] h-[620px] rounded-full blur-[150px]"
        style={{ background: 'radial-gradient(circle, rgba(200,16,46,0.18), transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full blur-[140px]"
        style={{ background: 'radial-gradient(circle, rgba(101,8,24,0.22), transparent 70%)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-lg rounded-3xl border border-white/[0.08] p-8 sm:p-10 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(21,22,28,0.92) 0%, rgba(13,14,18,0.96) 100%)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* Brand strip */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-red-500/40"
            style={{ background: 'rgba(255,255,255,0.04)', boxShadow: `0 0 18px ${CRIMSON}55` }}
          >
            <Clock size={17} style={{ color: '#ff4060' }} />
          </div>
          <p className="font-display font-bold tracking-tight text-white text-lg">
            ALISTER<span style={{ color: '#ff4060' }}> BANK</span>
          </p>
        </div>

        {/* Pulsing alert badge */}
        <motion.div
          animate={{
            boxShadow: [
              `0 0 26px ${CRIMSON}55`,
              `0 0 48px ${CRIMSON}99`,
              `0 0 26px ${CRIMSON}55`,
            ],
          }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6 border"
          style={{ borderColor: `${CRIMSON}66`, background: `${CRIMSON}14` }}
        >
          <ShieldAlert size={38} style={{ color: '#ff4060' }} />
        </motion.div>

        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
          Onboarding Link Expired
        </h1>

        <p className="text-dark-100 text-sm sm:text-[15px] leading-relaxed max-w-md mx-auto">
          This secure onboarding link has expired. Please contact support or request a new invitation.
        </p>

        {/* Actions */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={`mailto:${supportEmail}`}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm text-white/85 border border-white/[0.12] hover:border-white/[0.2] hover:bg-white/[0.04] transition-all"
          >
            <LifeBuoy size={16} /> Contact Support
          </a>
          <button
            type="button"
            onClick={handleRequestNew}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm text-white transition-all active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`,
              boxShadow: `0 0 28px ${CRIMSON}55`,
            }}
          >
            Request New Invitation <ArrowRight size={16} />
          </button>
        </div>

        <p className="mt-8 text-[11px] text-dark-300 tracking-wide">
          For your security, onboarding invitations remain valid for 24 hours after issuance.
        </p>
      </motion.div>
    </div>
  );
}
