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
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { AlertCircle, TrendingUp, CheckCircle, AlertTriangle, RefreshCw, Activity } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const STATUS_CONFIG = {
  STABLE: { color: "text-green-400", bg: "border-green-500/30 bg-green-500/10", icon: CheckCircle },
  MINOR: { color: "text-yellow-400", bg: "border-yellow-500/30 bg-yellow-500/10", icon: AlertTriangle },
  SIGNIFICANT: { color: "text-red-400", bg: "border-red-500/30 bg-red-500/10", icon: AlertCircle },
};
const DRIFT_COLOR = { STABLE: "#10b981", MINOR_DRIFT: "#f59e0b", SIGNIFICANT_DRIFT: "#ef4444" };

export default function DatasetDrift() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const fetchData = () => {
    setLoading(true);
    axios.get(`${API}/dataset-drift`)
      .then((res) => { setData(res.data); setError(""); })
      .catch((e) => setError(e.response?.data?.error || "Could not analyse drift. Upload data and run detection first."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const statusConfig = STATUS_CONFIG[data?.overall_drift_status] || STATUS_CONFIG.STABLE;
  const StatusIcon = statusConfig.icon;

  const chartData = data?.feature_drift_details
    ?.sort((a, b) => b.psi - a.psi)
    .slice(0, 15)
    .map((f) => ({ name: f.feature.replace(/_/g, " ").slice(0, 20), psi: parseFloat(f.psi.toFixed(4)), status: f.drift_level })) || [];

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-blue-400 mb-1 flex items-center gap-2">
                <Activity className="h-6 w-6" /> Dataset Drift
              </h1>
              <p className="text-gray-400 text-sm">Population Stability Index (PSI) analysis across all features.</p>
            </div>
            <Button size="sm" onClick={fetchData} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </motion.div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mr-3" />
              <span className="text-gray-400">Computing drift metrics…</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}

          {data && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

              {/* Overall status */}
              <div className={`flex items-center gap-4 rounded-xl border p-4 ${statusConfig.bg}`}>
                <StatusIcon className={`h-8 w-8 ${statusConfig.color}`} />
                <div className="flex-1">
                  <p className={`font-bold text-lg ${statusConfig.color}`}>
                    {data.overall_drift_status} — Overall PSI: {data.overall_psi?.toFixed(4)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {data.drifted_features?.length} drifted / {data.features_checked} features checked
                  </p>
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-400">Features Checked</p>
                    <p className="text-2xl font-bold text-blue-400">{data.features_checked}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-400">Drifted</p>
                    <p className="text-2xl font-bold text-red-400">{data.drifted_features?.length ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-400">Stable</p>
                    <p className="text-2xl font-bold text-green-400">{data.stable_features?.length ?? 0}</p>
                  </CardContent>
                </Card>
              </div>

              {/* PSI chart */}
              {chartData.length > 0 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-blue-400 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" /> PSI by Feature (top 15)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                        <XAxis type="number" stroke="#9ca3af" fontSize={10} />
                        <YAxis type="category" dataKey="name" stroke="#9ca3af" fontSize={9} width={130} />
                        <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                          formatter={(v) => [v.toFixed(4), "PSI"]} />
                        <Bar dataKey="psi" radius={[0, 3, 3, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={DRIFT_COLOR[entry.status] || "#3b82f6"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 mt-2 justify-center text-xs text-gray-400">
                      {Object.entries(DRIFT_COLOR).map(([k, c]) => (
                        <span key={k} className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-sm" style={{ background: c }} />
                          {k.replace("_", " ")}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Drifted features detail */}
              {data.drifted_features?.length > 0 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-yellow-400">Drifted Features Detail</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left text-gray-400 py-2 pr-4">Feature</th>
                            <th className="text-right text-gray-400 py-2 px-3">Train Mean</th>
                            <th className="text-right text-gray-400 py-2 px-3">Dataset Mean</th>
                            <th className="text-right text-gray-400 py-2 px-3">Z-Score</th>
                            <th className="text-right text-gray-400 py-2 px-3">PSI</th>
                            <th className="text-right text-gray-400 py-2 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.feature_drift_details
                            ?.filter((f) => f.is_drifted)
                            .sort((a, b) => b.psi - a.psi)
                            .map((f) => (
                              <tr key={f.feature} className="border-b border-gray-700/50">
                                <td className="py-2 pr-4 text-gray-300 text-xs">{f.feature.replace(/_/g, " ")}</td>
                                <td className="text-right py-2 px-3 font-mono text-xs text-gray-400">{f.training_mean?.toFixed(3)}</td>
                                <td className="text-right py-2 px-3 font-mono text-xs text-gray-400">{f.dataset_mean?.toFixed(3)}</td>
                                <td className={`text-right py-2 px-3 font-mono text-xs ${Math.abs(f.mean_shift_z) > 2 ? "text-red-400" : "text-yellow-400"}`}>
                                  {f.mean_shift_z?.toFixed(2)}
                                </td>
                                <td className="text-right py-2 px-3 font-mono text-xs" style={{ color: DRIFT_COLOR[f.drift_level] }}>
                                  {f.psi?.toFixed(4)}
                                </td>
                                <td className="text-right py-2 px-3">
                                  <span className="text-xs px-2 py-0.5 rounded-full"
                                    style={{ background: DRIFT_COLOR[f.drift_level] + "33", color: DRIFT_COLOR[f.drift_level] }}>
                                    {f.drift_level?.replace("_", " ")}
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recommendations */}
              {data.recommendations?.length > 0 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-green-400">Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {data.recommendations.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-green-400 mt-0.5 flex-shrink-0">→</span>{r}
                        </li>
                      ))}
                    </ul>
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
