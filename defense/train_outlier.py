import os
import json
import numpy as np
import joblib
from sklearn.svm import OneClassSVM

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
NDJSON_PATH = os.path.join(BASE_DIR, "../website/attempts/sessions.ndjson")

MODEL_DIR = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "svm_mouse.pkl")

FIXED_LEN = 128


# -----------------------------
# Load Mouse Paths
# -----------------------------
def load_mouse_paths():
    paths = []

    if not os.path.exists(NDJSON_PATH):
        print("[!] NDJSON missing:", NDJSON_PATH)
        return paths

    with open(NDJSON_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            try:
                entry = json.loads(line)
            except:
                continue

            captcha = entry.get("captcha-1", {})
            if not captcha.get("completed", False):
                continue

            attempts = captcha.get("attempt_metadata", {})
            attempt = attempts.get(str(captcha.get("attempt", 1)), {})

            mouse_path = attempt.get("mouse_path", [])
            if len(mouse_path) < 5:
                continue

            xy = np.array([(p["x"], p["y"]) for p in mouse_path], dtype=np.float32)
            paths.append(xy)

    print(f"[+] Loaded {len(paths)} human paths")
    return paths


# -----------------------------
# Resample to FIXED_LEN
# -----------------------------
def resample(path):
    orig_idx = np.linspace(0, 1, len(path))
    tgt_idx = np.linspace(0, 1, FIXED_LEN)

    x = np.interp(tgt_idx, orig_idx, path[:, 0])
    y = np.interp(tgt_idx, orig_idx, path[:, 1])

    return np.stack([x, y], axis=1)


# -----------------------------
# Normalize to 0–1
# -----------------------------
def normalize(p):
    return (p - p.min(axis=0)) / (p.max(axis=0) - p.min(axis=0) + 1e-8)


# -----------------------------
# Train One-Class SVM
# -----------------------------
def train():
    paths = load_mouse_paths()
    if len(paths) == 0:
        print("[!] No data found")
        return

    X = []

    for p in paths:
        rp = resample(p)
        rp = normalize(rp)
        X.append(rp.flatten())  # Flatten (128,2) → (256,)

    X = np.array(X)

    print("[+] Training One-Class SVM …")
    model = OneClassSVM(kernel="rbf", gamma="auto", nu=0.05)
    model.fit(X)

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model, MODEL_PATH)

    print(f"[+] SVM model saved → {MODEL_PATH}")


if __name__ == "__main__":
    train()
