import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import {
  collection, addDoc, query, where, onSnapshot,
  serverTimestamp, doc, updateDoc, deleteDoc,
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import {
  Target, Plus, Trash2, PiggyBank, CheckCircle2,
  Calendar, TrendingUp, IndianRupee, Edit2, X,
} from "lucide-react";

const EMOJI_MAP = ["🏠", "🚗", "✈️", "📱", "💍", "🎓", "💊", "🎮", "🛍️", "💰"];

function daysLeft(targetDate) {
  if (!targetDate) return null;
  const diff = new Date(targetDate) - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function GoalCard({ goal, onAddMoney, onDelete }) {
  const pct = goal.targetAmount > 0 ? Math.min(100, (goal.savedSoFar / goal.targetAmount) * 100) : 0;
  const days = daysLeft(goal.targetDate);
  const remaining = Math.max(0, goal.targetAmount - goal.savedSoFar);
  const monthlyNeeded = days && days > 0 ? (remaining / (days / 30)).toFixed(0) : null;
  const done = pct >= 100;

  const [addAmt, setAddAmt] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = async () => {
    const amt = parseFloat(addAmt);
    if (!amt || amt <= 0) return;
    setAdding(true);
    await onAddMoney(goal.id, goal.savedSoFar + amt);
    setAddAmt("");
    setShowAdd(false);
    setAdding(false);
  };

  const GRADIENT_COLORS = [
    "from-blue-500 to-blue-700", "from-purple-500 to-purple-700",
    "from-green-500 to-green-700", "from-amber-500 to-amber-700",
    "from-pink-500 to-pink-700", "from-cyan-500 to-cyan-700",
  ];
  const gradIdx = goal.title.charCodeAt(0) % GRADIENT_COLORS.length;

  return (
    <Card className={`border border-gray-700 bg-gray-800/60 ${done ? "ring-1 ring-green-500/30" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${GRADIENT_COLORS[gradIdx]} flex items-center justify-center text-xl flex-shrink-0`}>
              {goal.emoji || "🎯"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white">{goal.title}</h3>
                {done && <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded-full">Achieved!</span>}
              </div>
              {goal.targetDate && (
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                  <Calendar className="h-3 w-3" />
                  {days === 0 ? "Today is the deadline!" : `${days} days left · ${new Date(goal.targetDate).toLocaleDateString("en-IN")}`}
                </div>
              )}
            </div>
          </div>
          <button onClick={() => onDelete(goal.id)}
            className="text-gray-500 hover:text-red-400 transition-colors p-1">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-gray-300">
              ₹{goal.savedSoFar?.toLocaleString("en-IN")} saved
            </span>
            <span className="font-semibold text-white">
              ₹{goal.targetAmount?.toLocaleString("en-IN")} goal
            </span>
          </div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={`h-full rounded-full bg-gradient-to-r ${GRADIENT_COLORS[gradIdx]}`}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{pct.toFixed(1)}% complete</span>
            {remaining > 0 && <span>₹{remaining.toLocaleString("en-IN")} remaining</span>}
          </div>
        </div>

        {/* Monthly needed */}
        {monthlyNeeded && !done && (
          <div className="flex items-center gap-1.5 text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg px-3 py-1.5 mb-3">
            <TrendingUp className="h-3 w-3" />
            Save ₹{parseInt(monthlyNeeded).toLocaleString("en-IN")}/month to reach your goal on time
          </div>
        )}

        {/* Add money */}
        {!done && (
          <div>
            {showAdd ? (
              <div className="flex gap-2">
                <Input type="number" value={addAmt} onChange={e => setAddAmt(e.target.value)}
                  placeholder="Amount to add (₹)" className="bg-gray-700 border-gray-600 text-white h-8 text-xs flex-1"
                  onKeyDown={e => e.key === "Enter" && handleAdd()} />
                <Button onClick={handleAdd} disabled={adding} size="sm"
                  className="bg-green-600 hover:bg-green-700 h-8 px-3 text-xs">
                  {adding ? "…" : "Add"}
                </Button>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-white p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add money to this goal
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SavingsGoals() {
  const [user, setUser] = useState(null);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formErr, setFormErr] = useState("");

  const [form, setForm] = useState({
    title: "", targetAmount: "", savedSoFar: "0",
    targetDate: "", emoji: "🎯",
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (cu) => {
      if (!cu) return;
      setUser(cu);
      const q = query(collection(db, "savingsGoals"), where("userId", "==", cu.uid));
      onSnapshot(q, snap => {
        setGoals(snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        setLoading(false);
      });
    });
    return unsub;
  }, []);

  const update = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const handleCreate = async () => {
    setFormErr("");
    if (!form.title.trim()) { setFormErr("Enter a goal name."); return; }
    if (!form.targetAmount || parseFloat(form.targetAmount) <= 0) { setFormErr("Enter a valid target amount."); return; }

    setCreating(true);
    try {
      await addDoc(collection(db, "savingsGoals"), {
        title: form.title,
        targetAmount: parseFloat(form.targetAmount),
        savedSoFar: parseFloat(form.savedSoFar) || 0,
        targetDate: form.targetDate || null,
        emoji: form.emoji,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
      setForm({ title: "", targetAmount: "", savedSoFar: "0", targetDate: "", emoji: "🎯" });
      setShowForm(false);
    } catch {
      setFormErr("Failed to create goal. Try again.");
    }
    setCreating(false);
  };

  const handleAddMoney = async (id, newSaved) => {
    await updateDoc(doc(db, "savingsGoals", id), { savedSoFar: newSaved });
  };

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, "savingsGoals", id));
  };

  const totalSaved = goals.reduce((s, g) => s + (g.savedSoFar || 0), 0);
  const totalTarget = goals.reduce((s, g) => s + (g.targetAmount || 0), 0);
  const achieved = goals.filter(g => g.savedSoFar >= g.targetAmount).length;

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Target className="h-6 w-6 text-amber-400" /> Savings Goals
              </h1>
              <p className="text-sm text-gray-400 mt-1">Track progress towards your financial dreams</p>
            </div>
            <Button onClick={() => { setShowForm(p => !p); setFormErr(""); }}
              className="bg-amber-600 hover:bg-amber-700 gap-1.5">
              <Plus className="h-4 w-4" /> New Goal
            </Button>
          </div>

          {/* Summary */}
          {goals.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Card className="bg-gray-800/60 border-gray-700">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-400 mb-1">Total Saved</p>
                  <p className="text-lg font-bold text-amber-400">₹{totalSaved.toLocaleString("en-IN")}</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-800/60 border-gray-700">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-400 mb-1">Total Target</p>
                  <p className="text-lg font-bold text-white">₹{totalTarget.toLocaleString("en-IN")}</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-800/60 border-gray-700">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-400 mb-1">Goals Achieved</p>
                  <p className="text-lg font-bold text-green-400">{achieved} / {goals.length}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Create form */}
          <AnimatePresence>
            {showForm && (
              <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="mb-6">
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-3 border-b border-gray-700">
                    <h2 className="font-semibold text-white flex items-center gap-2">
                      <PiggyBank className="h-4 w-4 text-amber-400" /> Create Savings Goal
                    </h2>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    {/* Emoji picker */}
                    <div>
                      <label className="text-xs text-gray-400 block mb-2">Choose Icon</label>
                      <div className="flex gap-2 flex-wrap">
                        {EMOJI_MAP.map(e => (
                          <button key={e} onClick={() => update("emoji", e)}
                            className={`w-9 h-9 text-lg rounded-lg transition-colors ${form.emoji === e ? "bg-amber-500/20 ring-1 ring-amber-500" : "hover:bg-gray-700"}`}>
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Goal Name *</label>
                        <Input value={form.title} onChange={e => update("title", e.target.value)}
                          placeholder="e.g. New Phone" className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Target Amount (₹) *</label>
                        <Input type="number" value={form.targetAmount} onChange={e => update("targetAmount", e.target.value)}
                          placeholder="e.g. 25000" className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Already Saved (₹)</label>
                        <Input type="number" value={form.savedSoFar} onChange={e => update("savedSoFar", e.target.value)}
                          placeholder="0" className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Target Date (optional)</label>
                        <Input type="date" value={form.targetDate} onChange={e => update("targetDate", e.target.value)}
                          className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                    </div>

                    {formErr && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{formErr}</p>}

                    <Button onClick={handleCreate} disabled={creating}
                      className="bg-amber-600 hover:bg-amber-500 h-9 gap-1.5">
                      {creating ? "Creating…" : <><Target className="h-4 w-4" /> Create Goal</>}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Goals list */}
          {loading ? (
            <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-36 rounded-xl bg-gray-800 animate-pulse" />)}</div>
          ) : goals.length === 0 ? (
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="flex flex-col items-center py-16 gap-3">
                <Target className="h-12 w-12 text-gray-600" />
                <p className="text-gray-400">No savings goals yet</p>
                <p className="text-xs text-gray-600">Set a goal for your next big purchase, travel, or dream</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {goals.map(g => (
                  <GoalCard key={g.id} goal={g} onAddMoney={handleAddMoney} onDelete={handleDelete} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
