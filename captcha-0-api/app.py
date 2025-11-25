from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import uuid, random, time, os


app = Flask(__name__)
CORS(app)

CID = "0"
CHALLENGES = {}
ASSET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")

SCENES = [
    {
        "asset": "a3c1f7d2.svg",
        "statement": "Verify: The image shows an orange chair beside a small brown table against a teal wall.",
        "is_true": True
    },
    {
        "asset": "b9e4a6c8.svg",
        "statement": "Verify: The photo shows a white keyboard with a brown coffee mug on top of a dark desk.",
        "is_true": True
    },
    {
        "asset": "c7d3e1a9.svg",
        "statement": "Verify: Two yellow kayaks float on a blue lake with gray mountains behind them.",
        "is_true": True
    },
    {
        "asset": "d5b8f2c4.svg",
        "statement": "Verify: The picture shows two cats sitting following one another towards the right",
        "is_true": False
    },
    {
        "asset": "e2f6a7b1.svg",
        "statement": "Verify: The image shows a yellow school bus driving down a road.",
        "is_true": False
    }
]


@app.route("/get_challenge")
def get_challenge():
    session_id = request.args.get("sessionId")
    if not session_id:
        return jsonify({"error": "sessionId required"}), 400

    choice = random.choice(SCENES)
    challenge_id = str(uuid.uuid4())

    CHALLENGES[challenge_id] = {
        "cid": CID,
        "sessionId": session_id,
        "expected": choice["is_true"],
        "ts": time.time()
    }

    image_url = f"{request.host_url.rstrip('/')}/assets/{choice['asset']}"

    return jsonify({
        "challengeId": challenge_id,
        "prompt": choice["statement"],
        "imageUrl": image_url,
        "cid": CID
    })


@app.route("/verify", methods=["POST"])
def verify():
    data = request.json or {}
    challenge_id = data.get("challengeId")
    answer_raw = data.get("answer")

    if isinstance(answer_raw, bool):
        answer = answer_raw
    else:
        # allow string "true"/"false"
        answer = str(answer_raw).strip().lower() == "true"

    if not challenge_id or challenge_id not in CHALLENGES:
        return jsonify({"error": "invalid challengeId"}), 400

    expected = CHALLENGES[challenge_id]["expected"]
    # one-time use
    CHALLENGES.pop(challenge_id, None)

    ok = (answer is expected)

    return jsonify({"status": "passed" if ok else "failed"})


@app.route("/assets/<path:filename>")
def serve_asset(filename):
    return send_from_directory(ASSET_DIR, filename, mimetype="image/svg+xml")


if __name__ == "__main__":
    app.run(port=5054, debug=True)
