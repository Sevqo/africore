"""CLI / JSON-RPC runtime entrypoint for the AfriCore Python Autonomous Agent.

Invoked via: python3 -I engines/agent/runtime.py
Reads a single JSON payload from stdin and writes structured JSON to stdout.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Isolated mode (-I) omits script directories from sys.path; add engines/ explicitly.
_ENGINES_ROOT = str(Path(__file__).resolve().parents[1])
if _ENGINES_ROOT not in sys.path:
    sys.path.insert(0, _ENGINES_ROOT)

from agent.analyzer import analyze_workspace_operations  # noqa: E402
from agent.billing import AGENT_CREDIT_COSTS, evaluate_credit_charge, summarize_billing  # noqa: E402
from agent.computer_use import build_execution_steps  # noqa: E402
from agent.isolation import check_target_access, evaluate_boundary  # noqa: E402
from agent.planner import (  # noqa: E402
    default_permissions_for_kind,
    evaluate_permissions_update,
    optional_llm_narrative,
    plan_agent_run,
    tools_for_kind,
)
from agent.skills import skills_for_kind  # noqa: E402


def dispatch(payload: dict[str, Any]) -> dict[str, Any]:
    op = str(payload.get("op") or "")
    if op == "evaluate_boundary":
        return evaluate_boundary(payload)
    if op == "check_target_access":
        boundary = evaluate_boundary(payload.get("boundary_input") or {})
        verdict = check_target_access(
            boundary,
            str(payload.get("target_workspace_id") or ""),
            payload.get("target_kind"),
        )
        return {"boundary": boundary, **verdict}
    if op == "list_tools":
        kind = str(payload.get("workspace_kind") or "business")
        tools = tools_for_kind(kind)
        return {
            "tools": [
                {**t, "credit_cost": AGENT_CREDIT_COSTS[t["credit_category"]]}
                for t in tools
            ],
            "defaults": default_permissions_for_kind(kind),
            "skills": skills_for_kind(kind),
        }
    if op == "plan_run":
        return plan_agent_run(payload)
    if op == "analyze_operations":
        return analyze_workspace_operations(payload)
    if op == "evaluate_permissions":
        return evaluate_permissions_update(payload)
    if op == "summarize_billing":
        return summarize_billing(payload)
    if op == "evaluate_credit_charge":
        return evaluate_credit_charge(payload)
    if op == "synthesize_trace":
        steps = build_execution_steps(
            tool_id=str(payload.get("tool_id") or ""),
            target_tab=str(payload.get("target_tab") or "Overview"),
            target_app=payload.get("target_app"),
            isolation_label=str(payload.get("isolation_label") or "Sandboxed"),
            preview_fields=dict(payload.get("preview_fields") or {}),
            verify_detail=str(payload.get("verify_detail") or "Verified canonical workspace record."),
        )
        narrative = optional_llm_narrative(
            str(payload.get("prompt") or ""),
            str(payload.get("summary") or ""),
            dict(payload.get("evidence") or {}),
            bool(payload.get("consent_to_provider", False)),
        )
        return {"steps": steps, "llm_narrative": narrative}
    return {"error": f"Unknown agent engine op: {op}"}


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"error": "Empty agent engine input"}))
        return
    try:
        payload = json.loads(raw)
        result = dispatch(payload)
        print(json.dumps(result))
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"error": str(exc)[:300]}))
        sys.exit(1)


if __name__ == "__main__":
    main()
