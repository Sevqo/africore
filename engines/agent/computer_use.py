"""Computer Use Execution Trace Generator for AfriCore Autonomous Agent.

Builds deterministic, observable multi-step UI interaction traces
(observe -> navigate -> input -> execute -> verify / awaiting_approval)
that drive the live Computer Use Stage and optional workspace navigation.
"""
from __future__ import annotations

from typing import Any


def build_approval_preview_steps(
    boundary: dict[str, Any],
    tool: dict[str, Any],
    params: dict[str, Any],
) -> list[dict[str, Any]]:
    preview_fields: dict[str, Any] = {}
    for k, v in params.items():
        if isinstance(v, (str, int, bool)):
            preview_fields[k] = v
        else:
            preview_fields[k] = str(v)

    return [
        {
            "step_index": 1,
            "phase": "observe",
            "label": "Verify Workspace Context & Isolation Lock",
            "detail": f"{boundary.get('isolation_label', 'Sandboxed')} verified by Python agent engine.",
            "target_tab": tool["target_tab"],
            **({"target_app": tool["target_app"]} if tool.get("target_app") else {}),
            "target_element": "Workspace Isolation Shield",
            "cursor_hint": {"x_pct": 22, "y_pct": 20},
            "status": "completed",
            "duration_ms": 48,
        },
        {
            "step_index": 2,
            "phase": "awaiting_approval",
            "label": f"Awaiting Owner Approval: {tool['name']}",
            "detail": "Restraint-first guardrail paused execution. Review the parameters and approve to execute live.",
            "target_tab": tool["target_tab"],
            **({"target_app": tool["target_app"]} if tool.get("target_app") else {}),
            "target_element": "Approval Decision Bar",
            "cursor_hint": {"x_pct": 52, "y_pct": 58},
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
            "detail": f"Navigated live workspace focus to {target_tab} for `{tool_id}`.",
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
            "label": "Populate Validated Fields",
            "detail": "Applied schema-checked parameters from Python planner.",
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
            "label": "Execute & Verify Canonical Record",
            "detail": verify_detail,
            "target_tab": target_tab,
            **app_kw,
            "target_element": "Verified Record Row",
            "cursor_hint": {"x_pct": 60, "y_pct": 76},
            "status": "completed",
            "duration_ms": 105,
        },
    ]
