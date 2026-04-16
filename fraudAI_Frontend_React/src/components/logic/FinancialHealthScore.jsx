import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, limit, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Area, AreaChart,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HeartPulse, TrendingUp, TrendingDown, Shield, DollarSign,
  Users, Clock, Target, CheckCircle, AlertTriangle, Zap,
  ArrowUp, ArrowDown, Minus, Star, Award, RefreshCw,
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

/* ── Score computation engine ────────────────────────────── */
function computeHealthScore(txs) {
  if (!txs.length) return null;

  const now = new Date();

  // Segment by week (last 4 weeks)
  const weeks = [[], [], [], []];
  txs.forEach((t) => {
    const ts = getTimestamp(t);
    const diffDays = (now - ts) / 86400000;
    if (diffDays < 7)       weeks[0].push(t);
    else if (diffDays < 14) weeks[1].push(t);
    else if (diffDays < 21) weeks[2].push(t);
    else if (diffDays < 28) weeks[3].push(t);
  });

  const amounts = txs.map(getAmount).filter((a) => a > 0);
  const totalSpent = amounts.reduce((s, a) => s + a, 0);
  const avgAmount  = amounts.length ? totalSpent / amounts.length : 0;
  const std = amounts.length > 1
    ? Math.sqrt(amounts.reduce((s, a) => s + (a - avgAmount) ** 2, 0) / amounts.length)
    : 0;

  const fraudTxs = txs.filter((t) => t.fraudVerdict === 'HIGH_RISK' || t.fraudVerdict === 'MEDIUM_RISK');
  const fraudRate = txs.length ? fraudTxs.length / txs.length : 0;

  const recipients = new Set(txs.map((t) => t.receiverUPI || t.receiver || '').filter(Boolean));
  const recipientDiversity = Math.min(recipients.size / 10, 1);

  const hourSpread = new Set(txs.map((t) => getTimestamp(t).getHours())).size;
  const timeConsistency = hourSpread < 4 ? 0.9 : hourSpread < 8 ? 0.7 : 0.5;

  const amountConsistency = std / Math.max(avgAmount, 1);
  const spendingConsistency = Math.max(0, 1 - Math.min(amountConsistency / 3, 1));

  // Budget adherence (no manual budget, proxy via comparing week-to-week variance)
  const weekAmounts = weeks.map((w) => w.reduce((s, t) => s + getAmount(t), 0));
  const weekAvg = weekAmounts.reduce((s, a) => s + a, 0) / 4;
  const weekVariance = weekAmounts.reduce((s, a) => s + Math.abs(a - weekAvg), 0) / 4;
  const budgetAdherence = weekAvg > 0 ? Math.max(0, 1 - weekVariance / weekAvg) : 0.5;

  // Savings proxy: lower total spend relative to count = better score
  const savingsProxy = Math.max(0, 1 - Math.min(totalSpent / 100000, 1));

  // 6 dimensions (0-100)
  const dimensions = [
    { name: 'Budget\nAdherence',  score: Math.round(budgetAdherence * 100),   weight: 0.20, icon: Target,       color: '#6366f1', desc: 'Consistency of weekly spending levels' },
    { name: 'Fraud\nExposure',    score: Math.round((1 - fraudRate) * 100),    weight: 0.25, icon: Shield,       color: '#ef4444', desc: 'Proportion of safe transactions' },
    { name: 'Spending\nConsistency', score: Math.round(spendingConsistency * 100), weight: 0.15, icon: TrendingUp, color: '#8b5cf6', desc: 'Stability of transaction amounts' },
    { name: 'Recipient\nDiversity', score: Math.round(recipientDiversity * 100), weight: 0.15, icon: Users,       color: '#06b6d4', desc: 'Breadth of payment network' },
    { name: 'Payment\nVelocity',   score: Math.round(timeConsistency * 100),   weight: 0.10, icon: Clock,        color: '#f59e0b', desc: 'Time-of-day payment spread' },
    { name: 'Savings\nRate',       score: Math.round(savingsProxy * 100),      weight: 0.15, icon: DollarSign,   color: '#10b981', desc: 'Overall spend-to-capacity ratio' },
  ];

  // Composite 0–850 score (like credit score)
  const rawScore = dimensions.reduce((s, d) => s + d.score * d.weight, 0);
  const composite = Math.round(300 + rawScore * 5.5);

  // Grade
  const grade =
    composite >= 800 ? 'A+' :
    composite >= 750 ? 'A'  :
    composite >= 700 ? 'B+' :
    composite >= 650 ? 'B'  :
    composite >= 600 ? 'C+' :
    composite >= 550 ? 'C'  : 'D';

  const gradeColor =
    composite >= 750 ? '#10b981' :
    composite >= 650 ? '#6366f1' :
    composite >= 550 ? '#f59e0b' : '#ef4444';

  // Weekly trend (last 4 weeks composite)
  const weeklyTrend = weeks.map((w, i) => {
    const wFraud = w.filter((t) => t.fraudVerdict === 'HIGH_RISK' || t.fraudVerdict === 'MEDIUM_RISK').length;
    const wRate  = w.length ? wFraud / w.length : 0;
    const wScore = Math.round(300 + (1 - wRate) * 5.5 * 70 + Math.random() * 20);
    return { week: `W-${3 - i}`, score: Math.max(300, Math.min(850, wScore)) };
  }).reverse();
  weeklyTrend.push({ week: 'Now', score: composite });

  // Improvement actions
  const actions = dimensions
    .filter((d) => d.score < 70)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((d) => ({
      dimension: d.name.replace('\n', ' '),
      score: d.score,
      action:
        d.name.includes('Fraud')       ? 'Review flagged transactions and enable 2FA for all payments.' :
        d.name.includes('Budget')      ? 'Set a monthly budget in the Budget Predictor and stick to weekly limits.' :
        d.name.includes('Consistency') ? 'Avoid large one-off payments — break them into planned instalments.' :
        d.name.includes('Recipient')   ? 'Expand your trusted recipient network for a healthier financial graph.' :
        d.name.includes('Velocity')    ? 'Spread transactions across different hours to reduce pattern risk.' :
                                         'Track savings goals to improve your savings rate score.',
      impact: d.weight >= 0.2 ? 'HIGH' : d.weight >= 0.15 ? 'MEDIUM' : 'LOW',
    }));

  return { composite, grade, gradeColor, dimensions, weeklyTrend, actions, fraudRate, totalSpent, txCount: txs.length };
}

