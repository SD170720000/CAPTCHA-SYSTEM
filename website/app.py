from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import uuid, random, string, time

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

# In-memory session & challenge stores (demo only)
sessions = {}
challenges = {}

# Threshold policy
REQUIRED_PASS_COUNT = 2

# Available captcha IDs (can extend)
AVAILABLE_CAPTCHAS = [
    "1",
    # "2"
]

# --- Pages ---
@app.route("/")
def home():
    return render_template("login.html")

@app.route("/load_captcha/<cid>")
def load_captcha_template(cid):
    # Return the HTML fragment for captcha <cid>
    return render_template(f"captchas/{cid}.html")

# --- Session control ---
@app.route("/start_session", methods=["POST"])
def start_session():
    session_id = str(uuid.uuid4())
    seq = AVAILABLE_CAPTCHAS.copy()
    random.shuffle(seq)
    sessions[session_id] = {
        "sequence": seq,
        "index": 0,
        "results": {},
        "created": time.time()
    }
    return jsonify({"sessionId": session_id, "sequence": seq})

@app.route("/record_result", methods=["POST"])
def record_result():
    data = request.json or {}
    session_id = data.get("sessionId")
    cid = data.get("cid")
    status = data.get("status")
    if not session_id or session_id not in sessions:
        return jsonify({"error": "invalid sessionId"}), 400
    if cid not in AVAILABLE_CAPTCHAS or status not in ("passed", "failed"):
        return jsonify({"error": "invalid payload"}), 400

    sessions[session_id]["results"][cid] = status
    idx = sessions[session_id]["index"]
    seq = sessions[session_id]["sequence"]
    # advance index if matches current
    if idx < len(seq) and seq[idx] == cid:
        sessions[session_id]["index"] = idx + 1
    return jsonify({"ok": True, "results": sessions[session_id]["results"], "index": sessions[session_id]["index"]})

@app.route("/session_status")
def session_status():
    sid = request.args.get("sessionId")
    if not sid or sid not in sessions:
        return jsonify({"error":"invalid"}), 400
    s = sessions[sid]
    return jsonify({"index": s["index"], "sequence": s["sequence"], "results": s["results"]})

@app.route("/final_result", methods=["POST"])
def final_result():
    data = request.json or {}
    session_id = data.get("sessionId")
    if not session_id or session_id not in sessions:
        return jsonify({"error":"invalid sessionId"}), 400
    results = sessions[session_id]["results"]
    passed_count = sum(1 for v in results.values() if v == "passed")
    decision = "human" if passed_count >= REQUIRED_PASS_COUNT else "ai"
    return jsonify({"decision": decision, "passed_count": passed_count, "results": results})

# --- Demo challenge endpoints (these are easy to replace with separate captcha APIs later) ---

@app.route("/get_challenge/<cid>")
def get_challenge(cid):
    session_id = request.args.get("sessionId")
    if not session_id or session_id not in sessions:
        return jsonify({"error":"invalid sessionId"}), 400

    if cid == "1":
        # falling letters: 4-6 uppercase word
        word = ''.join(random.choices(string.ascii_uppercase, k=random.randint(4,6)))
        challenge_id = str(uuid.uuid4())
        challenges[challenge_id] = {"cid": cid, "sessionId": session_id, "answer": word, "ts": time.time()}
        return jsonify({"challengeId": challenge_id, "word": word})
    elif cid == "2":
        # text prompt/simple typing captcha
        word = random.choice(["APPLE","BANANA","ORANGE","GRAPE"])
        challenge_id = str(uuid.uuid4())
        challenges[challenge_id] = {"cid": cid, "sessionId": session_id, "answer": word, "ts": time.time()}
        return jsonify({"challengeId": challenge_id, "prompt": f"Type the word: {word}", "word": word})
    else:
        return jsonify({"error":"unknown cid"}), 404

@app.route("/verify/<cid>", methods=["POST"])
def verify(cid):
    data = request.json or {}
    challenge_id = data.get("challengeId")
    answer = (data.get("answer") or "").strip().upper()
    session_id = data.get("sessionId")
    if not (challenge_id and session_id):
        return jsonify({"error":"challengeId and sessionId required"}), 400
    if challenge_id not in challenges:
        return jsonify({"error":"invalid challengeId"}), 400

    ch = challenges[challenge_id]
    expected = ch["answer"].upper()
    passed = (answer == expected)
    return jsonify({"status":"passed" if passed else "failed", "expected": expected})

if __name__ == "__main__":
    app.run(port=5000, debug=True)
