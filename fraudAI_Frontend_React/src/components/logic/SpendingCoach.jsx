import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db } from "./firebase";
import {
  collection, query, where, getDocs, limit,
  serverTimestamp, doc, getDoc, setDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import SidebarContent from "./SidebarContent";
import Header from "./Header";
import {
  PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle, Lightbulb,
  Target, ShieldAlert, Send, Loader2, IndianRupee,
  Sparkles, MessageSquare, BarChart3, PieChart as PieIcon,
} from "lucide-react";

// ─── Category helpers ────────────────────────────────────────────────────────

const CATEGORY_RULES = [
  { keywords: ["rent", "house", "housing", "mortgage", "pg", "hostel"], label: "Housing",      color: "#3b82f6" },
  { keywords: ["grocery", "groceries", "food", "swiggy", "zomato", "restaurant", "eat", "meal", "lunch", "dinner", "breakfast", "cafe", "chai", "snack"], label: "Food", color: "#10b981" },
  { keywords: ["entertainment", "movie", "netflix", "prime", "hotstar", "ott", "game", "gaming", "cinema", "theatre", "concert", "sport"], label: "Entertainment", color: "#8b5cf6" },
  { keywords: ["utilities", "electricity", "water", "gas", "internet", "wifi", "broadband", "bill", "recharge"], label: "Utilities",      color: "#f59e0b" },
  { keywords: ["transport", "uber", "ola", "cab", "auto", "bus", "metro", "train", "fuel", "petrol", "diesel", "rapido"], label: "Transport", color: "#f97316" },
];
const OTHER_COLOR = "#6b7280";

function categorize(remarks = "") {
  const r = remarks.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => r.includes(kw))) return rule.label;
  }
  return "Other";
}

