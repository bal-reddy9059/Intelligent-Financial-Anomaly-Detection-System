const CATEGORIES = ["Rent", "Utilities", "Groceries", "Entertainment", "Other"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"];

function getTxRisk(tx) {
  if (tx.fraudVerdict === "FRAUD") return "HIGH";
  if (tx.riskLevel) return tx.riskLevel;
  return "LOW";
}

function getTxCategory(tx) {
  if (!tx.remarks) return "Other";
  const r = tx.remarks.charAt(0).toUpperCase() + tx.remarks.slice(1);
  return CATEGORIES.includes(r) ? r : "Other";
}

// Returns cell color from count and max (blue intensity)
export function cellColor(count, maxCount) {
  if (maxCount === 0 || count === 0) return "rgba(59,130,246,0.05)";
  const intensity = count / maxCount;
  const alpha = 0.15 + intensity * 0.75;
  return `rgba(59,130,246,${alpha.toFixed(2)})`;
}

// Category × Risk matrix
export function processCategoryRiskMatrix(transactions) {
  const matrix = {};
  CATEGORIES.forEach((cat) => {
    matrix[cat] = {};
    RISK_LEVELS.forEach((r) => { matrix[cat][r] = 0; });
  });

  transactions.forEach((tx) => {
    const cat = getTxCategory(tx);
    const risk = getTxRisk(tx);
    if (matrix[cat] && RISK_LEVELS.includes(risk)) {
      matrix[cat][risk]++;
    }
  });

  return { categories: CATEGORIES, riskLevels: RISK_LEVELS, matrix };
}

// 24-hour fraud rate array
export function processHourlyFraudRate(transactions) {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${String(h).padStart(2, "0")}:00`,
    count: 0,
    fraudCount: 0,
  }));

  transactions.forEach((tx) => {
    if (!tx.createdAt) return;
    const h = new Date(tx.createdAt.seconds * 1000).getHours();
    hours[h].count++;
    if (tx.fraudVerdict === "FRAUD") hours[h].fraudCount++;
  });

  return hours.map((h) => {
    const fraudRate = h.count > 0 ? (h.fraudCount / h.count) * 100 : 0;
    return { ...h, fraudRate: Math.round(fraudRate), color: rateToColor(fraudRate) };
  });
}

function rateToColor(rate) {
  if (rate <= 0) return "#10b981";
  if (rate <= 25) return "#22c55e";
  if (rate <= 50) return "#f59e0b";
  if (rate <= 75) return "#f97316";
  return "#ef4444";
}

// Ranked riskiest categories
export function getRiskiestCategories(transactions) {
  const stats = {};
  CATEGORIES.forEach((c) => { stats[c] = { total: 0, fraudCount: 0 }; });

  transactions.forEach((tx) => {
    const cat = getTxCategory(tx);
    if (!stats[cat]) return;
    stats[cat].total++;
    if (tx.fraudVerdict === "FRAUD") stats[cat].fraudCount++;
  });

  return Object.entries(stats)
    .map(([category, { total, fraudCount }]) => ({
      category,
      total,
      fraudCount,
      fraudRate: total > 0 ? Math.round((fraudCount / total) * 100) : 0,
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.fraudRate - a.fraudRate);
}

// Find the 3-hour rolling window with the highest avg fraud rate
export function getPeakRiskWindow(hourlyData) {
  let best = { startHour: 0, avgRate: 0 };
  for (let i = 0; i <= 21; i++) {
    const window = hourlyData.slice(i, i + 3);
    const total = window.reduce((s, h) => s + h.count, 0);
    const fraud = window.reduce((s, h) => s + h.fraudCount, 0);
    const avg = total > 0 ? (fraud / total) * 100 : 0;
    if (avg > best.avgRate) best = { startHour: i, avgRate: Math.round(avg), endHour: i + 2 };
  }
  return best;
}
