"""Exact integer-minor-unit inventory valuation (Standard, AVCO, FIFO) and Landed Cost allocation."""
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


def evaluate_valuation(payload):
    if not isinstance(payload, dict):
        raise ValueError("Valuation payload must be an object")
    method = payload.get("method", "average")
    if method not in ("standard", "average", "fifo"):
        raise ValueError("Costing method must be standard, average, or fifo")
    standard_cost = _req_int(payload.get("standard_cost_minor", 0), "standard_cost_minor")
    if standard_cost < 0 or standard_cost > 100_000_000_000:
        raise ValueError("standard_cost_minor out of bounds")
    events = payload.get("events")
    if not isinstance(events, list) or len(events) > 5000:
        raise ValueError("events must be a list of at most 5,000 items")

    on_hand = 0
    total_value = 0
    total_cogs = 0
    layers = []  # list of [qty_milli, total_layer_value_minor, ref]

    for idx, ev in enumerate(events):
        if not isinstance(ev, dict):
            raise ValueError(f"Event {idx} must be an object")
        kind = ev.get("kind")
        if kind == "landed_cost":
            add_cost = _req_int(ev.get("additional_cost_minor", 0), "additional_cost_minor")
            if add_cost <= 0:
                raise ValueError("Landed cost allocation must be positive")
            if on_hand > 0:
                total_value += add_cost
                if method == "fifo" and layers:
                    # Distribute landed cost proportionally across remaining FIFO layers
                    rem_qty = sum(layer[0] for layer in layers)
                    if rem_qty > 0:
                        cum_num = 0
                        prev_alloc = 0
                        for layer in layers:
                            cum_num += layer[0] * add_cost
                            target = _round_half_up(Fraction(cum_num, rem_qty))
                            delta = target - prev_alloc
                            layer[1] += delta
                            prev_alloc = target
            continue

        qty = _req_int(ev.get("quantity_milli", 0), "quantity_milli")
        unit_cost = _req_int(ev.get("unit_cost_minor", standard_cost), "unit_cost_minor")
        if unit_cost < 0:
            raise ValueError("unit_cost_minor must be nonnegative")
        ref = str(ev.get("id") or idx)

        if qty > 0:
            in_val = (
                _round_half_up(Fraction(qty * standard_cost, 1000))
                if method == "standard"
                else _round_half_up(Fraction(qty * unit_cost, 1000))
            )
            on_hand += qty
            total_value += in_val
            if method == "fifo":
                layers.append([qty, in_val, ref])
        elif qty < 0:
            out_qty = -qty
            if method == "standard":
                out_val = _round_half_up(Fraction(out_qty * standard_cost, 1000))
                on_hand = max(0, on_hand - out_qty)
                total_value = _round_half_up(Fraction(on_hand * standard_cost, 1000))
                total_cogs += out_val
            elif method == "average":
                if on_hand <= 0:
                    out_val = _round_half_up(Fraction(out_qty * standard_cost, 1000))
                elif out_qty >= on_hand:
                    out_val = total_value
                    on_hand = 0
                    total_value = 0
                else:
                    out_val = _round_half_up(Fraction(total_value * out_qty, on_hand))
                    on_hand -= out_qty
                    total_value -= out_val
                total_cogs += out_val
            else:  # fifo
                remaining_to_issue = out_qty
                out_val = 0
                while remaining_to_issue > 0 and layers:
                    layer = layers[0]
                    if layer[0] <= remaining_to_issue:
                        out_val += layer[1]
                        remaining_to_issue -= layer[0]
                        layers.pop(0)
                    else:
                        take_val = _round_half_up(Fraction(layer[1] * remaining_to_issue, layer[0]))
                        out_val += take_val
                        layer[0] -= remaining_to_issue
                        layer[1] -= take_val
                        remaining_to_issue = 0
                if remaining_to_issue > 0:
                    out_val += _round_half_up(Fraction(remaining_to_issue * standard_cost, 1000))
                on_hand = max(0, on_hand - out_qty)
                total_value = sum(layer[1] for layer in layers)
                total_cogs += out_val

    unit_cost_out = (
        standard_cost
        if method == "standard"
        else (_round_half_up(Fraction(total_value * 1000, on_hand)) if on_hand > 0 else standard_cost)
    )
    return {
        "method": method,
        "on_hand_milli": on_hand,
        "total_value_minor": total_value,
        "unit_cost_minor": unit_cost_out,
        "total_cogs_minor": total_cogs,
        "layers": [
            {
                "ref": layer[2],
                "quantity_milli": layer[0],
                "value_minor": layer[1],
                "unit_cost_minor": _round_half_up(Fraction(layer[1] * 1000, layer[0])) if layer[0] > 0 else 0,
            }
            for layer in layers
        ],
    }


def allocate_landed_cost(payload):
    if not isinstance(payload, dict):
        raise ValueError("Landed cost payload must be an object")
    total_cost = _req_int(payload.get("total_cost_minor", 0), "total_cost_minor")
    if total_cost <= 0 or total_cost > 100_000_000_000:
        raise ValueError("total_cost_minor must be a positive integer minor unit")
    split = payload.get("split_method", "equal")
    if split not in ("equal", "by_quantity", "by_current_cost"):
        raise ValueError("split_method must be equal, by_quantity, or by_current_cost")
    lines = payload.get("lines")
    if not isinstance(lines, list) or not 1 <= len(lines) <= 200:
        raise ValueError("Landed cost requires 1 to 200 receipt lines")

    weights = []
    parsed = []
    for idx, line in enumerate(lines):
        if not isinstance(line, dict):
            raise ValueError(f"Line {idx} must be an object")
        qty = _req_int(line.get("quantity_milli", 0), "quantity_milli")
        former = _req_int(line.get("former_cost_minor", 0), "former_cost_minor")
        if qty <= 0 or former < 0:
            raise ValueError("Line quantity must be positive and former_cost_minor nonnegative")
        parsed.append({"id": str(line.get("id") or idx), "quantity_milli": qty, "former_cost_minor": former})
        if split == "equal":
            weights.append(1)
        elif split == "by_quantity":
            weights.append(qty)
        else:
            weights.append(former)

    total_weight = sum(weights)
    if total_weight <= 0:
        raise ValueError("Selected split basis has zero total weight; use equal or by_quantity")

    allocated = []
    cum_weight = 0
    prev_total = 0
    for item, weight in zip(parsed, weights):
        cum_weight += weight
        target = _round_half_up(Fraction(total_cost * cum_weight, total_weight))
        add = target - prev_total
        prev_total = target
        new_cost = item["former_cost_minor"] + add
        new_unit = _round_half_up(Fraction(new_cost * 1000, item["quantity_milli"]))
        allocated.append(
            {
                "id": item["id"],
                "quantity_milli": item["quantity_milli"],
                "former_cost_minor": item["former_cost_minor"],
                "additional_cost_minor": add,
                "new_cost_minor": new_cost,
                "new_unit_cost_minor": new_unit,
            }
        )
    return {
        "split_method": split,
        "total_cost_minor": total_cost,
        "lines": allocated,
    }


if __name__ == "__main__":
    try:
        req = json.load(sys.stdin)
        op = req.get("op")
        if op == "valuation":
            out = evaluate_valuation(req)
        elif op == "landed_cost":
            out = allocate_landed_cost(req)
        else:
            raise ValueError("Unsupported inventory valuation operation")
        print(json.dumps(out, separators=(",", ":")))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
