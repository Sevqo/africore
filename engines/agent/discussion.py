"""Channel Discussion Intelligence & Mention Handler for AfriCore Python Autonomous Agent.

Handles @agent-handle mentions inside Discord-style Work Discussions channels:
- Summarizes recent channel conversations on demand
- Answers concrete operational questions (meetings, projects, tasks, overdue invoices, CRM, team)
- Detects actionable commands and delegates them to the Autonomous Agent planner/sandbox
- Strictly respects Business workspace isolation (never crosses workspace boundaries)
"""
from __future__ import annotations

import re
from typing import Any

from agent.analyzer import analyze_workspace_operations
from agent.planner import optional_llm_narrative


def _fmt_money(minor: int, currency: str) -> str:
    divisor = 1 if currency in ("UGX", "RWF") else 100
    val = minor / divisor
    return f"{currency} {int(round(val)):,}" if divisor == 1 else f"{currency} {val:,.2f}"


def _strip_agent_mention(body: str, handle: str) -> str:
    cleaned = re.sub(rf"@{re.escape(handle)}\b", "", body, flags=re.IGNORECASE)
    cleaned = re.sub(r"@agent\b", "", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip(" ,:-")


def _detect_action_intent(clean_prompt: str) -> bool:
    p = clean_prompt.lower()
    if re.search(
        r"\b(schedule|book|set up|create|add|log|draft|record|send|notify|post|make|register|onboard)\b",
        p,
    ) and re.search(
        r"\b(meeting|call|sync|appointment|project|task|todo|lead|deal|crm|invoice|customer|client|expense|bill|subscription|obligation|reply|notice|announcement)\b",
        p,
    ):
        return True
    return False


def handle_discussion_mention(payload: dict[str, Any]) -> dict[str, Any]:
    raw_body = str(payload.get("message_body") or "").strip()
    handle = str(payload.get("agent_handle") or "workspace-agent").strip().lower()
    agent_name = str(payload.get("agent_display_name") or "AfriCore Agent").strip()
    channel_name = str(payload.get("channel_name") or "general").strip()
    author_name = str(payload.get("author_name") or "Team member").strip()
    currency = str(payload.get("currency") or "KES")
    recent_messages = list(payload.get("recent_messages") or [])
    context = dict(payload.get("workspace_context") or {})
    consent = bool(payload.get("consent_to_provider", False))

    clean = _strip_agent_mention(raw_body, handle)
    lowered = clean.lower()

    # 1. Check if employee is asking the agent to execute/stage a real workspace action!
    if clean and _detect_action_intent(clean):
        return {
            "mode": "delegate_action",
            "clean_prompt": clean,
            "reply_body": "",
            "suggested_followups": [],
        }

    # 2. Channel conversation summary / catch-up
    if re.search(r"\b(summariz\w*|summary|recap|catch\s+me\s+up|what\s+did\s+(?:we|they)\s+discuss|tl;?dr)\b", lowered):
        human_msgs = [m for m in recent_messages if not m.get("is_agent") and str(m.get("body") or "").strip()]
        if not human_msgs:
            reply = f"No prior team messages found in `#{channel_name}` yet. Ask a question or mention `@{handle}` with a task anytime."
        else:
            participants = list(dict.fromkeys(str(m.get("author_name") or "Member") for m in human_msgs))
            bullets = []
            for m in human_msgs[-5:]:
                snippet = str(m.get("body") or "").strip().replace("\n", " ")
                if len(snippet) > 130:
                    snippet = snippet[:127] + "..."
                bullets.append(f"• **{m.get('author_name', 'Member')}**: {snippet}")
            reply = "\n".join(
                [
                    f"Channel Recap for `#{channel_name}` ({len(human_msgs)} recent messages from {', '.join(participants[:5])}):",
                    *bullets,
                    f"\nNeed me to turn any of this into a Work task or schedule a follow-up meeting? Just mention `@{handle}`.",
                ]
            )
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # 3. Calendar / upcoming meetings query
    if re.search(r"\b(meeting|meetings|calendar|schedule|call|calls|agenda|upcoming\s+event)\b", lowered):
        events = list(context.get("calendar_events") or [])
        if not events:
            reply = (
                f"There are currently no upcoming scheduled meetings in this workspace's Calendar.\n"
                f"To book one right away, reply with: `@{handle} schedule a team sync tomorrow at 10am`."
            )
        else:
            lines = [f"Upcoming Workspace Calendar ({len(events)} scheduled):"]
            for ev in events[:5]:
                start_str = str(ev.get("start") or "")[:16].replace("T", " ")
                loc = f" · {ev.get('location')}" if ev.get("location") else ""
                lines.append(f"• **{ev.get('title', 'Meeting')}** — {start_str} ({ev.get('timezone', 'Africa/Nairobi')}){loc}")
            lines.append(f"\nMention `@{handle} schedule a meeting ...` to stage a new invite.")
            reply = "\n".join(lines)
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # 4. Projects & Tasks status query
    if re.search(r"\b(project|projects|task|tasks|backlog|overdue\s+task|milestone|sprint|work\s+board)\b", lowered):
        projects = list(context.get("projects") or [])
        tasks = list(context.get("tasks") or [])
        open_tasks = [t for t in tasks if str(t.get("status") or "open") != "completed"]
        urgent = [t for t in open_tasks if str(t.get("priority") or "") in ("high", "urgent")]
        if not projects:
            reply = (
                f"There are no active Work projects yet.\n"
                f"Want me to initialize one? Mention `@{handle} set up a Q4 Launch project`."
            )
        else:
            lines = [f"Active Work Overview ({len(projects)} project(s), {len(open_tasks)} open task(s), {len(urgent)} high/urgent):"]
            for proj in projects[:5]:
                due = f" · Due {proj.get('deadline')}" if proj.get("deadline") else ""
                lines.append(f"• **{proj.get('name', 'Project')}** ({proj.get('status', 'active')}){due}")
            if open_tasks:
                lines.append("Top open tasks:")
                for t in open_tasks[:4]:
                    lines.append(f"  - {t.get('title', 'Task')} [{t.get('stage', 'planned')}, {t.get('priority', 'normal')}]")
            reply = "\n".join(lines)
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # 5. CRM Leads & Pipeline query
    if re.search(r"\b(crm|lead|leads|deal|deals|pipeline|prospect|sales\s+funnel)\b", lowered):
        crm = list(context.get("crm_entries") or [])
        open_crm = [c for c in crm if str(c.get("status") or "open") == "open"]
        total_minor = sum(int(c.get("amount_minor") or 0) for c in open_crm)
        if not open_crm:
            reply = (
                f"Your CRM pipeline currently has 0 open leads.\n"
                f"Mention `@{handle} create a CRM lead for <Client> KES 50000` to log one."
            )
        else:
            lines = [f"CRM Pipeline Snapshot ({len(open_crm)} open item(s), {_fmt_money(total_minor, currency)} total value):"]
            for c in open_crm[:5]:
                amt = _fmt_money(int(c.get("amount_minor") or 0), str(c.get("currency") or currency))
                lines.append(f"• **{c.get('title', 'Lead')}** — stage `{c.get('stage', 'new')}` · {amt}")
            reply = "\n".join(lines)
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # 6. Team / Members directory query
    if re.search(r"\b(team|members|who\s+is\s+in|employees|roles|staff)\b", lowered):
        members = list(context.get("members") or [])
        lines = [f"Workspace Directory ({len(members)} authorized member(s)):"]
        for m in members[:10]:
            uname = f" (@{m.get('username')})" if m.get("username") else ""
            lines.append(f"• **{m.get('display_name') or m.get('email', 'Member')}**{uname} — {m.get('role', 'member')}")
        reply = "\n".join(lines)
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # 7. Financial / Invoices / Cash / Business Health query
    if re.search(r"\b(invoice|invoices|overdue|receivable|cash|revenue|inflow|outflow|expense|business|health|perform|status|brief|report|how\s+are\s+we)\b", lowered):
        diag = analyze_workspace_operations({
            "workspace_kind": "business",
            "currency": currency,
            "prompt": clean,
            **context,
        })
        narrative = optional_llm_narrative(clean, diag["summary"], context, consent)
        return {
            "mode": "direct_reply",
            "clean_prompt": clean,
            "reply_body": narrative or diag["summary"],
        }

    # 8. Greeting / Capabilities / General Question in channel
    projects_count = len(context.get("projects") or [])
    events_count = len(context.get("calendar_events") or [])
    crm_count = len(context.get("crm_entries") or [])
    if not clean or re.search(r"^(hi|hello|hey|help|what\s+can\s+you\s+do|who\s+are\s+you)\b", lowered):
        reply = "\n".join(
            [
                f"Hi {author_name}! I'm **{agent_name}** (`@{handle}`), strictly sandboxed to this Business workspace.",
                f"Live workspace pulse: {projects_count} active project(s) · {events_count} upcoming meeting(s) · {crm_count} active CRM item(s).",
                "Here is how your team can use me right inside this channel:",
                f"• **Ask live questions:** `@{handle} what meetings are coming up?` or `@{handle} which invoices are overdue?`",
                f"• **Recap discussion:** `@{handle} summarize this channel`",
                f"• **Take action (with owner guardrails):** `@{handle} schedule a client sync tomorrow at 10am` or `@{handle} create a task to review Q4 budget`",
            ]
        )
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # Fallback: smart contextual response combining channel + workspace pulse + optional LLM
    fallback_summary = "\n".join(
        [
            f"@{author_name} — I reviewed your question in `#{channel_name}`: *\"{clean[:160]}\"*.",
            f"Current workspace context: {projects_count} Work project(s), {events_count} scheduled meeting(s), and {crm_count} open CRM items.",
            f"If you want me to execute an action (schedule a meeting, create a project/task, log a CRM lead, or draft an invoice) or inspect finances, mention `@{handle}` with the action or topic.",
        ]
    )
    narrative = optional_llm_narrative(clean, fallback_summary, {
        "channel": channel_name,
        "recent_messages": recent_messages[-6:],
        "projects_count": projects_count,
        "events_count": events_count,
        "crm_count": crm_count,
    }, consent)
    return {
        "mode": "direct_reply",
        "clean_prompt": clean,
        "reply_body": narrative or fallback_summary,
    }
