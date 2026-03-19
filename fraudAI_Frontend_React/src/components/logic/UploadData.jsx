import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect } from "react";
import { auth } from "./firebase";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import MLWorkflowStepper from "./MLWorkflowStepper";
import {
  Upload, CheckCircle, AlertCircle, FileText, ChevronRight,
  ShieldCheck, AlertTriangle, Lightbulb, Star, TrendingUp
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const SEVERITY_STYLE = {
  high:   "bg-red-500/15 border-red-500/30 text-red-300",
  medium: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300",
  low:    "bg-blue-500/15 border-blue-500/30 text-blue-300",
};
const SEVERITY_ICON = { high: AlertCircle, medium: AlertTriangle, low: Lightbulb };

function QualityGrade({ score, grade }) {
  const color = grade === "A" ? "#10b981" : grade === "B" ? "#3b82f6" : grade === "C" ? "#f59e0b" : "#ef4444";
  const r = 28, cx = 36, cy = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-[72px] h-[72px]">
        <svg width="72" height="72">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#374151" strokeWidth="7" />
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={circ / 4}
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
          <text x={cx} y={cy + 5} textAnchor="middle" fill={color} fontSize="16" fontWeight="bold">{grade}</text>
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Data Quality</p>
        <p className="text-xs text-gray-400">Score: {score}/100</p>
        <p className="text-xs" style={{ color }}>
          {grade === "A" ? "Excellent — ready to train" :
           grade === "B" ? "Good — minor issues" :
           grade === "C" ? "Fair — review warnings" :
                           "Poor — fix issues first"}
        </p>
      </div>
    </div>
  );
}

export default function UploadData() {
  const [user, setUser] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const handleFile = async (file) => {
    if (!file || !file.name.endsWith(".csv")) {
      setError("Please upload a valid CSV file.");
      return;
    }
    setError("");
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await axios.post(`${API}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.error || "Upload failed. Is the Flask server running?");
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const quality = result?.ai_quality;

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-4xl mx-auto">
          <MLWorkflowStepper />
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold text-blue-400 mb-6"
          >
            Upload Transaction Data
          </motion.h1>

          {/* Drop zone */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragging ? "border-blue-400 bg-blue-400/10" : "border-gray-600 hover:border-blue-500"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={(e) => handleFile(e.target.files[0])} />
            <Upload className="mx-auto h-12 w-12 text-blue-400 mb-4" />
            <p className="text-lg text-gray-300 mb-1">Drag & drop your CSV file here</p>
            <p className="text-sm text-gray-500">or click to browse</p>
            <p className="text-xs text-gray-600 mt-2">
              Supports any CSV with numeric features. Optional fraud label: isFraud, is_fraud, fraud, label, Class
            </p>
          </motion.div>

          {loading && (
            <div className="mt-6 flex flex-col items-center gap-3 py-4">
              <div className="h-8 w-8 border-3 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              <p className="text-blue-400 text-sm animate-pulse">Analysing dataset with AI quality checks…</p>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-6 space-y-4"
              >
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total Rows",      value: result.total_rows,                   color: "blue"   },
                    { label: "After Cleaning",  value: result.cleaned_rows,                 color: "green"  },
                    { label: "Removed Rows",    value: result.removed_rows,                 color: "yellow" },
                    { label: "Features Found",  value: result.feature_columns?.length ?? 0, color: "purple" },
                  ].map((item, i) => (
                    <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                      <Card className="bg-gray-800 border-gray-700">
                        <CardContent className="pt-4 pb-3">
                          <p className="text-xs text-gray-400">{item.label}</p>
                          <p className={`text-2xl font-bold text-${item.color}-400`}>{item.value}</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                {/* AI Data Quality Card */}
                {quality && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Card className="bg-gray-800 border-gray-700">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-blue-400 flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" /> AI Data Quality Report
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <QualityGrade score={quality.score} grade={quality.grade} />

                        {/* Issues */}
                        {quality.issues?.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Issues Detected</p>
                            {quality.issues.map((issue, i) => {
                              const Icon = SEVERITY_ICON[issue.severity] ?? AlertCircle;
                              return (
                                <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs ${SEVERITY_STYLE[issue.severity]}`}>
                                  <Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                  <span>{issue.message}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Recommendations */}
                        {quality.recommendations?.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                              <TrendingUp className="h-3 w-3" /> AI Recommendations
                            </p>
                            {quality.recommendations.map((rec, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                                <Star className="h-3 w-3 text-yellow-400 flex-shrink-0 mt-0.5" />
                                {rec}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Dataset Info */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-400 flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Dataset Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Label column</span>
                      <span className={result.label_column ? "text-green-400" : "text-yellow-400"}>
                        {result.label_column ?? "Not detected (unsupervised mode)"}
                      </span>
                    </div>
                    {result.label_column && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Fraud transactions</span>
                        <span className="text-red-400">
                          {result.fraud_count} ({result.fraud_rate}%)
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-400">Feature columns</span>
                      <span className="text-blue-400 text-right max-w-[60%] truncate">{result.feature_columns?.join(", ")}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Preview table */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-400">Data Preview (first 5 rows)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            {result.columns?.map((col) => (
                              <th key={col} className="text-left text-gray-400 pb-2 pr-4 whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.preview?.map((row, i) => (
                            <tr key={i} className="border-t border-gray-700">
                              {result.columns?.map((col) => (
                                <td key={col} className="py-1 pr-4 text-gray-300 whitespace-nowrap">
                                  {row[col] !== undefined ? String(row[col]).slice(0, 15) : "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-between items-center pt-2">
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-sm">Upload successful! Proceed to explore your data.</span>
                  </div>
                  <Button onClick={() => navigate("/explore-data")}
                    className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1">
                    Explore Data <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
