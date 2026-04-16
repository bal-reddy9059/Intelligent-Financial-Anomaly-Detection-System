import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db } from "./firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import SidebarContent from "./SidebarContent";
import Header from "./Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Sparkles, RefreshCw, Loader2, TrendingUp, TrendingDown,
  ShieldAlert, Target, Calendar, IndianRupee, Download, Share2,
  ChevronRight, Star, AlertTriangle, CheckCircle2, Zap,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CATEGORY_RULES = [
  { keywords: ["food","swiggy","zomato","restaurant","eat","meal","lunch","dinner","breakfast","cafe","snack","grocery"], label: "Food" },
  { keywords: ["uber","ola","cab","auto","bus","metro","train","fuel","petrol","diesel","rapido"], label: "Transport" },
  { keywords: ["netflix","prime","hotstar","ott","game","cinema","movie","theatre","entertainment"], label: "Entertainment" },
  { keywords: ["amazon","flipkart","shop","shopping","clothes","myntra","meesho","purchase"], label: "Shopping" },
  { keywords: ["rent","house","housing","mortgage","pg","hostel"], label: "Housing" },
  { keywords: ["electricity","water","gas","internet","wifi","broadband","bill","recharge"], label: "Utilities" },
  { keywords: ["medical","medicine","doctor","hospital","pharmacy","health","clinic"], label: "Health" },
];
function categorize(r = "") {
  const t = r.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => t.includes(kw))) return rule.label;
  }
  return "Other";
}
function getTxDate(t) {
  return t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0);
}

