import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import { HandCoins, Copy, Check, Share2, QrCode } from "lucide-react";

const REMARKS = ["Rent", "Utilities", "Groceries", "Entertainment", "Other"];

export default function RequestMoney() {
  const [user, setUser] = useState(null);
  const [upiId, setUpiId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) return;
      setUser(cu);
      try {
        const snap = await getDoc(doc(db, "users", cu.uid));
        if (snap.exists() && snap.data().upiId) {
          setUpiId(snap.data().upiId);
        } else {
          const base = (cu.displayName || cu.email || "user")
            .split(/[ @]/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
          setUpiId(`${base}${cu.uid.slice(-4).toLowerCase()}@yesbank`);
        }
      } catch {
        const base = (cu.displayName || cu.email || "user")
          .split(/[ @]/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
        setUpiId(`${base}${cu.uid.slice(-4).toLowerCase()}@yesbank`);
      }
    });
    return unsub;
  }, []);

  const handleGenerate = () => {
    if (!upiId) return;
    const base = `${window.location.origin}/send-money`;
    const params = new URLSearchParams({ to: upiId });
    if (amount) params.set("amount", amount);
    if (note) params.set("note", note);
    setGeneratedLink(`${base}?${params.toString()}`);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "Pay me on SafePayAI",
        text: `${user?.displayName || "Someone"} is requesting ₹${amount || "—"} via SafePayAI`,
        url: generatedLink,
      }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Header user={user} />
        <div className="p-6 max-w-2xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl font-bold text-blue-400 mb-1 flex items-center gap-2">
              <HandCoins className="h-6 w-6" /> Request Money
            </h1>
            <p className="text-gray-400 text-sm mb-6">
              Generate a payment link or QR to request money from anyone.
            </p>
          </motion.div>

          <div className="space-y-4">
            {/* Form */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-gray-300">Request Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Your UPI */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Your UPI ID (receiver)</label>
                  <div className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono text-blue-300">
                    {upiId || "Loading…"}
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Amount (optional)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                    <Input
                      type="number"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Leave blank to let payer choose"
                      className="pl-7 bg-gray-700 border-gray-600 text-white"
                    />
                  </div>
                </div>

                {/* Note / purpose */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1.5">Purpose (optional)</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {REMARKS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setNote(note === r.toLowerCase() ? "" : r.toLowerCase())}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                          note === r.toLowerCase()
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "border-gray-600 text-gray-400 hover:border-gray-400"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Or type a custom note…"
                    className="bg-gray-700 border-gray-600 text-white text-sm"
                  />
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={!upiId}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <QrCode className="h-4 w-4 mr-1.5" /> Generate Payment Link
                </Button>
              </CardContent>
            </Card>

            {/* Generated link + QR */}
            {generatedLink && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {/* Link card */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-green-400 flex items-center gap-1.5">
                      <Check className="h-4 w-4" /> Payment Link Ready
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-gray-700/60 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 break-all">
                      {generatedLink}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleCopy}
                        variant="outline"
                        size="sm"
                        className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700 text-xs"
                      >
                        {copied ? (
                          <><Check className="h-3.5 w-3.5 mr-1 text-green-400" /> Copied!</>
                        ) : (
                          <><Copy className="h-3.5 w-3.5 mr-1" /> Copy Link</>
                        )}
                      </Button>
                      <Button
                        onClick={handleShare}
                        size="sm"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs"
                      >
                        <Share2 className="h-3.5 w-3.5 mr-1" /> Share
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* QR for the link */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-6 pb-6 flex flex-col items-center gap-4">
                    <p className="text-xs text-gray-400">Scan to pay instantly</p>
                    <div className="bg-white p-4 rounded-2xl shadow-lg">
                      <QRCodeSVG
                        value={generatedLink}
                        size={180}
                        bgColor="#ffffff"
                        fgColor="#111827"
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    {amount && (
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-400">₹{parseFloat(amount).toLocaleString()}</p>
                        {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 text-center max-w-xs">
                      Share this QR or the link above. Anyone who clicks it will see the Send Money form pre-filled with your details.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
