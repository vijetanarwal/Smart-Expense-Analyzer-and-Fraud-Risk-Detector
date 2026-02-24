# 🚀 Feature Breakdown – Smart Expense Analyzer & Fraud Risk Detector

---

## 1️⃣ Web Dashboard (User)

**Goal:** Monitor spending patterns, fraud risk, and future overspending insights.

**Implementation:**
- React + Tailwind dashboard UI
- Category-wise spending distribution (Pie chart)
- Forecast vs Actual monthly trend (Line chart)
- Overspending risk indicator (Low / Medium / High)
- Suspicious transactions table
- Transaction filtering (date, category, risk level)

**APIs:** `/dashboard/{user_id}`, `/forecast/{user_id}`, `/transactions`

---

## 2️⃣ Expense Entry (Manual Input)

**Goal:** Allow users to submit individual expenses and trigger ML prediction.

**Implementation:**
- Form with validation (amount, merchant, payment type, installments, freight, date)
- Feature engineering before model inference
- Expense classification model integration
- Isolation Forest fraud detection
- Risk level mapping (0–1 → Low/Medium/High)
- Explanation generation for flagged transactions

**APIs:** `/expenses/manual`, `/models/classify`, `/models/fraud-score`

---

## 3️⃣ CSV Upload (Batch Processing)

**Goal:** Allow bulk expense ingestion and batch ML scoring.

**Implementation:**
- Drag-and-drop CSV upload interface
- Pandas-based validation & cleaning
- Batch classification inference
- Batch fraud scoring
- Summary result (low/medium/high risk counts)
- Store processed results in PostgreSQL

**APIs:** `/expenses/upload-csv`

---

## 4️⃣ Fraud Detection & Risk Scoring

**Goal:** Identify anomalous transactions using ML.

**Implementation:**
- Isolation Forest anomaly detection
- Fraud score normalization (0–1)
- Risk thresholds:
  - 0–0.3 → LOW
  - 0.3–0.7 → MEDIUM
  - 0.7–1 → HIGH
- Explainable risk indicators:
  - High amount deviation
  - Rare category usage
  - Unusual payment behavior

**APIs:** `/models/fraud-score`

---

## 5️⃣ Expense Classification

**Goal:** Automatically categorize expenses.

**Implementation:**
- Logistic Regression / Random Forest model
- Feature encoding (amount, payment type, installments, time features)
- Confidence score output
- Store predicted category in DB

**APIs:** `/models/classify`

---

## 6️⃣ Forecasting & Overspending Prediction

**Goal:** Predict next month’s spending and overspending risk.

**Implementation:**
- Monthly aggregation using Pandas
- LSTM-based time-series forecasting
- Rolling average comparison
- Overspending risk logic:
  - Predicted > 120% of avg → HIGH
  - Predicted > 105% → MEDIUM
  - Else → LOW
- Forecast vs actual visualization

**APIs:** `/forecast/{user_id}`

---

## 7️⃣ Transaction History & Filtering

**Goal:** View and filter historical transactions.

**Implementation:**
- Paginated transaction table
- Filters:
  - Date range
  - Category
  - Risk level
- Indexed DB queries for performance

**APIs:** `/transactions`

---

## 8️⃣ Authentication & Security

**Goal:** Secure user access and data isolation.

**Implementation:**
- JWT-based authentication
- Password hashing (bcrypt)
- Protected routes
- User-specific data workspace

**APIs:** `/auth/signup`, `/auth/login`, `/auth/me`

---

## 9️⃣ Dashboard Analytics Aggregation

**Goal:** Provide unified analytics view.

**Implementation:**
- Category spend aggregation
- Suspicious transaction listing
- Forecast integration
- Combined API response for frontend rendering

**APIs:** `/dashboard/{user_id}`

---

## 🔟 Data Pipeline & ML Integration

**Goal:** Production-ready inference pipeline.

**Implementation:**
- Model versioning (.pkl / PyTorch weights)
- Load models at FastAPI startup
- Store predictions in PostgreSQL
- Async processing support for large CSV uploads
- Standardized JSON response format

**Internal Flow:**
User → Validation → Feature Engineering →  
Classification → Isolation Forest → Risk Mapping →  
DB Storage → Dashboard Aggregation → Response

---


