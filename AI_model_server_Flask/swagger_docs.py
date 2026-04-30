"""
AegisAI — Full OpenAPI 2.0 (Swagger) specification.
Loaded by Flasgger in app.py → served at /apidocs/
"""

SWAGGER_TEMPLATE = {
    "swagger": "2.0",
    "info": {
        "title": "AegisAI — Neural Fraud Defense API",
        "description": (
            "Complete REST API for AegisAI Intelligent Financial Anomaly Detection System.\n\n"
            "## Authentication\n"
            "All endpoints are open for demo. In production, pass Firebase JWT as `Authorization: Bearer <token>`.\n\n"
            "## Base URL\n"
            "`http://localhost:5000`\n\n"
            "## Models Available\n"
            "- **Random Forest** (22 features, pre-trained, always available)\n"
            "- **Isolation Forest** (unsupervised, loaded after `/upload`)\n"
            "- **Autoencoder** (deep learning, loaded after `/upload`)\n\n"
            "## Quick Start\n"
            "1. `GET /health` — verify server is running\n"
            "2. `POST /predict` — score a single transaction (no dataset needed)\n"
            "3. `POST /upload` — upload CSV to enable ML operations\n"
            "4. `POST /detect` — run full anomaly detection\n"
        ),
        "version": "2.0",
        "contact": {
            "name": "AegisAI Team",
            "email": "harsharchduke@gmail.com",
        },
        "license": {
            "name": "MIT",
        },
    },
    "host": "localhost:5000",
    "basePath": "/",
    "schemes": ["http"],
    "consumes": ["application/json"],
    "produces": ["application/json"],
    "tags": [
        {"name": "System",           "description": "Health checks and server status"},
        {"name": "Fraud Detection",  "description": "Core fraud scoring — single, batch, enriched"},
        {"name": "ML Operations",    "description": "Upload dataset, explore, run detection, model comparison"},
        {"name": "Explainability",   "description": "SHAP-style attribution, counterfactuals, similarity search"},
        {"name": "Advanced Analytics","description": "Velocity, geo, device, network, amount-pattern analysis"},
        {"name": "AI Features",      "description": "Claude-powered insights: spending coach, DNA, story, budget"},
        {"name": "Financial Tools",  "description": "EMI, split bill, recurring payments, savings goals"},
        {"name": "User Features",    "description": "Biometric, voice, community, disputes, notifications"},
        {"name": "Phone Payments",   "description": "Pay-by-phone: lookup, fraud check, history"},
    ],
    "paths": {

        # ══════════════════════════════════════════════════
        # SYSTEM
        # ══════════════════════════════════════════════════

        "/health": {
            "get": {
                "tags": ["System"],
                "summary": "Server health check",
                "description": "Returns loaded model status, dataset info, and server uptime.",
                "responses": {
                    "200": {
                        "description": "Server is healthy",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "status":         {"type": "string", "example": "ok"},
                                "server_started": {"type": "string", "example": "2025-04-30T10:00:00Z"},
                                "models": {
                                    "type": "object",
                                    "properties": {
                                        "random_forest":    {"type": "object"},
                                        "isolation_forest": {"type": "object"},
                                        "autoencoder":      {"type": "object"},
                                    },
                                },
                                "dataset": {
                                    "type": "object",
                                    "properties": {
                                        "loaded":      {"type": "boolean"},
                                        "rows":        {"type": "integer"},
                                        "has_labels":  {"type": "boolean"},
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },

        "/notifications": {
            "get": {
                "tags": ["System"],
                "summary": "Get system notifications",
                "description": "Returns recent fraud alerts and system messages.",
                "responses": {
                    "200": {"description": "List of notifications"},
                },
            },
        },

        # ══════════════════════════════════════════════════
        # FRAUD DETECTION
        # ══════════════════════════════════════════════════

        "/predict": {
            "post": {
                "tags": ["Fraud Detection"],
                "summary": "Single transaction fraud score (fast)",
                "description": (
                    "Scores one transaction using the pre-trained Random Forest model (22 features). "
                    "No dataset upload required. Returns prediction, fraud probability, risk level, and AI insight."
                ),
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "required": ["features"],
                            "properties": {
                                "features": {
                                    "type": "array",
                                    "items": {"type": "number"},
                                    "minItems": 22,
                                    "maxItems": 22,
                                    "description": "22 feature values in RF_FEATURE_NAMES order",
                                    "example": [5000, 3, 0, 0, 0, 0.8, 48, 0.7, 365, 0, 0, 0, 0.4, 0, 0, 0, 0, 0, 0, 1, 1, 0],
                                },
                                "id": {"type": "string", "description": "Optional transaction ID", "example": "TX-001"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Fraud prediction result",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "prediction":       {"type": "array", "items": {"type": "integer"}, "example": [0]},
                                "verdict":          {"type": "string", "enum": ["FRAUD", "LEGITIMATE"]},
                                "fraud_probability":{"type": "number", "example": 0.12},
                                "risk_level":       {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
                                "ai_insight":       {"type": "string"},
                                "feature_analysis": {"type": "array"},
                                "model":            {"type": "string", "example": "Random Forest"},
                            },
                        },
                    },
                    "400": {"description": "Missing or invalid features"},
                    "500": {"description": "Model inference error"},
                },
            },
        },

        "/check-single": {
            "post": {
                "tags": ["Fraud Detection"],
                "summary": "Enriched transaction check (all models)",
                "description": (
                    "Full ensemble check using RF + Isolation Forest + Autoencoder. "
                    "Returns detailed explanation, counterfactual, and risk breakdown per model. "
                    "Slower than /predict but much more detailed."
                ),
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "properties": {
                                "features": {
                                    "type": "array",
                                    "items": {"type": "number"},
                                    "description": "22 feature values OR named fields",
                                },
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Enriched fraud analysis",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "verdict":           {"type": "string", "enum": ["FRAUD", "LEGITIMATE"]},
                                "fraud_probability": {"type": "number"},
                                "risk_level":        {"type": "string"},
                                "models":            {"type": "object", "description": "Per-model results"},
                                "feature_analysis":  {"type": "array"},
                                "explanation":       {"type": "string"},
                                "latency_ms":        {"type": "number"},
                            },
                        },
                    },
                },
            },
        },

        "/batch-check": {
            "post": {
                "tags": ["Fraud Detection"],
                "summary": "Batch transaction check (up to 50)",
                "description": "Check up to 50 transactions at once. Returns per-transaction verdicts and a batch summary.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "required": ["transactions"],
                            "properties": {
                                "transactions": {
                                    "type": "array",
                                    "maxItems": 50,
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "features": {"type": "array", "items": {"type": "number"}},
                                            "id": {"type": "string"},
                                        },
                                    },
                                },
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Batch results",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "results":   {"type": "array"},
                                "summary":   {"type": "object"},
                                "total":     {"type": "integer"},
                                "fraud_count": {"type": "integer"},
                            },
                        },
                    },
                },
            },
        },

        "/prepayment-check": {
            "post": {
                "tags": ["Fraud Detection"],
                "summary": "Pre-payment shield validation",
                "description": (
                    "Validates a payment BEFORE it is sent. Checks recipient UPI against watchlist, "
                    "dark patterns, spoofing detection, and community flags. Returns ALLOW / CAUTION / BLOCK."
                ),
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "properties": {
                                "recipientUpi":    {"type": "string", "example": "user@bank"},
                                "amount":          {"type": "number", "example": 5000},
                                "senderUpi":       {"type": "string"},
                                "transactionNote": {"type": "string"},
                                "transactions":    {"type": "array"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Pre-payment verdict",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "verdict":  {"type": "string", "enum": ["ALLOW", "CAUTION", "BLOCK"]},
                                "factors":  {"type": "array"},
                                "summary":  {"type": "string"},
                            },
                        },
                    },
                },
            },
        },

        "/rule-engine": {
            "post": {
                "tags": ["Fraud Detection"],
                "summary": "Custom rule-based fraud scoring",
                "description": "Apply user-defined rules on top of the ML model score. Each rule has a field, operator, threshold, and weight.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "properties": {
                                "features": {"type": "array", "items": {"type": "number"}},
                                "rules": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "field":     {"type": "string"},
                                            "operator":  {"type": "string", "enum": [">", "<", ">=", "<=", "=="]},
                                            "threshold": {"type": "number"},
                                            "weight":    {"type": "number"},
                                        },
                                    },
                                },
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Rule engine verdict with fired rules"},
                },
            },
        },

        # ══════════════════════════════════════════════════
        # ML OPERATIONS
        # ══════════════════════════════════════════════════

        "/upload": {
            "post": {
                "tags": ["ML Operations"],
                "summary": "Upload transaction CSV dataset",
                "description": (
                    "Upload a CSV file to enable full ML operations (detect, explore, explain). "
                    "Trains Isolation Forest and Autoencoder on the uploaded data. "
                    "Returns dataset statistics and feature columns detected."
                ),
                "consumes": ["multipart/form-data"],
                "parameters": [
                    {
                        "in": "formData",
                        "name": "file",
                        "type": "file",
                        "required": True,
                        "description": "CSV file with transaction data",
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Dataset loaded and models trained",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "message":       {"type": "string"},
                                "rows":          {"type": "integer"},
                                "columns":       {"type": "integer"},
                                "feature_cols":  {"type": "array", "items": {"type": "string"}},
                                "label_col":     {"type": "string"},
                            },
                        },
                    },
                    "400": {"description": "No file or invalid CSV"},
                },
            },
        },

        "/explore": {
            "get": {
                "tags": ["ML Operations"],
                "summary": "Explore uploaded dataset statistics",
                "description": "Returns descriptive statistics, fraud/legit split, feature distributions, and AI narrative about the dataset.",
                "responses": {
                    "200": {
                        "description": "Dataset exploration results",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "rows":            {"type": "integer"},
                                "columns":         {"type": "integer"},
                                "fraud_count":     {"type": "integer"},
                                "legit_count":     {"type": "integer"},
                                "fraud_rate":      {"type": "number"},
                                "feature_stats":   {"type": "object"},
                                "ai_insight":      {"type": "string"},
                            },
                        },
                    },
                    "400": {"description": "No dataset loaded — call /upload first"},
                },
            },
        },

        "/detect": {
            "post": {
                "tags": ["ML Operations"],
                "summary": "Run bulk anomaly detection on dataset",
                "description": (
                    "Runs all available models (RF + IF + AE) on the uploaded dataset. "
                    "Returns per-row predictions, model metrics (accuracy, AUC, F1), "
                    "and stores results for /results and /explain endpoints."
                ),
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "contamination": {"type": "number", "default": 0.1, "description": "Isolation Forest contamination ratio"},
                                "ae_epochs":     {"type": "integer", "default": 10},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Detection complete",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "total":        {"type": "integer"},
                                "fraud_count":  {"type": "integer"},
                                "metrics":      {"type": "object"},
                                "timestamp":    {"type": "string"},
                            },
                        },
                    },
                },
            },
        },

        "/results": {
            "get": {
                "tags": ["ML Operations"],
                "summary": "Get last detection results",
                "description": "Returns the full results table from the most recent /detect run.",
                "responses": {
                    "200": {"description": "Detection results array"},
                    "400": {"description": "No detection run yet"},
                },
            },
        },

        "/features": {
            "get": {
                "tags": ["ML Operations"],
                "summary": "List feature columns",
                "description": "Returns the feature column names from the loaded dataset.",
                "responses": {
                    "200": {
                        "description": "Feature list",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "features": {"type": "array", "items": {"type": "string"}},
                                "count":    {"type": "integer"},
                            },
                        },
                    },
                },
            },
        },

        "/model-comparison": {
            "get": {
                "tags": ["ML Operations"],
                "summary": "Compare all model performance metrics",
                "description": "Side-by-side comparison of RF, Isolation Forest, and Autoencoder: accuracy, AUC, precision, recall, F1.",
                "responses": {
                    "200": {"description": "Model comparison metrics"},
                    "400": {"description": "Detection not run yet"},
                },
            },
        },

        "/dataset-drift": {
            "get": {
                "tags": ["ML Operations"],
                "summary": "Detect feature distribution drift",
                "description": "Compares uploaded dataset feature distributions against RF training baseline. Flags drifted features.",
                "responses": {
                    "200": {
                        "description": "Drift report",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "drifted_features": {"type": "array"},
                                "drift_score":      {"type": "number"},
                                "recommendation":   {"type": "string"},
                            },
                        },
                    },
                },
            },
        },

        "/retraining-readiness": {
            "post": {
                "tags": ["ML Operations"],
                "summary": "Check if model needs retraining",
                "description": "Evaluates model health, feedback corrections, and dataset drift to recommend if retraining is needed.",
                "responses": {
                    "200": {
                        "description": "Retraining readiness report",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "should_retrain":     {"type": "boolean"},
                                "confidence":         {"type": "number"},
                                "reasons":            {"type": "array"},
                                "recommendation":     {"type": "string"},
                            },
                        },
                    },
                },
            },
        },

        "/export-results": {
            "get": {
                "tags": ["ML Operations"],
                "summary": "Export detection results as CSV",
                "description": "Downloads the last detection results as a CSV file.",
                "produces": ["text/csv"],
                "responses": {
                    "200": {"description": "CSV file download"},
                    "400": {"description": "No results to export"},
                },
            },
        },

        "/score-history": {
            "get": {
                "tags": ["ML Operations"],
                "summary": "Audit log of all API-scored transactions",
                "description": "Returns a log of every transaction scored via /predict or /check-single since server start.",
                "responses": {
                    "200": {
                        "description": "Score history",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "history": {"type": "array"},
                                "total":   {"type": "integer"},
                            },
                        },
                    },
                },
            },
        },

        "/feedback": {
            "post": {
                "tags": ["ML Operations"],
                "summary": "Submit label correction feedback",
                "description": "Human-in-the-loop: correct the model's verdict for a transaction. Used to track model drift and trigger retraining.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "required": ["transaction_id", "correct_label"],
                            "properties": {
                                "transaction_id":  {"type": "string"},
                                "model_verdict":   {"type": "string", "enum": ["FRAUD", "LEGITIMATE"]},
                                "correct_label":   {"type": "string", "enum": ["FRAUD", "LEGITIMATE"]},
                                "reason":          {"type": "string"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Feedback recorded"},
                },
            },
        },

        "/feedback-stats": {
            "get": {
                "tags": ["ML Operations"],
                "summary": "Feedback correction statistics",
                "description": "Returns counts of model corrections submitted via /feedback.",
                "responses": {
                    "200": {"description": "Feedback statistics"},
                },
            },
        },

        "/watchlist": {
            "get": {
                "tags": ["ML Operations"],
                "summary": "Top high-risk transactions from dataset",
                "description": "Returns the top-N highest risk transactions from the last detection run.",
                "parameters": [
                    {"in": "query", "name": "n", "type": "integer", "default": 20, "description": "Number of results"},
                ],
                "responses": {
                    "200": {"description": "High-risk transaction list"},
                },
            },
        },

        # ══════════════════════════════════════════════════
        # EXPLAINABILITY
        # ══════════════════════════════════════════════════

        "/explain/{idx}": {
            "get": {
                "tags": ["Explainability"],
                "summary": "Explain a transaction by dataset index",
                "description": "SHAP-style feature attribution for a specific row in the uploaded dataset.",
                "parameters": [
                    {"in": "path", "name": "idx", "type": "integer", "required": True, "description": "Row index in dataset"},
                ],
                "responses": {
                    "200": {
                        "description": "Feature attribution",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "index":           {"type": "integer"},
                                "verdict":         {"type": "string"},
                                "fraud_probability": {"type": "number"},
                                "feature_contributions": {"type": "array"},
                                "top_risk_features": {"type": "array"},
                                "explanation_text": {"type": "string"},
                            },
                        },
                    },
                    "404": {"description": "Index out of range"},
                },
            },
        },

        "/bulk-explain": {
            "post": {
                "tags": ["Explainability"],
                "summary": "Batch feature attribution",
                "description": "Explain multiple feature vectors at once. Returns attribution for each.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "required": ["transactions"],
                            "properties": {
                                "transactions": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "features": {"type": "array", "items": {"type": "number"}},
                                            "id":       {"type": "string"},
                                        },
                                    },
                                },
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Bulk explanations"},
                },
            },
        },

        "/counterfactual": {
            "post": {
                "tags": ["Explainability"],
                "summary": "Counterfactual analysis",
                "description": "Shows what minimal feature changes would flip a FRAUD verdict to LEGITIMATE.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "properties": {
                                "features": {"type": "array", "items": {"type": "number"}},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Counterfactual suggestions",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "original_verdict":       {"type": "string"},
                                "counterfactual_changes": {"type": "array"},
                                "new_verdict":            {"type": "string"},
                            },
                        },
                    },
                },
            },
        },

        "/similarity-search": {
            "post": {
                "tags": ["Explainability"],
                "summary": "Find similar transactions in dataset",
                "description": "Returns the most similar transactions from the loaded dataset using Euclidean distance.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "features": {"type": "array", "items": {"type": "number"}},
                                "top_k":    {"type": "integer", "default": 5},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Similar transactions"},
                },
            },
        },

        "/feature-importance": {
            "get": {
                "tags": ["Explainability"],
                "summary": "Global feature importance scores",
                "description": "Returns RF model's global feature importance (Gini impurity reduction).",
                "responses": {
                    "200": {
                        "description": "Feature importance ranking",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "features": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "feature":    {"type": "string"},
                                            "importance": {"type": "number"},
                                            "rank":       {"type": "integer"},
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },

        # ══════════════════════════════════════════════════
        # ADVANCED ANALYTICS
        # ══════════════════════════════════════════════════

        "/velocity-check": {
            "post": {
                "tags": ["Advanced Analytics"],
                "summary": "UPI transaction velocity fraud detection",
                "description": "Detects rapid multi-transaction fraud patterns (many transactions in short windows).",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "properties": {
                                "upiId":        {"type": "string"},
                                "transactions": {"type": "array"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Velocity analysis",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "velocity_score": {"type": "number"},
                                "verdict":        {"type": "string"},
                                "patterns":       {"type": "array"},
                            },
                        },
                    },
                },
            },
        },

        "/amount-pattern": {
            "post": {
                "tags": ["Advanced Analytics"],
                "summary": "Suspicious amount pattern detection",
                "description": "Detects structuring (splitting large amounts), round-number probing, and limit-testing patterns.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "transactions": {"type": "array"},
                                "upiId":        {"type": "string"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Amount pattern analysis"},
                },
            },
        },

        "/account-takeover": {
            "post": {
                "tags": ["Advanced Analytics"],
                "summary": "Account takeover risk scoring",
                "description": "Scores risk of account takeover based on device fingerprint changes, location shifts, and behaviour anomalies.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "upiId":          {"type": "string"},
                                "deviceId":       {"type": "string"},
                                "location":       {"type": "string"},
                                "transactions":   {"type": "array"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Account takeover risk score"},
                },
            },
        },

        "/recipient-trust": {
            "post": {
                "tags": ["Advanced Analytics"],
                "summary": "Recipient UPI trust score",
                "description": "Scores a recipient UPI ID based on transaction history, community reports, and spoofing detection.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "required": ["recipientUpi"],
                            "properties": {
                                "recipientUpi": {"type": "string", "example": "merchant@bank"},
                                "senderUpi":    {"type": "string"},
                                "amount":       {"type": "number"},
                                "transactions": {"type": "array"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Trust score",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "trust_score":  {"type": "number", "example": 82},
                                "trust_badge":  {"type": "string", "enum": ["verified", "caution", "watch"]},
                                "verdict":      {"type": "string"},
                                "factors":      {"type": "array"},
                            },
                        },
                    },
                },
            },
        },

        "/spending-pattern": {
            "post": {
                "tags": ["Advanced Analytics"],
                "summary": "Personal spending baseline deviation",
                "description": "Compares current transactions against user's personal spending baseline. Flags anomalous amounts, categories, or timing.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "upiId":        {"type": "string"},
                                "transactions": {"type": "array"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Spending pattern analysis"},
                },
            },
        },

        "/network-analysis": {
            "get": {
                "tags": ["Advanced Analytics"],
                "summary": "Money mule and circular fund-flow detection",
                "description": "Builds a transaction graph from the loaded dataset and detects money mule chains and circular fund flows using Union-Find.",
                "responses": {
                    "200": {
                        "description": "Network analysis result",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "nodes":             {"type": "integer"},
                                "edges":             {"type": "integer"},
                                "suspicious_paths":  {"type": "array"},
                                "mule_candidates":   {"type": "array"},
                            },
                        },
                    },
                },
            },
        },

        "/geo-velocity": {
            "post": {
                "tags": ["Advanced Analytics"],
                "summary": "Geographic velocity / impossible travel detection",
                "description": "Detects physically impossible travel between consecutive transactions (e.g., Mumbai → Delhi in 2 minutes).",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "transactions": {"type": "array"},
                                "upiId":        {"type": "string"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Geo-velocity analysis"},
                },
            },
        },

        "/device-risk": {
            "post": {
                "tags": ["Advanced Analytics"],
                "summary": "Device fingerprint risk scoring",
                "description": "Scores device risk based on rooted/emulated status, new install flags, and fingerprint changes.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "deviceId":        {"type": "string"},
                                "isRooted":        {"type": "boolean"},
                                "isEmulator":      {"type": "boolean"},
                                "isNewInstall":    {"type": "boolean"},
                                "transactions":    {"type": "array"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Device risk score"},
                },
            },
        },

        "/risk-score-blend": {
            "post": {
                "tags": ["Advanced Analytics"],
                "summary": "Unified composite risk score",
                "description": "Combines ML model score + velocity + device + geo + recipient trust into a single composite risk score (0–100).",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "features":     {"type": "array"},
                                "upiId":        {"type": "string"},
                                "amount":       {"type": "number"},
                                "transactions": {"type": "array"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Blended risk score",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "composite_score": {"type": "number"},
                                "verdict":         {"type": "string"},
                                "components":      {"type": "object"},
                            },
                        },
                    },
                },
            },
        },

        "/fraud-ring-analysis": {
            "post": {
                "tags": ["Advanced Analytics"],
                "summary": "Fraud ring / cartel detection",
                "description": "Uses Union-Find clustering on transaction graph to detect coordinated fraud rings.",
                "responses": {
                    "200": {"description": "Fraud ring clusters"},
                },
            },
        },

        "/fraud-calendar": {
            "get": {
                "tags": ["Advanced Analytics"],
                "summary": "Hour/day fraud heatmap",
                "description": "Returns a 24×7 fraud frequency heatmap from the dataset for scheduling risk rules.",
                "responses": {
                    "200": {"description": "Fraud calendar heatmap (24 hours × 7 days)"},
                },
            },
        },

        "/transaction-purpose": {
            "post": {
                "tags": ["Advanced Analytics"],
                "summary": "AI transaction purpose classifier",
                "description": "Classifies transaction purpose as P2P / merchant / bill / suspicious based on amount, time, and note.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "amount": {"type": "number"},
                                "note":   {"type": "string"},
                                "hour":   {"type": "integer"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Transaction purpose classification"},
                },
            },
        },

        # ══════════════════════════════════════════════════
        # AI FEATURES
        # ══════════════════════════════════════════════════

        "/ai-summary": {
            "get": {
                "tags": ["AI Features"],
                "summary": "AI narrative summary after detection",
                "description": "Generates a natural-language fraud report for the last /detect run using statistical analysis.",
                "responses": {
                    "200": {
                        "description": "AI narrative summary",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "summary":       {"type": "string"},
                                "key_findings":  {"type": "array"},
                                "recommendations": {"type": "array"},
                            },
                        },
                    },
                },
            },
        },

        "/spending-coach": {
            "post": {
                "tags": ["AI Features"],
                "summary": "AI spending coach advice",
                "description": "Provides personalised spending advice based on transaction history, budget, and fraud events.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "transactions": {"type": "array"},
                                "budget":       {"type": "number"},
                                "upiId":        {"type": "string"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Coaching tips and analysis"},
                },
            },
        },

        "/spending-dna": {
            "post": {
                "tags": ["AI Features"],
                "summary": "Spending DNA profile",
                "description": "Creates a unique spending fingerprint: categories, timing patterns, merchant preferences, and behavioural clusters.",
                "responses": {
                    "200": {"description": "Spending DNA profile"},
                },
            },
        },

        "/future-risk/{upi_id}": {
            "get": {
                "tags": ["AI Features"],
                "summary": "Future fraud risk prediction",
                "description": "Predicts fraud risk for the next 7/30 days based on spending patterns and seasonal fraud trends.",
                "parameters": [
                    {"in": "path", "name": "upi_id", "type": "string", "required": True},
                ],
                "responses": {
                    "200": {"description": "Future risk forecast"},
                },
            },
        },

        "/financial-story": {
            "post": {
                "tags": ["AI Features"],
                "summary": "AI financial narrative",
                "description": "Generates a human-readable financial story from transaction history including fraud events, savings, and goals.",
                "responses": {
                    "200": {"description": "Financial story narrative"},
                },
            },
        },

        "/budget-predict": {
            "post": {
                "tags": ["AI Features"],
                "summary": "Smart budget prediction",
                "description": "Predicts next month's spending by category using trend analysis and seasonality detection.",
                "responses": {
                    "200": {"description": "Budget prediction"},
                },
            },
        },

        "/financial-health": {
            "post": {
                "tags": ["AI Features"],
                "summary": "Financial health score",
                "description": "Composite financial health score (0–900, like a credit score) based on spending habits, fraud risk, savings, and payment regularity.",
                "responses": {
                    "200": {
                        "description": "Financial health score",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "score":          {"type": "number", "example": 720},
                                "grade":          {"type": "string", "example": "B+"},
                                "components":     {"type": "object"},
                                "recommendations":{"type": "array"},
                            },
                        },
                    },
                },
            },
        },

        "/risk-profile": {
            "post": {
                "tags": ["AI Features"],
                "summary": "User risk percentile profile",
                "description": "Compares feature values against the training distribution and returns percentile risk profile.",
                "responses": {
                    "200": {"description": "Risk percentile profile"},
                },
            },
        },

        "/fraud-forecast": {
            "post": {
                "tags": ["AI Features"],
                "summary": "Short-term fraud forecast",
                "description": "Forecasts probability of fraud attempts in the next 24h / 7d based on user patterns.",
                "responses": {
                    "200": {"description": "Fraud forecast"},
                },
            },
        },

        "/contact-trust": {
            "post": {
                "tags": ["AI Features"],
                "summary": "Contact trust scoring",
                "description": "Scores a UPI contact's trustworthiness based on transaction history, community flags, and behavioural consistency.",
                "responses": {
                    "200": {"description": "Contact trust score"},
                },
            },
        },

        "/dark-pattern-check": {
            "post": {
                "tags": ["AI Features"],
                "summary": "Dark pattern detection in payment flow",
                "description": "Checks if a payment request shows signs of dark UX patterns (urgency, misleading notes, unusual amounts).",
                "responses": {
                    "200": {"description": "Dark pattern analysis"},
                },
            },
        },

        "/explain-transaction": {
            "post": {
                "tags": ["AI Features"],
                "summary": "Explain a raw transaction object",
                "description": "Explain any transaction object (not just dataset rows) with full SHAP-style attribution.",
                "responses": {
                    "200": {"description": "Transaction explanation"},
                },
            },
        },

        "/payment-health": {
            "post": {
                "tags": ["AI Features"],
                "summary": "Payment health score",
                "description": "Scores the health of a user's payment activity: on-time, disputes, fraud events, and limit adherence.",
                "responses": {
                    "200": {"description": "Payment health score"},
                },
            },
        },

        "/behavioral-analysis": {
            "post": {
                "tags": ["AI Features"],
                "summary": "Behavioural pattern analysis",
                "description": "Deep analysis of user behavioural patterns: typing speed, transaction timing, session length, and deviations.",
                "responses": {
                    "200": {"description": "Behavioural analysis"},
                },
            },
        },

        # ══════════════════════════════════════════════════
        # FINANCIAL TOOLS
        # ══════════════════════════════════════════════════

        "/emi/calculate": {
            "post": {
                "tags": ["Financial Tools"],
                "summary": "EMI calculator",
                "description": "Calculates monthly EMI, total interest, and full amortisation schedule.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "required": ["principal", "rate", "tenure"],
                            "properties": {
                                "principal": {"type": "number", "example": 500000, "description": "Loan amount in ₹"},
                                "rate":      {"type": "number", "example": 8.5, "description": "Annual interest rate (%)"},
                                "tenure":    {"type": "integer", "example": 24, "description": "Tenure in months"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "EMI calculation",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "emi":             {"type": "number", "example": 22735.76},
                                "total_payment":   {"type": "number"},
                                "total_interest":  {"type": "number"},
                                "schedule":        {"type": "array"},
                            },
                        },
                    },
                },
            },
        },

        "/split-bill/calculate": {
            "post": {
                "tags": ["Financial Tools"],
                "summary": "Bill split calculator",
                "description": "Splits a bill among multiple participants with optional custom shares.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "required": ["amount", "participants"],
                            "properties": {
                                "amount":       {"type": "number", "example": 1200},
                                "participants": {"type": "array", "items": {"type": "string"}},
                                "shares":       {"type": "object", "description": "Optional custom share map"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Split bill result"},
                },
            },
        },

        "/savings-goals/projection": {
            "post": {
                "tags": ["Financial Tools"],
                "summary": "Savings goal projection",
                "description": "Projects savings over time given a target amount, monthly contribution, and interest rate.",
                "responses": {
                    "200": {"description": "Savings projection"},
                },
            },
        },

        "/recurring-payments/next-dates": {
            "post": {
                "tags": ["Financial Tools"],
                "summary": "Recurring payment next due dates",
                "description": "Calculates the next N due dates for a recurring payment schedule.",
                "responses": {
                    "200": {"description": "Next payment dates"},
                },
            },
        },

        "/transaction-limits/validate": {
            "post": {
                "tags": ["Financial Tools"],
                "summary": "Validate transaction against limits",
                "description": "Checks if a transaction amount exceeds daily/weekly/per-transaction UPI limits.",
                "responses": {
                    "200": {"description": "Limit validation result"},
                },
            },
        },

        # ══════════════════════════════════════════════════
        # USER FEATURES
        # ══════════════════════════════════════════════════

        "/biometric-verify": {
            "post": {
                "tags": ["User Features"],
                "summary": "Biometric verification",
                "description": "Verifies biometric challenge response. Returns pass/fail with confidence score.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "userId":     {"type": "string"},
                                "challenge":  {"type": "string"},
                                "response":   {"type": "string"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Biometric verification result"},
                },
            },
        },

        "/voice-parse": {
            "post": {
                "tags": ["User Features"],
                "summary": "Parse voice payment command",
                "description": "Parses a natural language voice command into a structured payment intent (recipient, amount, note).",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "required": ["text"],
                            "properties": {
                                "text": {"type": "string", "example": "Send 500 rupees to Rahul for lunch"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Parsed payment intent",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "recipient": {"type": "string"},
                                "amount":    {"type": "number"},
                                "note":      {"type": "string"},
                                "confidence":{"type": "number"},
                            },
                        },
                    },
                },
            },
        },

        "/community-score/{upi_id}": {
            "get": {
                "tags": ["User Features"],
                "summary": "Community-based trust score for a UPI",
                "description": "Aggregates community fraud reports and transaction signals for a UPI ID.",
                "parameters": [
                    {"in": "path", "name": "upi_id", "type": "string", "required": True},
                ],
                "responses": {
                    "200": {"description": "Community trust score"},
                },
            },
        },

        "/disputes": {
            "post": {
                "tags": ["User Features"],
                "summary": "Create a dispute",
                "description": "Opens a new dispute for a flagged or incorrect transaction.",
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "required": ["transactionId", "reason"],
                            "properties": {
                                "transactionId": {"type": "string"},
                                "userId":        {"type": "string"},
                                "reason":        {"type": "string"},
                                "description":   {"type": "string"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {"description": "Dispute created"},
                    "400": {"description": "Missing required fields"},
                },
            },
        },

        "/disputes/{dispute_id}": {
            "get": {
                "tags": ["User Features"],
                "summary": "Get dispute status",
                "description": "Returns the current status and timeline of a dispute.",
                "parameters": [
                    {"in": "path", "name": "dispute_id", "type": "string", "required": True},
                ],
                "responses": {
                    "200": {"description": "Dispute details"},
                    "404": {"description": "Dispute not found"},
                },
            },
        },

        "/live-fraud-feed": {
            "get": {
                "tags": ["User Features"],
                "summary": "Live fraud alert feed",
                "description": "Returns a stream of recent fraud alerts from the scoring engine.",
                "parameters": [
                    {"in": "query", "name": "limit", "type": "integer", "default": 20},
                ],
                "responses": {
                    "200": {"description": "Recent fraud alerts"},
                },
            },
        },

        "/cluster-analysis": {
            "get": {
                "tags": ["User Features"],
                "summary": "Transaction cluster analysis",
                "description": "Groups dataset transactions into behavioural clusters using K-Means.",
                "responses": {
                    "200": {"description": "Cluster analysis result"},
                },
            },
        },

        "/fraud-trends": {
            "get": {
                "tags": ["User Features"],
                "summary": "Fraud trend analysis over time",
                "description": "Time-series fraud rate trends from the dataset (daily/weekly aggregation).",
                "responses": {
                    "200": {"description": "Fraud trends"},
                },
            },
        },

        "/smart-threshold": {
            "get": {
                "tags": ["User Features"],
                "summary": "Optimal fraud detection threshold",
                "description": "Computes the optimal decision threshold balancing precision and recall from the dataset.",
                "responses": {
                    "200": {"description": "Optimal threshold and ROC data"},
                },
            },
        },

        # ══════════════════════════════════════════════════
        # PHONE PAYMENTS
        # ══════════════════════════════════════════════════

        "/phone-lookup": {
            "post": {
                "tags": ["Phone Payments"],
                "summary": "Look up UPI ID from phone number",
                "description": (
                    "Queries Firestore `phoneIndex` collection to resolve a phone number to a UPI ID. "
                    "Returns display name, trust score, and trust badge (verified / caution / watch). "
                    "Used for real-time recipient lookup as user types."
                ),
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "required": ["phoneNumber", "currentUserId"],
                            "properties": {
                                "phoneNumber":    {"type": "string", "example": "+919876543210"},
                                "currentUserId":  {"type": "string", "description": "Firebase UID of sender"},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Phone lookup result",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "found":        {"type": "boolean"},
                                "phoneNumber":  {"type": "string"},
                                "upiId":        {"type": "string", "example": "rahul@aegis"},
                                "displayName":  {"type": "string", "example": "Rahul Sharma"},
                                "trustScore":   {"type": "number", "example": 85},
                                "trustBadge":   {"type": "string", "enum": ["verified", "caution", "watch"]},
                                "message":      {"type": "string", "description": "Present only when found=false"},
                            },
                        },
                    },
                    "400": {"description": "Missing phoneNumber or currentUserId"},
                    "503": {"description": "Firebase not configured on server"},
                },
            },
        },

        "/phone-pay/check": {
            "post": {
                "tags": ["Phone Payments"],
                "summary": "Fraud check for phone-number payments",
                "description": (
                    "7-factor fraud model tailored for phone-number-based payments:\n"
                    "1. First-time phone payment risk\n"
                    "2. Spoofing detection (Levenshtein distance to known contacts)\n"
                    "3. Amount anomaly vs contact history\n"
                    "4. Recipient community trust score\n"
                    "5. Payment velocity (rapid phone payments)\n"
                    "6. Odd-hour risk\n"
                    "7. Community watchlist flags"
                ),
                "parameters": [
                    {
                        "in": "body",
                        "name": "body",
                        "required": True,
                        "schema": {
                            "type": "object",
                            "required": ["phoneNumber", "recipientUpi", "amount"],
                            "properties": {
                                "phoneNumber":   {"type": "string", "example": "+919876543210"},
                                "recipientUpi":  {"type": "string", "example": "rahul@aegis"},
                                "amount":        {"type": "number", "example": 5000},
                                "transactions":  {"type": "array", "description": "Sender's payment history"},
                                "allKnownPhones":{"type": "array", "items": {"type": "string"}, "description": "Sender's known contacts"},
                                "trustScore":    {"type": "number", "example": 85},
                            },
                        },
                    },
                ],
                "responses": {
                    "200": {
                        "description": "Phone payment fraud verdict",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "verdict":        {"type": "string", "enum": ["ALLOW", "CAUTION", "BLOCK"]},
                                "compositeRisk":  {"type": "number", "example": 32},
                                "confidence":     {"type": "number", "example": 85},
                                "factors":        {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "key":    {"type": "string"},
                                            "label":  {"type": "string"},
                                            "score":  {"type": "number"},
                                            "risk":   {"type": "string", "enum": ["safe", "medium", "high"]},
                                            "detail": {"type": "string"},
                                        },
                                    },
                                },
                                "summary":       {"type": "string"},
                                "spoof_detected":{"type": "boolean"},
                            },
                        },
                    },
                },
            },
        },

        "/phone-pay/history": {
            "get": {
                "tags": ["Phone Payments"],
                "summary": "Recent phone-number payment history",
                "description": "Returns a user's recent phone-based payment transactions.",
                "parameters": [
                    {"in": "query", "name": "userId", "type": "string", "required": True, "description": "Firebase UID"},
                    {"in": "query", "name": "limit",  "type": "integer", "default": 10},
                ],
                "responses": {
                    "200": {
                        "description": "Phone payment history",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "transactions": {"type": "array"},
                                "total":        {"type": "integer"},
                            },
                        },
                    },
                },
            },
        },
    },

    "definitions": {
        "FeatureVector": {
            "type": "array",
            "items": {"type": "number"},
            "minItems": 22,
            "maxItems": 22,
            "description": (
                "22-element array in this order: "
                "Transaction Amount, Transaction Frequency, Recipient Blacklist Status, "
                "Device Fingerprinting, VPN or Proxy Usage, Behavioral Biometrics, "
                "Time Since Last Transaction, Social Trust Score, Account Age, "
                "High-Risk Transaction Times, Past Fraudulent Behavior Flags, "
                "Location-Inconsistent Transactions, Normalized Transaction Amount, "
                "Transaction Context Anomalies, Fraud Complaints Count, "
                "Merchant Category Mismatch, User Daily Limit Exceeded, "
                "Recent High-Value Transaction Flags, "
                "Recipient Verification Status_suspicious, Recipient Verification Status_verified, "
                "Geo-Location Flags_normal, Geo-Location Flags_unusual"
            ),
        },
        "FraudVerdict": {
            "type": "object",
            "properties": {
                "verdict":           {"type": "string", "enum": ["FRAUD", "LEGITIMATE", "ALLOW", "CAUTION", "BLOCK"]},
                "fraud_probability": {"type": "number", "minimum": 0, "maximum": 1},
                "risk_level":        {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
                "ai_insight":        {"type": "string"},
            },
        },
        "RiskFactor": {
            "type": "object",
            "properties": {
                "key":    {"type": "string"},
                "label":  {"type": "string"},
                "score":  {"type": "number", "minimum": 0, "maximum": 100},
                "risk":   {"type": "string", "enum": ["safe", "medium", "high"]},
                "detail": {"type": "string"},
            },
        },
    },
}

SWAGGER_CONFIG = {
    "headers": [],
    "specs": [
        {
            "endpoint": "apispec",
            "route": "/apispec.json",
            "rule_filter": lambda rule: True,
            "model_filter": lambda tag: True,
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/apidocs/",
}
