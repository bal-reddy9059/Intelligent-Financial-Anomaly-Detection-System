import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import { AlertCircle, Network, Users, GitBranch, Layers, ShieldAlert } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const RISK_COLOR = { HIGH: "text-red-400", MEDIUM: "text-yellow-400", LOW: "text-green-400" };
const RISK_BG = { HIGH: "border-red-500/30 bg-red-500/10", MEDIUM: "border-yellow-500/30 bg-yellow-500/10", LOW: "border-green-500/30 bg-green-500/10" };

function StatCard({ icon: Icon, label, value, sub, color = "blue" }) {
  const colors = { blue: "text-blue-400", red: "text-red-400", yellow: "text-yellow-400", purple: "text-purple-400", green: "text-green-400" };
  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-1 flex flex-row items-center justify-between">
        <CardTitle className="text-xs text-gray-400">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${colors[color]}`} />
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function AnalysisCard({ title, icon: Icon, iconColor, data, interpretation }) {
  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm flex items-center gap-2 ${iconColor}`}>
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(data).map(([k, v]) => {
          if (k === "interpretation" || k === "criteria") return null;
          const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          const display = typeof v === "number"
            ? (Number.isInteger(v) ? v : v.toFixed(2))
            : (v == null ? "N/A" : String(v));
          return (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{label}</span>
              <span className="text-white font-mono">{display}{k.includes("pct") || k.includes("rate") ? "%" : ""}</span>
            </div>
          );
        })}
        {interpretation && (
          <p className="text-xs text-gray-500 pt-2 border-t border-gray-700">{interpretation}</p>
        )}
        {data.criteria && (
          <p className="text-xs text-gray-600 italic">{data.criteria}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function NetworkAnalysis() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/network-analysis`)
      .then((res) => { setData(res.data); setError(""); })
      .catch((e) => setError(e.response?.data?.error || "Failed to load network analysis. Upload and run detection first."))
      .finally(() => setLoading(false));
  }, []);

  const na = data?.network_analysis;
  const riskLevel = data?.network_risk_level || "LOW";

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
              <Network className="h-6 w-6" /> Network Analysis
            </h1>
            <p className="text-gray-400 text-sm mb-6">Hub detection, mule accounts, and layering patterns in transaction network.</p>
          </motion.div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mr-3" />
              <span className="text-gray-400">Analysing transaction network…</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}

          {data && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

              {/* Network risk badge */}
              <div className={`flex items-center gap-3 rounded-xl border p-4 ${RISK_BG[riskLevel]}`}>
                <ShieldAlert className={`h-6 w-6 ${RISK_COLOR[riskLevel]}`} />
                <div>
                  <p className={`font-bold ${RISK_COLOR[riskLevel]}`}>Network Risk: {riskLevel}</p>
                  <p className="text-xs text-gray-400">
                    {data.total_suspicious_nodes} suspicious nodes out of {data.dataset_size} total transactions
                  </p>
                </div>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard icon={Network} label="Hub Nodes" value={na?.hub_detection?.hub_node_count ?? "—"}
                  sub={`${na?.hub_detection?.pct_of_dataset?.toFixed(1)}% of dataset`} color="red" />
                <StatCard icon={Users} label="Suspected Mules" value={na?.mule_accounts?.suspected_mule_count ?? "—"}
                  sub={`${na?.mule_accounts?.pct_of_dataset?.toFixed(1)}% of dataset`} color="yellow" />
                <StatCard icon={Layers} label="Layering Patterns" value={na?.layering_patterns?.layering_count ?? "—"}
                  sub={`${na?.layering_patterns?.pct_of_dataset?.toFixed(1)}% of dataset`} color="purple" />
              </div>

              {/* Analysis cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {na?.hub_detection && (
                  <AnalysisCard title="Hub Detection" icon={Network} iconColor="text-red-400"
                    data={na.hub_detection} interpretation={na.hub_detection.interpretation} />
                )}
                {na?.mule_accounts && (
                  <AnalysisCard title="Mule Accounts" icon={Users} iconColor="text-yellow-400"
                    data={na.mule_accounts} interpretation={na.mule_accounts.interpretation} />
                )}
                {na?.layering_patterns && (
                  <AnalysisCard title="Layering Patterns" icon={GitBranch} iconColor="text-purple-400"
                    data={na.layering_patterns} interpretation={na.layering_patterns.interpretation} />
                )}
              </div>

              {/* Features used */}
              {data.features_used?.length > 0 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-300">Features Analysed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {data.features_used.map((f) => (
                        <span key={f} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded-full">{f}</span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

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
