"""Exact integer tax arithmetic exposed to AfriCore's TypeScript accounting API.

This is a deliberately narrow adapter. It does not implement Odoo's ORM, tax
groups, price-included taxes, localization, fiscal positions, or filing rules.
"""

from __future__ import annotations

import json
import sys
from typing import Literal, NotRequired, TypedDict


class CashRoundingInput(TypedDict):
    increment_minor: int
    method: Literal["UP", "DOWN", "HALF-UP"]


class CashRoundingResult(TypedDict):
    rounded_total_minor: int
    difference_minor: int


class TaxInput(TypedDict):
    base_minor: int
    rate_bps: int
    cash_rounding: NotRequired[CashRoundingInput]


class TaxResult(TypedDict):
    base_minor: int
    rate_bps: int
    tax_minor: int
    total_minor: int
    rounding: str
    cash_rounding: NotRequired[CashRoundingResult]


def round_cash(amount_minor: int, rule: CashRoundingInput) -> CashRoundingResult:
    """Round to a coin increment. UP and DOWN refer to distance from zero."""
    if not isinstance(rule, dict):
        raise ValueError("cash_rounding must be a JSON object")
    increment = rule.get("increment_minor")
    method = rule.get("method")
    if type(increment) is not int or not 1 <= increment <= 1_000_000:
        raise ValueError("cash rounding increment must be a bounded positive integer")
    if method not in ("UP", "DOWN", "HALF-UP"):
        raise ValueError("unsupported cash rounding method")

    units, remainder = divmod(abs(amount_minor), increment)
    if (method == "UP" and remainder) or (method == "HALF-UP" and remainder * 2 >= increment):
        units += 1
    rounded = units * increment * (-1 if amount_minor < 0 else 1)
    return {"rounded_total_minor": rounded, "difference_minor": rounded - amount_minor}


def calculate_tax(value: TaxInput) -> TaxResult:
    base = value.get("base_minor")
    rate = value.get("rate_bps")
    if isinstance(base, bool) or not isinstance(base, int) or not 1 <= base <= 50_000_000_000:
        raise ValueError("base_minor must be a positive bounded integer")
    if isinstance(rate, bool) or not isinstance(rate, int) or not 0 <= rate <= 10_000:
        raise ValueError("rate_bps must be an integer from 0 to 10000")

    # AfriCore's configured tax is a single percentage rate. Round once to
    # integer minor units, with exact half-up semantics and no binary floats.
    tax = (base * rate + 5_000) // 10_000
    result: TaxResult = {
        "base_minor": base,
        "rate_bps": rate,
        "tax_minor": tax,
        "total_minor": base + tax,
        "rounding": "half_up_once_to_integer_minor_unit",
    }
    if "cash_rounding" in value:
        result["cash_rounding"] = round_cash(result["total_minor"], value["cash_rounding"])
    return result


def main() -> int:
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict):
            raise ValueError("expected a JSON object")
        response = calculate_tax(request)
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        json.dump({"error": str(exc)}, sys.stdout, separators=(",", ":"))
        sys.stdout.write("\n")
        return 2
    json.dump(response, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
