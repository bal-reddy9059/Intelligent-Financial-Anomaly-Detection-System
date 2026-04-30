import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, DollarSign, MessageSquare, Send,
  Shield, AlertTriangle, CheckCircle,
  TrendingUp, History, AlertCircle, ShieldAlert, Eye, Loader, Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Header from './Header';
import SidebarContent from './SidebarContent';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const MOCK_RECIPIENTS = {
  '+919876543210': { upiId: 'rahul@aegis',  displayName: 'Rahul Sharma', trustScore: 92, trustBadge: 'verified' },
  '+919123456789': { upiId: 'priya@aegis',  displayName: 'Priya Singh',  trustScore: 78, trustBadge: 'caution'  },
  '+918765432109': { upiId: 'amit@aegis',   displayName: 'Amit Kumar',   trustScore: 88, trustBadge: 'verified' },
  '+917654321098': { upiId: 'sneha@aegis',  displayName: 'Sneha Reddy',  trustScore: 34, trustBadge: 'watch'    },
};

const MOCK_HISTORY = [
  { phoneNumber: '+919876543210', recipientName: 'Rahul Sharma', amount: 500,  status: 'completed', fraudVerdict: 'ALLOW' },
  { phoneNumber: '+919123456789', recipientName: 'Priya Singh',  amount: 1000, status: 'completed', fraudVerdict: 'ALLOW' },
];

