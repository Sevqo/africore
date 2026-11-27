"""Hermes & Townie-Caliber Question-Aware Strategic Advisor for AfriCore Python Agent.

Unlike generic KPI dumps, this module classifies the user's actual conversational question
(e.g., sales growth & winning customers, cashflow & pricing, receivables & collections,
team execution & bottlenecks, or strategic diagnosis), cross-references real workspace
records (customers, products, orders, quotations, invoices, CRM deals, Work projects,
calendar schedule), and synthesizes a thoughtful, direct, human-grade strategic response
with tailored playbooks and one-click executable actions.
"""
from __future__ import annotations

import re
from typing import Any


def _fmt_money(minor: int, currency: str) -> str:
    divisor = 1 if currency in ("UGX", "RWF") else 100
    val = minor / divisor
    if divisor == 1:
        return f"{currency} {int(round(val)):,}"
    return f"{currency} {val:,.2f}"


def classify_strategic_lens(prompt: str) -> str:
    p = (prompt or "").lower()
    if re.search(
        r"\b(sales|sell|selling|more customers|get customers|win customers|acquire|acquisition|grow|growth|marketing|leads|pipeline|revenue|conversion|expand|upsell|retention)\b",
        p,
    ):
        return "growth_and_customers"
    if re.search(r"\b(overdue|receivable|collect|collection|unpaid|late payment|aging|debtors)\b", p):
        return "receivables_and_collections"
    if re.search(r"\b(cost|expense|spend|burn|margin|profit|save|cut|overhead|budget|bill|obligation)\b", p):
        return "margin_and_costs"
    if re.search(r"\b(project|task|team|productivity|execution|deliver|deadline|bottleneck|delay)\b", p):
        return "execution_and_velocity"
    if re.search(r"\b(think of the business|how is it|how are we|fairing|faring|improve|make it much better|advice|strategy|opinion)\b", p):
        return "holistic_advisory"
    return "operational_pulse"


