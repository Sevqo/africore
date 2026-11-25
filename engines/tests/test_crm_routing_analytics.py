import unittest

from domain import crm_routing_analytics


class TestCrmParity(unittest.TestCase):
    def test_route_lead(self):
        res = crm_routing_analytics.run({
            "op": "route_lead",
            "lead": {"country": "KE", "source": "website", "expected_revenue_minor": 500_000},
            "rules": [
                {
                    "id": "r1",
                    "name": "Kenya Enterprise",
                    "priority": 10,
                    "country": "KE",
                    "min_revenue_minor": 200_000,
                    "team_name": "Enterprise KE",
                    "reps": [
                        {"rep_id": "rep-a", "active_leads": 8, "max_capacity": 10},
                        {"rep_id": "rep-b", "active_leads": 3, "max_capacity": 10},
                    ],
                },
            ],
        })
        self.assertTrue(res["matched"])
        self.assertEqual(res["assigned_rep_id"], "rep-b")

    def test_win_loss_analytics(self):
        res = crm_routing_analytics.run({
            "op": "win_loss_analytics",
            "deals": [
                {"outcome": "won", "expected_revenue_minor": 300_000, "cycle_days": 14},
                {"outcome": "won", "expected_revenue_minor": 500_000, "cycle_days": 26},
                {"outcome": "lost", "expected_revenue_minor": 200_000, "lost_reason": "Price"},
                {"outcome": "open", "expected_revenue_minor": 100_000},
            ],
        })
        self.assertEqual(res["won_count"], 2)
        self.assertEqual(res["lost_count"], 1)
        self.assertEqual(res["win_rate_bps"], 6667)
        self.assertEqual(res["avg_cycle_days"], 20)
        self.assertEqual(res["lost_reasons"][0]["reason"], "Price")

    def test_recurring_rollup(self):
        res = crm_routing_analytics.run({
            "op": "recurring_rollup",
            "opportunities": [
                {"opportunity_id": "o1", "recurring_plan": "monthly", "recurring_revenue_minor": 10_000, "probability_bps": 5000},
                {"opportunity_id": "o2", "recurring_plan": "annual", "recurring_revenue_minor": 120_000, "probability_bps": 10000},
            ],
        })
        self.assertEqual(res["total_mrr_minor"], 20_000)
        self.assertEqual(res["total_arr_minor"], 240_000)
        self.assertEqual(res["total_weighted_mrr_minor"], 15_000)

    def test_quota_attainment(self):
        res = crm_routing_analytics.run({
            "op": "quota_attainment",
            "quotas": [
                {"owner_id": "u1", "owner_name": "Amina", "target_minor": 1_000_000, "won_minor": 1_250_000},
                {"owner_id": "u2", "owner_name": "Brian", "target_minor": 1_000_000, "won_minor": 750_000},
            ],
        })
        self.assertEqual(res["total_attainment_bps"], 10_000)
        self.assertTrue(res["rows"][0]["achieved"])
        self.assertFalse(res["rows"][1]["achieved"])


if __name__ == "__main__":
    unittest.main()
