"""Deep Cross-Module Operational Intelligence Engine (Townie & Hermes Caliber).

Synthesizes question-aware strategic diagnostics across Invoices, Cash Flow, Customers,
Products/Orders/Quotations, CRM Pipeline, Work Projects/Tasks, Calendar Schedule, Obligations,
and Developer Diagnostics—going far beyond surface KPI totals to deliver tailored reasoning,
aging breakdowns, bottleneck analysis, and concrete next-step playbooks.
"""
from __future__ import annotations

from typing import Any

from agent.advisor import build_strategic_business_response


def _fmt_money(minor: int, currency: str) -> str:
    divisor = 1 if currency in ("UGX", "RWF") else 100
    val = minor / divisor
    if divisor == 1:
        return f"{currency} {int(round(val)):,}"
    return f"{currency} {val:,.2f}"


def analyze_workspace_operations(payload: dict[str, Any]) -> dict[str, Any]:
    kind = str(payload.get("workspace_kind") or "business")
    currency = str(payload.get("currency") or "KES")
    prompt = str(payload.get("prompt") or "").strip()

    if kind == "developer":
        return _analyze_developer(payload)
    if kind == "personal":
        return _analyze_personal(payload, currency, prompt)
    return build_strategic_business_response(payload, currency, prompt)


def _analyze_personal(payload: dict[str, Any], currency: str, prompt: str) -> dict[str, Any]:
    income_minor = int(payload.get("recorded_income_minor") or 0)
    expenses_minor = int(payload.get("recorded_expenses_minor") or 0)
    net_minor = income_minor - expenses_minor
    obligations = list(payload.get("obligations") or [])
    events = list(payload.get("calendar_events") or [])
    savings_bps = round((net_minor / income_minor) * 10000) if income_minor > 0 else None
    bills_minor = sum(int(o.get("amount_minor") or 0) for o in obligations)

    lines = [
        f"**Personal CFO & Schedule Brief ({currency}):**",
        f"• **Cash Flow:** Recorded income {_fmt_money(income_minor, currency)} vs spending {_fmt_money(expenses_minor, currency)} (net {_fmt_money(net_minor, currency)}"
        + (f", **{savings_bps / 100:.1f}% savings rate**)." if savings_bps is not None else ")."),
        f"• **Recurring Bills & Subscriptions:** {len(obligations)} active ({_fmt_money(bills_minor, currency)} committed).",
        f"• **Schedule & Scope:** {len(events)} upcoming appointment(s) · Linked Developer workspace bridge active (Business workspaces remain isolated).",
    ]
    if savings_bps is not None and savings_bps < 1500:
        lines.append(
            "• **Advisory Note:** Your recorded savings rate is below 15%. Auditing recurring subscriptions and setting a weekly discretionary cap is the quickest way to widen your buffer."
        )
    recs = [
        {
            "title": "Schedule a personal budget & subscription audit",
            "action_prompt": 'Schedule a meeting for "Monthly Personal Budget Review" tomorrow at 9am',
        },
        {
            "title": "Check linked Developer sandbox health",
            "action_prompt": "Check my linked Developer workspace API health",
        },
    ]
    return {"summary": "\n".join(lines), "recommended_actions": recs}


def _analyze_developer(payload: dict[str, Any]) -> dict[str, Any]:
    apps = list(payload.get("applications") or [])
    active_creds = int(payload.get("active_credentials_count") or 0)
    recent_reqs = int(payload.get("recent_requests_count") or 0)
    err_reqs = int(payload.get("error_requests_count") or 0)
    webhooks = int(payload.get("webhooks_count") or 0)
    failed_deliv = int(payload.get("failed_deliveries_count") or 0)
    err_rate = f"{(err_reqs / recent_reqs) * 100:.1f}%" if recent_reqs > 0 else "0.0%"

    lines = [
        "**Developer Sandbox & Reliability Diagnosis:**",
        f"• **Applications:** {len(apps)} registered · {active_creds} active scoped API key(s) (secrets redacted).",
        f"• **API Traffic:** {recent_reqs} recent sandbox call(s), {err_reqs} 4xx/5xx error(s) ({err_rate} error rate).",
        f"• **Webhooks:** {webhooks} endpoint(s), {failed_deliv} failed/dead-letter delivery attempt(s).",
    ]
    if err_reqs > 0 or failed_deliv > 0:
        lines.append("• **Recommended Fix:** Inspect recent non-2xx request payloads and retry dead-letter webhook deliveries.")
    return {"summary": "\n".join(lines), "recommended_actions": []}
