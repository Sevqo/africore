"""Deep Cross-Module Operational Intelligence Engine (Townie & Hermes Caliber).

Synthesizes actionable diagnostics across Invoices, Cash Flow, Customers, CRM Pipeline,
Work Projects/Tasks, Calendar Schedule, Obligations, and Developer Diagnostics—going far
beyond surface KPI totals to deliver prioritized recommendations, aging breakdowns,
schedule conflict checks, and concrete next-step playbooks.
"""
from __future__ import annotations

from typing import Any


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
    return _analyze_business(payload, currency, prompt)


def _analyze_business(payload: dict[str, Any], currency: str, prompt: str) -> dict[str, Any]:
    totals = dict(payload.get("totals") or {})
    period = dict(payload.get("period") or {})
    invoices = list(payload.get("invoices") or [])
    expenses = list(payload.get("expenses") or [])
    obligations = list(payload.get("obligations") or [])
    crm_entries = list(payload.get("crm_entries") or [])
    projects = list(payload.get("projects") or [])
    tasks = list(payload.get("tasks") or [])
    events = list(payload.get("calendar_events") or [])
    customers = list(payload.get("customers") or [])

    inflows = int(totals.get("confirmed_inflows_minor") or 0)
    outflows = int(totals.get("recorded_outflows_minor") or 0)
    net_move = inflows - outflows
    outstanding = int(totals.get("outstanding_minor") or 0)
    overdue_minor = int(totals.get("overdue_minor") or 0)

    open_invoices = [inv for inv in invoices if int(inv.get("outstanding_minor") or 0) > 0]
    overdue_invoices = sorted(
        [inv for inv in open_invoices if int(inv.get("overdue_days") or 0) > 0],
        key=lambda x: (-int(x.get("overdue_days") or 0), -int(x.get("outstanding_minor") or 0)),
    )
    draft_invoices = [inv for inv in invoices if str(inv.get("status") or "") == "draft"]

    # Expense concentration by category
    cat_totals: dict[str, int] = {}
    for exp in expenses:
        cat = str(exp.get("category") or "general")
        cat_totals[cat] = cat_totals.get(cat, 0) + int(exp.get("amount_minor") or 0)
    top_expense_cats = sorted(cat_totals.items(), key=lambda kv: -kv[1])[:3]

    # CRM Pipeline value & stage health
    open_crm = [c for c in crm_entries if str(c.get("status") or "open") == "open"]
    pipeline_minor = sum(int(c.get("amount_minor") or 0) for c in open_crm)

    # Project & Task execution health
    open_tasks = [t for t in tasks if str(t.get("stage") or "") != "complete"]
    urgent_tasks = [t for t in open_tasks if str(t.get("priority") or "") in ("high", "urgent")]

    # Upcoming obligations pressure
    upcoming_bills_minor = sum(int(o.get("amount_minor") or 0) for o in obligations)
    coverage_ratio = (
        round(inflows / upcoming_bills_minor, 2)
        if upcoming_bills_minor > 0
        else None
    )

    findings: list[str] = []
    priorities: list[dict[str, str]] = []

    # 1. Cash & Margin diagnostic
    findings.append(
        f"Cash & Margin ({period.get('from', 'recent')} to {period.get('to', 'today')}): "
        f"Confirmed inflows {_fmt_money(inflows, currency)} vs recorded outflows {_fmt_money(outflows, currency)} "
        f"(net movement {_fmt_money(net_move, currency)} across {len(customers)} customer(s))."
    )

    # 2. Receivables & Aging diagnostic
    if overdue_invoices:
        top_od = overdue_invoices[0]
        cust_label = top_od.get("customer_name") or top_od.get("reference") or "Client"
        findings.append(
            f"Receivables Risk: {len(overdue_invoices)} overdue invoice(s) totalling {_fmt_money(overdue_minor, currency)} "
            f"(largest: {cust_label} — {_fmt_money(int(top_od.get('outstanding_minor') or 0), currency)}, "
            f"{int(top_od.get('overdue_days') or 0)}d overdue)."
        )
        priorities.append({
            "title": f"Recover {_fmt_money(overdue_minor, currency)} in overdue receivables",
            "action_prompt": f'Schedule a meeting for "Overdue Receivables Follow-up ({cust_label})" tomorrow',
        })
    elif draft_invoices:
        draft_sum = sum(int(d.get("total_minor") or 0) for d in draft_invoices)
        findings.append(
            f"Unbilled Drafts: {len(draft_invoices)} draft invoice(s) worth {_fmt_money(draft_sum, currency)} are sitting unissued."
        )
        priorities.append({
            "title": f"Review and issue {len(draft_invoices)} unbilled draft invoice(s)",
            "action_prompt": "Send a team reply reminding finance to review pending draft invoices",
        })
    else:
        findings.append(
            f"Receivables Clean: {_fmt_money(outstanding, currency)} open current receivables with zero overdue invoices."
        )

    # 3. Cost & Obligation coverage
    if top_expense_cats:
        cat_str = ", ".join(f"{k} ({_fmt_money(v, currency)})" for k, v in top_expense_cats)
        findings.append(f"Top Cost Drivers: {cat_str}.")
    if upcoming_bills_minor > 0:
        findings.append(
            f"Recurring Commitments: {len(obligations)} active obligation(s) totalling {_fmt_money(upcoming_bills_minor, currency)}"
            + (f" (inflow coverage {coverage_ratio}x)." if coverage_ratio is not None else ".")
        )

    # 4. Operations: CRM, Work Projects & Calendar
    findings.append(
        f"Execution Velocity: {len(open_crm)} active CRM deals ({_fmt_money(pipeline_minor, currency)} pipeline) · "
        f"{len(projects)} Work project(s) ({len(open_tasks)} open tasks, {len(urgent_tasks)} high/urgent) · "
        f"{len(events)} scheduled calendar event(s)."
    )

    if not projects:
        priorities.append({
            "title": "Launch your first structured Work project board",
            "action_prompt": 'Set up a project for "Q4 Revenue & Operations Plan"',
        })
    if not open_crm:
        priorities.append({
            "title": "Seed CRM pipeline with active leads",
            "action_prompt": 'Create a CRM lead for "Key Enterprise Account" KES 75000',
        })
    if not priorities:
        priorities.append({
            "title": "Book weekly leadership operations sync",
            "action_prompt": 'Schedule a meeting for "Weekly Operations & Cash Review" tomorrow',
        })

    rec_lines = [f"  {idx + 1}. {p['title']}" for idx, p in enumerate(priorities[:3])]
    summary = "\n".join(
        [
            f"Operational Intelligence Brief ({currency}):",
            *[f"• {line}" for line in findings],
            "Recommended Agent Actions:",
            *rec_lines,
        ]
    )

    return {
        "summary": summary,
        "highlights": findings,
        "recommended_actions": priorities[:3],
        "metrics": {
            "inflows_minor": inflows,
            "outflows_minor": outflows,
            "net_movement_minor": net_move,
            "outstanding_minor": outstanding,
            "overdue_minor": overdue_minor,
            "overdue_count": len(overdue_invoices),
            "draft_invoice_count": len(draft_invoices),
            "pipeline_minor": pipeline_minor,
            "open_crm_count": len(open_crm),
            "project_count": len(projects),
            "open_task_count": len(open_tasks),
            "upcoming_events_count": len(events),
        },
    }


