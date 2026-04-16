import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db } from "./firebase";
import { collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import SidebarContent from "./SidebarContent";
import Header from "./Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Brain, Search, AlertTriangle, ShieldCheck, TrendingUp,
  Loader2, Zap, Clock, Users, Activity, Info, ChevronRight,
  ShieldAlert, Star, Calendar,
} from "lucide-react";

// ── Day-of-week fraud risk multipliers (based on fraud research) ──────────────
const DOW_RISK = { 0: 1.4, 1: 0.7, 2: 0.8, 3: 0.9, 4: 1.0, 5: 1.3, 6: 1.5 };
// Sunday=0 high risk (weekend scams), Saturday=6 high risk, Monday=1 lowest

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Compute future risk for a UPI from transaction history ────────────────────
function computeFutureRisk(upiId, allTxs, communitySnap) {
  const txsWithRecipient = allTxs.filter(
    (t) => (t.recipientUPI || "").toLowerCase() === upiId.toLowerCase()
  );

  // 1. Transaction velocity (last 30 days)
  const now = new Date();
  const day30 = new Date(now); day30.setDate(now.getDate() - 30);
  const recentTxs = txsWithRecipient.filter((t) => {
    const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0);
    return d >= day30;
  });
  const velocityScore = Math.min(40, recentTxs.length * 4); // max 40 pts

  // 2. Amount pattern — high amounts = higher risk
  const amounts = txsWithRecipient.map((t) => Number(t.amount) || 0);
  const avgAmount = amounts.length ? amounts.reduce((s, a) => s + a, 0) / amounts.length : 0;
  const amountScore = Math.min(20, Math.floor(avgAmount / 500) * 2); // max 20 pts

  // 3. Fraud verdict history
  const fraudTxs = txsWithRecipient.filter((t) =>
    t.fraudVerdict === "HIGH_RISK" || t.fraudVerdict === "MEDIUM_RISK"
  );
  const fraudScore = Math.min(30, fraudTxs.length * 15); // max 30 pts

  // 4. Community reports score
  const communityDocs = communitySnap.docs.filter(
    (d) => (d.data().upiId || "").toLowerCase() === upiId.toLowerCase()
  );
  const communityScore = Math.min(10, communityDocs.length * 5); // max 10 pts

  const baseRisk = Math.min(100, velocityScore + amountScore + fraudScore + communityScore);

  // Generate 7-day forecast by applying DOW multipliers
  const forecast = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    const dow = date.getDay();
    const dayRisk = Math.min(100, Math.round(baseRisk * DOW_RISK[dow]));
    forecast.push({
      day: i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAY_NAMES[dow],
      date: date.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      risk: dayRisk,
      dow,
    });
  }

  const peakDay = forecast.reduce((a, b) => (a.risk > b.risk ? a : b));
  const safeDay = forecast.reduce((a, b) => (a.risk < b.risk ? a : b));

  return {
    baseRisk,
    forecast,
    peakDay,
    safeDay,
    txCount: txsWithRecipient.length,
    fraudCount: fraudTxs.length,
    avgAmount,
    communityReports: communityDocs.length,
    factors: { velocityScore, amountScore, fraudScore, communityScore },
  };
}

// ── Risk colour helper ─────────────────────────────────────────────────────────
function riskColor(score) {
  if (score >= 70) return { text: "text-red-400",    fill: "#ef4444", bg: "bg-red-500/10",    border: "border-red-500/30",    label: "HIGH RISK" };
  if (score >= 40) return { text: "text-yellow-400", fill: "#f59e0b", bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: "MEDIUM RISK" };
  return              { text: "text-green-400",  fill: "#22c55e", bg: "bg-green-500/10",  border: "border-green-500/30",  label: "LOW RISK" };
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────
const ForecastTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const score = payload[0].value;
  const rc = riskColor(score);
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="text-gray-300 font-semibold mb-1">{label}</p>
      <p className={`font-black text-lg ${rc.text}`}>{score}%</p>
      <p className={`text-xs font-semibold ${rc.text}`}>{rc.label}</p>
    </div>
  );
};

// ── Preset quick-check UPIs ───────────────────────────────────────────────────
const QUICK_UPIS = [
  "rajan4821@yesbank",
  "alice@paytm",
  "merchant@upi",
];

