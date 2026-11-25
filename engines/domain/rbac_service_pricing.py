"""Pure-stdlib RBAC role capability/app matrix and service bundle pricing engine.

Zero floating-point math: all monetary amounts are integer minor units (KES cents)
and all discount rates are integer basis points (10_000 = 100.00%).
"""
from __future__ import annotations

import json
import sys
from typing import Any

# Canonical Business Apps (26 apps + optional help center)
ALL_BUSINESS_APPS = [
    "pos",
    "commerce",
    "procurement",
    "documents",
    "people",
    "business_id",
    "accounting",
    "work",
    "finance",
    "crm",
    "inventory",
    "sales",
    "analytics",
    "automations",
    "calendar",
    "website",
    "marketing",
    "support",
    "subscriptions",
    "manufacturing",
    "field_operations",
    "logistics",
    "property_hospitality",
    "knowledge_learning",
    "studio",
    "integrations_hub",
]

ROLE_MATRIX: dict[str, dict[str, Any]] = {
    "owner": {
        "label": "Workspace Owner",
        "description": "Full ownership, billing, team administration, and access across every workspace app.",
        "capabilities": ["read", "admin", "finance", "operations", "hr", "sales", "support", "marketing"],
        "apps": list(ALL_BUSINESS_APPS),
    },
    "admin": {
        "label": "Administrator",
        "description": "Manages team invitations, app installations, services, and operational workflows.",
        "capabilities": ["read", "admin", "finance", "operations", "hr", "sales", "support", "marketing"],
        "apps": list(ALL_BUSINESS_APPS),
    },
    "finance": {
        "label": "Finance Manager",
        "description": "Manages invoices, cash flow, accounting books, subscriptions, procurement bills, and analytics.",
        "capabilities": ["read", "finance", "operations"],
        "apps": [
            "finance",
            "accounting",
            "analytics",
            "procurement",
            "subscriptions",
            "property_hospitality",
            "documents",
            "calendar",
            "work",
        ],
    },
    "accountant": {
        "label": "Accountant",
        "description": "Focused financial authority for Accounting, Finance, Subscriptions billing, Analytics, and Documents.",
        "capabilities": ["read", "finance"],
        "apps": [
            "accounting",
            "finance",
            "analytics",
            "subscriptions",
            "documents",
            "calendar",
            "work",
        ],
    },
    "hr": {
        "label": "HR & People Manager",
        "description": "Manages People, recruitment, leave, attendance, training courses, calendar, and projects.",
        "capabilities": ["read", "hr", "operations"],
        "apps": [
            "people",
            "knowledge_learning",
            "work",
            "calendar",
            "documents",
        ],
    },
    "sales": {
        "label": "Sales Representative",
        "description": "Manages CRM leads, quotations, sales orders, POS counter shifts, storefront, and subscriptions.",
        "capabilities": ["read", "sales", "operations"],
        "apps": [
            "crm",
            "sales",
            "pos",
            "commerce",
            "subscriptions",
            "calendar",
            "work",
            "documents",
        ],
    },
    "operations": {
        "label": "Operations Member",
        "description": "Runs inventory, procurement, manufacturing, field service, logistics, projects, and daily execution.",
        "capabilities": ["read", "operations"],
        "apps": [
            "inventory",
            "procurement",
            "pos",
            "sales",
            "crm",
            "work",
            "calendar",
            "documents",
            "manufacturing",
            "field_operations",
            "logistics",
            "property_hospitality",
            "knowledge_learning",
            "support",
        ],
    },
    "inventory_manager": {
        "label": "Inventory & Supply Manager",
        "description": "Controls warehouses, stock movements, purchasing, manufacturing orders, and freight logistics.",
        "capabilities": ["read", "operations"],
        "apps": [
            "inventory",
            "procurement",
            "manufacturing",
            "logistics",
            "field_operations",
            "pos",
            "work",
            "calendar",
            "documents",
        ],
    },
    "support_agent": {
        "label": "Support Specialist",
        "description": "Handles helpdesk tickets, SLA queues, knowledge base articles, CRM context, and field escalations.",
        "capabilities": ["read", "support", "operations"],
        "apps": [
            "support",
            "crm",
            "knowledge_learning",
            "field_operations",
            "work",
            "calendar",
            "documents",
        ],
    },
    "marketing_manager": {
        "label": "Marketing & Growth",
        "description": "Runs campaigns, website pages, storefront promotions, lead capture, and analytics.",
        "capabilities": ["read", "marketing", "operations"],
        "apps": [
            "marketing",
            "website",
            "commerce",
            "crm",
            "analytics",
            "calendar",
            "work",
            "documents",
        ],
    },
    "viewer": {
        "label": "Read-Only Viewer",
        "description": "Reads authorized reports, shared schedules, assigned tasks, and documents without write access.",
        "capabilities": ["read"],
        "apps": [
            "analytics",
            "finance",
            "work",
            "calendar",
            "documents",
            "knowledge_learning",
        ],
    },
}


