"""Computer Use Sandbox Clone & Execution Trace Generator for AfriCore Autonomous Agent.

Builds deterministic, observable multi-step UI interaction traces AND authentic
`sandbox_clone` blueprints so the right-side green Computer Use Sandbox renders a realistic
clone of the target AfriCore page (Calendar, Work Projects, CRM Pipeline, Invoices,
Expenses, Customers, Notifications, Developer Apps) before the user clicks Approve.
"""
from __future__ import annotations

from typing import Any


PAGE_CLONE_MAP: dict[str, dict[str, str]] = {
    "schedule_meeting": {
        "clone_kind": "calendar",
        "page_title": "AfriCore Calendar",
        "section_label": "Schedule & Team Availability",
        "primary_cta": "Approve & Send to Calendar",
    },
    "create_project": {
        "clone_kind": "work",
        "page_title": "AfriCore Work · Projects",
        "section_label": "Kanban Board & Deliverables",
        "primary_cta": "Approve & Create in Work",
    },
    "create_task": {
        "clone_kind": "work",
        "page_title": "AfriCore Work · My Tasks",
        "section_label": "Project Task Board",
        "primary_cta": "Approve & Add Task",
    },
    "create_crm_lead": {
        "clone_kind": "crm",
        "page_title": "Customer Relationships · Pipeline",
        "section_label": "Leads & Deals Board",
        "primary_cta": "Approve & Add to CRM",
    },
    "create_customer": {
        "clone_kind": "customers",
        "page_title": "Customers Directory",
        "section_label": "Canonical Contact Registry",
        "primary_cta": "Approve & Save Contact",
    },
    "create_draft_invoice": {
        "clone_kind": "invoices",
        "page_title": "Invoices · Draft Composer",
        "section_label": "Safe Draft Preparation",
        "primary_cta": "Approve & Save Draft Invoice",
    },
    "record_expense": {
        "clone_kind": "expenses",
        "page_title": "Expenses Ledger",
        "section_label": "Recorded Outflows",
        "primary_cta": "Approve & Record Expense",
    },
    "record_personal_income": {
        "clone_kind": "expenses",
        "page_title": "Personal Income Ledger",
        "section_label": "Recorded Income",
        "primary_cta": "Approve & Record Income",
    },
    "create_obligation": {
        "clone_kind": "expenses",
        "page_title": "Cash Flow · Recurring Obligations",
        "section_label": "Upcoming Bills & Subscriptions",
        "primary_cta": "Approve & Save Reminder",
    },
    "send_workspace_reply": {
        "clone_kind": "notifications",
        "page_title": "Workspace Notifications",
        "section_label": "Team Broadcast & Replies",
        "primary_cta": "Approve & Send Notice",
    },
    "create_developer_application": {
        "clone_kind": "developer",
        "page_title": "Developer Console · My Applications",
        "section_label": "Sandbox Application Registry",
        "primary_cta": "Approve & Register App",
    },
}


