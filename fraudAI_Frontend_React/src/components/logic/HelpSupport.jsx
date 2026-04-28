import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  HelpCircle, MessageCircle, Mail, Phone, ChevronDown, ChevronUp,
  Send, CheckCircle, BrainCircuit, Bot, User, Search, X,
  ThumbsUp, ThumbsDown, Sparkles, ShieldCheck, CreditCard,
  FileText, Lock, Zap,
} from "lucide-react"
import Header from "./Header"
import SidebarContent from "./SidebarContent"
import { auth, db } from "./firebase"
import { addDoc, collection, serverTimestamp } from "firebase/firestore"

// ── AI Knowledge Base ─────────────────────────────────────────────────────────
const AI_PATTERNS = [
  {
    keywords: ["fraud", "detect", "how", "work", "model", "ai", "machine learning", "ml"],
    response: "AegisAI uses three ML models in real-time: (1) Random Forest — pre-trained with 95% accuracy on 20 risk features, (2) Isolation Forest — unsupervised anomaly detection, (3) Autoencoder — deep learning reconstruction error. Every transaction is scored across features like location, amount, frequency, and behavioral biometrics before approval.",
    category: "AI & Fraud",
  },
  {
    keywords: ["blocked", "declined", "transaction", "failed", "why", "rejected"],
    response: "Transactions get blocked when the AI fraud risk score exceeds the safety threshold. Common triggers: unusual amount, new recipient, VPN/proxy usage, high-risk transaction time, or location inconsistency. You can appeal via the support form below — our team reviews within 24 hours.",
    category: "Transactions",
  },
  {
    keywords: ["upi", "send", "money", "transfer", "payment", "pay"],
    response: "To send money: click 'Send Money' in the sidebar → enter the recipient UPI ID (e.g. name@yesbank) → set amount and remarks → confirm. Every transaction is automatically scanned by all three AI models before processing. High-risk transactions are flagged or blocked.",
    category: "Transactions",
  },
  {
    keywords: ["beneficiary", "add", "save", "recipient", "contact"],
    response: "Go to Beneficiaries from the sidebar → click '+ Add Beneficiary' → enter name, UPI ID, and optional nickname → save. Each saved beneficiary card has a quick 'Send Money' button and a 'Copy UPI ID' feature for convenience.",
    category: "Account",
  },
  {
    keywords: ["statement", "download", "export", "history", "report"],
    response: "Navigate to Statements from the sidebar. You can filter transactions by date range and download your statement as a PDF or CSV file. All your past transactions including AI fraud verdicts are visible there.",
    category: "Account",
  },
  {
    keywords: ["secure", "safe", "privacy", "data", "encryption", "security"],
    response: "All data is encrypted with TLS 1.3 in transit and AES-256 at rest. We use Firebase Authentication with Google OAuth, follow OWASP security standards, and your UPI credentials are never stored in plaintext.",
    category: "Security",
  },
  {
    keywords: ["password", "change", "update", "forgot", "reset"],
    response: "If you signed in with Google, manage your password at myaccount.google.com. For email/password accounts, go to Settings → Security → Change Password. You'll need your current password to authenticate before setting a new one.",
    category: "Account",
  },
  {
    keywords: ["risk", "level", "score", "high", "medium", "low", "probability"],
    response: "Risk levels explained: 🟢 LOW — no anomalies detected, transaction is safe. 🟡 MEDIUM — unusual patterns found, manual review recommended. 🔴 HIGH — strong fraud signals across multiple models, transaction should be blocked. The fraud probability (0–100%) is shown as a gauge for each check.",
    category: "AI & Fraud",
  },
  {
    keywords: ["isolation forest", "autoencoder", "random forest", "z-score", "anomaly", "feature"],
    response: "The Feature Risk Analysis panel shows z-scores for each transaction feature — how many standard deviations the value is from the dataset mean. Features marked with a red ● match the fraud distribution. This helps explain exactly WHY a transaction was flagged.",
    category: "AI & Fraud",
  },
  {
    keywords: ["upload", "csv", "dataset", "detection", "run", "analytics"],
    response: "Use the ML Analytics section (sidebar): (1) Upload Data — upload your CSV transaction dataset. (2) Explore Data — view distributions and correlations. (3) Run Detection — train Isolation Forest or Autoencoder. (4) Results — view confusion matrix, ROC curve, precision/recall. (5) Check Transaction — test any single transaction.",
    category: "AI & Fraud",
  },
]

