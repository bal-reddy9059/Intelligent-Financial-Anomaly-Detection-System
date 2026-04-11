# AegisAI — ML Data Flow & Pipeline

> GAN training, feature engineering, and real-time inference pipeline

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
