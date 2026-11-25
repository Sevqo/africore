"""Exact integer-minor-unit Subscriptions MRR/ARR and mid-cycle proration engine."""
from datetime import date
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


INTERVAL_MONTHS = {"monthly": 1, "quarterly": 3, "annual": 12}


def compute_mrr(payload):
    contracts = payload.get("contracts")
    if not isinstance(contracts, list) or len(contracts) > 5000:
        raise ValueError("contracts must be a list of at most 5,000 records")

    totals_by_currency = {}
    for c in contracts:
        status = c.get("status", "active")
        currency = str(c.get("currency") or "KES")
        interval = c.get("interval", "monthly")
        if interval not in INTERVAL_MONTHS:
            raise ValueError(f"Unsupported billing interval: {interval}")
        price = _req_int(c.get("price_minor", 0), "price_minor")
        qty = _req_int(c.get("quantity", 1), "quantity")
        if price < 0 or qty < 0:
            raise ValueError("Subscription price and quantity must be nonnegative")

        bucket = totals_by_currency.setdefault(
            currency,
            {
                "active_count": 0,
                "paused_count": 0,
                "cancelled_count": 0,
                "mrr_minor": 0,
                "arr_minor": 0,
            },
        )
        if status == "active":
            mrr = _round_half_up(Fraction(price * qty, INTERVAL_MONTHS[interval]))
            bucket["active_count"] += 1
            bucket["mrr_minor"] += mrr
            bucket["arr_minor"] += mrr * 12
        elif status == "paused":
            bucket["paused_count"] += 1
        elif status == "cancelled":
            bucket["cancelled_count"] += 1

    return {"totals_by_currency": totals_by_currency}


def compute_proration(payload):
    period_start = date.fromisoformat(payload["period_start"])
    period_end = date.fromisoformat(payload["period_end"])
    change_on = date.fromisoformat(payload["change_on"])
    old_price = _req_int(payload.get("old_price_minor", 0), "old_price_minor")
    new_price = _req_int(payload.get("new_price_minor", 0), "new_price_minor")
    if period_end < period_start or not (period_start <= change_on <= period_end):
        raise ValueError("change_on must lie within [period_start, period_end]")
    if old_price < 0 or new_price < 0:
        raise ValueError("Prices must be nonnegative")

    total_days = (period_end - period_start).days + 1
    remaining_days = (period_end - change_on).days + 1
    credit = _round_half_up(Fraction(old_price * remaining_days, total_days))
    charge = _round_half_up(Fraction(new_price * remaining_days, total_days))
    return {
        "total_days": total_days,
        "remaining_days": remaining_days,
        "unused_credit_minor": credit,
        "new_charge_minor": charge,
        "net_adjustment_minor": charge - credit,
    }


if __name__ == "__main__":
    try:
        req = json.load(sys.stdin)
        op = req.get("op")
        if op == "mrr":
            out = compute_mrr(req)
        elif op == "proration":
            out = compute_proration(req)
        else:
            raise ValueError("Unsupported subscriptions operation")
        print(json.dumps(out, separators=(",", ":")))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
