import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  Calculator, IndianRupee, Percent, Calendar,
  TrendingUp, RefreshCw, Download,
} from "lucide-react";

const PRESETS = [
  { label: "Home Loan", principal: 2500000, rate: 8.5, tenure: 240 },
  { label: "Car Loan",  principal: 800000,  rate: 9.0, tenure: 60  },
  { label: "Personal",  principal: 200000,  rate: 14,  tenure: 36  },
  { label: "Education", principal: 500000,  rate: 11,  tenure: 84  },
];

function calcEMI(principal, annualRate, tenureMonths) {
  if (!principal || !tenureMonths) return { emi: 0, total: 0, interest: 0, schedule: [] };
  if (annualRate === 0) {
    const emi = principal / tenureMonths;
    return {
      emi, total: principal, interest: 0,
      schedule: Array.from({ length: tenureMonths }, (_, i) => ({
        month: i + 1, emi, principal: emi, interest: 0, balance: Math.max(0, principal - emi * (i + 1)),
      })),
    };
  }
  const r = annualRate / 12 / 100;
  const emi = principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1);
  const total = emi * tenureMonths;
  const interest = total - principal;
  let balance = principal;
  const schedule = Array.from({ length: tenureMonths }, (_, i) => {
    const intPart = balance * r;
    const prinPart = emi - intPart;
    balance = Math.max(0, balance - prinPart);
    return { month: i + 1, emi: parseFloat(emi.toFixed(2)), principal: parseFloat(prinPart.toFixed(2)), interest: parseFloat(intPart.toFixed(2)), balance: parseFloat(balance.toFixed(2)) };
  });
  return { emi: parseFloat(emi.toFixed(2)), total: parseFloat(total.toFixed(2)), interest: parseFloat(interest.toFixed(2)), schedule };
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-gray-400 mb-1">Month {label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: ₹{p.value?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </p>
      ))}
    </div>
  );
};

