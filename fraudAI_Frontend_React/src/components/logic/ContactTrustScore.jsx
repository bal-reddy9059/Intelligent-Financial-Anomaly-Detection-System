"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Shield, Search, ChevronDown, ChevronUp, X,
  Clock, AlertTriangle, ShieldCheck, ShieldAlert, Users,
} from "lucide-react"
import { auth, db } from "./firebase"
import {
  collection, query, where, getDocs, orderBy, limit,
  addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc, increment,
} from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import SidebarContent from "./SidebarContent"
import Header from "./Header"

// ── Helpers ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "from-blue-500 to-blue-700",
  "from-purple-500 to-purple-700",
  "from-emerald-500 to-emerald-700",
  "from-pink-500 to-pink-700",
  "from-amber-500 to-amber-600",
  "from-cyan-500 to-cyan-700",
  "from-rose-500 to-rose-700",
  "from-indigo-500 to-indigo-700",
]

function avatarColor(name) {
  return AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
}

function getInitial(name) {
  return (name?.trim()?.[0] ?? "?").toUpperCase()
}

function stdDev(arr) {
  if (arr.length === 0) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function computeTrustScore(txns, contact) {
  let score = 30 // base
  const txCount = txns.length

  if (txCount > 5) score += 20
  if (txCount > 10) score += 10

  const hasHighRisk = txns.some(t => t.fraudVerdict === "HIGH_RISK")
  const hasMediumRisk = txns.some(t => t.fraudVerdict === "MEDIUM_RISK")
  const allSafe = txCount > 0 && !hasHighRisk && !hasMediumRisk

  if (allSafe) score += 25
  if (hasHighRisk) score -= 30
  if (hasMediumRisk) score -= 10

  const amounts = txns.map(t => Number(t.amount) || 0).filter(a => a > 0)
  if (amounts.length > 1) {
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const sd = stdDev(amounts)
    if (mean > 0 && sd / mean < 0.2) score += 15
  }

  // Account age bonus
  const createdAt = contact.createdAt?.seconds
    ? new Date(contact.createdAt.seconds * 1000)
    : null
  if (createdAt) {
    const daysSince = (Date.now() - createdAt.getTime()) / (1000 * 86400)
    if (daysSince > 30) score += 10
  }

  return Math.min(100, Math.max(0, score))
}

function getTrustBand(score) {
  if (score >= 80) return { label: "Trusted", color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/40", ring: "#10b981" }
  if (score >= 50) return { label: "Known",   color: "text-yellow-400",  bg: "bg-yellow-500/15 border-yellow-500/40",  ring: "#eab308" }
  if (score >= 20) return { label: "New",     color: "text-orange-400",  bg: "bg-orange-500/15 border-orange-500/40",  ring: "#f97316" }
  return                  { label: "Suspicious", color: "text-red-400",  bg: "bg-red-500/15 border-red-500/40",        ring: "#ef4444" }
}

function daysAgo(ts) {
  if (!ts) return null
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 86400))
  return diff
}

// ── Circular Gauge ─────────────────────────────────────────────────────────────

function CircularGauge({ score, color }) {
  const pct = score / 100
  return (
    <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${pct * 360}deg, #374151 0deg)`,
        }}
      />
      <div className="absolute inset-1.5 rounded-full bg-gray-800 flex items-center justify-center">
        <span className="text-xs font-bold text-white leading-none">{score}</span>
      </div>
    </div>
  )
}

// ── Legend Card ────────────────────────────────────────────────────────────────

const BANDS = [
  { range: "80–100", label: "Trusted",    color: "text-emerald-400", bg: "bg-emerald-500/15 border border-emerald-500/40", desc: "Long history, consistent amounts, no flags" },
  { range: "50–79",  label: "Known",      color: "text-yellow-400",  bg: "bg-yellow-500/15 border border-yellow-500/40",   desc: "Some history, minor anomalies" },
  { range: "20–49",  label: "New",        color: "text-orange-400",  bg: "bg-orange-500/15 border border-orange-500/40",   desc: "Recent contact, limited history" },
  { range: "0–19",   label: "Suspicious", color: "text-red-400",     bg: "bg-red-500/15 border border-red-500/40",         desc: "Fraud flags, blacklist signals" },
]

