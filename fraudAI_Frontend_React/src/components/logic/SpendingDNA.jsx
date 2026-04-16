import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { auth, db } from "./firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import SidebarContent from "./SidebarContent";
import Header from "./Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import {
  Brain, AlertTriangle, TrendingUp, TrendingDown, Dna,
  Loader2, ShieldAlert, Sparkles, Info, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Category rules (8 DNA dimensions) ────────────────────────────────────────
const DNA_DIMS = [
  { key: "Food",          keywords: ["food","swiggy","zomato","restaurant","eat","meal","lunch","dinner","breakfast","cafe","chai","snack","grocery","groceries"], color: "#10b981" },
  { key: "Transport",     keywords: ["uber","ola","cab","auto","bus","metro","train","fuel","petrol","diesel","rapido","transport"], color: "#f97316" },
  { key: "Entertainment", keywords: ["netflix","prime","hotstar","ott","game","gaming","cinema","movie","theatre","concert","entertainment"], color: "#8b5cf6" },
  { key: "Shopping",      keywords: ["amazon","flipkart","shop","shopping","clothes","myntra","meesho","purchase","buy","order"], color: "#ec4899" },
  { key: "Housing",       keywords: ["rent","house","housing","mortgage","pg","hostel","maintenance","society"], color: "#3b82f6" },
  { key: "Utilities",     keywords: ["electricity","water","gas","internet","wifi","broadband","bill","recharge","dth","phone"], color: "#f59e0b" },
  { key: "Health",        keywords: ["medical","medicine","doctor","hospital","pharmacy","health","clinic","dental","lab"], color: "#06b6d4" },
  { key: "Other",         keywords: [], color: "#6b7280" },
];

function getDim(remarks = "") {
  const r = remarks.toLowerCase();
  for (const dim of DNA_DIMS.slice(0, -1)) {
    if (dim.keywords.some((kw) => r.includes(kw))) return dim.key;
  }
  return "Other";
}

function getTxDate(t) {
  return t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0);
}

// ── Build DNA profile from transactions ───────────────────────────────────────
function buildDNA(txs) {
  const total = txs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  if (total === 0) return DNA_DIMS.map((d) => ({ dimension: d.key, value: 0, color: d.color }));

  const map = {};
  DNA_DIMS.forEach((d) => { map[d.key] = 0; });
  txs.forEach((t) => {
    const dim = getDim(t.remarks || t.description || "");
    map[dim] = (map[dim] || 0) + (Number(t.amount) || 0);
  });

  return DNA_DIMS.map((d) => ({
    dimension: d.key,
    value: Math.round((map[d.key] / total) * 100),
    color: d.color,
  }));
}

// ── Anomaly score between two DNA profiles ────────────────────────────────────
function dnaAnomalyScore(baseline, current) {
  if (!baseline.length || !current.length) return 0;
  const diffs = baseline.map((b, i) => Math.abs(b.value - (current[i]?.value || 0)));
  const avgDiff = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  return Math.min(100, Math.round(avgDiff * 2));
}

// ── Anomaly insight generator ─────────────────────────────────────────────────
function generateAnomalyInsights(baseline, current, anomalyScore) {
  const insights = [];
  baseline.forEach((b, i) => {
    const c = current[i];
    if (!c) return;
    const diff = c.value - b.value;
    if (Math.abs(diff) >= 15) {
      insights.push({
        dim: b.dimension,
        diff,
        severity: Math.abs(diff) >= 30 ? "high" : "medium",
      });
    }
  });
  insights.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  if (anomalyScore >= 50)
    insights.unshift({
      dim: "Overall Pattern",
      diff: anomalyScore,
      severity: "critical",
      message: `Your spending DNA has mutated ${anomalyScore}% from baseline — possible account compromise or major lifestyle change.`,
    });

  return insights;
}

// ── Custom radar tooltip ───────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm shadow-xl">
      <p className="text-gray-300 font-semibold mb-1">{payload[0]?.payload?.dimension}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-400">{p.name}:</span>
          <span className="text-white font-bold">{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

// ── Score ring ────────────────────────────────────────────────────────────────
function AnomalyRing({ score }) {
  const r = 48;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 60 ? "#ef4444" : score >= 35 ? "#f59e0b" : "#22c55e";
  const label = score >= 60 ? "Critical" : score >= 35 ? "Elevated" : "Normal";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
          <circle cx="56" cy="56" r={r} fill="none" stroke="#1f2937" strokeWidth="10" />
          <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-white">{score}</span>
          <span className="text-[10px] text-gray-400">/ 100</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold" style={{ color }}>{label} Deviation</p>
        <p className="text-[10px] text-gray-500">from your baseline DNA</p>
      </div>
    </div>
  );
}

