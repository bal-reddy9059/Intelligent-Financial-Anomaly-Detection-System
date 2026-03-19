"use client"

import React, { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  FileText, Download, ArrowUpRight, ArrowDownLeft, Calendar,
  BrainCircuit, ShieldCheck, ShieldX, TrendingUp, TrendingDown,
  Search, X, Lightbulb, AlertTriangle, BarChart2,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts"
import Header from "./Header"
import SidebarContent from "./SidebarContent"
import { db, auth } from "./firebase"
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore"

// ── AI Insight Engine ─────────────────────────────────────────────────────────
function generateAIInsight(current, previous) {
  if (!current.length) return null

  const debits = current.filter(tx => tx.type !== "incoming")
  const credits = current.filter(tx => tx.type === "incoming")
  const thisTotal = debits.reduce((s, tx) => s + tx.amount, 0)
  const prevTotal = (previous || []).filter(tx => tx.type !== "incoming").reduce((s, tx) => s + tx.amount, 0)

  // Top spending category
  const catMap = {}
  debits.forEach(tx => { const c = tx.remarks || "Other"; catMap[c] = (catMap[c] || 0) + tx.amount })
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]

  // Most frequent recipient
  const recipMap = {}
  debits.forEach(tx => { recipMap[tx.recipientUPI] = (recipMap[tx.recipientUPI] || 0) + 1 })
  const topRecip = Object.entries(recipMap).sort((a, b) => b[1] - a[1])[0]

  // Repeat transactions (same UPI + same amount)
  const dupKey = {}
  debits.forEach(tx => {
    const k = `${tx.recipientUPI}-${tx.amount}`
    dupKey[k] = (dupKey[k] || 0) + 1
  })
  const hasDuplicates = Object.values(dupKey).some(v => v > 1)

  const fraudCount = current.filter(tx => tx.fraudVerdict === "FRAUD").length

  // Month-over-month change
  let momPct = null
  if (prevTotal > 0) momPct = Math.round(((thisTotal - prevTotal) / prevTotal) * 100)

  // Build bullet insights
  const bullets = []
  if (topCat) bullets.push(`Top category: ${topCat[0]} — ₹${topCat[1].toLocaleString("en-IN")} (${thisTotal > 0 ? Math.round((topCat[1] / thisTotal) * 100) : 0}% of spend)`)
  if (topRecip && topRecip[1] > 1) bullets.push(`Most frequent recipient: ${topRecip[0]} (${topRecip[1]} transactions)`)
  if (momPct !== null) bullets.push(`Month-over-month spending: ${momPct >= 0 ? "+" : ""}${momPct}% vs last month`)
  if (fraudCount > 0) bullets.push(`${fraudCount} transaction${fraudCount > 1 ? "s" : ""} flagged as suspicious by AI`)
  if (hasDuplicates) bullets.push("Duplicate transactions detected — same recipient & amount appeared multiple times")
  if (credits.length > 0) bullets.push(`${credits.length} incoming payment${credits.length > 1 ? "s" : ""} received totalling ₹${credits.reduce((s, t) => s + t.amount, 0).toLocaleString("en-IN")}`)

  // Smart tip
  let tip = "No suspicious activity detected. Your account looks healthy this month."
  if (fraudCount > 0) tip = "Review flagged transactions immediately. Change your password if any seem unfamiliar."
  else if (hasDuplicates) tip = "Verify duplicate transactions — they may indicate accidental double-payments."
  else if (momPct !== null && momPct > 50) tip = `Spending jumped ${momPct}% vs last month. Consider reviewing your ${topCat?.[0] || "recurring"} expenses.`

  return { bullets, tip, fraudCount, topCat, catMap, thisTotal, prevTotal, momPct, debits, credits }
}

// ── Category colour map ───────────────────────────────────────────────────────
const CAT_COLORS = {
  rent: "#3b82f6", utilities: "#f59e0b", groceries: "#10b981",
  entertainment: "#8b5cf6", other: "#6b7280",
}
function catColor(name) { return CAT_COLORS[name?.toLowerCase()] || "#6b7280" }
function catBadge(name) {
  const c = catColor(name)
  return { background: `${c}22`, color: c, border: `1px solid ${c}44` }
}

