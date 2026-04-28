import { useState, useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import {
  Send, TrendingUp, ShieldAlert,
  Wallet, AlertTriangle, BarChart2, RefreshCw, User,
  Sparkles, ArrowRight,
} from "lucide-react";

// ── Quick actions ─────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: TrendingUp,    label: "Spending summary",        q: "spending",     color: "from-blue-500 to-violet-500" },
  { icon: ShieldAlert,   label: "Fraud risk",              q: "fraud",        color: "from-red-500 to-rose-500" },
  { icon: Wallet,        label: "Budget health",           q: "budget",       color: "from-yellow-500 to-orange-500" },
  { icon: AlertTriangle, label: "Suspicious transactions", q: "suspicious",   color: "from-orange-500 to-red-500" },
  { icon: BarChart2,     label: "Top categories",          q: "categories",   color: "from-purple-500 to-pink-500" },
  { icon: Sparkles,      label: "Financial advice",        q: "advice",       color: "from-emerald-500 to-teal-500" },
];

// ── Load real user data from Firestore ────────────────────────────────────────
async function loadCtx(uid) {
  const snap     = await getDoc(doc(db, "users", uid));
  const userData = snap.exists() ? snap.data() : {};
  const upiId    = userData.upiId || "";
  const budgets  = userData.budgets || {};
  const balance  = userData.balance || 50000;
  const name     = userData.displayName || "";

  let txns = [];
  if (upiId) {
    const q  = query(collection(db, "transactions"), where("senderUPI", "==", upiId));
    const s  = await getDocs(q);
    txns     = s.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }

  const now    = new Date();
  const month  = txns.filter(tx => {
    if (!tx.createdAt) return false;
    const d = new Date(tx.createdAt.seconds * 1000);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const prev   = txns.filter(tx => {
    if (!tx.createdAt) return false;
    const d = new Date(tx.createdAt.seconds * 1000);
    const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() === pm.getMonth() && d.getFullYear() === pm.getFullYear();
  });

  const spent      = month.reduce((s, t) => s + (t.amount || 0), 0);
  const prevSpent  = prev.reduce((s, t) => s + (t.amount || 0), 0);
  const flagged    = txns.filter(t => t.fraudVerdict && t.fraudVerdict !== "SAFE");
  const recentFlag = flagged.filter(t => t.createdAt && Date.now() - t.createdAt.seconds * 1000 < 7 * 86400e3);

  const catMap = {};
  month.forEach(tx => {
    const c = (tx.remarks || "other");
    const key = c.charAt(0).toUpperCase() + c.slice(1);
    catMap[key] = (catMap[key] || 0) + (tx.amount || 0);
  });
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  const recipients    = [...new Set(month.map(t => t.recipientUPI).filter(Boolean))];
  const newRecipients = recipients.filter(r => !prev.some(t => t.recipientUPI === r));

  const dayOfMonth = now.getDate();
  const dailyAvg   = dayOfMonth > 0 ? spent / dayOfMonth : 0;
  const projected  = dailyAvg * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  let civilScore = 750;
  civilScore -= flagged.length * 15;
  civilScore -= recentFlag.length * 25;
  if (spent > balance * 0.8) civilScore -= 30;
  if (txns.length > 20) civilScore += 20;
  civilScore = Math.max(300, Math.min(900, civilScore));

  return {
    name, upiId, balance, budgets, txns, month, prev,
    spent, prevSpent, flagged, recentFlag, cats, catMap,
    recipients, newRecipients, dailyAvg, projected, civilScore,
  };
}

// ── Local AI engine ────────────────────────────────────────────────────────────
function smartReply(input, ctx) {
  if (!ctx) return "⏳ Still loading your financial data. Please try again in a moment.";

  const q = input.toLowerCase();
  const {
    name, balance, budgets, txns, month, spent, prevSpent,
    flagged, recentFlag, cats, catMap, dailyAvg, projected,
    newRecipients, civilScore,
  } = ctx;

  const monthName = new Date().toLocaleString("default", { month: "long" });
  const hi = name ? name.split(" ")[0] : "";

  if (/^(hi|hello|hey|good\s*(morning|evening|afternoon)|namaste)/i.test(q)) {
    return `👋 Hello${hi ? ` ${hi}` : ""}! I'm your SafePayAI financial assistant.\n\nI can help you with:\n• 📊 Spending & transaction analysis\n• 🛡️ Fraud risk assessment\n• 💰 Budget tracking\n• 📈 Financial health & civil score\n• 💡 Personalized savings tips\n\nWhat would you like to know today?`;
  }

  if (q.includes("civil") || q.includes("credit score") || q.includes("cibil") || q.includes("score")) {
    const level = civilScore >= 750 ? "Excellent 🟢" : civilScore >= 650 ? "Good 🟡" : civilScore >= 550 ? "Fair 🟠" : "Poor 🔴";
    return `📈 Your SafePayAI Financial Score: **${civilScore}/900** — ${level}\n\n` +
      `How it's calculated:\n` +
      `• 🔴 Fraud flags: -${flagged.length * 15} pts (${flagged.length} flagged)\n` +
      `• ⚠️ Recent alerts: -${recentFlag.length * 25} pts (last 7 days)\n` +
      `• 💸 Spending ratio: ${spent > balance * 0.8 ? "-30 pts (high spending)" : "✅ healthy"}\n` +
      `• 📋 Transaction history: +${Math.min(txns.length, 20)} pts\n\n` +
      (civilScore >= 750
        ? "✅ Excellent! Keep maintaining low fraud risk and controlled spending."
        : civilScore >= 650
        ? "💡 Good score. Reduce flagged transactions to improve further."
        : "⚠️ Your score needs attention. Review flagged transactions and reduce overspending.");
  }

  if (q.includes("balance") || q.includes("how much") && q.includes("have")) {
    const statusMsg = balance > 10000 ? "✅ Healthy balance." : balance > 3000 ? "⚠️ Moderate balance — monitor spending." : "🔴 Low balance — be careful with expenses.";
    return `💳 Your current account balance: **₹${balance.toLocaleString("en-IN")}**\n\n${statusMsg}\n\n• This month's spending: ₹${spent.toFixed(0)}\n• Remaining after spending: ₹${(balance - spent).toLocaleString("en-IN")}`;
  }

  if (q.includes("spend") || q.includes("summary") || q.includes("this month") || q === "spending") {
    const change = prevSpent > 0 ? (((spent - prevSpent) / prevSpent) * 100).toFixed(1) : null;
    const trend  = change === null ? "" : parseFloat(change) > 0 ? `📈 Up ${change}% from last month.` : `📉 Down ${Math.abs(change)}% from last month — great job!`;
    return `📊 **${monthName} Spending Report**\n\n` +
      `• Total spent: ₹${spent.toFixed(0)}\n` +
      `• Transactions: ${month.length}\n` +
      `• Daily average: ₹${dailyAvg.toFixed(0)}/day\n` +
      `• Projected month-end: ₹${projected.toFixed(0)}\n` +
      `• Account balance: ₹${balance.toLocaleString("en-IN")}\n\n` +
      (trend ? trend + "\n\n" : "") +
      (cats.length > 0 ? `Top category: ${cats[0][0]} (₹${cats[0][1].toFixed(0)})` : "No category data yet.") +
      (projected > balance * 0.9 ? "\n\n⚠️ Warning: Projected spending may exceed 90% of your balance!" : "");
  }

  if (q.includes("fraud") || q.includes("risk") || q.includes("safe") || q === "fraud") {
    const rate  = txns.length > 0 ? ((flagged.length / txns.length) * 100).toFixed(1) : 0;
    const risk  = flagged.length >= 3 || recentFlag.length >= 1 ? "HIGH 🔴" : flagged.length >= 1 ? "MEDIUM 🟡" : "LOW 🟢";
    const txDetails = flagged.slice(0, 3).map(tx => {
      const date = tx.createdAt ? new Date(tx.createdAt.seconds * 1000).toLocaleDateString("en-IN") : "Unknown";
      return `  • ₹${tx.amount} to ${tx.recipientUPI} on ${date}`;
    }).join("\n");
    return `🛡️ **Fraud Risk Assessment: ${risk}**\n\n` +
      `• Total transactions: ${txns.length}\n` +
      `• AI-flagged: ${flagged.length} (${rate}%)\n` +
      `• Flagged last 7 days: ${recentFlag.length}\n` +
      `• New recipients this month: ${newRecipients.length}\n\n` +
      (flagged.length > 0 ? `Recent flagged transactions:\n${txDetails}\n\n` : "") +
      (risk.includes("HIGH")
        ? "⚠️ High risk detected! Review flagged transactions immediately."
        : risk.includes("MEDIUM")
        ? "💡 Some transactions raised AI flags. Review them in the Transactions page."
        : "✅ No significant fraud risk. Keep verifying new recipients before sending large amounts.");
  }

  if (q.includes("budget") || q.includes("limit") || q === "budget") {
    if (Object.keys(budgets).length === 0) {
      return "📋 You haven't set any budget limits yet.\n\nGo to **Budget** in the sidebar to set monthly limits per category. I'll then track your spending vs limits in real time!";
    }
    const lines = Object.entries(budgets).map(([cat, limit]) => {
      const lim   = parseFloat(limit) || 0;
      const s     = catMap[cat] || 0;
      const pct   = lim > 0 ? ((s / lim) * 100).toFixed(0) : 0;
      const bar   = lim > 0 ? (s > lim ? "🔴 Over!" : s > lim * 0.8 ? "🟡 Near limit" : "🟢 On track") : "—";
      return `• ${cat}: ₹${s.toFixed(0)} / ₹${lim} (${pct}%) ${bar}`;
    });
    const overBudget = Object.entries(budgets).filter(([cat, lim]) => (catMap[cat] || 0) > parseFloat(lim));
    return `💰 **Budget Health Report — ${monthName}**\n\n${lines.join("\n")}\n\n` +
      (overBudget.length > 0
        ? `⚠️ Over budget in: ${overBudget.map(([c]) => c).join(", ")}. Consider cutting back.`
        : "✅ All budgets on track! Great financial discipline.");
  }

  if (q.includes("suspicious") || q.includes("flagged") || q.includes("alert") || q === "suspicious") {
    if (flagged.length === 0) return "✅ No suspicious transactions found! Your account looks clean and secure.";
    const list = flagged.slice(0, 5).map(tx => {
      const date = tx.createdAt ? new Date(tx.createdAt.seconds * 1000).toLocaleDateString("en-IN") : "Unknown";
      return `• ₹${tx.amount} → ${tx.recipientUPI} | ${date} | ${tx.fraudVerdict}`;
    }).join("\n");
    return `🚨 **${flagged.length} Suspicious Transaction(s) Found:**\n\n${list}\n\n${flagged.length > 5 ? `...and ${flagged.length - 5} more.\n\n` : ""}Go to **Transactions** page to review and report any you didn't initiate.`;
  }

  if (q.includes("categor") || q.includes("top") || q.includes("where") || q === "categories") {
    if (cats.length === 0) return "📂 No transactions recorded this month yet. Make a payment and I'll analyze your spending!";
    const list = cats.slice(0, 6).map(([cat, amt], i) => `${i + 1}. ${cat}: ₹${amt.toFixed(0)} (${spent > 0 ? ((amt / spent) * 100).toFixed(0) : 0}%)`).join("\n");
    return `📂 **Top Spending Categories — ${monthName}:**\n\n${list}\n\nTotal: ₹${spent.toFixed(0)} across ${month.length} transactions.`;
  }

  if (q.includes("advice") || q.includes("tip") || q.includes("save") || q.includes("saving") || q.includes("suggest") || q === "advice") {
    const tips = [];
    if (spent > balance * 0.5) tips.push("💡 You've spent over 50% of balance — try the 50/30/20 rule: 50% needs, 30% wants, 20% savings.");
    if (cats[0]?.[0] === "Entertainment" && cats[0][1] > 2000) tips.push("🎬 Entertainment is your top expense. Consider setting a ₹2000/month cap.");
    if (newRecipients.length > 3) tips.push(`⚠️ You've sent to ${newRecipients.length} new UPI IDs this month — always verify before sending.`);
    if (month.length > 20) tips.push("📱 High transaction frequency. Consider batching small payments to save time.");
    if (flagged.length > 0) tips.push("🛡️ Review your flagged transactions to avoid potential fraud loss.");
    if (Object.keys(budgets).length === 0) tips.push("📋 Set monthly budgets in the Budget page to automatically track limits.");
    if (tips.length === 0) tips.push("✅ You're managing your finances well!", "💰 Consider setting savings goals in the Budget section.", "📊 Review your spending categories monthly to spot trends early.");
    return `💡 **Personalized Financial Advice:**\n\n${tips.join("\n")}\n\n📈 Your financial score: ${civilScore}/900`;
  }

  if (q.includes("recent") || q.includes("last") || q.includes("transaction") || q.includes("history") || q.includes("payment")) {
    if (txns.length === 0) return "📋 No transactions found yet. Make your first payment to get started!";
    const list = txns.slice(0, 5).map(tx => {
      const date = tx.createdAt ? new Date(tx.createdAt.seconds * 1000).toLocaleDateString("en-IN") : "—";
      const flag = tx.fraudVerdict && tx.fraudVerdict !== "SAFE" ? " ⚠️" : "";
      return `• ₹${tx.amount} → ${tx.recipientUPI} | ${tx.remarks || "Other"} | ${date}${flag}`;
    }).join("\n");
    return `📋 **Your Recent Transactions:**\n\n${list}\n\nTotal transactions on record: ${txns.length}`;
  }

  if (q.includes("project") || q.includes("end of month") || q.includes("forecast") || q.includes("predict")) {
    return `📈 **Month-End Projection:**\n\n• Current spending: ₹${spent.toFixed(0)}\n• Daily average: ₹${dailyAvg.toFixed(0)}/day\n• Projected month-end total: ₹${projected.toFixed(0)}\n• Current balance: ₹${balance.toLocaleString("en-IN")}\n\n${projected > balance ? "🔴 Warning: Projected spending exceeds balance!" : projected > balance * 0.8 ? "🟡 Caution: High projected spending." : "🟢 On track to finish the month within budget."}`;
  }

  return `🤔 I can help you with:\n\n• 📊 "Show my spending summary"\n• 🛡️ "What's my fraud risk?"\n• 💰 "Check my budget"\n• 🚨 "Any suspicious transactions?"\n• 📂 "Top spending categories"\n• 📈 "What's my civil score?"\n• 💡 "Give me financial advice"\n• 💳 "What's my balance?"\n• 📋 "Show recent transactions"\n\nJust type your question naturally!`;
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map(i => (
        <motion.div key={i} className="w-2 h-2 rounded-full bg-violet-400"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </div>
  );
}

// ── Chat bubble ───────────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600
                        flex items-center justify-center flex-shrink-0 mt-0.5 shadow-lg">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      )}
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow whitespace-pre-line
        ${isUser
          ? "bg-gradient-to-br from-violet-600 to-blue-600 text-white rounded-br-sm"
          : "bg-gray-800/80 border border-gray-700 text-gray-100 rounded-bl-sm"
        }`}
      >
        {msg.content}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center
                        flex-shrink-0 mt-0.5 text-sm">
          <User className="h-4 w-4 text-gray-300" />
        </div>
      )}
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AIAssistant() {
  const [user, setUser]         = useState(null);
  const [messages, setMessages] = useState([{
    role: "ai",
    content: "👋 Hi! I'm your AI Financial Assistant.\n\nI analyse your real transactions, fraud risk, budgets, and give personalised advice — completely free, no API key needed.\n\nWhat would you like to know?",
  }]);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx]       = useState(null);
  const bottomRef           = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async cu => {
      if (!cu) return;
      setUser(cu);
      try { setCtx(await loadCtx(cu.uid)); } catch { setCtx({}); }
    });
    return unsub;
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const send = async (text) => {
    if (!text.trim() || loading) return;
    setMessages(p => [...p, { role: "user", content: text.trim() }]);
    setInput("");
    setLoading(true);
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    const reply = smartReply(text.trim(), ctx);
    setMessages(p => [...p, { role: "ai", content: reply }]);
    setLoading(false);
  };

  const resetChat = () => {
    setMessages([{
      role: "ai",
      content: "👋 Hi! I'm your AI Financial Assistant.\n\nI analyse your real transactions, fraud risk, budgets, and give personalised advice — completely free, no API key needed.\n\nWhat would you like to know?",
    }]);
    setInput("");
  };

  return (
    <div className="flex min-h-screen bg-[#0a0a0f] text-white">
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 min-h-screen bg-gray-950 border-r border-gray-800/60">
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden" style={{ height: "100vh" }}>
        <Header user={user} />

        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* ── Main chat area ── */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">

            {/* Page title */}
            <div className="flex-shrink-0 px-6 pt-5 pb-3 flex items-center justify-between border-b border-gray-800/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600
                                flex items-center justify-center shadow-lg shadow-violet-500/30">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white leading-none">AI Financial Assistant</h1>
                  <p className="text-xs text-gray-500 mt-0.5">Powered by your real data · Free · No API key needed</p>
                </div>
              </div>
              <button onClick={resetChat}
                className="text-gray-500 hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {/* Quick action pills */}
            <div className="flex-shrink-0 px-4 pt-3 pb-2 flex gap-2 flex-wrap border-b border-gray-800/40">
              {QUICK_ACTIONS.map(a => (
                <button key={a.q} onClick={() => send(a.q)} disabled={loading}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full
                             border border-gray-700/60 text-gray-400
                             hover:border-violet-500/50 hover:text-violet-300 hover:bg-violet-500/5
                             transition-all disabled:opacity-40">
                  <a.icon className="h-3 w-3" />
                  {a.label}
                </button>
              ))}
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
              </AnimatePresence>

              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 justify-start"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600
                                  flex items-center justify-center flex-shrink-0 mt-0.5 shadow-lg">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-gray-800/80 border border-gray-700 rounded-2xl rounded-bl-sm">
                    <TypingDots />
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div className="flex-shrink-0 px-4 pb-4 pt-2">
              <div className="flex gap-2 bg-gray-900/80 border border-gray-700/60 rounded-2xl px-4 py-2
                              focus-within:border-violet-500/50 transition-colors">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !loading && send(input)}
                  placeholder="Ask about your finances, fraud risk, spending…"
                  disabled={loading}
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-500
                             outline-none disabled:opacity-50"
                />
                <button
                  onClick={() => send(input)}
                  disabled={loading || !input.trim()}
                  className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600
                             flex items-center justify-center text-white
                             hover:from-violet-500 hover:to-blue-500 transition-all
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />
                  }
                </button>
              </div>
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="hidden xl:flex flex-col w-72 border-l border-gray-800/40 bg-gray-950/50 overflow-y-auto">

            {/* Quick actions */}
            <div className="p-4 border-b border-gray-800/40">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-yellow-400" /> Quick Queries
              </p>
              <div className="space-y-2">
                {QUICK_ACTIONS.map((a, i) => (
                  <motion.button key={i} whileHover={{ x: 3 }} onClick={() => send(a.q)} disabled={loading}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl
                               bg-gray-900/60 hover:bg-gray-800/80 border border-gray-800
                               hover:border-gray-700 transition-all group disabled:opacity-40">
                    <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${a.color}
                                    flex items-center justify-center flex-shrink-0`}>
                      <a.icon className="h-3 w-3 text-white" />
                    </div>
                    <p className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors leading-relaxed flex-1">
                      {a.label}
                    </p>
                    <ArrowRight className="h-3 w-3 text-gray-700 group-hover:text-violet-400 flex-shrink-0 transition-colors" />
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Hint cards */}
            <div className="p-4 space-y-3">
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3">
                <p className="text-[11px] text-violet-300 leading-relaxed">
                  <strong className="text-violet-200">Real-time data:</strong> All answers are based on your actual Firestore transactions and account data — no mocks.
                </p>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <p className="text-[11px] text-blue-300 leading-relaxed">
                  Ask anything naturally: <em>"What did I spend on food?"</em>, <em>"Am I at risk of fraud?"</em>, <em>"How's my budget?"</em>
                </p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                <p className="text-[11px] text-emerald-300 leading-relaxed">
                  <strong className="text-emerald-200">100% free:</strong> Powered by a local AI engine — no OpenAI or external API charges.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
