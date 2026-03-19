"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Users, Plus, Trash2, Search, X, Send,
  Copy, Check, AlertCircle, UserPlus
} from 'lucide-react'
import Header from "./Header"
import SidebarContent from "./SidebarContent"
import { db, auth } from './firebase'
import { useNavigate } from "react-router-dom"
import {
  collection, getDocs, addDoc, deleteDoc, doc, getDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore'

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  "from-blue-500 to-blue-700",
  "from-purple-500 to-purple-700",
  "from-emerald-500 to-emerald-700",
  "from-pink-500 to-pink-700",
  "from-amber-500 to-amber-600",
  "from-cyan-500 to-cyan-700",
  "from-rose-500 to-rose-700",
  "from-indigo-500 to-indigo-700",
]

function avatarGradient(name) {
  return AVATAR_GRADIENTS[(name?.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length]
}

function getInitials(name) {
  if (!name) return "?"
  const parts = name.trim().split(" ")
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase()
}

// ── Component ─────────────────────────────────────────────────────────────────
const Beneficiaries = () => {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [beneficiaries, setBeneficiaries] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: "", upiId: "", nickname: "" })
  const [formError, setFormError] = useState("")
  const [copiedId, setCopiedId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    const fetchUserData = async () => {
      const currentUser = auth.currentUser
      if (currentUser) {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid))
        if (userDoc.exists()) setUser(userDoc.data())
      }
    }
    fetchUserData()
  }, [])

  const fetchBeneficiaries = async () => {
    const currentUser = auth.currentUser
    if (!currentUser) return
    const q = query(collection(db, "beneficiaries"), where("userId", "==", currentUser.uid))
    const snapshot = await getDocs(q)
    setBeneficiaries(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { fetchBeneficiaries() }, [])

  const handleAddBeneficiary = async (e) => {
    e.preventDefault()
    setFormError("")
    if (!form.name.trim() || !form.upiId.trim()) {
      setFormError("Name and UPI ID are required.")
      return
    }
    if (!form.upiId.includes("@")) {
      setFormError("UPI ID must contain '@' (e.g. name@bank).")
      return
    }
    const currentUser = auth.currentUser
    if (!currentUser) { setFormError("You must be logged in."); return }
    setLoading(true)
    try {
      await addDoc(collection(db, "beneficiaries"), {
        userId: currentUser.uid,
        name: form.name.trim(),
        upiId: form.upiId.trim(),
        nickname: form.nickname.trim(),
        createdAt: serverTimestamp(),
      })
      setForm({ name: "", upiId: "", nickname: "" })
      setShowAddForm(false)
      await fetchBeneficiaries()
    } catch {
      setFormError("Failed to add beneficiary. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, "beneficiaries", id))
      setBeneficiaries(prev => prev.filter(b => b.id !== id))
    } catch (err) {
      console.error("Failed to delete beneficiary:", err)
    } finally {
      setConfirmDelete(null)
    }
  }

  const handleCopy = (upiId) => {
    navigator.clipboard.writeText(upiId).catch(() => {})
    setCopiedId(upiId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filtered = beneficiaries.filter(b =>
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.upiId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.nickname || "").toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="flex min-h-screen bg-gray-900 text-gray-100">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>

      {/* Main */}
      <main className="flex-1">
        <Header user={user} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="p-6 max-w-5xl mx-auto space-y-6"
        >
          {/* ── Page header ──────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <Users className="h-7 w-7 text-blue-400" />
                <h1 className="text-2xl font-bold text-gray-100">Beneficiaries</h1>
                {beneficiaries.length > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                    {beneficiaries.length}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1 ml-10">
                Manage saved recipients for quick payments
              </p>
            </div>
            <Button
              onClick={() => { setShowAddForm(v => !v); setFormError("") }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white self-start sm:self-auto"
            >
              {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showAddForm ? "Cancel" : "Add Beneficiary"}
            </Button>
          </div>

          {/* ── Stats row ────────────────────────────────────────────────── */}
          {beneficiaries.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total Saved", value: beneficiaries.length, color: "blue" },
                { label: "Search Results", value: searchTerm ? filtered.length : "—", color: "purple" },
                { label: "With Nickname", value: beneficiaries.filter(b => b.nickname).length, color: "emerald" },
              ].map(s => (
                <div key={s.label}
                  className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-center">
                  <p className={`text-xl font-bold text-${s.color}-400`}>{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Add Form ─────────────────────────────────────────────────── */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="bg-gray-800 border-blue-500/50 shadow-lg shadow-blue-500/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-blue-400" />
                      <CardTitle className="text-base font-semibold text-gray-100">
                        New Beneficiary
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddBeneficiary} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-400">
                            Full Name <span className="text-red-400">*</span>
                          </label>
                          <Input
                            placeholder="e.g. Rahul Sharma"
                            value={form.name}
                            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-400">
                            UPI ID <span className="text-red-400">*</span>
                          </label>
                          <Input
                            placeholder="e.g. rahul@yesbank"
                            value={form.upiId}
                            onChange={e => setForm(p => ({ ...p, upiId: e.target.value }))}
                            className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-400">
                            Nickname{" "}
                            <span className="text-gray-600 font-normal">(optional)</span>
                          </label>
                          <Input
                            placeholder="e.g. College Friend"
                            value={form.nickname}
                            onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))}
                            className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 h-9"
                          />
                        </div>
                      </div>

                      {formError && (
                        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          {formError}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button type="submit" disabled={loading}
                          className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-5">
                          {loading ? (
                            <>
                              <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                              Saving…
                            </>
                          ) : (
                            <><Plus className="h-4 w-4 mr-1.5" />Save Beneficiary</>
                          )}
                        </Button>
                        <Button type="button" variant="outline"
                          onClick={() => { setShowAddForm(false); setFormError("") }}
                          className="border-gray-600 text-gray-300 hover:bg-gray-700 h-9">
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Search + List ────────────────────────────────────────────── */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base font-semibold text-gray-100">
                Saved Beneficiaries
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search beneficiaries..."
                  className="pl-8 pr-8 bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 h-8 text-sm w-52"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {filtered.length === 0 ? (
                /* ── Empty state ── */
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <div className="p-5 rounded-full bg-gray-700/50">
                    <Users className="h-10 w-10 text-gray-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-gray-400">
                      {searchTerm ? "No results found" : "No beneficiaries yet"}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {searchTerm
                        ? `No beneficiaries match "${searchTerm}"`
                        : "Add your first beneficiary to send money quickly"}
                    </p>
                  </div>
                  {!searchTerm && (
                    <Button size="sm"
                      onClick={() => { setShowAddForm(true); setFormError("") }}
                      className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Plus className="h-4 w-4 mr-1.5" /> Add First Beneficiary
                    </Button>
                  )}
                </div>
              ) : (
                /* ── Cards grid ── */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((b, idx) => (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Card className="bg-gray-700/60 border-gray-600 hover:border-blue-500/40 hover:bg-gray-700 transition-all duration-200 group">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {/* Colored avatar with initials */}
                            <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${avatarGradient(b.name)} flex items-center justify-center flex-shrink-0 text-sm font-bold text-white shadow-md select-none`}>
                              {getInitials(b.name)}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <p className="font-semibold text-gray-100 text-sm truncate leading-tight">
                                    {b.name}
                                  </p>
                                  {b.nickname && (
                                    <span className="inline-block text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full mt-0.5">
                                      {b.nickname}
                                    </span>
                                  )}
                                </div>

                                {/* Delete — shows confirm inline */}
                                {confirmDelete === b.id ? (
                                  <div className="flex items-center gap-1.5 flex-shrink-0 text-xs">
                                    <button onClick={() => handleDelete(b.id)}
                                      className="text-red-400 hover:text-red-300 font-semibold">
                                      Delete
                                    </button>
                                    <span className="text-gray-600">·</span>
                                    <button onClick={() => setConfirmDelete(null)}
                                      className="text-gray-400 hover:text-gray-200">
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDelete(b.id)}
                                    className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100 mt-0.5"
                                    title="Remove beneficiary">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>

                              {/* UPI ID + copy */}
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <p className="text-xs text-gray-400 font-mono truncate">{b.upiId}</p>
                                <button
                                  onClick={() => handleCopy(b.upiId)}
                                  className="flex-shrink-0 text-gray-500 hover:text-blue-400 transition-colors"
                                  title="Copy UPI ID">
                                  {copiedId === b.upiId
                                    ? <Check className="h-3 w-3 text-green-400" />
                                    : <Copy className="h-3 w-3" />
                                  }
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Quick Send */}
                          <button
                            onClick={() => navigate("/send-money", {
                              state: { recipientUPI: b.upiId, recipientName: b.name }
                            })}
                            className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-medium text-blue-400 border border-blue-500/30 rounded-lg py-1.5 hover:bg-blue-500/10 hover:border-blue-400/60 transition-all duration-150"
                          >
                            <Send className="h-3.5 w-3.5" />
                            Send Money
                          </button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

export default Beneficiaries
