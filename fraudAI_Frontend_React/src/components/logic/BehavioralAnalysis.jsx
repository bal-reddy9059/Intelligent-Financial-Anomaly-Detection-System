import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import {
  Zap, DollarSign, TrendingUp, ShieldAlert, Tag, MapPin, Smartphone,
  Users, CheckCircle
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const ACTION_STYLE = {
  BLOCK: "bg-red-500/20 text-red-400 border-red-500/30",
  REVIEW: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  APPROVE: "bg-green-500/20 text-green-400 border-green-500/30",
};
const RISK_COLOR = { CRITICAL: "text-red-500", HIGH: "text-red-400", MEDIUM: "text-yellow-400", LOW: "text-green-400" };

function ResultBadge({ action }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ACTION_STYLE[action] || "bg-gray-700 text-gray-400 border-gray-600"}`}>
      {action}
    </span>
  );
}

function AiSummary({ text }) {
  if (!text) return null;
  return <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-700 pt-3 mt-3">{text}</p>;
}

// ── VELOCITY CHECK ────────────────────────────────────────────────
function VelocityCheck() {
  const [form, setForm] = useState({ user_id: "", amount: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.user_id || !form.amount) { setError("User ID and amount are required."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await axios.post(`${API}/velocity-check`, { user_id: form.user_id, amount: parseFloat(form.amount), record: true });
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed."); }
    finally { setLoading(false); }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-yellow-400"><Zap className="h-4 w-4" /> Velocity Check</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-gray-400 block mb-1">User ID</label>
            <Input value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} placeholder="user123" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Amount (₹)</label>
            <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="5000" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <Button onClick={submit} disabled={loading} size="sm" className="bg-yellow-600 hover:bg-yellow-700 w-full">
          {loading ? "Checking…" : "Check Velocity"}
        </Button>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pt-2 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className={`font-bold ${RISK_COLOR[result.velocity_risk]}`}>{result.velocity_risk} RISK</span>
              <ResultBadge action={result.recommended_action} />
            </div>
            <div className="flex gap-2 text-xs text-gray-400">
              <span>{result.is_burst_detected ? "⚡ Burst detected" : "No burst"}</span>
              <span>·</span>
              <span>{result.is_escalating_amounts ? "📈 Escalating amounts" : "Normal amounts"}</span>
            </div>
            {result.risk_signals?.length > 0 && (
              <ul className="space-y-1">{result.risk_signals.map((s, i) => <li key={i} className="text-xs text-yellow-400">▲ {s}</li>)}</ul>
            )}
            {result.window_analysis?.filter(w => w.count_exceeded || w.amount_exceeded).map((w, i) => (
              <div key={i} className="text-xs bg-red-500/10 border border-red-500/20 rounded p-2">
                <span className="text-red-400">{w.window}: </span>
                <span className="text-gray-300">{w.transaction_count} txns, ₹{w.total_amount?.toFixed(0)}</span>
              </div>
            ))}
            <AiSummary text={result.ai_summary} />
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

// ── AMOUNT PATTERN ─────────────────────────────────────────────────
function AmountPattern() {
  const [form, setForm] = useState({ amount: "", user_id: "", user_avg_amount: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.amount) { setError("Amount is required."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const body = { amount: parseFloat(form.amount) };
      if (form.user_id) body.user_id = form.user_id;
      if (form.user_avg_amount) body.user_avg_amount = parseFloat(form.user_avg_amount);
      const res = await axios.post(`${API}/amount-pattern`, body);
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed."); }
    finally { setLoading(false); }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-blue-400"><DollarSign className="h-4 w-4" /> Amount Pattern</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div><label className="text-xs text-gray-400 block mb-1">Amount (₹) *</label>
            <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="9999" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">User ID</label>
            <Input value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} placeholder="optional" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Avg Amount</label>
            <Input type="number" value={form.user_avg_amount} onChange={e => setForm(f => ({ ...f, user_avg_amount: e.target.value }))} placeholder="optional" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <Button onClick={submit} disabled={loading} size="sm" className="bg-blue-600 hover:bg-blue-700 w-full">
          {loading ? "Checking…" : "Analyse Amount"}
        </Button>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pt-2 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className={`font-bold ${RISK_COLOR[result.risk_level]}`}>Risk Score: {result.risk_score}/100</span>
              <ResultBadge action={result.recommended_action} />
            </div>
            {result.patterns_detected?.map((p, i) => (
              <div key={i} className={`text-xs rounded p-2 ${p.severity === "HIGH" ? "bg-red-500/10 border border-red-500/20 text-red-300" : "bg-yellow-500/10 border border-yellow-500/20 text-yellow-300"}`}>
                <span className="font-medium">{p.pattern}:</span> {p.detail}
              </div>
            ))}
            <AiSummary text={result.ai_summary} />
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

// ── SPENDING PATTERN ───────────────────────────────────────────────
function SpendingPattern() {
  const [mode, setMode] = useState("check");
  const [form, setForm] = useState({ user_id: "", amount: "", category: "groceries", hour: "12" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const CATEGORIES = ["groceries", "rent", "utilities", "entertainment", "transfer", "investment", "other"];

  const submit = async () => {
    if (!form.user_id) { setError("User ID is required."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const body = { mode, user_id: form.user_id, amount: parseFloat(form.amount || 0), category: form.category, hour: parseInt(form.hour || 0) };
      const res = await axios.post(`${API}/spending-pattern`, body);
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed."); }
    finally { setLoading(false); }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-purple-400"><TrendingUp className="h-4 w-4" /> Spending Pattern</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {["check", "register"].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${mode === m ? "bg-purple-600 border-purple-500 text-white" : "border-gray-600 text-gray-400"}`}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-gray-400 block mb-1">User ID *</label>
            <Input value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} placeholder="user123" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Amount (₹)</label>
            <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="2000" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-md px-2 py-1.5">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="text-xs text-gray-400 block mb-1">Hour (0-23)</label>
            <Input type="number" min="0" max="23" value={form.hour} onChange={e => setForm(f => ({ ...f, hour: e.target.value }))} className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <Button onClick={submit} disabled={loading} size="sm" className="bg-purple-600 hover:bg-purple-700 w-full">
          {loading ? "Processing…" : mode === "check" ? "Check Pattern" : "Register Baseline"}
        </Button>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pt-2 border-t border-gray-700">
            {result.mode === "check" ? (
              <>
                <div className="flex items-center justify-between">
                  <span className={`font-bold ${RISK_COLOR[result.risk_level]}`}>Deviation: {result.deviation_score}/100</span>
                  <ResultBadge action={result.recommended_action} />
                </div>
                {result.deviations?.map((d, i) => (
                  <div key={i} className="text-xs bg-yellow-500/10 border border-yellow-500/20 rounded p-2 text-yellow-300">
                    {d.type}: {d.detail} (z={d.z_score?.toFixed(2)})
                  </div>
                ))}
              </>
            ) : (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="h-4 w-4" /> Baseline registered for {result.user_id}
              </div>
            )}
            <AiSummary text={result.ai_summary} />
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

