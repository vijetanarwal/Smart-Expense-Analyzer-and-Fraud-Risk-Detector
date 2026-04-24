# 💸 Smart Expense Analyzer & Fraud Risk Detector

An AI-powered full-stack financial analytics system that classifies expenses, detects fraudulent transactions, and forecasts future spending.

---

## 🚀 Features

* 🔍 **Expense Classification** – Categorizes transactions using a trained ML model
* 🚨 **Fraud Detection** – Detects anomalies using Isolation Forest
* 📈 **Spending Forecast** – Predicts future expenses using LSTM
* 📊 **Dashboard Analytics** – Visual insights of user spending
* 🔐 **Authentication System** – Secure login/signup with JWT

---

<img width="880" height="522" alt="image" src="https://github.com/user-attachments/assets/d89c6cf5-9322-40c1-b5ad-f4aad32c0903" />


## 🛠️ Tech Stack

**Frontend:** React (Vite)
**Backend:** FastAPI
**Database:** PostgreSQL (Render)
**ML Models:** Scikit-learn, PyTorch
**Deployment:**

* Backend → Render
* Frontend → Vercel

---

## 🌐 Live Demo

* 🔗 Frontend: https://smart-expense-analyzer-and-fraud-ri.vercel.app/
* 🔗 Backend API: https://expense-backend-c63k.onrender.com/docs

---

## 📂 Project Structure

```
project-root/
│
├── backend/          # FastAPI backend
├── frontend/         # React frontend
├── models/           # ML models (.pkl, .pt)
├── requirements.txt
└── README.md
```

---

## ⚙️ Setup Instructions

### 1️⃣ Clone repo

```bash
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

---

### 2️⃣ Backend setup

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

---

### 3️⃣ Frontend setup

```bash
cd frontend
npm install
npm run dev
```

---

### 4️⃣ Environment Variables

Create `.env` file:

```
DATABASE_URL=your_postgres_url
SECRET_KEY=your_secret_key
```

---

## 🧠 ML Models

* **Classifier:** Expense category prediction
* **Fraud Model:** Isolation Forest for anomaly detection
* **LSTM Model:** Time-series forecasting
---

## 📌 Future Improvements

* Use real-world financial datasets
* Improve model accuracy
* Add explainability (why fraud detected)
* Enhance UI/UX


## ⭐ If you like this project, give it a star!
