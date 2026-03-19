import { useState, useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import MLWorkflowStepper from "./MLWorkflowStepper";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle, CheckCircle, XCircle, ShieldAlert, Shield,
  ShieldCheck, Upload, RefreshCw, Clock, Lightbulb, BarChart2,
  Users, Zap, Brain, Ban, Eye, ThumbsUp,
  ArrowRight, Layers, Microscope, GitCompare,
} from "lucide-react";

// ── Fraud Probability Arc Gauge ───────────────────────────────────────────────
function FraudGauge({ probability }) {
  const p = Math.min(100, Math.max(0, probability ?? 0));
  const cx = 70, cy = 72, r = 55;
  const color = p >= 65 ? "#ef4444" : p >= 40 ? "#f59e0b" : "#10b981";
  const label = p >= 65 ? "HIGH RISK" : p >= 40 ? "MEDIUM RISK" : "LOW RISK";
  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`;
  let fgPath = "";
  if (p > 0 && p < 100) {
    const angle = Math.PI * (1 - p / 100);
    const x2 = (cx + r * Math.cos(angle)).toFixed(2);
    const y2 = (cy - r * Math.sin(angle)).toFixed(2);
    fgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${x2} ${y2}`;
  } else if (p === 100) fgPath = bgPath;
  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="82" viewBox="0 8 140 74">
        <path d={bgPath} fill="none" stroke="#374151" strokeWidth="10" strokeLinecap="round" />
        {fgPath && <path d={fgPath} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}55)` }} />}
      </svg>
      <div className="-mt-1 text-center">
        <span className="text-3xl font-bold" style={{ color }}>{p}%</span>
        <p className="text-xs font-semibold mt-0.5" style={{ color }}>{label}</p>
        <p className="text-xs text-gray-500">Fraud Probability</p>
      </div>
    </div>
  );
}

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const RISK_CONFIG = {
  HIGH:   { icon: XCircle,    color: "text-red-400",    bg: "bg-red-500/10 border-red-500/40",     label: "HIGH RISK — FRAUD DETECTED",              bar: "bg-red-500"    },
  MEDIUM: { icon: ShieldAlert, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/40", label: "MEDIUM RISK — Review Recommended",       bar: "bg-yellow-500" },
  LOW:    { icon: ShieldCheck, color: "text-green-400",  bg: "bg-green-500/10 border-green-500/40",   label: "LOW RISK — Transaction Appears Legitimate", bar: "bg-green-500" },
};

const ACTION_CONFIG = {
  BLOCK:   { icon: Ban,      bg: "bg-red-500/15 border-red-500/30",    text: "text-red-300",    badge: "bg-red-500/20 text-red-200" },
  REVIEW:  { icon: Eye,      bg: "bg-yellow-500/15 border-yellow-500/30", text: "text-yellow-300", badge: "bg-yellow-500/20 text-yellow-200" },
  APPROVE: { icon: ThumbsUp, bg: "bg-green-500/15 border-green-500/30",  text: "text-green-300",  badge: "bg-green-500/20 text-green-200" },
};

function isBinaryFeature(name) {
  return ["blacklist","vpn","proxy","flag","fraud","mismatch","exceeded","biometric","fingerprint","high-risk","high_risk","inconsistent","anomal"]
    .some((k) => name.toLowerCase().includes(k));
}

function getSuspiciousValue(name) {
  const lower = name.toLowerCase();
  if (lower.includes("amount") || lower.includes("value")) return "50000";
  if (lower.includes("frequency") || lower.includes("freq")) return "200";
  if (lower.includes("age")) return "0";
  if (lower.includes("trust") || lower.includes("score") || lower.includes("social")) return "0";
  if (lower.includes("time") || lower.includes("last")) return "0";
  if (lower.includes("complaints") || lower.includes("count")) return "10";
  if (isBinaryFeature(lower)) return "1";
  return "1";
}

function getNormalValue(name) {
  const lower = name.toLowerCase();
  if (lower.includes("amount") || lower.includes("value")) return "500";
  if (lower.includes("frequency")) return "3";
  if (lower.includes("age")) return "365";
  if (lower.includes("trust") || lower.includes("social") || lower.includes("score")) return "85";
  if (lower.includes("time") || lower.includes("last")) return "24";
  return "0";
}

export default function CheckTransaction() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [features, setFeatures] = useState([]);
  const [formValues, setFormValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [resultTime, setResultTime] = useState(null);
  const [error, setError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const resultRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    axios.get(`${API}/features`)
      .then((res) => {
        const featureList = res.data.feature_columns || [];
        setFeatures(featureList);
        setFormValues(Object.fromEntries(featureList.map((f) => [f, ""])));
      })
      .catch((e) => {
        const msg = e.response?.data?.error || "";
        if (msg.includes("No dataset") || e.response?.status === 400)
          setFetchError("No dataset loaded. Upload a CSV and run detection first.");
      });
  }, []);

  useEffect(() => {
    if (result && resultRef.current) {
      const y = resultRef.current.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }, [result]);

  const handleChange = (key, value) => setFormValues((prev) => ({ ...prev, [key]: value }));
  const handleReset = () => { setFormValues(Object.fromEntries(features.map((f) => [f, ""]))); setResult(null); setError(""); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(formValues).map(([k, v]) => [k, v === "" ? 0 : parseFloat(v) || 0])
      );
      const res = await axios.post(`${API}/check-single`, payload);
      setResult(res.data);
      setResultTime(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.response?.data?.error || "Check failed. Is the Flask server running?");
    } finally {
      setLoading(false);
    }
  };

  const riskConfig = result ? RISK_CONFIG[result.risk_level] ?? RISK_CONFIG.LOW : null;

  // Parse recommended action keyword from the string
  const actionKey = result?.recommended_action
    ? result.recommended_action.startsWith("BLOCK") ? "BLOCK"
      : result.recommended_action.startsWith("REVIEW") ? "REVIEW"
      : "APPROVE"
    : null;
  const actionConfig = actionKey ? ACTION_CONFIG[actionKey] : null;

  const normalizeScore = (score) => Math.min(100, Math.round((score ?? 0) * 100));

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-4xl mx-auto">
          <MLWorkflowStepper />

          {/* ── Next step bar ── */}
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2 mb-5 p-3 bg-gray-800/80 border border-gray-700 rounded-xl">
            <span className="text-xs text-gray-500 self-center mr-1 shrink-0">Next step:</span>
            {[
              { label: "Batch Check",      path: "/batch-check",      icon: Layers,     color: "bg-green-600 hover:bg-green-700" },
              { label: "AI Hub",           path: "/ai-hub",           icon: Brain,      color: "bg-cyan-600 hover:bg-cyan-700" },
              { label: "Feature Insights", path: "/feature-insights", icon: Microscope, color: "bg-orange-600 hover:bg-orange-700" },
              { label: "Model Comparison", path: "/model-comparison", icon: GitCompare, color: "bg-purple-600 hover:bg-purple-700" },
            ].map(({ label, path, icon: Icon, color }) => (
              <button key={path} onClick={() => navigate(path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all ${color}`}>
                <Icon className="h-3.5 w-3.5" /> {label} <ArrowRight className="h-3 w-3 opacity-70" />
              </button>
            ))}
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold text-blue-400 mb-2">
            Check Single Transaction
          </motion.h1>
          <p className="text-gray-400 text-sm mb-6">
            Enter transaction feature values to get an instant AI fraud verdict with detailed risk analysis.
          </p>

          {fetchError && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-5 mb-5">
              <div className="flex items-start gap-3 mb-4">
                <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-300 font-semibold text-sm">No dataset loaded</p>
                  <p className="text-yellow-400/70 text-xs mt-0.5">Complete the ML workflow first before checking a single transaction.</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button size="sm" onClick={() => navigate("/upload-data")}
                  className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5">
                  <Upload className="h-4 w-4" /> Step 1: Upload CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/run-detection")}
                  className="border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10">
                  Step 3: Run Detection
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <Card className="bg-gray-800 border-gray-700 mb-4">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-gray-400">
                    Transaction Features
                    {features.length > 0 && (
                      <span className="ml-2 text-xs text-gray-500">({features.length} features from uploaded dataset)</span>
                    )}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {features.length === 0 ? (
                  <p className="text-gray-500 text-sm">Feature fields will appear here once a dataset is uploaded and detection has run.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {features.map((feat) => {
                      const binary = isBinaryFeature(feat);
                      const val = formValues[feat] ?? "";
                      const isSuspicious = binary ? val === "1" : val !== "" && !isNaN(parseFloat(val)) && parseFloat(val) > 100;
                      return (
                        <div key={feat}>
                          <label className="text-xs text-gray-400 block mb-1">
                            {feat}{binary && <span className="ml-1 text-gray-600">(0/1)</span>}
                          </label>
                          <Input type="number" step="any" placeholder="0" value={val}
                            onChange={(e) => handleChange(feat, e.target.value)}
                            className={`text-white text-sm h-8 transition-colors ${
                              isSuspicious ? "bg-red-900/30 border-red-500/50 focus:border-red-400" : "bg-gray-700 border-gray-600"
                            }`} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {features.length > 0 && (
                  <div className="flex gap-2 mt-4 flex-wrap">
                    <Button type="button" variant="outline" size="sm"
                      className="border-gray-600 text-gray-400 hover:text-white text-xs" onClick={handleReset}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Reset to 0
                    </Button>
                    <Button type="button" variant="outline" size="sm"
                      className="border-red-600/50 text-red-400 hover:bg-red-500/10 text-xs"
                      onClick={() => { const vals = {}; features.forEach((f) => { vals[f] = getSuspiciousValue(f); }); setFormValues(vals); setResult(null); }}>
                      Fill with Suspicious Values
                    </Button>
                    <Button type="button" variant="outline" size="sm"
                      className="border-green-600/50 text-green-400 hover:bg-green-500/10 text-xs"
                      onClick={() => { const vals = {}; features.forEach((f) => { vals[f] = getNormalValue(f); }); setFormValues(vals); setResult(null); }}>
                      Fill with Normal Values
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-4 text-sm">
                <AlertCircle className="h-4 w-4" />{error}
              </div>
            )}

            <Button type="submit" disabled={loading || features.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 h-11 text-base flex items-center justify-center gap-2">
              {loading ? (
                <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analysing with AI…</>
              ) : (
                <><Shield className="h-5 w-5" /> Run AI Fraud Check</>
              )}
            </Button>
          </form>

          {/* Results */}
          <AnimatePresence>
            {result && riskConfig && (
              <motion.div ref={resultRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-6 space-y-4">

                {/* Verdict + Gauge */}
                <div className={`rounded-xl border p-5 ${riskConfig.bg}`}>
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    <div className="flex-shrink-0"><FraudGauge probability={result.fraud_probability} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-3">
                          <riskConfig.icon className={`h-9 w-9 ${riskConfig.color} flex-shrink-0`} />
                          <div>
                            <p className={`text-lg font-bold ${riskConfig.color}`}>{riskConfig.label}</p>
                            <p className="text-sm text-gray-400 mt-0.5">
                              Consensus from <span className="text-white">{Object.keys(result.results ?? {}).length}</span> model{Object.keys(result.results ?? {}).length > 1 ? "s" : ""}
                              {result.ensemble_confidence != null && (
                                <span className="ml-2 text-xs text-gray-500">
                                  · <span className={result.ensemble_confidence >= 80 ? "text-green-400" : "text-yellow-400"}>
                                    {result.ensemble_confidence}% confidence
                                  </span>
                                </span>
                              )}
                              {result.models_agreed === false && (
                                <span className="ml-2 text-xs text-yellow-400">· Models disagree</span>
                              )}
                            </p>
                          </div>
                        </div>
                        {resultTime && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {result.processing_time_ms != null && (
                              <span className="text-xs text-gray-600 flex items-center gap-1">
                                <Zap className="h-3 w-3" />{result.processing_time_ms}ms
                              </span>
                            )}
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Clock className="h-3 w-3" />{resultTime}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* AI Insight */}
                      {result.ai_insight && (
                        <div className="mt-3 flex items-start gap-2 bg-gray-900/50 rounded-lg px-3 py-2">
                          <Lightbulb className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-gray-300 leading-relaxed">{result.ai_insight}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Recommended Action */}
                {actionConfig && result.recommended_action && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <div className={`rounded-xl border p-4 flex items-start gap-3 ${actionConfig.bg}`}>
                      <actionConfig.icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${actionConfig.text}`} />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${actionConfig.badge}`}>
                            {actionKey}
                          </span>
                          <span className="text-xs font-semibold text-white">Recommended Action</span>
                        </div>
                        <p className={`text-sm ${actionConfig.text}`}>{result.recommended_action}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Ensemble stats row */}
                {result.suspicious_feature_count != null && (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Suspicious Features", value: result.suspicious_feature_count, color: result.suspicious_feature_count > 3 ? "text-red-400" : "text-yellow-400" },
                      { label: "Models Voted Fraud",  value: `${Object.values(result.results ?? {}).filter(r => r.verdict === "FRAUD").length} / ${Object.keys(result.results ?? {}).length}`, color: "text-blue-400" },
                      { label: "Ensemble Confidence", value: result.ensemble_confidence != null ? `${result.ensemble_confidence}%` : "—", color: result.ensemble_confidence >= 80 ? "text-green-400" : "text-yellow-400" },
                    ].map((stat) => (
                      <Card key={stat.label} className="bg-gray-800 border-gray-700">
                        <CardContent className="pt-3 pb-2">
                          <p className="text-xs text-gray-500">{stat.label}</p>
                          <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Per-model results */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(result.results ?? {}).map(([modelName, modelResult]) => {
                    const isFraud = modelResult.verdict === "FRAUD";
                    const score = modelResult.score ?? null;
                    const scorePercent = score != null ? normalizeScore(score) : null;
                    const prob = modelResult.probability;
                    return (
                      <Card key={modelName} className={`border ${isFraud ? "border-red-500/40 bg-red-500/5" : "border-green-500/40 bg-green-500/5"}`}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            {isFraud ? <XCircle className="h-4 w-4 text-red-400" /> : <CheckCircle className="h-4 w-4 text-green-400" />}
                            <span className={isFraud ? "text-red-400" : "text-green-400"}>{modelName}</span>
                            <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${isFraud ? "bg-red-500/20 text-red-300" : "bg-green-500/20 text-green-300"}`}>
                              {modelResult.verdict}
                            </span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                          {prob != null && (
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-400">Fraud Probability</span>
                              <span className={`font-bold ${isFraud ? "text-red-400" : "text-green-400"}`}>{prob}%</span>
                            </div>
                          )}
                          {scorePercent != null && (
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-400">Anomaly Score</span>
                                <span className="text-white font-mono">{modelResult.score}</span>
                              </div>
                              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${isFraud ? "bg-red-500" : "bg-green-500"}`}
                                  style={{ width: `${scorePercent}%` }} />
                              </div>
                              <div className="flex justify-between text-xs text-gray-600 mt-0.5"><span>Low</span><span>High</span></div>
                            </div>
                          )}
                          {modelResult.reconstruction_error != null && (
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <span className="text-gray-400">Reconstruction Error</span>
                                <span className="text-white font-mono">{modelResult.reconstruction_error}</span>
                              </div>
                              {modelResult.threshold != null && (
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Threshold</span>
                                  <span className={`font-mono ${modelResult.reconstruction_error > modelResult.threshold ? "text-red-400" : "text-green-400"}`}>
                                    {modelResult.threshold}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Feature Risk Analysis */}
                {result.feature_analysis?.length > 0 && (
                  <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-blue-400" />
                        Feature Risk Analysis
                        <span className="text-xs text-gray-500 font-normal ml-1">— deviation from normal patterns</span>
                        {result.suspicious_feature_count > 0 && (
                          <span className="ml-auto text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full">
                            {result.suspicious_feature_count} suspicious
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2.5">
                        {result.feature_analysis.map((feat) => {
                          const barWidth = Math.min(100, Math.round((feat.z_score / 4) * 100));
                          const barColor = feat.suspicious ? "bg-red-500" : feat.z_score > 1 ? "bg-yellow-500" : "bg-green-500";
                          return (
                            <div key={feat.feature}>
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {feat.suspicious
                                    ? <span className="text-red-400 flex-shrink-0">●</span>
                                    : <span className="text-green-500 flex-shrink-0">○</span>}
                                  <span className={`truncate font-medium ${feat.suspicious ? "text-red-300" : "text-gray-400"}`}>
                                    {feat.feature}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                  <span className="text-gray-500 font-mono">val:{feat.value}</span>
                                  <span className="text-gray-500 font-mono">μ:{feat.dataset_mean}</span>
                                  {feat.percentile != null && (
                                    <span className="text-gray-600 font-mono">p{feat.percentile}</span>
                                  )}
                                  <span className={`font-mono font-bold ${feat.suspicious ? "text-red-400" : "text-gray-400"}`}>
                                    z={feat.z_score}σ
                                  </span>
                                </div>
                              </div>
                              <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-600 mt-3">
                        Red ● = matches fraud pattern · σ = standard deviations from dataset mean · p = percentile rank
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* ── Bottom next steps ── */}
                <div className="flex flex-wrap gap-2 p-3 bg-gray-800/80 border border-gray-700 rounded-xl">
                  <span className="text-xs text-gray-500 self-center mr-1 shrink-0">Next step:</span>
                  {[
                    { label: "Batch Check",      path: "/batch-check",      icon: Layers,     color: "bg-green-600 hover:bg-green-700" },
                    { label: "AI Hub",           path: "/ai-hub",           icon: Brain,      color: "bg-cyan-600 hover:bg-cyan-700" },
                    { label: "Feature Insights", path: "/feature-insights", icon: Microscope, color: "bg-orange-600 hover:bg-orange-700" },
                    { label: "Model Comparison", path: "/model-comparison", icon: GitCompare, color: "bg-purple-600 hover:bg-purple-700" },
                  ].map(({ label, path, icon: Icon, color }) => (
                    <button key={path} onClick={() => navigate(path)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all ${color}`}>
                      <Icon className="h-3.5 w-3.5" /> {label} <ArrowRight className="h-3 w-3 opacity-70" />
                    </button>
                  ))}
                  <button onClick={handleReset}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-600 text-gray-400 hover:bg-gray-700 transition-all ml-auto">
                    <RefreshCw className="h-3.5 w-3.5" /> Check Another
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
