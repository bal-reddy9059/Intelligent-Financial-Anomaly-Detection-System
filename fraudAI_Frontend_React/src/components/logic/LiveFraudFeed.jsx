import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import {
  Zap, ShieldAlert, ShieldCheck, AlertTriangle,
  Activity, Clock,
} from "lucide-react";

const VERDICT_CONFIG = {
  HIGH_RISK: {
    label: "HIGH RISK",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/40",
    dot: "bg-red-400",
    icon: ShieldAlert,
  },
  MEDIUM_RISK: {
    label: "MEDIUM RISK",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/40",
    dot: "bg-yellow-400",
    icon: AlertTriangle,
  },
  SAFE: {
    label: "SAFE",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/30",
    dot: "bg-green-400",
    icon: ShieldCheck,
  },
};

function timeStr(ts) {
  if (!ts) return "";
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function FeedEvent({ event, index }) {
  const verdict = event.fraudVerdict || "SAFE";
  const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.SAFE;
  const Icon = cfg.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, delay: index < 3 ? index * 0.05 : 0 }}
      className={`flex items-center gap-3 p-3 rounded-xl border ${cfg.bg}`}
    >
      <div className="flex-shrink-0 relative">
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-900/60">
          <Icon className={`h-4 w-4 ${cfg.color}`} />
        </div>
        {index === 0 && (
          <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${cfg.dot} animate-ping`} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-gray-900/60 ${cfg.color}`}>
            {cfg.label}
          </span>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="h-3 w-3" /> {timeStr(event.createdAt)}
          </span>
        </div>
        <p className="text-xs text-gray-300 mt-0.5 truncate">
          → {event.recipientUPI || "unknown@upi"}
          {event.remarks && <span className="text-gray-500"> · {event.remarks}</span>}
        </p>
        {event.senderUPI && (
          <p className="text-xs text-gray-600 mt-0.5">From: {event.senderUPI}</p>
        )}
      </div>

      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${cfg.color}`}>₹{event.amount?.toLocaleString("en-IN")}</p>
        {event.fraudProbability != null && (
          <p className="text-xs text-gray-500">{Number(event.fraudProbability).toFixed(0)}% risk</p>
        )}
      </div>
    </motion.div>
  );
}

export default function LiveFraudFeed() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (cu) => {
      if (!cu) return;
      setUser(cu);

      // Only listen to REAL transactions for this user, newest first
      const q = query(
        collection(db, "transactions"),
        where("userId", "==", cu.uid),
        orderBy("createdAt", "desc"),
        limit(50)
      );

      const unsubSnap = onSnapshot(q, (snap) => {
        const txns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setEvents(txns);
        setLoading(false);
      });

      return unsubSnap;
    });
    return unsub;
  }, []);

  const filtered = filter === "ALL"
    ? events
    : events.filter(e => e.fraudVerdict === filter);

  const high   = events.filter(e => e.fraudVerdict === "HIGH_RISK").length;
  const medium = events.filter(e => e.fraudVerdict === "MEDIUM_RISK").length;
  const safe   = events.filter(e => e.fraudVerdict === "SAFE" || !e.fraudVerdict).length;
  const highPct = events.length > 0 ? ((high / events.length) * 100).toFixed(1) : 0;

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6 text-yellow-400" /> Live Fraud Feed
              <span className="flex items-center gap-1 text-xs bg-green-500/10 border border-green-500/30 text-green-400 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                LIVE
              </span>
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Real-time stream of your actual payments — updates instantly when you send money
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total",       value: events.length, color: "text-white"   },
              { label: "High Risk",   value: high,          color: "text-red-400"  },
              { label: "Medium Risk", value: medium,        color: "text-yellow-400" },
              { label: "Safe",        value: safe,          color: "text-green-400" },
            ].map(s => (
              <Card key={s.label} className="bg-gray-800/60 border-gray-700">
                <CardContent className="p-3">
                  <p className="text-xs text-gray-400 mb-0.5">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Risk bar */}
          {events.length > 0 && (
            <div className="mb-5">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Fraud detection rate</span>
                <span className={parseFloat(highPct) > 20 ? "text-red-400" : "text-green-400"}>
                  {highPct}% flagged HIGH RISK
                </span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden flex">
                <div className="h-full bg-red-500 transition-all duration-500"
                  style={{ width: `${(high / events.length) * 100}%` }} />
                <div className="h-full bg-yellow-500 transition-all duration-500"
                  style={{ width: `${(medium / events.length) * 100}%` }} />
                <div className="h-full bg-green-500 transition-all duration-500"
                  style={{ width: `${(safe / events.length) * 100}%` }} />
              </div>
              <div className="flex gap-4 mt-1 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />High</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" />Medium</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Safe</span>
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {["ALL", "HIGH_RISK", "MEDIUM_RISK", "SAFE"].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filter === f
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
                }`}>
                {f === "ALL" ? `All (${events.length})` : f.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Feed */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-xl bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="flex flex-col items-center py-16 gap-3">
                <Activity className="h-12 w-12 text-gray-600 animate-pulse" />
                <p className="text-gray-400">
                  {filter === "ALL" ? "No payments yet" : `No ${filter.replace("_", " ")} transactions`}
                </p>
                <p className="text-xs text-gray-600">
                  {filter === "ALL"
                    ? "Send a payment and it will appear here instantly"
                    : "Try changing the filter above"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {filtered.map((event, i) => (
                  <FeedEvent key={event.id} event={event} index={i} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
