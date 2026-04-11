import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import { AlertCircle, RefreshCw, Brain, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const URGENCY_CONFIG = {
  IMMEDIATE: { color: "text-red-400", bg: "border-red-500/40 bg-red-500/10", icon: XCircle, label: "Retrain IMMEDIATELY" },
  RECOMMENDED: { color: "text-orange-400", bg: "border-orange-500/40 bg-orange-500/10", icon: AlertTriangle, label: "Retraining Recommended" },
  OPTIONAL: { color: "text-yellow-400", bg: "border-yellow-500/40 bg-yellow-500/10", icon: AlertCircle, label: "Optional Retraining" },
  NOT_NEEDED: { color: "text-green-400", bg: "border-green-500/40 bg-green-500/10", icon: CheckCircle, label: "No Retraining Needed" },
};
const SEV_COLOR = { CRITICAL: "text-red-400 bg-red-500/10 border-red-500/20", HIGH: "text-orange-400 bg-orange-500/10 border-orange-500/20", MEDIUM: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", LOW: "text-green-400 bg-green-500/10 border-green-500/20" };

export default function RetrainingReadiness() {
  const [user, setUser] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showOverrides, setShowOverrides] = useState(false);
  const [overrides, setOverrides] = useState({
    override_feedback_accuracy: "",
    override_dataset_psi: "",
    override_false_positive_rate: "",
    override_false_negative_rate: "",
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const run = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const body = {};
      Object.entries(overrides).forEach(([k, v]) => { if (v !== "") body[k] = parseFloat(v); });
      const res = await axios.post(`${API}/retraining-readiness`, body);
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed to assess retraining readiness."); }
    finally { setLoading(false); }
  };

  const urgencyConfig = URGENCY_CONFIG[result?.retraining_urgency] || URGENCY_CONFIG.NOT_NEEDED;
  const UrgencyIcon = urgencyConfig.icon;

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl font-bold text-blue-400 mb-1 flex items-center gap-2">
              <RefreshCw className="h-6 w-6" /> Retraining Readiness
            </h1>
            <p className="text-gray-400 text-sm mb-6">Assess whether your fraud detection model needs to be retrained.</p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: controls */}
            <div className="space-y-4">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                    <Brain className="h-4 w-4 text-blue-400" /> Auto-Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-gray-400">
                    The system will automatically evaluate: feedback accuracy, false positive/negative rates,
                    dataset drift (PSI), score history trends, and days since last detection.
                  </p>

                  {/* Override toggles */}
                  <button onClick={() => setShowOverrides(v => !v)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                    {showOverrides ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Override signals (optional)
                  </button>

                  {showOverrides && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                      {[
                        { key: "override_feedback_accuracy", label: "Feedback Accuracy (0-1)" },
                        { key: "override_dataset_psi", label: "Dataset PSI" },
                        { key: "override_false_positive_rate", label: "False Positive Rate (0-1)" },
                        { key: "override_false_negative_rate", label: "False Negative Rate (0-1)" },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label className="text-xs text-gray-400 block mb-1">{label}</label>
                          <Input type="number" step="0.01" min="0" max="1" value={overrides[key]}
                            onChange={(e) => setOverrides(o => ({ ...o, [key]: e.target.value }))}
                            placeholder="leave empty for auto"
                            className="bg-gray-700 border-gray-600 text-white text-sm" />
                        </div>
                      ))}
                    </motion.div>
                  )}

                  {error && (
                    <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded p-2 text-xs">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
                    </div>
                  )}

                  <Button onClick={run} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
                    {loading ? (
                      <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Assessing…</span>
                    ) : "Assess Retraining Readiness"}
                  </Button>
                </CardContent>
              </Card>

              {/* Signals evaluated */}
              {result?.signals_evaluated && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-300">Signals Evaluated</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(result.signals_evaluated).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400 text-xs">{k.replace(/_/g, " ")}</span>
                          <span className="text-white font-mono text-xs">
                            {v == null ? "N/A" : typeof v === "number" ? (v % 1 === 0 ? v : v.toFixed(4)) : v}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right: results */}
            <div className="space-y-4">
              {!result && !loading && (
                <Card className="bg-gray-800/50 border-gray-700 border-dashed">
                  <CardContent className="pt-16 pb-16 text-center">
                    <RefreshCw className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">Click Assess to evaluate your model&apos;s retraining needs.</p>
                  </CardContent>
                </Card>
              )}

              {result && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  {/* Urgency banner */}
                  <div className={`flex items-center gap-4 rounded-xl border p-5 ${urgencyConfig.bg}`}>
                    <UrgencyIcon className={`h-8 w-8 flex-shrink-0 ${urgencyConfig.color}`} />
                    <div>
                      <p className={`font-bold text-lg ${urgencyConfig.color}`}>{urgencyConfig.label}</p>
                      <p className="text-xs text-gray-400">
                        Readiness Score: {result.readiness_score}/100 · {result.issue_count} issue{result.issue_count !== 1 ? "s" : ""} detected
                      </p>
                    </div>
                  </div>

                  {/* Readiness progress */}
                  <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-400">Readiness Score</span>
                        <span className={urgencyConfig.color}>{result.readiness_score}/100</span>
                      </div>
                      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          result.readiness_score >= 75 ? "bg-green-500" :
                          result.readiness_score >= 50 ? "bg-yellow-500" : "bg-red-500"
                        }`} style={{ width: `${result.readiness_score}%` }} />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Issues */}
                  {result.issues_detected?.length > 0 && (
                    <Card className="bg-gray-800 border-gray-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-yellow-400">Issues Detected</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {result.issues_detected.map((issue, i) => (
                          <div key={i} className={`text-xs rounded-lg border p-3 ${SEV_COLOR[issue.severity] || "bg-gray-700 border-gray-600 text-gray-300"}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">{issue.signal}</span>
                              <span className="text-xs opacity-70">{issue.severity}</span>
                            </div>
                            <p className="opacity-80">{issue.detail}</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Recommended steps */}
                  {result.recommended_steps?.length > 0 && (
                    <Card className="bg-gray-800 border-gray-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-green-400">Recommended Steps</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {result.recommended_steps.map((step, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                              <span className="text-green-400 mt-0.5 flex-shrink-0">{i + 1}.</span>{step}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {/* AI Summary */}
                  {result.ai_summary && (
                    <Card className="bg-blue-500/5 border-blue-500/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-blue-400">AI Insight</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-300 leading-relaxed">{result.ai_summary}</p>
                      </CardContent>
                    </Card>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
