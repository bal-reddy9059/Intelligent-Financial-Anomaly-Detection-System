import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import {
  collection, addDoc, query, where, onSnapshot,
  serverTimestamp, doc, updateDoc,
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import {
  Users, Plus, Trash2, Send, CheckCircle2, Clock,
  Wallet, SplitSquareHorizontal, ChevronDown, ChevronUp, Copy,
} from "lucide-react";

const COLORS = ["from-blue-500 to-blue-700", "from-purple-500 to-purple-700",
  "from-emerald-500 to-emerald-700", "from-pink-500 to-pink-700",
  "from-amber-500 to-amber-700", "from-cyan-500 to-cyan-700"];

function avatarColor(name) {
  return COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length];
}
function initials(name) {
  if (!name) return "?";
  const p = name.trim().split(" ");
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0].slice(0, 2).toUpperCase();
}
function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts.seconds * 1000) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function GroupCard({ group, currentUid }) {
  const [expanded, setExpanded] = useState(false);
  const paid = group.splits?.filter(s => s.paid).length || 0;
  const total = group.splits?.length || 0;
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;

  const markPaid = async (idx) => {
    const splits = [...group.splits];
    splits[idx] = { ...splits[idx], paid: true };
    await updateDoc(doc(db, "splitGroups", group.id), { splits });
  };

  return (
    <Card className="bg-gray-800/60 border-gray-700">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <SplitSquareHorizontal className="h-4 w-4 text-purple-400 flex-shrink-0" />
              <h3 className="font-semibold text-white truncate">{group.title}</h3>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{timeAgo(group.createdAt)} · {group.splitType === "equal" ? "Equal split" : "Custom split"}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-bold text-white">₹{group.totalAmount?.toLocaleString("en-IN")}</p>
            <p className="text-xs text-gray-400">{group.splits?.length} members</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{paid}/{total} paid</span>
            <span className={pct === 100 ? "text-green-400" : "text-yellow-400"}>{pct}% collected</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
              style={{ width: `${pct}%` }} />
          </div>
        </div>

        <button onClick={() => setExpanded(p => !p)}
          className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
          {expanded ? <><ChevronUp className="h-3 w-3" /> Hide members</> : <><ChevronDown className="h-3 w-3" /> View members</>}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 space-y-2 pt-3 border-t border-gray-700">
                {group.splits?.map((split, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarColor(split.name)} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                        {initials(split.name)}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-white">{split.name}</p>
                        <p className="text-xs text-gray-500">{split.upiId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="text-sm font-semibold text-white">₹{split.amount?.toFixed(0)}</p>
                      {split.paid ? (
                        <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> Paid
                        </span>
                      ) : (
                        <button onClick={() => markPaid(i)}
                          className="text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-full">
                          Mark paid
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

export default function SplitBill() {
  const [user, setUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [splitType, setSplitType] = useState("equal");
  const [members, setMembers] = useState([
    { name: "", upiId: "", sharePercent: "" },
    { name: "", upiId: "", sharePercent: "" },
  ]);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [calculated, setCalculated] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (cu) => {
      if (!cu) return;
      setUser(cu);
      const q = query(collection(db, "splitGroups"), where("createdBy", "==", cu.uid));
      onSnapshot(q, snap => {
        setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        setLoading(false);
      });
    });
    return unsub;
  }, []);

  const addMember = () => setMembers(p => [...p, { name: "", upiId: "", sharePercent: "" }]);
  const removeMember = (i) => setMembers(p => p.filter((_, idx) => idx !== i));
  const updateMember = (i, field, val) =>
    setMembers(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  const handleCalculate = () => {
    setFormError("");
    const amt = parseFloat(totalAmount);
    if (!title.trim()) { setFormError("Enter a title for this split."); return; }
    if (!amt || amt <= 0) { setFormError("Enter a valid total amount."); return; }
    const valid = members.filter(m => m.name.trim() && m.upiId.trim());
    if (valid.length < 2) { setFormError("Add at least 2 members with name and UPI ID."); return; }

    const splits = splitType === "equal"
      ? valid.map((m, i) => ({
          name: m.name,
          upiId: m.upiId,
          amount: parseFloat((amt / valid.length + (i === 0 ? amt - Math.floor(amt / valid.length) * valid.length : 0)).toFixed(2)),
          paid: false,
        }))
      : valid.map(m => ({
          name: m.name,
          upiId: m.upiId,
          amount: parseFloat((amt * (parseFloat(m.sharePercent) || 100 / valid.length) / 100).toFixed(2)),
          paid: false,
        }));

    setCalculated({ title, totalAmount: amt, splitType, splits });
  };

  const handleCreate = async () => {
    if (!calculated) return;
    setCreating(true);
    try {
      await addDoc(collection(db, "splitGroups"), {
        ...calculated,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      setTitle(""); setTotalAmount(""); setSplitType("equal");
      setMembers([{ name: "", upiId: "", sharePercent: "" }, { name: "", upiId: "", sharePercent: "" }]);
      setCalculated(null);
      setShowForm(false);
    } catch (e) {
      setFormError("Failed to create group. Try again.");
    }
    setCreating(false);
  };

  const totalPct = members.reduce((s, m) => s + (parseFloat(m.sharePercent) || 0), 0);

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
                <SplitSquareHorizontal className="h-6 w-6 text-purple-400" /> Split Bill
              </h1>
              <p className="text-sm text-gray-400 mt-1">Split group expenses with friends & family</p>
            </div>
            <Button onClick={() => { setShowForm(p => !p); setCalculated(null); setFormError(""); }}
              className="bg-purple-600 hover:bg-purple-700 gap-1.5">
              <Plus className="h-4 w-4" /> New Split
            </Button>
          </div>

          {/* Create form */}
          <AnimatePresence>
            {showForm && (
              <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="mb-6">
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-3 border-b border-gray-700">
                    <h2 className="font-semibold text-white flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-400" /> Create New Split
                    </h2>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Title *</label>
                        <Input value={title} onChange={e => setTitle(e.target.value)}
                          placeholder="e.g. Trip to Goa" className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Total Amount (₹) *</label>
                        <Input type="number" value={totalAmount} onChange={e => setTotalAmount(e.target.value)}
                          placeholder="e.g. 12000" className="bg-gray-700 border-gray-600 text-white h-9" />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {["equal", "custom"].map(t => (
                        <button key={t} onClick={() => setSplitType(t)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            splitType === t ? "bg-purple-600 border-purple-500 text-white" : "border-gray-600 text-gray-400 hover:border-gray-500"
                          }`}>
                          {t === "equal" ? "Equal Split" : "Custom %"}
                        </button>
                      ))}
                    </div>

                    {/* Members */}
                    <div className="space-y-2">
                      <label className="text-xs text-gray-400">Members *</label>
                      {members.map((m, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <Input value={m.name} onChange={e => updateMember(i, "name", e.target.value)}
                            placeholder="Name" className="bg-gray-700 border-gray-600 text-white h-8 text-xs flex-1" />
                          <Input value={m.upiId} onChange={e => updateMember(i, "upiId", e.target.value)}
                            placeholder="UPI ID" className="bg-gray-700 border-gray-600 text-white h-8 text-xs flex-1" />
                          {splitType === "custom" && (
                            <Input type="number" value={m.sharePercent} onChange={e => updateMember(i, "sharePercent", e.target.value)}
                              placeholder="%" className="bg-gray-700 border-gray-600 text-white h-8 text-xs w-16" />
                          )}
                          {members.length > 2 && (
                            <button onClick={() => removeMember(i)} className="text-red-400 hover:text-red-300 p-1">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      {splitType === "custom" && (
                        <p className={`text-xs ${Math.abs(totalPct - 100) > 0.1 ? "text-red-400" : "text-green-400"}`}>
                          Total: {totalPct.toFixed(1)}% {Math.abs(totalPct - 100) > 0.1 ? `(must equal 100%)` : "✓"}
                        </p>
                      )}
                      <button onClick={addMember} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                        <Plus className="h-3 w-3" /> Add member
                      </button>
                    </div>

                    {formError && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{formError}</p>}

                    {/* Calculated preview */}
                    {calculated && (
                      <div className="bg-gray-700/50 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-300">Preview</p>
                        {calculated.splits.map((s, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-gray-400">{s.name} ({s.upiId})</span>
                            <span className="text-white font-medium">₹{s.amount}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button onClick={handleCalculate} variant="outline"
                        className="border-purple-600 text-purple-400 hover:bg-purple-600/10 h-9">
                        Calculate
                      </Button>
                      {calculated && (
                        <Button onClick={handleCreate} disabled={creating}
                          className="bg-purple-600 hover:bg-purple-700 h-9 gap-1">
                          {creating ? "Creating…" : <><Send className="h-4 w-4" /> Create Group</>}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Groups list */}
          {loading ? (
            <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-28 rounded-xl bg-gray-800 animate-pulse" />)}</div>
          ) : groups.length === 0 ? (
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="flex flex-col items-center py-16 gap-3">
                <SplitSquareHorizontal className="h-12 w-12 text-gray-600" />
                <p className="text-gray-400">No split groups yet</p>
                <p className="text-xs text-gray-600">Click "New Split" to create your first group expense</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {groups.map(g => <GroupCard key={g.id} group={g} currentUid={user?.uid} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
