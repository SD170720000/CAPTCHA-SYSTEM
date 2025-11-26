# website/app.py
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import uuid, time, os, json

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

sessions = {}
locked_ips = {}

MAX_ATTEMPTS = 3
CHALLENGE_TIMEOUT = 30  # seconds
LOCKIN_PERIOD = 15 # minutes
ATTEMPT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "attempts")

def persist_session_to_disk(session_id: str, data: dict):
    """Write completed session to disk for local inspection."""
    try:
        os.makedirs(ATTEMPT_DIR, exist_ok=True)
        # per-session file
        per_path = os.path.join(ATTEMPT_DIR, f"{session_id}.json")
        with open(per_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        # append to rolling log (ndjson)
        log_path = os.path.join(ATTEMPT_DIR, "sessions.ndjson")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"session_id": session_id, **data}) + "\n")
    except Exception as e:
        print("persist_session_to_disk failed:", e)


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
    user_ip = request.headers.get("X-Forwarded-For", request.remote_addr) or "unknown"

    if user_ip != "unknown" and user_ip in locked_ips:
        if time.time() < locked_ips[user_ip]:
            remaining = int(locked_ips[user_ip] - time.time())

            return jsonify({
                "error": "locked",
                "retry_after_seconds": remaining
            }), 403
        else:
            # auto unlock
            locked_ips.pop(user_ip, None)

    session_id = str(uuid.uuid4())

    sessions[session_id] = {
        "session_id": session_id,
        "attempt": 1,
        "max_attempts": MAX_ATTEMPTS,
        "attempt_metadata": {},
        "created_timestamp_ms": int(time.time() * 1000),
        "completed": False,
        "final_result": None,
        "ip_address": user_ip
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
    session["attempt_metadata"][attempt] = {
        "status": None,
        "challenge_start_time_ms": int(time.time() * 1000),
        "challenge_end_time_ms": None
    }

    return jsonify({"attempt": attempt, "max_attempts": MAX_ATTEMPTS})


# ---------------------------------------
# VERIFY ATTEMPT
# ---------------------------------------
@app.route("/verify/<cid>", methods=["POST"])
def verify(cid):
    data = request.json or {}
    session_id = data.get("session_id")
    status = data.get("status")
    user_answer = data.get("user_answer")

    session = sessions.get(session_id)
    if not session:
        return jsonify({"error": "invalid session-id"}), 400

    attempt = session["attempt"]

    meta = session["attempt_metadata"].setdefault(int(attempt), {})
    meta["status"] = status
    meta["user_answer"] = user_answer
    meta["challenge_end_time_ms"] = int(time.time() * 1000)

    # CASE: CAPTCHA PASSED
    if status == "passed":
        session["completed"] = True
        session["final_result"] = "passed"
        session["completed_timestamp_ms"] = int(time.time() * 1000)
        session["total_duration_ms"] = session["completed_timestamp_ms"] - session.get("created_timestamp_ms", int(time.time() * 1000))

        print("SESSION FINISHED:", session)

        persist_session_to_disk(session_id, session)

        return jsonify({
            "status": "passed",
            "completed": True
        })

    # FAILED
    session["attempt"] += 1

    if session["attempt"] > MAX_ATTEMPTS:
        session["completed"] = True
        session["final_result"] = "failed"
        session["completed_timestamp_ms"] = int(time.time() * 1000)
        session["total_duration_ms"] = session["completed_timestamp_ms"] - session.get("created_timestamp_ms", int(time.time() * 1000))
        locked_ips[session["ip_address"]] = time.time() + LOCKIN_PERIOD * 60

        print("SESSION FAILED:", session)

        persist_session_to_disk(session_id, session)

        return jsonify({"status": status, "completed": True})

    print("ATTEMPT FAILED:", session)

    return jsonify({
        "status": status,
        "completed": False,
        "next_attempt": session["attempt"]
    })


# ---------------------------------------
# EXPORT
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
