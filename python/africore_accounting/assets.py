"""Calculate a bounded depreciation board in integer minor units."""
from calendar import monthrange
from datetime import date, timedelta
from fractions import Fraction
import json
import sys


def half_up(value):
    return (2 * value.numerator + value.denominator) // (2 * value.denominator)


def period_start(day, frequency):
    return date(day.year, day.month if frequency == "monthly" else 1, 1)


def period_end(day, frequency):
    if frequency == "annual":
        return date(day.year, 12, 31)
    return date(day.year, day.month, monthrange(day.year, day.month)[1])


def integer(request, key, lower, upper):
    value = request.get(key)
    if type(value) is not int or not lower <= value <= upper:
        raise ValueError("Invalid " + key)
    return value


def calculate(request):
    gross = integer(request, "gross_minor", 1, 100_000_000_000)
    salvage = integer(request, "salvage_minor", 0, gross)
    prior = integer(request, "prior_minor", 0, gross - salvage)
    method = request.get("method")
    frequency = request.get("frequency")
    if method not in ("straight_line", "declining", "none") or frequency not in ("monthly", "annual"):
        raise ValueError("Unsupported depreciation method or frequency")
    maximum = 360 if frequency == "monthly" else 60
    count = integer(request, "periods", 0 if method == "none" else 1, 0 if method == "none" else maximum)
    rate = integer(request, "rate_bps", 1, 10000) if method == "declining" else 0
    anchor = date.fromisoformat(request["start_on"])
    if not 1900 <= anchor.year <= 2300 or type(request.get("prorata")) is not bool:
        raise ValueError("Invalid depreciation start or prorata option")
    remaining = gross - salvage - prior
    if method == "none" or not remaining:
        return {"rows": []}
    first = Fraction(1)
    if request["prorata"]:
        end = period_end(anchor, frequency)
        first = Fraction((end - anchor).days + 1, (end - period_start(anchor, frequency)).days + 1)

    # The first and final fractions together count as one full period.
    weights = [first] + [Fraction(1)] * (count - 1)
    if first < 1:
        weights.append(1 - first)
    rows = []
    target = remaining
    weight_used = Fraction(0)
    cumulative = prior
    for index, weight in enumerate(weights):
        end = period_end(anchor, frequency)
        weight_used += weight
        if index == len(weights) - 1:
            amount = remaining
        elif method == "straight_line":
            amount = half_up(target * weight_used / count) - (target - remaining)
        else:
            amount = half_up(Fraction(remaining * rate, 10000) * weight)
        amount = min(remaining, amount)
        remaining -= amount
        cumulative += amount
        rows.append({
            "date": end.isoformat(),
            "amount_minor": amount,
            "cumulative_minor": cumulative,
            "remaining_minor": remaining,
            "book_minor": gross - cumulative,
        })
        anchor = end + timedelta(days=1)
    return {"rows": rows}


if __name__ == "__main__":
    try:
        print(json.dumps(calculate(json.load(sys.stdin)), separators=(",", ":")))
    except (ValueError, KeyError, TypeError, AttributeError, OverflowError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
