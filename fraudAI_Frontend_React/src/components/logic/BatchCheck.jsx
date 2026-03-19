import { useState, useEffect, useRef } from "react";
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
  ShieldCheck, ShieldX, RefreshCw,
  Download, Brain, ChevronRight, AlertCircle, BarChart2,
  ArrowRight, Microscope, GitCompare, ScanSearch,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const RF_FEATURE_NAMES = [
  "Transaction Amount","Transaction Frequency","Recipient Blacklist Status",
  "Device Fingerprinting","VPN or Proxy Usage","Behavioral Biometrics",
  "Time Since Last Transaction","Social Trust Score","Account Age",
  "High-Risk Transaction Times","Past Fraudulent Behavior Flags",
  "Location-Inconsistent Transactions","Normalized Transaction Amount",
  "Transaction Context Anomalies","Fraud Complaints Count",
  "Merchant Category Mismatch","User Daily Limit Exceeded",
  "Recent High-Value Transaction Flags",
  "Recipient Verification Status_suspicious","Recipient Verification Status_verified",
  "Geo-Location Flags_normal","Geo-Location Flags_unusual",
];

const RISK_COLORS = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#10b981" };

// Generate a random transaction row with sensible defaults
function makeEmptyRow(id) {
  return { id, features: Array(RF_FEATURE_NAMES.length).fill("") };
}

function riskBadge(risk) {
  const styles = {
    HIGH:   "bg-red-500/20 text-red-300 border border-red-500/30",
    MEDIUM: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
    LOW:    "bg-green-500/20 text-green-300 border border-green-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[risk] ?? styles.LOW}`}>
      {risk}
    </span>
  );
}

function verdictIcon(verdict) {
  return verdict === "FRAUD"
    ? <ShieldX className="h-4 w-4 text-red-400 flex-shrink-0" />
    : <ShieldCheck className="h-4 w-4 text-green-400 flex-shrink-0" />;
}

// Quick fill helpers
function suspiciousRow() {
  return RF_FEATURE_NAMES.map((n) => {
    const l = n.toLowerCase();
    if (l.includes("amount") || l.includes("value")) return "50000";
    if (l.includes("frequency")) return "200";
    if (l.includes("age")) return "0";
    if (l.includes("trust") || l.includes("social")) return "0";
    if (l.includes("time") || l.includes("last")) return "0";
    if (l.includes("complaints") || l.includes("count")) return "10";
    return "1";
  });
}
function normalRow() {
  return RF_FEATURE_NAMES.map((n) => {
    const l = n.toLowerCase();
    if (l.includes("amount") || l.includes("value")) return "500";
    if (l.includes("frequency")) return "3";
    if (l.includes("age")) return "365";
    if (l.includes("trust") || l.includes("social")) return "85";
    if (l.includes("time") || l.includes("last")) return "24";
    if (l.includes("verified")) return "1";
    if (l.includes("normal")) return "1";
    return "0";
  });
}

