"""Pure integer Odoo 20 Accounting parity calculations.

All monetary values are integer minor units, ratios are integer basis points
(10000 = 100.00%), and FX rates are integer micros (1_000_000 = 1.000000).
No floating-point arithmetic is used.
"""
from __future__ import annotations

from typing import Any


def _round_div(num: int, den: int) -> int:
    if den <= 0:
        raise ValueError("denominator must be positive")
    if num >= 0:
        return (num + den // 2) // den
    return -((-num + den // 2) // den)


def cash_flow_statement(payload: dict[str, Any]) -> dict[str, Any]:
    """Classify cash movements into Operating, Investing, and Financing activities."""
    opening_cash_minor = int(payload.get("opening_cash_minor", 0))
    movements = list(payload.get("movements", []))

    operating_in = 0
    operating_out = 0
    investing_in = 0
    investing_out = 0
    financing_in = 0
    financing_out = 0

    by_category: dict[str, int] = {
        "operating": 0,
        "investing": 0,
        "financing": 0,
    }

    for item in movements:
        cat = str(item.get("activity", "operating")).lower()
        if cat not in by_category:
            cat = "operating"
        amount = int(item.get("amount_minor", 0))
        by_category[cat] += amount
        if cat == "operating":
            if amount >= 0:
                operating_in += amount
            else:
                operating_out += -amount
        elif cat == "investing":
            if amount >= 0:
                investing_in += amount
            else:
                investing_out += -amount
        else:
            if amount >= 0:
                financing_in += amount
            else:
                financing_out += -amount

    net_operating = by_category["operating"]
    net_investing = by_category["investing"]
    net_financing = by_category["financing"]
    net_change = net_operating + net_investing + net_financing
    closing_cash = opening_cash_minor + net_change

    return {
        "opening_cash_minor": opening_cash_minor,
        "operating": {
            "inflow_minor": operating_in,
            "outflow_minor": operating_out,
            "net_minor": net_operating,
        },
        "investing": {
            "inflow_minor": investing_in,
            "outflow_minor": investing_out,
            "net_minor": net_investing,
        },
        "financing": {
            "inflow_minor": financing_in,
            "outflow_minor": financing_out,
            "net_minor": net_financing,
        },
        "net_change_minor": net_change,
        "closing_cash_minor": closing_cash,
        "movement_count": len(movements),
    }


def fx_revaluation(payload: dict[str, Any]) -> dict[str, Any]:
    """Compute unrealized FX gain/loss on open foreign-currency balances.

    Each position has:
      - reference: str
      - currency: str
      - foreign_amount_minor: int (signed: positive = asset/AR, negative = liability/AP)
      - booked_rate_micros: int (base minor per 1 foreign minor * 1_000_000)
      - closing_rate_micros: int (closing spot rate * 1_000_000)
    """
    base_currency = str(payload.get("base_currency", "KES")).upper()
    positions = list(payload.get("positions", []))

    lines: list[dict[str, Any]] = []
    total_gain_minor = 0
    total_loss_minor = 0

    for pos in positions:
        ref = str(pos.get("reference", ""))
        currency = str(pos.get("currency", base_currency)).upper()
        foreign_minor = int(pos.get("foreign_amount_minor", 0))
        booked_rate = int(pos.get("booked_rate_micros", 1_000_000))
        closing_rate = int(pos.get("closing_rate_micros", booked_rate))

        booked_base_minor = _round_div(foreign_minor * booked_rate, 1_000_000)
        revalued_base_minor = _round_div(foreign_minor * closing_rate, 1_000_000)
        unrealized_delta_minor = revalued_base_minor - booked_base_minor

        if unrealized_delta_minor >= 0:
            total_gain_minor += unrealized_delta_minor
        else:
            total_loss_minor += -unrealized_delta_minor

        lines.append({
            "reference": ref,
            "currency": currency,
            "foreign_amount_minor": foreign_minor,
            "booked_rate_micros": booked_rate,
            "closing_rate_micros": closing_rate,
            "booked_base_minor": booked_base_minor,
            "revalued_base_minor": revalued_base_minor,
            "unrealized_delta_minor": unrealized_delta_minor,
        })

    return {
        "base_currency": base_currency,
        "lines": lines,
        "total_unrealized_gain_minor": total_gain_minor,
        "total_unrealized_loss_minor": total_loss_minor,
        "net_unrealized_minor": total_gain_minor - total_loss_minor,
    }


def budget_variance(payload: dict[str, Any]) -> dict[str, Any]:
    """Compute Odoo Analytic Budget planned vs actual variance & achievement bps."""
    lines_in = list(payload.get("lines", []))
    results: list[dict[str, Any]] = []
    total_planned = 0
    total_actual = 0

    for line in lines_in:
        account_id = str(line.get("analytic_account_id", ""))
        name = str(line.get("name", ""))
        planned = int(line.get("planned_minor", 0))
        actual = int(line.get("actual_minor", 0))
        variance = actual - planned
        achievement_bps = _round_div(actual * 10_000, planned) if planned != 0 else 0
        total_planned += planned
        total_actual += actual
        results.append({
            "analytic_account_id": account_id,
            "name": name,
            "planned_minor": planned,
            "actual_minor": actual,
            "variance_minor": variance,
            "achievement_bps": achievement_bps,
            "over_budget": actual > planned if planned > 0 else False,
        })

    total_achievement_bps = (
        _round_div(total_actual * 10_000, total_planned) if total_planned != 0 else 0
    )
    return {
        "lines": results,
        "total_planned_minor": total_planned,
        "total_actual_minor": total_actual,
        "total_variance_minor": total_actual - total_planned,
        "total_achievement_bps": total_achievement_bps,
    }


def followup_evaluate(payload: dict[str, Any]) -> dict[str, Any]:
    """Match overdue invoices against Odoo follow-up dunning levels."""
    levels = sorted(
        list(payload.get("levels", [])),
        key=lambda lv: int(lv.get("days_overdue", 0)),
    )
    invoices = list(payload.get("invoices", []))

    actions: list[dict[str, Any]] = []
    total_overdue_minor = 0

    for inv in invoices:
        days_overdue = int(inv.get("days_overdue", 0))
        amount_due_minor = int(inv.get("amount_due_minor", 0))
        if days_overdue <= 0 or amount_due_minor <= 0:
            continue
        matched = None
        for lv in levels:
            if days_overdue >= int(lv.get("days_overdue", 0)):
                matched = lv
        if matched is None:
            continue
        total_overdue_minor += amount_due_minor
        actions.append({
            "invoice_id": str(inv.get("invoice_id", "")),
            "customer_id": str(inv.get("customer_id", "")),
            "days_overdue": days_overdue,
            "amount_due_minor": amount_due_minor,
            "level_id": str(matched.get("id", "")),
            "level_name": str(matched.get("name", "")),
            "channel": str(matched.get("channel", "email")),
            "auto_send": bool(matched.get("auto_send", False)),
        })

    return {
        "actions": actions,
        "action_count": len(actions),
        "total_overdue_minor": total_overdue_minor,
    }


def batch_payment_summary(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate and summarize a batch payment remittance."""
    currency = str(payload.get("currency", "KES")).upper()
    payments = list(payload.get("payments", []))
    total_minor = 0
    currencies: set[str] = set()
    rows: list[dict[str, Any]] = []

    for p in payments:
        p_curr = str(p.get("currency", currency)).upper()
        currencies.add(p_curr)
        amt = int(p.get("amount_minor", 0))
        if amt <= 0:
            raise ValueError("batch payment line amount_minor must be positive")
        total_minor += amt
        rows.append({
            "payment_id": str(p.get("payment_id", "")),
            "partner_name": str(p.get("partner_name", "")),
            "reference": str(p.get("reference", "")),
            "amount_minor": amt,
            "currency": p_curr,
        })

    if len(currencies) > 1:
        raise ValueError("all payments in a batch must share one currency")

    return {
        "currency": currency,
        "payment_count": len(rows),
        "total_minor": total_minor,
        "rows": rows,
    }


def run(payload: dict[str, Any]) -> dict[str, Any]:
    op = str(payload.get("op", ""))
    if op == "cash_flow_statement":
        return cash_flow_statement(payload)
    if op == "fx_revaluation":
        return fx_revaluation(payload)
    if op == "budget_variance":
        return budget_variance(payload)
    if op == "followup_evaluate":
        return followup_evaluate(payload)
    if op == "batch_payment_summary":
        return batch_payment_summary(payload)
    raise ValueError(f"unsupported accounting_parity op: {op}")


if __name__ == "__main__":
    import json
    import sys

    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else {}
    sys.stdout.write(json.dumps(run(payload)))