// ── CSV export ────────────────────────────────────────────────────────────────
function downloadCSV(transactions, month) {
  const rows = [
    ["Date", "Recipient/Sender UPI", "Remarks", "Amount (₹)", "Type", "Status", "AI Fraud Verdict"],
    ...transactions.map(tx => [
      new Date(tx.createdAt.seconds * 1000).toLocaleDateString("en-IN"),
      tx.recipientUPI,
      tx.remarks || "",
      tx.amount.toFixed(2),
      tx.type === "incoming" ? "Credit" : "Debit",
      tx.status || "Completed",
      tx.fraudVerdict || "N/A",
    ]),
  ]
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `statement_${(month || "export").replace(/\s/g, "_")}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Component ─────────────────────────────────────────────────────────────────
const Statements = () => {
  const [user, setUser]             = useState(null)
  const [transactions, setTransactions] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [search, setSearch]         = useState("")

  useEffect(() => {
    const fetchData = async () => {
      const cu = auth.currentUser
      if (!cu) return
      const userDoc = await getDoc(doc(db, "users", cu.uid))
      if (!userDoc.exists()) return
      const userData = userDoc.data()
      setUser(userData)
      const snap = await getDocs(query(
        collection(db, "transactions"),
        where("senderUPI", "==", userData.upiId)
      ))
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    fetchData()
  }, [])

  // Group by month
  const groupedByMonth = useMemo(() => {
    const acc = {}
    transactions.forEach(tx => {
      if (!tx.createdAt) return
      const key = new Date(tx.createdAt.seconds * 1000)
        .toLocaleString("default", { month: "long", year: "numeric" })
      if (!acc[key]) acc[key] = []
      acc[key].push(tx)
    })
    return acc
  }, [transactions])

  const months        = Object.keys(groupedByMonth)
  const activeMonth   = selectedMonth || months[0]
  const activeIdx     = months.indexOf(activeMonth)
  const monthTx       = activeMonth ? groupedByMonth[activeMonth] || [] : []
  const prevMonthTx   = activeIdx >= 0 && months[activeIdx + 1] ? groupedByMonth[months[activeIdx + 1]] : []

  const filtered = monthTx.filter(tx =>
    !search ||
    tx.recipientUPI?.toLowerCase().includes(search.toLowerCase()) ||
    tx.remarks?.toLowerCase().includes(search.toLowerCase())
  )

  const totalDebits  = monthTx.filter(tx => tx.type !== "incoming").reduce((s, tx) => s + tx.amount, 0)
  const totalCredits = monthTx.filter(tx => tx.type === "incoming").reduce((s, tx) => s + tx.amount, 0)
  const fraudCount   = monthTx.filter(tx => tx.fraudVerdict === "FRAUD").length

  const insight = useMemo(() => generateAIInsight(monthTx, prevMonthTx), [activeMonth, transactions])

  // Bar chart data for category spending
  const catChartData = useMemo(() => {
    if (!insight?.catMap) return []
    return Object.entries(insight.catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
  }, [insight])

  const momColor = insight?.momPct == null ? "" : insight.momPct > 0 ? "text-red-400" : "text-green-400"
  const MomIcon  = insight?.momPct == null ? null : insight.momPct > 0 ? TrendingUp : TrendingDown

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
          className="p-6 max-w-6xl mx-auto space-y-6"
        >
          {/* ── Page header ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <FileText className="h-7 w-7 text-blue-400" />
                <h1 className="text-2xl font-bold text-gray-100">Account Statements</h1>
              </div>
              <p className="text-sm text-gray-400 mt-1 ml-10">
                AI-powered spending analysis & transaction history
              </p>
            </div>
            <Button
              variant="outline"
              disabled={!monthTx.length}
              onClick={() => downloadCSV(monthTx, activeMonth)}
              className="flex items-center gap-2 border-gray-600 text-gray-300 hover:bg-gray-700 disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {/* ── Month Selector ───────────────────────────────────────── */}
            <Card className="bg-gray-800 border-gray-700 md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-gray-400 flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Select Month
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {months.length === 0 ? (
                  <p className="text-gray-500 text-sm py-2">No statements yet</p>
                ) : months.map(month => {
                  const mTx = groupedByMonth[month] || []
                  const mFraud = mTx.filter(tx => tx.fraudVerdict === "FRAUD").length
                  return (
                    <button key={month} onClick={() => setSelectedMonth(month)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${
                        activeMonth === month
                          ? "bg-blue-600 text-white"
                          : "text-gray-300 hover:bg-gray-700"
                      }`}>
                      <span>{month}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs ${activeMonth === month ? "text-blue-200" : "text-gray-500"}`}>
                          {mTx.length}
                        </span>
                        {mFraud > 0 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" title={`${mFraud} flagged`} />
                        )}
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>

            {/* ── Right column ─────────────────────────────────────────── */}
            <div className="md:col-span-3 space-y-4">

              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Transactions",  value: monthTx.length,               color: "blue",   icon: FileText },
                  { label: "Total Debits",  value: `₹${totalDebits.toLocaleString("en-IN")}`, color: "red",    icon: ArrowUpRight },
                  { label: "Total Credits", value: `₹${totalCredits.toLocaleString("en-IN")}`, color: "green",  icon: ArrowDownLeft },
                  { label: "AI Flagged",    value: fraudCount,                   color: fraudCount > 0 ? "red" : "green", icon: fraudCount > 0 ? ShieldX : ShieldCheck },
                ].map(({ label, value, color, icon: Icon }) => (
                  <Card key={label} className="bg-gray-800 border-gray-700">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-gray-400">{label}</p>
                          <p className={`text-xl font-bold text-${color}-400 mt-0.5`}>{value}</p>
                        </div>
                        <Icon className={`h-4 w-4 text-${color}-400 mt-0.5`} />
                      </div>
                      {/* MoM badge on debits card */}
                      {label === "Total Debits" && MomIcon && insight?.momPct !== null && (
                        <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${momColor}`}>
                          <MomIcon className="h-3 w-3" />
                          {insight.momPct >= 0 ? "+" : ""}{insight.momPct}% vs last month
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ── AI Monthly Insight ───────────────────────────────── */}
              <AnimatePresence>
                {insight && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <Card className={`border ${fraudCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-purple-500/20 bg-gray-800"}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          <BrainCircuit className="h-5 w-5 text-purple-400" />
                          <CardTitle className="text-sm font-semibold text-gray-100">
                            AI Monthly Insight — {activeMonth}
                          </CardTitle>
                          {fraudCount > 0 && (
                            <span className="ml-auto text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> {fraudCount} flagged
                            </span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                          {/* Bullets */}
                          <div className="space-y-1.5">
                            {insight.bullets.map((b, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                                <span className="text-purple-400 mt-0.5 flex-shrink-0">•</span>
                                {b}
                              </div>
                            ))}
                          </div>

                          {/* Category bar chart */}
                          {catChartData.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                                <BarChart2 className="h-3.5 w-3.5 text-blue-400" /> Spending by Category
                              </p>
                              <ResponsiveContainer width="100%" height={100}>
                                <BarChart data={catChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                  <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={false} tickLine={false} />
                                  <YAxis tick={{ fill: "#9ca3af", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                                  <Tooltip
                                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                                    formatter={v => [`₹${Number(v).toLocaleString("en-IN")}`, "Amount"]}
                                  />
                                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                    {catChartData.map((entry, i) => (
                                      <Cell key={i} fill={catColor(entry.name)} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>

                        {/* AI tip */}
                        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 ${
                          fraudCount > 0
                            ? "bg-red-500/10 border border-red-500/20"
                            : "bg-purple-500/5 border border-purple-500/20"
                        }`}>
                          <Lightbulb className={`h-4 w-4 flex-shrink-0 mt-0.5 ${fraudCount > 0 ? "text-red-400" : "text-yellow-400"}`} />
                          <p className="text-xs text-gray-300 leading-relaxed">{insight.tip}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Transaction List ─────────────────────────────────── */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base font-semibold text-gray-100">
                      {activeMonth || "No Month Selected"}
                    </CardTitle>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                      <Input
                        placeholder="Search by UPI or remarks…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-8 pr-8 bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 h-8 text-sm w-52"
                      />
                      {search && (
                        <button onClick={() => setSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {filtered.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                      <FileText className="h-10 w-10 mx-auto mb-3 text-gray-600" />
                      <p>{search ? "No transactions match your search." : "No transactions for this period."}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((tx, idx) => {
                        const isDebit   = tx.type !== "incoming"
                        const isFlagged = tx.fraudVerdict === "FRAUD"
                        return (
                          <motion.div
                            key={tx.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                              isFlagged
                                ? "bg-red-500/5 border border-red-500/20 hover:bg-red-500/10"
                                : "bg-gray-700/60 border border-gray-700 hover:bg-gray-700"
                            }`}
                          >
                            {/* Left */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`p-2 rounded-full flex-shrink-0 ${isDebit ? "bg-red-500/20" : "bg-green-500/20"}`}>
                                {isDebit
                                  ? <ArrowUpRight className="h-4 w-4 text-red-400" />
                                  : <ArrowDownLeft className="h-4 w-4 text-green-400" />
                                }
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-100 truncate">{tx.recipientUPI}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <p className="text-xs text-gray-400">
                                    {new Date(tx.createdAt.seconds * 1000).toLocaleDateString("en-IN")}
                                  </p>
                                  {tx.remarks && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full"
                                      style={catBadge(tx.remarks)}>
                                      {tx.remarks}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right */}
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {/* AI Fraud badge */}
                              <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                                isFlagged
                                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                  : "bg-green-500/10 text-green-400 border border-green-500/20"
                              }`}>
                                {isFlagged
                                  ? <><ShieldX className="h-3 w-3" /> Flagged</>
                                  : <><ShieldCheck className="h-3 w-3" /> Safe</>
                                }
                              </div>

                              <div className="text-right">
                                <p className={`text-sm font-bold ${isDebit ? "text-red-400" : "text-green-400"}`}>
                                  {isDebit ? "-" : "+"}₹{tx.amount.toLocaleString("en-IN")}
                                </p>
                                <p className={`text-xs mt-0.5 ${
                                  tx.status === "Completed" ? "text-gray-500"
                                  : tx.status === "Pending"  ? "text-yellow-500"
                                  : "text-red-500"
                                }`}>
                                  {tx.status || "Completed"}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  )
}

export default Statements