// ── ACCOUNT TAKEOVER ───────────────────────────────────────────────
function AccountTakeover() {
  const [form, setForm] = useState({
    user_id: "", is_new_device: false, is_new_location: false,
    device_trust_score: "0.8", location_change_km: "0", time_since_last_login_hrs: "1",
    amount: "1000", is_high_risk_time: false, failed_auth_attempts: "0",
    profile_change_recent: false, vpn_detected: false,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.user_id) { setError("User ID is required."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const body = {
        ...form, device_trust_score: parseFloat(form.device_trust_score),
        location_change_km: parseFloat(form.location_change_km),
        time_since_last_login_hrs: parseFloat(form.time_since_last_login_hrs),
        amount: parseFloat(form.amount),
        failed_auth_attempts: parseInt(form.failed_auth_attempts),
      };
      const res = await axios.post(`${API}/account-takeover`, body);
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed."); }
    finally { setLoading(false); }
  };

  const toggle = (field) => setForm(f => ({ ...f, [field]: !f[field] }));

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-red-400"><ShieldAlert className="h-4 w-4" /> Account Takeover</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-gray-400 block mb-1">User ID *</label>
            <Input value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} placeholder="user123" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Amount (₹)</label>
            <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Device Trust (0-1)</label>
            <Input type="number" step="0.1" min="0" max="1" value={form.device_trust_score} onChange={e => setForm(f => ({ ...f, device_trust_score: e.target.value }))} className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Distance (km)</label>
            <Input type="number" value={form.location_change_km} onChange={e => setForm(f => ({ ...f, location_change_km: e.target.value }))} className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Hrs since login</label>
            <Input type="number" value={form.time_since_last_login_hrs} onChange={e => setForm(f => ({ ...f, time_since_last_login_hrs: e.target.value }))} className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Failed Auth Attempts</label>
            <Input type="number" value={form.failed_auth_attempts} onChange={e => setForm(f => ({ ...f, failed_auth_attempts: e.target.value }))} className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { field: "is_new_device", label: "New Device" },
            { field: "is_new_location", label: "New Location" },
            { field: "is_high_risk_time", label: "High-Risk Time" },
            { field: "vpn_detected", label: "VPN" },
            { field: "profile_change_recent", label: "Profile Changed" },
          ].map(({ field, label }) => (
            <button key={field} onClick={() => toggle(field)}
              className={`text-xs py-1.5 rounded border transition-colors ${form[field] ? "bg-red-600 border-red-500 text-white" : "border-gray-600 text-gray-400"}`}>
              {label}: {form[field] ? "Yes" : "No"}
            </button>
          ))}
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <Button onClick={submit} disabled={loading} size="sm" className="bg-red-600 hover:bg-red-700 w-full">
          {loading ? "Analysing…" : "Detect Takeover Risk"}
        </Button>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pt-2 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className={`font-bold ${RISK_COLOR[result.risk_level]}`}>ATO Score: {result.ato_risk_score}/100</span>
              <ResultBadge action={result.recommended_action} />
            </div>
            {result.signals_detected?.map((s, i) => (
              <div key={i} className="text-xs bg-red-500/10 border border-red-500/20 rounded p-2">
                <span className="text-red-400 font-medium">{s.signal}</span>
                <span className="text-gray-400"> (+{s.weight}pts): </span>
                <span className="text-gray-300">{s.detail}</span>
              </div>
            ))}
            <AiSummary text={result.ai_summary} />
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