export default function PayByPhone() {
  const [user, setUser]               = useState(null);
  const [upiId, setUpiId]             = useState('demo@aegis');
  const [phoneInput, setPhoneInput]   = useState('+91');
  const [amount, setAmount]           = useState('');
  const [note, setNote]               = useState('');

  const [lookupLoading, setLookupLoading]     = useState(false);
  const [recipient, setRecipient]             = useState(null);
  const [lookupError, setLookupError]         = useState('');

  const [fraudCheckLoading, setFraudCheckLoading] = useState(false);
  const [fraudVerdict, setFraudVerdict]           = useState(null);

  const [paymentHistory, setPaymentHistory]   = useState(MOCK_HISTORY);
  const [historyLoading, setHistoryLoading]   = useState(false);

  const [confirmMode, setConfirmMode]         = useState(false);
  const [paymentSuccess, setPaymentSuccess]   = useState(false);
  const [successTx, setSuccessTx]             = useState(null);
  const [error, setError]                     = useState('');

  const debounceTimer = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) return;
      setUser(cu);
      try {
        const snap = await getDoc(doc(db, 'users', cu.uid));
        if (snap.exists() && snap.data().upiId) setUpiId(snap.data().upiId);
      } catch { /* demo mode */ }
      loadPaymentHistory(cu.uid);
    });
    return unsub;
  }, []);

  const loadPaymentHistory = async (userId) => {
    try {
      setHistoryLoading(true);
      const res = await fetch(`${API}/phone-pay/history?userId=${userId}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setPaymentHistory(data.transactions?.length ? data.transactions : MOCK_HISTORY);
      }
    } catch { setPaymentHistory(MOCK_HISTORY); }
    finally { setHistoryLoading(false); }
  };

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const phone = phoneInput.trim();
    if (phone.length < 10 || !phone.startsWith('+')) {
      setRecipient(null);
      setLookupError('');
      setFraudVerdict(null);
      return;
    }
    debounceTimer.current = setTimeout(() => performPhoneLookup(phone), 500);
    return () => clearTimeout(debounceTimer.current);
  }, [phoneInput]);

  const performPhoneLookup = async (phone) => {
    setLookupLoading(true);
    setLookupError('');
    try {
      const res = await fetch(`${API}/phone-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, currentUserId: user?.uid || '' }),
      });
      const data = await res.json();
      if (data.found) {
        setRecipient(data);
        performFraudCheck(data, parseFloat(amount) || 0);
      } else {
        setRecipient(null);
        setLookupError(data.message || 'No account found for this number');
      }
    } catch {
      const mock = MOCK_RECIPIENTS[phone];
      if (mock) {
        const rd = { ...mock, phoneNumber: phone, found: true };
        setRecipient(rd);
        performFraudCheck(rd, parseFloat(amount) || 0);
      } else {
        setRecipient(null);
        setLookupError('No AegisAI account linked to this number');
      }
    } finally { setLookupLoading(false); }
  };

  const performFraudCheck = async (recipientData, txAmount) => {
    if (!recipientData) return;
    setFraudCheckLoading(true);
    try {
      const res = await fetch(`${API}/phone-pay/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: recipientData.phoneNumber,
          recipientUpi: recipientData.upiId,
          amount: txAmount,
          transactions: paymentHistory,
          allKnownPhones: paymentHistory.map(t => t.phoneNumber),
          trustScore: recipientData.trustScore,
        }),
      });
      setFraudVerdict(await res.json());
    } catch {
      const score = recipientData.trustBadge === 'watch'   ? 75
                  : recipientData.trustBadge === 'caution' ? 42 : 12;
      const verdict = score >= 70 ? 'BLOCK' : score >= 40 ? 'CAUTION' : 'ALLOW';
      setFraudVerdict({
        verdict,
        compositeRisk: score,
        confidence: 80,
        factors: [
          { key: 'first_time', label: 'First-Time Payment',   score: 20,    risk: 'safe'   },
          { key: 'spoof',      label: 'Phone Spoofing Risk',  score: score, risk: verdict === 'BLOCK' ? 'high' : verdict === 'CAUTION' ? 'medium' : 'safe' },
          { key: 'amount',     label: 'Amount vs History',    score: 25,    risk: 'medium' },
        ],
        summary: verdict === 'BLOCK'   ? '🚨 High risk detected. Payment blocked for your safety.'
                : verdict === 'CAUTION' ? '⚠️ Verify this recipient before sending.'
                : '✅ No significant risk factors. Safe to proceed.',
      });
    } finally { setFraudCheckLoading(false); }
  };

  useEffect(() => {
    if (recipient && amount) performFraudCheck(recipient, parseFloat(amount));
  }, [amount]);

  const handlePayment = async () => {
    if (!recipient || !amount || parseFloat(amount) <= 0) { setError('Please fill in all fields'); return; }
    if (fraudVerdict?.verdict === 'BLOCK') { setError('Transaction blocked due to high fraud risk.'); return; }
    setConfirmMode(false);
    try {
      if (user && db) {
        await addDoc(collection(db, 'transactions'), {
          userId: user.uid,
          senderUPI: upiId,
          receiverUPI: recipient.upiId,
          receiverPhone: recipient.phoneNumber,
          recipientName: recipient.displayName,
          amount: parseFloat(amount),
          note,
          paymentMethod: 'phone',
          timestamp: new Date(),
          status: 'completed',
          fraudVerdict: fraudVerdict?.verdict || 'UNKNOWN',
          fraudScore: fraudVerdict?.compositeRisk || 0,
        });
      }
    } catch { /* demo mode */ }
    setSuccessTx({ amount: parseFloat(amount), recipient: recipient.displayName, upi: recipient.upiId });
    setPaymentSuccess(true);
    setError('');
    setTimeout(() => {
      setPhoneInput('+91'); setAmount(''); setNote('');
      setRecipient(null); setFraudVerdict(null);
      setPaymentSuccess(false); setSuccessTx(null);
    }, 3500);
  };

  const trustColor = (badge) =>
    badge === 'verified' ? 'bg-green-900 text-green-100 border-green-700'
    : badge === 'caution' ? 'bg-yellow-900 text-yellow-100 border-yellow-700'
    : 'bg-red-900 text-red-100 border-red-700';

  const riskColor = (risk) =>
    risk === 'high' ? 'text-red-400' : risk === 'medium' ? 'text-yellow-400' : 'text-green-400';

  const verdictBorder = (v) =>
    v === 'BLOCK'   ? 'border-red-600    bg-red-900/20'
    : v === 'CAUTION' ? 'border-yellow-600 bg-yellow-900/20'
    : v === 'REVIEW'  ? 'border-blue-600   bg-blue-900/20'
    : 'border-green-600 bg-green-900/20';

  const verdictIcon = (v) =>
    v === 'BLOCK'   ? <ShieldAlert   className="w-5 h-5 text-red-500"    />
    : v === 'CAUTION' ? <AlertTriangle className="w-5 h-5 text-yellow-500" />
    : v === 'REVIEW'  ? <Eye           className="w-5 h-5 text-blue-500"   />
    : <CheckCircle className="w-5 h-5 text-green-500" />;

  const verdictLabel = (v) =>
    v === 'BLOCK' ? 'Payment Blocked' : v === 'CAUTION' ? 'Verify Before Sending'
    : v === 'REVIEW' ? 'Extra Caution Needed' : 'Safe to Send';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <Header />
      <div className="flex">
        <SidebarContent />
        <div className="flex-1 p-8 overflow-auto max-h-screen">

          {/* Demo Banner */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 bg-blue-900/30 border border-blue-600 rounded-lg flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
            <p className="text-sm text-blue-200">
              Demo mode — try <span className="font-mono text-blue-300">+919876543210</span>,{' '}
              <span className="font-mono text-blue-300">+919123456789</span>, or{' '}
              <span className="font-mono text-blue-300">+917654321098</span>
            </p>
          </motion.div>

          {/* Success */}
          <AnimatePresence>
            {paymentSuccess && successTx && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="mb-6 p-4 bg-gradient-to-r from-green-900 to-green-800 border border-green-600 rounded-lg flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-300 shrink-0" />
                <div>
                  <p className="font-semibold text-green-100">Payment Successful!</p>
                  <p className="text-sm text-green-200">
                    ₹{successTx.amount.toLocaleString('en-IN')} sent to {successTx.recipient} ({successTx.upi})
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mb-6 p-4 bg-red-900/30 border border-red-600 rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <p className="text-red-100 text-sm">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Main Form ── */}
            <div className="lg:col-span-2">
              <Card className="bg-gray-800/50 border-gray-700 shadow-xl">
                <CardHeader className="pb-4 border-b border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-900/30 rounded-lg">
                      <Phone className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <CardTitle className="text-white">Pay with Phone Number</CardTitle>
                      <p className="text-xs text-gray-400 mt-0.5">Enter any AegisAI user's phone number to send money instantly</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6 pt-6">

                  {/* Phone Input */}
                  <div>
                    <label className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-2">
                      <Phone className="w-4 h-4" /> Recipient Phone Number
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="tel"
                        placeholder="+919876543210"
                        value={phoneInput}
                        onChange={(e) => { setPhoneInput(e.target.value); setError(''); }}
                        disabled={paymentSuccess}
                        className="bg-gray-700 border-gray-600 text-white placeholder-gray-500 disabled:opacity-50 font-mono"
                      />
                      {lookupLoading && (
                        <div className="flex items-center px-3">
                          <Loader className="w-4 h-4 animate-spin text-blue-400" />
                        </div>
                      )}
                    </div>
                    {lookupError && (
                      <p className="text-sm text-yellow-400 mt-2 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {lookupError}
                      </p>
                    )}
                  </div>

                  {/* Recipient Card */}
                  <AnimatePresence>
                    {recipient && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <Card className="bg-gradient-to-br from-gray-700/50 to-gray-700/30 border-gray-600">
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Recipient Found</p>
                                <p className="text-xl font-bold text-white mt-1">{recipient.displayName}</p>
                                <p className="text-sm text-gray-400 font-mono">{recipient.upiId}</p>
                              </div>
                              <div className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${trustColor(recipient.trustBadge)}`}>
                                {recipient.trustBadge === 'verified' && '✓ Verified'}
                                {recipient.trustBadge === 'caution'  && '⚠ Caution'}
                                {recipient.trustBadge === 'watch'    && '🚨 Watch'}
                              </div>
                            </div>
                            <div className="pt-2 border-t border-gray-600 flex items-center justify-between">
                              <span className="text-xs text-gray-400 font-semibold">Community Trust Score</span>
                              <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-green-400" />
                                <span className="font-bold text-white">{recipient.trustScore}/100</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Amount */}
                  <div>
                    <label className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4" /> Amount (₹)
                    </label>
                    <Input
                      type="number"
                      placeholder="5000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={!recipient || paymentSuccess}
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-500 disabled:opacity-50 text-lg font-semibold"
                    />
                  </div>

                  {/* Note */}
                  <div>
                    <label className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-2">
                      <MessageSquare className="w-4 h-4" /> Note (Optional)
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Lunch, Rent, Gift"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      disabled={!recipient || paymentSuccess}
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-500 disabled:opacity-50"
                    />
                  </div>

                  {/* Fraud loading indicator */}
                  {fraudCheckLoading && (
                    <div className="flex items-center gap-2 text-sm text-blue-400">
                      <Loader className="w-4 h-4 animate-spin" />
                      AegisAI fraud shield scanning…
                    </div>
                  )}

                  {/* Confirm / Send */}
                  {confirmMode ? (
                    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                      className="bg-blue-900/20 border border-blue-600/40 rounded-lg p-4 space-y-4">
                      <p className="text-white font-bold text-sm flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-400" /> Confirm Payment
                      </p>
                      <div className="space-y-2 text-sm bg-gray-700/40 rounded-lg p-3">
                        <div className="flex justify-between">
                          <span className="text-gray-400">To</span>
                          <span className="text-white font-semibold">{recipient?.displayName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">UPI</span>
                          <span className="text-gray-300 font-mono text-xs">{recipient?.upiId}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-gray-600">
                          <span className="text-gray-400">Amount</span>
                          <span className="text-green-400 font-bold text-base">₹{parseFloat(amount || 0).toLocaleString('en-IN')}</span>
                        </div>
                        {note && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Note</span>
                            <span className="text-white">{note}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1 border-t border-gray-600">
                          <span className="text-gray-400">Risk Score</span>
                          <span className={`font-semibold ${
                            (fraudVerdict?.compositeRisk || 0) >= 70 ? 'text-red-400'
                            : (fraudVerdict?.compositeRisk || 0) >= 40 ? 'text-yellow-400'
                            : 'text-green-400'
                          }`}>{fraudVerdict?.compositeRisk ?? '—'}%</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => setConfirmMode(false)} variant="outline"
                          className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700">
                          Cancel
                        </Button>
                        <Button onClick={handlePayment}
                          className="flex-1 bg-green-600 hover:bg-green-700 font-semibold">
                          <Send className="w-4 h-4 mr-2" /> Confirm & Send
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <Button
                      onClick={() => { setError(''); setConfirmMode(true); }}
                      disabled={!recipient || !amount || parseFloat(amount) <= 0 || paymentSuccess || fraudVerdict?.verdict === 'BLOCK'}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 font-semibold">
                      <Send className="w-4 h-4 mr-2" />
                      {fraudVerdict?.verdict === 'BLOCK' ? 'Payment Blocked by AegisAI' : 'Review & Pay'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Right Sidebar ── */}
            <div className="lg:col-span-1 space-y-6">

              {/* Fraud Shield Panel */}
              <AnimatePresence>
                {fraudVerdict && (
                  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <Card className={`border-2 ${verdictBorder(fraudVerdict.verdict)}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          {verdictIcon(fraudVerdict.verdict)}
                          <CardTitle className="text-base text-white">{verdictLabel(fraudVerdict.verdict)}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-gray-300">{fraudVerdict.summary}</p>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Risk Factors</p>
                          {fraudVerdict.factors?.slice(0, 4).map((f, i) => (
                            <div key={i} className="bg-gray-700/30 rounded p-2 text-xs">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-gray-300">{f.label}</span>
                                <span className={`font-bold ${riskColor(f.risk)}`}>{f.score}%</span>
                              </div>
                              <div className="w-full bg-gray-700 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full transition-all ${
                                  f.risk === 'high' ? 'bg-red-500' : f.risk === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                                }`} style={{ width: `${f.score}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="text-xs text-gray-400 pt-2 border-t border-gray-600 flex justify-between">
                          <span>Composite Risk</span>
                          <span className="font-semibold text-white">{fraudVerdict.compositeRisk}%</span>
                        </div>
                        <div className="text-xs text-gray-400 flex justify-between">
                          <span>Confidence</span>
                          <span className="font-semibold text-white">{fraudVerdict.confidence}%</span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Recent Payments */}
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-blue-400" />
                    <CardTitle className="text-base text-white">Recent Phone Payments</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {historyLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Loader className="w-3 h-3 animate-spin" /> Loading…
                    </div>
                  ) : paymentHistory.length === 0 ? (
                    <p className="text-sm text-gray-400">No phone payments yet</p>
                  ) : (
                    <div className="space-y-2">
                      {paymentHistory.slice(0, 6).map((tx, i) => (
                        <div key={i} className="bg-gray-700/30 rounded-lg p-3 text-xs">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium text-white truncate flex-1">{tx.recipientName}</span>
                            <span className="text-green-400 font-semibold ml-2">₹{tx.amount.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 font-mono">{tx.phoneNumber}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              tx.fraudVerdict === 'BLOCK'   ? 'bg-red-900    text-red-200'    :
                              tx.fraudVerdict === 'CAUTION' ? 'bg-yellow-900 text-yellow-200' :
                              'bg-green-900 text-green-200'
                            }`}>
                              {tx.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* How It Works */}
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-400" /> How It Works
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-2 text-xs text-gray-400 list-none">
                    {[
                      'Enter recipient\'s phone number',
                      'AegisAI looks up their UPI ID',
                      'Fraud shield scans in real-time',
                      'Review & confirm your payment',
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="bg-blue-900/50 text-blue-300 rounded-full w-4 h-4 flex items-center justify-center shrink-0 font-bold text-[10px]">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
