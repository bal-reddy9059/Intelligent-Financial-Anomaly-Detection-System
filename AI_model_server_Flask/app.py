from flask import Flask, request, jsonify
import pickle
import numpy as np
import pandas as pd
import io
import time
from datetime import datetime
from flask_cors import CORS
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    confusion_matrix, roc_auc_score,
    precision_score, recall_score, f1_score, roc_curve
)
import warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)

# ── Model Loading ──────────────────────────────────────────────────────────────
model_path = "best_rf_model (1).pkl"
with open(model_path, "rb") as file:
    rf_model = pickle.load(file)

SERVER_START = datetime.utcnow().isoformat() + "Z"

# ── RF Model Feature Names (22 fixed features) ────────────────────────────────
RF_FEATURE_NAMES = [
    "Transaction Amount", "Transaction Frequency", "Recipient Blacklist Status",
    "Device Fingerprinting", "VPN or Proxy Usage", "Behavioral Biometrics",
    "Time Since Last Transaction", "Social Trust Score", "Account Age",
    "High-Risk Transaction Times", "Past Fraudulent Behavior Flags",
    "Location-Inconsistent Transactions", "Normalized Transaction Amount",
    "Transaction Context Anomalies", "Fraud Complaints Count",
    "Merchant Category Mismatch", "User Daily Limit Exceeded",
    "Recent High-Value Transaction Flags",
    "Recipient Verification Status_suspicious", "Recipient Verification Status_verified",
    "Geo-Location Flags_normal", "Geo-Location Flags_unusual",
]

# Pre-computed feature reference statistics (used when no CSV is loaded)
RF_FEATURE_STATS = {
    "Transaction Amount":                       {"mean": 5000,  "std": 8000,  "fraud_mean": 12000, "legit_mean": 3000},
    "Transaction Frequency":                    {"mean": 5.0,   "std": 4.0,   "fraud_mean": 12.0,  "legit_mean": 3.0},
    "Recipient Blacklist Status":               {"mean": 0.05,  "std": 0.22,  "fraud_mean": 0.80,  "legit_mean": 0.0},
    "Device Fingerprinting":                    {"mean": 0.30,  "std": 0.46,  "fraud_mean": 0.70,  "legit_mean": 0.1},
    "VPN or Proxy Usage":                       {"mean": 0.10,  "std": 0.30,  "fraud_mean": 0.60,  "legit_mean": 0.02},
    "Behavioral Biometrics":                    {"mean": 0.50,  "std": 0.40,  "fraud_mean": 0.15,  "legit_mean": 0.7},
    "Time Since Last Transaction":              {"mean": 48.0,  "std": 72.0,  "fraud_mean": 2.0,   "legit_mean": 60.0},
    "Social Trust Score":                       {"mean": 0.60,  "std": 0.30,  "fraud_mean": 0.10,  "legit_mean": 0.8},
    "Account Age":                              {"mean": 365,   "std": 400,   "fraud_mean": 30,    "legit_mean": 500},
    "High-Risk Transaction Times":              {"mean": 0.15,  "std": 0.35,  "fraud_mean": 0.70,  "legit_mean": 0.05},
    "Past Fraudulent Behavior Flags":           {"mean": 0.08,  "std": 0.27,  "fraud_mean": 0.90,  "legit_mean": 0.0},
    "Location-Inconsistent Transactions":       {"mean": 0.10,  "std": 0.30,  "fraud_mean": 0.65,  "legit_mean": 0.02},
    "Normalized Transaction Amount":            {"mean": 0.40,  "std": 0.30,  "fraud_mean": 0.85,  "legit_mean": 0.2},
    "Transaction Context Anomalies":            {"mean": 0.12,  "std": 0.32,  "fraud_mean": 0.75,  "legit_mean": 0.02},
    "Fraud Complaints Count":                   {"mean": 0.50,  "std": 1.20,  "fraud_mean": 3.50,  "legit_mean": 0.1},
    "Merchant Category Mismatch":               {"mean": 0.15,  "std": 0.36,  "fraud_mean": 0.70,  "legit_mean": 0.05},
    "User Daily Limit Exceeded":                {"mean": 0.08,  "std": 0.27,  "fraud_mean": 0.60,  "legit_mean": 0.02},
    "Recent High-Value Transaction Flags":      {"mean": 0.20,  "std": 0.40,  "fraud_mean": 0.80,  "legit_mean": 0.05},
    "Recipient Verification Status_suspicious": {"mean": 0.10,  "std": 0.30,  "fraud_mean": 0.80,  "legit_mean": 0.0},
    "Recipient Verification Status_verified":   {"mean": 0.70,  "std": 0.46,  "fraud_mean": 0.10,  "legit_mean": 0.95},
    "Geo-Location Flags_normal":                {"mean": 0.80,  "std": 0.40,  "fraud_mean": 0.10,  "legit_mean": 0.95},
    "Geo-Location Flags_unusual":               {"mean": 0.20,  "std": 0.40,  "fraud_mean": 0.90,  "legit_mean": 0.05},
}

# ── In-memory state ────────────────────────────────────────────────────────────
state = {
    "df": None,
    "feature_cols": [],
    "label_col": None,
    "scaler": None,
    "if_model": None,
    "ae_model": None,
    "ae_threshold": None,
    "results": {},
    "detection_timestamp": None,
}


# ══════════════════════════════════════════════════════════════════════════════
#  HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def find_label_col(df):
    candidates = ['isFraud', 'is_fraud', 'fraud', 'label', 'Class', 'class', 'target', 'Label']
    for col in candidates:
        if col in df.columns:
            return col
    lower_map = {c.lower(): c for c in df.columns}
    for name in candidates:
        if name.lower() in lower_map:
            return lower_map[name.lower()]
    return None


def find_amount_col(df):
    for col in ['amount', 'Amount', 'transaction_amount', 'TransactionAmount', 'value']:
        if col in df.columns:
            return col
    return None


def find_date_col(df):
    for col in df.columns:
        if any(k in col.lower() for k in ['date', 'time', 'timestamp', 'step']):
            return col
    return None


def _risk_level(fraud_prob):
    if fraud_prob >= 70:
        return "HIGH"
    if fraud_prob >= 40:
        return "MEDIUM"
    return "LOW"


def _ai_insight(suspicious_feats, risk_level, verdict=None):
    """Generate rich natural-language explanation of the fraud verdict."""
    names = [f["feature"].replace("_", " ").title() for f in suspicious_feats[:3]]

    # HIGH risk
    if risk_level == "HIGH":
        if names:
            return (
                f"High fraud risk detected. The following features deviate significantly "
                f"from normal transaction patterns: {', '.join(names)}. "
                "These signals are strongly associated with fraudulent activity in our training data. "
                "This transaction has been blocked. Please verify the recipient's identity before retrying."
            )
        return (
            "Multiple AI models flagged this transaction as highly anomalous. "
            "The overall behavioral pattern does not match legitimate transactions. "
            "Recommend blocking and manual review."
        )

    # MEDIUM risk
    if risk_level == "MEDIUM":
        if names:
            return (
                f"Moderate fraud risk detected. Unusual values observed in: {', '.join(names)}. "
                "While not conclusive, these patterns warrant caution. "
                "Proceed only if you recognise the recipient."
            )
        return (
            "One or more signals indicate this transaction may be unusual. "
            "A manual review is recommended before approving."
        )

    # LOW risk
    if verdict == "LEGITIMATE" or verdict is None:
        return (
            "No significant anomalies detected. Transaction characteristics appear "
            "consistent with normal behaviour patterns. Safe to proceed."
        )
    return "Transaction analysis complete. Risk indicators are within acceptable thresholds."


def _feature_analysis_from_stats(feature_values, feature_names, stats_dict):
    """
    Compute per-feature deviation using pre-computed reference statistics.
    Works without a loaded dataset.
    """
    analysis = []
    for i, name in enumerate(feature_names):
        val = feature_values[i] if i < len(feature_values) else 0.0
        st = stats_dict.get(name, {"mean": 0, "std": 1, "fraud_mean": 0, "legit_mean": 0})
        mean = st["mean"]
        std = st["std"] or 1.0
        fraud_mean = st["fraud_mean"]
        legit_mean = st["legit_mean"]
        z = round(abs((val - mean) / std), 3)
        suspicious = (abs(val - fraud_mean) < abs(val - legit_mean)) and z > 0.3
        fraud_direction = "high" if fraud_mean > legit_mean else "low"
        # percentile approximation (assuming roughly normal distribution)
        percentile = round(min(99, max(1, 50 + 34 * float(np.sign(val - mean)) * min(1, z / 3))), 1)
        analysis.append({
            "feature": name,
            "value": round(float(val), 4),
            "dataset_mean": round(float(mean), 4),
            "z_score": z,
            "suspicious": suspicious,
            "fraud_direction": fraud_direction,
            "percentile": percentile,
        })
    analysis.sort(key=lambda x: (x["suspicious"], x["z_score"]), reverse=True)
    return analysis


