import os
import json
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
import matplotlib.pyplot as plt

# =============================================
# PATH SETUP (BASED ON YOUR PROJECT STRUCTURE)
# =============================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # defense/

NDJSON_PATH = os.path.join(BASE_DIR, "../website/attempts/sessions.ndjson")

MODEL_DIR = os.path.join(BASE_DIR, "models")
SAVE_MODEL_PATH = os.path.join(MODEL_DIR, "mouse_ae.h5")

FIXED_LEN = 128

# =============================================
# 1. Load Mouse Paths from NDJSON
# =============================================
def load_mouse_paths():
    paths = []

    if not os.path.exists(NDJSON_PATH):
        print("[!] NDJSON file not found:", NDJSON_PATH)
        return paths

    print("[+] Reading NDJSON:", NDJSON_PATH)

    with open(NDJSON_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            # Remove trailing commas if present
            if line.endswith(","):
                line = line[:-1]

            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                print("[!] Skipped invalid JSON line")
                continue

            captcha = entry.get("captcha-1", {})
            if not captcha.get("completed", False):
                continue

            attempt_index = str(captcha.get("attempt", 1))
            attempt_meta = captcha.get("attempt_metadata", {})
            attempt = attempt_meta.get(attempt_index, {})

            mouse_path = attempt.get("mouse_path", [])
            if len(mouse_path) < 5:
                continue

            xy = [(p["x"], p["y"]) for p in mouse_path]
            paths.append(np.array(xy, dtype=np.float32))

    print(f"[+] Loaded {len(paths)} mouse paths")
    return paths


# =============================================
# 2. Normalize: resample every path to fixed length
# =============================================
def resample_path(path, length=FIXED_LEN):
    path = np.array(path)

    orig_idx = np.linspace(0, 1, len(path))
    target_idx = np.linspace(0, 1, length)

    x = np.interp(target_idx, orig_idx, path[:, 0])
    y = np.interp(target_idx, orig_idx, path[:, 1])

    return np.stack([x, y], axis=1)

def normalize_paths(paths):
    norm = []
    for p in paths:
        rp = resample_path(p)
        rp = (rp - rp.min(axis=0)) / (rp.max(axis=0) - rp.min(axis=0) + 1e-8)
        norm.append(rp)
    return np.array(norm, dtype=np.float32)


# =============================================
# 3. Build Autoencoder Model
# =============================================
def build_autoencoder():
    inp = layers.Input(shape=(FIXED_LEN, 2))

    x = layers.Conv1D(32, 5, padding="same", activation="relu")(inp)
    x = layers.MaxPooling1D(2)(x)

    x = layers.Conv1D(16, 5, padding="same", activation="relu")(x)
    encoded = layers.MaxPooling1D(2)(x)

    x = layers.Conv1D(16, 5, padding="same", activation="relu")(encoded)
    x = layers.UpSampling1D(2)(x)

    x = layers.Conv1D(32, 5, padding="same", activation="relu")(x)
    x = layers.UpSampling1D(2)(x)

    out = layers.Conv1D(2, 5, padding="same")(x)

    model = models.Model(inp, out)

    model.compile(
        optimizer=tf.keras.optimizers.Adam(),
        loss=tf.keras.losses.MeanSquaredError()
    )

    return model


# =============================================
# 4. Train Model (with checkpoint loading)
# =============================================
def train(epochs=20):
    mouse_paths = load_mouse_paths()
    if len(mouse_paths) == 0:
        print("[!] No training data found.")
        return

    mouse_paths = normalize_paths(mouse_paths)

    # -------------------------------
    # Load existing model if exists
    # -------------------------------
    if os.path.exists(SAVE_MODEL_PATH):
        print("[+] Loading existing AE model:", SAVE_MODEL_PATH)
        model = tf.keras.models.load_model(SAVE_MODEL_PATH)
    else:
        print("[+] Creating new AE model...")
        model = build_autoencoder()

    # -------------------------------
    # Train with history tracking
    # -------------------------------
    callback = tf.keras.callbacks.EarlyStopping(
        monitor="loss",
        patience=20,
        restore_best_weights=True
    )

    history = model.fit(
    mouse_paths, mouse_paths,
    epochs=epochs,        # high number is fine with early stopping
    batch_size=32,
    shuffle=True,
    callbacks=[callback]
)

    # Ensure model folder exists
    os.makedirs(MODEL_DIR, exist_ok=True)

    # Save updated model
    model.save(SAVE_MODEL_PATH)
    print(f"[+] Model saved → {SAVE_MODEL_PATH}")

    # ============================================
    #  PLOT TRAINING LOSS GRAPH
    # ============================================
    plt.figure(figsize=(8, 5))
    plt.plot(history.history["loss"], label="Training Loss")
    plt.title("Mouse Path Autoencoder Training Loss")
    plt.xlabel("Epochs")
    plt.ylabel("Loss (MSE)")
    plt.grid(True)
    plt.legend()

    save_plot_path = os.path.join(MODEL_DIR, "training_loss.png")
    plt.savefig(save_plot_path, dpi=200)
    # plt.show()

    print(f"[+] Training loss plot saved → {save_plot_path}")


if __name__ == "__main__":
    train(epochs=1000)
