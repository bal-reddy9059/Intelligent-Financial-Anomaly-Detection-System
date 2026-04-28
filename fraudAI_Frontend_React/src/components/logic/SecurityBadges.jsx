import { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import SidebarContent from "./SidebarContent";
import Header from "./Header";
import {
  Trophy,
  Lock,
  Star,
  Flame,
  ChevronRight,
  RefreshCw,
  Award,
  Users,
  Zap,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

// --- Badge Definitions ---
const BADGE_DEFS = [
  {
    id: "first_defense",
    emoji: "🛡️",
    name: "First Defense",
    description: "Sent first payment without fraud",
    xp: 5,
  },
  {
    id: "limit_setter",
    emoji: "🔒",
    name: "Limit Setter",
    description: "Enabled transaction limits",
    xp: 10,
  },
  {
    id: "budget_boss",
    emoji: "📊",
    name: "Budget Boss",
    description: "Set up budget tracking",
    xp: 10,
  },
  {
    id: "goal_getter",
    emoji: "🎯",
    name: "Goal Getter",
    description: "Created first savings goal",
    xp: 15,
  },
  {
    id: "week_warrior",
    emoji: "🔥",
    name: "Week Warrior",
    description: "7-day fraud-free streak",
    xp: 20,
  },
  {
    id: "month_master",
    emoji: "💎",
    name: "Month Master",
    description: "30-day fraud-free streak",
    xp: 50,
  },
  {
    id: "fraud_spotter",
    emoji: "🚨",
    name: "Fraud Spotter",
    description: "Reported a community fraud",
    xp: 15,
  },
  {
    id: "ai_learner",
    emoji: "🤖",
    name: "AI Learner",
    description: "Used AI assistant 5 times",
    xp: 10,
  },
  {
    id: "saver",
    emoji: "💰",
    name: "Saver",
    description: "Reached 50% of a savings goal",
    xp: 25,
  },
  {
    id: "century",
    emoji: "🏆",
    name: "Century",
    description: "100 safe transactions",
    xp: 50,
  },
  {
    id: "speed_payer",
    emoji: "⚡",
    name: "Speed Payer",
    description: "Used recurring payments",
    xp: 10,
  },
  {
    id: "team_player",
    emoji: "🤝",
    name: "Team Player",
    description: "Used Split Bill feature",
    xp: 10,
  },
  {
    id: "detective",
    emoji: "🔍",
    name: "Detective",
    description: "Checked fraud score before paying",
    xp: 10,
  },
  {
    id: "qr_master",
    emoji: "📱",
    name: "QR Master",
    description: "Used QR Pay",
    xp: 5,
  },
  {
    id: "profile_complete",
    emoji: "🌟",
    name: "Profile Complete",
    description: "Filled all profile fields",
    xp: 10,
  },
  {
    id: "block_master",
    emoji: "🛑",
    name: "Block Master",
    description: "Had a fraudulent transaction blocked",
    xp: 20,
  },
  {
    id: "investor",
    emoji: "📈",
    name: "Investor",
    description: "Created 3 savings goals",
    xp: 30,
  },
  {
    id: "community_hero",
    emoji: "🌐",
    name: "Community Hero",
    description: "5 community fraud reports",
    xp: 40,
  },
  {
    id: "educated",
    emoji: "🎓",
    name: "Educated",
    description: "Read all Help & Support articles",
    xp: 15,
  },
  {
    id: "safepay_elite",
    emoji: "👑",
    name: "Aegis Elite",
    description: "All other badges earned",
    xp: 100,
  },
];

const LEVELS = [
  { name: "Rookie", minXP: 0 },
  { name: "Guardian", minXP: 50 },
  { name: "Sentinel", minXP: 150 },
  { name: "Elite", minXP: 300 },
  { name: "Legend", minXP: 500 },
];

const STREAK_MILESTONES = [10, 30, 100];

function getLevel(xp) {
  let level = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.minXP) level = l;
  }
  return level;
}

function getNextMilestone(streak) {
  for (const m of STREAK_MILESTONES) {
    if (streak < m) return m;
  }
  return STREAK_MILESTONES[STREAK_MILESTONES.length - 1];
}