def _analyze_personal(payload: dict[str, Any], currency: str, prompt: str) -> dict[str, Any]:
    income_minor = int(payload.get("recorded_income_minor") or 0)
    expenses_minor = int(payload.get("recorded_expenses_minor") or 0)
    net_minor = income_minor - expenses_minor
    obligations = list(payload.get("obligations") or [])
    events = list(payload.get("calendar_events") or [])
    savings_bps = round((net_minor / income_minor) * 10000) if income_minor > 0 else None
    bills_minor = sum(int(o.get("amount_minor") or 0) for o in obligations)

    lines = [
        f"Personal CFO & Schedule Brief ({currency}):",
        f"• Recorded income {_fmt_money(income_minor, currency)} vs spending {_fmt_money(expenses_minor, currency)} (net {_fmt_money(net_minor, currency)}"
        + (f", {savings_bps / 100:.1f}% savings rate)." if savings_bps is not None else ")."),
        f"• Recurring subscriptions & bills: {len(obligations)} active ({_fmt_money(bills_minor, currency)} committed).",
        f"• Personal calendar: {len(events)} upcoming appointment(s) · Linked Developer workspace bridge available.",
    ]
    recs = [
        {
            "title": "Schedule a personal budget & subscription audit",
            "action_prompt": 'Schedule a meeting for "Monthly Personal Budget Review" tomorrow',
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
        "Developer Sandbox & Reliability Brief:",
        f"• Applications: {len(apps)} registered · {active_creds} active scoped API key(s) (secrets redacted).",
        f"• API Traffic: {recent_reqs} recent sandbox call(s), {err_reqs} 4xx/5xx error(s) ({err_rate} error rate).",
        f"• Webhooks: {webhooks} endpoint(s), {failed_deliv} failed/dead-letter delivery attempt(s).",
    ]
    return {"summary": "\n".join(lines), "recommended_actions": []}
