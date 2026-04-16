# AegisAI — ML Data Flow & Pipeline

> GAN training, feature engineering, and real-time inference pipeline.
> Pre-rendered PNGs are embedded below each section where available.

---

## Pre-Rendered Diagram Gallery

### Data Flow Overview
![Data Flow Diagram](./_render/13_data_flow.png)

### Fraud Ring Detection Algorithm
![Fraud Ring Algorithm](./_render/10_fraud_ring_algorithm.png)

### Financial Health Score Model
![Health Score Model](./_render/11_health_score_model.png)

---

## Complete ML Pipeline

```mermaid
flowchart TD
    subgraph DATAGEN["📦 Phase 1 — Data Generation"]
        RAW["Raw Transaction Data<br/>CSV / Firestore"]
        GAN_G["GAN Generator<br/>noise → synthetic fraud records"]
        GAN_D["GAN Discriminator<br/>real vs synthetic classifier"]
        SYNTH["Synthetic Dataset<br/>balanced fraud + legitimate"]

        RAW --> GAN_D
        GAN_G -->|"synthetic samples"| GAN_D
        GAN_D -->|"adversarial feedback"| GAN_G
        GAN_G --> SYNTH
    end

    subgraph PREP["🔧 Phase 2 — Feature Engineering"]
        MERGE["Merge Real + Synthetic Data"]
        CLEAN["Clean: handle nulls, outliers"]
        ENC["Encode: one-hot categoricals"]
        NORM["Normalize: StandardScaler<br/>mean=0, std=1"]
        SPLIT["Train 80% / Test 20%"]

        SYNTH --> MERGE
        RAW --> MERGE
        MERGE --> CLEAN --> ENC --> NORM --> SPLIT
    end

    subgraph TRAIN["🎯 Phase 3 — Model Training"]
        direction LR

        subgraph RF_TRAIN["Random Forest"]
            RF_FIT["Fit RandomForestClassifier<br/>n_estimators=100<br/>max_depth=10"]
            RF_CV["Cross-Validation<br/>5-fold stratified"]
            RF_TUNE["Hyperparameter Tuning<br/>GridSearchCV"]
            RF_PKL["Save best_rf_model.pkl"]
            RF_FIT --> RF_CV --> RF_TUNE --> RF_PKL
        end

        subgraph IF_TRAIN["Isolation Forest"]
            IF_FIT["Fit IsolationForest<br/>contamination=0.05<br/>n_estimators=100"]
            IF_THRESH["Compute score thresholds"]
            IF_FIT --> IF_THRESH
        end

        subgraph AE_TRAIN["Autoencoder (TF/Keras)"]
            AE_LEGIT["Train on LEGITIMATE only<br/>(learns normal pattern)"]
            AE_ARCH["Architecture:<br/>22→16→8→16→22"]
            AE_THRESH2["Set fraud threshold =<br/>95th percentile<br/>reconstruction error"]
            AE_LEGIT --> AE_ARCH --> AE_THRESH2
        end

        SPLIT --> RF_TRAIN
        SPLIT --> IF_TRAIN
        SPLIT --> AE_TRAIN
    end

    subgraph EVAL["📊 Phase 4 — Evaluation"]
        METRICS["Metrics:<br/>Accuracy · Precision · Recall<br/>F1-Score · AUC-ROC"]
        CM["Confusion Matrix"]
        ROC["ROC Curve"]
        FI["Feature Importance<br/>Rankings (RF)"]

        RF_PKL --> METRICS
        METRICS --> CM & ROC & FI
    end

    subgraph INFER["⚡ Phase 5 — Real-time Inference"]
        direction TB
        TX["New Transaction<br/>{ amount, recipient, device, ... }"]
        FE["Feature Extraction<br/>22 parameters computed"]
        SC["StandardScaler.transform()"]

        TX --> FE --> SC

        subgraph ENSEMBLE["Ensemble Scoring"]
            RF_PRED["RF: predict_proba(x)<br/>→ rf_score"]
            IF_PRED["IF: decision_function(x)<br/>→ if_score normalized"]
            AE_PRED["AE: reconstruct(x)<br/>→ reconstruction_error > threshold?"]
        end

        SC --> RF_PRED & IF_PRED & AE_PRED

        VOTE["Weighted Vote<br/>RF×0.5 + IF×0.25 + AE×0.25"]
        RF_PRED & IF_PRED & AE_PRED --> VOTE

        VERDICT["Final Verdict<br/>LOW / MEDIUM / HIGH<br/>+ confidence score"]
        VOTE --> VERDICT
    end

    subgraph EXPLAIN["🔍 Phase 6 — Explainability"]
        ZSCORE["Z-Score per feature<br/>(deviation from mean)"]
        PCTILE["Percentile rank<br/>vs. training distribution"]
        CF["Counterfactual:<br/>minimal changes to flip verdict"]
        SIM["Similarity Search:<br/>k-NN nearest transactions"]
        NL["Natural Language<br/>Fraud Summary"]

        VERDICT --> ZSCORE & PCTILE & CF & SIM
        ZSCORE & PCTILE --> NL
    end

    TRAIN --> EVAL --> INFER --> EXPLAIN

    style DATAGEN fill:#1e3a5f,stroke:#3b82f6,color:#e0f2fe
    style PREP fill:#14532d,stroke:#22c55e,color:#dcfce7
    style TRAIN fill:#4a044e,stroke:#a855f7,color:#f3e8ff
    style EVAL fill:#7c2d12,stroke:#f97316,color:#fed7aa
    style INFER fill:#1e293b,stroke:#475569,color:#f8fafc
    style EXPLAIN fill:#064e3b,stroke:#10b981,color:#d1fae5
```