export default function EMICalculator() {
  const [user, setUser] = useState(null);
  const [principal, setPrincipal] = useState("500000");
  const [rate, setRate]           = useState("10");
  const [tenure, setTenure]       = useState("60");
  const [showSchedule, setShowSchedule] = useState(false);

  useEffect(() => {
    onAuthStateChanged(auth, cu => { if (cu) setUser(cu); });
  }, []);

  const p = parseFloat(principal) || 0;
  const r = parseFloat(rate) || 0;
  const t = parseInt(tenure) || 0;
  const { emi, total, interest, schedule } = calcEMI(p, r, t);

  const chartData = schedule.filter((_, i) => i % Math.max(1, Math.floor(t / 24)) === 0).map(s => ({
    month: s.month, Principal: parseFloat(s.principal.toFixed(0)), Interest: parseFloat(s.interest.toFixed(0)), Balance: parseFloat(s.balance.toFixed(0)),
  }));

  const pieData = [
    { name: "Principal", value: p, color: "#3b82f6" },
    { name: "Interest", value: interest, color: "#f59e0b" },
  ];

  const applyPreset = (preset) => {
    setPrincipal(preset.principal.toString());
    setRate(preset.rate.toString());
    setTenure(preset.tenure.toString());
  };

  const interestPct = total > 0 ? ((interest / total) * 100).toFixed(1) : 0;

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />
        <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calculator className="h-6 w-6 text-cyan-400" /> EMI Calculator
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Calculate your monthly EMI, total interest, and full repayment schedule
            </p>
          </div>

          {/* Presets */}
          <div className="flex gap-2 flex-wrap mb-6">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="px-3 py-1.5 text-xs rounded-full border border-gray-700 text-gray-400 hover:border-cyan-500/50 hover:text-cyan-400 hover:bg-cyan-500/5 transition-colors">
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Inputs */}
            <div className="lg:col-span-1 space-y-4">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-3 border-b border-gray-700">
                  <h2 className="font-semibold text-white flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-cyan-400" /> Loan Details
                  </h2>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 flex items-center gap-1 mb-2">
                      <IndianRupee className="h-3 w-3" /> Loan Amount (₹)
                    </label>
                    <Input type="number" value={principal} onChange={e => setPrincipal(e.target.value)}
                      className="bg-gray-700 border-gray-600 text-white h-10 text-base" />
                    <input type="range" min="10000" max="10000000" step="10000"
                      value={principal} onChange={e => setPrincipal(e.target.value)}
                      className="w-full mt-2 accent-cyan-500" />
                    <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                      <span>₹10K</span><span>₹1Cr</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 flex items-center gap-1 mb-2">
                      <Percent className="h-3 w-3" /> Annual Interest Rate (%)
                    </label>
                    <Input type="number" step="0.1" value={rate} onChange={e => setRate(e.target.value)}
                      className="bg-gray-700 border-gray-600 text-white h-10 text-base" />
                    <input type="range" min="1" max="30" step="0.5"
                      value={rate} onChange={e => setRate(e.target.value)}
                      className="w-full mt-2 accent-cyan-500" />
                    <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                      <span>1%</span><span>30%</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 flex items-center gap-1 mb-2">
                      <Calendar className="h-3 w-3" /> Loan Tenure (months)
                    </label>
                    <Input type="number" value={tenure} onChange={e => setTenure(e.target.value)}
                      className="bg-gray-700 border-gray-600 text-white h-10 text-base" />
                    <input type="range" min="1" max="360" step="1"
                      value={tenure} onChange={e => setTenure(e.target.value)}
                      className="w-full mt-2 accent-cyan-500" />
                    <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                      <span>1 mo</span><span>30 yrs</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Results */}
            <div className="lg:col-span-2 space-y-4">
              {/* EMI Summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Monthly EMI", value: `₹${emi.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, color: "text-cyan-400" },
                  { label: "Total Interest", value: `₹${interest.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, color: "text-amber-400" },
                  { label: "Total Payment", value: `₹${total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, color: "text-white" },
                ].map(s => (
                  <Card key={s.label} className="bg-gray-800 border-gray-700">
                    <CardContent className="p-4">
                      <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pie + info */}
              <Card className="bg-gray-800 border-gray-700">
                <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-40 h-40 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={64}
                          dataKey="value" paddingAngle={3}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={v => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
                      <span className="text-sm text-gray-300">Principal: ₹{p.toLocaleString("en-IN")}</span>
                      <span className="text-xs text-gray-500 ml-auto">{(100 - interestPct)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500 flex-shrink-0" />
                      <span className="text-sm text-gray-300">Interest: ₹{interest.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                      <span className="text-xs text-gray-500 ml-auto">{interestPct}%</span>
                    </div>
                    <div className="pt-2 border-t border-gray-700">
                      <p className="text-xs text-gray-400">
                        For every ₹100 you borrow, you pay ₹{total > 0 ? ((total / p) * 100 - 100).toFixed(1) : "0"} extra as interest
                      </p>
                    </div>
                    <p className="text-xs text-gray-500">
                      Loan tenure: {t} months ({(t / 12).toFixed(1)} years)
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Balance chart */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader className="pb-3 border-b border-gray-700">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-400" /> Outstanding Balance Over Time
                  </h2>
                </CardHeader>
                <CardContent className="pt-4">
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="month" stroke="#6b7280" tick={{ fontSize: 10 }} label={{ value: "Month", position: "insideBottom", offset: -2, fill: "#6b7280", fontSize: 10 }} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="Balance" stroke="#06b6d4" fill="url(#balGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Amortization table toggle */}
              <div>
                <button onClick={() => setShowSchedule(p => !p)}
                  className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors mb-3">
                  <Calendar className="h-4 w-4" />
                  {showSchedule ? "Hide" : "View"} full amortization schedule ({t} months)
                </button>

                {showSchedule && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Card className="bg-gray-800 border-gray-700">
                      <CardContent className="p-0 overflow-hidden">
                        <div className="overflow-x-auto max-h-80">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-700/50 sticky top-0">
                              <tr>
                                {["Month", "EMI (₹)", "Principal (₹)", "Interest (₹)", "Balance (₹)"].map(h => (
                                  <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-300">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {schedule.map((row, i) => (
                                <tr key={i} className={`border-t border-gray-700/50 ${i % 2 === 0 ? "" : "bg-gray-800/30"}`}>
                                  <td className="px-4 py-2 text-gray-400">{row.month}</td>
                                  <td className="px-4 py-2 text-white font-medium">{row.emi.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                                  <td className="px-4 py-2 text-blue-400">{row.principal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                                  <td className="px-4 py-2 text-amber-400">{row.interest.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                                  <td className="px-4 py-2 text-gray-300">{row.balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