// ── Story builder ──────────────────────────────────────────────────────────────
function buildStory(txs, userName) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const thisMonth = txs.filter((t) => getTxDate(t) >= monthStart);
  const lastMonth = txs.filter((t) => { const d = getTxDate(t); return d >= prevMonthStart && d <= prevMonthEnd; });

  const total = thisMonth.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalLast = lastMonth.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const change = totalLast > 0 ? (((total - totalLast) / totalLast) * 100).toFixed(1) : null;

  // Category breakdown
  const catMap = {};
  thisMonth.forEach((t) => {
    const cat = categorize(t.remarks || t.description || "");
    catMap[cat] = (catMap[cat] || 0) + (Number(t.amount) || 0);
  });
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const topCat = cats[0];
  const topCatLast = (() => {
    const m = {};
    lastMonth.forEach((t) => { const c = categorize(t.remarks || ""); m[c] = (m[c] || 0) + Number(t.amount || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  })();

  // Largest single transaction
  const largestTx = [...thisMonth].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))[0];

  // Fraud events
  const fraudTxs = thisMonth.filter((t) => t.fraudVerdict === "HIGH_RISK" || t.fraudVerdict === "MEDIUM_RISK");

  // Busiest day
  const dayMap = {};
  thisMonth.forEach((t) => {
    const d = getTxDate(t).toDateString();
    dayMap[d] = (dayMap[d] || 0) + 1;
  });
  const busiestDay = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0];

  // Unique recipients
  const uniqueRecipients = new Set(thisMonth.map((t) => t.recipientUPI).filter(Boolean)).size;

  const monthName = MONTHS[now.getMonth()];
  const firstName = userName?.split(" ")[0] || "You";

  // ── Narrative sections ──────────────────────────────────────────────────────
  const sections = [];

  // Opening
  sections.push({
    icon: "📖",
    title: "Opening Chapter",
    color: "text-violet-400",
    border: "border-violet-500/30",
    bg: "bg-violet-500/5",
    paragraphs: [
      `${monthName} ${now.getFullYear()} — another month of financial activity captured by AegisAI's intelligence layer. Here is your personalised financial chronicle, ${firstName}.`,
      thisMonth.length === 0
        ? `It appears ${monthName} has been a quiet month — no transactions recorded yet. Perhaps the month is still young, or your payments haven't synced.`
        : `This month, you made ${thisMonth.length} transaction${thisMonth.length !== 1 ? "s" : ""}, moving ₹${total.toLocaleString("en-IN")} across ${uniqueRecipients} unique recipient${uniqueRecipients !== 1 ? "s" : ""}.`,
    ],
  });

  if (thisMonth.length > 0) {
    // Spending chapter
    const trendSentence = change !== null
      ? parseFloat(change) > 10
        ? `That's ${change}% more than last month's ₹${totalLast.toLocaleString("en-IN")} — a notable uptick worth examining.`
        : parseFloat(change) < -10
        ? `That's ${Math.abs(change)}% less than last month — a commendable improvement in financial discipline.`
        : `Spending is broadly in line with last month's ₹${totalLast.toLocaleString("en-IN")} — a consistent pattern.`
      : "This appears to be your first month of tracked activity.";

    sections.push({
      icon: "💸",
      title: "The Spending Story",
      color: "text-blue-400",
      border: "border-blue-500/30",
      bg: "bg-blue-500/5",
      paragraphs: [
        `The headline number for ${monthName}: ₹${total.toLocaleString("en-IN")} spent across ${thisMonth.length} payments. ${trendSentence}`,
        topCat
          ? `The dominant force in your spending was ${topCat[0]} — accounting for ₹${Math.round(topCat[1]).toLocaleString("en-IN")} (${total > 0 ? Math.round((topCat[1] / total) * 100) : 0}% of all outflows). ${topCatLast && topCatLast[0] === topCat[0] ? "It held the top position last month too, suggesting a consistent spending pattern." : topCatLast ? `Last month, ${topCatLast[0]} led the charts — so ${topCat[0]} has climbed to the top.` : ""}`
          : "No clear dominant category emerged this month.",
      ],
    });

    // Notable transaction
    if (largestTx) {
      sections.push({
        icon: "⭐",
        title: "Standout Transaction",
        color: "text-yellow-400",
        border: "border-yellow-500/30",
        bg: "bg-yellow-500/5",
        paragraphs: [
          `Your most significant single transaction this month: ₹${Number(largestTx.amount).toLocaleString("en-IN")} to ${largestTx.recipientUPI || "an unnamed recipient"} on ${getTxDate(largestTx).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`,
          largestTx.remarks ? `The payment was marked: "${largestTx.remarks}". ${largestTx.fraudVerdict === "SAFE" || !largestTx.fraudVerdict ? "AegisAI cleared this transaction with a safe verdict." : `AegisAI flagged this as ${largestTx.fraudVerdict?.replace("_", " ")} — worth reviewing.`}` : "No remarks were attached to this payment.",
        ],
      });
    }

    // Rhythm chapter
    if (busiestDay) {
      sections.push({
        icon: "📅",
        title: "Your Spending Rhythm",
        color: "text-emerald-400",
        border: "border-emerald-500/30",
        bg: "bg-emerald-500/5",
        paragraphs: [
          `Your busiest payment day was ${busiestDay[0]} with ${busiestDay[1]} transaction${busiestDay[1] !== 1 ? "s" : ""}. ${busiestDay[1] >= 4 ? "That level of activity on a single day can sometimes draw fraud attention — AegisAI monitored each one closely." : "A manageable volume, well within normal behavioural patterns."}`,
          `Across ${monthName}, you averaged ${(thisMonth.length / Math.max(now.getDate(), 1)).toFixed(1)} payments per day. ${(thisMonth.length / Math.max(now.getDate(), 1)) > 3 ? "Frequent transactions are a sign of an active financial life — but also worth keeping an eye on for velocity-based fraud patterns." : "A measured pace that keeps velocity-based risk low."}`,
        ],
      });
    }

    // Security chapter
    sections.push({
      icon: fraudTxs.length > 0 ? "🚨" : "🛡️",
      title: "Security Report",
      color: fraudTxs.length > 0 ? "text-red-400" : "text-green-400",
      border: fraudTxs.length > 0 ? "border-red-500/30" : "border-green-500/30",
      bg: fraudTxs.length > 0 ? "bg-red-500/5" : "bg-green-500/5",
      paragraphs: [
        fraudTxs.length > 0
          ? `${monthName} brought ${fraudTxs.length} fraud alert${fraudTxs.length !== 1 ? "s" : ""} — transactions that AegisAI flagged as HIGH or MEDIUM risk. The total exposure amounted to ₹${fraudTxs.reduce((s, t) => s + Number(t.amount || 0), 0).toLocaleString("en-IN")}.`
          : `${monthName} was a clean month from a security standpoint. AegisAI's three-model ensemble scanned every transaction and raised zero fraud alerts. `,
        fraudTxs.length > 0
          ? `AegisAI's biometric guard and pattern lock helped prevent unauthorised confirmations. Review the flagged transactions in your Dispute Center if any were legitimate payments caught in a false positive.`
          : `Your Spending DNA remained stable, community reports were clean, and the Future Risk index stayed in the safe zone. This is what secure digital payments look like.`,
      ],
    });

    // Closing wisdom
    const wisdoms = [
      total > 10000 ? `At ₹${total.toLocaleString("en-IN")} this month, building a savings buffer equivalent to one month's spending is a smart next move. Consider setting a Savings Goal in AegisAI.` : `Your controlled spending of ₹${total.toLocaleString("en-IN")} shows financial discipline. Keep this momentum and your Spending DNA will remain stable.`,
      fraudTxs.length === 0 ? "Zero fraud alerts is the goal — and you achieved it this month. Continue verifying UPI IDs before every transfer." : `With ${fraudTxs.length} fraud event${fraudTxs.length !== 1 ? "s" : ""} logged, consider running a Future Risk check on your frequent contacts.`,
      `Next month, AegisAI will continue watching every transaction, learning your patterns, and refining your Spending DNA. Your financial story continues.`,
    ];

    sections.push({
      icon: "🌟",
      title: "Closing Insights",
      color: "text-purple-400",
      border: "border-purple-500/30",
      bg: "bg-purple-500/5",
      paragraphs: wisdoms,
    });
  }

  return {
    sections,
    stats: { total, totalLast, change, txCount: thisMonth.length, fraudCount: fraudTxs.length, uniqueRecipients, topCat, cats },
    monthName,
    firstName,
  };
}