def build_sandbox_clone_blueprint(
    tool: dict[str, Any],
    params: dict[str, Any],
    currency: str = "KES",
    chained_actions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    meta = PAGE_CLONE_MAP.get(
        tool["id"],
        {
            "clone_kind": "intelligence",
            "page_title": tool.get("target_tab", "Workspace"),
            "section_label": tool.get("name", "Agent Operation"),
            "primary_cta": "Approve & Send to Workspace",
        },
    )

    editable_fields: list[dict[str, Any]] = []
    tid = tool["id"]
    if tid == "schedule_meeting":
        editable_fields = [
            {"key": "title", "label": "Meeting title", "type": "text", "value": str(params.get("title") or "Team Strategy Sync")},
            {"key": "preferred_hour", "label": "Start hour (0–23)", "type": "number", "value": int(params.get("preferred_hour") if params.get("preferred_hour") is not None else 10)},
            {"key": "duration_minutes", "label": "Duration (min)", "type": "number", "value": int(params.get("duration_minutes") or 45)},
            {"key": "location", "label": "Location / Room", "type": "text", "value": str(params.get("location") or "Workspace Meeting Room")},
            {"key": "description", "label": "Agenda & notes", "type": "textarea", "value": str(params.get("description") or "")},
        ]
    elif tid == "create_project":
        editable_fields = [
            {"key": "name", "label": "Project name", "type": "text", "value": str(params.get("name") or "Q4 Growth Project")},
            {"key": "starter_task", "label": "Kickoff task", "type": "text", "value": str(params.get("starter_task") or f"Kickoff checklist for {params.get('name') or 'Project'}")},
            {"key": "priority", "label": "Priority", "type": "text", "value": str(params.get("priority") or "normal")},
        ]
    elif tid == "create_task":
        editable_fields = [
            {"key": "title", "label": "Task title", "type": "text", "value": str(params.get("title") or "Follow-up action item")},
            {"key": "priority", "label": "Priority", "type": "text", "value": str(params.get("priority") or "normal")},
        ]
    elif tid == "create_crm_lead":
        editable_fields = [
            {"key": "title", "label": "Opportunity title", "type": "text", "value": str(params.get("title") or "Inbound Lead")},
            {"key": "customer_name", "label": "Customer / Account", "type": "text", "value": str(params.get("customer_name") or params.get("title") or "Account")},
            {"key": "amount_minor", "label": f"Value ({currency} minor)", "type": "number", "value": int(params.get("amount_minor") or 0)},
        ]
    elif tid == "create_draft_invoice":
        editable_fields = [
            {"key": "customer_name", "label": "Customer", "type": "text", "value": str(params.get("customer_name") or "Workspace Client")},
            {"key": "description", "label": "Line item", "type": "text", "value": str(params.get("description") or "Professional services")},
            {"key": "amount_minor", "label": f"Amount ({currency} minor)", "type": "number", "value": int(params.get("amount_minor") or 15000)},
        ]
    elif tid in ("record_expense", "record_personal_income", "create_obligation"):
        editable_fields = [
            {"key": "description", "label": "Description", "type": "text", "value": str(params.get("description") or "Workspace entry")},
            {"key": "amount_minor", "label": f"Amount ({currency} minor)", "type": "number", "value": int(params.get("amount_minor") or 15000)},
            {"key": "category", "label": "Category", "type": "text", "value": str(params.get("category") or "general")},
        ]
    elif tid == "create_customer":
        editable_fields = [
            {"key": "name", "label": "Customer name", "type": "text", "value": str(params.get("name") or "New Contact")},
            {"key": "email", "label": "Email", "type": "text", "value": str(params.get("email") or "")},
            {"key": "phone", "label": "Phone", "type": "text", "value": str(params.get("phone") or "")},
        ]
    elif tid == "send_workspace_reply":
        editable_fields = [
            {"key": "title", "label": "Subject", "type": "text", "value": str(params.get("title") or "Workspace Update")},
            {"key": "body", "label": "Message", "type": "text", "value": str(params.get("body") or "")},
        ]
    elif tid == "create_developer_application":
        editable_fields = [
            {"key": "name", "label": "App name", "type": "text", "value": str(params.get("name") or "Agent Sandbox App")},
        ]

    return {
        "clone_kind": meta["clone_kind"],
        "page_title": meta["page_title"],
        "section_label": meta["section_label"],
        "primary_cta": meta["primary_cta"],
        "tool_id": tool["id"],
        "target_tab": tool["target_tab"],
        "target_app": tool.get("target_app"),
        "currency": currency,
        "staged_params": params,
        "editable_fields": editable_fields,
        "chained_actions": [
            {
                "tool_id": act["tool"]["id"],
                "tool_name": act["tool"]["name"],
                "target_tab": act["tool"]["target_tab"],
                "params": act["params"],
            }
            for act in (chained_actions or [])
        ],
    }


def build_approval_preview_steps(
    boundary: dict[str, Any],
    tool: dict[str, Any],
    params: dict[str, Any],
    chained_actions: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    preview_fields: dict[str, Any] = {}
    for k, v in params.items():
        if isinstance(v, (str, int, bool)):
            preview_fields[k] = v
        elif isinstance(v, list) and v and all(isinstance(x, str) for x in v):
            preview_fields[k] = ", ".join(v[:4])
        else:
            preview_fields[k] = str(v)

    app_kw = {"target_app": tool["target_app"]} if tool.get("target_app") else {}
    chain_note = (
        f" (+{len(chained_actions)} chained step(s) queued)"
        if chained_actions
        else ""
    )

    return [
        {
            "step_index": 1,
            "phase": "observe",
            "label": "Boot Isolated Sandbox Clone",
            "detail": f"{boundary.get('isolation_label', 'Sandboxed')} locked. Cloned {tool['target_tab']} into isolated staging view.",
            "target_tab": tool["target_tab"],
            **app_kw,
            "target_element": "Sandbox Isolation Header",
            "cursor_hint": {"x_pct": 22, "y_pct": 16},
            "status": "completed",
            "duration_ms": 65,
        },
        {
            "step_index": 2,
            "phase": "navigate",
            "label": f"Open Cloned {tool['target_tab']} Surface",
            "detail": f"Focused interactive composer inside sandbox without touching live {tool['target_tab']} records.",
            "target_tab": tool["target_tab"],
            **app_kw,
            "target_element": f"{tool['target_tab']} Composer",
            "cursor_hint": {"x_pct": 68, "y_pct": 28},
            "status": "completed",
            "duration_ms": 110,
        },
        {
            "step_index": 3,
            "phase": "input",
            "label": f"Populate {tool['name']} in Sandbox",
            "detail": f"Filled validated fields on the cloned {tool['target_tab']} screen{chain_note}.",
            "target_tab": tool["target_tab"],
            **app_kw,
            "target_element": "Staged Form Fields",
            "cursor_hint": {"x_pct": 46, "y_pct": 52},
            "preview_fields": preview_fields,
            "status": "completed",
            "duration_ms": 160,
        },
        {
            "step_index": 4,
            "phase": "awaiting_approval",
            "label": f"Staged & Ready: Approve to Send to {tool['target_tab']}",
            "detail": "Review the cloned preview on the right. Click Approve to commit to the live workspace and grant member visibility.",
            "target_tab": tool["target_tab"],
            **app_kw,
            "target_element": "Sandbox Approval Dock",
            "cursor_hint": {"x_pct": 58, "y_pct": 78},
            "preview_fields": preview_fields,
            "status": "pending_approval",
            "duration_ms": 0,
        },
    ]


def build_execution_steps(
    tool_id: str,
    target_tab: str,
    target_app: str | None,
    isolation_label: str,
    preview_fields: dict[str, Any],
    verify_detail: str,
) -> list[dict[str, Any]]:
    app_kw = {"target_app": target_app} if target_app else {}
    return [
        {
            "step_index": 1,
            "phase": "observe",
            "label": "Verify Workspace Isolation Boundary",
            "detail": f"{isolation_label} confirmed by Python agent runtime.",
            "target_tab": target_tab,
            **app_kw,
            "target_element": "Workspace Isolation Shield",
            "cursor_hint": {"x_pct": 20, "y_pct": 18},
            "status": "completed",
            "duration_ms": 45,
        },
        {
            "step_index": 2,
            "phase": "navigate",
            "label": f"Open {target_tab}",
            "detail": f"Navigated workspace focus to {target_tab} for `{tool_id}`.",
            "target_tab": target_tab,
            **app_kw,
            "target_element": f"{target_tab} Action Header",
            "cursor_hint": {"x_pct": 72, "y_pct": 24},
            "status": "completed",
            "duration_ms": 95,
        },
        {
            "step_index": 3,
            "phase": "input",
            "label": "Apply Validated Parameters",
            "detail": "Committed schema-checked fields from Python planner.",
            "target_tab": target_tab,
            **app_kw,
            "target_element": "Canonical Form Composer",
            "cursor_hint": {"x_pct": 46, "y_pct": 52},
            "preview_fields": preview_fields,
            "status": "completed",
            "duration_ms": 135,
        },
        {
            "step_index": 4,
            "phase": "verify",
            "label": "Committed to Live Workspace",
            "detail": verify_detail,
            "target_tab": target_tab,
            **app_kw,
            "target_element": "Verified Live Record",
            "cursor_hint": {"x_pct": 60, "y_pct": 76},
            "status": "completed",
            "duration_ms": 105,
        },
    ]
