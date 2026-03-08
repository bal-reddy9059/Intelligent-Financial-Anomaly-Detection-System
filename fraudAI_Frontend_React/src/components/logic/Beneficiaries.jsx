"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Users, Plus, Trash2, Search, X, User } from 'lucide-react'
import Header from "./Header"
import SidebarContent from "./SidebarContent"
import { db, auth } from './firebase'
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'

const Beneficiaries = () => {
  const [user, setUser] = useState(null)
  const [beneficiaries, setBeneficiaries] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: "", upiId: "", nickname: "" })
  const [formError, setFormError] = useState("")

  // Fetch current user from Firestore
  useEffect(() => {
    const fetchUserData = async () => {
      const currentUser = auth.currentUser
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid)
        const userDoc = await getDoc(userRef)
        if (userDoc.exists()) {
          setUser(userDoc.data())
        }
      }
    }
    fetchUserData()
  }, [])

  // Fetch beneficiaries for the current user
  const fetchBeneficiaries = async () => {
    const currentUser = auth.currentUser
    if (!currentUser) return
    const benCollection = collection(db, "beneficiaries")
    const benQuery = query(benCollection, where("userId", "==", currentUser.uid))
    const snapshot = await getDocs(benQuery)
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    setBeneficiaries(list)
  }

  useEffect(() => {
    fetchBeneficiaries()
  }, [])

  const handleAddBeneficiary = async (e) => {
    e.preventDefault()
    setFormError("")
    if (!form.name.trim() || !form.upiId.trim()) {
      setFormError("Name and UPI ID are required.")
      return
    }
    const currentUser = auth.currentUser
    if (!currentUser) {
      setFormError("You must be logged in.")
      return
    }
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
    } catch (err) {
      setFormError("Failed to add beneficiary. Please try again.")
      console.error(err)
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
    }
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

      {/* Main Content */}
      <main className="flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <Header user={user} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="p-6 space-y-6"
        >
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Users className="h-7 w-7 text-blue-400" />
              <h1 className="text-2xl font-bold text-gray-100">Beneficiaries</h1>
            </div>
            <Button
              onClick={() => { setShowAddForm(true); setFormError("") }}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4" />
              <span>Add Beneficiary</span>
            </Button>
          </div>

          {/* Add Beneficiary Form */}
          {showAddForm && (
            <Card className="bg-gray-800 border-blue-600 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-semibold text-gray-100">New Beneficiary</CardTitle>
                <button
                  onClick={() => { setShowAddForm(false); setFormError("") }}
                  className="text-gray-400 hover:text-gray-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddBeneficiary} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm text-gray-400">Full Name *</label>
                      <Input
                        type="text"
                        placeholder="e.g. John Doe"
                        value={form.name}
                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm text-gray-400">UPI ID *</label>
                      <Input
                        type="text"
                        placeholder="e.g. john@upi"
                        value={form.upiId}
                        onChange={e => setForm(p => ({ ...p, upiId: e.target.value }))}
                        className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm text-gray-400">Nickname (optional)</label>
                      <Input
                        type="text"
                        placeholder="e.g. Friend"
                        value={form.nickname}
                        onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))}
                        className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  {formError && (
                    <p className="text-red-400 text-sm">{formError}</p>
                  )}
                  <div className="flex space-x-3">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {loading ? "Saving..." : "Save Beneficiary"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setShowAddForm(false); setFormError("") }}
                      className="border-gray-600 text-gray-300 hover:bg-gray-700"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Search + List */}
          <Card className="bg-gray-800 border-gray-700 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-semibold text-gray-100">Saved Beneficiaries</CardTitle>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search beneficiaries..."
                  className="pl-8 bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 space-y-3">
                  <Users className="h-12 w-12 text-gray-600" />
                  <p className="text-center">
                    {searchTerm
                      ? "No beneficiaries match your search."
                      : "No beneficiaries added yet. Click \"Add Beneficiary\" to get started."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                  {filtered.map(b => (
                    <Card key={b.id} className="bg-gray-700 border-gray-600 hover:bg-gray-650 transition-colors duration-200">
                      <CardContent className="flex items-start justify-between p-4">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 rounded-full bg-blue-600">
                            <User className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-100">{b.name}</p>
                            {b.nickname && (
                              <p className="text-xs text-blue-400">{b.nickname}</p>
                            )}
                            <p className="text-sm text-gray-400 mt-0.5">{b.upiId}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="text-gray-500 hover:text-red-400 transition-colors duration-150 ml-2 mt-0.5"
                          title="Remove beneficiary"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </CardContent>
                    </Card>
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