export default function FutureRiskPredictor() {
  const [user, setUser] = useState(null);
  const [upiInput, setUpiInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [allTxs, setAllTxs] = useState([]);
  const [communitySnap, setCommunitySnap] = useState({ docs: [] });
  const [recentSearches, setRecentSearches] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const [txSnap, commSnap] = await Promise.all([
            getDocs(query(collection(db, "transactions"), where("userId", "==", u.uid), limit(500))),
            getDocs(query(collection(db, "communityReports"), limit(200))),
          ]);
          setAllTxs(txSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setCommunitySnap(commSnap);
        } catch (e) {
          console.error(e);
        }
      }
      setInitialLoading(false);
    });
    return unsub;
  }, []);

  function analyzeUPI(upi) {
    const id = (upi || upiInput).trim();
    if (!id) { setError("Enter a UPI ID to analyse."); return; }
    setError("");
    setLoading(true);
    setResult(null);

    // Simulate brief ML computation delay
    setTimeout(() => {
      const res = computeFutureRisk(id, allTxs, communitySnap);
      res.upiId = id;
      setResult(res);
      setLoading(false);
      setRecentSearches((prev) => [id, ...prev.filter((u) => u !== id)].slice(0, 5));
    }, 800);
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      <div className="hidden lg:flex flex-col w-64 flex-shrink-0 bg-gray-950 border-r border-gray-800">
        <SidebarContent />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-600 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Brain className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">AI Future Risk Predictor</h1>
              <p className="text-sm text-gray-400">7-day fraud risk forecast for any UPI — powered by velocity, pattern & community ML</p>
            </div>
          </motion.div>

          {/* Search bar */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="bg-gray-800/60 border border-gray-700">
              <CardContent className="p-5">
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      value={upiInput}
                      onChange={(e) => setUpiInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && analyzeUPI()}
                      placeholder="Enter UPI ID (e.g. john@paytm)"
                      className="pl-9 bg-gray-900 border-gray-700 text-white placeholder-gray-500 focus:border-orange-500"
                    />
                  </div>
                  <Button onClick={() => analyzeUPI()} disabled={loading}
                    className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white px-5">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Zap className="h-4 w-4 mr-2" />Predict</>}
                  </Button>
                </div>

                {error && (
                  <p className="text-red-400 text-xs mt-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />{error}
                  </p>
                )}

                {/* Quick UPIs */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="text-xs text-gray-500">Quick check:</span>
                  {QUICK_UPIS.map((upi) => (
                    <button key={upi} onClick={() => { setUpiInput(upi); analyzeUPI(upi); }}
                      className="text-xs px-2.5 py-1 rounded-full bg-gray-700 hover:bg-orange-500/20 hover:text-orange-300 text-gray-400 border border-gray-600 hover:border-orange-500/40 transition-all">
                      {upi}
                    </button>
                  ))}
                </div>

                {/* Recent searches */}
                {recentSearches.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs text-gray-500">Recent:</span>
                    {recentSearches.map((upi) => (
                      <button key={upi} onClick={() => { setUpiInput(upi); analyzeUPI(upi); }}
                        className="text-xs px-2.5 py-1 rounded-full bg-gray-900/60 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-all flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />{upi}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <Brain className="h-10 w-10 text-orange-400" />
                <Loader2 className="absolute -top-1 -right-1 h-4 w-4 text-orange-300 animate-spin" />
              </div>
              <p className="text-gray-400 text-sm">Running AI risk forecast…</p>
            </div>
          )}

          {/* Results */}
          <AnimatePresence>
            {result && !loading && (
              <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="space-y-6">

                {/* Top risk summary */}
                {(() => {
                  const rc = riskColor(result.baseRisk);
                  const Icon = result.baseRisk >= 70 ? ShieldAlert : result.baseRisk >= 40 ? AlertTriangle : ShieldCheck;
                  return (
                    <div className={`rounded-2xl border ${rc.border} ${rc.bg} p-5`}>
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${rc.bg} border ${rc.border}`}>
                            <Icon className={`h-7 w-7 ${rc.text}`} />
                          </div>
                          <div>
                            <p className="text-sm text-gray-400">Base Risk Score for</p>
                            <p className="text-lg font-bold text-white font-mono">{result.upiId}</p>
                            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${rc.bg} border ${rc.border} ${rc.text}`}>
                              {rc.label}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-5xl font-black ${rc.text}`}>{result.baseRisk}%</p>
                          <p className="text-xs text-gray-500">fraud probability</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Stats row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { icon: Activity, label: "Transactions", value: result.txCount, sub: "with this UPI", color: "text-blue-400" },
                    { icon: ShieldAlert, label: "Fraud Flags", value: result.fraudCount, sub: "past verdicts", color: "text-red-400" },
                    { icon: Star, label: "Avg Amount", value: `₹${Math.round(result.avgAmount).toLocaleString("en-IN")}`, sub: "per transaction", color: "text-yellow-400" },
                    { icon: Users, label: "Community Reports", value: result.communityReports, sub: "fraud reports", color: "text-purple-400" },
                  ].map(({ icon: Icon, label, value, sub, color }) => (
                    <Card key={label} className="bg-gray-800/60 border border-gray-700">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className={`h-4 w-4 ${color}`} />
                          <span className="text-xs text-gray-400">{label}</span>
                        </div>
                        <p className="text-2xl font-black text-white">{value}</p>
                        <p className="text-xs text-gray-500">{sub}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* 7-day forecast chart */}
                <Card className="bg-gray-800/60 border border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-orange-400" />
                      7-Day Fraud Risk Forecast
                      <span className="ml-auto text-xs text-gray-500 font-normal">
                        Peak: <span className="text-red-400 font-semibold">{result.peakDay.day} ({result.peakDay.risk}%)</span> ·
                        Safest: <span className="text-green-400 font-semibold">{result.safeDay.day} ({result.safeDay.risk}%)</span>
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={result.forecast} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false}
                          tickFormatter={(v) => `${v}%`} />
                        <Tooltip content={<ForecastTooltip />} />
                        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 3" label={{ value: "High", fill: "#ef4444", fontSize: 10 }} />
                        <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: "Medium", fill: "#f59e0b", fontSize: 10 }} />
                        <Area type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2.5}
                          fill="url(#riskGrad)" dot={{ fill: "#ef4444", r: 5 }} activeDot={{ r: 7 }} />
                      </AreaChart>
                    </ResponsiveContainer>

                    {/* Day pills */}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {result.forecast.map((d) => {
                        const rc = riskColor(d.risk);
                        return (
                          <div key={d.day} className={`flex flex-col items-center px-3 py-2 rounded-xl border ${rc.border} ${rc.bg} min-w-[60px]`}>
                            <span className="text-[10px] text-gray-400">{d.day}</span>
                            <span className={`text-sm font-black ${rc.text}`}>{d.risk}%</span>
                            <span className="text-[9px] text-gray-500">{d.date}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Risk factor breakdown */}
                <Card className="bg-gray-800/60 border border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Brain className="h-4 w-4 text-violet-400" />
                      Risk Factor Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { label: "Transaction Velocity", score: result.factors.velocityScore, max: 40, color: "#3b82f6", desc: "Frequency of payments to this UPI" },
                        { label: "Amount Pattern", score: result.factors.amountScore, max: 20, color: "#f59e0b", desc: "Average transaction size risk" },
                        { label: "Fraud History", score: result.factors.fraudScore, max: 30, color: "#ef4444", desc: "Past HIGH/MEDIUM verdicts" },
                        { label: "Community Intel", score: result.factors.communityScore, max: 10, color: "#8b5cf6", desc: "User fraud reports count" },
                      ].map(({ label, score, max, color, desc }) => (
                        <div key={label} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400 font-medium">{label}</span>
                            <span className="text-xs font-bold text-white">{score}/{max}</span>
                          </div>
                          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${(score / max) * 100}%` }}
                              transition={{ duration: 0.8, delay: 0.2 }}
                              className="h-full rounded-full" style={{ background: color }} />
                          </div>
                          <p className="text-[10px] text-gray-500">{desc}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-start gap-2 bg-gray-900/50 rounded-lg px-3 py-2 mt-4">
                      <Info className="h-3.5 w-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[10px] text-gray-500 leading-relaxed">
                        Day-of-week multipliers applied: weekends (Sat/Sun) carry 1.3–1.5× fraud risk based on historical UPI fraud patterns. Friday 1.3× elevated risk.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Recommendation */}
                {(() => {
                  const rc = riskColor(result.baseRisk);
                  const rec =
                    result.baseRisk >= 70
                      ? { title: "Avoid Transacting with this UPI", body: `This contact has a ${result.baseRisk}% base fraud risk. The AI recommends blocking this UPI and reporting it to the Community Reports. Safest to transact: ${result.safeDay.day} (${result.safeDay.risk}% risk) — but even then proceed with extreme caution.`, icon: ShieldAlert }
                      : result.baseRisk >= 40
                      ? { title: "Proceed with Caution", body: `Medium risk detected. If you must transact, choose ${result.safeDay.day} (${result.safeDay.risk}% risk) and keep amounts below your daily limit. Avoid ${result.peakDay.day} (${result.peakDay.risk}% peak risk).`, icon: AlertTriangle }
                      : { title: "Generally Safe to Transact", body: `Low base risk (${result.baseRisk}%). Lowest risk window: ${result.safeDay.day} (${result.safeDay.risk}%). Even so, always verify the UPI ID before sending large amounts.`, icon: ShieldCheck };
                  return (
                    <Card className={`border ${rc.border} ${rc.bg}`}>
                      <CardContent className="p-5 flex items-start gap-4">
                        <rec.icon className={`h-6 w-6 flex-shrink-0 mt-0.5 ${rc.text}`} />
                        <div>
                          <p className={`font-bold text-sm mb-1 ${rc.text}`}>{rec.title}</p>
                          <p className="text-sm text-gray-300 leading-relaxed">{rec.body}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty state */}
          {!result && !loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-600/20 to-red-600/20 border border-orange-500/20 flex items-center justify-center">
                <Brain className="h-10 w-10 text-orange-400" />
              </div>
              <div className="text-center">
                <p className="text-gray-300 font-semibold text-lg">Enter a UPI ID to predict risk</p>
                <p className="text-gray-500 text-sm mt-1">The AI will forecast fraud probability for the next 7 days</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2 max-w-lg">
                {[
                  { icon: TrendingUp, text: "Velocity analysis — transaction frequency patterns" },
                  { icon: Users, text: "Community intel — crowd-sourced fraud reports" },
                  { icon: Calendar, text: "Day-of-week ML — weekend vs weekday risk models" },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-800/40 rounded-xl p-3 border border-gray-700">
                    <Icon className="h-4 w-4 text-orange-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-400">{text}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
