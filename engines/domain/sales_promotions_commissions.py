"""AfriCore Odoo-Parity Sales Engine (Pure Python, Exact Integer Arithmetic).

Covers:
1. Promo Codes & Discounts (percent_bps, fixed_minor, buy_x_get_y)
2. Salesperson Tiered Commissions & Quota Attainment
3. Shipping / Delivery Rate Calculation (fixed, weight_tiered, free_over_threshold)
4. Product Variant Matrix Expansion (attribute grid -> structured order lines)
5. Invoicing Policy Evaluator (ordered_qty vs delivered_qty + pro-forma totals)
"""
from __future__ import annotations

import json
import sys


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _round_half_up_div(num: int, den: int) -> int:
    if den <= 0:
        raise ValueError("Denominator must be positive")
    if num >= 0:
        return (num * 2 + den) // (2 * den)
    return -((-num * 2 + den) // (2 * den))


def evaluate_promo(payload: dict) -> dict:
    order_subtotal = payload.get("order_subtotal_minor")
    discount_type = payload.get("discount_type")
    value = payload.get("value")
    min_order = payload.get("min_order_minor", 0)
    max_discount = payload.get("max_discount_minor")
    qty = payload.get("qualifying_qty", 0)
    unit_price = payload.get("qualifying_unit_price_minor", 0)
    buy_x = payload.get("buy_x", 0)
    get_y = payload.get("get_y", 0)

    if not _is_int(order_subtotal) or order_subtotal < 0:
        raise ValueError("order_subtotal_minor must be a non-negative integer")
    if not _is_int(min_order) or min_order < 0:
        raise ValueError("min_order_minor must be a non-negative integer")

    if order_subtotal < min_order:
        return {
            "eligible": False,
            "reason": "Order subtotal is below minimum promo threshold",
            "discount_minor": 0,
            "net_total_minor": order_subtotal,
        }

    discount = 0
    if discount_type == "percent_bps":
        if not _is_int(value) or value < 0 or value > 10000:
            raise ValueError("percent_bps value must be 0..10000")
        discount = _round_half_up_div(order_subtotal * value, 10000)
    elif discount_type == "fixed_minor":
        if not _is_int(value) or value < 0:
            raise ValueError("fixed_minor value must be non-negative")
        discount = value
    elif discount_type == "buy_x_get_y":
        if not (_is_int(buy_x) and buy_x > 0 and _is_int(get_y) and get_y > 0):
            raise ValueError("buy_x and get_y must be positive integers")
        if not (_is_int(qty) and qty >= 0 and _is_int(unit_price) and unit_price >= 0):
            raise ValueError("qualifying_qty and qualifying_unit_price_minor must be non-negative")
        bundle = buy_x + get_y
        free_units = (qty // bundle) * get_y
        discount = free_units * unit_price
    else:
        raise ValueError("Unsupported discount_type")

    if max_discount is not None:
        if not _is_int(max_discount) or max_discount < 0:
            raise ValueError("max_discount_minor must be non-negative")
        discount = min(discount, max_discount)

    discount = min(discount, order_subtotal)
    return {
        "eligible": True,
        "reason": "Promo applied",
        "discount_minor": discount,
        "net_total_minor": order_subtotal - discount,
    }


def calculate_commission(payload: dict) -> dict:
    revenue = payload.get("achieved_revenue_minor")
    quota = payload.get("quota_minor", 0)
    tiers = payload.get("tiers", [])
    if not _is_int(revenue) or revenue < 0:
        raise ValueError("achieved_revenue_minor must be a non-negative integer")
    if not _is_int(quota) or quota < 0:
        raise ValueError("quota_minor must be a non-negative integer")

    attainment_bps = _round_half_up_div(revenue * 10000, quota) if quota > 0 else 10000
    remaining = revenue
    lower = 0
    total_commission = 0
    breakdown = []

    for tier in tiers:
        up_to = tier.get("up_to_minor")
        rate_bps = tier.get("rate_bps")
        if not _is_int(rate_bps) or rate_bps < 0 or rate_bps > 10000:
            raise ValueError("tier rate_bps must be 0..10000")
        if remaining <= 0:
            break
        if up_to is None:
            band = remaining
        else:
            if not _is_int(up_to) or up_to <= lower:
                raise ValueError("tier up_to_minor must increase strictly")
            band = min(remaining, up_to - lower)
            lower = up_to
        comm = _round_half_up_div(band * rate_bps, 10000)
        total_commission += comm
        remaining -= band
        breakdown.append({"band_revenue_minor": band, "rate_bps": rate_bps, "commission_minor": comm})

    return {
        "achieved_revenue_minor": revenue,
        "quota_minor": quota,
        "attainment_bps": attainment_bps,
        "total_commission_minor": total_commission,
        "breakdown": breakdown,
    }


def calculate_shipping(payload: dict) -> dict:
    order_subtotal = payload.get("order_subtotal_minor")
    weight_grams = payload.get("weight_grams", 0)
    mode = payload.get("pricing_mode")
    base_fee = payload.get("base_fee_minor", 0)
    per_kg_fee = payload.get("per_kg_minor", 0)
    free_over = payload.get("free_over_minor")

    if not _is_int(order_subtotal) or order_subtotal < 0:
        raise ValueError("order_subtotal_minor must be non-negative")
    if not _is_int(weight_grams) or weight_grams < 0:
        raise ValueError("weight_grams must be non-negative")
    if not _is_int(base_fee) or base_fee < 0:
        raise ValueError("base_fee_minor must be non-negative")
    if not _is_int(per_kg_fee) or per_kg_fee < 0:
        raise ValueError("per_kg_minor must be non-negative")

    if free_over is not None and _is_int(free_over) and order_subtotal >= free_over:
        return {"shipping_minor": 0, "free_shipping_applied": True}

    if mode == "fixed":
        fee = base_fee
    elif mode == "weight_based":
        billable_kg = (weight_grams + 999) // 1000 if weight_grams > 0 else 0
        fee = base_fee + billable_kg * per_kg_fee
    else:
        raise ValueError("Unsupported pricing_mode")

    return {"shipping_minor": fee, "free_shipping_applied": False}


def expand_variant_matrix(payload: dict) -> dict:
    base_sku = str(payload.get("base_sku", "")).strip()
    base_name = str(payload.get("base_name", "")).strip()
    base_price = payload.get("base_price_minor")
    cells = payload.get("cells", [])

    if not base_sku or not base_name:
        raise ValueError("base_sku and base_name are required")
    if not _is_int(base_price) or base_price < 0:
        raise ValueError("base_price_minor must be non-negative")

    lines = []
    grand_total = 0
    total_qty = 0
    for cell in cells:
        qty = cell.get("quantity", 0)
        delta = cell.get("price_delta_minor", 0)
        row_attr = str(cell.get("row_value", "")).strip()
        col_attr = str(cell.get("col_value", "")).strip()
        if not _is_int(qty) or qty < 0:
            raise ValueError("cell quantity must be non-negative")
        if not _is_int(delta):
            raise ValueError("cell price_delta_minor must be an integer")
        if qty == 0:
            continue
        unit_price = max(0, base_price + delta)
        subtotal = unit_price * qty
        grand_total += subtotal
        total_qty += qty
        lines.append({
            "sku": f"{base_sku}-{row_attr}-{col_attr}".upper().replace(" ", "_"),
            "description": f"{base_name} ({row_attr} / {col_attr})",
            "quantity": qty,
            "unit_price_minor": unit_price,
            "line_total_minor": subtotal,
        })

    return {
        "line_count": len(lines),
        "total_quantity": total_qty,
        "grand_total_minor": grand_total,
        "lines": lines,
    }


def evaluate_invoicing_policy(payload: dict) -> dict:
    policy = payload.get("policy")
    lines = payload.get("lines", [])
    if policy not in ("ordered_qty", "delivered_qty"):
        raise ValueError("policy must be ordered_qty or delivered_qty")

    out_lines = []
    total_invoiceable = 0
    for line in lines:
        ordered = line.get("ordered_qty", 0)
        delivered = line.get("delivered_qty", 0)
        invoiced = line.get("already_invoiced_qty", 0)
        unit_price = line.get("unit_price_minor", 0)
        if not all(_is_int(x) and x >= 0 for x in (ordered, delivered, invoiced, unit_price)):
            raise ValueError("Line quantities and unit_price_minor must be non-negative integers")
        basis = ordered if policy == "ordered_qty" else delivered
        to_invoice = max(0, basis - invoiced)
        amount = to_invoice * unit_price
        total_invoiceable += amount
        out_lines.append({
            "id": str(line.get("id", "")),
            "description": str(line.get("description", "")),
            "qty_to_invoice": to_invoice,
            "unit_price_minor": unit_price,
            "amount_minor": amount,
        })

    return {
        "policy": policy,
        "total_invoiceable_minor": total_invoiceable,
        "can_invoice": total_invoiceable > 0,
        "lines": out_lines,
    }


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    op = payload.get("op")
    if op == "promo_evaluate":
        result = evaluate_promo(payload)
    elif op == "commission_calculate":
        result = calculate_commission(payload)
    elif op == "shipping_rate":
        result = calculate_shipping(payload)
    elif op == "variant_matrix":
        result = expand_variant_matrix(payload)
    elif op == "invoiceable_policy":
        result = evaluate_invoicing_policy(payload)
    else:
        raise ValueError(f"Unknown sales_parity op: {op}")
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
