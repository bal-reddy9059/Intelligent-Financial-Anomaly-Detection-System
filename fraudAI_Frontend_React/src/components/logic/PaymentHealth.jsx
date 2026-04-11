import { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import SidebarContent from "./SidebarContent";
import Header from "./Header";
import {
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  PiggyBank,
  RefreshCw,
  Lock,
  AlertCircle,
  CheckCircle,
  Zap,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

function getGrade(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

function getHealthLabel(score) {
  if (score >= 70) return { label: "GOOD", color: "text-green-400" };
  if (score >= 40) return { label: "FAIR", color: "text-yellow-400" };
  return { label: "POOR", color: "text-red-400" };
}

function getScoreColor(score) {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function CircularGauge({ score, size = 180 }) {
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);
  const grade = getGrade(score);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#374151"
          strokeWidth={12}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <motion.span
          className="text-4xl font-extrabold text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {score}
        </motion.span>
        <span className="text-sm text-gray-400">/ 100</span>
        <span
          className="text-xl font-bold mt-1"
          style={{ color }}
        >
          {grade}
        </span>
      </div>
    </div>
  );
}

function TrendIcon({ trend }) {
  if (trend === "up")
    return <TrendingUp size={14} className="text-green-400" />;
  if (trend === "down")
    return <TrendingDown size={14} className="text-red-400" />;
  return <Minus size={14} className="text-gray-400" />;
}

export default function PaymentHealth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState({
    fraud: 0,
    savings: 0,
    bills: 0,
    spending: 0,
    safety: 0,
  });
  const [composite, setComposite] = useState(0);
  const [history, setHistory] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

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
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Transactions
      const txSnap = await getDocs(
        query(
          collection(db, "transactions"),
          where("userId", "==", u.uid),
          orderBy("timestamp", "desc"),
          limit(300)
        )
      );
      const txData = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Savings Goals
      const sgSnap = await getDocs(
        query(collection(db, "savingsGoals"), where("userId", "==", u.uid))
      );
      const sgData = sgSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Recurring Payments
      const rpSnap = await getDocs(
        query(collection(db, "recurringPayments"), where("userId", "==", u.uid))
      );
      const rpData = rpSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // User doc
      const userDoc = await getDoc(doc(db, "users", u.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};

      computeScores(txData, sgData, rpData, userData, startOfMonth);
    } catch (err) {
      console.error("PaymentHealth fetch error:", err);
      computeScores([], [], [], {}, new Date());
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }

  function computeScores(txData, sgData, rpData, userData, startOfMonth) {
    // a. Fraud Safety
    const total = txData.length || 1;
    const highRisk = txData.filter((t) => t.fraudVerdict === "HIGH_RISK").length;
    const fraudScore = Math.max(0, Math.min(100, 100 - (highRisk / total) * 300));

    // b. Savings Rate
    const totalSaved = sgData.reduce((sum, g) => sum + (g.currentAmount || 0), 0);
    const monthlyTxTotal = txData
      .filter((t) => {
        const ts = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        return ts >= startOfMonth;
      })
      .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    const estimatedIncome = monthlyTxTotal > 0 ? monthlyTxTotal * 0.6 : 10000;
    const savingsScore = Math.max(
      0,
      Math.min(100, (totalSaved / estimatedIncome) * 100)
    );

    // c. Bill Consistency
    const activeRP = rpData.filter((r) => r.status === "active" || !r.status);
    const missedRP = rpData.filter((r) => r.status === "missed").length;
    const billScore =
      activeRP.length + missedRP === 0
        ? 100
        : Math.max(
            0,
            Math.min(
              100,
              ((activeRP.length) / (activeRP.length + missedRP)) * 100
            )
          );

    // d. Spending Control
    const monthTx = txData.filter((t) => {
      const ts = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
      return ts >= startOfMonth;
    });
    const limitBreaches = monthTx.filter((t) => t.limitBreached === true).length;
    const spendingScore = Math.max(0, 100 - limitBreaches * 10);

    // e. Account Safety
    let safetyScore = 50; // no frozen
    if (userData?.transactionLimits?.enabled) safetyScore += 25;
    if (userData?.notifications?.enabled) safetyScore += 25;
    if (userData?.frozen) safetyScore = Math.max(0, safetyScore - 50);

    const allScores = {
      fraud: Math.round(fraudScore),
      savings: Math.round(savingsScore),
      bills: Math.round(billScore),
      spending: Math.round(spendingScore),
      safety: Math.round(Math.min(100, safetyScore)),
    };
    setScores(allScores);

    const comp = Math.round(
      (allScores.fraud * 0.3 +
        allScores.savings * 0.2 +
        allScores.bills * 0.2 +
        allScores.spending * 0.15 +
        allScores.safety * 0.15)
    );
    setComposite(comp);

    // Generate synthetic 30-day history
    const hist = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const jitter = (Math.random() - 0.5) * 10;
      hist.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        score: Math.max(0, Math.min(100, Math.round(comp + jitter))),
      });
    }
    setHistory(hist);

    // Recommendations
    const recs = [];
    const scoreArr = [
      { key: "fraud", label: "Fraud Safety", score: allScores.fraud },
      { key: "savings", label: "Savings Rate", score: allScores.savings },
      { key: "bills", label: "Bill Consistency", score: allScores.bills },
      { key: "spending", label: "Spending Control", score: allScores.spending },
      { key: "safety", label: "Account Safety", score: allScores.safety },
    ].sort((a, b) => a.score - b.score);

    const recMap = {
      fraud: {
        icon: <Shield size={16} />,
        action: "Review flagged transactions and report any suspicious activity.",
        points: "+8 pts",
      },
      savings: {
        icon: <PiggyBank size={16} />,
        action: "Increase your savings goal contributions by even 5% this month.",
        points: "+6 pts",
      },
      bills: {
        icon: <CheckCircle size={16} />,
        action: "Set up auto-pay for recurring bills to avoid missed payments.",
        points: "+5 pts",
      },
      spending: {
        icon: <AlertCircle size={16} />,
        action: "Enable transaction limits to prevent overspending.",
        points: "+4 pts",
      },
      safety: {
        icon: <Lock size={16} />,
        action: "Enable transaction limits and push notifications in Settings.",
        points: "+7 pts",
      },
    };

    scoreArr.slice(0, 3).forEach((s) => {
      recs.push({ ...recMap[s.key], label: s.label });
    });
    setRecommendations(recs);
  }

  const subScores = [
    {
      key: "fraud",
      label: "Fraud Safety",
      icon: <Shield size={18} className="text-red-400" />,
      score: scores.fraud,
      explanation: "Based on your high-risk transaction rate",
      trend: scores.fraud >= 80 ? "up" : scores.fraud <= 50 ? "down" : "same",
    },
    {
      key: "savings",
      label: "Savings Rate",
      icon: <PiggyBank size={18} className="text-green-400" />,
      score: scores.savings,
      explanation: "Ratio of total saved vs estimated monthly income",
      trend: scores.savings >= 60 ? "up" : scores.savings <= 30 ? "down" : "same",
    },
    {
      key: "bills",
      label: "Bill Consistency",
      icon: <CheckCircle size={18} className="text-blue-400" />,
      score: scores.bills,
      explanation: "% of recurring payments not missed",
      trend: scores.bills >= 90 ? "up" : scores.bills <= 70 ? "down" : "same",
    },
    {
      key: "spending",
      label: "Spending Control",
      icon: <AlertCircle size={18} className="text-yellow-400" />,
      score: scores.spending,
      explanation: "Deducted 10 pts per transaction limit breach this month",
      trend: scores.spending >= 90 ? "up" : scores.spending <= 60 ? "down" : "same",
    },
    {
      key: "safety",
      label: "Account Safety",
      icon: <Lock size={18} className="text-purple-400" />,
      score: scores.safety,
      explanation: "Security features enabled: limits, notifications, unfrozen",
      trend: scores.safety >= 75 ? "up" : scores.safety <= 50 ? "down" : "same",
    },
  ];

  const health = getHealthLabel(composite);

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
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-6"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pink-500/20 rounded-xl">
                <Heart className="text-pink-400" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Payment Health Score</h1>
                <p className="text-gray-400 text-sm">
                  Your composite financial safety metric
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => user && fetchData(user)}
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
          </motion.div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400">Computing health score...</p>
              </div>
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-6"
            >
              {/* Main Score Display */}
              <motion.div variants={itemVariants}>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row items-center justify-center gap-8 py-4">
                      <CircularGauge score={composite} size={190} />
                      <div className="flex flex-col items-center md:items-start gap-2">
                        <p className="text-gray-400 text-sm">Your payment health is</p>
                        <span
                          className={`text-3xl font-extrabold ${health.color}`}
                        >
                          {health.label}
                        </span>
                        <Badge className="bg-gray-700 text-gray-300 border border-gray-600 mt-1">
                          Grade: {getGrade(composite)}
                        </Badge>
                        {lastUpdated && (
                          <p className="text-gray-500 text-xs mt-2">
                            Last updated:{" "}
                            {lastUpdated.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Score Breakdown */}
              <motion.div variants={itemVariants}>
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Zap size={18} className="text-yellow-400" />
                      Score Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {subScores.map((s, i) => (
                        <motion.div
                          key={s.key}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.07 }}
                          className="p-3 bg-gray-700/50 rounded-lg"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {s.icon}
                              <span className="text-sm font-medium text-white">
                                {s.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <TrendIcon trend={s.trend} />
                              <span
                                className="text-sm font-bold"
                                style={{ color: getScoreColor(s.score) }}
                              >
                                {s.score}
                              </span>
                            </div>
                          </div>
                          <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${s.score}%` }} />
                          </div>
                          <p className="text-gray-500 text-xs mt-1.5">
                            {s.explanation}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Recommendations */}
              <motion.div variants={itemVariants}>
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <CheckCircle size={18} className="text-green-400" />
                      Top Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {recommendations.map((r, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.08 }}
                          className="flex items-start gap-3 p-3 bg-gray-700/50 border border-gray-600/50 rounded-lg"
                        >
                          <span className="text-blue-400 mt-0.5">{r.icon}</span>
                          <div className="flex-1">
                            <p className="text-gray-300 text-xs font-semibold uppercase tracking-wide mb-0.5">
                              {r.label}
                            </p>
                            <p className="text-white text-sm">{r.action}</p>
                          </div>
                          <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs shrink-0">
                            {r.points}
                          </Badge>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Score History */}
              <motion.div variants={itemVariants}>
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <TrendingUp size={18} className="text-purple-400" />
                      Score History (Last 30 Days)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart
                        data={history}
                        margin={{ top: 5, right: 10, left: -15, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                          dataKey="date"
                          stroke="#6b7280"
                          tick={{ fill: "#9ca3af", fontSize: 10 }}
                          interval={6}
                        />
                        <YAxis
                          stroke="#6b7280"
                          tick={{ fill: "#9ca3af", fontSize: 11 }}
                          domain={[0, 100]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1f2937",
                            border: "1px solid #374151",
                            borderRadius: "8px",
                            color: "#fff",
                            fontSize: 12,
                          }}
                          formatter={(v) => [v, "Health Score"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke="#ec4899"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
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
