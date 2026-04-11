import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import { Wallet, Save, AlertTriangle, CheckCircle, TrendingUp } from "lucide-react";

const CATEGORIES = ["Rent", "Utilities", "Groceries", "Entertainment", "Other"];
const CAT_COLORS = {
  Rent: "bg-blue-500",
  Utilities: "bg-purple-500",
  Groceries: "bg-green-500",
  Entertainment: "bg-pink-500",
  Other: "bg-yellow-500",
};
const CAT_TEXT = {
  Rent: "text-blue-400",
  Utilities: "text-purple-400",
  Groceries: "text-green-400",
  Entertainment: "text-pink-400",
  Other: "text-yellow-400",
};

export default function Budget() {
  const [user, setUser] = useState(null);
  const [limits, setLimits] = useState(
    Object.fromEntries(CATEGORIES.map((c) => [c, ""]))
  );
  const [spent, setSpent] = useState(
    Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [totalBudget, setTotalBudget] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) return;
      setUser(cu);

      // Load saved budgets
      try {
        const userSnap = await getDoc(doc(db, "users", cu.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.budgets) {
            setLimits((prev) => ({ ...prev, ...data.budgets }));
          }

          // Load this month's spending by category
          const upiId = data.upiId;
          if (upiId) {
            const now = new Date();
            const txQ = query(
              collection(db, "transactions"),
              where("senderUPI", "==", upiId)
            );
            const txSnap = await getDocs(txQ);
            const spentMap = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
            txSnap.docs.forEach((d) => {
              const tx = d.data();
              if (!tx.createdAt) return;
              const date = new Date(tx.createdAt.seconds * 1000);
              if (
                date.getMonth() !== now.getMonth() ||
                date.getFullYear() !== now.getFullYear()
              )
                return;
              const cat = tx.remarks
                ? tx.remarks.charAt(0).toUpperCase() + tx.remarks.slice(1)
                : "Other";
              const key = CATEGORIES.includes(cat) ? cat : "Other";
              spentMap[key] = (spentMap[key] || 0) + (tx.amount || 0);
            });
            setSpent(spentMap);
            setTotalSpent(Object.values(spentMap).reduce((a, b) => a + b, 0));
          }
        }
      } catch {
        // ignore
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const total = CATEGORIES.reduce((sum, c) => sum + (parseFloat(limits[c]) || 0), 0);
    setTotalBudget(total);
  }, [limits]);

  const handleSave = async () => {
    const cu = auth.currentUser;
    if (!cu) return;
    setSaving(true);
    try {
      const budgetsToSave = Object.fromEntries(
        CATEGORIES.map((c) => [c, parseFloat(limits[c]) || 0])
      );
      await updateDoc(doc(db, "users", cu.uid), { budgets: budgetsToSave });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const overBudgetCats = CATEGORIES.filter(
    (c) => parseFloat(limits[c]) > 0 && spent[c] > parseFloat(limits[c])
  );

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl font-bold text-blue-400 mb-1 flex items-center gap-2">
              <Wallet className="h-6 w-6" /> Budget Tracker
            </h1>
            <p className="text-gray-400 text-sm mb-6">
              Set monthly spending limits per category and track your progress.
            </p>
          </motion.div>

          {/* Over-budget alerts */}
          {overBudgetCats.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 space-y-2"
            >
              {overBudgetCats.map((cat) => (
                <div
                  key={cat}
                  className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
                >
                  <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300">
                    <span className="font-semibold">{cat}</span> over budget — spent{" "}
                    <span className="font-mono">₹{spent[cat].toFixed(0)}</span> of{" "}
                    <span className="font-mono">₹{parseFloat(limits[cat]).toFixed(0)}</span> limit
                  </p>
                </div>
              ))}
            </motion.div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left — set limits */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-gray-300">Monthly Limits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {CATEGORIES.map((cat) => (
                  <div key={cat} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${CAT_COLORS[cat]}`} />
                    <label className="text-sm text-gray-300 w-28 flex-shrink-0">{cat}</label>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                      <Input
                        type="number"
                        min="0"
                        value={limits[cat]}
                        onChange={(e) =>
                          setLimits((prev) => ({ ...prev, [cat]: e.target.value }))
                        }
                        placeholder="No limit"
                        className="pl-7 bg-gray-700 border-gray-600 text-white text-sm h-8"
                      />
                    </div>
                  </div>
                ))}

                <div className="pt-2 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Total budget: <span className="text-white font-mono">₹{totalBudget.toLocaleString()}</span>
                  </p>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-xs h-8"
                  >
                    {saved ? (
                      <><CheckCircle className="h-3.5 w-3.5 mr-1 text-green-300" /> Saved!</>
                    ) : (
                      <><Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save Limits"}</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Right — spending vs limit */}
            <div className="space-y-4">
              {/* Overall summary */}
              <Card className="bg-gray-800 border-gray-700">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-blue-400" /> This Month Total
                    </p>
                    <p className="text-xs text-gray-400 font-mono">
                      ₹{totalSpent.toFixed(0)} / ₹{totalBudget > 0 ? totalBudget.toFixed(0) : "—"}
                    </p>
                  </div>
                  {totalBudget > 0 && (
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          totalSpent / totalBudget > 1
                            ? "bg-red-500"
                            : totalSpent / totalBudget > 0.7
                            ? "bg-yellow-500"
                            : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(100, (totalSpent / totalBudget) * 100)}%` }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Per-category bars */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-300">Spending by Category</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {CATEGORIES.map((cat) => {
                    const limit = parseFloat(limits[cat]) || 0;
                    const s = spent[cat] || 0;
                    const pct = limit > 0 ? Math.min(100, (s / limit) * 100) : 0;
                    const over = limit > 0 && s > limit;
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-medium ${CAT_TEXT[cat]}`}>{cat}</span>
                          <span className="text-xs text-gray-400 font-mono">
                            ₹{s.toFixed(0)}
                            {limit > 0 && (
                              <span className={over ? "text-red-400" : "text-gray-500"}>
                                {" "}/ ₹{limit.toFixed(0)}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          {limit > 0 ? (
                            <div
                              className={`h-full rounded-full transition-all ${
                                over ? "bg-red-500" : CAT_COLORS[cat]
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          ) : (
                            <div className="h-full w-0" />
                          )}
                        </div>
                        {limit === 0 && s > 0 && (
                          <p className="text-xs text-gray-600 mt-0.5">₹{s.toFixed(0)} spent · no limit set</p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
