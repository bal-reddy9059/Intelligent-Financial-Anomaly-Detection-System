import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import MLWorkflowStepper from "./MLWorkflowStepper";
import { Play, ChevronRight, AlertCircle, CheckCircle, Settings, Zap, Target, Brain } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Preset configurations
const PRESETS = [
  {
    key: "quick",
    label: "Quick Scan",
    icon: Zap,
    color: "text-yellow-400",
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/10",
    desc: "Fast result, good for initial exploration",
    models: { isolation_forest: true, autoencoder: false },
    params: { ifContamination: 0.05, ifEstimators: 50, aeEpochs: 10, aeEncDim: 8, aeThresholdPct: 95 },
  },
  {
    key: "balanced",
    label: "Balanced",
    icon: Target,
    color: "text-blue-400",
    border: "border-blue-500/40",
    bg: "bg-blue-500/10",
    desc: "Good precision/recall trade-off",
    models: { isolation_forest: true, autoencoder: false },
    params: { ifContamination: 0.05, ifEstimators: 100, aeEpochs: 30, aeEncDim: 8, aeThresholdPct: 95 },
  },
  {
    key: "precision",
    label: "Precision Mode",
    icon: Target,
    color: "text-green-400",
    border: "border-green-500/40",
    bg: "bg-green-500/10",
    desc: "Fewer false positives, strict threshold",
    models: { isolation_forest: true, autoencoder: false },
    params: { ifContamination: 0.02, ifEstimators: 200, aeEpochs: 30, aeEncDim: 8, aeThresholdPct: 97 },
  },
  {
    key: "deep",
    label: "Deep Analysis",
    icon: Brain,
    color: "text-purple-400",
    border: "border-purple-500/40",
    bg: "bg-purple-500/10",
    desc: "Both models — highest accuracy (~2 min)",
    models: { isolation_forest: true, autoencoder: true },
    params: { ifContamination: 0.05, ifEstimators: 150, aeEpochs: 50, aeEncDim: 16, aeThresholdPct: 95 },
  },
];

