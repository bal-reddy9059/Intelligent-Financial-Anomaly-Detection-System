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
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { AlertCircle, History, ShieldX, ShieldCheck, ChevronLeft, ChevronRight, Filter } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const VERDICT_ICON = { FRAUD: ShieldX, LEGITIMATE: ShieldCheck };
const VERDICT_COLOR = { FRAUD: "text-red-400", LEGITIMATE: "text-green-400" };
const RISK_COLOR = { HIGH: "bg-red-500/20 text-red-400", MEDIUM: "bg-yellow-500/20 text-yellow-400", LOW: "bg-green-500/20 text-green-400" };

export default function ScoreHistory() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [filterVerdict, setFilterVerdict] = useState("");
  const [filterRisk, setFilterRisk] = useState("");
  const perPage = 20;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, per_page: perPage });
    if (filterVerdict) params.set("verdict", filterVerdict);
    if (filterRisk) params.set("risk", filterRisk);
    axios.get(`${API}/score-history?${params}`)
      .then((res) => { setData(res.data); setError(""); })
      .catch((e) => setError(e.response?.data?.error || "No score history found. Check some transactions first."))
      .finally(() => setLoading(false));
  }, [page, filterVerdict, filterRisk]);

  const handleFilter = (field, val) => {
    setPage(1);
    if (field === "verdict") setFilterVerdict(v => v === val ? "" : val);
    else setFilterRisk(v => v === val ? "" : val);
  };

  const summary = data?.summary;
  const history = data?.history || [];
  const pagination = data?.pagination;

  // Build chart data from history
  const chartData = (() => {
    const map = {};
    history.forEach((h) => {
      const day = h.timestamp?.slice(0, 10) || "unknown";
      if (!map[day]) map[day] = { date: day, FRAUD: 0, LEGITIMATE: 0 };
      map[day][h.verdict] = (map[day][h.verdict] || 0) + 1;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  })();

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
              <History className="h-6 w-6" /> Score History
            </h1>
            <p className="text-gray-400 text-sm mb-6">Historical fraud scores from all checked transactions.</p>
          </motion.div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mr-3" />
              <span className="text-gray-400">Loading score history…</span>
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
              {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: "Total Scored", value: summary.total_scored, color: "text-blue-400" },
                    { label: "Fraud", value: summary.fraud_count, color: "text-red-400" },
                    { label: "Legitimate", value: summary.legitimate_count, color: "text-green-400" },
                    { label: "High Risk", value: summary.high_risk_count, color: "text-yellow-400" },
                    { label: "Fraud Rate", value: `${summary.fraud_rate_pct?.toFixed(1)}%`, color: summary.fraud_rate_pct > 30 ? "text-red-400" : "text-blue-400" },
                  ].map((s) => (
                    <Card key={s.label} className="bg-gray-800 border-gray-700">
                      <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-gray-400">{s.label}</p>
                        <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Trend chart */}
              {chartData.length > 1 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-300">Score Trend (current page)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} />
                        <YAxis stroke="#9ca3af" fontSize={10} allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }} />
                        <Bar dataKey="FRAUD" fill="#ef4444" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="LEGITIMATE" fill="#10b981" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="text-xs text-gray-400">Filter:</span>
                {["FRAUD", "LEGITIMATE"].map((v) => (
                  <button key={v} onClick={() => handleFilter("verdict", v)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      filterVerdict === v ? "bg-blue-600 border-blue-500 text-white" : "border-gray-600 text-gray-400 hover:border-gray-400"
                    }`}>{v}</button>
                ))}
                {["HIGH", "MEDIUM", "LOW"].map((r) => (
                  <button key={r} onClick={() => handleFilter("risk", r)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      filterRisk === r ? "bg-blue-600 border-blue-500 text-white" : "border-gray-600 text-gray-400 hover:border-gray-400"
                    }`}>{r}</button>
                ))}
                {(filterVerdict || filterRisk) && (
                  <button onClick={() => { setFilterVerdict(""); setFilterRisk(""); setPage(1); }}
                    className="text-xs px-3 py-1 rounded-full border border-gray-600 text-gray-400 hover:text-white">
                    Clear
                  </button>
                )}
              </div>

              {/* History table */}
              <Card className="bg-gray-800 border-gray-700">
                <CardContent className="pt-4">
                  {history.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">No records match the current filters.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left text-gray-400 py-2 pr-4">Time</th>
                            <th className="text-left text-gray-400 py-2 px-4">Verdict</th>
                            <th className="text-right text-gray-400 py-2 px-4">Probability</th>
                            <th className="text-right text-gray-400 py-2 px-4">Risk</th>
                            <th className="text-left text-gray-400 py-2 px-4">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((h, i) => {
                            const VIcon = VERDICT_ICON[h.verdict] || ShieldCheck;
                            return (
                              <motion.tr key={h.id || i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.02 }} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                <td className="py-2 pr-4 text-gray-400 font-mono text-xs">
                                  {h.timestamp ? new Date(h.timestamp).toLocaleString() : "—"}
                                </td>
                                <td className="py-2 px-4">
                                  <span className={`flex items-center gap-1.5 ${VERDICT_COLOR[h.verdict]}`}>
                                    <VIcon className="h-3.5 w-3.5" />{h.verdict}
                                  </span>
                                </td>
                                <td className="text-right py-2 px-4 font-mono text-white">{h.fraud_probability}%</td>
                                <td className="text-right py-2 px-4">
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${RISK_COLOR[h.risk_level]}`}>
                                    {h.risk_level}
                                  </span>
                                </td>
                                <td className="py-2 px-4 text-gray-500 text-xs">{h.source || "—"}</td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pagination */}
              {pagination && pagination.pages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    Page {pagination.page} of {pagination.pages} ({pagination.total} total)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}
                      className="border-gray-600 text-gray-300 hover:bg-gray-700">
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= pagination.pages}
                      onClick={() => setPage(p => p + 1)}
                      className="border-gray-600 text-gray-300 hover:bg-gray-700">
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