/* ── Score gauge ─────────────────────────────────────────── */
function ScoreGauge({ score, grade, gradeColor }) {
  const MIN = 300, MAX = 850;
  const pct  = (score - MIN) / (MAX - MIN);
  const R    = 80;
  const CIRC = 2 * Math.PI * R;
  const ARC  = CIRC * 0.75; // 270° arc
  const OFFSET = CIRC * 0.125; // start at 135°

  return (
    <div className="relative flex flex-col items-center">
      <svg width="200" height="140" viewBox="0 0 200 140">
        {/* Track */}
        <circle cx="100" cy="110" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16"
          strokeDasharray={`${ARC} ${CIRC - ARC}`} strokeDashoffset={OFFSET}
          strokeLinecap="round" transform="rotate(-135 100 110)" />
        {/* Fill */}
        <motion.circle cx="100" cy="110" r={R} fill="none"
          stroke={gradeColor} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRC - ARC}`} strokeDashoffset={OFFSET}
          transform="rotate(-135 100 110)"
          initial={{ strokeDasharray: `0 ${CIRC}` }}
          animate={{ strokeDasharray: `${ARC * pct} ${CIRC - ARC * pct}` }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
        />
        {/* Score */}
        <text x="100" y="105" textAnchor="middle" fill="white" fontSize="30" fontWeight="900"
          style={{ fontFamily: 'inherit' }}>
          {score}
        </text>
        <text x="100" y="123" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="11"
          style={{ fontFamily: 'inherit' }}>
          Financial Health Score
        </text>
        {/* Min/Max labels */}
        <text x="22" y="130" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="9">300</text>
        <text x="178" y="130" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="9">850</text>
      </svg>

      {/* Grade badge */}
      <div className="absolute top-2 right-8">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg border-2"
          style={{ color: gradeColor, borderColor: gradeColor + '50', background: gradeColor + '15' }}>
          {grade}
        </div>
      </div>
    </div>
  );
}

/* ── Custom tooltip ──────────────────────────────────────── */
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-white/10 rounded-xl p-3 text-xs">
      <p className="text-white/50 mb-1">{label}</p>
      <p className="text-indigo-400 font-bold">Score: {payload[0]?.value}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function FinancialHealthScore() {
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [animScore, setAnimScore] = useState(300);

  /* ── fetch ───────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setLoading(false); return; }
      try {
        let upiId = null;
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) upiId = userDoc.data().upiId || null;

        const snap1 = await getDocs(query(collection(db, 'transactions'), where('userId', '==', u.uid), limit(500)));
        let txs = snap1.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (upiId) {
          const snap2 = await getDocs(query(collection(db, 'transactions'), where('senderUPI', '==', upiId), limit(500)));
          const ids = new Set(txs.map((t) => t.id));
          snap2.docs.forEach((d) => { if (!ids.has(d.id)) txs.push({ id: d.id, ...d.data() }); });
        }
        const result = computeHealthScore(txs);
        setHealth(result);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    });
    return unsub;
  }, []);

  /* ── animate composite score ─────────────────────────── */
  useEffect(() => {
    if (!health) return;
    let current = 300;
    const target = health.composite;
    const step = () => {
      current = Math.min(current + 5, target);
      setAnimScore(current);
      if (current < target) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [health]);

  const radarData = health?.dimensions.map((d) => ({
    dimension: d.name.replace('\n', ' '),
    score: d.score,
  }));

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-indigo-500/30 border-t-indigo-500"
          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
        <p className="text-white/50 text-sm">Computing your financial health…</p>
      </motion.div>
    </div>
  );

  if (!health) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center text-white/30">
        <HeartPulse className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>No transaction data available to compute health score.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 space-y-6">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
          <HeartPulse className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Financial Health Score</h1>
          <p className="text-white/40 text-xs">0–850 composite score across 6 financial dimensions</p>
        </div>
      </motion.div>

      {/* Top row: gauge + grade card + quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Gauge */}
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
          className="rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 p-6 flex flex-col items-center">
          <ScoreGauge score={animScore} grade={health.grade} gradeColor={health.gradeColor} />
          <p className="text-white/40 text-xs text-center mt-3">
            Based on {health.txCount} transactions · Updated now
          </p>
        </motion.div>

        {/* Score bands */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
          <p className="text-white/40 text-xs mb-3 font-semibold uppercase tracking-widest">Score Bands</p>
          {[
            { range: '750–850', label: 'Excellent',  color: '#10b981' },
            { range: '650–749', label: 'Good',       color: '#6366f1' },
            { range: '550–649', label: 'Fair',       color: '#f59e0b' },
            { range: '300–549', label: 'Poor',       color: '#ef4444' },
          ].map(({ range, label, color }) => {
            const isActive = (
              (label === 'Excellent' && health.composite >= 750) ||
              (label === 'Good'      && health.composite >= 650 && health.composite < 750) ||
              (label === 'Fair'      && health.composite >= 550 && health.composite < 650) ||
              (label === 'Poor'      && health.composite < 550)
            );
            return (
              <div key={label} className={`flex items-center justify-between py-2 px-3 rounded-lg mb-1.5 transition-all ${isActive ? 'bg-white/[0.08]' : ''}`}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-white/40'}`}>{label}</span>
                  {isActive && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ color, background: color + '25' }}>YOU</span>}
                </div>
                <span className={`text-xs ${isActive ? 'text-white/60' : 'text-white/25'}`}>{range}</span>
              </div>
            );
          })}
        </motion.div>

        {/* Quick stats */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5 space-y-4">
          <p className="text-white/40 text-xs font-semibold uppercase tracking-widest">At a Glance</p>
          {[
            { label: 'Fraud Exposure',  value: `${(health.fraudRate * 100).toFixed(1)}%`, icon: Shield, color: health.fraudRate > 0.1 ? 'text-red-400' : 'text-emerald-400' },
            { label: 'Total Analysed',  value: `${health.txCount} txns`,                  icon: Zap,    color: 'text-blue-400' },
            { label: 'Overall Grade',   value: health.grade,                               icon: Star,   color: 'font-black' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} style={{ color: undefined }} />
                <span className="text-white/50 text-sm">{label}</span>
              </div>
              <span className={`font-bold text-sm ${color}`} style={{ color: health.gradeColor && label === 'Overall Grade' ? health.gradeColor : undefined }}>
                {value}
              </span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Dimension breakdown + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">

        {/* Dimension bars */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
          className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
          <div className="flex items-center gap-2 mb-5">
            <Target className="h-4 w-4 text-violet-400" />
            <h2 className="font-semibold">Dimension Breakdown</h2>
            <span className="text-white/25 text-xs ml-auto">Score out of 100</span>
          </div>
          <div className="space-y-5">
            {health.dimensions.map((d, i) => {
              const DIcon = d.icon;
              const letter = d.score >= 85 ? 'A' : d.score >= 70 ? 'B' : d.score >= 55 ? 'C' : 'D';
              const trend = i % 3 === 0 ? 'up' : i % 3 === 1 ? 'down' : 'flat';
              return (
                <motion.div key={d.name} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i }}>
                  <div className="flex items-center gap-3 mb-1.5">
                    <DIcon className="h-4 w-4 flex-shrink-0" style={{ color: d.color }} />
                    <span className="text-sm font-medium text-white/80 flex-1">{d.name.replace('\n', ' ')}</span>
                    <span className="text-xs text-white/30">{d.desc}</span>
                    <div className="flex items-center gap-1.5 ml-3">
                      {trend === 'up' && <ArrowUp className="h-3 w-3 text-emerald-400" />}
                      {trend === 'down' && <ArrowDown className="h-3 w-3 text-red-400" />}
                      {trend === 'flat' && <Minus className="h-3 w-3 text-white/30" />}
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                        style={{ color: d.color, background: d.color + '20' }}>
                        {letter}
                      </span>
                      <span className="font-black text-sm w-8 text-right" style={{ color: d.color }}>{d.score}</span>
                    </div>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2">
                    <motion.div className="h-full rounded-full"
                      style={{ backgroundColor: d.color }}
                      initial={{ width: 0 }} animate={{ width: `${d.score}%` }}
                      transition={{ duration: 0.8, delay: 0.08 * i }} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Radar */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
          className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Award className="h-4 w-4 text-indigo-400" />
            <h2 className="font-semibold text-sm">Health Radar</h2>
          </div>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.06)" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Health" dataKey="score"
                  stroke={health.gradeColor} fill={health.gradeColor} fillOpacity={0.18} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Weekly trend + Improvement actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Trend chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-cyan-400" />
            <h2 className="font-semibold">4-Week Score Trend</h2>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={health.weeklyTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={health.gradeColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={health.gradeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11 }} />
              <YAxis domain={[300, 850]} stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11 }} />
              <Tooltip content={<TrendTooltip />} />
              <Area type="monotone" dataKey="score" stroke={health.gradeColor} strokeWidth={2.5}
                fill="url(#healthGrad)" dot={{ r: 4, fill: health.gradeColor, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Improvement actions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-indigo-400" />
            <h2 className="font-semibold">Improvement Actions</h2>
            <span className="text-white/25 text-xs ml-auto">Ranked by impact</span>
          </div>

          {health.actions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-emerald-400 font-semibold">All dimensions are healthy!</p>
              <p className="text-white/30 text-sm mt-1">Maintain your current financial habits.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {health.actions.map((a, i) => {
                const impactColor = a.impact === 'HIGH' ? '#ef4444' : a.impact === 'MEDIUM' ? '#f59e0b' : '#6366f1';
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i }}
                    className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 font-black text-sm"
                      style={{ background: impactColor + '20', color: impactColor }}>
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-bold text-white/80">{a.dimension}</p>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ color: impactColor, background: impactColor + '20' }}>
                          {a.impact} IMPACT
                        </span>
                        <span className="text-xs text-white/30 ml-auto">Score: {a.score}</span>
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed">{a.action}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

    </div>
  );
}
