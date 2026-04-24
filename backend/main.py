from dotenv import load_dotenv
load_dotenv()
import warnings
warnings.filterwarnings("ignore")

import os, pickle, math
import joblib
from collections import defaultdict, Counter
from datetime import datetime, timedelta
from typing import Optional, List

import numpy as np
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
import jwt, bcrypt

# ── Config ────────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/expense_db")
SECRET_KEY   = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))

MODEL_DIR    = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models"))

print("BASE_DIR:", BASE_DIR)
print("MODEL_DIR:", MODEL_DIR)
print("FILES IN MODEL_DIR:", os.listdir(MODEL_DIR) if os.path.exists(MODEL_DIR) else "NOT FOUND")

# ── Database ──────────────────────────────────────────────────────────────────
engine       = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)
Base         = declarative_base()

class User(Base):
    __tablename__ = "users"
    id           = Column(Integer, primary_key=True, index=True)
    email        = Column(String, unique=True, index=True, nullable=False)
    name         = Column(String, nullable=False)
    password     = Column(String, nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow)
    transactions = relationship("Transaction", back_populates="user")
class Transaction(Base):
    __tablename__ = "transactions"
    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount       = Column(Float, nullable=False)
    freight      = Column(Float, default=0.0)
    payment_type = Column(String, default="credit_card")
    installments = Column(Integer, default=1)
    category     = Column(String, nullable=True)
    risk_score   = Column(Float, nullable=True)
    risk_label   = Column(String, nullable=True)
    description  = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    user         = relationship("User", back_populates="transactions")

try:
    Base.metadata.create_all(bind=engine)
    print("DB connected successfully")
except Exception as e:
    print("DB connection failed:", e)

# ── Load ML Models ────────────────────────────────────────────────────────────
def _load_lstm(models):
    try:
        import torch, torch.nn as nn
        meta_path = f"{MODEL_DIR}/lstm_v2_meta.pkl"
        pt_path   = f"{MODEL_DIR}/lstm_v2.pt"
        if not (os.path.exists(meta_path) and os.path.exists(pt_path)): return
        with open(meta_path, "rb") as f: meta = pickle.load(f)

        class ForecastLSTM(nn.Module):
            def __init__(self, n_features, hidden, layers, dropout):
                super().__init__()
                self.lstm = nn.LSTM(n_features, hidden, layers, batch_first=True,
                                    dropout=dropout if layers > 1 else 0.0)
                self.head = nn.Sequential(nn.Linear(hidden, 32), nn.ReLU(), nn.Linear(32, 1))
            def forward(self, x):
                out, _ = self.lstm(x)
                return self.head(out[:, -1, :]).squeeze(-1)

        net = ForecastLSTM(meta["n_features"], meta["hidden"], meta["layers"], meta["dropout"])
        net.load_state_dict(torch.load(pt_path, map_location="cpu"))
        net.eval()
        models["lstm"] = {"net": net, "meta": meta, "torch": torch}
        print(f"LSTM loaded (test MAE R$ {meta['test_mae_rs']:,.2f})")
    except Exception as e:
        print(f"LSTM load warning: {e}")

def load_models():
    models = {}

    # ---- Classifier ----
    clf_path = os.path.join(MODEL_DIR, "expense_classifier.pkl")
    if os.path.exists(clf_path):
        try:
            models["classifier"] = joblib.load(clf_path)
            print("✅ Classifier loaded")
        except Exception as e:
            print("❌ Classifier load failed:", e)
    else:
        print("⚠️ Classifier not found")

    # ---- Fraud ----
    fraud_path = os.path.join(MODEL_DIR, "isolation_forest.pkl")
    if os.path.exists(fraud_path):
        try:
            with open(fraud_path, "rb") as f:
                models["fraud"] = pickle.load(f)
            print("✅ Fraud model loaded")
        except Exception as e:
            print("❌ Fraud load failed:", e)
    else:
        print("⚠️ Fraud model not found")

    # ---- LSTM ----
    try:
        _load_lstm(models)
    except Exception as e:
        print("❌ LSTM load failed:", e)

    print("🔥 FINAL LOADED MODELS:", list(models.keys()))
    return models

