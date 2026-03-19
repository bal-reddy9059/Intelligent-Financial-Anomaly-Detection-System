import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import axios from "axios";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import MLWorkflowStepper from "./MLWorkflowStepper";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import { ChevronRight, AlertCircle, Lightbulb, Brain } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function CorrelationHeatmap({ data, features }) {
  if (!data.length || !features.length) return null;
  const getColor = (val) => {
    const v = Math.max(-1, Math.min(1, val));
    if (v > 0) {
      const intensity = Math.round(v * 180);
      return `rgb(${220 - intensity}, ${220 - intensity}, 255)`;
    } else {
      const intensity = Math.round(-v * 180);
      return `rgb(255, ${220 - intensity}, ${220 - intensity})`;
    }
  };
  const n = features.length;
  const cellSize = Math.min(60, Math.floor(480 / n));
  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex">
          <div style={{ width: cellSize * 1.5 }} />
          {features.map((f) => (
            <div key={f} style={{ width: cellSize, fontSize: 10 }}
              className="text-gray-400 text-center truncate px-0.5">{f}</div>
          ))}
        </div>
        {features.map((rowFeat) => (
          <div key={rowFeat} className="flex items-center">
            <div style={{ width: cellSize * 1.5, fontSize: 10 }}
              className="text-gray-400 text-right pr-1 truncate">{rowFeat}</div>
            {features.map((colFeat) => {
              const cell = data.find((d) => d.x === colFeat && d.y === rowFeat);
              const val = cell ? cell.value : 0;
              return (
                <div key={colFeat}
                  style={{ width: cellSize, height: cellSize, backgroundColor: getColor(val), fontSize: cellSize > 40 ? 10 : 8 }}
                  className="flex items-center justify-center text-gray-800 font-semibold border border-gray-900"
                  title={`${rowFeat} × ${colFeat}: ${val}`}>
                  {val.toFixed(1)}
                </div>
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
          <div className="w-4 h-4 rounded" style={{ background: "rgb(40,40,255)" }} /> Strong +
          <div className="w-4 h-4 rounded ml-2" style={{ background: "rgb(220,220,255)" }} /> Weak +
          <div className="w-4 h-4 rounded ml-2" style={{ background: "rgb(220,220,220)" }} /> None
          <div className="w-4 h-4 rounded ml-2" style={{ background: "rgb(255,40,40)" }} /> Strong −
        </div>
      </div>
    </div>
  );
}

export default function ExploreData() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    axios.get(`${API}/explore`)
      .then((res) => setData(res.data))
      .catch((e) => setError(e.response?.data?.error || "Could not load exploration data. Have you uploaded a CSV?"));
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-6xl mx-auto">
          <MLWorkflowStepper />
          <div className="flex justify-between items-center mb-6">
            <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-bold text-blue-400">
              Explore Data
            </motion.h1>
            {data && (
              <Button onClick={() => navigate("/run-detection")}
                className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1">
                Run Detection <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          {error && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-5 mb-5">
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-300 font-semibold text-sm">No data to explore yet</p>
                  <p className="text-yellow-400/70 text-xs mt-0.5">Upload a CSV dataset first to explore it here.</p>
                </div>
              </div>
              <Button size="sm" onClick={() => navigate("/upload-data")}
                className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5">
                <ChevronRight className="h-4 w-4" /> Go to Upload Data
              </Button>
            </div>
          )}

          {data && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Transactions", value: data.stats.total_transactions, color: "blue" },
                  { label: "Features",            value: data.stats.num_features,       color: "purple" },
                  { label: "Fraud Count",         value: data.stats.fraud_count ?? "N/A", color: "red" },
                  {
                    label: "Fraud Rate",
                    value: data.stats.fraud_rate !== undefined ? `${data.stats.fraud_rate}%` : "N/A",
                    color: "yellow",
                  },
                ].map((s) => (
                  <Card key={s.label} className="bg-gray-800 border-gray-700">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs text-gray-400">{s.label}</p>
                      <p className={`text-2xl font-bold text-${s.color}-400`}>{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* AI Dataset Insights */}
              {data.ai_insights?.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Card className="bg-gray-800 border-blue-500/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-blue-400 flex items-center gap-2">
                        <Brain className="h-4 w-4" /> AI Dataset Insights
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {data.ai_insights.map((insight, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + i * 0.08 }}
                          className="flex items-start gap-2.5 bg-blue-500/8 border border-blue-500/15 rounded-lg p-3"
                        >
                          <Lightbulb className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-gray-300 leading-relaxed">{insight}</p>
                        </motion.div>
                      ))}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Amount Distribution */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-base text-blue-400">Amount Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.amount_distribution} margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="bin" stroke="#9ca3af" fontSize={10} tick={{ angle: -30, textAnchor: "end" }} height={50} />
                      <YAxis stroke="#9ca3af" fontSize={11} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                        labelStyle={{ color: "#9ca3af" }} itemStyle={{ color: "#60a5fa" }} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Daily Volume */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-base text-green-400">Daily Transaction Volume</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.daily_volume} margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tick={{ angle: -30, textAnchor: "end" }} height={50} />
                      <YAxis stroke="#9ca3af" fontSize={11} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
                        labelStyle={{ color: "#9ca3af" }} itemStyle={{ color: "#10b981" }} />
                      <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Correlation heatmap */}
              {data.correlation_features?.length > 1 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-base text-purple-400">Feature Correlation Heatmap</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CorrelationHeatmap data={data.correlation} features={data.correlation_features} />
                  </CardContent>
                </Card>
              )}

              {/* CTA */}
              <div className="flex justify-end pt-2">
                <Button onClick={() => navigate("/run-detection")}
                  className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1">
                  Proceed to Run Detection <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
