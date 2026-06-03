import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck, Zap, Fingerprint, ArrowRight, Lock, Menu, X,
  CheckCircle2, Banknote, Globe2,
} from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · PUBLIC LANDING PAGE
   An ultra-modern, minimal public homepage for a luxury digital neobank.
   Theme: matte-black #0d0e12 · deep-crimson accents · crisp modern type.
   Blocks: sticky nav · hero grid · 3-column features · compliance footer.
   ────────────────────────────────────────────────────────────────────────── */

const CRIMSON = '#c8102e';
const MATTE = '#0d0e12';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Security', href: '#security' },
  { label: 'Wealth', href: '#wealth' },
];

const FEATURES = [
  {
    icon: Zap,
    title: 'Instant Valet Clearing',
    desc: 'Settlements clear in milliseconds across IMPS, NEFT and RTGS rails — your money moves the instant you do.',
  },
  {
    icon: Lock,
    title: 'Cryptographic Vaults',
    desc: 'Every balance is sealed behind AES-256 vaults and segregated custody, audited continuously around the clock.',
  },
  {
    icon: Fingerprint,
    title: 'Biometric Safeguards',
    desc: 'Liveness-verified onboarding and device-bound biometrics keep your identity exclusively yours.',
  },
];

// ─── Brand mark ───────────────────────────────────────────────────────────────
function BrandLogo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center border border-red-500/40 transition-shadow"
        style={{ background: 'rgba(255,255,255,0.04)', boxShadow: `0 0 18px ${CRIMSON}55` }}
      >
        <Banknote size={18} style={{ color: '#ff4060' }} />
      </div>
      <div className="leading-none">
        <p className="font-display font-bold tracking-tight text-white text-[17px]">
          ALISTER<span style={{ color: '#ff4060' }}> BANK</span>
        </p>
        <p className="text-[9px] tracking-[0.32em] text-white/40 uppercase mt-0.5">Private Digital</p>
      </div>
    </Link>
  );
}

// ─── Sticky navigation header ──────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 w-full transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(13,14,18,0.82)' : 'transparent',
        backdropFilter: scrolled ? 'blur(14px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
      }}
    >
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-5 sm:px-8 py-4">
        {/* Left — brand logo */}
        <BrandLogo />

        {/* Center — section links */}
        <div className="hidden md:flex items-center gap-9 absolute left-1/2 -translate-x-1/2">
          {NAV_LINKS.map((l) => (
            <a key={l.label} href={l.href}
              className="text-sm font-medium text-white/65 hover:text-white transition-colors relative group">
              {l.label}
              <span className="absolute -bottom-1.5 left-0 h-px w-0 group-hover:w-full transition-all duration-300"
                style={{ background: CRIMSON }} />
            </a>
          ))}
        </div>

        {/* Right — login + open account */}
        <div className="hidden md:flex items-center gap-5">
          <Link to="/login" className="text-sm font-semibold text-white/80 hover:text-white transition-colors">
            Login
          </Link>
          <Link to="/open-account"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
            style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`, boxShadow: `0 0 24px ${CRIMSON}55` }}>
            Open Account <ArrowRight size={15} />
          </Link>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-white p-1" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle menu">
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="md:hidden px-5 pb-5 pt-1 space-y-3 border-t border-white/[0.06]"
          style={{ background: 'rgba(13,14,18,0.96)' }}>
          {NAV_LINKS.map((l) => (
            <a key={l.label} href={l.href} onClick={() => setMenuOpen(false)}
              className="block text-sm font-medium text-white/70 hover:text-white py-1.5">
              {l.label}
            </a>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <Link to="/login" onClick={() => setMenuOpen(false)}
              className="flex-1 text-center text-sm font-semibold text-white/80 py-2.5 rounded-xl border border-white/[0.12]">
              Login
            </Link>
            <Link to="/open-account" onClick={() => setMenuOpen(false)}
              className="flex-1 text-center text-sm font-semibold text-white py-2.5 rounded-xl"
              style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)` }}>
              Open Account
            </Link>
          </div>
        </motion.div>
      )}
    </header>
  );
}