function categoryColor(label) {
  const rule = CATEGORY_RULES.find((r) => r.label === label);
  return rule ? rule.color : OTHER_COLOR;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Pre-built coach responses ────────────────────────────────────────────────

function buildCoachResponse(question, stats) {
  const { totalThisWeek, totalLastWeek, topCategory, fraudCount, categoryData } = stats;
  const change = totalLastWeek > 0 ? (((totalThisWeek - totalLastWeek) / totalLastWeek) * 100).toFixed(1) : 0;
  const topCatPct = totalThisWeek > 0 && categoryData.length > 0
    ? ((categoryData[0]?.value / totalThisWeek) * 100).toFixed(0) : 0;

  const responses = {
    "How can I save more?": totalThisWeek > 0
      ? `Based on your data, you've spent ₹${totalThisWeek.toLocaleString("en-IN")} this week. Your biggest category is ${topCategory} (${topCatPct}% of spending). Try capping ${topCategory} expenses — even a 20% cut could save ₹${Math.round(totalThisWeek * 0.2).toLocaleString("en-IN")} monthly. I also suggest turning on UPI spend limits for non-essential categories.`
      : "I don't have enough transaction data yet. Make sure your transactions are synced and try again!",

    "Am I on track?": totalThisWeek > 0
      ? change > 15
        ? `Not quite — your spending is up ${change}% compared to last week (₹${totalThisWeek.toLocaleString("en-IN")} vs ₹${totalLastWeek.toLocaleString("en-IN")}). The main driver is ${topCategory}. I'd recommend setting a weekly budget of ₹${Math.round(totalLastWeek * 1.05).toLocaleString("en-IN")} to stay close to your baseline.`
        : change < -5
          ? `Great job! You're spending ${Math.abs(change)}% less than last week. Keep it up — consistency is key to building long-term savings habits.`
          : `You're roughly on track. Weekly spend is ₹${totalThisWeek.toLocaleString("en-IN")}, almost the same as last week. Focus on maintaining this pattern!`
      : "Sync your transactions so I can track your weekly progress accurately.",

    "Biggest risk this week?": fraudCount > 0
      ? `You had ${fraudCount} fraud alert${fraudCount > 1 ? "s" : ""} this week — that's your biggest risk. Review those transactions immediately in the Fraud Alerts section. Also, ${topCategory} spending at ${topCatPct}% of your budget is unusually high and worth monitoring.`
      : `No fraud alerts this week — good! Your biggest financial risk is ${topCategory} spending at ${topCatPct}% of total outflow. Diversify your expense categories to maintain a healthier financial profile.`,
  };

  const q = question.trim();
  if (responses[q]) return responses[q];

  // Fallback smart response
  if (q.toLowerCase().includes("fraud") || q.toLowerCase().includes("safe"))
    return fraudCount > 0
      ? `You have ${fraudCount} fraud alert(s) this week. Please review them in the Fraud Alerts section immediately. Always verify UPI requests from unknown IDs.`
      : "No fraud alerts detected this week. Keep using AegisAI's real-time scanning for every transaction!";

  if (q.toLowerCase().includes("budget"))
    return `Based on your last 4 weeks of spending, I suggest a weekly budget of ₹${Math.round((totalThisWeek + totalLastWeek) / 2 * 0.95).toLocaleString("en-IN")}. Break it down: ${categoryData.slice(0, 3).map((c) => `${c.name} ₹${Math.round(c.value * 0.95).toLocaleString("en-IN")}`).join(", ")}.`;

  return `Great question! Looking at your data: you spent ₹${totalThisWeek.toLocaleString("en-IN")} this week across ${categoryData.length} categories. Your top area is ${topCategory}. Would you like a detailed breakdown or tips on any specific category?`;
}

// ─── Insight generator ────────────────────────────────────────────────────────

function generateInsights(transactions, categoryData, weeklyTrend) {
  const insights = [];
  const total = categoryData.reduce((s, c) => s + c.value, 0);

  // Weekend spike
  const weekendTxs  = transactions.filter((t) => { const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt); return d.getDay() === 0 || d.getDay() === 6; });
  const weekdayTxs  = transactions.filter((t) => { const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt); return d.getDay() > 0 && d.getDay() < 6; });
  const weekendAvg  = weekendTxs.length > 0 ? weekendTxs.reduce((s, t) => s + (t.amount || 0), 0) / Math.max(1, weekendTxs.length) : 0;
  const weekdayAvg  = weekdayTxs.length > 0 ? weekdayTxs.reduce((s, t) => s + (t.amount || 0), 0) / Math.max(1, weekdayTxs.length) : 0;
  if (weekendAvg > weekdayAvg * 1.5 && weekendTxs.length >= 2) {
    insights.push({
      icon: TrendingUp,
      title: "Weekend Spending Spike",
      message: `You spend ${(weekendAvg / Math.max(weekdayAvg, 1)).toFixed(1)}x more per transaction on weekends. Consider setting a weekend budget limit of ₹${Math.round(weekdayAvg * 1.2).toLocaleString("en-IN")} per transaction.`,
      severity: "warning",
    });
  }

  // Category dominance
  if (categoryData.length > 0) {
    const top = categoryData[0];
    const pct = total > 0 ? (top.value / total) * 100 : 0;
    if (pct > 40) {
      insights.push({
        icon: AlertTriangle,
        title: `${top.name} Dominating Budget`,
        message: `${top.name} accounts for ${pct.toFixed(0)}% of your spending (₹${top.value.toLocaleString("en-IN")}). A healthy budget keeps any single category below 40%. Consider trimming here.`,
        severity: "alert",
      });
    }
  }

  // Fraud exposure
  const fraudTxs = transactions.filter((t) => t.fraudVerdict === "HIGH_RISK" || t.fraudVerdict === "MEDIUM_RISK" || t.isFraud === true || t.fraudFlag === true);
  if (fraudTxs.length > 0) {
    const exposure = fraudTxs.reduce((s, t) => s + (t.amount || 0), 0);
    insights.push({
      icon: ShieldAlert,
      title: "Fraud Exposure Detected",
      message: `${fraudTxs.length} suspicious transaction${fraudTxs.length > 1 ? "s" : ""} flagged this week, totalling ₹${exposure.toLocaleString("en-IN")}. Review and dispute if needed.`,
      severity: "alert",
    });
  }

  // Positive trend
  if (weeklyTrend.length >= 5) {
    const last3 = weeklyTrend.slice(-3).reduce((s, d) => s + d.amount, 0) / 3;
    const first3 = weeklyTrend.slice(0, 3).reduce((s, d) => s + d.amount, 0) / 3;
    if (last3 < first3 * 0.85) {
      insights.push({
        icon: Target,
        title: "Great Spending Discipline!",
        message: `Your daily spending dropped by ${((1 - last3 / Math.max(first3, 1)) * 100).toFixed(0)}% over the past week. Keep up the momentum — you're building excellent financial habits.`,
        severity: "tip",
      });
    }
  }

  // Recurring payments tip
  const amounts = transactions.map((t) => t.amount || 0);
  const freq = {};
  amounts.forEach((a) => { freq[a] = (freq[a] || 0) + 1; });
  const recurring = Object.entries(freq).filter(([, cnt]) => cnt >= 3);
  if (recurring.length > 0) {
    insights.push({
      icon: Lightbulb,
      title: "Recurring Payments Detected",
      message: `You have ${recurring.length} amount${recurring.length > 1 ? "s" : ""} appearing 3+ times. Review these for unwanted subscriptions — cancelling even one unused service can save ₹${Math.round(parseFloat(recurring[0][0]) * 12).toLocaleString("en-IN")} a year.`,
      severity: "tip",
    });
  }

  // Default tip
  if (insights.length === 0) {
    insights.push({
      icon: Lightbulb,
      title: "Start Tracking More",
      message: "Add more transactions to unlock personalised AI insights. The more data AegisAI has, the smarter your coaching becomes.",
      severity: "tip",
    });
  }

  return insights;
}

