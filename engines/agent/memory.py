"""Hermes-style continuously learning, workspace-isolated agent memory engine.

Modeled on NousResearch Hermes Agent's bounded dual-store architecture:
- USER PROFILE (`user_profile`, ~1,375 char budget): user preferences, role, style, currency/timezone.
- WORKSPACE MEMORY (`workspace_memory`, ~2,200 char budget): durable business/personal context,
  customers, projects, workflows, and operational goals separated with `§` entries.
- EPISODIC SESSION SEARCH: token-scored recall across past runs strictly inside the same workspace.
- POST-TURN CONSOLIDATION: automatically extracts new durable facts/preferences after every turn,
  deduplicates & resolves conflicting values in-place, and enforces character budgets.
"""

from __future__ import annotations

import re
from typing import Any

USER_PROFILE_CHAR_BUDGET = 1375
WORKSPACE_MEMORY_CHAR_BUDGET = 2200

_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "have", "will", "your",
    "about", "into", "please", "could", "would", "should", "what", "when", "where",
    "there", "their", "they", "them", "been", "were", "just", "like", "make", "need",
}


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]{3,}", str(text or "").lower())
    return {w for w in words if w not in _STOPWORDS}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _infer_scope(category: str, content: str) -> str:
    if category in ("user_profile", "tone"):
        return "user_profile"
    low = content.lower()
    if any(
        cue in low
        for cue in (
            "my preferred",
            "i prefer",
            "my timezone",
            "call me",
            "concise",
            "brief replies",
            "detailed replies",
            "working hours",
            "bullet points",
        )
    ):
        return "user_profile"
    return "workspace_memory"


