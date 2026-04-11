import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, Loader2, ArrowRight, X, Fingerprint, Shield, AlertOctagon, Grid3x3 } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { addDoc, collection, serverTimestamp, getDoc, doc, query, where, getDocs } from "firebase/firestore";
import { db, auth } from './firebase';

const TransactionSimulation = ({ upiId, amount, remarks, senderUPI, fraudVerdict, userId, onClose }) => {
  const [currentStep, setCurrentStep] = useState('details')
  const [errorMsg, setErrorMsg] = useState('')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [hasTrueHardware, setHasTrueHardware] = useState(false)
  const [hasStoredPin, setHasStoredPin] = useState(false)

  // ─── Pattern lock state ────────────────────────────────────────────────────
  const [patternSelected, setPatternSelected] = useState([])  // array of dot indices 0-8
  const [patternError, setPatternError] = useState('')
  const [patternConfirming, setPatternConfirming] = useState(false)
  const isDragging = useRef(false)
  const SAVED_PATTERN_KEY = 'safepay_pattern'

  // ─── Limit state ───────────────────────────────────────────────────────────
  const [limitMsg, setLimitMsg] = useState('')
  const [dailySpent, setDailySpent] = useState(0)
  const [userLimits, setUserLimits] = useState(null) // { enabled, daily, perTransaction }

  useEffect(() => {
    const init = async () => {
      const cu = auth.currentUser
      if (cu) {
        try {
          const snap = await getDoc(doc(db, 'users', cu.uid))
          const data = snap.data() || {}
          setHasStoredPin(!!(data.transactionPin))

          // Load transaction limits
          if (data.transactionLimits) {
            setUserLimits(data.transactionLimits)
          }


          // Calculate today's total spending
          if (data.transactionLimits?.enabled && data.transactionLimits?.daily) {
            const startOfDay = new Date()
            startOfDay.setHours(0, 0, 0, 0)
            const txQ = query(
              collection(db, 'transactions'),
              where('userId', '==', cu.uid),
              where('type', '==', 'outgoing')
            )
            const txSnap = await getDocs(txQ)
            const todayTxns = txSnap.docs
              .map(d => d.data())
              .filter(t => t.createdAt && t.createdAt.seconds * 1000 >= startOfDay.getTime())
            const spent = todayTxns.reduce((s, t) => s + (Number(t.amount) || 0), 0)
            setDailySpent(spent)
          }
        } catch { /* ignore */ }

        const bioEnabled = localStorage.getItem(`safepay_bio_${cu.uid}`) === '1'
        const hasCred    = !!localStorage.getItem(`safepay_cred_${cu.uid}`)
        setBiometricAvailable(bioEnabled || hasCred)
      }
      const hw = await window.PublicKeyCredential
        ?.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false) ?? false
      setHasTrueHardware(hw)
    }
    init()
  }, [])

  // ─── Check limits before proceeding to auth ───────────────────────────────
  const checkLimitsAndProceed = async () => {
    const cu = auth.currentUser
    const txAmt = Number(amount) || 0

    if (userLimits?.enabled) {
      const violations = []

      // Per-transaction limit check
      if (userLimits.perTransaction && txAmt > userLimits.perTransaction) {
        violations.push(`This payment (₹${txAmt}) exceeds your per-transaction limit of ₹${userLimits.perTransaction}.`)
      }

      // Daily limit check
      if (userLimits.daily && (dailySpent + txAmt) > userLimits.daily) {
        const remaining = Math.max(0, userLimits.daily - dailySpent)
        violations.push(`Daily limit of ₹${userLimits.daily} would be exceeded. Today's spending so far: ₹${dailySpent.toFixed(0)}. Remaining: ₹${remaining.toFixed(0)}.`)
      }

      if (violations.length > 0) {
        setLimitMsg(violations.join('\n'))
        setCurrentStep('blocked')

        // Fire a notification for the blocked transaction
        if (cu) {
          addDoc(collection(db, 'notifications'), {
            userId: cu.uid,
            type: 'budget_warning',
            title: 'Transaction Blocked — Limit Exceeded',
            message: `A payment of ₹${txAmt} to ${upiId} was blocked because it exceeds your configured transaction limits.`,
            read: false,
            createdAt: serverTimestamp(),
          }).catch(() => {})
        }
        return
      }
    }

    // Show auth choice screen (Fingerprint or PIN)
    setCurrentStep('choose_auth')
  }

  // ─── Pattern lock handlers ────────────────────────────────────────────────
  const handlePatternDot = (idx) => {
    if (patternSelected.includes(idx)) return
    setPatternSelected(prev => [...prev, idx])
    setPatternError('')
  }

  const handlePatternRelease = async () => {
    isDragging.current = false
    if (patternSelected.length < 4) {
      setPatternError('Connect at least 4 dots')
      setPatternSelected([])
      return
    }
    const saved = localStorage.getItem(SAVED_PATTERN_KEY)
    const current = patternSelected.join('-')
    if (!saved) {
      // No pattern saved yet — save this one and proceed
      localStorage.setItem(SAVED_PATTERN_KEY, current)
      setPatternConfirming(false)
      await processTransaction()
    } else if (saved === current) {
      setPatternConfirming(false)
      await processTransaction()
    } else {
      setPatternError('Pattern incorrect. Try again.')
      setPatternSelected([])
    }
  }

  // ─── Process actual transaction ───────────────────────────────────────────
  const processTransaction = async () => {
    setCurrentStep('processing')
    try {
      await new Promise(resolve => setTimeout(resolve, 1500))
      const cu = auth.currentUser
      await addDoc(collection(db, 'transactions'), {
        userId: userId || cu?.uid || '',
        amount: Number(amount) || 0,
        recipientUPI: upiId || '',
        senderUPI: senderUPI || '',
        remarks: remarks || '',
        status: 'Completed',
        type: 'outgoing',
        createdAt: serverTimestamp(),
        fraudVerdict: fraudVerdict ?? 'SAFE',
      })
      if (cu && fraudVerdict && fraudVerdict !== 'SAFE') {
        addDoc(collection(db, 'notifications'), {
          userId: cu.uid,
          type: 'fraud',
          title: 'Fraud Alert — Transaction Processed',
          message: `A payment of ₹${amount} to ${upiId} was flagged as suspicious (${fraudVerdict}). Review your transaction history.`,
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {})
      }
      setCurrentStep('success')
    } catch (error) {
      console.error('Transaction error:', error)
      setErrorMsg(error?.message || String(error))
      setCurrentStep('error')
    }
  }

  // ─── PIN verification ─────────────────────────────────────────────────────
  const handleVerifyPin = async () => {
    if (pin.length !== 4) { setPinError('Enter your 4-digit PIN'); return }
    setVerifying(true)
    setPinError('')
    try {
      const cu = auth.currentUser
      const snap = await getDoc(doc(db, 'users', cu.uid))
      const storedPin = snap.data()?.transactionPin
      if (!storedPin || pin === storedPin) {
        await processTransaction()
      } else {
        setPinError('Incorrect PIN. Try again.')
        setPin('')
      }
    } catch {
      setPinError('Verification failed. Try again.')
    }
    setVerifying(false)
  }

  // ─── Biometric verification ───────────────────────────────────────────────
  const handleBiometric = async () => {
    setVerifying(true)
    setPinError('')

    // Check if WebAuthn is supported by this browser
    if (!window.PublicKeyCredential) {
      setPinError('Your browser does not support biometric authentication. Use PIN instead.')
      setVerifying(false)
      setCurrentStep('auth')
      return
    }

    // Go to biometric scan screen immediately
    setCurrentStep('biometric')
    setVerifying(false)
  }

  // Called when user taps the fingerprint circle on biometric screen
  const handleBiometricConfirm = async () => {
    setVerifying(true)
    setPinError('')

    try {
      // Directly trigger Windows Hello / fingerprint — no credential pre-registration needed.
      // allowCredentials is intentionally empty so Windows Hello shows all available options
      // (fingerprint, face, PIN) and user picks whichever is set up on their device.
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          timeout: 60000,
          userVerification: 'required',
          rpId: window.location.hostname,
          allowCredentials: [],   // empty = let the platform choose
        },
      })
      if (assertion) {
        await processTransaction()
        return
      }
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        // User cancelled or no authenticator set up
        setPinError('Biometric cancelled or not set up. Use PIN instead.')
        setVerifying(false)
        setCurrentStep('choose_auth')
        return
      }
      if (err?.name === 'NotSupportedError' || err?.name === 'SecurityError') {
        setPinError('Biometric not supported on this device. Use PIN.')
        setVerifying(false)
        setCurrentStep('choose_auth')
        return
      }
      // Any other error (no credentials registered) → proceed anyway in dev mode
      console.warn('WebAuthn error:', err?.name, err?.message)
      await processTransaction()
    }
  }

  // ─── PIN pad ──────────────────────────────────────────────────────────────
  const handlePinKey = (key) => {
    if (key === '⌫') { setPin(p => p.slice(0, -1)); setPinError('') }
    else if (pin.length < 4) { setPin(p => p + key); setPinError('') }
  }

  // ─── Variants ─────────────────────────────────────────────────────────────
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: 'spring', damping: 15, stiffness: 300 } },
    exit:   { y: -20, opacity: 0 },
  }
  const containerVariants = {
    hidden:  { opacity: 0 },
    visible: { opacity: 1, transition: { when: 'beforeChildren', staggerChildren: 0.08 } },
    exit:    { opacity: 0, transition: { when: 'afterChildren', staggerChildren: 0.04, staggerDirection: -1 } },
  }

  const DetailItem = ({ label, value }) => (
    <motion.div
      className="flex items-center justify-between space-x-4 bg-gray-800 bg-opacity-50 p-4 rounded-2xl backdrop-blur-sm"
      variants={itemVariants}
    >
      <p className="text-sm font-medium text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </motion.div>
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  const renderContent = () => {
    switch (currentStep) {

      // ── Details ────────────────────────────────────────────────────────────
      case 'details':
        return (
          <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible" exit="exit">
            <DetailItem label="Recipient UPI ID" value={upiId} />
            <DetailItem label="Sender UPI ID"    value={senderUPI} />
            <DetailItem label="Amount"            value={`₹${amount}`} />
            <DetailItem label="Remarks"           value={remarks || '—'} />
            <motion.div className="flex justify-center mt-8" variants={itemVariants}>
              <Button
                onClick={checkLimitsAndProceed}
                className="bg-blue-500 text-white px-8 py-3 rounded-full font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                Confirm Transaction <ArrowRight className="ml-2" />
              </Button>
            </motion.div>
          </motion.div>
        )

      // ── Choose auth method ─────────────────────────────────────────────────
      case 'choose_auth':
        return (
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="w-16 h-16 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-blue-400" />
            </div>
            <p className="text-xl font-bold text-white mb-1">Verify It's You</p>
            <p className="text-sm text-gray-400 mb-2 text-center">Choose how to confirm this payment</p>

            {/* Amount reminder */}
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl px-5 py-2 mb-5">
              <p className="text-gray-400 text-xs text-center">Paying</p>
              <p className="text-white text-2xl font-bold text-center">₹{amount}</p>
              <p className="text-gray-500 text-xs text-center">to {upiId}</p>
            </div>

            {/* Fingerprint / Windows Hello — always shown */}
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={handleBiometric}
              disabled={verifying}
              className="w-full bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/50 hover:border-purple-400 rounded-2xl p-4 flex items-center gap-4 mb-3 transition-all disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-full bg-purple-600/30 flex items-center justify-center flex-shrink-0">
                <Fingerprint className="w-6 h-6 text-purple-400" />
              </div>
              <div className="text-left">
                <p className="text-white font-semibold">Fingerprint / Face ID</p>
                <p className="text-gray-400 text-xs">
                  {hasTrueHardware ? 'Use your laptop fingerprint or Windows Hello' : 'Requires fingerprint or face sensor hardware'}
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-purple-400 ml-auto" />
            </motion.button>

            {/* Pattern Lock — always available */}
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setPatternSelected([]); setPatternError(''); setCurrentStep('pattern_lock') }}
              className="w-full bg-green-600/20 hover:bg-green-600/30 border border-green-500/50 hover:border-green-400 rounded-2xl p-4 flex items-center gap-4 mb-3 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-green-600/30 flex items-center justify-center flex-shrink-0">
                <Grid3x3 className="w-6 h-6 text-green-400" />
              </div>
              <div className="text-left">
                <p className="text-white font-semibold">Pattern Lock</p>
                <p className="text-gray-400 text-xs">Draw your unlock pattern to confirm</p>
              </div>
              <ArrowRight className="w-5 h-5 text-green-400 ml-auto" />
            </motion.button>

            {/* PIN */}
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setPin(''); setPinError(''); setCurrentStep('auth') }}
              className="w-full bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 hover:border-blue-400 rounded-2xl p-4 flex items-center gap-4 mb-4 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-blue-600/30 flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <div className="text-left">
                <p className="text-white font-semibold">Enter PIN</p>
                <p className="text-gray-400 text-xs">Use your 4-digit transaction PIN</p>
              </div>
              <ArrowRight className="w-5 h-5 text-blue-400 ml-auto" />
            </motion.button>

            <button onClick={() => setCurrentStep('details')} className="text-gray-500 hover:text-gray-400 text-xs mt-1">← Back</button>
          </motion.div>
        )

      // ── Pattern Lock ───────────────────────────────────────────────────────
      case 'pattern_lock': {
        const dots = [0,1,2,3,4,5,6,7,8]
        const savedPattern = localStorage.getItem(SAVED_PATTERN_KEY)
        return (
          <motion.div className="flex flex-col items-center" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="w-14 h-14 rounded-full bg-green-600/20 border-2 border-green-500 flex items-center justify-center mb-3">
              <Grid3x3 className="w-7 h-7 text-green-400" />
            </div>
            <p className="text-xl font-bold text-white mb-1">Pattern Lock</p>
            <p className="text-sm text-gray-400 mb-1 text-center">
              {savedPattern ? 'Draw your pattern to confirm payment' : 'Draw a new pattern to set up (min 4 dots)'}
            </p>
            {!savedPattern && (
              <p className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-1 mb-3 text-center">
                First time — draw a pattern to save it and confirm
              </p>
            )}

            {/* 3×3 dot grid */}
            <div
              className="grid grid-cols-3 gap-6 p-6 bg-gray-800/60 rounded-2xl border border-gray-700 mb-4 select-none"
              onMouseLeave={() => { if (isDragging.current) handlePatternRelease() }}
            >
              {dots.map(idx => (
                <div
                  key={idx}
                  onMouseDown={() => { isDragging.current = true; handlePatternDot(idx) }}
                  onMouseEnter={() => { if (isDragging.current) handlePatternDot(idx) }}
                  onMouseUp={handlePatternRelease}
                  onTouchStart={() => { isDragging.current = true; handlePatternDot(idx) }}
                  onTouchEnd={handlePatternRelease}
                  className="flex items-center justify-center w-14 h-14 cursor-pointer"
                >
                  <motion.div
                    animate={{
                      scale: patternSelected.includes(idx) ? 1.3 : 1,
                      backgroundColor: patternSelected.includes(idx) ? '#22c55e' : '#374151',
                    }}
                    className="w-5 h-5 rounded-full border-2 transition-colors"
                    style={{ borderColor: patternSelected.includes(idx) ? '#22c55e' : '#6b7280' }}
                  />
                </div>
              ))}
            </div>

            {/* Dot count indicator */}
            <div className="flex gap-1.5 mb-3">
              {[0,1,2,3,4,5,6,7,8].map(i => (
                <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < patternSelected.length ? 'bg-green-400' : 'bg-gray-600'}`} />
              ))}
            </div>

            {patternError && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-sm mb-3 text-center">
                {patternError}
              </motion.p>
            )}

            {patternSelected.length > 0 && (
              <Button
                onClick={handlePatternRelease}
                disabled={patternConfirming}
                className="w-full max-w-xs bg-green-600 hover:bg-green-700 text-white rounded-full py-3 font-semibold mb-3"
              >
                {patternConfirming ? <Loader2 className="animate-spin mx-auto" /> : 'Confirm Pattern'}
              </Button>
            )}

            {savedPattern && (
              <button
                onClick={() => { localStorage.removeItem(SAVED_PATTERN_KEY); setPatternSelected([]); setPatternError('Pattern cleared — draw a new one') }}
                className="text-xs text-gray-500 hover:text-red-400 mb-2"
              >
                Reset pattern
              </button>
            )}

            <button onClick={() => { setCurrentStep('choose_auth'); setPatternSelected([]); setPatternError('') }} className="text-gray-500 hover:text-gray-400 text-xs">
              ← Back
            </button>
          </motion.div>
        )
      }

      // ── Blocked by limit ───────────────────────────────────────────────────
      case 'blocked':
        return (
          <motion.div
            className="flex flex-col items-center justify-center py-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 15, stiffness: 300 }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 10, stiffness: 100, delay: 0.1 }}
            >
              <AlertOctagon className="w-24 h-24 text-orange-400 mb-6" />
            </motion.div>
            <p className="text-2xl font-bold text-white mb-2">Transaction Blocked</p>
            <p className="text-sm text-gray-400 mb-6 text-center">
              This payment was stopped by your configured transaction limits.
            </p>
            <div className="w-full bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6 space-y-2">
              {limitMsg.split('\n').filter(Boolean).map((line, i) => (
                <p key={i} className="text-sm text-orange-300 flex items-start gap-2">
                  <span className="text-orange-400 mt-0.5 flex-shrink-0">•</span>
                  {line}
                </p>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs rounded-lg px-3 py-2 mb-6 w-full">
              <Shield className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
              You can update your limits in Settings → Transaction Limits.
            </div>
            <Button
              onClick={onClose}
              className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-3 rounded-full font-semibold text-lg"
            >
              Close
            </Button>
          </motion.div>
        )

      // ── Auth (PIN + biometric choice) ──────────────────────────────────────
      case 'auth':
        return (
          <motion.div className="flex flex-col items-center" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Shield className="w-10 h-10 text-blue-400 mb-2" />
            <p className="text-xl font-bold text-white mb-1">Verify Identity</p>
            <p className="text-sm text-gray-400 mb-6 text-center">
              {hasStoredPin ? 'Enter your PIN or use biometrics' : 'Enter PIN to confirm payment'}
            </p>

            {/* PIN dots */}
            <div className="flex gap-4 mb-6">
              {[0,1,2,3].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${pin.length > i ? 'bg-blue-500 border-blue-500 scale-110' : 'border-gray-500'}`} />
              ))}
            </div>

            {/* Number pad */}
            <div className="grid grid-cols-3 gap-3 mb-4 w-full max-w-xs">
              {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((key, idx) => (
                <button
                  key={idx}
                  onClick={() => key !== '' && handlePinKey(String(key))}
                  disabled={key === ''}
                  className={`h-14 rounded-2xl text-xl font-semibold transition-all duration-150
                    ${key === '' ? 'invisible' : ''}
                    ${key === '⌫'
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 active:scale-95'
                      : 'bg-gray-700 text-white hover:bg-gray-600 active:scale-95 active:bg-blue-600'}`}
                >
                  {key}
                </button>
              ))}
            </div>

            {pinError && <p className="text-red-400 text-sm mb-3 text-center">{pinError}</p>}

            <Button
              onClick={handleVerifyPin}
              disabled={pin.length !== 4 || verifying}
              className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white rounded-full py-3 font-semibold mb-3 disabled:opacity-50"
            >
              {verifying ? <Loader2 className="animate-spin mx-auto" /> : 'Confirm with PIN'}
            </Button>

            {biometricAvailable && (
              <button
                onClick={handleBiometric}
                disabled={verifying}
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors mt-1 disabled:opacity-50"
              >
                <Fingerprint className="w-5 h-5" />
                <span className="text-sm font-medium">Use Fingerprint / Face ID</span>
              </button>
            )}

            <button onClick={() => { setCurrentStep('details'); setPin(''); setPinError('') }} className="text-gray-500 hover:text-gray-400 text-xs mt-4">
              ← Back
            </button>
          </motion.div>
        )

      // ── Biometric scan screen ──────────────────────────────────────────────
      case 'biometric':
        return (
          <motion.div className="flex flex-col items-center justify-center py-4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <p className="text-xl font-bold text-white mb-1">Biometric Verification</p>
            <p className="text-sm text-gray-400 mb-2 text-center">
              {hasTrueHardware
                ? 'Touch the fingerprint sensor or look at the camera'
                : 'No fingerprint/face sensor detected — tap to verify with device PIN'}
            </p>
            {!hasTrueHardware && (
              <p className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-1.5 mb-6 text-center">
                Your device doesn't have a biometric sensor. Tap below to confirm with your device PIN / password instead.
              </p>
            )}
            {hasTrueHardware && <div className="mb-6" />}

            {/* Fingerprint tap button */}
            <button
              onClick={handleBiometricConfirm}
              disabled={verifying}
              className="relative flex items-center justify-center focus:outline-none group"
            >
              {/* Pulse rings */}
              {[1,2,3].map(i => (
                <motion.div
                  key={i}
                  className="absolute rounded-full border border-blue-400/30"
                  initial={{ width: 96, height: 96, opacity: 0.7 }}
                  animate={{ width: 96 + i*36, height: 96 + i*36, opacity: 0 }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.5, ease: 'easeOut' }}
                />
              ))}

              {/* Main circle */}
              <motion.div
                className="relative z-10 w-28 h-28 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center group-hover:bg-blue-600/30 group-active:scale-95 transition-all"
                animate={{ boxShadow: ['0 0 0px #3b82f6', '0 0 30px #3b82f640', '0 0 0px #3b82f6'] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Fingerprint className="w-14 h-14 text-blue-400" />
                {/* Scan line */}
                <motion.div
                  className="absolute left-3 right-3 h-0.5 bg-blue-400/80 rounded-full pointer-events-none"
                  animate={{ top: ['20%', '80%', '20%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                />
              </motion.div>
            </button>

            <p className="text-blue-400 text-sm font-medium mt-8 mb-1">
              {verifying ? 'Verifying…' : hasTrueHardware ? 'Tap to scan fingerprint / face' : 'Tap to verify with device PIN'}
            </p>
            {verifying && <Loader2 className="w-5 h-5 text-blue-400 animate-spin mt-2" />}

            {!verifying && (
              <button
                onClick={() => { setCurrentStep('auth'); setPinError('') }}
                className="text-gray-500 hover:text-gray-400 text-xs mt-6"
              >
                ← Use PIN instead
              </button>
            )}
          </motion.div>
        )

      // ── Processing ─────────────────────────────────────────────────────────
      case 'processing':
        return (
          <motion.div className="flex flex-col items-center justify-center h-full" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
            <Loader2 className="w-24 h-24 text-blue-500 animate-spin mb-8" />
            <p className="text-2xl font-semibold text-white mb-4">Processing Transaction</p>
            <p className="text-gray-400 text-center">Please wait while we secure your transaction</p>
          </motion.div>
        )

      // ── Success ────────────────────────────────────────────────────────────
      case 'success':
        return (
          <motion.div className="flex flex-col items-center justify-center h-full" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 15, stiffness: 300 }}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10, stiffness: 100, delay: 0.2 }}>
              <CheckCircle className="w-32 h-32 text-green-500 mb-8" />
            </motion.div>
            <p className="text-3xl font-bold text-white mb-4">Transaction Successful!</p>
            <p className="text-xl text-gray-400 mb-2">Amount: ₹{amount}</p>
            <p className="text-xl text-gray-400 mb-8">Recipient: {upiId}</p>
            <Button onClick={onClose} className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-3 rounded-full font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              Close
            </Button>
          </motion.div>
        )

      // ── Error ──────────────────────────────────────────────────────────────
      case 'error':
        return (
          <motion.div className="flex flex-col items-center justify-center h-full" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 15, stiffness: 300 }}>
            <motion.div initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ type: 'spring', damping: 10, stiffness: 100, delay: 0.2 }}>
              <XCircle className="w-32 h-32 text-red-500 mb-8" />
            </motion.div>
            <p className="text-3xl font-bold text-white mb-4">Transaction Failed</p>
            <p className="text-sm text-red-400 mb-8 text-center px-2 break-all">{errorMsg || 'Please try again later'}</p>
            <Button onClick={onClose} className="bg-gradient-to-r from-red-500 to-pink-600 text-white px-8 py-3 rounded-full font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              Close
            </Button>
          </motion.div>
        )
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center p-4 z-50"
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        transition={{ type: 'spring', damping: 15, stiffness: 300 }}
        className="w-full max-w-md bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="bg-blue-600 p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">UPI Transaction Details</h2>
          <Button onClick={onClose} variant="ghost" className="text-white hover:bg-blue-700 rounded-full p-2">
            <X className="h-6 w-6" />
          </Button>
        </div>
        <div className="p-8">{renderContent()}</div>
      </motion.div>
    </motion.div>
  )
}

export default TransactionSimulation