// ── TRANSACTION PURPOSE ────────────────────────────────────────────
function TransactionPurpose() {
  const [form, setForm] = useState({ amount: "", hour: "12", is_merchant: false });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.amount) { setError("Amount is required."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await axios.post(`${API}/transaction-purpose`, {
        amount: parseFloat(form.amount), hour: parseInt(form.hour), is_merchant: form.is_merchant,
      });
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed."); }
    finally { setLoading(false); }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-cyan-400"><Tag className="h-4 w-4" /> Transaction Purpose</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-gray-400 block mb-1">Amount (₹) *</label>
            <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="5000" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Hour (0-23)</label>
            <Input type="number" min="0" max="23" value={form.hour} onChange={e => setForm(f => ({ ...f, hour: e.target.value }))} className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
        </div>
        <button onClick={() => setForm(f => ({ ...f, is_merchant: !f.is_merchant }))}
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${form.is_merchant ? "bg-cyan-600 border-cyan-500 text-white" : "border-gray-600 text-gray-400"}`}>
          Merchant Payment: {form.is_merchant ? "Yes" : "No"}
        </button>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <Button onClick={submit} disabled={loading} size="sm" className="bg-cyan-600 hover:bg-cyan-700 w-full">
          {loading ? "Classifying…" : "Classify Purpose"}
        </Button>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pt-2 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-400">{result.predicted_purpose?.replace(/_/g, " ")}</span>
              <ResultBadge action={result.recommended_action} />
            </div>
            <div className="flex gap-2 text-xs">
              <span className="text-gray-400">Confidence: <span className="text-white">{result.confidence}</span></span>
              {result.is_suspicious && <span className="text-red-400">⚠ SUSPICIOUS</span>}
            </div>
            <p className="text-xs text-gray-400">{result.description}</p>
            <AiSummary text={result.ai_summary} />
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

// ── GEO VELOCITY ───────────────────────────────────────────────────
function GeoVelocity() {
  const [form, setForm] = useState({ user_id: "", lat: "", lon: "", city: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.user_id) { setError("User ID is required."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const body = { user_id: form.user_id, record: true };
      if (form.lat) body.lat = parseFloat(form.lat);
      if (form.lon) body.lon = parseFloat(form.lon);
      if (form.city) body.city = form.city;
      const res = await axios.post(`${API}/geo-velocity`, body);
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed."); }
    finally { setLoading(false); }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-green-400"><MapPin className="h-4 w-4" /> Geo Velocity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-gray-400 block mb-1">User ID *</label>
            <Input value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} placeholder="user123" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">City</label>
            <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Mumbai" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Latitude</label>
            <Input type="number" value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="19.076" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Longitude</label>
            <Input type="number" value={form.lon} onChange={e => setForm(f => ({ ...f, lon: e.target.value }))} placeholder="72.877" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <Button onClick={submit} disabled={loading} size="sm" className="bg-green-600 hover:bg-green-700 w-full">
          {loading ? "Checking…" : "Check Geo Velocity"}
        </Button>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pt-2 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className={`font-bold ${RISK_COLOR[result.geo_risk_level]}`}>{result.geo_risk_level} GEO RISK</span>
              <ResultBadge action={result.recommended_action} />
            </div>
            {result.impossible_travel && (
              <div className="text-xs bg-red-500/10 border border-red-500/20 rounded p-2 text-red-400">
                ⚡ Impossible travel! {result.distance_km?.toFixed(0)} km in {result.elapsed_minutes?.toFixed(0)} min
                ({result.speed_kmh?.toFixed(0)} km/h)
              </div>
            )}
            <AiSummary text={result.ai_summary} />
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

// ── DEVICE RISK ────────────────────────────────────────────────────
function DeviceRisk() {
  const [form, setForm] = useState({
    device_id: "", is_rooted: false, is_emulator: false, is_new_device: false,
    days_since_app_install: "30", is_screen_sharing_active: false,
    accessibility_services_active: false, unknown_sources_enabled: false,
    is_vpn_active: false, sim_changed_recently: false, multiple_accounts_on_device: false,
    failed_biometric_attempts: "0", app_version: "3.1.0", expected_app_version: "3.1.0",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.device_id) { setError("Device ID is required."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const body = { ...form, days_since_app_install: parseInt(form.days_since_app_install), failed_biometric_attempts: parseInt(form.failed_biometric_attempts) };
      const res = await axios.post(`${API}/device-risk`, body);
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed."); }
    finally { setLoading(false); }
  };

  const toggle = (field) => setForm(f => ({ ...f, [field]: !f[field] }));
  const boolFields = [
    "is_rooted", "is_emulator", "is_new_device", "is_screen_sharing_active",
    "accessibility_services_active", "unknown_sources_enabled", "is_vpn_active",
    "sim_changed_recently", "multiple_accounts_on_device",
  ];

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-orange-400"><Smartphone className="h-4 w-4" /> Device Risk</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-gray-400 block mb-1">Device ID *</label>
            <Input value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))} placeholder="dev_abc123" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Days Since Install</label>
            <Input type="number" value={form.days_since_app_install} onChange={e => setForm(f => ({ ...f, days_since_app_install: e.target.value }))} className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {boolFields.map(field => (
            <button key={field} onClick={() => toggle(field)}
              className={`text-xs py-1 rounded border transition-colors truncate ${form[field] ? "bg-orange-600 border-orange-500 text-white" : "border-gray-600 text-gray-400"}`}>
              {field.replace("is_", "").replace(/_/g, " ")}
            </button>
          ))}
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <Button onClick={submit} disabled={loading} size="sm" className="bg-orange-600 hover:bg-orange-700 w-full">
          {loading ? "Assessing…" : "Assess Device Risk"}
        </Button>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pt-2 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className={`font-bold ${RISK_COLOR[result.risk_level]}`}>Trust: {result.device_trust_score}/100 (Grade {result.trust_grade})</span>
              <ResultBadge action={result.recommended_action} />
            </div>
            {result.risk_flags?.map((f, i) => (
              <div key={i} className="text-xs bg-red-500/10 border border-red-500/20 rounded p-2">
                <span className="text-red-400 font-medium">{f.flag}</span>
                <span className="text-gray-400"> (-{f.points_deducted}pts): </span>
                <span className="text-gray-300">{f.detail}</span>
              </div>
            ))}
            <AiSummary text={result.ai_summary} />
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

// ── RECIPIENT TRUST ────────────────────────────────────────────────
function RecipientTrust() {
  const [form, setForm] = useState({
    recipient_upi: "", recipient_blacklist_status: "0",
    recipient_verification: "unknown", fraud_complaints_against: "0",
    account_age_days: "365", past_successful_txns_with_user: "0", is_first_time_recipient: true,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.recipient_upi) { setError("Recipient UPI is required."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const body = {
        ...form,
        recipient_blacklist_status: parseInt(form.recipient_blacklist_status),
        fraud_complaints_against: parseInt(form.fraud_complaints_against),
        account_age_days: parseInt(form.account_age_days),
        past_successful_txns_with_user: parseInt(form.past_successful_txns_with_user),
      };
      const res = await axios.post(`${API}/recipient-trust`, body);
      setResult(res.data);
    } catch (e) { setError(e.response?.data?.error || "Failed."); }
    finally { setLoading(false); }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-indigo-400"><Users className="h-4 w-4" /> Recipient Trust</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-gray-400 block mb-1">Recipient UPI *</label>
            <Input value={form.recipient_upi} onChange={e => setForm(f => ({ ...f, recipient_upi: e.target.value }))} placeholder="john123@yesbank" className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Verification</label>
            <select value={form.recipient_verification} onChange={e => setForm(f => ({ ...f, recipient_verification: e.target.value }))}
              className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-md px-2 py-1.5">
              {["verified", "suspicious", "unknown"].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div><label className="text-xs text-gray-400 block mb-1">Fraud Complaints</label>
            <Input type="number" value={form.fraud_complaints_against} onChange={e => setForm(f => ({ ...f, fraud_complaints_against: e.target.value }))} className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Account Age (days)</label>
            <Input type="number" value={form.account_age_days} onChange={e => setForm(f => ({ ...f, account_age_days: e.target.value }))} className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div><label className="text-xs text-gray-400 block mb-1">Past Txns Together</label>
            <Input type="number" value={form.past_successful_txns_with_user} onChange={e => setForm(f => ({ ...f, past_successful_txns_with_user: e.target.value }))} className="bg-gray-700 border-gray-600 text-white text-sm" /></div>
          <div className="flex items-end">
            <div className="flex gap-2 w-full">
              {[["0", "Not Blacklisted"], ["1", "Blacklisted"]].map(([v, l]) => (
                <button key={v} onClick={() => setForm(f => ({ ...f, recipient_blacklist_status: v }))}
                  className={`flex-1 text-xs py-1.5 rounded border transition-colors ${form.recipient_blacklist_status === v ? (v === "1" ? "bg-red-600 border-red-500 text-white" : "bg-green-600 border-green-500 text-white") : "border-gray-600 text-gray-400"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button onClick={() => setForm(f => ({ ...f, is_first_time_recipient: !f.is_first_time_recipient }))}
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${form.is_first_time_recipient ? "bg-yellow-600 border-yellow-500 text-white" : "border-gray-600 text-gray-400"}`}>
          First Time: {form.is_first_time_recipient ? "Yes" : "No"}
        </button>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <Button onClick={submit} disabled={loading} size="sm" className="bg-indigo-600 hover:bg-indigo-700 w-full">
          {loading ? "Evaluating…" : "Evaluate Recipient"}
        </Button>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pt-2 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className={`font-bold ${RISK_COLOR[result.risk_level]}`}>Trust: {result.trust_score}/100 (Grade {result.trust_grade})</span>
              <ResultBadge action={result.recommended_action} />
            </div>
            {result.risk_flags?.map((f, i) => (
              <div key={i} className="text-xs bg-red-500/10 border border-red-500/20 rounded p-2">
                <span className="text-red-400 font-medium">{f.flag}: </span>
                <span className="text-gray-300">{f.detail}</span>
              </div>
            ))}
            {result.positive_signals?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {result.positive_signals.map((s, i) => <span key={i} className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">{s}</span>)}
              </div>
            )}
            <AiSummary text={result.ai_summary} />
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

// ── MAIN PAGE ──────────────────────────────────────────────────────
const SECTIONS = [
  { id: "velocity", label: "Velocity Check", icon: Zap, color: "text-yellow-400" },
  { id: "amount", label: "Amount Pattern", icon: DollarSign, color: "text-blue-400" },
  { id: "spending", label: "Spending Pattern", icon: TrendingUp, color: "text-purple-400" },
  { id: "ato", label: "Account Takeover", icon: ShieldAlert, color: "text-red-400" },
  { id: "purpose", label: "Transaction Purpose", icon: Tag, color: "text-cyan-400" },
  { id: "geo", label: "Geo Velocity", icon: MapPin, color: "text-green-400" },
  { id: "device", label: "Device Risk", icon: Smartphone, color: "text-orange-400" },
  { id: "recipient", label: "Recipient Trust", icon: Users, color: "text-indigo-400" },
];

export default function BehavioralAnalysis() {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState("velocity");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const PANELS = { velocity: <VelocityCheck />, amount: <AmountPattern />, spending: <SpendingPattern />, ato: <AccountTakeover />, purpose: <TransactionPurpose />, geo: <GeoVelocity />, device: <DeviceRisk />, recipient: <RecipientTrust /> };

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl font-bold text-blue-400 mb-1">Behavioral Analysis</h1>
            <p className="text-gray-400 text-sm mb-6">8 real-time behavioral fraud detection checks.</p>
          </motion.div>

          {/* Section tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {SECTIONS.map((s) => (
              <button key={s.id} onClick={() => setOpen(s.id)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  open === s.id ? "bg-gray-700 border-gray-500 text-white" : "border-gray-700 text-gray-400 hover:border-gray-500"
                }`}>
                <s.icon className={`h-3.5 w-3.5 ${open === s.id ? s.color : "text-gray-500"}`} />
                {s.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={open} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              {PANELS[open]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