def _topic_key(content: str, category: str) -> str:
    low = content.lower()
    if re.search(r"\b(kes|usd|eur|gbp|ugx|tzs|rwf)\b", low) and any(
        w in low for w in ("currency", "default", "prefer", "use ", "bill in", "price in")
    ):
        return "pref:currency"
    if any(w in low for w in ("timezone", "eat", "utc", "nairobi", "lagos", "london")):
        return "pref:timezone"
    if any(w in low for w in ("meeting", "standup", "sync")) and re.search(r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b", low):
        return "pref:meeting_time"
    if any(w in low for w in ("concise", "brief", "short replies", "detailed", "tone", "bullet")):
        return "pref:tone"
    if any(w in low for w in ("goal", "target", "revenue target", "kpi", "objective")):
        return "biz:goal"
    if any(w in low for w in ("industry", "we sell", "we build", "we offer", "our business")):
        return "biz:profile"
    if any(w in low for w in ("top customer", "main customer", "key client", "vip client")):
        return "biz:key_customer"
    if any(w in low for w in ("savings", "budget", "emergency fund")):
        return "personal:financial_goal"
    toks = sorted(_tokens(content))[:4]
    return f"{category}:{'_'.join(toks)}" if toks else f"{category}:general"


def extract_turn_memories(
    prompt: str,
    summary: str,
    tool_id: str,
    workspace_kind: str,
    existing_memories: list[dict[str, Any]],
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Post-turn Hermes learning loop: extract durable facts, update conflicts, prune over budget."""
    prompt_clean = " ".join(str(prompt or "").strip().split())
    params = params or {}
    candidates: list[dict[str, Any]] = []

    # 1. Explicit user memory instructions ("remember that ...", "always ...", "note that ...")
    explicit_patterns = [
        r"(?:please\s+)?remember\s+(?:that\s+)?(.{8,240})",
        r"(?:from now on|going forward|always)\s*,?\s*(.{8,220})",
        r"(?:i prefer|my preference is|we prefer)\s+(?:to\s+)?(.{6,200})",
        r"(?:our business|our company|my business)\s+(?:is|sells|offers|focuses on)\s+(.{6,200})",
        r"(?:our goal is|my goal is|our target is|revenue target is)\s+(.{6,200})",
    ]
    for pat in explicit_patterns:
        m = re.search(pat, prompt_clean, flags=re.IGNORECASE)
        if m:
            fact = m.group(0).strip().rstrip(".")
            if len(fact) >= 10:
                cat = "user_profile" if re.search(r"\b(i prefer|my preference|concise|brief|tone|timezone)\b", fact, re.I) else "business_context"
                if workspace_kind == "personal" and cat == "business_context":
                    cat = "preference"
                candidates.append(
                    {
                        "category": cat,
                        "scope": _infer_scope(cat, fact),
                        "content": fact[:260],
                        "topic_key": _topic_key(fact, cat),
                        "confidence": 0.92,
                        "source": "auto_learned",
                    }
                )

    # 2. Implicit currency / meeting / workflow preferences from actual executed actions
    low_prompt = prompt_clean.lower()
    curr_match = re.search(r"\b(?:use|prefer|default to|bill in|in)\s+(KES|USD|EUR|GBP|UGX|TZS|RWF)\b", prompt_clean)
    if curr_match:
        curr = curr_match.group(1).upper()
        fact = f"Preferred workspace currency for operations and reporting: {curr}"
        candidates.append(
            {
                "category": "preference",
                "scope": "user_profile",
                "content": fact,
                "topic_key": "pref:currency",
                "confidence": 0.85,
                "source": "auto_learned",
            }
        )

    if tool_id == "schedule_meeting" and params.get("start"):
        time_match = re.search(r"T(\d{2}:\d{2})", str(params.get("start", "")))
        if time_match and any(w in low_prompt for w in ("usual", "normally", "always", "prefer", "every")):
            hhmm = time_match.group(1)
            fact = f"Preferred recurring meeting slot around {hhmm} ({params.get('timezone', 'Africa/Nairobi')})"
            candidates.append(
                {
                    "category": "preference",
                    "scope": "user_profile",
                    "content": fact,
                    "topic_key": "pref:meeting_time",
                    "confidence": 0.8,
                    "source": "auto_learned",
                }
            )

    if tool_id == "create_project" and params.get("name"):
        proj_name = str(params["name"]).strip()[:80]
        if len(proj_name) >= 3:
            fact = f"Active workspace project initiative: {proj_name}"
            candidates.append(
                {
                    "category": "learned_fact",
                    "scope": "workspace_memory",
                    "content": fact,
                    "topic_key": f"project:{proj_name.lower()[:32]}",
                    "confidence": 0.78,
                    "source": "auto_learned",
                }
            )

    if tool_id == "create_crm_lead" and (params.get("company") or params.get("contact_name")):
        entity = str(params.get("company") or params.get("contact_name")).strip()[:80]
        if len(entity) >= 3:
            fact = f"Tracked CRM relationship / prospect: {entity}"
            candidates.append(
                {
                    "category": "learned_fact",
                    "scope": "workspace_memory",
                    "content": fact,
                    "topic_key": f"crm:{entity.lower()[:32]}",
                    "confidence": 0.76,
                    "source": "auto_learned",
                }
            )

    # Deduplicate candidates among themselves
    deduped_candidates: list[dict[str, Any]] = []
    seen_topics: set[str] = set()
    for cand in candidates:
        tk = cand["topic_key"]
        if tk in seen_topics:
            continue
        seen_topics.add(tk)
        deduped_candidates.append(cand)

    actions: list[dict[str, Any]] = []
    existing_by_id = {str(m.get("id")): m for m in existing_memories if m.get("id")}

    for cand in deduped_candidates:
        cand_tokens = _tokens(cand["content"])
        matched_existing: dict[str, Any] | None = None
        for mem in existing_memories:
            mem_topic = mem.get("topic_key") or _topic_key(str(mem.get("content", "")), str(mem.get("category", "preference")))
            if mem_topic == cand["topic_key"]:
                matched_existing = mem
                break
            if _jaccard(cand_tokens, _tokens(str(mem.get("content", "")))) >= 0.72:
                matched_existing = mem
                break

        if matched_existing:
            old_text = str(matched_existing.get("content", "")).strip()
            if old_text.lower() == cand["content"].lower():
                actions.append(
                    {
                        "action": "reinforce",
                        "id": matched_existing.get("id"),
                        "hit_count": int(matched_existing.get("hit_count") or 1) + 1,
                    }
                )
            elif matched_existing.get("source", "manual") == "auto_learned" or cand["confidence"] >= 0.9:
                actions.append(
                    {
                        "action": "update",
                        "id": matched_existing.get("id"),
                        "category": cand["category"],
                        "scope": cand["scope"],
                        "content": cand["content"],
                        "topic_key": cand["topic_key"],
                        "confidence": cand["confidence"],
                        "source": cand["source"],
                    }
                )
        else:
            actions.append({"action": "create", **cand})

    # Compute budget pruning recommendations if a scope exceeds its Hermes character limit
    prune_ids: list[str] = []
    for scope_name, budget in (
        ("user_profile", USER_PROFILE_CHAR_BUDGET),
        ("workspace_memory", WORKSPACE_MEMORY_CHAR_BUDGET),
    ):
        scoped = [
            m
            for m in existing_memories
            if (m.get("scope") or _infer_scope(str(m.get("category", "")), str(m.get("content", "")))) == scope_name
        ]
        # Account for newly created entries in this scope
        added_chars = sum(
            len(a.get("content", "")) + 3
            for a in actions
            if a.get("action") == "create" and a.get("scope") == scope_name
        )
        total_chars = sum(len(str(m.get("content", ""))) + 3 for m in scoped) + added_chars
        if total_chars > budget:
            # Prune lowest-hit oldest auto_learned entries first
            auto_only = sorted(
                [m for m in scoped if m.get("source") == "auto_learned"],
                key=lambda m: (int(m.get("hit_count") or 1), str(m.get("created_at") or "")),
            )
            for victim in auto_only:
                if total_chars <= budget:
                    break
                vid = str(victim.get("id") or "")
                if vid and vid in existing_by_id:
                    prune_ids.append(vid)
                    total_chars -= len(str(victim.get("content", ""))) + 3

    return {
        "actions": actions,
        "prune_ids": prune_ids,
        "learned_count": sum(1 for a in actions if a.get("action") in ("create", "update")),
    }


def search_episodic_sessions(
    query: str,
    past_runs: list[dict[str, Any]],
    limit: int = 4,
) -> list[dict[str, Any]]:
    """Keyword + recency search across past agent runs strictly within the current workspace."""
    q_tokens = _tokens(query)
    if not q_tokens or not past_runs:
        return []
    scored: list[tuple[float, dict[str, Any]]] = []
    for idx, run in enumerate(past_runs[:60]):
        haystack = f"{run.get('prompt', '')} {run.get('summary', '')} {run.get('tool_name', '')}"
        r_tokens = _tokens(haystack)
        overlap = len(q_tokens & r_tokens)
        if overlap == 0:
            continue
        recency_bonus = max(0.0, 0.35 - idx * 0.01)
        score = (overlap / max(1, len(q_tokens))) + recency_bonus
        scored.append(
            (
                score,
                {
                    "run_id": run.get("id"),
                    "tool_name": run.get("tool_name"),
                    "prompt": str(run.get("prompt", ""))[:180],
                    "summary": str(run.get("summary", ""))[:260],
                    "created_at": run.get("created_at"),
                    "score": round(score, 3),
                },
            )
        )
    scored.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in scored[:limit]]


def summarize_memory_blocks(memories: list[dict[str, Any]]) -> dict[str, Any]:
    """Build Hermes-style bounded memory block telemetry for UI & prompt snapshot."""
    user_entries: list[str] = []
    workspace_entries: list[str] = []
    for mem in memories:
        content = str(mem.get("content", "")).strip()
        if not content:
            continue
        scope = mem.get("scope") or _infer_scope(str(mem.get("category", "")), content)
        if scope == "user_profile":
            user_entries.append(content)
        else:
            workspace_entries.append(content)

    user_block = " § ".join(user_entries)
    workspace_block = " § ".join(workspace_entries)
    return {
        "user_profile": {
            "entries": len(user_entries),
            "chars_used": len(user_block),
            "char_budget": USER_PROFILE_CHAR_BUDGET,
            "utilization_pct": min(100, round((len(user_block) / USER_PROFILE_CHAR_BUDGET) * 100)),
            "snapshot": user_block[:USER_PROFILE_CHAR_BUDGET],
        },
        "workspace_memory": {
            "entries": len(workspace_entries),
            "chars_used": len(workspace_block),
            "char_budget": WORKSPACE_MEMORY_CHAR_BUDGET,
            "utilization_pct": min(100, round((len(workspace_block) / WORKSPACE_MEMORY_CHAR_BUDGET) * 100)),
            "snapshot": workspace_block[:WORKSPACE_MEMORY_CHAR_BUDGET],
        },
        "auto_learned_count": sum(1 for m in memories if m.get("source") == "auto_learned"),
        "manual_count": sum(1 for m in memories if m.get("source", "manual") != "auto_learned"),
    }
