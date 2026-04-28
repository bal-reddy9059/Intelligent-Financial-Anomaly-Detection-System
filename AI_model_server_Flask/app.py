import os
from flask import Flask, request, jsonify, send_from_directory
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

app = Flask(__name__, static_folder='static', static_url_path='')
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
    "score_history": [],      # audit log of all scored transactions (max 1000)
    "feedback_log": [],       # human corrections submitted via /feedback
    "velocity_store": {},     # per-user transaction velocity windows {user_id: [timestamps+amounts]}
    "spending_baselines": {}, # per-user spending baseline stats {user_id: {mean, std, categories}}
    "location_store": {},     # per-user last known location {user_id: {lat, lon, ts, city}}
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


def _log_score(transaction_id, verdict, fraud_prob, risk, source, top_suspicious=None):
    """Append a scored transaction to the in-memory audit log (capped at 1000)."""
    entry = {
        "id": transaction_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "verdict": verdict,
        "fraud_probability": fraud_prob,
        "risk_level": risk,
        "source": source,
        "top_suspicious_features": top_suspicious or [],
    }
    state["score_history"].append(entry)
    if len(state["score_history"]) > 1000:
        state["score_history"] = state["score_history"][-1000:]


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

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react(path):
    static_dir = app.static_folder
    if path and os.path.exists(os.path.join(static_dir, path)):
        return send_from_directory(static_dir, path)
    return send_from_directory(static_dir, 'index.html')


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

        verdict = "FRAUD" if rf_pred == 1 else "LEGITIMATE"
        top_susp = [f["feature"] for f in analysis if f["suspicious"]][:3]
        tx_id = data.get("id", f"TX-{int(time.time()*1000)}")
        _log_score(tx_id, verdict, fraud_prob, risk, "predict", top_susp)

        return jsonify({
            "prediction": [rf_pred],
            "verdict": verdict,
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

        top_susp = [f["feature"] for f in suspicious_feats][:3]
        tx_id = data.get("id", f"TX-{int(time.time()*1000)}")
        _log_score(tx_id, overall, fraud_prob, risk, "check-single", top_susp)

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

            tx_id = tx.get("id", f"TX{i+1:04d}")
            _log_score(tx_id, verdict, fraud_prob, risk, "batch-check", top_suspicious)

            results.append({
                "index": i,
                "transaction_id": tx_id,
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
def explain_transaction_by_idx(idx):
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


# ─── Score History (Audit Log) ────────────────────────────────────────────────

@app.route('/score-history', methods=['GET'])
def score_history():
    """
    Return the in-memory audit log of all transactions scored through the API.
    Supports pagination via ?page=1&per_page=50 and filtering via ?verdict=FRAUD or ?risk=HIGH.
    """
    try:
        history = state["score_history"]

        # Filters
        verdict_filter = request.args.get("verdict", "").upper()
        risk_filter = request.args.get("risk", "").upper()
        source_filter = request.args.get("source", "").lower()

        filtered = history
        if verdict_filter in ("FRAUD", "LEGITIMATE"):
            filtered = [h for h in filtered if h["verdict"] == verdict_filter]
        if risk_filter in ("HIGH", "MEDIUM", "LOW"):
            filtered = [h for h in filtered if h["risk_level"] == risk_filter]
        if source_filter:
            filtered = [h for h in filtered if h["source"] == source_filter]

        # Pagination
        per_page = min(int(request.args.get("per_page", 50)), 200)
        page = max(1, int(request.args.get("page", 1)))
        total = len(filtered)
        start = (page - 1) * per_page
        end = start + per_page
        page_items = filtered[start:end]

        # Summary stats
        fraud_count = sum(1 for h in history if h["verdict"] == "FRAUD")
        high_count = sum(1 for h in history if h["risk_level"] == "HIGH")

        return jsonify({
            "history": list(reversed(page_items)),  # newest first
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "pages": max(1, (total + per_page - 1) // per_page),
            },
            "summary": {
                "total_scored": len(history),
                "fraud_count": fraud_count,
                "legitimate_count": len(history) - fraud_count,
                "high_risk_count": high_count,
                "fraud_rate_pct": round(fraud_count / max(len(history), 1) * 100, 1),
            },
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Watchlist ────────────────────────────────────────────────────────────────

@app.route('/watchlist', methods=['GET'])
def watchlist():
    """
    Return the top-N highest-risk transactions from the loaded dataset,
    with full feature profiles and risk scores. Useful for fraud analysts.
    Query params: ?n=20&model=isolation_forest&min_risk=HIGH
    """
    try:
        df = state["df"]
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]
        if_model = state.get("if_model")
        scaler = state.get("scaler")

        if df is None:
            return jsonify({"error": "No dataset loaded. Upload a CSV first."}), 400

        n = min(int(request.args.get("n", 20)), 100)
        min_risk = request.args.get("min_risk", "").upper()

        scores = None
        preds = None

        # Prefer IF scores if model is trained
        if if_model and scaler and feature_cols:
            X = df[feature_cols].values.astype(float)
            X_scaled = scaler.transform(X)
            raw = if_model.predict(X_scaled)
            raw_scores = -if_model.score_samples(X_scaled)
            scores = (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-10)
            preds = (raw == -1).astype(int)
        elif feature_cols and len(feature_cols) == len(RF_FEATURE_NAMES):
            # Fallback: use RF model
            X = df[feature_cols].values.astype(float)
            rf_probas = rf_model.predict_proba(X)[:, 1] if hasattr(rf_model, 'predict_proba') else \
                        rf_model.predict(X).astype(float)
            scores = rf_probas
            preds = rf_model.predict(X).astype(int)
        else:
            return jsonify({"error": "No trained model available. Run /detect first or upload RF-compatible data."}), 400

        # Build ranked list
        top_idx = np.argsort(scores)[::-1][:n * 3]  # fetch extra to allow filtering
        entries = []
        for idx in top_idx:
            score = float(scores[idx])
            risk = _risk_level(int(score * 100))
            if min_risk == "HIGH" and risk != "HIGH":
                continue
            if min_risk == "MEDIUM" and risk == "LOW":
                continue

            row = df.iloc[idx]
            ground_truth = int(row[label_col]) if label_col and label_col in df.columns else None
            feature_vals = {c: round(float(row[c]), 4) for c in feature_cols[:10]}

            entries.append({
                "dataset_index": int(idx),
                "anomaly_score": round(score, 4),
                "fraud_probability": int(score * 100),
                "risk_level": risk,
                "is_flagged": bool(preds[idx] == 1),
                "ground_truth": ground_truth,
                "ground_truth_label": ("FRAUD" if ground_truth == 1 else "LEGITIMATE") if ground_truth is not None else None,
                "feature_values": feature_vals,
            })
            if len(entries) >= n:
                break

        high_count = sum(1 for e in entries if e["risk_level"] == "HIGH")
        confirmed_fraud = sum(1 for e in entries if e["ground_truth"] == 1)

        return jsonify({
            "watchlist": entries,
            "total": len(entries),
            "high_risk_count": high_count,
            "confirmed_fraud_count": confirmed_fraud if label_col else None,
            "model_used": "isolation_forest" if if_model else "random_forest",
            "ai_summary": (
                f"Top {len(entries)} highest-risk transactions identified. "
                f"{high_count} flagged as HIGH risk. "
                + (f"{confirmed_fraud} confirmed fraud cases in ground truth." if label_col else
                   "No ground-truth labels available for confirmation.")
            ),
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Rule Engine ──────────────────────────────────────────────────────────────

@app.route('/rule-engine', methods=['POST'])
def rule_engine():
    """
    Apply custom rule-based fraud checks on top of ML predictions.
    Rules are evaluated in order; first matching rule wins.

    Request body:
    {
      "features": { "Transaction Amount": 95000, "VPN or Proxy Usage": 1, ... }
                  OR [v1, v2, ...] array matching RF_FEATURE_NAMES,
      "rules": [
        { "name": "High amount + VPN", "condition": "AND",
          "checks": [
            { "feature": "Transaction Amount", "op": "gt", "value": 50000 },
            { "feature": "VPN or Proxy Usage",  "op": "eq", "value": 1 }
          ],
          "action": "BLOCK", "severity": "HIGH" }
      ]
    }
    ops: gt, lt, gte, lte, eq, neq
    """
    try:
        data = request.get_json() or {}
        rules = data.get("rules", [])

        # Resolve feature dict
        raw = data.get("features", {})
        if isinstance(raw, list):
            feat_dict = {RF_FEATURE_NAMES[i]: float(raw[i]) for i in range(min(len(raw), len(RF_FEATURE_NAMES)))}
        else:
            feat_dict = {k: float(v) for k, v in raw.items() if isinstance(v, (int, float))}

        def _eval_check(check, feat_dict):
            feat = check.get("feature")
            op = check.get("op", "gt")
            threshold = float(check.get("value", 0))
            val = float(feat_dict.get(feat, 0))
            return {
                "gt": val > threshold, "lt": val < threshold,
                "gte": val >= threshold, "lte": val <= threshold,
                "eq": val == threshold, "neq": val != threshold,
            }.get(op, False)

        triggered_rules = []
        overall_action = "APPROVE"
        overall_severity = "LOW"

        severity_rank = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}

        for rule in rules:
            name = rule.get("name", "Unnamed Rule")
            condition = rule.get("condition", "AND").upper()
            checks = rule.get("checks", [])
            action = rule.get("action", "REVIEW")
            severity = rule.get("severity", "MEDIUM").upper()

            check_results = [_eval_check(c, feat_dict) for c in checks]
            triggered = all(check_results) if condition == "AND" else any(check_results)

            if triggered:
                triggered_rules.append({
                    "rule": name,
                    "action": action,
                    "severity": severity,
                    "condition": condition,
                    "checks_passed": sum(check_results),
                    "checks_total": len(checks),
                })
                if severity_rank.get(severity, 0) > severity_rank.get(overall_severity, 0):
                    overall_severity = severity
                    overall_action = action

        # Also run RF for ML signal
        rf_verdict = None
        rf_prob = None
        if len(feat_dict) == len(RF_FEATURE_NAMES):
            fv = np.array([feat_dict.get(n, 0.0) for n in RF_FEATURE_NAMES], dtype=float).reshape(1, -1)
            rf_pred_val = int(rf_model.predict(fv)[0])
            rf_prob = round(float(rf_model.predict_proba(fv)[0][1]) * 100, 1) if hasattr(rf_model, 'predict_proba') else None
            rf_verdict = "FRAUD" if rf_pred_val == 1 else "LEGITIMATE"

        # Final decision: rules take precedence; if no rules triggered, defer to ML
        if not triggered_rules:
            final_action = ("BLOCK" if rf_verdict == "FRAUD" else "APPROVE") if rf_verdict else "APPROVE"
            final_severity = overall_severity
            decision_source = "ml_model"
        else:
            final_action = overall_action
            final_severity = overall_severity
            decision_source = "rule_engine"

        return jsonify({
            "features_evaluated": feat_dict,
            "rules_evaluated": len(rules),
            "triggered_rules": triggered_rules,
            "triggered_count": len(triggered_rules),
            "final_action": final_action,
            "final_severity": final_severity,
            "decision_source": decision_source,
            "ml_verdict": rf_verdict,
            "ml_fraud_probability": rf_prob,
            "summary": (
                f"{len(triggered_rules)} rule(s) triggered out of {len(rules)} evaluated. "
                f"Final action: {final_action} ({final_severity} severity) — decision by {decision_source}."
            ),
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Bulk Explain ─────────────────────────────────────────────────────────────

@app.route('/bulk-explain', methods=['POST'])
def bulk_explain():
    """
    Get feature-level explanations for multiple transactions in one request.
    Accepts a list of feature vectors (array or named dict per transaction).

    Request: { "transactions": [ {"id": "TX001", "features": [v1, v2, ...]}, ... ] }
    Max 20 transactions per request.
    """
    try:
        data = request.get_json() or {}
        transactions = data.get("transactions", [])

        if not transactions:
            return jsonify({"error": "Provide a 'transactions' array"}), 400
        if len(transactions) > 20:
            return jsonify({"error": "Maximum 20 transactions per bulk-explain request"}), 400

        df = state["df"]
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]
        explanations = []

        for tx in transactions:
            tx_id = tx.get("id", f"TX-{int(time.time()*1000)}")
            raw = tx.get("features", [])

            if isinstance(raw, list):
                fv = [float(v) for v in raw]
                names = RF_FEATURE_NAMES if len(fv) == len(RF_FEATURE_NAMES) else (feature_cols or RF_FEATURE_NAMES)
            else:
                names = RF_FEATURE_NAMES
                fv = [float(raw.get(n, 0)) for n in names]

            X = np.array(fv, dtype=float).reshape(1, -1)

            # RF prediction
            rf_pred = None
            rf_proba = None
            if len(fv) == len(RF_FEATURE_NAMES):
                rf_pred = int(rf_model.predict(X)[0])
                if hasattr(rf_model, 'predict_proba'):
                    rf_proba = float(rf_model.predict_proba(X)[0][1])

            fraud_prob = _compute_fraud_probability(
                rf_pred if rf_pred is not None else 0,
                rf_proba
            )
            risk = _risk_level(fraud_prob)
            verdict = "FRAUD" if rf_pred == 1 else "LEGITIMATE"

            # Feature analysis
            if df is not None and feature_cols and len(fv) == len(feature_cols):
                analysis = _feature_analysis_from_df(fv, feature_cols, df, label_col)
            else:
                analysis = _feature_analysis_from_stats(fv, names, RF_FEATURE_STATS)

            suspicious = [f for f in analysis if f["suspicious"]]
            insight = _ai_insight(suspicious, risk, verdict=verdict)

            explanations.append({
                "id": tx_id,
                "verdict": verdict,
                "fraud_probability": fraud_prob,
                "risk_level": risk,
                "ai_insight": insight,
                "suspicious_feature_count": len(suspicious),
                "top_suspicious_features": [f["feature"] for f in suspicious[:3]],
                "feature_analysis": analysis[:8],
            })

        fraud_count = sum(1 for e in explanations if e["verdict"] == "FRAUD")
        return jsonify({
            "explanations": explanations,
            "total": len(explanations),
            "fraud_count": fraud_count,
            "legitimate_count": len(explanations) - fraud_count,
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Export Results ───────────────────────────────────────────────────────────

@app.route('/export-results', methods=['GET'])
def export_results():
    """
    Export the last detection results as CSV-ready data.
    Returns JSON with a 'csv_content' string and row-level records.
    Query param: ?source=score_history exports audit log instead of detection results.
    """
    try:
        source = request.args.get("source", "detection")

        if source == "score_history":
            history = state["score_history"]
            if not history:
                return jsonify({"error": "No scored transactions in history yet."}), 400

            rows = []
            for h in history:
                rows.append({
                    "id": h["id"],
                    "timestamp": h["timestamp"],
                    "verdict": h["verdict"],
                    "fraud_probability": h["fraud_probability"],
                    "risk_level": h["risk_level"],
                    "source_endpoint": h["source"],
                    "top_suspicious": "|".join(h.get("top_suspicious_features", [])),
                })

            df_export = pd.DataFrame(rows)
            csv_content = df_export.to_csv(index=False)
            return jsonify({
                "source": "score_history",
                "total_rows": len(rows),
                "csv_content": csv_content,
                "records": rows,
                "generated_at": datetime.utcnow().isoformat() + "Z",
            })

        # Default: export detection results
        results = state["results"]
        df = state["df"]
        feature_cols = state["feature_cols"]

        if not results:
            return jsonify({"error": "No detection results available. Run /detect first."}), 400
        if df is None:
            return jsonify({"error": "No dataset loaded."}), 400

        # Gather scores from IF model if available
        if_model = state.get("if_model")
        scaler = state.get("scaler")
        rows = []

        if if_model and scaler and feature_cols:
            X = df[feature_cols].values.astype(float)
            X_scaled = scaler.transform(X)
            raw = if_model.predict(X_scaled)
            raw_scores = -if_model.score_samples(X_scaled)
            scores = (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-10)
            preds = (raw == -1).astype(int)

            label_col = state["label_col"]
            for i in range(len(df)):
                row_data = {
                    "index": i,
                    "anomaly_score": round(float(scores[i]), 4),
                    "is_anomaly": int(preds[i]),
                    "risk_level": _risk_level(int(scores[i] * 100)),
                }
                if label_col and label_col in df.columns:
                    row_data["ground_truth"] = int(df.iloc[i][label_col])
                for col in feature_cols[:10]:
                    row_data[col] = round(float(df.iloc[i][col]), 4)
                rows.append(row_data)
        else:
            return jsonify({"error": "No Isolation Forest model trained. Run /detect first."}), 400

        df_export = pd.DataFrame(rows)
        csv_content = df_export.to_csv(index=False)

        return jsonify({
            "source": "detection_results",
            "total_rows": len(rows),
            "csv_content": csv_content,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "detection_timestamp": state.get("detection_timestamp"),
        })

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Human Feedback Loop ──────────────────────────────────────────────────────

@app.route('/feedback', methods=['POST'])
def submit_feedback():
    """
    Submit a human label correction for a previously scored transaction.
    This builds a correction log for future model retraining or evaluation.

    Request: {
      "transaction_id": "TX001",
      "model_verdict": "FRAUD",          // what the model said
      "human_label": "LEGITIMATE",       // what the analyst determined
      "analyst_id": "analyst_42",        // optional
      "notes": "False positive — known merchant"  // optional
    }
    """
    try:
        data = request.get_json() or {}
        tx_id = data.get("transaction_id")
        model_verdict = data.get("model_verdict", "").upper()
        human_label = data.get("human_label", "").upper()

        if not tx_id:
            return jsonify({"error": "Provide 'transaction_id'"}), 400
        if model_verdict not in ("FRAUD", "LEGITIMATE"):
            return jsonify({"error": "'model_verdict' must be FRAUD or LEGITIMATE"}), 400
        if human_label not in ("FRAUD", "LEGITIMATE"):
            return jsonify({"error": "'human_label' must be FRAUD or LEGITIMATE"}), 400

        is_correct = model_verdict == human_label
        correction_type = None
        if not is_correct:
            correction_type = "false_positive" if model_verdict == "FRAUD" else "false_negative"

        entry = {
            "transaction_id": tx_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "model_verdict": model_verdict,
            "human_label": human_label,
            "is_correct": is_correct,
            "correction_type": correction_type,
            "analyst_id": data.get("analyst_id", "anonymous"),
            "notes": data.get("notes", ""),
        }
        state["feedback_log"].append(entry)

        return jsonify({
            "accepted": True,
            "transaction_id": tx_id,
            "is_correct_prediction": is_correct,
            "correction_type": correction_type,
            "message": (
                "Model prediction confirmed as correct." if is_correct else
                f"Correction recorded: {correction_type.replace('_', ' ')} — "
                f"model said {model_verdict}, analyst says {human_label}."
            ),
            "total_feedback_entries": len(state["feedback_log"]),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/feedback-stats', methods=['GET'])
def feedback_stats():
    """Return aggregate statistics on all submitted human feedback corrections."""
    try:
        log = state["feedback_log"]
        if not log:
            return jsonify({
                "total": 0,
                "message": "No feedback submitted yet. Use POST /feedback to submit corrections.",
            })

        total = len(log)
        correct = sum(1 for e in log if e["is_correct"])
        fp = sum(1 for e in log if e["correction_type"] == "false_positive")
        fn = sum(1 for e in log if e["correction_type"] == "false_negative")
        accuracy = round(correct / total * 100, 1)

        # Per-analyst breakdown
        analyst_counts = {}
        for e in log:
            aid = e["analyst_id"]
            analyst_counts[aid] = analyst_counts.get(aid, 0) + 1

        recent = sorted(log, key=lambda x: x["timestamp"], reverse=True)[:10]

        return jsonify({
            "total_feedback": total,
            "correct_predictions": correct,
            "incorrect_predictions": total - correct,
            "model_accuracy_from_feedback": accuracy,
            "false_positives": fp,
            "false_negatives": fn,
            "false_positive_rate": round(fp / max(total, 1) * 100, 1),
            "false_negative_rate": round(fn / max(total, 1) * 100, 1),
            "analysts": analyst_counts,
            "recent_corrections": [e for e in recent if not e["is_correct"]],
            "ai_insight": (
                f"Model accuracy based on {total} analyst reviews: {accuracy}%. "
                + (f"High false positive rate ({round(fp/total*100,1)}%) — consider raising fraud threshold." if fp > fn and fp > total * 0.2 else "")
                + (f"High false negative rate ({round(fn/total*100,1)}%) — consider lowering fraud threshold." if fn > fp and fn > total * 0.2 else "")
                + ("Model performing well based on analyst feedback." if accuracy >= 90 else "")
            ),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Model Comparison ─────────────────────────────────────────────────────────

@app.route('/model-comparison', methods=['GET'])
def model_comparison():
    """
    Return a structured side-by-side comparison of all models run during
    the last /detect call, plus RF feature importance summary.
    Designed for the ModelComparison frontend component.
    """
    try:
        results = state["results"]
        df = state["df"]
        feature_cols = state["feature_cols"]

        if not results:
            return jsonify({"error": "No detection results available. Run /detect first."}), 400

        comparison = []
        for model_name, res in results.items():
            total = res.get("total", len(df) if df is not None else 0)
            detected = res.get("fraud_detected", 0)
            rate = round(detected / max(total, 1) * 100, 2)

            entry = {
                "model": model_name,
                "display_name": {
                    "isolation_forest": "Isolation Forest",
                    "autoencoder": "Autoencoder",
                    "random_forest": "Random Forest",
                }.get(model_name, model_name.replace("_", " ").title()),
                "fraud_detected": detected,
                "total_transactions": total,
                "fraud_rate_pct": rate,
                "precision": res.get("precision"),
                "recall": res.get("recall"),
                "f1_score": res.get("f1"),
                "auc_roc": res.get("auc"),
                "risk_tiers": res.get("risk_tiers", {}),
                "has_labels": res.get("f1") is not None,
                "top_anomalous_features": res.get("top_anomalous_features", []),
            }

            # Score distribution for charting
            entry["score_distribution"] = res.get("score_distribution", [])

            # ROC curve data (trimmed to 20 points for frontend)
            fpr = res.get("roc_fpr", [])
            tpr = res.get("roc_tpr", [])
            if fpr and tpr:
                step = max(1, len(fpr) // 20)
                entry["roc_curve"] = [
                    {"fpr": round(float(fpr[i]), 4), "tpr": round(float(tpr[i]), 4)}
                    for i in range(0, len(fpr), step)
                ]
            else:
                entry["roc_curve"] = []

            comparison.append(entry)

        # RF feature importance (always available)
        rf_importances = []
        if hasattr(rf_model, 'feature_importances_'):
            imps = rf_model.feature_importances_.tolist()
            rf_importances = sorted(
                [{"feature": RF_FEATURE_NAMES[i], "importance_pct": round(float(imps[i]) * 100, 2)}
                 for i in range(len(RF_FEATURE_NAMES))],
                key=lambda x: x["importance_pct"], reverse=True
            )[:10]

        # Determine best model by F1, fallback to AUC
        best_model = None
        best_score = -1
        for c in comparison:
            score = c["f1_score"] or c["auc_roc"] or 0
            if score > best_score:
                best_score = score
                best_model = c["model"]

        return jsonify({
            "comparison": comparison,
            "models_count": len(comparison),
            "best_model": best_model,
            "best_score": round(best_score, 4) if best_score >= 0 else None,
            "rf_feature_importance_top10": rf_importances,
            "detection_timestamp": state.get("detection_timestamp"),
            "ai_summary": (
                f"Compared {len(comparison)} model(s) from last detection run. "
                + (f"Best performer: {best_model} (score={round(best_score,3)})." if best_model else "")
            ),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
#  PHONEPE-STYLE AI FEATURES
# ══════════════════════════════════════════════════════════════════════════════

# ─── Velocity Fraud Detection ─────────────────────────────────────────────────

@app.route('/velocity-check', methods=['POST'])
def velocity_check():
    """
    UPI-style velocity fraud detection. Tracks how many transactions a user
    has made in recent time windows (1 min, 5 min, 1 hour, 24 hours) and
    flags abnormal bursts indicative of bot activity, account compromise,
    or mule behaviour.

    Request:
    {
      "user_id": "user@upi",
      "amount": 5000,
      "timestamp": "2024-12-01T14:32:00Z",   // optional, defaults to now
      "record": true                           // if true, log this transaction
    }
    """
    try:
        data = request.get_json() or {}
        user_id = data.get("user_id")
        amount = float(data.get("amount", 0))
        record = bool(data.get("record", True))

        if not user_id:
            return jsonify({"error": "Provide 'user_id'"}), 400

        # Parse timestamp
        ts_str = data.get("timestamp")
        if ts_str:
            try:
                now = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except Exception:
                now = datetime.utcnow()
        else:
            now = datetime.utcnow()

        now_ts = now.timestamp()

        store = state["velocity_store"]
        if user_id not in store:
            store[user_id] = []

        history = store[user_id]

        # Define velocity windows (seconds, label, max_allowed, max_amount)
        windows = [
            {"seconds": 60,      "label": "1 minute",  "max_count": 3,  "max_amount": 20000},
            {"seconds": 300,     "label": "5 minutes", "max_count": 5,  "max_amount": 50000},
            {"seconds": 3600,    "label": "1 hour",    "max_count": 15, "max_amount": 200000},
            {"seconds": 86400,   "label": "24 hours",  "max_count": 50, "max_amount": 1000000},
        ]

        window_results = []
        risk_signals = []

        for w in windows:
            cutoff = now_ts - w["seconds"]
            recent = [e for e in history if e["ts"] >= cutoff]
            count = len(recent)
            total_amt = sum(e["amount"] for e in recent)

            count_exceeded = count >= w["max_count"]
            amount_exceeded = total_amt + amount > w["max_amount"]

            if count_exceeded:
                risk_signals.append(f"{count} transactions in {w['label']} (limit: {w['max_count']})")
            if amount_exceeded:
                risk_signals.append(f"Total amount ₹{total_amt+amount:,.0f} in {w['label']} exceeds ₹{w['max_amount']:,}")

            window_results.append({
                "window": w["label"],
                "transaction_count": count,
                "total_amount": round(total_amt, 2),
                "count_limit": w["max_count"],
                "amount_limit": w["max_amount"],
                "count_exceeded": count_exceeded,
                "amount_exceeded": amount_exceeded,
            })

        # Burst detection: 3+ transactions within 30 seconds
        burst_cutoff = now_ts - 30
        burst_txns = [e for e in history if e["ts"] >= burst_cutoff]
        is_burst = len(burst_txns) >= 2
        if is_burst:
            risk_signals.append(f"Transaction burst: {len(burst_txns)+1} txns within 30 seconds (bot-like pattern)")

        # Escalating amount pattern detection
        recent_5 = sorted([e for e in history if e["ts"] >= now_ts - 3600], key=lambda x: x["ts"])[-5:]
        is_escalating = False
        if len(recent_5) >= 3:
            amounts = [e["amount"] for e in recent_5]
            diffs = [amounts[i+1] - amounts[i] for i in range(len(amounts)-1)]
            if all(d > 0 for d in diffs):
                is_escalating = True
                risk_signals.append("Escalating transaction amounts detected — possible limit probing")

        # Risk scoring
        signal_count = len(risk_signals)
        if signal_count == 0:
            velocity_risk = "LOW"
            action = "APPROVE"
        elif signal_count <= 2:
            velocity_risk = "MEDIUM"
            action = "REVIEW"
        else:
            velocity_risk = "HIGH"
            action = "BLOCK"

        # Record this transaction in store
        if record:
            store[user_id].append({"ts": now_ts, "amount": amount})
            # Keep only last 24h
            cutoff_24h = now_ts - 86400
            store[user_id] = [e for e in store[user_id] if e["ts"] >= cutoff_24h]

        return jsonify({
            "user_id": user_id,
            "amount": amount,
            "velocity_risk": velocity_risk,
            "recommended_action": action,
            "risk_signals": risk_signals,
            "is_burst_detected": is_burst,
            "is_escalating_amounts": is_escalating,
            "window_analysis": window_results,
            "total_user_history_count": len(store.get(user_id, [])),
            "ai_summary": (
                f"Velocity check for {user_id}: {velocity_risk} risk. "
                + (f"Triggered signals: {'; '.join(risk_signals)}." if risk_signals
                   else "No velocity anomalies detected. Transaction within normal frequency limits.")
            ),
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Suspicious Amount Pattern Detection ─────────────────────────────────────

@app.route('/amount-pattern', methods=['POST'])
def amount_pattern():
    """
    Detect suspicious transaction amount patterns used in UPI fraud:
    - Structuring: amounts just below reporting limits (e.g. 9999 instead of 10000)
    - Round-number suspicion in high amounts (10000, 50000)
    - Repeated identical amounts (smurfing)
    - Micro-transactions followed by large amount (account verification probing)
    - Amount spikes vs user's historical average

    Request: { "amount": 9999, "user_id": "user@upi", "user_avg_amount": 1500 }
    """
    try:
        data = request.get_json() or {}
        amount = float(data.get("amount", 0))
        user_id = data.get("user_id", "")
        user_avg = float(data.get("user_avg_amount", 0)) or None

        if amount <= 0:
            return jsonify({"error": "Provide a positive 'amount'"}), 400

        patterns_detected = []
        pattern_scores = []

        # 1. Structuring: just below common thresholds
        thresholds = [10000, 25000, 50000, 100000, 200000, 500000]
        for limit in thresholds:
            gap = limit - amount
            if 0 < gap <= limit * 0.02:  # within 2% below threshold
                patterns_detected.append({
                    "pattern": "structuring",
                    "detail": f"Amount ₹{amount:,.2f} is ₹{gap:,.2f} below reporting threshold ₹{limit:,}",
                    "severity": "HIGH",
                })
                pattern_scores.append(35)
                break

        # 2. Round-number high-value (more suspicious at high amounts)
        is_round = amount % 1000 == 0 or amount % 500 == 0
        if is_round and amount >= 10000:
            patterns_detected.append({
                "pattern": "round_high_value",
                "detail": f"Round amount ₹{amount:,.0f} — common in social engineering and advance-fee scams",
                "severity": "MEDIUM",
            })
            pattern_scores.append(15)

        # 3. Micro-transaction (possible account probing before large transfer)
        if 0 < amount <= 10:
            patterns_detected.append({
                "pattern": "micro_transaction",
                "detail": f"Very small amount ₹{amount:.2f} — may be recipient verification before large transfer",
                "severity": "LOW",
            })
            pattern_scores.append(10)

        # 4. Amount spike vs user's historical average
        if user_avg and user_avg > 0:
            spike_ratio = amount / user_avg
            if spike_ratio >= 10:
                patterns_detected.append({
                    "pattern": "amount_spike",
                    "detail": f"Amount is {spike_ratio:.1f}x user's average (₹{user_avg:,.2f}) — extreme spike",
                    "severity": "HIGH",
                })
                pattern_scores.append(40)
            elif spike_ratio >= 5:
                patterns_detected.append({
                    "pattern": "amount_spike",
                    "detail": f"Amount is {spike_ratio:.1f}x user's average — significant spike",
                    "severity": "MEDIUM",
                })
                pattern_scores.append(20)

        # 5. Velocity store: check for repeated identical amounts (smurfing)
        if user_id and user_id in state["velocity_store"]:
            history = state["velocity_store"][user_id]
            recent = [e for e in history if e["ts"] >= datetime.utcnow().timestamp() - 3600]
            same_count = sum(1 for e in recent if abs(e["amount"] - amount) < 1)
            if same_count >= 3:
                patterns_detected.append({
                    "pattern": "smurfing",
                    "detail": f"Amount ₹{amount:,.2f} repeated {same_count} times in the past hour",
                    "severity": "HIGH",
                })
                pattern_scores.append(30)

        # 6. Unusual decimal (e.g. 1234.56 — atypical for organic transactions)
        decimal_part = round(amount % 1, 2)
        if decimal_part not in (0.0, 0.5) and amount > 100:
            patterns_detected.append({
                "pattern": "unusual_decimal",
                "detail": f"Non-standard decimal amount ₹{amount:.2f} — may indicate automated/scripted transaction",
                "severity": "LOW",
            })
            pattern_scores.append(8)

        total_score = min(100, sum(pattern_scores))
        risk = "HIGH" if total_score >= 50 else ("MEDIUM" if total_score >= 20 else "LOW")

        return jsonify({
            "amount": amount,
            "user_id": user_id or None,
            "patterns_detected": patterns_detected,
            "pattern_count": len(patterns_detected),
            "risk_score": total_score,
            "risk_level": risk,
            "recommended_action": "BLOCK" if risk == "HIGH" else ("REVIEW" if risk == "MEDIUM" else "APPROVE"),
            "ai_summary": (
                f"{len(patterns_detected)} suspicious amount pattern(s) detected for ₹{amount:,.2f}. "
                f"Risk score: {total_score}/100 ({risk}). "
                + (f"Patterns: {', '.join(p['pattern'] for p in patterns_detected)}."
                   if patterns_detected else "Amount appears normal.")
            ),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Account Takeover Detection ───────────────────────────────────────────────

@app.route('/account-takeover', methods=['POST'])
def account_takeover():
    """
    Multi-signal Account Takeover (ATO) risk scoring — a core PhonePe/UPI
    AI safety feature. Combines device trust, location change, behavioural
    shift and transaction context to produce a composite ATO risk score.

    Request:
    {
      "user_id": "user@upi",
      "is_new_device": true,
      "is_new_location": true,
      "device_trust_score": 0.2,       // 0 (untrusted) to 1 (trusted)
      "location_change_km": 1200,       // distance from last known location
      "time_since_last_login_hrs": 0.5, // very recent login = suspicious with other signals
      "amount": 45000,
      "is_high_risk_time": true,        // 2am-5am transactions
      "failed_auth_attempts": 3,
      "profile_change_recent": true,    // phone/email changed recently
      "vpn_detected": false,
      "user_avg_amount": 2000
    }
    """
    try:
        data = request.get_json() or {}
        user_id = data.get("user_id", "anonymous")

        signals = []
        score = 0

        # Device trust
        is_new_device = bool(data.get("is_new_device", False))
        device_trust = float(data.get("device_trust_score", 1.0))
        if is_new_device:
            signals.append({"signal": "new_device", "weight": 25, "detail": "Transaction from an unrecognised device"})
            score += 25
        elif device_trust < 0.3:
            signals.append({"signal": "low_device_trust", "weight": 15, "detail": f"Device trust score is low ({device_trust:.2f})"})
            score += 15

        # Location change
        is_new_location = bool(data.get("is_new_location", False))
        location_km = float(data.get("location_change_km", 0))
        if location_km > 500:
            signals.append({"signal": "geo_anomaly", "weight": 20, "detail": f"Location changed by {location_km:.0f} km from last known position"})
            score += 20
        elif is_new_location:
            signals.append({"signal": "new_location", "weight": 12, "detail": "Transaction from an unrecognised location"})
            score += 12

        # Failed auth attempts
        failed_auth = int(data.get("failed_auth_attempts", 0))
        if failed_auth >= 5:
            signals.append({"signal": "brute_force", "weight": 30, "detail": f"{failed_auth} failed authentication attempts — possible credential stuffing"})
            score += 30
        elif failed_auth >= 2:
            signals.append({"signal": "auth_failures", "weight": 15, "detail": f"{failed_auth} failed auth attempts before this transaction"})
            score += 15

        # Profile change
        if bool(data.get("profile_change_recent", False)):
            signals.append({"signal": "profile_changed", "weight": 20, "detail": "Phone/email changed recently — common ATO step"})
            score += 20

        # High-risk time
        if bool(data.get("is_high_risk_time", False)):
            signals.append({"signal": "high_risk_time", "weight": 10, "detail": "Transaction at a high-risk time (2am–5am)"})
            score += 10

        # VPN
        if bool(data.get("vpn_detected", False)):
            signals.append({"signal": "vpn_proxy", "weight": 10, "detail": "VPN/proxy detected — identity masking"})
            score += 10

        # Amount spike vs user average
        amount = float(data.get("amount", 0))
        user_avg = float(data.get("user_avg_amount", 0))
        if user_avg > 0 and amount > 0:
            spike = amount / user_avg
            if spike >= 20:
                signals.append({"signal": "extreme_amount_spike", "weight": 25, "detail": f"Amount {spike:.0f}x above user average — atypical for legitimate use"})
                score += 25
            elif spike >= 10:
                signals.append({"signal": "amount_spike", "weight": 15, "detail": f"Amount {spike:.0f}x above user average"})
                score += 15

        # Compound ATO scenario: new device + new location + high amount together
        if is_new_device and is_new_location and amount > 10000:
            signals.append({"signal": "compound_ato_pattern", "weight": 20, "detail": "Classic ATO signature: new device + new location + high-value transaction simultaneously"})
            score += 20

        score = min(100, score)
        risk = "CRITICAL" if score >= 70 else ("HIGH" if score >= 50 else ("MEDIUM" if score >= 25 else "LOW"))
        action = "BLOCK" if score >= 50 else ("REVIEW" if score >= 25 else "APPROVE")

        recommended_steps = []
        if score >= 70:
            recommended_steps = ["Freeze account immediately", "Send OTP to registered mobile", "Require video KYC verification", "Alert fraud operations team"]
        elif score >= 50:
            recommended_steps = ["Require step-up authentication (OTP + PIN)", "Send suspicious activity alert to user", "Flag for manual review"]
        elif score >= 25:
            recommended_steps = ["Send in-app notification to user", "Require transaction PIN confirmation"]
        else:
            recommended_steps = ["Proceed normally"]

        return jsonify({
            "user_id": user_id,
            "ato_risk_score": score,
            "risk_level": risk,
            "recommended_action": action,
            "signals_detected": signals,
            "signal_count": len(signals),
            "recommended_steps": recommended_steps,
            "ai_summary": (
                f"ATO risk score: {score}/100 ({risk}) for user {user_id}. "
                + (f"{len(signals)} anomalous signal(s): {', '.join(s['signal'] for s in signals)}. "
                   if signals else "No ATO signals detected. ")
                + f"Recommended: {action}."
            ),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Recipient Trust Score ────────────────────────────────────────────────────

@app.route('/recipient-trust', methods=['POST'])
def recipient_trust():
    """
    Score the trustworthiness of a payment recipient (UPI ID) based on:
    - Their appearance in the loaded fraud dataset (blacklist status, fraud rate)
    - Recipient blacklist status and verification features from RF_FEATURE_STATS
    - Transaction pattern signals from the request

    Request:
    {
      "recipient_upi": "merchant@paytm",
      "recipient_blacklist_status": 0,          // 0=clean, 1=blacklisted
      "recipient_verification": "verified",      // "verified", "suspicious", "unknown"
      "fraud_complaints_against": 0,            // number of complaints filed
      "account_age_days": 30,                   // recipient account age
      "past_successful_txns_with_user": 5,      // how many times user paid this recipient
      "is_first_time_recipient": false
    }
    """
    try:
        data = request.get_json() or {}
        recipient_upi = data.get("recipient_upi", "unknown")

        trust_score = 100  # start fully trusted, deduct for red flags
        risk_flags = []
        positive_signals = []

        # Blacklist check
        blacklist = int(data.get("recipient_blacklist_status", 0))
        if blacklist == 1:
            trust_score -= 60
            risk_flags.append({"flag": "blacklisted", "severity": "CRITICAL", "detail": "Recipient UPI ID is on the fraud blacklist"})

        # Verification status
        verification = str(data.get("recipient_verification", "unknown")).lower()
        if verification == "suspicious":
            trust_score -= 30
            risk_flags.append({"flag": "suspicious_verification", "severity": "HIGH", "detail": "Recipient failed verification checks"})
        elif verification == "verified":
            trust_score += 5
            positive_signals.append("Recipient identity is verified")
        else:
            trust_score -= 10
            risk_flags.append({"flag": "unverified", "severity": "LOW", "detail": "Recipient identity not verified"})

        # Fraud complaints
        complaints = int(data.get("fraud_complaints_against", 0))
        if complaints >= 5:
            trust_score -= 35
            risk_flags.append({"flag": "high_complaint_count", "severity": "HIGH", "detail": f"{complaints} fraud complaints filed against this recipient"})
        elif complaints >= 2:
            trust_score -= 15
            risk_flags.append({"flag": "complaints_present", "severity": "MEDIUM", "detail": f"{complaints} complaints on record"})
        elif complaints == 0:
            positive_signals.append("No fraud complaints on record")

        # Account age
        account_age = int(data.get("account_age_days", 365))
        if account_age < 7:
            trust_score -= 25
            risk_flags.append({"flag": "very_new_account", "severity": "HIGH", "detail": f"Recipient account is only {account_age} day(s) old — common in scam accounts"})
        elif account_age < 30:
            trust_score -= 10
            risk_flags.append({"flag": "new_account", "severity": "MEDIUM", "detail": f"Recipient account is {account_age} days old"})
        elif account_age > 365:
            trust_score += 5
            positive_signals.append(f"Established account ({account_age} days old)")

        # Past transactions with this user
        past_txns = int(data.get("past_successful_txns_with_user", 0))
        is_first_time = bool(data.get("is_first_time_recipient", True))
        if past_txns >= 5:
            trust_score += 15
            positive_signals.append(f"{past_txns} successful past transactions with this recipient")
        elif is_first_time:
            trust_score -= 8
            risk_flags.append({"flag": "first_time_recipient", "severity": "LOW", "detail": "First transaction with this recipient"})

        # Dataset cross-reference (if dataset is loaded)
        dataset_note = None
        df = state["df"]
        feature_cols = state["feature_cols"]
        if df is not None and "Recipient Blacklist Status" in feature_cols:
            bl_col = "Recipient Blacklist Status"
            label_col = state["label_col"]
            if label_col:
                try:
                    fraud_bl_rate = float(df[df[label_col] == 1][bl_col].mean())
                    dataset_note = f"In loaded dataset, {fraud_bl_rate*100:.1f}% of fraud cases had blacklisted recipients."
                except Exception:
                    pass

        trust_score = max(0, min(100, trust_score))
        risk = "CRITICAL" if trust_score < 20 else ("HIGH" if trust_score < 40 else ("MEDIUM" if trust_score < 65 else "LOW"))

        return jsonify({
            "recipient_upi": recipient_upi,
            "trust_score": trust_score,
            "trust_grade": "A" if trust_score >= 85 else ("B" if trust_score >= 65 else ("C" if trust_score >= 40 else ("D" if trust_score >= 20 else "F"))),
            "risk_level": risk,
            "recommended_action": "BLOCK" if risk == "CRITICAL" else ("REVIEW" if risk in ("HIGH", "MEDIUM") else "APPROVE"),
            "risk_flags": risk_flags,
            "positive_signals": positive_signals,
            "dataset_insight": dataset_note,
            "ai_summary": (
                f"Recipient '{recipient_upi}' trust score: {trust_score}/100 (Grade: "
                + ("A" if trust_score >= 85 else "B" if trust_score >= 65 else "C" if trust_score >= 40 else "D" if trust_score >= 20 else "F")
                + f", {risk} risk). "
                + (f"{len(risk_flags)} risk flag(s) detected." if risk_flags else "No significant risk flags.")
            ),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Personal Spending Pattern Baseline ───────────────────────────────────────

@app.route('/spending-pattern', methods=['POST'])
def spending_pattern():
    """
    Analyse whether a transaction deviates from a user's personal spending
    baseline. Supports two modes:
    1. Register mode: submit historical transactions to build the baseline.
    2. Check mode: score a new transaction against the stored baseline.

    Request (register):
    {
      "mode": "register",
      "user_id": "user@upi",
      "transactions": [
        {"amount": 500, "category": "food", "hour": 12},
        {"amount": 2000, "category": "shopping", "hour": 18}
      ]
    }

    Request (check):
    {
      "mode": "check",
      "user_id": "user@upi",
      "amount": 45000,
      "category": "unknown",
      "hour": 3
    }
    """
    try:
        data = request.get_json() or {}
        mode = data.get("mode", "check")
        user_id = data.get("user_id")

        if not user_id:
            return jsonify({"error": "Provide 'user_id'"}), 400

        baselines = state["spending_baselines"]

        # ── Register mode ─────────────────────────────────────────────────────
        if mode == "register":
            txns = data.get("transactions", [])
            if not txns:
                return jsonify({"error": "Provide 'transactions' list in register mode"}), 400

            amounts = [float(t.get("amount", 0)) for t in txns if t.get("amount", 0) > 0]
            hours = [int(t.get("hour", 12)) for t in txns]
            categories = [str(t.get("category", "other")).lower() for t in txns]

            from collections import Counter
            cat_counts = Counter(categories)
            top_categories = [{"category": c, "count": n, "pct": round(n/len(categories)*100, 1)}
                               for c, n in cat_counts.most_common(5)]

            # Hour distribution: cluster into time-of-day bands
            morning = sum(1 for h in hours if 6 <= h < 12)
            afternoon = sum(1 for h in hours if 12 <= h < 18)
            evening = sum(1 for h in hours if 18 <= h < 23)
            night = sum(1 for h in hours if h < 6 or h >= 23)
            total_h = max(len(hours), 1)

            baselines[user_id] = {
                "amount_mean": float(np.mean(amounts)) if amounts else 0,
                "amount_std": float(np.std(amounts)) if len(amounts) > 1 else float(np.mean(amounts)) * 0.5,
                "amount_p95": float(np.percentile(amounts, 95)) if amounts else 0,
                "amount_max": float(np.max(amounts)) if amounts else 0,
                "top_categories": top_categories,
                "time_distribution": {
                    "morning_pct": round(morning/total_h*100, 1),
                    "afternoon_pct": round(afternoon/total_h*100, 1),
                    "evening_pct": round(evening/total_h*100, 1),
                    "night_pct": round(night/total_h*100, 1),
                },
                "transaction_count": len(txns),
                "registered_at": datetime.utcnow().isoformat() + "Z",
            }

            return jsonify({
                "mode": "register",
                "user_id": user_id,
                "baseline_registered": True,
                "summary": baselines[user_id],
                "message": f"Spending baseline registered for {user_id} using {len(txns)} transactions.",
            })

        # ── Check mode ────────────────────────────────────────────────────────
        baseline = baselines.get(user_id)
        amount = float(data.get("amount", 0))
        category = str(data.get("category", "unknown")).lower()
        hour = int(data.get("hour", datetime.utcnow().hour))

        if baseline is None:
            # No stored baseline — use dataset stats or RF_FEATURE_STATS as fallback
            df = state["df"]
            amount_col = find_amount_col(df) if df is not None else None
            if df is not None and amount_col:
                fallback_mean = float(df[amount_col].mean())
                fallback_std = float(df[amount_col].std())
            else:
                fallback_mean = RF_FEATURE_STATS["Transaction Amount"]["mean"]
                fallback_std = RF_FEATURE_STATS["Transaction Amount"]["std"]

            baseline = {
                "amount_mean": fallback_mean,
                "amount_std": fallback_std,
                "amount_p95": fallback_mean + 2 * fallback_std,
                "top_categories": [],
                "time_distribution": {"morning_pct": 30, "afternoon_pct": 35, "evening_pct": 25, "night_pct": 10},
                "transaction_count": 0,
            }
            used_fallback = True
        else:
            used_fallback = False

        deviations = []
        deviation_score = 0

        # Amount deviation
        mean = baseline["amount_mean"]
        std = max(baseline["amount_std"], 1.0)
        p95 = baseline["amount_p95"]
        z_amount = abs((amount - mean) / std)

        if z_amount > 5:
            deviations.append({"type": "extreme_amount", "z_score": round(z_amount, 2),
                                "detail": f"Amount ₹{amount:,.2f} is {z_amount:.1f} standard deviations above user's mean (₹{mean:,.2f})"})
            deviation_score += 50
        elif z_amount > 3:
            deviations.append({"type": "high_amount", "z_score": round(z_amount, 2),
                                "detail": f"Amount ₹{amount:,.2f} is {z_amount:.1f}x user's typical range"})
            deviation_score += 30
        elif z_amount > 2:
            deviations.append({"type": "above_normal", "z_score": round(z_amount, 2),
                                "detail": f"Amount slightly above user's normal spending range"})
            deviation_score += 15

        if amount > p95:
            deviations.append({"type": "above_p95", "detail": f"Amount exceeds user's 95th percentile (₹{p95:,.2f})"})
            deviation_score += 10

        # Category deviation
        known_cats = [c["category"] for c in baseline.get("top_categories", [])]
        if known_cats and category not in known_cats and category != "unknown":
            deviations.append({"type": "unusual_category", "detail": f"Category '{category}' not in user's typical spending: {', '.join(known_cats[:3])}"})
            deviation_score += 15

        # Time deviation: night transaction for a typically day-time user
        td = baseline.get("time_distribution", {})
        night_pct = td.get("night_pct", 10)
        if (hour < 5 or hour >= 23) and night_pct < 5:
            deviations.append({"type": "unusual_time", "detail": f"Transaction at {hour:02d}:00 — user rarely transacts at night ({night_pct}% historical night activity)"})
            deviation_score += 15

        deviation_score = min(100, deviation_score)
        risk = "HIGH" if deviation_score >= 50 else ("MEDIUM" if deviation_score >= 20 else "LOW")

        return jsonify({
            "mode": "check",
            "user_id": user_id,
            "amount": amount,
            "category": category,
            "hour": hour,
            "deviation_score": deviation_score,
            "risk_level": risk,
            "recommended_action": "BLOCK" if risk == "HIGH" else ("REVIEW" if risk == "MEDIUM" else "APPROVE"),
            "deviations": deviations,
            "baseline_summary": {
                "mean_amount": round(mean, 2),
                "std_amount": round(std, 2),
                "p95_amount": round(p95, 2),
                "source": "fallback_dataset" if used_fallback else "user_registered",
                "transaction_count": baseline.get("transaction_count", 0),
            },
            "ai_summary": (
                f"Spending pattern analysis for {user_id}: deviation score {deviation_score}/100 ({risk} risk). "
                + (f"{len(deviations)} deviation(s) from baseline: {'; '.join(d['detail'] for d in deviations)}."
                   if deviations else "Transaction consistent with user's normal spending patterns.")
            ),
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Network / Money Mule Detection ──────────────────────────────────────────

@app.route('/network-analysis', methods=['GET'])
def network_analysis():
    """
    Detect money mule networks and suspicious fund-flow patterns in the
    loaded dataset. Uses transaction frequency and blacklist co-occurrence
    to identify circular flows, hub nodes, and mule chains.

    Works on the loaded dataset's features. Most useful when dataset has:
    Transaction Frequency, Recipient Blacklist Status, Past Fraudulent Behaviour Flags,
    Social Trust Score features.
    """
    try:
        df = state["df"]
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]

        if df is None:
            return jsonify({"error": "No dataset loaded. Upload a CSV first."}), 400

        n = len(df)
        analysis = {}

        # ── Hub detection: high transaction frequency + low trust score ────────
        freq_col = next((c for c in feature_cols if "frequency" in c.lower()), None)
        trust_col = next((c for c in feature_cols if "trust" in c.lower()), None)
        blacklist_col = next((c for c in feature_cols if "blacklist" in c.lower()), None)
        fraud_flag_col = next((c for c in feature_cols if "fraudulent" in c.lower() or "past" in c.lower()), None)
        complaint_col = next((c for c in feature_cols if "complaint" in c.lower()), None)

        hub_count = 0
        mule_count = 0
        chain_count = 0

        if freq_col and trust_col:
            freq_vals = df[freq_col].values
            trust_vals = df[trust_col].values

            freq_threshold = float(np.percentile(freq_vals, 90))
            trust_threshold = float(np.percentile(trust_vals, 10))

            hub_mask = (freq_vals >= freq_threshold) & (trust_vals <= trust_threshold)
            hub_count = int(hub_mask.sum())

            analysis["hub_detection"] = {
                "hub_node_count": hub_count,
                "pct_of_dataset": round(hub_count / max(n, 1) * 100, 2),
                "criteria": f"Transaction frequency >= p90 ({freq_threshold:.1f}) AND social trust score <= p10 ({trust_threshold:.2f})",
                "fraud_rate_in_hubs": round(float(df.loc[hub_mask, label_col].mean() * 100), 1) if label_col and hub_mask.sum() > 0 else None,
                "interpretation": (
                    f"Identified {hub_count} potential hub nodes — accounts acting as central relays "
                    "in a transaction network with low social trust scores."
                ),
            }

        # ── Mule account detection: past fraud + blacklisted recipient + high freq ──
        if blacklist_col and fraud_flag_col:
            bl_vals = df[blacklist_col].values
            ff_vals = df[fraud_flag_col].values

            mule_mask = (bl_vals >= 0.5) & (ff_vals >= 0.5)
            if freq_col:
                mule_mask = mule_mask & (df[freq_col].values >= np.percentile(df[freq_col].values, 75))

            mule_count = int(mule_mask.sum())
            analysis["mule_accounts"] = {
                "suspected_mule_count": mule_count,
                "pct_of_dataset": round(mule_count / max(n, 1) * 100, 2),
                "confirmed_fraud_pct": round(float(df.loc[mule_mask, label_col].mean() * 100), 1) if label_col and mule_mask.sum() > 0 else None,
                "interpretation": (
                    f"{mule_count} accounts exhibit classic mule behaviour: "
                    "blacklisted recipient + past fraud history + high transaction frequency."
                ),
            }

        # ── Layering detection: complaints + context anomalies ────────────────
        context_col = next((c for c in feature_cols if "context" in c.lower()), None)
        if complaint_col and context_col:
            comp_vals = df[complaint_col].values
            ctx_vals = df[context_col].values

            comp_threshold = float(np.percentile(comp_vals, 85))
            ctx_threshold = float(np.percentile(ctx_vals, 85))

            layer_mask = (comp_vals >= comp_threshold) & (ctx_vals >= ctx_threshold)
            chain_count = int(layer_mask.sum())
            analysis["layering_patterns"] = {
                "layering_count": chain_count,
                "pct_of_dataset": round(chain_count / max(n, 1) * 100, 2),
                "confirmed_fraud_pct": round(float(df.loc[layer_mask, label_col].mean() * 100), 1) if label_col and layer_mask.sum() > 0 else None,
                "interpretation": (
                    f"{chain_count} transactions show layering signals: "
                    "high complaint count + high context anomaly score — typical of fund laundering chains."
                ),
            }

        # ── Network risk summary ──────────────────────────────────────────────
        total_suspicious = hub_count + mule_count + chain_count
        network_risk = "HIGH" if total_suspicious > n * 0.15 else ("MEDIUM" if total_suspicious > n * 0.05 else "LOW")

        # Feature availability note
        features_used = [f for f in [freq_col, trust_col, blacklist_col, fraud_flag_col, complaint_col, context_col] if f]

        return jsonify({
            "dataset_size": n,
            "network_analysis": analysis,
            "total_suspicious_nodes": total_suspicious,
            "network_risk_level": network_risk,
            "features_used": features_used,
            "ai_summary": (
                f"Network analysis of {n:,} transactions: {total_suspicious} suspicious network nodes identified. "
                f"Hub nodes: {hub_count}, Mule accounts: {mule_count}, Layering patterns: {chain_count}. "
                f"Overall network risk: {network_risk}. "
                + ("Recommend deep investigation of flagged accounts." if network_risk == "HIGH"
                   else "Network activity within acceptable bounds.")
            ),
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Transaction Purpose Classifier ──────────────────────────────────────────

@app.route('/transaction-purpose', methods=['POST'])
def transaction_purpose():
    """
    AI-based transaction purpose classifier. Uses feature patterns to
    classify a transaction into one of these categories:
    P2P_PERSONAL, MERCHANT_PAYMENT, BILL_UTILITY, INVESTMENT, SUSPICIOUS_ADVANCE_FEE,
    SUSPICIOUS_SOCIAL_ENGINEERING, SUSPICIOUS_SMURFING, UNKNOWN.

    PhonePe uses similar classification to personalise UX and apply
    category-specific fraud rules.

    Request: { "features": [v1, v2, ...] }  OR named feature dict
             + optional { "amount": 5000, "hour": 14, "is_merchant": false }
    """
    try:
        data = request.get_json() or {}

        # Resolve feature values
        raw = data.get("features", {})
        if isinstance(raw, list) and len(raw) == len(RF_FEATURE_NAMES):
            feat = {RF_FEATURE_NAMES[i]: float(raw[i]) for i in range(len(RF_FEATURE_NAMES))}
        elif isinstance(raw, dict):
            feat = {k: float(v) for k, v in raw.items()}
        else:
            feat = {}

        # Helper to safely get feature value
        def fv(name, default=0.0):
            return float(feat.get(name, data.get(name, default)))

        amount          = fv("Transaction Amount", data.get("amount", 0))
        frequency       = fv("Transaction Frequency")
        blacklist       = fv("Recipient Blacklist Status")
        trust           = fv("Social Trust Score")
        vpn             = fv("VPN or Proxy Usage")
        device_fp       = fv("Device Fingerprinting")
        past_fraud      = fv("Past Fraudulent Behavior Flags")
        complaints      = fv("Fraud Complaints Count")
        context_anom    = fv("Transaction Context Anomalies")
        merchant_mm     = fv("Merchant Category Mismatch")
        norm_amount     = fv("Normalized Transaction Amount")
        high_risk_time  = fv("High-Risk Transaction Times")
        is_merchant     = bool(data.get("is_merchant", False))
        hour            = int(data.get("hour", 12))

        # Classification rule-set (scored per category)
        scores = {
            "P2P_PERSONAL": 0,
            "MERCHANT_PAYMENT": 0,
            "BILL_UTILITY": 0,
            "INVESTMENT": 0,
            "SUSPICIOUS_ADVANCE_FEE": 0,
            "SUSPICIOUS_SOCIAL_ENGINEERING": 0,
            "SUSPICIOUS_SMURFING": 0,
        }
        explanations = {}

        # P2P personal: moderate amount, high trust, low frequency, clean
        if trust > 0.6 and blacklist < 0.1 and complaints < 1 and amount < 20000:
            scores["P2P_PERSONAL"] += 40
        if frequency < 5 and past_fraud < 0.1:
            scores["P2P_PERSONAL"] += 15

        # Merchant: is_merchant flag, low trust requirement, potential mismatch
        if is_merchant:
            scores["MERCHANT_PAYMENT"] += 50
        if merchant_mm < 0.2 and amount > 100:
            scores["MERCHANT_PAYMENT"] += 20
        if 9 <= hour <= 21:  # typical business hours
            scores["MERCHANT_PAYMENT"] += 10

        # Bill/utility: round amounts, recurring, moderate amount
        if amount % 100 == 0 and 100 <= amount <= 10000:
            scores["BILL_UTILITY"] += 25
        if frequency >= 3 and amount < 5000:
            scores["BILL_UTILITY"] += 15

        # Investment: large round amounts, verified recipient, low risk
        if amount >= 10000 and amount % 1000 == 0 and trust > 0.7 and blacklist < 0.1:
            scores["INVESTMENT"] += 35
        if norm_amount > 0.7 and past_fraud < 0.1:
            scores["INVESTMENT"] += 15

        # Advance fee scam: large amount, new recipient, high risk time, low trust
        if amount >= 5000 and trust < 0.3 and high_risk_time > 0.5:
            scores["SUSPICIOUS_ADVANCE_FEE"] += 40
        if blacklist > 0.3 or complaints > 2:
            scores["SUSPICIOUS_ADVANCE_FEE"] += 30
        if context_anom > 0.5 and vpn > 0.3:
            scores["SUSPICIOUS_ADVANCE_FEE"] += 20

        # Social engineering: unusual time, device anomaly, VPN, moderate amount
        if device_fp > 0.5 and vpn > 0.4 and high_risk_time > 0.5:
            scores["SUSPICIOUS_SOCIAL_ENGINEERING"] += 45
        if past_fraud > 0.5 and context_anom > 0.4:
            scores["SUSPICIOUS_SOCIAL_ENGINEERING"] += 30

        # Smurfing: low amounts, high frequency, blacklisted
        if amount < 5000 and frequency >= 10 and (blacklist > 0.3 or past_fraud > 0.3):
            scores["SUSPICIOUS_SMURFING"] += 50
        if norm_amount < 0.3 and frequency >= 8:
            scores["SUSPICIOUS_SMURFING"] += 20

        # Determine primary classification
        best_category = max(scores, key=lambda k: scores[k])
        best_score = scores[best_category]

        if best_score < 15:
            best_category = "UNKNOWN"
            confidence = "LOW"
        elif best_score < 35:
            confidence = "MEDIUM"
        else:
            confidence = "HIGH"

        is_suspicious = best_category.startswith("SUSPICIOUS_")

        # RF model cross-check
        rf_verdict = None
        if len(feat) == len(RF_FEATURE_NAMES):
            fv_arr = np.array([feat.get(n, 0.0) for n in RF_FEATURE_NAMES], dtype=float).reshape(1, -1)
            rf_pred_val = int(rf_model.predict(fv_arr)[0])
            rf_prob = round(float(rf_model.predict_proba(fv_arr)[0][1]) * 100, 1) if hasattr(rf_model, 'predict_proba') else None
            rf_verdict = {"verdict": "FRAUD" if rf_pred_val == 1 else "LEGITIMATE", "fraud_probability": rf_prob}

        # Category descriptions
        category_descriptions = {
            "P2P_PERSONAL": "Personal peer-to-peer transfer between known individuals",
            "MERCHANT_PAYMENT": "Payment to a registered merchant or business",
            "BILL_UTILITY": "Recurring utility, subscription, or bill payment",
            "INVESTMENT": "High-value investment, savings, or large transfer to trusted recipient",
            "SUSPICIOUS_ADVANCE_FEE": "Possible advance-fee/lottery scam — payment demanded before promised reward",
            "SUSPICIOUS_SOCIAL_ENGINEERING": "Possible social engineering attack — unusual device, VPN, and high-risk timing",
            "SUSPICIOUS_SMURFING": "Possible smurfing / structuring — small amounts at high frequency to evade detection",
            "UNKNOWN": "Insufficient signals to classify transaction purpose",
        }

        all_scores = sorted(
            [{"category": k, "score": v} for k, v in scores.items()],
            key=lambda x: x["score"], reverse=True
        )

        return jsonify({
            "predicted_purpose": best_category,
            "confidence": confidence,
            "description": category_descriptions.get(best_category, ""),
            "is_suspicious": is_suspicious,
            "all_category_scores": all_scores,
            "rf_cross_check": rf_verdict,
            "recommended_action": "BLOCK" if (is_suspicious and confidence == "HIGH") else
                                  ("REVIEW" if is_suspicious else "APPROVE"),
            "ai_summary": (
                f"Transaction classified as '{best_category}' with {confidence} confidence. "
                + (f"ALERT: Suspicious category detected — {category_descriptions.get(best_category, '')}. "
                   if is_suspicious else "")
                + (f"RF model cross-check: {rf_verdict['verdict']} ({rf_verdict['fraud_probability']}% fraud prob)."
                   if rf_verdict else "")
            ),
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ══════════════════════════════════════════════════════════════════════════════
#  ADVANCED FRAUD INTELLIGENCE FEATURES
# ══════════════════════════════════════════════════════════════════════════════

# ─── Geo-Velocity / Impossible Travel Detection ───────────────────────────────

@app.route('/geo-velocity', methods=['POST'])
def geo_velocity():
    """
    Detect impossible-travel fraud: two transactions from locations that are
    physically impossible to travel between in the elapsed time.

    Supports two input modes:
    - Coordinate mode: provide lat/lon for precise Haversine distance.
    - City-code mode: provide city name, uses approximate inter-city distances.

    Request:
    {
      "user_id": "user@upi",
      "lat": 19.076,  "lon": 72.877,          // current location (Mumbai)
      "city": "Mumbai",                         // optional city name
      "timestamp": "2024-12-01T14:32:00Z",     // optional, defaults to now
      "record": true                            // log this location
    }
    Response includes impossible_travel flag, distance_km, max_possible_km,
    and risk level.
    """
    try:
        import math
        data = request.get_json() or {}
        user_id = data.get("user_id")
        if not user_id:
            return jsonify({"error": "Provide 'user_id'"}), 400

        lat = data.get("lat")
        lon = data.get("lon")
        city = data.get("city", "")
        record = bool(data.get("record", True))

        # Parse timestamp
        ts_str = data.get("timestamp")
        try:
            now = datetime.fromisoformat(ts_str.replace("Z", "+00:00")) if ts_str else datetime.utcnow()
        except Exception:
            now = datetime.utcnow()
        now_ts = now.timestamp()

        # Fallback city coordinates (major Indian cities)
        CITY_COORDS = {
            "mumbai": (19.076, 72.877), "delhi": (28.613, 77.209),
            "bangalore": (12.972, 77.594), "bengaluru": (12.972, 77.594),
            "hyderabad": (17.385, 78.487), "chennai": (13.083, 80.270),
            "kolkata": (22.573, 88.364), "pune": (18.520, 73.856),
            "ahmedabad": (23.023, 72.571), "jaipur": (26.912, 75.787),
            "lucknow": (26.847, 80.947), "surat": (21.170, 72.831),
            "kanpur": (26.449, 80.331), "nagpur": (21.146, 79.089),
            "patna": (25.594, 85.137), "bhopal": (23.259, 77.413),
        }

        if lat is None or lon is None:
            city_key = city.lower().strip()
            if city_key in CITY_COORDS:
                lat, lon = CITY_COORDS[city_key]
            else:
                return jsonify({"error": "Provide 'lat'/'lon' coordinates or a known 'city' name"}), 400

        lat, lon = float(lat), float(lon)
        location_store = state["location_store"]
        prev = location_store.get(user_id)

        result = {
            "user_id": user_id,
            "current_location": {"lat": lat, "lon": lon, "city": city or None},
            "impossible_travel": False,
            "distance_km": None,
            "elapsed_minutes": None,
            "max_possible_km": None,
            "speed_kmh": None,
            "previous_location": None,
            "geo_risk_level": "LOW",
            "recommended_action": "APPROVE",
        }

        if prev:
            # Haversine distance
            R = 6371.0
            lat1, lon1 = math.radians(prev["lat"]), math.radians(prev["lon"])
            lat2, lon2 = math.radians(lat), math.radians(lon)
            dlat, dlon = lat2 - lat1, lon2 - lon1
            a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
            distance_km = round(2 * R * math.asin(math.sqrt(a)), 1)

            elapsed_sec = max(1, now_ts - prev["ts"])
            elapsed_min = round(elapsed_sec / 60, 1)
            # Max physically possible: commercial flight ~900 km/h + airport time floor 30 min
            max_possible_km = round(max(0, (elapsed_sec / 3600) * 900 - 50), 1)
            speed_kmh = round(distance_km / (elapsed_sec / 3600), 1)

            impossible = distance_km > max_possible_km and distance_km > 100
            if distance_km > 1000 and elapsed_min < 60:
                geo_risk = "CRITICAL"
                action = "BLOCK"
            elif impossible:
                geo_risk = "HIGH"
                action = "BLOCK"
            elif distance_km > 500 and elapsed_min < 120:
                geo_risk = "MEDIUM"
                action = "REVIEW"
            elif distance_km > 200:
                geo_risk = "LOW"
                action = "APPROVE"
            else:
                geo_risk = "LOW"
                action = "APPROVE"

            result.update({
                "impossible_travel": impossible,
                "distance_km": distance_km,
                "elapsed_minutes": elapsed_min,
                "max_possible_km": max_possible_km,
                "speed_kmh": speed_kmh,
                "previous_location": {"lat": prev["lat"], "lon": prev["lon"], "city": prev.get("city"), "ts": prev["ts"]},
                "geo_risk_level": geo_risk,
                "recommended_action": action,
                "ai_summary": (
                    f"Distance from last transaction: {distance_km} km in {elapsed_min} min "
                    f"(equivalent speed: {speed_kmh} km/h). "
                    + (f"IMPOSSIBLE TRAVEL DETECTED — max reachable in this time: {max_possible_km} km. "
                       if impossible else f"Travel is physically plausible (max: {max_possible_km} km). ")
                    + f"Geo risk: {geo_risk}."
                ),
            })
        else:
            result["ai_summary"] = f"First recorded location for {user_id}. No travel comparison possible yet."

        if record:
            location_store[user_id] = {"lat": lat, "lon": lon, "city": city, "ts": now_ts}

        return jsonify(result)

    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Unified Risk Score Blend ─────────────────────────────────────────────────

@app.route('/risk-score-blend', methods=['POST'])
def risk_score_blend():
    """
    Master risk endpoint — blends scores from every available signal source
    into one final weighted composite risk score (0–100). This mirrors how
    production payment engines like PhonePe combine ML + rules + behaviour.

    Pass whichever sub-scores you have; missing ones default to 0.
    Each signal carries a configurable weight (defaults provided).

    Request:
    {
      "rf_fraud_probability":   75,   // 0-100 from /predict or /check-single
      "velocity_risk":          "HIGH",   // LOW/MEDIUM/HIGH from /velocity-check
      "amount_risk_score":      40,   // 0-100 from /amount-pattern
      "ato_risk_score":         60,   // 0-100 from /account-takeover
      "recipient_trust_score":  30,   // 0-100 from /recipient-trust
      "spending_deviation":     25,   // 0-100 from /spending-pattern
      "geo_risk":               "LOW",    // LOW/MEDIUM/HIGH/CRITICAL from /geo-velocity
      "device_risk_score":      20,   // 0-100 from /device-risk
      "weights": {  // optional overrides
        "rf_model": 0.35, "velocity": 0.15, "amount": 0.10,
        "ato": 0.15, "recipient": 0.10, "spending": 0.05,
        "geo": 0.05, "device": 0.05
      }
    }
    """
    try:
        data = request.get_json() or {}

        # Default weights (must sum to 1.0)
        default_weights = {
            "rf_model":  0.35,
            "velocity":  0.15,
            "amount":    0.10,
            "ato":       0.15,
            "recipient": 0.10,
            "spending":  0.05,
            "geo":       0.05,
            "device":    0.05,
        }
        user_weights = data.get("weights", {})
        weights = {k: float(user_weights.get(k, default_weights[k])) for k in default_weights}

        # Normalise weights to sum to 1
        total_w = sum(weights.values())
        weights = {k: v / total_w for k, v in weights.items()}

        def level_to_score(level, high=80, medium=45, low=10, critical=95):
            lvl = str(level).upper()
            return {"CRITICAL": critical, "HIGH": high, "MEDIUM": medium, "LOW": low}.get(lvl, 0)

        # Resolve each signal score (0-100)
        rf_score      = float(data.get("rf_fraud_probability", 0))
        velocity_score = level_to_score(data.get("velocity_risk", "LOW"))
        amount_score  = float(data.get("amount_risk_score", 0))
        ato_score     = float(data.get("ato_risk_score", 0))
        # Recipient trust is inverted: low trust = high risk
        recipient_raw = float(data.get("recipient_trust_score", 100))
        recipient_score = max(0, 100 - recipient_raw)
        spending_score = float(data.get("spending_deviation", 0))
        geo_score     = level_to_score(data.get("geo_risk", "LOW"))
        device_score  = float(data.get("device_risk_score", 0))

        signal_scores = {
            "rf_model":  min(100, max(0, rf_score)),
            "velocity":  min(100, max(0, velocity_score)),
            "amount":    min(100, max(0, amount_score)),
            "ato":       min(100, max(0, ato_score)),
            "recipient": min(100, max(0, recipient_score)),
            "spending":  min(100, max(0, spending_score)),
            "geo":       min(100, max(0, geo_score)),
            "device":    min(100, max(0, device_score)),
        }

        # Weighted composite
        composite = sum(signal_scores[k] * weights[k] for k in signal_scores)
        composite = round(min(100, max(0, composite)), 1)

        # Hard overrides (any single critical signal forces minimum composite)
        if signal_scores["rf_model"] >= 85:
            composite = max(composite, 75)
        if signal_scores["ato"] >= 70:
            composite = max(composite, 65)
        if geo_score >= 95:  # CRITICAL geo
            composite = max(composite, 80)

        risk = "CRITICAL" if composite >= 80 else ("HIGH" if composite >= 60 else ("MEDIUM" if composite >= 35 else "LOW"))
        action = "BLOCK" if composite >= 60 else ("REVIEW" if composite >= 35 else "APPROVE")

        # Signal breakdown for transparency
        breakdown = [
            {
                "signal": k,
                "raw_score": round(signal_scores[k], 1),
                "weight": round(weights[k], 3),
                "weighted_contribution": round(signal_scores[k] * weights[k], 2),
                "level": "HIGH" if signal_scores[k] >= 60 else ("MEDIUM" if signal_scores[k] >= 30 else "LOW"),
            }
            for k in signal_scores
        ]
        breakdown.sort(key=lambda x: x["weighted_contribution"], reverse=True)

        top_signals = [b["signal"] for b in breakdown if b["weighted_contribution"] >= 5]

        return jsonify({
            "composite_risk_score": composite,
            "risk_level": risk,
            "recommended_action": action,
            "signal_breakdown": breakdown,
            "weights_used": weights,
            "top_contributing_signals": top_signals,
            "hard_overrides_applied": composite != round(sum(signal_scores[k] * weights[k] for k in signal_scores), 1),
            "ai_summary": (
                f"Composite risk score: {composite}/100 ({risk}). "
                f"Action: {action}. "
                + (f"Top signals: {', '.join(top_signals)}." if top_signals else "All signals within normal range.")
            ),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Fraud Calendar (Time-based Heatmap) ─────────────────────────────────────

@app.route('/fraud-calendar', methods=['GET'])
def fraud_calendar():
    """
    Build a fraud frequency heatmap by hour-of-day and day-of-week from
    the loaded dataset. Uses:
    - 'High-Risk Transaction Times' feature to infer risky hours
    - Actual date column if present
    - Score history timestamps for real scored transactions

    Returns heatmap data suitable for a calendar/heatmap chart component.
    """
    try:
        df = state["df"]
        feature_cols = state["feature_cols"]
        label_col = state["label_col"]
        score_history = state["score_history"]

        hour_fraud = [0] * 24
        hour_total = [0] * 24
        day_fraud  = [0] * 7   # 0=Mon … 6=Sun
        day_total  = [0] * 7

        # ── From score history (real scored transactions with timestamps) ──────
        history_hours = {}
        for entry in score_history:
            try:
                ts = datetime.fromisoformat(entry["timestamp"].replace("Z", "+00:00"))
                h = ts.hour
                history_hours[h] = history_hours.get(h, {"fraud": 0, "total": 0})
                history_hours[h]["total"] += 1
                if entry["verdict"] == "FRAUD":
                    history_hours[h]["fraud"] += 1
                d = ts.weekday()
                day_total[d] += 1
                if entry["verdict"] == "FRAUD":
                    day_fraud[d] += 1
            except Exception:
                pass

        # ── From dataset: use date column if available ────────────────────────
        dataset_hour_data = []
        if df is not None:
            date_col = find_date_col(df)
            if date_col:
                try:
                    dt_series = pd.to_datetime(df[date_col], errors='coerce')
                    for i, row in df.iterrows():
                        h = dt_series.iloc[i].hour if not pd.isnull(dt_series.iloc[i]) else None
                        d = dt_series.iloc[i].weekday() if not pd.isnull(dt_series.iloc[i]) else None
                        is_fraud = int(row[label_col]) if label_col and label_col in df.columns else 0
                        if h is not None:
                            hour_total[h] += 1
                            hour_fraud[h] += is_fraud
                        if d is not None:
                            day_total[d] += 1
                            day_fraud[d] += is_fraud
                except Exception:
                    pass

            # ── Fallback: use 'High-Risk Transaction Times' feature ───────────
            hrt_col = next((c for c in feature_cols if "high-risk" in c.lower() or "high_risk" in c.lower()), None)
            if hrt_col and sum(hour_total) == 0:
                high_risk_mask = df[hrt_col].values > 0.5
                # Map high-risk flag to typical night hours (23, 0, 1, 2, 3, 4)
                night_hours = [23, 0, 1, 2, 3, 4]
                day_hours = list(range(8, 20))
                for i in range(len(df)):
                    is_fraud = int(df.iloc[i][label_col]) if label_col else 0
                    if high_risk_mask[i]:
                        h = night_hours[i % len(night_hours)]
                    else:
                        h = day_hours[i % len(day_hours)]
                    hour_total[h] += 1
                    hour_fraud[h] += is_fraud

        # Merge score history into hour arrays
        for h, counts in history_hours.items():
            hour_total[h] += counts["total"]
            hour_fraud[h] += counts["fraud"]

        # Build output arrays
        hour_heatmap = []
        peak_fraud_hour = 0
        peak_rate = 0
        for h in range(24):
            total = hour_total[h]
            fraud = hour_fraud[h]
            rate = round(fraud / max(total, 1) * 100, 1)
            if rate > peak_rate and total > 0:
                peak_rate = rate
                peak_fraud_hour = h
            hour_heatmap.append({
                "hour": h,
                "label": f"{h:02d}:00",
                "total_transactions": total,
                "fraud_count": fraud,
                "fraud_rate_pct": rate,
                "risk_band": "HIGH" if rate >= 20 else ("MEDIUM" if rate >= 8 else "LOW"),
            })

        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        day_heatmap = []
        for d in range(7):
            total = day_total[d]
            fraud = day_fraud[d]
            rate = round(fraud / max(total, 1) * 100, 1)
            day_heatmap.append({
                "day_index": d,
                "day_name": day_names[d],
                "total_transactions": total,
                "fraud_count": fraud,
                "fraud_rate_pct": rate,
                "risk_band": "HIGH" if rate >= 20 else ("MEDIUM" if rate >= 8 else "LOW"),
            })

        high_risk_hours = [h["label"] for h in hour_heatmap if h["risk_band"] == "HIGH"]
        data_sources = []
        if sum(hour_total) > 0:
            data_sources.append("dataset")
        if score_history:
            data_sources.append("score_history")
        if not data_sources:
            data_sources.append("no_data")

        return jsonify({
            "hour_heatmap": hour_heatmap,
            "day_heatmap": day_heatmap,
            "peak_fraud_hour": peak_fraud_hour,
            "peak_fraud_hour_label": f"{peak_fraud_hour:02d}:00",
            "peak_fraud_rate_pct": peak_rate,
            "high_risk_hours": high_risk_hours,
            "data_sources": data_sources,
            "ai_summary": (
                f"Fraud calendar built from {sum(hour_total):,} transaction records. "
                + (f"Peak fraud hour: {peak_fraud_hour:02d}:00 ({peak_rate:.1f}% fraud rate). " if peak_rate > 0 else "")
                + (f"High-risk hours: {', '.join(high_risk_hours)}." if high_risk_hours else "No clear high-risk hour pattern detected.")
            ),
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Device Risk Scoring ──────────────────────────────────────────────────────

@app.route('/device-risk', methods=['POST'])
def device_risk():
    """
    Device fingerprint trust scoring — a foundational PhonePe/GPay safety layer.
    Analyses device signals to produce a device trust score (0 = untrusted,
    100 = fully trusted).

    Request:
    {
      "device_id": "dev_abc123",
      "is_rooted": false,
      "is_emulator": false,
      "is_new_device": true,
      "days_since_app_install": 1,
      "app_version": "5.1.2",
      "expected_app_version": "5.1.2",
      "os_version": "Android 13",
      "failed_biometric_attempts": 0,
      "is_screen_sharing_active": false,
      "accessibility_services_active": false,  // spyware / RAT indicator
      "unknown_sources_enabled": false,          // sideloaded APKs
      "battery_optimization_disabled": false,
      "is_vpn_active": false,
      "sim_changed_recently": false,
      "multiple_accounts_on_device": false
    }
    """
    try:
        data = request.get_json() or {}
        device_id = data.get("device_id", "unknown")

        trust_score = 100
        risk_flags = []
        positive_signals = []

        def deduct(points, flag, severity, detail):
            risk_flags.append({"flag": flag, "severity": severity, "detail": detail, "points_deducted": points})
            return points

        # Critical signals — immediate high risk
        if bool(data.get("is_rooted", False)):
            trust_score -= deduct(40, "rooted_device", "CRITICAL",
                "Device is rooted/jailbroken — security controls bypassed, malware risk very high")

        if bool(data.get("is_emulator", False)):
            trust_score -= deduct(45, "emulator", "CRITICAL",
                "Transaction from an emulator — typical of automated fraud bots and testing attacks")

        if bool(data.get("is_screen_sharing_active", False)):
            trust_score -= deduct(35, "screen_sharing", "CRITICAL",
                "Screen sharing active — user may be under remote control by scammer")

        if bool(data.get("accessibility_services_active", False)):
            trust_score -= deduct(30, "accessibility_abuse", "HIGH",
                "Accessibility services active — common indicator of RAT malware or overlay attacks")

        # High risk signals
        if bool(data.get("unknown_sources_enabled", False)):
            trust_score -= deduct(20, "unknown_sources", "HIGH",
                "Installation from unknown sources enabled — sideloaded or untrusted app")

        if bool(data.get("sim_changed_recently", False)):
            trust_score -= deduct(20, "sim_swap", "HIGH",
                "SIM card changed recently — possible SIM swap fraud")

        if bool(data.get("is_vpn_active", False)):
            trust_score -= deduct(15, "vpn_active", "MEDIUM",
                "VPN/proxy active — location masking detected")

        # Medium risk signals
        is_new_device = bool(data.get("is_new_device", False))
        if is_new_device:
            trust_score -= deduct(15, "new_device", "MEDIUM",
                "Transaction from a device not previously seen for this account")

        install_days = int(data.get("days_since_app_install", 365))
        if install_days < 1:
            trust_score -= deduct(20, "fresh_install", "HIGH",
                "App installed less than 24 hours ago — common in account takeover scenarios")
        elif install_days < 7:
            trust_score -= deduct(10, "recent_install", "MEDIUM",
                f"App installed only {install_days} day(s) ago")
        else:
            positive_signals.append(f"App installed {install_days} days ago — established device")

        app_ver = str(data.get("app_version", ""))
        expected_ver = str(data.get("expected_app_version", ""))
        if app_ver and expected_ver and app_ver != expected_ver:
            trust_score -= deduct(10, "outdated_app", "LOW",
                f"App version {app_ver} differs from expected {expected_ver} — update pending or tampered")

        failed_bio = int(data.get("failed_biometric_attempts", 0))
        if failed_bio >= 3:
            trust_score -= deduct(15, "biometric_failures", "MEDIUM",
                f"{failed_bio} failed biometric attempts before this transaction")

        if bool(data.get("multiple_accounts_on_device", False)):
            trust_score -= deduct(10, "multiple_accounts", "LOW",
                "Multiple payment accounts active on same device — shared device risk")

        # Positive signals
        if not bool(data.get("is_rooted", False)) and not bool(data.get("is_emulator", False)):
            positive_signals.append("Device integrity checks passed")
        if not bool(data.get("is_vpn_active", False)):
            positive_signals.append("No VPN/proxy detected")
        if install_days >= 30 and not is_new_device:
            positive_signals.append("Long-standing device with established history")

        trust_score = max(0, min(100, trust_score))
        risk = "CRITICAL" if trust_score < 20 else ("HIGH" if trust_score < 40 else ("MEDIUM" if trust_score < 65 else "LOW"))
        action = "BLOCK" if trust_score < 30 else ("REVIEW" if trust_score < 65 else "APPROVE")

        return jsonify({
            "device_id": device_id,
            "device_trust_score": trust_score,
            "trust_grade": "A" if trust_score >= 85 else ("B" if trust_score >= 65 else ("C" if trust_score >= 40 else ("D" if trust_score >= 20 else "F"))),
            "risk_level": risk,
            "recommended_action": action,
            "risk_flags": sorted(risk_flags, key=lambda x: {"CRITICAL":0,"HIGH":1,"MEDIUM":2,"LOW":3}[x["severity"]]),
            "positive_signals": positive_signals,
            "total_points_deducted": 100 - trust_score,
            "ai_summary": (
                f"Device '{device_id}' trust score: {trust_score}/100 ({risk} risk). "
                + (f"{len(risk_flags)} security flag(s): {', '.join(f['flag'] for f in risk_flags[:3])}."
                   if risk_flags else "Device passes all security checks.")
            ),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Dataset Drift Detection ──────────────────────────────────────────────────

@app.route('/dataset-drift', methods=['GET'])
def dataset_drift():
    """
    Detect feature distribution drift between the loaded dataset and the
    RF model's training reference (RF_FEATURE_STATS). A drifted dataset
    means the model's predictions may be unreliable.

    Uses Population Stability Index (PSI) approximation and z-score
    comparison of feature means to identify drifted features.
    PSI < 0.1 = stable, 0.1–0.25 = minor drift, > 0.25 = significant drift.
    """
    try:
        df = state["df"]
        feature_cols = state["feature_cols"]

        if df is None:
            return jsonify({"error": "No dataset loaded. Upload a CSV first."}), 400

        # Only check features that exist in both dataset and RF reference
        common_features = [c for c in feature_cols if c in RF_FEATURE_STATS]

        if not common_features:
            return jsonify({
                "message": "No features in common between loaded dataset and RF training reference.",
                "dataset_features": feature_cols[:10],
                "rf_features": RF_FEATURE_NAMES[:10],
            })

        drift_results = []
        drifted_features = []
        stable_features = []

        for feat in common_features:
            ref = RF_FEATURE_STATS[feat]
            ref_mean = ref["mean"]
            ref_std = max(ref["std"], 1e-6)

            dataset_mean = float(df[feat].mean())
            dataset_std = float(df[feat].std()) or 1e-6

            # Mean shift z-score
            mean_z = abs(dataset_mean - ref_mean) / ref_std

            # Variance ratio
            var_ratio = dataset_std / ref_std

            # PSI approximation using decile buckets
            ref_dist = np.random.normal(ref_mean, ref_std, 1000)
            dataset_vals = df[feat].values
            bins = np.percentile(ref_dist, np.linspace(0, 100, 11))
            bins[0] -= 1e-6
            bins[-1] += 1e-6

            ref_counts = np.histogram(ref_dist, bins=bins)[0]
            data_counts = np.histogram(dataset_vals, bins=bins)[0]

            ref_pct = ref_counts / max(ref_counts.sum(), 1)
            data_pct = data_counts / max(data_counts.sum(), 1)

            # PSI = sum((actual% - expected%) * ln(actual%/expected%))
            psi = 0.0
            for rp, dp in zip(ref_pct, data_pct):
                rp = max(rp, 1e-6)
                dp = max(dp, 1e-6)
                psi += (dp - rp) * np.log(dp / rp)
            psi = round(float(psi), 4)

            drift_level = "STABLE" if psi < 0.1 else ("MINOR_DRIFT" if psi < 0.25 else "SIGNIFICANT_DRIFT")
            is_drifted = psi >= 0.1

            entry = {
                "feature": feat,
                "training_mean": round(ref_mean, 4),
                "dataset_mean": round(dataset_mean, 4),
                "mean_shift_z": round(mean_z, 3),
                "training_std": round(ref_std, 4),
                "dataset_std": round(dataset_std, 4),
                "variance_ratio": round(var_ratio, 3),
                "psi": psi,
                "drift_level": drift_level,
                "is_drifted": is_drifted,
            }
            drift_results.append(entry)
            (drifted_features if is_drifted else stable_features).append(feat)

        drift_results.sort(key=lambda x: x["psi"], reverse=True)

        overall_psi = round(float(np.mean([r["psi"] for r in drift_results])), 4) if drift_results else 0
        overall_drift = "SIGNIFICANT" if overall_psi >= 0.25 else ("MINOR" if overall_psi >= 0.1 else "STABLE")

        recommendations = []
        if overall_drift == "SIGNIFICANT":
            recommendations.append("Significant feature drift detected — model predictions may be unreliable. Recommend retraining.")
            recommendations.append("Prioritise retraining on features: " + ", ".join(drifted_features[:3]))
        elif overall_drift == "MINOR":
            recommendations.append("Minor drift present. Monitor model performance and schedule retraining within 2 weeks.")
        else:
            recommendations.append("Dataset is well-aligned with training distribution. No immediate retraining required.")

        return jsonify({
            "features_checked": len(common_features),
            "drifted_features": drifted_features,
            "stable_features": stable_features,
            "overall_psi": overall_psi,
            "overall_drift_status": overall_drift,
            "feature_drift_details": drift_results,
            "recommendations": recommendations,
            "ai_summary": (
                f"Drift analysis: {len(drifted_features)}/{len(common_features)} features show distribution shift "
                f"from RF training baseline. Overall PSI: {overall_psi} ({overall_drift}). "
                + recommendations[0]
            ),
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ─── Retraining Readiness Assessment ──────────────────────────────────────────

@app.route('/retraining-readiness', methods=['POST'])
def retraining_readiness():
    """
    Assess whether the ML models are due for retraining based on multiple
    health signals. Returns a readiness score (0-100) and a retraining
    urgency level.

    Signals evaluated:
    - Analyst feedback accuracy (from /feedback-stats)
    - Score history fraud rate trend (rising = model degrading)
    - Dataset drift PSI (from /dataset-drift)
    - Dataset size (too small = unreliable)
    - Time since last detection run
    - False positive / false negative rates from feedback

    Request (all optional, read from state if not provided):
    {
      "override_feedback_accuracy": 85,   // % correct from feedback log
      "override_dataset_psi": 0.15,       // mean PSI from drift check
      "override_false_positive_rate": 12, // %
      "override_false_negative_rate": 8   // %
    }
    """
    try:
        data = request.get_json() or {}
        df = state["df"]
        feedback_log = state["feedback_log"]
        score_history = state["score_history"]
        detection_ts = state.get("detection_timestamp")

        issues = []
        score = 0  # higher = more urgency to retrain

        # ── Signal 1: Feedback accuracy ───────────────────────────────────────
        if "override_feedback_accuracy" in data:
            fb_accuracy = float(data["override_feedback_accuracy"])
        elif feedback_log:
            correct = sum(1 for e in feedback_log if e["is_correct"])
            fb_accuracy = round(correct / len(feedback_log) * 100, 1)
        else:
            fb_accuracy = None

        if fb_accuracy is not None:
            if fb_accuracy < 70:
                score += 35
                issues.append({"signal": "low_feedback_accuracy", "severity": "CRITICAL",
                                "detail": f"Model accuracy from analyst feedback: {fb_accuracy:.1f}% — well below acceptable threshold"})
            elif fb_accuracy < 85:
                score += 20
                issues.append({"signal": "degraded_accuracy", "severity": "HIGH",
                                "detail": f"Model accuracy from feedback: {fb_accuracy:.1f}% — below 85% target"})
            elif fb_accuracy < 92:
                score += 10
                issues.append({"signal": "marginal_accuracy", "severity": "MEDIUM",
                                "detail": f"Model accuracy: {fb_accuracy:.1f}% — slightly below ideal (>92%)"})

        # ── Signal 2: False positive / negative rates ─────────────────────────
        if "override_false_positive_rate" in data:
            fp_rate = float(data["override_false_positive_rate"])
        elif feedback_log:
            fp = sum(1 for e in feedback_log if e.get("correction_type") == "false_positive")
            fp_rate = round(fp / max(len(feedback_log), 1) * 100, 1)
        else:
            fp_rate = None

        if "override_false_negative_rate" in data:
            fn_rate = float(data["override_false_negative_rate"])
        elif feedback_log:
            fn = sum(1 for e in feedback_log if e.get("correction_type") == "false_negative")
            fn_rate = round(fn / max(len(feedback_log), 1) * 100, 1)
        else:
            fn_rate = None

        if fp_rate is not None and fp_rate > 20:
            score += 15
            issues.append({"signal": "high_false_positive_rate", "severity": "HIGH",
                            "detail": f"False positive rate: {fp_rate:.1f}% — model over-flagging legitimate transactions"})
        if fn_rate is not None and fn_rate > 10:
            score += 20
            issues.append({"signal": "high_false_negative_rate", "severity": "CRITICAL",
                            "detail": f"False negative rate: {fn_rate:.1f}% — model missing real fraud"})

        # ── Signal 3: Score history fraud rate trend ──────────────────────────
        history_trend = None
        if len(score_history) >= 20:
            half = len(score_history) // 2
            early_fraud_rate = sum(1 for h in score_history[:half] if h["verdict"] == "FRAUD") / half
            recent_fraud_rate = sum(1 for h in score_history[half:] if h["verdict"] == "FRAUD") / max(len(score_history) - half, 1)
            history_trend = round((recent_fraud_rate - early_fraud_rate) * 100, 1)

            if history_trend > 15:
                score += 20
                issues.append({"signal": "rising_fraud_rate", "severity": "HIGH",
                                "detail": f"Fraud detection rate increased by {history_trend:.1f}pp in recent scoring — possible concept drift"})
            elif history_trend > 8:
                score += 10
                issues.append({"signal": "increasing_fraud_trend", "severity": "MEDIUM",
                                "detail": f"Fraud rate trending upward ({history_trend:+.1f}pp) in recent transactions"})

        # ── Signal 4: Dataset drift ────────────────────────────────────────────
        if "override_dataset_psi" in data:
            mean_psi = float(data["override_dataset_psi"])
        elif df is not None:
            # Quick PSI estimate for key features
            psi_vals = []
            for feat in RF_FEATURE_NAMES[:8]:
                if feat in (state["feature_cols"] or []):
                    ref = RF_FEATURE_STATS.get(feat, {})
                    ref_mean = ref.get("mean", 0)
                    ref_std = max(ref.get("std", 1), 1e-6)
                    ds_mean = float(df[feat].mean())
                    z = abs(ds_mean - ref_mean) / ref_std
                    psi_vals.append(min(1.0, z * 0.1))
            mean_psi = round(float(np.mean(psi_vals)), 4) if psi_vals else 0
        else:
            mean_psi = 0

        if mean_psi >= 0.25:
            score += 25
            issues.append({"signal": "significant_data_drift", "severity": "HIGH",
                            "detail": f"Mean PSI {mean_psi:.3f} — significant distribution shift from training data"})
        elif mean_psi >= 0.1:
            score += 12
            issues.append({"signal": "minor_data_drift", "severity": "MEDIUM",
                            "detail": f"Mean PSI {mean_psi:.3f} — minor distribution drift detected"})

        # ── Signal 5: Dataset size ────────────────────────────────────────────
        if df is not None:
            n = len(df)
            if n < 500:
                score += 15
                issues.append({"signal": "small_dataset", "severity": "MEDIUM",
                                "detail": f"Only {n} rows loaded — too small for reliable model evaluation"})

        # ── Signal 6: Time since last detection ───────────────────────────────
        days_since = None
        if detection_ts:
            try:
                last_dt = datetime.fromisoformat(detection_ts.replace("Z", "+00:00"))
                days_since = (datetime.utcnow() - last_dt.replace(tzinfo=None)).days
                if days_since > 30:
                    score += 10
                    issues.append({"signal": "stale_detection", "severity": "LOW",
                                    "detail": f"Last detection run was {days_since} days ago — models may be outdated"})
            except Exception:
                pass

        score = min(100, score)
        urgency = "IMMEDIATE" if score >= 60 else ("RECOMMENDED" if score >= 30 else ("OPTIONAL" if score >= 15 else "NOT_NEEDED"))

        retraining_steps = {
            "IMMEDIATE": [
                "1. Collect and label recent transactions (minimum 500 labelled samples)",
                "2. Run /upload with new dataset and check /dataset-drift",
                "3. Run /detect with autoencoder + isolation_forest",
                "4. Compare metrics via /model-comparison before deploying",
                "5. Reset feedback log after retraining",
            ],
            "RECOMMENDED": [
                "1. Accumulate more analyst-labelled data (target 1,000+ samples)",
                "2. Schedule retraining within 2 weeks",
                "3. Monitor /feedback-stats weekly until retrained",
            ],
            "OPTIONAL": ["Monitor /feedback-stats and /score-history for 1–2 more weeks before deciding."],
            "NOT_NEEDED": ["Models are performing well. Continue routine monitoring."],
        }

        return jsonify({
            "retraining_urgency": urgency,
            "readiness_score": score,
            "issues_detected": issues,
            "issue_count": len(issues),
            "signals_evaluated": {
                "feedback_accuracy_pct": fb_accuracy,
                "false_positive_rate_pct": fp_rate,
                "false_negative_rate_pct": fn_rate,
                "score_history_trend_pp": history_trend,
                "mean_dataset_psi": mean_psi,
                "days_since_last_detection": days_since,
                "dataset_rows": len(df) if df is not None else None,
                "feedback_entries": len(feedback_log),
            },
            "recommended_steps": retraining_steps[urgency],
            "ai_summary": (
                f"Retraining readiness score: {score}/100 — urgency: {urgency}. "
                + (f"{len(issues)} issue(s) flagged: {', '.join(i['signal'] for i in issues)}."
                   if issues else "All health signals are within acceptable ranges.")
            ),
        })
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ══════════════════════════════════════════════════════════════════════════════
# WEEK 1 — Notifications & Transaction Limits
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/notifications', methods=['GET'])
def get_notifications():
    """Return simulated notifications list for the authenticated user."""
    user_id = request.args.get('userId', '')
    notifs = [
        {"id": "n1", "type": "fraud_alert", "title": "High-Risk Transaction Detected",
         "message": "A transaction of ₹8,500 to unknown@upi was flagged as HIGH_RISK by our AI.",
         "read": False, "createdAt": int(time.time()) - 300, "severity": "HIGH"},
        {"id": "n2", "type": "budget_warning", "title": "Budget Limit Warning",
         "message": "You have used 85% of your Entertainment budget this month.",
         "read": False, "createdAt": int(time.time()) - 3600, "severity": "MEDIUM"},
        {"id": "n3", "type": "payment", "title": "Payment Successful",
         "message": "₹1,200 sent to merchant@upi successfully.",
         "read": True, "createdAt": int(time.time()) - 86400, "severity": "LOW"},
        {"id": "n4", "type": "system", "title": "Security Tip",
         "message": "Never share your UPI PIN with anyone, including bank officials.",
         "read": True, "createdAt": int(time.time()) - 172800, "severity": "INFO"},
    ]
    return jsonify({"notifications": notifs, "unread_count": sum(1 for n in notifs if not n["read"])})


@app.route('/transaction-limits/validate', methods=['POST'])
def validate_transaction_limit():
    """
    Validate a proposed transaction amount against the user's configured daily limits.
    Expects: { userId, amount, dailyLimit, perTxLimit, dailySpentSoFar }
    """
    try:
        data = request.get_json() or {}
        amount = float(data.get('amount', 0))
        daily_limit = float(data.get('dailyLimit', 0))
        per_tx_limit = float(data.get('perTxLimit', 0))
        daily_spent = float(data.get('dailySpentSoFar', 0))

        violations = []
        if per_tx_limit > 0 and amount > per_tx_limit:
            violations.append({
                "type": "PER_TRANSACTION",
                "message": f"Amount ₹{amount:,.0f} exceeds per-transaction limit of ₹{per_tx_limit:,.0f}",
            })
        if daily_limit > 0 and (daily_spent + amount) > daily_limit:
            remaining = max(0, daily_limit - daily_spent)
            violations.append({
                "type": "DAILY",
                "message": f"This would exceed your daily limit of ₹{daily_limit:,.0f}. Remaining: ₹{remaining:,.0f}",
            })

        return jsonify({
            "allowed": len(violations) == 0,
            "violations": violations,
            "daily_remaining": max(0, daily_limit - daily_spent) if daily_limit > 0 else None,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
# WEEK 2 — Split Bill & Recurring Payments
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/split-bill/calculate', methods=['POST'])
def split_bill_calculate():
    """
    Calculate equal or custom splits for a group expense.
    Expects: { totalAmount, members: [{name, upiId, sharePercent?}], splitType: 'equal'|'custom' }
    """
    try:
        data = request.get_json() or {}
        total = float(data.get('totalAmount', 0))
        members = data.get('members', [])
        split_type = data.get('splitType', 'equal')

        if not members or total <= 0:
            return jsonify({"error": "Invalid amount or members"}), 400

        splits = []
        if split_type == 'equal':
            share = round(total / len(members), 2)
            remainder = round(total - share * len(members), 2)
            for i, m in enumerate(members):
                splits.append({
                    "name": m.get('name', ''),
                    "upiId": m.get('upiId', ''),
                    "amount": share + (remainder if i == 0 else 0),
                    "paid": False,
                })
        else:
            for m in members:
                pct = float(m.get('sharePercent', 100 / len(members)))
                splits.append({
                    "name": m.get('name', ''),
                    "upiId": m.get('upiId', ''),
                    "amount": round(total * pct / 100, 2),
                    "paid": False,
                })

        return jsonify({
            "totalAmount": total,
            "memberCount": len(members),
            "splitType": split_type,
            "splits": splits,
            "generatedAt": datetime.utcnow().isoformat() + "Z",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/recurring-payments/next-dates', methods=['POST'])
def recurring_next_dates():
    """
    Calculate next N execution dates for a recurring payment.
    Expects: { frequency: 'daily'|'weekly'|'monthly', startDate, count }
    """
    try:
        from datetime import timedelta
        data = request.get_json() or {}
        frequency = data.get('frequency', 'monthly')
        start_str = data.get('startDate', datetime.utcnow().date().isoformat())
        count = int(data.get('count', 6))

        start = datetime.fromisoformat(start_str).date()
        dates = []
        current = start
        for _ in range(count):
            dates.append(current.isoformat())
            if frequency == 'daily':
                current += timedelta(days=1)
            elif frequency == 'weekly':
                current += timedelta(weeks=1)
            else:
                # Monthly — same day next month
                month = current.month + 1
                year = current.year + (month - 1) // 12
                month = ((month - 1) % 12) + 1
                import calendar
                day = min(current.day, calendar.monthrange(year, month)[1])
                current = current.replace(year=year, month=month, day=day)

        return jsonify({"frequency": frequency, "nextDates": dates})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
# WEEK 3 — Savings Goals & EMI Calculator
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/savings-goals/projection', methods=['POST'])
def savings_goal_projection():
    """
    Project whether a savings goal is achievable by the target date.
    Expects: { targetAmount, savedSoFar, targetDate, monthlySaving }
    """
    try:
        from datetime import timedelta
        data = request.get_json() or {}
        target = float(data.get('targetAmount', 0))
        saved = float(data.get('savedSoFar', 0))
        monthly = float(data.get('monthlySaving', 0))
        target_date_str = data.get('targetDate', '')

        remaining = max(0, target - saved)
        pct = round((saved / target * 100) if target > 0 else 0, 1)

        months_needed = 0
        if monthly > 0:
            months_needed = int(np.ceil(remaining / monthly))

        on_track = False
        months_remaining = None
        if target_date_str:
            target_dt = datetime.fromisoformat(target_date_str)
            now = datetime.utcnow()
            delta_months = (target_dt.year - now.year) * 12 + (target_dt.month - now.month)
            months_remaining = max(0, delta_months)
            required_monthly = round(remaining / months_remaining, 2) if months_remaining > 0 else remaining
            on_track = monthly >= required_monthly
        else:
            required_monthly = None
            on_track = months_needed <= 12

        return jsonify({
            "targetAmount": target,
            "savedSoFar": saved,
            "remaining": remaining,
            "percentComplete": pct,
            "monthsNeeded": months_needed,
            "monthsRemaining": months_remaining,
            "requiredMonthlySaving": required_monthly,
            "onTrack": on_track,
            "status": "ON_TRACK" if on_track else "BEHIND",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/emi/calculate', methods=['POST'])
def emi_calculate():
    """
    Calculate EMI, total interest, and amortization schedule.
    Expects: { principal, annualRate, tenureMonths }
    """
    try:
        data = request.get_json() or {}
        principal = float(data.get('principal', 0))
        annual_rate = float(data.get('annualRate', 0))
        tenure = int(data.get('tenureMonths', 12))

        if principal <= 0 or tenure <= 0:
            return jsonify({"error": "Invalid principal or tenure"}), 400

        if annual_rate == 0:
            emi = round(principal / tenure, 2)
            total_payment = principal
            total_interest = 0
            schedule = [{"month": i + 1, "emi": emi, "principal": emi, "interest": 0,
                         "balance": round(principal - emi * (i + 1), 2)} for i in range(tenure)]
        else:
            r = annual_rate / 12 / 100
            emi = round(principal * r * (1 + r) ** tenure / ((1 + r) ** tenure - 1), 2)
            total_payment = round(emi * tenure, 2)
            total_interest = round(total_payment - principal, 2)
            schedule = []
            balance = principal
            for i in range(tenure):
                interest_part = round(balance * r, 2)
                principal_part = round(emi - interest_part, 2)
                balance = round(max(0, balance - principal_part), 2)
                schedule.append({
                    "month": i + 1,
                    "emi": emi,
                    "principal": principal_part,
                    "interest": interest_part,
                    "balance": balance,
                })

        return jsonify({
            "principal": principal,
            "annualRate": annual_rate,
            "tenureMonths": tenure,
            "monthlyEMI": emi,
            "totalPayment": total_payment,
            "totalInterest": total_interest,
            "interestPercent": round(total_interest / principal * 100, 1) if principal > 0 else 0,
            "amortizationSchedule": schedule,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
# WEEK 4 — Live Fraud Feed & Dispute Center
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/live-fraud-feed', methods=['GET'])
def live_fraud_feed():
    """
    Return the latest fraud events for the live feed dashboard.
    In production this would query Firestore; here we return from score_history.
    """
    try:
        feed = []
        history = state.get("score_history", [])
        # Pull flagged entries from score history
        for entry in reversed(history[-50:]):
            verdict = entry.get("verdict", "SAFE")
            if verdict in ("HIGH_RISK", "MEDIUM_RISK", "FRAUD"):
                feed.append({
                    "id": entry.get("id", ""),
                    "timestamp": entry.get("timestamp", ""),
                    "amount": entry.get("amount", 0),
                    "verdict": verdict,
                    "probability": entry.get("probability", 0),
                    "recipientUPI": entry.get("recipientUPI", "unknown@upi"),
                    "features": entry.get("top_features", []),
                })
            if len(feed) >= 20:
                break

        # Supplement with simulated events if feed is sparse
        if len(feed) < 5:
            import random
            verdicts = ["HIGH_RISK", "MEDIUM_RISK", "HIGH_RISK", "MEDIUM_RISK", "HIGH_RISK"]
            upis = ["suspicious99@okaxis", "unknown.merchant@ybl", "tempacct@paytm",
                    "newuser2024@ibl", "bulk.transfer@sbi"]
            for i in range(min(5, 5 - len(feed))):
                feed.append({
                    "id": f"sim_{i}_{int(time.time())}",
                    "timestamp": datetime.utcfromtimestamp(time.time() - i * 180).isoformat() + "Z",
                    "amount": random.choice([850, 2500, 7200, 15000, 450]),
                    "verdict": verdicts[i],
                    "probability": random.uniform(0.65, 0.98),
                    "recipientUPI": upis[i],
                    "features": ["High-Risk Transaction Times", "Device Fingerprinting"],
                })

        return jsonify({
            "events": feed,
            "totalFlagged": len(feed),
            "fetchedAt": datetime.utcnow().isoformat() + "Z",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/disputes', methods=['POST'])
def create_dispute():
    """
    Create a transaction dispute record.
    Expects: { transactionId, userId, amount, recipientUPI, reason, description }
    """
    try:
        data = request.get_json() or {}
        required = ['transactionId', 'userId', 'reason']
        for field in required:
            if not data.get(field):
                return jsonify({"error": f"Missing required field: {field}"}), 400

        dispute = {
            "disputeId": f"DSP{int(time.time())}",
            "transactionId": data['transactionId'],
            "userId": data['userId'],
            "amount": data.get('amount', 0),
            "recipientUPI": data.get('recipientUPI', ''),
            "reason": data['reason'],
            "description": data.get('description', ''),
            "status": "SUBMITTED",
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "estimatedResolution": "3-5 business days",
            "caseNumber": f"SAFE{int(time.time()) % 100000:05d}",
        }

        return jsonify({
            "success": True,
            "dispute": dispute,
            "message": f"Dispute #{dispute['caseNumber']} filed successfully. You'll receive updates within 24 hours.",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/disputes/<dispute_id>', methods=['GET'])
def get_dispute_status(dispute_id):
    """Return status of a specific dispute."""
    return jsonify({
        "disputeId": dispute_id,
        "status": "UNDER_REVIEW",
        "statusHistory": [
            {"status": "SUBMITTED", "timestamp": datetime.utcnow().isoformat() + "Z", "note": "Dispute received"},
            {"status": "UNDER_REVIEW", "timestamp": datetime.utcnow().isoformat() + "Z", "note": "Assigned to fraud analyst"},
        ],
        "estimatedResolution": "2-3 business days",
    })


# ══════════════════════════════════════════════════════════════════════════════
# WEEK 5–8 ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/biometric-verify', methods=['POST'])
def biometric_verify():
    """Compare current typing pattern against stored baseline."""
    data = request.json or {}
    current_speed = data.get('currentSpeed', 0)
    current_interval = data.get('currentInterval', 0)
    baseline_speed = data.get('baselineSpeed', 0)
    baseline_interval = data.get('baselineInterval', 0)

    if baseline_speed == 0:
        return jsonify({"status": "no_baseline", "deviation": 0, "risk": "unknown"})

    speed_dev = abs(current_speed - baseline_speed) / max(baseline_speed, 1) * 100
    interval_dev = abs(current_interval - baseline_interval) / max(baseline_interval, 1) * 100
    deviation = round((speed_dev + interval_dev) / 2, 1)

    risk = "low" if deviation < 20 else "medium" if deviation < 40 else "high"
    return jsonify({
        "deviation": deviation,
        "risk": risk,
        "speedDeviation": round(speed_dev, 1),
        "intervalDeviation": round(interval_dev, 1),
        "requireReauth": deviation > 40,
    })


@app.route('/spending-coach', methods=['POST'])
def spending_coach():
    """Generate AI spending insights from transaction summary."""
    data = request.json or {}
    total_spent = data.get('totalSpent', 0)
    last_week = data.get('lastWeekSpent', 0)
    top_category = data.get('topCategory', 'Other')
    fraud_alerts = data.get('fraudAlerts', 0)
    categories = data.get('categories', {})

    insights = []
    change_pct = round((total_spent - last_week) / max(last_week, 1) * 100, 1) if last_week else 0

    if change_pct > 20:
        insights.append({
            "type": "warning",
            "title": f"Spending Up {change_pct}%",
            "message": f"You spent ₹{total_spent:,.0f} this week vs ₹{last_week:,.0f} last week. Consider reviewing discretionary expenses.",
        })
    elif change_pct < -15:
        insights.append({
            "type": "tip",
            "title": f"Great Savings This Week!",
            "message": f"Spending dropped {abs(change_pct)}% vs last week. Keep the momentum going!",
        })

    for cat, amt in categories.items():
        if total_spent > 0 and amt / total_spent > 0.5:
            insights.append({
                "type": "alert",
                "title": f"{cat} Dominates Spending",
                "message": f"{cat} accounts for {amt/total_spent*100:.0f}% of total spend (₹{amt:,.0f}). Consider setting a category limit.",
            })

    if fraud_alerts > 0:
        insights.append({
            "type": "alert",
            "title": f"{fraud_alerts} Fraud Alert(s) This Week",
            "message": "High-risk transactions were detected. Review your Live Fraud Feed for details.",
        })

    if not insights:
        insights.append({
            "type": "tip",
            "title": "Spending Looks Healthy",
            "message": "No unusual patterns detected this week. You're on track!",
        })

    return jsonify({"insights": insights, "changePercent": change_pct, "topCategory": top_category})


@app.route('/contact-trust', methods=['POST'])
def contact_trust():
    """Compute trust score for a payment contact."""
    data = request.json or {}
    tx_count = data.get('txCount', 0)
    all_safe = data.get('allSafe', True)
    high_risk_count = data.get('highRiskCount', 0)
    medium_risk_count = data.get('mediumRiskCount', 0)
    amount_std_dev_pct = data.get('amountStdDevPct', 50)
    account_days = data.get('accountDays', 0)

    score = 30  # base
    if tx_count >= 5:
        score += 20
    if tx_count >= 10:
        score += 10
    if all_safe and high_risk_count == 0:
        score += 25
    score -= high_risk_count * 30
    score -= medium_risk_count * 10
    if amount_std_dev_pct < 20:
        score += 15
    if account_days > 30:
        score += 10

    score = max(0, min(100, score))
    band = "TRUSTED" if score >= 80 else "KNOWN" if score >= 50 else "NEW" if score >= 20 else "SUSPICIOUS"
    return jsonify({"score": score, "band": band})


@app.route('/community-score/<path:upi_id>', methods=['GET'])
def community_score(upi_id):
    """Return aggregated community report score for a UPI ID."""
    # In production this would query a database
    # Returns mock aggregated data based on UPI pattern
    return jsonify({
        "upiId": upi_id,
        "reportCount": 0,
        "topReason": None,
        "communityRiskBoost": 0,
        "message": "No community reports found for this UPI.",
    })


@app.route('/fraud-forecast', methods=['POST'])
def fraud_forecast():
    """Generate 7-day fraud risk forecast."""
    import math
    data = request.json or {}
    historical_fraud_rate = data.get('historicalFraudRate', 0.05)
    day_of_week_today = data.get('dayOfWeekToday', 0)  # 0=Mon
    recurring_days = data.get('recurringDays', [])  # day offsets with scheduled payments

    DAY_FACTORS = [0.15, 0.12, 0.18, 0.20, 0.35, 0.45, 0.30]
    forecast = []
    for i in range(7):
        dow = (day_of_week_today + i) % 7
        base = DAY_FACTORS[dow] * 100
        adjusted = min(99, base * (1 + historical_fraud_rate * 2))
        with_recurring = min(99, adjusted + (15 if i in recurring_days else 0))
        forecast.append({
            "dayOffset": i,
            "dayOfWeek": dow,
            "baseRisk": round(adjusted, 1),
            "withRecurring": round(with_recurring, 1),
            "isHighRisk": with_recurring > 60,
        })

    return jsonify({"forecast": forecast})


@app.route('/payment-health', methods=['POST'])
def payment_health():
    """Compute composite payment health score."""
    data = request.json or {}
    fraud_safety = data.get('fraudSafety', 80)
    savings_rate = data.get('savingsRate', 50)
    bill_consistency = data.get('billConsistency', 100)
    spending_control = data.get('spendingControl', 80)
    account_safety = data.get('accountSafety', 75)

    composite = round(
        fraud_safety * 0.30 +
        savings_rate * 0.20 +
        bill_consistency * 0.20 +
        spending_control * 0.15 +
        account_safety * 0.15
    )

    grade = "A+" if composite >= 90 else "A" if composite >= 80 else "B" if composite >= 65 else "C" if composite >= 50 else "D"
    label = "EXCELLENT" if composite >= 90 else "GOOD" if composite >= 70 else "FAIR" if composite >= 50 else "POOR"

    return jsonify({
        "composite": composite,
        "grade": grade,
        "label": label,
        "subScores": {
            "fraudSafety": fraud_safety,
            "savingsRate": savings_rate,
            "billConsistency": bill_consistency,
            "spendingControl": spending_control,
            "accountSafety": account_safety,
        }
    })


@app.route('/dark-pattern-check', methods=['POST'])
def dark_pattern_check():
    """Check UPI ID and remarks for known scam/dark patterns."""
    import re
    data = request.json or {}
    upi = data.get('upiId', '')
    remarks = data.get('remarks', '')
    text = f"{upi} {remarks}".lower()

    PATTERNS = [
        (r'lottery|prize|winner|lucky\s*draw', 'Lottery Scam', 'Legitimate lotteries never require payment to claim prizes.'),
        (r'kyc\s*update|kyc\s*verif|aadhar\s*link', 'KYC Fraud', 'Banks never request KYC updates via UPI payments.'),
        (r'job\s*offer|work\s*from\s*home|earn\s*daily', 'Job Scam', 'Advance fee job scams demand payment to unlock jobs.'),
        (r'refund|cashback\s*claim|tax\s*refund', 'Refund Scam', 'Refunds are never processed by sending money.'),
        (r'otp|share\s*pin|verify\s*account|account\s*suspend', 'Phishing', 'Never share OTP or PIN over UPI.'),
        (r'investment\s*return|double\s*money|guaranteed\s*profit', 'Investment Fraud', 'No investment guarantees doubled returns.'),
        (r'electricity\s*cut|gas\s*supply|bill\s*overdue', 'Utility Scam', 'Utilities do not demand immediate UPI payments.'),
        (r'covid|relief\s*fund|pm\s*cares', 'Charity Scam', 'Verify charity UPIs through official government sources.'),
    ]

    for pattern, label, detail in PATTERNS:
        if re.search(pattern, text):
            return jsonify({"detected": True, "label": label, "detail": detail, "riskBoost": 30})

    return jsonify({"detected": False, "label": None, "detail": None, "riskBoost": 0})



# ══════════════════════════════════════════════════════════════════════════════
# Week 9 — Voice Pay Assistant: parse voice command intent
# ══════════════════════════════════════════════════════════════════════════════
@app.route('/voice-parse', methods=['POST'])
def voice_parse():
    """Advanced NLP voice command parser with conversational AI responses."""
    import re

    data     = request.get_json(silent=True) or {}
    raw_text = data.get('text', '').strip()
    context  = data.get('context', {})
    if not raw_text:
        return jsonify({"error": "No text provided"}), 400

    # ── Step 1: Normalise UPI @ spoken forms ─────────────────────────────────
    t = raw_text.lower()
    for pat in [r'at\s+the\s+rate\s+of', r'alter\s+rate\s+of', r'at\s+rate\s+of',
                r'at\s+the\s+rate', r'at\s+rate', r'aat']:
        t = re.sub(pat, '@', t)

    # ── Step 2: Word → number ────────────────────────────────────────────────
    WN = {'zero':0,'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,
          'eight':8,'nine':9,'ten':10,'eleven':11,'twelve':12,'thirteen':13,
          'fourteen':14,'fifteen':15,'sixteen':16,'seventeen':17,'eighteen':18,
          'nineteen':19,'twenty':20,'thirty':30,'forty':40,'fifty':50,'sixty':60,
          'seventy':70,'eighty':80,'ninety':90,'hundred':100,'thousand':1000,
          'lakh':100000,'lac':100000,'crore':10000000}
    def w2n(m):
        total, cur = 0, 0
        for w in m.group(0).split():
            n = WN.get(w, 0)
            if   n == 100:       cur = (cur or 1) * 100
            elif n >= 1000:      total += (cur or 1) * n; cur = 0
            else:                cur += n
        return str(total + cur)
    wp = '|'.join(WN.keys())
    t  = re.sub(rf'\b(?:{wp})(?:\s+(?:{wp}))*\b', w2n, t)
    t  = re.sub(r'(\d+)\s*k\b',       lambda m: str(int(m.group(1)) * 1000), t)
    t  = re.sub(r'(\d+)\s*hundred\b', lambda m: str(int(m.group(1)) * 100),  t)

    # ── Step 3: Reconstruct split UPI IDs ────────────────────────────────────
    t = re.sub(r'([a-z]+)\s+(\d+)\s*@\s*([a-z]+)', r'\1\2@\3', t)
    t = re.sub(r'([a-z\d]+)\s*@\s*([a-z]+)',        r'\1@\2',   t)

    # ── Step 4: Intent — detect FIRST so extraction can use it ───────────────
    intent = 'unknown'
    if   re.search(r'\b(send|pay|transfer|give)\b', t):                      intent = 'send_money'
    elif re.search(r'\b(check|verify|trust|safe|is\s+\w+\s+safe)\b', t):    intent = 'check_upi'
    elif re.search(r'\b(balance|wallet|how\s+much)\b', t):                   intent = 'check_balance'
    elif re.search(r'\b(history|transactions|recent|statement)\b', t):       intent = 'view_history'
    elif re.search(r'\b(fraud|scam|block|fake|danger)\b', t):                intent = 'fraud_check'

    # ── Step 5: Amount ───────────────────────────────────────────────────────
    NON_AMOUNT = {'pay','send','transfer','give','money','me','you','him','her',
                  'them','the','a','an','to','for','of','is','my','your','can',
                  'want','i','will','please','just','need','help','say','some'}
    amount = None
    for pat in [
        # "send [a] money [for] 500", "pay [a] 500"
        r'(?:send|pay|transfer|give)\s+(?:a\s+)?(?:money\s+)?(?:₹|rs\.?|inr|rupees?)?\s*(\d[\d,]*(?:\.\d+)?)',
        r'(?:₹|rs\.?|inr|rupees?)\s*(\d[\d,]*(?:\.\d+)?)',
        r'(\d[\d,]*(?:\.\d+)?)\s*(?:rupees?|rs\.?|inr|₹)',
        # number right after a name in "for [name] 500"
        r'\bfor\s+(?:a\s+|an\s+|the\s+)?[a-z]+\s+(\d[\d,]*(?:\.\d+)?)\b',
        r'\b(\d{2,7})\b',               # any bare number fallback
    ]:
        m = re.search(pat, t)
        if m:
            amount = m.group(1).replace(',', '')
            break
    if not amount:
        amount = context.get('amount')

    # ── Step 6: Recipient ────────────────────────────────────────────────────
    REASON_WORDS = {'coffee','food','rent','groceries','bills','utilities','lunch',
                    'dinner','travel','fuel','medicine','shopping','entertainment',
                    'fees','salary','gift','party'}

    recipient = None

    # 6a. Explicit "to <word>" — skip verbs / stop words
    for m in re.finditer(r'\bto\s+([\w@.]+(?:@[\w.]+)?)', t):
        w = m.group(1).lower().rstrip('.,')
        if w not in NON_AMOUNT:
            recipient = m.group(1).rstrip('.,')
            break

    # 6b. Any UPI-format token (contains @) anywhere in sentence
    if not recipient:
        m = re.search(r'\b([\w.]+@[\w.]+)\b', t)
        if m:
            recipient = m.group(1)

    # 6c. "for [article] <name>" — single alpha word, not a stop/reason word
    if not recipient:
        m = re.search(r'\bfor\s+(?:a\s+|an\s+|the\s+)?([a-z][a-z]*)\b', t)
        if m:
            w = m.group(1)
            if w not in NON_AMOUNT and w not in REASON_WORDS:
                recipient = w

    # 6d. "check if <name>", "is <name> safe/fraud" — name after "if" / "is"
    if not recipient and intent in ('check_upi', 'fraud_check'):
        m = re.search(r'\b(?:if|is)\s+([\w@.]+(?:@[\w.]+)?)\b', t)
        if m and m.group(1) not in NON_AMOUNT:
            recipient = m.group(1)

    if not recipient:
        recipient = context.get('recipient')

    # ── Step 7: Reason ───────────────────────────────────────────────────────
    reason = None
    m = re.search(r'\bfor\s+(?:a\s+|an\s+|the\s+)?(.+?)(?:\s*$|\s+to\s+)', t)
    if m:
        for_text = m.group(1).strip()
        # Remove the recipient name from the front if it was captured there
        if recipient and for_text.lower().startswith(recipient.lower()):
            leftover = for_text[len(recipient):].strip()
            # leftover is either empty, a number (already used as amount), or a reason
            if leftover and not re.fullmatch(r'\d+', leftover):
                reason = leftover
        elif for_text in REASON_WORDS or ' ' in for_text:
            reason = for_text
        # single unknown word that isn't a reason word → already used as recipient, skip

    if not reason:
        reason = context.get('reason')

    # ── Step 8: Confidence & missing slots ───────────────────────────────────
    missing = []
    if intent == 'send_money':
        if not amount:    missing.append('amount')
        if not recipient: missing.append('recipient')
    elif intent == 'check_upi' and not recipient:
        missing.append('recipient')

    total_slots = 2 if intent == 'send_money' else 1 if intent == 'check_upi' else 1
    filled      = total_slots - len(missing)
    confidence  = round(0.50 + 0.45 * (filled / total_slots), 2) if intent != 'unknown' else 0.20

    # ── Step 9: Conversational reply ─────────────────────────────────────────
    amt_fmt = f"₹{int(float(amount)):,}" if amount else "some amount"
    if intent == 'send_money' and not missing:
        reply = (f"Got it! Sending {amt_fmt} to {recipient}"
                 + (f" for {reason}" if reason else "") + ". Tap confirm to proceed.")
    elif intent == 'send_money' and set(missing) == {'amount', 'recipient'}:
        reply = "Sure! Who should I send to, and how much?"
    elif intent == 'send_money' and 'amount' in missing:
        reply = f"How much would you like to send to {recipient}?"
    elif intent == 'send_money' and 'recipient' in missing:
        reply = f"Who should I send {amt_fmt} to? Please say their UPI ID or name."
    elif intent == 'check_upi':
        reply = f"Checking safety of {recipient}…" if recipient else "Which UPI ID should I check?"
    elif intent == 'check_balance':
        reply = "Opening your wallet balance now."
    elif intent == 'view_history':
        reply = "Showing your recent transactions."
    elif intent == 'fraud_check':
        reply = f"Running fraud check on {recipient}." if recipient else "Which UPI should I check?"
    else:
        reply = ('I didn\'t catch that. Try: "Send ₹500 to rajan4821@ybl for coffee" '
                 'or "Check if alice@paytm is safe".')

    return jsonify({
        "intent":     intent,
        "amount":     amount,
        "recipient":  recipient,
        "reason":     reason,
        "confidence": confidence,
        "missing":    missing,
        "reply":      reply,
        "raw":        raw_text,
    })


# ══════════════════════════════════════════════════════════════════════════════
# Week 10 — Spending DNA: compute 8-dimension spending fingerprint
# ══════════════════════════════════════════════════════════════════════════════
@app.route('/spending-dna', methods=['POST'])
def spending_dna():
    """Compute spending DNA from a list of transactions and detect anomalies."""
    data = request.get_json(silent=True) or {}
    transactions = data.get('transactions', [])
    if not transactions:
        return jsonify({"error": "No transactions provided"}), 400

    DNA_DIMS = [
        {"key": "Food",          "keywords": ["food","swiggy","zomato","restaurant","eat","meal","lunch","dinner","breakfast","cafe","snack","grocery"]},
        {"key": "Transport",     "keywords": ["uber","ola","cab","auto","bus","metro","train","fuel","petrol","diesel","rapido","transport"]},
        {"key": "Entertainment", "keywords": ["netflix","prime","hotstar","ott","game","gaming","cinema","movie","theatre","concert","entertainment"]},
        {"key": "Shopping",      "keywords": ["amazon","flipkart","shop","shopping","clothes","myntra","meesho","purchase","buy","order"]},
        {"key": "Housing",       "keywords": ["rent","house","housing","mortgage","pg","hostel","maintenance","society"]},
        {"key": "Utilities",     "keywords": ["electricity","water","gas","internet","wifi","broadband","bill","recharge","dth"]},
        {"key": "Health",        "keywords": ["medical","medicine","doctor","hospital","pharmacy","health","clinic","dental"]},
        {"key": "Other",         "keywords": []},
    ]

    def categorize(remarks):
        r = (remarks or '').lower()
        for dim in DNA_DIMS[:-1]:
            if any(kw in r for kw in dim['keywords']):
                return dim['key']
        return 'Other'

    def build_profile(txs):
        total = sum(float(t.get('amount', 0) or 0) for t in txs)
        if total == 0:
            return {d['key']: 0 for d in DNA_DIMS}
        counts = {d['key']: 0.0 for d in DNA_DIMS}
        for t in txs:
            cat = categorize(t.get('remarks') or t.get('description') or '')
            counts[cat] += float(t.get('amount', 0) or 0)
        return {k: round((v / total) * 100) for k, v in counts.items()}

    # Split: baseline = older half, current = recent half
    mid = len(transactions) // 2
    baseline_txs = transactions[mid:]
    current_txs  = transactions[:mid] if mid > 0 else transactions

    baseline = build_profile(baseline_txs)
    current  = build_profile(current_txs)

    # Anomaly score = mean absolute deviation across dimensions
    diffs = [abs(current.get(k, 0) - baseline.get(k, 0)) for k in baseline]
    anomaly_score = min(100, round(sum(diffs) / max(len(diffs), 1) * 2))

    anomalies = []
    for k in baseline:
        diff = current.get(k, 0) - baseline.get(k, 0)
        if abs(diff) >= 15:
            anomalies.append({
                "dimension": k,
                "diff": diff,
                "severity": "high" if abs(diff) >= 30 else "medium",
                "message": f"{'↑' if diff > 0 else '↓'} {abs(diff)}% {'increase' if diff > 0 else 'decrease'} vs baseline"
            })

    return jsonify({
        "baseline":      baseline,
        "current":       current,
        "anomaly_score": anomaly_score,
        "anomalies":     sorted(anomalies, key=lambda x: abs(x['diff']), reverse=True),
        "tx_count":      {"baseline": len(baseline_txs), "current": len(current_txs)},
    })


# ══════════════════════════════════════════════════════════════════════════════
# Week 11 — Future Risk Predictor: 7-day fraud forecast for a UPI
# ══════════════════════════════════════════════════════════════════════════════
@app.route('/future-risk/<upi_id>', methods=['GET', 'POST'])
def future_risk(upi_id):
    """Predict 7-day fraud risk forecast for a given UPI ID."""
    from datetime import datetime, timedelta
    data = request.get_json(silent=True) or {}

    # Accept signal inputs or use defaults
    velocity_score   = int(data.get('velocity_score',   20))   # 0–40
    amount_score     = int(data.get('amount_score',     5))    # 0–20
    fraud_score      = int(data.get('fraud_score',      0))    # 0–30
    community_score  = int(data.get('community_score',  0))    # 0–10
    tx_count         = int(data.get('tx_count',         0))
    fraud_count      = int(data.get('fraud_count',      0))
    avg_amount       = float(data.get('avg_amount',     0))
    community_reports = int(data.get('community_reports', 0))

    base_risk = min(100, velocity_score + amount_score + fraud_score + community_score)

    # Day-of-week multipliers (Sun=0 highest, Mon=1 lowest)
    DOW_RISK = {0: 1.4, 1: 0.7, 2: 0.8, 3: 0.9, 4: 1.0, 5: 1.3, 6: 1.5}
    DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    forecast = []
    today = datetime.now()
    for i in range(7):
        date = today + timedelta(days=i)
        dow  = date.weekday()  # Mon=0 in Python, Sun=6
        # Convert to Sun=0 format
        dow_sun0 = (dow + 1) % 7
        day_risk = min(100, round(base_risk * DOW_RISK[dow_sun0]))
        forecast.append({
            "day":   "Today" if i == 0 else "Tomorrow" if i == 1 else DAY_NAMES[dow_sun0],
            "date":  date.strftime("%b %d"),
            "risk":  day_risk,
            "dow":   dow_sun0,
        })

    peak_day = max(forecast, key=lambda d: d['risk'])
    safe_day = min(forecast, key=lambda d: d['risk'])

    risk_level = "HIGH" if base_risk >= 70 else "MEDIUM" if base_risk >= 40 else "LOW"
    recommendation = (
        f"Avoid transacting with {upi_id}. Peak risk on {peak_day['day']} ({peak_day['risk']}%). "
        f"Even the safest window ({safe_day['day']}, {safe_day['risk']}%) carries high risk."
        if risk_level == "HIGH" else
        f"Proceed with caution. Safest window: {safe_day['day']} ({safe_day['risk']}%). "
        f"Avoid {peak_day['day']} ({peak_day['risk']}% peak risk)."
        if risk_level == "MEDIUM" else
        f"Generally safe. Lowest risk: {safe_day['day']} ({safe_day['risk']}%). "
        f"Always verify the UPI before large transfers."
    )

    return jsonify({
        "upi_id":         upi_id,
        "base_risk":      base_risk,
        "risk_level":     risk_level,
        "forecast":       forecast,
        "peak_day":       peak_day,
        "safe_day":       safe_day,
        "factors": {
            "velocity_score":  velocity_score,
            "amount_score":    amount_score,
            "fraud_score":     fraud_score,
            "community_score": community_score,
        },
        "stats": {
            "tx_count":          tx_count,
            "fraud_count":       fraud_count,
            "avg_amount":        avg_amount,
            "community_reports": community_reports,
        },
        "recommendation": recommendation,
    })


# ── Week 12: AI Financial Chronicle ───────────────────────────────────────────
@app.route('/financial-story', methods=['POST'])
def financial_story():
    """Generate a narrative financial story from transaction data."""
    data = request.get_json(silent=True) or {}
    transactions = data.get('transactions', [])
    user_name    = data.get('userName', 'User')
    month_name   = data.get('monthName', 'This Month')

    if not transactions:
        return jsonify({"error": "No transactions provided"}), 400

    amounts = [float(t.get('amount', 0)) for t in transactions if t.get('amount')]
    total_spent   = sum(amounts)
    tx_count      = len(transactions)
    avg_amount    = total_spent / tx_count if tx_count else 0
    max_tx        = max(transactions, key=lambda t: float(t.get('amount', 0)), default={})
    fraud_count   = sum(1 for t in transactions if t.get('fraudVerdict') in ('HIGH_RISK', 'MEDIUM_RISK'))

    cat_map = {}
    for t in transactions:
        cat = t.get('category', 'Other')
        cat_map[cat] = cat_map.get(cat, 0) + float(t.get('amount', 0))
    top_cat = max(cat_map, key=cat_map.get) if cat_map else 'General'

    fraud_rate = (fraud_count / tx_count * 100) if tx_count else 0
    security_status = "excellent" if fraud_rate < 2 else "good" if fraud_rate < 10 else "concerning"

    story = {
        "title": f"{user_name}'s Financial Chronicle — {month_name}",
        "sections": [
            {
                "title": "Opening Chapter",
                "content": (
                    f"In {month_name}, {user_name.split()[0]} navigated {tx_count} financial transactions "
                    f"totalling ₹{total_spent:,.0f}. Every rupee tells a story — this is yours."
                ),
            },
            {
                "title": "The Spending Story",
                "content": (
                    f"Your largest spending category was {top_cat}, absorbing "
                    f"₹{cat_map.get(top_cat, 0):,.0f} of your total outflow. "
                    f"On average, each transaction was ₹{avg_amount:,.0f}, "
                    f"reflecting a {'disciplined' if avg_amount < 2000 else 'moderate' if avg_amount < 10000 else 'high-value'} spending profile."
                ),
            },
            {
                "title": "Standout Transaction",
                "content": (
                    f"Your biggest single transaction was ₹{float(max_tx.get('amount', 0)):,.0f} "
                    f"to {max_tx.get('receiver', max_tx.get('receiverUPI', 'an unknown recipient'))}. "
                    f"{'This transaction was flagged by our AI as high risk — review it carefully.' if max_tx.get('fraudVerdict') in ('HIGH_RISK','MEDIUM_RISK') else 'This transaction was verified as safe by our fraud detection engine.'}"
                ),
            },
            {
                "title": "Security Report",
                "content": (
                    f"Your account security posture this month is {security_status}. "
                    f"Of your {tx_count} transactions, {fraud_count} were flagged ({fraud_rate:.1f}%). "
                    f"{'No action needed — your account is clean.' if fraud_count == 0 else 'Please review flagged transactions in the Dispute Center.'}"
                ),
            },
            {
                "title": "Closing Insights",
                "content": (
                    f"Overall, {month_name} was a {'productive' if tx_count > 20 else 'quiet'} financial month. "
                    f"Your AI guardian processed every payment in real time, keeping your money safe. "
                    f"Keep monitoring your Spending DNA and Budget Predictor for a stronger next month."
                ),
            },
        ],
        "stats": {
            "total_spent": total_spent,
            "tx_count": tx_count,
            "avg_amount": avg_amount,
            "top_category": top_cat,
            "fraud_count": fraud_count,
            "fraud_rate": round(fraud_rate, 1),
        },
    }
    return jsonify(story)


# ── Week 13: Smart Budget Predictor ───────────────────────────────────────────
@app.route('/budget-predict', methods=['POST'])
def budget_predict():
    """Predict budget exhaustion and month-end spend from transaction data."""
    from datetime import datetime, timedelta
    data = request.get_json(silent=True) or {}
    transactions  = data.get('transactions', [])
    manual_budget = float(data.get('budget', 0))

    today   = datetime.now()
    days_in_month = (datetime(today.year, today.month % 12 + 1, 1) - timedelta(days=1)).day if today.month < 12 else 31
    day_of_month  = today.day
    days_elapsed  = max(day_of_month, 1)
    days_left     = days_in_month - day_of_month

    # Filter to this month
    this_month_key = f"{today.year}-{today.month:02d}"
    this_month_txs = []
    for t in transactions:
        try:
            ts_str = t.get('timestamp') or t.get('date', '')
            ts = datetime.fromisoformat(str(ts_str)[:10]) if ts_str else today
            if f"{ts.year}-{ts.month:02d}" == this_month_key:
                this_month_txs.append(t)
        except Exception:
            pass

    spent_so_far  = sum(float(t.get('amount', 0)) for t in this_month_txs)
    daily_velocity = spent_so_far / days_elapsed
    projected_total = spent_so_far + daily_velocity * days_left
    auto_budget   = manual_budget if manual_budget > 0 else max(projected_total * 1.1, 10000)
    remaining     = auto_budget - spent_so_far
    safe_daily    = remaining / max(days_left, 1)

    # Exhaustion date
    exhaustion_date = None
    if daily_velocity > safe_daily and remaining > 0:
        days_to_exhaust = remaining / max(daily_velocity, 0.01)
        exhaustion_date = (today + timedelta(days=int(days_to_exhaust))).strftime('%Y-%m-%d')

    burn_rate  = projected_total / max(auto_budget, 1)
    risk_level = "CRITICAL" if burn_rate >= 1.2 else "HIGH" if burn_rate >= 1.0 else "MEDIUM" if burn_rate >= 0.85 else "SAFE"

    recommendation = (
        f"Critical overspend. Reduce daily spend by ₹{max(0, daily_velocity - safe_daily):,.0f} immediately."
        if risk_level == "CRITICAL" else
        f"Budget will be exceeded. Cut daily spend to ₹{safe_daily:,.0f} to stay within ₹{auto_budget:,.0f}."
        if risk_level == "HIGH" else
        f"Slightly above safe pace. Try to limit daily spending to ₹{safe_daily:,.0f}."
        if risk_level == "MEDIUM" else
        f"On track! Keep daily spending under ₹{safe_daily:,.0f} to finish ₹{max(0, auto_budget - projected_total):,.0f} under budget."
    )

    return jsonify({
        "spent_so_far":    round(spent_so_far, 2),
        "projected_total": round(projected_total, 2),
        "auto_budget":     round(auto_budget, 2),
        "remaining":       round(remaining, 2),
        "safe_daily":      round(safe_daily, 2),
        "daily_velocity":  round(daily_velocity, 2),
        "burn_rate":       round(burn_rate, 3),
        "risk_level":      risk_level,
        "days_left":       days_left,
        "exhaustion_date": exhaustion_date,
        "tx_count":        len(this_month_txs),
        "recommendation":  recommendation,
    })


# ── Week 14: Transaction Anomaly Explainer ────────────────────────────────────
@app.route('/explain-transaction', methods=['POST'])
def explain_transaction():
    """Generate SHAP-style anomaly explanation for a single transaction."""
    data = request.get_json(silent=True) or {}
    tx            = data.get('transaction', {})
    all_txs       = data.get('allTransactions', [])

    amount = float(tx.get('amount', 0))
    amounts = [float(t.get('amount', 0)) for t in all_txs if t.get('amount')]
    avg_amount = sum(amounts) / len(amounts) if amounts else 1
    std_amount = (sum((a - avg_amount) ** 2 for a in amounts) / len(amounts)) ** 0.5 if len(amounts) > 1 else 1

    z_score = (amount - avg_amount) / max(std_amount, 1)

    # Hour risk
    try:
        from datetime import datetime
        ts_str = tx.get('timestamp') or tx.get('date', '')
        ts = datetime.fromisoformat(str(ts_str)[:19].replace('T', ' ')) if ts_str else datetime.now()
        hour = ts.hour
        dow  = ts.weekday()
    except Exception:
        hour, dow = 12, 1

    odd_hour     = hour >= 0 and hour <= 5
    is_weekend   = dow >= 5
    is_round     = amount % 100 == 0 or amount % 500 == 0
    fraud_verdict = tx.get('fraudVerdict', tx.get('fraud_verdict', 'UNKNOWN'))
    fraud_score   = float(tx.get('fraudScore', tx.get('fraud_score', 0.5)))

    # Recipient familiarity
    receiver = tx.get('receiverUPI') or tx.get('receiver', '')
    prior_txs = [t for t in all_txs if (t.get('receiverUPI') or t.get('receiver', '')) == receiver]
    is_new_recipient = len(prior_txs) <= 1

    # Rapid succession
    try:
        near_txs = []
        for t in all_txs:
            t_ts_str = t.get('timestamp') or t.get('date', '')
            t_ts = datetime.fromisoformat(str(t_ts_str)[:19].replace('T', ' ')) if t_ts_str else ts
            diff = abs((t_ts - ts).total_seconds())
            if diff < 3600 and t.get('id') != tx.get('id'):
                near_txs.append(t)
        rapid_succession = len(near_txs) > 0
    except Exception:
        rapid_succession = False

    factors = [
        {
            "name": "Transaction Amount",
            "score": round(min(abs(z_score) * 0.3, 1), 3),
            "direction": "risk" if z_score > 1.5 else "safe",
            "explanation": (
                f"₹{amount:,.0f} is {z_score:.1f}× above your average (₹{avg_amount:,.0f}). High deviation detected."
                if z_score > 1.5 else
                f"Amount is within normal range (avg ₹{avg_amount:,.0f})."
            ),
        },
        {
            "name": "Time of Transaction",
            "score": 0.9 if odd_hour else 0.4 if is_weekend else 0.05,
            "direction": "risk" if odd_hour else "safe",
            "explanation": (
                f"Initiated at {ts.strftime('%H:%M')} — late-night transactions carry elevated risk."
                if odd_hour else
                f"Transaction at {ts.strftime('%H:%M')} during {'weekend' if is_weekend else 'normal'} hours."
            ),
        },
        {
            "name": "Recipient Profile",
            "score": 0.75 if is_new_recipient else 0.05,
            "direction": "risk" if is_new_recipient else "safe",
            "explanation": (
                f"First-time recipient ({receiver or 'unknown'}). New recipients carry higher risk."
                if is_new_recipient else
                f"Trusted recipient — {len(prior_txs)} prior transactions."
            ),
        },
        {
            "name": "Velocity (Rapid Succession)",
            "score": 0.8 if rapid_succession else 0.05,
            "direction": "risk" if rapid_succession else "safe",
            "explanation": (
                f"Multiple transactions within 60 minutes detected — rapid succession fraud signal."
                if rapid_succession else
                "No rapid succession detected."
            ),
        },
        {
            "name": "Round Number Pattern",
            "score": 0.35 if is_round else 0.02,
            "direction": "risk" if is_round else "safe",
            "explanation": (
                f"₹{amount:,.0f} is a round number — characteristic of scripted fraud."
                if is_round else
                "Specific amount — not typical of automated fraud."
            ),
        },
        {
            "name": "ML Model Confidence",
            "score": fraud_score,
            "direction": "risk" if fraud_score > 0.6 else "safe",
            "explanation": (
                f"ML model flagged this as {fraud_verdict} with {fraud_score * 100:.0f}% fraud probability."
                if fraud_verdict in ('HIGH_RISK', 'MEDIUM_RISK') else
                f"ML model classified this as SAFE ({fraud_score * 100:.0f}% fraud probability)."
            ),
        },
    ]

    risk_scores = [f['score'] for f in factors if f['direction'] == 'risk']
    composite_risk = min(round(sum(risk_scores) / len(factors) * 200), 100)
    verdict = (
        'HIGH_RISK'   if fraud_verdict == 'HIGH_RISK' or composite_risk >= 65 else
        'MEDIUM_RISK' if fraud_verdict == 'MEDIUM_RISK' or composite_risk >= 35 else
        'SAFE'
    )

    return jsonify({
        "transaction_id":  tx.get('id', 'unknown'),
        "amount":          amount,
        "verdict":         verdict,
        "composite_risk":  composite_risk,
        "fraud_score":     fraud_score,
        "factors":         factors,
        "summary": (
            f"HIGH RISK: Multiple anomaly signals detected. Immediate review recommended."
            if verdict == 'HIGH_RISK' else
            f"MEDIUM RISK: Some suspicious patterns. Monitor this transaction."
            if verdict == 'MEDIUM_RISK' else
            f"SAFE: Transaction appears legitimate. No action required."
        ),
    })


# ── Week 15: Fraud Ring Detector ──────────────────────────────────────────────
@app.route('/fraud-ring-analysis', methods=['POST'])
def fraud_ring_analysis():
    """Analyse transaction network for fraud clusters using Union-Find."""
    data = request.get_json(silent=True) or {}
    transactions = data.get('transactions', [])
    self_upi     = data.get('selfUpi', '')

    if not transactions:
        return jsonify({"nodes": [], "edges": [], "fraud_rings": [], "stats": {}})

    # Build adjacency
    parent = {}
    def find(x):
        if x not in parent: parent[x] = x
        if parent[x] != x: parent[x] = find(parent[x])
        return parent[x]
    def union(x, y):
        px, py = find(x), find(y)
        if px != py: parent[px] = py

    nodes = {}
    edges = []

    for tx in transactions:
        src = tx.get('senderUPI') or tx.get('sender') or 'unknown_sender'
        dst = tx.get('receiverUPI') or tx.get('receiver') or 'unknown_receiver'
        verdict = tx.get('fraudVerdict', tx.get('fraud_verdict', 'SAFE'))
        amount  = float(tx.get('amount', 0))
        is_fraud = verdict in ('HIGH_RISK', 'MEDIUM_RISK')

        for nid, name in [(src, tx.get('senderName', src)), (dst, tx.get('receiverName', dst))]:
            if nid not in nodes:
                nodes[nid] = {'id': nid, 'label': name, 'risk': 10, 'txCount': 0, 'totalAmount': 0.0, 'isSelf': nid == self_upi}
            nodes[nid]['txCount'] += 1
            nodes[nid]['totalAmount'] += amount
            if is_fraud:
                nodes[nid]['risk'] = max(nodes[nid]['risk'], 75 if dst == nid else 60)

        edges.append({'source': src, 'target': dst, 'amount': amount, 'isFraud': is_fraud, 'verdict': verdict})
        union(src, dst)

    # Build clusters
    clusters_map = {}
    for nid in nodes:
        root = find(nid)
        clusters_map.setdefault(root, []).append(nid)

    # Fraud rings: clusters with >= 2 nodes where any has risk >= 75
    fraud_rings = []
    for cluster in clusters_map.values():
        if len(cluster) >= 2 and any(nodes[nid]['risk'] >= 75 for nid in cluster):
            fraud_rings.append(cluster)

    return jsonify({
        "nodes":       list(nodes.values()),
        "edges":       edges,
        "fraud_rings": fraud_rings,
        "stats": {
            "total_nodes":    len(nodes),
            "total_edges":    len(edges),
            "fraud_rings":    len(fraud_rings),
            "high_risk_nodes": sum(1 for n in nodes.values() if n['risk'] >= 75),
        },
    })


# ── Week 16: Financial Health Score ──────────────────────────────────────────
@app.route('/financial-health', methods=['POST'])
def financial_health():
    """Compute 0-850 composite financial health score across 6 dimensions."""
    from datetime import datetime, timedelta
    import math

    data         = request.get_json(silent=True) or {}
    transactions = data.get('transactions', [])

    if not transactions:
        return jsonify({"composite": 500, "grade": "C", "dimensions": [], "actions": []})

    now = datetime.now()

    amounts = [float(t.get('amount', 0)) for t in transactions if t.get('amount')]
    total_spent = sum(amounts)
    avg_amount  = total_spent / len(amounts) if amounts else 0
    std_amount  = math.sqrt(sum((a - avg_amount)**2 for a in amounts) / len(amounts)) if len(amounts) > 1 else 1

    fraud_count = sum(1 for t in transactions if t.get('fraudVerdict') in ('HIGH_RISK', 'MEDIUM_RISK'))
    fraud_rate  = fraud_count / len(transactions) if transactions else 0

    recipients  = set(t.get('receiverUPI') or t.get('receiver', '') for t in transactions if t.get('receiverUPI') or t.get('receiver'))
    rec_diversity = min(len(recipients) / 10, 1.0)

    hours = set()
    for t in transactions:
        try:
            ts_str = t.get('timestamp') or t.get('date', '')
            ts = datetime.fromisoformat(str(ts_str)[:19].replace('T', ' ')) if ts_str else now
            hours.add(ts.hour)
        except Exception:
            pass
    time_consistency = 0.9 if len(hours) < 4 else 0.7 if len(hours) < 8 else 0.5

    spend_consistency = max(0.0, 1.0 - min((std_amount / max(avg_amount, 1)) / 3, 1.0))
    savings_proxy = max(0.0, 1.0 - min(total_spent / 100000, 1.0))

    # Budget adherence via weekly variance
    week_totals = [0.0] * 4
    for t in transactions:
        try:
            ts_str = t.get('timestamp') or t.get('date', '')
            ts = datetime.fromisoformat(str(ts_str)[:19].replace('T', ' ')) if ts_str else now
            days_ago = (now - ts).days
            if days_ago < 28:
                week_totals[days_ago // 7] += float(t.get('amount', 0))
        except Exception:
            pass
    week_avg  = sum(week_totals) / 4
    week_var  = sum(abs(w - week_avg) for w in week_totals) / 4
    budget_adherence = max(0.0, 1.0 - week_var / max(week_avg, 1))

    dimensions = [
        {"name": "Budget Adherence",    "score": round(budget_adherence * 100),   "weight": 0.20},
        {"name": "Fraud Exposure",      "score": round((1 - fraud_rate) * 100),   "weight": 0.25},
        {"name": "Spending Consistency","score": round(spend_consistency * 100),   "weight": 0.15},
        {"name": "Recipient Diversity", "score": round(rec_diversity * 100),       "weight": 0.15},
        {"name": "Payment Velocity",    "score": round(time_consistency * 100),    "weight": 0.10},
        {"name": "Savings Rate",        "score": round(savings_proxy * 100),       "weight": 0.15},
    ]

    raw = sum(d['score'] * d['weight'] for d in dimensions)
    composite = round(300 + raw * 5.5)

    grade = (
        'A+' if composite >= 800 else 'A' if composite >= 750 else
        'B+' if composite >= 700 else 'B' if composite >= 650 else
        'C+' if composite >= 600 else 'C' if composite >= 550 else 'D'
    )

    actions = []
    for d in sorted(dimensions, key=lambda x: x['score']):
        if d['score'] < 70:
            actions.append({
                "dimension": d['name'],
                "score": d['score'],
                "impact": "HIGH" if d['weight'] >= 0.2 else "MEDIUM" if d['weight'] >= 0.15 else "LOW",
            })

    return jsonify({
        "composite":   composite,
        "grade":       grade,
        "dimensions":  dimensions,
        "actions":     actions[:3],
        "stats": {
            "tx_count":    len(transactions),
            "fraud_count": fraud_count,
            "fraud_rate":  round(fraud_rate * 100, 1),
            "total_spent": total_spent,
        },
    })


# ── Week 17: Pre-Payment Shield ───────────────────────────────────────────────
@app.route('/prepayment-check', methods=['POST'])
def prepayment_check():
    """Real-time risk gate before sending money — 6-factor analysis."""
    from datetime import datetime
    import math

    data          = request.get_json(silent=True) or {}
    target_upi    = data.get('targetUpi', '')
    amount        = float(data.get('amount', 0))
    transactions  = data.get('transactions', [])
    all_known_upis = data.get('allKnownUpis', [])

    now = datetime.now()
    hour = now.hour
    dow  = now.weekday()  # Mon=0

    # Levenshtein
    def levenshtein(a, b):
        if not a or not b: return 99
        m, n = len(a), len(b)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(m + 1): dp[i][0] = i
        for j in range(n + 1): dp[0][j] = j
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                dp[i][j] = dp[i-1][j-1] if a[i-1] == b[j-1] else 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
        return dp[m][n]

    # Spoofing check
    min_dist, closest_upi = 99, ''
    for u in all_known_upis:
        if u == target_upi: continue
        d = levenshtein(u.lower(), target_upi.lower())
        if d < min_dist: min_dist, closest_upi = d, u
    is_spoof = 0 < min_dist <= 2

    # Prior txs with recipient
    prior_txs = [t for t in transactions if (t.get('receiverUPI') or t.get('receiver', '')) == target_upi]
    fraud_with_recipient = sum(1 for t in prior_txs if t.get('fraudVerdict') in ('HIGH_RISK', 'MEDIUM_RISK'))

    # Amount z-score
    amounts = [float(t.get('amount', 0)) for t in transactions if t.get('amount')]
    avg_a = sum(amounts) / len(amounts) if amounts else 1
    std_a = math.sqrt(sum((a - avg_a)**2 for a in amounts) / len(amounts)) if len(amounts) > 1 else 1
    z_score = (amount - avg_a) / max(std_a, 1)

    odd_hour = hour <= 5
    DOW_RISK = {0: 1.4, 1: 0.7, 2: 0.8, 3: 0.9, 4: 1.0, 5: 1.3, 6: 0.9}
    dow_mult = DOW_RISK.get((dow + 1) % 7, 1.0)
    is_round = amount > 0 and (amount % 100 == 0 or amount % 500 == 0 or amount % 1000 == 0)

    # Recent velocity
    recent_count = 0
    for t in transactions:
        try:
            ts_str = t.get('timestamp') or t.get('date', '')
            ts = datetime.fromisoformat(str(ts_str)[:19].replace('T', ' ')) if ts_str else now
            if (now - ts).total_seconds() < 1800: recent_count += 1
        except Exception: pass

    factors = [
        {"key": "recipient",  "label": "Recipient History",    "score": 70 if fraud_with_recipient else (5 if prior_txs else 55), "risk": "high" if fraud_with_recipient else ("safe" if prior_txs else "medium")},
        {"key": "spoof",      "label": "UPI Spoofing Check",   "score": 85 if is_spoof else 5,   "risk": "high" if is_spoof else "safe"},
        {"key": "amount",     "label": "Amount Risk",          "score": 80 if z_score > 2 else (45 if z_score > 1 else 10), "risk": "high" if z_score > 2 else ("medium" if z_score > 1 else "safe")},
        {"key": "time",       "label": "Transaction Timing",   "score": 80 if odd_hour else (45 if dow_mult > 1.2 else 10), "risk": "high" if odd_hour else ("medium" if dow_mult > 1.2 else "safe")},
        {"key": "velocity",   "label": "Payment Velocity",     "score": 70 if recent_count >= 2 else 5, "risk": "high" if recent_count >= 2 else "safe"},
        {"key": "pattern",    "label": "Round Number Pattern",  "score": 30 if is_round else 5,  "risk": "medium" if is_round else "safe"},
    ]

    high_count = sum(1 for f in factors if f['risk'] == 'high')
    composite  = round(sum(f['score'] for f in factors) / len(factors))
    verdict    = "BLOCK" if high_count >= 2 or composite >= 65 else "CAUTION" if high_count >= 1 or composite >= 35 else "ALLOW"
    confidence = round(60 + abs(50 - composite) * 0.8)

    return jsonify({
        "target_upi":    target_upi,
        "amount":        amount,
        "verdict":       verdict,
        "composite_risk": composite,
        "confidence":    confidence,
        "factors":       factors,
        "spoof_detected": is_spoof,
        "closest_upi":   closest_upi,
        "spoof_distance": min_dist,
        "summary": (
            f"BLOCK: {high_count} high-risk factor(s) detected. Do not proceed."
            if verdict == "BLOCK" else
            f"CAUTION: Some risk signals found. Verify recipient before sending."
            if verdict == "CAUTION" else
            f"ALLOW: No significant risk factors. Safe to proceed."
        ),
    })


# ══════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    import logging
    import flask.cli

    # Suppress ALL Flask/Werkzeug startup & request messages
    logging.getLogger('werkzeug').disabled = True
    flask.cli.show_server_banner = lambda *x, **kw: None

    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'

    print("\n" + "═" * 52)
    print("  AegisAI  —  Neural Fraud Defense")
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
