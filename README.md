# SafePayAI — Intelligent Financial Anomaly Detection System

SafePayAI is an advanced fraud detection and prevention platform designed to safeguard digital transactions using cutting-edge artificial intelligence. It combines Generative Adversarial Networks (GANs) for synthetic data generation, a Random Forest classifier for primary fraud prediction, and an ensemble of Isolation Forest and Autoencoder models for deep anomaly analysis — all surfaced through a real-time React dashboard.

---

## Achievements and Recognition

- **1st Place Winner** — DigiPay Pro NPCI Competition, IIT Bombay Techfest 2024
- **Prize Pool:** ₹1,00,000
- **95% Fraud Detection Accuracy**

### Why SafePayAI Stood Out
- **Innovative Approach:** Combined GANs and Random Forest models, augmented with Isolation Forest and Autoencoder ensemble detection.
- **Real-World Applicability:** Scalable, future-proof fraud detection adaptable to UPI payment systems.
- **User-Centric Design:** Responsive UI with Google Sign-In, live dashboards, interactive gauges, and AI-driven explanations.

---

## Project Structure

```
Intelligent-Financial-Anomaly-Detection-System/
├── AI_model_Py_Scripts/            # Jupyter notebooks for GAN training & dataset generation
│   ├── DataSetGeneratorUSingNumpy.ipynb
│   ├── FraudDetectionUSingGAN.ipynb
│   └── fraud_dataset_Generator_using_numpy.csv
├── AI_model_server_Flask/          # Flask REST API + ML models
│   ├── app.py
│   ├── best_rf_model (1).pkl       # Pre-trained Random Forest model
│   └── requirements.txt
├── fraudAI_Frontend_React/         # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── logic/              # Feature components
│   │   │   └── ui/                 # Radix UI primitives
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── SystemDesignDiagrams/           # Architecture & workflow diagrams
│   ├── SystemDesign.png
│   ├── AIMODEL_VISUAL.png
│   └── WorkFlowDiagram.png
├── seed-fraud-users.mjs            # Firestore seeding script
└── README.md
```

---

## Tech Stack

