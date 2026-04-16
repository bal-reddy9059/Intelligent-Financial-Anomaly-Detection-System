import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, query, where, limit, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PiggyBank, TrendingDown, AlertTriangle, CheckCircle,
  Zap, Calendar, Target, DollarSign, BarChart2,
  RefreshCw, ChevronRight, Flame, Clock, ArrowUp, ArrowDown,
} from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────── */
const TODAY = new Date();
const DAYS_IN_MONTH = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate();
const DAY_OF_MONTH = TODAY.getDate();
const DAYS_LEFT = DAYS_IN_MONTH - DAY_OF_MONTH;

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getAmount(tx) {
  const v = parseFloat(tx.amount ?? tx.Amount ?? tx.transactionAmount ?? 0);
  return isNaN(v) ? 0 : v;
}

function buildPrediction(txs, manualBudget) {
  const thisMonthKey = monthKey(TODAY);
  const lastMonthKey = monthKey(new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1));

  const thisMonth = txs.filter((t) => {
    const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp || t.date || 0);
    return monthKey(d) === thisMonthKey;
  });

  const lastMonth = txs.filter((t) => {
    const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp || t.date || 0);
    return monthKey(d) === lastMonthKey;
  });

  const spentSoFar = thisMonth.reduce((s, t) => s + getAmount(t), 0);
  const lastMonthTotal = lastMonth.reduce((s, t) => s + getAmount(t), 0);

  // Daily velocity = spent so far / days elapsed
  const daysElapsed = Math.max(DAY_OF_MONTH, 1);
  const dailyVelocity = spentSoFar / daysElapsed;
  const projectedTotal = spentSoFar + dailyVelocity * DAYS_LEFT;

  // Auto budget = 110% of last month or ₹10000 fallback
  const autoBudget = manualBudget || (lastMonthTotal > 0 ? lastMonthTotal * 1.1 : 10000);
  const remaining = autoBudget - spentSoFar;
  const safeDaily = DAYS_LEFT > 0 ? remaining / DAYS_LEFT : 0;

  // Exhaustion date
  let exhaustionDate = null;
  if (dailyVelocity > safeDaily && remaining > 0) {
    const daysToExhaust = remaining / dailyVelocity;
    exhaustionDate = new Date(TODAY);
    exhaustionDate.setDate(TODAY.getDate() + Math.floor(daysToExhaust));
  }

  // Day-by-day projected spend curve
  const curve = [];
  let cumulative = spentSoFar;
  for (let d = DAY_OF_MONTH + 1; d <= DAYS_IN_MONTH; d++) {
    cumulative += dailyVelocity;
    curve.push({
      day: d,
      projected: Math.round(cumulative),
      budget: Math.round(autoBudget),
      safe: Math.round(spentSoFar + safeDaily * (d - DAY_OF_MONTH)),
    });
  }

  // Category breakdown for this month
  const catMap = {};
  thisMonth.forEach((t) => {
    const cat = t.category || t.merchantCategory || 'Other';
    catMap[cat] = (catMap[cat] || 0) + getAmount(t);
  });
  const categories = Object.entries(catMap)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  // Weekly patterns (avg per day-of-week)
  const dowTotals = Array(7).fill(0);
  const dowCounts = Array(7).fill(0);
  txs.forEach((t) => {
    const d = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp || t.date || 0);
    const dow = d.getDay();
    dowTotals[dow] += getAmount(t);
    dowCounts[dow]++;
  });
  const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeklyPattern = DOW_LABELS.map((label, i) => ({
    label,
    avg: dowCounts[i] > 0 ? Math.round(dowTotals[i] / dowCounts[i]) : 0,
  }));

  // Risk level
  const burnRate = projectedTotal / autoBudget;
  const risk = burnRate >= 1.2 ? 'critical' : burnRate >= 1.0 ? 'high' : burnRate >= 0.85 ? 'medium' : 'safe';

  return {
    spentSoFar: Math.round(spentSoFar),
    projectedTotal: Math.round(projectedTotal),
    autoBudget: Math.round(autoBudget),
    remaining: Math.round(remaining),
    safeDaily: Math.round(safeDaily),
    dailyVelocity: Math.round(dailyVelocity),
    exhaustionDate,
    curve,
    categories,
    weeklyPattern,
    risk,
    burnRate,
    lastMonthTotal: Math.round(lastMonthTotal),
    txCount: thisMonth.length,
    changeVsLastMonth: lastMonthTotal > 0
      ? Math.round(((spentSoFar / (lastMonthTotal * DAY_OF_MONTH / DAYS_IN_MONTH)) - 1) * 100)
      : 0,
  };
}

