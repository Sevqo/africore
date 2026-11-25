"""Exact integer-minor-unit POS cash drawer reconciliation and loyalty points engine."""
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


def evaluate_cash_count(payload):
    if not isinstance(payload, dict):
        raise ValueError("Cash count payload must be an object")
    opening = _req_int(payload.get("opening_minor", 0), "opening_minor")
    cash_sales = _req_int(payload.get("cash_sales_minor", 0), "cash_sales_minor")
    cash_in = _req_int(payload.get("cash_in_minor", 0), "cash_in_minor")
    cash_out = _req_int(payload.get("cash_out_minor", 0), "cash_out_minor")
    denominations = payload.get("denominations")
    if opening < 0 or cash_sales < 0 or cash_in < 0 or cash_out < 0:
        raise ValueError("Cash amounts must be nonnegative")
    if not isinstance(denominations, list) or len(denominations) > 100:
        raise ValueError("denominations must be a list of at most 100 entries")

    counted = 0
    breakdown = []
    for d in denominations:
        unit_minor = _req_int(d.get("denomination_minor", 0), "denomination_minor")
        count = _req_int(d.get("count", 0), "count")
        if unit_minor <= 0 or count < 0 or count > 1_000_000:
            raise ValueError("Invalid denomination_minor or count")
        sub = unit_minor * count
        counted += sub
        breakdown.append({"denomination_minor": unit_minor, "count": count, "subtotal_minor": sub})

    expected = opening + cash_sales + cash_in - cash_out
    variance = counted - expected
    status = "balanced" if variance == 0 else ("overage" if variance > 0 else "shortage")
    return {
        "opening_minor": opening,
        "expected_minor": expected,
        "counted_minor": counted,
        "variance_minor": variance,
        "status": status,
        "breakdown": breakdown,
    }


def evaluate_loyalty(payload):
    if not isinstance(payload, dict):
        raise ValueError("Loyalty payload must be an object")
    order_total = _req_int(payload.get("order_total_minor", 0), "order_total_minor")
    points_per_unit = _req_int(payload.get("points_per_1000_minor", 0), "points_per_1000_minor")
    redeem_points = _req_int(payload.get("redeem_points", 0), "redeem_points")
    available_points = _req_int(payload.get("available_points", 0), "available_points")
    minor_per_point = _req_int(payload.get("minor_per_point", 0), "minor_per_point")
    if any(v < 0 for v in (order_total, points_per_unit, redeem_points, available_points, minor_per_point)):
        raise ValueError("Loyalty values must be nonnegative")
    if redeem_points > available_points:
        raise ValueError("Cannot redeem more loyalty points than available")

    raw_discount = redeem_points * minor_per_point
    discount = min(raw_discount, order_total)
    net_payable = order_total - discount
    earned = _round_half_up(Fraction(net_payable * points_per_unit, 1000)) if points_per_unit > 0 else 0
    return {
        "order_total_minor": order_total,
        "redeemed_points": redeem_points,
        "discount_minor": discount,
        "net_payable_minor": net_payable,
        "earned_points": earned,
        "ending_points": available_points - redeem_points + earned,
    }


if __name__ == "__main__":
    try:
        req = json.load(sys.stdin)
        op = req.get("op")
        if op == "cash_count":
            out = evaluate_cash_count(req)
        elif op == "loyalty":
            out = evaluate_loyalty(req)
        else:
            raise ValueError("Unsupported POS operation")
        print(json.dumps(out, separators=(",", ":")))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
