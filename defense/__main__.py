"""
Heuristic classifier for CAPTCHA sessions.

Rules:
- captcha-0 solve time: bot if < 2000 ms; human if 2500-5000 ms.
- captcha-1 attempt 1: bot if any bubble_click timestamp matches a mouse_path timestamp
  or an idle_segment end time; bot if bubble_area_hover_time > 1000 ms.
Outputs label and reasons.
"""

import json
import os
import sys
from typing import Any, Dict, List, Tuple

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ATTEMPT_DIR = os.path.join(BASE_DIR,"..", "website", "attempts")


def load_session(session_id: str) -> Dict[str, Any]:
    path = os.path.join(ATTEMPT_DIR, f"{session_id}.json")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Session file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return data.get(session_id) or {}


def evaluate_rules(session: Dict[str, Any]) -> Tuple[str, List[str]]:
    reasons: List[str] = []
    bot_flags: List[str] = []
    human_flags: List[str] = []

    captcha0 = session.get("captcha-0") or {}
    total_time = captcha0.get("total_solve_time_ms")

    if isinstance(total_time, (int, float)):
        if total_time < 2000:
            bot_flags.append(f"captcha-0 solved too fast ({total_time} ms < 2000)")
        elif 2500 <= total_time <= 5000:
            human_flags.append(f"captcha-0 solve time in human band ({total_time} ms)")

    captcha1 = session.get("captcha-1") or {}
    attempt_meta = (captcha1.get("attempt_metadata") or {}).get("1") or {}

    mouse_path = attempt_meta.get("mouse_path") or []
    bubble_clicks = attempt_meta.get("bubble_clicks") or []
    idle_segments = attempt_meta.get("idle_segments") or []
    # hover_time = attempt_meta.get("bubble_area_hover_time")

    mouse_times = {pt.get("t") for pt in mouse_path if "t" in pt}
    idle_end_times = {seg.get("etime") for seg in idle_segments if "etime" in seg}

    # for click in bubble_clicks:
    #     t = click.get("t")
    #     if t is None:
    #         continue
    #     if t in mouse_times:
    #         bot_flags.append("bubble click timestamp equals mouse path timestamp")
    #     if t in idle_end_times:
    #         bot_flags.append("bubble click timestamp equals idle_segment end time")

    # if isinstance(hover_time, (int, float)) and hover_time > 1000:
    #     bot_flags.append(f"bubble_area_hover_time too high ({hover_time} ms > 1000)")

    # if bot_flags:
    #     return "bot", bot_flags
    # if human_flags:
    #     return "human", human_flags

    # reasons.extend(bot_flags + human_flags)
    # return "unknown", reasons


def classify_session(session_id: str) -> None:
    session = load_session(session_id)
    label, reasons = evaluate_rules(session)

    print(f"Session: {session_id}")
    print(f"Result: {label}")
    if reasons:
        print("Reasons:")
        for r in reasons:
            print(f"- {r}")
    else:
        print("No heuristic rules matched.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m defense <session_id>")
        sys.exit(1)
    classify_session(sys.argv[1])
