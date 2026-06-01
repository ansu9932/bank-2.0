import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Mic, ShieldCheck, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ScanLine,
  Volume2, RefreshCw, Loader2, Fingerprint, Radio, Lock,
  Cpu, Wifi, Check, CreditCard, Zap, Power,
} from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · CYBER VIDEO KYC
   A 5-phase futuristic identity-verification wizard (state machine).
   Theme: deep-black #06060c, glassmorphism panels, neon cyan/green + red.
   ────────────────────────────────────────────────────────────────────────── */

// ─── Neon palette ─────────────────────────────────────────────────────────────
const NEON = {
  green: '#10b981',
  cyan:  '#06b6d4',
  red:   '#ef4444',
  blue:  '#3b82f6',
  violet:'#8b5cf6',
};

// ─── Step metadata ────────────────────────────────────────────────────────────
const STEPS = [
  { id: 0, label: 'Secure Link',   icon: Power },
  { id: 1, label: 'Face Align',    icon: ScanLine },
  { id: 2, label: 'Liveness',      icon: Fingerprint },
  { id: 3, label: 'Voice Key',     icon: Volume2 },
  { id: 4, label: 'ID Capture',    icon: CreditCard },
];


// ─── Glowing grid background ──────────────────────────────────────────────────
function GridBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Perspective grid */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(6,182,212,0.35) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(6,182,212,0.35) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, #000 35%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, #000 35%, transparent 80%)',
        }}
      />
      {/* Ambient glows */}
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[680px] h-[680px] rounded-full blur-[140px]"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.22), transparent 70%)' }}
      />
      <div
        className="absolute bottom-0 right-0 w-[480px] h-[480px] rounded-full blur-[130px]"
        style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.16), transparent 70%)' }}
      />
      {/* Scan sweep */}
      <motion.div
        className="absolute left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.5), transparent)' }}
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}


// ─── Reusable camera feed (attaches a shared MediaStream to a <video>) ────────
function CameraFeed({ stream, className = '', mirrored = true, style = {} }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const v = videoRef.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={className}
      style={{ transform: mirrored ? 'scaleX(-1)' : 'none', ...style }}
    />
  );
}

// ─── Top step indicator (5 nodes + neon connector) ───────────────────────────
function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 mb-8">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = s.icon;
        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                animate={{
                  borderColor: done ? NEON.green : active ? NEON.cyan : 'rgba(255,255,255,0.12)',
                  boxShadow: active
                    ? `0 0 18px ${NEON.cyan}88`
                    : done
                    ? `0 0 12px ${NEON.green}66`
                    : '0 0 0 transparent',
                }}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center bg-white/[0.03] backdrop-blur-md"
              >
                {done
                  ? <Check size={16} style={{ color: NEON.green }} />
                  : <Icon size={16} style={{ color: active ? NEON.cyan : '#5b5b73' }} />}
              </motion.div>
              <span
                className="text-[9px] sm:text-[10px] font-medium tracking-wider uppercase hidden sm:block"
                style={{ color: active ? NEON.cyan : done ? NEON.green : '#4b4b63' }}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-5 sm:w-10 h-px relative top-[-9px]">
                <div className="absolute inset-0 bg-white/10 rounded-full" />
                <motion.div
                  className="absolute inset-0 rounded-full origin-left"
                  initial={false}
                  animate={{ scaleX: done ? 1 : 0 }}
                  transition={{ duration: 0.4 }}
                  style={{ background: NEON.green, boxShadow: `0 0 8px ${NEON.green}` }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}