ML = load_models()


def lstm_forecast_next_month(vals: list[float]):
    """Forecast next month via LSTM. Returns (forecast_rs, resid_std_rs) or None."""
    if "lstm" not in ML: return None
    meta = ML["lstm"]["meta"]; net = ML["lstm"]["net"]; torch = ML["lstm"]["torch"]
    seq_len = meta["seq_len"]
    if len(vals) < seq_len: return None

    series   = np.asarray(vals[-seq_len:], dtype=np.float64)
    log_vals = np.log1p(series)
    mu       = float(log_vals.mean()); sigma = float(log_vals.std() + 1e-6)
    z        = (log_vals - mu) / sigma
    delta    = np.concatenate([[0.0], np.diff(z)])
    roll3    = np.array([z[max(0, i - 2):i + 1].mean() for i in range(len(z))])
    months   = (np.arange(len(series)) + (len(vals) - seq_len)) % 12
    sin_m    = np.sin(2 * math.pi * months / 12)
    cos_m    = np.cos(2 * math.pi * months / 12)
    feats    = np.stack([z, delta, roll3, sin_m, cos_m], axis=1).astype(np.float32)

    with torch.no_grad():
        pred_z = float(net(torch.from_numpy(feats).unsqueeze(0)).item())
    forecast_rs = float(np.expm1(pred_z * sigma + mu))
    # residual std in z → R$ via derivative of expm1 at predicted log-level
    resid_std_rs = float(meta["resid_std_z"] * sigma * (forecast_rs + 1.0))
    return max(0.0, forecast_rs), resid_std_rs

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Smart Expense Analyzer API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
security = HTTPBearer()

# ── Helpers ───────────────────────────────────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def make_token(user_id: int) -> str:
    return jwt.encode({"sub": str(user_id), "exp": datetime.utcnow() + timedelta(days=7)}, SECRET_KEY, algorithm="HS256")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        user    = db.query(User).filter(User.id == int(payload["sub"])).first()
        if not user: raise HTTPException(401, "User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except Exception:
        raise HTTPException(401, "Invalid token")

def build_clf_features(amount, freight, payment_type, installments):
    log_price  = np.log1p(amount)
    frt_ratio  = freight / (amount + 1e-6)
    pay_enc    = [1 if payment_type == p else 0 for p in ["boleto","credit_card","debit_card","voucher"]]
    return np.array([[log_price, np.log1p(freight), np.log1p(amount+freight),
                      frt_ratio, amount/max(installments,1), installments, 12, 2, 6, 0, 0.01] + pay_enc])

def build_fraud_features(amount, freight, payment_type, installments, mean=100, std=80):
    price_z   = (amount - mean) / (std + 1e-6)
    frt_ratio = freight / (amount + 1e-6)
    pay_risk  = {"credit_card":1.0,"debit_card":0.7,"voucher":0.5,"boleto":0.3}.get(payment_type, 0.5)
    return np.array([[np.log1p(amount), np.log1p(freight), np.log1p(frt_ratio),
                      price_z, price_z, 0.01, pay_risk, 1 if installments>10 else 0, installments, 12, 2]])

def predict_category(amount, freight, payment_type, installments):
    if "classifier" not in ML: return None
    try:
        clf = ML["classifier"]; pipeline = clf["pipeline"]; le = clf["label_encoder"]
        f   = build_clf_features(amount, freight, payment_type, installments)
        n   = pipeline.n_features_in_ if hasattr(pipeline, "n_features_in_") else f.shape[1]
        if f.shape[1] < n: f = np.pad(f, ((0,0),(0, n - f.shape[1])))
        return le.inverse_transform([pipeline.predict(f[:,:n])[0]])[0]
    except Exception:
        return None

# ── Schemas ───────────────────────────────────────────────────────────────────
class SignupIn(BaseModel):
    name: str; email: str; password: str

class LoginIn(BaseModel):
    email: str; password: str

class TransactionIn(BaseModel):
    amount: float
    freight: float = 0.0
    payment_type: str = "credit_card"
    installments: int = 1
    description: Optional[str] = None

class CSVRow(BaseModel):
    amount: float
    freight: float = 0.0
    payment_type: str = "credit_card"
    installments: int = 1
    description: Optional[str] = None
    created_at: Optional[str] = None


def parse_csv_date(value: Optional[str]) -> datetime:
    """Parse common CSV date formats; fallback to now."""
    if not value:
        return datetime.utcnow()
    raw = str(value).strip()
    if not raw:
        return datetime.utcnow()

    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass

    # Handle ISO-like values, including trailing Z.
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, f"Invalid created_at format: {value}")