const SUGGESTIONS = [
  "How does fraud detection work?",
  "Why was my transaction blocked?",
  "How do I add a beneficiary?",
  "What does the risk score mean?",
  "How do I download my statement?",
  "Is my data secure?",
]

function getAIResponse(input) {
  const lower = input.toLowerCase()
  let best = null, bestScore = 0
  for (const p of AI_PATTERNS) {
    const score = p.keywords.filter(k => lower.includes(k)).length
    if (score > bestScore) { best = p; bestScore = score }
  }
  if (best && bestScore >= 1) return best.response
  return "I'm not sure about that specific question. Try rephrasing, or browse the FAQs below. You can also submit a support ticket and our team will respond within 24 hours."
}

// ── FAQ data ──────────────────────────────────────────────────────────────────
const FAQS = [
  { q: "How does the AI fraud detection work?", a: "Our system analyzes every transaction using Random Forest (95% accuracy), Isolation Forest, and an Autoencoder trained on 20 risk features — including transaction amount, location, frequency, device fingerprinting, and behavioral biometrics. A fraud probability score (0–100%) and natural-language insight are generated for every check.", cat: "AI & Fraud", icon: BrainCircuit, color: "text-purple-400" },
  { q: "What should I do if I see a suspicious transaction?", a: "Go to the Transactions page and view the flagged transaction details. Change your password immediately via Settings → Security. Then submit a support ticket below with the transaction ID and our team will investigate within 24 hours.", cat: "Security", icon: ShieldCheck, color: "text-red-400" },
  { q: "How do I send money to a new beneficiary?", a: "Go to Beneficiaries → Add Beneficiary → enter name and UPI ID → save. Then click 'Send Money' on the beneficiary card. New beneficiaries trigger an additional AI verification step for your security.", cat: "Transactions", icon: CreditCard, color: "text-blue-400" },
  { q: "Why was my transaction blocked?", a: "Transactions are blocked when the AI detects a high fraud risk score (typically ≥ 65%). Triggers include unusual amount, new location, VPN usage, or high transaction frequency. Appeal via the support form below.", cat: "Transactions", icon: CreditCard, color: "text-blue-400" },
  { q: "How do I download my account statement?", a: "Navigate to Statements from the sidebar. Filter by date range, then download as PDF or CSV. Each transaction includes the AI fraud verdict for audit purposes.", cat: "Account", icon: FileText, color: "text-green-400" },
  { q: "Is my data secure?", a: "Yes. All data is encrypted with TLS 1.3 in transit and AES-256 at rest. We use Firebase Authentication, follow OWASP Top 10 practices, and never store raw UPI credentials.", cat: "Security", icon: Lock, color: "text-yellow-400" },
  { q: "How do I use the ML Analytics tools?", a: "From the sidebar: Upload Data (CSV) → Explore Data (charts & correlations) → Run Detection (train models) → Results (metrics & ROC curves) → Check Transaction (single transaction verdict).", cat: "AI & Fraud", icon: Zap, color: "text-purple-400" },
  { q: "What does the fraud probability percentage mean?", a: "The fraud probability (0–100%) is computed from the Isolation Forest anomaly score. ≤ 40% = LOW risk, 40–65% = MEDIUM risk, ≥ 65% = HIGH risk. The Feature Risk Analysis panel shows which specific features triggered the alert.", cat: "AI & Fraud", icon: BrainCircuit, color: "text-purple-400" },
]

