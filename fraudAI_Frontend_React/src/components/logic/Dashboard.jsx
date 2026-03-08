import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import Header from "./Header.jsx";
import SidebarContent from "./SidebarContent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DollarSign, CreditCard, Activity, Zap } from 'lucide-react';
import { motion } from "framer-motion";
import { Line, LineChart, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [upiId, setUpiId] = useState("");
  const [balance, setBalance] = useState(50000);
  const [transactions, setTransactions] = useState([]);

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
      const txList = txSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(txList);
    });
    return unsubscribe;
  }, []);

  // Monthly chart: group real transactions by month abbreviation
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

  // Pie chart: group real transactions by remarks category
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

  // This month's total spending
  const monthlySpending = (() => {
    const now = new Date();
    return transactions
      .filter(tx => {
        if (!tx.createdAt) return false;
        const d = new Date(tx.createdAt.seconds * 1000);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, tx) => sum + tx.amount, 0);
  })();

  const cashback = transactions.reduce((sum, tx) => sum + tx.amount * 0.02, 0);

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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex justify-between items-center mb-6"
        >
          <div className="flex items-center space-x-4 mt-4">
            <Avatar className="h-12 w-12 ring-2 ring-blue-500">
              <AvatarImage src={user?.photoURL} alt={user?.displayName} />
              <AvatarFallback>{user?.displayName?.charAt(0)}</AvatarFallback>
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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Total Balance", icon: DollarSign, value: `₹${balance.toFixed(2)}`, color: "blue" },
            { title: "Monthly Spending", icon: CreditCard, value: `₹${monthlySpending.toFixed(2)}`, color: "green" },
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
                  <div className={`text-2xl font-bold text-${item.color}-400`}>
                    {item.value}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
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
      </div>
    </div>
  );
};

export default Dashboard;
