import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import { AlertCircle, Brain, Trophy, Zap, Shield, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const MODEL_LABELS = { isolation_forest: "Isolation Forest", autoencoder: "Autoencoder" };
const COLORS = { isolation_forest: "#3b82f6", autoencoder: "#a855f7" };

// AI-generated model recommendation
function getAiRecommendation(results, keys) {
  if (!keys.length) return null;
  if (keys.length === 1) {
    const k = keys[0];
    const r = results[k];
    const f1 = r.f1;
    if (f1 != null && f1 > 0.8) return { model: k, reason: `${MODEL_LABELS[k]} achieved excellent F1 score (${(f1*100).toFixed(1)}%). Suitable for production.`, confidence: "high" };
    if (f1 != null) return { model: k, reason: `${MODEL_LABELS[k]} is your only trained model. Train both models for a proper comparison.`, confidence: "medium" };
    return { model: k, reason: `${MODEL_LABELS[k]} has completed detection. Train both models with labels to evaluate performance.`, confidence: "low" };
  }

  // Compare by F1 first, then AUC
  const scored = keys.map((k) => ({ k, f1: results[k].f1 ?? 0, auc: results[k].auc ?? 0, detected: results[k].fraud_detected ?? 0 }));
  scored.sort((a, b) => (b.f1 - a.f1) || (b.auc - a.auc));
  const best = scored[0];
  const second = scored[1];
  const margin = best.f1 - second.f1;

  if (margin > 0.05) {
    return {
      model: best.k,
      reason: `${MODEL_LABELS[best.k]} is clearly superior with F1=${(best.f1*100).toFixed(1)}% vs ${(second.f1*100).toFixed(1)}% for ${MODEL_LABELS[second.k]}. Use ${MODEL_LABELS[best.k]} for production.`,
      confidence: "high",
    };
  }
  if (best.f1 > 0) {
    return {
      model: best.k,
      reason: `Both models perform similarly. ${MODEL_LABELS[best.k]} edges ahead (F1 ${(best.f1*100).toFixed(1)}%). Consider an ensemble of both for maximum coverage.`,
      confidence: "medium",
    };
  }
  return {
    model: best.k,
    reason: `No ground-truth labels available for metric comparison. Use both models together — if either flags a transaction as anomalous, treat it as suspicious.`,
    confidence: "low",
  };
}

export default function ModelComparison() {
  const [user, setUser] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    axios.get(`${API}/results`)
      .then((res) => {
        const data = res.data;
        if (!Object.keys(data).length) { setError("No results found. Run detection first."); return; }
        setResults(data);
      })
      .catch(() => setError("Could not load results. Run detection first."));
  }, []);

  if (!results && !error) return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900"><SidebarContent /></aside>
      <div className="flex-1 p-6"><Header user={user} />
        <div className="text-blue-400 animate-pulse mt-10 text-center">Loading results…</div>
      </div>
    </div>
  );

  const keys = results ? Object.keys(results) : [];
  const hasMetrics = keys.every((k) => results[k].precision != null);
  const isMultiModel = keys.length >= 2;
  const recommendation = results ? getAiRecommendation(results, keys) : null;

  const metricsData = hasMetrics ? [
    { metric: "Precision", ...Object.fromEntries(keys.map((k) => [MODEL_LABELS[k] ?? k, results[k].precision])) },
    { metric: "Recall",    ...Object.fromEntries(keys.map((k) => [MODEL_LABELS[k] ?? k, results[k].recall])) },
    { metric: "F1",        ...Object.fromEntries(keys.map((k) => [MODEL_LABELS[k] ?? k, results[k].f1])) },
    { metric: "AUC",       ...Object.fromEntries(keys.map((k) => [MODEL_LABELS[k] ?? k, results[k].auc])) },
  ] : [];

  // Radar data
  const radarData = hasMetrics && isMultiModel ? [
    { attr: "Precision", ...Object.fromEntries(keys.map((k) => [MODEL_LABELS[k] ?? k, (results[k].precision ?? 0) * 100])) },
    { attr: "Recall",    ...Object.fromEntries(keys.map((k) => [MODEL_LABELS[k] ?? k, (results[k].recall ?? 0) * 100])) },
    { attr: "F1 Score",  ...Object.fromEntries(keys.map((k) => [MODEL_LABELS[k] ?? k, (results[k].f1 ?? 0) * 100])) },
    { attr: "AUC-ROC",   ...Object.fromEntries(keys.map((k) => [MODEL_LABELS[k] ?? k, (results[k].auc ?? 0) * 100])) },
    { attr: "Coverage",  ...Object.fromEntries(keys.map((k) => [MODEL_LABELS[k] ?? k, Math.min(100, (results[k].fraud_detected / Math.max(results[k].total, 1)) * 1000)])) },
  ] : [];

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900"><SidebarContent /></aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-5xl mx-auto">
          <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold text-blue-400 mb-6">
            Model Comparison
          </motion.h1>

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
              <Button variant="ghost" size="sm" className="ml-auto text-blue-400" onClick={() => navigate("/run-detection")}>
                Run Both Models
              </Button>
            </div>
          )}

          {results && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              {!isMultiModel && (
                <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-300">
                  <span>Showing 1 model. Train both Isolation Forest + Autoencoder to compare side-by-side.</span>
                  <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 shrink-0 ml-2"
                    onClick={() => navigate("/run-detection")}>
                    Run Both Models
                  </Button>
                </div>
              )}

              {/* AI Recommendation */}
              {recommendation && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                  <Card className={`border ${
                    recommendation.confidence === "high"   ? "border-green-500/30 bg-green-500/8"  :
                    recommendation.confidence === "medium" ? "border-blue-500/30 bg-blue-500/8"    :
                                                             "border-gray-600/30 bg-gray-800"
                  }`}>
                    <CardHeader className="pb-2">
                      <CardTitle className={`text-sm flex items-center gap-2 ${
                        recommendation.confidence === "high" ? "text-green-400" : "text-blue-400"
                      }`}>
                        <Brain className="h-4 w-4" /> AI Deployment Recommendation
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                          recommendation.confidence === "high"   ? "bg-green-500/20 text-green-300" :
                          recommendation.confidence === "medium" ? "bg-blue-500/20 text-blue-300"   :
                                                                   "bg-gray-600 text-gray-300"
                        }`}>
                          {recommendation.confidence.toUpperCase()} CONFIDENCE
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Trophy className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                          recommendation.confidence === "high" ? "text-yellow-400" : "text-gray-400"
                        }`} />
                        <p className="text-sm text-gray-300">{recommendation.reason}</p>
                      </div>

                      {/* Model traits */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        {[
                          {
                            key: "isolation_forest",
                            traits: [
                              { icon: Zap, text: "Very fast training (~seconds)" },
                              { icon: Shield, text: "Works well with small datasets" },
                              { icon: Brain, text: "No labels required" },
                            ],
                          },
                          {
                            key: "autoencoder",
                            traits: [
                              { icon: Brain, text: "Deep learning — learns complex patterns" },
                              { icon: Shield, text: "Better on large datasets (>5k rows)" },
                              { icon: Zap, text: "Needs TensorFlow & more training time" },
                            ],
                          },
                        ].filter(m => keys.includes(m.key)).map((m) => (
                          <div key={m.key} className="bg-gray-700/40 rounded-lg p-3 space-y-1.5">
                            <p className="text-xs font-semibold" style={{ color: COLORS[m.key] ?? "#9ca3af" }}>
                              {MODEL_LABELS[m.key]}
                            </p>
                            {m.traits.map((t, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-xs text-gray-400">
                                <t.icon className="h-3 w-3 text-gray-500" />{t.text}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Performance metrics table */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-blue-400">Performance Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left text-gray-400 py-2 pr-6">Metric</th>
                          {keys.map((k) => (
                            <th key={k} className="text-right py-2 px-4" style={{ color: COLORS[k] ?? "#9ca3af" }}>
                              {MODEL_LABELS[k] ?? k}
                            </th>
                          ))}
                          {isMultiModel && <th className="text-right py-2 px-4 text-gray-400">Winner</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: "Fraud Detected", key: "fraud_detected", higherIsBetter: true, format: (v) => v },
                          { label: "Precision",  key: "precision", higherIsBetter: true, format: (v) => v != null ? `${(v*100).toFixed(1)}%` : "—" },
                          { label: "Recall",     key: "recall",    higherIsBetter: true, format: (v) => v != null ? `${(v*100).toFixed(1)}%` : "—" },
                          { label: "F1 Score",   key: "f1",        higherIsBetter: true, format: (v) => v != null ? v.toFixed(4) : "—" },
                          { label: "AUC-ROC",    key: "auc",       higherIsBetter: true, format: (v) => v != null ? v.toFixed(4) : "—" },
                        ].map((row) => {
                          const vals = keys.map((k) => results[k][row.key]);
                          const best = row.higherIsBetter
                            ? Math.max(...vals.filter((v) => v != null))
                            : Math.min(...vals.filter((v) => v != null));
                          const winner = isMultiModel ? keys.find((k) => results[k][row.key] === best) : null;
                          return (
                            <tr key={row.label} className="border-b border-gray-700/50">
                              <td className="py-2 pr-6 text-gray-300">{row.label}</td>
                              {keys.map((k) => (
                                <td key={k} className={`text-right py-2 px-4 font-mono ${k === winner ? "font-bold text-white" : "text-gray-400"}`}>
                                  {row.format(results[k][row.key])}{k === winner && results[k][row.key] != null && " ✓"}
                                </td>
                              ))}
                              {isMultiModel && (
                                <td className="text-right py-2 px-4 text-xs" style={{ color: COLORS[winner] ?? "#9ca3af" }}>
                                  {winner ? (MODEL_LABELS[winner] ?? winner) : "—"}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Radar Chart */}
              {radarData.length > 0 && isMultiModel && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-purple-400">Capability Radar</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#374151" />
                        <PolarAngleAxis dataKey="attr" stroke="#9ca3af" fontSize={11} />
                        <PolarRadiusAxis domain={[0, 100]} tick={false} />
                        {keys.map((k) => (
                          <Radar key={k} name={MODEL_LABELS[k] ?? k} dataKey={MODEL_LABELS[k] ?? k}
                            stroke={COLORS[k] ?? "#9ca3af"} fill={COLORS[k] ?? "#9ca3af"} fillOpacity={0.15} />
                        ))}
                        <Legend />
                        <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                          formatter={(v) => `${v.toFixed(1)}%`} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Metrics bar chart */}
              {metricsData.length > 0 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-green-400">Metrics Comparison Chart</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={metricsData} margin={{ left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="metric" stroke="#9ca3af" fontSize={12} />
                        <YAxis domain={[0, 1]} stroke="#9ca3af" fontSize={11} tickFormatter={(v) => v.toFixed(1)} />
                        <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                          formatter={(v) => typeof v === "number" ? v.toFixed(4) : v} />
                        <Legend />
                        {keys.map((k) => (
                          <Bar key={k} dataKey={MODEL_LABELS[k] ?? k} fill={COLORS[k] ?? "#9ca3af"} radius={[3, 3, 0, 0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Fraud detection counts */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-yellow-400">Fraud Detection Counts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`grid gap-4 mb-4 ${isMultiModel ? "grid-cols-2" : "grid-cols-1 max-w-xs"}`}>
                    {keys.map((k) => (
                      <div key={k} className="bg-gray-700/50 rounded-lg p-4 text-center">
                        <p className="text-xs text-gray-400 mb-1">{MODEL_LABELS[k] ?? k}</p>
                        <p className="text-3xl font-bold" style={{ color: COLORS[k] }}>{results[k].fraud_detected}</p>
                        <p className="text-xs text-gray-400">
                          / {results[k].total} total ({results[k].total ? ((results[k].fraud_detected / results[k].total) * 100).toFixed(1) : 0}%)
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end pt-2">
                <Button onClick={() => navigate("/check-transaction")}
                  className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1">
                  Check Single Transaction <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