function Slider({ label, min, max, step, value, onChange, format }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="text-blue-400 font-mono">{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none bg-gray-700 accent-blue-500" />
      <div className="flex justify-between text-xs text-gray-600">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

export default function RunDetection() {
  const [user, setUser] = useState(null);
  const [models, setModels] = useState({ isolation_forest: true, autoencoder: false });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [dataReady, setDataReady] = useState(null);
  const [activePreset, setActivePreset] = useState("balanced");
  const [narrative, setNarrative] = useState("");
  const navigate = useNavigate();

  const [ifContamination, setIfContamination] = useState(0.05);
  const [ifEstimators, setIfEstimators] = useState(100);
  const [aeEpochs, setAeEpochs] = useState(30);
  const [aeEncDim, setAeEncDim] = useState(8);
  const [aeThresholdPct, setAeThresholdPct] = useState(95);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    axios.get(`${API}/features`)
      .then(() => setDataReady(true))
      .catch(() => setDataReady(false));
  }, []);

  const applyPreset = (preset) => {
    setActivePreset(preset.key);
    setModels(preset.models);
    setIfContamination(preset.params.ifContamination);
    setIfEstimators(preset.params.ifEstimators);
    setAeEpochs(preset.params.aeEpochs);
    setAeEncDim(preset.params.aeEncDim);
    setAeThresholdPct(preset.params.aeThresholdPct);
  };

  const selectedModels = Object.entries(models).filter(([, v]) => v).map(([k]) => k);

  const handleRun = async () => {
    if (!selectedModels.length) { setError("Select at least one model."); return; }
    setError("");
    setLoading(true);
    setDone(false);
    setNarrative("");
    try {
      const res = await axios.post(`${API}/detect`, {
        models: selectedModels,
        if_contamination: ifContamination,
        if_n_estimators: ifEstimators,
        ae_epochs: aeEpochs,
        ae_encoding_dim: aeEncDim,
        ae_threshold_percentile: aeThresholdPct,
      });
      if (res.data.ai_narrative) setNarrative(res.data.ai_narrative);
      setDone(true);
    } catch (e) {
      setError(e.response?.data?.error || "Detection failed. Have you uploaded a CSV?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-3xl mx-auto">
          <MLWorkflowStepper />
          <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold text-blue-400 mb-6">
            Run Anomaly Detection
          </motion.h1>

          {dataReady === false && (
            <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 text-yellow-300 text-sm">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                No dataset loaded. Upload a CSV file before running detection.
              </div>
              <Button size="sm" onClick={() => navigate("/upload-data")}
                className="bg-yellow-600 hover:bg-yellow-700 text-white ml-4 shrink-0">
                Upload CSV
              </Button>
            </div>
          )}

          {/* AI Preset Configurations */}
          <Card className="bg-gray-800 border-gray-700 mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-blue-400 flex items-center gap-2">
                <Brain className="h-4 w-4" /> AI Preset Configurations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  const isActive = activePreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => applyPreset(preset)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        isActive ? `${preset.border} ${preset.bg}` : "border-gray-700 hover:border-gray-600"
                      }`}
                    >
                      <Icon className={`h-4 w-4 mb-1 ${isActive ? preset.color : "text-gray-500"}`} />
                      <p className={`text-xs font-semibold ${isActive ? preset.color : "text-gray-400"}`}>{preset.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-tight">{preset.desc}</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Model selection */}
          <Card className="bg-gray-800 border-gray-700 mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-gray-300">Select Models</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  key: "isolation_forest",
                  label: "Isolation Forest",
                  desc: "Tree-based anomaly detection. Fast, works well on tabular data. Recommended for most datasets.",
                  badge: "Recommended",
                  badgeColor: "bg-blue-500/20 text-blue-300",
                },
                {
                  key: "autoencoder",
                  label: "Autoencoder (Neural Network)",
                  desc: "Learns normal patterns and flags high reconstruction error. Best for large datasets (>5k rows). Requires TensorFlow.",
                  badge: "Deep Learning",
                  badgeColor: "bg-purple-500/20 text-purple-300",
                },
              ].map((m) => (
                <label key={m.key}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    models[m.key] ? "border-blue-500 bg-blue-500/10" : "border-gray-700 hover:border-gray-600"
                  }`}>
                  <input type="checkbox" checked={models[m.key]}
                    onChange={(e) => setModels((prev) => ({ ...prev, [m.key]: e.target.checked }))}
                    className="mt-1 accent-blue-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-white">{m.label}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${m.badgeColor}`}>{m.badge}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Isolation Forest params */}
          <AnimatePresence>
            {models.isolation_forest && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <Card className="bg-gray-800 border-gray-700 mb-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-blue-400 flex items-center gap-2">
                      <Settings className="h-4 w-4" /> Isolation Forest Parameters
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <Slider label="Contamination (expected fraud %)" min={0.01} max={0.5} step={0.01}
                      value={ifContamination} onChange={setIfContamination} format={(v) => `${(v * 100).toFixed(0)}%`} />
                    <p className="text-xs text-gray-500">
                      💡 Set this close to your actual fraud rate. Too high → more false positives. Too low → misses fraud.
                    </p>
                    <Slider label="Number of Estimators (trees)" min={10} max={300} step={10}
                      value={ifEstimators} onChange={setIfEstimators} />
                    <p className="text-xs text-gray-500">
                      💡 More trees = better accuracy but slower. 100 is usually optimal.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Autoencoder params */}
          <AnimatePresence>
            {models.autoencoder && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <Card className="bg-gray-800 border-gray-700 mb-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-purple-400 flex items-center gap-2">
                      <Settings className="h-4 w-4" /> Autoencoder Parameters
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <Slider label="Training Epochs" min={5} max={100} step={5} value={aeEpochs} onChange={setAeEpochs} />
                    <p className="text-xs text-gray-500">💡 More epochs = better model, longer training. 30 epochs is a good starting point.</p>
                    <Slider label="Encoding Dimension (bottleneck size)" min={2} max={32} step={2} value={aeEncDim} onChange={setAeEncDim} />
                    <p className="text-xs text-gray-500">💡 Smaller = forces more compression. Start with 8; increase if reconstruction error is too high.</p>
                    <Slider label="Anomaly Threshold Percentile" min={80} max={99} step={1}
                      value={aeThresholdPct} onChange={setAeThresholdPct} format={(v) => `${v}th`} />
                    <p className="text-xs text-gray-500">💡 95th means top 5% of errors are flagged. Raise to reduce false positives.</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}

          {/* AI Narrative after detection */}
          <AnimatePresence>
            {done && narrative && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-4 flex items-start gap-3">
                <Brain className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-blue-400 mb-1">AI Detection Summary</p>
                  <p className="text-sm text-gray-300">{narrative}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {done && (
            <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm">Detection complete! View your results.</span>
              </div>
              <Button onClick={() => navigate("/detection-results")}
                className="bg-green-600 hover:bg-green-700 flex items-center gap-1 text-sm">
                View Results <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <Button onClick={handleRun} disabled={loading || !selectedModels.length || dataReady === false}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 h-12 text-base">
            {loading ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {models.autoencoder ? "Training neural network… (may take 30s–2min)" : "Running detection…"}
              </>
            ) : (
              <><Play className="h-5 w-5" /> Train & Detect</>
            )}
          </Button>

          <div className="flex justify-between text-xs text-gray-600 mt-2 px-1">
            <span>Isolation Forest: ~seconds</span>
            <span>Autoencoder: ~30s–2min</span>
          </div>
        </div>
      </div>
    </div>
  );
}
