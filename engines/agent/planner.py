"""Python Autonomous Agent Planner, Tool Catalog & Guardrail Policy Engine.

Owns:
- Workspace-scoped tool catalog (Business / Personal / Developer)
- Natural-language intent routing & typed parameter extraction (zero hallucination)
- Restraint-first owner permission evaluation (disabled / approval_required / autonomous)
- Optional OpenAI Responses API reasoning refinement (stdlib urllib, only with explicit consent)
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

from agent.billing import AGENT_CREDIT_COSTS
from agent.computer_use import build_approval_preview_steps
from agent.isolation import check_target_access, evaluate_boundary

TOOL_CATALOG: list[dict[str, Any]] = [
    {
        "id": "analyze_business",
        "name": "Analyze business performance",
        "description": "Inspect receivables, recorded outflows, net movement, CRM pipeline, projects, and upcoming bills to produce an executive business brief.",
        "category": "analysis",
        "access_kind": "read",
        "workspace_kinds": ["business"],
        "required_capability": "read",
        "default_permission": "autonomous",
        "credit_category": "analysis_read",
        "target_tab": "Intelligence",
    },
    {
        "id": "forecast_cashflow",
        "name": "Run cash-flow forecast",
        "description": "Compute a 7, 30, 60, or 90-day scenario projection from receivables, obligations, and covered history.",
        "category": "analysis",
        "access_kind": "read",
        "workspace_kinds": ["business", "personal"],
        "required_capability": "read",
        "default_permission": "autonomous",
        "credit_category": "analysis_read",
        "target_tab": "Forecasts",
    },
    {
        "id": "schedule_meeting",
        "name": "Schedule meeting",
        "description": "Create a real timezone-aware calendar event in AfriCore Calendar and notify invited workspace members.",
        "category": "scheduling",
        "access_kind": "write",
        "workspace_kinds": ["business", "personal"],
        "required_capability": "operations",
        "default_permission": "approval_required",
        "credit_category": "tool_action",
        "target_tab": "Calendar",
        "target_app": "calendar",
    },
    {
        "id": "create_project",
        "name": "Set up project & starter tasks",
        "description": "Create a new workspace project in AfriCore Work with stages, deadline, and initial starter tasks.",
        "category": "operations",
        "access_kind": "write",
        "workspace_kinds": ["business"],
        "required_capability": "operations",
        "default_permission": "approval_required",
        "credit_category": "tool_action",
        "target_tab": "Work",
        "target_app": "work",
    },
    {
        "id": "create_task",
        "name": "Add project task",
        "description": "Create a tracked task inside an existing AfriCore Work project.",
        "category": "operations",
        "access_kind": "write",
        "workspace_kinds": ["business"],
        "required_capability": "operations",
        "default_permission": "approval_required",
        "credit_category": "tool_action",
        "target_tab": "Work",
        "target_app": "work",
    },
    {
        "id": "create_customer",
        "name": "Create customer / client",
        "description": "Register a new customer or client contact in the canonical workspace directory.",
        "category": "crm",
        "access_kind": "write",
        "workspace_kinds": ["business", "personal"],
        "required_capability": "operations",
        "default_permission": "approval_required",
        "credit_category": "tool_action",
        "target_tab": "Customers",
    },
    {
        "id": "create_crm_lead",
        "name": "Create CRM lead or follow-up",
        "description": "Log a new CRM lead, opportunity, or customer follow-up task in AfriCore CRM.",
        "category": "crm",
        "access_kind": "write",
        "workspace_kinds": ["business"],
        "required_capability": "operations",
        "default_permission": "approval_required",
        "credit_category": "tool_action",
        "target_tab": "Customer Relationships",
        "target_app": "crm",
    },
    {
        "id": "create_draft_invoice",
        "name": "Prepare draft invoice",
        "description": "Create a draft invoice for human review (never auto-issues or moves real funds without explicit review).",
        "category": "finance",
        "access_kind": "write",
        "workspace_kinds": ["business", "personal"],
        "required_capability": "finance",
        "default_permission": "approval_required",
        "credit_category": "tool_action",
        "target_tab": "Invoices",
    },
    {
        "id": "record_expense",
        "name": "Record business or personal expense",
        "description": "Record a dated expense entry with explicit integer minor units and currency.",
        "category": "finance",
        "access_kind": "write",
        "workspace_kinds": ["business", "personal"],
        "required_capability": "finance",
        "default_permission": "approval_required",
        "credit_category": "tool_action",
        "target_tab": "Expenses",
    },
    {
        "id": "create_obligation",
        "name": "Schedule recurring bill or reminder",
        "description": "Set up an upcoming bill, subscription, or recurring obligation reminder in Cash Flow.",
        "category": "finance",
        "access_kind": "write",
        "workspace_kinds": ["business", "personal"],
        "required_capability": "finance",
        "default_permission": "approval_required",
        "credit_category": "tool_action",
        "target_tab": "Cash Flow",
    },
    {
        "id": "send_workspace_reply",
        "name": "Send workspace reply / team notice",
        "description": "Post an actionable in-app update, reminder, or reply to workspace members in Notifications.",
        "category": "communication",
        "access_kind": "write",
        "workspace_kinds": ["business", "personal", "developer"],
        "required_capability": "operations",
        "default_permission": "approval_required",
        "credit_category": "tool_action",
        "target_tab": "Notifications",
    },
    {
        "id": "analyze_personal_finances",
        "name": "Analyze personal finances",
        "description": "Summarize personal recorded income, expenses, subscriptions, net movement, and upcoming obligations.",
        "category": "analysis",
        "access_kind": "read",
        "workspace_kinds": ["personal"],
        "required_capability": "read",
        "default_permission": "autonomous",
        "credit_category": "analysis_read",
        "target_tab": "Overview",
    },
    {
        "id": "record_personal_income",
        "name": "Record personal income",
        "description": "Log a manually recorded personal income entry in your Personal workspace.",
        "category": "finance",
        "access_kind": "write",
        "workspace_kinds": ["personal"],
        "required_capability": "finance",
        "default_permission": "approval_required",
        "credit_category": "tool_action",
        "target_tab": "Income",
    },
    {
        "id": "inspect_linked_developer_workspace",
        "name": "Inspect linked Developer workspace",
        "description": "Read sandbox applications, webhook status, and recent API request logs from your own linked Developer workspace (Business workspaces remain strictly blocked).",
        "category": "developer",
        "access_kind": "read",
        "workspace_kinds": ["personal", "developer"],
        "required_capability": "read",
        "default_permission": "autonomous",
        "credit_category": "analysis_read",
        "target_tab": "My Applications",
        "cross_workspace_bridge": "personal_to_developer",
    },
    {
        "id": "create_developer_application",
        "name": "Create sandbox developer application",
        "description": "Register a new sandbox API application in your Developer workspace (accessible from Developer or your linked Personal workspace; never Business).",
        "category": "developer",
        "access_kind": "write",
        "workspace_kinds": ["personal", "developer"],
        "required_capability": "operations",
        "default_permission": "approval_required",
        "credit_category": "tool_action",
        "target_tab": "My Applications",
        "cross_workspace_bridge": "personal_to_developer",
    },
    {
        "id": "inspect_developer_diagnostics",
        "name": "Diagnose API & webhook health",
        "description": "Inspect sandbox API request logs, HTTP error rates, active webhooks, and failed deliveries without exposing secrets.",
        "category": "developer",
        "access_kind": "read",
        "workspace_kinds": ["developer"],
        "required_capability": "read",
        "default_permission": "autonomous",
        "credit_category": "analysis_read",
        "target_tab": "Request Logs",
    },
    {
        "id": "inspect_linked_personal_summary",
        "name": "Inspect linked Personal workspace",
        "description": "Read a summary of your own linked Personal workspace finances and calendar (Business workspaces remain strictly blocked).",
        "category": "analysis",
        "access_kind": "read",
        "workspace_kinds": ["developer"],
        "required_capability": "read",
        "default_permission": "autonomous",
        "credit_category": "analysis_read",
        "target_tab": "Overview",
        "cross_workspace_bridge": "developer_to_personal",
    },
]


def tools_for_kind(kind: str) -> list[dict[str, Any]]:
    return [t for t in TOOL_CATALOG if kind in t["workspace_kinds"]]


def default_permissions_for_kind(kind: str) -> dict[str, str]:
    return {t["id"]: t["default_permission"] for t in tools_for_kind(kind)}


def _extract_amount_minor(prompt: str, currency: str) -> int:
    match = re.search(
        r"(?:kes|ksh|usd|eur|gbp|ugx|tzs|rwf|\$)?\s*(\d[\d,]*(?:\.\d{1,2})?)",
        prompt,
        re.IGNORECASE,
    )
    if not match:
        return 15000
    raw = match.group(1).replace(",", "")
    parts = raw.split(".")
    whole = int(parts[0])
    frac = parts[1] if len(parts) > 1 else ""
    if currency in ("UGX", "RWF"):
        minor = whole
    else:
        frac_two = (frac + "00")[:2]
        minor = whole * 100 + int(frac_two)
    if minor <= 0:
        return 15000
    return min(100_000_000_000, minor)


def _extract_title_after(prompt: str, pattern: str, fallback: str) -> str:
    quoted = re.search(r'["“]([^"”]{2,120})["”]', prompt)
    if quoted:
        return quoted.group(1).strip()
    after = re.sub(pattern, "", prompt, flags=re.IGNORECASE).strip()
    after = re.sub(r"^(?:for|about|called|named|titled|with|to)\s+", "", after, flags=re.IGNORECASE)
    cleaned = re.split(
        r"\s+(?:for\s+(?:kes|ksh|usd)|on\s+\d|at\s+\d|tomorrow|today|next\s+)",
        after,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0].strip()
    return cleaned[:140] if len(cleaned) >= 2 else fallback


def _select_tool(kind: str, available: list[dict[str, Any]], prompt: str, tool_hint: str | None) -> dict[str, Any]:
    by_id = {t["id"]: t for t in available}
    if tool_hint and tool_hint in by_id:
        return by_id[tool_hint]

    p = prompt.lower()
    if kind == "business":
        if re.search(r"\b(meet|meeting|calendar|call|sync|appointment|book|schedule)\b", p):
            return by_id["schedule_meeting"]
        if re.search(r"\b(project|roadmap|initiative|launch|workspace board)\b", p):
            return by_id["create_project"]
        if re.search(r"\b(task|todo|to-do|action item|checklist)\b", p):
            return by_id["create_task"]
        if re.search(r"\b(lead|crm|deal|opportunity|pipeline|prospect)\b", p):
            return by_id["create_crm_lead"]
        if re.search(r"\b(invoice|bill client|billing|quote)\b", p):
            return by_id["create_draft_invoice"]
        if re.search(r"\b(customer|client|contact)\b", p) and re.search(r"\b(add|create|new|register)\b", p):
            return by_id["create_customer"]
        if re.search(r"\b(expense|spent|cost|paid for|rent|utilities|receipt)\b", p):
            return by_id["record_expense"]
        if re.search(r"\b(subscription|recurring|bill reminder|obligation)\b", p):
            return by_id["create_obligation"]
        if re.search(r"\b(reply|notify|message|team|tell|announce|follow up)\b", p):
            return by_id["send_workspace_reply"]
        if re.search(r"\b(forecast|next month|90 days|60 days|cash flow projection)\b", p):
            return by_id["forecast_cashflow"]
        return by_id["analyze_business"]

    if kind == "personal":
        if re.search(r"\b(developer|dev workspace|api|webhook|sandbox app|request log)\b", p):
            if re.search(r"\b(create|new|add|register)\b", p):
                return by_id["create_developer_application"]
            return by_id["inspect_linked_developer_workspace"]
        if re.search(r"\b(meet|meeting|calendar|appointment|schedule)\b", p):
            return by_id["schedule_meeting"]
        if re.search(r"\b(income|salary|earned|freelance|received)\b", p):
            return by_id["record_personal_income"]
        if re.search(r"\b(expense|spent|bought|cost|groceries|rent)\b", p):
            return by_id["record_expense"]
        if re.search(r"\b(subscription|netflix|spotify|recurring|bill|obligation)\b", p):
            return by_id["create_obligation"]
        if re.search(r"\b(invoice)\b", p):
            return by_id["create_draft_invoice"]
        if re.search(r"\b(client|contact)\b", p) and re.search(r"\b(add|create|new)\b", p):
            return by_id["create_customer"]
        if re.search(r"\b(forecast|next month)\b", p):
            return by_id["forecast_cashflow"]
        if re.search(r"\b(reply|notify|remind|note)\b", p):
            return by_id["send_workspace_reply"]
        return by_id["analyze_personal_finances"]

    # developer workspace
    if re.search(r"\b(personal|my finances|my income|my expenses|my calendar)\b", p):
        return by_id["inspect_linked_personal_summary"]
    if re.search(r"\b(create|new|add|register)\b", p) and re.search(r"\b(app|application|sandbox)\b", p):
        return by_id["create_developer_application"]
    if re.search(r"\b(reply|notify|alert|message)\b", p):
        return by_id["send_workspace_reply"]
    return by_id["inspect_developer_diagnostics"]


def _derive_params(tool_id: str, prompt: str, currency: str) -> dict[str, Any]:
    derived: dict[str, Any] = {}
    if tool_id == "schedule_meeting":
        derived["title"] = _extract_title_after(
            prompt,
            r"^(?:please\s+)?(?:set up|schedule|book|create)\s+(?:a\s+)?(?:meeting|call|sync|appointment)\s*",
            "Team Sync Meeting",
        )
        derived["hours_from_now"] = 24 if re.search(r"tomorrow", prompt, re.I) else (2 if re.search(r"today", prompt, re.I) else 24)
        derived["duration_minutes"] = 30 if re.search(r"30\s*min", prompt, re.I) else (60 if re.search(r"60\s*min|1\s*hour", prompt, re.I) else 45)
    elif tool_id == "create_project":
        derived["name"] = _extract_title_after(
            prompt,
            r"^(?:please\s+)?(?:set up|create|start|launch)\s+(?:a\s+)?(?:new\s+)?project\s*",
            "Q4 Growth Project",
        )
    elif tool_id == "create_task":
        derived["title"] = _extract_title_after(
            prompt,
            r"^(?:please\s+)?(?:create|add)\s+(?:a\s+)?(?:new\s+)?(?:task|todo|action item)\s*",
            "Follow-up action item",
        )
    elif tool_id == "create_customer":
        derived["name"] = _extract_title_after(
            prompt,
            r"^(?:please\s+)?(?:add|create|register)\s+(?:a\s+)?(?:new\s+)?(?:customer|client|contact)\s*",
            "New Contact",
        )
    elif tool_id == "create_crm_lead":
        label = _extract_title_after(
            prompt,
            r"^(?:please\s+)?(?:add|create|log)\s+(?:a\s+)?(?:new\s+)?(?:crm\s+)?(?:lead|deal|opportunity)\s*",
            "Inbound Business Lead",
        )
        derived["title"] = label
        derived["customer_name"] = label
        if re.search(r"\d", prompt):
            derived["amount_minor"] = _extract_amount_minor(prompt, currency)
    elif tool_id == "create_draft_invoice":
        derived["customer_name"] = _extract_title_after(
            prompt,
            r"^(?:please\s+)?(?:draft|create|prepare)\s+(?:a\s+)?(?:draft\s+)?invoice\s*",
            "Workspace Client",
        )
        derived["description"] = prompt[:180]
        derived["amount_minor"] = _extract_amount_minor(prompt, currency)
    elif tool_id in ("record_expense", "record_personal_income", "create_obligation"):
        derived["description"] = prompt[:160]
        derived["amount_minor"] = _extract_amount_minor(prompt, currency)
        if re.search(r"rent", prompt, re.I):
            derived["category"] = "rent"
        elif re.search(r"software|cloud|hosting", prompt, re.I):
            derived["category"] = "software"
        elif re.search(r"subscription|netflix|spotify", prompt, re.I):
            derived["category"] = "subscriptions"
        elif re.search(r"transport|fuel|uber", prompt, re.I):
            derived["category"] = "transport"
        elif re.search(r"groceries|food", prompt, re.I):
            derived["category"] = "groceries"
        else:
            derived["category"] = "other"
    elif tool_id == "send_workspace_reply":
        derived["title"] = "Agent Workspace Update"
        derived["body"] = prompt[:500]
    elif tool_id == "create_developer_application":
        derived["name"] = _extract_title_after(
            prompt,
            r"^(?:please\s+)?(?:create|add|register)\s+(?:a\s+)?(?:new\s+)?(?:sandbox\s+)?(?:developer\s+)?(?:app|application)\s*",
            "Agent Sandbox App",
        )
    return derived


def plan_agent_run(payload: dict[str, Any]) -> dict[str, Any]:
    boundary = evaluate_boundary(payload.get("boundary_input") or {})
    source_kind = boundary["source_kind"]
    prompt = str(payload.get("prompt") or "").strip()
    currency = str(payload.get("currency") or "KES")
    tool_hint = payload.get("tool_hint")
    explicit_target = payload.get("target_workspace_id")
    explicit_params = dict(payload.get("params") or {})
    policy = dict(payload.get("policy") or {})
    computer_use_requested = bool(payload.get("computer_use", True))
    routine_id = payload.get("routine_id")
    override_mode = payload.get("override_mode")

    if explicit_target:
        verdict = check_target_access(boundary, str(explicit_target))
        if not verdict["allowed"]:
            return {
                "ok": False,
                "status": verdict["status"],
                "reason": verdict["reason"],
                "audit_violation": verdict["audit_violation"],
                "violation_target": str(explicit_target),
                "boundary": boundary,
            }

    available = tools_for_kind(source_kind)
    chosen = _select_tool(source_kind, available, prompt, tool_hint)

    target_workspace_id = str(explicit_target or boundary["source_workspace_id"])
    target_kind = source_kind
    if not explicit_target:
        bridge = chosen.get("cross_workspace_bridge")
        if bridge == "personal_to_developer" and source_kind == "personal":
            dev = next((w for w in boundary["linked_workspaces"] if w["kind"] == "developer"), None)
            if not dev:
                return {
                    "ok": False,
                    "status": 409,
                    "reason": "No linked Developer workspace found for your account. Create a Developer workspace first to bridge Personal -> Developer.",
                    "boundary": boundary,
                }
            target_workspace_id = dev["id"]
            target_kind = "developer"
        elif bridge == "developer_to_personal" and source_kind == "developer":
            pers = next((w for w in boundary["linked_workspaces"] if w["kind"] == "personal"), None)
            if not pers:
                return {
                    "ok": False,
                    "status": 409,
                    "reason": "No linked Personal workspace found for your account. Create a Personal workspace first to bridge Developer -> Personal.",
                    "boundary": boundary,
                }
            target_workspace_id = pers["id"]
            target_kind = "personal"
    else:
        matched = next((w for w in boundary["linked_workspaces"] if w["id"] == target_workspace_id), None)
        if matched:
            target_kind = matched["kind"]

    verdict = check_target_access(boundary, target_workspace_id, target_kind)
    if not verdict["allowed"]:
        return {
            "ok": False,
            "status": verdict["status"],
            "reason": verdict["reason"],
            "audit_violation": verdict["audit_violation"],
            "violation_target": target_workspace_id,
            "boundary": boundary,
        }

    # Evaluate owner permissions + autonomy mode
    permissions = dict(policy.get("permissions") or default_permissions_for_kind(source_kind))
    autonomy_mode = str(policy.get("autonomy_mode") or "supervised")
    effective_mode = str(override_mode or permissions.get(chosen["id"], chosen["default_permission"]))
    if autonomy_mode == "read_only" and chosen["access_kind"] == "write":
        effective_mode = "disabled"
    elif autonomy_mode == "autonomous" and effective_mode == "approval_required":
        effective_mode = "autonomous"

    if effective_mode == "disabled":
        return {
            "ok": False,
            "status": 403,
            "reason": f"The '{chosen['name']}' capability is disabled by the workspace owner in Agent Permissions.",
            "boundary": boundary,
        }

    params = {**_derive_params(chosen["id"], prompt, currency), **explicit_params}
    label_val = (
        params.get("title")
        or params.get("name")
        or params.get("description")
        or params.get("customer_name")
        or prompt[:120]
    )
    action_summary = f"{chosen['name']}: {label_val}"
    use_computer_use = computer_use_requested and bool(policy.get("computer_use_enabled", True))
    credit_category = (
        "routine_run"
        if routine_id
        else ("computer_use_session" if (use_computer_use and chosen["access_kind"] == "write") else chosen["credit_category"])
    )
    credits_cost = AGENT_CREDIT_COSTS[credit_category]

    preview_steps = (
        build_approval_preview_steps(boundary, chosen, params)
        if effective_mode == "approval_required"
        else []
    )

    return {
        "ok": True,
        "status": 200,
        "engine": "python_autonomous_agent_v1",
        "boundary": boundary,
        "tool": chosen,
        "target_workspace_id": target_workspace_id,
        "target_kind": target_kind,
        "params": params,
        "action_summary": action_summary,
        "execution_mode": effective_mode,
        "computer_use": use_computer_use,
        "credit_category": credit_category,
        "credits_cost": credits_cost,
        "preview_steps": preview_steps,
    }


def evaluate_permissions_update(payload: dict[str, Any]) -> dict[str, Any]:
    kind = str(payload.get("workspace_kind") or "business")
    current = dict(payload.get("current_policy") or {})
    patch = dict(payload.get("patch") or {})

    if kind == "business" and patch.get("cross_dev_bridge_enabled") is True:
        return {
            "ok": False,
            "status": 403,
            "reason": "Business workspace agents are permanently sandboxed and cannot bridge to Personal or Developer workspaces.",
        }

    allowed_ids = {t["id"] for t in tools_for_kind(kind)}
    next_permissions = {**default_permissions_for_kind(kind), **dict(current.get("permissions") or {})}
    if isinstance(patch.get("permissions"), dict):
        for tool_id, mode in patch["permissions"].items():
            if tool_id not in allowed_ids:
                return {
                    "ok": False,
                    "status": 400,
                    "reason": f"Tool '{tool_id}' is not available in {kind} workspaces",
                }
            if mode not in ("disabled", "approval_required", "autonomous"):
                return {
                    "ok": False,
                    "status": 400,
                    "reason": f"Invalid permission mode '{mode}'",
                }
            next_permissions[tool_id] = mode

    next_autonomy = patch.get("autonomy_mode") or current.get("autonomy_mode") or "supervised"
    next_cu = (
        bool(patch["computer_use_enabled"])
        if "computer_use_enabled" in patch and patch["computer_use_enabled"] is not None
        else bool(current.get("computer_use_enabled", True))
    )
    next_bridge = (
        False
        if kind == "business"
        else (
            bool(patch["cross_dev_bridge_enabled"])
            if "cross_dev_bridge_enabled" in patch and patch["cross_dev_bridge_enabled"] is not None
            else bool(current.get("cross_dev_bridge_enabled", True))
        )
    )

    return {
        "ok": True,
        "status": 200,
        "policy": {
            "autonomy_mode": next_autonomy,
            "computer_use_enabled": next_cu,
            "cross_dev_bridge_enabled": next_bridge,
            "permissions": next_permissions,
        },
    }


def optional_llm_narrative(prompt: str, summary: str, evidence: dict[str, Any], consent: bool) -> str | None:
    """Optional stdlib HTTPS call to OpenAI Responses API when explicitly consented & configured."""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    model = os.environ.get("AFRICORE_AI_MODEL", "").strip()
    if not consent or not api_key or not model or os.environ.get("AFRICORE_AI_DISABLED") == "true":
        return None
    if not re.match(r"^(gpt-4\.1-mini|gpt-4o-mini|gpt-5-mini)(-\d{4}-\d{2}-\d{2})?$", model):
        return None

    body = json.dumps(
        {
            "model": model,
            "store": False,
            "max_output_tokens": 350,
            "instructions": (
                "You are AfriCore Python Autonomous Agent. Summarize the completed workspace "
                "action or analysis strictly using the supplied facts. Never fabricate monetary "
                "amounts or claim unexecuted financial transfers."
            ),
            "input": [{"role": "user", "content": json.dumps({"prompt": prompt, "summary": summary, "evidence": evidence})[:6000]}],
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            parts = [
                c.get("text", "")
                for o in data.get("output", [])
                if o.get("type") == "message"
                for c in o.get("content", [])
                if c.get("type") == "output_text"
            ]
            text = "\n".join(p for p in parts if p).strip()
            return text[:4000] if text else None
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None