---

## Feature Engineering Pipeline

```mermaid
flowchart LR
    subgraph INPUT["Raw Transaction"]
        A1["amount"]
        A2["recipient_upi"]
        A3["sender_upi"]
        A4["timestamp"]
        A5["device_id"]
        A6["location"]
        A7["remarks"]
    end

    subgraph DERIVED["Derived Features (22 total)"]
        direction TB
        F1["Amount Features<br/>raw amount<br/>normalized amount<br/>high-value flag"]
        F2["Velocity Features<br/>tx frequency (24h)<br/>time since last tx<br/>daily limit exceeded"]
        F3["Trust Features<br/>recipient blacklist<br/>verification status<br/>social trust score<br/>fraud complaint count"]
        F4["Device Features<br/>device fingerprint risk<br/>VPN/proxy usage<br/>behavioral biometrics"]
        F5["Location Features<br/>geo-normal flag<br/>geo-unusual flag<br/>location inconsistency"]
        F6["Temporal Features<br/>high-risk time window<br/>past fraud flags"]
        F7["Context Features<br/>merchant category match<br/>transaction context anomaly<br/>account age"]
    end

    INPUT --> DERIVED

    DERIVED --> SCALER["StandardScaler<br/>μ=0, σ=1"]
    SCALER --> MODELS["RF · IF · AE<br/>Ensemble"]
```

---

## GAN Training Flow

```mermaid
flowchart TD
    NOISE["Random Noise Vector<br/>z ~ N(0,1)"]
    GEN["Generator Network<br/>Dense layers<br/>z → synthetic_tx"]
    REAL["Real Transaction Data<br/>from CSV dataset"]

    subgraph DISC["Discriminator Network"]
        D_IN["Input: real OR synthetic tx"]
        D_OUT["Output: P(real) 0→1"]
        D_IN --> D_OUT
    end

    NOISE --> GEN
    GEN -->|"fake samples"| DISC
    REAL -->|"real samples"| DISC

    DISC -->|"gradient feedback"| GEN
    DISC -->|"own gradient"| DISC

    GEN -->|"generator loss BCE"| GL["Generator improves<br/>fool discriminator"]
    DISC -->|"discriminator loss BCE"| DL["Discriminator improves<br/>spot fakes better"]

    GL & DL -->|"adversarial equilibrium"| SYNTH2["High-Quality<br/>Synthetic Fraud Samples"]

    SYNTH2 --> AUG["Augmented Dataset<br/>Balanced fraud:legitimate ratio"]
    AUG --> RF_TRAIN2["Train Random Forest<br/>on augmented data"]
```

