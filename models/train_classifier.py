import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split

# ---- Dummy dataset (replace later with real CSV if you want) ----
data = pd.DataFrame({
    "amount": [100, 500, 2000, 150, 3000, 700, 120, 2500],
    "freight": [10, 20, 100, 5, 150, 30, 8, 120],
    "payment_type": ["credit_card", "debit_card", "credit_card", "voucher",
                     "credit_card", "boleto", "debit_card", "credit_card"],
    "installments": [1, 2, 5, 1, 10, 3, 1, 8],
    "category": ["food", "shopping", "electronics", "food",
                 "electronics", "shopping", "food", "electronics"]
})

# ---- Feature engineering ----
def build_features(df):
    df = df.copy()
    df["log_amount"] = np.log1p(df["amount"])
    df["log_freight"] = np.log1p(df["freight"])
    df["total"] = df["amount"] + df["freight"]
    df["ratio"] = df["freight"] / (df["amount"] + 1e-6)

    # one-hot encoding
    df = pd.get_dummies(df, columns=["payment_type"])

    return df

df = build_features(data)

X = df.drop("category", axis=1)
y = df["category"]

# ---- Encode labels ----
le = LabelEncoder()
y_encoded = le.fit_transform(y)

# ---- Train model ----
model = RandomForestClassifier(n_estimators=50, random_state=42)
model.fit(X, y_encoded)

# ---- Save pipeline ----
joblib.dump({
    "pipeline": model,
    "label_encoder": le
}, "expense_classifier.pkl")

print("✅ Classifier trained & saved!")