import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid, Legend, AreaChart, Area,
} from "recharts";
import {
  Brain, TrendingUp, Zap, AlertTriangle, CheckCircle,
  Activity, Target, Lightbulb, ArrowRight, RefreshCw, Shield, ShieldX,
  ChevronDown, ChevronUp, Sparkles, Network, ArrowDown, ArrowUp, PieChart,
  ShieldAlert, ShieldCheck, Info,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const RISK_COLOR   = { HIGH: "#ef4444", MEDIUM: "#f97316", LOW: "#22c55e" };
const CLUSTER_CLR  = ["#3b82f6", "#8b5cf6", "#f97316", "#22c55e", "#ec4899"];
const IMPACT_COLOR = { HIGH: "text-red-400 bg-red-400/10 border-red-500/30",
                       MEDIUM: "text-yellow-400 bg-yellow-400/10 border-yellow-500/30",
                       LOW: "text-green-400 bg-green-400/10 border-green-500/30" };

// ── Semi-circle gauge ─────────────────────────────────────────────────────────
function ScoreGauge({ score, label, size = 140 }) {
  const r = 48, cx = 70, cy = 68;
  const arc = (pct) => {
    const angle = Math.PI * pct;
    const x = cx + r * Math.cos(Math.PI - angle);
    const y = cy - r * Math.sin(Math.PI - angle);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#ef4444";
  const [cx2, cy2] = arc(pct).split(",");

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.6} viewBox="0 0 140 84">
        <path d="M 22 76 A 48 48 0 0 1 118 76" fill="none" stroke="#374151" strokeWidth="10" strokeLinecap="round" />
        {score > 0 && (
          <path
            d={`M 22 76 A 48 48 0 ${pct > 0.5 ? 1 : 0} 1 ${cx2} ${cy2}`}
            fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          />
        )}
        <text x="70" y="74" textAnchor="middle" fill={color} fontSize="20" fontWeight="bold">{score}</text>
      </svg>
      <p className="text-xs text-gray-400 -mt-1">{label}</p>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = "text-blue-400" }) {
  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-gray-700 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className={`text-xl font-bold ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-500">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, color = "text-blue-400" }) {
  return (
    <CardTitle className={`text-base ${color} flex items-center gap-2`}>
      <Icon className="h-4 w-4" /> {title}
    </CardTitle>
  );
}

export default function AIHub() {
  const [user, setUser]           = useState(null);
  const [health, setHealth]       = useState(null);
  const [clusters, setClusters]   = useState(null);
  const [trends, setTrends]       = useState(null);
  const [summary, setSummary]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  // Counterfactual state
  const [cfFeatures, setCfFeatures]   = useState(Array(22).fill(""));
  const [cfResult, setCfResult]       = useState(null);
  const [cfLoading, setCfLoading]     = useState(false);
  const [cfError, setCfError]         = useState("");
  const [cfExpanded, setCfExpanded]   = useState(false);

  const [clustersOpen, setClustersOpen] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [h, cl, tr, sm] = await Promise.allSettled([
        axios.get(`${API}/health`),
        axios.get(`${API}/cluster-analysis`),
        axios.get(`${API}/fraud-trends`),
        axios.get(`${API}/ai-summary`),
      ]);
      if (h.status === "fulfilled")  setHealth(h.value.data);
      if (cl.status === "fulfilled") setClusters(cl.value.data);
      if (tr.status === "fulfilled") setTrends(tr.value.data);
      if (sm.status === "fulfilled") setSummary(sm.value.data);
    } catch {
      setError("Failed to load AI Hub data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // RF feature names (same 22 as backend)
  const RF_FEATURE_NAMES = [
    "Transaction Amount","Transaction Frequency","Recipient Blacklist Status",
    "Device Fingerprinting","VPN or Proxy Usage","Behavioral Biometrics",
    "Time Since Last Transaction","Social Trust Score","Account Age",
    "High-Risk Transaction Times","Past Fraudulent Behavior Flags",
    "Location-Inconsistent Transactions","Normalized Transaction Amount",
    "Transaction Context Anomalies","Fraud Complaints Count",
    "Merchant Category Mismatch","User Daily Limit Exceeded",
    "Recent High-Value Transaction Flags","Recipient Verification Status_suspicious",
    "Recipient Verification Status_verified","Geo-Location Flags_normal",
    "Geo-Location Flags_unusual",
  ];

  const CF_SUSPICIOUS = [9500,15,1,1,1,0.1,0.5,0.2,0.3,1,1,1,0.95,1,3,1,1,1,1,0,0,1];
  const CF_NORMAL     = [250,3,0,0,0,0.85,48,0.9,5,0,0,0,0.1,0,0,0,0,0,0,1,1,0];

  const handleCounterfactual = async () => {
    const vals = cfFeatures.map(Number);
    if (vals.some(isNaN)) { setCfError("Fill all 22 feature fields with numbers."); return; }
    setCfLoading(true);
    setCfError("");
    setCfResult(null);
    try {
      const res = await axios.post(`${API}/counterfactual`, { features: vals });
      setCfResult(res.data);
    } catch (e) {
      setCfError(e.response?.data?.error || "Counterfactual analysis failed.");
    } finally {
      setCfLoading(false);
    }
  };

  // Compute overall AI intelligence score from available data
  const aiScore = (() => {
    if (!summary && !health) return 0;
    let s = 60;
    if (health?.model_status?.random_forest === "loaded") s += 10;
    if (health?.dataset_rows > 0) s += 10;
    if (health?.detection_run) s += 10;
    if (summary?.overall_ai_assessment?.startsWith("CLEAN")) s += 10;
    else if (summary?.overall_ai_assessment?.startsWith("CRITICAL")) s -= 20;
    return Math.max(0, Math.min(100, s));
  })();

  const totalFraud = summary?.risk_distribution
    ? (summary.risk_distribution.medium || 0) + (summary.risk_distribution.high || 0)
    : null;

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-5xl mx-auto">

          {/* Hero header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-bold text-blue-400 flex items-center gap-2">
                <Brain className="h-6 w-6" /> AI Intelligence Hub
              </motion.h1>
              <p className="text-sm text-gray-500 mt-0.5">Real-time fraud intelligence, cluster analysis & counterfactual insights</p>
            </div>
            <Button onClick={loadAll} disabled={loading}
              variant="outline" size="sm"
              className="border-gray-600 text-gray-300 hover:bg-gray-700 gap-2">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 mb-4 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}

          {/* No detection notice */}
          {!loading && !summary && !clusters?.clusters?.length && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2 text-yellow-300 text-sm">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                Run anomaly detection first to unlock the full AI Hub.
              </div>
              <Button size="sm" onClick={() => navigate("/run-detection")}
                className="bg-yellow-600 hover:bg-yellow-700 text-white shrink-0 ml-4">
                Run Detection <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {/* ── Overview metrics ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard icon={Brain} label="AI Intelligence Score" value={`${aiScore}/100`}
              sub="System health metric" color="text-blue-400" />
            <StatCard icon={Activity} label="Dataset Rows"
              value={health?.dataset_rows > 0 ? health.dataset_rows.toLocaleString() : "—"}
              sub="Transactions loaded" color="text-purple-400" />
            <StatCard icon={Shield} label="Fraud Flagged"
              value={totalFraud !== null ? totalFraud.toLocaleString() : "—"}
              sub="Medium + High risk" color="text-red-400" />
            <StatCard icon={CheckCircle} label="Models Active"
              value={health ? Object.values(health.model_status || {}).filter(v => v === "loaded").length : "—"}
              sub="Loaded in backend" color="text-green-400" />
          </div>

          {/* ── Overall AI Assessment ── */}
          {summary?.overall_ai_assessment && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-400 mb-1">AI System Assessment</p>
                <p className="text-sm text-gray-300">{summary.overall_ai_assessment}</p>
              </div>
            </motion.div>
          )}

          <div className="grid md:grid-cols-2 gap-6 mb-6">

            {/* ── Fraud Cluster Analysis ── */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <SectionHeader icon={Network} title="Anomaly Cluster Map" color="text-purple-400" />
                  <button onClick={() => setClustersOpen(p => !p)} className="text-gray-500 hover:text-gray-300">
                    {clustersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </CardHeader>
              <AnimatePresence>
                {clustersOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    <CardContent className="pt-0">
                      {!clusters ? (
                        <p className="text-gray-500 text-sm">Run detection to enable cluster analysis.</p>
                      ) : clusters.clusters?.length === 0 ? (
                        <p className="text-gray-500 text-sm">{clusters.message || "No clusters yet."}</p>
                      ) : (
                        <>
                          {clusters.ai_summary && (
                            <p className="text-xs text-gray-400 mb-3 italic">{clusters.ai_summary}</p>
                          )}
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={clusters.clusters} layout="vertical" margin={{ left: 8, right: 8 }}>
                              <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} />
                              <YAxis dataKey="cluster_id" type="category" tick={{ fontSize: 10, fill: "#9ca3af" }}
                                tickFormatter={(v) => `C${v + 1}`} width={28} />
                              <Tooltip
                                contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                                formatter={(val, _, props) => [
                                  `${val} txns — ${props.payload.risk_level}`,
                                  props.payload.pattern_description?.slice(0, 40) + "…",
                                ]}
                              />
                              <Bar dataKey="size" radius={[0, 4, 4, 0]}>
                                {clusters.clusters.map((c, i) => (
                                  <Cell key={i} fill={RISK_COLOR[c.risk_level] || CLUSTER_CLR[i % 5]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                          <div className="space-y-2 mt-2">
                            {clusters.clusters.slice(0, 3).map((c, i) => (
                              <div key={i} className="text-xs bg-gray-900 rounded-lg p-2.5 border border-gray-700">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-gray-300 font-medium">Cluster {c.cluster_id + 1} — {c.size} transactions</span>
                                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold`}
                                    style={{ color: RISK_COLOR[c.risk_level], background: `${RISK_COLOR[c.risk_level]}18` }}>
                                    {c.risk_level}
                                  </span>
                                </div>
                                <p className="text-gray-500 leading-tight">{c.pattern_description}</p>
                                <p className="text-gray-600 mt-0.5">
                                  Top: {c.top_features.slice(0, 2).map(f => `${f.feature} (σ${f.z_score})`).join(", ")}
                                  {c.fraud_rate_pct !== null && ` · ${c.fraud_rate_pct}% confirmed fraud`}
                                </p>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            {/* ── Fraud Rate Trend ── */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-2">
                <SectionHeader icon={TrendingUp} title="Fraud Rate Trend" color="text-orange-400" />
              </CardHeader>
              <CardContent className="pt-0">
                {!trends?.batch_trends?.length ? (
                  <p className="text-gray-500 text-sm">Run detection to enable trend analysis.</p>
                ) : (
                  <>
                    {trends.velocity_insight && (
                      <p className="text-xs text-gray-400 italic mb-3">{trends.velocity_insight}</p>
                    )}
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={trends.batch_trends} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradFraud" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gradScore" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
                        <XAxis dataKey="batch" tick={{ fontSize: 9, fill: "#6b7280" }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                        <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
                        <Area type="monotone" dataKey="fraud_rate" stroke="#ef4444" fill="url(#gradFraud)"
                          name="Fraud Rate %" strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="avg_score" stroke="#3b82f6" fill="url(#gradScore)"
                          name="Avg Anomaly Score" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Feature Deviation ── */}
          {trends?.feature_deviation?.length > 0 && (
            <Card className="bg-gray-800 border-gray-700 mb-6">
              <CardHeader className="pb-2">
                <SectionHeader icon={Zap} title="Top Fraud Feature Deviations" color="text-yellow-400" />
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-gray-500 mb-3">
                  Z-score deviation of flagged transactions vs. full dataset mean — higher = more anomalous.
                </p>
                <div className="space-y-2">
                  {trends.feature_deviation.map((fd, i) => {
                    const pct = Math.min(100, (fd.deviation_z / 5) * 100);
                    const color = fd.deviation_z > 2 ? "#ef4444" : fd.deviation_z > 1 ? "#f97316" : "#22c55e";
                    return (
                      <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-gray-300 truncate max-w-[55%]">{fd.feature}</span>
                          <span className="font-mono" style={{ color }}>σ{fd.deviation_z}</span>
                        </div>
                        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <motion.div className="h-full rounded-full"
                            style={{ background: color, width: `${pct}%` }}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                            transition={{ delay: i * 0.04 + 0.2, duration: 0.5 }} />
                        </div>
                        <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                          <span>Fraud avg: {fd.fraud_mean}</span>
                          <span>Dataset avg: {fd.overall_mean}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── AI Recommended Actions ── */}
          {summary?.recommended_actions?.length > 0 && (
            <Card className="bg-gray-800 border-gray-700 mb-6">
              <CardHeader className="pb-2">
                <SectionHeader icon={Target} title="AI Recommended Actions" color="text-green-400" />
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {summary.recommended_actions.map((action, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-start gap-2 bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                    <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-300">{action}</p>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Counterfactual Explorer ── */}
          <Card className="bg-gray-800 border-gray-700 mb-6">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <SectionHeader icon={Lightbulb} title="Counterfactual Explorer — What If?" color="text-cyan-400" />
                <button onClick={() => setCfExpanded(p => !p)}
                  className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
                  {cfExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {cfExpanded ? "Collapse" : "Expand"}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Enter feature values for a flagged transaction — AI will suggest the minimal changes to make it legitimate.
              </p>
            </CardHeader>
            <AnimatePresence>
              {cfExpanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <CardContent className="pt-0">
                    {/* Preset toolbar */}
                    <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-gray-900/60 rounded-xl border border-gray-700">
                      <span className="text-xs text-gray-500 mr-1">Quick fill:</span>
                      <button
                        onClick={() => { setCfFeatures(CF_SUSPICIOUS.map(String)); setCfResult(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-all">
                        <ShieldAlert className="h-3.5 w-3.5" /> Suspicious Transaction
                      </button>
                      <button
                        onClick={() => { setCfFeatures(CF_NORMAL.map(String)); setCfResult(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-all">
                        <ShieldCheck className="h-3.5 w-3.5" /> Normal Transaction
                      </button>
                      <button
                        onClick={() => { setCfFeatures(Array(22).fill("")); setCfResult(null); }}
                        className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-500 text-xs hover:border-gray-600 hover:text-gray-400 transition-all">
                        Clear All
                      </button>
                    </div>

                    {/* Hint */}
                    <p className="text-xs text-gray-600 mb-3 flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 flex-shrink-0" />
                      Fields left blank default to 0. Use "Suspicious Transaction" to pre-fill a high-risk example, then click Analyse.
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                      {RF_FEATURE_NAMES.map((name, i) => {
                        const isFilled = cfFeatures[i] !== "" && cfFeatures[i] !== undefined;
                        return (
                          <div key={i}>
                            <label className="text-xs text-gray-500 block mb-0.5 truncate" title={name}>{name}</label>
                            <input type="number" step="any"
                              value={cfFeatures[i]}
                              onChange={(e) => {
                                const next = [...cfFeatures];
                                next[i] = e.target.value;
                                setCfFeatures(next);
                              }}
                              placeholder="—"
                              className={`w-full bg-gray-900 border rounded-md px-2 py-1 text-xs text-gray-200 focus:outline-none transition-colors ${
                                isFilled ? "border-cyan-500/50 focus:border-cyan-400" : "border-gray-700 focus:border-cyan-500"
                              }`} />
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 flex-wrap mb-3">
                      <Button onClick={handleCounterfactual} disabled={cfLoading}
                        className="bg-cyan-600 hover:bg-cyan-700 gap-2 text-sm">
                        {cfLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
                        Analyse Counterfactual
                      </Button>
                    </div>

                    {cfError && (
                      <p className="text-red-400 text-xs mb-3 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />{cfError}
                      </p>
                    )}

                    <AnimatePresence>
                      {cfResult && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="space-y-4">
                          {/* Summary banner */}
                          <div className={`rounded-xl p-4 border flex items-start gap-3 ${
                            cfResult.achievable
                              ? "bg-green-500/10 border-green-500/30"
                              : "bg-red-500/10 border-red-500/30"
                          }`}>
                            {cfResult.achievable
                              ? <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                              : <ShieldX className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />}
                            <div>
                              <p className="text-sm font-semibold mb-0.5">
                                {cfResult.achievable ? "Counterfactual achievable!" : "Deeply anomalous — changes insufficient"}
                              </p>
                              <p className="text-xs text-gray-400">{cfResult.ai_summary}</p>
                              <div className="flex items-center gap-4 mt-2">
                                <span className="text-xs">
                                  <span className="text-red-400 font-mono">{cfResult.original_fraud_probability}%</span>
                                  <span className="text-gray-500"> → </span>
                                  <span className="text-green-400 font-mono">{cfResult.counterfactual_fraud_probability}%</span>
                                  <span className="text-gray-500"> fraud probability</span>
                                </span>
                                <span className="text-xs text-cyan-400">
                                  −{cfResult.total_probability_reduction}% reduction
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Suggestions */}
                          {cfResult.suggestions?.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">
                                Suggested Changes
                              </p>
                              <div className="space-y-2">
                                {cfResult.suggestions.map((s, i) => (
                                  <div key={i}
                                    className={`flex items-center justify-between rounded-lg p-3 border text-xs ${IMPACT_COLOR[s.impact]}`}>
                                    <div>
                                      <p className="font-medium">{s.feature}</p>
                                      <div className="flex items-center gap-2 mt-0.5 text-gray-400">
                                        <span className="font-mono">{s.current_value}</span>
                                        {s.direction === "decrease"
                                          ? <ArrowDown className="h-3 w-3 text-green-400" />
                                          : <ArrowUp className="h-3 w-3 text-blue-400" />}
                                        <span className="font-mono">{s.suggested_value}</span>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold border ${IMPACT_COLOR[s.impact]}`}>
                                        {s.impact}
                                      </span>
                                      <p className="text-gray-400 mt-0.5">−{s.fraud_prob_reduction}%</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* ── Risk Score Distribution from ai-summary ── */}
          {summary?.risk_distribution && (
            <Card className="bg-gray-800 border-gray-700 mb-6">
              <CardHeader className="pb-2">
                <SectionHeader icon={PieChart} title="Risk Distribution" color="text-red-400" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: "low", label: "Low Risk", color: "#22c55e" },
                    { key: "medium", label: "Medium Risk", color: "#f97316" },
                    { key: "high", label: "High Risk", color: "#ef4444" },
                  ].map((t) => {
                    const val = summary.risk_distribution[t.key] || 0;
                    const total = Object.values(summary.risk_distribution).reduce((a, b) => a + b, 0) || 1;
                    const pct = Math.round((val / total) * 100);
                    return (
                      <div key={t.key} className="bg-gray-900 rounded-xl p-4 text-center border border-gray-700">
                        <p className="text-2xl font-bold" style={{ color: t.color }}>{val.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{t.label}</p>
                        <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <motion.div className="h-full rounded-full"
                            style={{ background: t.color, width: `${pct}%` }}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{pct}%</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Quick Navigation ── */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-2">
              <SectionHeader icon={ArrowRight} title="Continue Investigation" color="text-gray-400" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Run Detection", path: "/run-detection", color: "border-blue-500/30 text-blue-400" },
                  { label: "View Results", path: "/detection-results", color: "border-purple-500/30 text-purple-400" },
                  { label: "Model Comparison", path: "/model-comparison", color: "border-green-500/30 text-green-400" },
                  { label: "Check Transaction", path: "/check-transaction", color: "border-yellow-500/30 text-yellow-400" },
                ].map((nav) => (
                  <button key={nav.path} onClick={() => navigate(nav.path)}
                    className={`rounded-lg border p-3 text-left text-xs font-medium transition-all hover:bg-white/5 ${nav.color}`}>
                    {nav.label} <ArrowRight className="h-3 w-3 inline ml-1 opacity-60" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
