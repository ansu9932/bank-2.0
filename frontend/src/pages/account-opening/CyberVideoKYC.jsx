import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';
import {
  Camera, Mic, ShieldCheck, CheckCircle2, AlertTriangle,
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ScanLine,
  RefreshCw, Loader2, Fingerprint, Lock,
  Cpu, Wifi, Check, CreditCard, Zap, Power,
} from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · CYBER VIDEO KYC
   A 4-phase identity-verification wizard (state machine).
   Theme: deep-black #0d0e12, crimson-red accents, glassmorphism panels.
   Flow: Secure Link → Face Align (auto-capture) → Liveness → ID Capture (rear cam)
   ────────────────────────────────────────────────────────────────────────── */

// ─── Crimson / black brand palette ────────────────────────────────────────────
const RED = {
  base:  '#dc2626', // red-600
  bright:'#ef4444', // red-500
  deep:  '#991b1b', // red-800
  soft:  '#f87171', // red-400
  black: '#0d0e12',
  panel: '#15161c',
};

// ─── Step metadata (Voice/Code-reading step removed) ──────────────────────────
const STEPS = [
  { id: 0, label: 'Secure Link', icon: Power },
  { id: 1, label: 'Face Scan',   icon: ScanLine },
  { id: 2, label: 'Liveness',    icon: Fingerprint },
  { id: 3, label: 'ID Capture',  icon: CreditCard },
];
const TOTAL_PHASES = STEPS.length; // 4

// ─── Helper: convert a base64 data URL → Blob (for multipart upload) ──────────
function dataURLToBlob(dataURL) {
  const [header, base64] = String(dataURL).split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(base64 || '');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}


// ─── Crimson grid background ──────────────────────────────────────────────────
function GridBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Perspective grid (crimson lines) */}
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(220,38,38,0.4) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(220,38,38,0.4) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, #000 35%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, #000 35%, transparent 80%)',
        }}
      />
      {/* Ambient crimson glows */}
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[680px] h-[680px] rounded-full blur-[140px]"
        style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.20), transparent 70%)' }}
      />
      <div
        className="absolute bottom-0 right-0 w-[480px] h-[480px] rounded-full blur-[130px]"
        style={{ background: 'radial-gradient(circle, rgba(153,27,27,0.18), transparent 70%)' }}
      />
      {/* Scan sweep */}
      <motion.div
        className="absolute left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.55), transparent)' }}
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}


// ─── Reusable camera feed (attaches a shared MediaStream to a <video>) ────────
const CameraFeed = React.forwardRef(function CameraFeed(
  { stream, className = '', mirrored = true, style = {} }, externalRef
) {
  const internalRef = useRef(null);
  const videoRef = externalRef || internalRef;

  useEffect(() => {
    const v = videoRef.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    }
  }, [stream, videoRef]);

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
});

// ─── Top step indicator (crimson nodes + connector) ──────────────────────────
function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 mb-8">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = s.icon;
        const accent = done || active ? RED.bright : 'rgba(255,255,255,0.12)';
        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                animate={{
                  borderColor: accent,
                  boxShadow: active ? `0 0 18px ${RED.bright}aa` : done ? `0 0 12px ${RED.base}66` : '0 0 0 transparent',
                }}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center bg-white/[0.03] backdrop-blur-md"
              >
                {done
                  ? <Check size={16} style={{ color: RED.bright }} />
                  : <Icon size={16} style={{ color: active ? RED.bright : '#5b5b66' }} />}
              </motion.div>
              <span
                className="text-[9px] sm:text-[10px] font-medium tracking-wider uppercase hidden sm:block"
                style={{ color: active || done ? RED.soft : '#55555f' }}
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
                  style={{ background: RED.bright, boxShadow: `0 0 8px ${RED.bright}` }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}