def _feature_analysis_from_df(feature_values, feature_cols, df, label_col):
    """Compute per-feature deviation using the loaded dataset."""
    df_feats = df[feature_cols]
    means = df_feats.mean()
    stds = df_feats.std().replace(0, 1.0)
    analysis = []
    for i, col in enumerate(feature_cols):
        val = feature_values[i] if i < len(feature_values) else 0.0
        mean = float(means[col])
        std = float(stds[col])
        z = round(abs((val - mean) / std), 3)
        suspicious = False
        fraud_direction = None
        percentile = 50.0
        if label_col and label_col in df.columns:
            fraud_mask = df[label_col] == 1
            legit_mask = df[label_col] == 0
            if fraud_mask.any() and legit_mask.any():
                fraud_mean = float(df.loc[fraud_mask, col].mean())
                legit_mean = float(df.loc[legit_mask, col].mean())
                suspicious = abs(val - fraud_mean) < abs(val - legit_mean) and z > 0.3
                fraud_direction = "high" if fraud_mean > legit_mean else "low"
        else:
            suspicious = z > 1.5
        col_vals = df_feats[col].values
        percentile = round(float(np.mean(col_vals <= val) * 100), 1)
        analysis.append({
            "feature": col,
            "value": round(float(val), 4),
            "dataset_mean": round(mean, 4),
            "z_score": z,
            "suspicious": suspicious,
            "fraud_direction": fraud_direction,
            "percentile": percentile,
        })
    analysis.sort(key=lambda x: (x["suspicious"], x["z_score"]), reverse=True)
    return analysis


def _compute_fraud_probability(rf_pred, rf_proba, if_score=None, ae_error=None, ae_threshold=None):
    """
    Blend RF probability with optional IF / AE signals into a 0-100 fraud score.
    """
    # RF probability (primary signal, range 0-1)
    base = float(rf_proba) if rf_proba is not None else (0.85 if rf_pred == 1 else 0.10)

    weights, weighted_sum = 1.0, base

    # Isolation Forest secondary signal
    if if_score is not None:
        # Typical IF scores: 0.3 (normal) .. 0.7+ (anomaly)
        if_prob = min(1.0, max(0.0, (float(if_score) - 0.3) / 0.5))
        weighted_sum += 0.5 * if_prob
        weights += 0.5

    # Autoencoder secondary signal
    if ae_error is not None and ae_threshold is not None:
        ae_ratio = min(2.0, float(ae_error) / max(float(ae_threshold), 1e-9))
        ae_prob = min(1.0, ae_ratio / 2.0)
        weighted_sum += 0.3 * ae_prob
        weights += 0.3

    blended = weighted_sum / weights
    fraud_prob = round(min(100, max(0, blended * 100)))

    # Clamp: if RF says fraud, floor at 65; if RF says legit, cap at 45
    if rf_pred == 1:
        fraud_prob = max(fraud_prob, 65)
    else:
        fraud_prob = min(fraud_prob, 45)

    return fraud_prob


def _detection_narrative(results_dict, total_rows, label_col_exists):
    """Generate an AI narrative summary of bulk detection results."""
    lines = []
    for model_name, res in results_dict.items():
        detected = res.get("fraud_detected", 0)
        total = res.get("total", total_rows)
        rate = round(detected / max(total, 1) * 100, 2)
        f1 = res.get("f1")
        auc = res.get("auc")
        verdict = "high" if rate > 10 else ("moderate" if rate > 3 else "low")
        line = (
            f"{model_name} detected {detected} anomalies ({rate}% of transactions) — "
            f"{verdict} anomaly rate"
        )
        if f1:
            line += f", F1={f1}"
        if auc:
            line += f", AUC={auc}"
        lines.append(line)

    if not lines:
        return "No detection results available."

    total_fraud = sum(r.get("fraud_detected", 0) for r in results_dict.values())
    avg_rate = round(total_fraud / max(len(results_dict), 1) / max(total_rows, 1) * 100, 2)

    summary = " | ".join(lines) + "."
    if avg_rate > 15:
        summary += (
            " ⚠ High anomaly rate detected across models. "
            "Recommend reviewing flagged transactions and adjusting contamination thresholds."
        )
    elif avg_rate > 5:
        summary += (
            " Moderate number of anomalies found. "
            "Consider cross-referencing flagged transactions with customer complaint logs."
        )
    else:
        summary += " Dataset shows a low anomaly rate — models indicate mostly legitimate activity."

    if not label_col_exists:
        summary += " Note: No ground-truth labels found; metrics (precision/recall/F1) are unavailable."

    return summary


# ══════════════════════════════════════════════════════════════════════════════
#  ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

# ─── Health / Status ─────────────────────────────────────────────────────────

@app.route('/')
def home():
    return jsonify({
        "service": "SafePayAI Fraud Detection API",
        "version": "2.0",
        "status": "running",
        "uptime_since": SERVER_START,
        "models_loaded": {
            "random_forest": True,
            "isolation_forest": state["if_model"] is not None,
            "autoencoder": state["ae_model"] is not None,
        },
        "dataset_loaded": state["df"] is not None,
        "endpoints": [
            "POST /predict           — Single transaction check (RF model, fast)",
            "POST /check-single      — Enriched AI check (all models + explanation)",
            "POST /batch-check       — Check up to 50 transactions at once",
            "POST /upload            — Upload CSV dataset",
            "GET  /explore           — Dataset statistics & AI insights",
            "POST /detect            — Run bulk anomaly detection",
            "GET  /ai-summary        — Post-detection AI narrative report",
            "GET  /explain/<index>   — Explain a specific transaction from dataset",
            "GET  /risk-profile      — Risk percentile profile for given features",
            "GET  /features          — List loaded feature columns",
            "GET  /results           — Last detection results",
            "GET  /health            — Detailed system health",
        ]
    })


@app.route('/health', methods=['GET'])
def health():
    df = state["df"]
    return jsonify({
        "status": "ok",
        "server_started": SERVER_START,
        "models": {
            "random_forest": {"loaded": True, "features": len(RF_FEATURE_NAMES)},
            "isolation_forest": {"trained": state["if_model"] is not None},
            "autoencoder": {
                "trained": state["ae_model"] is not None,
                "threshold": state.get("ae_threshold"),
            },
        },
        "dataset": {
            "loaded": df is not None,
            "rows": len(df) if df is not None else 0,
            "feature_columns": len(state["feature_cols"]),
            "has_labels": state["label_col"] is not None,
        },
        "last_detection": state.get("detection_timestamp"),
    })


