"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Users, Flag, TrendingUp, ThumbsUp, Clock, CheckCircle,
  AlertTriangle, Send, ChevronUp, BarChart2, ShieldAlert,
  Loader2, X,
} from "lucide-react"
import { auth, db } from "./firebase"
import {
  collection, query, where, getDocs, orderBy, limit,
  addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc, increment,
  onSnapshot, arrayUnion,
} from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import SidebarContent from "./SidebarContent"
import Header from "./Header"

// ── Constants ──────────────────────────────────────────────────────────────────

const REASONS = [
  "Scam call",
  "Fake merchant",
  "Phishing",
  "Lottery fraud",
  "KYC fraud",
  "Other",
]

const REASON_COLORS = {
  "Scam call":     "bg-red-500/15 border-red-500/40 text-red-400",
  "Fake merchant": "bg-orange-500/15 border-orange-500/40 text-orange-400",
  "Phishing":      "bg-yellow-500/15 border-yellow-500/40 text-yellow-400",
  "Lottery fraud": "bg-purple-500/15 border-purple-500/40 text-purple-400",
  "KYC fraud":     "bg-pink-500/15 border-pink-500/40 text-pink-400",
  "Other":         "bg-gray-500/15 border-gray-500/40 text-gray-400",
}

const TABS = ["Feed", "Leaderboard", "My Reports"]

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return ""
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function isThisWeek(ts) {
  if (!ts) return false
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  return (Date.now() - d.getTime()) < 7 * 24 * 3600 * 1000
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl"
    >
      <CheckCircle className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70">
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  )
}

// ── Report Form Card ───────────────────────────────────────────────────────────

