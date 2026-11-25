"""Exact integer-minor-unit 3-way matching (PO vs Receipt vs Vendor Bill) and tender bid comparison."""
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


def evaluate_three_way_match(payload):
    if not isinstance(payload, dict):
        raise ValueError("3-way match payload must be an object")
    tolerance_bps = _req_int(payload.get("tolerance_bps", 0), "tolerance_bps")
    if not 0 <= tolerance_bps <= 5000:
        raise ValueError("tolerance_bps must be between 0 and 5000 (0% to 50%)")
    lines = payload.get("lines")
    if not isinstance(lines, list) or not 1 <= len(lines) <= 200:
        raise ValueError("3-way match requires 1 to 200 lines")

    out_lines = []
    total_po = 0
    total_bill = 0
    total_variance = 0
    any_over_billed = False
    any_price_variance = False
    any_awaiting_receipt = False
    any_partial = False

    for idx, line in enumerate(lines):
        if not isinstance(line, dict):
            raise ValueError(f"Line {idx} must be an object")
        ordered = _req_int(line.get("ordered_milli", 0), "ordered_milli")
        received = _req_int(line.get("received_milli", 0), "received_milli")
        billed = _req_int(line.get("billed_milli", 0), "billed_milli")
        po_price = _req_int(line.get("po_unit_price_minor", 0), "po_unit_price_minor")
        bill_price = _req_int(line.get("bill_unit_price_minor", 0), "bill_unit_price_minor")
        if ordered < 0 or received < 0 or billed < 0 or po_price < 0 or bill_price < 0:
            raise ValueError("Quantities and unit prices must be nonnegative")

        po_val = _round_half_up(Fraction(billed * po_price, 1000))
        bill_val = _round_half_up(Fraction(billed * bill_price, 1000))
        qty_var = billed - received
        price_var = bill_val - po_val
        allowed_price_diff = _round_half_up(Fraction(po_val * tolerance_bps, 10000))

        if billed > received:
            if received == 0:
                status = "awaiting_receipt"
                any_awaiting_receipt = True
            else:
                status = "over_billed"
                any_over_billed = True
        elif abs(price_var) > allowed_price_diff:
            status = "price_variance"
            any_price_variance = True
        elif billed < ordered:
            status = "partial_match"
            any_partial = True
        else:
            status = "matched"

        total_po += po_val
        total_bill += bill_val
        total_variance += price_var
        out_lines.append(
            {
                "id": str(line.get("id") or idx),
                "ordered_milli": ordered,
                "received_milli": received,
                "billed_milli": billed,
                "quantity_variance_milli": qty_var,
                "po_value_minor": po_val,
                "bill_value_minor": bill_val,
                "price_variance_minor": price_var,
                "status": status,
            }
        )

    if any_awaiting_receipt:
        overall = "awaiting_receipt"
        pay_eligible = False
    elif any_over_billed:
        overall = "over_billed"
        pay_eligible = False
    elif any_price_variance:
        overall = "price_variance"
        pay_eligible = False
    elif any_partial:
        overall = "partial_match"
        pay_eligible = True
    else:
        overall = "matched"
        pay_eligible = True

    return {
        "status": overall,
        "pay_eligible": pay_eligible,
        "tolerance_bps": tolerance_bps,
        "total_po_minor": total_po,
        "total_bill_minor": total_bill,
        "total_variance_minor": total_variance,
        "lines": out_lines,
    }


def compare_bids(payload):
    if not isinstance(payload, dict):
        raise ValueError("Bid comparison payload must be an object")
    bids = payload.get("bids")
    if not isinstance(bids, list) or not 1 <= len(bids) <= 100:
        raise ValueError("Bid comparison requires 1 to 100 vendor bids")

    parsed = []
    for idx, b in enumerate(bids):
        if not isinstance(b, dict):
            raise ValueError(f"Bid {idx} must be an object")
        total = _req_int(b.get("total_minor", 0), "total_minor")
        lead = _req_int(b.get("lead_time_days", 0), "lead_time_days")
        if total < 0 or lead < 0:
            raise ValueError("Bid total_minor and lead_time_days must be nonnegative")
        parsed.append(
            {
                "id": str(b.get("id") or idx),
                "vendor_name": str(b.get("vendor_name") or ""),
                "total_minor": total,
                "lead_time_days": lead,
            }
        )

    ranked = sorted(parsed, key=lambda x: (x["total_minor"], x["lead_time_days"], x["id"]))
    lowest = ranked[0]["total_minor"]
    highest = max(x["total_minor"] for x in ranked)
    out = []
    for rank, item in enumerate(ranked, start=1):
        delta = item["total_minor"] - lowest
        savings_vs_highest_bps = (
            _round_half_up(Fraction((highest - item["total_minor"]) * 10000, highest))
            if highest > 0
            else 0
        )
        out.append(
            {
                **item,
                "rank": rank,
                "delta_vs_lowest_minor": delta,
                "savings_vs_highest_bps": savings_vs_highest_bps,
            }
        )
    return {"lowest_total_minor": lowest, "highest_total_minor": highest, "ranked": out}


if __name__ == "__main__":
    try:
        req = json.load(sys.stdin)
        op = req.get("op")
        if op == "three_way_match":
            out = evaluate_three_way_match(req)
        elif op == "compare_bids":
            out = compare_bids(req)
        else:
            raise ValueError("Unsupported procurement matching operation")
        print(json.dumps(out, separators=(",", ":")))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
