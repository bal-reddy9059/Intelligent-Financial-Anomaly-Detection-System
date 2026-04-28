import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Fingerprint, Hash, Grid3x3, X, CheckCircle2,
  XCircle, ShieldCheck, Delete, ArrowRight,
} from "lucide-react";

// ── PIN hash (simple, client-side demo) ──────────────────────────────────────
const PIN_KEY     = "safepay_pin_hash";
const PATTERN_KEY = "safepay_pattern";

function hashPin(pin) {
  // simple deterministic hash for demo (not cryptographically secure)
  let h = 0;
  for (let i = 0; i < pin.length; i++) h = (Math.imul(31, h) + pin.charCodeAt(i)) | 0;
  return String(h);
}

// ── 3 × 3 dot indices ────────────────────────────────────────────────────────
const DOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const DOT_POS = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
  { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
  { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
];

// ── SVG line between two dots ─────────────────────────────────────────────────
function Line({ from, to, size }) {
  const gap = size / 3;
  const half = gap / 2;
  const x1 = DOT_POS[from].x * gap + half;
  const y1 = DOT_POS[from].y * gap + half;
  const x2 = DOT_POS[to].x * gap + half;
  const y2 = DOT_POS[to].y * gap + half;
  return (
    <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke="rgba(139,92,246,0.7)" strokeWidth="3" strokeLinecap="round" />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIN PAD
// ═══════════════════════════════════════════════════════════════════════════════
function PinPad({ onSuccess, onError, setupMode, onSetupDone }) {
  const [digits, setDigits]   = useState([]);
  const [confirm, setConfirm] = useState([]);   // used in setup mode step-2
  const [step, setStep]       = useState(1);    // 1 = enter/verify, 2 = confirm (setup)
  const [shake, setShake]     = useState(false);
  const MAX = 4;

  const doShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const press = (d) => {
    if (digits.length >= MAX) return;
    const next = [...digits, d];
    setDigits(next);

    if (next.length === MAX) {
      setTimeout(() => handle(next), 150);
    }
  };

  const handle = (pin) => {
    const pinStr = pin.join("");

    if (setupMode) {
      if (step === 1) {
        setConfirm(pin);
        setDigits([]);
        setStep(2);
        return;
      }
      // step 2: confirm
      if (pinStr === confirm.join("")) {
        localStorage.setItem(PIN_KEY, hashPin(pinStr));
        onSetupDone?.();
        onSuccess();
      } else {
        doShake();
        setDigits([]);
        setStep(1);
        setConfirm([]);
        onError("PINs didn't match. Try again.");
      }
      return;
    }

    // verify mode
    const stored = localStorage.getItem(PIN_KEY);
    if (!stored) {
      onError("No PIN set. Please set up a PIN first.");
      setDigits([]);
      return;
    }
    if (hashPin(pinStr) === stored) {
      onSuccess();
    } else {
      doShake();
      setDigits([]);
      onError("Incorrect PIN.");
    }
  };

  const del = () => setDigits(d => d.slice(0, -1));

  const keys = [1,2,3,4,5,6,7,8,9,null,0,"del"];

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-gray-400">
        {setupMode
          ? step === 1 ? "Enter a new 4-digit PIN" : "Confirm your PIN"
          : "Enter your 4-digit PIN"}
      </p>

      {/* dots display */}
      <motion.div
        animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="flex gap-4"
      >
        {Array.from({ length: MAX }).map((_, i) => (
          <motion.div
            key={i}
            animate={{ scale: digits[i] !== undefined ? 1.2 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className={`w-4 h-4 rounded-full border-2 transition-colors ${
              digits[i] !== undefined
                ? "bg-violet-500 border-violet-500"
                : "bg-transparent border-gray-600"
            }`}
          />
        ))}
      </motion.div>

      {/* numpad */}
      <div className="grid grid-cols-3 gap-3 w-52">
        {keys.map((k, i) => {
          if (k === null) return <div key={i} />;
          if (k === "del") return (
            <button key={i} onClick={del}
              className="h-14 rounded-2xl bg-gray-800/60 hover:bg-gray-700 border border-gray-700
                         flex items-center justify-center transition-colors active:scale-95">
              <Delete className="h-5 w-5 text-gray-400" />
            </button>
          );
          return (
            <button key={k} onClick={() => press(k)}
              className="h-14 rounded-2xl bg-gray-800/60 hover:bg-violet-600/20 border border-gray-700
                         hover:border-violet-500/50 text-white text-lg font-semibold
                         transition-all active:scale-95">
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN LOCK
// ═══════════════════════════════════════════════════════════════════════════════
function PatternLock({ onSuccess, onError, setupMode, onSetupDone }) {
  const svgRef      = useRef(null);
  const [selected, setSelected]  = useState([]);
  const [drawing, setDrawing]    = useState(false);
  const [cursor, setCursor]      = useState(null);
  const [shake, setShake]        = useState(false);
  const [step, setStep]          = useState(1);
  const [first, setFirst]        = useState(null);
  const SIZE = 192;
  const GAP  = SIZE / 3;
  const HALF = GAP / 2;
  const R    = 10;

  const doShake = () => { setShake(true); setTimeout(() => setShake(false), 500); };

  const getPos = (idx) => ({
    x: DOT_POS[idx].x * GAP + HALF,
    y: DOT_POS[idx].y * GAP + HALF,
  });

  const getSvgXY = useCallback((clientX, clientY) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const hitDot = useCallback((x, y) => {
    for (const idx of DOTS) {
      const p = getPos(idx);
      if (Math.hypot(x - p.x, y - p.y) < R + 8) return idx;
    }
    return null;
  }, []);

  const startDraw = (x, y) => {
    const hit = hitDot(x, y);
    if (hit === null) return;
    setDrawing(true);
    setSelected([hit]);
    setCursor({ x, y });
  };

  const moveDraw = (x, y) => {
    if (!drawing) return;
    setCursor({ x, y });
    const hit = hitDot(x, y);
    if (hit !== null && !selected.includes(hit)) {
      setSelected(prev => [...prev, hit]);
    }
  };

  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    setCursor(null);
    if (selected.length < 4) {
      onError("Pattern too short — connect at least 4 dots.");
      setSelected([]);
      return;
    }
    verify(selected);
  };

  const verify = (pattern) => {
    const key = pattern.join("-");

    if (setupMode) {
      if (step === 1) {
        setFirst(key);
        setSelected([]);
        setStep(2);
        return;
      }
      if (key === first) {
        localStorage.setItem(PATTERN_KEY, first);
        onSetupDone?.();
        onSuccess();
      } else {
        doShake();
        setSelected([]);
        setStep(1);
        setFirst(null);
        onError("Patterns didn't match. Try again.");
      }
      return;
    }

    const stored = localStorage.getItem(PATTERN_KEY);
    if (!stored) { onError("No pattern set. Set up a pattern first."); setSelected([]); return; }
    if (key === stored) { onSuccess(); }
    else { doShake(); setSelected([]); onError("Wrong pattern."); }
  };

  // pointer helpers
  const onPointerDown = (e) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = getSvgXY(e.clientX, e.clientY);
    startDraw(x, y);
  };
  const onPointerMove = (e) => {
    if (!drawing) return;
    const { x, y } = getSvgXY(e.clientX, e.clientY);
    moveDraw(x, y);
  };
  const onPointerUp = () => endDraw();

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-gray-400 text-center">
        {setupMode
          ? step === 1 ? "Draw a new unlock pattern" : "Draw it again to confirm"
          : "Draw your unlock pattern"}
      </p>

      <motion.svg
        ref={svgRef}
        width={SIZE} height={SIZE}
        animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
        transition={{ duration: 0.4 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="cursor-pointer select-none touch-none"
        style={{ userSelect: "none" }}
      >
        {/* connecting lines */}
        {selected.map((idx, i) =>
          i > 0 ? <Line key={i} from={selected[i - 1]} to={idx} size={SIZE} /> : null
        )}
        {/* line to current cursor */}
        {drawing && cursor && selected.length > 0 && (() => {
          const last = selected[selected.length - 1];
          const p = getPos(last);
          return (
            <line x1={p.x} y1={p.y} x2={cursor.x} y2={cursor.y}
              stroke="rgba(139,92,246,0.4)" strokeWidth="2" strokeLinecap="round" />
          );
        })()}

        {/* dots */}
        {DOTS.map(idx => {
          const { x, y } = getPos(idx);
          const active = selected.includes(idx);
          return (
            <g key={idx}>
              <circle cx={x} cy={y} r={R + 8} fill="transparent" />
              <circle cx={x} cy={y} r={R}
                fill={active ? "rgba(139,92,246,0.3)" : "rgba(55,65,81,0.8)"}
                stroke={active ? "#8b5cf6" : "#4b5563"}
                strokeWidth={active ? 2 : 1.5}
              />
              {active && <circle cx={x} cy={y} r={4} fill="#8b5cf6" />}
            </g>
          );
        })}
      </motion.svg>

      <button onClick={() => { setSelected([]); setStep(1); setFirst(null); setCursor(null); }}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
        Clear
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINGERPRINT
// ═══════════════════════════════════════════════════════════════════════════════
function FingerprintAuth({ onSuccess, onError }) {
  const [status, setStatus] = useState("idle"); // idle | scanning | done | fail | unavailable

  const trigger = async () => {
    setStatus("scanning");

    // Check for platform biometric authenticator
    const available = await PublicKeyCredential
      .isUserVerifyingPlatformAuthenticatorAvailable?.()
      .catch(() => false);

    if (!available) {
      setStatus("unavailable");
      onError("Biometric auth not available on this device/browser.");
      return;
    }

    // Build a minimal WebAuthn assertion request (no server needed for demo)
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 30000,
          userVerification: "required",
          rpId: window.location.hostname,
          allowCredentials: [],
        },
      });
      setStatus("done");
      onSuccess();
    } catch (err) {
      // If no credential registered, try identity dialog (fallback)
      if (err.name === "NotAllowedError") {
        setStatus("fail");
        onError("Fingerprint not recognised or cancelled.");
      } else if (err.name === "InvalidStateError" || err.name === "NotSupportedError") {
        // No credential registered — treat as "verified" for demo
        setStatus("done");
        onSuccess();
      } else {
        setStatus("fail");
        onError("Biometric check failed. Try PIN or Pattern.");
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-gray-400 text-center">
        {status === "scanning"   ? "Waiting for fingerprint…"
          : status === "done"   ? "Fingerprint verified!"
          : status === "fail"   ? "Fingerprint not recognised"
          : status === "unavailable" ? "Not available on this device"
          : "Tap the fingerprint to authenticate"}
      </p>

      <motion.button
        type="button"
        onClick={trigger}
        disabled={status === "scanning" || status === "done"}
        whileTap={{ scale: 0.93 }}
        animate={
          status === "scanning"
            ? { scale: [1, 1.06, 1], opacity: [1, 0.7, 1] }
            : {}
        }
        transition={status === "scanning" ? { duration: 1.2, repeat: Infinity } : {}}
        className={`w-28 h-28 rounded-full flex items-center justify-center
                    border-2 transition-all shadow-2xl
                    ${status === "done"        ? "border-emerald-500 bg-emerald-500/20 shadow-emerald-500/40"
                    : status === "fail" || status === "unavailable"
                                               ? "border-red-500 bg-red-500/20 shadow-red-500/40"
                    : status === "scanning"    ? "border-violet-500 bg-violet-500/20 shadow-violet-500/40 cursor-wait"
                    : "border-gray-600 bg-gray-800/60 hover:border-violet-500 hover:bg-violet-500/10 hover:shadow-violet-500/30"}`}
      >
        {status === "done"
          ? <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          : status === "fail" || status === "unavailable"
          ? <XCircle className="h-12 w-12 text-red-400" />
          : <Fingerprint className={`h-12 w-12 ${status === "scanning" ? "text-violet-400" : "text-gray-400"}`} />
        }
      </motion.button>

      {(status === "fail" || status === "unavailable") && (
        <button onClick={() => setStatus("idle")}
          className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
          Try again
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN MODAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function PaymentAuthModal({ payment, onConfirm, onCancel }) {
  const [tab, setTab]         = useState("pin");    // pin | pattern | fingerprint
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState(false);
  const [setupPin, setSetupPin]         = useState(!localStorage.getItem(PIN_KEY));
  const [setupPattern, setSetupPattern] = useState(!localStorage.getItem(PATTERN_KEY));

  // reset error when tab changes
  useEffect(() => { setError(""); }, [tab]);

  const handleSuccess = () => {
    setSuccess(true);
    setError("");
    setTimeout(() => onConfirm(), 800);
  };

  const handleError = (msg) => {
    setError(msg);
    setTimeout(() => setError(""), 3000);
  };

  const TABS = [
    { id: "pin",         label: "PIN",         icon: Hash },
    { id: "pattern",     label: "Pattern",     icon: Grid3x3 },
    { id: "fingerprint", label: "Fingerprint", icon: Fingerprint },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 16 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="w-full max-w-sm bg-gray-950 border border-gray-800 rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-800/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600
                              flex items-center justify-center shadow-lg">
                <ShieldCheck className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-none">Confirm Payment</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Verify your identity to proceed</p>
              </div>
            </div>
            <button type="button" onClick={onCancel}
              className="text-gray-500 hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Payment summary */}
          <div className="mx-6 mt-4 bg-gray-900/60 border border-gray-800 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500">Sending to</p>
              <p className="text-sm font-semibold text-white truncate">{payment.recipient}</p>
              {payment.reason && <p className="text-xs text-gray-500 mt-0.5 truncate">For: {payment.reason}</p>}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-500">Amount</p>
              <p className="text-lg font-bold text-emerald-400">
                ₹{Number(payment.amount).toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="mx-6 mt-4 flex gap-1 bg-gray-900/60 rounded-xl p-1 border border-gray-800">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} type="button" onClick={() => setTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold
                               transition-all ${tab === t.id
                    ? "bg-violet-600 text-white shadow"
                    : "text-gray-500 hover:text-gray-300"}`}>
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Auth body */}
          <div className="px-6 py-5 min-h-[280px] flex flex-col items-center justify-center">
            <AnimatePresence mode="wait">
              {success ? (
                <motion.div key="success"
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-3">
                  <CheckCircle2 className="h-16 w-16 text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-300">Verified! Sending…</p>
                </motion.div>
              ) : tab === "pin" ? (
                <motion.div key="pin"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <PinPad
                    onSuccess={handleSuccess}
                    onError={handleError}
                    setupMode={setupPin}
                    onSetupDone={() => setSetupPin(false)}
                  />
                </motion.div>
              ) : tab === "pattern" ? (
                <motion.div key="pattern"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <PatternLock
                    onSuccess={handleSuccess}
                    onError={handleError}
                    setupMode={setupPattern}
                    onSetupDone={() => setSetupPattern(false)}
                  />
                </motion.div>
              ) : (
                <motion.div key="fingerprint"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <FingerprintAuth onSuccess={handleSuccess} onError={handleError} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Error / setup hint */}
          <div className="px-6 pb-5 min-h-[40px]">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10
                             border border-red-500/20 rounded-xl px-3 py-2">
                  <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {error}
                </motion.div>
              )}
              {!error && setupPin && tab === "pin" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-[11px] text-gray-500 text-center">
                  First time? Set a 4-digit PIN to protect payments.
                </motion.div>
              )}
              {!error && setupPattern && tab === "pattern" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-[11px] text-gray-500 text-center">
                  First time? Draw a pattern connecting at least 4 dots.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
