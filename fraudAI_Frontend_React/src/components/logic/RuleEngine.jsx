import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import { AlertCircle, Plus, Trash2, Play, Shield, ChevronDown, ChevronUp } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const RF_FEATURES = [
  "Transaction Amount", "Transaction Frequency", "Recipient Blacklist Status",
  "Device Fingerprinting", "VPN or Proxy Usage", "Behavioral Biometrics",
  "Time Since Last Transaction", "Social Trust Score", "Account Age",
  "High-Risk Transaction Times", "Past Fraudulent Behavior Flags",
  "Location-Inconsistent Transactions", "Normalized Transaction Amount",
  "Transaction Context Anomalies", "Fraud Complaints Count",
  "Merchant Category Mismatch", "User Daily Limit Exceeded",
  "Recent High-Value Transaction Flags",
];

const OPS = ["gt", "lt", "gte", "lte", "eq", "neq"];
const OP_LABELS = { gt: ">", lt: "<", gte: "≥", lte: "≤", eq: "=", neq: "≠" };
const ACTION_STYLE = { BLOCK: "bg-red-500/20 text-red-400", REVIEW: "bg-yellow-500/20 text-yellow-400", APPROVE: "bg-green-500/20 text-green-400" };

const DEFAULT_FEATURES = {
  "Transaction Amount": 5000,
  "Transaction Frequency": 3,
  "Recipient Blacklist Status": 0,
  "Device Fingerprinting": 0,
  "VPN or Proxy Usage": 0,
  "Behavioral Biometrics": 0.5,
  "Past Fraudulent Behavior Flags": 0,
  "Fraud Complaints Count": 0,
};

function newCheck() {
  return { feature: RF_FEATURES[0], op: "gt", value: "0" };
}

function newRule() {
  return {
    id: Date.now(),
    name: "New Rule",
    condition: "AND",
    checks: [newCheck()],
    action: "REVIEW",
    severity: "MEDIUM",
  };
}

