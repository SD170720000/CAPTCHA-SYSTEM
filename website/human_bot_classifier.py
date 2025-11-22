from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any


@dataclass
class BehaviourMetrics:
    """
    All time-related values are in milliseconds.

    Fields to be sent from captcha JS → backend:

    - reaction_time_mean_ms:   mean time from challenge shown to first interaction
    - solve_time_std_ms:       std dev of total solve time across recent solves
    - interkey_interval_std_ms:std dev of time between keystrokes
    - path_entropy:            entropy of mouse path (0–1 range is typical)
    - velocity_std_px_per_s:   std dev of mouse velocity (px/s)
    - click_offset_avg_px:     average distance of click from target centre
    - hover_dwell_avg_ms:      average hover time before click
    - backspace_count:         count of backspace / corrections during solve
    - solve_entropy:           entropy across solve times / patterns
    - entry_points_unique:     distinct pointer entry positions at viewport edge
    - focus_change_events:     number of blur/focus changes during solve
    - swipe_accel_var:         variance of swipe acceleration (mobile)
    - pause_variance_ms:       variance of pauses between actions
    - pressure_std:            std dev of key/touch pressure
    - fingerprint_entropy:     entropy over IP / UA / fingerprint across sessions
    - overall_variance_score:  custom “overall variability” score you compute
    """

    reaction_time_mean_ms: Optional[float] = None
    solve_time_std_ms: Optional[float] = None
    interkey_interval_std_ms: Optional[float] = None
    path_entropy: Optional[float] = None
    velocity_std_px_per_s: Optional[float] = None
    click_offset_avg_px: Optional[float] = None
    hover_dwell_avg_ms: Optional[float] = None
    backspace_count: Optional[int] = None
    solve_entropy: Optional[float] = None
    entry_points_unique: Optional[int] = None
    focus_change_events: Optional[int] = None
    swipe_accel_var: Optional[float] = None
    pause_variance_ms: Optional[float] = None
    pressure_std: Optional[float] = None
    fingerprint_entropy: Optional[float] = None
    overall_variance_score: Optional[float] = None  


# Behaviour thresholds 
# Times are in ms, distances in px, entropy values dimensionless 0–? range

THRESHOLDS = {
    # "Mean reaction time > 1s = human-like"
    "reaction_time_mean_ms": 1000.0,

    # "Std deviation > 2s indicates human variability"
    "solve_time_std_ms": 2000.0,

    # "Inter-key std dev > 40 ms = human"
    "interkey_interval_std_ms": 40.0,

    # "Path entropy > 0.6 = human"
    "path_entropy": 0.6,

    # "Velocity SD > 20 px/s = human"
    "velocity_std_px_per_s": 20.0,

    # "Average click offset > 2 px = human"
    "click_offset_avg_px": 2.0,

    # "Average dwell time > 200 ms = human"
    "hover_dwell_avg_ms": 200.0,

    # ">0 backspaces per solve = human"
    "backspace_count": 1,

    # "Entropy across sessions > 0.5 = human"
    "solve_entropy": 0.5,

    # "Unique entry points > 3 = human"
    "entry_points_unique": 3,

    # "Focus change events ≥ 1 = human"
    "focus_change_events": 1,

    # "Swipe acceleration variance > 0.2 = human"
    "swipe_accel_var": 0.2,

    # "Mean pause variance > 100 ms = human"
    "pause_variance_ms": 100.0,

    # "Pressure std dev > 0.05 = human"
    "pressure_std": 0.05,

    # "Entropy > 1.0 across 5 sessions = human"
    "fingerprint_entropy": 1.0,

    # "High inter-trial variance = human"
    # we assume > 0.5 is “high”.
    "overall_variance_score": 0.5,
}


