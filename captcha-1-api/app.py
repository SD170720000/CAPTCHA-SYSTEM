# captcha1_api/app.py
from flask import Flask, jsonify, request
from flask_cors import CORS
import random, string, uuid, time

app = Flask(__name__)
CORS(app)

CHALLENGES = {}  # challengeId -> {cid, sessionId, answer, ts}
CID = "1"

@app.route("/get_challenge")
def get_challenge():
    session_id = request.args.get("sessionId")
    if not session_id:
        return jsonify({"error":"sessionId required"}), 400
    # 4-character alphanumeric word
    word = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    challenge_id = str(uuid.uuid4())
    CHALLENGES[challenge_id] = {"sessionId": session_id, "answer": word, "ts": time.time()}
    return jsonify({"challengeId": challenge_id, "word": word})


@app.route("/verify", methods=["POST"])
def verify():
    data = request.json or {}
    challenge_id = data.get("challengeId")
    answer = (data.get("answer") or "").strip().upper()
    if not challenge_id or challenge_id not in CHALLENGES:
        return jsonify({"error":"invalid challengeId"}), 400
    expected = CHALLENGES[challenge_id]["answer"].upper()
    passed = (answer == expected)
    return jsonify({"status": "passed" if passed else "failed"})

if __name__ == "__main__":
    app.run(port=5055, debug=True)
