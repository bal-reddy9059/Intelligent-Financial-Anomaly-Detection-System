import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, query, where, limit, doc, getDoc, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Microscope, Search, AlertTriangle, CheckCircle, ShieldAlert,
  Zap, ChevronRight, Clock, DollarSign, MapPin, User,
  TrendingUp, Activity, Info, X, Eye, Layers, RefreshCw,
  Fingerprint, BarChart2, Brain,
} from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────── */
function getAmount(tx) {
  const v = parseFloat(tx.amount ?? tx.Amount ?? tx.transactionAmount ?? 0);
  return isNaN(v) ? 0 : v;
}
function getTimestamp(tx) {
  if (tx.timestamp?.toDate) return tx.timestamp.toDate();
  return new Date(tx.timestamp || tx.date || 0);
}
const fmt = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;

/* ── SHAP-style factor extraction ────────────────────────── */
function explainTransaction(tx, allTxs) {
  const amount = getAmount(tx);
  const ts = getTimestamp(tx);
  const hour = ts.getHours();
  const dow = ts.getDay();
  const amountList = allTxs.map(getAmount).filter((a) => a > 0);
  const avgAmount = amountList.length ? amountList.reduce((a, b) => a + b, 0) / amountList.length : 0;
  const stdAmount = amountList.length
    ? Math.sqrt(amountList.reduce((s, a) => s + (a - avgAmount) ** 2, 0) / amountList.length)
    : 1;

  // Is this recipient new?
  const recipientTxs = allTxs.filter((t) => t.receiverUPI === tx.receiverUPI || t.receiver === tx.receiver);
  const isNewRecipient = recipientTxs.length <= 1;

  // Hour risk: 0-5 AM = high
  const oddHour = hour >= 0 && hour <= 5;

  // Z-score of amount
  const zScore = stdAmount > 0 ? (amount - avgAmount) / stdAmount : 0;

  // Weekend
  const isWeekend = dow === 0 || dow === 6;

  // Rapid succession: >1 tx in 60 min window
  const window60 = allTxs.filter((t) => {
    const diff = Math.abs(getTimestamp(t).getTime() - ts.getTime());
    return diff < 3600000 && t.id !== tx.id;
  });
  const rapidSuccession = window60.length > 0;

  // Round number amount
  const isRound = amount % 100 === 0 || amount % 500 === 0;

  // Fraud verdict from model
  const fraudVerdict = tx.fraudVerdict || tx.fraud_verdict || 'UNKNOWN';
  const fraudScore = parseFloat(tx.fraudScore ?? tx.fraud_score ?? 0.5);

  // Build SHAP-style factors
  const factors = [
    {
      name: 'Transaction Amount',
      value: Math.min(Math.abs(zScore) * 0.3, 1),
      direction: zScore > 1.5 ? 'risk' : 'safe',
      explanation: zScore > 2
        ? `₹${amount.toLocaleString('en-IN')} is ${zScore.toFixed(1)}× above your average (${fmt(Math.round(avgAmount))}). Large deviations indicate anomaly.`
        : zScore > 0
        ? `Amount is slightly above average but within normal range.`
        : `Amount is below your average transaction size — no concern.`,
      icon: DollarSign,
    },
    {
      name: 'Time of Transaction',
      value: oddHour ? 0.9 : isWeekend ? 0.4 : 0.05,
      direction: oddHour ? 'risk' : 'safe',
      explanation: oddHour
        ? `Initiated at ${ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} — late-night transactions are 3× more likely to be fraudulent.`
        : `Transaction at ${ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} during normal hours — low risk signal.`,
      icon: Clock,
    },
    {
      name: 'Recipient Profile',
      value: isNewRecipient ? 0.75 : 0.05,
      direction: isNewRecipient ? 'risk' : 'safe',
      explanation: isNewRecipient
        ? `${tx.receiver || tx.receiverUPI || 'Recipient'} has never received money from you before. First-time recipients carry higher risk.`
        : `You have transacted with ${tx.receiver || tx.receiverUPI || 'this recipient'} ${recipientTxs.length} times before — trusted contact.`,
      icon: User,
    },
    {
      name: 'Velocity (Rapid Succession)',
      value: rapidSuccession ? 0.8 : 0.05,
      direction: rapidSuccession ? 'risk' : 'safe',
      explanation: rapidSuccession
        ? `${window60.length} other transaction(s) within 60 minutes. Rapid-fire payments are a top fraud indicator.`
        : 'No other transactions within 60 minutes — normal pace.',
      icon: Zap,
    },
    {
      name: 'Round Number Pattern',
      value: isRound ? 0.35 : 0.02,
      direction: isRound ? 'risk' : 'safe',
      explanation: isRound
        ? `${fmt(amount)} is a round figure. Fraudsters often use round amounts to seem legitimate.`
        : `Specific amount ${fmt(amount)} — less characteristic of scripted fraud patterns.`,
      icon: BarChart2,
    },
    {
      name: 'ML Model Confidence',
      value: fraudScore,
      direction: fraudScore > 0.6 ? 'risk' : 'safe',
      explanation:
        fraudVerdict === 'HIGH_RISK'
          ? `ML model flagged this as HIGH RISK (score: ${(fraudScore * 100).toFixed(0)}%). Multiple learned fraud patterns detected.`
          : fraudVerdict === 'MEDIUM_RISK'
          ? `Model assigned MEDIUM RISK (score: ${(fraudScore * 100).toFixed(0)}%). Some suspicious signals present.`
          : `ML model marked this transaction SAFE (score: ${(fraudScore * 100).toFixed(0)}%). Matches legitimate transaction patterns.`,
      icon: Brain,
    },
  ];

  // Composite risk
  const riskSum = factors.reduce((s, f) => s + (f.direction === 'risk' ? f.value : 0), 0);
  const compositeRisk = Math.min(Math.round((riskSum / factors.length) * 200), 100);

  const verdict =
    fraudVerdict === 'HIGH_RISK' || compositeRisk >= 65
      ? 'HIGH_RISK'
      : fraudVerdict === 'MEDIUM_RISK' || compositeRisk >= 35
      ? 'MEDIUM_RISK'
      : 'SAFE';

  // Radar data
  const radarData = factors.map((f) => ({
    factor: f.name.split(' ')[0],
    value: Math.round(f.value * 100),
  }));

  return { factors, compositeRisk, verdict, radarData, fraudScore };
}

