"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Settings, User, Bell, Shield, Eye, EyeOff, Save,
  AlertTriangle, Copy, Check, BrainCircuit, Sliders,
  ShieldCheck, CreditCard, Calendar, Mail, Fingerprint,
  Info, CheckCircle2, XCircle,
} from 'lucide-react'
import Header from "./Header"
import SidebarContent from "./SidebarContent"
import { auth, db } from './firebase'
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return "?"
  const parts = name.trim().split(" ")
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase()
}

const AVATAR_GRADIENTS = [
  "from-blue-500 to-blue-700", "from-purple-500 to-purple-700",
  "from-emerald-500 to-emerald-700", "from-pink-500 to-pink-700",
  "from-amber-500 to-amber-600", "from-cyan-500 to-cyan-700",
]
function avatarGradient(name) {
  return AVATAR_GRADIENTS[(name?.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length]
}

function passwordStrength(pw) {
  if (!pw) return { score: 0, label: "", color: "" }
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  const levels = [
    { label: "", color: "" },
    { label: "Weak", color: "bg-red-500", text: "text-red-400" },
    { label: "Fair", color: "bg-yellow-500", text: "text-yellow-400" },
    { label: "Good", color: "bg-blue-500", text: "text-blue-400" },
    { label: "Strong", color: "bg-green-500", text: "text-green-400" },
  ]
  return { score: s, ...levels[s] }
}

// ── Reusable Toggle ───────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0 ${
        checked ? "bg-blue-600" : "bg-gray-600"
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
        checked ? "translate-x-6" : "translate-x-1"
      }`} />
    </button>
  )
}

// ── Status message ─────────────────────────────────────────────────────────────
function StatusMsg({ msg }) {
  if (!msg) return null
  const ok = msg.toLowerCase().includes("success")
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
        ok ? "bg-green-500/10 border border-green-500/30 text-green-400"
           : "bg-red-500/10 border border-red-500/30 text-red-400"
      }`}
    >
      {ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
           : <XCircle className="h-4 w-4 flex-shrink-0" />}
      {msg}
    </motion.div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