---

## Anomaly Detection Modes

```mermaid
flowchart LR
    PRESET["Detection Preset"]

    PRESET --> QUICK["⚡ Quick<br/>contamination=0.03<br/>IF only<br/>Fast, low recall"]
    PRESET --> BALANCED["⚖️ Balanced<br/>contamination=0.05<br/>IF + AE ensemble<br/>Recommended"]
    PRESET --> PRECISION["🎯 Precision<br/>contamination=0.08<br/>RF + IF + AE ensemble<br/>Highest recall"]

    QUICK & BALANCED & PRECISION --> RESULTS["Detection Results<br/>anomaly_indices[]<br/>scores[]<br/>cluster_assignments[]"]

    RESULTS --> VIZ["Visualizations<br/>Confusion Matrix<br/>ROC Curve<br/>Anomaly Distribution<br/>Cluster Chart"]
    RESULTS --> NL2["AI Natural Language<br/>Summary Report"]
    RESULTS --> DRIFT["Dataset Drift Check<br/>vs. baseline distribution"]
```

---

## Week 9–11: AI Feature Data Flows

### Voice Pay Data Flow

```mermaid
flowchart LR
    subgraph BROWSER["🎙️ Browser"]
        SR["SpeechRecognition\nlang: en-IN\ninterimResults: true"]
        TR["Raw Transcript\nstring"]
    end

    subgraph NLP["🔤 Client-side NLP"]
        P1["Regex: intent\nsend|pay|check|show"]
        P2["Regex: amount\n\\d+ hundred|thousand|k"]
        P3["Regex: recipient\nto [name@upi]"]
        P4["Regex: remarks\nfor [purpose]"]
        RESULT["Parsed Intent\n{ intent, amount,\nrecipient, remarks }"]
    end

    subgraph FLASK["🐍 Flask"]
        VP["/voice-parse\nServer NLP backup"]
    end

    subgraph ACTION["🚀 Action"]
        NAV["navigate()\n/send-money?amount=X\n&recipient=Y&remarks=Z"]
        SHOW["Show transactions\n/transactions"]
        BAL["Show balance\n/dashboard"]
    end

    SR --> TR --> P1 & P2 & P3 & P4 --> RESULT
    RESULT --> FLASK
    RESULT -->|intent=SEND| NAV
    RESULT -->|intent=HISTORY| SHOW
    RESULT -->|intent=BALANCE| BAL

    style BROWSER fill:#0f172a,stroke:#3b82f6,color:#bfdbfe
    style NLP fill:#1a0a2e,stroke:#8b5cf6,color:#ddd6fe
    style FLASK fill:#0f2b1e,stroke:#10b981,color:#a7f3d0
    style ACTION fill:#1e1b4b,stroke:#6366f1,color:#c7d2fe
```

### Spending DNA Data Flow

```mermaid
flowchart TD
    TXS[(Firestore\nTransactions)]

    subgraph SPLIT["📅 Time Split"]
        CUR["Current month\ntransactions"]
        BASE["Last month\ntransactions"]
    end

    subgraph DNA["🧬 8 DNA Dimensions"]
        D1["🍔 Food & Dining\nKeywords: swiggy, zomato, restaurant"]
        D2["🛍️ Shopping\nKeywords: amazon, flipkart, myntra"]
        D3["🚗 Transport\nKeywords: uber, ola, metro"]
        D4["🎬 Entertainment\nKeywords: netflix, spotify, cinema"]
        D5["🏥 Healthcare\nKeywords: pharmacy, hospital, clinic"]
        D6["💡 Utilities\nKeywords: electricity, wifi, recharge"]
        D7["📚 Education\nKeywords: course, tuition, books"]
        D8["📦 Other\nAll remaining transactions"]
    end

    subgraph ANOMALY["🔍 Anomaly Score"]
        MAD["Mean Absolute Deviation\nbetween baseline and current"]
        SCORE["anomalyScore = MAD × 2\nclamped 0–100"]
        FLAGS["Flag dimensions\nwith ≥15% shift"]
    end

    TXS --> SPLIT
    CUR & BASE --> D1 & D2 & D3 & D4 & D5 & D6 & D7 & D8
    D1 & D2 & D3 & D4 & D5 & D6 & D7 & D8 --> MAD --> SCORE --> FLAGS

    style SPLIT fill:#1e1b4b,stroke:#6366f1,color:#c7d2fe
    style DNA fill:#0f2b1e,stroke:#10b981,color:#a7f3d0
    style ANOMALY fill:#1c0a0a,stroke:#ef4444,color:#fecaca
```

