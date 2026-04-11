# AegisAI — System Architecture

> Render this file in GitHub, VS Code (Markdown Preview), or paste into [mermaid.live](https://mermaid.live)

---

## Full Stack Architecture

```mermaid
graph TB
    subgraph CLIENT["🌐 Client — React 18 + Vite (localhost:5173)"]
        direction TB
        UI["React UI Layer<br/>Tailwind CSS · Framer Motion · Radix UI"]
        ROUTER["React Router DOM<br/>30+ routes"]
        STATE["Component State<br/>useState · useEffect · useRef"]

        subgraph PAGES["54 Feature Components"]
            P1["💳 Core Payments<br/>Send · QR · Request · Budget"]
            P2["🛡️ Fraud & Security<br/>Live Feed · Dispute · Biometric · Watchlist"]
            P3["🧠 AI & Analytics<br/>Hub · Coach · Timeline · Heatmap"]
            P4["📊 ML Operations<br/>Upload · Explore · Detect · Compare"]
            P5["🏆 Gamification<br/>Badges · Health · Trust · Community"]
        end

        UI --> ROUTER --> STATE
        STATE --> PAGES
    end

    subgraph FIREBASE["🔥 Firebase Cloud"]
        direction LR
        AUTH["Firebase Auth<br/>Google Sign-In<br/>JWT Tokens"]
        FS["Cloud Firestore<br/>10 Collections<br/>Real-time NoSQL"]

        subgraph COLLECTIONS["Firestore Collections"]
            C1["users"]
            C2["transactions"]
            C3["notifications"]
            C4["biometricProfiles"]
            C5["coachChats"]
            C6["communityReports"]
            C7["userBadges"]
            C8["disputes · cooldowns<br/>beneficiaries · splitGroups<br/>recurringPayments · savingsGoals"]
        end

        FS --> COLLECTIONS
    end

    subgraph FLASK["⚗️ Flask REST API (localhost:5000)"]
        direction TB
        API["Flask + Flask-CORS<br/>40+ Endpoints"]

        subgraph MODELS["ML Model Layer"]
            RF["Random Forest<br/>best_rf_model.pkl<br/>22 features → fraud probability"]
            IF["Isolation Forest<br/>Unsupervised anomaly<br/>configurable contamination"]
            AE["Autoencoder<br/>TensorFlow/Keras<br/>reconstruction error threshold"]
            GAN["GAN<br/>Synthetic data generator<br/>class balancing"]
        end

        subgraph ENDPOINTS["Endpoint Groups"]
            E1["Fraud Detection<br/>/predict · /check-single · /batch-check"]
            E2["Explainability<br/>/explain · /counterfactual · /similarity-search"]
            E3["Analytics<br/>/cluster-analysis · /fraud-trends · /network-analysis"]
            E4["Financial Tools<br/>/emi · /split-bill · /savings-goals · /recurring-payments"]
            E5["Week 5–8<br/>/biometric-verify · /spending-coach · /fraud-forecast<br/>/payment-health · /dark-pattern-check · /community-score"]
        end

        API --> MODELS
        API --> ENDPOINTS
        RF & IF & AE --> E1
    end

    subgraph SECURITY["🔐 Security Layers"]
        S1["Known Fraud UPI Blocklist<br/>40+ flagged IDs — instant block"]
        S2["WebAuthn Biometric<br/>Windows Hello · Face ID · Fingerprint"]
        S3["Pattern Lock<br/>3×3 grid · localStorage"]
        S4["Dark Pattern Scanner<br/>8 scam phrase patterns"]
        S5["Velocity Guard<br/>Cooling-off periods"]
        S6["Community Reports<br/>Crowd-sourced fraud intel"]
    end

    CLIENT -->|"Firebase SDK"| FIREBASE
    CLIENT -->|"Axios HTTP"| FLASK
    CLIENT --> SECURITY
    FIREBASE -->|"Firestore Rules"| FS

    style CLIENT fill:#1e3a5f,stroke:#3b82f6,color:#e0f2fe
    style FIREBASE fill:#7c2d12,stroke:#f97316,color:#fed7aa
    style FLASK fill:#14532d,stroke:#22c55e,color:#dcfce7
    style SECURITY fill:#4a044e,stroke:#a855f7,color:#f3e8ff
```

---

## Component Communication Pattern

```mermaid
graph LR
    subgraph AUTH["Auth Layer"]
        GA["Google Auth"] --> FAU["Firebase Auth"]
        FAU --> JWT["JWT Token"]
    end

    subgraph FRONTEND["Frontend"]
        JWT --> RC["React Components"]
        RC -->|"getDocs / addDoc / setDoc"| FSR["Firestore Rules"]
        RC -->|"axios.post()"| FLASK2["Flask API"]
    end

    subgraph BACKEND["Backend"]
        FSR -->|"Authenticated"| DB["Firestore DB"]
        FLASK2 -->|"predict(features)"| ML["ML Models"]
        ML -->|"verdict + score"| FLASK2
    end

    FLASK2 -->|"JSON response"| RC
    DB -->|"Real-time snapshot"| RC
```

---

## Fraud Decision Flow

```mermaid
flowchart TD
    A([User initiates payment]) --> B{UPI in fraud blocklist?}
    B -->|YES — instant| C[🔴 HIGH RISK<br/>Block immediately<br/>Send Firestore notification]
    B -->|NO| D[Fetch 22 transaction features]
    D --> E{Dark pattern in remarks?}
    E -->|YES| F[⚠️ Show warning banner]
    E -->|NO| G[Call /check-single]
    F --> G
    G --> H{Ensemble verdict}
    H -->|score ≥ 0.70| I[🔴 HIGH RISK → BLOCK]
    H -->|score 0.40–0.69| J[🟡 MEDIUM → REVIEW]
    H -->|score < 0.40| K[🟢 LOW → APPROVE]
    I --> L[Blocked modal + notification]
    J --> M[Warning shown, user chooses]
    K --> N[Auth Choice Screen]
    M --> N
    N --> O{Biometric method}
    O -->|Fingerprint/Face| P[WebAuthn navigator.credentials.get]
    O -->|Pattern Lock| Q[3×3 grid verify vs localStorage]
    O -->|PIN| R[4-digit PIN verify]
    P & Q & R -->|Verified| S[Process transaction]
    S --> T[Firestore write + notification]
    T --> U([Dashboard updated])
```
```

---

## Infrastructure Overview

```mermaid
graph TB
    subgraph PROD["Production / Development"]
        DEV["Developer Machine"]

        subgraph SERVICES["Running Services"]
            VITE["Vite Dev Server<br/>:5173<br/>React 18 HMR"]
            FLASK3["Flask Server<br/>:5000<br/>Python 3"]
        end

        DEV --> SERVICES
    end

    subgraph CLOUD["Google Cloud / Firebase"]
        FAUTH["Firebase Auth<br/>OAuth 2.0"]
        FST["Firestore<br/>NoSQL Database"]
        FRUL["Security Rules<br/>Per-collection ACL"]
    end

    VITE -->|"HTTPS"| FAUTH
    VITE -->|"Firestore SDK"| FST
    FST --> FRUL
    VITE -->|"HTTP localhost"| FLASK3
    FLASK3 -->|"pkl + TF models"| ML2["ML Inference<br/>In-process"]

    style PROD fill:#1e293b,stroke:#475569,color:#e2e8f0
    style CLOUD fill:#1e3a5f,stroke:#3b82f6,color:#e0f2fe
```
