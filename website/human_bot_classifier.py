# ==================================================================
# SIMPLE RULE-BASED HUMAN DETECTOR
# (works with your NEW metrics format ONLY)
# ==================================================================

from typing import Dict

class BehaviourMetrics:
    def __init__(self, **data):
        self.timing = data.get("timing", {})
        self.mouse = data.get("mouse", {})
        self.clicks = data.get("clicks", {})
        self.interaction = data.get("interaction", {})


def evaluate_behaviour(metrics: BehaviourMetrics):

    per_feature = {}
    human_like_count = 0
    observed_count = 0

    def rule(name: str, passed: bool):
        nonlocal human_like_count, observed_count

        observed_count += 1
        per_feature[name] = passed

        if passed:
            human_like_count += 1


    # ===== extract =====
    solve = metrics.timing.get("total_solve_time_ms", 0)
    path_len = metrics.mouse.get("path_length_px", 0)
    max_speed = metrics.mouse.get("max_speed_px_per_ms", 0)
    direction_changes = metrics.mouse.get("direction_changes", 0)
    clicks = metrics.clicks.get("total_clicks", 0)
    picked_letters = metrics.clicks.get("picked_letters", [])
    is_headless = metrics.interaction.get("is_headless", False)


    # ===== Rules =====
    rule("solve_time_humanish", solve > 700)
    rule("mouse_path_exists", path_len > 60)
    rule("has_direction_changes", direction_changes > 2)
    rule("max_speed_nonzero", max_speed > 0.3)
    rule("clicked_more_than_once", clicks >= 2)
    rule("picked_letters_exists", len(picked_letters) > 0)
    rule("not_headless_browser", is_headless is False)

    score = human_like_count / observed_count if observed_count else 0
    is_human = score >= 0.40

    return {
        "is_human": is_human,
        "score": round(score, 3),
        "human_like_count": human_like_count,
        "observed_feature_count": observed_count,
        "per_feature": per_feature,
    }