### Future Risk Predictor Data Flow

```mermaid
flowchart LR
    subgraph INPUT["📥 Inputs"]
        UPI["Target UPI ID"]
        TXS["User Transactions"]
        COMM["Community Reports"]
    end

    subgraph SCORING["⚙️ 4-Factor Scoring"]
        V["Velocity Score\n0–40 pts\nBased on tx frequency"]
        A["Amount Score\n0–20 pts\nBased on avg tx size"]
        F["Fraud Score\n0–30 pts\nBased on past fraud flags"]
        C["Community Score\n0–10 pts\nBased on community reports"]
        BASE["base_risk = V + A + F + C"]
    end

    subgraph DOW["📅 Day-of-Week Multipliers"]
        SUN["Sunday × 1.4"]
        MON["Monday × 0.7"]
        TUE["Tuesday × 0.8"]
        WED["Wednesday × 0.9"]
        THU["Thursday × 1.0"]
        FRI["Friday × 1.3"]
        SAT["Saturday × 1.5"]
    end

    subgraph OUTPUT["📤 7-Day Forecast"]
        DAY1["Today"]
        DAY2["Tomorrow"]
        DAY3["Day 3"]
        DAY4["Day 4"]
        DAY5["Day 5"]
        DAY6["Day 6"]
        DAY7["Day 7"]
    end

    INPUT --> SCORING
    BASE --> DOW
    DOW --> OUTPUT

    style INPUT fill:#1e1b4b,stroke:#6366f1,color:#c7d2fe
    style SCORING fill:#0f2b1e,stroke:#10b981,color:#a7f3d0
    style DOW fill:#1a0a2e,stroke:#8b5cf6,color:#ddd6fe
    style OUTPUT fill:#1c1917,stroke:#f97316,color:#fed7aa
```

---

## Week 12–14: AI Insight Data Flows

### Budget Predictor Data Flow

```mermaid
flowchart TD
    TXS[(Firestore Transactions)]
    NOW["Today\nDay M of N days in month"]

    subgraph VELOCITY["⚡ Velocity Calculation"]
        SPENT["spentSoFar = Σ this-month amounts"]
        ELAPSED["daysElapsed = day of month"]
        VEL["dailyVelocity = spentSoFar / daysElapsed"]
    end

    subgraph PROJECTION["📈 Month-End Projection"]
        LEFT["daysLeft = N - M"]
        PROJ["projectedTotal = spentSoFar + velocity × daysLeft"]
        BUDGET["autoBudget = manual OR lastMonth × 1.1"]
        REM["remaining = budget - spentSoFar"]
        SAFE["safeDaily = remaining / daysLeft"]
    end

    subgraph ALERT["🚨 Exhaustion Alert"]
        CHECK{velocity > safeDaily?}
        DAYS["daysToExhaust = remaining / velocity"]
        DATE["exhaustionDate = today + daysToExhaust"]
    end

    subgraph RISK["🎚️ Risk Level"]
        BURN["burnRate = projectedTotal / budget"]
        R1["SAFE < 0.85"]
        R2["MEDIUM 0.85–1.0"]
        R3["HIGH 1.0–1.2"]
        R4["CRITICAL > 1.2"]
    end

    TXS & NOW --> VELOCITY
    VELOCITY --> PROJECTION
    PROJECTION --> CHECK
    CHECK -->|Yes| DAYS --> DATE
    PROJECTION --> BURN --> R1 & R2 & R3 & R4

    style VELOCITY fill:#1e1b4b,stroke:#6366f1,color:#c7d2fe
    style PROJECTION fill:#0f2b1e,stroke:#10b981,color:#a7f3d0
    style ALERT fill:#1c0a0a,stroke:#ef4444,color:#fecaca
    style RISK fill:#1a0a2e,stroke:#8b5cf6,color:#ddd6fe
```

