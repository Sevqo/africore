"""Exact integer-minor-unit project billable timesheets and budget burn calculations."""
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


def evaluate_billing(payload):
    if not isinstance(payload, dict):
        raise ValueError("Billing payload must be an object")
    budget_minor = _req_int(payload.get("budget_minor", 0), "budget_minor")
    entries = payload.get("entries")
    if budget_minor < 0 or not isinstance(entries, list) or len(entries) > 2000:
        raise ValueError("Invalid budget_minor or entries")

    billable_minutes = 0
    non_billable_minutes = 0
    billable_minor = 0
    cost_minor = 0
    lines = []

    for idx, e in enumerate(entries):
        mins = _req_int(e.get("minutes", 0), "minutes")
        bill_rate = _req_int(e.get("hourly_rate_minor", 0), "hourly_rate_minor")
        cost_rate = _req_int(e.get("hourly_cost_minor", 0), "hourly_cost_minor")
        billable = bool(e.get("billable", True))
        if mins <= 0 or bill_rate < 0 or cost_rate < 0:
            raise ValueError("Minutes must be positive and rates nonnegative")
        amt = _round_half_up(Fraction(mins * bill_rate, 60)) if billable else 0
        cst = _round_half_up(Fraction(mins * cost_rate, 60))
        if billable:
            billable_minutes += mins
            billable_minor += amt
        else:
            non_billable_minutes += mins
        cost_minor += cst
        lines.append(
            {
                "id": str(e.get("id") or idx),
                "minutes": mins,
                "billable": billable,
                "billable_minor": amt,
                "cost_minor": cst,
            }
        )

    burn_bps = (
        _round_half_up(Fraction(billable_minor * 10000, budget_minor)) if budget_minor > 0 else 0
    )
    return {
        "billable_minutes": billable_minutes,
        "non_billable_minutes": non_billable_minutes,
        "total_minutes": billable_minutes + non_billable_minutes,
        "billable_minor": billable_minor,
        "cost_minor": cost_minor,
        "margin_minor": billable_minor - cost_minor,
        "budget_minor": budget_minor,
        "budget_burn_bps": burn_bps,
        "over_budget": budget_minor > 0 and billable_minor > budget_minor,
        "lines": lines,
    }


if __name__ == "__main__":
    try:
        print(json.dumps(evaluate_billing(json.load(sys.stdin)), separators=(",", ":")))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
