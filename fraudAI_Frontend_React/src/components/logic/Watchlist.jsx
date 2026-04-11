import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import { AlertCircle, Eye, ShieldX, ShieldAlert, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const RISK_COLOR = { CRITICAL: "text-red-500", HIGH: "text-red-400", MEDIUM: "text-yellow-400", LOW: "text-green-400" };
const RISK_BG = { CRITICAL: "border-red-500/40 bg-red-500/10", HIGH: "border-red-500/30 bg-red-500/8", MEDIUM: "border-yellow-500/30 bg-yellow-500/8", LOW: "border-green-500/30 bg-green-500/8" };

function WatchlistRow({ item, idx }) {
  const [open, setOpen] = useState(false);
  const RiskIcon = item.risk_level === "HIGH" || item.risk_level === "CRITICAL" ? ShieldX :
    item.risk_level === "MEDIUM" ? ShieldAlert : ShieldCheck;
  const riskColor = RISK_COLOR[item.risk_level] || "text-gray-400";

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
      className={`rounded-xl border p-4 ${RISK_BG[item.risk_level] || "bg-gray-800 border-gray-700"}`}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <RiskIcon className={`h-5 w-5 flex-shrink-0 ${riskColor}`} />
          <div>
            <p className="text-sm font-semibold text-white">Index #{item.dataset_index}</p>
            <p className={`text-xs ${riskColor}`}>{item.risk_level} RISK · {item.fraud_probability}% fraud probability</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {item.is_flagged && (
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">FLAGGED</span>
          )}
          {item.ground_truth_label && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              item.ground_truth_label === "FRAUD" ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
            }`}>{item.ground_truth_label}</span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>

      {open && item.feature_values && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
          className="mt-3 pt-3 border-t border-gray-700/60">
          <p className="text-xs text-gray-400 mb-2">Anomaly Score: <span className="text-white font-mono">{item.anomaly_score?.toFixed(4)}</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {Object.entries(item.feature_values).slice(0, 12).map(([k, v]) => (
              <div key={k} className="bg-gray-700/50 rounded px-2 py-1">
                <p className="text-xs text-gray-500 truncate">{k.replace(/_/g, " ")}</p>
                <p className="text-xs text-white font-mono">{typeof v === "number" ? v.toFixed(3) : v}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function Watchlist() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [n, setN] = useState(20);
  const [minRisk, setMinRisk] = useState("HIGH");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const fetchData = () => {
    setLoading(true);
    axios.get(`${API}/watchlist?n=${n}&min_risk=${minRisk}`)
      .then((res) => { setData(res.data); setError(""); })
      .catch((e) => setError(e.response?.data?.error || "No watchlist data. Run detection first."))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

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
              <Eye className="h-6 w-6" /> Watchlist
            </h1>
            <p className="text-gray-400 text-sm mb-6">Top high-risk transactions flagged for review.</p>
          </motion.div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Min Risk:</span>
              {["HIGH", "MEDIUM", "LOW"].map((r) => (
                <button key={r} onClick={() => setMinRisk(r)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    minRisk === r ? "bg-blue-600 border-blue-500 text-white" : "border-gray-600 text-gray-400 hover:border-gray-400"
                  }`}>{r}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Show top:</span>
              {[10, 20, 50].map((v) => (
                <button key={v} onClick={() => setN(v)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    n === v ? "bg-blue-600 border-blue-500 text-white" : "border-gray-600 text-gray-400 hover:border-gray-400"
                  }`}>{v}</button>
              ))}
            </div>
            <Button size="sm" onClick={fetchData} className="bg-blue-600 hover:bg-blue-700 text-xs">Refresh</Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mr-3" />
              <span className="text-gray-400">Loading watchlist…</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}

          {data && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-400">Total Listed</p>
                    <p className="text-2xl font-bold text-blue-400">{data.total}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-400">High Risk</p>
                    <p className="text-2xl font-bold text-red-400">{data.high_risk_count}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-400">Confirmed Fraud</p>
                    <p className="text-2xl font-bold text-yellow-400">{data.confirmed_fraud_count ?? "—"}</p>
                  </CardContent>
                </Card>
              </div>

              <p className="text-xs text-gray-500">Model: {data.model_used} · Click a row to expand features</p>

              {/* Watchlist items */}
              <div className="space-y-3">
                {data.watchlist?.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-8">No transactions match the current risk filter.</p>
                )}
                {data.watchlist?.map((item, i) => (
                  <WatchlistRow key={item.dataset_index} item={item} idx={i} />
                ))}
              </div>

              {/* AI Summary */}
              {data.ai_summary && (
                <Card className="bg-blue-500/5 border-blue-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-blue-400">AI Insight</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-300 leading-relaxed">{data.ai_summary}</p>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