---

## Week 15–17: Advanced AI Data Flows

### Fraud Ring Detection Data Flow

```mermaid
flowchart LR
    TXS[(All Transactions)]

    subgraph GRAPH["Build Graph"]
        NODES["Extract unique\nUPI IDs as nodes"]
        EDGES["Each transaction\n= directed edge"]
        RISK["Set node risk:\nHIGH_RISK → 90\nMEDIUM_RISK → 55\nSAFE → 10"]
    end

    subgraph UF["Union-Find"]
        UF1["Initialize parent[x] = x\nfor all nodes"]
        UF2["For each edge:\nunion(src, dst)"]
        UF3["find() with\npath compression"]
        UF4["clusters() =\ngroup by root"]
    end

    subgraph PROPAGATE["Risk Propagation"]
        SCAN["For each cluster:\nmaxRisk = max(node.risk)"]
        LIFT{maxRisk >= 75?}
        RAISE["Elevate low-risk nodes\nto min 35"]
        RING["Mark cluster\nas Fraud Ring"]
    end

    TXS --> GRAPH
    NODES & EDGES & RISK --> UF
    UF4 --> PROPAGATE
    SCAN --> LIFT
    LIFT -->|Yes| RAISE --> RING

    style GRAPH fill:#1e1b4b,stroke:#6366f1,color:#c7d2fe
    style UF fill:#1a0a2e,stroke:#8b5cf6,color:#ddd6fe
    style PROPAGATE fill:#1c0a0a,stroke:#ef4444,color:#fecaca
```

### Pre-Payment Shield Data Flow

```mermaid
flowchart TD
    subgraph INPUTS["📥 User Inputs"]
        UPI["Target UPI ID"]
        AMT["Amount ₹"]
        KNOWN["All known UPIs\nfrom history"]
        HIST["Transaction history"]
    end

    subgraph FACTOR1["Factor 1 — Spoof Detection"]
        LEV["Levenshtein(targetUPI, each known UPI)"]
        SPOOF{minDistance\n<= 2 and > 0?}
        SPOOF_Y["Risk: HIGH 85/100"]
        SPOOF_N["Risk: SAFE 5/100"]
    end

    subgraph FACTOR2["Factor 2 — Amount Z-Score"]
        AVG["avgAmount from history"]
        STD["stdAmount from history"]
        Z["z = (amount - avg) / std"]
        Z_H{z > 2?}
        Z_M{z > 1?}
    end

    subgraph VERDICT["⚖️ Final Verdict"]
        COMPOSITE["compositeRisk = avg(all 6 factor scores)"]
        HIGH_CNT["highCount = factors with risk=high"]
        V{Decision}
        BLOCK["🔴 BLOCK\nhighCount>=2 or risk>=65"]
        CAUTION["🟡 CAUTION\nhighCount>=1 or risk>=35"]
        ALLOW["🟢 ALLOW\nAll clear"]
    end

    INPUTS --> FACTOR1 & FACTOR2
    SPOOF -->|Yes| SPOOF_Y
    SPOOF -->|No| SPOOF_N
    Z_H -->|Yes| Z_HIGH["HIGH 80/100"]
    Z_M -->|Yes| Z_MED["MEDIUM 45/100"]

    SPOOF_Y & SPOOF_N & Z_HIGH & Z_MED --> COMPOSITE
    COMPOSITE & HIGH_CNT --> V
    V --> BLOCK & CAUTION & ALLOW

    style INPUTS fill:#1e1b4b,stroke:#6366f1,color:#c7d2fe
    style FACTOR1 fill:#1c0a0a,stroke:#ef4444,color:#fecaca
    style FACTOR2 fill:#1a0a2e,stroke:#8b5cf6,color:#ddd6fe
    style VERDICT fill:#0f2b1e,stroke:#10b981,color:#a7f3d0
    style BLOCK fill:#7f1d1d,stroke:#ef4444,color:#fecaca
    style ALLOW fill:#064e3b,stroke:#10b981,color:#a7f3d0
```
