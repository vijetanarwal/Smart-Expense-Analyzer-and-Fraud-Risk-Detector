"""
Train an LSTM forecasting model on synthetic per-user monthly spend.

Why synthetic: real Olist data is platform-level totals in millions — wrong scale
for per-user prediction. We generate 2000 users × 24 months with realistic
archetypes (stable / growing / declining / seasonal / volatile) and train on
log-normalized sequences so the model learns shape, not absolute scale.

Outputs:
  models/lstm_v2.pt         model weights
  models/lstm_v2_meta.pkl   config, resid_std, test_mae_rs, naive baseline
"""
import os, pickle, math, random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

SEED       = 42
N_USERS    = 2000
N_MONTHS   = 24
SEQ_LEN    = 12
N_FEATURES = 5
HIDDEN     = 64
LAYERS     = 2
DROPOUT    = 0.2
BATCH      = 64
EPOCHS     = 60
PATIENCE   = 8
LR         = 1e-3

OUT_DIR = Path(__file__).resolve().parent
OUT_DIR.mkdir(parents=True, exist_ok=True)

random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED)


# ── Synthetic data ───────────────────────────────────────────────────────────
def gen_user_series(rng: np.random.Generator) -> np.ndarray:
    """Return N_MONTHS of monthly spend for one synthetic user."""
    archetype = rng.choice(["stable", "growing", "declining", "seasonal", "volatile"])
    base      = rng.uniform(800, 6000)

    t = np.arange(N_MONTHS)
    if archetype == "stable":
        trend = np.zeros(N_MONTHS)
        noise = rng.normal(0, 0.05, N_MONTHS)
    elif archetype == "growing":
        trend = rng.uniform(0.01, 0.04) * t
        noise = rng.normal(0, 0.07, N_MONTHS)
    elif archetype == "declining":
        trend = -rng.uniform(0.01, 0.03) * t
        noise = rng.normal(0, 0.07, N_MONTHS)
    elif archetype == "seasonal":
        trend = rng.uniform(0.005, 0.02) * t
        noise = rng.normal(0, 0.08, N_MONTHS)
    else:  # volatile
        trend = rng.uniform(-0.01, 0.02) * t
        noise = rng.normal(0, 0.18, N_MONTHS)

    season = 0.12 * np.sin(2 * math.pi * t / 12 + rng.uniform(0, 2 * math.pi))
    series = base * np.exp(trend + season + noise)

    # occasional one-off spikes
    if rng.random() < 0.3:
        spike_idx = rng.integers(0, N_MONTHS)
        series[spike_idx] *= rng.uniform(1.4, 2.2)

    return np.maximum(series, 50.0)


def build_features(series: np.ndarray, mu: float, sigma: float) -> np.ndarray:
    """5 features per timestep: z(log), delta, rolling_avg_3, sin_month, cos_month."""
    log_vals = np.log1p(series)
    z        = (log_vals - mu) / (sigma + 1e-6)
    delta    = np.concatenate([[0.0], np.diff(z)])
    roll3    = np.array([z[max(0, i - 2):i + 1].mean() for i in range(len(z))])
    months   = np.arange(len(series)) % 12
    sin_m    = np.sin(2 * math.pi * months / 12)
    cos_m    = np.cos(2 * math.pi * months / 12)
    return np.stack([z, delta, roll3, sin_m, cos_m], axis=1).astype(np.float32)


class SeqDataset(Dataset):
    def __init__(self, users):
        self.samples = []
        for series in users:
            log_vals = np.log1p(series)
            mu, sigma = float(log_vals.mean()), float(log_vals.std() + 1e-6)
            feats = build_features(series, mu, sigma)
            # target = next-month z-score of log-spend
            for i in range(len(series) - SEQ_LEN):
                x = feats[i:i + SEQ_LEN]
                y = (np.log1p(series[i + SEQ_LEN]) - mu) / sigma
                self.samples.append((x, np.float32(y), mu, sigma, series[i + SEQ_LEN]))

    def __len__(self):  return len(self.samples)
    def __getitem__(self, idx):
        x, y, mu, sigma, raw = self.samples[idx]
        return torch.from_numpy(x), torch.tensor(y), mu, sigma, raw


# ── Model ────────────────────────────────────────────────────────────────────
class ForecastLSTM(nn.Module):
    def __init__(self, n_features=N_FEATURES, hidden=HIDDEN, layers=LAYERS, dropout=DROPOUT):
        super().__init__()
        self.lstm = nn.LSTM(n_features, hidden, layers, batch_first=True,
                            dropout=dropout if layers > 1 else 0.0)
        self.head = nn.Sequential(nn.Linear(hidden, 32), nn.ReLU(), nn.Linear(32, 1))

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.head(out[:, -1, :]).squeeze(-1)