export default function RuleEngine() {
  const [user, setUser] = useState(null);
  const [rules, setRules] = useState([newRule()]);
  const [features, setFeatures] = useState(
    Object.fromEntries(RF_FEATURES.map((f) => [f, DEFAULT_FEATURES[f] ?? 0]))
  );
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFeatures, setShowFeatures] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const addRule = () => setRules((rs) => [...rs, newRule()]);
  const removeRule = (id) => setRules((rs) => rs.filter((r) => r.id !== id));

  const updateRule = (id, field, val) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: val } : r)));

  const addCheck = (id) =>
    setRules((rs) => rs.map((r) => r.id === id ? { ...r, checks: [...r.checks, newCheck()] } : r));

  const removeCheck = (id, ci) =>
    setRules((rs) => rs.map((r) => r.id === id ? { ...r, checks: r.checks.filter((_, i) => i !== ci) } : r));

  const updateCheck = (id, ci, field, val) =>
    setRules((rs) => rs.map((r) => r.id === id
      ? { ...r, checks: r.checks.map((c, i) => i === ci ? { ...c, [field]: val } : c) }
      : r));

  const run = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const payload = {
        features,
        // eslint-disable-next-line no-unused-vars
        rules: rules.map(({ id: _id, ...r }) => ({
          ...r,
          checks: r.checks.map((c) => ({ ...c, value: parseFloat(c.value) || 0 })),
        })),
      };
      const res = await axios.post(`${API}/rule-engine`, payload);
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed to run rule engine."); }
    finally { setLoading(false); }
  };

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
              <Shield className="h-6 w-6" /> Rule Engine
            </h1>
            <p className="text-gray-400 text-sm mb-6">Define custom fraud detection rules and evaluate them against feature values.</p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: rules builder */}
            <div className="lg:col-span-2 space-y-4">
              {/* Feature values toggle */}
              <Card className="bg-gray-800 border-gray-700">
                <button className="w-full flex items-center justify-between p-4 text-sm text-gray-300 hover:text-white"
                  onClick={() => setShowFeatures(f => !f)}>
                  <span className="font-medium">Transaction Feature Values</span>
                  {showFeatures ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <AnimatePresence>
                  {showFeatures && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                      <CardContent className="pt-0 pb-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {RF_FEATURES.map((f) => (
                            <div key={f}>
                              <label className="text-xs text-gray-500 block mb-0.5 truncate">{f}</label>
                              <Input type="number" value={features[f]} step="any"
                                onChange={(e) => setFeatures((fv) => ({ ...fv, [f]: parseFloat(e.target.value) || 0 }))}
                                className="bg-gray-700 border-gray-600 text-white text-xs h-7 px-2" />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>

              {/* Rules */}
              {rules.map((rule) => (
                <Card key={rule.id} className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Input value={rule.name}
                        onChange={(e) => updateRule(rule.id, "name", e.target.value)}
                        className="bg-gray-700 border-gray-600 text-white text-sm font-medium flex-1 h-7 px-2" />
                      <div className="flex gap-1">
                        {["AND", "OR"].map((c) => (
                          <button key={c} onClick={() => updateRule(rule.id, "condition", c)}
                            className={`text-xs px-2 py-1 rounded border transition-colors ${rule.condition === c ? "bg-blue-600 border-blue-500 text-white" : "border-gray-600 text-gray-400"}`}>
                            {c}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => removeRule(rule.id)} className="text-red-400 hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {rule.checks.map((ch, ci) => (
                      <div key={ci} className="flex items-center gap-1.5">
                        <select value={ch.feature} onChange={(e) => updateCheck(rule.id, ci, "feature", e.target.value)}
                          className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs rounded px-1.5 py-1">
                          {RF_FEATURES.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                        <select value={ch.op} onChange={(e) => updateCheck(rule.id, ci, "op", e.target.value)}
                          className="w-12 bg-gray-700 border border-gray-600 text-white text-xs rounded px-1 py-1 text-center">
                          {OPS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
                        </select>
                        <Input type="number" value={ch.value}
                          onChange={(e) => updateCheck(rule.id, ci, "value", e.target.value)}
                          className="w-20 bg-gray-700 border-gray-600 text-white text-xs h-7 px-2" />
                        <button onClick={() => removeCheck(rule.id, ci)} disabled={rule.checks.length <= 1}
                          className="text-gray-500 hover:text-red-400 disabled:opacity-30">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => addCheck(rule.id)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                        <Plus className="h-3.5 w-3.5" /> Add check
                      </button>
                      <div className="ml-auto flex gap-1.5">
                        {["LOW", "MEDIUM", "HIGH"].map((s) => (
                          <button key={s} onClick={() => updateRule(rule.id, "severity", s)}
                            className={`text-xs px-2 py-0.5 rounded border transition-colors ${rule.severity === s ? (s === "HIGH" ? "bg-red-600 border-red-500 text-white" : s === "MEDIUM" ? "bg-yellow-600 border-yellow-500 text-white" : "bg-green-600 border-green-500 text-white") : "border-gray-600 text-gray-400"}`}>
                            {s}
                          </button>
                        ))}
                        {["BLOCK", "REVIEW", "APPROVE"].map((a) => (
                          <button key={a} onClick={() => updateRule(rule.id, "action", a)}
                            className={`text-xs px-2 py-0.5 rounded border transition-colors ${rule.action === a ? (a === "BLOCK" ? "bg-red-600 border-red-500 text-white" : a === "REVIEW" ? "bg-yellow-600 border-yellow-500 text-white" : "bg-green-600 border-green-500 text-white") : "border-gray-600 text-gray-400"}`}>
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <div className="flex gap-3">
                <Button onClick={addRule} variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-700">
                  <Plus className="h-4 w-4 mr-1" /> Add Rule
                </Button>
                <Button onClick={run} disabled={loading} className="bg-blue-600 hover:bg-blue-700 flex-1">
                  <Play className="h-4 w-4 mr-1" /> {loading ? "Running…" : `Run Rule Engine (${rules.length} rule${rules.length !== 1 ? "s" : ""})`}
                </Button>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
                </div>
              )}
            </div>

            {/* Right: results */}
            <div className="space-y-4">
              {!result && (
                <Card className="bg-gray-800/50 border-gray-700 border-dashed">
                  <CardContent className="pt-10 pb-10 text-center">
                    <Shield className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">Build rules and click Run to see results.</p>
                  </CardContent>
                </Card>
              )}

              {result && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <Card className={`border ${
                    result.final_action === "BLOCK" ? "border-red-500/30 bg-red-500/10" :
                    result.final_action === "REVIEW" ? "border-yellow-500/30 bg-yellow-500/10" :
                    "border-green-500/30 bg-green-500/10"
                  }`}>
                    <CardContent className="pt-4">
                      <p className="text-xs text-gray-400 mb-1">Final Decision</p>
                      <p className={`text-2xl font-bold ${ACTION_STYLE[result.final_action]?.split(" ")[1]}`}>
                        {result.final_action}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {result.triggered_count}/{result.rules_evaluated} rules triggered · {result.final_severity} severity
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Source: {result.decision_source}</p>
                    </CardContent>
                  </Card>

                  {result.triggered_rules?.length > 0 && (
                    <Card className="bg-gray-800 border-gray-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-yellow-400">Triggered Rules</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {result.triggered_rules.map((r, i) => (
                          <div key={i} className="text-xs bg-gray-700/50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-white">{r.rule}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs ${ACTION_STYLE[r.action]}`}>{r.action}</span>
                            </div>
                            <p className="text-gray-400">{r.checks_passed}/{r.checks_total} checks passed ({r.condition})</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {result.ml_verdict && (
                    <Card className="bg-gray-800 border-gray-700">
                      <CardContent className="pt-4">
                        <p className="text-xs text-gray-400 mb-1">ML Cross-check</p>
                        <p className={`font-bold ${result.ml_verdict === "FRAUD" ? "text-red-400" : "text-green-400"}`}>
                          {result.ml_verdict} ({(result.ml_fraud_probability * 100).toFixed(1)}%)
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {result.summary && (
                    <Card className="bg-blue-500/5 border-blue-500/20">
                      <CardContent className="pt-4">
                        <p className="text-xs text-gray-400 leading-relaxed">{result.summary}</p>
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
