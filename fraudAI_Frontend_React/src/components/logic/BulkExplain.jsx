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
import { AlertCircle, Plus, Trash2, Brain, ShieldX, ShieldCheck, ChevronDown, ChevronUp, Download } from "lucide-react";

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

const DEFAULT_VALS = {
  "Transaction Amount": 500, "Transaction Frequency": 3, "Recipient Blacklist Status": 0,
  "Device Fingerprinting": 0, "VPN or Proxy Usage": 0, "Behavioral Biometrics": 0.3,
  "Time Since Last Transaction": 12, "Social Trust Score": 15, "Account Age": 2,
  "High-Risk Transaction Times": 0, "Past Fraudulent Behavior Flags": 0,
  "Location-Inconsistent Transactions": 0, "Normalized Transaction Amount": 0.4,
  "Transaction Context Anomalies": 0.2, "Fraud Complaints Count": 0,
  "Merchant Category Mismatch": 0, "User Daily Limit Exceeded": 0,
  "Recent High-Value Transaction Flags": 0,
};

const RISK_COLOR = { HIGH: "text-red-400", MEDIUM: "text-yellow-400", LOW: "text-green-400" };
const RISK_BG = { HIGH: "border-red-500/30 bg-red-500/8", MEDIUM: "border-yellow-500/30 bg-yellow-500/8", LOW: "border-green-500/30 bg-green-500/8" };

function newRow() {
  return { id: Date.now() + Math.random(), txn_id: "", features: { ...DEFAULT_VALS } };
}

function ExplanationCard({ exp, idx }) {
  const [open, setOpen] = useState(false);
  const VIcon = exp.verdict === "FRAUD" ? ShieldX : ShieldCheck;
  const riskColor = RISK_COLOR[exp.risk_level] || "text-gray-400";

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
      className={`rounded-xl border p-4 ${RISK_BG[exp.risk_level] || "bg-gray-800 border-gray-700"}`}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <VIcon className={`h-5 w-5 flex-shrink-0 ${exp.verdict === "FRAUD" ? "text-red-400" : "text-green-400"}`} />
          <div>
            <p className="text-sm font-semibold text-white">{exp.id}</p>
            <p className={`text-xs ${riskColor}`}>{exp.verdict} · {exp.fraud_probability}% · {exp.risk_level}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{exp.suspicious_feature_count} suspicious features</span>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>

      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
          className="mt-3 pt-3 border-t border-gray-700/60 space-y-2">
          {exp.ai_insight && <p className="text-xs text-gray-400 italic">{exp.ai_insight}</p>}
          {exp.top_suspicious_features?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {exp.top_suspicious_features.map((f, i) => (
                <span key={i} className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">{f}</span>
              ))}
            </div>
          )}
          {exp.feature_analysis?.filter(f => f.suspicious).map((f, i) => (
            <div key={i} className="text-xs bg-gray-700/50 rounded p-2">
              <span className="text-yellow-400 font-medium">{f.feature}: </span>
              <span className="text-white font-mono">{f.value?.toFixed(3)}</span>
              <span className="text-gray-400"> (p{f.percentile?.toFixed(0)}): </span>
              <span className="text-gray-300">{f.reason}</span>
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

export default function BulkExplain() {
  const [user, setUser] = useState(null);
  const [rows, setRows] = useState([newRow(), newRow()]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const addRow = () => setRows(rs => [...rs, newRow()]);
  const removeRow = (id) => setRows(rs => rs.filter(r => r.id !== id));
  const updateTxnId = (id, val) => setRows(rs => rs.map(r => r.id === id ? { ...r, txn_id: val } : r));
  const updateFeature = (id, feat, val) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, features: { ...r.features, [feat]: parseFloat(val) || 0 } } : r));

  const submit = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const transactions = rows.map((r) => ({
        id: r.txn_id || `txn_${r.id}`,
        features: r.features,
      }));
      const res = await axios.post(`${API}/bulk-explain`, { transactions });
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed to run bulk explain."); }
    finally { setLoading(false); }
  };

  const exportCSV = () => {
    if (!result?.explanations) return;
    const headers = ["ID", "Verdict", "Fraud Probability", "Risk Level", "Suspicious Features"];
    const csvRows = result.explanations.map(e => [
      e.id, e.verdict, `${e.fraud_probability}%`, e.risk_level, e.top_suspicious_features?.join("|"),
    ]);
    const csv = [headers, ...csvRows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "bulk_explain.csv"; a.click();
    URL.revokeObjectURL(url);
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
              <Brain className="h-6 w-6" /> Bulk Explain
            </h1>
            <p className="text-gray-400 text-sm mb-6">Explain multiple transactions at once with AI-powered feature analysis.</p>
          </motion.div>

          {/* Input rows */}
          <Card className="bg-gray-800 border-gray-700 mb-5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-300">Transactions to Explain ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.map((row, ri) => (
                <div key={row.id} className="border border-gray-700 rounded-lg overflow-hidden">
                  <button className="w-full flex items-center justify-between p-3 bg-gray-700/40 hover:bg-gray-700/60 text-left"
                    onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">#{ri + 1}</span>
                      <Input value={row.txn_id}
                        onChange={(e) => { e.stopPropagation(); updateTxnId(row.id, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={`txn_${ri + 1}`}
                        className="bg-gray-700 border-gray-600 text-white text-xs h-6 px-2 w-32" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); removeRow(row.id); }}
                        disabled={rows.length <= 1} className="text-gray-500 hover:text-red-400 disabled:opacity-30">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      {expandedRow === row.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </button>
                  {expandedRow === row.id && (
                    <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {RF_FEATURES.map((f) => (
                        <div key={f}>
                          <label className="text-xs text-gray-500 block mb-0.5 truncate">{f}</label>
                          <Input type="number" value={row.features[f]} step="any"
                            onChange={(e) => updateFeature(row.id, f, e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white text-xs h-6 px-2" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <Button onClick={addRow} variant="outline" size="sm"
                  className="border-gray-600 text-gray-300 hover:bg-gray-700" disabled={rows.length >= 50}>
                  <Plus className="h-4 w-4 mr-1" /> Add Transaction
                </Button>
                <Button onClick={submit} disabled={loading} className="bg-blue-600 hover:bg-blue-700 flex-1">
                  <Brain className="h-4 w-4 mr-1" /> {loading ? "Explaining…" : `Explain ${rows.length} Transaction${rows.length !== 1 ? "s" : ""}`}
                </Button>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-400">Total Explained</p>
                    <p className="text-2xl font-bold text-blue-400">{result.total}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-400">Fraud</p>
                    <p className="text-2xl font-bold text-red-400">{result.fraud_count}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-400">Legitimate</p>
                    <p className="text-2xl font-bold text-green-400">{result.legitimate_count}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end">
                <Button onClick={exportCSV} variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-700">
                  <Download className="h-4 w-4 mr-1" /> Export CSV
                </Button>
              </div>

              {/* Explanations */}
              <div className="space-y-3">
                {result.explanations?.map((exp, i) => (
                  <ExplanationCard key={exp.id} exp={exp} idx={i} />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