export default function BatchCheck() {
  const [user, setUser] = useState(null);
  const [rows, setRows] = useState(() => [makeEmptyRow("TX0001"), makeEmptyRow("TX0002"), makeEmptyRow("TX0003")]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const resultsRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (results && resultsRef.current) {
      const y = resultsRef.current.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }, [results]);

  const addRow = () => {
    const id = `TX${String(rows.length + 1).padStart(4, "0")}`;
    setRows((r) => [...r, makeEmptyRow(id)]);
  };

  const removeRow = (idx) => setRows((r) => r.filter((_, i) => i !== idx));

  const fillRow = (idx, type) => {
    const vals = type === "suspicious" ? suspiciousRow() : normalRow();
    setRows((r) => r.map((row, i) => i === idx ? { ...row, features: vals } : row));
  };

  const fillAll = (type) => {
    const vals = type === "suspicious" ? suspiciousRow() : normalRow();
    setRows((r) => r.map((row) => ({ ...row, features: vals })));
  };

  const updateFeature = (rowIdx, featIdx, val) => {
    setRows((r) => r.map((row, i) => {
      if (i !== rowIdx) return row;
      const feats = [...row.features];
      feats[featIdx] = val;
      return { ...row, features: feats };
    }));
  };

  const handleRun = async () => {
    if (rows.length === 0) { setError("Add at least one transaction row."); return; }
    setError("");
    setLoading(true);
    setResults(null);
    try {
      const transactions = rows.map((row) => ({
        id: row.id,
        features: row.features.map((v) => (v === "" ? 0 : parseFloat(v) || 0)),
      }));
      const res = await axios.post(`${API}/batch-check`, { transactions });
      setResults(res.data);
    } catch (e) {
      setError(e.response?.data?.error || "Batch check failed. Is the Flask server running?");
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!results) return;
    const header = ["Transaction ID", "Verdict", "Fraud Probability (%)", "Risk Level", "Top Suspicious Features"];
    const dataRows = results.results.map((r) => [
      r.transaction_id, r.verdict, r.fraud_probability, r.risk_level,
      (r.top_suspicious_features ?? []).join(" | "),
    ]);
    const csv = [header, ...dataRows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `batch_check_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Fraud probability chart data
  const chartData = results?.results?.map((r) => ({
    name: r.transaction_id,
    probability: r.fraud_probability,
    fill: RISK_COLORS[r.risk_level] ?? RISK_COLORS.LOW,
  })) ?? [];

  const summary = results?.summary;

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-7xl mx-auto">
          <MLWorkflowStepper />

          {/* Next-step navigation bar */}
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2 mb-5 p-3 bg-gray-800/80 border border-gray-700 rounded-xl">
            <span className="text-xs text-gray-500 self-center mr-1 shrink-0">Next step:</span>
            {[
              { label: "AI Hub",            path: "/ai-hub",            icon: Brain,      color: "bg-cyan-600 hover:bg-cyan-700" },
              { label: "Feature Insights",  path: "/feature-insights",  icon: Microscope, color: "bg-orange-600 hover:bg-orange-700" },
              { label: "Check Transaction", path: "/check-transaction", icon: ScanSearch, color: "bg-yellow-600 hover:bg-yellow-700" },
              { label: "Model Comparison",  path: "/model-comparison",  icon: GitCompare, color: "bg-purple-600 hover:bg-purple-700" },
            ].map(({ label, path, icon: Icon, color }) => (
              <button key={path} onClick={() => navigate(path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all ${color}`}>
                <Icon className="h-3.5 w-3.5" /> {label} <ArrowRight className="h-3 w-3 opacity-70" />
              </button>
            ))}
          </motion.div>

          <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
            <div>
              <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-bold text-blue-400">
                AI Batch Transaction Check
              </motion.h1>
              <p className="text-gray-400 text-sm mt-1">
                Check up to 50 transactions simultaneously with AI fraud scoring.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => fillAll("suspicious")} size="sm" variant="outline"
                className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs">
                Fill All Suspicious
              </Button>
              <Button onClick={() => fillAll("normal")} size="sm" variant="outline"
                className="border-green-500/40 text-green-400 hover:bg-green-500/10 text-xs">
                Fill All Normal
              </Button>
              <Button onClick={addRow} size="sm" disabled={rows.length >= 50}
                className="bg-blue-600 hover:bg-blue-700 text-xs">
                + Add Row
              </Button>
            </div>
          </div>

          {/* Transaction Table */}
          <Card className="bg-gray-800 border-gray-700 mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 flex items-center justify-between">
                <span>Transaction Rows <span className="text-gray-600">({rows.length} / 50)</span></span>
                <span className="text-xs text-gray-600">Click a row to edit feature values</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.map((row, rowIdx) => {
                const filledCount = row.features.filter((v) => v !== "").length;
                const isEditing = editingRow === rowIdx;
                return (
                  <motion.div key={rowIdx} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <div
                      className={`rounded-lg border transition-all ${isEditing ? "border-blue-500/50 bg-blue-500/5" : "border-gray-700 hover:border-gray-600 bg-gray-700/30"}`}
                    >
                      {/* Row header */}
                      <div className="flex items-center gap-3 p-3 cursor-pointer"
                        onClick={() => setEditingRow(isEditing ? null : rowIdx)}>
                        <span className="text-xs font-mono text-blue-400 w-16 flex-shrink-0">{row.id}</span>
                        <div className="flex-1 min-w-0">
                          <div className="w-full bg-gray-700 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-blue-500 transition-all"
                              style={{ width: `${(filledCount / RF_FEATURE_NAMES.length) * 100}%` }} />
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0">{filledCount}/{RF_FEATURE_NAMES.length}</span>
                        <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => fillRow(rowIdx, "suspicious")}
                            className="text-xs text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded border border-red-500/30 hover:bg-red-500/10">
                            Sus
                          </button>
                          <button onClick={() => fillRow(rowIdx, "normal")}
                            className="text-xs text-green-400 hover:text-green-300 px-1.5 py-0.5 rounded border border-green-500/30 hover:bg-green-500/10">
                            Nor
                          </button>
                          <button onClick={() => removeRow(rowIdx)}
                            className="text-xs text-gray-500 hover:text-red-400 px-1.5 py-0.5 rounded border border-gray-600 hover:border-red-500/30">
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Expanded feature editor */}
                      <AnimatePresence>
                        {isEditing && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="px-3 pb-3 pt-1 grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2 border-t border-gray-700/50">
                              {RF_FEATURE_NAMES.map((name, fi) => (
                                <div key={fi}>
                                  <label className="text-xs text-gray-500 block mb-0.5 truncate" title={name}>{name}</label>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="0"
                                    value={row.features[fi] ?? ""}
                                    onChange={(e) => updateFeature(rowIdx, fi, e.target.value)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded text-xs text-white px-2 py-1 focus:border-blue-500 focus:outline-none"
                                  />
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}

              {rows.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">No rows added yet. Click "+ Add Row" to start.</p>
              )}
            </CardContent>
          </Card>

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-4 text-sm">
              <AlertCircle className="h-4 w-4" />{error}
            </div>
          )}

          <div className="flex gap-3 mb-6">
            <Button onClick={handleRun} disabled={loading || rows.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 h-11 flex items-center justify-center gap-2 text-base">
              {loading
                ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Running AI checks…</>
                : <><Brain className="h-5 w-5" /> Run Batch AI Check ({rows.length} transactions)</>
              }
            </Button>
            <Button onClick={() => { setRows([makeEmptyRow("TX0001"), makeEmptyRow("TX0002"), makeEmptyRow("TX0003")]); setResults(null); }}
              variant="outline" className="border-gray-600 text-gray-400 hover:text-white">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Results */}
          <AnimatePresence>
            {results && (
              <motion.div ref={resultsRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="space-y-5">

                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Total Checked",  value: summary?.total,      color: "blue"   },
                    { label: "Fraud Detected", value: summary?.fraud,      color: "red"    },
                    { label: "Legitimate",     value: summary?.legitimate, color: "green"  },
                    { label: "High Risk",      value: summary?.high_risk,  color: "orange" },
                  ].map((s) => (
                    <Card key={s.label} className="bg-gray-800 border-gray-700">
                      <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-gray-400">{s.label}</p>
                        <p className={`text-2xl font-bold text-${s.color}-400`}>{s.value ?? 0}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* AI Batch Insight */}
                {results.batch_insight && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
                      <Brain className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-blue-400 mb-1">AI Batch Analysis</p>
                        <p className="text-sm text-gray-300">{results.batch_insight}</p>
                        <p className="text-xs text-gray-500 mt-1">Fraud rate: {results.fraud_rate_percent}% across this batch</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Fraud Probability Chart */}
                {chartData.length > 0 && (
                  <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-yellow-400 flex items-center gap-2">
                        <BarChart2 className="h-4 w-4" /> Fraud Probability by Transaction
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={chartData} margin={{ left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} />
                          <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={11}
                            label={{ value: "Fraud %", angle: -90, position: "insideLeft", fill: "#9ca3af", fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                            formatter={(v) => [`${v}%`, "Fraud Probability"]} />
                          {/* Reference line at 50 */}
                          <Bar dataKey="probability" radius={[3, 3, 0, 0]}>
                            {chartData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-gray-600 mt-1 text-center">
                        Red = HIGH risk · Amber = MEDIUM risk · Green = LOW risk
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Results Table */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-blue-400">Transaction Results</CardTitle>
                      <Button onClick={exportCSV} size="sm" variant="outline"
                        className="border-gray-600 text-gray-300 hover:text-white flex items-center gap-1">
                        <Download className="h-4 w-4" /> Export CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left text-gray-400 py-2 pr-4">ID</th>
                            <th className="text-left text-gray-400 py-2 pr-4">Verdict</th>
                            <th className="text-left text-gray-400 py-2 pr-4">Fraud %</th>
                            <th className="text-left text-gray-400 py-2 pr-4">Risk</th>
                            <th className="text-left text-gray-400 py-2">Top Suspicious Features</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.results?.map((r, i) => {
                            const isFraud = r.verdict === "FRAUD";
                            return (
                              <motion.tr key={i}
                                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                className="border-b border-gray-700/50">
                                <td className="py-2 pr-4 font-mono text-xs text-gray-300">{r.transaction_id}</td>
                                <td className="py-2 pr-4">
                                  <div className="flex items-center gap-1.5">
                                    {verdictIcon(r.verdict)}
                                    <span className={isFraud ? "text-red-400 font-medium" : "text-green-400"}>{r.verdict}</span>
                                  </div>
                                </td>
                                <td className="py-2 pr-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full"
                                        style={{ width: `${r.fraud_probability}%`, backgroundColor: RISK_COLORS[r.risk_level] }} />
                                    </div>
                                    <span className="font-mono text-xs text-white">{r.fraud_probability}%</span>
                                  </div>
                                </td>
                                <td className="py-2 pr-4">{riskBadge(r.risk_level)}</td>
                                <td className="py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {r.top_suspicious_features?.length > 0
                                      ? r.top_suspicious_features.map((f, fi) => (
                                          <span key={fi} className="text-xs bg-red-500/15 text-red-300 px-1.5 py-0.5 rounded">{f}</span>
                                        ))
                                      : <span className="text-xs text-gray-600">None</span>
                                    }
                                  </div>
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-800/80 border border-gray-700 rounded-xl">
                  <span className="text-xs text-gray-500 self-center mr-1 shrink-0">Continue to:</span>
                  {[
                    { label: "AI Hub",            path: "/ai-hub",            icon: Brain,      color: "bg-cyan-600 hover:bg-cyan-700" },
                    { label: "Feature Insights",  path: "/feature-insights",  icon: Microscope, color: "bg-orange-600 hover:bg-orange-700" },
                    { label: "Check Transaction", path: "/check-transaction", icon: ScanSearch, color: "bg-yellow-600 hover:bg-yellow-700" },
                    { label: "Model Comparison",  path: "/model-comparison",  icon: GitCompare, color: "bg-purple-600 hover:bg-purple-700" },
                  ].map(({ label, path, icon: Icon, color }) => (
                    <button key={path} onClick={() => navigate(path)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all ${color}`}>
                      <Icon className="h-3.5 w-3.5" /> {label} <ArrowRight className="h-3 w-3 opacity-70" />
                    </button>
                  ))}
                  <div className="ml-auto">
                    <Button variant="outline" size="sm" onClick={() => setResults(null)}
                      className="border-gray-600 text-gray-400 hover:text-white text-xs flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" /> Check New Batch
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