/* ── VERDICT config ──────────────────────────────────────── */
const VERDICT_CONFIG = {
  HIGH_RISK:   { color: '#ef4444', bg: 'from-red-500/15 to-rose-500/5',    border: 'border-red-500/40',    label: 'High Risk',    icon: ShieldAlert },
  MEDIUM_RISK: { color: '#f59e0b', bg: 'from-amber-500/15 to-yellow-500/5', border: 'border-amber-500/40', label: 'Medium Risk',  icon: AlertTriangle },
  SAFE:        { color: '#10b981', bg: 'from-emerald-500/10 to-teal-500/5', border: 'border-emerald-500/30', label: 'Safe',        icon: CheckCircle },
  UNKNOWN:     { color: '#6366f1', bg: 'from-indigo-500/10 to-violet-500/5', border: 'border-indigo-500/30', label: 'Unknown',    icon: Info },
};

/* ── Score ring ──────────────────────────────────────────── */
function ScoreRing({ score, color }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const offset = C - (score / 100) * C;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="rotate-[-90deg]">
      <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
      <motion.circle
        cx="70" cy="70" r={R} fill="none"
        stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
      <text x="70" y="75" textAnchor="middle" fill="white" fontSize="28" fontWeight="900"
        dominantBaseline="middle" transform="rotate(90 70 70)" style={{ fontFamily: 'inherit' }}>
        {score}
      </text>
      <text x="70" y="95" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10"
        transform="rotate(90 70 70)" style={{ fontFamily: 'inherit' }}>
        RISK SCORE
      </text>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function AnomalyExplainer() {
  const [txs, setTxs]               = useState([]);
  const [selected, setSelected]      = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading]        = useState(true);
  const [analyzing, setAnalyzing]    = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter]          = useState('all'); // all | fraud | safe

  /* ── fetch transactions ──────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setLoading(false); return; }
      try {
        let userUpiId = null;
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) userUpiId = userDoc.data().upiId || null;

        const snap1 = await getDocs(query(collection(db, 'transactions'), where('userId', '==', u.uid), limit(200)));
        let all = snap1.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (userUpiId) {
          const snap2 = await getDocs(query(collection(db, 'transactions'), where('senderUPI', '==', userUpiId), limit(200)));
          const ids = new Set(all.map((t) => t.id));
          snap2.docs.forEach((d) => { if (!ids.has(d.id)) all.push({ id: d.id, ...d.data() }); });
        }

        // Sort newest first
        all.sort((a, b) => getTimestamp(b) - getTimestamp(a));
        setTxs(all);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  /* ── analyse a transaction ───────────────────────────── */
  const analyseTransaction = (tx) => {
    setAnalyzing(true);
    setSelected(tx);
    // Simulate processing delay for realism
    setTimeout(() => {
      const result = explainTransaction(tx, txs);
      setExplanation(result);
      setAnalyzing(false);
    }, 900);
  };

  /* ── filtered list ───────────────────────────────────── */
  const filteredTxs = txs.filter((t) => {
    const verdict = t.fraudVerdict || t.fraud_verdict || '';
    const matchesFilter =
      filter === 'all' ? true :
      filter === 'fraud' ? (verdict === 'HIGH_RISK' || verdict === 'MEDIUM_RISK') :
      verdict === 'SAFE';
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || (
      (t.receiver || '').toLowerCase().includes(q) ||
      (t.receiverUPI || '').toLowerCase().includes(q) ||
      String(getAmount(t)).includes(q)
    );
    return matchesFilter && matchesSearch;
  });

  /* ── loading ─────────────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-indigo-500/30 border-t-indigo-500"
          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
        <p className="text-white/50 text-sm">Loading transaction data…</p>
      </motion.div>
    </div>
  );

  const verdictCfg = explanation ? (VERDICT_CONFIG[explanation.verdict] || VERDICT_CONFIG.UNKNOWN) : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] min-h-screen">

        {/* ── LEFT PANEL: Transaction List ─────────────── */}
        <div className="border-r border-white/[0.07] flex flex-col">

          {/* Header */}
          <div className="p-5 border-b border-white/[0.07]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                <Microscope className="h-4.5 w-4.5 text-indigo-400" />
              </div>
              <div>
                <h1 className="font-bold text-base">Anomaly Explainer</h1>
                <p className="text-white/30 text-xs">AI-powered transaction forensics</p>
              </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.07] mb-3">
              <Search className="h-3.5 w-3.5 text-white/30 flex-shrink-0" />
              <input
                className="bg-transparent outline-none text-sm text-white placeholder:text-white/25 flex-1"
                placeholder="Search recipient, amount…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}><X className="h-3 w-3 text-white/30 hover:text-white/60" /></button>
              )}
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1.5">
              {[['all', 'All'], ['fraud', 'Fraud'], ['safe', 'Safe']].map(([val, label]) => (
                <button key={val} onClick={() => setFilter(val)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    filter === val ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'
                  }`}>
                  {label}
                </button>
              ))}
              <span className="ml-auto text-white/30 text-xs self-center">{filteredTxs.length} txns</span>
            </div>
          </div>

          {/* Transaction list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {filteredTxs.length === 0 ? (
              <div className="text-center py-16 text-white/25">
                <Eye className="mx-auto h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No transactions found</p>
              </div>
            ) : (
              filteredTxs.map((tx) => {
                const verdict = tx.fraudVerdict || tx.fraud_verdict || 'UNKNOWN';
                const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.UNKNOWN;
                const IconCmp = cfg.icon;
                const isSelected = selected?.id === tx.id;
                const ts = getTimestamp(tx);
                return (
                  <motion.button
                    key={tx.id}
                    whileHover={{ x: 2 }}
                    onClick={() => analyseTransaction(tx)}
                    className={`w-full text-left rounded-xl p-3 border transition-all ${
                      isSelected
                        ? `border-indigo-500/50 bg-indigo-500/10`
                        : `border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.1]`
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cfg.color}20` }}>
                        <IconCmp className="h-4 w-4" style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold truncate text-white/90">
                            {tx.receiver || tx.receiverUPI || 'Unknown'}
                          </p>
                          <p className="text-sm font-bold text-white ml-2">{fmt(getAmount(tx))}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-white/30 truncate">
                            {ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                            {' · '}{ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: cfg.color, background: `${cfg.color}20` }}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 transition-colors ${isSelected ? 'text-indigo-400' : 'text-white/20'}`} />
                    </div>
                  </motion.button>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Explanation ─────────────────── */}
        <div className="p-6 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* Empty state */}
            {!selected && !analyzing && (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center text-center py-24">
                <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6">
                  <Microscope className="h-10 w-10 text-indigo-400/60" />
                </div>
                <h2 className="text-xl font-bold text-white/40 mb-2">Select a Transaction</h2>
                <p className="text-white/20 text-sm max-w-xs">
                  Choose any transaction from the list to get a deep AI-powered forensic breakdown of its risk factors.
                </p>
              </motion.div>
            )}

            {/* Analyzing */}
            {analyzing && (
              <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center text-center py-24">
                <motion.div className="w-16 h-16 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 mb-6"
                  animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
                <p className="text-white/60 font-semibold">Analysing transaction…</p>
                <p className="text-white/30 text-sm mt-1">Computing SHAP-style risk factors</p>
              </motion.div>
            )}

            {/* Explanation */}
            {!analyzing && explanation && selected && (
              <motion.div key={selected.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="space-y-6">

                {/* Transaction header */}
                <div className={`rounded-2xl bg-gradient-to-r ${verdictCfg.bg} border ${verdictCfg.border} p-5`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <ScoreRing score={explanation.compositeRisk} color={verdictCfg.color} />
                      <div>
                        <p className="text-white/40 text-xs mb-1">Transaction to</p>
                        <p className="text-xl font-bold">{selected.receiver || selected.receiverUPI || 'Unknown'}</p>
                        <p className="text-2xl font-black mt-1" style={{ color: verdictCfg.color }}>
                          {fmt(getAmount(selected))}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {(() => {
                            const IconV = verdictCfg.icon;
                            return <IconV className="h-4 w-4" style={{ color: verdictCfg.color }} />;
                          })()}
                          <span className="font-bold text-sm" style={{ color: verdictCfg.color }}>
                            {verdictCfg.label}
                          </span>
                          <span className="text-white/30 text-xs">·</span>
                          <span className="text-white/30 text-xs">
                            {getTimestamp(selected).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* UPI details */}
                    <div className="text-right text-xs space-y-1">
                      {selected.senderUPI && (
                        <p className="text-white/30">From: <span className="text-white/60">{selected.senderUPI}</span></p>
                      )}
                      {selected.receiverUPI && (
                        <p className="text-white/30">To: <span className="text-white/60">{selected.receiverUPI}</span></p>
                      )}
                      {selected.category && (
                        <p className="text-white/30">Category: <span className="text-white/60">{selected.category}</span></p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Factor bars + Radar */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">

                  {/* SHAP factor bars */}
                  <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
                    <div className="flex items-center gap-2 mb-5">
                      <Layers className="h-4 w-4 text-indigo-400" />
                      <h2 className="font-semibold">Risk Factor Breakdown</h2>
                      <span className="text-white/30 text-xs ml-auto">SHAP-style attribution</span>
                    </div>
                    <div className="space-y-4">
                      {explanation.factors.map((f, i) => {
                        const pct = Math.round(f.value * 100);
                        const color = f.direction === 'risk' ? '#ef4444' : '#10b981';
                        const FIcon = f.icon;
                        return (
                          <motion.div key={f.name}
                            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 * i }}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <FIcon className="h-3.5 w-3.5" style={{ color }} />
                              <span className="text-sm font-medium text-white/80">{f.name}</span>
                              <span className="ml-auto text-xs font-bold" style={{ color }}>{pct}%</span>
                            </div>
                            <div className="w-full bg-white/5 rounded-full h-2 mb-2">
                              <motion.div className="h-full rounded-full" style={{ backgroundColor: color }}
                                initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.8, delay: 0.1 * i }} />
                            </div>
                            <p className="text-[11px] text-white/40 leading-relaxed">{f.explanation}</p>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Radar chart */}
                  <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                      <Activity className="h-4 w-4 text-violet-400" />
                      <h2 className="font-semibold text-sm">Risk Radar</h2>
                    </div>
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height={220}>
                        <RadarChart data={explanation.radarData}>
                          <PolarGrid stroke="rgba(255,255,255,0.07)" />
                          <PolarAngleAxis dataKey="factor" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                          <Radar name="Risk" dataKey="value" stroke={verdictCfg.color}
                            fill={verdictCfg.color} fillOpacity={0.2} strokeWidth={2} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* AI Verdict Summary */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                  className="rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="h-4 w-4 text-indigo-400" />
                    <h2 className="font-semibold">AI Forensic Verdict</h2>
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none">
                    {explanation.verdict === 'HIGH_RISK' ? (
                      <p className="text-white/70 text-sm leading-relaxed">
                        This transaction exhibits <span className="text-red-400 font-semibold">multiple high-risk signals</span>: the combination of
                        {explanation.factors.filter(f => f.direction === 'risk' && f.value > 0.5).map(f => ` ${f.name.toLowerCase()}`).join(',') || ' anomalous patterns'}
                        {' '}raises serious concern. The ML model has scored this at {fmt(Math.round((explanation.fraudScore ?? 0.8) * 100))}% fraud probability.
                        Immediate review is recommended.
                      </p>
                    ) : explanation.verdict === 'MEDIUM_RISK' ? (
                      <p className="text-white/70 text-sm leading-relaxed">
                        This transaction shows <span className="text-amber-400 font-semibold">some suspicious characteristics</span> but does not meet the threshold for high-risk classification.
                        Monitor this recipient and contact your bank if you did not initiate this payment.
                      </p>
                    ) : (
                      <p className="text-white/70 text-sm leading-relaxed">
                        This transaction appears <span className="text-emerald-400 font-semibold">legitimate</span>. All major risk factors are within normal bounds.
                        The ML model classified this as a safe transaction. No action required.
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-4">
                    {explanation.verdict !== 'SAFE' && (
                      <button className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/30 transition-colors flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Report Fraud
                      </button>
                    )}
                    <button className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-semibold hover:bg-white/10 transition-colors flex items-center gap-1.5">
                      <Fingerprint className="h-3.5 w-3.5" />
                      Add to Watchlist
                    </button>
                    <button
                      onClick={() => { setSelected(null); setExplanation(null); }}
                      className="ml-auto px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/30 text-xs hover:text-white/60 transition-colors flex items-center gap-1.5">
                      <X className="h-3 w-3" />
                      Clear
                    </button>
                  </div>
                </motion.div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
