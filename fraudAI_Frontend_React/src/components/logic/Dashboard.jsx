import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import Header from "./Header.jsx";
import SidebarContent from "./SidebarContent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DollarSign, CreditCard, Activity, Zap, Send, ShieldCheck,
  ArrowUpRight, AlertTriangle, TrendingUp, ShieldAlert,
  BrainCircuit, ShieldX
} from 'lucide-react';
import { motion } from "framer-motion";
import { Line, LineChart, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import axios from "axios";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [upiId, setUpiId] = useState("");
  const [balance, setBalance] = useState(50000);
  const [transactions, setTransactions] = useState([]);
  const [recentTx, setRecentTx] = useState([]);
  const [mlStats, setMlStats] = useState(null);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUpiId("");
    } catch (error) {
      console.error("Sign-Out Error:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return;
      setUser(currentUser);

      const userRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) return;

      const userData = userDoc.data();
      setUpiId(userData.upiId);
      setBalance(userData.balance ?? 50000);

      const txQuery = query(
        collection(db, "transactions"),
        where("senderUPI", "==", userData.upiId)
      );
      const txSnapshot = await getDocs(txQuery);
      const txList = txSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setTransactions(txList);
      setRecentTx(txList.slice(0, 5));
    });
    return unsubscribe;
  }, []);

  // Fetch ML fraud stats from Flask
  useEffect(() => {
    axios.get(`${API}/explore`)
      .then(res => setMlStats(res.data?.stats ?? null))
      .catch(() => setMlStats(null));
  }, []);

  const monthlyData = (() => {
    const map = {};
    transactions.forEach(tx => {
      if (!tx.createdAt) return;
      const date = new Date(tx.createdAt.seconds * 1000);
      const key = date.toLocaleString('default', { month: 'short' });
      map[key] = (map[key] || 0) + tx.amount;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  })();

  const spendingData = (() => {
    const map = {};
    transactions.forEach(tx => {
      const cat = tx.remarks
        ? tx.remarks.charAt(0).toUpperCase() + tx.remarks.slice(1)
        : 'Other';
      map[cat] = (map[cat] || 0) + tx.amount;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  })();

  const now = new Date();
  const monthlySpending = transactions
    .filter(tx => {
      if (!tx.createdAt) return false;
      const d = new Date(tx.createdAt.seconds * 1000);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, tx) => sum + tx.amount, 0);

  const cashback = transactions.reduce((sum, tx) => sum + tx.amount * 0.02, 0);
  const spendingPct = balance > 0 ? (monthlySpending / balance) * 100 : 0;
  const isHighSpending = spendingPct > 70;

  const TransactionChart = () => (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={monthlyData.length ? monthlyData : [{ name: 'No data', value: 0 }]}>
        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="bg-gray-800 border border-gray-700 p-2 rounded-lg">
                <p className="text-blue-400">{`₹${payload[0].value.toFixed(2)}`}</p>
              </div>
            ) : null
          }
        />
        <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );

  const SpendingPieChart = () => {
    const data = spendingData.length ? spendingData : [{ name: 'No transactions', value: 1 }];
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value" data={data}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="bg-gray-800 border border-gray-700 p-2 rounded-lg">
                  <p className="text-blue-400">{`${payload[0].name}: ₹${Number(payload[0].value).toFixed(2)}`}</p>
                </div>
              ) : null
            }
          />
          <Legend formatter={(value) => <span className="text-gray-400">{value}</span>} />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 p-6 overflow-y-auto">
        <Header user={user} />

        {/* Profile + Sign Out */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex justify-between items-center mb-6"
        >
          <div className="flex items-center space-x-4 mt-4">
            <Avatar className="h-12 w-12 ring-2 ring-blue-500">
              <AvatarImage src={user?.photoURL} alt={user?.displayName} />
              <AvatarFallback className="bg-blue-600 text-white">{user?.displayName?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold text-blue-400">{user?.displayName}</h2>
              <p className="text-sm text-gray-400">UPI ID: {upiId}</p>
            </div>
          </div>
          <Button
            onClick={handleSignOut}
            variant="destructive"
            className="px-4 py-2 bg-red-600 hover:bg-red-700 transition-colors duration-200"
          >
            Sign Out
          </Button>
        </motion.div>

        {/* High Spending Warning */}
        {isHighSpending && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-5"
          >
            <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0" />
            <div>
              <p className="text-orange-300 font-semibold text-sm">High Spending Alert</p>
              <p className="text-orange-400/70 text-xs">
                You've spent ₹{monthlySpending.toFixed(0)} this month ({spendingPct.toFixed(0)}% of your balance). Consider reviewing your expenses.
              </p>
            </div>
          </motion.div>
        )}

        {/* Stat Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          {[
            { title: "Total Balance", icon: DollarSign, value: `₹${balance.toFixed(2)}`, color: "blue" },
            {
              title: "Monthly Spending",
              icon: isHighSpending ? TrendingUp : CreditCard,
              value: `₹${monthlySpending.toFixed(2)}`,
              color: isHighSpending ? "orange" : "green",
              sub: isHighSpending ? `${spendingPct.toFixed(0)}% of balance` : null
            },
            { title: "Total Transactions", icon: Activity, value: transactions.length, color: "purple" },
            { title: "Cashback Earned", icon: Zap, value: `₹${cashback.toFixed(2)}`, color: "yellow" }
          ].map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className="bg-gray-800 border-gray-700 hover:bg-gray-750 transition-colors duration-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">{item.title}</CardTitle>
                  <item.icon className={`h-4 w-4 text-${item.color}-400`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold text-${item.color}-400`}>{item.value}</div>
                  {item.sub && <p className="text-xs text-orange-400 mt-0.5">{item.sub}</p>}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Send Money", icon: Send, path: "/send-money", color: "bg-blue-600 hover:bg-blue-700" },
            { label: "Transactions", icon: Activity, path: "/transactions", color: "bg-purple-600 hover:bg-purple-700" },
            { label: "Run Detection", icon: ShieldCheck, path: "/run-detection", color: "bg-green-600 hover:bg-green-700" },
            { label: "Check Transaction", icon: ShieldAlert, path: "/check-transaction", color: "bg-yellow-600 hover:bg-yellow-700" },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className={`${action.color} rounded-xl p-4 flex flex-col items-center gap-2 transition-colors text-white`}
            >
              <action.icon className="h-5 w-5" />
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>

        {/* ML Fraud Stats (only if Flask has data) */}
        {mlStats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"
          >
            <Card className="bg-gray-800 border-gray-700 col-span-2 md:col-span-4">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm text-blue-400 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> ML Fraud Detection Summary
                </CardTitle>
                <button
                  onClick={() => navigate("/detection-results")}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  View Full Results <ArrowUpRight className="h-3 w-3" />
                </button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Total Records Analyzed", value: mlStats.total_transactions?.toLocaleString() ?? "—", color: "blue" },
                    { label: "Features Used", value: mlStats.num_features ?? "—", color: "purple" },
                    { label: "Fraud Cases Found", value: mlStats.fraud_count ?? "—", color: "red" },
                    { label: "Fraud Rate", value: mlStats.fraud_rate !== undefined ? `${mlStats.fraud_rate}%` : "—", color: "yellow" },
                  ].map(s => (
                    <div key={s.label} className="bg-gray-700/50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">{s.label}</p>
                      <p className={`text-xl font-bold text-${s.color}-400 mt-0.5`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* AI Security Status */}
        {(() => {
          const fraudTx = transactions.filter(tx => tx.fraudVerdict === "FRAUD");
          const total = transactions.length;
          const fraudRate = total > 0 ? (fraudTx.length / total) * 100 : 0;
          const secureScore = Math.max(0, Math.round(100 - fraudRate * 5));
          const status = secureScore >= 85
            ? { label: "Secure", color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", Icon: ShieldCheck }
            : secureScore >= 60
            ? { label: "Monitor", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", Icon: ShieldAlert }
            : { label: "At Risk", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", Icon: ShieldX };
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
              <Card className={`border ${status.bg} bg-gray-800`}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2 text-blue-400">
                    <BrainCircuit className="h-4 w-4" /> AI Security Status
                  </CardTitle>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${status.color} border ${status.bg}`}>
                    {status.label}
                  </span>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    {/* Score ring */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="relative w-20 h-20">
                        <svg width="80" height="80" viewBox="0 0 80 80">
                          <circle cx="40" cy="40" r="32" fill="none" stroke="#374151" strokeWidth="8" />
                          <circle cx="40" cy="40" r="32" fill="none"
                            stroke={secureScore >= 85 ? "#10b981" : secureScore >= 60 ? "#f59e0b" : "#ef4444"}
                            strokeWidth="8" strokeLinecap="round"
                            strokeDasharray={`${(secureScore / 100) * 201} 201`}
                            strokeDashoffset="50"
                            style={{ filter: `drop-shadow(0 0 4px ${secureScore >= 85 ? "#10b98155" : secureScore >= 60 ? "#f59e0b55" : "#ef444455"})` }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-xl font-bold ${status.color}`}>{secureScore}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Security Score</p>
                    </div>
                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-3 flex-1 w-full">
                      {[
                        { label: "Total Transactions", value: total, color: "blue" },
                        { label: "Flagged as Fraud", value: fraudTx.length, color: fraudTx.length > 0 ? "red" : "green" },
                        { label: "Account Fraud Rate", value: `${fraudRate.toFixed(1)}%`, color: fraudRate > 5 ? "red" : "green" },
                      ].map(s => (
                        <div key={s.label} className="bg-gray-700/40 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400">{s.label}</p>
                          <p className={`text-lg font-bold text-${s.color}-400 mt-0.5`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {fraudTx.length > 0 && (
                    <div className="mt-3 flex items-start gap-2 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-300">
                        {fraudTx.length} transaction{fraudTx.length > 1 ? "s were" : " was"} flagged as fraudulent.
                        Review your recent activity and contact support if you don't recognise these.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })()}

        {/* Charts */}
        <div className="mt-2 grid gap-6 md:grid-cols-2 mb-6">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-blue-400">Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              <TransactionChart />
            </CardContent>
          </Card>
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-green-400">Spending Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <SpendingPieChart />
            </CardContent>
          </Card>
        </div>

        {/* Recent Transactions */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base text-gray-300">Recent Transactions</CardTitle>
            <button
              onClick={() => navigate("/transactions")}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              View All <ArrowUpRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent>
            {recentTx.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No transactions yet. <button onClick={() => navigate("/send-money")} className="text-blue-400 hover:underline">Send Money</button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentTx.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-700/50 hover:bg-gray-700 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-red-500/20">
                        <ArrowUpRight className="h-4 w-4 text-red-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-100">{tx.recipientUPI}</p>
                        <p className="text-xs text-gray-400">
                          {tx.createdAt ? new Date(tx.createdAt.seconds * 1000).toLocaleDateString() : "—"}
                          {tx.remarks ? ` · ${tx.remarks}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-red-400">-₹{tx.amount?.toFixed(2)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        tx.fraudVerdict === "FRAUD"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-green-500/20 text-green-300"
                      }`}>
                        {tx.fraudVerdict === "FRAUD" ? "⚠ Flagged" : "✓ Safe"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