const SettingsPage = () => {
  const [user, setUser]           = useState(null)
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [isGoogleUser, setIsGoogleUser] = useState(false)
  const [displayName, setDisplayName]  = useState("")
  const [email, setEmail]         = useState("")
  const [upiId, setUpiId]         = useState("")
  const [memberSince, setMemberSince] = useState("")
  const [copiedUPI, setCopiedUPI] = useState(false)

  // Notifications
  const [notifications, setNotifications] = useState({
    transactionAlerts: true,
    fraudAlerts: true,
    monthlyStatements: false,
    promotions: false,
  })
  const [notifDirty, setNotifDirty]   = useState(false)
  const [profileStatus, setProfileStatus] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)

  // AI preferences
  const [aiPrefs, setAiPrefs] = useState({
    sensitivity: "medium",   // low | medium | high
    autoCheckOnSend: true,
    defaultModel: "isolation_forest",
  })
  const [aiDirty, setAiDirty]     = useState(false)
  const [aiStatus, setAiStatus]   = useState("")
  const [savingAi, setSavingAi]   = useState(false)

  // Password
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword]   = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw]   = useState(false)
  const [passwordStatus, setPasswordStatus] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)

  const strength = passwordStrength(newPassword)

  // ── Load user data ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchUser = async () => {
      const cu = auth.currentUser
      if (!cu) return
      setFirebaseUser(cu)
      setEmail(cu.email || "")
      setDisplayName(cu.displayName || "")
      setIsGoogleUser(cu.providerData?.[0]?.providerId === "google.com")
      if (cu.metadata?.creationTime) {
        setMemberSince(new Date(cu.metadata.creationTime).toLocaleDateString("en-IN", {
          year: "numeric", month: "long", day: "numeric"
        }))
      }
      const userDoc = await getDoc(doc(db, "users", cu.uid))
      if (userDoc.exists()) {
        const data = userDoc.data()
        setUpiId(data.upiId || "")
        if (data.notifications) setNotifications(data.notifications)
        if (data.aiPrefs) setAiPrefs(prev => ({ ...prev, ...data.aiPrefs }))
        setUser(data)
      }
    }
    fetchUser()
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleCopyUPI = () => {
    navigator.clipboard.writeText(upiId).catch(() => {})
    setCopiedUPI(true)
    setTimeout(() => setCopiedUPI(false), 2000)
  }

  const toggleNotification = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }))
    setNotifDirty(true)
    setProfileStatus("")
  }

  const handleSaveNotifications = async () => {
    setSavingProfile(true)
    setProfileStatus("")
    try {
      const cu = auth.currentUser
      if (!cu) throw new Error("Not logged in")
      await updateDoc(doc(db, "users", cu.uid), { notifications })
      setProfileStatus("Notification preferences saved successfully.")
      setNotifDirty(false)
    } catch {
      setProfileStatus("Failed to save preferences. Please try again.")
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSaveAiPrefs = async () => {
    setSavingAi(true)
    setAiStatus("")
    try {
      const cu = auth.currentUser
      if (!cu) throw new Error("Not logged in")
      await updateDoc(doc(db, "users", cu.uid), { aiPrefs })
      setAiStatus("AI preferences saved successfully.")
      setAiDirty(false)
    } catch {
      setAiStatus("Failed to save AI preferences.")
    } finally {
      setSavingAi(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordStatus("")
    if (!newPassword || !confirmPassword || !currentPassword) {
      setPasswordStatus("Please fill in all password fields.")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus("New passwords do not match.")
      return
    }
    if (newPassword.length < 6) {
      setPasswordStatus("New password must be at least 6 characters.")
      return
    }
    setSavingPassword(true)
    try {
      const cu = auth.currentUser
      if (!cu?.email) throw new Error("Not logged in")
      const cred = EmailAuthProvider.credential(cu.email, currentPassword)
      await reauthenticateWithCredential(cu, cred)
      await updatePassword(cu, newPassword)
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("")
      setPasswordStatus("Password updated successfully.")
    } catch (err) {
      setPasswordStatus(
        err.code === "auth/wrong-password" || err.code === "auth/invalid-credential"
          ? "Current password is incorrect."
          : "Failed to update password. Please try again."
      )
    } finally {
      setSavingPassword(false)
    }
  }

  // ── Section label ───────────────────────────────────────────────────────────
  const SectionIcon = ({ icon: Icon, label, color = "text-blue-400" }) => (
    <div className="flex items-center gap-2">
      <Icon className={`h-5 w-5 ${color}`} />
      <span className="text-base font-semibold text-gray-100">{label}</span>
    </div>
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
          className="p-6 max-w-4xl mx-auto space-y-6"
        >
          {/* ── Page title ─────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-3">
              <Settings className="h-7 w-7 text-blue-400" />
              <h1 className="text-2xl font-bold text-gray-100">Settings</h1>
            </div>
            <p className="text-sm text-gray-400 mt-1 ml-10">
              Manage your account, preferences and security
            </p>
          </div>

          {/* ── Profile card ───────────────────────────────────────────── */}
          <Card className="bg-gray-800 border-gray-700 overflow-hidden">
            {/* Colored banner */}
            <div className={`h-16 bg-gradient-to-r ${avatarGradient(displayName)} opacity-30`} />
            <CardContent className="px-6 pb-6 -mt-8">
              {/* Avatar row */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-5">
                <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${avatarGradient(displayName)} flex items-center justify-center text-xl font-bold text-white shadow-lg ring-4 ring-gray-800 flex-shrink-0`}>
                  {firebaseUser?.photoURL
                    ? <img src={firebaseUser.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
                    : getInitials(displayName)
                  }
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  <p className="text-lg font-bold text-gray-100 truncate">{displayName}</p>
                  <p className="text-sm text-gray-400 truncate">{email}</p>
                </div>
                {memberSince && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 pb-1 flex-shrink-0">
                    <Calendar className="h-3.5 w-3.5" />
                    Member since {memberSince}
                  </div>
                )}
              </div>

              {/* Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Display Name */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Display Name
                  </Label>
                  <Input value={displayName} disabled
                    className="bg-gray-700 border-gray-600 text-gray-300 disabled:opacity-70 h-9" />
                </div>
                {/* Email */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> Email Address
                  </Label>
                  <Input value={email} disabled
                    className="bg-gray-700 border-gray-600 text-gray-300 disabled:opacity-70 h-9" />
                </div>
                {/* UPI ID + copy */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" /> UPI ID
                  </Label>
                  <div className="relative">
                    <Input value={upiId} disabled
                      className="bg-gray-700 border-gray-600 text-gray-300 disabled:opacity-70 h-9 pr-9 font-mono" />
                    <button onClick={handleCopyUPI}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-400 transition-colors"
                      title="Copy UPI ID">
                      {copiedUPI
                        ? <Check className="h-3.5 w-3.5 text-green-400" />
                        : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 text-xs text-gray-500 bg-gray-700/40 rounded-lg px-3 py-2">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                Profile details are managed through your Google account and cannot be edited here.
              </div>
            </CardContent>
          </Card>

          {/* ── AI Detection Preferences ───────────────────────────────── */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <SectionIcon icon={BrainCircuit} label="AI Detection Preferences" color="text-purple-400" />
                {aiDirty && (
                  <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                    Unsaved changes
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Fraud Sensitivity */}
              <div>
                <p className="text-sm font-medium text-gray-200 mb-1 flex items-center gap-1.5">
                  <Sliders className="h-4 w-4 text-purple-400" /> Fraud Detection Sensitivity
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Higher sensitivity catches more fraud but may flag legitimate transactions.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: "low",    label: "Low",    desc: "Fewer alerts", color: "border-green-500/60 bg-green-500/10 text-green-300" },
                    { val: "medium", label: "Medium", desc: "Balanced",     color: "border-blue-500/60 bg-blue-500/10 text-blue-300" },
                    { val: "high",   label: "High",   desc: "Maximum safety", color: "border-red-500/60 bg-red-500/10 text-red-300" },
                  ].map(opt => (
                    <button key={opt.val}
                      onClick={() => { setAiPrefs(p => ({ ...p, sensitivity: opt.val })); setAiDirty(true); setAiStatus("") }}
                      className={`rounded-xl border-2 p-3 text-center transition-all duration-150 ${
                        aiPrefs.sensitivity === opt.val
                          ? opt.color
                          : "border-gray-600 bg-gray-700/40 text-gray-400 hover:border-gray-500"
                      }`}>
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-xs opacity-75 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-0 divide-y divide-gray-700">
                {[
                  {
                    key: "autoCheckOnSend",
                    label: "Auto-check transactions on Send",
                    desc: "Run fraud detection automatically before every payment",
                    icon: ShieldCheck, color: "text-green-400",
                  },
                ].map(({ key, label, desc, icon: Icon, color }) => (
                  <div key={key} className="flex items-center justify-between py-3">
                    <div className="flex items-start gap-3">
                      <Icon className={`h-4 w-4 ${color} mt-0.5 flex-shrink-0`} />
                      <div>
                        <p className="text-sm font-medium text-gray-100">{label}</p>
                        <p className="text-xs text-gray-400">{desc}</p>
                      </div>
                    </div>
                    <Toggle checked={aiPrefs[key]}
                      onChange={() => { setAiPrefs(p => ({ ...p, [key]: !p[key] })); setAiDirty(true); setAiStatus("") }} />
                  </div>
                ))}
              </div>

              {/* Default Model */}
              <div>
                <p className="text-sm font-medium text-gray-200 mb-2">Default Detection Model</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { val: "isolation_forest", label: "Isolation Forest" },
                    { val: "autoencoder",      label: "Autoencoder" },
                    { val: "both",             label: "Both Models" },
                  ].map(opt => (
                    <button key={opt.val}
                      onClick={() => { setAiPrefs(p => ({ ...p, defaultModel: opt.val })); setAiDirty(true); setAiStatus("") }}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        aiPrefs.defaultModel === opt.val
                          ? "border-blue-500/60 bg-blue-500/10 text-blue-300 font-medium"
                          : "border-gray-600 text-gray-400 hover:border-gray-500"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <StatusMsg msg={aiStatus} />
              <Button onClick={handleSaveAiPrefs} disabled={savingAi || !aiDirty}
                className="bg-purple-600 hover:bg-purple-700 text-white h-9 px-5 disabled:opacity-50">
                {savingAi
                  ? <><div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Saving…</>
                  : <><Save className="h-4 w-4 mr-1.5" />Save AI Preferences</>
                }
              </Button>
            </CardContent>
          </Card>

          {/* ── Notification Preferences ───────────────────────────────── */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <SectionIcon icon={Bell} label="Notification Preferences" />
                {notifDirty && (
                  <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                    Unsaved changes
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {[
                {
                  key: "transactionAlerts",
                  label: "Transaction Alerts",
                  desc: "Get notified for every transaction on your account",
                  icon: CreditCard, color: "text-blue-400",
                },
                {
                  key: "fraudAlerts",
                  label: "Fraud & Anomaly Alerts",
                  desc: "Receive alerts when suspicious activity is detected",
                  icon: Shield, color: "text-red-400",
                },
                {
                  key: "monthlyStatements",
                  label: "Monthly Statements",
                  desc: "Receive a monthly summary of your account activity",
                  icon: Calendar, color: "text-green-400",
                },
                {
                  key: "promotions",
                  label: "Promotions & Offers",
                  desc: "Stay updated with cashback offers and promotions",
                  icon: Fingerprint, color: "text-amber-400",
                },
              ].map(({ key, label, desc, icon: Icon, color }) => (
                <div key={key}
                  className="flex items-center justify-between py-3 border-b border-gray-700 last:border-0">
                  <div className="flex items-start gap-3">
                    <Icon className={`h-4 w-4 ${color} mt-0.5 flex-shrink-0`} />
                    <div>
                      <p className="text-sm font-medium text-gray-100">{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                  </div>
                  <Toggle checked={notifications[key]} onChange={() => toggleNotification(key)} />
                </div>
              ))}

              <div className="pt-3 space-y-3">
                <StatusMsg msg={profileStatus} />
                <Button onClick={handleSaveNotifications} disabled={savingProfile || !notifDirty}
                  className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-5 disabled:opacity-50">
                  {savingProfile
                    ? <><div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Saving…</>
                    : <><Save className="h-4 w-4 mr-1.5" />Save Preferences</>
                  }
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Security / Change Password ─────────────────────────────── */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <SectionIcon icon={Shield} label="Security" color="text-green-400" />
            </CardHeader>
            <CardContent className="space-y-4">
              {isGoogleUser ? (
                <div className="bg-blue-900/30 border border-blue-700/40 rounded-xl p-4 flex items-start gap-3">
                  <div className="p-2 rounded-full bg-blue-500/20 flex-shrink-0">
                    <ShieldCheck className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-300">Secured with Google</p>
                    <p className="text-xs text-blue-400 mt-1 leading-relaxed">
                      You signed in with Google. Your password is managed by Google.
                      Visit <span className="underline cursor-pointer">myaccount.google.com</span> to
                      update your credentials.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-yellow-300">
                      Enter your current password to authenticate before setting a new one.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Current */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-400">Current Password</Label>
                      <div className="relative">
                        <Input type={showCurrentPw ? "text" : "password"}
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          placeholder="Current password"
                          className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 pr-10 h-9" />
                        <button type="button" onClick={() => setShowCurrentPw(p => !p)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                          {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* New */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-400">New Password</Label>
                      <div className="relative">
                        <Input type={showNewPw ? "text" : "password"}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="New password"
                          className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 pr-10 h-9" />
                        <button type="button" onClick={() => setShowNewPw(p => !p)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                          {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {/* Strength bar */}
                      {newPassword && (
                        <div className="space-y-1 mt-1">
                          <div className="flex gap-1">
                            {[1, 2, 3, 4].map(n => (
                              <div key={n}
                                className={`h-1.5 flex-1 rounded-full transition-colors ${
                                  strength.score >= n ? strength.color : "bg-gray-600"
                                }`} />
                            ))}
                          </div>
                          {strength.label && (
                            <p className={`text-xs font-medium ${strength.text}`}>{strength.label}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Confirm */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-400">Confirm New Password</Label>
                      <div className="relative">
                        <Input type="password"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          className={`bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 h-9 pr-9 ${
                            confirmPassword && confirmPassword !== newPassword
                              ? "border-red-500/60"
                              : confirmPassword && confirmPassword === newPassword
                              ? "border-green-500/60"
                              : ""
                          }`} />
                        {confirmPassword && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            {confirmPassword === newPassword
                              ? <Check className="h-3.5 w-3.5 text-green-400" />
                              : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <StatusMsg msg={passwordStatus} />
                  <Button onClick={handleChangePassword} disabled={savingPassword}
                    className="bg-green-700 hover:bg-green-600 text-white h-9 px-5">
                    {savingPassword
                      ? <><div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Updating…</>
                      : <><Shield className="h-4 w-4 mr-1.5" />Update Password</>
                    }
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

export default SettingsPage
