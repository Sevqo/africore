"""Hermes & Townie-inspired Procedural Skills & Playbook Library for AfriCore Agent.

Gives the Python Autonomous Agent reusable procedural workflows (skills) and memory-aware
parameter defaults so it acts as a proactive operational teammate rather than a static Q&A bot.
"""
from __future__ import annotations

import re
from typing import Any

PROCEDURAL_SKILLS: list[dict[str, Any]] = [
    {
        "id": "receivables_recovery_playbook",
        "name": "Receivables & Overdue Recovery Playbook",
        "workspace_kinds": ["business"],
        "summary": "Audits overdue customer invoices, prioritizes collection risk, schedules a collection review meeting, and drafts a team follow-up notice.",
        "triggers": [r"receivables?\s+recovery", r"collect\s+overdue", r"chase\s+invoices?", r"overdue\s+follow[\s-]?up"],
        "steps": ["analyze_business", "schedule_meeting", "send_workspace_reply"],
    },
    {
        "id": "project_kickoff_workflow",
        "name": "Project Setup & Kickoff Coordination",
        "workspace_kinds": ["business"],
        "summary": "Initializes a tracked AfriCore Work project with Kanban stages, creates starter deliverables, and books the team kickoff meeting in Calendar.",
        "triggers": [r"project.*(?:and|with|plus).*(?:meet|kickoff|call|calendar)", r"(?:launch|kickoff)\s+playbook"],
        "steps": ["create_project", "schedule_meeting"],
    },
    {
        "id": "client_onboarding_billing",
        "name": "Client Onboarding & Draft Billing",
        "workspace_kinds": ["business", "personal"],
        "summary": "Registers a new client/customer in the canonical directory, logs a CRM pipeline card (Business), and prepares a safe draft invoice.",
        "triggers": [r"onboard.*(?:customer|client)", r"(?:customer|client).*(?:and|with|then).*invoice"],
        "steps": ["create_customer", "create_draft_invoice"],
    },
    {
        "id": "executive_morning_brief",
        "name": "Townie Morning Operational Brief",
        "workspace_kinds": ["business", "personal", "developer"],
        "summary": "Cross-checks cash movement, overdue receivables, today's calendar load, open project blockers, and CRM pipeline velocity.",
        "triggers": [r"morning\s+brief", r"daily\s+brief", r"what\s+needs\s+my\s+attention", r"executive\s+brief"],
        "steps": ["analyze_business"],
    },
]


def skills_for_kind(kind: str) -> list[dict[str, Any]]:
    return [s for s in PROCEDURAL_SKILLS if kind in s["workspace_kinds"]]


def match_procedural_skill(kind: str, prompt: str) -> dict[str, Any] | None:
    lowered = prompt.lower()
    for skill in skills_for_kind(kind):
        for pat in skill["triggers"]:
            if re.search(pat, lowered, re.IGNORECASE):
                return skill
    return None


def extract_memory_preferences(memory_items: list[dict[str, Any]]) -> dict[str, Any]:
    """Derives actionable scheduling/operational defaults from stored workspace memory."""
    prefs: dict[str, Any] = {
        "preferred_meeting_hour": None,
        "preferred_duration_minutes": None,
        "default_location": None,
        "matched_notes": [],
    }
    for item in memory_items or []:
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        lower = content.lower()
        hour_match = re.search(r"\b(0?[89]|1[0-7]):00\b", lower)
        if hour_match and prefs["preferred_meeting_hour"] is None:
            prefs["preferred_meeting_hour"] = int(hour_match.group(1))
            prefs["matched_notes"].append(content[:140])
        elif "morning" in lower and prefs["preferred_meeting_hour"] is None:
            prefs["preferred_meeting_hour"] = 9
            prefs["matched_notes"].append(content[:140])
        elif "afternoon" in lower and prefs["preferred_meeting_hour"] is None:
            prefs["preferred_meeting_hour"] = 14
            prefs["matched_notes"].append(content[:140])

        dur_match = re.search(r"\b(15|30|45|60)\s*(?:min|minute)", lower)
        if dur_match and prefs["preferred_duration_minutes"] is None:
            prefs["preferred_duration_minutes"] = int(dur_match.group(1))

        loc_match = re.search(r"(?:zoom|google meet|teams|boardroom|nairobi office)", content, re.IGNORECASE)
        if loc_match and prefs["default_location"] is None:
            prefs["default_location"] = loc_match.group(0)
    return prefs
