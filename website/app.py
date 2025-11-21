# website/app.py
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import uuid, time

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

sessions = {}

MAX_ATTEMPTS = 3
CHALLENGE_TIMEOUT = 30  # seconds


@app.route("/")
def home():
    return render_template("login.html")


@app.route("/load_captcha/<cid>")
def load_captcha_template(cid):
    return render_template(f"captchas/{cid}.html")


# ---------------------------------------
# START SESSION
# ---------------------------------------
@app.route("/start_session", methods=["POST"])
def start_session():
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "attempt": 1,
        "max_attempts": MAX_ATTEMPTS,
        "attempt_metadata": {},
        "created_timestamp": time.time(),
        "completed": False,
        "final_result": None
    }
    return jsonify({"session_id": session_id, "attempt": 1})


# ---------------------------------------
# GET ATTEMPT FRAME
# ---------------------------------------
@app.route("/get_challenge/<cid>")
def get_challenge(cid):
    session_id = request.args.get("session_id")

    if not session_id or session_id not in sessions:
        return jsonify({"error": "invalid session-id"}), 400

    session = sessions[session_id]

    if session["completed"]:
        return jsonify({"error": "session already completed"}), 400

    attempt = session["attempt"]

    # Add metadata placeholder
    session["attempt_metadata"][str(attempt)] = {
        "generated_answer": None,
        "user_answer": None,
        "metrics": {},
        "status": None,
        "start_timestamp": time.time(),
        "end_timestamp": None
    }

    return jsonify({"attempt": attempt, "max_attempts": MAX_ATTEMPTS})


# ---------------------------------------
# VERIFY ATTEMPT
# ---------------------------------------
@app.route("/verify/<cid>", methods=["POST"])
def verify(cid):
    data = request.json or {}
    user_ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "unknown"
    session_id = data.get("session_id")
    user_answer = (data.get("user_answer") or "").strip().upper()
    correct_word = (data.get("correct_word") or "").strip().upper()
    status = data.get("status")  # "passed", "failed", "timeout"
    user_metrics = data.get("metrics") or {}

    session = sessions.get(session_id)
    attempt = session["attempt"]

    meta = session["attempt_metadata"].get(str(attempt))
    meta["generated_answer"] = correct_word
    meta["user_answer"] = user_answer
    meta["status"] = status
    meta["metrics"] = user_metrics
    meta["end_timestamp"] = time.time()
    meta["ip_address"] = user_ip

    if status == "passed":
        session["completed"] = True
        session["final_result"] = "passed"
        print(session)
        return jsonify({"status": "passed", "completed": True})

    session["attempt"] += 1

    if session["attempt"] > MAX_ATTEMPTS:
        session["completed"] = True
        session["final_result"] = "failed"
        print(session)
        return jsonify({"status": status, "completed": True})

    print(session)
    return jsonify({
        "status": status,
        "completed": False,
        "next_attempt": session["attempt"]
    })

# ---------------------------------------
# DOWNLOAD ALL SESSION DATA AS JSON FILE
# ---------------------------------------
@app.route("/download_sessions", methods=["GET"])
def download_sessions():
    from flask import Response
    import json
    import time

    filename = f"sessions_export_{int(time.time())}.json"

    json_data = json.dumps(sessions, indent=4)

    return Response(
        json_data,
        mimetype="application/json",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


if __name__ == "__main__":
    app.run(port=5000, debug=True)
