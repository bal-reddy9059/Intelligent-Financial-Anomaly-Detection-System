import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, query, where, limit, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, AlertTriangle, CheckCircle, Zap, Search, DollarSign,
  Clock, User, Eye, ChevronRight, X, TrendingUp, Lock,
  Fingerprint, ShieldAlert, RefreshCw, Info, ArrowRight,
} from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────── */
function getAmount(tx) {
  const v = parseFloat(tx.amount ?? tx.Amount ?? 0);
  return isNaN(v) ? 0 : v;
}
function getTimestamp(tx) {
  if (tx.timestamp?.toDate) return tx.timestamp.toDate();
  return new Date(tx.timestamp || tx.date || 0);
}
const fmt = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;

/* ── Levenshtein distance for UPI spoofing check ─────────── */
function levenshtein(a, b) {
  if (!a || !b) return 99;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/* ── Pre-payment risk analysis ───────────────────────────── */
function analysePrePayment({ targetUpi, amount, txs, selfUpiId, allKnownUPIs }) {
  const now = new Date();
  const hour = now.getHours();
  const dow  = now.getDay(); // 0=Sun

  // 1. Recipient history
  const priorTxs = txs.filter((t) =>
    (t.receiverUPI || '').toLowerCase() === targetUpi.toLowerCase() ||
    (t.receiver || '').toLowerCase() === targetUpi.toLowerCase()
  );
  const isKnownRecipient = priorTxs.length > 0;
  const recipientTotalSent = priorTxs.reduce((s, t) => s + getAmount(t), 0);

  // 2. Fraud history with this recipient
  const fraudWithRecipient = priorTxs.filter((t) => t.fraudVerdict === 'HIGH_RISK' || t.fraudVerdict === 'MEDIUM_RISK').length;

  // 3. UPI spoofing check (Levenshtein distance to known contacts)
  const knownUPIs = allKnownUPIs.filter((u) => u !== selfUpiId);
  let minDistance = 99, closestUpi = '';
  knownUPIs.forEach((u) => {
    const d = levenshtein(u.toLowerCase(), targetUpi.toLowerCase());
    if (d < minDistance) { minDistance = d; closestUpi = u; }
  });
  const isSpoofSuspect = minDistance > 0 && minDistance <= 2;

  // 4. Amount vs personal average
  const myAmounts = txs.map(getAmount).filter((a) => a > 0);
  const myAvg = myAmounts.length ? myAmounts.reduce((s, a) => s + a, 0) / myAmounts.length : 0;
  const myStd = myAmounts.length > 1
    ? Math.sqrt(myAmounts.reduce((s, a) => s + (a - myAvg) ** 2, 0) / myAmounts.length)
    : 1;
  const amountZScore = myStd > 0 ? (amount - myAvg) / myStd : 0;

  // 5. Time of day risk
  const oddHour  = hour >= 0 && hour <= 5;
  const peakHour = hour >= 9 && hour <= 18;

  // 6. Day-of-week risk
  const DOW_RISK = { 0: 1.4, 1: 0.7, 2: 0.8, 3: 0.9, 4: 1.0, 5: 1.3, 6: 1.5 };
  const dowMultiplier = DOW_RISK[dow];

  // 7. Round number
  const isRound = amount > 0 && (amount % 100 === 0 || amount % 500 === 0 || amount % 1000 === 0);

  // 8. Rapid succession (recent txs in last 30 min)
  const recentTxs = txs.filter((t) => (now - getTimestamp(t)) < 1800000).length;
  const rapidFire = recentTxs >= 2;

  // ── Build risk factors ────────────────────────────────
  const factors = [
    {
      key:   'recipient',
      label: 'Recipient History',
      score: isKnownRecipient ? (fraudWithRecipient > 0 ? 70 : 5) : 55,
      risk:  isKnownRecipient ? (fraudWithRecipient > 0 ? 'high' : 'safe') : 'medium',
      detail: isKnownRecipient
        ? fraudWithRecipient > 0
          ? `${fraudWithRecipient} flagged transaction(s) with this recipient before.`
          : `Known recipient — ${priorTxs.length} prior transaction(s), ${fmt(recipientTotalSent)} total sent.`
        : 'First time sending to this UPI. No transaction history available.',
    },
    {
      key:   'spoof',
      label: 'UPI Spoofing Check',
      score: isSpoofSuspect ? 85 : 5,
      risk:  isSpoofSuspect ? 'high' : 'safe',
      detail: isSpoofSuspect
        ? `"${targetUpi}" is very similar to your contact "${closestUpi}" (${minDistance} character diff). Possible impersonation!`
        : 'UPI ID does not resemble any of your known contacts. No spoofing detected.',
    },
    {
      key:   'amount',
      label: 'Amount Risk',
      score: amountZScore > 2 ? 80 : amountZScore > 1 ? 45 : 10,
      risk:  amountZScore > 2 ? 'high' : amountZScore > 1 ? 'medium' : 'safe',
      detail: amountZScore > 1.5
        ? `${fmt(amount)} is ${amountZScore.toFixed(1)}× above your average (${fmt(Math.round(myAvg))}). Unusually large.`
        : `Amount is within your normal transaction range (avg ${fmt(Math.round(myAvg))}).`,
    },
    {
      key:   'time',
      label: 'Transaction Timing',
      score: oddHour ? 80 : dowMultiplier > 1.2 ? 45 : 10,
      risk:  oddHour ? 'high' : dowMultiplier > 1.2 ? 'medium' : 'safe',
      detail: oddHour
        ? `It is ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} — late-night payments carry 3× higher fraud risk.`
        : `Timing is ${peakHour ? 'within business hours' : 'outside peak hours'} — ${dowMultiplier > 1.2 ? 'weekend' : 'normal weekday'} risk level.`,
    },
    {
      key:   'velocity',
      label: 'Payment Velocity',
      score: rapidFire ? 70 : 5,
      risk:  rapidFire ? 'high' : 'safe',
      detail: rapidFire
        ? `${recentTxs} transactions in the last 30 minutes. Rapid-fire payments are a top fraud indicator.`
        : 'No unusual payment velocity detected.',
    },
    {
      key:   'pattern',
      label: 'Round Number Pattern',
      score: isRound ? 30 : 5,
      risk:  isRound ? 'medium' : 'safe',
      detail: isRound
        ? `${fmt(amount)} is a round number — sometimes used in scripted or phishing-driven transfers.`
        : 'Specific amount — not characteristic of scripted fraud.',
    },
  ];

  // Composite risk
  const highCount   = factors.filter((f) => f.risk === 'high').length;
  const mediumCount = factors.filter((f) => f.risk === 'medium').length;
  const weightedSum = factors.reduce((s, f) => s + f.score, 0) / factors.length;
  const compositeRisk = Math.round(Math.min(weightedSum, 100));

  const verdict =
    highCount >= 2 || compositeRisk >= 65 ? 'BLOCK' :
    highCount >= 1 || compositeRisk >= 35 ? 'CAUTION' :
    'ALLOW';

  const confidence = Math.round(60 + Math.abs(50 - compositeRisk) * 0.8);

  return { factors, compositeRisk, verdict, confidence, isSpoofSuspect, closestUpi, minDistance };
}

/* ── Verdict config ──────────────────────────────────────── */
const VERDICT_CONFIG = {
  BLOCK:   { color: '#ef4444', bg: 'from-red-500/20 to-rose-500/5',     border: 'border-red-500/40',     label: 'Block Payment',  sub: 'Multiple high-risk signals detected',  icon: ShieldAlert },
  CAUTION: { color: '#f59e0b', bg: 'from-amber-500/15 to-yellow-500/5', border: 'border-amber-500/40',   label: 'Proceed with Caution', sub: 'Some suspicious patterns found',   icon: AlertTriangle },
  ALLOW:   { color: '#10b981', bg: 'from-emerald-500/10 to-teal-500/5', border: 'border-emerald-500/30', label: 'Safe to Proceed', sub: 'No significant risk factors found',   icon: CheckCircle },
};

/* ── Score ring ──────────────────────────────────────────── */
function RiskRing({ score, color }) {
  const R = 48, C = 2 * Math.PI * R;
  const offset = C - (score / 100) * C;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="rotate-[-90deg]">
      <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
      <motion.circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C}
        animate={{ strokeDashoffset: offset }} transition={{ duration: 1.2, ease: 'easeOut' }} />
      <text x="60" y="65" textAnchor="middle" fill="white" fontSize="22" fontWeight="900"
        dominantBaseline="middle" transform="rotate(90 60 60)" style={{ fontFamily: 'inherit' }}>
        {score}%
      </text>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function PrePaymentShield() {
  const [txs, setTxs]                 = useState([]);
  const [selfUpiId, setSelfUpiId]     = useState('');
  const [allKnownUPIs, setAllKnownUPIs] = useState([]);
  const [loading, setLoading]         = useState(true);

  const [targetUpi, setTargetUpi]     = useState('');
  const [amount, setAmount]           = useState('');
  const [result, setResult]           = useState(null);
  const [checking, setChecking]       = useState(false);
  const [recentChecks, setRecentChecks] = useState([]);
  const inputRef = useRef(null);

  /* ── fetch user data ─────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setLoading(false); return; }
      try {
        let upiId = null;
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) upiId = userDoc.data().upiId || null;
        setSelfUpiId(upiId || '');

        const snap1 = await getDocs(query(collection(db, 'transactions'), where('userId', '==', u.uid), limit(500)));
        let all = snap1.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (upiId) {
          const snap2 = await getDocs(query(collection(db, 'transactions'), where('senderUPI', '==', upiId), limit(500)));
          const ids = new Set(all.map((t) => t.id));
          snap2.docs.forEach((d) => { if (!ids.has(d.id)) all.push({ id: d.id, ...d.data() }); });
        }
        setTxs(all);

        // Collect all known UPI IDs from transaction history
        const upiSet = new Set();
        all.forEach((t) => {
          if (t.senderUPI) upiSet.add(t.senderUPI);
          if (t.receiverUPI) upiSet.add(t.receiverUPI);
        });
        setAllKnownUPIs([...upiSet]);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    });
    return unsub;
  }, []);

  /* ── run analysis ────────────────────────────────────── */
  const runCheck = () => {
    if (!targetUpi.trim() || !amount) return;
    setChecking(true);
    setResult(null);

    // Simulate AI processing
    setTimeout(() => {
      const analysis = analysePrePayment({
        targetUpi: targetUpi.trim(),
        amount: parseFloat(amount),
        txs,
        selfUpiId,
        allKnownUPIs,
      });
      setResult(analysis);
      setChecking(false);

      // Add to recent checks
      setRecentChecks((prev) => [
        { upi: targetUpi.trim(), amount: parseFloat(amount), verdict: analysis.verdict, ts: new Date() },
        ...prev.slice(0, 4),
      ]);
    }, 1200);
  };

  const reset = () => { setResult(null); setTargetUpi(''); setAmount(''); inputRef.current?.focus(); };

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-emerald-500/30 border-t-emerald-500"
          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
        <p className="text-white/50 text-sm">Loading shield engine…</p>
      </motion.div>
    </div>
  );

  const verdictCfg = result ? VERDICT_CONFIG[result.verdict] : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 space-y-6">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
          <Lock className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Pre-Payment Shield</h1>
          <p className="text-white/40 text-xs">Real-time AI risk gate — check before you send</p>
        </div>
      </motion.div>

      {/* Input panel */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 p-6">
        <p className="text-white/50 text-sm mb-5 flex items-center gap-2">
          <Info className="h-3.5 w-3.5" />
          Enter the UPI ID and amount you plan to send for an instant AI risk assessment.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {/* UPI input */}
          <div>
            <label className="text-xs text-white/40 font-semibold mb-2 block">Recipient UPI ID</label>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] focus-within:border-emerald-500/50 transition-colors">
              <User className="h-4 w-4 text-white/30 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="example@upi"
                value={targetUpi}
                onChange={(e) => { setTargetUpi(e.target.value); setResult(null); }}
                className="bg-transparent outline-none text-sm text-white placeholder:text-white/20 flex-1"
              />
              {targetUpi && (
                <button onClick={() => { setTargetUpi(''); setResult(null); }}>
                  <X className="h-3.5 w-3.5 text-white/30 hover:text-white/60" />
                </button>
              )}
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="text-xs text-white/40 font-semibold mb-2 block">Amount (₹)</label>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] focus-within:border-emerald-500/50 transition-colors">
              <DollarSign className="h-4 w-4 text-white/30 flex-shrink-0" />
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setResult(null); }}
                className="bg-transparent outline-none text-sm text-white placeholder:text-white/20 flex-1"
              />
            </div>
          </div>
        </div>

        {/* Quick amount pills */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs text-white/30">Quick:</span>
          {[100, 500, 1000, 5000, 10000].map((v) => (
            <button key={v} onClick={() => setAmount(String(v))}
              className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                amount === String(v) ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}>
              {fmt(v)}
            </button>
          ))}
        </div>

        <button onClick={runCheck} disabled={!targetUpi.trim() || !amount || checking}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold transition-all
            bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500
            disabled:opacity-40 disabled:cursor-not-allowed">
          {checking ? (
            <><motion.div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
              Analysing…</>
          ) : (
            <><Shield className="h-4 w-4" /> Run Shield Check <ArrowRight className="h-4 w-4 ml-1" /></>
          )}
        </button>
      </motion.div>

      {/* Result */}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div key="result" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="space-y-6">

            {/* Verdict banner */}
            <div className={`rounded-2xl bg-gradient-to-r ${verdictCfg.bg} border ${verdictCfg.border} p-6`}>
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <RiskRing score={result.compositeRisk} color={verdictCfg.color} />
                  <div>
                    {(() => { const VIcon = verdictCfg.icon; return <VIcon className="h-7 w-7 mb-2" style={{ color: verdictCfg.color }} />; })()}
                    <p className="text-2xl font-black" style={{ color: verdictCfg.color }}>{verdictCfg.label}</p>
                    <p className="text-white/50 text-sm mt-0.5">{verdictCfg.sub}</p>
                    <p className="text-white/30 text-xs mt-2">Confidence: {result.confidence}% · {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>

                {/* Spoofing alert */}
                {result.isSpoofSuspect && (
                  <div className="rounded-xl bg-red-500/15 border border-red-500/30 p-4 max-w-xs">
                    <p className="text-red-300 font-bold text-sm mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      UPI Spoofing Detected!
                    </p>
                    <p className="text-red-200/70 text-xs">
                      "{targetUpi}" looks like "{result.closestUpi}" ({result.minDistance} char diff). Verify with the recipient via another channel before sending.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Factor breakdown */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
              <div className="flex items-center gap-2 mb-5">
                <Fingerprint className="h-4 w-4 text-indigo-400" />
                <h2 className="font-semibold">Risk Factor Analysis</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.factors.map((f, i) => {
                  const color = f.risk === 'high' ? '#ef4444' : f.risk === 'medium' ? '#f59e0b' : '#10b981';
                  const Icon  = f.risk === 'high' ? AlertTriangle : f.risk === 'medium' ? Eye : CheckCircle;
                  return (
                    <motion.div key={f.key} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.08 * i }}
                      className="rounded-xl p-4 border" style={{ background: color + '08', borderColor: color + '25' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-4 w-4" style={{ color }} />
                        <span className="text-sm font-semibold text-white/80">{f.label}</span>
                        <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full uppercase"
                          style={{ color, background: color + '20' }}>
                          {f.risk}
                        </span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-1.5 mb-2">
                        <motion.div className="h-full rounded-full" style={{ backgroundColor: color }}
                          initial={{ width: 0 }} animate={{ width: `${f.score}%` }}
                          transition={{ duration: 0.7, delay: 0.08 * i }} />
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed">{f.detail}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              {result.verdict === 'ALLOW' && (
                <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold transition-colors">
                  <CheckCircle className="h-4 w-4" />
                  Proceed to Send Money
                </button>
              )}
              {result.verdict === 'CAUTION' && (
                <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 font-semibold transition-colors">
                  <AlertTriangle className="h-4 w-4" />
                  Send with Caution
                </button>
              )}
              {result.verdict === 'BLOCK' && (
                <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 font-semibold transition-colors">
                  <ShieldAlert className="h-4 w-4" />
                  Report this UPI
                </button>
              )}
              <button onClick={reset}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white/80 transition-colors">
                <RefreshCw className="h-4 w-4" />
                Check Another
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent checks */}
      {recentChecks.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-white/40" />
            <h2 className="font-semibold text-sm text-white/60">Recent Checks</h2>
          </div>
          <div className="space-y-2">
            {recentChecks.map(({ upi, amount: amt, verdict, ts }, i) => {
              const cfg = VERDICT_CONFIG[verdict];
              return (
                <button key={i} onClick={() => { setTargetUpi(upi); setAmount(String(amt)); setResult(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] transition-colors text-left">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: cfg.color + '20' }}>
                    {(() => { const CIcon = cfg.icon; return <CIcon className="h-3.5 w-3.5" style={{ color: cfg.color }} />; })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/80 truncate">{upi}</p>
                    <p className="text-xs text-white/30">{fmt(amt)} · {ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ color: cfg.color, background: cfg.color + '20' }}>
                    {verdict}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-white/20" />
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* How it works */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5">
        <p className="text-xs text-white/30 font-semibold uppercase tracking-widest mb-4">How Shield Works</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: Search,     title: '6-Factor Analysis', desc: 'Checks recipient history, UPI spoofing similarity, amount anomaly, time risk, velocity, and round-number patterns.' },
            { icon: Zap,        title: 'Levenshtein Engine', desc: 'Compares target UPI against all your contacts to detect character-swap impersonation attacks in real time.' },
            { icon: TrendingUp, title: 'Personal Baseline',  desc: 'Uses your own transaction history to calibrate what is "normal" for you — not generic population averages.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                <Icon className="h-4 w-4 text-white/40" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white/70 mb-1">{title}</p>
                <p className="text-xs text-white/30 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

    </div>
  );
}
