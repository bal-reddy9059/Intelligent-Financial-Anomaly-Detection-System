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
  RefreshCw, Plus, Trash2, Pause, Play, Calendar,
  ChevronRight, AlertCircle, CheckCircle2,
} from "lucide-react";

const FREQ_OPTS = [
  { value: "daily",   label: "Daily",   icon: "📅" },
  { value: "weekly",  label: "Weekly",  icon: "📆" },
  { value: "monthly", label: "Monthly", icon: "🗓️" },
];

const FREQ_COLOR = {
  daily:   "text-blue-400 bg-blue-500/10 border-blue-500/30",
  weekly:  "text-purple-400 bg-purple-500/10 border-purple-500/30",
  monthly: "text-green-400 bg-green-500/10 border-green-500/30",
};

function nextDateFromNow(frequency, startDate) {
  const start = new Date(startDate);
  const now = new Date();
  if (start >= now) return start.toLocaleDateString("en-IN");
  let d = new Date(start);
  while (d < now) {
    if (frequency === "daily") d.setDate(d.getDate() + 1);
    else if (frequency === "weekly") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
  }
  return d.toLocaleDateString("en-IN");
}

function RecurCard({ pay, onPause, onDelete }) {
  const freqClass = FREQ_COLOR[pay.frequency] || FREQ_COLOR.monthly;
  const nextDate = nextDateFromNow(pay.frequency, pay.startDate);
  const isActive = pay.status === "active";

  return (
    <motion.div layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}>
      <Card className={`border ${isActive ? "border-gray-700 bg-gray-800/60" : "border-gray-700/50 bg-gray-800/30 opacity-60"}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-white">{pay.recipientName || pay.recipientUPI}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${freqClass}`}>
                  {FREQ_OPTS.find(f => f.value === pay.frequency)?.icon} {pay.frequency}
                </span>
                {!isActive && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">Paused</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">{pay.recipientUPI}</p>
              {pay.remarks && <p className="text-xs text-gray-500 mt-0.5">"{pay.remarks}"</p>}
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Calendar className="h-3 w-3" />
                  Next: <span className="text-white font-medium ml-0.5">{isActive ? nextDate : "Paused"}</span>
                </div>
                {pay.endDate && (
                  <div className="text-xs text-gray-500">
                    Until {new Date(pay.endDate).toLocaleDateString("en-IN")}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xl font-bold text-white">₹{parseFloat(pay.amount).toLocaleString("en-IN")}</p>
              <div className="flex gap-1.5 mt-2 justify-end">
                <button onClick={() => onPause(pay.id, pay.status)}
                  className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors ${isActive ? "text-yellow-400" : "text-green-400"}`}
                  title={isActive ? "Pause" : "Resume"}>
                  {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => onDelete(pay.id)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-red-400 hover:text-red-300 transition-colors"
                  title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function RecurringPayments() {
  const [user, setUser] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    recipientName: "", recipientUPI: "", amount: "",
    frequency: "monthly", startDate: new Date().toISOString().split("T")[0],
    endDate: "", remarks: "",
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (cu) => {
      if (!cu) return;
      setUser(cu);
      const q = query(collection(db, "recurringPayments"), where("userId", "==", cu.uid));
      onSnapshot(q, snap => {
        setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        setLoading(false);
      });
    });
    return unsub;
  }, []);

  const update = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const handleCreate = async () => {
    setFormErr(""); setSuccess("");
    if (!form.recipientUPI.trim()) { setFormErr("Enter recipient UPI ID."); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setFormErr("Enter a valid amount."); return; }
    if (!form.startDate) { setFormErr("Select a start date."); return; }

    setCreating(true);
    try {
      await addDoc(collection(db, "recurringPayments"), {
        ...form,
        amount: parseFloat(form.amount),
        userId: user.uid,
        status: "active",
        executionCount: 0,
        createdAt: serverTimestamp(),
      });
      setSuccess("Recurring payment created successfully!");
      setForm({ recipientName: "", recipientUPI: "", amount: "", frequency: "monthly",
        startDate: new Date().toISOString().split("T")[0], endDate: "", remarks: "" });
      setShowForm(false);
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setFormErr("Failed to create. Try again.");
    }
    setCreating(false);
  };

  const handlePause = async (id, currentStatus) => {
    await updateDoc(doc(db, "recurringPayments", id), {
      status: currentStatus === "active" ? "paused" : "active"
    });
  };

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, "recurringPayments", id));
  };

  const activeCount = payments.filter(p => p.status === "active").length;
  const totalMonthly = payments
    .filter(p => p.status === "active")
    .reduce((s, p) => {
      const amt = parseFloat(p.amount) || 0;
      if (p.frequency === "daily") return s + amt * 30;
      if (p.frequency === "weekly") return s + amt * 4;
      return s + amt;
    }, 0);

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
                <RefreshCw className="h-6 w-6 text-green-400" /> Recurring Payments
              </h1>
              <p className="text-sm text-gray-400 mt-1">Automate regular transfers to anyone</p>
            </div>
            <Button onClick={() => { setShowForm(p => !p); setFormErr(""); }}
              className="bg-green-600 hover:bg-green-700 gap-1.5">
              <Plus className="h-4 w-4" /> New Recurring
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Card className="bg-gray-800/60 border-gray-700">
              <CardContent className="p-4">
                <p className="text-xs text-gray-400 mb-1">Active Payments</p>
                <p className="text-2xl font-bold text-white">{activeCount}</p>
              </CardContent>
            </Card>
            <Card className="bg-gray-800/60 border-gray-700">
              <CardContent className="p-4">
                <p className="text-xs text-gray-400 mb-1">Monthly Outflow</p>
                <p className="text-2xl font-bold text-green-400">₹{totalMonthly.toLocaleString("en-IN")}</p>
              </CardContent>
            </Card>
          </div>

          {/* Success banner */}
          {success && (
            <div className="mb-4 flex items-center gap-2 text-sm bg-green-500/10 border border-green-500/30 text-green-400 px-3 py-2 rounded-lg">
              <CheckCircle2 className="h-4 w-4" /> {success}
            </div>
          )}

          {/* Create form */}
          <AnimatePresence>
            {showForm && (
              <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="mb-6">
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-3 border-b border-gray-700">
                    <h2 className="font-semibold text-white flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-green-400" /> Set Up Recurring Payment
                    </h2>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Recipient Name</label>
                        <Input value={form.recipientName} onChange={e => update("recipientName", e.target.value)}
                          placeholder="e.g. Electricity Board" className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Recipient UPI ID *</label>
                        <Input value={form.recipientUPI} onChange={e => update("recipientUPI", e.target.value)}
                          placeholder="e.g. bills@sbi" className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Amount (₹) *</label>
                        <Input type="number" value={form.amount} onChange={e => update("amount", e.target.value)}
                          placeholder="e.g. 1500" className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Remarks / Note</label>
                        <Input value={form.remarks} onChange={e => update("remarks", e.target.value)}
                          placeholder="e.g. Monthly rent" className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                    </div>

                    {/* Frequency */}
                    <div>
                      <label className="text-xs text-gray-400 block mb-2">Frequency *</label>
                      <div className="flex gap-2">
                        {FREQ_OPTS.map(f => (
                          <button key={f.value} onClick={() => update("frequency", f.value)}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                              form.frequency === f.value
                                ? "bg-green-600 border-green-500 text-white"
                                : "border-gray-600 text-gray-400 hover:border-gray-500"
                            }`}>
                            {f.icon} {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Start Date *</label>
                        <Input type="date" value={form.startDate} onChange={e => update("startDate", e.target.value)}
                          className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">End Date (optional)</label>
                        <Input type="date" value={form.endDate} onChange={e => update("endDate", e.target.value)}
                          className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs rounded-lg px-3 py-2">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      AegisAI will simulate this payment on each scheduled date. Real UPI requires bank integration.
                    </div>

                    {formErr && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{formErr}</p>}

                    <Button onClick={handleCreate} disabled={creating}
                      className="bg-green-600 hover:bg-green-700 h-9 gap-1.5">
                      {creating ? "Creating…" : <><CheckCircle2 className="h-4 w-4" /> Create Recurring Payment</>}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Payments list */}
          {loading ? (
            <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-gray-800 animate-pulse" />)}</div>
          ) : payments.length === 0 ? (
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="flex flex-col items-center py-16 gap-3">
                <RefreshCw className="h-12 w-12 text-gray-600" />
                <p className="text-gray-400">No recurring payments yet</p>
                <p className="text-xs text-gray-600">Set up automatic transfers for rent, bills, subscriptions</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {payments.map(p => (
                  <RecurCard key={p.id} pay={p} onPause={handlePause} onDelete={handleDelete} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