# ── Auth ──────────────────────────────────────────────────────────────────────
@app.post("/auth/signup", status_code=201)
def signup(body: SignupIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(400, "Email already registered")
    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    user   = User(name=body.name, email=body.email, password=hashed)
    db.add(user); db.commit(); db.refresh(user)
    return {"token": make_token(user.id), "user": {"id": user.id, "name": user.name, "email": user.email}}

@app.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not bcrypt.checkpw(body.password.encode(), user.password.encode()):
        raise HTTPException(401, "Invalid credentials")
    return {"token": make_token(user.id), "user": {"id": user.id, "name": user.name, "email": user.email}}

# ── ML Endpoints ──────────────────────────────────────────────────────────────
@app.post("/classify")
def classify(body: TransactionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if "classifier" not in ML:
        return {"message": "Classifier not available"}
    clf      = ML["classifier"]; pipeline = clf["pipeline"]; le = clf["label_encoder"]
    features = build_clf_features(body.amount, body.freight, body.payment_type, body.installments)
    n        = pipeline.n_features_in_ if hasattr(pipeline, "n_features_in_") else features.shape[1]
    if features.shape[1] < n: features = np.pad(features, ((0,0),(0, n - features.shape[1])))
    pred     = pipeline.predict(features[:,:n])[0]
    category = le.inverse_transform([pred])[0]
    proba    = pipeline.predict_proba(features[:,:n])[0].max()
    txn = Transaction(user_id=user.id, amount=body.amount, freight=body.freight,
                      payment_type=body.payment_type, installments=body.installments,
                      category=category, description=body.description)
    db.add(txn); db.commit(); db.refresh(txn)
    return {"transaction_id": txn.id, "category": category, "confidence": round(float(proba), 4)}

@app.post("/fraud-score")
def fraud_score(body: TransactionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if "fraud" not in ML:
        return {"message": "Fraud model not available"}
    fp       = ML["fraud"]
    features = build_fraud_features(body.amount, body.freight, body.payment_type, body.installments)
    try:
        raw  = fp["model"].decision_function(fp["scaler"].transform(features))
    except Exception as e:
        return {"error": "Fraud model failed", "details": str(e)}
    risk     = float((-raw[0] - fp["score_min"]) / (fp["score_max"] - fp["score_min"] + 1e-9))
    risk     = max(0.0, min(1.0, risk))
    label    = "high" if risk > 0.7 else "medium" if risk > 0.4 else "low"

    # Frequency signal: >=3 transactions in last 24h
    recent_count = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.created_at >= datetime.utcnow() - timedelta(hours=24)
    ).count()

    # Rare category signal: predicted category used < 5% of user's history
    cat_signal = "normal"
    pred_cat   = predict_category(body.amount, body.freight, body.payment_type, body.installments)
    if pred_cat:
        total = db.query(Transaction).filter(Transaction.user_id == user.id).count()
        if total >= 10:
            cat_count = db.query(Transaction).filter(
                Transaction.user_id == user.id, Transaction.category == pred_cat
            ).count()
            if cat_count / total < 0.05:
                cat_signal = "high"

    txn = db.query(Transaction).filter(
        Transaction.user_id == user.id, Transaction.amount == body.amount
    ).order_by(Transaction.created_at.desc()).first()
    if txn:
        txn.risk_score = risk; txn.risk_label = label; db.commit()

    return {
        "risk_score": round(risk, 4), "risk_label": label, "flagged": label == "high",
        "explanation": {
            "amount_signal":    "high" if body.amount > 500 else "normal",
            "freight_signal":   "high" if body.freight / (body.amount + 1e-6) > 0.5 else "normal",
            "install_signal":   "high" if body.installments > 10 else "normal",
            "payment_signal":   "high" if body.payment_type == "credit_card" else "normal",
            "frequency_signal": "high" if recent_count >= 3 else "normal",
            "category_signal":  cat_signal
        }
    }

@app.post("/expense/batch")
def batch_classify(rows: List[CSVRow], user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    results = []
    for row in rows:
        features   = build_clf_features(row.amount, row.freight, row.payment_type, row.installments)
        category   = predict_category(row.amount, row.freight, row.payment_type, row.installments) or "unknown"
        risk_score, risk_label = 0.0, "low"
        if "fraud" in ML:
            fp         = ML["fraud"]
            ff         = build_fraud_features(row.amount, row.freight, row.payment_type, row.installments)
            raw        = fp["model"].decision_function(fp["scaler"].transform(ff))
            risk_score = float(max(0.0, min(1.0, (-raw[0] - fp["score_min"]) / (fp["score_max"] - fp["score_min"] + 1e-9))))
            risk_label = "high" if risk_score > 0.7 else "medium" if risk_score > 0.4 else "low"
        txn_date = parse_csv_date(row.created_at)
        db.add(Transaction(user_id=user.id, amount=row.amount, freight=row.freight,
                           payment_type=row.payment_type, installments=row.installments,
                           category=category, risk_score=risk_score, risk_label=risk_label,
                           description=row.description, created_at=txn_date))
        results.append({"amount": row.amount, "category": category,
                        "risk_score": round(risk_score, 4), "risk_label": risk_label})
    db.commit()
    return {"processed": len(results), "results": results}

# ── Forecast (LSTM-only) ──────────────────────────────────────────────────────
@app.get("/forecast/{user_id}")
def forecast(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.id != user_id: raise HTTPException(403, "Access denied")
    txns = db.query(Transaction).filter(Transaction.user_id == user_id).all()
    monthly = defaultdict(float)
    for t in txns:
        monthly[t.created_at.strftime("%Y-%m")] += t.amount
    sorted_months = sorted(monthly.items())
    n    = len(sorted_months)
    vals = [v for _, v in sorted_months]

    if "lstm" not in ML:
        return {"forecast_next_month": None, "months_available": n,
                "message": "LSTM model not loaded. Run `python models/train_lstm.py` first."}
    seq_len = ML["lstm"]["meta"]["seq_len"]
    if n < seq_len:
        return {"forecast_next_month": None, "months_available": n,
                "message": f"Need at least {seq_len} months of data for LSTM forecast (have {n})."}

    lstm_out = lstm_forecast_next_month(vals)
    if lstm_out is None:
        return {"forecast_next_month": None, "months_available": n,
                "message": "Forecast failed. Please try again."}
    forecast_val, resid_std = lstm_out
    forecast_val = round(forecast_val, 2)

    f_lower = max(0.0, round(forecast_val - 1.28 * resid_std, 2))
    f_upper = round(forecast_val + 1.28 * resid_std, 2)

    meta  = ML["lstm"]["meta"]
    avg_3 = round(float(np.mean(vals[-3:])), 2)
    risk  = "high" if forecast_val > avg_3 * 1.2 else "medium" if forecast_val > avg_3 else "low"

    return {
        "forecast_next_month": forecast_val,
        "forecast_lower":      f_lower,
        "forecast_upper":      f_upper,
        "avg_last_3_months":   avg_3,
        "overspending_risk":   risk,
        "model_used":          "lstm",
        "confidence":          "high" if n >= 18 else "medium",
        "test_mae":            round(meta["test_mae_rs"], 2),
        "test_rmse":           round(meta["test_rmse_rs"], 2),
        "naive_mae":           round(meta["naive_mae_rs"], 2),
        "months_available":    n,
        "monthly_history":     [{"month": m, "spend": round(v, 2)} for m, v in sorted_months]
    }

# ── Dashboard ─────────────────────────────────────────────────────────────────
@app.get("/dashboard/{user_id}")
def dashboard(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.id != user_id: raise HTTPException(403, "Access denied")
    txns = db.query(Transaction).filter(Transaction.user_id == user_id).all()
    if not txns: return {"message": "No transactions found", "data": {}}
    total_spend = sum(t.amount for t in txns)
    flagged     = [t for t in txns if t.risk_label == "high"]
    cat_spend   = defaultdict(float)
    monthly     = defaultdict(float)
    for t in txns:
        if t.category: cat_spend[t.category] += t.amount
        monthly[t.created_at.strftime("%Y-%m")] += t.amount
    return {
        "summary": {
            "total_transactions": len(txns),
            "total_spend":        round(total_spend, 2),
            "flagged_count":      len(flagged),
            "avg_transaction":    round(total_spend / len(txns), 2)
        },
        "category_breakdown": [{"category": k, "amount": round(v, 2)}
                                for k, v in sorted(cat_spend.items(), key=lambda x: -x[1])],
        "monthly_trend":      [{"month": m, "spend": round(v, 2)} for m, v in sorted(monthly.items())],
        "risk_distribution":  dict(Counter(t.risk_label for t in txns if t.risk_label)),
        "flagged_transactions": [{"id": t.id, "amount": t.amount, "category": t.category,
                                   "risk_score": t.risk_score, "date": str(t.created_at.date())}
                                  for t in flagged]
    }

# ── Transactions (search + filter) ────────────────────────────────────────────
@app.get("/transactions/{user_id}")
def get_transactions(
    user_id:    int,
    user:       User    = Depends(get_current_user),
    db:         Session = Depends(get_db),
    search:     Optional[str] = Query(None),
    category:   Optional[str] = Query(None),
    risk_label: Optional[str] = Query(None),
    date_from:  Optional[str] = Query(None),
    date_to:    Optional[str] = Query(None),
    page:       int = Query(1, ge=1),
    limit:      int = Query(20, le=100),
):
    if user.id != user_id: raise HTTPException(403, "Access denied")
    q = db.query(Transaction).filter(Transaction.user_id == user_id)
    if category:   q = q.filter(Transaction.category == category)
    if risk_label: q = q.filter(Transaction.risk_label == risk_label)
    if date_from:  q = q.filter(Transaction.created_at >= datetime.strptime(date_from, '%Y-%m-%d'))
    if date_to:    q = q.filter(Transaction.created_at <= datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1))
    if search:     q = q.filter(Transaction.description.ilike(f'%{search}%'))
    total = q.count()
    txns  = q.order_by(Transaction.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit),
        "transactions": [
            {"id": t.id, "amount": t.amount, "freight": t.freight, "payment_type": t.payment_type,
             "installments": t.installments, "category": t.category, "risk_score": t.risk_score,
             "risk_label": t.risk_label, "description": t.description, "date": str(t.created_at.date())}
            for t in txns
        ]
    }

@app.get("/categories/{user_id}")
def get_categories(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.id != user_id: raise HTTPException(403, "Access denied")
    rows = db.query(Transaction.category).filter(
        Transaction.user_id == user_id, Transaction.category.isnot(None)
    ).distinct().all()
    return sorted([r[0] for r in rows])

@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": list(ML.keys())}