export default function SpendingDNA() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [baselineDNA, setBaselineDNA] = useState([]);
  const [currentDNA, setCurrentDNA] = useState([]);
  const [radarData, setRadarData] = useState([]);
  const [anomalyScore, setAnomalyScore] = useState(0);
  const [insights, setInsights] = useState([]);
  const [txCount, setTxCount] = useState({ baseline: 0, current: 0 });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) fetchAndCompute(u);
      else setLoading(false);
    });
    return unsub;
  }, []);

  async function fetchAndCompute(u) {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, "transactions"),
        where("userId", "==", u.uid),
        limit(500),
      ));
      const txs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => getTxDate(b) - getTxDate(a));

      const now = new Date();
      const day7 = new Date(now); day7.setDate(now.getDate() - 7);
      const day30 = new Date(now); day30.setDate(now.getDate() - 30);

      const currentTxs = txs.filter((t) => getTxDate(t) >= day7);
      const baselineTxs = txs.filter((t) => {
        const d = getTxDate(t);
        return d >= day30 && d < day7;
      });

      // Fallback: use all txs split 50/50
      const usedBase = baselineTxs.length >= 3 ? baselineTxs : txs.slice(Math.floor(txs.length / 2));
      const usedCurr = currentTxs.length >= 1 ? currentTxs : txs.slice(0, Math.ceil(txs.length / 2));

      const base = buildDNA(usedBase);
      const curr = buildDNA(usedCurr);
      const score = dnaAnomalyScore(base, curr);

      setBaselineDNA(base);
      setCurrentDNA(curr);
      setAnomalyScore(score);
      setTxCount({ baseline: usedBase.length, current: usedCurr.length });

      // Merge for radar
      const radar = DNA_DIMS.map((d, i) => ({
        dimension: d.key,
        Baseline: base[i]?.value || 0,
        Current: curr[i]?.value || 0,
      }));
      setRadarData(radar);
      setInsights(generateAnomalyInsights(base, curr, score));
    } catch (err) {
      console.error("SpendingDNA error:", err);
    } finally {
      setLoading(false);
    }
  }

  const severityStyle = {
    critical: { border: "border-red-500/40", bg: "bg-red-500/10", icon: "text-red-400", badge: "bg-red-500/20 text-red-300" },
    high:     { border: "border-orange-500/40", bg: "bg-orange-500/10", icon: "text-orange-400", badge: "bg-orange-500/20 text-orange-300" },
    medium:   { border: "border-yellow-500/40", bg: "bg-yellow-500/10", icon: "text-yellow-400", badge: "bg-yellow-500/20 text-yellow-300" },
  };

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
            className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Dna className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Spending DNA Analyzer</h1>
                <p className="text-sm text-gray-400">Your unique financial fingerprint — anomaly detection in 8 dimensions</p>
              </div>
            </div>
            <Button onClick={() => user && fetchAndCompute(user)} variant="ghost"
              className="text-gray-400 hover:text-white border border-gray-700">
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
          </motion.div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <div className="relative">
                <Dna className="h-12 w-12 text-emerald-400" />
                <div className="absolute inset-0 animate-ping opacity-30">
                  <Dna className="h-12 w-12 text-emerald-400" />
                </div>
              </div>
              <p className="text-gray-400 text-sm">Sequencing your spending DNA…</p>
            </div>
          ) : (
            <>
              {/* Top row: anomaly ring + stats */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Anomaly ring */}
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
                  <Card className="bg-gray-800/60 border border-gray-700 h-full">
                    <CardContent className="p-5 flex flex-col items-center justify-center h-full gap-3">
                      <AnomalyRing score={anomalyScore} />
                      <p className="text-xs text-gray-500 text-center">
                        Based on {txCount.current} recent vs {txCount.baseline} baseline transactions
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* DNA dimension bars */}
                {DNA_DIMS.slice(0, 3).map((dim, idx) => {
                  const base = baselineDNA.find((d) => d.dimension === dim.key)?.value || 0;
                  const curr = currentDNA.find((d) => d.dimension === dim.key)?.value || 0;
                  const diff = curr - base;
                  return (
                    <motion.div key={dim.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + idx * 0.05 }}>
                      <Card className="bg-gray-800/60 border border-gray-700">
                        <CardContent className="p-5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-gray-400 font-medium">{dim.key}</span>
                            <span className={`text-xs font-semibold ${diff > 0 ? "text-red-400" : diff < 0 ? "text-green-400" : "text-gray-400"}`}>
                              {diff > 0 ? "+" : ""}{diff}%
                            </span>
                          </div>
                          <p className="text-2xl font-black text-white mb-3">{curr}%</p>
                          <div className="space-y-1.5">
                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${base}%`, background: dim.color, opacity: 0.4 }} />
                            </div>
                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${curr}%`, background: dim.color }} />
                            </div>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[9px] text-gray-600">Baseline {base}%</span>
                            <span className="text-[9px] text-gray-600">Current {curr}%</span>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>

              {/* Radar chart + insights */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Radar chart */}
                <motion.div className="lg:col-span-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Card className="bg-gray-800/60 border border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-emerald-400" />
                        Spending DNA Radar
                        <span className="ml-auto text-xs text-gray-500 font-normal">8-dimension fingerprint</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {radarData.every((d) => d.Baseline === 0 && d.Current === 0) ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-2">
                          <Dna className="h-8 w-8 text-gray-600" />
                          <p className="text-gray-500 text-sm">No transaction data to sequence</p>
                          <p className="text-gray-600 text-xs">Make payments to build your DNA profile</p>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={320}>
                          <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                            <PolarGrid stroke="#374151" />
                            <PolarAngleAxis dataKey="dimension"
                              tick={{ fill: "#9ca3af", fontSize: 11 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 100]}
                              tick={{ fill: "#6b7280", fontSize: 9 }} tickCount={4} />
                            <Radar name="Baseline" dataKey="Baseline"
                              stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} strokeDasharray="5 3" />
                            <Radar name="Current" dataKey="Current"
                              stroke="#10b981" fill="#10b981" fillOpacity={0.25} strokeWidth={2.5} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                              formatter={(val) => <span style={{ color: "#9ca3af", fontSize: 12 }}>{val}</span>} />
                          </RadarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Anomaly insights */}
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                  <Card className="bg-gray-800/60 border border-gray-700 h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Brain className="h-4 w-4 text-violet-400" />
                        DNA Insights
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {insights.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2">
                          <ShieldAlert className="h-8 w-8 text-green-600" />
                          <p className="text-green-400 text-sm font-medium text-center">DNA Pattern Normal</p>
                          <p className="text-gray-500 text-xs text-center">Your spending profile matches your baseline. No anomalies detected.</p>
                        </div>
                      ) : (
                        insights.map((ins, i) => {
                          const sty = severityStyle[ins.severity] || severityStyle.medium;
                          const Icon = ins.severity === "critical" ? AlertTriangle : ins.diff > 0 ? TrendingUp : TrendingDown;
                          return (
                            <motion.div key={i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
                              className={`rounded-xl border ${sty.border} ${sty.bg} p-3`}>
                              <div className="flex items-start gap-2">
                                <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${sty.icon}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <p className="text-xs font-semibold text-white truncate">{ins.dim}</p>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${sty.badge}`}>
                                      {ins.severity.toUpperCase()}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-gray-300 leading-relaxed">
                                    {ins.message || (ins.diff > 0
                                      ? `↑ ${ins.diff}% higher than baseline — unusual spike detected`
                                      : `↓ ${Math.abs(ins.diff)}% lower than baseline — significant drop`)}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })
                      )}

                      {/* Info note */}
                      <div className="flex items-start gap-2 bg-gray-900/50 rounded-lg px-3 py-2 mt-2">
                        <Info className="h-3.5 w-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
                        <p className="text-[10px] text-gray-500 leading-relaxed">
                          DNA baseline = days 8–30 ago. Current = last 7 days. Anomaly ≥50 may indicate account compromise.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              {/* All 8 dimension bars */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <Card className="bg-gray-800/60 border border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold">Full DNA Breakdown — All 8 Dimensions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {DNA_DIMS.map((dim) => {
                        const base = baselineDNA.find((d) => d.dimension === dim.key)?.value || 0;
                        const curr = currentDNA.find((d) => d.dimension === dim.key)?.value || 0;
                        const diff = curr - base;
                        return (
                          <div key={dim.key} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-300">{dim.key}</span>
                              <span className={`text-xs font-bold ${diff > 5 ? "text-red-400" : diff < -5 ? "text-green-400" : "text-gray-500"}`}>
                                {diff > 0 ? "+" : ""}{diff}%
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full opacity-50" style={{ width: `${base}%`, background: dim.color }} />
                                </div>
                                <span className="text-[10px] text-gray-500 w-7 text-right">{base}%</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${curr}%`, background: dim.color }} />
                                </div>
                                <span className="text-[10px] text-gray-300 w-7 text-right font-semibold">{curr}%</span>
                              </div>
                            </div>
                            <div className="flex gap-3 text-[9px] text-gray-600">
                              <span>▪ Baseline</span>
                              <span style={{ color: dim.color }}>▪ Current</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
