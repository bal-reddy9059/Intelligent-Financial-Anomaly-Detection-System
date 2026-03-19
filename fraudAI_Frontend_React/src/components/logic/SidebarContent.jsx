import React from 'react';
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
  CreditCard,
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
    { icon: Home, label: "Dashboard", path: "/dashboard" },
    { icon: Send, label: "Send Money", path: "/send-money" },
    { icon: History, label: "Transactions", path: "/transactions" },
    { icon: FileText, label: "Statements", path: "/statements" },
    { icon: Users, label: "Beneficiaries", path: "/beneficiaries" },
    { icon: Settings, label: "Settings", path: "/settings" },
    { icon: Help, label: "Help & Support", path: "/help-support" },
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
  ];

  return (
    <>
      <div className="p-6">
        <div className="flex items-center mb-8">
          <CreditCard className="h-8 w-8 text-blue-400" />
          <span className="ml-2 text-xl font-bold text-blue-400">SafePayAI</span>
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
