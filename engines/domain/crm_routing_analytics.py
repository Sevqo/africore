"""Pure integer Odoo 20 CRM parity calculations.

Zero floats: all monetary figures are integer minor units and ratios are
integer basis points (10_000 = 100.00%).
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


def route_lead(payload: dict[str, Any]) -> dict[str, Any]:
    """Match a lead to the highest-priority routing rule and lowest-load rep."""
    lead = dict(payload.get("lead", {}))
    rules = sorted(
        list(payload.get("rules", [])),
        key=lambda r: int(r.get("priority", 100)),
    )
    country = str(lead.get("country", "")).upper()
    source = str(lead.get("source", "")).lower()
    expected_minor = int(lead.get("expected_revenue_minor", 0))

    for rule in rules:
        if rule.get("country") and str(rule["country"]).upper() != country:
            continue
        if rule.get("source") and str(rule["source"]).lower() != source:
            continue
        if rule.get("min_revenue_minor") is not None and expected_minor < int(rule["min_revenue_minor"]):
            continue
        reps = list(rule.get("reps", []))
        chosen_rep = None
        if reps:
            # Pick rep with lowest active_leads that is under capacity
            eligible = [
                rep for rep in reps
                if int(rep.get("active_leads", 0)) < int(rep.get("max_capacity", 1000))
            ]
            pool = eligible if eligible else reps
            pool.sort(key=lambda r: (int(r.get("active_leads", 0)), str(r.get("rep_id", ""))))
            chosen_rep = str(pool[0].get("rep_id", ""))
        return {
            "matched": True,
            "rule_id": str(rule.get("id", "")),
            "rule_name": str(rule.get("name", "")),
            "team_name": str(rule.get("team_name", "")),
            "assigned_rep_id": chosen_rep,
        }

    return {
        "matched": False,
        "rule_id": None,
        "rule_name": None,
        "team_name": None,
        "assigned_rep_id": None,
    }


def win_loss_analytics(payload: dict[str, Any]) -> dict[str, Any]:
    """Compute win rate bps, average deal size, and lost-reason revenue impact."""
    deals = list(payload.get("deals", []))
    won_count = 0
    lost_count = 0
    open_count = 0
    won_minor = 0
    lost_minor = 0
    cycle_days_sum = 0
    closed_with_cycle = 0
    by_reason: dict[str, dict[str, int]] = {}

    for deal in deals:
        outcome = str(deal.get("outcome", "open")).lower()
        rev = int(deal.get("expected_revenue_minor", 0))
        if outcome == "won":
            won_count += 1
            won_minor += rev
            if deal.get("cycle_days") is not None:
                cycle_days_sum += int(deal["cycle_days"])
                closed_with_cycle += 1
        elif outcome == "lost":
            lost_count += 1
            lost_minor += rev
            reason = str(deal.get("lost_reason", "Unspecified") or "Unspecified")
            bucket = by_reason.setdefault(reason, {"count": 0, "lost_revenue_minor": 0})
            bucket["count"] += 1
            bucket["lost_revenue_minor"] += rev
        else:
            open_count += 1

    decided = won_count + lost_count
    win_rate_bps = _round_div(won_count * 10_000, decided) if decided > 0 else 0
    avg_won_minor = _round_div(won_minor, won_count) if won_count > 0 else 0
    avg_cycle_days = _round_div(cycle_days_sum, closed_with_cycle) if closed_with_cycle > 0 else 0

    lost_reasons = sorted(
        [
            {"reason": k, "count": v["count"], "lost_revenue_minor": v["lost_revenue_minor"]}
            for k, v in by_reason.items()
        ],
        key=lambda x: (-x["lost_revenue_minor"], x["reason"]),
    )

    return {
        "won_count": won_count,
        "lost_count": lost_count,
        "open_count": open_count,
        "won_revenue_minor": won_minor,
        "lost_revenue_minor": lost_minor,
        "win_rate_bps": win_rate_bps,
        "avg_won_deal_minor": avg_won_minor,
        "avg_cycle_days": avg_cycle_days,
        "lost_reasons": lost_reasons,
    }


def recurring_rollup(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize opportunity recurring revenues (monthly/quarterly/annual) to MRR & ARR."""
    items = list(payload.get("opportunities", []))
    total_mrr = 0
    total_weighted_mrr = 0
    rows: list[dict[str, Any]] = []

    for opp in items:
        plan = str(opp.get("recurring_plan", "monthly")).lower()
        amt = int(opp.get("recurring_revenue_minor", 0))
        prob_bps = int(opp.get("probability_bps", 10_000))
        if plan == "annual":
            mrr = _round_div(amt, 12)
            arr = amt
        elif plan == "quarterly":
            mrr = _round_div(amt, 3)
            arr = amt * 4
        else:
            mrr = amt
            arr = amt * 12
        weighted_mrr = _round_div(mrr * prob_bps, 10_000)
        total_mrr += mrr
        total_weighted_mrr += weighted_mrr
        rows.append({
            "opportunity_id": str(opp.get("opportunity_id", "")),
            "mrr_minor": mrr,
            "arr_minor": arr,
            "weighted_mrr_minor": weighted_mrr,
        })

    return {
        "total_mrr_minor": total_mrr,
        "total_arr_minor": total_mrr * 12,
        "total_weighted_mrr_minor": total_weighted_mrr,
        "total_weighted_arr_minor": total_weighted_mrr * 12,
        "rows": rows,
    }


def quota_attainment(payload: dict[str, Any]) -> dict[str, Any]:
    """Compute sales team / rep quota attainment in exact integer basis points."""
    quotas = list(payload.get("quotas", []))
    rows: list[dict[str, Any]] = []
    total_target = 0
    total_actual = 0

    for q in quotas:
        target = int(q.get("target_minor", 0))
        actual = int(q.get("won_minor", 0))
        bps = _round_div(actual * 10_000, target) if target > 0 else 0
        total_target += target
        total_actual += actual
        rows.append({
            "owner_id": str(q.get("owner_id", "")),
            "owner_name": str(q.get("owner_name", "")),
            "target_minor": target,
            "won_minor": actual,
            "gap_minor": max(0, target - actual),
            "attainment_bps": bps,
            "achieved": target > 0 and actual >= target,
        })

    total_bps = _round_div(total_actual * 10_000, total_target) if total_target > 0 else 0
    return {
        "total_target_minor": total_target,
        "total_won_minor": total_actual,
        "total_attainment_bps": total_bps,
        "rows": rows,
    }


def run(payload: dict[str, Any]) -> dict[str, Any]:
    op = str(payload.get("op", ""))
    if op == "route_lead":
        return route_lead(payload)
    if op == "win_loss_analytics":
        return win_loss_analytics(payload)
    if op == "recurring_rollup":
        return recurring_rollup(payload)
    if op == "quota_attainment":
        return quota_attainment(payload)
    raise ValueError(f"unsupported crm_parity op: {op}")


if __name__ == "__main__":
    raw = sys.stdin.read()
    data = json.loads(raw) if raw.strip() else {}
    sys.stdout.write(json.dumps(run(data)))