def build_strategic_business_response(payload: dict[str, Any], currency: str, prompt: str) -> dict[str, Any]:
    lens = classify_strategic_lens(prompt)
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
    products = list(payload.get("products") or [])
    quotations = list(payload.get("quotations") or [])
    orders = list(payload.get("orders") or [])

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
    paid_invoices = [inv for inv in invoices if str(inv.get("status") or "") == "paid" or (int(inv.get("total_minor") or 0) > 0 and int(inv.get("outstanding_minor") or 0) == 0)]

    open_crm = [c for c in crm_entries if str(c.get("status") or "open") == "open"]
    pipeline_minor = sum(int(c.get("amount_minor") or 0) for c in open_crm)

    open_tasks = [t for t in tasks if str(t.get("stage") or "") != "complete" and str(t.get("status") or "") != "completed"]
    urgent_tasks = [t for t in open_tasks if str(t.get("priority") or "") in ("high", "urgent")]

    cust_count = len(customers)
    customer_names = [
        str(c.get("name") or "").strip()
        for c in customers
        if str(c.get("name") or "").strip()
    ][:4]
    avg_revenue_per_customer = round(inflows / cust_count) if cust_count > 0 and inflows > 0 else 0

    cat_totals: dict[str, int] = {}
    for exp in expenses:
        cat = str(exp.get("category") or "general")
        cat_totals[cat] = cat_totals.get(cat, 0) + int(exp.get("amount_minor") or 0)
    top_expense_cats = sorted(cat_totals.items(), key=lambda kv: -kv[1])[:3]
    upcoming_bills_minor = sum(int(o.get("amount_minor") or 0) for o in obligations)

    metrics = {
        "lens": lens,
        "inflows_minor": inflows,
        "outflows_minor": outflows,
        "net_movement_minor": net_move,
        "outstanding_minor": outstanding,
        "overdue_minor": overdue_minor,
        "overdue_count": len(overdue_invoices),
        "draft_invoice_count": len(draft_invoices),
        "pipeline_minor": pipeline_minor,
        "open_crm_count": len(open_crm),
        "customer_count": cust_count,
        "product_count": len(products),
        "quotation_count": len(quotations),
        "order_count": len(orders),
        "project_count": len(projects),
        "open_task_count": len(open_tasks),
        "upcoming_events_count": len(events),
    }

    # --- LENS 1: GROWTH, SALES & CUSTOMER ACQUISITION / HOLISTIC BUSINESS ADVISORY ---
    if lens in ("growth_and_customers", "holistic_advisory"):
        paragraphs: list[str] = []
        priorities: list[dict[str, str]] = []

        # 1. Honest, grounded diagnosis of how the business is actually doing
        if inflows > 0 and overdue_minor == 0:
            cust_phrase = (
                f"{cust_count} active customer{'s' if cust_count != 1 else ''}"
                + (f" ({', '.join(customer_names[:2])})" if customer_names else "")
            )
            arpc_note = (
                f" — averaging {_fmt_money(avg_revenue_per_customer, currency)} per customer"
                if avg_revenue_per_customer > 0 and cust_count > 0
                else ""
            )
            paragraphs.append(
                f"**How your business is faring right now:** You have a clean, healthy collection foundation — "
                f"{_fmt_money(inflows, currency)} in confirmed inflows across {cust_phrase}{arpc_note}, with **zero overdue receivables** "
                f"and {_fmt_money(outflows, currency)} in recorded outflows."
            )
        elif inflows > 0 and overdue_minor > 0:
            top_od = overdue_invoices[0]
            od_cust = top_od.get("customer_name") or top_od.get("reference") or "a client"
            paragraphs.append(
                f"**How your business is faring right now:** Demand is proven ({_fmt_money(inflows, currency)} collected across {cust_count} customer(s)), "
                f"but {_fmt_money(overdue_minor, currency)} is currently stuck in {len(overdue_invoices)} overdue invoice(s) (led by **{od_cust}**)."
            )
        else:
            paragraphs.append(
                f"**How your business is faring right now:** You are in an early commercial ramp-up phase ({cust_count} registered customer(s), "
                f"{_fmt_money(inflows, currency)} confirmed inflows so far, and {_fmt_money(outstanding, currency)} in open receivables)."
            )

        # 2. Bottleneck diagnosis (why growth isn't compounding faster yet)
        bottlenecks: list[str] = []
        if cust_count <= 3 and inflows > 0:
            bottlenecks.append(
                f"**High customer concentration:** All {_fmt_money(inflows, currency)} of revenue comes from just {cust_count or 1} buyer(s). Losing one account would materially hit cash flow, while adding even 3–5 similar accounts would more than double revenue."
            )
        if len(open_crm) == 0:
            bottlenecks.append(
                "**Empty top-of-funnel pipeline:** You have **0 active deals in CRM** and "
                + (f"{len(quotations)} active quotation(s)." if quotations else "no outbound quotations in flight — meaning next month's sales rely onreactive orders rather than a repeatable funnel.")
            )
        else:
            bottlenecks.append(
                f"**Active pipeline ready to close:** You have {len(open_crm)} open CRM deal(s) worth {_fmt_money(pipeline_minor, currency)} — accelerating stage conversion is your fastest lever for immediate revenue."
            )
        if draft_invoices:
            draft_sum = sum(int(d.get("total_minor") or 0) for d in draft_invoices)
            bottlenecks.append(
                f"**Unbilled revenue sitting in drafts:** {len(draft_invoices)} draft invoice(s) ({_fmt_money(draft_sum, currency)}) haven't been sent to customers yet."
            )
        if outflows == 0 and inflows > 0:
            bottlenecks.append(
                "**Unrecorded operating costs:** Outflows currently read zero, so true net margin per product/customer is masked until supplier, marketing, or delivery expenses are logged."
            )

        if bottlenecks:
            paragraphs.append("**Key growth bottlenecks I see in your workspace:**\n" + "\n".join(f"• {b}" for b in bottlenecks[:3]))

        # 3. Tailored, concrete playbook to grow sales & win more customers
        playbook: list[str] = []
        if cust_count > 0:
            ref_target = customer_names[0] if customer_names else "your existing buyers"
            playbook.append(
                f"**1. Reactivate & referral-loop {ref_target}:** Your existing customers already trust you and pay on time ({len(paid_invoices)} settled invoice(s)). Reach out with a bundled repeat-order offer and ask each for 2 warm introductions in their network."
            )
        else:
            playbook.append(
                "**1. Land your first 5 anchor prospects in CRM:** Build a focused list of 5 target buyers, log each with a clear deal value in CRM, and schedule discovery calls this week."
            )

        if len(open_crm) == 0:
            playbook.append(
                "**2. Stand up a weekly outbound CRM target:** Commit to logging at least 5 qualified leads per week in AfriCore CRM and sending structured Sales Quotations within 24 hours of inquiry."
            )
            priorities.append({
                "title": "Create a Q4 Customer Acquisition project",
                "action_prompt": 'Set up a project for "Q4 Sales & Customer Acquisition" and schedule a kickoff meeting tomorrow at 10am',
            })
            priorities.append({
                "title": "Seed first target account in CRM",
                "action_prompt": 'Create a CRM lead for "New Retail Partner" KES 75000',
            })
        else:
            playbook.append(
                f"**2. Close your {_fmt_money(pipeline_minor, currency)} open CRM pipeline:** Run a 48-hour follow-up blitz on your {len(open_crm)} open opportunity/ies with time-bound quotation incentives."
            )
            priorities.append({
                "title": "Schedule CRM pipeline closing review",
                "action_prompt": 'Schedule a meeting for "Sales Pipeline & Closing Review" tomorrow at 10am',
            })

        if len(products) == 0:
            playbook.append(
                "**3. Publish standardized catalog tiers & public booking:** Add clear product/service packages in Catalog/Sales and activate a public Calendar appointment link so prospects can book consultations frictionlessly."
            )
        else:
            playbook.append(
                f"**3. Bundle your {len(products)} catalog item(s) for higher order value:** Pair your top-selling item with a recurring retainer or volume tier to lift average ticket size above {_fmt_money(max(avg_revenue_per_customer, 2500000), currency)}."
            )

        if overdue_invoices:
            top_od = overdue_invoices[0]
            cust_label = top_od.get("customer_name") or top_od.get("reference") or "Client"
            priorities.insert(0, {
                "title": f"Recover {_fmt_money(overdue_minor, currency)} overdue ({cust_label})",
                "action_prompt": f'Schedule a meeting for "Receivables Follow-up: {cust_label}" tomorrow at 11am',
            })
        elif len(priorities) < 3:
            priorities.append({
                "title": "Schedule customer growth strategy session",
                "action_prompt": 'Schedule a meeting for "Customer Growth & Referral Strategy" tomorrow at 2pm',
            })

        paragraphs.append("**Concrete plan to grow sales & win more customers:**\n" + "\n".join(playbook))
        paragraphs.append(
            "Want me to put this into motion right now? Tell me to **set up a Q4 Sales & Customer Acquisition project**, "
            "**log your target leads in CRM**, or **schedule a growth planning session** with your team."
        )

        summary = "\n\n".join(paragraphs)
        return {
            "summary": summary,
            "highlights": bottlenecks + playbook,
            "recommended_actions": priorities[:3],
            "metrics": metrics,
        }

    # --- LENS 2: RECEIVABLES & COLLECTIONS ---
    if lens == "receivables_and_collections":
        lines: list[str] = []
        priorities = []
        if overdue_invoices:
            lines.append(
                f"**Receivables & Collections Diagnosis:** You have **{len(overdue_invoices)} overdue invoice(s)** totalling **{_fmt_money(overdue_minor, currency)}** out of {_fmt_money(outstanding, currency)} total open receivables."
            )
            for inv in overdue_invoices[:4]:
                cname = inv.get("customer_name") or inv.get("reference") or "Customer"
                amt = _fmt_money(int(inv.get("outstanding_minor") or 0), currency)
                days = int(inv.get("overdue_days") or 0)
                lines.append(f"• **{cname}** — {amt} ({days} days past due)")
            top_od = overdue_invoices[0]
            top_name = top_od.get("customer_name") or top_od.get("reference") or "Client"
            lines.append(
                f"\n**Recommended Action:** Prioritize **{top_name}** today with a direct payment link reminder and book a 15-minute settlement check-in."
            )
            priorities.append({
                "title": f"Schedule collection call for {top_name}",
                "action_prompt": f'Schedule a meeting for "Overdue Invoice Settlement: {top_name}" tomorrow at 10am',
            })
        else:
            lines.append(
                f"**Receivables Status — Clean:** You have **zero overdue invoices** right now ({_fmt_money(outstanding, currency)} in current open receivables, {_fmt_money(inflows, currency)} already collected)."
            )
            if draft_invoices:
                draft_sum = sum(int(d.get("total_minor") or 0) for d in draft_invoices)
                lines.append(
                    f"However, you have **{len(draft_invoices)} unissued draft invoice(s)** worth **{_fmt_money(draft_sum, currency)}** waiting to be sent out."
                )
                priorities.append({
                    "title": f"Notify finance to issue {len(draft_invoices)} draft invoice(s)",
                    "action_prompt": "Send a team reply reminding finance to review and issue pending draft invoices",
                })
        return {
            "summary": "\n".join(lines),
            "highlights": lines,
            "recommended_actions": priorities[:3],
            "metrics": metrics,
        }

    # --- LENS 3: MARGIN, COSTS & CASH FLOW ---
    if lens == "margin_and_costs":
        lines = [
            f"**Cash Flow & Margin Analysis ({period.get('from', 'recent')} – {period.get('to', 'today')}):**",
            f"• **Net Cash Movement:** {_fmt_money(net_move, currency)} ({_fmt_money(inflows, currency)} confirmed inflows vs {_fmt_money(outflows, currency)} recorded outflows).",
        ]
        if top_expense_cats:
            cats = ", ".join(f"**{k}** ({_fmt_money(v, currency)})" for k, v in top_expense_cats)
            lines.append(f"• **Largest Cost Drivers:** {cats}.")
        else:
            lines.append("• **Expense Tracking Gap:** No expenses have been recorded in this window yet — logging rent, payroll, inventory, and software outflows will unlock accurate net margin tracking.")
        if upcoming_bills_minor > 0:
            lines.append(f"• **Upcoming Commitments:** {len(obligations)} recurring obligation(s) totalling {_fmt_money(upcoming_bills_minor, currency)}.")
        priorities = [
            {
                "title": "Run a conservative 30-day cash-flow forecast",
                "action_prompt": "Run a conservative 30-day cash-flow forecast",
            },
            {
                "title": "Schedule a monthly cost & margin review",
                "action_prompt": 'Schedule a meeting for "Monthly Cost & Margin Audit" tomorrow at 11am',
            },
        ]
        return {
            "summary": "\n".join(lines),
            "highlights": lines,
            "recommended_actions": priorities,
            "metrics": metrics,
        }

    # --- DEFAULT / EXECUTIVE OPERATIONAL PULSE (still concise, sharp & non-generic) ---
    findings: list[str] = []
    priorities = []

    findings.append(
        f"**Cash & Revenue ({period.get('from', 'recent')} to {period.get('to', 'today')}):** "
        f"{_fmt_money(inflows, currency)} confirmed inflows vs {_fmt_money(outflows, currency)} outflows "
        f"(net {_fmt_money(net_move, currency)} across {cust_count} customer(s))."
    )

    if overdue_invoices:
        top_od = overdue_invoices[0]
        cust_label = top_od.get("customer_name") or top_od.get("reference") or "Client"
        findings.append(
            f"**Receivables Attention:** {len(overdue_invoices)} overdue invoice(s) totalling {_fmt_money(overdue_minor, currency)} "
            f"(largest: **{cust_label}** — {_fmt_money(int(top_od.get('outstanding_minor') or 0), currency)}, {int(top_od.get('overdue_days') or 0)}d overdue)."
        )
        priorities.append({
            "title": f"Follow up on {_fmt_money(overdue_minor, currency)} overdue ({cust_label})",
            "action_prompt": f'Schedule a meeting for "Overdue Receivables Follow-up ({cust_label})" tomorrow at 10am',
        })
    elif draft_invoices:
        draft_sum = sum(int(d.get("total_minor") or 0) for d in draft_invoices)
        findings.append(
            f"**Unbilled Drafts:** {len(draft_invoices)} draft invoice(s) worth {_fmt_money(draft_sum, currency)} ready for review."
        )
        priorities.append({
            "title": f"Remind team to issue {len(draft_invoices)} draft invoice(s)",
            "action_prompt": "Send a team reply reminding finance to review pending draft invoices",
        })
    else:
        findings.append(
            f"**Receivables Clean:** {_fmt_money(outstanding, currency)} current receivables with zero overdue bills."
        )

    if top_expense_cats:
        cat_str = ", ".join(f"{k} ({_fmt_money(v, currency)})" for k, v in top_expense_cats)
        findings.append(f"**Top Cost Categories:** {cat_str}.")

    findings.append(
        f"**Pipeline & Delivery:** {len(open_crm)} open CRM deal(s) ({_fmt_money(pipeline_minor, currency)}) · "
        f"{len(projects)} active project(s) ({len(open_tasks)} open tasks, {len(urgent_tasks)} urgent) · "
        f"{len(events)} upcoming meeting(s)."
    )

    if not open_crm:
        findings.append(
            "**Strategic Opportunity:** Your CRM pipeline is empty — building an active lead funnel is the highest-leverage move to grow revenue beyond your current customer base."
        )
        priorities.append({
            "title": "Seed CRM pipeline with a target account",
            "action_prompt": 'Create a CRM lead for "Key Enterprise Account" KES 75000',
        })
    if not projects:
        priorities.append({
            "title": "Launch Q4 Revenue & Operations project",
            "action_prompt": 'Set up a project for "Q4 Revenue & Operations Plan"',
        })
    if len(priorities) < 3:
        priorities.append({
            "title": "Book weekly leadership operations sync",
            "action_prompt": 'Schedule a meeting for "Weekly Operations & Growth Sync" tomorrow at 10am',
        })

    rec_lines = [f"  {idx + 1}. {p['title']}" for idx, p in enumerate(priorities[:3])]
    summary = "\n".join(
        [
            f"**Workspace Executive Diagnosis ({currency}):**",
            *[f"• {line}" for line in findings],
            "\n**Highest-Leverage Next Steps:**",
            *rec_lines,
        ]
    )
    return {
        "summary": summary,
        "highlights": findings,
        "recommended_actions": priorities[:3],
        "metrics": metrics,
    }
