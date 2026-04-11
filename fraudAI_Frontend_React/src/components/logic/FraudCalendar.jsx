import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { AlertCircle, Clock, Calendar, TrendingUp, AlertTriangle } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const RISK_COLOR = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#10b981" };
const RISK_BG = {
  HIGH: "bg-red-500/20 border-red-500/40 text-red-400",
  MEDIUM: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400",
  LOW: "bg-green-500/20 border-green-500/40 text-green-400",
};

export default function FraudCalendar() {
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
    axios.get(`${API}/fraud-calendar`)
      .then((res) => { setData(res.data); setError(""); })
      .catch((e) => setError(e.response?.data?.error || "Failed to load fraud calendar. Upload and run detection first."))
      .finally(() => setLoading(false));
  }, []);

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
              <Calendar className="h-6 w-6" /> Fraud Calendar
            </h1>
            <p className="text-gray-400 text-sm mb-6">Temporal fraud patterns by hour and day of week.</p>
          </motion.div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mr-3" />
              <span className="text-gray-400">Analysing temporal patterns…</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}

          {data && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-1 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs text-gray-400">Peak Fraud Hour</CardTitle>
                    <Clock className="h-4 w-4 text-red-400" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-red-400">{data.peak_fraud_hour_label}</p>
                    <p className="text-xs text-gray-500">{data.peak_fraud_rate_pct?.toFixed(1)}% fraud rate</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-1 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs text-gray-400">High-Risk Hours</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-yellow-400">{data.high_risk_hours?.length ?? 0}</p>
                    <p className="text-xs text-gray-500">{data.high_risk_hours?.slice(0, 3).join(", ")}{data.high_risk_hours?.length > 3 ? "…" : ""}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-1 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs text-gray-400">Data Sources</CardTitle>
                    <TrendingUp className="h-4 w-4 text-blue-400" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-blue-400">{data.data_sources?.length ?? 0}</p>
                    <p className="text-xs text-gray-500">{data.data_sources?.join(", ")}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Hourly heatmap bar chart */}
              {data.hour_heatmap?.length > 0 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-blue-400 flex items-center gap-2">
                      <Clock className="h-4 w-4" /> Fraud Rate by Hour of Day
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data.hour_heatmap} margin={{ left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="label" stroke="#9ca3af" fontSize={10} interval={2} />
                        <YAxis stroke="#9ca3af" fontSize={10} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                          formatter={(v) => [`${v.toFixed(2)}%`, "Fraud Rate"]}
                          labelFormatter={(l) => `Hour: ${l}`}
                        />
                        <Bar dataKey="fraud_rate_pct" radius={[3, 3, 0, 0]}>
                          {data.hour_heatmap.map((entry, i) => (
                            <Cell key={i} fill={RISK_COLOR[entry.risk_band] || "#3b82f6"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 mt-2 justify-center text-xs text-gray-400">
                      {["HIGH", "MEDIUM", "LOW"].map((r) => (
                        <span key={r} className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: RISK_COLOR[r] }} />
                          {r}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Day of week heatmap */}
              {data.day_heatmap?.length > 0 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-purple-400 flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Fraud Rate by Day of Week
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-7 gap-2">
                      {data.day_heatmap.map((day) => (
                        <div key={day.day_index} className={`rounded-lg border p-3 text-center ${RISK_BG[day.risk_band] || "bg-gray-700 border-gray-600"}`}>
                          <p className="text-xs font-semibold truncate">{day.day_name.slice(0, 3)}</p>
                          <p className="text-lg font-bold mt-1">{day.fraud_rate_pct?.toFixed(1)}%</p>
                          <p className="text-xs opacity-70">{day.fraud_count} fraud</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Hourly detail table */}
              {data.hour_heatmap?.length > 0 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-yellow-400">Hourly Detail</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left text-gray-400 py-2 pr-4">Hour</th>
                            <th className="text-right text-gray-400 py-2 px-4">Transactions</th>
                            <th className="text-right text-gray-400 py-2 px-4">Fraud Count</th>
                            <th className="text-right text-gray-400 py-2 px-4">Fraud Rate</th>
                            <th className="text-right text-gray-400 py-2 px-4">Risk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.hour_heatmap
                            .filter((h) => h.fraud_count > 0)
                            .sort((a, b) => b.fraud_rate_pct - a.fraud_rate_pct)
                            .slice(0, 12)
                            .map((h) => (
                              <tr key={h.hour} className="border-b border-gray-700/50">
                                <td className="py-2 pr-4 text-gray-300 font-mono">{h.label}</td>
                                <td className="text-right py-2 px-4 text-gray-400">{h.total_transactions}</td>
                                <td className="text-right py-2 px-4 text-gray-400">{h.fraud_count}</td>
                                <td className="text-right py-2 px-4 font-mono" style={{ color: RISK_COLOR[h.risk_band] }}>
                                  {h.fraud_rate_pct?.toFixed(2)}%
                                </td>
                                <td className="text-right py-2 px-4">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    h.risk_band === "HIGH" ? "bg-red-500/20 text-red-400" :
                                    h.risk_band === "MEDIUM" ? "bg-yellow-500/20 text-yellow-400" :
                                    "bg-green-500/20 text-green-400"
                                  }`}>{h.risk_band}</span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AI Summary */}
              {data.ai_summary && (
                <Card className="bg-blue-500/5 border-blue-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-blue-400 flex items-center gap-2">
                      AI Insight
                    </CardTitle>
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