const FAQ_CATS = ["All", "AI & Fraud", "Transactions", "Account", "Security"]

// ── Component ─────────────────────────────────────────────────────────────────
const HelpSupport = () => {
  const [user, setUser] = useState(null)

  // AI Chat
  const [messages, setMessages] = useState([
    { role: "bot", text: "Hi! I'm AegisAI Assistant. Ask me anything about fraud detection, transactions, or your account." }
  ])
  const [chatInput, setChatInput] = useState("")
  const [typing, setTyping] = useState(false)
  const chatBottomRef = useRef(null)

  // FAQ
  const [openFaq, setOpenFaq] = useState(null)
  const [faqSearch, setFaqSearch] = useState("")
  const [faqCat, setFaqCat] = useState("All")
  const [helpfulMap, setHelpfulMap] = useState({})

  // Contact form
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactCategory, setContactCategory] = useState("General")
  const [contactMessage, setContactMessage] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [ticketId, setTicketId] = useState("")

  useEffect(() => {
    const cu = auth.currentUser
    if (cu) {
      setUser(cu)
      setContactName(cu.displayName || "")
      setContactEmail(cu.email || "")
    }
  }, [])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, typing])

  // ── Chat handlers ───────────────────────────────────────────────────────────
  const sendMessage = (text) => {
    const q = (text || chatInput).trim()
    if (!q) return
    setChatInput("")
    setMessages(prev => [...prev, { role: "user", text: q }])
    setTyping(true)
    setTimeout(() => {
      setMessages(prev => [...prev, { role: "bot", text: getAIResponse(q) }])
      setTyping(false)
    }, 900)
  }

  const handleChatKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── FAQ helpers ─────────────────────────────────────────────────────────────
  const filteredFaqs = FAQS.filter(f => {
    const matchCat = faqCat === "All" || f.cat === faqCat
    const matchSearch = !faqSearch ||
      f.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
      f.a.toLowerCase().includes(faqSearch.toLowerCase())
    return matchCat && matchSearch
  })

  // ── Contact submit ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!contactMessage.trim()) return
    setSubmitting(true)
    try {
      const ref = await addDoc(collection(db, "supportTickets"), {
        name: contactName, email: contactEmail,
        category: contactCategory, message: contactMessage,
        userId: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(), status: "open",
      })
      setTicketId(ref.id.slice(0, 8).toUpperCase())
      setSubmitted(true)
      setContactMessage("")
    } catch { /* silent */ }
    finally { setSubmitting(false) }
  }

  return (
    <div className="flex min-h-screen bg-gray-900 text-gray-100">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>

      <main className="flex-1">
        <Header user={user} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="p-6 max-w-5xl mx-auto space-y-6"
        >
          {/* ── Page title ─────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-3">
              <HelpCircle className="h-7 w-7 text-blue-400" />
              <h1 className="text-2xl font-bold text-gray-100">Help & Support</h1>
            </div>
            <p className="text-sm text-gray-400 mt-1 ml-10">
              Get instant answers from our AI assistant or contact our team
            </p>
          </div>

          {/* ── Quick contact cards ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Mail,          label: "Email Us",      sub: "support@safepayai.com",       bg: "bg-blue-500/10",   color: "text-blue-400",   border: "hover:border-blue-500/40" },
              { icon: Phone,         label: "Call Support",  sub: "+91 1800-XXX-XXXX (24/7)",    bg: "bg-green-500/10",  color: "text-green-400",  border: "hover:border-green-500/40" },
              { icon: MessageCircle, label: "Live Chat",     sub: "Avg wait: < 2 minutes",       bg: "bg-purple-500/10", color: "text-purple-400", border: "hover:border-purple-500/40" },
            ].map(({ icon: Icon, label, sub, bg, color, border }) => (
              <Card key={label}
                className={`bg-gray-800 border-gray-700 ${border} transition-all duration-200 cursor-pointer hover:bg-gray-750`}>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`${bg} p-3 rounded-xl flex-shrink-0`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-100">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── AI Assistant ────────────────────────────────────────────── */}
          <Card className="bg-gray-800 border-gray-700 border-purple-500/20 shadow-lg shadow-purple-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-purple-400" />
                  <CardTitle className="text-base font-semibold text-gray-100">
                    AI Assistant
                  </CardTitle>
                  <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                    Online
                  </span>
                </div>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-purple-400" />
                  Powered by AegisAI
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Messages */}
              <div className="h-72 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                {messages.map((msg, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "bot" && (
                      <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="h-4 w-4 text-purple-400" />
                      </div>
                    )}
                    <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-gray-700 text-gray-200 rounded-tl-sm"
                    }`}>
                      {msg.text}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="h-4 w-4 text-blue-400" />
                      </div>
                    )}
                  </motion.div>
                ))}

                {/* Typing indicator */}
                {typing && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex gap-2 justify-start">
                    <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-purple-400" />
                    </div>
                    <div className="bg-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
                      {[0, 1, 2].map(i => (
                        <span key={i} className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </motion.div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => sendMessage(s)}
                    className="text-xs text-purple-300 border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/15 rounded-full px-3 py-1 transition-colors">
                    {s}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask anything about AegisAI…"
                  className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 h-10 focus:border-purple-500/60"
                  disabled={typing}
                />
                <Button onClick={() => sendMessage()}
                  disabled={!chatInput.trim() || typing}
                  className="bg-purple-600 hover:bg-purple-700 text-white h-10 px-4 flex-shrink-0 disabled:opacity-50">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── FAQ Section ─────────────────────────────────────────────── */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-blue-400" />
                  <CardTitle className="text-base font-semibold text-gray-100">
                    Frequently Asked Questions
                  </CardTitle>
                </div>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search FAQs…"
                    value={faqSearch}
                    onChange={e => setFaqSearch(e.target.value)}
                    className="pl-8 pr-8 bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 h-8 text-sm w-48"
                  />
                  {faqSearch && (
                    <button onClick={() => setFaqSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category tabs */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {FAQ_CATS.map(cat => (
                  <button key={cat} onClick={() => setFaqCat(cat)}
                    className={`text-xs px-3 py-1 rounded-full border transition-all ${
                      faqCat === cat
                        ? "bg-blue-600 border-blue-500 text-white font-medium"
                        : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="space-y-2">
              {filteredFaqs.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No FAQs match your search. Try different keywords or{" "}
                  <button className="text-blue-400 hover:underline"
                    onClick={() => { setFaqSearch(""); setFaqCat("All") }}>
                    clear filters
                  </button>.
                </div>
              ) : filteredFaqs.map((faq, i) => {
                const globalIdx = FAQS.indexOf(faq)
                const isOpen = openFaq === globalIdx
                return (
                  <motion.div key={globalIdx}
                    layout
                    className={`border rounded-xl overflow-hidden transition-colors ${
                      isOpen ? "border-blue-500/40 bg-gray-750" : "border-gray-700"
                    }`}
                  >
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : globalIdx)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-700/40 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <faq.icon className={`h-4 w-4 ${faq.color} flex-shrink-0`} />
                        <span className="text-sm font-medium text-gray-100">{faq.q}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full hidden sm:block ${
                          faq.cat === "AI & Fraud" ? "bg-purple-500/15 text-purple-400" :
                          faq.cat === "Security"   ? "bg-red-500/15 text-red-400" :
                          faq.cat === "Transactions" ? "bg-blue-500/15 text-blue-400" :
                          "bg-green-500/15 text-green-400"
                        }`}>{faq.cat}</span>
                        {isOpen
                          ? <ChevronUp className="h-4 w-4 text-gray-400" />
                          : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pt-1 pb-4 bg-gray-700/20">
                            <p className="text-sm text-gray-300 leading-relaxed pl-6">{faq.a}</p>
                            {/* Helpful feedback */}
                            <div className="flex items-center gap-3 mt-3 pl-6">
                              <span className="text-xs text-gray-500">Was this helpful?</span>
                              <button
                                onClick={() => setHelpfulMap(p => ({ ...p, [globalIdx]: "yes" }))}
                                className={`text-xs flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all ${
                                  helpfulMap[globalIdx] === "yes"
                                    ? "border-green-500/60 bg-green-500/10 text-green-400"
                                    : "border-gray-600 text-gray-500 hover:border-green-500/40 hover:text-green-400"
                                }`}>
                                <ThumbsUp className="h-3 w-3" /> Yes
                              </button>
                              <button
                                onClick={() => setHelpfulMap(p => ({ ...p, [globalIdx]: "no" }))}
                                className={`text-xs flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all ${
                                  helpfulMap[globalIdx] === "no"
                                    ? "border-red-500/60 bg-red-500/10 text-red-400"
                                    : "border-gray-600 text-gray-500 hover:border-red-500/40 hover:text-red-400"
                                }`}>
                                <ThumbsDown className="h-3 w-3" /> No
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </CardContent>
          </Card>

          {/* ── Contact form ─────────────────────────────────────────────── */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-base font-semibold text-gray-100">
                  Send Us a Message
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-10 space-y-3 text-center"
                >
                  <div className="p-4 rounded-full bg-green-500/15">
                    <CheckCircle className="h-12 w-12 text-green-400" />
                  </div>
                  <p className="text-lg font-semibold text-gray-100">Ticket Submitted!</p>
                  {ticketId && (
                    <div className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2">
                      <p className="text-xs text-gray-400">Ticket ID</p>
                      <p className="text-sm font-mono font-bold text-blue-400"># {ticketId}</p>
                    </div>
                  )}
                  <p className="text-sm text-gray-400 max-w-sm">
                    We've received your message and will respond to{" "}
                    <span className="text-blue-400">{contactEmail}</span> within 24 hours.
                  </p>
                  <Button variant="outline"
                    className="mt-2 border-gray-600 text-gray-300 hover:bg-gray-700"
                    onClick={() => { setSubmitted(false); setTicketId("") }}>
                    Send Another Message
                  </Button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-400">Your Name</Label>
                      <Input value={contactName} onChange={e => setContactName(e.target.value)}
                        placeholder="Full name" required
                        className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-400">Email Address</Label>
                      <Input type="email" value={contactEmail}
                        onChange={e => setContactEmail(e.target.value)}
                        placeholder="your@email.com" required
                        className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 h-9" />
                    </div>
                  </div>

                  {/* Category */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-400">Issue Category</Label>
                    <div className="flex flex-wrap gap-2">
                      {["General", "Fraud Alert", "Blocked Transaction", "Account Access", "AI / Detection", "Other"].map(cat => (
                        <button key={cat} type="button"
                          onClick={() => setContactCategory(cat)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                            contactCategory === cat
                              ? "bg-blue-600 border-blue-500 text-white font-medium"
                              : "border-gray-600 text-gray-400 hover:border-gray-500"
                          }`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-400">
                      Message
                      <span className="ml-2 text-gray-600 font-normal">{contactMessage.length}/500</span>
                    </Label>
                    <textarea
                      value={contactMessage}
                      onChange={e => { if (e.target.value.length <= 500) setContactMessage(e.target.value) }}
                      placeholder="Describe your issue or question in detail…"
                      rows={4} required
                      className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  <Button type="submit" disabled={submitting || !contactMessage.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-5 disabled:opacity-50">
                    {submitting
                      ? <><div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Sending…</>
                      : <><Send className="h-4 w-4 mr-1.5" />Submit Message</>
                    }
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

export default HelpSupport
