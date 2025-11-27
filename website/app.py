# website/app.py
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import uuid, time, os, json
from defense import run_defense

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

sessions = {}
locked_ips = {}

MAX_ATTEMPTS = 3
CHALLENGE_TIMEOUT = 30  # seconds
LOCKIN_PERIOD = 15 # minutes
ATTEMPT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "attempts")


def extract_attempt_snapshot(telemetry: dict, attempt_number: int) -> dict:
    """Pull the telemetry bucket for a specific attempt (or the latest one)."""
    attempts = (telemetry or {}).get("captcha1_attempts") or []
    chosen = next((a for a in attempts if a.get("attempt") == attempt_number), attempts[-1] if attempts else None)
    if not chosen:
        return {}

    keep_fields = [
        "attempt", "mouse_moves", "clicks", "startedAt", "endedAt",
        "result", "time_taken_ms", "challengeId", "randomTokens",
        "selectedTokens", "challengeStartTs",
        "mouse_path", "bubble_clicks", "normal_clicks", "idle_segments",
        "captcha_canvas_hover_time", "submit_button_hover_time", "bubble_area_hover_time"
    ]
    return {k: chosen.get(k) for k in keep_fields if k in chosen}


def format_captcha0_from_telemetry(telemetry: dict) -> dict:
    bucket = (telemetry or {}).get("captcha0") or {}
    start = bucket.get("startedAt")
    end = bucket.get("endedAt") or bucket.get("firstChoiceTs") or (telemetry or {}).get("collectedAt")

    return {
        "challenge_start_time": start,
        "challenge_end_time": end,
        "mouse_path": bucket.get("mouse_path") or [],
        "normal_clicks": bucket.get("normal_clicks") or [],
        "bubble_clicks": bucket.get("bubble_clicks") or [],
        "idle_segments": bucket.get("idle_segments") or [],
        "total_solve_time_ms": bucket.get("time_taken_ms"),
        "status": bucket.get("result"),
        "captcha_canvas_hover_time": bucket.get("captcha_canvas_hover_time"),
        "submit_button_hover_time": bucket.get("submit_button_hover_time"),
        "bubble_area_hover_time": bucket.get("bubble_area_hover_time"),
    }


def format_attempt_entry(attempt_number: int, meta: dict) -> dict:
    telemetry = meta.get("telemetry") or {}
    start = meta.get("challenge_start_time_ms") or telemetry.get("challengeStartTs") or telemetry.get("startedAt")
    end = meta.get("challenge_end_time_ms") or telemetry.get("endedAt")

    if not meta.get("challenge_end_time_ms") and end:
        meta["challenge_end_time_ms"] = end

    total_time = meta.get("total_duration_ms") or telemetry.get("time_taken_ms")
    if not total_time and start and end:
        total_time = end - start

    return {
        "challenge_start_time": start,
        "challenge_end_time": end,
        "mouse_path": telemetry.get("mouse_path") or [],
        "normal_clicks": telemetry.get("normal_clicks") or [],
        "bubble_clicks": telemetry.get("bubble_clicks") or [],
        "idle_segments": telemetry.get("idle_segments") or [],
        "total_solve_time_ms": total_time,
        "status": meta.get("status"),
        "captcha_canvas_hover_time": telemetry.get("captcha_canvas_hover_time"),
        "submit_button_hover_time": telemetry.get("submit_button_hover_time"),
        "bubble_area_hover_time": telemetry.get("bubble_area_hover_time")
    }


def format_session_for_export(session: dict) -> dict:
    """Shape a session into the required export template."""
    attempts = session.get("attempt_metadata") or {}
    attempt_entries = {
        str(num): format_attempt_entry(int(num), meta)
        for num, meta in attempts.items()
    }

    captcha1_block = {
        "attempt": len(attempt_entries),
        "max_attempts": session.get("max_attempts"),
        "final_result": session.get("final_result"),
        "completed": session.get("completed"),
        "attempt_metadata": attempt_entries
    }

    return {
        session.get("session_id"): {
            "completed": session.get("completed"),
            "ip_address": session.get("ip_address"),
            "device": session.get("device"),
            "captcha-0": session.get("captcha0") or {},
            "captcha-1": captcha1_block
        }
    }


def persist_session_to_disk(session_id: str, data: dict):
    """Write completed session to disk for local inspection."""
    try:
        os.makedirs(ATTEMPT_DIR, exist_ok=True)
        export_ready = format_session_for_export(data)
        # per-session file
        per_path = os.path.join(ATTEMPT_DIR, f"{session_id}.json")
        with open(per_path, "w", encoding="utf-8") as f:
            json.dump(export_ready, f, indent=2)
        # append to rolling log (ndjson)
        log_path = os.path.join(ATTEMPT_DIR, "sessions.ndjson")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"session_id": session_id, **export_ready.get(session_id, {})}) + "\n")
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
    telemetry = data.get("telemetry")

    session = sessions.get(session_id)
    if not session:
        return jsonify({"error": "invalid session-id"}), 400

    attempt = session["attempt"]

    meta = session["attempt_metadata"].setdefault(int(attempt), {})
    meta["status"] = status
    meta["user_answer"] = user_answer
    meta["challenge_end_time_ms"] = int(time.time() * 1000)
    if telemetry:
        # keep device fingerprint once at the session level to avoid duplicating it per attempt
        if telemetry.get("device") and "device" not in session:
            session["device"] = telemetry.get("device")

        # capture captcha-0 metrics once per session
        if "captcha0" not in session:
            session["captcha0"] = format_captcha0_from_telemetry(telemetry)

        # store attempt-level telemetry focused on this attempt only
        meta["telemetry"] = extract_attempt_snapshot(telemetry, attempt)
    meta["result_from_backend"] = status

    # CASE: CAPTCHA PASSED
    if status == "passed":
        session["completed"] = True
        session["final_result"] = "passed"
        session["completed_timestamp_ms"] = int(time.time() * 1000)
        session["total_duration_ms"] = session["completed_timestamp_ms"] - session.get("created_timestamp_ms", int(time.time() * 1000))

        print("SESSION FINISHED:", session)

        persist_session_to_disk(session_id, session)

        is_human = run_defense(meta["telemetry"])['is_human']

        return jsonify({
            "status": "passed",
            "completed": True,
            "session_final_result": session.get("final_result"),
            "is_human": is_human
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

        return jsonify({
            "status": status,
            "completed": True,
            "session_final_result": session.get("final_result")
        })

    print("ATTEMPT FAILED:", session)

    return jsonify({
        "status": status,
        "completed": False,
        "next_attempt": session["attempt"],
        "session_final_result": session.get("final_result")
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
    app.run(port=5001, debug=True)