/* ── colour helpers ──────────────────────────────────────── */
const RISK_CONFIG = {
  safe:     { color: '#10b981', label: 'On Track',      icon: CheckCircle,    bg: 'from-emerald-500/10 to-teal-500/5',    border: 'border-emerald-500/30' },
  medium:   { color: '#f59e0b', label: 'Watch Out',     icon: AlertTriangle,  bg: 'from-amber-500/10 to-yellow-500/5',    border: 'border-amber-500/30' },
  high:     { color: '#ef4444', label: 'Over Budget',   icon: Flame,          bg: 'from-red-500/10 to-rose-500/5',        border: 'border-red-500/30' },
  critical: { color: '#dc2626', label: 'Critical',      icon: Flame,          bg: 'from-red-700/20 to-rose-700/10',       border: 'border-red-600/50' },
};

const CAT_COLORS = ['#6366f1','#8b5cf6','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444'];

const fmt = (n) => `₹${n?.toLocaleString('en-IN') ?? 0}`;

/* ── custom tooltip ──────────────────────────────────────── */
function CurveTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-white/10 rounded-xl p-3 text-xs shadow-2xl">
      <p className="text-white/50 mb-1">Day {label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function BudgetPredictor() {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [manualBudget, setManualBudget] = useState('');
  const [inputActive, setInputActive]  = useState(false);
  const [animScore, setAnimScore]      = useState(0);
  const inputRef = useRef(null);

  /* ── fetch & compute ─────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setError('Not signed in'); setLoading(false); return; }
      try {
        let userUpiId = null;
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) userUpiId = userDoc.data().upiId || null;

        const snap1 = await getDocs(query(collection(db, 'transactions'), where('userId', '==', u.uid), limit(500)));
        let txs = snap1.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (userUpiId) {
          const snap2 = await getDocs(query(collection(db, 'transactions'), where('senderUPI', '==', userUpiId), limit(500)));
          const ids = new Set(txs.map((t) => t.id));
          snap2.docs.forEach((d) => { if (!ids.has(d.id)) txs.push({ id: d.id, ...d.data() }); });
        }

        const budget = parseFloat(manualBudget) || 0;
        const result = buildPrediction(txs, budget > 0 ? budget : null);
        setPrediction(result);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, [manualBudget]);

  /* ── animate score bar ───────────────────────────────── */
  useEffect(() => {
    if (!prediction) return;
    const target = Math.min(Math.round(prediction.burnRate * 100), 150);
    let current = 0;
    const step = () => {
      current = Math.min(current + 2, target);
      setAnimScore(current);
      if (current < target) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [prediction]);

  const recompute = () => {
    const budget = parseFloat(inputRef.current?.value) || 0;
    setManualBudget(budget > 0 ? String(budget) : '');
    setLoading(true);
  };

  /* ── loading ─────────────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div
          className="w-20 h-20 mx-auto mb-6 rounded-full border-4 border-violet-500/30 border-t-violet-500"
          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
        <p className="text-white/60 text-sm">Analysing spending velocity…</p>
      </motion.div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-red-400 text-center"><AlertTriangle className="mx-auto mb-3 h-10 w-10" /><p>{error}</p></div>
    </div>
  );

  if (!prediction) return null;

  const riskCfg = RISK_CONFIG[prediction.risk];
  const RiskIcon = riskCfg.icon;
  const burnPct = Math.min(prediction.burnRate * 100, 150);
  const barColor = burnPct >= 100 ? '#ef4444' : burnPct >= 85 ? '#f59e0b' : '#10b981';

  const MONTH_NAME = TODAY.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 space-y-6">

      {/* ── Header ─────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <PiggyBank className="h-5 w-5 text-violet-400" />
            </div>
            <h1 className="text-2xl font-bold">Smart Budget Predictor</h1>
          </div>
          <p className="text-white/40 text-sm ml-13">AI-powered spend forecasting for {MONTH_NAME}</p>
        </div>

        {/* Manual budget input */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
            inputActive ? 'border-violet-500/60 bg-violet-500/10' : 'border-white/10 bg-white/5'
          }`}>
            <span className="text-white/40 text-sm">₹</span>
            <input
              ref={inputRef}
              type="number"
              placeholder="Set budget"
              defaultValue={manualBudget}
              onFocus={() => setInputActive(true)}
              onBlur={() => setInputActive(false)}
              className="bg-transparent outline-none text-white text-sm w-28 placeholder:text-white/20"
            />
          </div>
          <button
            onClick={recompute}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 transition-colors text-sm font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Predict
          </button>
        </div>
      </motion.div>

      {/* ── Risk Banner ────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
        className={`rounded-2xl border p-5 bg-gradient-to-r ${riskCfg.bg} ${riskCfg.border}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <RiskIcon className="h-6 w-6" style={{ color: riskCfg.color }} />
            <div>
              <p className="font-bold text-lg" style={{ color: riskCfg.color }}>{riskCfg.label}</p>
              <p className="text-white/50 text-xs">
                {prediction.risk === 'safe'
                  ? 'You are spending within budget'
                  : prediction.risk === 'medium'
                  ? 'Slightly above ideal pace'
                  : 'Budget will be exceeded this month'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black" style={{ color: riskCfg.color }}>{animScore}%</p>
            <p className="text-white/30 text-xs">of budget used</p>
          </div>
        </div>

        {/* Burn rate bar */}
        <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: barColor }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(burnPct, 100)}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </div>
        <div className="flex justify-between text-xs text-white/30 mt-1">
          <span>₹0</span>
          <span>Budget: {fmt(prediction.autoBudget)}</span>
        </div>
      </motion.div>

      {/* ── Key Stats Grid ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Spent So Far',       value: fmt(prediction.spentSoFar),      icon: DollarSign,   color: 'text-blue-400',   sub: `${prediction.txCount} transactions` },
          { label: 'Projected Total',    value: fmt(prediction.projectedTotal),   icon: TrendingDown, color: 'text-violet-400', sub: `vs ${fmt(prediction.autoBudget)} budget` },
          { label: 'Daily Velocity',     value: fmt(prediction.dailyVelocity),    icon: Zap,          color: 'text-amber-400',  sub: `Safe limit: ${fmt(prediction.safeDaily)}/day` },
          { label: 'Days Left',          value: String(DAYS_LEFT),                icon: Calendar,     color: 'text-teal-400',   sub: `of ${DAYS_IN_MONTH} days this month` },
        ].map(({ label, value, icon: Icon, color, sub }, i) => (
          <motion.div key={label}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.07 }}
            className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-white/40 text-xs">{label}</span>
            </div>
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-white/30 text-[10px] mt-0.5">{sub}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Exhaustion Alert ───────────────────────────── */}
      <AnimatePresence>
        {prediction.exhaustionDate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="font-bold text-red-300">Budget Exhaustion Alert</p>
              <p className="text-white/50 text-sm">
                At your current spending rate, your budget will run out by{' '}
                <span className="text-red-300 font-semibold">
                  {prediction.exhaustionDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
                </span>
                — {DAYS_LEFT} days before month end.
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-red-400 font-bold text-lg">
                {Math.max(0, Math.floor((prediction.exhaustionDate - TODAY) / 86400000))} days
              </p>
              <p className="text-white/30 text-xs">until empty</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Projection Curve Chart ─────────────────────── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 className="h-4 w-4 text-violet-400" />
          <h2 className="font-semibold text-white">Month-End Spend Projection</h2>
        </div>
        <div className="flex gap-4 text-xs mb-4">
          {[
            { color: '#8b5cf6', label: 'Projected spend' },
            { color: '#10b981', label: 'Safe spend path' },
            { color: '#ef4444', label: 'Budget limit', dashed: true },
          ].map(({ color, label, dashed }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-6 h-0.5 ${dashed ? 'border-t-2 border-dashed' : ''}`}
                style={{ backgroundColor: dashed ? 'transparent' : color, borderColor: dashed ? color : undefined }} />
              <span className="text-white/40">{label}</span>
            </div>
          ))}
        </div>

        {prediction.curve.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={prediction.curve} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="safeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11 }} label={{ value: 'Day of Month', position: 'insideBottom', offset: -2, fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} />
              <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CurveTooltip />} />
              <ReferenceLine y={prediction.autoBudget} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: 'Budget', fill: '#ef4444', fontSize: 11 }} />
              <Area type="monotone" dataKey="safe" name="Safe path" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 3" fill="url(#safeGrad)" dot={false} />
              <Area type="monotone" dataKey="projected" name="Projected" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#projGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-white/30 text-sm">
            Not enough remaining days to project. Check back early next month.
          </div>
        )}
      </motion.div>

      {/* ── Bottom Row: Category + Weekly Pattern ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Category Breakdown */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
          className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-indigo-400" />
            <h2 className="font-semibold">Spending by Category</h2>
          </div>
          {prediction.categories.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-8">No category data this month</p>
          ) : (
            <div className="space-y-3">
              {prediction.categories.map(({ name, value }, i) => {
                const pct = Math.round((value / prediction.spentSoFar) * 100) || 0;
                return (
                  <div key={name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/70 truncate max-w-[150px]">{name}</span>
                      <span className="text-white/50">{fmt(value)} <span className="text-white/30">({pct}%)</span></span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.1 * i }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Weekly Spend Pattern */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
          className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-cyan-400" />
            <h2 className="font-semibold">Avg Spend by Day of Week</h2>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={prediction.weeklyPattern} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11 }} />
              <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
              <Tooltip formatter={(v) => [fmt(v), 'Avg spend']} contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }} labelStyle={{ color: 'rgba(255,255,255,0.5)' }} />
              <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                {prediction.weeklyPattern.map((entry, index) => (
                  <Cell key={index} fill={entry.avg === Math.max(...prediction.weeklyPattern.map(d => d.avg)) ? '#06b6d4' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-white/30 text-xs text-center mt-2">
            Highest spend day:{' '}
            <span className="text-cyan-400 font-semibold">
              {prediction.weeklyPattern.reduce((a, b) => a.avg > b.avg ? a : b).label}
            </span>
          </p>
        </motion.div>
      </div>

      {/* ── AI Recommendations ────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/5 border border-violet-500/20 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-violet-400" />
          <h2 className="font-semibold">AI Budget Recommendations</h2>
        </div>
        <div className="space-y-3">
          {[
            prediction.risk !== 'safe' && {
              icon: ArrowDown, color: 'text-red-400',
              text: `Reduce daily spending by ${fmt(Math.max(0, prediction.dailyVelocity - prediction.safeDaily))} to stay within budget.`,
            },
            prediction.exhaustionDate && {
              icon: AlertTriangle, color: 'text-amber-400',
              text: `Budget exhausts on ${prediction.exhaustionDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}. Consider a ${fmt(Math.round(prediction.projectedTotal - prediction.autoBudget))} top-up or cut spending by 25%.`,
            },
            {
              icon: Target, color: 'text-blue-400',
              text: `Your ideal daily budget is ${fmt(prediction.safeDaily)} for the remaining ${DAYS_LEFT} days.`,
            },
            prediction.changeVsLastMonth > 15 && {
              icon: ArrowUp, color: 'text-orange-400',
              text: `Spending is ${prediction.changeVsLastMonth}% above your pro-rated last month pace. Review your top categories.`,
            },
            prediction.risk === 'safe' && {
              icon: CheckCircle, color: 'text-emerald-400',
              text: `Great discipline! You are on track to finish ${fmt(Math.max(0, prediction.autoBudget - prediction.projectedTotal))} under budget.`,
            },
          ].filter(Boolean).slice(0, 4).map(({ icon: Icon, color, text }, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <Icon className={`h-3.5 w-3.5 ${color}`} />
              </div>
              <p className="text-white/70 text-sm leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </motion.div>

    </div>
  );
}
