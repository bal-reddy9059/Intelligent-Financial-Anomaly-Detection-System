import { useState, useEffect, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "./Header";
import SidebarContent from "./SidebarContent";
import { QrCode, Download, Copy, Check, Send, ArrowRight, Camera, Keyboard, X, ScanLine } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";

export default function QRPay() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [upiId, setUpiId] = useState("");
  const [tab, setTab] = useState("receive");
  const [copied, setCopied] = useState(false);
  const [pastedUpi, setPastedUpi] = useState("");
  const [inputMode, setInputMode] = useState("type");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanSuccess, setScanSuccess] = useState("");
  const qrRef = useRef(null);
  const scannerRef = useRef(null);
  const scannerDivId = "qr-scanner-region";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) return;
      setUser(cu);
      try {
        const snap = await getDoc(doc(db, "users", cu.uid));
        if (snap.exists() && snap.data().upiId) {
          setUpiId(snap.data().upiId);
        } else {
          const base = (cu.displayName || cu.email || "user").split(/[ @]/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
          setUpiId(`${base}${cu.uid.slice(-4).toLowerCase()}@yesbank`);
        }
      } catch {
        const base = (cu.displayName || cu.email || "user").split(/[ @]/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
        setUpiId(`${base}${cu.uid.slice(-4).toLowerCase()}@yesbank`);
      }
    });
    return unsub;
  }, []);

  // Stop scanner when component unmounts or tab changes
  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  useEffect(() => {
    if (tab !== "send") stopScanner();
  }, [tab]);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  // Parse UPI deep-link or plain UPI ID from scanned text
  const parseScannedText = (text) => {
    try {
      // Standard UPI deep-link: upi://pay?pa=upiid@bank&pn=Name...
      if (text.startsWith("upi://")) {
        const url = new URL(text.replace("upi://pay", "https://upi.pay"));
        const pa = url.searchParams.get("pa");
        if (pa) return pa;
      }
      // Plain UPI ID format
      if (text.includes("@")) return text.trim();
    } catch { /* ignore */ }
    return null;
  };

  const startScanner = () => {
    setScanError("");
    setScanSuccess("");
    setScanning(true);
    // scanning=true causes the div to render; wait for next paint then init
  };

  // Start scanner only after the div is in the DOM
  useEffect(() => {
    if (!scanning) return;
    const div = document.getElementById(scannerDivId);
    if (!div) return;

    const html5QrCode = new Html5Qrcode(scannerDivId);
    scannerRef.current = html5QrCode;

    html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => {
        const upi = parseScannedText(decodedText);
        if (upi) {
          stopScanner();
          setPastedUpi(upi);
          setScanSuccess(`Scanned: ${upi}`);
          setInputMode("type");
        } else {
          setScanError("Not a valid UPI QR. Keep pointing at a UPI QR code.");
        }
      },
      () => { /* per-frame failures are normal — ignore */ }
    ).catch((err) => {
      setScanning(false);
      scannerRef.current = null;
      if (err?.name === "NotAllowedError" || String(err).toLowerCase().includes("permission")) {
        setScanError("Camera permission denied. Allow camera access in your browser settings and try again.");
      } else if (String(err).toLowerCase().includes("no cameras") || String(err).toLowerCase().includes("not found")) {
        setScanError("No camera found on this device.");
      } else {
        setScanError("Could not start camera. Please type the UPI ID manually.");
      }
    });
  }, [scanning]);

  const handleCameraToggle = () => {
    if (scanning) {
      stopScanner();
      setInputMode("type");
    } else {
      setInputMode("camera");
      startScanner();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(upiId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 300; canvas.height = 300;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 0, 0, 300, 300);
      const link = document.createElement("a");
      link.download = `safepay-qr-${upiId}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(new TextEncoder().encode(svgData).reduce((s, b) => s + String.fromCharCode(b), ""));
  };

  const handleSendToUpi = () => {
    const clean = pastedUpi.trim();
    if (!clean || !clean.includes("@")) return;
    navigate("/send-money", { state: { recipientUPI: clean } });
  };

  const qrValue = upiId
    ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(user?.displayName || "SafePayAI User")}`
    : "";

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
              <QrCode className="h-6 w-6" /> QR Pay
            </h1>
            <p className="text-gray-400 text-sm mb-6">Generate your payment QR or scan to pay.</p>
          </motion.div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-800 rounded-xl p-1 mb-6">
            {[
              { id: "receive", label: "My QR (Receive)" },
              { id: "send", label: "Scan & Pay (Send)" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ── My QR (Receive) ─────────────────────────────────── */}
            {tab === "receive" && (
              <motion.div key="receive" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-6 pb-6 flex flex-col items-center gap-5">
                    <div ref={qrRef} className="bg-white p-4 rounded-2xl shadow-lg">
                      {qrValue ? (
                        <QRCodeSVG value={qrValue} size={200} bgColor="#ffffff" fgColor="#111827" level="M" marginSize={0} />
                      ) : (
                        <div className="w-[200px] h-[200px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-1">Your UPI ID</p>
                      <div className="flex items-center gap-2 bg-gray-700 rounded-lg px-4 py-2">
                        <span className="text-white font-mono text-sm">{upiId || "Loading…"}</span>
                        <button onClick={handleCopy} className="text-gray-400 hover:text-blue-400 transition-colors">
                          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                      {copied && <p className="text-xs text-green-400 mt-1">Copied!</p>}
                    </div>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 text-center max-w-xs">
                      <p className="text-xs text-yellow-400 font-medium mb-1">⚠ Simulation Only</p>
                      <p className="text-xs text-gray-400">
                        This QR works <span className="text-white font-medium">within SafePayAI only</span>. External apps like GPay or PhonePe will show an error because this is a simulated UPI ID not registered on the real banking network.
                      </p>
                    </div>
                    <div className="flex gap-3 w-full max-w-xs">
                      <Button onClick={handleDownloadQR} variant="outline" className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700">
                        <Download className="h-4 w-4 mr-1.5" /> Download
                      </Button>
                      <Button onClick={handleCopy} className="flex-1 bg-blue-600 hover:bg-blue-700">
                        <Copy className="h-4 w-4 mr-1.5" /> Copy UPI
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ── Scan & Pay (Send) ────────────────────────────────── */}
            {tab === "send" && (
              <motion.div key="send" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                      <Send className="h-4 w-4 text-blue-400" /> Pay via QR
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">

                    {/* Mode toggle */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { stopScanner(); setInputMode("type"); setScanError(""); setScanSuccess(""); }}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                          inputMode === "type" ? "bg-blue-600 border-blue-500 text-white" : "border-gray-600 text-gray-400 hover:border-gray-400"
                        }`}
                      >
                        <Keyboard className="h-3.5 w-3.5" /> Type UPI ID
                      </button>
                      <button
                        onClick={handleCameraToggle}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                          scanning ? "bg-red-600 border-red-500 text-white" : inputMode === "camera" ? "bg-blue-600 border-blue-500 text-white" : "border-gray-600 text-gray-400 hover:border-gray-400"
                        }`}
                      >
                        {scanning ? <><X className="h-3.5 w-3.5" /> Stop Camera</> : <><Camera className="h-3.5 w-3.5" /> Scan QR Code</>}
                      </button>
                    </div>

                    {/* Live camera scanner */}
                    {scanning && (
                      <div className="relative rounded-xl overflow-hidden border-2 border-blue-500/50">
                        <div id={scannerDivId} className="w-full" />
                        {/* Scanning animation overlay */}
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                          <motion.div
                            animate={{ y: [-80, 80, -80] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="w-64 h-0.5 bg-blue-400 opacity-70 shadow-lg shadow-blue-400"
                          />
                        </div>
                        <div className="absolute top-2 left-0 right-0 flex justify-center">
                          <span className="text-xs bg-black/60 text-blue-300 px-3 py-1 rounded-full flex items-center gap-1">
                            <ScanLine className="h-3 w-3" /> Point at a UPI QR code
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Errors / success */}
                    {scanError && (
                      <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-3">{scanError}</p>
                    )}
                    {scanSuccess && (
                      <p className="text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg p-3 flex items-center gap-2">
                        <Check className="h-4 w-4" /> {scanSuccess}
                      </p>
                    )}

                    {/* UPI input */}
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">Recipient UPI ID</label>
                      <Input
                        value={pastedUpi}
                        onChange={(e) => { setPastedUpi(e.target.value); setScanSuccess(""); }}
                        placeholder="e.g. name1234@yesbank"
                        className="bg-gray-700 border-gray-600 text-white"
                      />
                      <p className="text-xs text-gray-500">
                        {scanning ? "UPI ID will auto-fill after scanning." : "Type manually or scan a QR code above."}
                      </p>
                    </div>

                    <Button
                      onClick={handleSendToUpi}
                      disabled={!pastedUpi.trim() || !pastedUpi.includes("@")}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40"
                    >
                      <ArrowRight className="h-4 w-4 mr-1.5" /> Proceed to Pay
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-gray-400 mb-3">Or pay a saved beneficiary directly:</p>
                    <Button onClick={() => navigate("/beneficiaries")} variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-700 text-xs">
                      View Beneficiaries
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
