import os
import json
import numpy as np
import joblib
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "svm_mouse.pkl")

FIXED_LEN = 128


# ----------------------------------
# Utilities
# ----------------------------------
def resample_and_normalize(path):
    xy = np.array([(p["x"], p["y"]) for p in path], dtype=np.float32)

    orig_idx = np.linspace(0, 1, len(xy))
    tgt_idx = np.linspace(0, 1, FIXED_LEN)

    x = np.interp(tgt_idx, orig_idx, xy[:, 0])
    y = np.interp(tgt_idx, orig_idx, xy[:, 1])

    rp = np.stack([x, y], axis=1)
    rp = (rp - rp.min(axis=0)) / (rp.max(axis=0) - rp.min(axis=0) + 1e-8)

    return rp.flatten()  # shape (256,)

def extract_timestamps(obj):
    timestamps = []

    if isinstance(obj, dict):
        for v in obj.values():
            timestamps.extend(extract_timestamps(v))
    elif isinstance(obj, list):
        for item in obj:
            timestamps.extend(extract_timestamps(item))
    else:
        # verify timestamp like
        if isinstance(obj, int) and len(str(obj)) >= 10:
            timestamps.append(obj)

    return timestamps

def is_expired(timestamp_ms, limit_seconds=60):
    """
    Determine whether the given timestamp in milliseconds has exceeded the specified number of seconds.
    Returns True if expired, or False if still valid.
    """
    timestamp_s = timestamp_ms / 1000
    now = time.time()

    return (now - timestamp_s) > limit_seconds

def is_in_future(timestamp_ms, tolerance_seconds=10):
    """
    Checks whether the timestamp is significantly ahead of the current time.
    If it exceeds the tolerance_seconds threshold, it is considered invalid.
    """
    timestamp_s = timestamp_ms / 1000
    now = time.time()

    return timestamp_s > now + tolerance_seconds

def is_timestamp_sequence_valid(mouse_path):
    for i in range(1, len(mouse_path)):
        if mouse_path[i]["t"] < mouse_path[i - 1]["t"]:
            return False
    return True


# ----------------------------------
# TIMESTAMP CHECK
# ----------------------------------
def timestamp_check(metrics):
    all_ts = extract_timestamps(metrics)

    for ts in all_ts:
        if is_expired(ts):
            print("⚠ Timestamp expired:", ts)
            return False
        if is_in_future(ts):
            print("⚠ Timestamp from the future:", ts)
            return False

    return True

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
    # 0. timestamp
    if not timestamp_check(metrics):
        return {"is_human": False, "reason": "rule_failed"}
    
    if not is_timestamp_sequence_valid(metrics["mouse_path"]):
        return {"is_human": False, "reason": "rule_failed"}
    
    # 1. rules
    if not rule_based_check(metrics):
        return {"is_human": False, "reason": "rule_failed"}

    # 2. SVM model
    if svm_check(metrics["mouse_path"]):
        return {"is_human": False, "reason": "svm_outlier"}

    # 3. Passed
    return {"is_human": True, "reason": "passed"}
