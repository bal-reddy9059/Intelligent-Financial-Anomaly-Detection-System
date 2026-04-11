import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import {
  collection, addDoc, query, where, onSnapshot,
  serverTimestamp, doc, getDoc,
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import {
  FileWarning, Plus, CheckCircle2, Clock, Search,
  AlertTriangle, XCircle, ChevronRight, Shield, Info,
} from "lucide-react";

const REASONS = [
  { value: "not_initiated", label: "I did not initiate this transaction" },
  { value: "wrong_amount",  label: "Wrong amount was deducted" },
  { value: "duplicate",     label: "Duplicate / double charge" },
  { value: "not_received",  label: "Money not received by recipient" },
  { value: "scam",          label: "Suspected scam or phishing" },
  { value: "other",         label: "Other reason" },
];

const STATUS_CONFIG = {
  SUBMITTED:    { label: "Submitted",    color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30",    icon: Clock         },
  UNDER_REVIEW: { label: "Under Review", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", icon: Search        },
  RESOLVED:     { label: "Resolved",     color: "text-green-400",  bg: "bg-green-500/10 border-green-500/30",   icon: CheckCircle2  },
  REJECTED:     { label: "Rejected",     color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30",       icon: XCircle       },
};

function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts.seconds * 1000) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function DisputeCard({ dispute }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[dispute.status] || STATUS_CONFIG.SUBMITTED;
  const Icon = cfg.icon;

  return (
    <Card className="bg-gray-800/60 border-gray-700">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3" onClick={() => setExpanded(p => !p)} style={{ cursor: "pointer" }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${cfg.bg} ${cfg.color}`}>
                <Icon className="h-3 w-3" /> {cfg.label}
              </span>
              <span className="text-xs text-gray-500 font-mono">#{dispute.caseNumber}</span>
              <span className="text-xs text-gray-500">{timeAgo(dispute.createdAt)}</span>
            </div>
            <p className="text-sm font-semibold text-white mt-1.5">
              {REASONS.find(r => r.value === dispute.reason)?.label || dispute.reason}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              ₹{dispute.amount?.toLocaleString("en-IN")} · {dispute.recipientUPI || "—"}
            </p>
          </div>
          <ChevronRight className={`h-4 w-4 text-gray-500 flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 pt-3 border-t border-gray-700 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-gray-500">Transaction ID</p>
                    <p className="text-gray-300 font-mono">{dispute.transactionId || "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Estimated Resolution</p>
                    <p className="text-gray-300">{dispute.estimatedResolution || "3-5 business days"}</p>
                  </div>
                </div>
                {dispute.description && (
                  <div>
                    <p className="text-gray-500">Your description</p>
                    <p className="text-gray-300 italic">"{dispute.description}"</p>
                  </div>
                )}
                <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 px-3 py-2 rounded-lg">
                  <Info className="h-3.5 w-3.5 flex-shrink-0" />
                  You'll receive an update via notification within 24 hours.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

export default function DisputeCenter() {
  const [user, setUser] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [formErr, setFormErr] = useState("");

  const [form, setForm] = useState({
    transactionId: "", amount: "", recipientUPI: "",
    reason: "", description: "",
  });
  const [txSearch, setTxSearch] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) return;
      setUser(cu);

      // Load disputes
      const dq = query(collection(db, "disputes"), where("userId", "==", cu.uid));
      onSnapshot(dq, snap => {
        setDisputes(snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        setLoading(false);
      });

      // Load recent transactions for quick-fill
      const tq = query(collection(db, "transactions"), where("userId", "==", cu.uid));
      onSnapshot(tq, snap => {
        setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .slice(0, 20));
      });
    });
    return unsub;
  }, []);

  const update = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const handleSubmit = async () => {
    setFormErr(""); setSuccess("");
    if (!form.reason) { setFormErr("Select a reason for the dispute."); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setFormErr("Enter the transaction amount."); return; }

    setSubmitting(true);
    try {
      const caseNumber = `SAFE${Date.now() % 100000}`.padEnd(9, "0");
      await addDoc(collection(db, "disputes"), {
        ...form,
        amount: parseFloat(form.amount),
        userId: user.uid,
        status: "SUBMITTED",
        caseNumber,
        estimatedResolution: "3-5 business days",
        createdAt: serverTimestamp(),
      });
      setSuccess(`Dispute #${caseNumber} filed successfully! We'll review it within 24 hours.`);
      setForm({ transactionId: "", amount: "", recipientUPI: "", reason: "", description: "" });
      setShowForm(false);
      setTimeout(() => setSuccess(""), 5000);
    } catch {
      setFormErr("Failed to submit dispute. Please try again.");
    }
    setSubmitting(false);
  };

  const fillFromTx = (tx) => {
    setForm(p => ({
      ...p,
      transactionId: tx.id,
      amount: tx.amount?.toString() || "",
      recipientUPI: tx.recipientUPI || "",
    }));
    setTxSearch("");
  };

  const filteredTx = txSearch.trim()
    ? transactions.filter(t =>
        t.recipientUPI?.includes(txSearch) ||
        t.amount?.toString().includes(txSearch) ||
        t.remarks?.toLowerCase().includes(txSearch.toLowerCase())
      )
    : [];

  const pendingCount = disputes.filter(d => d.status === "SUBMITTED" || d.status === "UNDER_REVIEW").length;

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
                <FileWarning className="h-6 w-6 text-orange-400" /> Dispute Center
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Report unauthorized or incorrect transactions
                {pendingCount > 0 && <span className="ml-2 text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">{pendingCount} active</span>}
              </p>
            </div>
            <Button onClick={() => { setShowForm(p => !p); setFormErr(""); }}
              className="bg-orange-600 hover:bg-orange-700 gap-1.5">
              <Plus className="h-4 w-4" /> File Dispute
            </Button>
          </div>

          {/* Success banner */}
          {success && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center gap-2 text-sm bg-green-500/10 border border-green-500/30 text-green-400 px-3 py-2 rounded-lg">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> {success}
            </motion.div>
          )}

          {/* Info banner */}
          <div className="mb-5 flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs px-3 py-2.5 rounded-lg">
            <Shield className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-blue-400" />
            <span>
              SafePayAI investigates all disputes within 3-5 business days. For HIGH_RISK flagged transactions,
              we prioritise review within 24 hours. You can track status below.
            </span>
          </div>

          {/* Create form */}
          <AnimatePresence>
            {showForm && (
              <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="mb-6">
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-3 border-b border-gray-700">
                    <h2 className="font-semibold text-white flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-400" /> File a New Dispute
                    </h2>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">

                    {/* Quick-fill from transactions */}
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Search your recent transactions (optional)</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                        <Input value={txSearch} onChange={e => setTxSearch(e.target.value)}
                          placeholder="Search by UPI, amount, or note…"
                          className="bg-gray-700 border-gray-600 text-white h-9 pl-8 text-xs" />
                      </div>
                      {filteredTx.length > 0 && (
                        <div className="mt-1 bg-gray-700 border border-gray-600 rounded-lg overflow-hidden">
                          {filteredTx.slice(0, 5).map(tx => (
                            <button key={tx.id} onClick={() => fillFromTx(tx)}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-600 text-xs border-b border-gray-600 last:border-0">
                              <span className="text-gray-300">{tx.recipientUPI}</span>
                              <span className="text-white font-medium">₹{tx.amount}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Transaction Amount (₹) *</label>
                        <Input type="number" value={form.amount} onChange={e => update("amount", e.target.value)}
                          placeholder="e.g. 5000" className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Recipient UPI ID</label>
                        <Input value={form.recipientUPI} onChange={e => update("recipientUPI", e.target.value)}
                          placeholder="e.g. merchant@upi" className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="text-xs text-gray-400 block mb-2">Reason for Dispute *</label>
                      <div className="space-y-1.5">
                        {REASONS.map(r => (
                          <label key={r.value}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                              form.reason === r.value
                                ? "border-orange-500/50 bg-orange-500/10 text-orange-300"
                                : "border-gray-600 text-gray-400 hover:border-gray-500"
                            }`}>
                            <input type="radio" name="reason" value={r.value}
                              checked={form.reason === r.value}
                              onChange={() => update("reason", r.value)}
                              className="accent-orange-500" />
                            <span className="text-xs">{r.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Additional Details (optional)</label>
                      <textarea
                        value={form.description}
                        onChange={e => update("description", e.target.value)}
                        placeholder="Describe what happened in detail…"
                        rows={3}
                        className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                      />
                    </div>

                    {formErr && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{formErr}</p>}

                    <Button onClick={handleSubmit} disabled={submitting}
                      className="bg-orange-600 hover:bg-orange-500 h-9 gap-1.5">
                      {submitting ? "Submitting…" : <><FileWarning className="h-4 w-4" /> Submit Dispute</>}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Disputes list */}
          {loading ? (
            <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-gray-800 animate-pulse" />)}</div>
          ) : disputes.length === 0 ? (
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="flex flex-col items-center py-16 gap-3">
                <FileWarning className="h-12 w-12 text-gray-600" />
                <p className="text-gray-400">No disputes filed</p>
                <p className="text-xs text-gray-600">
                  Spot a suspicious transaction? File a dispute and we'll investigate.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 mb-2">{disputes.length} dispute(s) total</p>
              <AnimatePresence>
                {disputes.map(d => <DisputeCard key={d.id} dispute={d} />)}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
