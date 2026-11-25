"""Pure integer Odoo 20 parity calculations for Apps #7 through #26.

Zero floating-point math: all currency amounts are integer minor units and
all rates/percentages are integer basis points (10_000 = 100.00%).
"""
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


def work_profitability(payload: dict[str, Any]) -> dict[str, Any]:
    """App #7 Work/Projects: project profitability, margin bps, and resource utilization."""
    revenue_minor = int(payload.get("revenue_minor", 0))
    labor_cost_minor = int(payload.get("labor_cost_minor", 0))
    expense_cost_minor = int(payload.get("expense_cost_minor", 0))
    planned_hours = max(0, int(payload.get("planned_hours", 0)))
    logged_hours = max(0, int(payload.get("logged_hours", 0)))
    billable_hours = max(0, int(payload.get("billable_hours", 0)))

    total_cost = labor_cost_minor + expense_cost_minor
    margin_minor = revenue_minor - total_cost
    margin_bps = _round_div(margin_minor * 10_000, revenue_minor) if revenue_minor > 0 else 0
    utilization_bps = _round_div(logged_hours * 10_000, planned_hours) if planned_hours > 0 else 0
    billable_bps = _round_div(billable_hours * 10_000, logged_hours) if logged_hours > 0 else 0

    return {
        "revenue_minor": revenue_minor,
        "total_cost_minor": total_cost,
        "margin_minor": margin_minor,
        "margin_bps": margin_bps,
        "utilization_bps": utilization_bps,
        "billable_bps": billable_bps,
        "over_hours": planned_hours > 0 and logged_hours > planned_hours,
    }


def people_shift_overtime(payload: dict[str, Any]) -> dict[str, Any]:
    """App #8 People/HR: shift hours & overtime pay calculation in integer minor units."""
    regular_limit_mins = max(0, int(payload.get("regular_limit_minutes", 480)))
    hourly_rate_minor = max(0, int(payload.get("hourly_rate_minor", 0)))
    overtime_multiplier_bps = max(10_000, int(payload.get("overtime_multiplier_bps", 15_000)))
    shifts = list(payload.get("shifts", []))

    total_regular_mins = 0
    total_overtime_mins = 0
    for s in shifts:
        worked = max(0, int(s.get("worked_minutes", 0)))
        reg = min(worked, regular_limit_mins)
        ot = max(0, worked - regular_limit_mins)
        total_regular_mins += reg
        total_overtime_mins += ot

    regular_pay = _round_div(total_regular_mins * hourly_rate_minor, 60)
    overtime_rate = _round_div(hourly_rate_minor * overtime_multiplier_bps, 10_000)
    overtime_pay = _round_div(total_overtime_mins * overtime_rate, 60)

    return {
        "shift_count": len(shifts),
        "regular_minutes": total_regular_mins,
        "overtime_minutes": total_overtime_mins,
        "regular_pay_minor": regular_pay,
        "overtime_pay_minor": overtime_pay,
        "total_pay_minor": regular_pay + overtime_pay,
    }


def commerce_abandoned_carts(payload: dict[str, Any]) -> dict[str, Any]:
    """App #9 Commerce: identify abandoned carts eligible for recovery campaigns."""
    threshold_minutes = max(1, int(payload.get("threshold_minutes", 60)))
    carts = list(payload.get("carts", []))
    recoverable: list[dict[str, Any]] = []
    total_value = 0

    for c in carts:
        idle = int(c.get("idle_minutes", 0))
        value = int(c.get("cart_total_minor", 0))
        if idle >= threshold_minutes and value > 0 and not bool(c.get("recovered", False)):
            total_value += value
            recoverable.append({
                "cart_id": str(c.get("cart_id", "")),
                "customer_email": str(c.get("customer_email", "")),
                "idle_minutes": idle,
                "cart_total_minor": value,
            })

    return {
        "abandoned_count": len(recoverable),
        "recoverable_value_minor": total_value,
        "carts": recoverable,
    }


