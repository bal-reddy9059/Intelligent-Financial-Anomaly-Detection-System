import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import {
  collection, query, where, orderBy, onSnapshot,
  doc, updateDoc, writeBatch, addDoc, serverTimestamp,
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import {
  Bell, ShieldAlert, Wallet, CheckCircle2, Info,
  AlertTriangle, CheckCheck, Trash2, RefreshCw, Filter,
} from "lucide-react";

const TYPE_CONFIG = {
  fraud_alert:    { icon: ShieldAlert,   color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30",    label: "Fraud Alert"    },
  budget_warning: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", label: "Budget Warning" },
  payment:        { icon: CheckCircle2,  color: "text-green-400",  bg: "bg-green-500/10 border-green-500/30",  label: "Payment"        },
  system:         { icon: Info,          color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30",    label: "System"         },
  split_bill:     { icon: Wallet,        color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30", label: "Split Bill"    },
  recurring:      { icon: RefreshCw,     color: "text-cyan-400",   bg: "bg-cyan-500/10 border-cyan-500/30",    label: "Recurring"      },
};

const FILTERS = ["All", "Unread", "fraud_alert", "budget_warning", "payment", "system"];

function timeAgo(ts) {
  if (!ts) return "";
  const seconds = Math.floor((Date.now() - (ts.seconds ? ts.seconds * 1000 : ts)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function NotifCard({ notif, onMarkRead, onDelete }) {
  const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
  const Icon = cfg.icon;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className={`relative flex gap-3 p-4 rounded-xl border ${cfg.bg} ${!notif.read ? "ring-1 ring-white/10" : "opacity-70"}`}
    >
      {!notif.read && (
        <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-blue-400" />
      )}
      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-gray-900/60`}>
        <Icon className={`h-4 w-4 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-900/50 ${cfg.color}`}>
            {cfg.label}
          </span>
          <span className="text-xs text-gray-500">{timeAgo(notif.createdAt)}</span>
        </div>
        <p className="text-sm font-semibold text-white mt-1">{notif.title}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{notif.message}</p>
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0">
        {!notif.read && (
          <button onClick={() => onMarkRead(notif.id)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-green-400 transition-colors"
            title="Mark read">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={() => onDelete(notif.id)}
          className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
          title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

export default function NotificationsCenter() {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");

  // Seed sample notifications for new users
  async function seedSampleNotifications(uid) {
    const samples = [
      { type: "fraud_alert", title: "High-Risk Transaction Detected",
        message: "A transaction of ₹8,500 was flagged as HIGH_RISK by SafePayAI. Review it immediately.",
        read: false, userId: uid, severity: "HIGH" },
      { type: "budget_warning", title: "Budget Limit Warning",
        message: "You've used 85% of your Entertainment budget this month.",
        read: false, userId: uid, severity: "MEDIUM" },
      { type: "payment", title: "Payment Successful",
        message: "₹1,200 sent to merchant@okaxis successfully.",
        read: true, userId: uid, severity: "LOW" },
      { type: "system", title: "Security Reminder",
        message: "Never share your UPI PIN with anyone — even bank officials.",
        read: true, userId: uid, severity: "INFO" },
      { type: "split_bill", title: "Split Bill Request",
        message: "Rahul requested ₹450 from you for 'Dinner at Barbeque Nation'.",
        read: false, userId: uid, severity: "MEDIUM" },
    ];
    const col = collection(db, "notifications");
    for (const s of samples) {
      await addDoc(col, { ...s, createdAt: serverTimestamp() });
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) return;
      setUser(cu);

      const col = collection(db, "notifications");
      const q = query(col, where("userId", "==", cu.uid), orderBy("createdAt", "desc"));

      const unsubSnap = onSnapshot(q, async (snap) => {
        if (snap.empty) {
          await seedSampleNotifications(cu.uid);
        } else {
          setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        }
      });

      // Also listen without userId filter for legacy notifications
      const q2 = query(col, orderBy("createdAt", "desc"));
      onSnapshot(q2, (snap) => {
        const all = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(n => !n.userId || n.userId === cu.uid);
        setNotifications(all);
        setLoading(false);
      });

      return () => { unsubSnap(); };
    });
    return unsub;
  }, []);

  const markRead = async (id) => {
    await updateDoc(doc(db, "notifications", id), { read: true });
  };

  const deleteNotif = async (id) => {
    const batch = writeBatch(db);
    batch.delete(doc(db, "notifications", id));
    await batch.commit();
    setNotifications(p => p.filter(n => n.id !== id));
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    const batch = writeBatch(db);
    unread.forEach(n => batch.update(doc(db, "notifications", n.id), { read: true }));
    await batch.commit();
  };

  const clearAll = async () => {
    const batch = writeBatch(db);
    notifications.forEach(n => batch.delete(doc(db, "notifications", n.id)));
    await batch.commit();
    setNotifications([]);
  };

  const filtered = notifications.filter(n => {
    if (filter === "All") return true;
    if (filter === "Unread") return !n.read;
    return n.type === filter;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

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
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Bell className="h-6 w-6 text-blue-400" /> Notifications
                {unreadCount > 0 && (
                  <span className="ml-1 text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {unreadCount} unread · {notifications.length} total
              </p>
            </div>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <Button onClick={markAllRead} size="sm" variant="outline"
                  className="border-gray-600 text-gray-300 hover:bg-gray-700 text-xs gap-1">
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </Button>
              )}
              {notifications.length > 0 && (
                <Button onClick={clearAll} size="sm" variant="outline"
                  className="border-gray-600 text-red-400 hover:bg-red-500/10 text-xs gap-1">
                  <Trash2 className="h-3.5 w-3.5" /> Clear all
                </Button>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 flex-wrap mb-5">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filter === f
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
                }`}>
                <Filter className="inline h-3 w-3 mr-1" />
                {f === "All" ? "All" : f === "Unread" ? "Unread" : TYPE_CONFIG[f]?.label || f}
              </button>
            ))}
          </div>

          {/* Notification list */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 rounded-xl bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="flex flex-col items-center py-16 gap-3">
                <Bell className="h-12 w-12 text-gray-600" />
                <p className="text-gray-400">No notifications found</p>
                <p className="text-xs text-gray-600">
                  {filter !== "All" ? "Try changing the filter above" : "You're all caught up!"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {filtered.map(n => (
                  <NotifCard key={n.id} notif={n} onMarkRead={markRead} onDelete={deleteNotif} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
