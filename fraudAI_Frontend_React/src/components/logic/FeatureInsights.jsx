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
import MLWorkflowStepper from "./MLWorkflowStepper";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Brain, AlertTriangle, Search, RefreshCw,
  Target, Lightbulb, ArrowRight, ChevronDown, ChevronUp,
  Sparkles, Info, Award, BarChart3, ShieldAlert, ShieldCheck,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const IMP_COLOR = (imp) =>
  imp >= 10 ? "#ef4444" : imp >= 5 ? "#f97316" : imp >= 2 ? "#eab308" : "#22c55e";

const VERDICT_STYLE = {
  FRAUD:      "text-red-400 bg-red-400/10 border-red-500/30",
  LEGITIMATE: "text-green-400 bg-green-400/10 border-green-500/30",
  UNKNOWN:    "text-gray-400 bg-gray-400/10 border-gray-500/30",
};

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

function SectionHeader({ icon: Icon, title, color = "text-blue-400", badge }) {
  return (
    <CardTitle className={`text-base ${color} flex items-center gap-2`}>
      <Icon className="h-4 w-4" /> {title}
      {badge && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-normal ml-auto">
          {badge}
        </span>
      )}
    </CardTitle>
  );
}

export default function FeatureInsights() {
  const [user, setUser]                   = useState(null);
  const [importance, setImportance]       = useState(null);
  const [threshold, setThreshold]         = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState("");

  // Similarity search state
  const [simFeatures, setSimFeatures]     = useState(Array(22).fill(""));
  const [simResult, setSimResult]         = useState(null);
  const [simLoading, setSimLoading]       = useState(false);
  const [simError, setSimError]           = useState("");
  const [simExpanded, setSimExpanded]     = useState(false);
  const [simK, setSimK]                   = useState(5);

  // Preset feature vectors
  const SUSPICIOUS_VALUES = [
    9500, 15, 1, 1, 1, 0.1, 0.5, 0.2, 0.3,
    1, 1, 1, 0.95, 1, 3, 1, 1, 1,
    1, 0, 0, 1,
  ];
  const NORMAL_VALUES = [
    250, 3, 0, 0, 0, 0.85, 48, 0.9, 5,
    0, 0, 0, 0.1, 0, 0, 0, 0, 0,
    0, 1, 1, 0,
  ];

  // UI toggles
  const [showAll, setShowAll]             = useState(false);
  const [threshExpanded, setThreshExpanded] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [imp, thr] = await Promise.allSettled([
        axios.get(`${API}/feature-importance`),
        axios.get(`${API}/smart-threshold`),
      ]);
      if (imp.status === "fulfilled") setImportance(imp.value.data);
      if (thr.status === "fulfilled") setThreshold(thr.value.data);
    } catch {
      setError("Could not load feature insights.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSimilaritySearch = async () => {
    const vals = simFeatures.map(Number);
    if (vals.some(isNaN)) { setSimError("All 22 fields must be numbers."); return; }
    setSimLoading(true);
    setSimError("");
    setSimResult(null);
    try {
      const res = await axios.post(`${API}/similarity-search`, { features: vals, k: simK });
      setSimResult(res.data);
    } catch (e) {
      setSimError(e.response?.data?.error || "Similarity search failed.");
    } finally {
      setSimLoading(false);
    }
  };

  const topFeatures  = importance?.features?.slice(0, showAll ? 22 : 8) || [];
  const chartData    = importance?.features?.slice(0, 12).map(f => ({
    name: f.feature.length > 20 ? f.feature.slice(0, 18) + "…" : f.feature,
    fullName: f.feature,
    pct: f.importance_pct,
  })) || [];

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-5xl mx-auto">
          <MLWorkflowStepper />

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-bold text-blue-400 flex items-center gap-2">
                <Brain className="h-6 w-6" /> Feature Insights
              </motion.h1>
              <p className="text-sm text-gray-500 mt-0.5">
                RF model interpretability · Smart threshold advisor · Transaction similarity search
              </p>
            </div>
            <Button onClick={loadData} disabled={loading} variant="outline" size="sm"
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

          {/* No dataset warning */}
          {!loading && !threshold && !importance?.dataset_enriched && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2 text-yellow-300 text-sm">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                Upload a CSV dataset to unlock dataset-level enrichment and similarity search.
              </div>
              <Button size="sm" onClick={() => navigate("/upload-data")}
                className="bg-yellow-600 hover:bg-yellow-700 text-white shrink-0 ml-4">
                Upload CSV
              </Button>
            </div>
          )}

          {/* ── AI Insight Banner ── */}
          {importance?.insight && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-400 mb-1">AI Model Insight</p>
                <p className="text-sm text-gray-300">{importance.insight}</p>
              </div>
            </motion.div>
          )}

          <div className="grid md:grid-cols-2 gap-6 mb-6">

            {/* ── Feature Importance Chart ── */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-2">
                <SectionHeader icon={BarChart3} title="RF Feature Importance"
                  color="text-blue-400" badge={importance ? `${importance.total_features} features` : ""} />
              </CardHeader>
              <CardContent className="pt-0">
                {loading ? (
                  <div className="flex items-center justify-center h-40">
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
                  </div>
                ) : !importance ? (
                  <p className="text-gray-500 text-sm">Feature data unavailable.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }}
                          tickFormatter={(v) => `${v}%`} />
                        <YAxis dataKey="name" type="category" width={130}
                          tick={{ fontSize: 9, fill: "#9ca3af" }} />
                        <Tooltip
                          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                          formatter={(val, _, props) => [`${val}%`, props.payload.fullName]}
                        />
                        <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={IMP_COLOR(entry.pct)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-gray-600 mt-1 text-center">
                      Color: red = high influence, green = low influence
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Top Features Table ── */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-2">
                <SectionHeader icon={Award} title="Top Fraud Predictors" color="text-yellow-400" />
              </CardHeader>
              <CardContent className="pt-0">
                {!importance ? (
                  <p className="text-gray-500 text-sm">No data.</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {topFeatures.map((f, i) => {
                        const barW = Math.min(100, (f.importance_pct / (importance.features[0]?.importance_pct || 1)) * 100);
                        const color = IMP_COLOR(f.importance_pct);
                        return (
                          <motion.div key={f.feature} initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500 w-4 text-right">{f.rank}.</span>
                                <span className="text-gray-300 truncate max-w-[160px]" title={f.feature}>
                                  {f.feature}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {f.correlation_with_fraud !== undefined && (
                                  <span className={`text-xs font-mono ${f.correlation_with_fraud > 0 ? "text-red-400" : "text-blue-400"}`}>
                                    ρ{f.correlation_with_fraud > 0 ? "+" : ""}{f.correlation_with_fraud}
                                  </span>
                                )}
                                <span className="font-mono" style={{ color }}>{f.importance_pct}%</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <motion.div className="h-full rounded-full"
                                style={{ background: color, width: `${barW}%` }}
                                initial={{ width: 0 }} animate={{ width: `${barW}%` }}
                                transition={{ delay: i * 0.04 + 0.1, duration: 0.4 }} />
                            </div>
                            {f.fraud_mean !== undefined && f.legit_mean !== undefined && (
                              <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                                <span>Fraud avg: <span className="text-red-400">{f.fraud_mean}</span></span>
                                <span>Legit avg: <span className="text-green-400">{f.legit_mean}</span></span>
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                    <button onClick={() => setShowAll(p => !p)}
                      className="mt-3 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                      {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {showAll ? "Show less" : `Show all ${importance.total_features} features`}
                    </button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Smart Threshold Advisor ── */}
          <Card className="bg-gray-800 border-gray-700 mb-6">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <SectionHeader icon={Target} title="Smart Threshold Advisor" color="text-green-400" />
                <button onClick={() => setThreshExpanded(p => !p)} className="text-gray-500 hover:text-gray-300">
                  {threshExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </CardHeader>
            <AnimatePresence>
              {threshExpanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <CardContent className="pt-0">
                    {!threshold ? (
                      <p className="text-gray-500 text-sm">Upload a dataset to enable threshold analysis.</p>
                    ) : (
                      <>
                        {/* Insight */}
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-4 flex items-start gap-2">
                          <Lightbulb className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-gray-300">{threshold.insight}</p>
                        </div>

                        {/* Score histogram */}
                        {threshold.score_histogram?.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs text-gray-500 mb-2">Anomaly Score Distribution</p>
                            <ResponsiveContainer width="100%" height={100}>
                              <BarChart data={threshold.score_histogram} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                                  {threshold.score_histogram.map((d, i) => (
                                    <Cell key={i} fill={d.anomalous ? "#ef4444" : "#3b82f6"} fillOpacity={0.7} />
                                  ))}
                                </Bar>
                                <Tooltip
                                  contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                                  formatter={(v, _, p) => [`${v} transactions`, p.payload.anomalous ? "Anomalous zone" : "Normal zone"]}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                            <div className="flex justify-between text-xs text-gray-600 mt-1">
                              <span>← Low anomaly score (normal)</span>
                              <span>High anomaly score (fraud) →</span>
                            </div>
                          </div>
                        )}

                        {/* 3 recommendations */}
                        <div className="grid md:grid-cols-3 gap-3">
                          {threshold.recommendations?.map((rec, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                              className={`rounded-xl p-3 border cursor-pointer transition-all hover:border-blue-500/50 ${
                                i === 1 ? "border-blue-500/40 bg-blue-500/10" : "border-gray-700 bg-gray-900"
                              }`}
                              onClick={() => navigate("/run-detection")}>
                              {i === 1 && (
                                <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full mb-2 inline-block">
                                  Recommended
                                </span>
                              )}
                              <p className="text-sm font-semibold text-white">{rec.label}</p>
                              <p className="text-xl font-bold text-blue-400 my-1">{rec.contamination}</p>
                              <p className="text-xs text-gray-500 mb-1">~{rec.expected_fraud.toLocaleString()} flagged</p>
                              <p className="text-xs text-gray-400 leading-tight">{rec.description}</p>
                              <div className="mt-2 flex items-center gap-1 text-xs text-blue-400">
                                <ArrowRight className="h-3 w-3" /> Apply in Run Detection
                              </div>
                            </motion.div>
                          ))}
                        </div>

                        {/* Stats row */}
                        {threshold.score_percentiles && (
                          <div className="flex gap-4 mt-4 text-xs text-gray-500">
                            <span>p90 score: <span className="text-yellow-400 font-mono">{threshold.score_percentiles.p90}</span></span>
                            <span>p95 score: <span className="text-orange-400 font-mono">{threshold.score_percentiles.p95}</span></span>
                            <span>p99 score: <span className="text-red-400 font-mono">{threshold.score_percentiles.p99}</span></span>
                            <span>Method: <span className="text-gray-300">{threshold.method}</span></span>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* ── Similarity Search ── */}
          <Card className="bg-gray-800 border-gray-700 mb-6">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <SectionHeader icon={Search} title="Transaction Similarity Search" color="text-purple-400" />
                <button onClick={() => setSimExpanded(p => !p)}
                  className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
                  {simExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {simExpanded ? "Collapse" : "Expand"}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Enter a transaction's feature values — AI will find the most similar transactions in your dataset.
              </p>
            </CardHeader>
            <AnimatePresence>
              {simExpanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <CardContent className="pt-0">
                    {/* Top toolbar: presets + K selector */}
                    <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-gray-900/60 rounded-xl border border-gray-700">
                      <span className="text-xs text-gray-500 mr-1">Quick fill:</span>
                      <button
                        onClick={() => { setSimFeatures(SUSPICIOUS_VALUES.map(String)); setSimResult(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-all">
                        <ShieldAlert className="h-3.5 w-3.5" /> Suspicious Sample
                      </button>
                      <button
                        onClick={() => { setSimFeatures(NORMAL_VALUES.map(String)); setSimResult(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-all">
                        <ShieldCheck className="h-3.5 w-3.5" /> Normal Sample
                      </button>
                      <button
                        onClick={() => { setSimFeatures(Array(22).fill("")); setSimResult(null); }}
                        className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-500 text-xs hover:border-gray-600 hover:text-gray-400 transition-all">
                        Clear All
                      </button>
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-xs text-gray-500">Find top</span>
                        {[3, 5, 10].map((v) => (
                          <button key={v} onClick={() => setSimK(v)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                              simK === v ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                                         : "border-gray-700 text-gray-500 hover:border-gray-600"
                            }`}>
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Hint */}
                    <p className="text-xs text-gray-600 mb-3 flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 text-gray-600" />
                      Fields left blank default to 0. Use "Suspicious Sample" or "Normal Sample" to pre-fill typical values.
                    </p>

                    {/* Feature inputs grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
                      {RF_FEATURE_NAMES.map((name, i) => {
                        const isFilled = simFeatures[i] !== "" && simFeatures[i] !== undefined;
                        return (
                          <div key={i}>
                            <label className="text-xs text-gray-500 block mb-0.5 truncate" title={name}>{name}</label>
                            <input type="number" step="any"
                              value={simFeatures[i]}
                              onChange={(e) => {
                                const next = [...simFeatures];
                                next[i] = e.target.value;
                                setSimFeatures(next);
                              }}
                              placeholder="—"
                              className={`w-full bg-gray-900 border rounded-md px-2 py-1 text-xs text-gray-200 focus:outline-none transition-colors ${
                                isFilled ? "border-purple-500/50 focus:border-purple-400" : "border-gray-700 focus:border-purple-500"
                              }`} />
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 flex-wrap mb-3">
                      <Button onClick={handleSimilaritySearch} disabled={simLoading}
                        className="bg-purple-600 hover:bg-purple-700 gap-2 text-sm">
                        {simLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Find Similar Transactions
                      </Button>
                    </div>

                    {simError && (
                      <p className="text-red-400 text-xs mb-3 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />{simError}
                      </p>
                    )}

                    <AnimatePresence>
                      {simResult && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                          {/* Insight banner */}
                          <div className={`rounded-lg p-3 border mb-4 flex items-start gap-2 text-sm ${
                            simResult.fraud_neighbor_count >= simResult.query_k / 2
                              ? "bg-red-500/10 border-red-500/30 text-red-300"
                              : "bg-green-500/10 border-green-500/30 text-green-300"
                          }`}>
                            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            {simResult.insight}
                          </div>

                          {/* Results table */}
                          <div className="space-y-2">
                            {simResult.similar_transactions?.map((tx, i) => (
                              <motion.div key={i} initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                                className="bg-gray-900 rounded-xl border border-gray-700 p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">#{i + 1} · Row {tx.dataset_index}</span>
                                    <div className="h-1.5 w-16 bg-gray-700 rounded-full overflow-hidden">
                                      <div className="h-full bg-purple-500 rounded-full"
                                        style={{ width: `${tx.similarity_pct}%` }} />
                                    </div>
                                    <span className="text-xs text-purple-400">{tx.similarity_pct}% similar</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {tx.fraud_probability !== null && tx.fraud_probability !== undefined && (
                                      <span className="text-xs text-gray-400 font-mono">{tx.fraud_probability}%</span>
                                    )}
                                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${VERDICT_STYLE[tx.verdict]}`}>
                                      {tx.verdict}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                                  {Object.entries(tx.feature_values).map(([k, v]) => (
                                    <span key={k} className="text-xs text-gray-500">
                                      <span className="text-gray-400">{k.length > 16 ? k.slice(0, 14) + "…" : k}:</span> {v}
                                    </span>
                                  ))}
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* ── Quick navigation ── */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-2">
              <SectionHeader icon={ArrowRight} title="Continue" color="text-gray-400" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Run Detection",     path: "/run-detection",     color: "border-blue-500/30 text-blue-400" },
                  { label: "Detection Results", path: "/detection-results", color: "border-purple-500/30 text-purple-400" },
                  { label: "Check Transaction", path: "/check-transaction", color: "border-yellow-500/30 text-yellow-400" },
                  { label: "AI Hub",            path: "/ai-hub",            color: "border-cyan-500/30 text-cyan-400" },
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
