"""Exact integer-minor-unit Manufacturing (MRP) BOM explosion and cost rollup engine."""
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


def evaluate_bom_cost(payload):
    if not isinstance(payload, dict):
        raise ValueError("MRP BOM payload must be an object")
    produce_qty = _req_int(payload.get("produce_quantity_milli", 1000), "produce_quantity_milli")
    bom_qty = _req_int(payload.get("bom_quantity_milli", 1000), "bom_quantity_milli")
    components = payload.get("components")
    operations = payload.get("operations", [])
    if produce_qty <= 0 or bom_qty <= 0:
        raise ValueError("produce_quantity_milli and bom_quantity_milli must be positive")
    if not isinstance(components, list) or not 1 <= len(components) <= 200:
        raise ValueError("BOM requires 1 to 200 components")
    if not isinstance(operations, list) or len(operations) > 100:
        raise ValueError("BOM supports at most 100 routing operations")

    scale = Fraction(produce_qty, bom_qty)
    material_cost = 0
    exploded = []
    for idx, comp in enumerate(components):
        req_milli = _req_int(comp.get("quantity_milli", 0), "quantity_milli")
        unit_cost = _req_int(comp.get("unit_cost_minor", 0), "unit_cost_minor")
        scrap_bps = _req_int(comp.get("scrap_bps", 0), "scrap_bps")
        if req_milli <= 0 or unit_cost < 0 or not 0 <= scrap_bps <= 5000:
            raise ValueError("Invalid component quantity, unit_cost_minor, or scrap_bps")
        eff_qty_milli = _round_half_up(Fraction(req_milli, 1) * scale * Fraction(10000 + scrap_bps, 10000))
        cost = _round_half_up(Fraction(eff_qty_milli * unit_cost, 1000))
        material_cost += cost
        exploded.append(
            {
                "sku": str(comp.get("sku") or idx),
                "required_quantity_milli": eff_qty_milli,
                "unit_cost_minor": unit_cost,
                "total_cost_minor": cost,
            }
        )

    labor_cost = 0
    total_minutes = 0
    for op in operations:
        mins = _req_int(op.get("duration_minutes", 0), "duration_minutes")
        hourly = _req_int(op.get("hourly_cost_minor", 0), "hourly_cost_minor")
        if mins < 0 or hourly < 0:
            raise ValueError("Operation duration and hourly cost must be nonnegative")
        scaled_mins = _round_half_up(Fraction(mins, 1) * scale)
        total_minutes += scaled_mins
        labor_cost += _round_half_up(Fraction(scaled_mins * hourly, 60))

    total_cost = material_cost + labor_cost
    unit_finished = _round_half_up(Fraction(total_cost * 1000, produce_qty))
    return {
        "produce_quantity_milli": produce_qty,
        "material_cost_minor": material_cost,
        "labor_overhead_minor": labor_cost,
        "total_minutes": total_minutes,
        "total_cost_minor": total_cost,
        "unit_cost_minor": unit_finished,
        "components": exploded,
    }


if __name__ == "__main__":
    try:
        print(json.dumps(evaluate_bom_cost(json.load(sys.stdin)), separators=(",", ":")))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