function LegendCard() {
  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-400" /> Trust Score Legend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {BANDS.map(b => (
            <div key={b.label} className={`rounded-xl p-3 ${b.bg}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold ${b.color}`}>{b.label}</span>
                <span className="text-xs text-gray-400 font-mono">{b.range}</span>
              </div>
              <p className="text-xs text-gray-400 leading-snug">{b.desc}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Contact Card ───────────────────────────────────────────────────────────────

function ContactCard({ contact, index }) {
  const [expanded, setExpanded] = useState(false)
  const band = getTrustBand(contact.score)
  const lastPaid = contact.lastTxDate ? daysAgo(contact.lastTxDate) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
    >
      <Card className={`bg-gray-800 border ${expanded ? "border-blue-500/50" : "border-gray-700"} hover:border-gray-600 transition-all duration-200`}>
        <CardContent className="p-4">
          {/* Main row */}
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${avatarColor(contact.name)} flex items-center justify-center flex-shrink-0 text-sm font-bold text-white shadow-md select-none`}>
              {getInitial(contact.name)}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-100 truncate">{contact.name}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${band.bg} ${band.color}`}>
                  {band.label}
                </span>
              </div>
              <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{contact.upiId}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span>{contact.txCount} transaction{contact.txCount !== 1 ? "s" : ""}</span>
                {lastPaid !== null && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {lastPaid === 0 ? "Today" : `${lastPaid}d ago`}
                  </span>
                )}
              </div>
            </div>

            {/* Gauge + expand */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <CircularGauge score={contact.score} color={band.ring} />
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Expanded: transaction history summary */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-gray-700 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Transaction Summary</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-gray-700/50 rounded-lg p-2 text-center">
                      <p className="text-green-400 font-bold text-sm">{contact.safeCount}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Safe</p>
                    </div>
                    <div className="bg-gray-700/50 rounded-lg p-2 text-center">
                      <p className="text-yellow-400 font-bold text-sm">{contact.mediumCount}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Medium Risk</p>
                    </div>
                    <div className="bg-gray-700/50 rounded-lg p-2 text-center">
                      <p className="text-red-400 font-bold text-sm">{contact.highCount}</p>
                      <p className="text-xs text-gray-500 mt-0.5">High Risk</p>
                    </div>
                  </div>

                  {/* Verdict indicators */}
                  {contact.highCount > 0 && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
                      {contact.highCount} HIGH_RISK transaction{contact.highCount > 1 ? "s" : ""} detected — exercise caution
                    </div>
                  )}
                  {contact.highCount === 0 && contact.mediumCount === 0 && contact.txCount > 0 && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                      <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
                      All transactions with this contact are SAFE
                    </div>
                  )}

                  {/* Score breakdown */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Score Factors</p>
                    {[
                      { label: "Transaction history (volume)",  value: contact.txCount > 10 ? "+30" : contact.txCount > 5 ? "+20" : "+0", active: contact.txCount > 5 },
                      { label: "All transactions SAFE",         value: "+25", active: contact.safeCount === contact.txCount && contact.txCount > 0 },
                      { label: "HIGH_RISK penalty",             value: "−30", active: contact.highCount > 0, warn: true },
                      { label: "MEDIUM_RISK penalty",           value: "−10", active: contact.mediumCount > 0, warn: true },
                      { label: "Consistent payment amounts",    value: "+15", active: contact.consistentAmounts },
                      { label: "Account known > 30 days",       value: "+10", active: contact.accountOld },
                    ].map(f => (
                      <div key={f.label} className="flex items-center justify-between text-xs">
                        <span className={f.active ? "text-gray-300" : "text-gray-600"}>{f.label}</span>
                        <span className={
                          !f.active ? "text-gray-600" :
                          f.warn ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"
                        }>{f.active ? f.value : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ContactTrustScore() {
  const [user, setUser] = useState(null)
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("ALL")

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) return
      try {
        const userDoc = await getDoc(doc(db, "users", cu.uid))
        setUser(userDoc.exists() ? { uid: cu.uid, ...userDoc.data() } : { uid: cu.uid })
      } catch {
        setUser({ uid: cu.uid })
      }
      await loadContacts(cu.uid)
    })
    return unsub
  }, [])

  async function loadContacts(uid) {
    setLoading(true)
    try {
      // 1) Load beneficiaries for this user
      const bSnap = await getDocs(
        query(collection(db, "beneficiaries"), where("userId", "==", uid))
      )
      const beneficiaries = bSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      // 2) For each beneficiary, load their transactions and compute score
      const enriched = await Promise.all(
        beneficiaries.map(async (b) => {
          let txns = []
          try {
            const txSnap = await getDocs(
              query(
                collection(db, "transactions"),
                where("senderUPI", "==", uid),
                where("recipientUPI", "==", b.upiId)
              )
            )
            txns = txSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          } catch { /* ignore missing index, degrade gracefully */ }

          const score = computeTrustScore(txns, b)

          const amounts = txns.map(t => Number(t.amount) || 0).filter(a => a > 0)
          const meanAmt = amounts.length > 0 ? amounts.reduce((a, c) => a + c, 0) / amounts.length : 0
          const consistentAmounts = amounts.length > 1 && meanAmt > 0 && stdDev(amounts) / meanAmt < 0.2

          const createdAt = b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000) : null
          const accountOld = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 86400) > 30 : false

          // Last transaction date
          const sortedTxns = [...txns].sort((a, b) => {
            const aT = a.createdAt?.seconds ?? 0
            const bT = b.createdAt?.seconds ?? 0
            return bT - aT
          })
          const lastTxDate = sortedTxns[0]?.createdAt ?? null

          return {
            ...b,
            txns,
            txCount: txns.length,
            safeCount: txns.filter(t => t.fraudVerdict === "SAFE" || !t.fraudVerdict).length,
            mediumCount: txns.filter(t => t.fraudVerdict === "MEDIUM_RISK").length,
            highCount: txns.filter(t => t.fraudVerdict === "HIGH_RISK").length,
            score,
            consistentAmounts,
            accountOld,
            lastTxDate,
          }
        })
      )

      // Sort by score descending
      enriched.sort((a, b) => b.score - a.score)
      setContacts(enriched)
    } catch (err) {
      console.error("Error loading contacts:", err)
    } finally {
      setLoading(false)
    }
  }

  // Derived stats
  const trustedCount    = contacts.filter(c => c.score >= 80).length
  const suspiciousCount = contacts.filter(c => c.score < 20).length
  const newCount        = contacts.filter(c => c.score >= 20 && c.score < 50).length

  // Filter + search
  const visible = useMemo(() => {
    let list = contacts
    if (filter === "TRUSTED")    list = list.filter(c => c.score >= 80)
    if (filter === "SUSPICIOUS") list = list.filter(c => c.score < 20)
    if (filter === "NEW")        list = list.filter(c => c.score >= 20 && c.score < 50)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.upiId?.toLowerCase().includes(q) ||
        getTrustBand(c.score).label.toLowerCase().includes(q)
      )
    }
    return list
  }, [contacts, filter, search])

  const FILTER_TABS = [
    { key: "ALL",        label: `All (${contacts.length})` },
    { key: "TRUSTED",    label: `Trusted (${trustedCount})` },
    { key: "SUSPICIOUS", label: `Suspicious (${suspiciousCount})` },
    { key: "NEW",        label: `New (${newCount})` },
  ]

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">

          {/* ── Page Header ──────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mb-6"
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/30">
                <Shield className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-100">Contact Trust Scores</h1>
                <p className="text-sm text-gray-400">AI-computed trust rating for each of your payment contacts</p>
              </div>
            </div>
          </motion.div>

          {/* ── Stats Row ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total Contacts", value: contacts.length,    color: "text-blue-400",    icon: Users },
              { label: "Trusted",        value: trustedCount,        color: "text-emerald-400", icon: ShieldCheck },
              { label: "Suspicious",     value: suspiciousCount,     color: "text-red-400",     icon: ShieldAlert },
              { label: "New",            value: newCount,            color: "text-orange-400",  icon: AlertTriangle },
            ].map(s => {
              const Icon = s.icon
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="bg-gray-800 border-gray-700">
                    <CardContent className="p-3 flex items-center gap-3">
                      <Icon className={`h-5 w-5 ${s.color} flex-shrink-0`} />
                      <div>
                        <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-gray-500">{s.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>

          {/* ── Legend ───────────────────────────────────────────────────────── */}
          <div className="mb-6">
            <LegendCard />
          </div>

          {/* ── Search + Filter Bar ──────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search contacts by name, UPI ID or band..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-8 bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500 h-9"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 flex-wrap">
              {FILTER_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`text-xs px-3 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                    filter === tab.key
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white bg-gray-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Contact List ─────────────────────────────────────────────────── */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 rounded-xl bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="flex flex-col items-center py-16 gap-3">
                <Shield className="h-12 w-12 text-gray-600" />
                <p className="text-gray-400 font-medium">
                  {contacts.length === 0 ? "No contacts found" : "No contacts match your filters"}
                </p>
                <p className="text-xs text-gray-600">
                  {contacts.length === 0
                    ? "Add beneficiaries to see their trust scores here"
                    : "Try adjusting your search or filter"}
                </p>
                {contacts.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSearch(""); setFilter("ALL") }}
                    className="border-gray-600 text-gray-300 hover:bg-gray-700"
                  >
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {visible.map((contact, idx) => (
                  <ContactCard key={contact.id} contact={contact} index={idx} />
                ))}
              </AnimatePresence>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