// Mock leaderboard data
const MOCK_LEADERBOARD = [
  { name: "S***a K", xp: 620, level: "Legend" },
  { name: "R***h M", xp: 445, level: "Elite" },
  { name: "P***i T", xp: 310, level: "Elite" },
  { name: "A***v S", xp: 210, level: "Sentinel" },
  { name: "K***a R", xp: 155, level: "Sentinel" },
];

function computeStreak(txData) {
  if (!txData.length) return 0;
  const sorted = [...txData].sort((a, b) => {
    const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
    const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
    return tb - ta;
  });

  let streak = 0;
  let currentDay = new Date();
  currentDay.setHours(0, 0, 0, 0);

  const safePerDay = {};
  sorted.forEach((t) => {
    const ts = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
    if (isNaN(ts)) return;
    const key = `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}`;
    if (!safePerDay[key]) safePerDay[key] = { safe: 0, fraud: 0 };
    if (t.fraudVerdict === "HIGH_RISK") safePerDay[key].fraud++;
    else safePerDay[key].safe++;
  });

  for (let i = 0; i < 365; i++) {
    const d = new Date(currentDay);
    d.setDate(currentDay.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!safePerDay[key]) {
      if (i === 0) continue;
      break;
    }
    if (safePerDay[key].fraud > 0) break;
    streak++;
  }
  return streak;
}

function computeUnlocked(txData, sgData, rpData, userData, communityData, helpData, aiData, splitData, qrData) {
  const total = txData.length;
  const safe = txData.filter((t) => t.fraudVerdict !== "HIGH_RISK").length;
  const blocked = txData.filter((t) => t.blocked === true).length;
  const streak = computeStreak(txData);
  const goalsCount = sgData.length;
  const goalsHalfway = sgData.filter(
    (g) => g.currentAmount >= (g.targetAmount || Infinity) * 0.5
  ).length;
  const rpCount = rpData.length;
  const communityCount = communityData.length;
  const limitsEnabled = userData?.transactionLimits?.enabled || false;
  const profileFilled =
    userData?.name && userData?.phone && userData?.email && userData?.upiId;

  const unlocked = new Set();

  if (total >= 1) unlocked.add("first_defense");
  if (limitsEnabled) unlocked.add("limit_setter");
  if (userData?.budgetEnabled || userData?.budget) unlocked.add("budget_boss");
  if (goalsCount >= 1) unlocked.add("goal_getter");
  if (streak >= 7) unlocked.add("week_warrior");
  if (streak >= 30) unlocked.add("month_master");
  if (communityCount >= 1) unlocked.add("fraud_spotter");
  if ((aiData?.count || 0) >= 5) unlocked.add("ai_learner");
  if (goalsHalfway >= 1) unlocked.add("saver");
  if (safe >= 100) unlocked.add("century");
  if (rpCount >= 1) unlocked.add("speed_payer");
  if ((splitData?.count || 0) >= 1) unlocked.add("team_player");
  if (userData?.checkedFraudScore) unlocked.add("detective");
  if ((qrData?.count || 0) >= 1) unlocked.add("qr_master");
  if (profileFilled) unlocked.add("profile_complete");
  if (blocked >= 1) unlocked.add("block_master");
  if (goalsCount >= 3) unlocked.add("investor");
  if (communityCount >= 5) unlocked.add("community_hero");
  if (helpData?.allArticlesRead) unlocked.add("educated");

  // Aegis Elite: all others
  const nonElite = BADGE_DEFS.filter((b) => b.id !== "safepay_elite");
  if (nonElite.every((b) => unlocked.has(b.id))) unlocked.add("safepay_elite");

  return { unlocked, streak };
}

