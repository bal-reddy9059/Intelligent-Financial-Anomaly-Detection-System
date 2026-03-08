"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileText, Download, ArrowUpRight, ArrowDownLeft, Calendar } from 'lucide-react'
import Header from "./Header"
import SidebarContent from "./SidebarContent"
import { db, auth } from './firebase'
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore'

const Statements = () => {
  const [user, setUser] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      const currentUser = auth.currentUser
      if (!currentUser) return

      const userRef = doc(db, "users", currentUser.uid)
      const userDoc = await getDoc(userRef)
      if (!userDoc.exists()) return

      const userData = userDoc.data()
      setUser(userData)

      const transactionsCollection = collection(db, "transactions")
      const transactionsQuery = query(
        transactionsCollection,
        where("senderUPI", "==", userData.upiId)
      )
      const transactionSnapshot = await getDocs(transactionsQuery)
      const transactionList = transactionSnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
      setTransactions(transactionList)
    }

    fetchData()
  }, []) // Run once on mount

  // Group transactions by month
  const groupedByMonth = transactions.reduce((acc, tx) => {
    const date = new Date(tx.createdAt.seconds * 1000)
    const monthKey = date.toLocaleString('default', { month: 'long', year: 'numeric' })
    if (!acc[monthKey]) acc[monthKey] = []
    acc[monthKey].push(tx)
    return acc
  }, {})

  const months = Object.keys(groupedByMonth)
  const activeMonth = selectedMonth || months[0]

  const monthTransactions = activeMonth ? groupedByMonth[activeMonth] || [] : []
  const totalDebits = monthTransactions
    .filter(tx => tx.type !== 'incoming')
    .reduce((sum, tx) => sum + tx.amount, 0)
  const totalCredits = monthTransactions
    .filter(tx => tx.type === 'incoming')
    .reduce((sum, tx) => sum + tx.amount, 0)

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
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="h-7 w-7 text-blue-400" />
              <h1 className="text-2xl font-bold text-gray-100">Account Statements</h1>
            </div>
            <Button
              variant="outline"
              className="flex items-center space-x-2 border-gray-600 text-gray-300 hover:bg-gray-700"
              onClick={() => window.print()}
            >
              <Download className="h-4 w-4" />
              <span>Download Statement</span>
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {/* Month Selector */}
            <Card className="bg-gray-800 border-gray-700 md:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-400 flex items-center space-x-2">
                  <Calendar className="h-4 w-4" />
                  <span>Select Month</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {months.length === 0 ? (
                  <p className="text-gray-500 text-sm">No statements available</p>
                ) : (
                  months.map(month => (
                    <button
                      key={month}
                      onClick={() => setSelectedMonth(month)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors duration-150 ${
                        activeMonth === month
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {month}
                    </button>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Statement Detail */}
            <div className="md:col-span-3 space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4">
                    <p className="text-xs text-gray-400">Total Transactions</p>
                    <p className="text-2xl font-bold text-blue-400">{monthTransactions.length}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4">
                    <p className="text-xs text-gray-400">Total Debits</p>
                    <p className="text-2xl font-bold text-red-400">₹{totalDebits.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4">
                    <p className="text-xs text-gray-400">Total Credits</p>
                    <p className="text-2xl font-bold text-green-400">₹{totalCredits.toFixed(2)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Transaction List */}
              <Card className="bg-gray-800 border-gray-700 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-100">
                    {activeMonth || 'No Month Selected'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {monthTransactions.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No transactions for this period.</p>
                  ) : (
                    <div className="space-y-3">
                      {monthTransactions.map(tx => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors duration-150"
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-full ${tx.type === 'incoming' ? 'bg-green-500' : 'bg-red-500'}`}>
                              {tx.type === 'incoming'
                                ? <ArrowDownLeft className="h-4 w-4 text-white" />
                                : <ArrowUpRight className="h-4 w-4 text-white" />
                              }
                            </div>
                            <div>
                              <p className="font-medium text-gray-100 text-sm">{tx.recipientUPI}</p>
                              <p className="text-xs text-gray-400">
                                {new Date(tx.createdAt.seconds * 1000).toLocaleDateString()} &middot; {tx.remarks}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-semibold ${tx.type === 'incoming' ? 'text-green-400' : 'text-red-400'}`}>
                              {tx.type === 'incoming' ? '+' : '-'}₹{tx.amount.toFixed(2)}
                            </p>
                            <Badge
                              variant={
                                tx.status === "Completed" ? "success"
                                : tx.status === "Pending" ? "warning"
                                : "destructive"
                              }
                              className="mt-1 text-xs"
                            >
                              {tx.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
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