// ─── Hero block ────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden" id="wealth">
      {/* Ambient crimson glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[760px] h-[760px] rounded-full blur-[170px]"
        style={{ background: 'radial-gradient(circle, rgba(200,16,46,0.16), transparent 70%)' }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(200,16,46,0.5) 1px, transparent 1px),linear-gradient(90deg, rgba(200,16,46,0.5) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse 70% 55% at 50% 30%, #000 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 30%, #000 30%, transparent 80%)',
        }} />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32 grid lg:grid-cols-12 gap-12 items-center">
        {/* Left — headline + CTA */}
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] mb-7">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: CRIMSON }} />
            <span className="text-[11px] font-medium tracking-widest uppercase text-white/55">
              Now onboarding private members
            </span>
          </div>

          <h1 className="font-display font-bold text-white tracking-tight leading-[1.05] text-5xl sm:text-6xl lg:text-7xl">
            The Future of Wealth.
            <br />
            <span className="text-gradient-red">Redefined.</span>
          </h1>

          <p className="mt-7 text-base sm:text-lg text-white/55 leading-relaxed max-w-xl">
            Banking engineered for the next era — <span className="text-white/85">zero hidden fees</span>,
            transparent by design, and protected by <span className="text-white/85">enterprise-grade security
            frameworks</span> trusted across global markets.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Link to="/open-account"
              className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl text-sm font-semibold tracking-wide uppercase text-white transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`, boxShadow: `0 0 34px ${CRIMSON}66` }}>
              Open Your Account <ArrowRight size={17} />
            </Link>
            <Link to="/login"
              className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl text-sm font-semibold tracking-wide uppercase text-white/80 border border-white/[0.12] hover:border-white/[0.24] hover:bg-white/[0.04] transition-all">
              Member Login
            </Link>
          </div>

          {/* Trust badges */}
          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3">
            {['Zero hidden fees', 'Enterprise protection', 'Insured deposits'].map((t) => (
              <div key={t} className="flex items-center gap-2 text-white/55 text-sm">
                <CheckCircle2 size={16} style={{ color: '#ff4060' }} /> {t}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right — floating premium card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, rotate: -3 }} animate={{ opacity: 1, scale: 1, rotate: -4 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="lg:col-span-5 flex justify-center lg:justify-end">
          <motion.div
            animate={{ y: [0, -12, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="relative w-[330px] h-[210px] rounded-3xl p-6 flex flex-col justify-between overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #c8102e 0%, #8b0000 50%, #3d0010 100%)',
              boxShadow: '0 30px 80px rgba(200,16,46,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
            }}>
            <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex items-center justify-between">
              <span className="font-display font-bold tracking-wide text-white text-lg">ALISTER</span>
              <Globe2 size={22} className="text-white/80" />
            </div>
            <div className="relative">
              <div className="w-11 h-8 rounded-md bg-yellow-400/80 mb-4" />
              <p className="font-mono tracking-[0.22em] text-white text-lg balance-display">4141 •••• •••• 2030</p>
            </div>
            <div className="relative flex items-center justify-between text-white/80 text-xs">
              <span className="tracking-widest uppercase">Private Member</span>
              <span className="font-semibold tracking-wide">VISA INFINITE</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Features block (3-column with crimson hover glow) ─────────────────────────
function Features() {
  return (
    <section id="features" className="relative max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <p className="text-[11px] font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: '#ff4060' }}>
          Core Capabilities
        </p>
        <h2 className="font-display font-bold text-white text-3xl sm:text-4xl tracking-tight">
          Built for the discerning few
        </h2>
        <p className="mt-4 text-white/50 text-base">
          Precision-engineered primitives that make modern private banking effortless and absolute.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map(({ icon: Icon, title, desc }, i) => (
          <motion.div key={title}
            initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="feature-card group relative rounded-2xl p-7 border transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, rgba(21,22,28,0.9) 0%, rgba(13,14,18,0.95) 100%)', borderColor: 'rgba(255,255,255,0.07)' }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 border transition-all duration-300"
              style={{ borderColor: `${CRIMSON}40`, background: `${CRIMSON}14` }}>
              <Icon size={22} style={{ color: '#ff4060' }} />
            </div>
            <h3 className="font-display font-bold text-white text-xl tracking-tight mb-2.5">{title}</h3>
            <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
          </motion.div>
        ))}
      </div>

      {/* Security strip */}
      <div id="security"
        className="mt-16 rounded-3xl border border-white/[0.07] p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-6 sm:gap-10"
        style={{ background: 'linear-gradient(135deg, rgba(200,16,46,0.08), rgba(13,14,18,0.6))' }}>
        <div className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center border"
          style={{ borderColor: `${CRIMSON}55`, background: `${CRIMSON}16`, boxShadow: `0 0 30px ${CRIMSON}44` }}>
          <ShieldCheck size={30} style={{ color: '#ff4060' }} />
        </div>
        <div className="text-center sm:text-left">
          <h3 className="font-display font-bold text-white text-2xl tracking-tight">Security without compromise</h3>
          <p className="mt-2 text-white/55 text-sm sm:text-base max-w-2xl">
            Hardware-isolated key custody, continuous fraud surveillance and TLS 1.3 transport secure every interaction —
            so your wealth stays untouchable.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Compliance footer ──────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06]" style={{ background: 'rgba(8,9,12,0.6)' }}>
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand + declaration */}
          <div className="md:col-span-2">
            <BrandLogo />
            <p className="mt-5 text-white/45 text-sm leading-relaxed max-w-md">
              Alister Bank is a digital-first private banking platform. All deposits are held in segregated,
              insured custody accounts in accordance with applicable banking regulations.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {['IFSC: ALST0000001', 'SWIFT: ALSTINBB', 'License No. NBFC-2024-0099'].map((b) => (
                <span key={b} className="text-[11px] font-mono tracking-wide text-white/55 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.02]">
                  {b}
                </span>
              ))}
            </div>
          </div>

          {/* Product links */}
          <div>
            <p className="text-white font-semibold text-sm mb-4">Platform</p>
            <ul className="space-y-3 text-sm text-white/50">
              <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
              <li><a href="#security" className="hover:text-white transition-colors">Security</a></li>
              <li><Link to="/open-account" className="hover:text-white transition-colors">Open Account</Link></li>
              <li><Link to="/login" className="hover:text-white transition-colors">Member Login</Link></li>
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <p className="text-white font-semibold text-sm mb-4">Regulatory</p>
            <ul className="space-y-3 text-sm text-white/50">
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Deposit Insurance</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Grievance Redressal</a></li>
            </ul>
          </div>
        </div>

        {/* Disclosures */}
        <div className="mt-12 pt-8 border-t border-white/[0.06] space-y-4">
          <p className="text-white/35 text-xs leading-relaxed">
            Disclosures: Alister Bank Ltd. is regulated under the Banking Regulation Act. Deposits are insured up to the
            statutory limit per depositor through the Deposit Insurance and Credit Guarantee framework. Investment and
            wealth products are subject to market risk; past performance is not indicative of future results. Annual
            Percentage Yields are variable and may change without notice. This site is a fictional demonstration and not
            a solicitation for actual banking services.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-white/40 text-xs">© {new Date().getFullYear()} Alister Bank. All rights reserved.</p>
            <div className="flex items-center gap-2 text-white/40 text-xs">
              <Lock size={13} style={{ color: '#ff4060' }} />
              <span>Secured with bank-grade TLS 1.3 encryption</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="min-h-screen w-full text-white" style={{ background: MATTE }}>
      {/* Scoped hover glow for feature cards */}
      <style>{`
        .feature-card:hover {
          border-color: ${CRIMSON} !important;
          box-shadow: 0 0 0 1px ${CRIMSON}, 0 18px 50px rgba(200,16,46,0.28);
          transform: translateY(-4px);
        }
      `}</style>

      <Navbar />
      <main>
        <Hero />
        <Features />
      </main>
      <Footer />
    </div>
  );
}