### Frontend
- [React 18](https://reactjs.org/) — UI framework
- [Vite](https://vitejs.dev/) — Build tool
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first styling
- [Framer Motion](https://www.framer.com/motion/) — Animations
- [Radix UI](https://www.radix-ui.com/) — Accessible UI primitives
- [Recharts](https://recharts.org/) — Data visualizations
- [React Router DOM](https://reactrouter.com/) — Client-side routing
- [Axios](https://axios-http.com/) — HTTP client
- [Firebase](https://firebase.google.com/) — Authentication & Firestore database

### Backend
- [Python](https://www.python.org/) / [Flask](https://flask.palletsprojects.com/) — REST API server
- [scikit-learn](https://scikit-learn.org/) — Random Forest, Isolation Forest, StandardScaler
- [TensorFlow / Keras](https://www.tensorflow.org/) — Autoencoder model
- [NumPy](https://numpy.org/) / [Pandas](https://pandas.pydata.org/) — Data processing
- [Firebase Admin](https://firebase.google.com/) — Firestore backend
- Generative Adversarial Networks (GAN) — Synthetic data generation

---

## Key Features

### Authentication & User Management
- Google Sign-In via Firebase Authentication
- Automatic UPI ID assignment on first login
- Private route protection and session persistence

### Transaction Dashboard
- Account balance display
- Monthly spending trend (line chart)
- Category-wise spending breakdown (pie chart)
- 5 most recent transactions at a glance
- ML fraud statistics integration

### Send Money with Fraud Verification
- Enter recipient UPI ID, amount, and remarks
- One-click AI fraud verification before sending
- Transaction recorded in Firestore on approval

### Transaction History & Statements
- Full paginated transaction history
- Statements view with date filtering
- Saved beneficiary management

### Single Transaction Fraud Check
- Interactive arc gauge showing fraud probability (0–100%)
- Risk level badge: LOW / MEDIUM / HIGH
- Recommended action: APPROVE / REVIEW / BLOCK
- Per-feature suspicious flag display
- Ensemble model agreement scoring (RF + Isolation Forest + Autoencoder)

### Batch Transaction Check
- Upload up to 50 transactions in one request
- Bulk fraud probability scoring
- Results table with per-row risk levels

### ML Operations — Upload & Explore Data
- CSV upload with AI-powered data quality grading (A–D scale)
- Detects class imbalance, missing values, and zero-variance features
- Dataset statistics: shape, feature types, correlation matrix
- Daily transaction volume trend charts

### ML Operations — Run Anomaly Detection
- Three detection presets: **Quick**, **Balanced**, **Precision**
- Configurable contamination threshold
- Model selector: Isolation Forest, Autoencoder, or Ensemble
- Results visualization: confusion matrix, ROC curve, anomaly distribution

### AI Hub & Insights
- Natural language fraud summary report after detection
- Cluster analysis: groups anomalies into fraud pattern clusters
- Fraud velocity trends and feature deviation analysis
- Feature importance rankings from the Random Forest model
- Per-transaction AI explanation with z-scores and percentiles
- Counterfactual analysis: minimal feature changes to flip a verdict
- Similarity search: find k most similar transactions in the dataset
- Smart threshold recommendations: optimal contamination parameters

### Model Comparison
- Side-by-side performance metrics across RF, Isolation Forest, and Autoencoder
- AUC-ROC scores and precision/recall comparison

### Transaction Simulation
- Simulate fraud and legitimate scenarios for testing
- Instant prediction feedback

---

## AI Model Architecture

### Random Forest (Primary Classifier)
- Pre-trained model (`best_rf_model (1).pkl`, 3.2 MB)
- Input: 22 engineered features
- Output: Fraud / Legitimate + probability score
- Used for: fast real-time predictions and ensemble voting

### Isolation Forest (Unsupervised)
- Dynamically trained on uploaded datasets
- Configurable contamination parameter (default 0.05)
- Normalized anomaly score (0–1)

### Autoencoder (Deep Learning)
- Architecture: Dense encoder → bottleneck → decoder
- Trained exclusively on legitimate transactions
- Fraud flagged via reconstruction error exceeding 95th-percentile threshold

### GAN (Data Augmentation)
- Generator creates synthetic transaction records from noise
- Discriminator differentiates real vs. synthetic
- Augmented dataset used to train and balance the Random Forest

---

## AI Model Workflow

### Step 1 — Data Preparation
Load a transactional dataset, handle missing values, normalize numerical features, and one-hot encode categorical variables. Split 80% training / 20% test.

### Step 2 — GAN Training
Train a Generator–Discriminator pair using Binary Cross-Entropy loss. Validate synthetic data quality with statistical metrics and visualizations.

### Step 3 — Data Augmentation
Generate synthetic fraud and legitimate samples. Merge with real data to eliminate class imbalance.

### Step 4 — Random Forest Training
Train on the augmented dataset with hyperparameter tuning (n_estimators, max_depth) via cross-validation. Evaluate with accuracy, precision, recall, F1, and AUC-ROC.

### Step 5 — Ensemble Fraud Prediction
New transactions are evaluated by all three models (RF, Isolation Forest, Autoencoder). Results are combined via voting. Risk level and recommended action are returned in real time.

### Step 6 — Explainability & Reporting
Feature importances, z-scores, counterfactuals, cluster assignments, and natural-language summaries are generated for every detection run.

---

## Fraud Detection Features (22 Parameters)

| # | Feature |
|---|---------|
| 1 | Transaction Amount |
| 2 | Transaction Frequency |
| 3 | Recipient Blacklist Status |
| 4 | Device Fingerprinting |
| 5 | VPN or Proxy Usage |
| 6 | Behavioral Biometrics |
| 7 | Time Since Last Transaction |
| 8 | Social Trust Score |
| 9 | Account Age |
| 10 | High-Risk Transaction Times |
| 11 | Past Fraudulent Behavior Flags |
| 12 | Location-Inconsistent Transactions |
| 13 | Normalized Transaction Amount |
| 14 | Transaction Context Anomalies |
| 15 | Fraud Complaints Count |
| 16 | Merchant Category Mismatch |
| 17 | User Daily Limit Exceeded |
| 18 | Recent High-Value Transaction Flags |
| 19 | Recipient Verification Status (suspicious) |
| 20 | Recipient Verification Status (verified) |
| 21 | Geo-Location Flags (normal) |
| 22 | Geo-Location Flags (unusual) |

---

## API Endpoints

**Base URL:** `http://127.0.0.1:5000`

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service status, loaded models, and endpoint list |
| GET | `/health` | Detailed system health metrics |

### Fraud Detection

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/predict` | Single transaction prediction via Random Forest |
| POST | `/check-single` | Enriched check using RF + Isolation Forest + Autoencoder ensemble |
| POST | `/batch-check` | Batch prediction for up to 50 transactions |

#### `POST /predict`
```json
// Request
{ "features": [value1, value2, ..., value22] }

// Response
{ "prediction": "Fraud" | "Not Fraud", "probability": 0.87 }
```

#### `POST /check-single`
```json
// Request
{ "features": [value1, value2, ..., value22] }

// Response
{
  "prediction": "Fraud",
  "probability": 0.91,
  "risk_level": "HIGH",
  "action": "BLOCK",
  "model_agreement": 3,
  "suspicious_features": ["vpn_usage", "device_fingerprint"]
}
```

#### `POST /batch-check`
```json
// Request
{ "transactions": [ { "features": [...] }, ... ] }  // max 50

// Response
{ "results": [ { "prediction": "...", "probability": 0.x, "risk_level": "..." }, ... ] }
```

### Data Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload CSV dataset with AI quality analysis (A–D grade) |
| GET | `/explore` | Dataset statistics, correlation matrix, daily volume trends |
| GET | `/features` | List loaded feature columns |

### Anomaly Detection

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/detect` | Run bulk anomaly detection with configurable model and threshold |
| GET | `/results` | Retrieve results from the last detection run |
| GET | `/ai-summary` | Natural-language narrative report of detection results |
| GET | `/cluster-analysis` | Group detected anomalies into fraud pattern clusters |
| GET | `/fraud-trends` | Fraud velocity and feature deviation analysis |

### AI Explainability

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/explain/<index>` | Detailed explanation with z-scores and percentiles for a specific transaction |
| POST | `/risk-profile` | Percentile-based risk profile with fraud/legitimate context |
| POST | `/counterfactual` | Suggest minimal feature changes to flip the fraud verdict |
| GET | `/feature-importance` | Random Forest feature importance rankings |
| POST | `/similarity-search` | k-NN search for most similar transactions in the dataset |
| GET | `/smart-threshold` | Recommended optimal contamination thresholds |

---

## System Architecture & Flow

1. **User authenticates** via Google Sign-In (Firebase Auth)
2. **UPI ID assigned** automatically on first login or selected from existing
3. **Transaction initiated** — recipient UPI, amount, and remarks entered
4. **Fraud verification triggered** — calls `/check-single` with 22 engineered features
5. **Ensemble models evaluate** the transaction (RF + Isolation Forest + Autoencoder)
6. **Risk assessment returned** — LOW / MEDIUM / HIGH with APPROVE / REVIEW / BLOCK action
7. **Transaction executed** (if approved) and recorded in Firestore
8. **Historical data** available across Dashboard, Recent Transactions, and Statements pages

---

## Database (Firebase Firestore)

### `users` collection
| Field | Type | Description |
|-------|------|-------------|
| uid | string | Firebase Auth UID (primary key) |
| upiId | string | Assigned UPI identifier |
| balance | number | Account balance |

### `transactions` collection
| Field | Type | Description |
|-------|------|-------------|
| id | string | Transaction ID |
| senderUPI | string | Sender UPI ID |
| recipientUPI | string | Recipient UPI ID |
| amount | number | Transaction amount |
| remarks | string | Optional notes |
| isFraud | boolean | Fraud flag |
| createdAt | timestamp | Transaction timestamp |

---

## Installation

### 1. Clone the repository
```bash
git clone https://github.com/Shabopp/FraudDetectionUsingGAN.git
cd FraudDetectionUsingGAN
```

### 2. Backend Setup
```bash
cd AI_model_server_Flask
pip install -r requirements.txt
# Ensure best_rf_model (1).pkl is present in this directory
python app.py
```
API available at: `http://127.0.0.1:5000`

### 3. Frontend Setup
```bash
cd fraudAI_Frontend_React
npm install
npm run dev
```
App available at: `http://localhost:5173`

### 4. Environment Configuration

Create `fraudAI_Frontend_React/.env`:
```env
VITE_API_URL=http://localhost:5000
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## UI Snapshots

![Dashboard UI](https://i.imgur.com/1mgOS8m.png)
*SafePayAI User Dashboard*

---

![Fraud Detection UI](https://i.imgur.com/4h5D08o.png)
*Fraud Detection Warning with Risk Gauge*

---

![Recent Transaction UI](https://i.imgur.com/6AwLhGA.png)
*Recent Transactions View*

---

![System Design](https://raw.githubusercontent.com/Shabopp/FraudDetectionUsingGAN/main/SystemDesignDiagrams/SystemDesign.png)
*System Architecture Diagram*

---

![AI Model Visual](https://raw.githubusercontent.com/Shabopp/FraudDetectionUsingGAN/main/SystemDesignDiagrams/AIMODEL_VISUAL.png)
*AI Model Pipeline*

---

![Workflow Diagram](https://raw.githubusercontent.com/Shabopp/FraudDetectionUsingGAN/main/SystemDesignDiagrams/WorkFlowDiagram.png)
*End-to-End Data Flow*
