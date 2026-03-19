import { useState, useEffect } from "react";
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
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from "recharts";
import {
  ChevronRight, AlertCircle, Target, TrendingUp, Activity,
  Download, Brain, Lightbulb, ShieldAlert, CheckCircle,
  GitCompare, ScanSearch, Layers, Microscope, ArrowRight, RotateCcw,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const MODEL_LABELS = { isolation_forest: "Isolation Forest", autoencoder: "Autoencoder" };
const MODEL_COLORS = { isolation_forest: "#3b82f6", autoencoder: "#a855f7" };

function ConfusionMatrix({ matrix }) {
  if (!matrix || matrix.length < 2)
    return <p className="text-gray-500 text-sm">No labels in dataset (unsupervised mode)</p>;
  const [[tn, fp], [fn, tp]] = matrix;
  const total = tn + fp + fn + tp;
  const cells = [
    { label: "True Negative",  value: tn, color: "bg-green-500/20 border-green-500/40 text-green-400" },
    { label: "False Positive", value: fp, color: "bg-red-500/20 border-red-500/40 text-red-400" },
    { label: "False Negative", value: fn, color: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400" },
    { label: "True Positive",  value: tp, color: "bg-blue-500/20 border-blue-500/40 text-blue-400" },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        {cells.map((c) => (
          <div key={c.label} className={`rounded-lg border p-3 ${c.color}`}>
            <p className="text-xs opacity-70">{c.label}</p>
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-xs opacity-70">{total ? ((c.value / total) * 100).toFixed(1) : 0}%</p>
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-500 text-center">
        <span className="text-gray-400">Predicted: </span>
        <span className="mr-4">← Negative &nbsp;&nbsp; Positive →</span>
        <span className="text-gray-400">Actual: </span>
        <span>↑ Negative &nbsp;&nbsp; Positive ↓</span>
      </div>
    </div>
  );
}

// Risk tier visual bar
function RiskTierBar({ tiers }) {
  if (!tiers) return null;
  const total = (tiers.low ?? 0) + (tiers.medium ?? 0) + (tiers.high ?? 0);
  if (!total) return null;
  const pct = (v) => Math.round((v / total) * 100);
  return (
    <div className="space-y-2">
      {[
        { key: "low",    label: "Low Risk",    color: "bg-green-500",  text: "text-green-400" },
        { key: "medium", label: "Medium Risk", color: "bg-yellow-500", text: "text-yellow-400" },
        { key: "high",   label: "High Risk",   color: "bg-red-500",    text: "text-red-400" },
      ].map(({ key, label, color, text }) => (
        <div key={key}>
          <div className="flex justify-between text-xs mb-1">
            <span className={text}>{label}</span>
            <span className="text-gray-400">{tiers[key] ?? 0} ({pct(tiers[key] ?? 0)}%)</span>
          </div>
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct(tiers[key] ?? 0)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DetectionResults() {
  const [user, setUser] = useState(null);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
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
        if (!Object.keys(data).length) { setError("No results yet. Run detection first."); return; }
        setResults(data);
        setSelected(Object.keys(data)[0]);
      })
      .catch(() => setError("Could not load results. Run detection first."));
  }, []);

  const loadAiSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await axios.get(`${API}/ai-summary`);
      setAiSummary(res.data);
      setShowSummary(true);
    } catch {
      setShowSummary(true);
    } finally {
      setSummaryLoading(false);
    }
  };

  const model = selected && results ? results[selected] : null;

  const exportCSV = () => {
    if (!model) return;
    const rows = [
      ["Metric", "Value"],
      ["Model", MODEL_LABELS[selected] ?? selected],
      ["Fraud Detected", model.fraud_detected],
      ["Total Records", model.total],
      ["Precision", model.precision ?? "N/A"],
      ["Recall", model.recall ?? "N/A"],
      ["F1 Score", model.f1 ?? "N/A"],
      ["AUC-ROC", model.auc ?? "N/A"],
    ];
    if (model.score_distribution) {
      rows.push([], ["Score Bin", "Count"]);
      model.score_distribution.forEach(d => rows.push([d.bin, d.count]));
    }
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fraud_detection_${selected}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rocData = model?.roc_fpr?.map((fpr, i) => ({
    fpr: parseFloat(fpr.toFixed(3)),
    tpr: parseFloat((model.roc_tpr[i] ?? 0).toFixed(3)),
  })) ?? [];
  const diagLine = [{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }];

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-6xl mx-auto">
          <MLWorkflowStepper />

          {/* ── Page title + model tabs + export ── */}
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-bold text-blue-400">
              Detection Results
            </motion.h1>
            <div className="flex gap-2 flex-wrap">
              {results && Object.keys(results).map((k) => (
                <button key={k} onClick={() => setSelected(k)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    selected === k ? "border-blue-500 bg-blue-500/20 text-blue-300" : "border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}>
                  {MODEL_LABELS[k] ?? k}
                </button>
              ))}
              {model && !model.error && (
                <Button onClick={exportCSV} size="sm" variant="outline"
                  className="border-gray-600 text-gray-300 hover:text-white flex items-center gap-1">
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
              )}
            </div>
          </div>

          {/* ── Next Steps bar — always visible at top ── */}
          {results && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap gap-2 mb-6 p-3 bg-gray-800/80 border border-gray-700 rounded-xl">
              <span className="text-xs text-gray-500 self-center mr-1 shrink-0">Next step:</span>
              {[
                { label: "Model Comparison", path: "/model-comparison", icon: GitCompare,   color: "bg-purple-600 hover:bg-purple-700" },
                { label: "Check Transaction", path: "/check-transaction", icon: ScanSearch,  color: "bg-yellow-600 hover:bg-yellow-700" },
                { label: "Batch Check",       path: "/batch-check",       icon: Layers,      color: "bg-green-600 hover:bg-green-700" },
                { label: "AI Hub",            path: "/ai-hub",            icon: Brain,       color: "bg-cyan-600 hover:bg-cyan-700" },
                { label: "Feature Insights",  path: "/feature-insights",  icon: Microscope,  color: "bg-orange-600 hover:bg-orange-700" },
              ].map(({ label, path, icon: Icon, color }) => (
                <button key={path} onClick={() => navigate(path)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all ${color}`}>
                  <Icon className="h-3.5 w-3.5" /> {label} <ArrowRight className="h-3 w-3 opacity-70" />
                </button>
              ))}
            </motion.div>
          )}

          {error && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-5 mb-5">
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-300 font-semibold text-sm">No detection results yet</p>
                  <p className="text-yellow-400/70 text-xs mt-0.5">Upload a CSV dataset and run detection to see results here.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => navigate("/upload-data")} className="bg-blue-600 hover:bg-blue-700 text-xs">Upload CSV</Button>
                <Button size="sm" onClick={() => navigate("/run-detection")} className="bg-green-600 hover:bg-green-700 text-xs">Run Detection</Button>
              </div>
            </div>
          )}

          {model?.error && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 text-yellow-400 text-sm">{model.error}</div>
          )}

          {model && !model.error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              {/* Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: "Fraud Detected", value: model.fraud_detected, icon: Target,    color: "red"    },
                  { label: "Total Records",  value: model.total,          icon: Activity,  color: "blue"   },
                  { label: "Precision", value: model.precision != null ? `${(model.precision*100).toFixed(1)}%` : "—", icon: TrendingUp, color: "green"  },
                  { label: "Recall",    value: model.recall    != null ? `${(model.recall*100).toFixed(1)}%`    : "—", icon: TrendingUp, color: "yellow" },
                  { label: "AUC-ROC",   value: model.auc       != null ? model.auc.toFixed(3) : "—",            icon: TrendingUp, color: "purple" },
                ].map((m) => (
                  <Card key={m.label} className="bg-gray-800 border-gray-700">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex justify-between items-start">
                        <p className="text-xs text-gray-400">{m.label}</p>
                        <m.icon className={`h-3.5 w-3.5 text-${m.color}-400`} />
                      </div>
                      <p className={`text-xl font-bold text-${m.color}-400 mt-1`}>{m.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Risk Tier Breakdown */}
              {model.risk_tiers && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-orange-400 flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4" /> Risk Tier Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <RiskTierBar tiers={model.risk_tiers} />
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Top Anomalous Features */}
              {model.top_anomalous_features?.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                  <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-red-400 flex items-center gap-2">
                        <Target className="h-4 w-4" /> Top Anomalous Features
                        <span className="text-xs text-gray-500 font-normal ml-1">— across all flagged transactions</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {model.top_anomalous_features.map((feat, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-300">{feat.feature}</span>
                            <span className="text-red-400 font-mono">{feat.mean_z_score}σ</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-red-500"
                              style={{ width: `${Math.min(100, feat.mean_z_score * 25)}%` }} />
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-gray-600 mt-1">σ = average standard deviations from normal mean in flagged transactions</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* AI Summary Report */}
              <div>
                {!showSummary ? (
                  <Button onClick={loadAiSummary} disabled={summaryLoading}
                    variant="outline" className="w-full border-blue-500/40 text-blue-400 hover:bg-blue-500/10 flex items-center justify-center gap-2">
                    {summaryLoading
                      ? <><div className="h-4 w-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> Generating AI Report…</>
                      : <><Brain className="h-4 w-4" /> Generate AI Summary Report</>
                    }
                  </Button>
                ) : aiSummary && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="bg-gray-800 border-blue-500/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base text-blue-400 flex items-center gap-2">
                          <Brain className="h-4 w-4" /> AI Summary Report
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Overall assessment */}
                        <div className="bg-gray-700/50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Overall Assessment</p>
                          <p className="text-sm text-gray-200">{aiSummary.overall_ai_assessment}</p>
                        </div>

                        {/* Recommended actions */}
                        {aiSummary.recommended_actions?.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recommended Actions</p>
                            {aiSummary.recommended_actions.map((action, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                                <CheckCircle className="h-3.5 w-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                                {action}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Risk distribution */}
                        {aiSummary.risk_distribution && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Combined Risk Distribution</p>
                            <RiskTierBar tiers={aiSummary.risk_distribution} />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                {/* Confusion Matrix */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-blue-400">Confusion Matrix</CardTitle>
                  </CardHeader>
                  <CardContent><ConfusionMatrix matrix={model.confusion_matrix} /></CardContent>
                </Card>

                {/* ROC Curve */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-green-400">
                      ROC Curve {model.auc != null ? `(AUC = ${model.auc})` : ""}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {rocData.length > 1 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart margin={{ left: 0, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="fpr" type="number" domain={[0, 1]} tickCount={5} stroke="#9ca3af" fontSize={10}
                            label={{ value: "FPR", position: "insideBottom", offset: -2, fill: "#9ca3af", fontSize: 11 }} />
                          <YAxis dataKey="tpr" type="number" domain={[0, 1]} tickCount={5} stroke="#9ca3af" fontSize={10}
                            label={{ value: "TPR", angle: -90, position: "insideLeft", fill: "#9ca3af", fontSize: 11 }} />
                          <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                            formatter={(v) => v.toFixed(3)} />
                          <Line data={diagLine} type="linear" dataKey="tpr" stroke="#6b7280"
                            strokeDasharray="4 4" dot={false} strokeWidth={1} />
                          <Line data={rocData} type="monotone" dataKey="tpr"
                            stroke={MODEL_COLORS[selected] ?? "#3b82f6"} dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-gray-500 text-sm">ROC curve requires a label column in dataset</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Score distribution */}
              {model.score_distribution?.length > 0 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-yellow-400">Anomaly Score Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={model.score_distribution} margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="bin" stroke="#9ca3af" fontSize={10} />
                        <YAxis stroke="#9ca3af" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                          labelStyle={{ color: "#9ca3af" }} itemStyle={{ color: "#fbbf24" }} />
                        <Bar dataKey="count" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      Higher scores = more anomalous. Right tail = likely fraud.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* ── Continue Your Analysis ── */}
              <Card className="bg-gradient-to-br from-blue-900/30 to-purple-900/20 border-blue-500/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-blue-300 flex items-center gap-2">
                    <ChevronRight className="h-4 w-4" /> Continue Your Analysis
                  </CardTitle>
                  <p className="text-xs text-gray-400">Detection complete — choose your next step below.</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      {
                        label: "Model Comparison",
                        desc: "Compare Isolation Forest vs Autoencoder metrics side-by-side.",
                        path: "/model-comparison",
                        color: "border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20",
                        badge: "Recommended next",
                        badgeColor: "bg-purple-500/20 text-purple-300",
                        textColor: "text-purple-300",
                      },
                      {
                        label: "Check Transaction",
                        desc: "Run a single transaction through all models for a live risk score.",
                        path: "/check-transaction",
                        color: "border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20",
                        badge: "Live scoring",
                        badgeColor: "bg-yellow-500/20 text-yellow-300",
                        textColor: "text-yellow-300",
                      },
                      {
                        label: "AI Hub",
                        desc: "Explore fraud clusters, trends, and counterfactual analysis.",
                        path: "/ai-hub",
                        color: "border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20",
                        badge: "AI insights",
                        badgeColor: "bg-cyan-500/20 text-cyan-300",
                        textColor: "text-cyan-300",
                      },
                      {
                        label: "Batch Check",
                        desc: "Check up to 50 transactions at once with risk scoring.",
                        path: "/batch-check",
                        color: "border-green-500/40 bg-green-500/10 hover:bg-green-500/20",
                        badge: "Bulk analysis",
                        badgeColor: "bg-green-500/20 text-green-300",
                        textColor: "text-green-300",
                      },
                      {
                        label: "Feature Insights",
                        desc: "See which features drive fraud and find similar transactions.",
                        path: "/feature-insights",
                        color: "border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20",
                        badge: "Interpretability",
                        badgeColor: "bg-orange-500/20 text-orange-300",
                        textColor: "text-orange-300",
                      },
                      {
                        label: "Run Detection Again",
                        desc: "Try different model settings or a new dataset.",
                        path: "/run-detection",
                        color: "border-gray-600 bg-gray-800 hover:bg-gray-700",
                        badge: null,
                        textColor: "text-gray-300",
                      },
                    ].map((step, i) => (
                      <motion.button
                        key={step.path}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}
                        onClick={() => navigate(step.path)}
                        className={`rounded-xl border p-4 text-left transition-all cursor-pointer ${step.color}`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <p className={`text-sm font-semibold ${step.textColor}`}>{step.label}</p>
                          {step.badge && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${step.badgeColor}`}>
                              {step.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">{step.desc}</p>
                        <div className={`flex items-center gap-1 mt-2 text-xs ${step.textColor} opacity-70`}>
                          Go <ChevronRight className="h-3 w-3" />
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
