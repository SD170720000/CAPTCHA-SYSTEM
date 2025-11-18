# captcha2_api/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import uuid, random, time

app = Flask(__name__)
CORS(app)
CHALLENGES = {}
CID = "2"
WORDS = ["APPLE","BANANA","ORANGE","GRAPE","MANGO","PEACH"]

@app.route("/get_challenge")
def get_challenge():
    session_id = request.args.get("sessionId")
    if not session_id:
        return jsonify({"error":"sessionId required"}),400
    w = random.choice(WORDS)
    challenge_id = str(uuid.uuid4())
    CHALLENGES[challenge_id] = {"cid":CID,"sessionId":session_id,"answer":w,"ts":time.time()}
    return jsonify({"challengeId":challenge_id,"prompt":f"Type the word: {w}"})

@app.route("/verify", methods=["POST"])
def verify():
    data = request.json or {}
    cid = data.get("challengeId")
    ans = (data.get("answer") or "").strip().upper()
    if not cid or cid not in CHALLENGES:
        return jsonify({"error":"invalid challengeId"}),400
    ok = (ans == CHALLENGES[cid]["answer"])
    return jsonify({"status":"passed" if ok else "failed"})

if __name__ == "__main__":
    app.run(port=5056, debug=True)
