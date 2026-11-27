"""Separate Agent Credit Billing Engine (pure integer minor-unit arithmetic).

Explicitly separated from standard AfriCore workspace module subscriptions and
excluded from the KSh 1,990/mo All-Apps ERP cap. Zero floating-point math.
"""
from __future__ import annotations

from typing import Any

AGENT_PLANS: dict[str, dict[str, Any]] = {
    "agent_starter": {
        "id": "agent_starter",
        "name": "Agent Starter",
        "currency": "KES",
        "monthly_minor": 0,
        "included_credits": 50,
        "overage_unit_minor": 1000,
        "summary": "KSh 0/mo · 50 Agent Credits/mo included, then KSh 10/credit",
        "features": [
            "Separate from workspace ERP billing",
            "50 monthly autonomous credits",
            "Live Computer Use stage & Floating Agent",
            "Hard spend cap protection",
        ],
    },
    "agent_growth": {
        "id": "agent_growth",
        "name": "Agent Growth",
        "currency": "KES",
        "monthly_minor": 99000,
        "included_credits": 300,
        "overage_unit_minor": 600,
        "summary": "KSh 990/mo · 300 Agent Credits/mo included, then KSh 6/credit",
        "features": [
            "300 monthly autonomous credits",
            "Scheduled Townie-style business routines",
            "Multi-step Computer Use workspace execution",
            "Lower overage rate (KSh 6/credit)",
        ],
    },
    "agent_autonomous": {
        "id": "agent_autonomous",
        "name": "Agent Autonomous Pro",
        "currency": "KES",
        "monthly_minor": 249000,
        "included_credits": 1000,
        "overage_unit_minor": 400,
        "summary": "KSh 2,490/mo · 1,000 Agent Credits/mo included, then KSh 4/credit",
        "features": [
            "1,000 monthly autonomous credits",
            "Unlimited active routines & priority execution",
            "Full owner autonomy & audit ledger export",
            "Lowest overage rate (KSh 4/credit)",
        ],
    },
}

AGENT_CREDIT_COSTS: dict[str, int] = {
    "analysis_read": 1,
    "routine_run": 2,
    "tool_action": 3,
    "computer_use_session": 5,
}


def summarize_billing(payload: dict[str, Any]) -> dict[str, Any]:
    plan_tier = str(payload.get("plan_tier") or "agent_starter")
    plan = AGENT_PLANS.get(plan_tier, AGENT_PLANS["agent_starter"])
    period = str(payload.get("period") or "")
    included = int(payload.get("monthly_credits_included") or plan["included_credits"])
    bonus = max(0, int(payload.get("bonus_credits") or 0))
    overage_unit = int(payload.get("overage_unit_minor") or plan["overage_unit_minor"])
    raw_cap = payload.get("monthly_spend_cap_minor")
    monthly_cap = None if raw_cap is None else max(0, int(raw_cap))
    hard_stop = bool(payload.get("hard_stop", True))

    ledger = list(payload.get("ledger") or [])
    used = sum(-int(row.get("credits_delta", 0)) for row in ledger if int(row.get("credits_delta", 0)) < 0)
    total_pool = included + bonus
    remaining = max(0, total_pool - used)
    overage_credits = max(0, used - total_pool)
    overage_minor = overage_credits * overage_unit
    plan_monthly = int(plan["monthly_minor"])
    total_estimated = plan_monthly + overage_minor

    return {
        "billing_stream": "separate_agent_credits",
        "excluded_from_workspace_all_apps_cap": True,
        "collection_enabled": False,
        "classification": "separate_agent_estimate",
        "period": period,
        "currency": "KES",
        "plan": plan,
        "available_plans": list(AGENT_PLANS.values()),
        "credit_costs": dict(AGENT_CREDIT_COSTS),
        "included_credits": included,
        "bonus_credits": bonus,
        "total_credits_pool": total_pool,
        "credits_used": used,
        "credits_remaining": remaining,
        "overage_credits": overage_credits,
        "overage_unit_minor": overage_unit,
        "plan_monthly_minor": plan_monthly,
        "overage_estimated_minor": overage_minor,
        "total_estimated_minor": total_estimated,
        "amount_due_minor": 0,
        "monthly_spend_cap_minor": monthly_cap,
        "hard_stop": hard_stop,
        "ledger": ledger[:50],
        "policy_note": (
            "Agent usage is billed on its own credit ledger separately from workspace apps "
            "and is excluded from the KSh 1,990/mo All-Apps ERP cap. All figures are "
            "evaluation estimates; collection remains disabled."
        ),
    }


def evaluate_credit_charge(payload: dict[str, Any]) -> dict[str, Any]:
    summary = summarize_billing(payload)
    credits_requested = max(1, int(payload.get("credits_requested") or 1))
    next_used = summary["credits_used"] + credits_requested
    next_overage = max(0, next_used - summary["total_credits_pool"])
    prev_overage = summary["overage_credits"]
    incremental_overage = max(0, next_overage - prev_overage)
    incremental_minor = incremental_overage * summary["overage_unit_minor"]
    projected_total_minor = summary["plan_monthly_minor"] + next_overage * summary["overage_unit_minor"]

    cap = summary["monthly_spend_cap_minor"]
    if summary["hard_stop"] and cap is not None and projected_total_minor > cap:
        return {
            "allowed": False,
            "status": 429,
            "reason": (
                f"Agent monthly spend cap reached (KES {cap / 100:.2f}). "
                "Increase your Agent Billing cap or upgrade your Agent plan."
            ),
            "credits_used": 0,
            "estimated_minor": 0,
            "remaining_after": summary["credits_remaining"],
        }

    return {
        "allowed": True,
        "status": 200,
        "credits_used": credits_requested,
        "estimated_minor": incremental_minor,
        "remaining_after": max(0, summary["total_credits_pool"] - next_used),
        "projected_total_minor": projected_total_minor,
    }
