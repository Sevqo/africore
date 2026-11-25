import json
import subprocess
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "domain" / "rbac_service_pricing.py"


def run_engine(payload: dict) -> dict:
    proc = subprocess.run(
        [sys.executable, "-I", str(SCRIPT)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(proc.stdout)


class TestRbacServicePricing(unittest.TestCase):
    def test_accountant_restricted_to_financial_apps(self) -> None:
        res = run_engine({"op": "evaluate_role_access", "role": "accountant", "app_id": "people"})
        self.assertTrue(res["valid"])
        self.assertIn("finance", res["capabilities"])
        self.assertNotIn("hr", res["capabilities"])
        self.assertFalse(res["app_granted"])
        self.assertIn("accounting", res["allowed_apps"])
        self.assertNotIn("people", res["allowed_apps"])

    def test_hr_role_grants_people_and_blocks_accounting(self) -> None:
        res = run_engine({"op": "evaluate_role_access", "role": "hr", "app_id": "people"})
        self.assertTrue(res["valid"])
        self.assertTrue(res["app_granted"])
        self.assertNotIn("accounting", res["allowed_apps"])

    def test_bundle_pricing_integer_discounts(self) -> None:
        res = run_engine({
            "op": "calculate_service_bundle",
            "annual_commit": False,
            "services": [
                {"service_id": "accounting", "model": "flat", "fixed_minor": 250000},
                {"service_id": "pos", "model": "flat", "fixed_minor": 150000},
                {"service_id": "webhooks", "model": "hybrid", "fixed_minor": 100000, "included": 1000, "unit_minor": 50, "quantity": 1200},
            ],
        })
        self.assertEqual(res["paid_service_count"], 3)
        self.assertEqual(res["subtotal_minor"], 510000)
        self.assertEqual(res["bundle_discount_bps"], 1000)
        self.assertEqual(res["discount_minor"], 51000)
        self.assertEqual(res["net_monthly_minor"], 459000)


if __name__ == "__main__":
    unittest.main()
