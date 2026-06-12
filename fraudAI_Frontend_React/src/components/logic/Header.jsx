import { useState, useEffect, useRef } from "react";
import {
  Search, Bell, CreditCard, Menu, Wifi, WifiOff,
  ShieldAlert, CheckCircle, Clock, X, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import SidebarContent from './SidebarContent';
import axios from "axios";
import { auth, db } from "./firebase";
import { collection, query, where, getDocs, updateDoc, doc, limit } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const NOTIF_ICON  = { fraud: ShieldAlert, cooling: Clock, success: CheckCircle };
const NOTIF_COLOR = { fraud: "text-red-400", cooling: "text-amber-400", success: "text-emerald-400" };
const NOTIF_BG    = { fraud: "bg-red-500/10",  cooling: "bg-amber-500/10",  success: "bg-emerald-500/10" };

/* ── Route → human label ── */
const routeLabels = {
  '/dashboard':          'Dashboard',
  '/send-money':         'Send Money',
  '/transactions':       'Transactions',
  '/statements':         'Statements',
  '/beneficiaries':      'Beneficiaries',
  '/settings':           'Settings',
  '/help-support':       'Help & Support',
  '/upload-data':        'Upload Data',
  '/explore-data':       'Explore Data',
  '/run-detection':      'Run Detection',
  '/detection-results':  'Detection Results',
  '/model-comparison':   'Model Comparison',
  '/check-transaction':  'Check Transaction',
  '/batch-check':        'Batch Check',
  '/ai-hub':             'AI Intelligence Hub',
  '/feature-insights':   'Feature Insights',
  '/risk-profile':       'Risk Profile',
  '/fraud-heatmap':      'Fraud Heatmap',
  '/fraud-calendar':     'Fraud Calendar',
  '/network-analysis':   'Network Analysis',
  '/score-history':      'Score History',
  '/watchlist':          'Watchlist',
  '/feedback-center':    'Feedback Center',
  '/dataset-drift':      'Dataset Drift',
  '/behavioral-analysis':'Behavioral Analysis',
  '/rule-engine':        'Rule Engine',
  '/bulk-explain':       'Bulk Explain',
  '/retraining-readiness':'Retraining Readiness',
  '/risk-score-blend':   'Risk Score Blend',
  '/qr-pay':             'QR Pay',
  '/pay-by-phone':       'Pay by Phone',
  '/budget':             'Budget',
  '/request-money':      'Request Money',
  '/ai-assistant':       'AI Assistant',
  '/notifications':      'Notifications',
  '/split-bill':         'Split Bill',
  '/recurring-payments': 'Recurring Payments',
  '/savings-goals':      'Savings Goals',
  '/emi-calculator':     'EMI Calculator',
  '/live-fraud-feed':    'Live Fraud Feed',
  '/dispute-center':     'Dispute Center',
  '/biometric-guard':    'Biometric Guard',
  '/spending-coach':     'Spending Coach',
  '/contact-trust':      'Contact Trust',
  '/community-reports':  'Community Reports',
  '/fraud-timeline':     'Fraud Timeline',
  '/payment-health':     'Payment Health',
  '/security-badges':    'Achievements',
  '/voice-pay':          'Voice Pay',
  '/spending-dna':       'Spending DNA',
  '/future-risk':        'Future Risk',
  '/financial-story':    'AI Chronicle',
  '/budget-predictor':   'Budget Predictor',
  '/anomaly-explainer':  'Anomaly Explainer',
  '/fraud-ring':         'Fraud Ring Detector',
  '/health-score':       'Health Score',
  '/prepayment-shield':  'Pre-Payment Shield',
  '/bank-linking':       'Link Bank Account',
  '/ghost-hunter':       'Ghost Hunter',
  '/cashflow-forecast':  'Cash Flow Forecast',
  '/financial-personality':'Financial Personality',
};

const Header = ({ user }) => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [apiOnline,    setApiOnline]    = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [showNotifs,   setShowNotifs]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const bellRef     = useRef(null);
  const dropdownRef = useRef(null);

  const showBack   = location.pathname !== "/dashboard";
  const pageLabel  = routeLabels[location.pathname] ?? 'AegisAI';

  /* API health */
  useEffect(() => {
    const check = () => {
      axios.get(`${API}/health`, { timeout: 5000 })
        .then(() => setApiOnline(true))
        .catch(() => setApiOnline(false));
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  /* Notifications */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) { setNotifications([]); setUnreadCount(0); return; }
      await fetchNotifications(cu.uid);
    });
    return unsub;
  }, []);

  const fetchNotifications = async (uid) => {
    try {
      const q = query(collection(db, "notifications"), where("userId", "==", uid), limit(20));
      const snap = await getDocs(q);
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    } catch { /* index not ready */ }
  };

  const markAllRead = async () => {
    const cu = auth.currentUser;
    if (!cu) return;
    const unread = notifications.filter(n => !n.read);
    await Promise.all(unread.map(n =>
      updateDoc(doc(db, "notifications", n.id), { read: true }).catch(() => {})
    ));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  /* Close dropdown on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        bellRef.current     && !bellRef.current.contains(e.target)
      ) setShowNotifs(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleBellClick = () => {
    setShowNotifs(v => !v);
    if (!showNotifs && unreadCount > 0) markAllRead();
  };

  const formatTime = (ts) => {
    if (!ts?.seconds) return "";
    const d    = new Date(ts.seconds * 1000);
    const diff = Date.now() - d.getTime();
    if (diff < 60000)    return "Just now";
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  return (
    <header className="sticky top-0 z-40 flex-shrink-0 border-b" style={{ background: "rgba(12,19,36,0.85)", backdropFilter: "blur(24px) saturate(1.4)", WebkitBackdropFilter: "blur(24px) saturate(1.4)", borderColor: "rgba(220,225,251,0.07)", boxShadow: "inset 0 -1px 0 rgba(220,225,251,0.04), 0 4px 24px rgba(0,0,0,0.2)" }}>
      <div className="flex items-center justify-between px-5 py-3.5 gap-3">

        {/* ── Left: mobile menu + back + page title ── */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Mobile hamburger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden flex-shrink-0 h-9 w-9 rounded-xl text-[rgba(188,201,205,0.6)] hover:text-[#dce1fb] hover:bg-[rgba(220,225,251,0.06)]">
                <Menu className="h-4.5 w-4.5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 border-r" style={{ background: "#070d1f", borderColor: "rgba(220,225,251,0.06)" }}>
              <SidebarContent />
            </SheetContent>
          </Sheet>

          {/* Back button */}
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[rgba(188,201,205,0.5)] hover:text-[#4cd7f6] hover:bg-[rgba(76,215,246,0.07)] transition-all duration-150 text-sm font-medium group flex-shrink-0 border border-transparent hover:border-[rgba(76,215,246,0.15)]"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform duration-150" />
              <span className="hidden sm:inline font-mono text-xs">Back</span>
            </button>
          )}

          {/* Mobile logo */}
          <div className="flex items-center gap-2 md:hidden">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:"linear-gradient(135deg,#4cd7f6,#d0bcff)"}}>
              <CreditCard className="h-3.5 w-3.5 text-[#003640]" />
            </div>
            <span className="text-base font-bold" style={{background:"linear-gradient(90deg,#4cd7f6,#d0bcff)", WebkitBackgroundClip:"text", backgroundClip:"text", WebkitTextFillColor:"transparent", color:"transparent", display:"inline-block"}}>
              AegisAI
            </span>
          </div>

          {/* Page title — desktop only */}
          <div className="hidden md:block pl-1">
            <h1 className="text-sm font-semibold text-[#dce1fb] truncate max-w-[260px]">{pageLabel}</h1>
          </div>
        </div>

        {/* ── Right: API status + search + bell + avatar ── */}
        <div className="flex items-center gap-2.5 flex-shrink-0">

          {/* API status badge */}
          <div
            title={apiOnline === null ? "Checking AI server…" : apiOnline ? "AI server online" : "AI server offline"}
            className={`hidden sm:flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border font-mono font-bold tracking-wide transition-all ${
              apiOnline === null
                ? "border-[rgba(134,147,151,0.3)] text-[rgba(134,147,151,0.6)] bg-[rgba(134,147,151,0.05)]"
                : apiOnline
                ? "border-[rgba(78,222,163,0.3)] bg-[rgba(78,222,163,0.08)] text-[#4edea3]"
                : "border-[rgba(255,180,171,0.3)] bg-[rgba(255,180,171,0.08)] text-[#ffb4ab]"
            }`}
          >
            {apiOnline === false
              ? <WifiOff className="h-3 w-3" />
              : <Wifi className={`h-3 w-3 ${apiOnline === null ? "animate-pulse" : ""}`} />
            }
            <span>{apiOnline === null ? "CHECKING" : apiOnline ? "AI ONLINE" : "AI OFFLINE"}</span>
          </div>

          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[rgba(134,147,151,0.6)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Quick search…"
              className="pl-8 pr-3 py-2 w-48 text-sm rounded-xl text-[#dce1fb] placeholder:text-[rgba(134,147,151,0.5)] focus:outline-none transition-all duration-150 font-mono"
              style={{ background: "rgba(25,31,49,0.6)", border: "1px solid rgba(220,225,251,0.08)" }}
              onFocus={e => { e.target.style.borderColor = "rgba(76,215,246,0.35)"; e.target.style.background = "rgba(25,31,49,0.85)"; }}
              onBlur={e => { e.target.style.borderColor = "rgba(220,225,251,0.08)"; e.target.style.background = "rgba(25,31,49,0.6)"; }}
            />
          </div>

          {/* Bell */}
          <div className="relative">
            <button
              ref={bellRef}
              onClick={handleBellClick}
              className="relative h-9 w-9 rounded-xl flex items-center justify-center text-[rgba(188,201,205,0.55)] hover:text-[#4cd7f6] hover:bg-[rgba(76,215,246,0.08)] transition-all duration-150 border border-transparent hover:border-[rgba(76,215,246,0.12)]"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 text-[9px] font-bold font-mono text-white rounded-full flex items-center justify-center" style={{ background: "#ffb4ab", color: "#690005", boxShadow: "0 0 10px rgba(255,180,171,0.5)" }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotifs && (
                <motion.div
                  ref={dropdownRef}
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute right-0 top-full mt-2 w-80 rounded-2xl overflow-hidden z-50"
                  style={{ background: "rgba(7,13,31,0.97)", backdropFilter: "blur(28px)", border: "1px solid rgba(220,225,251,0.10)", boxShadow: "0 16px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(76,215,246,0.06)" }}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(220,225,251,0.07)" }}>
                    <span className="text-sm font-semibold text-[#dce1fb]">Notifications</span>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && <span className="label-caps text-[#4cd7f6]">{unreadCount} unread</span>}
                      <button onClick={() => setShowNotifs(false)} className="text-[rgba(134,147,151,0.5)] hover:text-[rgba(220,225,251,0.7)] transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-[rgba(134,147,151,0.4)]">
                        <Bell className="h-8 w-8 mb-2.5 opacity-25" />
                        <p className="text-xs font-mono">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map(n => {
                        const Icon      = NOTIF_ICON[n.type]  ?? Bell;
                        const iconColor = NOTIF_COLOR[n.type] ?? "text-[#4cd7f6]";
                        const iconBg    = NOTIF_BG[n.type]    ?? "bg-[rgba(76,215,246,0.10)]";
                        return (
                          <div key={n.id} className={`flex items-start gap-3 px-4 py-3.5 border-b last:border-0 transition-colors hover:bg-[rgba(255,255,255,0.02)] ${!n.read ? "bg-[rgba(76,215,246,0.03)]" : ""}`} style={{ borderColor: "rgba(220,225,251,0.05)" }}>
                            <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5 ${iconBg}`}>
                              <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-[#dce1fb] leading-snug">{n.title}</p>
                              <p className="text-xs text-[rgba(188,201,205,0.5)] mt-0.5 leading-relaxed">{n.message}</p>
                              <p className="text-[10px] text-[rgba(134,147,151,0.4)] mt-1 font-mono">{formatTime(n.createdAt)}</p>
                            </div>
                            {!n.read && (
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2" style={{ background: "#4cd7f6", boxShadow: "0 0 6px rgba(76,215,246,0.6)" }} />
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

          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="absolute -inset-0.5 rounded-full opacity-60" style={{ background: "linear-gradient(135deg,#4cd7f6,#d0bcff)" }} />
            <Avatar className="relative h-8 w-8" style={{ border: "2px solid rgba(12,19,36,0.8)" }}>
              <AvatarImage src={user?.photoURL} alt="User" />
              <AvatarFallback className="text-xs font-bold" style={{ background: "linear-gradient(135deg,#4cd7f6,#d0bcff)", color: "#003640" }}>
                {user?.displayName?.charAt(0) ?? "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
