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
import { AlertCircle, CheckCircle2, MessageSquare, BarChart2, RefreshCw, XCircle } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function FeedbackCenter() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");

  // Feedback form state
  const [form, setForm] = useState({
    transaction_id: "",
    model_verdict: "FRAUD",
    human_label: "LEGITIMATE",
    analyst_id: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const fetchStats = () => {
    setStatsLoading(true);
    axios.get(`${API}/feedback-stats`)
      .then((res) => { setStats(res.data); setStatsError(""); })
      .catch((e) => setStatsError(e.response?.data?.error || "Could not load feedback stats."))
      .finally(() => setStatsLoading(false));
  };

  useEffect(() => { fetchStats(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.transaction_id.trim()) { setSubmitError("Transaction ID is required."); return; }
    setSubmitting(true);
    setSubmitError("");
    setSubmitResult(null);
    try {
      const res = await axios.post(`${API}/feedback`, form);
      setSubmitResult(res.data);
      setForm(f => ({ ...f, transaction_id: "", notes: "" }));
      fetchStats();
    } catch (e) {
      setSubmitError(e.response?.data?.error || "Failed to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasStats = stats && stats.total_feedback > 0;

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
              <MessageSquare className="h-6 w-6" /> Feedback Center
            </h1>
            <p className="text-gray-400 text-sm mb-6">Submit human corrections to improve model accuracy.</p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Submit Feedback Form */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-blue-400 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Submit Correction
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Transaction ID *</label>
                    <Input value={form.transaction_id} onChange={(e) => setForm(f => ({ ...f, transaction_id: e.target.value }))}
                      placeholder="e.g. txn_abc123" className="bg-gray-700 border-gray-600 text-white text-sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Model Said</label>
                      <div className="flex gap-2">
                        {["FRAUD", "LEGITIMATE"].map((v) => (
                          <button key={v} type="button" onClick={() => setForm(f => ({ ...f, model_verdict: v }))}
                            className={`flex-1 text-xs py-1.5 rounded border transition-colors ${
                              form.model_verdict === v
                                ? v === "FRAUD" ? "bg-red-600 border-red-500 text-white" : "bg-green-600 border-green-500 text-white"
                                : "border-gray-600 text-gray-400 hover:border-gray-400"
                            }`}>{v}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Correct Label</label>
                      <div className="flex gap-2">
                        {["FRAUD", "LEGITIMATE"].map((v) => (
                          <button key={v} type="button" onClick={() => setForm(f => ({ ...f, human_label: v }))}
                            className={`flex-1 text-xs py-1.5 rounded border transition-colors ${
                              form.human_label === v
                                ? v === "FRAUD" ? "bg-red-600 border-red-500 text-white" : "bg-green-600 border-green-500 text-white"
                                : "border-gray-600 text-gray-400 hover:border-gray-400"
                            }`}>{v}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Analyst ID (optional)</label>
                    <Input value={form.analyst_id} onChange={(e) => setForm(f => ({ ...f, analyst_id: e.target.value }))}
                      placeholder="Your analyst ID" className="bg-gray-700 border-gray-600 text-white text-sm" />
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Notes (optional)</label>
                    <textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Why is the model wrong? Add context…"
                      className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-md p-2 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  {submitError && (
                    <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded p-2 text-sm">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" /> {submitError}
                    </div>
                  )}

                  {submitResult && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className={`rounded-lg border p-3 text-sm ${
                        submitResult.is_correct_prediction
                          ? "bg-green-500/10 border-green-500/30"
                          : "bg-yellow-500/10 border-yellow-500/30"
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {submitResult.is_correct_prediction
                          ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                          : <XCircle className="h-4 w-4 text-yellow-400" />}
                        <span className={submitResult.is_correct_prediction ? "text-green-400" : "text-yellow-400"}>
                          {submitResult.is_correct_prediction ? "Prediction was correct" : `Correction recorded: ${submitResult.correction_type?.replace("_", " ")}`}
                        </span>
                      </div>
                      <p className="text-gray-400 text-xs">{submitResult.message}</p>
                      <p className="text-gray-500 text-xs mt-1">Total feedback entries: {submitResult.total_feedback_entries}</p>
                    </motion.div>
                  )}

                  <Button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700">
                    {submitting ? (
                      <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Submitting…</span>
                    ) : "Submit Feedback"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Feedback Stats */}
            <div className="space-y-4">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-green-400 flex items-center justify-between">
                    <span className="flex items-center gap-2"><BarChart2 className="h-4 w-4" /> Feedback Analytics</span>
                    <button onClick={fetchStats} className="text-gray-400 hover:text-white">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {statsLoading && <p className="text-gray-500 text-sm py-4 text-center animate-pulse">Loading stats…</p>}
                  {statsError && <p className="text-red-400 text-sm">{statsError}</p>}
                  {stats && !hasStats && (
                    <p className="text-gray-500 text-sm text-center py-4">No feedback submitted yet. Use the form to start.</p>
                  )}
                  {hasStats && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Total Feedback", value: stats.total_feedback, color: "text-blue-400" },
                          { label: "Model Accuracy", value: `${(stats.model_accuracy_from_feedback * 100).toFixed(1)}%`, color: "text-green-400" },
                          { label: "False Positives", value: stats.false_positives, color: "text-yellow-400" },
                          { label: "False Negatives", value: stats.false_negatives, color: "text-red-400" },
                        ].map((s) => (
                          <div key={s.label} className="bg-gray-700/50 rounded-lg p-3">
                            <p className="text-xs text-gray-400">{s.label}</p>
                            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* FP / FN rates */}
                      <div className="space-y-2">
                        {[
                          { label: "False Positive Rate", value: stats.false_positive_rate, color: "bg-yellow-500" },
                          { label: "False Negative Rate", value: stats.false_negative_rate, color: "bg-red-500" },
                        ].map((r) => (
                          <div key={r.label}>
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                              <span>{r.label}</span>
                              <span>{(r.value * 100).toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-700 rounded-full">
                              <div className={`h-full rounded-full ${r.color}`} style={{ width: `${Math.min(100, r.value * 100)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* AI Insight */}
                      {stats.ai_insight && (
                        <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-700 pt-3">{stats.ai_insight}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent corrections */}
              {hasStats && stats.recent_corrections?.length > 0 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-300">Recent Corrections</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {stats.recent_corrections.slice(0, 5).map((c, i) => (
                      <div key={i} className="text-xs border-b border-gray-700/50 pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-300 font-mono">{c.transaction_id}</span>
                          <span className={c.is_correct ? "text-green-400" : "text-red-400"}>
                            {c.is_correct ? "Correct" : c.correction_type?.replace("_", " ")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500 mt-0.5">
                          <span>Model: {c.model_verdict}</span>
                          <span>→</span>
                          <span>Human: {c.human_label}</span>
                        </div>
                        {c.notes && <p className="text-gray-600 italic mt-0.5">{c.notes}</p>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
