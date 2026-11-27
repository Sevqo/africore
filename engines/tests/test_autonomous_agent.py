import json
import subprocess
import sys
import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[1] / "agent" / "runtime.py"


def run_agent_py(payload: dict) -> dict:
    proc = subprocess.run(
        [sys.executable, "-I", str(RUNTIME)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(proc.stdout)


class TestPythonAutonomousAgent(unittest.TestCase):
    def test_business_agent_is_strictly_sandboxed(self) -> None:
        boundary = run_agent_py({
            "op": "evaluate_boundary",
            "source_workspace_id": "biz-1",
            "source_kind": "business",
            "source_name": "Savannah Supplies",
            "cross_dev_bridge_enabled": True,
            "owned_companions": [
                {"id": "dev-1", "kind": "developer", "name": "Dev", "status": "active", "role": "owner"}
            ],
        })
        self.assertEqual(boundary["source_kind"], "business")
        self.assertFalse(boundary["cross_workspace_bridge"])
        self.assertEqual(boundary["allowed_workspace_ids"], ["biz-1"])
        self.assertIn("personal", boundary["blocked_kinds"])
        self.assertIn("developer", boundary["blocked_kinds"])

        # Attempting to target personal/developer/other business is rejected with 403
        blocked = run_agent_py({
            "op": "plan_run",
            "boundary_input": {
                "source_workspace_id": "biz-1",
                "source_kind": "business",
                "source_name": "Savannah Supplies",
            },
            "prompt": "Analyze records",
            "target_workspace_id": "personal-1",
            "currency": "KES",
        })
        self.assertFalse(blocked["ok"])
        self.assertEqual(blocked["status"], 403)
        self.assertTrue(blocked["audit_violation"])

    def test_personal_bridges_developer_and_blocks_business(self) -> None:
        plan = run_agent_py({
            "op": "plan_run",
            "boundary_input": {
                "source_workspace_id": "pers-1",
                "source_kind": "personal",
                "source_name": "Personal",
                "cross_dev_bridge_enabled": True,
                "owned_companions": [
                    {"id": "dev-1", "kind": "developer", "name": "Dev Console", "status": "active", "role": "owner"}
                ],
            },
            "prompt": "Check my linked Developer workspace API health",
            "currency": "KES",
        })
        self.assertTrue(plan["ok"])
        self.assertEqual(plan["target_workspace_id"], "dev-1")
        self.assertEqual(plan["tool"]["id"], "inspect_linked_developer_workspace")

        blocked_biz = run_agent_py({
            "op": "plan_run",
            "boundary_input": {
                "source_workspace_id": "pers-1",
                "source_kind": "personal",
                "source_name": "Personal",
                "cross_dev_bridge_enabled": True,
                "owned_companions": [
                    {"id": "dev-1", "kind": "developer", "name": "Dev Console", "status": "active", "role": "owner"}
                ],
            },
            "prompt": "Analyze business",
            "target_workspace_id": "biz-1",
            "currency": "KES",
        })
        self.assertFalse(blocked_biz["ok"])
        self.assertEqual(blocked_biz["status"], 403)

    def test_restraint_first_approval_and_computer_use_preview(self) -> None:
        plan = run_agent_py({
            "op": "plan_run",
            "boundary_input": {
                "source_workspace_id": "biz-1",
                "source_kind": "business",
                "source_name": "Savannah Supplies",
            },
            "prompt": 'Schedule a meeting for "Q4 Supplier Review" tomorrow',
            "currency": "KES",
            "computer_use": True,
        })
        self.assertTrue(plan["ok"])
        self.assertEqual(plan["tool"]["id"], "schedule_meeting")
        self.assertEqual(plan["execution_mode"], "approval_required")
        self.assertEqual(plan["params"]["title"], "Q4 Supplier Review")
        self.assertGreaterEqual(len(plan["preview_steps"]), 2)
        self.assertEqual(plan["preview_steps"][-1]["phase"], "awaiting_approval")

    def test_separate_agent_billing_and_hard_stop_cap(self) -> None:
        summary = run_agent_py({
            "op": "summarize_billing",
            "plan_tier": "agent_starter",
            "period": "2026-11",
            "monthly_credits_included": 50,
            "bonus_credits": 0,
            "overage_unit_minor": 1000,
            "monthly_spend_cap_minor": 250000,
            "hard_stop": True,
            "ledger": [{"credits_delta": -5}],
        })
        self.assertEqual(summary["billing_stream"], "separate_agent_credits")
        self.assertTrue(summary["excluded_from_workspace_all_apps_cap"])
        self.assertEqual(summary["credits_used"], 5)
        self.assertEqual(summary["credits_remaining"], 45)

        capped = run_agent_py({
            "op": "evaluate_credit_charge",
            "plan_tier": "agent_growth",
            "period": "2026-11",
            "monthly_credits_included": 300,
            "bonus_credits": 0,
            "overage_unit_minor": 600,
            "monthly_spend_cap_minor": 50000,
            "hard_stop": True,
            "ledger": [],
            "credits_requested": 1,
        })
        self.assertFalse(capped["allowed"])
        self.assertEqual(capped["status"], 429)


if __name__ == "__main__":
    unittest.main()
