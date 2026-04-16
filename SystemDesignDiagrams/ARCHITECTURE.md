# AegisAI — System Architecture

> Render this file in GitHub, VS Code (Markdown Preview), or paste into [mermaid.live](https://mermaid.live)
> All diagrams are also pre-rendered as PNGs in `_render/`

---

## Rendered Diagram Gallery

### Diagram 07 — Full System Architecture
![Full System Architecture](./_render/07_full_architecture.png)

### Diagram 08 — Fraud Detection Pipeline
![Fraud Detection Pipeline](./_render/08_fraud_detection_pipeline.png)

### Diagram 09 — Payment Journey Sequence
![Payment Journey Sequence](./_render/09_payment_journey.png)

### Diagram 10 — Fraud Ring Algorithm
![Fraud Ring Algorithm](./_render/10_fraud_ring_algorithm.png)

### Diagram 11 — Financial Health Score Model
![Financial Health Score Model](./_render/11_health_score_model.png)

### Diagram 12 — Feature Mind Map
![Feature Mind Map](./_render/12_feature_map.png)

### Diagram 13 — Data Flow Diagram
![Data Flow Diagram](./_render/13_data_flow.png)

### Diagram 14 — Week-by-Week Evolution Timeline
![Week Evolution Timeline](./_render/14_week_evolution.png)

---

## 1. Full Stack Architecture (Week 1–17) — Mermaid Source

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

---

---

## 2. Complete 5-Layer System Architecture (Week 9–17 Updated)

![Full System Architecture](./_render/07_full_architecture.png)

```mermaid
graph TB
    subgraph USER["👤 User Layer"]
        U1[Mobile Browser]
        U2[Desktop Browser]
    end

    subgraph FRONTEND["⚛️ React 18 Frontend — Vite + TailwindCSS"]
        direction TB
        F1[🏠 Dashboard & Core Banking\nWeek 1]
        F2[🔐 Firebase Auth\nGoogle OAuth]
        F3[🤖 AI Features\nVoice · DNA · Future Risk]
        F4[📊 AI Insights\nChronicle · Budget · Explainer]
        F5[🛡️ Advanced AI\nFraud Ring · Health Score · Shield]
        F6[📈 ML Analytics Panel\n20 features]
    end

    subgraph FIREBASE["🔥 Firebase Cloud"]
        FB1[(Firestore\n10 Collections)]
        FB2[Firebase Auth\nJWT Tokens]
        FB3[Real-time\nonSnapshot Listeners]
    end

    subgraph FLASK["🐍 Flask ML Server — Python :5000"]
        direction TB
        ML1[Random Forest\n22 Features · .pkl]
        ML2[Isolation Forest\nDrift Detection]
        ML3[SHAP Explainer\n6-Factor Attribution]
        ML4[Week 9–11 APIs\nVoice · DNA · Risk]
        ML5[Week 12–14 APIs\nStory · Budget · Explain]
        ML6[Week 15–17 APIs\nRing · Health · Shield]
    end

    subgraph ALGORITHMS["⚙️ Core Algorithms"]
        A1[Union-Find\nFraud Ring Clustering]
        A2[Levenshtein Distance\nUPI Spoof Detection]
        A3[Z-Score\nAmount Anomaly]
        A4[DOW Multipliers\nTemporal Risk Weights]
        A5[Force-Directed Layout\nSpring Physics Graph]
        A6[SHAP Attribution\nFactor Breakdown]
    end

    U1 & U2 --> FRONTEND
    FRONTEND <-->|Firebase SDK| FB1
    FRONTEND <-->|OAuth| FB2
    FB1 <--> FB3
    FRONTEND <-->|Axios HTTP| FLASK
    FLASK --> ALGORITHMS
    ML1 & ML2 & ML3 --> FLASK

    style USER fill:#1e1b4b,stroke:#6366f1,color:#c7d2fe
    style FRONTEND fill:#0f172a,stroke:#3b82f6,color:#bfdbfe
    style FIREBASE fill:#1c1917,stroke:#f97316,color:#fed7aa
    style FLASK fill:#0f2b1e,stroke:#10b981,color:#a7f3d0
    style ALGORITHMS fill:#1a0a2e,stroke:#8b5cf6,color:#ddd6fe
```

---

---

## 3. Week-by-Week Feature Evolution Timeline

![Week Evolution Timeline](./_render/14_week_evolution.png)

```mermaid
timeline
    title AegisAI Feature Evolution — Week 1 to Week 17
    section Core Platform
        Week 1  : Dashboard · Send Money · QR Pay
                : Request Money · Budget · AI Assistant
                : Notifications · Transactions · Statements
        Week 2  : Split Bill · Recurring Payments
        Week 3  : Savings Goals · EMI Calculator
    section Fraud Defense
        Week 4  : Live Fraud Feed · Dispute Center
        Week 5  : Biometric Guard
        Week 6  : AI Spending Coach
        Week 7  : Contact Trust Score · Community Reports
        Week 8  : Fraud Timeline · Payment Health · Security Badges
    section Innovative AI
        Week 9  : Voice Pay Assistant
                : Web Speech API + NLP Intent Parser
        Week 10 : Spending DNA Analyzer
                : 8-Dimension RadarChart + Anomaly Ring
        Week 11 : Future Risk Predictor
                : 7-Day DOW Forecast AreaChart
    section AI Insights
        Week 12 : AI Financial Chronicle
                : Typewriter-animated 5-chapter narrative
        Week 13 : Smart Budget Predictor
                : Velocity tracking + exhaustion date alert
        Week 14 : Transaction Anomaly Explainer
                : SHAP-style 6-factor split-panel forensics
    section Advanced Intelligence
        Week 15 : Fraud Ring Detector
                : Union-Find + SVG Force-Directed Graph
        Week 16 : Financial Health Score
                : 0-850 composite · 6 dimensions · A+→D grade
        Week 17 : Pre-Payment Shield
                : Levenshtein spoof check · 6-factor gate
```

---

---

## 4. Algorithm Decision Map

```mermaid
flowchart LR
    subgraph INPUT["User Action"]
        I1[Send Money]
        I2[View Analytics]
        I3[Check Network]
    end

    subgraph ALGO["Algorithm Selection"]
        A1{Is it a\npre-send check?}
        A2{Is it network\nanalysis?}
        A3{Is it a single\ntransaction?}
        A4{Is it a\nhealth check?}
    end

    subgraph METHODS["Algorithms Applied"]
        M1[Levenshtein Distance\nUPI spoof similarity]
        M2[Z-Score\nAmount anomaly vs baseline]
        M3[DOW Risk Multipliers\nTemporal weighting]
        M4[Union-Find\nCluster connected accounts]
        M5[Force-Directed Layout\nSpring physics positioning]
        M6[SHAP Attribution\n6-factor risk breakdown]
        M7[Random Forest\n22-feature fraud scoring]
        M8[Composite Scoring\n6 weighted dimensions]
    end

    I1 --> A1
    I2 --> A4
    I3 --> A2
    A1 -->|Yes| M1 & M2 & M3
    A2 -->|Yes| M4 & M5
    A3 -->|Yes| M6 & M7
    A4 -->|Yes| M8

    style INPUT fill:#1e1b4b,stroke:#6366f1,color:#c7d2fe
    style ALGO fill:#0f172a,stroke:#3b82f6,color:#bfdbfe
    style METHODS fill:#0f2b1e,stroke:#10b981,color:#a7f3d0
```