// ─── Severity styling ─────────────────────────────────────────────────────────

const SEVERITY = {
  tip:     { badge: "bg-blue-500/20 text-blue-300 border-blue-500/40",   border: "border-blue-500/30",   bg: "bg-blue-500/5",   icon: "text-blue-400"   },
  warning: { badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", border: "border-yellow-500/30", bg: "bg-yellow-500/5", icon: "text-yellow-400" },
  alert:   { badge: "bg-red-500/20 text-red-300 border-red-500/40",      border: "border-red-500/30",    bg: "bg-red-500/5",    icon: "text-red-400"    },
};

// ─── Custom tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      <p className="text-white font-semibold">₹{payload[0].value?.toLocaleString("en-IN")}</p>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function SpendingCoach() {
  const [user, setUser]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [categoryData, setCategoryData] = useState([]);
  const [weeklyTrend, setWeeklyTrend]   = useState([]);
  const [insights, setInsights]         = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput]       = useState("");
  const [generating, setGenerating]     = useState(false);
  const [txCount, setTxCount]           = useState(0);
  const chatEndRef = useRef(null);

  // Weekly summary stats (derived)
  const [weeklyStats, setWeeklyStats] = useState({
    totalThisWeek: 0, totalLastWeek: 0,
    topCategory: "—", fraudCount: 0,
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) fetchData(u);
      else setLoading(false);
    });
    return unsub;
  }, []);

  // ── Fetch & compute ───────────────────────────────────────────────────────

  async function fetchData(u) {
    setLoading(true);
    try {
      // Get user's UPI ID from profile for fallback query
      let userUpiId = null;
      try {
        const userDoc = await getDoc(doc(db, "users", u.uid));
        if (userDoc.exists()) userUpiId = userDoc.data().upiId || null;
      } catch (_) {}

      // Primary: query by userId field
      const byUserId = query(
        collection(db, "transactions"),
        where("userId", "==", u.uid),
        limit(500),
      );
      const snap1 = await getDocs(byUserId);
      let txs = snap1.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Fallback: also query by senderUPI (catches older txns without userId field)
      if (userUpiId) {
        try {
          const byUpi = query(
            collection(db, "transactions"),
            where("senderUPI", "==", userUpiId),
            limit(500),
          );
          const snap2 = await getDocs(byUpi);
          const upiTxs = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
          // Merge, deduplicate by id
          const ids = new Set(txs.map((t) => t.id));
          upiTxs.forEach((t) => { if (!ids.has(t.id)) txs.push(t); });
        } catch (_) {}
      }

      // Sort client-side by createdAt descending
      txs.sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return tb - ta;
      });

      computeAll(txs);
    } catch (err) {
      console.error("SpendingCoach fetch error:", err);
      setLoading(false);
    }

    // Load chat history
    try {
      const chatDoc = await getDoc(doc(db, "coachChats", u.uid));
      if (chatDoc.exists()) {
        const saved = chatDoc.data().messages || [];
        setChatMessages(saved.slice(-30)); // last 30 messages
      }
    } catch (_) { /* ignore */ }
  }

  function computeAll(txs) {
    const getTxDate = (t) => t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0);

    const weekStart     = startOfDay(daysAgo(6));
    const lastWeekStart = startOfDay(daysAgo(13));

    const thisWeekTxs = txs.filter((t) => getTxDate(t) >= weekStart);
    const lastWeekTxs = txs.filter((t) => { const d = getTxDate(t); return d >= lastWeekStart && d < weekStart; });

    const totalThisWeek = thisWeekTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalLastWeek = lastWeekTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);

    // Category breakdown — use all fetched txs so chart always has data
    const sourceTxs = thisWeekTxs.length > 0 ? thisWeekTxs : txs;
    const catMap = {};
    sourceTxs.forEach((t) => {
      const cat = categorize(t.remarks || t.description || t.note || "");
      catMap[cat] = (catMap[cat] || 0) + (Number(t.amount) || 0);
    });
    const catArr = Object.entries(catMap)
      .map(([name, value]) => ({ name, value: Math.round(value), color: categoryColor(name) }))
      .sort((a, b) => b.value - a.value);
    setCategoryData(catArr);

    const topCategory = catArr[0]?.name || "—";

    // Fraud count — check fraudVerdict field (actual field used in this app)
    const fraudCount = thisWeekTxs.filter(
      (t) => t.fraudVerdict === "HIGH_RISK" || t.fraudVerdict === "MEDIUM_RISK"
    ).length;

    setWeeklyStats({ totalThisWeek, totalLastWeek, topCategory, fraudCount });

    // 7-day trend
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = startOfDay(daysAgo(i));
      const dayEnd   = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dayTotal = txs
        .filter((t) => { const d = getTxDate(t); return d >= dayStart && d < dayEnd; })
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
      trend.push({ day: DAY_LABELS[dayStart.getDay()], amount: Math.round(dayTotal) });
    }
    setWeeklyTrend(trend);

    // Insights
    setInsights(generateInsights(txs, catArr, trend));
    setTxCount(txs.length);
    setLoading(false);
  }

  // ── Chat helpers ──────────────────────────────────────────────────────────

  async function saveChat(messages) {
    if (!user) return;
    try {
      await setDoc(doc(db, "coachChats", user.uid), { messages, updatedAt: serverTimestamp() }, { merge: true });
    } catch (_) { /* ignore */ }
  }

  async function sendMessage(text) {
    const q = text.trim();
    if (!q) return;
    setChatInput("");
    setGenerating(true);

    const userMsg = { role: "user", text: q, ts: Date.now() };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);

    // Simulate a brief typing delay
    await new Promise((r) => setTimeout(r, 1200));

    const response = buildCoachResponse(q, { ...weeklyStats, weeklyTrend, categoryData });
    const aiMsg = { role: "ai", text: response, ts: Date.now() };
    const final = [...updated, aiMsg];
    setChatMessages(final);
    await saveChat(final);
    setGenerating(false);
  }

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, generating]);

  // ── Derived display values ────────────────────────────────────────────────

  const { totalThisWeek, totalLastWeek, topCategory, fraudCount } = weeklyStats;
  const pctChange = totalLastWeek > 0
    ? (((totalThisWeek - totalLastWeek) / totalLastWeek) * 100).toFixed(1)
    : null;
  const spendUp = pctChange !== null && parseFloat(pctChange) > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex flex-col w-64 flex-shrink-0 bg-gray-950 border-r border-gray-800">
        <SidebarContent />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-8">

          {/* ── Page Header ──────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Brain className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-white">AI Spending Coach</h1>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40">BETA</span>
                </div>
                <p className="text-sm text-gray-400 mt-0.5">
                  Powered by AI analysis of your payment patterns
                  {!loading && <span className="ml-2 text-xs text-gray-600">({txCount} transactions loaded)</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              <span>Personalised insights updated in real-time</span>
            </div>
          </motion.div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="h-10 w-10 text-violet-400 animate-spin" />
              <p className="text-gray-400 text-sm">Analysing your spending patterns…</p>
            </div>
          ) : (
            <>
              {/* ── Weekly Summary Cards ──────────────────────────────── */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="grid grid-cols-2 lg:grid-cols-4 gap-4">

                {/* Total This Week */}
                <Card className="bg-gray-800/60 border border-gray-700 hover:border-violet-500/40 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-gray-400 font-medium">Total Spent This Week</span>
                      <IndianRupee className="h-4 w-4 text-violet-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">₹{totalThisWeek.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-gray-500 mt-1">Last 7 days</p>
                  </CardContent>
                </Card>

                {/* vs Last Week */}
                <Card className="bg-gray-800/60 border border-gray-700 hover:border-violet-500/40 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-gray-400 font-medium">vs Last Week</span>
                      {spendUp
                        ? <TrendingUp className="h-4 w-4 text-red-400" />
                        : <TrendingDown className="h-4 w-4 text-green-400" />}
                    </div>
                    <p className={`text-2xl font-bold ${spendUp ? "text-red-400" : "text-green-400"}`}>
                      {pctChange !== null ? `${spendUp ? "+" : ""}${pctChange}%` : "—"}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {totalLastWeek > 0 ? `Was ₹${totalLastWeek.toLocaleString("en-IN")}` : "No data last week"}
                    </p>
                  </CardContent>
                </Card>

                {/* Top Category */}
                <Card className="bg-gray-800/60 border border-gray-700 hover:border-violet-500/40 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-gray-400 font-medium">Top Category</span>
                      <BarChart3 className="h-4 w-4 text-blue-400" />
                    </div>
                    <p className="text-2xl font-bold text-white truncate">{topCategory}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {categoryData[0] ? `₹${categoryData[0].value.toLocaleString("en-IN")}` : "No data"}
                    </p>
                  </CardContent>
                </Card>

                {/* Fraud Alerts */}
                <Card className={`bg-gray-800/60 border transition-colors ${fraudCount > 0 ? "border-red-500/40 hover:border-red-500/60" : "border-gray-700 hover:border-violet-500/40"}`}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-gray-400 font-medium">Fraud Alerts This Week</span>
                      <ShieldAlert className={`h-4 w-4 ${fraudCount > 0 ? "text-red-400" : "text-green-400"}`} />
                    </div>
                    <p className={`text-2xl font-bold ${fraudCount > 0 ? "text-red-400" : "text-green-400"}`}>{fraudCount}</p>
                    <p className="text-xs text-gray-500 mt-1">{fraudCount === 0 ? "All clear" : "Needs review"}</p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* ── Charts Row ────────────────────────────────────────── */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Pie chart */}
                <Card className="bg-gray-800/60 border border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <PieIcon className="h-4 w-4 text-violet-400" />
                      Spending by Category
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {categoryData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-56 gap-2">
                        <PieIcon className="h-8 w-8 text-gray-600" />
                        <p className="text-gray-500 text-sm">No spending data found</p>
                        <p className="text-gray-600 text-xs">Make a payment to see your breakdown</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={95}
                            dataKey="value" paddingAngle={3} stroke="none">
                            {categoryData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v) => [`₹${v.toLocaleString("en-IN")}`, "Spent"]}
                            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#fff" }}
                          />
                          <Legend
                            formatter={(value) => <span style={{ color: "#9ca3af", fontSize: 12 }}>{value}</span>}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* 7-day area chart */}
                <Card className="bg-gray-800/60 border border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-400" />
                      7-Day Spending Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {weeklyTrend.length === 0 || weeklyTrend.every((d) => d.amount === 0) ? (
                      <div className="flex flex-col items-center justify-center h-56 gap-2">
                        <TrendingUp className="h-8 w-8 text-gray-600" />
                        <p className="text-gray-500 text-sm">No activity in the last 7 days</p>
                        <p className="text-gray-600 text-xs">Your spending trend will appear here</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={weeklyTrend} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="coachGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false}
                            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" dataKey="amount" stroke="#8b5cf6" strokeWidth={2.5}
                            fill="url(#coachGrad)" dot={{ fill: "#8b5cf6", r: 4 }} activeDot={{ r: 6 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* ── AI Coaching Insights ──────────────────────────────── */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="h-5 w-5 text-violet-400" />
                  <h2 className="text-lg font-semibold text-white">AI Coaching Insights</h2>
                  <span className="text-xs text-gray-500 ml-1">{insights.length} insight{insights.length !== 1 ? "s" : ""} generated</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {insights.map((ins, i) => {
                    const sty = SEVERITY[ins.severity] || SEVERITY.tip;
                    const Icon = ins.icon;
                    return (
                      <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }}>
                        <Card className={`border ${sty.border} ${sty.bg} bg-gray-800/50 h-full`}>
                          <CardContent className="p-4 flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className={`w-9 h-9 rounded-lg bg-gray-700/60 flex items-center justify-center flex-shrink-0`}>
                                <Icon className={`h-4.5 w-4.5 ${sty.icon}`} />
                              </div>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${sty.badge}`}>
                                {ins.severity}
                              </span>
                            </div>
                            <div>
                              <p className="font-semibold text-white text-sm mb-1">{ins.title}</p>
                              <p className="text-gray-400 text-xs leading-relaxed">{ins.message}</p>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>

              {/* ── Coach Chat ────────────────────────────────────────── */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <Card className="bg-gray-800/60 border border-gray-700">
                  <CardHeader className="pb-3 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center flex-shrink-0">
                        <Brain className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          Coach Chat
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        </CardTitle>
                        <p className="text-xs text-gray-400">Ask anything about your spending</p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 flex flex-col gap-4">
                    {/* Quick questions */}
                    <div className="flex flex-wrap gap-2">
                      {["How can I save more?", "Am I on track?", "Biggest risk this week?"].map((q) => (
                        <button key={q} onClick={() => sendMessage(q)} disabled={generating}
                          className="text-xs px-3 py-1.5 rounded-full bg-gray-700/60 border border-gray-600 text-gray-300 hover:bg-violet-600/20 hover:border-violet-500/50 hover:text-violet-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                          {q}
                        </button>
                      ))}
                    </div>

                    {/* Chat window */}
                    <div className="h-72 overflow-y-auto flex flex-col gap-3 pr-1 scroll-smooth">
                      {chatMessages.length === 0 && !generating && (
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600">
                          <MessageSquare className="h-8 w-8" />
                          <p className="text-sm">Ask a quick question or pick one above</p>
                        </div>
                      )}

                      <AnimatePresence initial={false}>
                        {chatMessages.map((msg, i) => (
                          <motion.div key={i}
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            {msg.role === "ai" && (
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Brain className="h-3.5 w-3.5 text-white" />
                              </div>
                            )}
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                              ${msg.role === "user"
                                ? "bg-violet-600 text-white rounded-tr-sm"
                                : "bg-gray-700/70 text-gray-200 rounded-tl-sm"}`}>
                              {msg.text}
                            </div>
                          </motion.div>
                        ))}

                        {/* Typing indicator */}
                        {generating && (
                          <motion.div key="typing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            className="flex gap-2.5 justify-start">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Brain className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div className="bg-gray-700/70 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    <form onSubmit={(e) => { e.preventDefault(); sendMessage(chatInput); }}
                      className="flex gap-2 mt-1">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Ask your coach anything…"
                        disabled={generating}
                        className="flex-1 bg-gray-700/60 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/30 transition disabled:opacity-50"
                      />
                      <button type="submit" disabled={generating || !chatInput.trim()}
                        className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0">
                        {generating
                          ? <Loader2 className="h-4 w-4 text-white animate-spin" />
                          : <Send className="h-4 w-4 text-white" />}
                      </button>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
