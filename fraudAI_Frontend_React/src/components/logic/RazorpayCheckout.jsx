import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, XCircle, Loader, Shield, CreditCard,
  Download, Copy, ExternalLink, IndianRupee
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import jsPDF from 'jspdf';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const RZP_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID || '';

/**
 * RazorpayCheckout
 * Opens the Razorpay native checkout modal, verifies the payment server-side,
 * then shows a receipt with PDF download.
 *
 * Props:
 *   recipient   – { displayName, upiId, phoneNumber, trustScore }
 *   amount      – number (INR)
 *   note        – string
 *   user        – Firebase user object
 *   senderUpiId – string
 *   onSuccess   – callback({ paymentId, orderId, amount })
 *   onCancel    – callback()
 */
export default function RazorpayCheckout({
  recipient,
  amount,
  note,
  user,
  senderUpiId,
  onSuccess,
  onCancel,
}) {
  const [step, setStep]             = useState('idle');   // idle | creating | open | verifying | success | failed
  const [paymentData, setPaymentData] = useState(null);
  const [error, setError]           = useState('');
  const [copied, setCopied]         = useState(false);

  const initiatePayment = async () => {
    setError('');
    setStep('creating');

    try {
      // Step 1 — create Razorpay order server-side
      const orderRes = await fetch(`${API}/razorpay/create-order`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency:      'INR',
          recipientUpi:  recipient.upiId,
          recipientName: recipient.displayName,
          note:          note || 'AegisAI Payment',
          senderUid:     user?.uid || 'demo',
        }),
      });

      const order = await orderRes.json();
      if (!orderRes.ok || order.error) {
        throw new Error(order.error || 'Failed to create payment order');
      }

      setStep('open');

      // Step 2 — open Razorpay checkout modal
      const options = {
        key:          RZP_KEY || order.razorpay_key,
        amount:       order.amount,
        currency:     order.currency,
        order_id:     order.order_id,
        name:         'AegisAI',
        description:  note || `Payment to ${recipient.displayName}`,
        image:        '/vite.svg',
        prefill: {
          name:    user?.displayName || '',
          email:   user?.email       || '',
          contact: user?.phoneNumber || '',
        },
        notes: {
          recipient_upi:  recipient.upiId,
          recipient_name: recipient.displayName,
          aegis_verified: 'true',
        },
        theme:  { color: '#3B82F6' },
        modal: {
          ondismiss: () => {
            setStep('idle');
            onCancel?.();
          },
        },
        handler: async (response) => {
          setStep('verifying');
          await verifyPayment(response, order.order_id);
        },
      };

      if (!window.Razorpay) {
        throw new Error('Razorpay SDK not loaded. Check your internet connection.');
      }

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        setStep('failed');
        setError(`Payment failed: ${resp.error?.description || 'Unknown error'}`);
      });
      rzp.open();

    } catch (err) {
      setStep('failed');
      setError(err.message || 'Payment initiation failed');
    }
  };

  const verifyPayment = async (razorpayResponse, orderId) => {
    try {
      const verifyRes = await fetch(`${API}/razorpay/verify-payment`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id:   orderId,
          razorpay_payment_id: razorpayResponse.razorpay_payment_id,
          razorpay_signature:  razorpayResponse.razorpay_signature,
          amount,
          recipientUpi: recipient.upiId,
          senderUid:    user?.uid || 'demo',
        }),
      });

      const result = await verifyRes.json();

      if (!verifyRes.ok || !result.verified) {
        setStep('failed');
        setError(result.error || 'Payment verification failed — possible tampering');
        return;
      }

      const successData = {
        paymentId:     result.payment_id,
        orderId:       result.order_id,
        amount:        result.amount_inr,
        recipientUpi:  result.recipient_upi,
        recipientName: recipient.displayName,
        timestamp:     result.timestamp,
        aegisStatus:   result.aegis_status,
      };

      setPaymentData(successData);
      setStep('success');
      onSuccess?.(successData);

    } catch (err) {
      setStep('failed');
      setError(err.message || 'Verification request failed');
    }
  };

  const downloadReceipt = () => {
    if (!paymentData) return;
    const doc = new jsPDF();
    const now = new Date().toLocaleString('en-IN');

    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, 210, 297, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('AegisAI', 105, 28, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text('Neural Fraud Defense — Payment Receipt', 105, 38, { align: 'center' });

    doc.setDrawColor(59, 130, 246);
    doc.line(20, 45, 190, 45);

    doc.setTextColor(74, 222, 128);
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text(`+₹${Number(paymentData.amount).toLocaleString('en-IN')}`, 105, 68, { align: 'center' });

    doc.setTextColor(156, 163, 175);
    doc.setFontSize(11);
    doc.text('PAYMENT SUCCESSFUL', 105, 78, { align: 'center' });

    const rows = [
      ['Razorpay Payment ID', paymentData.paymentId],
      ['Order ID',            paymentData.orderId],
      ['Recipient',           paymentData.recipientName],
      ['Recipient UPI',       paymentData.recipientUpi],
      ['Sent from',           senderUpiId || 'demo@aegis'],
      ['Amount',              `₹${Number(paymentData.amount).toLocaleString('en-IN')}`],
      ['AegisAI Status',      paymentData.aegisStatus || 'CLEARED'],
      ['Timestamp',           now],
    ];

    let y = 98;
    rows.forEach(([label, value]) => {
      doc.setTextColor(156, 163, 175);
      doc.setFontSize(9);
      doc.text(label, 25, y);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(String(value), 25, y + 6);
      y += 16;
    });

    doc.setDrawColor(59, 130, 246);
    doc.line(20, y + 4, 190, y + 4);
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(8);
    doc.text('This receipt is generated by AegisAI. Powered by Razorpay.', 105, y + 12, { align: 'center' });

    doc.save(`AegisAI_Receipt_${paymentData.paymentId}.pdf`);
  };

  const copyPaymentId = () => {
    if (!paymentData?.paymentId) return;
    navigator.clipboard.writeText(paymentData.paymentId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Idle: Pay button ────────────────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <Button
        onClick={initiatePayment}
        className="w-full bg-blue-600 hover:bg-blue-700 font-semibold text-base py-6"
      >
        <IndianRupee className="w-5 h-5 mr-2" />
        Pay ₹{Number(amount).toLocaleString('en-IN')} via Razorpay
      </Button>
    );
  }

  // ── Creating order ───────────────────────────────────────────────────────────
  if (step === 'creating' || step === 'open') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="w-full p-5 bg-blue-900/20 border border-blue-600/40 rounded-xl flex flex-col items-center gap-3">
        <Loader className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-blue-200 font-semibold">
          {step === 'creating' ? 'Creating secure payment order…' : 'Razorpay checkout opened'}
        </p>
        <p className="text-xs text-gray-400 text-center">
          {step === 'open'
            ? 'Complete payment in the Razorpay window. Use UPI: success@razorpay for test.'
            : 'Contacting Razorpay servers…'}
        </p>
      </motion.div>
    );
  }

  // ── Verifying signature ──────────────────────────────────────────────────────
  if (step === 'verifying') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="w-full p-5 bg-yellow-900/20 border border-yellow-600/40 rounded-xl flex flex-col items-center gap-3">
        <Shield className="w-8 h-8 text-yellow-400 animate-pulse" />
        <p className="text-yellow-200 font-semibold">AegisAI verifying payment…</p>
        <p className="text-xs text-gray-400">Checking HMAC signature with Razorpay</p>
      </motion.div>
    );
  }

  // ── Failed ───────────────────────────────────────────────────────────────────
  if (step === 'failed') {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="w-full p-5 bg-red-900/20 border border-red-600/40 rounded-xl space-y-4">
        <div className="flex items-center gap-3">
          <XCircle className="w-6 h-6 text-red-400 shrink-0" />
          <div>
            <p className="text-red-200 font-semibold">Payment Failed</p>
            <p className="text-xs text-gray-400 mt-0.5">{error}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setStep('idle'); setError(''); }}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-sm">
            Try Again
          </Button>
          <Button onClick={onCancel} variant="outline"
            className="flex-1 border-gray-600 text-gray-300 text-sm">
            Cancel
          </Button>
        </div>
      </motion.div>
    );
  }

  // ── Success receipt ──────────────────────────────────────────────────────────
  if (step === 'success' && paymentData) {
    return (
      <AnimatePresence>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="w-full space-y-4">

          {/* Success banner */}
          <div className="p-4 bg-gradient-to-r from-green-900 to-emerald-900 border border-green-600 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="w-7 h-7 text-green-300 shrink-0" />
              <div>
                <p className="text-green-100 font-bold text-lg">Payment Successful!</p>
                <p className="text-green-300 text-sm">
                  ₹{Number(paymentData.amount).toLocaleString('en-IN')} sent to {paymentData.recipientName}
                </p>
              </div>
            </div>

            {/* Receipt details */}
            <Card className="bg-black/30 border-green-700/50">
              <CardContent className="p-3 space-y-2 text-xs">
                {[
                  ['Payment ID', paymentData.paymentId],
                  ['Order ID',   paymentData.orderId],
                  ['Recipient',  `${paymentData.recipientName} (${paymentData.recipientUpi})`],
                  ['Amount',     `₹${Number(paymentData.amount).toLocaleString('en-IN')}`],
                  ['Status',     paymentData.aegisStatus || 'CLEARED'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-start gap-2">
                    <span className="text-gray-400 shrink-0">{label}</span>
                    <span className="text-white font-mono text-right break-all">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* AegisAI badge */}
            <div className="mt-3 flex items-center gap-2 p-2 bg-blue-900/40 rounded-lg border border-blue-700/40">
              <Shield className="w-4 h-4 text-blue-400 shrink-0" />
              <p className="text-xs text-blue-200">
                Verified by AegisAI Neural Fraud Defense — HMAC signature confirmed
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button onClick={downloadReceipt}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-sm font-semibold">
              <Download className="w-4 h-4 mr-2" /> Download Receipt
            </Button>
            <Button onClick={copyPaymentId} variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-700 text-sm px-4">
              {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return null;
}
