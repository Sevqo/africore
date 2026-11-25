"""Bounded calendar recognition using exact fractional weights."""

from calendar import monthrange
from datetime import date, timedelta
from fractions import Fraction
import json
import sys


def schedule(data):
    total = data["amount_minor"]
    prior = data["prior_minor"]
    if type(total) is not int or type(prior) is not int or not 0 <= prior < total <= 100_000_000_000:
        raise ValueError("Invalid recognition amount or prior balance")
    first, last = (date.fromisoformat(data[key]) for key in ("start_on", "end_on"))
    if first > last or first.year < 1900 or last.year > 2300:
        raise ValueError("Invalid recognition dates")
    stride = {"monthly": 1, "quarterly": 3, "annual": 12}.get(data["frequency"])
    method = data["method"]
    if stride is None or method not in ("equal", "days", "months", "full_months"):
        raise ValueError("Unsupported recognition policy")
    if (last.year - first.year) * 12 + last.month - first.month >= 360:
        raise ValueError("A recognition plan can span up to 360 calendar months")

    weights = {}
    cursor = first
    while cursor <= last:
        days = monthrange(cursor.year, cursor.month)[1]
        month_end = date(cursor.year, cursor.month, days)
        covered_end = min(last, month_end)
        days_covered = (covered_end - cursor).days + 1
        end_month = ((cursor.month - 1) // stride + 1) * stride
        end = min(last, date(cursor.year, end_month, monthrange(cursor.year, end_month)[1]))
        if method == "equal":
            weights[end] = Fraction(1)
        else:
            weight = Fraction(days_covered) if method == "days" else Fraction(days_covered, days)
            if method == "full_months":
                weight = Fraction(1) if month_end <= last else Fraction(covered_end.day, days)
            weights[end] = weights.get(end, Fraction(0)) + weight
        cursor = covered_end + timedelta(days=1)

    weight_total = sum(weights.values())
    consumed = Fraction(0)
    recognized = prior
    rows = []
    for day, weight in sorted(weights.items()):
        consumed += weight
        target = (total - prior) * consumed / weight_total
        cumulative = prior + (2 * target.numerator + target.denominator) // (2 * target.denominator)
        rows.append({
            "date": day.isoformat(), "amount_minor": cumulative - recognized,
            "cumulative_minor": cumulative, "remaining_minor": total - cumulative,
        })
        recognized = cumulative
    return {"rows": rows}


if __name__ == "__main__":
    try:
        payload = json.load(sys.stdin)
        print(json.dumps(schedule(payload), separators=(",", ":")))
    except (ValueError, TypeError, KeyError, OverflowError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
