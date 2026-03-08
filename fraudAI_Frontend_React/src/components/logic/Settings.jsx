"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Settings,
  User,
  Bell,
  Shield,
  Eye,
  EyeOff,
  Save,
  AlertTriangle,
} from 'lucide-react'
import Header from "./Header"
import SidebarContent from "./SidebarContent"
import { auth, db } from './firebase'
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

const SettingsPage = () => {
  const [user, setUser] = useState(null)
  const [isGoogleUser, setIsGoogleUser] = useState(false)
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [upiId, setUpiId] = useState("")

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)

  const [notifications, setNotifications] = useState({
    transactionAlerts: true,
    fraudAlerts: true,
    monthlyStatements: false,
    promotions: false,
  })

  const [profileStatus, setProfileStatus] = useState("")
  const [passwordStatus, setPasswordStatus] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    const fetchUser = async () => {
      const currentUser = auth.currentUser
      if (currentUser) {
        setEmail(currentUser.email || "")
        setDisplayName(currentUser.displayName || "")
        const providerId = currentUser.providerData?.[0]?.providerId
        setIsGoogleUser(providerId === 'google.com')
        const userRef = doc(db, "users", currentUser.uid)
        const userDoc = await getDoc(userRef)
        if (userDoc.exists()) {
          const data = userDoc.data()
          setUpiId(data.upiId || "")
          if (data.notifications) setNotifications(data.notifications)
          setUser(data)
        }
      }
    }
    fetchUser()
  }, [])

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    setProfileStatus("")
    try {
      const currentUser = auth.currentUser
      if (!currentUser) throw new Error("Not logged in")
      const userRef = doc(db, "users", currentUser.uid)
      await updateDoc(userRef, { notifications })
      setProfileStatus("Settings saved successfully.")
    } catch (err) {
      setProfileStatus("Failed to save settings. Please try again.")
      console.error(err)
    } finally {
      setSavingProfile(false)
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
      const currentUser = auth.currentUser
      if (!currentUser || !currentUser.email) throw new Error("Not logged in")
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword)
      await reauthenticateWithCredential(currentUser, credential)
      await updatePassword(currentUser, newPassword)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setPasswordStatus("Password updated successfully.")
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setPasswordStatus("Current password is incorrect.")
      } else {
        setPasswordStatus("Failed to update password. Please try again.")
      }
      console.error(err)
    } finally {
      setSavingPassword(false)
    }
  }

  const toggleNotification = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="flex min-h-screen bg-gray-900 text-gray-100">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <Header user={user} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="p-6 space-y-6"
        >
          {/* Page Title */}
          <div className="flex items-center space-x-3">
            <Settings className="h-7 w-7 text-blue-400" />
            <h1 className="text-2xl font-bold text-gray-100">Settings</h1>
          </div>

          {/* Profile Info */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-100 flex items-center space-x-2">
                <User className="h-5 w-5 text-blue-400" />
                <span>Profile Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm text-gray-400">Display Name</Label>
                  <Input
                    value={displayName}
                    disabled
                    className="bg-gray-700 border-gray-600 text-gray-300 disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-gray-400">Email Address</Label>
                  <Input
                    value={email}
                    disabled
                    className="bg-gray-700 border-gray-600 text-gray-300 disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-gray-400">UPI ID</Label>
                  <Input
                    value={upiId}
                    disabled
                    className="bg-gray-700 border-gray-600 text-gray-300 disabled:opacity-60"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">Profile details are managed through your Google account and cannot be edited here.</p>
            </CardContent>
          </Card>

          {/* Notification Preferences */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-100 flex items-center space-x-2">
                <Bell className="h-5 w-5 text-blue-400" />
                <span>Notification Preferences</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "transactionAlerts", label: "Transaction Alerts", desc: "Get notified for every transaction on your account" },
                { key: "fraudAlerts", label: "Fraud & Anomaly Alerts", desc: "Receive alerts when suspicious activity is detected" },
                { key: "monthlyStatements", label: "Monthly Statements", desc: "Receive a monthly summary of your account activity" },
                { key: "promotions", label: "Promotions & Offers", desc: "Stay updated with cashback offers and promotions" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                  <div>
                    <p className="font-medium text-gray-100 text-sm">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <button
                    onClick={() => toggleNotification(key)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                      notifications[key] ? 'bg-blue-600' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                        notifications[key] ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ))}

              {profileStatus && (
                <p className={`text-sm ${profileStatus.includes("success") ? 'text-green-400' : 'text-red-400'}`}>
                  {profileStatus}
                </p>
              )}

              <Button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-2"
              >
                <Save className="h-4 w-4" />
                <span>{savingProfile ? "Saving..." : "Save Preferences"}</span>
              </Button>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-100 flex items-center space-x-2">
                <Shield className="h-5 w-5 text-blue-400" />
                <span>Change Password</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isGoogleUser ? (
                <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4 flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-300">Google Account Detected</p>
                    <p className="text-xs text-blue-400 mt-1">
                      You signed in with Google. Password management is handled through your Google account.
                      Visit <span className="underline">myaccount.google.com</span> to change your Google password.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3 flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-yellow-300">
                      For email/password accounts only. Enter your current password to authenticate before setting a new one.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="text-sm text-gray-400">Current Password</Label>
                      <div className="relative">
                        <Input
                          type={showCurrentPw ? "text" : "password"}
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          placeholder="Current password"
                          className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPw(p => !p)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                        >
                          {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm text-gray-400">New Password</Label>
                      <div className="relative">
                        <Input
                          type={showNewPw ? "text" : "password"}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="New password"
                          className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPw(p => !p)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                        >
                          {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm text-gray-400">Confirm New Password</Label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500"
                      />
                    </div>
                  </div>

                  {passwordStatus && (
                    <p className={`text-sm ${passwordStatus.includes("success") ? 'text-green-400' : 'text-red-400'}`}>
                      {passwordStatus}
                    </p>
                  )}

                  <Button
                    onClick={handleChangePassword}
                    disabled={savingPassword}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-2"
                  >
                    <Shield className="h-4 w-4" />
                    <span>{savingPassword ? "Updating..." : "Update Password"}</span>
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