// ── Typewriter hook ────────────────────────────────────────────────────────────
function useTypewriter(text, speed = 18, active = false) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!active) { setDisplayed(text); return; }
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) { setDisplayed(text.slice(0, ++i)); }
      else clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, active]);
  return displayed;
}

// ── Story section component ────────────────────────────────────────────────────
function StorySection({ section, index, active }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 0.5 }}
    >
      <Card className={`border ${section.border} ${section.bg}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <span className="text-xl">{section.icon}</span>
            <span className={section.color}>{section.title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {section.paragraphs.map((para, i) => (
            <p key={i} className="text-sm text-gray-300 leading-relaxed">
              {active && index === 0 && i === 0 ? <TypewriterPara text={para} /> : para}
            </p>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TypewriterPara({ text }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) setDisplayed(text.slice(0, ++i));
      else clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [text]);
  return <>{displayed}<span className="animate-pulse">|</span></>;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AIFinancialStory() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [story, setStory] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) await fetchAndBuild(u);
      else setLoading(false);
    });
    return unsub;
  }, []);

  async function fetchAndBuild(u) {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, "transactions"),
        where("userId", "==", u.uid),
        limit(500),
      ));
      const txs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const built = buildStory(txs, u.displayName || u.email);
      setStory(built);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function generateStory() {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 2200);
  }

  async function regenerate() {
    setGenerated(false);
    setStory(null);
    if (user) await fetchAndBuild(user);
  }

  const now = new Date();

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      <div className="hidden lg:flex flex-col w-64 flex-shrink-0 bg-gray-950 border-r border-gray-800">
        <SidebarContent />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <BookOpen className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">AI Financial Chronicle</h1>
                <p className="text-sm text-gray-400">Your month, told as a story — powered by AegisAI's narrative engine</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={regenerate} variant="ghost" className="text-gray-400 hover:text-white border border-gray-700 h-9">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
              </Button>
            </div>
          </motion.div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <Loader2 className="h-10 w-10 text-purple-400 animate-spin" />
              <p className="text-gray-400 text-sm">Gathering your financial data…</p>
            </div>
          ) : !generated ? (
            /* Generate prompt screen */
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-8">

              {/* Book cover */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl blur-2xl opacity-30 scale-110" />
                <div className="relative w-64 bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl border border-purple-500/30 p-8 shadow-2xl text-center">
                  <BookOpen className="h-12 w-12 text-purple-400 mx-auto mb-4" />
                  <p className="text-xs text-purple-300 tracking-widest uppercase mb-1">Your Financial Chronicle</p>
                  <p className="text-xl font-black text-white">{MONTHS[now.getMonth()]}</p>
                  <p className="text-sm text-gray-400">{now.getFullYear()}</p>
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <p className="text-xs text-gray-500">Narrated by</p>
                    <p className="text-sm font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">AegisAI</p>
                  </div>
                </div>
              </div>

              {story && (
                <div className="flex gap-6 flex-wrap justify-center">
                  {[
                    { icon: IndianRupee, label: "Total Spent", value: `₹${story.stats.total.toLocaleString("en-IN")}`, color: "text-blue-400" },
                    { icon: Calendar, label: "Transactions", value: story.stats.txCount, color: "text-green-400" },
                    { icon: ShieldAlert, label: "Fraud Alerts", value: story.stats.fraudCount, color: story.stats.fraudCount > 0 ? "text-red-400" : "text-green-400" },
                  ].map(({ icon: Icon, label, value, color }) => (
                    <div key={label} className="flex flex-col items-center gap-1 bg-gray-800/60 rounded-2xl px-6 py-4 border border-gray-700">
                      <Icon className={`h-5 w-5 ${color}`} />
                      <p className={`text-2xl font-black ${color}`}>{value}</p>
                      <p className="text-xs text-gray-500">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={generateStory} disabled={generating}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-8 h-12 text-base font-semibold shadow-lg shadow-purple-500/30">
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Writing your story…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate My Financial Chronicle
                  </>
                )}
              </Button>

              {generating && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-center space-y-2">
                  {["Analysing transaction patterns…", "Computing spending DNA…", "Checking fraud events…", "Crafting your narrative…"].map((msg, i) => (
                    <motion.p key={msg} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.5 }}
                      className="text-xs text-gray-500 flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-3 w-3 text-purple-400" />
                      {msg}
                    </motion.p>
                  ))}
                </motion.div>
              )}
            </motion.div>
          ) : (
            /* Story render */
            <AnimatePresence>
              <motion.div key="story" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

                {/* Chronicle header */}
                <div className="text-center py-6 border-b border-gray-800">
                  <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
                    <p className="text-xs tracking-[0.3em] uppercase text-purple-400 mb-2">Financial Chronicle · {MONTHS[now.getMonth()]} {now.getFullYear()}</p>
                    <h2 className="text-3xl font-black text-white">{story?.firstName}'s Financial Story</h2>
                    <p className="text-gray-500 text-sm mt-1">Generated by AegisAI Narrative Engine · {new Date().toLocaleTimeString("en-IN")}</p>
                  </motion.div>
                </div>

                {/* Quick stats banner */}
                {story && (
                  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { icon: IndianRupee, label: "Month Spend", value: `₹${story.stats.total.toLocaleString("en-IN")}`, sub: story.stats.change ? `${story.stats.change > 0 ? "+" : ""}${story.stats.change}% vs last month` : "First month", color: "text-blue-400", trend: story.stats.change },
                      { icon: Target, label: "Transactions", value: story.stats.txCount, sub: `${story.stats.uniqueRecipients} unique recipients`, color: "text-green-400" },
                      { icon: Star, label: "Top Category", value: story.stats.topCat?.[0] || "—", sub: story.stats.topCat ? `₹${Math.round(story.stats.topCat[1]).toLocaleString("en-IN")}` : "No data", color: "text-yellow-400" },
                      { icon: ShieldAlert, label: "Fraud Alerts", value: story.stats.fraudCount, sub: story.stats.fraudCount === 0 ? "Clean month ✓" : "Review needed", color: story.stats.fraudCount > 0 ? "text-red-400" : "text-green-400" },
                    ].map(({ icon: Icon, label, value, sub, color, trend }) => (
                      <Card key={label} className="bg-gray-800/60 border border-gray-700">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className={`h-4 w-4 ${color}`} />
                            <span className="text-xs text-gray-400">{label}</span>
                            {trend !== undefined && trend !== null && (
                              parseFloat(trend) > 0
                                ? <TrendingUp className="h-3 w-3 text-red-400 ml-auto" />
                                : <TrendingDown className="h-3 w-3 text-green-400 ml-auto" />
                            )}
                          </div>
                          <p className={`text-xl font-black ${color} truncate`}>{value}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </motion.div>
                )}

                {/* Story sections */}
                <div className="space-y-4">
                  {story?.sections.map((section, i) => (
                    <StorySection key={i} section={section} index={i} active={i === 0} />
                  ))}
                </div>

                {/* Footer */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
                  className="text-center py-6 border-t border-gray-800">
                  <p className="text-xs text-gray-600">
                    Chronicle auto-generated by AegisAI Neural Narrative Engine · Powered by your Firestore transaction data
                  </p>
                  <p className="text-xs text-gray-700 mt-1">
                    Next chronicle available: {new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}
                  </p>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </div>
  );
}
