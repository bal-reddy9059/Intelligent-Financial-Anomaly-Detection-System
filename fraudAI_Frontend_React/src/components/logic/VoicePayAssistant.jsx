import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import SidebarContent from "./SidebarContent";
import Header from "./Header";
import PaymentAuthModal from "./PaymentAuthModal";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Mic, MicOff, Sparkles, ArrowRight, RefreshCw,
         AlertTriangle, Zap, CheckCircle2, Circle,
         IndianRupee, User2, FileText, Wand2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── NLP constants (module-level so they're never recreated) ───────────────────
const NON_AMOUNT = new Set([
  // verbs / payment words
  'pay','send','transfer','give','money',
  // pronouns / articles
  'me','you','him','her','them','the','a','an','i','it','this','that',
  // prepositions / fillers
  'to','for','of','is','my','your','can','want','will','please','just',
  'need','help','if','now','ok','okay','sure','yes','no','go','ahead',
  'already','done','proceed','confirm','right','correct','great','thanks',
  'thank','say','let','do','have','get','make','some','any',
  // number words — amounts, never UPI names
  'zero','one','two','three','four','five','six','seven','eight','nine',
  'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
  'seventeen','eighteen','nineteen','twenty','thirty','forty','fifty',
  'sixty','seventy','eighty','ninety','hundred','thousand','lakh','crore',
]);

// Phrases the user says to confirm a pending action (multi-turn confirm)
const CONFIRM_RE = /\b(yes|ok|okay|sure|proceed|confirm|go\s+ahead|send\s+it|do\s+it|now\s+(you\s+can\s+)?send|that'?s?\s+(right|correct)|continue|execute)\b/i;

const REASON_WORDS = new Set([
  'coffee','food','rent','groceries','bills','utilities','lunch','dinner',
  'travel','fuel','medicine','shopping','entertainment','fees','salary',
  'gift','party','recharge','emi','loan','fee',
]);

// ── Example commands ──────────────────────────────────────────────────────────
const EXAMPLES = [
  { icon: "💸", color: "from-blue-500 to-violet-500",   text: "Send ₹500 to rajan4821@ybl for coffee" },
  { icon: "✅", color: "from-emerald-500 to-teal-500",  text: "Check if alice@paytm is safe" },
  { icon: "💰", color: "from-yellow-500 to-orange-500", text: "What is my balance?" },
  { icon: "📋", color: "from-purple-500 to-pink-500",   text: "Show my recent transactions" },
  { icon: "🛡️", color: "from-red-500 to-rose-500",      text: "Is john@upi a fraud?" },
];

const INTENT_META = {
  send_money:    { label: "Send Money",    color: "text-blue-400",    badge: "bg-blue-500/20 border-blue-500/40" },
  check_upi:     { label: "Check UPI",     color: "text-yellow-400",  badge: "bg-yellow-500/20 border-yellow-500/40" },
  check_balance: { label: "Balance",       color: "text-green-400",   badge: "bg-green-500/20 border-green-500/40" },
  view_history:  { label: "History",       color: "text-purple-400",  badge: "bg-purple-500/20 border-purple-500/40" },
  fraud_check:   { label: "Fraud Check",   color: "text-red-400",     badge: "bg-red-500/20 border-red-500/40" },
  navigate:      { label: "Navigate",      color: "text-cyan-400",    badge: "bg-cyan-500/20 border-cyan-500/40" },
  unknown:       { label: "Unknown",       color: "text-gray-400",    badge: "bg-gray-500/20 border-gray-500/40" },
};

// Stable random heights for waveform bars — generated once, never change
const WAVEFORM_HEIGHTS = Array.from({ length: 18 }, () => Math.random() * 14 + 4);

// ── Animated orb (GPT-4 voice style) ─────────────────────────────────────────
function VoiceOrb({ state }) {
  // state: idle | listening | thinking | speaking
  const isActive = state !== "idle";
  return (
    <div className="relative flex items-center justify-center w-52 h-52 mx-auto select-none">
      {/* subtle idle ring — always visible */}
      <motion.div
        className="absolute rounded-full border border-violet-500/10"
        style={{ width: 200, height: 200 }}
        animate={{ scale: [1, 1.03, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* outer glow rings — active only */}
      {isActive && (
        <>
          <motion.div
            className="absolute rounded-full"
            style={{ width: 200, height: 200, background: "radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)" }}
            animate={{ scale: [1, 1.18, 1], opacity: [0.15, 0.35, 0.15] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute rounded-full"
            animate={{ scale: [1, 1.28, 1], opacity: [0.08, 0.20, 0.08] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
            style={{ width: 200, height: 200, background: "radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%)" }}
          />
        </>
      )}

      {/* main orb */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.93 }}
        className="relative w-32 h-32 rounded-full flex items-center justify-center cursor-pointer overflow-hidden shadow-2xl"
        style={{
          background: state === "listening"
            ? "radial-gradient(circle at 35% 35%, #f43f5e, #be123c)"
            : state === "thinking"
            ? "radial-gradient(circle at 35% 35%, #f59e0b, #d97706)"
            : state === "speaking"
            ? "radial-gradient(circle at 35% 35%, #10b981, #059669)"
            : "radial-gradient(circle at 35% 35%, #818cf8, #6366f1, #4f46e5)",
          boxShadow: state === "listening"
            ? "0 0 40px rgba(244,63,94,0.5), 0 0 80px rgba(244,63,94,0.2)"
            : state === "thinking"
            ? "0 0 40px rgba(245,158,11,0.5)"
            : state === "speaking"
            ? "0 0 40px rgba(16,185,129,0.5)"
            : "0 0 40px rgba(99,102,241,0.5), 0 0 80px rgba(99,102,241,0.2)",
        }}
        animate={isActive ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={isActive ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : {}}
      >
        {/* inner shimmer */}
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={isActive ? { opacity: [0.2, 0.5, 0.2], rotate: 360 } : { opacity: 0 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          style={{ background: "conic-gradient(from 0deg, transparent, rgba(255,255,255,0.2), transparent)" }}
        />
        {state === "listening" ? (
          <MicOff className="h-12 w-12 text-white relative z-10" />
        ) : state === "thinking" ? (
          <motion.div
            className="relative z-10 flex gap-1"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            {[0,1,2].map(i => (
              <motion.div key={i} className="w-2.5 h-2.5 rounded-full bg-white"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
            ))}
          </motion.div>
        ) : (
          <Mic className="h-12 w-12 text-white relative z-10" />
        )}
      </motion.button>

      {/* listening waveform bars */}
      <AnimatePresence>
        {state === "listening" && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute bottom-0 flex items-end justify-center gap-[3px]"
            style={{ width: 130, height: 22 }}
          >
            {WAVEFORM_HEIGHTS.map((h, i) => (
              <motion.div key={i}
                className="w-1 rounded-full bg-rose-400"
                animate={{ height: [3, h, 3] }}
                transition={{ duration: 0.4 + (i % 3) * 0.1, repeat: Infinity, delay: i * 0.04 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Chat bubble ───────────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === "user";
  const [inputVal, setInputVal] = useState("");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600
                        flex items-center justify-center flex-shrink-0 mt-0.5 shadow-lg">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      )}

      <div className={`max-w-[85%] text-sm leading-relaxed shadow
        ${isUser
          ? "bg-gradient-to-br from-violet-600 to-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3"
          : "bg-gray-900/90 border border-gray-800 text-gray-100 rounded-2xl rounded-tl-sm px-4 py-3"
        }`}
      >
        {msg.content && <p>{msg.content}</p>}

        {/* confirmed slot pills */}
        {msg.slots && (msg.slots.amount || msg.slots.recipient || msg.slots.reason) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.slots.amount && (
              <span className="text-[11px] bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-full px-2.5 py-0.5">
                💰 ₹{Number(msg.slots.amount).toLocaleString("en-IN")}
              </span>
            )}
            {msg.slots.recipient && (
              <span className="text-[11px] bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-full px-2.5 py-0.5 max-w-[160px] truncate">
                👤 {msg.slots.recipient}
              </span>
            )}
            {msg.slots.reason && (
              <span className="text-[11px] bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-full px-2.5 py-0.5">
                📝 {msg.slots.reason}
              </span>
            )}
          </div>
        )}

        {/* inline UPI input — shown when recipient is missing */}
        {msg.form === "upi" && (
          <div className="mt-3 space-y-2">
            <input
              type="text"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && inputVal.includes("@") && msg.onSubmit?.(inputVal)}
              placeholder="e.g. rajan@ybl, alice@paytm"
              className="w-full bg-gray-900/70 border border-gray-600 focus:border-violet-500
                         rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500
                         outline-none transition-colors"
              autoFocus
            />
            {/* quick bank suffixes */}
            <div className="flex flex-wrap gap-1.5">
              {["@ybl","@paytm","@okaxis","@oksbi","@ibl","@upi"].map(suffix => (
                <button key={suffix}
                  onClick={() => {
                    const base = inputVal.includes("@") ? inputVal.split("@")[0] : inputVal;
                    const val  = base + suffix;
                    setInputVal(val);
                  }}
                  className="text-[10px] bg-gray-700/60 hover:bg-violet-600/40 border border-gray-600
                             hover:border-violet-500 rounded-full px-2 py-0.5 transition-colors text-gray-300">
                  {suffix}
                </button>
              ))}
            </div>
            <button
              onClick={() => inputVal.trim() && msg.onSubmit?.(inputVal.trim())}
              disabled={!inputVal.includes("@")}
              className="w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold
                         bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed
                         rounded-xl py-2 transition-colors text-white">
              <Zap className="h-3 w-3" />
              Confirm & Send
            </button>
          </div>
        )}

        {/* inline amount input */}
        {msg.form === "amount" && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <span className="text-gray-400 self-center text-base">₹</span>
              <input
                type="number"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => e.key === "Enter" && inputVal && msg.onSubmit?.(inputVal)}
                placeholder="Enter amount"
                className="flex-1 bg-gray-900/70 border border-gray-600 focus:border-violet-500
                           rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500
                           outline-none transition-colors"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["100","500","1000","2000","5000"].map(v => (
                <button key={v} onClick={() => setInputVal(v)}
                  className="text-[11px] bg-gray-700/60 hover:bg-violet-600/40 border border-gray-600
                             hover:border-violet-500 rounded-full px-2.5 py-0.5 transition-colors text-gray-300">
                  ₹{v}
                </button>
              ))}
            </div>
            <button
              onClick={() => inputVal && msg.onSubmit?.(inputVal)}
              disabled={!inputVal}
              className="w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold
                         bg-violet-600 hover:bg-violet-500 disabled:opacity-40
                         rounded-xl py-2 transition-colors text-white">
              <Zap className="h-3 w-3" />
              Set Amount
            </button>
          </div>
        )}

        {/* confirm / navigate action */}
        {msg.action && !msg.form && (
          <button onClick={msg.action.fn}
            className="mt-2 w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold
                       bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-xl py-2 px-4 transition-colors">
            <Zap className="h-3 w-3" />
            {msg.action.label}
          </button>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center
                        flex-shrink-0 mt-0.5 text-sm">
          🎤
        </div>
      )}
    </motion.div>
  );
}

// ── AI Understanding Slots row ────────────────────────────────────────────────
function SlotPills({ slots }) {
  const items = [
    { key: "amount",    icon: <IndianRupee className="h-3 w-3" />, label: "Amount?",    value: slots.amount    ? `₹${Number(slots.amount).toLocaleString("en-IN")}` : null },
    { key: "recipient", icon: <User2 className="h-3 w-3" />,       label: "Recipient?", value: slots.recipient || null },
    { key: "reason",    icon: <FileText className="h-3 w-3" />,     label: "Reason?",   value: slots.reason    || null },
  ];
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {items.map(item => (
        <motion.div
          key={item.key}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition-all
            ${item.value
              ? "bg-gray-900 border-violet-500/50 text-white"
              : "bg-gray-900/50 border-gray-700 text-gray-600 border-dashed"
            }`}
        >
          <span className={item.value ? "text-violet-400" : "text-gray-600"}>{item.icon}</span>
          {item.value
            ? (
              <>
                <span className="max-w-[100px] truncate">{item.value}</span>
                <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />
              </>
            )
            : <span>{item.label}</span>
          }
        </motion.div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function VoicePayAssistant() {
  const navigate    = useNavigate();
  const [user, setUser]         = useState(null);
  const [orbState, setOrbState] = useState("idle");   // idle | listening | thinking | speaking
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState([
    { id: 0, role: "assistant", content: "Hey! I'm your AI Pay Assistant. Tap the orb and tell me what you'd like to do — send money, check a UPI ID, or view your balance." }
  ]);
  const [context, setContext]   = useState({});       // accumulated slots across turns
  const [supported, setSupported] = useState(true);
  const [pendingPayment, setPendingPayment] = useState(null); // { amount, recipient, reason, url }

  // ── New state ──────────────────────────────────────────────────────────────
  const [detectedSlots, setDetectedSlots] = useState({ amount: null, recipient: null, reason: null });
  const [activeIntent, setActiveIntent] = useState(null); // 'send_money'|'check_upi'|etc
  const [listeningLevel, setListeningLevel] = useState(0); // 0-100, microphone volume simulation
  const [guideText, setGuideText] = useState("Tap the orb and tell me what to do");

  const recognitionRef = useRef(null);
  const transcriptRef  = useRef("");
  const chatEndRef     = useRef(null);
  const processRef     = useRef(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) setSupported(false);
  }, []);

  // Update guideText when orbState changes
  useEffect(() => {
    if (orbState === "idle")      setGuideText("Tap the orb and tell me what to do");
    if (orbState === "listening") setGuideText("I'm listening… speak clearly");
    if (orbState === "thinking")  setGuideText("Understanding your request…");
    if (orbState === "speaking")  setGuideText("Got it! Processing…");
  }, [orbState]);

  // ── Gate all send-money navigations behind the auth modal ────────────────
  const openPayment = useCallback((amount, recipient, reason) => {
    const url = `/send-money?amount=${amount || ""}&to=${encodeURIComponent(recipient || "")}&note=${encodeURIComponent(reason || "")}`;
    setPendingPayment({ amount, recipient, reason, url });
  }, []);

  // ── NLP via Flask ─────────────────────────────────────────────────────────
  const callNLP = useCallback(async (text) => {
    try {
      const { data } = await axios.post(`${API}/voice-parse`, { text, context });

      // If Flask returned stale/old response (no reply, or recipient looks like a verb)
      // run client-side parse and merge the better slots
      const bad = !data.reply
        || NON_AMOUNT.has((data.recipient || '').toLowerCase())
        || data.intent === 'unknown';

      if (bad) {
        const local = clientParse(text, context);
        return {
          intent:    local.intent    !== 'unknown' ? local.intent    : data.intent,
          amount:    local.amount    ?? data.amount,
          recipient: NON_AMOUNT.has((data.recipient || '').toLowerCase())
                       ? local.recipient
                       : (data.recipient ?? local.recipient),
          reason:    local.reason    ?? data.reason,
          missing:   local.missing,
          reply:     local.reply,
          raw:       text,
        };
      }
      return data;
    } catch {
      return clientParse(text, context);
    }
  }, [context]);

  // ── Lightweight client-side fallback ─────────────────────────────────────
  function clientParse(text, ctx) {
    let t = text.toLowerCase();
    t = t.replace(/at\s+the\s+rate\s+of|alter\s+rate\s+of|at\s+rate\s+of|at\s+the\s+rate|at\s+rate/g, "@");
    t = t.replace(/([a-z]+)\s+(\d+)\s*@\s*([a-z]+)/g, "$1$2@$3");
    t = t.replace(/(\d+)\s*k\b/g, (_, n) => String(Number(n) * 1000));
    t = t.replace(/(\d+)\s*hundred\b/g, (_, n) => String(Number(n) * 100));

    // Intent
    let intent = 'unknown';
    if (/\b(send|pay|transfer|give)\b/.test(t))         intent = 'send_money';
    else if (/\b(check|verify|trust|safe)\b/.test(t))   intent = 'check_upi';
    else if (/\b(balance|wallet|how\s+much)\b/.test(t)) intent = 'check_balance';
    else if (/\b(history|transactions|recent)\b/.test(t)) intent = 'view_history';
    else if (/\b(fraud|scam|block|danger)\b/.test(t))   intent = 'fraud_check';

    // Amount — try patterns in order, bare number last
    let amount = null;
    for (const pat of [
      /(?:send|pay|transfer|give)\s+(?:a\s+)?(?:money\s+)?(?:₹|rs\.?|rupees?)?\s*(\d[\d,]+(?:\.\d+)?)/i,
      /(?:₹|rs\.?|rupees?)\s*(\d[\d,]+(?:\.\d+)?)/i,
      /(\d[\d,]+(?:\.\d+)?)\s*(?:rupees?|rs\.?)/i,
      /\bfor\s+(?:a\s+|an\s+|the\s+)?[a-z]+\s+(\d[\d,]+(?:\.\d+)?)\b/i,
      /\b(\d{2,7})\b/,
    ]) {
      const m = t.match(pat);
      if (m) { amount = m[1].replace(/,/g, ''); break; }
    }
    if (!amount) amount = ctx.amount;

    // Recipient — try 4 patterns in priority order
    let recipient = null;

    // 1. Explicit "to <upi_or_name>" — skip verb/stop words
    for (const m of t.matchAll(/\bto\s+([\w@.]+(?:@[\w.]+)?)/g)) {
      const w = m[1].toLowerCase().replace(/[.,]$/, '');
      if (!NON_AMOUNT.has(w)) { recipient = m[1].replace(/[.,]$/, ''); break; }
    }

    // 2. Any UPI-format word (contains @) anywhere in sentence
    if (!recipient) {
      const m = t.match(/\b([\w.]+@[\w.]+)\b/);
      if (m) recipient = m[1];
    }

    // 3. "for [article] <name>" — single alpha word, not a reason/stop word
    if (!recipient) {
      const m = t.match(/\bfor\s+(?:a\s+|an\s+|the\s+)?([a-z][a-z]*)\b/i);
      if (m) {
        const w = m[1].toLowerCase();
        if (!NON_AMOUNT.has(w) && !REASON_WORDS.has(w)) recipient = m[1];
      }
    }

    // 4. "check if <name>", "is <name> safe/fraud" — pick name after "if" or "is"
    if (!recipient && (intent === 'check_upi' || intent === 'fraud_check')) {
      const m = t.match(/\b(?:if|is)\s+([\w@.]+(?:@[\w.]+)?)\b/i);
      if (m && !NON_AMOUNT.has(m[1].toLowerCase())) recipient = m[1];
    }

    if (!recipient) recipient = ctx.recipient;

    // Reason — "for <phrase>", strip recipient name from front if present
    let reason = null;
    const forM = t.match(/\bfor\s+(?:a\s+|an\s+|the\s+)?(.+?)(?:\s*$|\s+to\s+)/i);
    if (forM) {
      let fw = forM[1].trim();
      if (recipient && fw.toLowerCase().startsWith(recipient.toLowerCase()))
        fw = fw.slice(recipient.length).trim();
      if (fw && !/^\d+$/.test(fw) && (REASON_WORDS.has(fw) || fw.includes(' ')))
        reason = fw;
    }
    if (!reason) reason = ctx.reason;

    // Detect partial UPI — name without @bank (e.g. "rajan" instead of "rajan@ybl")
    const recipientPartial = recipient && !recipient.includes('@');

    const missing = [];
    if (intent === "send_money") {
      if (!amount)                                    missing.push("amount");
      if (!recipient || recipientPartial)             missing.push("recipient");
    }
    if ((intent === "check_upi" || intent === "fraud_check") && (!recipient || recipientPartial))
      missing.push("recipient");

    const amtFmt = amount ? `₹${Number(amount).toLocaleString("en-IN")}` : "some amount";
    let reply;
    if (intent === "send_money" && !missing.length) {
      reply = `Got it! Sending ${amtFmt} to ${recipient}${reason ? ` for ${reason}` : ""}. Tap confirm.`;
    } else if (intent === "send_money" && recipientPartial) {
      reply = `I heard "${recipient}" but need the full UPI ID — e.g. ${recipient}@ybl or ${recipient}@paytm. What's the full ID?`;
    } else if (intent === "send_money" && missing.includes("amount") && missing.includes("recipient")) {
      reply = "Sure! Who should I send to (full UPI ID), and how much?";
    } else if (intent === "send_money" && missing.includes("amount")) {
      reply = `How much should I send to ${recipient}?`;
    } else if (intent === "send_money" && missing.includes("recipient")) {
      reply = `Who should I send ${amtFmt} to? Please say the full UPI ID (e.g. name@ybl).`;
    } else if (intent === "check_upi" || intent === "fraud_check") {
      reply = recipientPartial
        ? `I heard "${recipient}" — what's the full UPI ID? (e.g. ${recipient}@paytm)`
        : recipient ? `Checking ${recipient}…` : "Which UPI ID should I check?";
    } else if (intent === "check_balance") {
      reply = "Opening your wallet balance.";
    } else if (intent === "view_history") {
      reply = "Showing recent transactions.";
    } else {
      reply = 'I didn\'t catch that. Try: "Send ₹500 to rajan4821@ybl for coffee"';
    }

    return { intent, amount, recipient: recipientPartial ? null : recipient,
             reason, missing, reply };
  }

  // ── Execute action after NLP ──────────────────────────────────────────────
  function getAction(parsed) {
    const { intent, amount, recipient, reason, missing } = parsed;
    if (missing?.length) return null;
    switch (intent) {
      case "send_money":
        return {
          label: "Open Send Money →",
          fn: () => openPayment(amount, recipient, reason)
        };
      case "check_upi":
      case "fraud_check":
        return { label: "Check Transaction →", fn: () => navigate(`/check-transaction?upi=${recipient || ""}`) };
      case "check_balance":
        return { label: "Go to Dashboard →", fn: () => navigate("/dashboard") };
      case "view_history":
        return { label: "View Transactions →", fn: () => navigate("/transactions") };
      default:
        return null;
    }
  }

  // ── Process spoken text ───────────────────────────────────────────────────
  async function process(text) {
    if (!text.trim()) {
      addMsg("assistant", "I didn't hear anything. Tap the orb and try again.");
      setOrbState("idle");
      return;
    }

    // User bubble
    addMsg("user", `"${text}"`);
    setOrbState("thinking");

    // ── Confirm intent: user says "ok / proceed / now send" with pending context ──
    if (CONFIRM_RE.test(text) && context.recipient?.includes('@') && context.amount) {
      const action = {
        label: "Open Send Money →",
        fn: () => openPayment(context.amount, context.recipient, context.reason)
      };
      addMsg("assistant",
        `Confirmed! Sending ₹${Number(context.amount).toLocaleString('en-IN')} to ${context.recipient}${context.reason ? ` for ${context.reason}` : ''}. Opening now…`,
        { slots: { amount: context.amount, recipient: context.recipient, reason: context.reason }, action }
      );
      setOrbState("speaking");
      setTimeout(() => {
        setOrbState("idle");
        action.fn();
        setContext({});
        setDetectedSlots({ amount: null, recipient: null, reason: null });
        setActiveIntent(null);
      }, 900);
      return;
    }

    const parsed = await callNLP(text);

    // Merge new slots into context for multi-turn
    const newCtx = {
      amount:    parsed.amount    || context.amount,
      recipient: parsed.recipient || context.recipient,
      reason:    parsed.reason    || context.reason,
    };
    setContext(newCtx);
    setDetectedSlots({ amount: newCtx.amount, recipient: newCtx.recipient, reason: newCtx.reason });
    setActiveIntent(parsed.intent);

    // AI reply bubble — attach inline form when slots are missing
    const reply = parsed.reply || 'I didn\'t catch that. Try: "Send ₹500 to rajan@ybl for coffee"';
    const action = getAction(parsed);
    const missingUPI    = parsed.intent === "send_money" && parsed.missing?.includes("recipient");
    const missingAmount = parsed.intent === "send_money" && parsed.missing?.includes("amount");

    addMsg("assistant", reply, {
      slots: { amount: parsed.amount, recipient: parsed.recipient, reason: parsed.reason },
      action: action && !missingUPI && !missingAmount ? action : undefined,
      // show inline UPI input when recipient missing
      form: missingUPI ? "upi" : missingAmount ? "amount" : undefined,
      onSubmit: missingUPI
        ? (upi) => {
            const merged = { ...newCtx, recipient: upi };
            setContext(merged);
            const fn = () => openPayment(merged.amount, upi, merged.reason);
            addMsg("assistant",
              `Got it! Sending ₹${Number(merged.amount || 0).toLocaleString("en-IN")} to ${upi}${merged.reason ? ` for ${merged.reason}` : ""}. Verify to proceed…`,
              { slots: { amount: merged.amount, recipient: upi, reason: merged.reason },
                action: { label: "Verify & Send →", fn } }
            );
            setTimeout(() => { fn(); setContext({}); }, 1400);
          }
        : missingAmount
        ? (amt) => {
            const merged = { ...newCtx, amount: amt };
            setContext(merged);
            addMsg("assistant",
              `Amount set to ₹${Number(amt).toLocaleString("en-IN")}. Who should I send it to? Type or say the UPI ID.`,
              { slots: { amount: amt, recipient: merged.recipient }, form: merged.recipient ? undefined : "upi" }
            );
          }
        : undefined,
    });

    // Open auth modal if all slots filled — clear context so old slots don't bleed
    if (action && parsed.intent === "send_money" && !parsed.missing?.length) {
      setOrbState("speaking");
      setTimeout(() => {
        setOrbState("idle");
        action.fn();
        setContext({});
        setDetectedSlots({ amount: null, recipient: null, reason: null });
        setActiveIntent(null);
      }, 900);
    } else {
      setOrbState("speaking");
      setTimeout(() => setOrbState("idle"), 1200);
    }
  }

  function addMsg(role, content, extra = {}) {
    setMessages(prev => [...prev, { id: Date.now(), role, content, ...extra }]);
  }

  // Always keep the ref pointing at the latest process function
  // so rec.onend doesn't capture a stale closure
  processRef.current = process;

  // ── Speech recognition ────────────────────────────────────────────────────
  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-IN";
    recognitionRef.current = rec;

    rec.onstart = () => { setOrbState("listening"); transcriptRef.current = ""; setTranscript(""); };
    rec.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        (e.results[i].isFinal ? (final += e.results[i][0].transcript) : (interim += e.results[i][0].transcript));
      }
      if (final) { transcriptRef.current = final; setTranscript(final); }
      else        setTranscript(interim);
    };
    rec.onend  = () => processRef.current(transcriptRef.current);
    rec.onerror = (e) => {
      setOrbState("idle");
      addMsg("assistant", e.error === "not-allowed"
        ? "Microphone access denied. Please allow mic permissions and try again."
        : "Couldn't hear you clearly. Please try again.");
    };
    rec.start();
  }

  function stopListening() { recognitionRef.current?.stop(); }

  function tryExample(text) {
    setTranscript(text);
    transcriptRef.current = text;
    process(text);
  }

  function resetChat() {
    setMessages([{ id: 0, role: "assistant", content: "Hey! I'm your AI Pay Assistant. Tap the orb and tell me what you'd like to do." }]);
    setContext({});
    setTranscript("");
    setOrbState("idle");
    setDetectedSlots({ amount: null, recipient: null, reason: null });
    setActiveIntent(null);
    setGuideText("Tap the orb and tell me what to do");
  }

  const hasAnySlot = detectedSlots.amount || detectedSlots.recipient || detectedSlots.reason;
  const showAmountChips = activeIntent === "send_money" && !detectedSlots.amount;
  const showExampleCards = orbState === "idle" && messages.length <= 1;

  return (
    <div className="flex min-h-screen bg-[#0a0a0f] text-white">
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 min-h-screen bg-gray-950 border-r border-gray-800/60">
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden" style={{ height: '100vh' }}>
        <Header user={user} />

        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* ── Left: orb + hero + chat ── */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">

            {/* Title bar */}
            <div className="flex-shrink-0 px-6 pt-5 pb-3 flex items-center justify-between border-b border-gray-800/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600
                                flex items-center justify-center shadow-lg shadow-violet-500/30">
                  <Mic className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white leading-none">Voice Pay Assistant</h1>
                  <p className="text-xs text-gray-500 mt-0.5">AI-powered · multi-turn · natural language</p>
                </div>
              </div>
              <button onClick={resetChat}
                className="text-gray-500 hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {/* Hero section */}
            <div
              className="flex-shrink-0 py-6 flex flex-col items-center gap-4 cursor-pointer"
              onClick={orbState === "listening" ? stopListening : (orbState === "idle" ? startListening : undefined)}
            >
              {/* The Orb */}
              <VoiceOrb state={orbState} />

              {/* Animated guide text */}
              <motion.p
                key={guideText}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className={`text-sm font-medium ${
                  orbState === "idle"      ? "text-gray-500"   :
                  orbState === "listening" ? "text-rose-400"   :
                  orbState === "thinking"  ? "text-amber-400"  :
                                            "text-emerald-400"
                }`}
              >
                {guideText}
              </motion.p>

              {/* Live transcript pill */}
              {transcript && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="mx-6 px-4 py-2 bg-gray-900/60 border border-gray-700/50 rounded-2xl
                             text-sm text-gray-300 text-center max-w-sm"
                >
                  <span className="text-gray-500 text-xs mr-1">Heard</span>
                  "{transcript}"
                </motion.div>
              )}

              {/* Unsupported warning */}
              {!supported && (
                <div className="mx-6 flex items-center gap-2 bg-red-500/10 border border-red-500/30
                                rounded-full px-4 py-2.5 text-sm text-red-300">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  Browser doesn't support Web Speech API. Use Chrome or Edge.
                </div>
              )}

              {/* AI Understanding Slots */}
              <AnimatePresence>
                {hasAnySlot && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    className="w-full px-4"
                    onClick={e => e.stopPropagation()}
                  >
                    <p className="text-center text-[10px] text-gray-600 uppercase tracking-wider mb-2 flex items-center justify-center gap-1">
                      <Wand2 className="h-3 w-3" /> AI understood
                    </p>
                    <SlotPills slots={detectedSlots} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Quick amount chips */}
              <AnimatePresence>
                {showAmountChips && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2 flex-wrap justify-center px-4"
                    onClick={e => e.stopPropagation()}
                  >
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider mr-1">Quick amount:</span>
                    {["100","500","1000","2000","5000"].map(v => (
                      <button key={v}
                        onClick={() => tryExample(`₹${v}`)}
                        className="text-xs bg-gray-900 border border-gray-700 hover:border-violet-500/50
                                   hover:text-violet-300 rounded-full px-3 py-1 transition-all text-gray-400">
                        ₹{Number(v).toLocaleString("en-IN")}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Smart example cards */}
              <AnimatePresence>
                {showExampleCards && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="w-full px-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
                    style={{ scrollbarWidth: "none" }}
                    onClick={e => e.stopPropagation()}
                  >
                    {[
                      { icon: "💸", label: "Send ₹500 to rajan4821@ybl", text: "Send ₹500 to rajan4821@ybl for coffee" },
                      { icon: "✅", label: "Check alice@paytm",           text: "Check if alice@paytm is safe" },
                      { icon: "💰", label: "My balance",                  text: "What is my balance?" },
                    ].map((card, i) => (
                      <motion.button key={i}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => tryExample(card.text)}
                        className="flex-shrink-0 flex items-center gap-2 bg-gray-900/80 border border-gray-800
                                   hover:border-violet-500/40 rounded-2xl px-3 py-2 text-xs text-gray-400
                                   hover:text-gray-200 transition-all"
                      >
                        <span>{card.icon}</span>
                        <span>{card.label}</span>
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Chat history */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
              <AnimatePresence initial={false}>
                {messages.map(msg => <Bubble key={msg.id} msg={msg} />)}
              </AnimatePresence>
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="hidden xl:flex flex-col w-72 border-l border-gray-800/40 bg-gray-950/50 overflow-y-auto">

            {/* Section 1: Quick Pay */}
            <div className="p-4 border-b border-gray-800/40">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-yellow-400" /> Quick Pay
              </p>
              <div className="space-y-2">
                {EXAMPLES.map((ex, i) => (
                  <motion.button key={i} whileHover={{ x: 3 }} onClick={() => tryExample(ex.text)}
                    className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl
                               bg-gray-900/60 hover:bg-gray-800/80 border border-gray-800
                               hover:border-gray-700 transition-all group">
                    <span className="text-base flex-shrink-0 mt-0.5">{ex.icon}</span>
                    <p className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors leading-relaxed flex-1">
                      {ex.text}
                    </p>
                    <ArrowRight className="h-3 w-3 text-gray-700 group-hover:text-violet-400 flex-shrink-0 mt-1 transition-colors" />
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Section 2: Payment Builder / AI Understanding */}
            <div className="p-4 border-t border-gray-800/40">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5 text-violet-400" /> AI Understanding
              </p>
              <div className="space-y-2">
                {[
                  { icon: <IndianRupee className="h-3.5 w-3.5" />, label: "Amount",    value: detectedSlots.amount    ? `₹${Number(detectedSlots.amount).toLocaleString("en-IN")}` : null },
                  { icon: <User2 className="h-3.5 w-3.5" />,       label: "Recipient", value: detectedSlots.recipient || null },
                  { icon: <FileText className="h-3.5 w-3.5" />,     label: "Reason",   value: detectedSlots.reason    || null },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                      <span className={item.value ? "text-violet-400" : "text-gray-600"}>{item.icon}</span>
                      {item.label}
                    </div>
                    {item.value
                      ? (
                        <div className="flex items-center gap-1 text-xs text-emerald-300 max-w-[130px]">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                          <span className="truncate">{item.value}</span>
                        </div>
                      )
                      : <span className="text-[11px] text-gray-600">Not detected</span>
                    }
                  </div>
                ))}
              </div>
              {activeIntent && INTENT_META[activeIntent] && (
                <div className="mt-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${INTENT_META[activeIntent].badge} ${INTENT_META[activeIntent].color}`}>
                    {INTENT_META[activeIntent].label}
                  </span>
                </div>
              )}
            </div>

            {/* Section 3: Hints */}
            <div className="p-4 border-t border-gray-800/40 space-y-3">
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3">
                <p className="text-[11px] text-violet-300 leading-relaxed">
                  <strong className="text-violet-200">Multi-turn context:</strong> If I ask "how much?", just say the amount next — I remember what you said before.
                </p>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <p className="text-[11px] text-blue-300 leading-relaxed">
                  Speak in <strong className="text-blue-200">English or Hinglish</strong>. Supports ₹, rupees, rs, and UPI formats like <em>name@bank</em>.
                </p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                <p className="text-[11px] text-emerald-300 leading-relaxed">
                  <strong className="text-emerald-200">Payment secured:</strong> Every send-money is verified with PIN, Pattern or Fingerprint before processing.
                </p>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* ── Payment auth modal ── */}
      {pendingPayment && (
        <PaymentAuthModal
          payment={pendingPayment}
          onConfirm={() => {
            const url = pendingPayment.url;
            setPendingPayment(null);
            navigate(url);
          }}
          onCancel={() => {
            setPendingPayment(null);
            addMsg("assistant", "Payment cancelled. Tap the orb to try again.");
          }}
        />
      )}
    </div>
  );
}
