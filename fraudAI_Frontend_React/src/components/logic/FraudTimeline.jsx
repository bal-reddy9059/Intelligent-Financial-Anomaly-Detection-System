import { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import SidebarContent from "./SidebarContent";
import Header from "./Header";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Calendar,
  RefreshCw,
  Info,
  CreditCard,
  Clock,
  BarChart2,
  Shield,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const DAY_RISK_FACTORS = {
  0: 0.30, // Sun
  1: 0.15, // Mon
  2: 0.12, // Tue
  3: 0.18, // Wed
  4: 0.20, // Thu
  5: 0.35, // Fri
  6: 0.45, // Sat
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getNext7Days() {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function getDayLabel(date, index) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return DAY_LABELS[date.getDay()];
}

function getRiskColor(risk) {
  if (risk >= 70) return "#ef4444";
  if (risk >= 40) return "#f59e0b";
  return "#22c55e";
}

function getRiskLabel(risk) {
  if (risk >= 70) return "HIGH";
  if (risk >= 40) return "MEDIUM";
  return "LOW";
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm shadow-xl">
        <p className="font-semibold text-white mb-1">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ color: entry.color }}>
            {entry.name}: <span className="font-bold">{entry.value.toFixed(1)}%</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function FraudTimeline() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [recurringPayments, setRecurringPayments] = useState([]);
  const [forecast, setForecast] = useState([]);
  const [historicalPattern, setHistoricalPattern] = useState([]);
  const [highRiskWindows, setHighRiskWindows] = useState([]);
  const [riskFactors, setRiskFactors] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) fetchData(u);
    });
    return () => unsub();
  }, []);

  async function fetchData(u) {
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const txQuery = query(
        collection(db, "transactions"),
        where("userId", "==", u.uid),
        where("timestamp", ">=", thirtyDaysAgo),
        orderBy("timestamp", "desc"),
        limit(200)
      );
      const txSnap = await getDocs(txQuery);
      const txData = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const rpQuery = query(
        collection(db, "recurringPayments"),
        where("userId", "==", u.uid)
      );
      const rpSnap = await getDocs(rpQuery);
      const rpData = rpSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      setTransactions(txData);
      setRecurringPayments(rpData);
      computeForecast(txData, rpData);
    } catch (err) {
      console.error("FraudTimeline fetch error:", err);
      computeForecast([], []);
    } finally {
      setLoading(false);
    }
  }

  function computeForecast(txData, rpData) {
    const total = txData.length || 1;
    const highRiskCount = txData.filter(
      (t) => t.fraudVerdict === "HIGH_RISK"
    ).length;
    const userFraudRate = highRiskCount / total;
    const fraudAdjustment = (userFraudRate - 0.05) * 100;

    const days = getNext7Days();

    // compute recurring payment scheduled dates
    const recurringDates = new Set();
    rpData.forEach((rp) => {
      if (rp.nextDate) {
        const nd = rp.nextDate.toDate ? rp.nextDate.toDate() : new Date(rp.nextDate);
        days.forEach((d, i) => {
          if (
            nd.getDate() === d.getDate() &&
            nd.getMonth() === d.getMonth() &&
            nd.getFullYear() === d.getFullYear()
          ) {
            recurringDates.add(i);
          }
        });
      }
      // handle day-of-month recurring
      if (rp.dayOfMonth) {
        days.forEach((d, i) => {
          if (d.getDate() === rp.dayOfMonth) recurringDates.add(i);
        });
      }
    });

    const forecastArr = days.map((d, i) => {
      const dow = d.getDay();
      const baseFactor = DAY_RISK_FACTORS[dow];
      const baseRisk = Math.max(
        5,
        Math.min(95, baseFactor * 100 + fraudAdjustment)
      );
      const withRecurring = recurringDates.has(i)
        ? Math.min(95, baseRisk + 15)
        : baseRisk;
      return {
        day: getDayLabel(d, i),
        date: d,
        dayIndex: i,
        dow,
        baseRisk: parseFloat(baseRisk.toFixed(1)),
        withRecurring: parseFloat(withRecurring.toFixed(1)),
        hasRecurring: recurringDates.has(i),
      };
    });

    setForecast(forecastArr);

    // high risk windows
    const hrw = forecastArr
      .filter((f) => f.withRecurring > 60)
      .map((f) => {
        let reasons = [];
        if (f.dow === 5 || f.dow === 6 || f.dow === 0)
          reasons.push("Weekend pattern");
        if (f.hasRecurring) reasons.push("Recurring payment due");
        if (f.baseRisk > 65) reasons.push("Historical spike");
        return { ...f, reasons };
      });
    setHighRiskWindows(hrw);

    // historical pattern by day of week
    const dowCounts = Array(7).fill(0);
    const dowFraud = Array(7).fill(0);
    txData.forEach((t) => {
      const ts = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
      if (isNaN(ts)) return;
      const dow = ts.getDay();
      dowCounts[dow]++;
      if (t.fraudVerdict === "HIGH_RISK") dowFraud[dow]++;
    });
    const histPattern = DAY_LABELS.map((label, i) => ({
      day: label,
      fraudRate: dowCounts[i] > 0
        ? parseFloat(((dowFraud[i] / dowCounts[i]) * 100).toFixed(1))
        : 0,
      transactions: dowCounts[i],
    }));
    setHistoricalPattern(histPattern);

    // risk factors
    const factors = [
      {
        icon: <Calendar size={16} />,
        label: "Day-of-Week Pattern",
        impact: `+${Math.round(DAY_RISK_FACTORS[days[0].getDay()] * 100)}%`,
        positive: false,
      },
      {
        icon: <CreditCard size={16} />,
        label: "Upcoming Recurring Payments",
        impact: recurringDates.size > 0 ? `+${recurringDates.size * 15}%` : "0%",
        positive: false,
      },
      {
        icon: <Shield size={16} />,
        label: "Historical Fraud Rate",
        impact:
          userFraudRate < 0.02
            ? "-10%"
            : userFraudRate > 0.1
            ? `+${Math.round(userFraudRate * 100)}%`
            : "~0%",
        positive: userFraudRate < 0.02,
      },
      {
        icon: <BarChart2 size={16} />,
        label: "Recent Activity Level",
        impact: total > 50 ? "+5%" : total > 20 ? "0%" : "-5%",
        positive: total <= 20,
      },
    ];
    setRiskFactors(factors);

    // recommendations
    const recs = [];
    const maxRiskDay = forecastArr.reduce(
      (max, f) => (f.withRecurring > max.withRecurring ? f : max),
      forecastArr[0]
    );
    if (maxRiskDay.withRecurring > 70) {
      recs.push(`Avoid large transactions on ${maxRiskDay.day} — risk is at ${maxRiskDay.withRecurring.toFixed(0)}%.`);
    }
    const weekendDays = forecastArr.filter(
      (f) => f.dow === 5 || f.dow === 6 || f.dow === 0
    );
    if (weekendDays.some((f) => f.withRecurring > 50)) {
      recs.push("Set stricter transaction limits for the weekend.");
    }
    if (recurringDates.size > 0) {
      recs.push("Review your recurring payments scheduled this week before they auto-process.");
    }
    if (recs.length === 0) {
      recs.push("Your upcoming week looks low-risk. Maintain your safe payment habits.");
    }
    setRecommendations(recs);
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-6"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-xl">
                <TrendingUp className="text-purple-400" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Fraud Prediction Timeline
                </h1>
                <p className="text-gray-400 text-sm">
                  7-day forward-looking fraud risk forecast
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1">
                AI Forecast
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => user && fetchData(user)}
                className="border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                <RefreshCw size={14} className="mr-1" /> Refresh
              </Button>
            </div>
          </motion.div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400">Computing AI forecast...</p>
              </div>
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-6"
            >
              {/* 7-Day Forecast Chart */}
              <motion.div variants={itemVariants}>
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <TrendingUp size={18} className="text-purple-400" />
                      7-Day Risk Forecast
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4 mb-4 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                        <span className="text-gray-400">Low (0-40)</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" />
                        <span className="text-gray-400">Medium (40-70)</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                        <span className="text-gray-400">High (70+)</span>
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart
                        data={forecast}
                        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="recurGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                          dataKey="day"
                          stroke="#6b7280"
                          tick={{ fill: "#9ca3af", fontSize: 12 }}
                        />
                        <YAxis
                          stroke="#6b7280"
                          tick={{ fill: "#9ca3af", fontSize: 12 }}
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                          wrapperStyle={{ color: "#9ca3af", fontSize: 12 }}
                        />
                        <ReferenceLine
                          y={40}
                          stroke="#22c55e"
                          strokeDasharray="4 4"
                          strokeOpacity={0.5}
                        />
                        <ReferenceLine
                          y={70}
                          stroke="#ef4444"
                          strokeDasharray="4 4"
                          strokeOpacity={0.5}
                        />
                        <Area
                          type="monotone"
                          dataKey="baseRisk"
                          name="Base Risk"
                          stroke="#8b5cf6"
                          fill="url(#baseGrad)"
                          strokeWidth={2}
                          dot={{ r: 4, fill: "#8b5cf6" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="withRecurring"
                          name="With Recurring Payments"
                          stroke="#f59e0b"
                          fill="url(#recurGrad)"
                          strokeWidth={2}
                          strokeDasharray="5 3"
                          dot={{ r: 4, fill: "#f59e0b" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              {/* High Risk Windows */}
              <motion.div variants={itemVariants}>
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <AlertTriangle size={18} className="text-red-400" />
                      High Risk Windows
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {highRiskWindows.length === 0 ? (
                      <div className="flex items-center gap-3 p-4 bg-green-900/20 border border-green-700/30 rounded-lg">
                        <CheckCircle className="text-green-400" size={20} />
                        <p className="text-green-300 text-sm">
                          No high-risk windows detected in the next 7 days. Your forecast looks safe!
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {highRiskWindows.map((w, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={`flex items-start gap-3 p-3 rounded-lg border ${
                              w.withRecurring >= 70
                                ? "bg-red-900/20 border-red-700/30"
                                : "bg-yellow-900/20 border-yellow-700/30"
                            }`}
                          >
                            <AlertTriangle
                              size={18}
                              className={
                                w.withRecurring >= 70
                                  ? "text-red-400 mt-0.5"
                                  : "text-yellow-400 mt-0.5"
                              }
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-white text-sm">
                                  {w.day}
                                </span>
                                <Badge
                                  className={`text-xs ${
                                    w.withRecurring >= 70
                                      ? "bg-red-500/20 text-red-300 border-red-500/30"
                                      : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                                  }`}
                                >
                                  {w.withRecurring.toFixed(0)}% risk
                                </Badge>
                              </div>
                              <p className="text-gray-400 text-xs mt-1">
                                {w.reasons.join(" · ")}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Historical Pattern Analysis */}
              <motion.div variants={itemVariants}>
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <BarChart2 size={18} className="text-blue-400" />
                      Historical Pattern Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-400 text-xs mb-4">
                      Your actual fraud rate by day of week (last 30 days)
                    </p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={historicalPattern}
                        margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                          dataKey="day"
                          stroke="#6b7280"
                          tick={{ fill: "#9ca3af", fontSize: 12 }}
                        />
                        <YAxis
                          stroke="#6b7280"
                          tick={{ fill: "#9ca3af", fontSize: 12 }}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1f2937",
                            border: "1px solid #374151",
                            borderRadius: "8px",
                            color: "#fff",
                          }}
                          formatter={(value) => [`${value}%`, "Fraud Rate"]}
                        />
                        <Bar
                          dataKey="fraudRate"
                          name="Fraud Rate"
                          radius={[4, 4, 0, 0]}
                          fill="#8b5cf6"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Risk Factors */}
              <motion.div variants={itemVariants}>
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Info size={18} className="text-cyan-400" />
                      Risk Factors Affecting Forecast
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {riskFactors.map((f, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
                        >
                          <div className="flex items-center gap-2 text-gray-300 text-sm">
                            <span className="text-cyan-400">{f.icon}</span>
                            {f.label}
                          </div>
                          <Badge
                            className={`text-xs font-bold ${
                              f.positive
                                ? "bg-green-500/20 text-green-300 border-green-500/30"
                                : f.impact === "0%"
                                ? "bg-gray-500/20 text-gray-300 border-gray-500/30"
                                : "bg-red-500/20 text-red-300 border-red-500/30"
                            }`}
                          >
                            {f.impact}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Recommended Actions */}
              <motion.div variants={itemVariants}>
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Clock size={18} className="text-green-400" />
                      Recommended Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {recommendations.map((rec, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.07 }}
                          className="flex items-start gap-3 p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg"
                        >
                          <CheckCircle
                            size={16}
                            className="text-blue-400 mt-0.5 shrink-0"
                          />
                          <p className="text-blue-200 text-sm">{rec}</p>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
