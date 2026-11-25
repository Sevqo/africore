"""Pure integer Odoo 20 Procurement (App #5) & POS (App #6) parity calculations."""
from __future__ import annotations

import json
import sys
from typing import Any


def _round_div(num: int, den: int) -> int:
    if den <= 0:
        raise ValueError("denominator must be positive")
    if num >= 0:
        return (num + den // 2) // den
    return -((-num + den // 2) // den)


# --- App #5: Procurement ---

def best_vendor_quote(payload: dict[str, Any]) -> dict[str, Any]:
    """Select optimal supplier price tier for a requested quantity."""
    qty = max(1, int(payload.get("quantity", 1)))
    tiers = list(payload.get("tiers", []))
    candidates: list[dict[str, Any]] = []

    for t in tiers:
        min_q = max(1, int(t.get("min_qty", 1)))
        if qty < min_q:
            continue
        unit_price = int(t.get("unit_price_minor", 0))
        lead_days = int(t.get("lead_days", 0))
        candidates.append({
            "supplier_id": str(t.get("supplier_id", "")),
            "supplier_name": str(t.get("supplier_name", "")),
            "unit_price_minor": unit_price,
            "total_minor": unit_price * qty,
            "lead_days": lead_days,
            "min_qty": min_q,
        })

    candidates.sort(key=lambda c: (c["total_minor"], c["lead_days"], c["supplier_id"]))
    return {
        "quantity": qty,
        "best": candidates[0] if candidates else None,
        "ranked": candidates,
    }


def agreement_calloff(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate a blanket purchase agreement call-off against ceiling."""
    ceiling_qty = int(payload.get("ceiling_qty", 0))
    already_ordered_qty = int(payload.get("already_ordered_qty", 0))
    requested_qty = int(payload.get("requested_qty", 0))
    unit_price_minor = int(payload.get("unit_price_minor", 0))

    remaining_before = max(0, ceiling_qty - already_ordered_qty)
    approved = requested_qty > 0 and requested_qty <= remaining_before
    remaining_after = remaining_before - requested_qty if approved else remaining_before

    return {
        "approved": approved,
        "remaining_before": remaining_before,
        "remaining_after": remaining_after,
        "calloff_total_minor": requested_qty * unit_price_minor if approved else 0,
        "reason": "ok" if approved else "requested quantity exceeds blanket agreement remaining balance",
    }


def vendor_scorecard(payload: dict[str, Any]) -> dict[str, Any]:
    """Compute supplier OTIF bps, defect rate bps, and composite score (0-10000)."""
    deliveries = list(payload.get("deliveries", []))
    total = len(deliveries)
    if total == 0:
        return {"delivery_count": 0, "otif_bps": 0, "defect_bps": 0, "composite_score_bps": 0}

    on_time_in_full = 0
    total_units = 0
    defective_units = 0
    for d in deliveries:
        ordered = max(1, int(d.get("ordered_qty", 1)))
        received = max(0, int(d.get("received_qty", 0)))
        defects = max(0, int(d.get("defective_qty", 0)))
        on_time = bool(d.get("on_time", True))
        if on_time and received >= ordered and defects == 0:
            on_time_in_full += 1
        total_units += max(1, received)
        defective_units += defects

    otif_bps = _round_div(on_time_in_full * 10_000, total)
    defect_bps = min(10_000, _round_div(defective_units * 10_000, total_units))
    # 70% OTIF + 30% Quality (10000 - defect_bps)
    composite = _round_div(otif_bps * 70 + (10_000 - defect_bps) * 30, 100)
    return {
        "delivery_count": total,
        "otif_bps": otif_bps,
        "defect_bps": defect_bps,
        "composite_score_bps": composite,
    }


# --- App #6: POS ---

def split_bill(payload: dict[str, Any]) -> dict[str, Any]:
    """Split a restaurant bill evenly across N guests with exact minor-unit conservation + tip."""
    subtotal_minor = max(0, int(payload.get("subtotal_minor", 0)))
    tax_minor = max(0, int(payload.get("tax_minor", 0)))
    tip_bps = max(0, int(payload.get("tip_bps", 0)))
    guests = max(1, int(payload.get("guests", 1)))

    tip_minor = _round_div(subtotal_minor * tip_bps, 10_000)
    grand_total = subtotal_minor + tax_minor + tip_minor
    base_share = grand_total // guests
    remainder = grand_total - base_share * guests

    shares = [
        {"guest": i + 1, "amount_minor": base_share + (1 if i < remainder else 0)}
        for i in range(guests)
    ]
    return {
        "subtotal_minor": subtotal_minor,
        "tax_minor": tax_minor,
        "tip_minor": tip_minor,
        "grand_total_minor": grand_total,
        "guests": guests,
        "shares": shares,
    }


def combo_price(payload: dict[str, Any]) -> dict[str, Any]:
    """Compute combo product total from base price + selected modifier add-ons."""
    base_minor = max(0, int(payload.get("base_price_minor", 0)))
    qty = max(1, int(payload.get("quantity", 1)))
    modifiers = list(payload.get("modifiers", []))
    addons = sum(int(m.get("extra_price_minor", 0)) for m in modifiers)
    unit_total = base_minor + addons
    return {
        "base_price_minor": base_minor,
        "addons_minor": addons,
        "unit_total_minor": unit_total,
        "quantity": qty,
        "line_total_minor": unit_total * qty,
    }


def run(payload: dict[str, Any]) -> dict[str, Any]:
    op = str(payload.get("op", ""))
    if op == "best_vendor_quote":
        return best_vendor_quote(payload)
    if op == "agreement_calloff":
        return agreement_calloff(payload)
    if op == "vendor_scorecard":
        return vendor_scorecard(payload)
    if op == "split_bill":
        return split_bill(payload)
    if op == "combo_price":
        return combo_price(payload)
    raise ValueError(f"unsupported procurement_pos_parity op: {op}")


if __name__ == "__main__":
    raw = sys.stdin.read()
    data = json.loads(raw) if raw.strip() else {}
    sys.stdout.write(json.dumps(run(data)))
