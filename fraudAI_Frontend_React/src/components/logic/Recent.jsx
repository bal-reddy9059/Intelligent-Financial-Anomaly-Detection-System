"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Search, ArrowUpRight, ArrowDownLeft, ShieldCheck, ShieldAlert, Filter } from 'lucide-react'
import Header from "./Header"
import SidebarContent from "./SidebarContent"
import { db } from './firebase'
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore'
import { auth } from './firebase'

const STATUS_COLORS = {
  Completed: "bg-green-500/20 text-green-300",
  Pending: "bg-yellow-500/20 text-yellow-300",
  Failed: "bg-red-500/20 text-red-300",
};

const CATEGORIES = ["All", "Rent", "Utilities", "Groceries", "Entertainment", "Other"];

const RecentTransactions = () => {
  const [user, setUser] = useState(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [transactions, setTransactions] = useState([])
  const [activeCategory, setActiveCategory] = useState("All")

  useEffect(() => {
    const fetchData = async () => {
      const currentUser = auth.currentUser
      if (!currentUser) return

      const userRef = doc(db, "users", currentUser.uid)
      const userDoc = await getDoc(userRef)
      if (!userDoc.exists()) return

      const userData = userDoc.data()
      setUser(userData)

      const transactionsQuery = query(
        collection(db, "transactions"),
        where("senderUPI", "==", userData.upiId)
      )
      const txSnapshot = await getDocs(transactionsQuery)
      const txList = txSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setTransactions(txList)
    }
    fetchData()
  }, [])

  const filtered = transactions.filter((tx) => {
    const matchSearch =
      (tx.recipientUPI ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.amount ?? "").toString().includes(searchTerm) ||
      (tx.remarks ?? "").toLowerCase().includes(searchTerm.toLowerCase())

    const matchCategory =
      activeCategory === "All" ||
      (tx.remarks ?? "other").toLowerCase() === activeCategory.toLowerCase()

    return matchSearch && matchCategory
  })

  const totalSpent = transactions.reduce((s, tx) => s + (tx.amount ?? 0), 0)
  const flaggedCount = transactions.filter(tx => tx.fraudVerdict === "FRAUD").length

  return (
    <div className="flex min-h-screen bg-gray-900 text-gray-100">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>

      <main className="flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <Header user={user} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="p-6 space-y-5"
        >
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Transactions", value: transactions.length, color: "text-blue-400" },
              { label: "Total Spent", value: `₹${totalSpent.toFixed(2)}`, color: "text-red-400" },
              { label: "AI Flagged", value: flaggedCount, color: flaggedCount > 0 ? "text-orange-400" : "text-green-400" },
            ].map(s => (
              <Card key={s.label} className="bg-gray-800 border-gray-700">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-gray-400">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-gray-500 flex-shrink-0" />
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Transaction list */}
          <Card className="bg-gray-800 border-gray-700 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xl font-bold text-gray-100">
                Transactions
                <span className="ml-2 text-sm text-gray-400 font-normal">({filtered.length})</span>
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search..."
                  className="pl-8 w-52 bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-sm">No transactions found.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((tx) => {
                    const isFlagged = tx.fraudVerdict === "FRAUD"
                    return (
                      <div
                        key={tx.id}
                        className={`flex items-center justify-between p-4 rounded-xl transition-colors ${
                          isFlagged
                            ? "bg-red-500/5 border border-red-500/20 hover:bg-red-500/10"
                            : "bg-gray-700/50 hover:bg-gray-700"
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-full ${tx.type === 'incoming' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                            {tx.type === 'incoming'
                              ? <ArrowDownLeft className="h-4 w-4 text-green-400" />
                              : <ArrowUpRight className="h-4 w-4 text-red-400" />
                            }
                          </div>
                          <div>
                            <p className="font-medium text-gray-100 text-sm">{tx.recipientUPI}</p>
                            <p className="text-xs text-gray-400">
                              {tx.createdAt ? new Date(tx.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : "—"}
                              {tx.remarks ? ` · ${tx.remarks}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-right">
                          <div>
                            <p className={`text-sm font-semibold ${tx.type === 'incoming' ? 'text-green-400' : 'text-red-400'}`}>
                              {tx.type === 'incoming' ? '+' : '-'}₹{(tx.amount ?? 0).toFixed(2)}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[tx.status] ?? "bg-gray-600 text-gray-300"}`}>
                              {tx.status ?? "Unknown"}
                            </span>
                          </div>
                          {/* AI verdict badge */}
                          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                            isFlagged
                              ? "bg-red-500/20 text-red-300 border border-red-500/30"
                              : "bg-green-500/10 text-green-400"
                          }`}>
                            {isFlagged
                              ? <ShieldAlert className="h-3 w-3" />
                              : <ShieldCheck className="h-3 w-3" />
                            }
                            <span>{isFlagged ? "Flagged" : "Safe"}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

export default RecentTransactions
