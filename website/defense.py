import os
import json
import numpy as np
import joblib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "svm_mouse.pkl")

FIXED_LEN = 128


# ----------------------------------
# Utilities
# ----------------------------------
def resample_and_normalize(path):
    if len(path) < 5:
        return None

    xy = np.array([(p["x"], p["y"]) for p in path], dtype=np.float32)

    orig_idx = np.linspace(0, 1, len(xy))
    tgt_idx = np.linspace(0, 1, FIXED_LEN)

    x = np.interp(tgt_idx, orig_idx, xy[:, 0])
    y = np.interp(tgt_idx, orig_idx, xy[:, 1])

    rp = np.stack([x, y], axis=1)
    rp = (rp - rp.min(axis=0)) / (rp.max(axis=0) - rp.min(axis=0) + 1e-8)

    return rp.flatten()  # shape (256,)


# ----------------------------------
# RULE-BASED
# ----------------------------------
def rule_based_check(metrics):
    clicks = metrics.get("bubble_clicks", [])
    mouse_path = metrics.get("mouse_path", [])
    solve_ms = metrics.get("total_solve_time_ms", 99999)

    # must click 4 bubbles
    if len(clicks) != 4:
        return False

    if len(mouse_path) <= 100:
        return False
    
    # must not solve too fast (<24.5 sec)
    if solve_ms / 1000 < 24.5:
        return False

    return True


# ----------------------------------
# ML CHECK (SVM)
# ----------------------------------
def svm_check(mouse_path):
    if not os.path.exists(MODEL_PATH):
        return False  # fallback

    model = joblib.load(MODEL_PATH)

    arr = resample_and_normalize(mouse_path)
    if arr is None:
        return True  # treat invalid path as bot

    pred = model.predict([arr])[0]  # +1 = human, -1 = bot
    return pred == -1  # True = outlier/bot


# ----------------------------------
# FINAL DEFENSE
# ----------------------------------
def run_defense(metrics):
    # 1. rules
    if not rule_based_check(metrics):
        return {"is_human": False, "reason": "rule_failed"}

    # 2. SVM model
    if svm_check(metrics["mouse_path"]):
        return {"is_human": False, "reason": "svm_outlier"}

    # 3. Passed
    return {"is_human": True, "reason": "passed"}