def _feature_rules() -> Dict[str, Any]:
    """
    Return per-feature functions that decide if a metric looks human-like.
    Each function receives (value) and must return True/False.
    """
    t = THRESHOLDS

    return {
        "reaction_time_mean_ms": lambda v: v > t["reaction_time_mean_ms"],
        "solve_time_std_ms": lambda v: v > t["solve_time_std_ms"],
        "interkey_interval_std_ms": lambda v: v > t["interkey_interval_std_ms"],
        "path_entropy": lambda v: v > t["path_entropy"],
        "velocity_std_px_per_s": lambda v: v > t["velocity_std_px_per_s"],
        "click_offset_avg_px": lambda v: v > t["click_offset_avg_px"],
        "hover_dwell_avg_ms": lambda v: v > t["hover_dwell_avg_ms"],
        "backspace_count": lambda v: v >= t["backspace_count"],
        "solve_entropy": lambda v: v > t["solve_entropy"],
        "entry_points_unique": lambda v: v > t["entry_points_unique"],
        "focus_change_events": lambda v: v >= t["focus_change_events"],
        "swipe_accel_var": lambda v: v > t["swipe_accel_var"],
        "pause_variance_ms": lambda v: v > t["pause_variance_ms"],
        "pressure_std": lambda v: v > t["pressure_std"],
        "fingerprint_entropy": lambda v: v > t["fingerprint_entropy"],
        "overall_variance_score": lambda v: v > t["overall_variance_score"],
    }


def evaluate_behaviour(metrics: BehaviourMetrics) -> Dict[str, Any]:
    """
    Evaluate the given metrics and return a classification.

    Returns a dict:
    {
      "is_human": bool,
      "score": float,              # 0.0–1.0 fraction of human-like features
      "human_like_count": int,
      "observed_feature_count": int,
      "per_feature": { name: { "value": ..., "human_like": True/False/None } }
    }

    Any metric that is None or missing is ignored (counts as "not observed").
    """
    rules = _feature_rules()
    metrics_dict = asdict(metrics)

    per_feature: Dict[str, Dict[str, Any]] = {}
    human_like_count = 0
    observed_count = 0

    for name, rule in rules.items():
        value = metrics_dict.get(name)

        if value is None:
            per_feature[name] = {
                "value": None,
                "human_like": None,  # not observed
                "threshold": THRESHOLDS[name],
            }
            continue

        observed_count += 1
        is_human_like = bool(rule(value))
        if is_human_like:
            human_like_count += 1

        per_feature[name] = {
            "value": value,
            "human_like": is_human_like,
            "threshold": THRESHOLDS[name],
        }

    score = (human_like_count / observed_count) if observed_count else 0.0

    # Decision rule for final classification:
    # - at least 60% of observed features must look human-like
    # - and at least 4 human-like features overall
    is_human = (score >= 0.60) and (human_like_count >= 4)

    return {
        "is_human": is_human,
        "score": score,
        "human_like_count": human_like_count,
        "observed_feature_count": observed_count,
        "per_feature": per_feature,
    }


# Example usage with data arriving from your captcha JS
if __name__ == "__main__":
    # Example payload you'd compute in JS and POST as JSON:
    example_payload = {
        "reaction_time_mean_ms": 1500.0,
        "solve_time_std_ms": 2500.0,
        "interkey_interval_std_ms": 60.0,
        "path_entropy": 0.75,
        "velocity_std_px_per_s": 30.0,
        "click_offset_avg_px": 4.0,
        "hover_dwell_avg_ms": 350.0,
        "backspace_count": 2,
        "solve_entropy": 0.7,
        "entry_points_unique": 5,
        "focus_change_events": 1,
        "swipe_accel_var": 0.0,          # desktop, so 0 / None is fine
        "pause_variance_ms": 200.0,
        "pressure_std": 0.08,
        "fingerprint_entropy": 1.2,
        "overall_variance_score": 0.8,
    }

    metrics = BehaviourMetrics(**example_payload)
    result = evaluate_behaviour(metrics)

    print(f"Human? {result['is_human']} (score={result['score']:.2f})")
    for name, info in result["per_feature"].items():
        print(
            f"{name:25s} "
            f"value={info['value']!r:10} "
            f"threshold={info['threshold']!r:6} "
            f"human_like={info['human_like']}"
        )
