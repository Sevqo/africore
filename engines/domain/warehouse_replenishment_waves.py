"""Pure integer Odoo 20 Inventory parity calculations.

Zero floating-point math: quantities, weights (grams), and days are exact ints.
"""
from __future__ import annotations

import json
import sys
from typing import Any


def replenishment_plan(payload: dict[str, Any]) -> dict[str, Any]:
    """Evaluate Min/Max reordering rules (stock.warehouse.orderpoint)."""
    rules = list(payload.get("rules", []))
    suggestions: list[dict[str, Any]] = []
    total_units = 0

    for rule in rules:
        product_id = str(rule.get("product_id", ""))
        warehouse = str(rule.get("warehouse", "WH-MAIN"))
        on_hand = int(rule.get("on_hand_qty", 0))
        incoming = int(rule.get("incoming_qty", 0))
        outgoing = int(rule.get("outgoing_qty", 0))
        min_qty = int(rule.get("min_qty", 0))
        max_qty = int(rule.get("max_qty", min_qty))
        multiple = max(1, int(rule.get("qty_multiple", 1)))
        lead_days = int(rule.get("lead_days", 0))

        forecast_qty = on_hand + incoming - outgoing
        if forecast_qty < min_qty:
            raw_needed = max(1, max_qty - forecast_qty)
            # Round up to qty_multiple
            order_qty = ((raw_needed + multiple - 1) // multiple) * multiple
            total_units += order_qty
            suggestions.append({
                "product_id": product_id,
                "warehouse": warehouse,
                "forecast_qty": forecast_qty,
                "min_qty": min_qty,
                "max_qty": max_qty,
                "order_qty": order_qty,
                "lead_days": lead_days,
                "trigger": "below_min",
            })

    return {
        "suggestion_count": len(suggestions),
        "total_order_qty": total_units,
        "suggestions": suggestions,
    }


def resolve_putaway(payload: dict[str, Any]) -> dict[str, Any]:
    """Match an incoming product receipt to the highest-priority putaway bin."""
    product_id = str(payload.get("product_id", ""))
    category = str(payload.get("category", "")).lower()
    location_in = str(payload.get("location_in", ""))
    rules = sorted(
        list(payload.get("rules", [])),
        key=lambda r: int(r.get("priority", 100)),
    )

    for rule in rules:
        if rule.get("location_in") and str(rule["location_in"]) != location_in:
            continue
        if rule.get("product_id") and str(rule["product_id"]) != product_id:
            continue
        if rule.get("category") and str(rule["category"]).lower() != category:
            continue
        return {
            "matched": True,
            "rule_id": str(rule.get("id", "")),
            "location_out": str(rule.get("location_out", location_in)),
            "storage_category": str(rule.get("storage_category", "standard")),
        }

    return {
        "matched": False,
        "rule_id": None,
        "location_out": location_in,
        "storage_category": "default",
    }


def plan_waves(payload: dict[str, Any]) -> dict[str, Any]:
    """Group outbound pickings into capacity-bounded waves by zone & carrier."""
    max_weight_g = max(1, int(payload.get("max_weight_grams", 50_000)))
    max_pickings = max(1, int(payload.get("max_pickings_per_wave", 10)))
    pickings = list(payload.get("pickings", []))

    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for p in pickings:
        key = (str(p.get("zone", "DEFAULT")), str(p.get("carrier", "STANDARD")))
        grouped.setdefault(key, []).append(p)

    waves: list[dict[str, Any]] = []
    wave_index = 1
    for (zone, carrier), items in sorted(grouped.items()):
        current: list[str] = []
        current_weight = 0
        for item in items:
            w = max(0, int(item.get("weight_grams", 0)))
            pid = str(item.get("picking_id", ""))
            if current and (len(current) >= max_pickings or current_weight + w > max_weight_g):
                waves.append({
                    "wave_number": f"WAVE-{wave_index:03d}",
                    "zone": zone,
                    "carrier": carrier,
                    "picking_ids": current,
                    "picking_count": len(current),
                    "total_weight_grams": current_weight,
                })
                wave_index += 1
                current = []
                current_weight = 0
            current.append(pid)
            current_weight += w
        if current:
            waves.append({
                "wave_number": f"WAVE-{wave_index:03d}",
                "zone": zone,
                "carrier": carrier,
                "picking_ids": current,
                "picking_count": len(current),
                "total_weight_grams": current_weight,
            })
            wave_index += 1

    return {"wave_count": len(waves), "waves": waves}


def split_backorder(payload: dict[str, Any]) -> dict[str, Any]:
    """Split a partial delivery into fulfilled lines and backorder remainder."""
    lines = list(payload.get("lines", []))
    fulfilled: list[dict[str, Any]] = []
    backorder: list[dict[str, Any]] = []

    for line in lines:
        pid = str(line.get("product_id", ""))
        ordered = max(0, int(line.get("ordered_qty", 0)))
        done = max(0, min(ordered, int(line.get("done_qty", 0))))
        rem = ordered - done
        if done > 0:
            fulfilled.append({"product_id": pid, "qty": done})
        if rem > 0:
            backorder.append({"product_id": pid, "qty": rem})

    return {
        "needs_backorder": len(backorder) > 0,
        "fulfilled_lines": fulfilled,
        "backorder_lines": backorder,
    }


def run(payload: dict[str, Any]) -> dict[str, Any]:
    op = str(payload.get("op", ""))
    if op == "replenishment_plan":
        return replenishment_plan(payload)
    if op == "resolve_putaway":
        return resolve_putaway(payload)
    if op == "plan_waves":
        return plan_waves(payload)
    if op == "split_backorder":
        return split_backorder(payload)
    raise ValueError(f"unsupported inventory_parity op: {op}")


if __name__ == "__main__":
    raw = sys.stdin.read()
    data = json.loads(raw) if raw.strip() else {}
    sys.stdout.write(json.dumps(run(data)))
