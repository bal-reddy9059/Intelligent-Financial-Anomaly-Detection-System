import { Link, useNavigate, useLocation } from 'react-router-dom';
import { cn } from "@/lib/utils";
import { Button} from "@/components/ui/button";
import { auth } from './firebase';
import { signOut } from 'firebase/auth';

import {
  Home,
  Send,
  History,
  FileText,
  Users,
  Settings,
  HelpCircle as Help,
  LogOut,
  Upload,
  BarChart2,
  Play,
  Activity,
  GitCompare,
  ScanSearch,
  Layers,
  Brain,
  Microscope,
  ShieldAlert,
  Map,
  Calendar,
  Network,
  Eye,
  MessageSquare,
  TrendingDown,
  Zap,
  Shield,
  RefreshCw,
  Blend,
  Clock,
  QrCode,
  Wallet,
  HandCoins,
  BotMessageSquare,
  Bell,
  SplitSquareHorizontal,
  Target,
  Calculator,
  FileWarning,
  PiggyBank,
  Fingerprint,
  Flag,
  TrendingUp,
  HeartPulse,
  Trophy,
} from 'lucide-react';

export default function SidebarContent() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const navItems = [
    { icon: Home,                 label: "Dashboard",          path: "/dashboard" },
    { icon: Send,                 label: "Send Money",          path: "/send-money" },
    { icon: QrCode,               label: "QR Pay",              path: "/qr-pay" },
    { icon: HandCoins,            label: "Request Money",       path: "/request-money" },
    { icon: Wallet,               label: "Budget",              path: "/budget" },
    { icon: BotMessageSquare,     label: "AI Assistant",        path: "/ai-assistant" },
    { icon: Bell,                 label: "Notifications",       path: "/notifications" },
    { icon: History,              label: "Transactions",        path: "/transactions" },
    { icon: FileText,             label: "Statements",          path: "/statements" },
    { icon: Users,                label: "Beneficiaries",       path: "/beneficiaries" },
    // Week 2
    { icon: SplitSquareHorizontal, label: "Split Bill",         path: "/split-bill" },
    { icon: RefreshCw,            label: "Recurring Payments",  path: "/recurring-payments" },
    // Week 3
    { icon: Target,               label: "Savings Goals",       path: "/savings-goals" },
    { icon: Calculator,           label: "EMI Calculator",      path: "/emi-calculator" },
    // Week 4
    { icon: Zap,                  label: "Live Fraud Feed",     path: "/live-fraud-feed" },
    { icon: FileWarning,          label: "Dispute Center",      path: "/dispute-center" },
    // Week 5
    { icon: Fingerprint,          label: "Biometric Guard",     path: "/biometric-guard" },
    // Week 6
    { icon: Brain,                label: "Spending Coach",      path: "/spending-coach" },
    // Week 7
    { icon: Users,                label: "Contact Trust",       path: "/contact-trust" },
    { icon: Flag,                 label: "Community Reports",   path: "/community-reports" },
    // Week 8
    { icon: TrendingUp,           label: "Fraud Timeline",      path: "/fraud-timeline" },
    { icon: HeartPulse,           label: "Payment Health",      path: "/payment-health" },
    { icon: Trophy,               label: "Achievements",        path: "/security-badges" },
    // Existing
    { icon: ShieldAlert,          label: "Risk Profile",        path: "/risk-profile" },
    { icon: Map,                  label: "Fraud Heatmap",       path: "/fraud-heatmap" },
    { icon: Settings,             label: "Settings",            path: "/settings" },
    { icon: Help,                 label: "Help & Support",      path: "/help-support" },
  ];

  const mlNavItems = [
    { icon: Upload, label: "Upload Data", path: "/upload-data" },
    { icon: BarChart2, label: "Explore Data", path: "/explore-data" },
    { icon: Play, label: "Run Detection", path: "/run-detection" },
    { icon: Activity, label: "Results", path: "/detection-results" },
    { icon: GitCompare, label: "Model Comparison", path: "/model-comparison" },
    { icon: ScanSearch, label: "Check Transaction", path: "/check-transaction" },
    { icon: Layers, label: "Batch Check", path: "/batch-check" },
    { icon: Brain, label: "AI Hub", path: "/ai-hub" },
    { icon: Microscope, label: "Feature Insights", path: "/feature-insights" },
    { icon: Brain, label: "Bulk Explain", path: "/bulk-explain" },
    { icon: Clock, label: "Score History", path: "/score-history" },
    { icon: Eye, label: "Watchlist", path: "/watchlist" },
    { icon: Calendar, label: "Fraud Calendar", path: "/fraud-calendar" },
    { icon: Network, label: "Network Analysis", path: "/network-analysis" },
    { icon: TrendingDown, label: "Dataset Drift", path: "/dataset-drift" },
    { icon: RefreshCw, label: "Retrain Readiness", path: "/retraining-readiness" },
    { icon: Zap, label: "Behavioral Analysis", path: "/behavioral-analysis" },
    { icon: Shield, label: "Rule Engine", path: "/rule-engine" },
    { icon: Blend, label: "Risk Score Blend", path: "/risk-score-blend" },
    { icon: MessageSquare, label: "Feedback Center", path: "/feedback-center" },
  ];

  return (
    <>
      <div className="p-6">
        {/* ── Brand Logo ── */}
        <div className="mb-8">
          {/* Logo mark + wordmark row */}
          <div className="flex items-center gap-3 mb-3">

            {/* Hexagonal icon mark */}
            <div className="relative flex-shrink-0 w-11 h-11">
              {/* Ambient glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-600 rounded-2xl blur-lg opacity-60" />
              {/* Hex shape via clip */}
              <div
                className="relative w-11 h-11 flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #06b6d4, #3b82f6, #7c3aed)",
                  clipPath: "polygon(50% 0%,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%)",
                }}
              >
                {/* Neural dot grid inside hex */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  {/* Center node */}
                  <circle cx="12" cy="12" r="2.5" fill="white" />
                  {/* Outer nodes */}
                  <circle cx="12" cy="5"  r="1.5" fill="rgba(255,255,255,0.7)" />
                  <circle cx="12" cy="19" r="1.5" fill="rgba(255,255,255,0.7)" />
                  <circle cx="5"  cy="8"  r="1.5" fill="rgba(255,255,255,0.7)" />
                  <circle cx="19" cy="8"  r="1.5" fill="rgba(255,255,255,0.7)" />
                  <circle cx="5"  cy="16" r="1.5" fill="rgba(255,255,255,0.7)" />
                  <circle cx="19" cy="16" r="1.5" fill="rgba(255,255,255,0.7)" />
                  {/* Connecting lines */}
                  <line x1="12" y1="12" x2="12" y2="5"  stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                  <line x1="12" y1="12" x2="12" y2="19" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                  <line x1="12" y1="12" x2="5"  y2="8"  stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                  <line x1="12" y1="12" x2="19" y2="8"  stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                  <line x1="12" y1="12" x2="5"  y2="16" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                  <line x1="12" y1="12" x2="19" y2="16" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                </svg>
              </div>
              {/* Live pulse badge */}
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-gray-950">
                <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
              </span>
            </div>

            {/* Wordmark */}
            <div className="flex flex-col leading-none">
              <div className="flex items-end gap-0.5">
                <span
                  className="text-xl font-black tracking-tight"
                  style={{ background: "linear-gradient(90deg,#67e8f9,#818cf8,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >
                  Aegis
                </span>
                <span className="text-xl font-black text-white tracking-tight">AI</span>
              </div>
              <span className="text-[9px] font-semibold tracking-[0.2em] uppercase text-white/25 mt-0.5">
                Neural Fraud Defense
              </span>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07]">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-semibold text-emerald-400">AI Engine Live</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="h-2.5 w-2.5 text-yellow-400" />
              <span className="text-[9px] text-white/30 font-medium">Real-time</span>
            </div>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link to={item.path} key={item.label}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start hover:text-white hover:bg-white/10",
                    isActive
                      ? "text-white bg-white/10 font-semibold"
                      : "text-white/70"
                  )}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs text-white/30 uppercase tracking-widest mb-2 px-1">ML Analytics</p>
          <nav className="space-y-1">
            {mlNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link to={item.path} key={item.label}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start hover:text-white hover:bg-white/10",
                      isActive
                        ? "text-white bg-blue-500/20 border border-blue-500/30 font-semibold"
                        : "text-white/70"
                    )}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="mt-auto p-6 border-t border-white/10">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </>
  );
}
