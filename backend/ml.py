from pathlib import Path
from functools import lru_cache
import joblib
import numpy as np

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "stress_model.joblib"
FEATURES = [
    "duty_hours", "sleep_hours", "fatigue", "mood",
    "focus", "social_support", "recovery_gap", "workload"
]

@lru_cache(maxsize=1)
def load_bundle():
    return joblib.load(MODEL_PATH)

def _factor_actions(payload: dict):
    checks = [
        ("sleep_hours", payload["sleep_hours"] < 6.0, "Reduced sleep", "severe" if payload["sleep_hours"] < 4 else "moderate",
         "Sleep is below the healthy 7-9h range. Protect a consistent wind-down window and, where operationally feasible, allow adequate recovery time."),
        ("duty_hours", payload["duty_hours"] > 10.0, "Extended duty hours", "severe" if payload["duty_hours"] > 14 else "moderate",
         "Duty hours are extended. Review duty rotation, insert breaks, and avoid repeated extended shifts without adequate recovery."),
        ("fatigue", payload["fatigue"] >= 7.0, "Elevated fatigue", "severe" if payload["fatigue"] >= 8.5 else "moderate",
         "Fatigue is elevated. Prioritize recovery breaks, reduce non-essential tasking where feasible, and consider welfare follow-up if it persists."),
        ("mood", payload["mood"] <= 4.0, "Lower mood score", "severe" if payload["mood"] <= 2 else "moderate",
         "Mood is low. Offer a voluntary, confidential welfare check-in and access to support resources."),
        ("focus", payload["focus"] <= 4.0, "Reduced focus", "severe" if payload["focus"] <= 2 else "moderate",
         "Focus is reduced. Consider short recovery breaks and review whether high-precision tasks should be temporarily redistributed."),
        ("social_support", payload["social_support"] <= 4.0, "Lower social support", "severe" if payload["social_support"] <= 2 else "moderate",
         "Reported social support is low. Make peer-support and confidential welfare contacts easy to access."),
        ("recovery_gap", payload["recovery_gap"] > 6.0, "Long recovery gap", "severe" if payload["recovery_gap"] > 14 else "moderate",
         "Recovery gap is long. Review whether dedicated downtime or leave can be scheduled soon."),
        ("workload", payload["workload"] >= 7.0, "High workload", "severe" if payload["workload"] >= 8.5 else "moderate",
         "Workload is high. Redistribute lower-priority work where feasible and confirm the workload is not becoming a sustained baseline."),
    ]
    factors, actions = [], []
    for key, condition, label, severity, tip in checks:
        if condition:
            factors.append({"feature": key, "label": label, "value": payload[key], "severity": severity, "recommendation": tip})
            actions.append(tip)
    if not actions:
        actions.append("All monitored factors are within the configured screening ranges. Continue routine wellness monitoring.")
    return factors, actions

def predict_many(payloads):
    bundle = load_bundle()
    model = bundle["model"]
    # Use a plain NumPy matrix so runtime prediction does not depend on pandas/DLLs.
    x = np.asarray([[float(p[f]) for f in FEATURES] for p in payloads], dtype=float)
    probs = model.predict_proba(x)[:, 1].astype(float)
    outputs = []
    for payload, prob in zip(payloads, probs):
        if prob < 0.34:
            level = "Low"
        elif prob < 0.67:
            level = "Medium"
        else:
            level = "High"
        factors, actions = _factor_actions(payload)
        outputs.append({
            "risk_probability": round(float(prob), 4),
            "risk_level": level,
            "factors": factors,
            "actions": actions,
        })
    return outputs

def predict(payload: dict):
    return predict_many([payload])[0]