# ── Train / eval ─────────────────────────────────────────────────────────────
def main():
    rng   = np.random.default_rng(SEED)
    users = [gen_user_series(rng) for _ in range(N_USERS)]
    rng.shuffle(users)

    n_tr = int(0.7 * N_USERS); n_va = int(0.15 * N_USERS)
    tr, va, te = users[:n_tr], users[n_tr:n_tr + n_va], users[n_tr + n_va:]

    tr_ds, va_ds, te_ds = SeqDataset(tr), SeqDataset(va), SeqDataset(te)
    print(f"Samples — train {len(tr_ds)}  val {len(va_ds)}  test {len(te_ds)}")

    tr_dl = DataLoader(tr_ds, batch_size=BATCH, shuffle=True)
    va_dl = DataLoader(va_ds, batch_size=BATCH)
    te_dl = DataLoader(te_ds, batch_size=BATCH)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model  = ForecastLSTM().to(device)
    opt    = torch.optim.Adam(model.parameters(), lr=LR)
    loss_fn = nn.HuberLoss(delta=1.0)

    best_va, wait, best_state = float("inf"), 0, None
    for epoch in range(1, EPOCHS + 1):
        model.train(); tr_loss = 0.0
        for x, y, *_ in tr_dl:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss = loss_fn(model(x), y)
            loss.backward(); opt.step()
            tr_loss += loss.item() * x.size(0)
        tr_loss /= len(tr_ds)

        model.eval(); va_loss = 0.0
        with torch.no_grad():
            for x, y, *_ in va_dl:
                x, y = x.to(device), y.to(device)
                va_loss += loss_fn(model(x), y).item() * x.size(0)
        va_loss /= len(va_ds)

        print(f"epoch {epoch:02d}  train {tr_loss:.4f}  val {va_loss:.4f}")
        if va_loss < best_va - 1e-4:
            best_va, wait = va_loss, 0
            best_state    = {k: v.cpu().clone() for k, v in model.state_dict().items()}
        else:
            wait += 1
            if wait >= PATIENCE:
                print(f"Early stop @ epoch {epoch}"); break

    model.load_state_dict(best_state); model.eval()

    # Test: compute MAE in R$ vs naive-last baseline
    preds_rs, truth_rs, naive_rs, resid_z = [], [], [], []
    with torch.no_grad():
        for x, y, mu, sigma, raw in te_dl:
            x  = x.to(device)
            yh = model(x).cpu().numpy()
            mu_np    = np.asarray(mu)
            sigma_np = np.asarray(sigma)
            raw_np   = np.asarray(raw, dtype=np.float64)
            pred_rs  = np.expm1(yh * sigma_np + mu_np)
            preds_rs.extend(pred_rs.tolist())
            truth_rs.extend(raw_np.tolist())
            resid_z.extend((y.numpy() - yh).tolist())
            # naive: last z in sequence → predict same log-level as previous month
            last_z = x[:, -1, 0].cpu().numpy()
            naive_rs.extend(np.expm1(last_z * sigma_np + mu_np).tolist())

    preds_rs = np.array(preds_rs); truth_rs = np.array(truth_rs); naive_rs = np.array(naive_rs)
    test_mae_rs  = float(np.mean(np.abs(preds_rs - truth_rs)))
    test_rmse_rs = float(np.sqrt(np.mean((preds_rs - truth_rs) ** 2)))
    naive_mae_rs = float(np.mean(np.abs(naive_rs - truth_rs)))
    resid_std    = float(np.std(resid_z))  # residual std in z-space (used for CI)

    print(f"\nTest MAE   LSTM:  R$ {test_mae_rs:,.2f}")
    print(f"Test RMSE  LSTM:  R$ {test_rmse_rs:,.2f}")
    print(f"Test MAE   Naive: R$ {naive_mae_rs:,.2f}")
    print(f"Improvement vs naive: {(1 - test_mae_rs / naive_mae_rs) * 100:.1f}%")
    print(f"Residual std (z-space): {resid_std:.4f}")

    torch.save(model.state_dict(), OUT_DIR / "lstm_v2.pt")
    with open(OUT_DIR / "lstm_v2_meta.pkl", "wb") as f:
        pickle.dump({
            "seq_len":      SEQ_LEN,
            "n_features":   N_FEATURES,
            "hidden":       HIDDEN,
            "layers":       LAYERS,
            "dropout":      DROPOUT,
            "resid_std_z":  resid_std,
            "test_mae_rs":  test_mae_rs,
            "test_rmse_rs": test_rmse_rs,
            "naive_mae_rs": naive_mae_rs,
        }, f)
    print(f"\nSaved → {OUT_DIR}/lstm_v2.pt  and  lstm_v2_meta.pkl")


if __name__ == "__main__":
    main()
