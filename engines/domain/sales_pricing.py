"""Exact integer-minor-unit sales margin analysis and down-payment calculations."""
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


def compute_margins(payload):
    if not isinstance(payload, dict):
        raise ValueError("Margin payload must be an object")
    orders = payload.get("orders")
    if not isinstance(orders, list) or len(orders) > 2000:
        raise ValueError("orders must be a list of at most 2,000 orders")

    out_orders = []
    totals_by_currency = {}

    for order in orders:
        if not isinstance(order, dict):
            raise ValueError("Each order must be an object")
        order_id = str(order.get("id") or "")
        currency = str(order.get("currency") or "KES")
        lines = order.get("lines")
        if not isinstance(lines, list):
            raise ValueError("Order lines must be a list")

        order_rev = 0
        order_cost = 0
        out_lines = []
        for line in lines:
            qty = _req_int(line.get("quantity_milli", 0), "quantity_milli")
            unit_price = _req_int(line.get("unit_price_minor", 0), "unit_price_minor")
            discount_bps = _req_int(line.get("discount_bps", 0), "discount_bps")
            unit_cost = _req_int(line.get("unit_cost_minor", 0), "unit_cost_minor")
            if qty < 0 or unit_price < 0 or unit_cost < 0 or not 0 <= discount_bps <= 10000:
                raise ValueError("Invalid line quantity, price, cost, or discount_bps")

            gross = Fraction(qty * unit_price, 1000)
            net_rev = _round_half_up(gross * Fraction(10000 - discount_bps, 10000))
            cost = _round_half_up(Fraction(qty * unit_cost, 1000))
            margin = net_rev - cost
            margin_bps = _round_half_up(Fraction(margin * 10000, net_rev)) if net_rev > 0 else 0

            order_rev += net_rev
            order_cost += cost
            out_lines.append(
                {
                    "product_id": line.get("product_id"),
                    "quantity_milli": qty,
                    "revenue_minor": net_rev,
                    "cost_minor": cost,
                    "margin_minor": margin,
                    "margin_bps": margin_bps,
                }
            )

        order_margin = order_rev - order_cost
        order_margin_bps = _round_half_up(Fraction(order_margin * 10000, order_rev)) if order_rev > 0 else 0
        out_orders.append(
            {
                "id": order_id,
                "currency": currency,
                "revenue_minor": order_rev,
                "cost_minor": order_cost,
                "margin_minor": order_margin,
                "margin_bps": order_margin_bps,
                "lines": out_lines,
            }
        )
        agg = totals_by_currency.setdefault(
            currency, {"revenue_minor": 0, "cost_minor": 0, "margin_minor": 0, "margin_bps": 0}
        )
        agg["revenue_minor"] += order_rev
        agg["cost_minor"] += order_cost
        agg["margin_minor"] += order_margin

    for agg in totals_by_currency.values():
        agg["margin_bps"] = (
            _round_half_up(Fraction(agg["margin_minor"] * 10000, agg["revenue_minor"]))
            if agg["revenue_minor"] > 0
            else 0
        )

    return {"orders": out_orders, "totals_by_currency": totals_by_currency}


def compute_down_payment(payload):
    if not isinstance(payload, dict):
        raise ValueError("Down-payment payload must be an object")
    order_total = _req_int(payload.get("order_total_minor", 0), "order_total_minor")
    already = _req_int(payload.get("already_invoiced_minor", 0), "already_invoiced_minor")
    mode = payload.get("mode")
    if order_total <= 0 or already < 0 or already > order_total:
        raise ValueError("Invalid order total or already_invoiced_minor")
    remaining = order_total - already
    if remaining <= 0:
        raise ValueError("Order is already fully invoiced")

    if mode == "percentage":
        pct_bps = _req_int(payload.get("percentage_bps", 0), "percentage_bps")
        if not 1 <= pct_bps <= 10000:
            raise ValueError("percentage_bps must be between 1 and 10000 (0.01% to 100%)")
        amount = _round_half_up(Fraction(order_total * pct_bps, 10000))
        if amount <= 0:
            raise ValueError("Computed down payment must be positive")
    elif mode == "fixed":
        amount = _req_int(payload.get("fixed_amount_minor", 0), "fixed_amount_minor")
        if amount <= 0:
            raise ValueError("fixed_amount_minor must be positive")
    else:
        raise ValueError("Down payment mode must be percentage or fixed")

    if amount > remaining:
        raise ValueError("Down payment exceeds remaining uninvoiced order balance")

    return {
        "order_total_minor": order_total,
        "already_invoiced_minor": already,
        "amount_minor": amount,
        "remaining_after_minor": remaining - amount,
    }


if __name__ == "__main__":
    try:
        req = json.load(sys.stdin)
        op = req.get("op")
        if op == "margins":
            out = compute_margins(req)
        elif op == "down_payment":
            out = compute_down_payment(req)
        else:
            raise ValueError("Unsupported sales pricing operation")
        print(json.dumps(out, separators=(",", ":")))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
