# API Endpoints – Smart Expense Analyzer & Fraud Risk Detector

---

## Base URL

`/api/v1`

---

## Authentication APIs

| Method | Endpoint | Role | Description | Request Body | Response |
|--------|----------|------|------------|-------------|----------|
| POST | `/auth/signup` | Public | Register new user | email, password | User data |
| POST | `/auth/login` | Public | User login | email, password | JWT token |
| GET | `/auth/me` | User | Get logged-in profile | — | User profile data |

---

## Expense APIs

| Method | Endpoint | Role | Description | Request Body | Response |
|--------|----------|------|------------|-------------|----------|
| POST | `/expenses/manual` | User | Submit manual expense & trigger ML | amount, merchant, payment_type, installments, freight_value, transaction_date | Category + fraud score |
| POST | `/expenses/upload-csv` | User | Upload CSV for batch ML processing | CSV file | Processing summary |
| GET | `/transactions` | User | Get transaction history with filters | start_date, end_date, category, risk_level | List of transactions |

---

## Dashboard APIs

| Method | Endpoint | Role | Description | Request Body | Response |
|--------|----------|------|------------|-------------|----------|
| GET | `/dashboard/{user_id}` | User | Get full dashboard analytics | — | Charts + suspicious transactions |
| GET | `/forecast/{user_id}` | User | Get next month forecast (LSTM) | — | Prediction + overspending risk |

---

## ML / Prediction APIs

| Method | Endpoint | Role | Description | Request Body | Response |
|--------|----------|------|------------|-------------|----------|
| POST | `/models/classify` | Internal | Direct category prediction | Feature JSON | Predicted category |
| POST | `/models/fraud-score` | Internal | Direct fraud scoring | Feature JSON | Fraud score + risk level |
| GET | `/models/info` | Admin | Get current model metadata | — | Model name + metrics |

---

## System Flow

User → `/expenses/manual` → Validation → Feature Engineering →  
Classification Model → Isolation Forest → Risk Mapping →  
Store in PostgreSQL → Return JSON → Dashboard Update

---

