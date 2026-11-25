"""Exact integer-minor-unit CRM weighted pipeline forecast and lead scoring."""
from fractions import Fraction
import json
import sys


def _req_int(value, name):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    return value


def _round_half_up(frac):
    if frac >= 0:
        return (frac.numerator * 2 + frac.denominator) // (2 * frac.denominator)
    return -((-frac.numerator * 2 + frac.denominator) // (2 * frac.denominator))


def evaluate_forecast(payload):
    if not isinstance(payload, dict):
        raise ValueError("CRM forecast payload must be an object")
    leads = payload.get("leads")
    if not isinstance(leads, list) or len(leads) > 5000:
        raise ValueError("leads must be a list of at most 5,000 items")

    by_stage = {}
    totals_by_currency = {}
    for lead in leads:
        stage = str(lead.get("stage") or "new")
        currency = str(lead.get("currency") or "KES")
        expected = _req_int(lead.get("expected_revenue_minor", 0), "expected_revenue_minor")
        prob_bps = _req_int(lead.get("probability_bps", 0), "probability_bps")
        if expected < 0 or not 0 <= prob_bps <= 10000:
            raise ValueError("Invalid expected_revenue_minor or probability_bps")
        weighted = _round_half_up(Fraction(expected * prob_bps, 10000))

        key = f"{stage}:{currency}"
        st = by_stage.setdefault(
            key,
            {
                "stage": stage,
                "currency": currency,
                "count": 0,
                "expected_revenue_minor": 0,
                "weighted_revenue_minor": 0,
            },
        )
        st["count"] += 1
        st["expected_revenue_minor"] += expected
        st["weighted_revenue_minor"] += weighted

        cur = totals_by_currency.setdefault(
            currency, {"count": 0, "expected_revenue_minor": 0, "weighted_revenue_minor": 0}
        )
        cur["count"] += 1
        cur["expected_revenue_minor"] += expected
        cur["weighted_revenue_minor"] += weighted

    return {
        "by_stage": list(by_stage.values()),
        "totals_by_currency": totals_by_currency,
    }


def score_lead(payload):
    if not isinstance(payload, dict):
        raise ValueError("Lead score payload must be an object")
    has_email = bool(payload.get("has_email"))
    has_phone = bool(payload.get("has_phone"))
    has_company = bool(payload.get("has_company"))
    expected = _req_int(payload.get("expected_revenue_minor", 0), "expected_revenue_minor")
    activities_completed = _req_int(payload.get("activities_completed", 0), "activities_completed")
    days_stale = _req_int(payload.get("days_stale", 0), "days_stale")
    if expected < 0 or activities_completed < 0 or days_stale < 0:
        raise ValueError("Lead scoring metrics must be nonnegative")

    score = 10
    if has_email:
        score += 15
    if has_phone:
        score += 15
    if has_company:
        score += 10
    if expected >= 100_000:
        score += 20
    elif expected > 0:
        score += 10
    score += min(30, activities_completed * 10)
    score -= min(40, days_stale * 2)
    score = max(0, min(100, score))
    tier = "hot" if score >= 75 else ("warm" if score >= 45 else "cold")
    return {"score": score, "tier": tier, "suggested_probability_bps": score * 100}


if __name__ == "__main__":
    try:
        req = json.load(sys.stdin)
        op = req.get("op")
        if op == "forecast":
            out = evaluate_forecast(req)
        elif op == "score":
            out = score_lead(req)
        else:
            raise ValueError("Unsupported CRM forecast operation")
        print(json.dumps(out, separators=(",", ":")))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