export default function SecurityBadges() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [badgeState, setBadgeState] = useState({
    unlockedIds: new Set(),
    xp: 0,
    streak: 0,
    level: LEVELS[0],
  });
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [unlockDates, setUnlockDates] = useState({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) fetchData(u);
    });
    return () => unsub();
  }, []);

  async function fetchData(u) {
    setLoading(true);
    try {
      // Transactions
      const txSnap = await getDocs(
        query(
          collection(db, "transactions"),
          where("userId", "==", u.uid),
          orderBy("timestamp", "desc"),
          limit(500)
        )
      );
      const txData = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Savings Goals
      const sgSnap = await getDocs(
        query(collection(db, "savingsGoals"), where("userId", "==", u.uid))
      );
      const sgData = sgSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Recurring Payments
      const rpSnap = await getDocs(
        query(collection(db, "recurringPayments"), where("userId", "==", u.uid))
      );
      const rpData = rpSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // User doc
      const userDoc = await getDoc(doc(db, "users", u.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};

      // Community reports
      const crSnap = await getDocs(
        query(collection(db, "communityReports"), where("userId", "==", u.uid))
      );
      const communityData = crSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Existing badge doc
      const badgeDoc = await getDoc(doc(db, "userBadges", u.uid));
      const badgeData = badgeDoc.exists() ? badgeDoc.data() : {};
      const existingDates = badgeData.unlockDates || {};

      // Compute unlocks
      const { unlocked, streak } = computeUnlocked(
        txData, sgData, rpData, userData, communityData,
        userData?.helpData || {},
        userData?.aiData || {},
        userData?.splitData || {},
        userData?.qrData || {}
      );

      // Compute XP
      let xp = badgeData.xp || 0;
      const newlyUnlocked = [];
      unlocked.forEach((id) => {
        if (!existingDates[id]) {
          const def = BADGE_DEFS.find((b) => b.id === id);
          if (def) {
            xp += def.xp;
            existingDates[id] = new Date().toISOString();
            newlyUnlocked.push(def.name);
          }
        }
      });

      // Save to Firestore
      await setDoc(
        doc(db, "userBadges", u.uid),
        {
          unlockedIds: [...unlocked],
          xp,
          streak,
          unlockDates: existingDates,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const level = getLevel(xp);
      setBadgeState({ unlockedIds: unlocked, xp, streak, level });
      setTransactions(txData);
      setGoals(sgData);
      setUnlockDates(existingDates);

      // Build recent activity feed
      const activity = [];
      newlyUnlocked.forEach((name) => {
        activity.push(`You just earned the "${name}" badge!`);
      });
      if (streak > 0) {
        activity.push(`Streak extended to ${streak} day${streak !== 1 ? "s" : ""} fraud-free.`);
      }
      const recent3 = Object.entries(existingDates)
        .sort((a, b) => new Date(b[1]) - new Date(a[1]))
        .slice(0, 3);
      recent3.forEach(([id, dateStr]) => {
        if (!newlyUnlocked.includes(id)) {
          const def = BADGE_DEFS.find((b) => b.id === id);
          if (def) {
            const d = new Date(dateStr);
            const daysAgo = Math.floor((Date.now() - d.getTime()) / 86400000);
            activity.push(
              `You earned "${def.name}" ${daysAgo === 0 ? "today" : `${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago`}.`
            );
          }
        }
      });
      setRecentActivity(activity.slice(0, 5));
    } catch (err) {
      console.error("SecurityBadges fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  const { unlockedIds, xp, streak, level } = badgeState;
  const nextMilestone = getNextMilestone(streak);
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1] || level;
  const xpToNext = nextLevel.minXP - xp;
  const levelProgress =
    nextLevel === level
      ? 100
      : Math.round(
          ((xp - level.minXP) / (nextLevel.minXP - level.minXP)) * 100
        );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1 },
  };

  const totalXP = BADGE_DEFS.reduce((s, b) => s + b.xp, 0);

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-2"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-xl">
                <Trophy className="text-yellow-400" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Security Achievements
                </h1>
                <p className="text-gray-400 text-sm">
                  Earn badges by practicing safe payment habits
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => user && fetchData(user)}
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
          </motion.div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400">Loading your achievements...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 mt-4">
              {/* Streak Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="bg-gradient-to-r from-orange-900/40 to-red-900/30 border border-orange-700/40">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                      {/* Streak */}
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <Flame size={52} className="text-orange-400" />
                          <span className="absolute inset-0 flex items-center justify-center text-white font-extrabold text-lg">
                            {streak}
                          </span>
                        </div>
                        <div>
                          <p className="text-orange-300 font-bold text-lg">
                            {streak}-day safe payment streak!
                          </p>
                          <p className="text-gray-400 text-sm">
                            Next milestone: {nextMilestone} days
                          </p>
                          <div className="mt-2 w-48 h-2 bg-orange-900/50 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-400 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (streak / nextMilestone) * 100)}%` }} />
                          </div>
                        </div>
                      </div>

                      {/* XP and Level */}
                      <div className="md:ml-auto flex flex-col items-center md:items-end gap-1">
                        <div className="flex items-center gap-2">
                          <Star size={16} className="text-yellow-400" />
                          <span className="text-2xl font-extrabold text-yellow-300">
                            {xp}
                          </span>
                          <span className="text-gray-400 text-sm">/ {totalXP} XP</span>
                        </div>
                        <Badge className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 text-sm px-3 py-1">
                          {level.name}
                        </Badge>
                        {nextLevel !== level && (
                          <p className="text-gray-500 text-xs">
                            {xpToNext} XP to {nextLevel.name}
                          </p>
                        )}
                        <div className="w-40 mt-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-yellow-400 rounded-full transition-all duration-500" style={{ width: `${levelProgress}%` }} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Badge Grid */}
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  <Award size={18} className="text-purple-400" />
                  Badges
                  <span className="text-gray-500 text-sm font-normal ml-1">
                    ({unlockedIds.size}/{BADGE_DEFS.length} unlocked)
                  </span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {BADGE_DEFS.map((badge, i) => {
                    const isUnlocked = unlockedIds.has(badge.id);
                    const unlockDate = unlockDates[badge.id]
                      ? new Date(unlockDates[badge.id]).toLocaleDateString()
                      : null;
                    return (
                      <motion.div
                        key={badge.id}
                        variants={itemVariants}
                        transition={{ delay: i * 0.03 }}
                        className={`relative rounded-xl border p-4 flex flex-col items-center text-center transition-all ${
                          isUnlocked
                            ? "bg-gray-800 border-yellow-500/40 shadow-lg shadow-yellow-500/10 ring-1 ring-yellow-500/20"
                            : "bg-gray-800/50 border-gray-700/50 opacity-60"
                        }`}
                      >
                        {!isUnlocked && (
                          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 rounded-xl z-10">
                            <Lock size={20} className="text-gray-500" />
                          </div>
                        )}
                        <span
                          className={`text-3xl mb-2 ${
                            !isUnlocked ? "grayscale" : ""
                          }`}
                        >
                          {badge.emoji}
                        </span>
                        <p
                          className={`font-semibold text-sm ${
                            isUnlocked ? "text-white" : "text-gray-500"
                          }`}
                        >
                          {badge.name}
                        </p>
                        <p className="text-gray-500 text-xs mt-1 leading-snug">
                          {badge.description}
                        </p>
                        <div className="flex items-center gap-1 mt-2">
                          <Star size={11} className="text-yellow-400" />
                          <span className="text-yellow-400 text-xs font-bold">
                            {badge.xp} XP
                          </span>
                        </div>
                        {isUnlocked && unlockDate && (
                          <p className="text-green-500 text-xs mt-1">
                            Earned {unlockDate}
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>

              {/* Leaderboard */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Users size={18} className="text-blue-400" />
                      Top AegisAI Users This Month
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {MOCK_LEADERBOARD.map((u, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-3 p-3 rounded-lg ${
                            i === 0
                              ? "bg-yellow-500/10 border border-yellow-500/30"
                              : "bg-gray-700/50"
                          }`}
                        >
                          <span
                            className={`text-sm font-bold w-5 text-center ${
                              i === 0
                                ? "text-yellow-400"
                                : i === 1
                                ? "text-gray-300"
                                : "text-gray-500"
                            }`}
                          >
                            #{i + 1}
                          </span>
                          <div className="flex-1">
                            <p className="text-white text-sm font-medium">
                              {u.name}
                            </p>
                            <p className="text-gray-500 text-xs">{u.level}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Star size={12} className="text-yellow-400" />
                            <span className="text-yellow-300 text-sm font-bold">
                              {u.xp}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Recent Activity */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Activity size={18} className="text-green-400" />
                      Recent Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {recentActivity.length === 0 ? (
                      <p className="text-gray-500 text-sm">
                        No recent badge activity. Keep using AegisAI to earn
                        your first badge!
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {recentActivity.map((a, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 p-2.5 bg-gray-700/50 rounded-lg"
                          >
                            <Zap
                              size={14}
                              className="text-purple-400 mt-0.5 shrink-0"
                            />
                            <p className="text-gray-300 text-sm">{a}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