function ReportForm({ onSubmit, submitting }) {
  const [form, setForm] = useState({ upiId: "", reason: REASONS[0], description: "" })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.upiId.trim()) return
    await onSubmit(form)
    setForm({ upiId: "", reason: REASONS[0], description: "" })
  }

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-gray-100 flex items-center gap-2">
          <Flag className="h-4 w-4 text-red-400" />
          Report a Suspicious UPI
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* UPI ID */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">
              UPI ID to report <span className="text-red-400">*</span>
            </label>
            <Input
              placeholder="e.g. scammer@ybl"
              value={form.upiId}
              onChange={e => setForm(p => ({ ...p, upiId: e.target.value }))}
              className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500"
              required
            />
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400">Reason</label>
            <div className="flex flex-wrap gap-2">
              {REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, reason: r }))}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    form.reason === r
                      ? "bg-red-600 border-red-500 text-white"
                      : "border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200 bg-gray-700/50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">Describe what happened</label>
            <textarea
              placeholder="Briefly describe the fraudulent activity..."
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
              className="w-full rounded-lg bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-500 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting || !form.upiId.trim()}
            className="bg-red-600 hover:bg-red-700 text-white gap-2"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
            ) : (
              <><Send className="h-4 w-4" /> Submit Report</>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Leaderboard ────────────────────────────────────────────────────────────────

function Leaderboard({ reports, onUpvote, currentUid }) {
  // Group by upiId
  const grouped = reports.reduce((acc, r) => {
    const key = r.upiId
    if (!acc[key]) acc[key] = { upiId: key, count: 0, reasons: {}, topDoc: null, votes: 0 }
    acc[key].count++
    acc[key].reasons[r.reason] = (acc[key].reasons[r.reason] || 0) + 1
    acc[key].votes += (r.votes || 0)
    if (!acc[key].topDoc) acc[key].topDoc = r
    return acc
  }, {})

  const sorted = Object.values(grouped)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const RANK_COLORS = ["text-yellow-400", "text-gray-300", "text-amber-600"]

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-gray-100 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-orange-400" />
          Most Reported UPIs
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No reports yet</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((item, idx) => {
              const topReason = Object.entries(item.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
              return (
                <motion.div
                  key={item.upiId}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-gray-700/50 border border-gray-600 hover:border-gray-500 transition-colors"
                >
                  {/* Rank */}
                  <span className={`text-sm font-bold w-6 text-center flex-shrink-0 ${RANK_COLORS[idx] ?? "text-gray-500"}`}>
                    #{idx + 1}
                  </span>

                  {/* UPI + reason */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-gray-200 truncate">{item.upiId}</p>
                    {topReason && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border mt-1 inline-block ${REASON_COLORS[topReason] ?? REASON_COLORS["Other"]}`}>
                        {topReason}
                      </span>
                    )}
                  </div>

                  {/* Count */}
                  <div className="text-center flex-shrink-0">
                    <p className="text-sm font-bold text-red-400">{item.count}</p>
                    <p className="text-xs text-gray-500">reports</p>
                  </div>

                  {/* Upvote */}
                  <button
                    onClick={() => item.topDoc && onUpvote(item.topDoc.id)}
                    className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-blue-400 transition-colors flex-shrink-0"
                    title="Upvote"
                  >
                    <ChevronUp className="h-4 w-4" />
                    <span className="text-xs">{item.votes}</span>
                  </button>
                </motion.div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Report Feed Item ───────────────────────────────────────────────────────────

function FeedItem({ report, onCorroborate, currentUid }) {
  const alreadyCorroborated = report.corroborators?.includes(currentUid)
  const reasonColor = REASON_COLORS[report.reason] ?? REASON_COLORS["Other"]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="p-4 rounded-xl bg-gray-800 border border-gray-700 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <ShieldAlert className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
            <span className="text-sm font-mono font-semibold text-gray-100 truncate">{report.upiId}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${reasonColor}`}>
              {report.reason}
            </span>
          </div>
          {report.description && (
            <p className="text-xs text-gray-400 line-clamp-2 mt-1">{report.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {timeAgo(report.createdAt)}
            </span>
            {(report.corroborators?.length ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-blue-400">
                <Users className="h-3 w-3" /> {report.corroborators.length} corroborated
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => onCorroborate(report.id)}
          disabled={alreadyCorroborated}
          className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
            alreadyCorroborated
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 cursor-default"
              : "border-gray-600 text-gray-400 hover:border-blue-500/50 hover:text-blue-400 hover:bg-blue-500/10"
          }`}
          title={alreadyCorroborated ? "You corroborated this" : "Corroborate this report"}
        >
          {alreadyCorroborated ? (
            <><CheckCircle className="h-3.5 w-3.5" /> Done</>
          ) : (
            <><ThumbsUp className="h-3.5 w-3.5" /> Corroborate</>
          )}
        </button>
      </div>
    </motion.div>
  )
}

// ── My Reports Tab ─────────────────────────────────────────────────────────────

function MyReports({ reports, currentUid }) {
  const mine = reports.filter(r => r.reportedBy === currentUid)

  if (mine.length === 0) {
    return (
      <Card className="bg-gray-800/50 border-gray-700">
        <CardContent className="flex flex-col items-center py-12 gap-3">
          <Flag className="h-10 w-10 text-gray-600" />
          <p className="text-gray-400 font-medium">No reports yet</p>
          <p className="text-xs text-gray-600">Reports you submit will appear here</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {mine.map((r, idx) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.04 }}
          className="p-4 rounded-xl bg-gray-800 border border-gray-700"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-sm font-mono font-semibold text-gray-100">{r.upiId}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${REASON_COLORS[r.reason] ?? REASON_COLORS["Other"]}`}>
                  {r.reason}
                </span>
              </div>
              {r.description && (
                <p className="text-xs text-gray-400 line-clamp-2">{r.description}</p>
              )}
              <p className="text-xs text-gray-600 mt-1">{timeAgo(r.createdAt)}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                Submitted
              </span>
              {(r.corroborators?.length ?? 0) > 0 && (
                <p className="text-xs text-blue-400 mt-1">{r.corroborators.length} corroboration{r.corroborators.length !== 1 ? "s" : ""}</p>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CommunityReports() {
  const [user, setUser]           = useState(null)
  const [reports, setReports]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState("Feed")
  const [toast, setToast]         = useState(null)
  const unsubRef = useRef(null)

  // Auth + real-time listener
  useEffect(() => {
    const authUnsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) return
      try {
        const userDoc = await getDoc(doc(db, "users", cu.uid))
        setUser(userDoc.exists() ? { uid: cu.uid, ...userDoc.data() } : { uid: cu.uid })
      } catch {
        setUser({ uid: cu.uid })
      }

      // Real-time feed
      const q = query(
        collection(db, "communityReports"),
        orderBy("createdAt", "desc"),
        limit(20)
      )
      if (unsubRef.current) unsubRef.current()
      unsubRef.current = onSnapshot(q, (snap) => {
        setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      }, (err) => {
        console.error("Snapshot error:", err)
        setLoading(false)
      })
    })

    return () => {
      authUnsub()
      if (unsubRef.current) unsubRef.current()
    }
  }, [])

  // Submit report
  const handleSubmit = async ({ upiId, reason, description }) => {
    if (!user) return
    setSubmitting(true)
    try {
      await addDoc(collection(db, "communityReports"), {
        upiId: upiId.trim(),
        reason,
        description: description.trim(),
        reportedBy: user.uid,
        createdAt: serverTimestamp(),
        votes: 0,
        corroborators: [],
      })
      setToast("Report submitted successfully. Thank you for keeping the community safe!")
    } catch (err) {
      console.error("Submit error:", err)
      setToast("Failed to submit report. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // Upvote
  const handleUpvote = async (docId) => {
    if (!docId) return
    try {
      await updateDoc(doc(db, "communityReports", docId), { votes: increment(1) })
    } catch (err) {
      console.error("Upvote error:", err)
    }
  }

  // Corroborate
  const handleCorroborate = async (docId) => {
    if (!user || !docId) return
    try {
      await updateDoc(doc(db, "communityReports", docId), {
        corroborators: arrayUnion(user.uid),
      })
    } catch (err) {
      console.error("Corroborate error:", err)
    }
  }

  // Stats
  const weekReports   = reports.filter(r => isThisWeek(r.createdAt)).length
  const uniqueUPIs    = new Set(reports.map(r => r.upiId)).size
  const reasonCounts  = reports.reduce((acc, r) => { acc[r.reason] = (acc[r.reason] || 0) + 1; return acc }, {})
  const topReason     = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"

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
              <div className="p-2 rounded-xl bg-orange-500/15 border border-orange-500/30">
                <Users className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-100">Community Fraud Reports</h1>
                <p className="text-sm text-gray-400">Crowdsourced fraud intelligence — report suspicious UPIs to protect others</p>
              </div>
            </div>
          </motion.div>

          {/* ── Stats Row ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: "Reports This Week", value: weekReports, color: "text-red-400",    icon: AlertTriangle },
              { label: "Unique UPIs Flagged", value: uniqueUPIs, color: "text-orange-400", icon: ShieldAlert },
              { label: "Top Reason",          value: topReason,  color: "text-yellow-400", icon: BarChart2, small: true },
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
                      <div className="min-w-0">
                        <p className={`font-bold ${s.color} ${s.small ? "text-sm" : "text-xl"} truncate`}>{s.value}</p>
                        <p className="text-xs text-gray-500 truncate">{s.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>

          {/* ── Report Form ──────────────────────────────────────────────────── */}
          <div className="mb-6">
            <ReportForm onSubmit={handleSubmit} submitting={submitting} />
          </div>

          {/* ── Tabs ─────────────────────────────────────────────────────────── */}
          <div className="flex gap-1 mb-5 bg-gray-800 border border-gray-700 rounded-xl p-1">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-150 ${
                  activeTab === tab
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {tab}
                {tab === "My Reports" && user && (
                  <span className="ml-1.5 text-xs opacity-70">
                    ({reports.filter(r => r.reportedBy === user.uid).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab Content ──────────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-20 rounded-xl bg-gray-800 animate-pulse" />
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {/* Feed */}
                {activeTab === "Feed" && (
                  <div className="space-y-3">
                    {reports.length === 0 ? (
                      <Card className="bg-gray-800/50 border-gray-700">
                        <CardContent className="flex flex-col items-center py-12 gap-3">
                          <Users className="h-10 w-10 text-gray-600" />
                          <p className="text-gray-400 font-medium">No community reports yet</p>
                          <p className="text-xs text-gray-600">Be the first to report a suspicious UPI</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <AnimatePresence mode="popLayout">
                        {reports.map(r => (
                          <FeedItem
                            key={r.id}
                            report={r}
                            onCorroborate={handleCorroborate}
                            currentUid={user?.uid}
                          />
                        ))}
                      </AnimatePresence>
                    )}
                  </div>
                )}

                {/* Leaderboard */}
                {activeTab === "Leaderboard" && (
                  <Leaderboard
                    reports={reports}
                    onUpvote={handleUpvote}
                    currentUid={user?.uid}
                  />
                )}

                {/* My Reports */}
                {activeTab === "My Reports" && (
                  <MyReports reports={reports} currentUid={user?.uid} />
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <Toast key="toast" message={toast} onClose={() => setToast(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
