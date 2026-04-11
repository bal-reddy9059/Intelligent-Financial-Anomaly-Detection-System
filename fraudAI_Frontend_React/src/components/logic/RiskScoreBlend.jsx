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
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { AlertCircle, Layers, ShieldX, ShieldAlert, ShieldCheck } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const RISK_LEVEL_COLOR = { CRITICAL: "text-red-500", HIGH: "text-red-400", MEDIUM: "text-yellow-400", LOW: "text-green-400" };
const RISK_BG = { CRITICAL: "border-red-500/40 bg-red-500/10", HIGH: "border-red-500/30 bg-red-500/8", MEDIUM: "border-yellow-500/30 bg-yellow-500/8", LOW: "border-green-500/30 bg-green-500/10" };
const ACTION_STYLE = { BLOCK: "bg-red-500/20 text-red-400", REVIEW: "bg-yellow-500/20 text-yellow-400", APPROVE: "bg-green-500/20 text-green-400" };

const DEFAULT_INPUTS = {
  rf_fraud_probability: "0.2",
  velocity_risk: "LOW",
  amount_risk_score: "20",
  ato_risk_score: "15",
  recipient_trust_score: "70",
  spending_deviation: "10",
  geo_risk: "LOW",
  device_risk_score: "30",
};

const DEFAULT_WEIGHTS = {
  rf_model: "0.35", velocity: "0.15", amount: "0.10", ato: "0.15",
  recipient: "0.10", spending: "0.05", geo: "0.05", device: "0.05",
};