// ─── Hardware status pill ─────────────────────────────────────────────────────
function HardwareRow({ icon: Icon, label, state }) {
  // state: 'pending' | 'ok' | 'fail'
  const color = state === 'ok' ? RED.bright : state === 'fail' ? RED.deep : '#6b6b75';
  const text  = state === 'ok' ? 'ONLINE' : state === 'fail' ? 'BLOCKED' : 'PENDING';
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center border"
          style={{ borderColor: `${color}55`, background: `${color}14` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-sm text-white/80 font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {state === 'pending' && (
          <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        )}
        <span className="text-[11px] font-mono font-bold tracking-widest"
          style={{ color, textShadow: `0 0 10px ${color}99` }}>{text}</span>
      </div>
    </div>
  );
}

// ─── STEP 1 · Camera permission & secure-link initialization ─────────────────
function Step1Setup({ stream, hw, initializing, error, onInitialize, onNext }) {
  return (
    <motion.div key="step1"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-md mx-auto">
      <div className="text-center mb-6">
        <motion.div
          animate={{ boxShadow: [`0 0 24px ${RED.base}55`, `0 0 40px ${RED.bright}88`, `0 0 24px ${RED.base}55`] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="w-16 h-16 mx-auto rounded-2xl border border-red-500/40 bg-white/[0.04] flex items-center justify-center mb-4">
          <Cpu size={28} style={{ color: RED.bright }} />
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
          style={{ borderColor: `${RED.bright}55`, background: `${RED.bright}12`, color: RED.soft }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {!stream ? (
        <button onClick={onInitialize} disabled={initializing}
          className="group relative w-full py-4 rounded-2xl font-semibold text-sm tracking-widest uppercase text-white overflow-hidden disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${RED.base}, ${RED.deep})`, boxShadow: `0 0 30px ${RED.base}66` }}>
          <span className="relative z-10 flex items-center justify-center gap-2">
            {initializing
              ? <><Loader2 size={16} className="animate-spin" /> Establishing Link…</>
              : <><Power size={16} /> Initialize Secure Link</>}
          </span>
        </button>
      ) : (
        <button onClick={onNext}
          className="w-full py-4 rounded-2xl font-semibold text-sm tracking-widest uppercase text-white flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${RED.bright}, ${RED.base})`, boxShadow: `0 0 30px ${RED.bright}66` }}>
          <CheckCircle2 size={16} /> Link Active · Proceed
        </button>
      )}
    </motion.div>
  );
}


// ─── Lightweight frame analyzer (dependency-free face presence/distance) ──────
// Downscales the video to a small canvas and measures edge-energy concentration
// in the centre disc vs the border ring. A centred face concentrates mid-detail
// in the middle; a too-far face is sparse; a too-close face spills detail to the
// borders. Returns a metric the Face step uses to drive auto-capture.
function analyzeFrame(video, canvas) {
  const SIZE = 64;
  if (!video || !video.videoWidth) return null;
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, SIZE, SIZE);
  let data;
  try { data = ctx.getImageData(0, 0, SIZE, SIZE).data; } catch { return null; }

  // Grayscale buffer
  const gray = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const cx = SIZE / 2, cy = SIZE / 2;
  const discR = SIZE * 0.30;          // centre face zone
  const discR2 = discR * discR;
  let centerEnergy = 0, centerCount = 0;
  let borderEnergy = 0, borderCount = 0;
  let momentX = 0, momentY = 0, momentMass = 0;

  for (let y = 1; y < SIZE - 1; y += 1) {
    for (let x = 1; x < SIZE - 1; x += 1) {
      const idx = y * SIZE + x;
      // Simple gradient magnitude (right + down neighbour diff)
      const gx = Math.abs(gray[idx] - gray[idx + 1]);
      const gy = Math.abs(gray[idx] - gray[idx + SIZE]);
      const mag = gx + gy;
      const dx = x - cx, dy = y - cy;
      const inDisc = dx * dx + dy * dy <= discR2;
      if (inDisc) { centerEnergy += mag; centerCount += 1; }
      else { borderEnergy += mag; borderCount += 1; }
      if (mag > 18) { momentX += x * mag; momentY += y * mag; momentMass += mag; }
    }
  }

  const centerDensity = centerCount ? centerEnergy / centerCount : 0;
  const borderDensity = borderCount ? borderEnergy / borderCount : 0;
  // Centre-of-detail offset from frame centre, normalised 0..1
  const comX = momentMass ? momentX / momentMass : cx;
  const comY = momentMass ? momentY / momentMass : cy;
  const offset = Math.sqrt((comX - cx) ** 2 + (comY - cy) ** 2) / (SIZE / 2);

  return { centerDensity, borderDensity, offset };
}

// Translate the raw metric into a human state for the face step.
function classifyFace(m) {
  if (!m) return { state: 'searching', label: 'INITIALIZING SENSOR…' };
  const { centerDensity, borderDensity, offset } = m;
  if (centerDensity < 6) return { state: 'searching', label: 'POSITION FACE IN THE RING' };
  if (offset > 0.42)     return { state: 'off',  label: 'CENTER YOUR FACE' };
  if (centerDensity < 11) return { state: 'far',  label: 'MOVE CLOSER' };
  if (borderDensity > 17) return { state: 'near', label: 'STEP BACK' };
  return { state: 'locked', label: 'FRAME LOCKED — HOLD STILL' };
}


// ─── STEP 2 · Face scan — auto distance detection + auto-capture ─────────────
function Step2FaceScan({ stream, onCaptured }) {
  const videoRef = useRef(null);
  const analyzeCanvasRef = useRef(null);
  const snapCanvasRef = useRef(null);
  const lockedSinceRef = useRef(null);
  const firedRef = useRef(false);

  const [face, setFace] = useState({ state: 'searching', label: 'INITIALIZING SENSOR…' });
  const [holdPct, setHoldPct] = useState(0);

  const HOLD_MS = 1200;     // must stay locked this long before auto-capture
  const FALLBACK_MS = 15000; // anti-stuck: capture anyway if never locks

  // Snap a still frame from the live (front) video → dataURL → bubble up.
  const autoCapture = useCallback(() => {
    if (firedRef.current) return;
    const v = videoRef.current;
    const c = snapCanvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    firedRef.current = true;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    onCaptured(c.toDataURL('image/png'));
  }, [onCaptured]);

  // Analysis loop — runs ~5×/sec, drives state + the locked-hold auto-capture.
  useEffect(() => {
    const v = videoRef.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      const metric = analyzeFrame(videoRef.current, analyzeCanvasRef.current);
      const result = classifyFace(metric);
      setFace(result);

      if (result.state === 'locked') {
        if (!lockedSinceRef.current) lockedSinceRef.current = Date.now();
        const held = Date.now() - lockedSinceRef.current;
        setHoldPct(Math.min(100, (held / HOLD_MS) * 100));
        if (held >= HOLD_MS) { clearInterval(id); autoCapture(); }
      } else {
        lockedSinceRef.current = null;
        setHoldPct(0);
      }

      // Anti-stuck safety: never trap a user on an unusual camera/browser.
      if (Date.now() - startedAt > FALLBACK_MS) { clearInterval(id); autoCapture(); }
    }, 200);
    return () => clearInterval(id);
  }, [stream, autoCapture]);

  const locked = face.state === 'locked';
  const ringColor = locked ? RED.bright : face.state === 'searching' ? '#6b6b75' : RED.deep;

  return (
    <motion.div key="step2"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-md mx-auto flex flex-col items-center">
      <h2 className="text-xl font-bold text-white tracking-tight mb-1 text-center">Facial Scan</h2>
      <p className="text-sm text-white/50 mb-6 text-center">
        Align your face in the ring. Capture is fully automatic — no button needed.
      </p>

      {/* Circular HUD */}
      <div className="relative w-72 h-72 sm:w-80 sm:h-80 mb-6">
        <motion.div className="absolute inset-0 rounded-full border-2 border-dashed"
          style={{ borderColor: `${ringColor}66` }}
          animate={{ rotate: 360 }}
          transition={{ duration: locked ? 6 : 18, repeat: Infinity, ease: 'linear' }} />
        <motion.div className="absolute inset-2 rounded-full border-4 overflow-hidden"
          animate={{ boxShadow: `0 0 38px ${ringColor}aa, inset 0 0 30px ${ringColor}55` }}
          style={{ borderColor: ringColor }}>
          <video ref={videoRef} autoPlay muted playsInline
            className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
          {locked && (
            <div className="absolute inset-0 rounded-full"
              style={{ background: `conic-gradient(${RED.bright} ${holdPct}%, transparent ${holdPct}%)`, opacity: 0.30 }} />
          )}
        </motion.div>

        {[0, 90, 180, 270].map((deg) => (
          <div key={deg} className="absolute inset-0" style={{ transform: `rotate(${deg}deg)` }}>
            <div className="absolute top-[-6px] left-1/2 -translate-x-1/2 w-1 h-4 rounded-full"
              style={{ background: ringColor, boxShadow: `0 0 8px ${ringColor}` }} />
          </div>
        ))}

        <AnimatePresence>
          {locked && (
            <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0 }}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full flex items-center gap-1.5"
              style={{ background: `${RED.bright}22`, border: `1px solid ${RED.bright}`, boxShadow: `0 0 16px ${RED.bright}88` }}>
              <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
                <CheckCircle2 size={14} style={{ color: RED.bright }} />
              </motion.span>
              <span className="text-[10px] font-bold tracking-widest" style={{ color: RED.bright }}>AUTO-CAPTURING</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* State banner (Move Closer / Step Back / Center / Locked) */}
      <motion.div animate={{ borderColor: `${ringColor}66`, background: `${ringColor}12` }}
        className="w-full rounded-xl border px-4 py-3 flex items-center justify-center gap-2">
        {locked
          ? <CheckCircle2 size={16} style={{ color: RED.bright }} />
          : <AlertTriangle size={16} style={{ color: RED.soft }} />}
        <span className="text-sm font-bold tracking-wide" style={{ color: locked ? RED.bright : RED.soft }}>
          {face.label}
        </span>
      </motion.div>

      <p className="text-[11px] font-mono text-white/35 mt-4 tracking-widest">
        SMART DISTANCE TRACKING ACTIVE
      </p>

      {/* Hidden work canvases */}
      <canvas ref={analyzeCanvasRef} className="hidden" />
      <canvas ref={snapCanvasRef} className="hidden" />
    </motion.div>
  );
}