def _round_div(num: int, den: int) -> int:
    if den <= 0:
        raise ValueError("denominator must be positive")
    if num >= 0:
        return (num + den // 2) // den
    return -((-num + den // 2) // den)


def evaluate_role_access(payload: dict[str, Any]) -> dict[str, Any]:
    role = str(payload.get("role", "viewer")).strip().lower()
    definition = ROLE_MATRIX.get(role)
    if not definition:
        return {
            "role": role,
            "valid": False,
            "label": "Unknown Role",
            "description": "",
            "capabilities": [],
            "allowed_apps": [],
        }
    requested_capability = payload.get("capability")
    requested_app = payload.get("app_id")
    caps = list(definition["capabilities"])
    apps = list(definition["apps"])
    return {
        "role": role,
        "valid": True,
        "label": definition["label"],
        "description": definition["description"],
        "capabilities": caps,
        "allowed_apps": apps,
        "capability_granted": bool(requested_capability in caps) if requested_capability else True,
        "app_granted": bool(requested_app in apps) if requested_app else True,
    }


def calculate_service_bundle(payload: dict[str, Any]) -> dict[str, Any]:
    """Compute exact integer KES minor-unit monthly estimates & bundle savings."""
    items = list(payload.get("services", []))
    annual_commit = bool(payload.get("annual_commit", False))

    line_results: list[dict[str, Any]] = []
    subtotal_minor = 0
    paid_count = 0

    for item in items:
        service_id = str(item.get("service_id", ""))
        model = str(item.get("model", "free"))
        fixed_minor = max(0, int(item.get("fixed_minor", 0)))
        unit_minor = max(0, int(item.get("unit_minor", 0)))
        included = max(0, int(item.get("included", 0)))
        quantity = max(0, int(item.get("quantity", 0)))
        cap_minor = item.get("cap_minor")

        if model == "free":
            est = 0
        elif model == "flat":
            est = fixed_minor
        else:
            billable = max(0, quantity - (included if model in ("allowance", "hybrid", "tiered") else 0))
            est = billable * unit_minor + (fixed_minor if model == "hybrid" else 0)
            if cap_minor is not None:
                est = min(est, max(0, int(cap_minor)))

        if est > 0:
            paid_count += 1
        subtotal_minor += est
        line_results.append({
            "service_id": service_id,
            "model": model,
            "quantity": quantity,
            "estimated_minor": est,
        })

    # Suite bundle discount: 10% (1000 bps) for 3-5 paid services, 15% (1500 bps) for 6+ paid services
    bundle_discount_bps = 1500 if paid_count >= 6 else (1000 if paid_count >= 3 else 0)
    if annual_commit:
        bundle_discount_bps += 1000  # extra 10% annual commitment estimate discount

    discount_minor = _round_div(subtotal_minor * bundle_discount_bps, 10_000)
    net_minor = max(0, subtotal_minor - discount_minor)

    return {
        "currency": "KES",
        "service_count": len(line_results),
        "paid_service_count": paid_count,
        "subtotal_minor": subtotal_minor,
        "bundle_discount_bps": bundle_discount_bps,
        "discount_minor": discount_minor,
        "net_monthly_minor": net_minor,
        "lines": line_results,
    }


def list_role_catalog(_payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "roles": [
            {
                "id": role_id,
                "label": meta["label"],
                "description": meta["description"],
                "capabilities": meta["capabilities"],
                "allowed_apps": meta["apps"],
            }
            for role_id, meta in ROLE_MATRIX.items()
        ]
    }


OPERATIONS = {
    "evaluate_role_access": evaluate_role_access,
    "calculate_service_bundle": calculate_service_bundle,
    "list_role_catalog": list_role_catalog,
}


def main() -> None:
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else {}
    op = str(payload.get("op", "list_role_catalog"))
    fn = OPERATIONS.get(op)
    if fn is None:
        sys.stdout.write(json.dumps({"error": f"Unknown rbac_service_pricing operation: {op}"}))
        return
    try:
        result = fn(payload)
        sys.stdout.write(json.dumps(result))
    except Exception as exc:  # noqa: BLE001
        sys.stdout.write(json.dumps({"error": str(exc)[:280]}))


if __name__ == "__main__":
    main()
