import { useState, useEffect, useRef } from "react";
import { Search, Bell, CreditCard, Menu, Wifi, WifiOff, ShieldAlert, CheckCircle, Clock, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import SidebarContent from './SidebarContent';
import axios from "axios";
import { auth, db } from "./firebase";
import { collection, query, where, getDocs, updateDoc, doc, orderBy, limit } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const NOTIF_ICON = {
  fraud: ShieldAlert,
  cooling: Clock,
  success: CheckCircle,
};
const NOTIF_COLOR = {
  fraud: "text-red-400",
  cooling: "text-yellow-400",
  success: "text-green-400",
};

const Header = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [apiOnline, setApiOnline] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const bellRef = useRef(null);
  const dropdownRef = useRef(null);

  const showBack = location.pathname !== "/dashboard";

  // API status
  useEffect(() => {
    const check = () => {
      axios.get(`${API}/`, { timeout: 3000 })
        .then(() => setApiOnline(true))
        .catch(() => setApiOnline(false));
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  // Notifications
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) { setNotifications([]); setUnreadCount(0); return; }
      await fetchNotifications(cu.uid);
    });
    return unsub;
  }, []);

  const fetchNotifications = async (uid) => {
    try {
      const q = query(
        collection(db, "notifications"),
        where("userId", "==", uid),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.read).length);
    } catch {
      // Firestore index not ready or unavailable — use empty list
    }
  };

  const markAllRead = async () => {
    const cu = auth.currentUser;
    if (!cu) return;
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(
      unread.map((n) => updateDoc(doc(db, "notifications", n.id), { read: true }).catch(() => {}))
    );
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        bellRef.current &&
        !bellRef.current.contains(e.target)
      ) {
        setShowNotifs(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleBellClick = () => {
    setShowNotifs((v) => !v);
    if (!showNotifs && unreadCount > 0) markAllRead();
  };

  const formatTime = (ts) => {
    if (!ts?.seconds) return "";
    const d = new Date(ts.seconds * 1000);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  return (
    <header className="sticky top-0 z-10 backdrop-blur-xl bg-black/20 border-b border-white/10">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-[#0f172a] border-r border-white/10">
              <SidebarContent />
            </SheetContent>
          </Sheet>

          {showBack && (
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all text-sm font-medium group"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}

          <div className="flex items-center md:hidden">
            <CreditCard className="h-8 w-8 text-blue-400" />
            <span className="ml-2 text-xl font-bold text-blue-400">AegisAI</span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* API status */}
          <div
            title={
              apiOnline === null ? "Checking AI server…"
                : apiOnline ? "AI server online"
                : "AI server offline — start Flask on port 5000"
            }
            className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
              apiOnline === null ? "border-gray-700 text-gray-500"
                : apiOnline ? "border-green-500/40 bg-green-500/10 text-green-400"
                : "border-red-500/40 bg-red-500/10 text-red-400"
            }`}
          >
            {apiOnline === false
              ? <WifiOff className="h-3 w-3" />
              : <Wifi className={`h-3 w-3 ${apiOnline === null ? "animate-pulse" : ""}`} />}
            <span>{apiOnline === null ? "Checking…" : apiOnline ? "AI Online" : "AI Offline"}</span>
          </div>

          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/50" />
            <Input
              type="text"
              placeholder="Quick search..."
              className="pl-9 w-52 bg-white/5 border-white/10 text-white placeholder:text-white/50 focus:bg-white/10"
            />
          </div>

          {/* Bell with badge + dropdown */}
          <div className="relative">
            <button
              ref={bellRef}
              onClick={handleBellClick}
              className="relative p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotifs && (
                <motion.div
                  ref={dropdownRef}
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden z-50"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                    <span className="text-sm font-semibold text-white">Notifications</span>
                    <button onClick={() => setShowNotifs(false)} className="text-gray-500 hover:text-white">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* List */}
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-gray-600">
                        <Bell className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-xs">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((n) => {
                        const Icon = NOTIF_ICON[n.type] ?? Bell;
                        const iconColor = NOTIF_COLOR[n.type] ?? "text-blue-400";
                        return (
                          <div
                            key={n.id}
                            className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800/60 last:border-0 transition-colors ${
                              !n.read ? "bg-blue-500/5" : ""
                            }`}
                          >
                            <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${iconColor}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white leading-tight">{n.title}</p>
                              <p className="text-xs text-gray-400 mt-0.5 leading-snug">{n.message}</p>
                              <p className="text-xs text-gray-600 mt-1">{formatTime(n.createdAt)}</p>
                            </div>
                            {!n.read && (
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Avatar>
            <AvatarImage src={user?.photoURL} alt="User" />
            <AvatarFallback className="bg-blue-600 text-white text-sm">
              {user?.displayName?.charAt(0) ?? "U"}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
};

export default Header;