export default function RiskScoreBlend() {
  const [user, setUser] = useState(null);
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [customWeights, setCustomWeights] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const run = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const body = {
        rf_fraud_probability: parseFloat(inputs.rf_fraud_probability),
        velocity_risk: inputs.velocity_risk,
        amount_risk_score: parseFloat(inputs.amount_risk_score),
        ato_risk_score: parseFloat(inputs.ato_risk_score),
        recipient_trust_score: parseFloat(inputs.recipient_trust_score),
        spending_deviation: parseFloat(inputs.spending_deviation),
        geo_risk: inputs.geo_risk,
        device_risk_score: parseFloat(inputs.device_risk_score),
      };
      if (customWeights) {
        body.weights = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, parseFloat(v)]));
      }
      const res = await axios.post(`${API}/risk-score-blend`, body);
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed to blend risk scores."); }
    finally { setLoading(false); }
  };

  const riskLevel = result?.risk_level || "LOW";
  const riskConfig = RISK_BG[riskLevel] || RISK_BG.LOW;
  const RiskIcon = riskLevel === "CRITICAL" || riskLevel === "HIGH" ? ShieldX : riskLevel === "MEDIUM" ? ShieldAlert : ShieldCheck;

  const radarData = result?.signal_breakdown?.map(s => ({
    signal: s.signal.replace(/_/g, " ").slice(0, 15),
    score: s.raw_score,
  })) || [];

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
              <Layers className="h-6 w-6" /> Risk Score Blend
            </h1>
            <p className="text-gray-400 text-sm mb-6">Combine multiple risk signals into a single composite fraud score.</p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inputs */}
            <div className="space-y-4">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-300">Risk Signal Inputs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* RF probability */}
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">RF Fraud Probability (0–1)</label>
                    <Input type="number" step="0.01" min="0" max="1" value={inputs.rf_fraud_probability}
                      onChange={e => setInputs(i => ({ ...i, rf_fraud_probability: e.target.value }))}
                      className="bg-gray-700 border-gray-600 text-white text-sm" />
                  </div>

                  {/* Score fields */}
                  {[
                    { key: "amount_risk_score", label: "Amount Risk Score (0–100)" },
                    { key: "ato_risk_score", label: "ATO Risk Score (0–100)" },
                    { key: "device_risk_score", label: "Device Risk Score (0–100)" },
                    { key: "spending_deviation", label: "Spending Deviation (0–100)" },
                    { key: "recipient_trust_score", label: "Recipient Trust Score (0–100, higher=safer)" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs text-gray-400 block mb-1">{label}</label>
                      <Input type="number" step="1" min="0" max="100" value={inputs[key]}
                        onChange={e => setInputs(i => ({ ...i, [key]: e.target.value }))}
                        className="bg-gray-700 border-gray-600 text-white text-sm" />
                    </div>
                  ))}

                  {/* Categorical selects */}
                  {[
                    { key: "velocity_risk", label: "Velocity Risk", opts: ["LOW", "MEDIUM", "HIGH"] },
                    { key: "geo_risk", label: "Geo Risk", opts: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
                  ].map(({ key, label, opts }) => (
                    <div key={key}>
                      <label className="text-xs text-gray-400 block mb-1">{label}</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {opts.map(o => (
                          <button key={o} onClick={() => setInputs(i => ({ ...i, [key]: o }))}
                            className={`text-xs px-3 py-1 rounded-full border transition-colors ${inputs[key] === o ? "bg-blue-600 border-blue-500 text-white" : "border-gray-600 text-gray-400"}`}>
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Custom weights */}
              <Card className="bg-gray-800 border-gray-700">
                <button className="w-full flex items-center justify-between p-4 text-sm text-gray-300 hover:text-white"
                  onClick={() => setCustomWeights(v => !v)}>
                  <span>Custom Weights (optional)</span>
                  <span className="text-xs text-gray-500">{customWeights ? "Using custom" : "Using defaults"}</span>
                </button>
                {customWeights && (
                  <CardContent className="pt-0 pb-4">
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(weights).map(([k, v]) => (
                        <div key={k}>
                          <label className="text-xs text-gray-500 block mb-0.5">{k.replace(/_/g, " ")}</label>
                          <Input type="number" step="0.01" min="0" max="1" value={v}
                            onChange={e => setWeights(w => ({ ...w, [k]: e.target.value }))}
                            className="bg-gray-700 border-gray-600 text-white text-xs h-7 px-2" />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Weights should sum to 1.0</p>
                  </CardContent>
                )}
              </Card>

              {error && (
                <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
                </div>
              )}

              <Button onClick={run} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
                {loading ? "Blending…" : "Compute Composite Risk Score"}
              </Button>
            </div>

            {/* Results */}
            <div className="space-y-4">
              {!result && !loading && (
                <Card className="bg-gray-800/50 border-gray-700 border-dashed">
                  <CardContent className="pt-16 pb-16 text-center">
                    <Layers className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">Set risk signals and click Compute.</p>
                  </CardContent>
                </Card>
              )}

              {result && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  {/* Composite score */}
                  <div className={`rounded-xl border p-5 ${riskConfig}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <RiskIcon className={`h-7 w-7 ${RISK_LEVEL_COLOR[riskLevel]}`} />
                        <div>
                          <p className={`font-bold text-xl ${RISK_LEVEL_COLOR[riskLevel]}`}>
                            {result.composite_risk_score?.toFixed(1)} / 100
                          </p>
                          <p className="text-xs text-gray-400">{riskLevel} RISK</p>
                        </div>
                      </div>
                      <span className={`text-sm font-bold px-3 py-1 rounded-full ${ACTION_STYLE[result.recommended_action]}`}>
                        {result.recommended_action}
                      </span>
                    </div>
                    {result.hard_overrides_applied && (
                      <p className="text-xs text-yellow-400">⚠ Hard override applied (critical signal detected)</p>
                    )}
                  </div>

                  {/* Radar chart */}
                  {radarData.length > 2 && (
                    <Card className="bg-gray-800 border-gray-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-purple-400">Signal Radar</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                          <RadarChart data={radarData}>
                            <PolarGrid stroke="#374151" />
                            <PolarAngleAxis dataKey="signal" stroke="#9ca3af" fontSize={9} />
                            <PolarRadiusAxis domain={[0, 100]} tick={false} />
                            <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
                            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                              formatter={(v) => [`${v.toFixed(1)}`, "Score"]} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Signal breakdown */}
                  {result.signal_breakdown?.length > 0 && (
                    <Card className="bg-gray-800 border-gray-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-gray-300">Signal Breakdown</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {result.signal_breakdown.sort((a, b) => b.weighted_contribution - a.weighted_contribution).map((s, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-32 truncate">{s.signal.replace(/_/g, " ")}</span>
                              <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${s.level === "HIGH" ? "bg-red-500" : s.level === "MEDIUM" ? "bg-yellow-500" : "bg-green-500"}`}
                                  style={{ width: `${Math.min(100, s.raw_score)}%` }} />
                              </div>
                              <span className="text-xs text-gray-400 w-16 text-right font-mono">
                                +{s.weighted_contribution?.toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Top signals */}
                  {result.top_contributing_signals?.length > 0 && (
                    <Card className="bg-gray-800 border-gray-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-yellow-400">Top Contributing Signals</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {result.top_contributing_signals.map((s, i) => (
                            <span key={i} className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-1 rounded-full">
                              {s.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* AI Summary */}
                  {result.ai_summary && (
                    <Card className="bg-blue-500/5 border-blue-500/20">
                      <CardContent className="pt-4">
                        <p className="text-xs text-gray-300 leading-relaxed">{result.ai_summary}</p>
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
