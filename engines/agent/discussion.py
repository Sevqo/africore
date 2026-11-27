"""Channel Discussion Intelligence & Mention Handler for AfriCore Python Autonomous Agent.

Handles @agent-handle mentions inside Discord-style Work Discussions channels:
- Answers strategic & advisory questions (e.g. "what do you think of the business, how can we
  improve sales and get more customers?") with Hermes/Townie-caliber business reasoning
- Supports multi-turn conversational slot-filling inside channels (e.g. if the agent just asked
  what a meeting is about, the user's reply seamlessly delegates back to the planner!)
- Summarizes recent channel conversations on demand
- Answers concrete operational questions (meetings, projects, tasks, overdue invoices, CRM, team)
- Detects actionable commands and delegates them to the Autonomous Agent planner/sandbox
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
    # Advisory / "how can we improve sales?" questions are strategic Q&A, NOT action delegation
    if re.search(
        r"\b(what\s+do\s+you\s+think|how\s+is\s+(?:it|the\s+business)|how\s+are\s+we|how\s+can\s+we|how\s+to\s+improve|what\s+should\s+we|why\s+is|advice)\b",
        p,
    ) and not re.search(r"\b(schedule\s+a|book\s+a|set\s+up\s+a|create\s+a|draft\s+an?)\b", p):
        return False

    if re.search(
        r"\b(schedule|book|set up|create|add|log|draft|record|send|notify|post|make|register|onboard)\b",
        p,
    ) and re.search(
        r"\b(meeting|call|sync|appointment|calen?d[ae]rs?|project|task|todo|lead|deal|crm|invoice|customer|client|expense|bill|subscription|obligation|reply|notice|announcement)\b",
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
    has_pending_intent = bool(payload.get("has_pending_intent", False))

    clean = _strip_agent_mention(raw_body, handle)
    lowered = clean.lower()

    # 0. If the user has an active `needs_input` slot-filling prompt waiting (e.g. answering what a meeting is about),
    # route straight back to the planner unless they're explicitly asking a new strategic question!
    if has_pending_intent and clean and not re.search(r"\b(summariz\w*|who\s+are\s+you|what\s+can\s+you\s+do|what\s+do\s+you\s+think)\b", lowered):
        return {
            "mode": "delegate_action",
            "clean_prompt": clean,
            "reply_body": "",
            "suggested_followups": [],
        }

    # 1. Check if employee is asking the agent to execute/stage a real workspace action!
    if clean and _detect_action_intent(clean):
        return {
            "mode": "delegate_action",
            "clean_prompt": clean,
            "reply_body": "",
            "suggested_followups": [],
        }

    # 2. Strategic Business Advisory / Growth / Sales / Customer Acquisition / Health Questions
    #    (Checked BEFORE narrow keyword buckets so "how can we improve sales and get more customers?"
    #     gets a rich Hermes-caliber strategic diagnosis instead of a 1-line CRM count!)
    if re.search(
        r"\b(think\s+of\s+the\s+business|fairing|faring|how\s+is\s+(?:it|the\s+business)|how\s+are\s+we|improve|make\s+it\s+(?:much\s+)?better|more\s+customers|get\s+customers|win\s+customers|grow|growth|strategy|sales|revenue|cash|profit|margin|invoice|invoices|overdue|receivable|expense|business|health|perform|status|brief|diagnos\w*|advice)\b",
        lowered,
    ):
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

    # 3. Channel conversation summary / catch-up
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
                    f"**Channel Recap for `#{channel_name}`** ({len(human_msgs)} recent messages from {', '.join(participants[:5])}):",
                    *bullets,
                    f"\nNeed me to turn any of this into a Work task or schedule a follow-up meeting? Just mention `@{handle}`.",
                ]
            )
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # 4. Calendar / upcoming meetings query
    if re.search(r"\b(meeting|meetings|calendar|calender|schedule|call|calls|agenda|upcoming\s+event)\b", lowered):
        events = list(context.get("calendar_events") or [])
        if not events:
            reply = (
                f"There are currently no upcoming scheduled meetings in this workspace's Calendar.\n"
                f"To book one right away, reply with: `@{handle} schedule a meeting tomorrow at 10am` and tell me the topic."
            )
        else:
            lines = [f"**Upcoming Workspace Calendar ({len(events)} scheduled):**"]
            for ev in events[:5]:
                start_str = str(ev.get("start") or "")[:16].replace("T", " ")
                loc = f" · {ev.get('location')}" if ev.get("location") else ""
                lines.append(f"• **{ev.get('title', 'Meeting')}** — {start_str} ({ev.get('timezone', 'Africa/Nairobi')}){loc}")
            lines.append(f"\nMention `@{handle} schedule a meeting ...` to stage a new invite.")
            reply = "\n".join(lines)
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # 5. Projects & Tasks status query
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
            lines = [f"**Active Work Overview** ({len(projects)} project(s), {len(open_tasks)} open task(s), {len(urgent)} high/urgent):"]
            for proj in projects[:5]:
                due = f" · Due {proj.get('deadline')}" if proj.get("deadline") else ""
                lines.append(f"• **{proj.get('name', 'Project')}** ({proj.get('status', 'active')}){due}")
            if open_tasks:
                lines.append("Top open tasks:")
                for t in open_tasks[:4]:
                    lines.append(f"  - {t.get('title', 'Task')} [{t.get('stage', 'planned')}, {t.get('priority', 'normal')}]")
            reply = "\n".join(lines)
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # 6. CRM Leads & Pipeline query
    if re.search(r"\b(crm|lead|leads|deal|deals|pipeline|prospect|funnel)\b", lowered):
        crm = list(context.get("crm_entries") or [])
        open_crm = [c for c in crm if str(c.get("status") or "open") == "open"]
        total_minor = sum(int(c.get("amount_minor") or 0) for c in open_crm)
        if not open_crm:
            reply = (
                f"Your CRM pipeline currently has **0 open leads** — which means new revenue relies purely on repeat orders.\n"
                f"Mention `@{handle} create a CRM lead for <Client> KES 50000` to start tracking outbound prospects."
            )
        else:
            lines = [f"**CRM Pipeline Snapshot** ({len(open_crm)} open item(s), {_fmt_money(total_minor, currency)} total value):"]
            for c in open_crm[:5]:
                amt = _fmt_money(int(c.get("amount_minor") or 0), str(c.get("currency") or currency))
                lines.append(f"• **{c.get('title', 'Lead')}** — stage `{c.get('stage', 'new')}` · {amt}")
            reply = "\n".join(lines)
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # 7. Team / Members directory query
    if re.search(r"\b(team|members|who\s+is\s+in|employees|roles|staff)\b", lowered):
        members = list(context.get("members") or [])
        lines = [f"**Workspace Directory ({len(members)} authorized member(s)):**"]
        for m in members[:10]:
            uname = f" (@{m.get('username')})" if m.get("username") else ""
            lines.append(f"• **{m.get('display_name') or m.get('email', 'Member')}**{uname} — {m.get('role', 'member')}")
        reply = "\n".join(lines)
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # 8. Greeting / Capabilities
    projects_count = len(context.get("projects") or [])
    events_count = len(context.get("calendar_events") or [])
    crm_count = len(context.get("crm_entries") or [])
    if not clean or re.search(r"^(hi|hello|hey|help|what\s+can\s+you\s+do|who\s+are\s+you)\b", lowered):
        reply = "\n".join(
            [
                f"Hi {author_name}! I'm **{agent_name}** (`@{handle}`), your autonomous co-pilot strictly sandboxed to this Business workspace.",
                f"Live pulse: {projects_count} active project(s) · {events_count} upcoming meeting(s) · {crm_count} open CRM deal(s).",
                "Ask me for strategic reasoning or tell me to execute work:",
                f"• **Strategic diagnosis:** `@{handle} how is the business faring and how can we win more customers?`",
                f"• **Recap discussion:** `@{handle} summarize this channel`",
                f"• **Execute tasks:** `@{handle} schedule a meeting tomorrow` (I'll ask what it's about and craft the invite!)",
            ]
        )
        return {"mode": "direct_reply", "clean_prompt": clean, "reply_body": reply}

    # 9. General open-ended question: run strategic workspace synthesis so answers are genuinely insightful
    diag = analyze_workspace_operations({
        "workspace_kind": "business",
        "currency": currency,
        "prompt": clean,
        **context,
    })
    contextual_intro = f"@{author_name} — regarding *\"{clean[:140]}\"*:\n\n{diag['summary']}"
    narrative = optional_llm_narrative(clean, contextual_intro, context, consent)
    return {
        "mode": "direct_reply",
        "clean_prompt": clean,
        "reply_body": narrative or contextual_intro,
    }
