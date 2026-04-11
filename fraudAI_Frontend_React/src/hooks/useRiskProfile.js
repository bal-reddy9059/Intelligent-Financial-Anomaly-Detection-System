import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../components/logic/firebase";

function interpolateColor(rate) {
  // 0% → green, 50% → amber, 100% → red
  if (rate <= 50) {
    const t = rate / 50;
    return `rgb(${Math.round(16 + t * (245 - 16))}, ${Math.round(185 - t * (185 - 158))}, ${Math.round(129 - t * (129 - 11))})`;
  }
  const t = (rate - 50) / 50;
  return `rgb(${Math.round(245 + t * (239 - 245))}, ${Math.round(158 - t * 158)}, ${Math.round(11 - t * 11)})`;
}

function generateAssessment(overallScore, signals) {
  if (overallScore > 70) {
    const top = signals.slice(0, 2).join(" and ");
    return `Your account shows elevated behavioral risk (score: ${overallScore}/100). ${top ? `Key signals detected: ${top}.` : ""} We recommend reviewing your recent transactions and contacting support if you notice unrecognized activity.`;
  }
  if (overallScore > 40) {
    const top = signals[0] ?? "";
    return `Moderate risk indicators detected on your account (score: ${overallScore}/100). ${top ? `Notable signal: ${top}.` : ""} Monitor your transaction activity and ensure all payments are authorized.`;
  }
  return `Your transaction behavior appears consistent with normal patterns (score: ${overallScore}/100). No significant risk signals detected. Keep monitoring your account regularly.`;
}

export function useRiskProfile(upiId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!upiId) return;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const txQuery = query(collection(db, "transactions"), where("senderUPI", "==", upiId));
        const snap = await getDocs(txQuery);
        const txList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (txList.length < 5) {
          setProfile({ insufficient: true, count: txList.length });
          setLoading(false);
          return;
        }

        const total = txList.length;
        const now = Date.now();
        const DAY = 86400000;

        // ── Fraud flag rate ──────────────────────────────────────────────────
        const fraudCount = txList.filter((tx) => tx.fraudVerdict === "FRAUD").length;
        const fraudFlagRate = (fraudCount / total) * 100;

        // ── Night transaction rate (00:00–05:00) ────────────────────────────
        const nightCount = txList.filter((tx) => {
          if (!tx.createdAt) return false;
          const h = new Date(tx.createdAt.seconds * 1000).getHours();
          return h >= 0 && h < 5;
        }).length;
        const nightTxRate = (nightCount / total) * 100;

        // ── High-value transaction rate (mean + 2*std) ──────────────────────
        const amounts = txList.map((tx) => tx.amount ?? 0);
        const mean = amounts.reduce((s, a) => s + a, 0) / total;
        const std = Math.sqrt(amounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / total);
        const highValueCount = amounts.filter((a) => a > mean + 2 * std).length;
        const highValueRate = (highValueCount / total) * 100;

        // ── Repeat pattern score (same recipient + amount) ──────────────────
        const patterns = {};
        txList.forEach((tx) => {
          const key = `${tx.recipientUPI}__${tx.amount}`;
          patterns[key] = (patterns[key] || 0) + 1;
        });
        const repeatCount = Object.values(patterns).filter((v) => v > 1).reduce((s, v) => s + (v - 1), 0);
        const repeatPatternScore = (repeatCount / total) * 100;

        // ── Spending velocity (last 7 days vs 30-day avg) ───────────────────
        const last7 = txList.filter((tx) => tx.createdAt && now - tx.createdAt.seconds * 1000 < 7 * DAY).length;
        const last30 = txList.filter((tx) => tx.createdAt && now - tx.createdAt.seconds * 1000 < 30 * DAY).length;
        const avgWeekly = last30 / 4.3;
        const spendingVelocityScore = avgWeekly > 0 ? Math.min(100, ((last7 - avgWeekly) / avgWeekly) * 100) : 0;
        const velocityScore = Math.max(0, spendingVelocityScore);

        // ── Recipient diversity (few unique = more suspicious) ───────────────
        const uniqueRecipients = new Set(txList.map((tx) => tx.recipientUPI)).size;
        const diversityRatio = uniqueRecipients / total; // high = diverse = safer
        const recipientRiskScore = Math.max(0, (1 - diversityRatio) * 100);

        // ── Overall weighted score ───────────────────────────────────────────
        const overallScore = Math.round(
          fraudFlagRate * 0.35 +
          nightTxRate * 0.15 +
          highValueRate * 0.20 +
          repeatPatternScore * 0.10 +
          velocityScore * 0.10 +
          recipientRiskScore * 0.10
        );

        // ── Dimensions ──────────────────────────────────────────────────────
        const dimensions = [
          { label: "Fraud Flag Rate", score: Math.round(fraudFlagRate), desc: `${fraudCount} of ${total} transactions flagged as fraud` },
          { label: "Night Transactions", score: Math.round(nightTxRate), desc: `${nightCount} transactions between 12am–5am` },
          { label: "High-Value Rate", score: Math.round(highValueRate), desc: `${highValueCount} transactions above mean+2σ (₹${(mean + 2 * std).toFixed(0)})` },
          { label: "Repeat Patterns", score: Math.round(repeatPatternScore), desc: `${repeatCount} duplicate recipient+amount combinations` },
          { label: "Spending Velocity", score: Math.round(velocityScore), desc: `${last7} tx in last 7 days vs ${avgWeekly.toFixed(1)} weekly avg` },
          { label: "Recipient Concentration", score: Math.round(recipientRiskScore), desc: `${uniqueRecipients} unique recipients out of ${total} transactions` },
        ];

        // ── Signals ──────────────────────────────────────────────────────────
        const signals = [];
        if (fraudFlagRate > 10) signals.push(`High fraud flag rate (${fraudFlagRate.toFixed(1)}%)`);
        if (nightTxRate > 20) signals.push(`Frequent night-time transactions (${nightTxRate.toFixed(1)}%)`);
        if (highValueRate > 15) signals.push(`Unusual high-value transaction frequency (${highValueRate.toFixed(1)}%)`);
        if (repeatPatternScore > 20) signals.push(`Many repeated payment patterns`);
        if (velocityScore > 50) signals.push(`Spending velocity spike in last 7 days`);
        if (recipientRiskScore > 60) signals.push(`Low recipient diversity (concentrated payments)`);

        // ── 30-day trend ─────────────────────────────────────────────────────
        const trendMap = {};
        txList.forEach((tx) => {
          if (!tx.createdAt) return;
          const d = new Date(tx.createdAt.seconds * 1000);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (!trendMap[key]) trendMap[key] = { total: 0, fraud: 0 };
          trendMap[key].total++;
          if (tx.fraudVerdict === "FRAUD") trendMap[key].fraud++;
        });

        const trend = Object.entries(trendMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-30)
          .map(([date, { total: t, fraud: f }]) => ({
            date: date.slice(5), // MM-DD
            transactions: t,
            fraud: f,
          }));

        const riskLevel = overallScore > 70 ? "HIGH" : overallScore > 40 ? "MEDIUM" : "LOW";
        const assessment = generateAssessment(overallScore, signals);

        setProfile({
          overallScore,
          riskLevel,
          dimensions,
          signals,
          trend,
          assessment,
          stats: { total, fraudCount, uniqueRecipients, mean: mean.toFixed(2) },
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [upiId]);

  return { profile, loading, error };
}
