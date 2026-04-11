import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Fingerprint, Activity, Zap, ShieldCheck, ShieldAlert,
  RefreshCw, Clock, BarChart2, AlertTriangle, CheckCircle2,
  XCircle, ToggleLeft, ToggleRight, Info, Wifi,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import { auth, db } from "./firebase";
import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, addDoc, onSnapshot, query, where, orderBy,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// ─── Constants ────────────────────────────────────────────────────────────────
const CALIBRATION_PHRASE = "Send payment to my account";

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.45, ease: "easeOut" },
  }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysSince(ts) {
  if (!ts) return null;
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function riskColor(deviation) {
  if (deviation === null || deviation === undefined) return "text-gray-400";
  if (deviation < 15) return "text-emerald-400";
  if (deviation < 35) return "text-yellow-400";
  return "text-red-400";
}

function riskBg(deviation) {
  if (deviation === null || deviation === undefined) return "bg-gray-700";
  if (deviation < 15) return "bg-emerald-500";
  if (deviation < 35) return "bg-yellow-500";
  return "bg-red-500";
}

function riskLabel(deviation) {
  if (deviation === null || deviation === undefined) return "No baseline";
  if (deviation < 15) return "Normal";
  if (deviation < 35) return "Elevated";
  return "High Risk";
}

function severityBadge(severity) {
  if (severity === "high")
    return <Badge className="bg-red-900 text-red-300 border border-red-700 text-xs">High</Badge>;
  if (severity === "medium")
    return <Badge className="bg-yellow-900 text-yellow-300 border border-yellow-700 text-xs">Medium</Badge>;
  return <Badge className="bg-emerald-900 text-emerald-300 border border-emerald-700 text-xs">Low</Badge>;
}

// ─── Toggle Switch ─────────────────────────────────────────────────────────────
function ToggleSwitch({ enabled, onToggle, label, description }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
          enabled ? "bg-emerald-500" : "bg-gray-700"
        }`}
        aria-checked={enabled}
        role="switch"
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={`inline-block h-4 w-4 rounded-full bg-white shadow ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

// ─── Keystroke Bar ─────────────────────────────────────────────────────────────
function KeystrokeBar({ interval, maxInterval }) {
  const pct = maxInterval > 0 ? Math.min((interval / maxInterval) * 100, 100) : 0;
  const color =
    interval < 150 ? "bg-emerald-500" : interval < 350 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="w-2 bg-gray-700 rounded-sm h-12 flex flex-col-reverse overflow-hidden">
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: `${pct}%` }}
          transition={{ duration: 0.2 }}
          className={`w-full rounded-sm ${color}`}
        />
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
const BiometricGuard = () => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [typingMetrics, setTypingMetrics] = useState({
    speed: 0,
    intervals: [],
    deviation: null,
  });
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [settings, setSettings] = useState({
    enabled: true,
    reAuthOnDeviation: true,
    logEvents: true,
  });
  const [saveMsg, setSaveMsg] = useState("");
  const [recalibrating, setRecalibrating] = useState(false);

  // Refs for tracking keystrokes
  const lastKeyTime = useRef(null);
  const sessionStart = useRef(null);
  const intervalsRef = useRef([]);

  // ── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return unsub;
  }, []);

  // ── Load profile from Firestore ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "biometricProfiles", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data);
        if (data.settings) {
          setSettings((prev) => ({ ...prev, ...data.settings }));
        }
      } else {
        setProfile(null);
      }
    });
    return unsub;
  }, [user]);

  // ── Typing handler ─────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(() => {
    const now = Date.now();
    if (lastKeyTime.current !== null) {
      const interval = now - lastKeyTime.current;
      if (interval < 2000) {
        intervalsRef.current = [...intervalsRef.current, interval];
      }
    } else {
      sessionStart.current = now;
    }
    lastKeyTime.current = now;
  }, []);

  const handleChange = useCallback(
    (e) => {
      const val = e.target.value;
      setTestInput(val);

      const intervals = intervalsRef.current;
      const elapsed = sessionStart.current
        ? (Date.now() - sessionStart.current) / 1000
        : 1;
      const speed = elapsed > 0 ? parseFloat((val.length / elapsed).toFixed(2)) : 0;
      const avgInterval =
        intervals.length > 0
          ? intervals.reduce((a, b) => a + b, 0) / intervals.length
          : 0;

      let deviation = null;
      if (profile?.avgInterval && avgInterval > 0) {
        deviation = parseFloat(
          (Math.abs(avgInterval - profile.avgInterval) / profile.avgInterval) * 100
        ).toFixed(1);
        deviation = parseFloat(deviation);
      }

      setTypingMetrics({
        speed,
        intervals: intervals.slice(-20),
        deviation,
      });
    },
    [profile]
  );

  // ── Reset calibration state ────────────────────────────────────────────────
  const resetCalibration = () => {
    setTestInput("");
    intervalsRef.current = [];
    lastKeyTime.current = null;
    sessionStart.current = null;
    setTypingMetrics({ speed: 0, intervals: [], deviation: null });
  };

  // ── Save calibration to Firestore ──────────────────────────────────────────
  const saveCalibration = async () => {
    if (!user || testInput.length < 10) return;
    setRecalibrating(true);
    try {
      const intervals = intervalsRef.current;
      const elapsed = sessionStart.current
        ? (Date.now() - sessionStart.current) / 1000
        : 1;
      const avgSpeed = parseFloat((testInput.length / elapsed).toFixed(2));
      const avgInterval =
        intervals.length > 0
          ? parseFloat(
              (intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(2)
            )
          : 0;

      const ref = doc(db, "biometricProfiles", user.uid);
      const existing = profile || {};
      await setDoc(
        ref,
        {
          userId: user.uid,
          avgSpeed,
          avgInterval,
          sessionCount: (existing.sessionCount || 0) + 1,
          calibratedAt: serverTimestamp(),
          events: existing.events || [],
          settings,
        },
        { merge: true }
      );

      // Log calibration event if setting is on
      if (settings.logEvents) {
        const eventsRef = doc(db, "biometricProfiles", user.uid);
        const newEvent = {
          timestamp: new Date().toISOString(),
          message: "Baseline calibrated successfully",
          severity: "low",
        };
        await setDoc(
          eventsRef,
          {
            events: [...(existing.events || []), newEvent].slice(-50),
          },
          { merge: true }
        );
      }

      setSaveMsg("Baseline saved!");
      setTimeout(() => setSaveMsg(""), 3000);
      resetCalibration();
    } catch (err) {
      console.error("Calibration save error:", err);
      setSaveMsg("Error saving baseline.");
      setTimeout(() => setSaveMsg(""), 3000);
    } finally {
      setRecalibrating(false);
    }
  };

  // ── Save settings ──────────────────────────────────────────────────────────
  const saveSettings = async (newSettings) => {
    setSettings(newSettings);
    if (!user) return;
    try {
      await setDoc(
        doc(db, "biometricProfiles", user.uid),
        { settings: newSettings },
        { merge: true }
      );
    } catch (err) {
      console.error("Settings save error:", err);
    }
  };

  const toggleSetting = (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    saveSettings(updated);
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const hasBaseline = !!profile?.avgSpeed;
  const daysSinceCal = profile?.calibratedAt ? daysSince(profile.calibratedAt) : null;
  const consistencyScore =
    hasBaseline && profile.sessionCount
      ? Math.min(100, 60 + profile.sessionCount * 5)
      : null;
  const maxInterval = typingMetrics.intervals.length
    ? Math.max(...typingMetrics.intervals, 1)
    : 1;
  const events = profile?.events ? [...profile.events].reverse().slice(0, 10) : [];

  const statusColor =
    typingMetrics.deviation === null
      ? "bg-gray-600"
      : typingMetrics.deviation < 15
      ? "bg-emerald-500"
      : typingMetrics.deviation < 35
      ? "bg-yellow-500"
      : "bg-red-500";

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />

        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6">

          {/* ── Page Header ── */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-start gap-4"
          >
            <div className="p-3 rounded-xl bg-emerald-900/40 border border-emerald-700/40">
              <Fingerprint className="h-8 w-8 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Behavioral Biometrics Guard
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Passive authentication through your unique interaction patterns
              </p>
            </div>
            {settings.enabled && (
              <div className="ml-auto flex items-center gap-2 bg-emerald-900/30 border border-emerald-700/40 rounded-full px-3 py-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-300 font-medium">Active</span>
              </div>
            )}
          </motion.div>

          {/* ── How It Works ── */}
          <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="bg-gray-800/60 border-gray-700/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-400" />
                  How It Works
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    {
                      step: "1",
                      icon: <Activity className="h-5 w-5 text-blue-400" />,
                      title: "Type naturally",
                      desc: "Use the app as you normally would. No extra steps.",
                      color: "border-blue-700/50 bg-blue-900/20",
                    },
                    {
                      step: "2",
                      icon: <Zap className="h-5 w-5 text-yellow-400" />,
                      title: "We learn your rhythm",
                      desc: "AI builds a typing fingerprint unique to you over time.",
                      color: "border-yellow-700/50 bg-yellow-900/20",
                    },
                    {
                      step: "3",
                      icon: <ShieldAlert className="h-5 w-5 text-red-400" />,
                      title: "Deviations trigger re-auth",
                      desc: "Unusual patterns flag the session for re-verification.",
                      color: "border-red-700/50 bg-red-900/20",
                    },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className={`rounded-xl border p-4 flex flex-col gap-2 ${item.color}`}
                    >
                      <div className="flex items-center gap-2">
                        {item.icon}
                        <span className="text-xs font-bold text-gray-400">
                          Step {item.step}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Baseline Status ── */}
          <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="bg-gray-800/60 border-gray-700/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    Baseline Status
                  </CardTitle>
                  {hasBaseline ? (
                    <Badge className="bg-emerald-900/60 text-emerald-300 border border-emerald-700 text-xs">
                      Baseline Recorded
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-700 text-gray-400 border border-gray-600 text-xs">
                      No Baseline
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {hasBaseline ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/50 text-center">
                        <p className="text-2xl font-bold text-emerald-400">
                          {profile.avgSpeed}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">chars / sec</p>
                        <p className="text-xs text-gray-500 mt-0.5">Avg typing speed</p>
                      </div>
                      <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/50 text-center">
                        <p className="text-2xl font-bold text-blue-400">
                          {profile.avgInterval ? `${Math.round(profile.avgInterval)}` : "—"}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">ms</p>
                        <p className="text-xs text-gray-500 mt-0.5">Avg key interval</p>
                      </div>
                      <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/50 text-center">
                        <p className="text-2xl font-bold text-purple-400">
                          {consistencyScore !== null ? `${consistencyScore}%` : "—"}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">score</p>
                        <p className="text-xs text-gray-500 mt-0.5">Session consistency</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          Last calibrated:{" "}
                          <span className="text-gray-300">
                            {daysSinceCal === 0
                              ? "today"
                              : daysSinceCal === 1
                              ? "1 day ago"
                              : `${daysSinceCal} days ago`}
                          </span>
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={resetCalibration}
                        disabled={recalibrating}
                        className="border-gray-600 hover:bg-gray-700 text-gray-300 text-xs gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Recalibrate
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                    <Fingerprint className="h-12 w-12 text-gray-600" />
                    <p className="text-gray-400 text-sm">No biometric baseline recorded yet.</p>
                    <p className="text-gray-500 text-xs max-w-xs">
                      Use the live session monitor below to type the calibration phrase and
                      save your baseline.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Live Session Monitor ── */}
          <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="bg-gray-800/60 border-gray-700/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-blue-400" />
                    Live Session Monitor
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor} shadow-lg`}
                      style={{ boxShadow: `0 0 6px 2px ${typingMetrics.deviation === null ? "#4b5563" : typingMetrics.deviation < 15 ? "#10b981" : typingMetrics.deviation < 35 ? "#eab308" : "#ef4444"}` }}
                    />
                    <span
                      className={`text-xs font-medium ${riskColor(typingMetrics.deviation)}`}
                    >
                      {riskLabel(typingMetrics.deviation)}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Input */}
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">
                    Type this phrase to calibrate:
                    <span className="ml-1 text-gray-200 font-medium italic">
                      "{CALIBRATION_PHRASE}"
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={testInput}
                      onChange={handleChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Start typing here..."
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600 transition-all"
                    />
                    {testInput.length > 0 && (
                      <button
                        onClick={resetCalibration}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {/* Progress bar for phrase completion */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        animate={{
                          width: `${Math.min(
                            (testInput.length / CALIBRATION_PHRASE.length) * 100,
                            100
                          )}%`,
                        }}
                        transition={{ duration: 0.1 }}
                        className="h-full bg-emerald-500 rounded-full"
                      />
                    </div>
                    <span className="text-xs text-gray-500">
                      {Math.min(
                        Math.round((testInput.length / CALIBRATION_PHRASE.length) * 100),
                        100
                      )}
                      %
                    </span>
                  </div>
                </div>

                {/* Real-time metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Activity className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-xs text-gray-400">Speed</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {typingMetrics.speed.toFixed(1)}
                      <span className="text-xs text-gray-500 ml-1">c/s</span>
                    </p>
                  </div>
                  <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
                    <div className="flex items-center gap-1.5 mb-1">
                      <BarChart2 className="h-3.5 w-3.5 text-purple-400" />
                      <span className="text-xs text-gray-400">Keystrokes</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {typingMetrics.intervals.length}
                      <span className="text-xs text-gray-500 ml-1">recorded</span>
                    </p>
                  </div>
                  <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
                      <span className="text-xs text-gray-400">Deviation</span>
                    </div>
                    <p
                      className={`text-lg font-bold ${riskColor(typingMetrics.deviation)}`}
                    >
                      {typingMetrics.deviation !== null
                        ? `${typingMetrics.deviation}%`
                        : "—"}
                    </p>
                  </div>
                </div>

                {/* Keystroke waveform */}
                {typingMetrics.intervals.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <BarChart2 className="h-3 w-3" />
                      Keystroke interval waveform (ms)
                    </p>
                    <div className="flex items-end gap-1 bg-gray-900/60 rounded-lg p-3 border border-gray-700/50 min-h-[64px] overflow-x-auto">
                      <AnimatePresence>
                        {typingMetrics.intervals.map((interval, i) => (
                          <motion.div
                            key={i}
                            initial={{ scaleY: 0, opacity: 0 }}
                            animate={{ scaleY: 1, opacity: 1 }}
                            transition={{ duration: 0.15 }}
                            style={{ originY: 1 }}
                          >
                            <KeystrokeBar interval={interval} maxInterval={maxInterval} />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {typingMetrics.intervals.length === 0 && (
                        <p className="text-xs text-gray-600 mx-auto self-center">
                          Start typing to see waveform
                        </p>
                      )}
                    </div>
                    {hasBaseline && typingMetrics.deviation !== null && (
                      <p className="text-xs text-gray-500">
                        Baseline avg interval:{" "}
                        <span className="text-gray-300">
                          {Math.round(profile.avgInterval)} ms
                        </span>{" "}
                        · Current deviation:{" "}
                        <span className={riskColor(typingMetrics.deviation)}>
                          {typingMetrics.deviation}%{" "}
                          {typingMetrics.deviation >= 35
                            ? "above threshold"
                            : "within range"}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {/* Save button */}
                <div className="flex items-center gap-3">
                  <Button
                    onClick={saveCalibration}
                    disabled={
                      recalibrating ||
                      testInput.length < Math.floor(CALIBRATION_PHRASE.length * 0.5)
                    }
                    className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 disabled:opacity-40"
                    size="sm"
                  >
                    <Fingerprint className="h-4 w-4" />
                    {recalibrating ? "Saving..." : "Save as Baseline"}
                  </Button>
                  {saveMsg && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`text-xs font-medium ${
                        saveMsg.startsWith("Error") ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {saveMsg.startsWith("Error") ? (
                        <XCircle className="inline h-3.5 w-3.5 mr-1" />
                      ) : (
                        <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
                      )}
                      {saveMsg}
                    </motion.span>
                  )}
                  {testInput.length > 0 && (
                    <Button
                      onClick={resetCalibration}
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-white text-xs"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Session Risk Events ── */}
          <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="bg-gray-800/60 border-gray-700/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  Session Risk Events
                  {events.length > 0 && (
                    <Badge className="ml-auto bg-gray-700 text-gray-300 border border-gray-600 text-xs">
                      {events.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600/50" />
                    <p className="text-gray-400 text-sm">No anomaly events recorded.</p>
                    <p className="text-gray-600 text-xs">
                      Events will appear here when deviations are detected.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence>
                      {events.map((evt, i) => {
                        const ts = evt.timestamp
                          ? new Date(evt.timestamp).toLocaleString()
                          : "Unknown time";
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex items-start justify-between gap-3 bg-gray-900/50 rounded-lg px-4 py-3 border border-gray-700/50"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <div
                                className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${
                                  evt.severity === "high"
                                    ? "bg-red-500"
                                    : evt.severity === "medium"
                                    ? "bg-yellow-500"
                                    : "bg-emerald-500"
                                }`}
                              />
                              <div className="min-w-0">
                                <p className="text-sm text-gray-200 truncate">
                                  {evt.message || "Session event recorded"}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">{ts}</p>
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              {severityBadge(evt.severity || "low")}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Protection Settings ── */}
          <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
            <Card className="bg-gray-800/60 border-gray-700/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-400" />
                  Protection Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ToggleSwitch
                  enabled={settings.enabled}
                  onToggle={() => toggleSetting("enabled")}
                  label="Enable biometric guard"
                  description="Continuously monitor typing patterns during sessions"
                />
                <ToggleSwitch
                  enabled={settings.reAuthOnDeviation}
                  onToggle={() => toggleSetting("reAuthOnDeviation")}
                  label="Require re-auth on deviation > 30%"
                  description="Prompt identity verification when typing patterns deviate significantly"
                />
                <ToggleSwitch
                  enabled={settings.logEvents}
                  onToggle={() => toggleSetting("logEvents")}
                  label="Log all session events"
                  description="Store biometric session data to improve baseline accuracy"
                />
              </CardContent>
            </Card>
          </motion.div>

          {/* Bottom spacer */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
};

export default BiometricGuard;