def finance_treasury_runway(payload: dict[str, Any]) -> dict[str, Any]:
    """App #10 Finance: treasury cash runway & net burn calculation."""
    cash_balance = int(payload.get("cash_balance_minor", 0))
    monthly_inflow = int(payload.get("monthly_inflow_minor", 0))
    monthly_outflow = int(payload.get("monthly_outflow_minor", 0))
    net_monthly = monthly_inflow - monthly_outflow

    if net_monthly >= 0:
        runway_months = 999
        status = "cash_positive"
    else:
        burn = -net_monthly
        runway_months = max(0, cash_balance // burn) if cash_balance > 0 else 0
        status = "healthy" if runway_months >= 6 else ("watch" if runway_months >= 3 else "critical")

    return {
        "cash_balance_minor": cash_balance,
        "net_monthly_cashflow_minor": net_monthly,
        "monthly_burn_minor": max(0, -net_monthly),
        "runway_months": runway_months,
        "liquidity_status": status,
    }


def marketing_funnel(payload: dict[str, Any]) -> dict[str, Any]:
    """App #17 Marketing: open, click, bounce, and conversion rates in bps."""
    sent = max(0, int(payload.get("sent", 0)))
    delivered = max(0, int(payload.get("delivered", sent)))
    opened = max(0, int(payload.get("opened", 0)))
    clicked = max(0, int(payload.get("clicked", 0)))
    converted = max(0, int(payload.get("converted", 0)))
    revenue = max(0, int(payload.get("attributed_revenue_minor", 0)))
    spend = max(0, int(payload.get("spend_minor", 0)))

    open_bps = _round_div(opened * 10_000, delivered) if delivered > 0 else 0
    click_bps = _round_div(clicked * 10_000, delivered) if delivered > 0 else 0
    conv_bps = _round_div(converted * 10_000, delivered) if delivered > 0 else 0
    roi_bps = _round_div((revenue - spend) * 10_000, spend) if spend > 0 else 0

    return {
        "open_rate_bps": open_bps,
        "click_rate_bps": click_bps,
        "conversion_rate_bps": conv_bps,
        "roi_bps": roi_bps,
        "net_contribution_minor": revenue - spend,
    }


def support_sla_evaluate(payload: dict[str, Any]) -> dict[str, Any]:
    """App #18 Support/Helpdesk: evaluate ticket SLA compliance & breaches."""
    tickets = list(payload.get("tickets", []))
    breached = 0
    met = 0
    rows: list[dict[str, Any]] = []

    for t in tickets:
        target = max(1, int(t.get("sla_target_minutes", 240)))
        elapsed = max(0, int(t.get("elapsed_minutes", 0)))
        is_breached = elapsed > target
        if is_breached:
            breached += 1
        else:
            met += 1
        rows.append({
            "ticket_id": str(t.get("ticket_id", "")),
            "sla_target_minutes": target,
            "elapsed_minutes": elapsed,
            "breached": is_breached,
            "remaining_minutes": max(0, target - elapsed),
        })

    total = len(rows)
    compliance_bps = _round_div(met * 10_000, total) if total > 0 else 10_000
    return {
        "ticket_count": total,
        "met_count": met,
        "breached_count": breached,
        "compliance_bps": compliance_bps,
        "rows": rows,
    }


def subscriptions_nrr(payload: dict[str, Any]) -> dict[str, Any]:
    """App #19 Subscriptions: Net Revenue Retention (NRR) & Gross Churn bps."""
    starting_mrr = max(0, int(payload.get("starting_mrr_minor", 0)))
    expansion_mrr = max(0, int(payload.get("expansion_mrr_minor", 0)))
    contraction_mrr = max(0, int(payload.get("contraction_mrr_minor", 0)))
    churn_mrr = max(0, int(payload.get("churn_mrr_minor", 0)))

    ending_mrr = max(0, starting_mrr + expansion_mrr - contraction_mrr - churn_mrr)
    nrr_bps = _round_div(ending_mrr * 10_000, starting_mrr) if starting_mrr > 0 else 0
    gross_churn_bps = _round_div((churn_mrr + contraction_mrr) * 10_000, starting_mrr) if starting_mrr > 0 else 0

    return {
        "starting_mrr_minor": starting_mrr,
        "ending_mrr_minor": ending_mrr,
        "net_mrr_delta_minor": ending_mrr - starting_mrr,
        "nrr_bps": nrr_bps,
        "gross_churn_bps": gross_churn_bps,
    }


def mrp_workcenter_oee(payload: dict[str, Any]) -> dict[str, Any]:
    """App #20 Manufacturing: Overall Equipment Effectiveness (OEE) in bps."""
    planned_mins = max(1, int(payload.get("planned_minutes", 480)))
    downtime_mins = max(0, int(payload.get("downtime_minutes", 0)))
    ideal_cycle_secs = max(1, int(payload.get("ideal_cycle_seconds", 60)))
    total_units = max(0, int(payload.get("total_units", 0)))
    good_units = max(0, min(total_units, int(payload.get("good_units", total_units))))

    run_mins = max(0, planned_mins - downtime_mins)
    availability_bps = _round_div(run_mins * 10_000, planned_mins)
    performance_bps = (
        min(10_000, _round_div(total_units * ideal_cycle_secs * 10_000, run_mins * 60))
        if run_mins > 0
        else 0
    )
    quality_bps = _round_div(good_units * 10_000, total_units) if total_units > 0 else 0
    oee_bps = _round_div(availability_bps * performance_bps * quality_bps, 10_000 * 10_000)

    return {
        "run_minutes": run_mins,
        "availability_bps": availability_bps,
        "performance_bps": performance_bps,
        "quality_bps": quality_bps,
        "oee_bps": oee_bps,
    }


def rental_pricing(payload: dict[str, Any]) -> dict[str, Any]:
    """App #21 Field Ops / Rental: periodicity pricing (hour/day/week/month) + late fee."""
    period = str(payload.get("period", "day")).lower()
    units = max(1, int(payload.get("duration_units", 1)))
    rate_minor = max(0, int(payload.get("rate_minor", 0)))
    late_units = max(0, int(payload.get("late_units", 0)))
    late_fee_minor = max(0, int(payload.get("late_fee_per_unit_minor", 0)))
    deposit_minor = max(0, int(payload.get("deposit_minor", 0)))

    base_total = units * rate_minor
    late_total = late_units * late_fee_minor
    return {
        "period": period,
        "base_total_minor": base_total,
        "late_fee_total_minor": late_total,
        "deposit_minor": deposit_minor,
        "grand_total_minor": base_total + late_total,
    }


def hospitality_revpar(payload: dict[str, Any]) -> dict[str, Any]:
    """App #23 Property & Hospitality: Occupancy bps, ADR, and RevPAR."""
    available_rooms = max(1, int(payload.get("available_room_nights", 1)))
    occupied_rooms = max(0, min(available_rooms, int(payload.get("occupied_room_nights", 0))))
    room_revenue = max(0, int(payload.get("room_revenue_minor", 0)))

    occupancy_bps = _round_div(occupied_rooms * 10_000, available_rooms)
    adr_minor = _round_div(room_revenue, occupied_rooms) if occupied_rooms > 0 else 0
    revpar_minor = _round_div(room_revenue, available_rooms)

    return {
        "occupancy_bps": occupancy_bps,
        "adr_minor": adr_minor,
        "revpar_minor": revpar_minor,
    }


def learning_quiz_grade(payload: dict[str, Any]) -> dict[str, Any]:
    """App #24 Knowledge & Learning: grade quiz & determine certification eligibility."""
    pass_bps = max(0, min(10_000, int(payload.get("pass_threshold_bps", 7000))))
    questions = list(payload.get("questions", []))
    total_points = sum(max(1, int(q.get("points", 1))) for q in questions)
    earned_points = sum(
        max(1, int(q.get("points", 1)))
        for q in questions
        if str(q.get("submitted", "")).strip().lower() == str(q.get("expected", "")).strip().lower()
    )
    score_bps = _round_div(earned_points * 10_000, total_points) if total_points > 0 else 0
    return {
        "total_points": total_points,
        "earned_points": earned_points,
        "score_bps": score_bps,
        "passed": score_bps >= pass_bps,
        "certificate_eligible": score_bps >= pass_bps,
    }


def run(payload: dict[str, Any]) -> dict[str, Any]:
    op = str(payload.get("op", ""))
    dispatch = {
        "work_profitability": work_profitability,
        "people_shift_overtime": people_shift_overtime,
        "commerce_abandoned_carts": commerce_abandoned_carts,
        "finance_treasury_runway": finance_treasury_runway,
        "marketing_funnel": marketing_funnel,
        "support_sla_evaluate": support_sla_evaluate,
        "subscriptions_nrr": subscriptions_nrr,
        "mrp_workcenter_oee": mrp_workcenter_oee,
        "rental_pricing": rental_pricing,
        "hospitality_revpar": hospitality_revpar,
        "learning_quiz_grade": learning_quiz_grade,
    }
    if op not in dispatch:
        raise ValueError(f"unsupported suite_parity op: {op}")
    return dispatch[op](payload)


if __name__ == "__main__":
    raw = sys.stdin.read()
    data = json.loads(raw) if raw.strip() else {}
    sys.stdout.write(json.dumps(run(data)))