// ─── Small status pill used in the hardware check ────────────────────────────
function HardwareRow({ icon: Icon, label, state }) {
  // state: 'pending' | 'ok' | 'fail'
  const color = state === 'ok' ? NEON.green : state === 'fail' ? NEON.red : '#6b6b85';
  const text =
    state === 'ok' ? 'ONLINE' : state === 'fail' ? 'BLOCKED' : 'PENDING';
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center border"
          style={{ borderColor: `${color}55`, background: `${color}14` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-sm text-white/80 font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {state === 'pending' && (
          <motion.span
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: color }}
          />
        )}
        <span
          className="text-[11px] font-mono font-bold tracking-widest"
          style={{ color, textShadow: `0 0 10px ${color}99` }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}


// ─── STEP 1 · Camera permission & secure-link initialization ─────────────────
function Step1Setup({ stream, hw, initializing, error, onInitialize, onNext }) {
  return (
    <motion.div
      key="step1"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-md mx-auto"
    >
      <div className="text-center mb-6">
        <motion.div
          animate={{ boxShadow: [`0 0 24px ${NEON.cyan}44`, `0 0 40px ${NEON.cyan}77`, `0 0 24px ${NEON.cyan}44`] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="w-16 h-16 mx-auto rounded-2xl border border-cyan-400/40 bg-white/[0.04] flex items-center justify-center mb-4"
        >
          <Cpu size={28} style={{ color: NEON.cyan }} />
        </motion.div>
        <h2 className="text-xl font-bold text-white tracking-tight">System Initialization</h2>
        <p className="text-sm text-white/50 mt-1">
          Hardware diagnostics required before establishing the secure biometric link.
        </p>
      </div>

      <div className="space-y-3 mb-5">
        <HardwareRow icon={Camera} label="Optical Camera Sensor" state={hw.camera} />
        <HardwareRow icon={Mic} label="Audio Input Array" state={hw.mic} />
        <HardwareRow icon={Wifi} label="Encrypted Channel" state={hw.channel} />
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl border text-sm"
          style={{ borderColor: `${NEON.red}55`, background: `${NEON.red}12`, color: NEON.red }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {!stream ? (
        <button
          onClick={onInitialize}
          disabled={initializing}
          className="group relative w-full py-4 rounded-2xl font-semibold text-sm tracking-widest uppercase text-white overflow-hidden disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${NEON.cyan}, ${NEON.blue})`, boxShadow: `0 0 30px ${NEON.cyan}55` }}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {initializing
              ? <><Loader2 size={16} className="animate-spin" /> Establishing Link…</>
              : <><Power size={16} /> Initialize Secure Link</>}
          </span>
        </button>
      ) : (
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl font-semibold text-sm tracking-widest uppercase text-white flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${NEON.green}, ${NEON.cyan})`, boxShadow: `0 0 30px ${NEON.green}55` }}
        >
          <CheckCircle2 size={16} /> Link Active · Proceed
        </button>
      )}
    </motion.div>
  );
}


// ─── STEP 2 · Face alignment & distance check ────────────────────────────────
function Step2Alignment({ stream, onNext }) {
  // Mock "distance" calibration: user drags the neon slider to move closer.
  // value < 65  → OUT OF BOUNDS (red).  value >= 65 → IDEAL (green).
  const [distance, setDistance] = useState(28);
  const [holdMs, setHoldMs] = useState(0);
  const aligned = distance >= 65;

  // Hold the ideal frame for 2 solid seconds → auto-advance.
  useEffect(() => {
    if (!aligned) { setHoldMs(0); return; }
    const started = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - started;
      setHoldMs(elapsed);
      if (elapsed >= 2000) { clearInterval(id); onNext(); }
    }, 50);
    return () => clearInterval(id);
  }, [aligned, onNext]);

  const ringColor = aligned ? NEON.green : NEON.red;
  const holdPct = Math.min(100, (holdMs / 2000) * 100);

  return (
    <motion.div
      key="step2"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-md mx-auto flex flex-col items-center"
    >
      <h2 className="text-xl font-bold text-white tracking-tight mb-1 text-center">Facial Alignment</h2>
      <p className="text-sm text-white/50 mb-6 text-center">Center your face within the cybernetic boundary.</p>

      {/* Circular HUD */}
      <div className="relative w-72 h-72 sm:w-80 sm:h-80 mb-6">
        {/* Rotating dashed ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-dashed"
          style={{ borderColor: `${ringColor}66` }}
          animate={{ rotate: 360 }}
          transition={{ duration: aligned ? 6 : 18, repeat: Infinity, ease: 'linear' }}
        />
        {/* Glowing main ring */}
        <motion.div
          className="absolute inset-2 rounded-full border-4 overflow-hidden"
          animate={{ boxShadow: `0 0 38px ${ringColor}aa, inset 0 0 30px ${ringColor}55` }}
          style={{ borderColor: ringColor }}
        >
          <CameraFeed stream={stream} className="w-full h-full object-cover" />
          {/* Hold progress sweep */}
          {aligned && (
            <div className="absolute inset-0 rounded-full"
              style={{ background: `conic-gradient(${NEON.green} ${holdPct}%, transparent ${holdPct}%)`, opacity: 0.25 }} />
          )}
        </motion.div>

        {/* Corner ticks */}
        {[0, 90, 180, 270].map((deg) => (
          <div key={deg} className="absolute inset-0" style={{ transform: `rotate(${deg}deg)` }}>
            <div className="absolute top-[-6px] left-1/2 -translate-x-1/2 w-1 h-4 rounded-full"
              style={{ background: ringColor, boxShadow: `0 0 8px ${ringColor}` }} />
          </div>
        ))}

        {/* Center status badge */}
        <AnimatePresence>
          {aligned && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0 }}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full flex items-center gap-1.5"
              style={{ background: `${NEON.green}22`, border: `1px solid ${NEON.green}`, boxShadow: `0 0 16px ${NEON.green}88` }}
            >
              <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
                <CheckCircle2 size={14} style={{ color: NEON.green }} />
              </motion.span>
              <span className="text-[10px] font-bold tracking-widest" style={{ color: NEON.green }}>FRAME LOCKED</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* State banner */}
      <motion.div
        animate={{ borderColor: `${ringColor}66`, background: `${ringColor}10` }}
        className="w-full rounded-xl border px-4 py-3 mb-5 flex items-center justify-center gap-2"
      >
        {aligned
          ? <CheckCircle2 size={16} style={{ color: NEON.green }} />
          : <AlertTriangle size={16} style={{ color: NEON.red }} />}
        <span className="text-sm font-bold tracking-wide" style={{ color: ringColor }}>
          {aligned ? 'FRAME LOCKED — IDEAL DISTANCE' : 'OUT OF BOUNDS — MOVE CLOSER TO MONITOR'}
        </span>
      </motion.div>

      {/* Distance calibration slider */}
      <div className="w-full">
        <div className="flex items-center justify-between text-[10px] font-mono tracking-widest text-white/40 mb-2 uppercase">
          <span>Far</span><span>Distance Calibration</span><span>Close</span>
        </div>
        <input
          type="range" min="0" max="100" value={distance}
          onChange={(e) => setDistance(Number(e.target.value))}
          className="w-full cyber-range"
          style={{ accentColor: ringColor }}
        />
      </div>
    </motion.div>
  );
}


// ─── STEP 3 · Liveness head-movement check ───────────────────────────────────
const MOVES = [
  { key: 'left',  label: 'Rotate Head Left',   icon: ArrowLeft,  prompt: 'ROTATE HEAD LEFT' },
  { key: 'right', label: 'Look Directly Right', icon: ArrowRight, prompt: 'LOOK DIRECTLY RIGHT' },
  { key: 'up',    label: 'Tilt Head Upward',    icon: ArrowUp,    prompt: 'TILT HEAD UPWARD' },
  { key: 'down',  label: 'Tilt Head Downward',  icon: ArrowDown,  prompt: 'TILT HEAD DOWNWARD' },
];
// Quadrant arc geometry for a 4-part progress ring (each spans 90°, with a gap)
const ARCS = {
  up:    'M 100 8  A 92 92 0 0 1 192 100',
  right: 'M 192 100 A 92 92 0 0 1 100 192',
  down:  'M 100 192 A 92 92 0 0 1 8 100',
  left:  'M 8 100  A 92 92 0 0 1 100 8',
};

function Step3Liveness({ stream, onNext }) {
  const [done, setDone] = useState({ left: false, right: false, up: false, down: false });
  // active prompt = first incomplete move
  const activeMove = MOVES.find((m) => !done[m.key]) || MOVES[0];

  useEffect(() => {
    if (Object.values(done).every(Boolean)) {
      const t = setTimeout(onNext, 700);
      return () => clearTimeout(t);
    }
  }, [done, onNext]);

  const validate = (key) => setDone((d) => ({ ...d, [key]: true }));
  const completedCount = Object.values(done).filter(Boolean).length;

  return (
    <motion.div
      key="step3"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-md mx-auto flex flex-col items-center"
    >
      <h2 className="text-xl font-bold text-white tracking-tight mb-1 text-center">Liveness Detection</h2>
      <p className="text-sm text-white/50 mb-5 text-center">Perform each movement so the AI can confirm a live subject.</p>

      {/* Circular feed + quadrant ring */}
      <div className="relative w-64 h-64 mb-5">
        <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full -rotate-0">
          {Object.entries(ARCS).map(([key, d]) => (
            <path
              key={key} d={d} fill="none" strokeWidth="6" strokeLinecap="round"
              stroke={done[key] ? NEON.green : 'rgba(255,255,255,0.12)'}
              style={done[key] ? { filter: `drop-shadow(0 0 6px ${NEON.green})` } : {}}
            />
          ))}
        </svg>
        <div className="absolute inset-5 rounded-full overflow-hidden border border-white/15">
          <CameraFeed stream={stream} className="w-full h-full object-cover" />
        </div>
        {/* Holographic prompt */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeMove.key}
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <motion.div
              animate={{ y: [0, -6, 0], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              <activeMove.icon size={52} style={{ color: NEON.cyan, filter: `drop-shadow(0 0 12px ${NEON.cyan})` }} />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Animated command text */}
      <div className="h-7 mb-4">
        <AnimatePresence mode="wait">
          {completedCount < 4 && (
            <motion.p
              key={activeMove.key}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="text-sm font-bold tracking-[0.2em] uppercase"
              style={{ color: NEON.cyan, textShadow: `0 0 12px ${NEON.cyan}99` }}
            >
              ▸ {activeMove.prompt}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Mock validation buttons */}
      <div className="grid grid-cols-2 gap-3 w-full">
        {MOVES.map((m) => {
          const complete = done[m.key];
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              onClick={() => validate(m.key)}
              disabled={complete}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all"
              style={{
                borderColor: complete ? `${NEON.green}` : 'rgba(255,255,255,0.12)',
                background: complete ? `${NEON.green}14` : 'rgba(255,255,255,0.03)',
                color: complete ? NEON.green : '#cfcfe0',
                boxShadow: complete ? `0 0 16px ${NEON.green}44` : 'none',
              }}
            >
              {complete ? <CheckCircle2 size={16} /> : <Icon size={16} style={{ color: NEON.cyan }} />}
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] font-mono text-white/35 mt-4 tracking-widest">
        {completedCount}/4 GESTURES VALIDATED
      </p>
    </motion.div>
  );
}


// ─── STEP 4 · Verification code reading (voice biometric sim) ────────────────
function Step4VoiceCode({ onNext }) {
  const [code] = useState(() => String(Math.floor(1000 + Math.random() * 9000)));
  const [progress, setProgress] = useState(0);
  const [authenticated, setAuthenticated] = useState(false);

  // After 3 seconds the progress bar finishes → "Voice Print Authenticated" → advance.
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - started) / 3000) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(id);
        setAuthenticated(true);
        setTimeout(onNext, 1300);
      }
    }, 40);
    return () => clearInterval(id);
  }, [onNext]);

  return (
    <motion.div
      key="step4"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-md mx-auto"
    >
      {/* Recording pulse */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-white tracking-tight">Voice Biometrics</h2>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
          style={{ borderColor: `${NEON.red}55`, background: `${NEON.red}12` }}>
          <motion.span animate={{ opacity: [1, 0.2, 1], scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: Infinity }}
            className="w-2 h-2 rounded-full" style={{ background: NEON.red, boxShadow: `0 0 8px ${NEON.red}` }} />
          <span className="text-[10px] font-mono font-bold tracking-widest" style={{ color: NEON.red }}>REC</span>
        </div>
      </div>

      <p className="text-sm text-white/55 mb-5 flex items-center gap-2">
        <Radio size={15} style={{ color: NEON.cyan }} />
        Read the generated secure key out loud for biometric voice verification.
      </p>

      {/* Glowing digital code display */}
      <div
        className="relative rounded-2xl border py-9 mb-6 flex items-center justify-center overflow-hidden"
        style={{ borderColor: `${NEON.blue}55`, background: 'rgba(10,12,30,0.6)', boxShadow: `inset 0 0 40px ${NEON.blue}22` }}
      >
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: `repeating-linear-gradient(0deg, ${NEON.blue}33 0 1px, transparent 1px 4px)` }} />
        <span
          className="relative font-mono font-black text-6xl sm:text-7xl tracking-[0.35em] pl-[0.35em]"
          style={{ color: '#dbeafe', textShadow: `0 0 18px ${NEON.blue}, 0 0 40px ${NEON.blue}88` }}
        >
          {code}
        </span>
      </div>

      {/* Progress / status */}
      <AnimatePresence mode="wait">
        {!authenticated ? (
          <motion.div key="listening" exit={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-2 text-xs">
              <span className="font-mono tracking-widest text-white/50 flex items-center gap-1.5">
                <Volume2 size={13} style={{ color: NEON.cyan }} /> ANALYZING VOICE PRINT…
              </span>
              <span className="font-mono text-white/40">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div className="h-full rounded-full"
                style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${NEON.cyan}, ${NEON.blue})`, boxShadow: `0 0 12px ${NEON.cyan}` }} />
            </div>
            {/* Live waveform */}
            <div className="flex items-end justify-center gap-1 h-10 mt-4">
              {Array.from({ length: 28 }).map((_, i) => (
                <motion.span key={i} className="w-1 rounded-full" style={{ background: NEON.cyan }}
                  animate={{ height: [4, 8 + Math.random() * 26, 4] }}
                  transition={{ duration: 0.6 + Math.random() * 0.5, repeat: Infinity, delay: i * 0.03 }} />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="auth"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border"
            style={{ borderColor: NEON.green, background: `${NEON.green}14`, boxShadow: `0 0 24px ${NEON.green}55` }}
          >
            <CheckCircle2 size={18} style={{ color: NEON.green }} />
            <span className="text-sm font-bold tracking-widest" style={{ color: NEON.green }}>VOICE PRINT AUTHENTICATED</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


// ─── STEP 5 · AI document capture system ─────────────────────────────────────
function Step5Document({ stream, onComplete }) {
  const liveVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const [captured, setCaptured] = useState(null); // dataURL string
  const autoTimer = useRef(null);

  // Attach the shared stream to this step's own (un-mirrored, ID-oriented) video.
  useEffect(() => {
    const v = liveVideoRef.current;
    if (v && stream && !captured) {
      v.srcObject = stream;
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    }
  }, [stream, captured]);

  // Capture the current video frame to a canvas → still snapshot dataURL.
  const capture = useCallback(() => {
    const v = liveVideoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    setCaptured(c.toDataURL('image/png'));
  }, []);

  // AUTO-CAPTURE: after 4s of "stabilizing", auto-snap the ID frame.
  useEffect(() => {
    if (captured) return;
    autoTimer.current = setTimeout(() => capture(), 4000);
    return () => clearTimeout(autoTimer.current);
  }, [captured, capture]);

  const retake = () => setCaptured(null);

  return (
    <motion.div
      key="step5"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-lg mx-auto"
    >
      <h2 className="text-xl font-bold text-white tracking-tight mb-1 text-center">Document Capture</h2>
      <p className="text-sm text-white/50 mb-5 text-center">
        Position your ID card inside the frame. Auto-capture engages once stabilized.
      </p>

      {/* Wide ID-card oriented frame */}
      <div
        className="relative w-full rounded-2xl overflow-hidden border bg-black"
        style={{ aspectRatio: '1.586 / 1', borderColor: `${NEON.green}55`, boxShadow: `0 0 30px ${NEON.green}33` }}
      >
        {!captured ? (
          <>
            <video ref={liveVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            {/* Laser scan line (down & up) */}
            <motion.div
              className="absolute left-0 right-0 h-[3px]"
              style={{ background: `linear-gradient(90deg, transparent, ${NEON.green}, transparent)`, boxShadow: `0 0 16px ${NEON.green}` }}
              animate={{ top: ['4%', '96%', '4%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Corner brackets */}
            {[
              'top-3 left-3 border-t-2 border-l-2',
              'top-3 right-3 border-t-2 border-r-2',
              'bottom-3 left-3 border-b-2 border-l-2',
              'bottom-3 right-3 border-b-2 border-r-2',
            ].map((c, i) => (
              <div key={i} className={`absolute w-7 h-7 ${c}`} style={{ borderColor: NEON.green }} />
            ))}
            {/* Scanning chip */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full"
              style={{ background: `${NEON.green}1c`, border: `1px solid ${NEON.green}66` }}>
              <ScanLine size={13} style={{ color: NEON.green }} />
              <span className="text-[10px] font-mono tracking-widest" style={{ color: NEON.green }}>SCANNING…</span>
            </div>
          </>
        ) : (
          <motion.img
            initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
            src={captured} alt="Captured ID document" className="w-full h-full object-cover"
          />
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {/* Controls */}
      {!captured ? (
        // Manual shutter safeguard (absolute-centered under the frame)
        <div className="relative h-20">
          <button
            onClick={capture}
            className="absolute left-1/2 -translate-x-1/2 top-4 w-16 h-16 rounded-full flex items-center justify-center border-4"
            style={{ borderColor: `${NEON.green}`, background: 'rgba(255,255,255,0.06)', boxShadow: `0 0 24px ${NEON.green}66` }}
            aria-label="Capture ID"
          >
            <Camera size={24} style={{ color: NEON.green }} />
          </button>
        </div>
      ) : (
        <div className="flex gap-3 mt-5">
          <button
            onClick={retake}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase flex items-center justify-center gap-2 border text-white/80"
            style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)' }}
          >
            <RefreshCw size={16} /> Retake Photo
          </button>
          <button
            onClick={onComplete}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase flex items-center justify-center gap-2 text-white"
            style={{ background: `linear-gradient(135deg, ${NEON.green}, ${NEON.cyan})`, boxShadow: `0 0 26px ${NEON.green}55` }}
          >
            <ShieldCheck size={16} /> Confirm &amp; Process
          </button>
        </div>
      )}
    </motion.div>
  );
}


// ─── Completion screen ───────────────────────────────────────────────────────
function CompleteScreen() {
  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md mx-auto text-center"
    >
      <motion.div
        animate={{ boxShadow: [`0 0 30px ${NEON.green}55`, `0 0 60px ${NEON.green}99`, `0 0 30px ${NEON.green}55`] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-24 h-24 mx-auto rounded-full border-2 flex items-center justify-center mb-6"
        style={{ borderColor: NEON.green, background: `${NEON.green}14` }}
      >
        <ShieldCheck size={48} style={{ color: NEON.green }} />
      </motion.div>
      <h2 className="text-2xl font-bold text-white tracking-tight mb-2">Verification Complete</h2>
      <p className="text-sm text-white/55 mb-6">
        All five biometric phases passed. Your identity has been cryptographically sealed and queued for final review.
      </p>
      <div className="grid grid-cols-2 gap-2.5 text-left">
        {['Secure Link', 'Face Align', 'Liveness', 'Voice Key', 'ID Capture', 'Encryption'].map((label) => (
          <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03]">
            <CheckCircle2 size={14} style={{ color: NEON.green }} />
            <span className="text-xs text-white/70">{label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}


// ─── MAIN ORCHESTRATOR · 5-phase state machine ───────────────────────────────
export default function CyberVideoKYC() {
  const [step, setStep] = useState(0);                 // explicit workflow index (0..5)
  const [stream, setStream] = useState(null);          // shared MediaStream
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState('');
  const [hw, setHw] = useState({ camera: 'pending', mic: 'pending', channel: 'pending' });

  const next = useCallback(() => setStep((s) => Math.min(s + 1, 5)), []);

  // Request actual webcam + mic via the standard browser API.
  const initialize = useCallback(async () => {
    setError('');
    setInitializing(true);
    setHw({ camera: 'pending', mic: 'pending', channel: 'pending' });
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      setStream(media);
      const hasVideo = media.getVideoTracks().length > 0;
      const hasAudio = media.getAudioTracks().length > 0;
      // Staggered diagnostic reveal for a "systems coming online" feel.
      setTimeout(() => setHw((h) => ({ ...h, camera: hasVideo ? 'ok' : 'fail' })), 400);
      setTimeout(() => setHw((h) => ({ ...h, mic: hasAudio ? 'ok' : 'fail' })), 900);
      setTimeout(() => setHw((h) => ({ ...h, channel: 'ok' })), 1400);
    } catch (err) {
      setHw({ camera: 'fail', mic: 'fail', channel: 'fail' });
      setError(
        err?.name === 'NotAllowedError'
          ? 'Camera/microphone access denied. Please grant permission and retry.'
          : 'Unable to access hardware. Check that no other app is using the camera.'
      );
    } finally {
      setInitializing(false);
    }
  }, []);

  // Release all tracks on unmount.
  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()); }, [stream]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white" style={{ background: '#06060c' }}>
      <GridBackground />

      {/* Inline styles for the neon range thumb (scoped, no global CSS needed) */}
      <style>{`
        .cyber-range { -webkit-appearance:none; appearance:none; height:6px; border-radius:9999px;
          background:rgba(255,255,255,0.12); outline:none; }
        .cyber-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:22px; height:22px;
          border-radius:9999px; background:#06b6d4; cursor:pointer; border:3px solid #06060c;
          box-shadow:0 0 14px #06b6d4; }
        .cyber-range::-moz-range-thumb { width:22px; height:22px; border-radius:9999px; background:#06b6d4;
          cursor:pointer; border:3px solid #06060c; box-shadow:0 0 14px #06b6d4; }
      `}</style>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-5 sm:px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-cyan-400/40 bg-white/[0.04]"
              style={{ boxShadow: `0 0 18px ${NEON.cyan}44` }}>
              <Lock size={18} style={{ color: NEON.cyan }} />
            </div>
            <div>
              <p className="font-bold tracking-tight leading-none">ALISTER<span style={{ color: NEON.cyan }}> KYC</span></p>
              <p className="text-[10px] tracking-[0.3em] text-white/40 uppercase mt-0.5">Cyber Identity Engine</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]">
            <Zap size={12} style={{ color: NEON.green }} />
            <span className="text-[10px] font-mono tracking-widest text-white/60">AES-256 · SECURE SESSION</span>
          </div>
        </header>

        {/* Main panel */}
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 pb-10">
          <div className="w-full max-w-2xl">
            <StepIndicator current={step} />
            <div
              className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-6 sm:p-9"
              style={{ boxShadow: '0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)' }}
            >
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <Step1Setup
                    stream={stream} hw={hw} initializing={initializing} error={error}
                    onInitialize={initialize} onNext={next}
                  />
                )}
                {step === 1 && <Step2Alignment stream={stream} onNext={next} />}
                {step === 2 && <Step3Liveness stream={stream} onNext={next} />}
                {step === 3 && <Step4VoiceCode onNext={next} />}
                {step === 4 && <Step5Document stream={stream} onComplete={next} />}
                {step === 5 && <CompleteScreen />}
              </AnimatePresence>
            </div>

            {/* Phase footer */}
            <p className="text-center text-[10px] font-mono tracking-[0.3em] text-white/30 mt-6 uppercase">
              {step < 5 ? `Phase ${step + 1} of 5` : 'Session Sealed'} · Alister Bank Biometric Protocol
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
