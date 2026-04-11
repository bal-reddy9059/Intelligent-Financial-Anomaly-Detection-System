import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import { useRiskProfile } from "@/hooks/useRiskProfile";
import {
  ShieldAlert, ShieldCheck, ShieldX, AlertTriangle, TrendingUp,
  Users, Moon, Zap, RefreshCw, Brain,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const RISK_STYLES = {
  HIGH:   { color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30",    Icon: ShieldX,    label: "High Risk" },
  MEDIUM: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", Icon: ShieldAlert, label: "Medium Risk" },
  LOW:    { color: "text-green-400",  bg: "bg-green-500/10 border-green-500/30",  Icon: ShieldCheck, label: "Low Risk" },
};

function ScoreRing({ score, riskLevel }) {
  const color = riskLevel === "HIGH" ? "#ef4444" : riskLevel === "MEDIUM" ? "#f59e0b" : "#10b981";
  const circumference = 2 * Math.PI * 36;
  const offset = circumference * (1 - score / 100);
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="36" fill="none" stroke="#374151" strokeWidth="8" />
          <circle cx="48" cy="48" r="36" fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round" strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transformOrigin: "center", transform: "rotate(-90deg)", filter: `drop-shadow(0 0 5px ${color}66)` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className="text-2xl font-bold" style={{ color }}>{score}</span>
          <span className="text-xs text-gray-500">/100</span>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-1">Risk Score</p>
    </div>
  );
}

function DimensionBar({ label, score, desc }) {
  const color = score > 70 ? "bg-red-500" : score > 40 ? "bg-yellow-500" : "bg-green-500";
  const textColor = score > 70 ? "text-red-400" : score > 40 ? "text-yellow-400" : "text-green-400";
  return (
    <div className="p-3 bg-gray-700/40 rounded-lg">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-300">{label}</span>
        <span className={`text-xs font-bold ${textColor}`}>{score}%</span>
      </div>
      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <p className="text-xs text-gray-500 truncate">{desc}</p>
    </div>
  );
}

export default function RiskProfile() {
  const [user, setUser] = useState(null);
  const [upiId, setUpiId] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      setUser(u);
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) setUpiId(snap.data().upiId);
    });
    return unsub;
  }, []);

  const { profile, loading, error } = useRiskProfile(upiId);

  const riskStyle = profile?.riskLevel ? RISK_STYLES[profile.riskLevel] : RISK_STYLES.LOW;

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl font-bold text-blue-400 mb-1">Your Risk Profile</h1>
            <p className="text-gray-400 text-sm mb-6">
              Behavioral analysis of your transaction history to detect unusual patterns.
            </p>
          </motion.div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mr-3" />
              <span className="text-gray-400">Analysing your transaction history…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Insufficient data */}
          {profile?.insufficient && (
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="pt-8 pb-8 text-center">
                <TrendingUp className="h-10 w-10 text-blue-400 mx-auto mb-3" />
                <p className="text-gray-300 font-semibold">Not enough transaction history</p>
                <p className="text-gray-500 text-sm mt-1">
                  You have {profile.count} transaction{profile.count !== 1 ? "s" : ""}. At least 5 are needed to compute a reliable risk profile.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Full profile */}
          {profile && !profile.insufficient && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

              {/* Row 1: Score + Verdict + Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Score ring */}
                <Card className={`border ${riskStyle.bg} bg-gray-800`}>
                  <CardContent className="pt-6 flex flex-col items-center gap-3">
                    <ScoreRing score={profile.overallScore} riskLevel={profile.riskLevel} />
                    <div className="flex items-center gap-2">
                      <riskStyle.Icon className={`h-5 w-5 ${riskStyle.color}`} />
                      <span className={`text-sm font-bold ${riskStyle.color}`}>{riskStyle.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 text-center">
                      Based on {profile.stats.total} transactions
                    </p>
                  </CardContent>
                </Card>

                {/* Stat cards */}
                <div className="md:col-span-2 grid grid-cols-2 gap-3">
                  {[
                    { label: "Total Transactions", value: profile.stats.total, icon: RefreshCw, color: "blue" },
                    { label: "Flagged as Fraud", value: profile.stats.fraudCount, icon: ShieldX, color: profile.stats.fraudCount > 0 ? "red" : "green" },
                    { label: "Unique Recipients", value: profile.stats.uniqueRecipients, icon: Users, color: "purple" },
                    { label: "Risk Signals", value: profile.signals.length, icon: AlertTriangle, color: profile.signals.length > 2 ? "red" : "yellow" },
                  ].map((s) => (
                    <Card key={s.label} className="bg-gray-800 border-gray-700">
                      <CardHeader className="flex flex-row items-center justify-between pb-1">
                        <CardTitle className="text-xs text-gray-400">{s.label}</CardTitle>
                        <s.icon className={`h-4 w-4 text-${s.color}-400`} />
                      </CardHeader>
                      <CardContent>
                        <p className={`text-2xl font-bold text-${s.color}-400`}>{s.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Row 2: Dimension breakdown */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                    <Brain className="h-4 w-4 text-blue-400" /> Behavioral Dimensions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {profile.dimensions.map((dim) => (
                      <DimensionBar key={dim.label} label={dim.label} score={dim.score} desc={dim.desc} />
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Row 3: 30-day trend */}
              {profile.trend.length > 0 && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-400" /> Transaction Trend (last 30 days)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={profile.trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="date" stroke="#6b7280" fontSize={10} tick={{ fill: "#9ca3af" }} />
                        <YAxis stroke="#6b7280" fontSize={10} allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                          labelStyle={{ color: "#9ca3af" }} />
                        <Line type="monotone" dataKey="transactions" stroke="#3b82f6" strokeWidth={2} dot={false} name="Transactions" />
                        <Line type="monotone" dataKey="fraud" stroke="#ef4444" strokeWidth={2} dot={false} name="Fraud Flags" />
                      </LineChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-gray-600 mt-1 text-center">
                      Blue = all transactions · Red = fraud-flagged
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Row 4: Signals + AI Assessment */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Signals */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400" /> Risk Signals Detected
                      <span className="ml-auto text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full">
                        {profile.signals.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {profile.signals.length === 0 ? (
                      <div className="flex items-center gap-2 text-green-400 text-sm py-2">
                        <ShieldCheck className="h-4 w-4" /> No risk signals detected
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {profile.signals.map((sig, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-yellow-400 mt-0.5 flex-shrink-0">▲</span>
                            <span className="text-gray-300">{sig}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                {/* AI Assessment */}
                <Card className={`border ${riskStyle.bg} bg-gray-800`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                      <Brain className="h-4 w-4 text-blue-400" /> AI Assessment
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-300 leading-relaxed">{profile.assessment}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Moon className="h-3.5 w-3.5 text-gray-500" />
                      <span className="text-xs text-gray-500">
                        Avg transaction value: ₹{profile.stats.mean}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-gray-500" />
                      <span className="text-xs text-gray-500">
                        Analysis based on all {profile.stats.total} stored transactions
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
