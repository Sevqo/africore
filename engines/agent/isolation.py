"""Strict Workspace Isolation & Sandboxing Engine for AfriCore Autonomous Agent.

Security invariants:
1. Business workspace agent is PERMANENTLY sandboxed to its active Business workspace.
   It can NEVER read or mutate Personal, Developer, or any other Business workspace.
2. Personal workspace agent can access the user's own Personal workspace AND their
   active owned Developer workspace (when the bridge is enabled). It can NEVER access
   any Business workspace.
3. Developer workspace agent can access the user's own Developer workspace AND their
   active owned Personal workspace (when the bridge is enabled). It can NEVER access
   any Business workspace.
"""
from __future__ import annotations

from typing import Any

VALID_KINDS = ("business", "personal", "developer")


def evaluate_boundary(payload: dict[str, Any]) -> dict[str, Any]:
    source_id = str(payload.get("source_workspace_id") or "")
    source_kind = str(payload.get("source_kind") or "business")
    if source_kind not in VALID_KINDS:
        source_kind = "business"
    source_name = str(payload.get("source_name") or "Workspace")
    cross_bridge_requested = bool(payload.get("cross_dev_bridge_enabled", True))
    is_api_key = bool(payload.get("is_api", False))
    companion_workspaces = list(payload.get("owned_companions") or [])

    if source_kind == "business":
        return {
            "source_workspace_id": source_id,
            "source_kind": "business",
            "allowed_workspace_ids": [source_id],
            "linked_workspaces": [
                {
                    "id": source_id,
                    "kind": "business",
                    "name": source_name,
                    "relation": "current",
                }
            ],
            "blocked_kinds": ["personal", "developer", "other_business"],
            "cross_workspace_bridge": False,
            "sandbox_policy": (
                "Business Sandbox Lock: This Python agent is strictly isolated inside this "
                "business workspace. It has zero read or write access to Personal, Developer, "
                "or other Business workspaces."
            ),
            "isolation_label": "Business Sandboxed",
        }

    linked: list[dict[str, Any]] = [
        {
            "id": source_id,
            "kind": source_kind,
            "name": source_name,
            "relation": "current",
        }
    ]
    allowed_ids: list[str] = [source_id]
    expected_companion = "developer" if source_kind == "personal" else "personal"

    if cross_bridge_requested and not is_api_key:
        for row in companion_workspaces:
            cid = str(row.get("id") or "")
            ckind = str(row.get("kind") or "")
            cname = str(row.get("name") or ckind)
            cstatus = str(row.get("status") or "active")
            crole = str(row.get("role") or "")
            if (
                cid
                and cid != source_id
                and ckind == expected_companion
                and cstatus == "active"
                and crole == "owner"
                and cid not in allowed_ids
            ):
                allowed_ids.append(cid)
                linked.append(
                    {
                        "id": cid,
                        "kind": ckind,
                        "name": cname,
                        "relation": "personal_developer_bridge",
                    }
                )

    has_bridge = len(linked) > 1
    if source_kind == "personal":
        policy = (
            "Personal + Developer Scope: This Python agent can manage your Personal workspace "
            "and linked Developer workspace. Business workspaces are permanently blocked."
        )
        label = (
            "Personal + Dev Bridge · Business Blocked"
            if has_bridge
            else "Personal Isolated · Business Blocked"
        )
    else:
        policy = (
            "Developer + Personal Scope: This Python agent can manage your Developer workspace "
            "and linked Personal workspace. Business workspaces are permanently blocked."
        )
        label = (
            "Developer + Personal Bridge · Business Blocked"
            if has_bridge
            else "Developer Isolated · Business Blocked"
        )

    return {
        "source_workspace_id": source_id,
        "source_kind": source_kind,
        "allowed_workspace_ids": allowed_ids,
        "linked_workspaces": linked,
        "blocked_kinds": ["business"],
        "cross_workspace_bridge": has_bridge,
        "sandbox_policy": policy,
        "isolation_label": label,
    }


def check_target_access(
    boundary: dict[str, Any],
    target_workspace_id: str,
    target_kind: str | None = None,
) -> dict[str, Any]:
    source_kind = str(boundary.get("source_kind") or "business")
    source_id = str(boundary.get("source_workspace_id") or "")
    allowed_ids = list(boundary.get("allowed_workspace_ids") or [])
    target_id = target_workspace_id or source_id

    if target_id not in allowed_ids:
        reason = (
            "Business workspace isolation violation: a Business agent can never access "
            "Personal, Developer, or other Business workspaces."
            if source_kind == "business"
            else "Workspace isolation violation: Personal and Developer agents can never "
            "access Business workspaces or unowned workspaces."
        )
        return {"allowed": False, "status": 403, "reason": reason, "audit_violation": True}

    if source_kind == "business" and target_id != source_id:
        return {
            "allowed": False,
            "status": 403,
            "reason": "Business agent cannot escape its sandboxed workspace.",
            "audit_violation": True,
        }

    if target_kind == "business" and source_kind != "business":
        return {
            "allowed": False,
            "status": 403,
            "reason": "Personal and Developer agents are strictly blocked from Business workspaces.",
            "audit_violation": True,
        }

    return {"allowed": True, "status": 200, "reason": "ok", "audit_violation": False}
