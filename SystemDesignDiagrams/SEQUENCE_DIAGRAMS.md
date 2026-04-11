# AegisAI — Sequence Diagrams

> Paste any diagram into [mermaid.live](https://mermaid.live) to render interactively.

---

## 1. User Login & UPI Assignment

```mermaid
sequenceDiagram
    actor User
    participant React as React App
    participant Firebase as Firebase Auth
    participant Firestore as Firestore DB

    User->>React: Click "Sign in with Google"
    React->>Firebase: signInWithPopup(GoogleAuthProvider)
    Firebase-->>React: UserCredential { uid, email, displayName }
    React->>Firestore: getDoc(users/{uid})

    alt First login — new user
        Firestore-->>React: doc does not exist
        React->>Firestore: setDoc(users/{uid}, { upiId, balance: 10000 })
        React-->>User: Redirect to /dashboard (new account)
    else Returning user
        Firestore-->>React: { upiId, balance, ... }
        React-->>User: Redirect to /dashboard (existing account)
    end
```

---

## 2. Send Money — Full Fraud Verification Flow

```mermaid
sequenceDiagram
    actor User
    participant React as React (Homepage)
    participant Blocklist as Fraud UPI Blocklist
    participant Flask as Flask API
    participant Firestore as Firestore DB
    participant WebAuthn as WebAuthn / Pattern Lock

    User->>React: Enter UPI, Amount, Remarks → Click "Verify"

    React->>Blocklist: Check KNOWN_FRAUD_UPIS map (client-side)
    alt UPI is in blocklist
        Blocklist-->>React: HIGH_RISK { score, scenario }
        React-->>User: 🔴 Show HIGH RISK badge instantly
    else UPI not in blocklist
        React->>Firestore: getDoc(users/{recipientUPI})
        Firestore-->>React: Recipient name (if found)
        React->>Flask: POST /check-single { features: [22 values] }
        Flask-->>React: { risk_level, probability, action, suspicious_features }
        React-->>User: Show risk badge + AI insight
    end

    Note over React,User: Dark pattern check runs in parallel
    React->>React: checkDarkPatterns(remarks) — 8 regex patterns
    alt Scam phrase detected
        React-->>User: ⚠️ Dark pattern warning banner
    end

    User->>React: Click "Confirm Transaction"

    alt risk_level === HIGH
        React-->>User: 🚫 Transaction Blocked modal
        React->>Firestore: addDoc(notifications, { type: fraud_alert })
    else risk_level === MEDIUM or LOW
        React-->>User: Auth Choice Screen
        User->>WebAuthn: Choose Fingerprint / Pattern / PIN

        alt Fingerprint / Face ID
            WebAuthn->>WebAuthn: navigator.credentials.get({ allowCredentials: [] })
            WebAuthn-->>React: PublicKeyCredential (success)
        else Pattern Lock
            User->>React: Draw pattern on 3×3 grid
            React->>React: Compare vs localStorage saved pattern
        else PIN
            User->>React: Enter 4-digit PIN
            React->>Firestore: Verify PIN hash
        end

        React->>Firestore: addDoc(transactions, { userId, amount, fraudVerdict, ... })
        React-->>User: ✅ Transaction Success screen
    end
```

---

## 3. ML Fraud Detection — Ensemble Pipeline

```mermaid
sequenceDiagram
    participant Client as React Client
    participant Flask as Flask API
    participant RF as Random Forest
    participant IF as Isolation Forest
    participant AE as Autoencoder
    participant Scaler as StandardScaler

    Client->>Flask: POST /check-single { features: [22 values] }
    Flask->>Scaler: transform(features)
    Scaler-->>Flask: normalized_features

    par Model inference (parallel)
        Flask->>RF: predict_proba(normalized_features)
        RF-->>Flask: rf_score (0–1)
    and
        Flask->>IF: decision_function(normalized_features)
        IF-->>Flask: if_score normalized (0–1)
    and
        Flask->>AE: reconstruct(normalized_features)
        AE-->>Flask: reconstruction_error
        Flask->>Flask: ae_score = error > p95_threshold ? HIGH : LOW
    end

    Flask->>Flask: final_score = RF×0.5 + IF×0.25 + AE×0.25
    Flask->>Flask: model_agreement = count(models flagging fraud)

    alt final_score ≥ 0.70
        Flask-->>Client: { risk_level: HIGH, action: BLOCK, probability: 0.xx }
    else final_score ≥ 0.40
        Flask-->>Client: { risk_level: MEDIUM, action: REVIEW, probability: 0.xx }
    else
        Flask-->>Client: { risk_level: LOW, action: APPROVE, probability: 0.xx }
    end
```

---

## 4. Biometric Authentication Flow

```mermaid
sequenceDiagram
    actor User
    participant React as React (TransactionSimulation)
    participant WebAuthn as WebAuthn API (Browser)
    participant WinHello as Windows Hello / Face ID
    participant LocalStore as localStorage
    participant Firestore as Firestore DB

    User->>React: Click "Confirm Transaction"
    React-->>User: Auth Choice Screen (3 options)

    alt Option 1 — Fingerprint / Face ID
        User->>React: Click "Fingerprint / Face ID"
        React->>WebAuthn: PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        WebAuthn-->>React: true / false

        React->>WebAuthn: navigator.credentials.get({ allowCredentials: [] })
        WebAuthn->>WinHello: Prompt biometric scan
        WinHello-->>WebAuthn: Scan result
        WebAuthn-->>React: PublicKeyCredential object (success) OR DOMException (fail/cancel)

        alt Biometric success
            React-->>User: ✅ Verified — proceed to payment
        else Biometric failed / cancelled
            React-->>User: ❌ Error — try again or use PIN
        end

    else Option 2 — Pattern Lock
        User->>React: Click "Pattern Lock"
        React-->>User: Show 3×3 dot grid

        alt Pattern already saved
            User->>React: Draw pattern (drag across dots)
            React->>LocalStore: Load saved pattern key "safepay_pattern"
            LocalStore-->>React: "0-1-4-3-6" (saved sequence)
            React->>React: Compare drawn vs saved (min 4 dots)

            alt Patterns match
                React-->>User: ✅ Pattern verified — proceed
            else No match
                React-->>User: ❌ Wrong pattern (2 retries)
            end

        else No pattern saved — setup mode
            User->>React: Draw pattern (first time)
            React-->>User: Confirm pattern (draw again)
            React->>LocalStore: Save pattern key "safepay_pattern"
            React-->>User: ✅ Pattern saved — proceed to payment
        end

    else Option 3 — PIN
        User->>React: Click "Enter PIN"
        User->>React: Type 4-digit PIN
        React->>Firestore: Verify PIN against users/{uid}.pin
        Firestore-->>React: Match / No match
        alt PIN correct
            React-->>User: ✅ Verified
        else Wrong PIN
            React-->>User: ❌ Try again
        end
    end

    React->>Firestore: addDoc(transactions, payload)
    React-->>User: ✅ Payment Complete
```

---

## 5. Spending Coach Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Coach as SpendingCoach.jsx
    participant Firestore as Firestore DB
    participant Logic as computeAll()

    User->>Coach: Navigate to /spending-coach
    Coach->>Firestore: onAuthStateChanged → get uid
    Firestore-->>Coach: Firebase User { uid }

    Coach->>Firestore: getDoc(users/{uid}) — get upiId
    Firestore-->>Coach: { upiId }

    par Dual query strategy
        Coach->>Firestore: query(transactions, where userId == uid, limit 500)
        Firestore-->>Coach: snap1.docs[]
    and
        Coach->>Firestore: query(transactions, where senderUPI == upiId, limit 500)
        Firestore-->>Coach: snap2.docs[]
    end

    Coach->>Coach: Merge & deduplicate by doc ID
    Coach->>Coach: Sort client-side by createdAt desc

    Coach->>Logic: computeAll(txs[])
    Logic->>Logic: Filter thisWeekTxs (last 7 days)
    Logic->>Logic: Filter lastWeekTxs (days 8–14)
    Logic->>Logic: Category breakdown → catMap → catArr
    Logic->>Logic: 7-day trend array (day labels + totals)
    Logic->>Logic: generateInsights(txs, catArr, trend)
    Logic-->>Coach: setCategoryData, setWeeklyTrend, setInsights, setWeeklyStats

    Coach-->>User: Render pie chart + area chart + insight cards

    User->>Coach: Type question in chat
    Coach->>Coach: buildCoachResponse(question, weeklyStats)
    Coach-->>User: AI coaching response
    Coach->>Firestore: setDoc(coachChats/{uid}, { messages })
```

---

## 6. Community Fraud Report Flow

```mermaid
sequenceDiagram
    actor Reporter as User A (Reporter)
    actor Viewer as User B (Viewer)
    participant React as CommunityReports.jsx
    participant Firestore as Firestore DB

    Reporter->>React: Enter UPI ID + fraud reason
    React->>Firestore: addDoc(communityReports, { upiId, reason, reportedBy, corroborations: 0 })
    Firestore-->>React: New doc created
    React-->>Reporter: ✅ Report submitted

    Note over Firestore: Real-time listener active for all users

    Firestore-->>React: onSnapshot fires (Viewer's client)
    React-->>Viewer: Report appears in live feed

    Viewer->>React: Click "Corroborate" on a report
    React->>Firestore: updateDoc(report, { corroborations: increment(1) })
    Firestore-->>React: Updated corroboration count
    React-->>Viewer: Count incremented in real time

    Note over React: Community score for UPI = reports × weight + corroborations × weight
```
