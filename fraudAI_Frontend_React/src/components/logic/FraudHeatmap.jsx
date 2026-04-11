import { useState, useEffect, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "./firebase";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import {
  processCategoryRiskMatrix, processHourlyFraudRate, getRiskiestCategories,
  getPeakRiskWindow, cellColor,
} from "@/lib/heatmapProcessor";
import { AlertTriangle, Clock, Activity, ShieldX } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

export default function FraudHeatmap() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      setUser(u);
      const snap = await getDoc(doc(db, "users", u.uid));
      if (!snap.exists()) { setLoading(false); return; }
      const { upiId } = snap.data();
      const txSnap = await getDocs(query(collection(db, "transactions"), where("senderUPI", "==", upiId)));
      setTransactions(txSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const { categories, riskLevels, matrix } = useMemo(
    () => processCategoryRiskMatrix(transactions),
    [transactions]
  );

  const hourlyData = useMemo(() => processHourlyFraudRate(transactions), [transactions]);
  const riskiestCats = useMemo(() => getRiskiestCategories(transactions), [transactions]);
  const peakWindow = useMemo(() => getPeakRiskWindow(hourlyData), [hourlyData]);

  // Find max cell value for color scaling
  const maxCellCount = useMemo(() => {
    let max = 0;
    categories.forEach((cat) => riskLevels.forEach((r) => { if (matrix[cat][r] > max) max = matrix[cat][r]; }));
    return max;
  }, [categories, riskLevels, matrix]);

  const fraudTotal = transactions.filter((t) => t.fraudVerdict === "FRAUD").length;
  const peakHour = hourlyData.reduce((best, h) => h.fraudRate > best.fraudRate ? h : best, { fraudRate: 0, label: "—" });

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl font-bold text-blue-400 mb-1">Fraud Heatmap</h1>
            <p className="text-gray-400 text-sm mb-6">
              Visualize which spending categories and hours of day carry the highest fraud risk.
            </p>
          </motion.div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mr-3" />
              <span className="text-gray-400">Loading your transaction data…</span>
            </div>
          )}

          {!loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

              {/* Top stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Total Transactions", value: transactions.length, icon: Activity, color: "blue" },
                  { label: "Fraud Flagged", value: fraudTotal, icon: ShieldX, color: fraudTotal > 0 ? "red" : "green" },
                  { label: "Peak Risk Hour", value: peakHour.label, icon: Clock, color: "yellow" },
                ].map((s) => (
                  <Card key={s.label} className="bg-gray-800 border-gray-700">
                    <CardHeader className="flex flex-row items-center justify-between pb-1">
                      <CardTitle className="text-xs text-gray-400">{s.label}</CardTitle>
                      <s.icon className={`h-4 w-4 text-${s.color}-400`} />
                    </CardHeader>
                    <CardContent>
                      <p className={`text-2xl font-bold text-${s.color}-400`}>{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Category × Risk Matrix + Riskiest Categories */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Heatmap grid */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-400" /> Category × Risk Matrix
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {transactions.length === 0 ? (
                      <p className="text-gray-500 text-sm py-6 text-center">No transactions yet.</p>
                    ) : (
                      <>
                        {/* Header row */}
                        <div className="grid grid-cols-4 gap-1 mb-1">
                          <div />
                          {riskLevels.map((r) => (
                            <div key={r} className={`text-xs font-bold text-center py-1 rounded ${
                              r === "HIGH" ? "text-red-400" : r === "MEDIUM" ? "text-yellow-400" : "text-green-400"
                            }`}>{r}</div>
                          ))}
                        </div>
                        {/* Data rows */}
                        {categories.map((cat) => (
                          <div key={cat} className="grid grid-cols-4 gap-1 mb-1">
                            <div className="text-xs text-gray-400 flex items-center font-medium truncate">{cat}</div>
                            {riskLevels.map((r) => {
                              const count = matrix[cat][r];
                              return (
                                <div key={r} title={`${cat} / ${r}: ${count} tx`}
                                  className="rounded text-center py-2 text-xs font-bold transition-all"
                                  style={{ background: cellColor(count, maxCellCount), color: count > 0 ? "#e5e7eb" : "#6b7280" }}>
                                  {count > 0 ? count : "—"}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                        <p className="text-xs text-gray-600 mt-2">
                          Darker blue = more transactions in that category/risk combination
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Riskiest categories ranked */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                      <ShieldX className="h-4 w-4 text-red-400" /> Riskiest Categories
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {riskiestCats.length === 0 ? (
                      <p className="text-gray-500 text-sm py-6 text-center">No transaction data available.</p>
                    ) : (
                      <div className="space-y-3">
                        {riskiestCats.map((cat, i) => {
                          const barColor = cat.fraudRate > 50 ? "bg-red-500" : cat.fraudRate > 20 ? "bg-yellow-500" : "bg-green-500";
                          const textColor = cat.fraudRate > 50 ? "text-red-400" : cat.fraudRate > 20 ? "text-yellow-400" : "text-green-400";
                          return (
                            <div key={cat.category}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500 w-4">{i + 1}.</span>
                                  <span className="text-gray-300 font-medium">{cat.category}</span>
                                  <span className="text-gray-500">{cat.total} tx</span>
                                </div>
                                <span className={`font-bold ${textColor}`}>{cat.fraudRate}% fraud</span>
                              </div>
                              <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${cat.fraudRate}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* 24-hour fraud rate chart */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-400" /> Fraud Rate by Hour of Day
                    {peakWindow.avgRate > 0 && (
                      <span className="ml-auto text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full">
                        Peak: {String(peakWindow.startHour).padStart(2, "0")}:00–{String(peakWindow.endHour ?? 0).padStart(2, "0")}:59
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {transactions.length === 0 ? (
                    <p className="text-gray-500 text-sm py-6 text-center">No transactions yet.</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={hourlyData} margin={{ left: 0, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="label" stroke="#6b7280" fontSize={9}
                            tick={{ fill: "#9ca3af" }} interval={2} />
                          <YAxis stroke="#6b7280" fontSize={10} domain={[0, 100]}
                            label={{ value: "Fraud %", angle: -90, position: "insideLeft", fill: "#9ca3af", fontSize: 9 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                            formatter={(v, name) => [name === "fraudRate" ? `${v}%` : v, name === "fraudRate" ? "Fraud Rate" : "Transactions"]}
                            labelStyle={{ color: "#9ca3af" }}
                          />
                          <Bar dataKey="fraudRate" radius={[2, 2, 0, 0]} name="fraudRate">
                            {hourlyData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-gray-600 mt-1 text-center">
                        Green = low fraud rate · Amber = moderate · Red = high fraud rate
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Peak risk window alert */}
              {peakWindow.avgRate > 0 && (
                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-300 font-semibold text-sm">Peak Risk Window Detected</p>
                    <p className="text-red-400/80 text-xs mt-0.5">
                      Transactions between{" "}
                      <span className="font-bold">{String(peakWindow.startHour).padStart(2, "0")}:00</span> and{" "}
                      <span className="font-bold">{String(peakWindow.endHour ?? 0).padStart(2, "0")}:59</span> carry
                      the highest fraud rate ({peakWindow.avgRate}%) in your history.
                      Be extra cautious when making payments during this window.
                    </p>
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