# ─── Primary Predict (RF — fast, no dataset required) ─────────────────────────

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No input data provided"}), 400
    try:
        raw_features = np.array(data['features'], dtype=float)
        features_2d = raw_features.reshape(1, -1)

        rf_pred = int(rf_model.predict(features_2d)[0])

        # Try to get probability if model supports it
        rf_proba = None
        if hasattr(rf_model, 'predict_proba'):
            try:
                rf_proba = float(rf_model.predict_proba(features_2d)[0][1])
            except Exception:
                pass

        fraud_prob = _compute_fraud_probability(rf_pred, rf_proba)
        risk = _risk_level(fraud_prob)

        # Feature analysis using pre-computed stats
        fv = raw_features.tolist()
        analysis = _feature_analysis_from_stats(fv, RF_FEATURE_NAMES, RF_FEATURE_STATS)
        suspicious_feats = [f for f in analysis if f["suspicious"]]
        insight = _ai_insight(suspicious_feats, risk, verdict="FRAUD" if rf_pred == 1 else "LEGITIMATE")

        return jsonify({
            "prediction": [rf_pred],
            "verdict": "FRAUD" if rf_pred == 1 else "LEGITIMATE",
            "fraud_probability": fraud_prob,
            "risk_level": risk,
            "ai_insight": insight,
            "feature_analysis": analysis[:8],
            "model": "Random Forest",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Enriched Single Check (RF + IF + AE ensemble) ────────────────────────────

@app.route('/check-single', methods=['POST'])
def check_single():
    try:
        t0 = time.time()
        data = request.get_json() or {}
        df = state["df"]
        feature_cols = state["feature_cols"]

        # ── Resolve feature values ────────────────────────────────────────────
        # Accept either: {"features": [v1, v2, ...]} array OR named fields
        if "features" in data and isinstance(data["features"], list):
            raw_features = [float(v) for v in data["features"]]
            names = RF_FEATURE_NAMES if len(raw_features) == len(RF_FEATURE_NAMES) else feature_cols
        else:
            if df is not None and feature_cols:
                names = feature_cols
                raw_features = []
                for col in names:
                    try:
                        raw_features.append(float(data.get(col, 0)))
                    except Exception:
                        raw_features.append(0.0)
            else:
                names = RF_FEATURE_NAMES
                raw_features = []
                for col in names:
                    try:
                        raw_features.append(float(data.get(col, 0)))
                    except Exception:
                        raw_features.append(0.0)

        X_single = np.array(raw_features, dtype=float).reshape(1, -1)
        model_results = {}

        # ── Random Forest ─────────────────────────────────────────────────────
        # Only run RF if feature count matches (22 features)
        rf_pred = None
        rf_proba = None
        if len(raw_features) == len(RF_FEATURE_NAMES):
            try:
                rf_pred = int(rf_model.predict(X_single)[0])
                if hasattr(rf_model, 'predict_proba'):
                    rf_proba = float(rf_model.predict_proba(X_single)[0][1])
                model_results["Random Forest"] = {
                    "verdict": "FRAUD" if rf_pred == 1 else "LEGITIMATE",
                    "probability": round(rf_proba * 100, 1) if rf_proba is not None else None,
                }
            except Exception as ex:
                model_results["Random Forest"] = {"error": str(ex)}

        # ── Isolation Forest ──────────────────────────────────────────────────
        if_score = None
        if df is not None and feature_cols:
            scaler = state.get("scaler")
            if scaler is None:
                scaler = StandardScaler()
                scaler.fit(df[feature_cols].values)
                state["scaler"] = scaler

            # Align features to loaded dataset columns
            if len(raw_features) == len(feature_cols):
                X_scaled = scaler.transform(X_single)
            else:
                X_scaled = scaler.transform(np.zeros((1, len(feature_cols))))

            if_model = state.get("if_model")
            if if_model is None:
                if_model = IsolationForest(contamination=0.05, n_estimators=100, random_state=42)
                if_model.fit(scaler.transform(df[feature_cols].values))
                state["if_model"] = if_model

            if_raw = if_model.predict(X_scaled)[0]
            if_score = float(-if_model.score_samples(X_scaled)[0])
            model_results["Isolation Forest"] = {
                "verdict": "FRAUD" if if_raw == -1 else "LEGITIMATE",
                "anomaly_score": round(if_score, 4),
            }

            # ── Autoencoder ───────────────────────────────────────────────────
            ae_model = state.get("ae_model")
            ae_error = None
            if ae_model is not None:
                try:
                    recon = ae_model.predict(X_scaled, verbose=0)
                    ae_error = float(np.mean(np.power(X_scaled - recon, 2)))
                    ae_thresh = state.get("ae_threshold", 0.1)
                    model_results["Autoencoder"] = {
                        "verdict": "FRAUD" if ae_error > ae_thresh else "LEGITIMATE",
                        "reconstruction_error": round(ae_error, 6),
                        "threshold": round(ae_thresh, 6),
                    }
                except Exception:
                    pass

        # ── Ensemble verdict ──────────────────────────────────────────────────
        verdicts = [v.get("verdict") for v in model_results.values() if "verdict" in v]
        fraud_votes = verdicts.count("FRAUD")
        total_votes = len(verdicts)

        if total_votes == 0:
            overall = "LEGITIMATE"
            confidence = 50
        else:
            fraud_ratio = fraud_votes / total_votes
            overall = "FRAUD" if fraud_ratio > 0.5 else "LEGITIMATE"
            confidence = round(max(fraud_ratio, 1 - fraud_ratio) * 100)

        # ── Fraud probability ─────────────────────────────────────────────────
        ae_err_val = None
        ae_thresh_val = None
        for res in model_results.values():
            if "reconstruction_error" in res:
                ae_err_val = res["reconstruction_error"]
                ae_thresh_val = res.get("threshold")
                break

        # Prefer RF probability if available
        use_rf_pred = rf_pred if rf_pred is not None else (1 if overall == "FRAUD" else 0)
        fraud_prob = _compute_fraud_probability(use_rf_pred, rf_proba, if_score, ae_err_val, ae_thresh_val)
        risk = _risk_level(fraud_prob)

        # ── Feature analysis ──────────────────────────────────────────────────
        if df is not None and feature_cols and len(raw_features) == len(feature_cols):
            analysis = _feature_analysis_from_df(raw_features, feature_cols, df, state.get("label_col"))
        else:
            analysis = _feature_analysis_from_stats(raw_features, names, RF_FEATURE_STATS)

        suspicious_feats = [f for f in analysis if f["suspicious"]]
        insight = _ai_insight(suspicious_feats, risk, verdict=overall)

        # ── Recommended action ────────────────────────────────────────────────
        if risk == "HIGH":
            action = "BLOCK — Do not process this transaction."
        elif risk == "MEDIUM":
            action = "REVIEW — Flag for manual verification before processing."
        else:
            action = "APPROVE — Transaction appears safe to process."

        elapsed_ms = round((time.time() - t0) * 1000, 1)

        return jsonify({
            "results": model_results,
            "overall_verdict": overall,
            "risk_level": risk,
            "fraud_probability": fraud_prob,
            "ensemble_confidence": confidence,
            "models_agreed": fraud_votes == total_votes or fraud_votes == 0,
            "ai_insight": insight,
            "recommended_action": action,
            "feature_analysis": analysis[:8],
            "suspicious_feature_count": len(suspicious_feats),
            "prediction": rf_pred if rf_pred is not None else (1 if overall == "FRAUD" else 0),
            "processing_time_ms": elapsed_ms,
        })

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Batch Transaction Check ─────────────────────────────────────────────────

@app.route('/batch-check', methods=['POST'])
def batch_check():
    """Check up to 50 transactions in a single request."""
    try:
        data = request.get_json() or {}
        transactions = data.get("transactions", [])
        if not transactions:
            return jsonify({"error": "Provide a 'transactions' array"}), 400
        if len(transactions) > 50:
            return jsonify({"error": "Maximum 50 transactions per batch"}), 400

        results = []
        summary = {"total": len(transactions), "fraud": 0, "legitimate": 0, "high_risk": 0, "medium_risk": 0, "low_risk": 0}

        for i, tx in enumerate(transactions):
            features = tx.get("features", [])
            if not features or len(features) != len(RF_FEATURE_NAMES):
                results.append({"index": i, "error": "Invalid or missing features array"})
                continue

            fv = [float(v) for v in features]
            X = np.array(fv).reshape(1, -1)

            rf_pred = int(rf_model.predict(X)[0])
            rf_proba = None
            if hasattr(rf_model, 'predict_proba'):
                rf_proba = float(rf_model.predict_proba(X)[0][1])

            fraud_prob = _compute_fraud_probability(rf_pred, rf_proba)
            risk = _risk_level(fraud_prob)
            analysis = _feature_analysis_from_stats(fv, RF_FEATURE_NAMES, RF_FEATURE_STATS)
            top_suspicious = [f["feature"] for f in analysis if f["suspicious"]][:3]

            verdict = "FRAUD" if rf_pred == 1 else "LEGITIMATE"
            summary["fraud" if rf_pred == 1 else "legitimate"] += 1
            summary[f"{risk.lower()}_risk"] += 1

            results.append({
                "index": i,
                "transaction_id": tx.get("id", f"TX{i+1:04d}"),
                "verdict": verdict,
                "fraud_probability": fraud_prob,
                "risk_level": risk,
                "top_suspicious_features": top_suspicious,
            })

        fraud_rate = round(summary["fraud"] / max(summary["total"], 1) * 100, 1)
        if summary["high_risk"] > summary["total"] * 0.3:
            batch_insight = f"High-risk batch: {summary['high_risk']} of {summary['total']} transactions flagged HIGH. Immediate review recommended."
        elif summary["fraud"] > 0:
            batch_insight = f"Batch contains {summary['fraud']} suspicious transaction(s) ({fraud_rate}% fraud rate). Review flagged items."
        else:
            batch_insight = f"Batch analysis complete. All {summary['total']} transactions appear legitimate."

        return jsonify({
            "results": results,
            "summary": summary,
            "fraud_rate_percent": fraud_rate,
            "batch_insight": batch_insight,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── CSV Upload ───────────────────────────────────────────────────────────────

@app.route('/upload', methods=['POST'])
def upload_csv():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        file = request.files['file']
        if not file.filename.lower().endswith('.csv'):
            return jsonify({"error": "Only CSV files are supported"}), 400

        content = file.read().decode('utf-8')
        df = pd.read_csv(io.StringIO(content))

        original_rows = len(df)
        missing_before = int(df.isnull().sum().sum())
        df = df.dropna().drop_duplicates().reset_index(drop=True)
        cleaned_rows = len(df)

        label_col = find_label_col(df)
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        feature_cols = [c for c in numeric_cols if c != label_col]

        state.update({
            "df": df,
            "feature_cols": feature_cols,
            "label_col": label_col,
            "scaler": None,
            "if_model": None,
            "ae_model": None,
            "ae_threshold": None,
            "results": {},
            "detection_timestamp": None,
        })

        fraud_count = int(df[label_col].sum()) if label_col else 0
        fraud_rate = round(df[label_col].mean() * 100, 2) if label_col else 0
        preview = df.head(5).to_dict(orient='records')

        # ── AI Data Quality Analysis ──────────────────────────────────────────
        quality_issues = []
        quality_score = 100

        # Class imbalance
        if label_col:
            minority_rate = min(fraud_rate, 100 - fraud_rate)
            if minority_rate < 1:
                quality_issues.append({
                    "type": "severe_imbalance",
                    "severity": "high",
                    "message": f"Severe class imbalance: only {minority_rate:.2f}% minority class. Consider SMOTE oversampling or class-weight adjustment.",
                })
                quality_score -= 25
            elif minority_rate < 5:
                quality_issues.append({
                    "type": "class_imbalance",
                    "severity": "medium",
                    "message": f"Moderate class imbalance ({minority_rate:.1f}% minority). Models may be biased toward the majority class.",
                })
                quality_score -= 10

        # Missing values
        if missing_before > 0:
            pct = round(missing_before / (original_rows * max(len(df.columns), 1)) * 100, 1)
            quality_issues.append({
                "type": "missing_values",
                "severity": "medium" if pct > 5 else "low",
                "message": f"{missing_before} missing values ({pct}% of cells) were removed during cleaning.",
            })
            quality_score -= min(20, pct)

        # Duplicate rows
        dupes = original_rows - cleaned_rows - (original_rows - len(pd.read_csv(io.StringIO(content)).dropna()))
        if dupes > 0:
            quality_issues.append({
                "type": "duplicates",
                "severity": "low",
                "message": f"{original_rows - cleaned_rows} duplicate/null rows removed.",
            })
            quality_score -= 5

        # Low variance features
        low_var_feats = []
        for col in feature_cols:
            if df[col].std() < 1e-6:
                low_var_feats.append(col)
        if low_var_feats:
            quality_issues.append({
                "type": "zero_variance",
                "severity": "high",
                "message": f"Zero-variance features detected: {', '.join(low_var_feats[:5])}. These will not contribute to model performance.",
            })
            quality_score -= 15

        # Small dataset
        if cleaned_rows < 100:
            quality_issues.append({
                "type": "small_dataset",
                "severity": "high",
                "message": f"Dataset has only {cleaned_rows} rows after cleaning. Model performance may be unreliable. Recommend at least 1,000 rows.",
            })
            quality_score -= 20

        quality_score = max(0, round(quality_score))

        # Recommendations
        recommendations = []
        if fraud_rate < 5 and label_col:
            recommendations.append("Use Isolation Forest — better suited for imbalanced datasets.")
        if cleaned_rows > 10000:
            recommendations.append("Large dataset detected. Autoencoder may provide better anomaly boundaries.")
        if len(feature_cols) > 20:
            recommendations.append("Many features present. Consider running correlation analysis to remove redundant columns.")
        if not label_col:
            recommendations.append("No label column found. Only unsupervised models (Isolation Forest, Autoencoder) can be used. Metrics will be unavailable.")
        if not recommendations:
            recommendations.append("Dataset looks good. Run detection with both Isolation Forest and Autoencoder for ensemble results.")

        return jsonify({
            "success": True,
            "total_rows": original_rows,
            "cleaned_rows": cleaned_rows,
            "removed_rows": original_rows - cleaned_rows,
            "columns": df.columns.tolist(),
            "feature_columns": feature_cols,
            "label_column": label_col,
            "fraud_count": fraud_count,
            "fraud_rate": fraud_rate,
            "preview": preview,
            "ai_quality": {
                "score": quality_score,
                "grade": "A" if quality_score >= 85 else ("B" if quality_score >= 70 else ("C" if quality_score >= 50 else "D")),
                "issues": quality_issues,
                "recommendations": recommendations,
            },
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Data Exploration ─────────────────────────────────────────────────────────

@app.route('/explore', methods=['GET'])
def explore_data():
    try:
        df = state["df"]
        if df is None:
            return jsonify({"error": "No data uploaded"}), 400

        feature_cols = state["feature_cols"]
        label_col = state["label_col"]

        # Amount distribution
        amount_col = find_amount_col(df) or (feature_cols[0] if feature_cols else None)
        amount_dist = []
        if amount_col and amount_col in df.columns:
            cap = df[amount_col].quantile(0.99)
            counts, bins = np.histogram(df[amount_col].clip(upper=cap), bins=20)
            amount_dist = [
                {"bin": f"{bins[i]:.0f}-{bins[i+1]:.0f}", "count": int(counts[i])}
                for i in range(len(counts))
            ]

        # Daily volume
        daily_volume = []
        date_col = find_date_col(df)
        if date_col:
            try:
                df['_dt'] = pd.to_datetime(df[date_col], errors='coerce').dt.date
                daily = df.groupby('_dt').size().reset_index(name='count').dropna()
                daily_volume = [
                    {"date": str(r['_dt']), "count": int(r['count'])}
                    for _, r in daily.head(30).iterrows()
                ]
                df.drop(columns=['_dt'], inplace=True)
            except Exception:
                pass

        if not daily_volume:
            n, chunk = len(df), max(1, len(df) // 20)
            daily_volume = [
                {"date": f"Batch {i+1}", "count": min(chunk, n - i * chunk)}
                for i in range(min(20, n // chunk))
            ]

        # Correlation matrix
        top_feats = feature_cols[:8]
        corr_data, corr_features = [], []
        if len(top_feats) > 1:
            corr_matrix = df[top_feats].corr().round(2)
            corr_features = top_feats
            for r in top_feats:
                for c in top_feats:
                    corr_data.append({"x": c, "y": r, "value": float(corr_matrix.loc[r, c])})

        stats = {
            "total_transactions": len(df),
            "num_features": len(feature_cols),
            "fraud_count": int(df[label_col].sum()) if label_col else 0,
            "fraud_rate": round(df[label_col].mean() * 100, 2) if label_col else 0,
        }
        if amount_col and amount_col in df.columns:
            stats["avg_amount"] = round(float(df[amount_col].mean()), 2)
            stats["max_amount"] = round(float(df[amount_col].max()), 2)

        # ── AI Dataset Insights ───────────────────────────────────────────────
        ai_insights = []

        if label_col:
            fraud_rate = stats["fraud_rate"]
            if fraud_rate > 20:
                ai_insights.append(f"Unusually high fraud rate ({fraud_rate}%). Dataset may be pre-filtered or synthetically balanced.")
            elif fraud_rate < 0.5:
                ai_insights.append(f"Very low fraud rate ({fraud_rate}%). Unsupervised methods recommended; supervised models may underfit the minority class.")
            else:
                ai_insights.append(f"Fraud rate of {fraud_rate}% is within a typical range for production transaction data.")

        # Top correlated features with label
        if label_col and len(feature_cols) >= 2:
            try:
                label_corr = df[feature_cols + [label_col]].corr()[label_col].drop(label_col).abs().sort_values(ascending=False)
                top3 = label_corr.head(3).index.tolist()
                top3_scores = [round(float(label_corr[c]), 3) for c in top3]
                ai_insights.append(
                    f"Top features correlated with fraud: {', '.join(f'{n} ({s})' for n, s in zip(top3, top3_scores))}."
                )
            except Exception:
                pass

        if len(df) > 0:
            ai_insights.append(
                f"Dataset contains {len(df):,} transactions with {len(feature_cols)} numeric features. "
                f"Scaler and models will be fit on this data when detection is run."
            )

        return jsonify({
            "amount_distribution": amount_dist,
            "daily_volume": daily_volume,
            "correlation": corr_data,
            "correlation_features": corr_features,
            "stats": stats,
            "ai_insights": ai_insights,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Run Detection ────────────────────────────────────────────────────────────

@app.route('/detect', methods=['POST'])
def run_detection():
    try:
        df = state["df"]
        if df is None:
            return jsonify({"error": "No data uploaded"}), 400

        params = request.get_json() or {}
        models_to_run = params.get("models", ["isolation_forest"])
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]

        if not feature_cols:
            return jsonify({"error": "No numeric features found in dataset"}), 400

        X = df[feature_cols].values
        y_true = df[label_col].values.astype(int) if label_col else None

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        state["scaler"] = scaler

        results = {}

        # ── Isolation Forest ──────────────────────────────────────────────────
        if "isolation_forest" in models_to_run:
            contamination = float(params.get("if_contamination", 0.05))
            n_estimators = int(params.get("if_n_estimators", 100))

            if_model = IsolationForest(
                contamination=contamination,
                n_estimators=n_estimators,
                random_state=42
            )
            if_model.fit(X_scaled)
            raw = if_model.predict(X_scaled)
            scores = -if_model.score_samples(X_scaled)
            preds = (raw == -1).astype(int)
            scores_norm = (scores - scores.min()) / (scores.max() - scores.min() + 1e-10)

            state["if_model"] = if_model
            result = {"fraud_detected": int(preds.sum()), "total": len(preds)}

            if y_true is not None:
                try:
                    cm = confusion_matrix(y_true, preds).tolist()
                    auc = float(roc_auc_score(y_true, scores_norm))
                    fpr, tpr, _ = roc_curve(y_true, scores_norm)
                    step = max(1, len(fpr) // 50)
                    result.update({
                        "confusion_matrix": cm,
                        "precision": round(precision_score(y_true, preds, zero_division=0), 4),
                        "recall": round(recall_score(y_true, preds, zero_division=0), 4),
                        "f1": round(f1_score(y_true, preds, zero_division=0), 4),
                        "auc": round(auc, 4),
                        "roc_fpr": fpr[::step].tolist(),
                        "roc_tpr": tpr[::step].tolist(),
                    })
                except Exception:
                    pass

            counts, edges = np.histogram(scores_norm, bins=20)
            result["score_distribution"] = [
                {"bin": f"{edges[i]:.2f}", "count": int(counts[i])}
                for i in range(len(counts))
            ]

            # Risk tier breakdown
            result["risk_tiers"] = {
                "low":      int(np.sum(scores_norm < 0.4)),
                "medium":   int(np.sum((scores_norm >= 0.4) & (scores_norm < 0.7))),
                "high":     int(np.sum(scores_norm >= 0.7)),
            }

            # Top anomalous features (mean z-score among flagged transactions)
            if preds.sum() > 0:
                flagged_X = X[preds == 1]
                col_means = X.mean(axis=0)
                col_stds = X.std(axis=0) + 1e-10
                flagged_z = np.mean(np.abs((flagged_X - col_means) / col_stds), axis=0)
                top_idx = np.argsort(flagged_z)[::-1][:5]
                result["top_anomalous_features"] = [
                    {"feature": feature_cols[i], "mean_z_score": round(float(flagged_z[i]), 3)}
                    for i in top_idx
                ]

            results["isolation_forest"] = result

        # ── Autoencoder ───────────────────────────────────────────────────────
        if "autoencoder" in models_to_run:
            try:
                import tensorflow as tf
                from tensorflow import keras
                tf.get_logger().setLevel('ERROR')

                ae_epochs = int(params.get("ae_epochs", 30))
                ae_enc_dim = int(params.get("ae_encoding_dim", 8))
                ae_pct = int(params.get("ae_threshold_percentile", 95))

                input_dim = X_scaled.shape[1]
                enc_dim = min(ae_enc_dim, max(1, input_dim // 2))

                inp = keras.Input(shape=(input_dim,))
                x = keras.layers.Dense(enc_dim * 2, activation='relu')(inp)
                x = keras.layers.Dense(enc_dim, activation='relu')(x)
                x = keras.layers.Dense(enc_dim * 2, activation='relu')(x)
                out = keras.layers.Dense(input_dim)(x)

                ae = keras.Model(inp, out)
                ae.compile(optimizer='adam', loss='mse')

                X_train = X_scaled[y_true == 0] if y_true is not None else X_scaled
                ae.fit(X_train, X_train, epochs=ae_epochs, batch_size=32,
                       verbose=0, validation_split=0.1)

                recon = ae.predict(X_scaled, verbose=0)
                errors = np.mean(np.power(X_scaled - recon, 2), axis=1)
                threshold = np.percentile(errors, ae_pct)
                ae_preds = (errors > threshold).astype(int)
                scores_norm = (errors - errors.min()) / (errors.max() - errors.min() + 1e-10)

                state["ae_model"] = ae
                state["ae_threshold"] = float(threshold)

                result = {"fraud_detected": int(ae_preds.sum()), "total": len(ae_preds)}

                if y_true is not None:
                    try:
                        cm = confusion_matrix(y_true, ae_preds).tolist()
                        auc = float(roc_auc_score(y_true, scores_norm))
                        fpr, tpr, _ = roc_curve(y_true, scores_norm)
                        step = max(1, len(fpr) // 50)
                        result.update({
                            "confusion_matrix": cm,
                            "precision": round(precision_score(y_true, ae_preds, zero_division=0), 4),
                            "recall": round(recall_score(y_true, ae_preds, zero_division=0), 4),
                            "f1": round(f1_score(y_true, ae_preds, zero_division=0), 4),
                            "auc": round(auc, 4),
                            "roc_fpr": fpr[::step].tolist(),
                            "roc_tpr": tpr[::step].tolist(),
                        })
                    except Exception:
                        pass

                counts, edges = np.histogram(scores_norm, bins=20)
                result["score_distribution"] = [
                    {"bin": f"{edges[i]:.2f}", "count": int(counts[i])}
                    for i in range(len(counts))
                ]
                result["risk_tiers"] = {
                    "low":    int(np.sum(scores_norm < 0.4)),
                    "medium": int(np.sum((scores_norm >= 0.4) & (scores_norm < 0.7))),
                    "high":   int(np.sum(scores_norm >= 0.7)),
                }

                results["autoencoder"] = result

            except ImportError:
                results["autoencoder"] = {
                    "error": "TensorFlow not installed. Run: pip install tensorflow"
                }

        # ── Ensemble agreement ────────────────────────────────────────────────
        if len(results) > 1:
            detections = [r.get("fraud_detected", 0) for r in results.values()]
            totals = [r.get("total", 1) for r in results.values()]
            rates = [d / t for d, t in zip(detections, totals)]
            ensemble = {
                "avg_fraud_rate": round(float(np.mean(rates)) * 100, 2),
                "model_agreement": round(
                    1 - float(np.std(rates)) / (float(np.mean(rates)) + 1e-10), 3
                ),
            }
        else:
            ensemble = {}

        state["results"] = results
        state["detection_timestamp"] = datetime.utcnow().isoformat() + "Z"

        # AI narrative summary
        ai_narrative = _detection_narrative(results, len(df), label_col is not None)

        return jsonify({
            "success": True,
            "results": results,
            "ensemble": ensemble,
            "ai_narrative": ai_narrative,
            "detection_timestamp": state["detection_timestamp"],
        })

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── AI Summary Report ────────────────────────────────────────────────────────

@app.route('/ai-summary', methods=['GET'])
def ai_summary():
    """Comprehensive AI analysis report after detection has been run."""
    try:
        df = state["df"]
        results = state["results"]
        label_col = state["label_col"]
        feature_cols = state["feature_cols"]

        if df is None:
            return jsonify({"error": "No dataset loaded. Upload a CSV first."}), 400
        if not results:
            return jsonify({"error": "No detection results available. Run /detect first."}), 400

        report = {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "dataset_overview": {
                "total_transactions": len(df),
                "features_analysed": len(feature_cols),
                "label_available": label_col is not None,
            },
            "model_summaries": [],
            "risk_distribution": {},
            "top_risk_features": [],
            "recommended_actions": [],
            "overall_ai_assessment": "",
        }

        all_detections = []
        best_model = None
        best_f1 = -1

        for model_name, res in results.items():
            detected = res.get("fraud_detected", 0)
            total = res.get("total", len(df))
            rate = round(detected / max(total, 1) * 100, 2)
            f1 = res.get("f1")
            auc = res.get("auc")
            all_detections.append(detected)

            summary = {
                "model": model_name,
                "fraud_detected": detected,
                "fraud_rate_pct": rate,
                "f1_score": f1,
                "auc": auc,
                "risk_tiers": res.get("risk_tiers", {}),
            }
            report["model_summaries"].append(summary)

            if f1 is not None and f1 > best_f1:
                best_f1 = f1
                best_model = model_name

        # Risk distribution across all models
        all_tiers = {"low": 0, "medium": 0, "high": 0}
        for res in results.values():
            for tier, count in res.get("risk_tiers", {}).items():
                all_tiers[tier] += count
        report["risk_distribution"] = all_tiers

        # Top anomalous features (from IF if available)
        if "isolation_forest" in results and "top_anomalous_features" in results["isolation_forest"]:
            report["top_risk_features"] = results["isolation_forest"]["top_anomalous_features"]

        # Recommended actions
        avg_detection = np.mean(all_detections) if all_detections else 0
        avg_rate = round(avg_detection / max(len(df), 1) * 100, 2)

        if avg_rate > 20:
            report["recommended_actions"].append("Immediate manual review of all HIGH-risk transactions.")
            report["recommended_actions"].append("Consider tightening contamination threshold (try 0.03).")
            report["recommended_actions"].append("Alert fraud operations team — elevated fraud activity detected.")
        elif avg_rate > 5:
            report["recommended_actions"].append("Investigate MEDIUM and HIGH-risk transactions within 24 hours.")
            report["recommended_actions"].append("Run batch-check on recent transactions for live monitoring.")
        else:
            report["recommended_actions"].append("Low fraud rate detected — routine monitoring recommended.")
            report["recommended_actions"].append("Schedule weekly re-training to keep models current.")

        if best_model:
            report["recommended_actions"].append(f"Best performing model: {best_model} (F1={round(best_f1, 3)}). Prioritise this model for production decisions.")

        if not label_col:
            report["recommended_actions"].append("No ground-truth labels found. Consider labelling a sample for supervised evaluation.")

        # Overall assessment
        if avg_rate > 15:
            assessment = (
                f"CRITICAL: Average {avg_rate}% of transactions were flagged as anomalous across models. "
                "This is significantly above normal thresholds. Immediate investigation is required."
            )
        elif avg_rate > 5:
            assessment = (
                f"ELEVATED RISK: {avg_rate}% average anomaly rate detected. "
                "Models have identified a notable cluster of suspicious activity. Manual review recommended."
            )
        elif avg_rate > 1:
            assessment = (
                f"NORMAL: {avg_rate}% anomaly rate is within expected parameters. "
                "Continue standard monitoring. No immediate action required."
            )
        else:
            assessment = (
                f"CLEAN: Very low anomaly rate ({avg_rate}%). "
                "Dataset appears to represent predominantly legitimate activity."
            )

        report["overall_ai_assessment"] = assessment

        return jsonify(report)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Explain Transaction ──────────────────────────────────────────────────────

@app.route('/explain/<int:idx>', methods=['GET'])
def explain_transaction(idx):
    """Explain a specific transaction from the loaded dataset."""
    try:
        df = state["df"]
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]

        if df is None:
            return jsonify({"error": "No dataset loaded. Upload a CSV first."}), 400
        if idx < 0 or idx >= len(df):
            return jsonify({"error": f"Index {idx} out of range (0-{len(df)-1})"}), 400

        row = df.iloc[idx]
        feature_values = [float(row[c]) for c in feature_cols]

        # RF prediction (only if feature count matches)
        rf_pred = None
        rf_proba = None
        if len(feature_values) == len(RF_FEATURE_NAMES):
            X = np.array(feature_values).reshape(1, -1)
            rf_pred = int(rf_model.predict(X)[0])
            if hasattr(rf_model, 'predict_proba'):
                rf_proba = float(rf_model.predict_proba(X)[0][1])

        # Ground truth
        ground_truth = None
        if label_col and label_col in df.columns:
            ground_truth = int(row[label_col])

        # Feature analysis
        analysis = _feature_analysis_from_df(feature_values, feature_cols, df, label_col)
        suspicious_feats = [f for f in analysis if f["suspicious"]]

        fraud_prob = _compute_fraud_probability(
            rf_pred if rf_pred is not None else (1 if ground_truth == 1 else 0),
            rf_proba
        )
        risk = _risk_level(fraud_prob)
        verdict = "FRAUD" if (rf_pred == 1 if rf_pred is not None else ground_truth == 1) else "LEGITIMATE"
        insight = _ai_insight(suspicious_feats, risk, verdict=verdict)

        return jsonify({
            "index": idx,
            "feature_values": {c: round(float(row[c]), 4) for c in feature_cols},
            "ground_truth_label": ground_truth,
            "model_prediction": verdict,
            "fraud_probability": fraud_prob,
            "risk_level": risk,
            "ai_insight": insight,
            "feature_analysis": analysis,
            "suspicious_features": suspicious_feats,
            "correct_prediction": (rf_pred == ground_truth) if (rf_pred is not None and ground_truth is not None) else None,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Risk Profile ─────────────────────────────────────────────────────────────

@app.route('/risk-profile', methods=['POST'])
def risk_profile():
    """
    Return a percentile-based risk profile for a given transaction.
    Compares each feature value against the dataset distribution.
    Requires dataset to be loaded.
    """
    try:
        df = state["df"]
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]

        if df is None:
            return jsonify({"error": "No dataset loaded. Upload a CSV first."}), 400

        data = request.get_json() or {}
        if "features" in data and isinstance(data["features"], list):
            raw_features = [float(v) for v in data["features"]]
            names = feature_cols[:len(raw_features)]
        else:
            names = feature_cols
            raw_features = [float(data.get(col, 0)) for col in names]

        profile = []
        fraud_signals = 0

        for i, col in enumerate(names):
            if i >= len(raw_features):
                break
            val = raw_features[i]
            col_vals = df[col].values
            pct = round(float(np.mean(col_vals <= val) * 100), 1)

            # Compare to fraud distribution
            fraud_context = {}
            if label_col and label_col in df.columns:
                fraud_vals = df.loc[df[label_col] == 1, col].values
                legit_vals = df.loc[df[label_col] == 0, col].values
                if len(fraud_vals) and len(legit_vals):
                    fraud_pct = round(float(np.mean(fraud_vals <= val) * 100), 1)
                    legit_pct = round(float(np.mean(legit_vals <= val) * 100), 1)
                    fraud_context = {"fraud_percentile": fraud_pct, "legit_percentile": legit_pct}
                    # Signal: value is in the top portion of fraud distribution
                    fraud_mean = float(df.loc[df[label_col] == 1, col].mean())
                    legit_mean = float(df.loc[df[label_col] == 0, col].mean())
                    std = float(df[col].std()) or 1.0
                    z = abs((val - float(df[col].mean())) / std)
                    if abs(val - fraud_mean) < abs(val - legit_mean) and z > 0.3:
                        fraud_signals += 1

            profile.append({
                "feature": col,
                "value": round(val, 4),
                "dataset_percentile": pct,
                "interpretation": (
                    "Very high" if pct > 90 else
                    "High" if pct > 75 else
                    "Average" if pct > 25 else
                    "Low" if pct > 10 else "Very low"
                ),
                **fraud_context,
            })

        total_feats = len(profile)
        signal_ratio = fraud_signals / max(total_feats, 1)
        overall_risk = "HIGH" if signal_ratio > 0.4 else ("MEDIUM" if signal_ratio > 0.2 else "LOW")

        return jsonify({
            "profile": profile,
            "fraud_signal_count": fraud_signals,
            "total_features": total_feats,
            "signal_ratio": round(signal_ratio, 3),
            "overall_risk": overall_risk,
            "summary": (
                f"{fraud_signals} of {total_feats} features align with typical fraud patterns. "
                f"Overall risk classification: {overall_risk}."
            ),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Cluster Analysis ─────────────────────────────────────────────────────────

@app.route('/cluster-analysis', methods=['GET'])
def cluster_analysis():
    """Cluster detected anomalies using KMeans and describe each cluster."""
    try:
        df = state["df"]
        results = state["results"]
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]

        if df is None:
            return jsonify({"error": "No dataset loaded"}), 400
        if not results:
            return jsonify({"error": "No detection results. Run /detect first."}), 400

        from sklearn.cluster import KMeans

        flagged_mask = np.zeros(len(df), dtype=bool)
        if_model = state.get("if_model")
        scaler = state.get("scaler")
        if if_model and scaler:
            X_scaled = scaler.transform(df[feature_cols].values)
            raw = if_model.predict(X_scaled)
            flagged_mask = (raw == -1)

        flagged_count = int(flagged_mask.sum())
        if flagged_count < 3:
            return jsonify({"clusters": [], "total_flagged": flagged_count,
                            "message": "Not enough flagged transactions to cluster (need ≥3)."}), 200

        X_all = df[feature_cols].values
        X_flagged = X_all[flagged_mask]
        k = min(5, max(2, flagged_count // 10))

        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        cluster_labels = km.fit_predict(X_flagged)

        overall_mean = X_all.mean(axis=0)
        overall_std  = X_all.std(axis=0) + 1e-10

        clusters = []
        for c in range(k):
            mask_c = cluster_labels == c
            size = int(mask_c.sum())
            centroid = km.cluster_centers_[c]
            z_scores = np.abs((centroid - overall_mean) / overall_std)
            top_idx = np.argsort(z_scores)[::-1][:5]

            top_features = [
                {"feature": feature_cols[i], "z_score": round(float(z_scores[i]), 2),
                 "centroid_value": round(float(centroid[i]), 3),
                 "dataset_mean": round(float(overall_mean[i]), 3)}
                for i in top_idx
            ]
            avg_z = float(np.mean(z_scores[top_idx]))
            risk = "HIGH" if avg_z > 2.0 else ("MEDIUM" if avg_z > 1.0 else "LOW")

            fraud_rate_pct = None
            if label_col:
                orig_idx = np.where(flagged_mask)[0][mask_c]
                fraud_rate_pct = round(float(df[label_col].values[orig_idx].mean() * 100), 1)

            primary = feature_cols[top_idx[0]] if len(top_idx) else "unknown"
            if avg_z > 2.0:
                pattern = f"Extreme deviation in {primary} — strongly resembles known fraud pattern."
            elif avg_z > 1.0:
                pattern = f"Moderate anomaly cluster centred around {primary}."
            else:
                pattern = f"Mild deviation near {primary} — possible false-positive group."

            clusters.append({
                "cluster_id": c, "size": size, "risk_level": risk,
                "avg_z_score": round(avg_z, 2), "pattern_description": pattern,
                "top_features": top_features, "fraud_rate_pct": fraud_rate_pct,
            })

        clusters.sort(key=lambda x: x["size"], reverse=True)
        high_count = sum(1 for c in clusters if c["risk_level"] == "HIGH")

        return jsonify({
            "clusters": clusters, "total_flagged": flagged_count, "k": k,
            "ai_summary": (
                f"Anomalies grouped into {k} distinct pattern clusters. "
                f"{high_count} high-risk group(s) identified requiring immediate attention."
            ),
        })

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Fraud Trends ─────────────────────────────────────────────────────────────

@app.route('/fraud-trends', methods=['GET'])
def fraud_trends():
    """Analyse fraud score trends across dataset batches and feature deviations."""
    try:
        df = state["df"]
        results = state["results"]
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]

        if df is None:
            return jsonify({"error": "No dataset loaded"}), 400
        if not results:
            return jsonify({"error": "No detection results. Run /detect first."}), 400

        scores = None
        preds = None
        if_model = state.get("if_model")
        scaler = state.get("scaler")
        if if_model and scaler:
            X = df[feature_cols].values
            X_scaled = scaler.transform(X)
            raw = if_model.predict(X_scaled)
            raw_scores = -if_model.score_samples(X_scaled)
            scores = (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-10)
            preds = (raw == -1).astype(int)

        # Batch-level trends (simulate temporal view)
        batch_trends = []
        if scores is not None:
            batch_size = max(1, len(scores) // 20)
            for i in range(0, len(scores), batch_size):
                b = scores[i:i + batch_size]
                bp = preds[i:i + batch_size]
                batch_trends.append({
                    "batch": f"B{i // batch_size + 1}",
                    "avg_score": round(float(b.mean()), 3),
                    "fraud_rate": round(float(bp.mean() * 100), 1),
                    "high_risk_count": int(np.sum(b > 0.7)),
                })

        # Feature deviation: flagged vs clean
        feature_deviation = []
        if scores is not None and feature_cols:
            X = df[feature_cols].values
            col_means = X.mean(axis=0)
            col_stds  = X.std(axis=0) + 1e-10
            flagged = preds == 1
            if flagged.sum() > 0:
                fm = X[flagged].mean(axis=0)
                dev = np.abs((fm - col_means) / col_stds)
                for i in np.argsort(dev)[::-1][:8]:
                    feature_deviation.append({
                        "feature": feature_cols[i],
                        "deviation_z": round(float(dev[i]), 2),
                        "fraud_mean": round(float(fm[i]), 3),
                        "overall_mean": round(float(col_means[i]), 3),
                    })

        # Risk tier evolution
        risk_evolution = [
            {"model": m,
             "low":    res.get("risk_tiers", {}).get("low", 0),
             "medium": res.get("risk_tiers", {}).get("medium", 0),
             "high":   res.get("risk_tiers", {}).get("high", 0)}
            for m, res in results.items()
        ]

        velocity_insight = ""
        if batch_trends:
            rates = [b["fraud_rate"] for b in batch_trends]
            if max(rates) > np.mean(rates) * 2:
                velocity_insight = (
                    f"Fraud velocity spike detected: peak rate {max(rates):.1f}% "
                    f"vs avg {np.mean(rates):.1f}%. Investigate concentrated fraud period."
                )
            else:
                velocity_insight = (
                    f"Fraud distribution is uniform across batches "
                    f"(avg {np.mean(rates):.1f}% rate). No velocity anomaly."
                )

        return jsonify({
            "batch_trends": batch_trends,
            "feature_deviation": feature_deviation,
            "risk_evolution": risk_evolution,
            "velocity_insight": velocity_insight,
            "detection_timestamp": state.get("detection_timestamp"),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Counterfactual Explanation ────────────────────────────────────────────────

@app.route('/counterfactual', methods=['POST'])
def counterfactual():
    """
    Given a flagged transaction, suggest minimal feature changes to make it legitimate.
    Uses the RF model to evaluate counterfactual scenarios.
    """
    try:
        data = request.get_json() or {}
        features = data.get("features", [])
        if not features or len(features) != len(RF_FEATURE_NAMES):
            return jsonify({"error": f"Provide exactly {len(RF_FEATURE_NAMES)} feature values"}), 400

        fv = np.array([float(v) for v in features], dtype=float)
        X = fv.reshape(1, -1)

        rf_pred  = int(rf_model.predict(X)[0])
        rf_proba = float(rf_model.predict_proba(X)[0][1]) if hasattr(rf_model, 'predict_proba') else 0.5

        suggestions = []
        for i, feat_name in enumerate(RF_FEATURE_NAMES):
            stats = RF_FEATURE_STATS.get(feat_name, {})
            legit_mean = stats.get("legit_mean", 0)
            fraud_mean = stats.get("fraud_mean", fv[i])
            std = stats.get("std", 1.0) or 1.0
            effect_size = abs(fraud_mean - legit_mean) / std
            if effect_size < 0.3:
                continue

            fv_test = fv.copy()
            fv_test[i] = legit_mean
            test_proba = float(rf_model.predict_proba(fv_test.reshape(1, -1))[0][1]) \
                if hasattr(rf_model, 'predict_proba') else 0.5
            test_pred  = int(rf_model.predict(fv_test.reshape(1, -1))[0])

            prob_reduction = rf_proba - test_proba
            if prob_reduction > 0.02:
                suggestions.append({
                    "feature": feat_name,
                    "current_value": round(float(fv[i]), 3),
                    "suggested_value": round(float(legit_mean), 3),
                    "direction": "decrease" if legit_mean < fv[i] else "increase",
                    "fraud_prob_reduction": round(float(prob_reduction * 100), 1),
                    "effect_size": round(float(effect_size), 2),
                    "impact": "HIGH" if prob_reduction > 0.1 else ("MEDIUM" if prob_reduction > 0.05 else "LOW"),
                })

        suggestions.sort(key=lambda x: x["fraud_prob_reduction"], reverse=True)
        top = suggestions[:5]

        # Apply all top suggestions together
        fv_cf = fv.copy()
        for s in top:
            idx = RF_FEATURE_NAMES.index(s["feature"])
            fv_cf[idx] = s["suggested_value"]

        cf_proba = float(rf_model.predict_proba(fv_cf.reshape(1, -1))[0][1]) \
            if hasattr(rf_model, 'predict_proba') else 0.5
        cf_pred  = int(rf_model.predict(fv_cf.reshape(1, -1))[0])

        return jsonify({
            "original_fraud_probability": round(rf_proba * 100, 1),
            "original_verdict": "FRAUD" if rf_pred == 1 else "LEGITIMATE",
            "counterfactual_fraud_probability": round(cf_proba * 100, 1),
            "counterfactual_verdict": "FRAUD" if cf_pred == 1 else "LEGITIMATE",
            "achievable": cf_pred == 0,
            "suggestions": top,
            "total_probability_reduction": round((rf_proba - cf_proba) * 100, 1),
            "ai_summary": (
                f"Applying {len(top)} targeted feature adjustments reduces fraud probability "
                f"from {rf_proba*100:.1f}% → {cf_proba*100:.1f}%. "
                + ("Transaction would be classified LEGITIMATE." if cf_pred == 0
                   else "Transaction still flagged — structural anomaly persists.")
            ),
        })

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Get stored results ───────────────────────────────────────────────────────

@app.route('/results', methods=['GET'])
def get_results():
    return jsonify(state["results"])


# ─── Get feature list ─────────────────────────────────────────────────────────

@app.route('/features', methods=['GET'])
def get_features():
    if state["df"] is None:
        return jsonify({"error": "No dataset loaded. Upload a CSV first."}), 400
    return jsonify({
        "feature_columns": state["feature_cols"],
        "label_column": state["label_col"],
        "rf_feature_names": RF_FEATURE_NAMES,
    })


# ─── RF Feature Importance ────────────────────────────────────────────────────

@app.route('/feature-importance', methods=['GET'])
def feature_importance():
    """
    Return RF model feature importances and, if dataset is loaded,
    feature-to-fraud label correlations and fraud/legit mean comparisons.
    """
    try:
        importances = rf_model.feature_importances_.tolist() \
            if hasattr(rf_model, 'feature_importances_') else []

        features = []
        for i, name in enumerate(RF_FEATURE_NAMES):
            imp = importances[i] if i < len(importances) else 0.0
            features.append({
                "feature": name,
                "importance": round(float(imp), 6),
                "importance_pct": round(float(imp) * 100, 2),
                "rank": 0,  # filled below
            })

        # Sort by importance descending, assign ranks
        features.sort(key=lambda x: x["importance"], reverse=True)
        for r, f in enumerate(features):
            f["rank"] = r + 1

        # Dataset-level enrichment: fraud/legit means + correlation
        df = state["df"]
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]

        dataset_stats = {}
        if df is not None and label_col and feature_cols:
            try:
                fraud_df = df[df[label_col] == 1]
                legit_df = df[df[label_col] == 0]
                corr = df[feature_cols + [label_col]].corr()[label_col].drop(label_col)
                for col in feature_cols:
                    dataset_stats[col] = {
                        "fraud_mean": round(float(fraud_df[col].mean()), 4) if len(fraud_df) else None,
                        "legit_mean": round(float(legit_df[col].mean()), 4) if len(legit_df) else None,
                        "correlation_with_fraud": round(float(corr.get(col, 0)), 4),
                    }
            except Exception:
                pass

        # Merge dataset stats into features list
        for f in features:
            stats = dataset_stats.get(f["feature"], {})
            f.update(stats)

        # Top 5 insight summary
        top5 = features[:5]
        top5_names = [f["feature"] for f in top5]
        insight = (
            f"The Random Forest model relies most heavily on: {', '.join(top5_names)}. "
            f"These features together account for {sum(f['importance_pct'] for f in top5):.1f}% "
            f"of all detection decisions."
        )

        return jsonify({
            "features": features,
            "total_features": len(features),
            "model": "Random Forest",
            "dataset_enriched": bool(dataset_stats),
            "insight": insight,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Similarity Search ────────────────────────────────────────────────────────

@app.route('/similarity-search', methods=['POST'])
def similarity_search():
    """
    Given a transaction's feature vector, find the top K most similar
    transactions in the loaded dataset using normalised L2 distance.
    """
    try:
        df = state["df"]
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]

        if df is None:
            return jsonify({"error": "No dataset loaded. Upload a CSV first."}), 400

        data = request.get_json() or {}
        raw_features = data.get("features", [])
        k = min(int(data.get("k", 5)), 20)

        if not raw_features:
            return jsonify({"error": "Provide a 'features' array"}), 400

        # Align feature vector to dataset columns
        if len(raw_features) == len(RF_FEATURE_NAMES) and feature_cols:
            # Map by name if possible
            query = []
            for col in feature_cols:
                idx = RF_FEATURE_NAMES.index(col) if col in RF_FEATURE_NAMES else -1
                query.append(float(raw_features[idx]) if idx >= 0 else 0.0)
        else:
            query = [float(v) for v in raw_features[:len(feature_cols)]]
            while len(query) < len(feature_cols):
                query.append(0.0)

        query = np.array(query, dtype=float)
        X = df[feature_cols].values.astype(float)

        # Normalise
        col_std = X.std(axis=0) + 1e-10
        col_mean = X.mean(axis=0)
        X_norm = (X - col_mean) / col_std
        q_norm = (query - col_mean) / col_std

        # L2 distances
        distances = np.sqrt(np.sum((X_norm - q_norm) ** 2, axis=1))
        top_idx = np.argsort(distances)[:k]

        results = []
        for idx in top_idx:
            row = df.iloc[idx]
            label = int(row[label_col]) if label_col else None
            rf_pred = None
            rf_proba_val = None
            if len(feature_cols) == len(RF_FEATURE_NAMES):
                try:
                    X_row = np.array([float(row[c]) for c in feature_cols]).reshape(1, -1)
                    rf_pred = int(rf_model.predict(X_row)[0])
                    if hasattr(rf_model, 'predict_proba'):
                        rf_proba_val = round(float(rf_model.predict_proba(X_row)[0][1]) * 100, 1)
                except Exception:
                    pass

            results.append({
                "dataset_index": int(idx),
                "distance": round(float(distances[idx]), 4),
                "similarity_pct": round(max(0, 100 - float(distances[idx]) * 10), 1),
                "label": label,
                "verdict": ("FRAUD" if label == 1 else "LEGITIMATE") if label is not None else
                           ("FRAUD" if rf_pred == 1 else "LEGITIMATE") if rf_pred is not None else "UNKNOWN",
                "fraud_probability": rf_proba_val,
                "feature_values": {c: round(float(row[c]), 3) for c in feature_cols[:6]},
            })

        fraud_neighbors = sum(1 for r in results if r["verdict"] == "FRAUD")
        insight = (
            f"{fraud_neighbors} of {len(results)} nearest neighbours are fraudulent — "
            + ("high fraud neighbourhood, elevated risk." if fraud_neighbors >= k // 2
               else "mostly legitimate neighbourhood, lower contextual risk.")
        )

        return jsonify({
            "similar_transactions": results,
            "query_k": k,
            "fraud_neighbor_count": fraud_neighbors,
            "insight": insight,
        })

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Smart Threshold Advisor ──────────────────────────────────────────────────

@app.route('/smart-threshold', methods=['GET'])
def smart_threshold():
    """
    Analyse the IF anomaly score distribution and recommend the optimal
    contamination value plus expected fraud count.
    """
    try:
        df = state["df"]
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]

        if df is None:
            return jsonify({"error": "No dataset loaded. Upload a CSV first."}), 400

        n = len(df)
        X = df[feature_cols].values.astype(float)

        # Fit a quick IF to get score distribution
        from sklearn.preprocessing import StandardScaler as SS
        sc = SS()
        X_sc = sc.fit_transform(X)
        quick_if = IsolationForest(contamination=0.05, n_estimators=50, random_state=42)
        quick_if.fit(X_sc)
        scores = -quick_if.score_samples(X_sc)
        scores_norm = (scores - scores.min()) / (scores.max() - scores.min() + 1e-10)

        # If ground-truth labels exist, use precision-recall to find best threshold
        best_contamination = 0.05
        method = "heuristic"
        label_based_rate = None

        if label_col:
            y = df[label_col].values.astype(int)
            label_based_rate = round(float(y.mean()), 4)
            best_contamination = round(float(np.clip(label_based_rate, 0.01, 0.5)), 3)
            method = "label-derived"

        # Natural breakpoints in score distribution
        p90 = float(np.percentile(scores_norm, 90))
        p95 = float(np.percentile(scores_norm, 95))
        p99 = float(np.percentile(scores_norm, 99))

        # Build recommendations
        recommendations = [
            {
                "label": "Conservative (fewer flags)",
                "contamination": round(float(np.percentile(scores_norm, 97)), 3),
                "expected_fraud": int(np.sum(scores_norm > p99)),
                "description": "Flags only the most extreme outliers. Best for low-noise, high-quality datasets.",
                "preset": "precision",
            },
            {
                "label": "Balanced (recommended)",
                "contamination": best_contamination,
                "expected_fraud": int(n * best_contamination),
                "description": "Good precision/recall trade-off. "
                               + (f"Derived from actual label rate ({label_based_rate*100:.1f}%)." if label_col
                                  else "Default heuristic for unknown fraud rate."),
                "preset": "balanced",
            },
            {
                "label": "Aggressive (catch more fraud)",
                "contamination": round(min(0.3, best_contamination * 2), 3),
                "expected_fraud": int(n * min(0.3, best_contamination * 2)),
                "description": "Broader net — higher recall but more false positives. Use for high-stakes scenarios.",
                "preset": "quick",
            },
        ]

        # Score histogram for visualisation
        counts, edges = np.histogram(scores_norm, bins=15)
        histogram = [
            {"bin": f"{edges[i]:.2f}", "count": int(counts[i]),
             "anomalous": bool(edges[i] >= 1 - best_contamination)}
            for i in range(len(counts))
        ]

        return jsonify({
            "dataset_rows": n,
            "recommended_contamination": best_contamination,
            "method": method,
            "label_fraud_rate": label_based_rate,
            "score_percentiles": {"p90": round(p90, 3), "p95": round(p95, 3), "p99": round(p99, 3)},
            "recommendations": recommendations,
            "score_histogram": histogram,
            "insight": (
                f"Based on {'actual label distribution' if label_col else 'score distribution analysis'}, "
                f"a contamination of {best_contamination} is recommended "
                f"(~{int(n * best_contamination)} flagged transactions out of {n:,})."
            ),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    import os
    import logging
    import flask.cli

    # Suppress ALL Flask/Werkzeug startup & request messages
    logging.getLogger('werkzeug').disabled = True
    flask.cli.show_server_banner = lambda *x, **kw: None

    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'

    print("\n" + "═" * 52)
    print("  SafePayAI  —  AI Model Server")
    print("═" * 52)
    print(f"  URL   : http://127.0.0.1:5000")
    print(f"  Model : RF loaded ✓")
    print(f"  Debug : {'ON  ⚠' if debug_mode else 'OFF ✓'}")
    print("  Ready : Listening for requests...")
    print("═" * 52 + "\n")

    app.run(
        host='127.0.0.1',
        port=5000,
        debug=debug_mode,
        use_reloader=debug_mode,
    )
