"""Python Autonomous Agent Planner, Conversational Slot-Filler & Guardrail Policy Engine.

Owns:
- Workspace-scoped tool catalog (Business / Personal / Developer)
- Hermes/Townie-style conversational slot-filling (`execution_mode: "needs_input"`) when a user
  asks to schedule a meeting, create a project/task, or log a lead without specifying what it's
  about — preventing raw filler like "can you schedule a meeting for me tomorrow" or "tomorrow"
  from ever becoming a record title!
- Smart title & structured agenda synthesis from natural-language topic descriptions
- Multi-turn continuation via `pending_intent` so user follow-up replies seamlessly complete
  the staged action and open the Sandbox Clone
- Sandbox-First Computer Use staging (`stage_in_sandbox`) & restraint-first owner permissions
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
from agent.computer_use import build_approval_preview_steps, build_sandbox_clone_blueprint
from agent.isolation import check_target_access, evaluate_boundary
from agent.skills import extract_memory_preferences, match_procedural_skill, skills_for_kind

TOOL_CATALOG: list[dict[str, Any]] = [
    {
        "id": "analyze_business",
        "name": "Analyze business operations & strategy",
        "description": "Synthesize strategic growth advice, customer concentration, receivables aging, cost drivers, CRM pipeline, Work velocity, and prioritized action playbooks.",
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
        "description": "Stage and create a timezone-aware calendar event in AfriCore Calendar with synthesized title and agenda, notifying workspace members.",
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
        "description": "Create a new workspace project in AfriCore Work with Kanban stages, deadline, and starter tasks.",
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
        "description": "Summarize personal recorded income, expenses, subscriptions, savings rate, and upcoming obligations.",
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

_STOPWORDS_LOWER = {
    "a", "an", "the", "for", "me", "my", "us", "our", "you", "please", "pls",
    "today", "tomorrow", "tommorow", "tomorow", "tmrw", "tonight",
    "morning", "afternoon", "evening", "week", "month", "next", "this",
    "on", "in", "at", "to", "by", "from", "with", "of",
    "calendar", "calender", "calendars", "calenders", "app", "apps",
    "workspace", "work", "board", "crm", "page", "tab",
    "meeting", "meetings", "call", "sync", "appointment", "event", "invite",
    "schedule", "book", "set", "up", "create", "make", "arrange", "add", "new",
    "can", "could", "would", "will", "help", "want", "need", "like", "just",
}


def tools_for_kind(kind: str) -> list[dict[str, Any]]:
    return [t for t in TOOL_CATALOG if kind in t["workspace_kinds"]]


def default_permissions_for_kind(kind: str) -> dict[str, str]:
    return {t["id"]: t["default_permission"] for t in tools_for_kind(kind)}


def _extract_amount_minor(prompt: str, currency: str) -> int:
    prefixed = re.search(
        r"(?:kes|ksh|usd|eur|gbp|ugx|tzs|rwf|\$)\s*(\d[\d,]*(?:\.\d{1,2})?)",
        prompt,
        re.IGNORECASE,
    )
    match = prefixed or re.search(
        r"\b(\d{2,}[\d,]*(?:\.\d{1,2})?)\b(?!\s*(?:am|pm|min|mins|minutes|hours|hr|days|tasks))",
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


def _extract_time_of_day_hour(prompt: str) -> int | None:
    m12 = re.search(r"\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b", prompt, re.IGNORECASE)
    if m12:
        hr = int(m12.group(1))
        mer = m12.group(3).lower()
        if mer == "pm" and hr != 12:
            hr += 12
        elif mer == "am" and hr == 12:
            hr = 0
        return hr
    m24 = re.search(r"\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b", prompt, re.IGNORECASE)
    if m24:
        return int(m24.group(1))
    if re.search(r"\bmorning\b", prompt, re.I):
        return 9
    if re.search(r"\bafternoon\b", prompt, re.I):
        return 14
    if re.search(r"\bevening\b", prompt, re.I):
        return 17
    return None


def _extract_day_offset_hours(prompt: str) -> int | None:
    if re.search(r"\b(tomorrow|tommorow|tomorow|tmrw)\b", prompt, re.I):
        return 24
    if re.search(r"\btoday|tonight|this\s+(?:afternoon|evening|morning)\b", prompt, re.I):
        return 2
    if re.search(r"\bnext\s+week\b", prompt, re.I):
        return 7 * 24
    return None


def _strip_scheduling_boilerplate(text: str) -> str:
    """Strips conversational request framing, temporal adverbs, and app location suffixes
    so only the genuine meeting/project/task subject remains."""
    s = text.strip()
    # If explicitly quoted title exists, prefer it immediately!
    quoted = re.search(r'["“]([^"”]{2,120})["”]', s)
    if quoted:
        return quoted.group(1).strip()

    # Strip leading polite / conversational request prefixes
    s = re.sub(
        r"^(?:hey|hi|hello)?[,\s]*(?:@[a-z0-9._-]+\s+)?"
        r"(?:can\s+you|could\s+you|would\s+you|will\s+you|please|pls|kindly|i\s+(?:want|need|would\s+like)\s+(?:you\s+)?to|help\s+me|let'?s|lets)?\s*",
        "",
        s,
        flags=re.IGNORECASE,
    )
    # Strip action verb + noun phrase ("schedule a meeting for me", "book a call", "set up a project")
    s = re.sub(
        r"^(?:set\s+up|schedule|book|create|arrange|organize|plan|start|launch|add|make|log|draft|prepare)\s+"
        r"(?:a\s+|an\s+|the\s+|my\s+|our\s+)?(?:new\s+|quick\s+|team\s+|short\s+|draft\s+|crm\s+)?"
        r"(?:meeting|call|sync|appointment|event|session|invite|project|task|todo|action\s+item|lead|deal|opportunity|invoice|customer|client|contact)?\s*"
        r"(?:for\s+(?:me|us|my\s+team|our\s+team)\b)?\s*",
        "",
        s,
        flags=re.IGNORECASE,
    )
    # Strip app/location suffixes like "on the calendars app", "in calendar", "in the work app"
    s = re.sub(
        r"\b(?:on|in|inside|using|via)\s+(?:the\s+|my\s+)?(?:africore\s+)?(?:calen?d[ae]rs?|work|crm|invoices?|projects?)(?:\s+app|\s+page|\s+tab|\s+board)?\b",
        " ",
        s,
        flags=re.IGNORECASE,
    )
    # Strip standalone time/date expressions
    s = re.sub(r"\b(?:at|around|by|from)\s+(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:am|pm)\b", " ", s, flags=re.I)
    s = re.sub(r"\b(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:am|pm)\b", " ", s, flags=re.I)
    s = re.sub(r"\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b", " ", s, flags=re.I)
    s = re.sub(r"\b(?:for\s+)?(?:30|45|60|90|15)\s*(?:min|mins|minutes)\b", " ", s, flags=re.I)
    s = re.sub(r"\b(?:for\s+)?1\s*hour\b", " ", s, flags=re.I)
    s = re.sub(
        r"\b(?:for\s+)?(?:tomorrow|tommorow|tomorow|tmrw|today|tonight|next\s+week|this\s+(?:morning|afternoon|evening|week))\b",
        " ",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        r"\b(?:in|at)\s+(?:the\s+)?(?:morning|afternoon|evening)\b",
        " ",
        s,
        flags=re.IGNORECASE,
    )
    # Strip chained clause tails ("and schedule a kickoff meeting", "and notify the team")
    s = re.sub(
        r"\s+(?:and|then)\s+(?:schedule|book|add|create|draft|send|notify|message)\b.*$",
        "",
        s,
        flags=re.IGNORECASE,
    )
    # Strip leading connector prepositions ("about", "regarding", "for", "called", "titled", "to")
    s = re.sub(
        r"^(?:it'?s\s+|it\s+is\s+|this\s+is\s+)?(?:for|about|regarding|on|called|named|titled|entitled|covering|to\s+discuss|discussing|to\s+review|reviewing|to)\s+",
        "",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(r"\s+", " ", s).strip(" ,.:;!?-")
    return s


def _has_meaningful_topic(cleaned: str) -> bool:
    if not cleaned or len(cleaned) < 2:
        return False
    tokens = [re.sub(r"[^a-z0-9]", "", w.lower()) for w in cleaned.split()]
    meaningful = [t for t in tokens if len(t) >= 2 and t not in _STOPWORDS_LOWER and not t.isdigit()]
    return len(meaningful) >= 1


def synthesize_title_and_agenda(raw_topic: str, kind: str = "meeting") -> tuple[str, str]:
    """Transforms either an explicit short title OR a conversational description of what a
    meeting/project is about into a crisp Title + structured Agenda/Description."""
    cleaned = _strip_scheduling_boilerplate(raw_topic)
    if not cleaned:
        cleaned = raw_topic.strip(" ,.:;!?-")

    # Remove leading "it's about / we want to talk about / discussing"
    core = re.sub(
        r"^(?:we\s+(?:want|need|are\s+going)\s+to\s+(?:talk\s+about|discuss|review|plan)|"
        r"i\s+want\s+to\s+(?:discuss|talk\s+about|review)|"
        r"talking\s+about|discussing|reviewing|planning|meeting\s+about)\s+",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip(" .")

    words = core.split()
    if len(words) <= 6 and not re.search(r"\b(because|so\s+that|how\s+we|whether|which)\b", core, re.I):
        # Already a concise title — smart title-case while preserving acronyms (Q1..Q4, KES, CRM, API, HQ, VAT)
        acronyms = {"q1", "q2", "q3", "q4", "kes", "usd", "crm", "api", "hq", "vat", "kpi", "kpis", "hr", "pos", "b2b"}
        small = {"and", "or", "for", "with", "in", "on", "of", "to", "&"}
        titled_words = []
        for idx, w in enumerate(words):
            low = w.lower()
            if low in acronyms:
                titled_words.append(low.upper())
            elif idx > 0 and low in small:
                titled_words.append(low)
            elif w[0].isupper():
                titled_words.append(w)
            else:
                titled_words.append(w.capitalize())
        title = " ".join(titled_words)[:90]
    else:
        # Synthesize a crisp 4–7 word executive title from a natural description!
        concise = re.split(r"[.;]|,\s*(?:and\s+also|so\s+|because\s+)", core)[0].strip()
        concise = re.sub(r"^(?:how\s+to\s+|ways\s+to\s+|the\s+)", "", concise, flags=re.I)
        c_words = concise.split()[:7]
        acronyms = {"q1", "q2", "q3", "q4", "kes", "usd", "crm", "api", "hq", "vat", "kpi", "kpis", "hr", "pos", "b2b"}
        small = {"and", "or", "for", "with", "in", "on", "of", "to", "&"}
        titled_words = []
        for idx, w in enumerate(c_words):
            clean_w = w.strip(",.:;")
            low = clean_w.lower()
            if low in acronyms:
                titled_words.append(low.upper())
            elif idx > 0 and low in small:
                titled_words.append(low)
            else:
                titled_words.append(clean_w.capitalize())
        base_title = " ".join(titled_words).rstrip(" &,-")
        if not re.search(r"\b(review|sync|session|planning|strategy|kickoff|check-in|meeting|audit|onboarding)\b", base_title, re.I):
            base_title = f"{base_title} Strategy Sync" if kind == "meeting" else f"{base_title} Initiative"
        title = base_title[:90]

    if kind == "project":
        agenda = (
            f"Objective: {core[0].upper() + core[1:] if core else title}.\n"
            f"Deliverables:\n"
            f"1. Align scope, owners, and milestone dates\n"
            f"2. Track execution across Planned → In progress → Complete\n"
            f"3. Review weekly blockers in the project discussion channel"
        )
    else:
        agenda = (
            f"Purpose: {core[0].upper() + core[1:] if core else title}.\n"
            f"Suggested Agenda:\n"
            f"1. Context & current status review ({title})\n"
            f"2. Key decisions, blockers & resource alignment\n"
            f"3. Concrete action items, owners & follow-up timeline"
        )
    return title, agenda


def _select_tool(kind: str, available: list[dict[str, Any]], prompt: str, tool_hint: str | None) -> dict[str, Any]:
    by_id = {t["id"]: t for t in available}
    if tool_hint and tool_hint in by_id:
        return by_id[tool_hint]

    p = prompt.lower()
    # Guard: strategic questions like "how can we improve sales and get more customers?" are ADVISORY/ANALYSIS,
    # NOT write commands unless an explicit imperative verb is present!
    is_advisory_question = bool(
        re.search(
            r"\b(what\s+do\s+you\s+think|how\s+is\s+(?:it|the\s+business)|how\s+are\s+we|how\s+can\s+we|how\s+to\s+improve|what\s+should\s+we|why\s+is|diagnos\w*|analyz\w*|advise|advice)\b",
            p,
        )
        and not re.search(r"\b(schedule|book|set\s+up\s+a|create\s+a|draft\s+an?|record\s+an?)\b", p)
    )

    if kind == "business":
        if is_advisory_question:
            return by_id["analyze_business"]
        if re.search(r"\b(project|roadmap|initiative|launch|workspace board)\b", p) and re.search(r"\b(set up|create|start|launch|new)\b", p):
            return by_id["create_project"]
        if re.search(r"\b(meet|meeting|calendar|calender|calendars|calenders|call|sync|appointment|book|schedule)\b", p):
            return by_id["schedule_meeting"]
        if re.search(r"\b(project|roadmap|initiative|workspace board)\b", p):
            return by_id["create_project"]
        if re.search(r"\b(task|todo|to-do|action item|checklist)\b", p) and re.search(r"\b(add|create|new|make|assign)\b", p):
            return by_id["create_task"]
        if re.search(r"\b(lead|crm|deal|opportunity|pipeline|prospect)\b", p) and re.search(r"\b(add|create|new|log|seed)\b", p):
            return by_id["create_crm_lead"]
        if re.search(r"\b(invoice|bill client|quote)\b", p) and re.search(r"\b(draft|create|prepare|send|make|new|for)\b", p):
            return by_id["create_draft_invoice"]
        if re.search(r"\b(customer|client|contact)\b", p) and re.search(r"\b(add|create|new|register|onboard)\b", p):
            return by_id["create_customer"]
        if re.search(r"\b(expense|spent|cost|paid for|rent|utilities|receipt)\b", p) and re.search(r"\b(record|log|add|kes|ksh|usd|\d)\b", p):
            return by_id["record_expense"]
        if re.search(r"\b(subscription|recurring|bill reminder|obligation)\b", p) and re.search(r"\b(add|create|schedule|set up)\b", p):
            return by_id["create_obligation"]
        if re.search(r"\b(reply|notify|message|team|tell|announce|broadcast)\b", p) and re.search(r"\b(send|post|notify|tell|broadcast|remind)\b", p):
            return by_id["send_workspace_reply"]
        if re.search(r"\b(forecast|next month|90 days|60 days|30-day|30 day|cash flow projection)\b", p):
            return by_id["forecast_cashflow"]
        return by_id["analyze_business"]

    if kind == "personal":
        if re.search(r"\b(developer|dev workspace|api|webhook|sandbox app|request log)\b", p):
            if re.search(r"\b(create|new|add|register)\b", p):
                return by_id["create_developer_application"]
            return by_id["inspect_linked_developer_workspace"]
        if re.search(r"\b(meet|meeting|calendar|calender|appointment|schedule)\b", p):
            return by_id["schedule_meeting"]
        if re.search(r"\b(income|salary|earned|freelance|received)\b", p) and re.search(r"\b(record|log|add|kes|ksh|usd|\d)\b", p):
            return by_id["record_personal_income"]
        if re.search(r"\b(expense|spent|bought|cost|groceries|rent)\b", p) and re.search(r"\b(record|log|add|spent|bought|\d)\b", p):
            return by_id["record_expense"]
        if re.search(r"\b(subscription|netflix|spotify|recurring|bill|obligation)\b", p) and re.search(r"\b(add|create|schedule|set up)\b", p):
            return by_id["create_obligation"]
        if re.search(r"\b(invoice)\b", p) and re.search(r"\b(draft|create|prepare|new)\b", p):
            return by_id["create_draft_invoice"]
        if re.search(r"\b(client|contact)\b", p) and re.search(r"\b(add|create|new)\b", p):
            return by_id["create_customer"]
        if re.search(r"\b(forecast|next month|30-day|30 day)\b", p):
            return by_id["forecast_cashflow"]
        if re.search(r"\b(reply|notify|remind|note)\b", p):
            return by_id["send_workspace_reply"]
        return by_id["analyze_personal_finances"]

    if re.search(r"\b(personal|my finances|my income|my expenses|my calendar)\b", p):
        return by_id["inspect_linked_personal_summary"]
    if re.search(r"\b(create|new|add|register)\b", p) and re.search(r"\b(app|application|sandbox)\b", p):
        return by_id["create_developer_application"]
    if re.search(r"\b(reply|notify|alert|message)\b", p):
        return by_id["send_workspace_reply"]
    return by_id["inspect_developer_diagnostics"]


def _check_missing_slots(
    tool_id: str,
    prompt: str,
    explicit_params: dict[str, Any],
    derived_params: dict[str, Any],
) -> dict[str, Any] | None:
    """Checks if essential domain details (like meeting topic/title or project name) were omitted.
    When missing, returns a Hermes-style clarification prompt + quick-reply chips instead of
    hallucinating or copying raw filler text!"""
    if tool_id == "schedule_meeting":
        if explicit_params.get("title"):
            return None
        stripped = _strip_scheduling_boilerplate(prompt)
        if not _has_meaningful_topic(stripped):
            when_label = "tomorrow" if derived_params.get("hours_from_now") == 24 else "today"
            hr = derived_params.get("preferred_hour")
            time_note = f" at {hr:02d}:00" if isinstance(hr, int) else ""
            return {
                "missing_fields": ["topic_or_title"],
                "question": (
                    f"I'm ready to stage that meeting for **{when_label}{time_note}** in AfriCore Calendar. "
                    f"**What is the meeting about** (or what title would you like), and do you have a preferred time?\n\n"
                    f"Just reply with a short title or describe the topic in plain words (e.g. *\"Reviewing Q4 sales targets and new customer outreach at 11am\"*) — "
                    f"I'll craft the title, structured agenda, and open the Calendar Sandbox for your approval."
                ),
                "suggestions": [
                    "Q4 Sales & Customer Growth Sync at 10am",
                    "Weekly Team Operations Check-in at 9am",
                    "Client Onboarding & Delivery Review at 2pm",
                ],
            }

    if tool_id == "create_project":
        if explicit_params.get("name"):
            return None
        stripped = _strip_scheduling_boilerplate(prompt)
        if not _has_meaningful_topic(stripped):
            return {
                "missing_fields": ["project_topic"],
                "question": (
                    "I can set up that AfriCore Work project board right away. **What is the project called or what initiative is it for?**\n\n"
                    "Reply with a name or goal (e.g. *\"Q4 Retail Expansion & Customer Onboarding\"*) and I'll stage the project, Kanban stages, and kickoff task in the Sandbox."
                ),
                "suggestions": [
                    "Q4 Sales & Customer Acquisition",
                    "New Product Launch & Marketing",
                    "Operations & Fulfilment Upgrade",
                ],
            }

    if tool_id == "create_task":
        if explicit_params.get("title"):
            return None
        stripped = _strip_scheduling_boilerplate(prompt)
        if not _has_meaningful_topic(stripped):
            return {
                "missing_fields": ["task_title"],
                "question": "What task should I add to your Work board? Reply with the action item (e.g. *\"Follow up with top 5 prospective customers\"*).",
                "suggestions": [
                    "Follow up with prospective enterprise clients",
                    "Audit pending draft invoices before Friday",
                ],
            }

    return None


def _derive_params(
    tool_id: str,
    prompt: str,
    currency: str,
    memory_prefs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    prefs = memory_prefs or {}
    derived: dict[str, Any] = {}
    if tool_id == "schedule_meeting":
        stripped = _strip_scheduling_boilerplate(prompt)
        if _has_meaningful_topic(stripped):
            title, agenda = synthesize_title_and_agenda(prompt, kind="meeting")
            derived["title"] = title
            derived["description"] = agenda
        else:
            derived["title"] = "Team Strategy Sync"
            derived["description"] = "Scheduled via AfriCore Autonomous Agent."

        day_hours = _extract_day_offset_hours(prompt)
        derived["hours_from_now"] = day_hours if day_hours is not None else 24
        preferred_dur = prefs.get("preferred_duration_minutes") or 45
        derived["duration_minutes"] = (
            30 if re.search(r"30\s*min", prompt, re.I)
            else (60 if re.search(r"60\s*min|1\s*hour", prompt, re.I)
                  else (90 if re.search(r"90\s*min", prompt, re.I) else int(preferred_dur)))
        )
        explicit_hour = _extract_time_of_day_hour(prompt)
        if explicit_hour is not None:
            derived["preferred_hour"] = explicit_hour
        elif prefs.get("preferred_meeting_hour") is not None:
            derived["preferred_hour"] = int(prefs["preferred_meeting_hour"])
        else:
            derived["preferred_hour"] = 10

        if prefs.get("default_location"):
            derived["location"] = str(prefs["default_location"])
        else:
            loc_m = re.search(
                r"\b(?:in|at|via)\s+(Boardroom|Zoom|Google Meet|Teams|Main Office|Nairobi HQ|Conference Room)\b",
                prompt,
                re.I,
            )
            derived["location"] = loc_m.group(1) if loc_m else "Workspace Meeting Room"
        derived["timezone"] = "Africa/Nairobi"

    elif tool_id == "create_project":
        stripped = _strip_scheduling_boilerplate(prompt)
        if _has_meaningful_topic(stripped):
            name, desc = synthesize_title_and_agenda(prompt, kind="project")
        else:
            name, desc = "Q4 Growth Project", "Project initialized by AfriCore Autonomous Agent."
        derived["name"] = name
        derived["description"] = desc
        derived["starter_task"] = f"Kickoff & milestone plan for {name}"
        derived["priority"] = "high" if re.search(r"\b(urgent|high|critical)\b", prompt, re.I) else "normal"

    elif tool_id == "create_task":
        stripped = _strip_scheduling_boilerplate(prompt)
        title = stripped[:140] if _has_meaningful_topic(stripped) else "Follow-up action item"
        if title and title[0].islower():
            title = title[0].upper() + title[1:]
        derived["title"] = title
        derived["priority"] = "high" if re.search(r"\b(urgent|high)\b", prompt, re.I) else "normal"

    elif tool_id == "create_customer":
        stripped = _strip_scheduling_boilerplate(prompt)
        stripped = re.sub(r"\s+[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}.*$", "", stripped).strip()
        derived["name"] = stripped[:120] if _has_meaningful_topic(stripped) else "New Contact"
        email_m = re.search(r"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})", prompt)
        if email_m:
            derived["email"] = email_m.group(1)

    elif tool_id == "create_crm_lead":
        stripped = _strip_scheduling_boilerplate(prompt)
        stripped = re.sub(r"\b(?:kes|ksh|usd|eur|gbp|ugx|tzs|rwf|\$)\s*\d[\d,]*(?:\.\d{1,2})?\b", "", stripped, flags=re.I).strip(" ,.-")
        label = stripped[:120] if _has_meaningful_topic(stripped) else "Inbound Business Lead"
        derived["title"] = label
        derived["customer_name"] = label
        if re.search(r"\d", prompt):
            derived["amount_minor"] = _extract_amount_minor(prompt, currency)

    elif tool_id == "create_draft_invoice":
        stripped = _strip_scheduling_boilerplate(prompt)
        stripped = re.sub(r"\b(?:kes|ksh|usd|eur|gbp|ugx|tzs|rwf|\$)\s*\d[\d,]*(?:\.\d{1,2})?\b", "", stripped, flags=re.I).strip(" ,.-")
        derived["customer_name"] = stripped[:120] if _has_meaningful_topic(stripped) else "Workspace Client"
        derived["description"] = f"Professional services — {derived['customer_name']}"[:180]
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
        stripped = _strip_scheduling_boilerplate(prompt)
        derived["name"] = stripped[:100] if _has_meaningful_topic(stripped) else "Agent Sandbox App"

    elif tool_id == "forecast_cashflow":
        if re.search(r"\b90\b", prompt):
            derived["horizon"] = 90
        elif re.search(r"\b60\b", prompt):
            derived["horizon"] = 60
        elif re.search(r"\b7\b", prompt):
            derived["horizon"] = 7
        else:
            derived["horizon"] = 30
        if re.search(r"conservative|worst", prompt, re.I):
            derived["scenario"] = "conservative"
        elif re.search(r"optimistic|best", prompt, re.I):
            derived["scenario"] = "optimistic"
        else:
            derived["scenario"] = "expected"
    return derived


def _merge_pending_continuation(
    pending_intent: dict[str, Any],
    reply_prompt: str,
    currency: str,
    memory_prefs: dict[str, Any],
) -> tuple[str | None, dict[str, Any], str]:
    """Determines whether the user's new prompt is answering a pending `needs_input` question
    or switching to a completely different command."""
    tool_id = str(pending_intent.get("tool_id") or "")
    collected = dict(pending_intent.get("collected_params") or {})
    orig_prompt = str(pending_intent.get("original_prompt") or "")

    # If the user explicitly starts a brand-new unrelated command (e.g. "analyze my business" or "forecast cashflow"), abandon pending slot-filling
    low = reply_prompt.lower().strip()
    if re.search(r"^(?:cancel|nevermind|never\s+mind|stop|forget\s+it)\b", low):
        return None, {}, reply_prompt
    if re.search(r"\b(analyze|diagnose|forecast|check\s+my\s+linked|what\s+do\s+you\s+think)\b", low) and not re.search(r"\b(meeting|sync|review|project)\b", low):
        return None, {}, reply_prompt

    merged = dict(collected)
    if tool_id == "schedule_meeting":
        title, agenda = synthesize_title_and_agenda(reply_prompt, kind="meeting")
        merged["title"] = title
        merged["description"] = agenda
        hr = _extract_time_of_day_hour(reply_prompt)
        if hr is not None:
            merged["preferred_hour"] = hr
        day_h = _extract_day_offset_hours(reply_prompt)
        if day_h is not None:
            merged["hours_from_now"] = day_h
        if re.search(r"30\s*min", reply_prompt, re.I):
            merged["duration_minutes"] = 30
        elif re.search(r"60\s*min|1\s*hour", reply_prompt, re.I):
            merged["duration_minutes"] = 60
        loc_m = re.search(
            r"\b(?:in|at|via)\s+(Boardroom|Zoom|Google Meet|Teams|Main Office|Nairobi HQ|Conference Room)\b",
            reply_prompt,
            re.I,
        )
        if loc_m:
            merged["location"] = loc_m.group(1)
        return tool_id, merged, f"{orig_prompt} — {reply_prompt}"

    if tool_id == "create_project":
        name, desc = synthesize_title_and_agenda(reply_prompt, kind="project")
        merged["name"] = name
        merged["description"] = desc
        merged["starter_task"] = f"Kickoff & milestone plan for {name}"
        return tool_id, merged, f"{orig_prompt} — {reply_prompt}"

    if tool_id == "create_task":
        fresh = _derive_params("create_task", reply_prompt, currency, memory_prefs)
        merged.update(fresh)
        return tool_id, merged, f"{orig_prompt} — {reply_prompt}"

    return None, {}, reply_prompt


def _detect_chained_actions(
    kind: str,
    primary_tool: dict[str, Any],
    available: list[dict[str, Any]],
    prompt: str,
    currency: str,
    permissions: dict[str, str],
    autonomy_mode: str,
    memory_prefs: dict[str, Any],
    primary_params: dict[str, Any],
) -> list[dict[str, Any]]:
    if autonomy_mode == "read_only":
        return []
    by_id = {t["id"]: t for t in available}
    p = prompt.lower()
    chained: list[dict[str, Any]] = []

    def can_chain(tid: str) -> bool:
        return tid in by_id and tid != primary_tool["id"] and permissions.get(tid, "approval_required") != "disabled"

    if primary_tool["id"] == "create_project" and re.search(r"\b(meet|meeting|kickoff|call|calendar|schedule)\b", p):
        if can_chain("schedule_meeting"):
            m_params = _derive_params("schedule_meeting", prompt, currency, memory_prefs)
            proj_name = primary_params.get("name") or "Project"
            m_params["title"] = f"{proj_name} — Kickoff Meeting"
            m_params["description"] = (
                f"Kickoff alignment session for {proj_name}.\n"
                f"Agenda:\n1. Walk through scope & deliverables\n2. Assign initial Kanban tasks\n3. Confirm milestone check-in cadence"
            )
            chained.append({"tool": by_id["schedule_meeting"], "params": m_params})

    if primary_tool["id"] == "create_customer" and re.search(r"\b(invoice|bill|quote)\b", p):
        if can_chain("create_draft_invoice"):
            inv_params = _derive_params("create_draft_invoice", prompt, currency, memory_prefs)
            cust_name = primary_params.get("name") or "Client"
            inv_params["customer_name"] = cust_name
            chained.append({"tool": by_id["create_draft_invoice"], "params": inv_params})

    if primary_tool["id"] != "send_workspace_reply" and re.search(r"\b(?:and|then)\s+(?:notify|message|tell|update)\s+(?:the\s+)?team\b", p):
        if can_chain("send_workspace_reply"):
            chained.append({
                "tool": by_id["send_workspace_reply"],
                "params": {
                    "title": f"Team Update: {primary_tool['name']}",
                    "body": f"AfriCore Agent completed: {prompt[:300]}",
                },
            })

    return chained[:2]


def plan_agent_run(payload: dict[str, Any]) -> dict[str, Any]:
    boundary = evaluate_boundary(payload.get("boundary_input") or {})
    source_kind = boundary["source_kind"]
    raw_prompt = str(payload.get("prompt") or "").strip()
    currency = str(payload.get("currency") or "KES")
    tool_hint = payload.get("tool_hint")
    explicit_target = payload.get("target_workspace_id")
    explicit_params = dict(payload.get("params") or {})
    policy = dict(payload.get("policy") or {})
    computer_use_requested = bool(payload.get("computer_use", True))
    stage_in_sandbox = bool(payload.get("stage_in_sandbox", False))
    routine_id = payload.get("routine_id")
    override_mode = payload.get("override_mode")
    memory_items = list(payload.get("memory") or [])
    pending_intent = payload.get("pending_intent")

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
    memory_prefs = extract_memory_preferences(memory_items)

    prompt = raw_prompt
    continued_from_pending = False
    if isinstance(pending_intent, dict) and pending_intent.get("tool_id") and not tool_hint and not routine_id:
        resumed_tool_id, resumed_params, combined_prompt = _merge_pending_continuation(
            pending_intent, raw_prompt, currency, memory_prefs
        )
        if resumed_tool_id:
            tool_hint = resumed_tool_id
            explicit_params = {**resumed_params, **explicit_params}
            prompt = combined_prompt
            continued_from_pending = True

    matched_skill = match_procedural_skill(source_kind, prompt)
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

    derived_params = _derive_params(chosen["id"], prompt, currency, memory_prefs)

    # Conversational Slot-Filling Check (only on interactive human runs, never background routines)
    if chosen["access_kind"] == "write" and not routine_id and not continued_from_pending:
        missing_info = _check_missing_slots(chosen["id"], raw_prompt, explicit_params, derived_params)
        if missing_info is not None:
            return {
                "ok": True,
                "status": 200,
                "engine": "python_autonomous_agent_v2",
                "boundary": boundary,
                "tool": chosen,
                "matched_skill": matched_skill,
                "memory_applied": memory_prefs.get("matched_notes", []),
                "target_workspace_id": target_workspace_id,
                "target_kind": target_kind,
                "params": derived_params,
                "chained_actions": [],
                "sandbox_clone": None,
                "action_summary": f"Clarifying {chosen['name'].lower()} details",
                "execution_mode": "needs_input",
                "clarification": {
                    "question": missing_info["question"],
                    "missing_fields": missing_info["missing_fields"],
                    "suggestions": missing_info["suggestions"],
                    "pending_intent": {
                        "tool_id": chosen["id"],
                        "original_prompt": raw_prompt,
                        "collected_params": derived_params,
                        "target_workspace_id": target_workspace_id,
                    },
                },
                "computer_use": False,
                "credit_category": "analysis_read",
                "credits_cost": 0,
                "preview_steps": [],
                "available_skills": skills_for_kind(source_kind),
            }

    use_computer_use = computer_use_requested and bool(policy.get("computer_use_enabled", True))
    if stage_in_sandbox and use_computer_use and chosen["access_kind"] == "write" and not routine_id:
        effective_mode = "approval_required"

    params = {**derived_params, **explicit_params}
    chained_actions = _detect_chained_actions(
        source_kind, chosen, available, prompt, currency, permissions, autonomy_mode, memory_prefs, params
    )

    label_val = (
        params.get("title")
        or params.get("name")
        or params.get("description")
        or params.get("customer_name")
        or prompt[:120]
    )
    chain_suffix = (
        " + " + " + ".join(act["tool"]["name"] for act in chained_actions)
        if chained_actions
        else ""
    )
    action_summary = f"{chosen['name']}: {label_val}{chain_suffix}"

    credit_category = (
        "routine_run"
        if routine_id
        else ("computer_use_session" if (use_computer_use and chosen["access_kind"] == "write") else chosen["credit_category"])
    )
    credits_cost = AGENT_CREDIT_COSTS[credit_category]

    sandbox_clone = (
        build_sandbox_clone_blueprint(chosen, params, currency, chained_actions)
        if chosen["access_kind"] == "write"
        else None
    )
    preview_steps = (
        build_approval_preview_steps(boundary, chosen, params, chained_actions)
        if effective_mode == "approval_required"
        else []
    )

    return {
        "ok": True,
        "status": 200,
        "engine": "python_autonomous_agent_v2",
        "boundary": boundary,
        "tool": chosen,
        "matched_skill": matched_skill,
        "memory_applied": memory_prefs.get("matched_notes", []),
        "target_workspace_id": target_workspace_id,
        "target_kind": target_kind,
        "params": params,
        "chained_actions": chained_actions,
        "sandbox_clone": sandbox_clone,
        "action_summary": action_summary,
        "execution_mode": effective_mode,
        "computer_use": use_computer_use,
        "credit_category": credit_category,
        "credits_cost": credits_cost,
        "preview_steps": preview_steps,
        "available_skills": skills_for_kind(source_kind),
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

    raw_handle = patch.get("agent_handle") if "agent_handle" in patch and patch["agent_handle"] is not None else current.get("agent_handle")
    next_handle = None
    if raw_handle is not None:
        cleaned_handle = re.sub(r"^@+", "", str(raw_handle).strip().lower())
        if not re.match(r"^[a-z0-9][a-z0-9_-]{1,30}$", cleaned_handle):
            return {
                "ok": False,
                "status": 400,
                "reason": "Agent username must be 2-31 lowercase letters, numbers, hyphens, or underscores (e.g. continua-agent).",
            }
        next_handle = cleaned_handle

    raw_display = patch.get("agent_display_name") if "agent_display_name" in patch and patch["agent_display_name"] is not None else current.get("agent_display_name")
    next_display = str(raw_display).strip()[:60] if raw_display else None

    return {
        "ok": True,
        "status": 200,
        "policy": {
            "autonomy_mode": next_autonomy,
            "computer_use_enabled": next_cu,
            "cross_dev_bridge_enabled": next_bridge,
            "permissions": next_permissions,
            **({"agent_handle": next_handle} if next_handle else {}),
            **({"agent_display_name": next_display} if next_display else {}),
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
            "max_output_tokens": 460,
            "instructions": (
                "You are AfriCore Python Autonomous Agent (Hermes & Townie-caliber strategic co-pilot). "
                "Answer the user's exact question thoughtfully and conversationally using ONLY the supplied "
                "workspace evidence. Diagnose root bottlenecks (such as customer concentration, empty CRM pipeline, "
                "overdue aging, or unissued drafts), propose concrete prioritized actions tailored to this business, "
                "and never fabricate monetary figures or claim unexecuted transfers."
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
        with urllib.request.urlopen(req, timeout=8) as resp:
            parsed = json.loads(resp.read().decode("utf-8"))
            output_text = parsed.get("output_text")
            if isinstance(output_text, str) and output_text.strip():
                return output_text.strip()[:2200]
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError):
        return None
    return None