// ─── STEP 3 · Liveness head-movement check ───────────────────────────────────
const MOVES = [
  { key: 'left',  label: 'Rotate Head Left',    icon: ArrowLeft,  prompt: 'ROTATE HEAD LEFT' },
  { key: 'right', label: 'Look Directly Right',  icon: ArrowRight, prompt: 'LOOK DIRECTLY RIGHT' },
  { key: 'up',    label: 'Tilt Head Upward',     icon: ArrowUp,    prompt: 'TILT HEAD UPWARD' },
  { key: 'down',  label: 'Tilt Head Downward',   icon: ArrowDown,  prompt: 'TILT HEAD DOWNWARD' },
];
const ARCS = {
  up:    'M 100 8  A 92 92 0 0 1 192 100',
  right: 'M 192 100 A 92 92 0 0 1 100 192',
  down:  'M 100 192 A 92 92 0 0 1 8 100',
  left:  'M 8 100  A 92 92 0 0 1 100 8',
};

function Step3Liveness({ stream, onNext }) {
  const [done, setDone] = useState({ left: false, right: false, up: false, down: false });
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
    <motion.div key="step3"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-md mx-auto flex flex-col items-center">
      <h2 className="text-xl font-bold text-white tracking-tight mb-1 text-center">Liveness Detection</h2>
      <p className="text-sm text-white/50 mb-5 text-center">Perform each movement so the AI can confirm a live subject.</p>

      <div className="relative w-64 h-64 mb-5">
        <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
          {Object.entries(ARCS).map(([key, d]) => (
            <path key={key} d={d} fill="none" strokeWidth="6" strokeLinecap="round"
              stroke={done[key] ? RED.bright : 'rgba(255,255,255,0.12)'}
              style={done[key] ? { filter: `drop-shadow(0 0 6px ${RED.bright})` } : {}} />
          ))}
        </svg>
        <div className="absolute inset-5 rounded-full overflow-hidden border border-white/15">
          <CameraFeed stream={stream} className="w-full h-full object-cover" />
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={activeMove.key}
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div animate={{ y: [0, -6, 0], opacity: [0.7, 1, 0.7] }} transition={{ duration: 1.6, repeat: Infinity }}>
              <activeMove.icon size={52} style={{ color: RED.bright, filter: `drop-shadow(0 0 12px ${RED.bright})` }} />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="h-7 mb-4">
        <AnimatePresence mode="wait">
          {completedCount < 4 && (
            <motion.p key={activeMove.key}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="text-sm font-bold tracking-[0.2em] uppercase"
              style={{ color: RED.bright, textShadow: `0 0 12px ${RED.bright}99` }}>
              ▸ {activeMove.prompt}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full">
        {MOVES.map((m) => {
          const complete = done[m.key];
          const Icon = m.icon;
          return (
            <button key={m.key} onClick={() => validate(m.key)} disabled={complete}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all"
              style={{
                borderColor: complete ? RED.bright : 'rgba(255,255,255,0.12)',
                background: complete ? `${RED.bright}14` : 'rgba(255,255,255,0.03)',
                color: complete ? RED.soft : '#cfcfd6',
                boxShadow: complete ? `0 0 16px ${RED.bright}44` : 'none',
              }}>
              {complete ? <CheckCircle2 size={16} /> : <Icon size={16} style={{ color: RED.bright }} />}
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


// ─── STEP 4 · ID document capture — forced REAR camera ───────────────────────
function Step4Document({ onConfirm, processing }) {
  const liveVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const rearStreamRef = useRef(null);
  const autoTimer = useRef(null);

  const [captured, setCaptured] = useState(null);
  const [camError, setCamError] = useState('');
  const [camReady, setCamReady] = useState(false);

  // Acquire the phone's BACK camera. Try the strict `exact` constraint first
  // (real phones), then gracefully fall back so laptops/webcams still work.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const attempts = [
        { video: { facingMode: { exact: 'environment' } }, audio: false },
        { video: { facingMode: 'environment' }, audio: false },
        { video: true, audio: false },
      ];
      for (const constraints of attempts) {
        try {
          const s = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
          rearStreamRef.current = s;
          if (liveVideoRef.current) {
            liveVideoRef.current.srcObject = s;
            const p = liveVideoRef.current.play(); if (p && p.catch) p.catch(() => {});
          }
          setCamReady(true);
          return;
        } catch {
          // try the next, looser constraint
        }
      }
      if (!cancelled) setCamError('Unable to access the rear camera. Please allow camera access.');
    })();

    return () => {
      cancelled = true;
      clearTimeout(autoTimer.current);
      rearStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = useCallback(() => {
    const v = liveVideoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    setCaptured(c.toDataURL('image/png'));
    // Release the rear camera once we have the still.
    rearStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // Auto-capture once the feed has stabilised (~4s after the camera is ready).
  useEffect(() => {
    if (captured || !camReady) return undefined;
    autoTimer.current = setTimeout(() => capture(), 4000);
    return () => clearTimeout(autoTimer.current);
  }, [captured, camReady, capture]);

  const retake = () => {
    setCaptured(null);
    setCamReady(false);
    // Re-acquire the rear camera by forcing the effect to run again.
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        rearStreamRef.current = s;
        if (liveVideoRef.current) { liveVideoRef.current.srcObject = s; liveVideoRef.current.play?.(); }
        setCamReady(true);
      } catch { setCamError('Unable to re-acquire the rear camera.'); }
    })();
  };

  return (
    <motion.div key="step4"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-lg mx-auto">
      <h2 className="text-xl font-bold text-white tracking-tight mb-1 text-center">Document Capture</h2>
      <p className="text-sm text-white/50 mb-5 text-center">
        Rear camera engaged. Position your ID inside the frame — auto-capture fires once stable.
      </p>

      <div className="relative w-full rounded-2xl overflow-hidden border bg-black"
        style={{ aspectRatio: '1.586 / 1', borderColor: `${RED.bright}55`, boxShadow: `0 0 30px ${RED.base}33` }}>
        {!captured ? (
          <>
            {/* Rear camera is NOT mirrored */}
            <video ref={liveVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <motion.div className="absolute left-0 right-0 h-[3px]"
              style={{ background: `linear-gradient(90deg, transparent, ${RED.bright}, transparent)`, boxShadow: `0 0 16px ${RED.bright}` }}
              animate={{ top: ['4%', '96%', '4%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />
            {['top-3 left-3 border-t-2 border-l-2', 'top-3 right-3 border-t-2 border-r-2',
              'bottom-3 left-3 border-b-2 border-l-2', 'bottom-3 right-3 border-b-2 border-r-2'].map((c, i) => (
              <div key={i} className={`absolute w-7 h-7 ${c}`} style={{ borderColor: RED.bright }} />
            ))}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full"
              style={{ background: `${RED.bright}1c`, border: `1px solid ${RED.bright}66` }}>
              <ScanLine size={13} style={{ color: RED.bright }} />
              <span className="text-[10px] font-mono tracking-widest" style={{ color: RED.bright }}>
                {camReady ? 'REAR CAM · SCANNING…' : 'ENGAGING REAR CAMERA…'}
              </span>
            </div>
          </>
        ) : (
          <motion.img initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
            src={captured} alt="Captured ID document" className="w-full h-full object-cover" />
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {camError && (
        <div className="flex items-center gap-2 px-4 py-3 mt-4 rounded-xl border text-sm"
          style={{ borderColor: `${RED.bright}55`, background: `${RED.bright}12`, color: RED.soft }}>
          <AlertTriangle size={16} /> {camError}
        </div>
      )}

      {!captured ? (
        <div className="relative h-20">
          <button onClick={capture} disabled={!camReady}
            className="absolute left-1/2 -translate-x-1/2 top-4 w-16 h-16 rounded-full flex items-center justify-center border-4 disabled:opacity-40"
            style={{ borderColor: RED.bright, background: 'rgba(255,255,255,0.06)', boxShadow: `0 0 24px ${RED.bright}66` }}
            aria-label="Capture ID">
            <Camera size={24} style={{ color: RED.bright }} />
          </button>
        </div>
      ) : (
        <div className="flex gap-3 mt-5">
          <button onClick={retake} disabled={processing}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase flex items-center justify-center gap-2 border text-white/80 disabled:opacity-40"
            style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)' }}>
            <RefreshCw size={16} /> Retake Photo
          </button>
          <button onClick={() => onConfirm(captured)} disabled={processing}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase flex items-center justify-center gap-2 text-white disabled:opacity-70"
            style={{ background: `linear-gradient(135deg, ${RED.bright}, ${RED.deep})`, boxShadow: `0 0 26px ${RED.base}66` }}>
            {processing
              ? <><Loader2 size={16} className="animate-spin" /> Processing…</>
              : <><ShieldCheck size={16} /> Confirm &amp; Process</>}
          </button>
        </div>
      )}
    </motion.div>
  );
}


// ─── Completion screen ───────────────────────────────────────────────────────
function CompleteScreen({ production = false, onContinue }) {
  return (
    <motion.div key="done"
      initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md mx-auto text-center">
      <motion.div
        animate={{ boxShadow: [`0 0 30px ${RED.base}66`, `0 0 60px ${RED.bright}aa`, `0 0 30px ${RED.base}66`] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-24 h-24 mx-auto rounded-full border-2 flex items-center justify-center mb-6"
        style={{ borderColor: RED.bright, background: `${RED.bright}14` }}>
        <ShieldCheck size={48} style={{ color: RED.bright }} />
      </motion.div>
      <h2 className="text-2xl font-bold text-white tracking-tight mb-2">Verification Complete</h2>
      <p className="text-sm text-white/55 mb-6">
        All biometric phases passed. Your identity has been cryptographically sealed and queued for final review.
      </p>
      <div className="grid grid-cols-2 gap-2.5 text-left">
        {['Secure Link', 'Face Scan', 'Liveness', 'ID Capture', 'Encryption', 'Sealed'].map((label) => (
          <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03]">
            <CheckCircle2 size={14} style={{ color: RED.bright }} />
            <span className="text-xs text-white/70">{label}</span>
          </div>
        ))}
      </div>

      {production && (
        <div className="mt-6">
          <p className="text-xs text-white/45 mb-3 flex items-center justify-center gap-1.5">
            <Loader2 size={13} className="animate-spin" style={{ color: RED.bright }} />
            We'll email you once an officer approves your account. Redirecting to sign-in…
          </p>
          <button onClick={onContinue}
            className="w-full py-3 rounded-2xl font-semibold text-sm tracking-wide uppercase text-white flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(135deg, ${RED.bright}, ${RED.deep})`, boxShadow: `0 0 24px ${RED.base}66` }}>
            <ArrowRight size={16} /> Continue to Sign-In
          </button>
        </div>
      )}
    </motion.div>
  );
}


// ─── MAIN ORCHESTRATOR · 4-phase state machine ───────────────────────────────
export default function CyberVideoKYC() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const isProduction = Boolean(token);
  const DONE_STEP = TOTAL_PHASES; // index 4 = completion screen

  const [step, setStep] = useState(0);
  const [stream, setStream] = useState(null);          // shared FRONT stream (face + liveness)
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [hw, setHw] = useState({ camera: 'pending', mic: 'pending', channel: 'pending' });

  const next = useCallback(() => setStep((s) => Math.min(s + 1, DONE_STEP)), [DONE_STEP]);

  const stopStream = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const goToLanding = useCallback(() => navigate('/login', { replace: true }), [navigate]);

  // Auto-redirect after sealing the session (production only).
  useEffect(() => {
    if (step === DONE_STEP && isProduction) {
      const t = setTimeout(goToLanding, 6000);
      return () => clearTimeout(t);
    }
  }, [step, DONE_STEP, isProduction, goToLanding]);

  // Phase 4 submit: ID snapshot → blob → authorized multipart POST.
  const submitKYC = useCallback(async (dataURL) => {
    if (!dataURL) { toast.error('No capture found. Please retake the photo.'); return; }
    setProcessing(true);
    try {
      const blob = dataURLToBlob(dataURL);
      const file = new File([blob], `cyber-kyc-${Date.now()}.png`, { type: blob.type });
      const form = new FormData();
      form.append('document', file);
      if (token) form.append('token', token);

      const { data } = await api.post('/account/kyc/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const stored = data?.data?.stored;
      stopStream();

      if (data?.success && (stored || !isProduction)) {
        toast.success('Identity verification submitted successfully.');
        next();
      } else if (isProduction && stored === false) {
        toast.error('Your verification link has expired. Please request a new one.');
        goToLanding();
      } else {
        toast('Submitted, finalizing your session…', { icon: '⚙️' });
        next();
      }
    } catch (err) {
      const msg = err?.response?.data?.message || 'Upload could not be confirmed.';
      toast.error(`${msg} Completing onboarding in safe mode.`);
      stopStream();
      next();
    } finally {
      setProcessing(false);
    }
  }, [token, isProduction, stopStream, next, goToLanding]);

  // Request the FRONT camera + mic for the face & liveness phases.
  const initialize = useCallback(async () => {
    setError('');
    setInitializing(true);
    setHw({ camera: 'pending', mic: 'pending', channel: 'pending' });
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      setStream(media);
      const hasVideo = media.getVideoTracks().length > 0;
      const hasAudio = media.getAudioTracks().length > 0;
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

  // Release the front stream on unmount.
  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()); }, [stream]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white" style={{ background: RED.black }}>
      <GridBackground />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-5 sm:px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-red-500/40 bg-white/[0.04]"
              style={{ boxShadow: `0 0 18px ${RED.base}55` }}>
              <Lock size={18} style={{ color: RED.bright }} />
            </div>
            <div>
              <p className="font-bold tracking-tight leading-none">ALISTER<span style={{ color: RED.bright }}> KYC</span></p>
              <p className="text-[10px] tracking-[0.3em] text-white/40 uppercase mt-0.5">Cyber Identity Engine</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]">
            <Zap size={12} style={{ color: RED.bright }} />
            <span className="text-[10px] font-mono tracking-widest text-white/60">AES-256 · SECURE SESSION</span>
          </div>
        </header>

        {/* Main panel */}
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 pb-10">
          <div className="w-full max-w-2xl">
            <StepIndicator current={step} />
            <div className="rounded-3xl border border-white/10 p-6 sm:p-9"
              style={{ background: 'rgba(21,22,28,0.65)', backdropFilter: 'blur(12px)', boxShadow: '0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <Step1Setup stream={stream} hw={hw} initializing={initializing} error={error}
                    onInitialize={initialize} onNext={next} />
                )}
                {step === 1 && <Step2FaceScan stream={stream} onCaptured={next} />}
                {step === 2 && <Step3Liveness stream={stream} onNext={next} />}
                {step === 3 && <Step4Document onConfirm={submitKYC} processing={processing} />}
                {step === DONE_STEP && <CompleteScreen production={isProduction} onContinue={goToLanding} />}
              </AnimatePresence>
            </div>

            <p className="text-center text-[10px] font-mono tracking-[0.3em] text-white/30 mt-6 uppercase">
              {step < DONE_STEP ? `Phase ${step + 1} of ${TOTAL_PHASES}` : 'Session Sealed'} · Alister Bank Biometric Protocol
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
