import unittest

from domain import enterprise_operations


class TestSuiteParity(unittest.TestCase):
    def test_work_and_people(self):
        w = enterprise_operations.run({
            "op": "work_profitability",
            "revenue_minor": 1_000_000,
            "labor_cost_minor": 500_000,
            "expense_cost_minor": 100_000,
            "planned_hours": 100,
            "logged_hours": 80,
            "billable_hours": 60,
        })
        self.assertEqual(w["margin_bps"], 4000)
        self.assertEqual(w["utilization_bps"], 8000)
        self.assertEqual(w["billable_bps"], 7500)

        p = enterprise_operations.run({
            "op": "people_shift_overtime",
            "regular_limit_minutes": 480,
            "hourly_rate_minor": 1000,
            "overtime_multiplier_bps": 15000,
            "shifts": [{"worked_minutes": 600}],
        })
        self.assertEqual(p["regular_pay_minor"], 8000)
        self.assertEqual(p["overtime_pay_minor"], 3000)
        self.assertEqual(p["total_pay_minor"], 11000)

    def test_commerce_and_finance(self):
        c = enterprise_operations.run({
            "op": "commerce_abandoned_carts",
            "threshold_minutes": 30,
            "carts": [
                {"cart_id": "c1", "customer_email": "a@b.com", "idle_minutes": 45, "cart_total_minor": 50_000},
                {"cart_id": "c2", "customer_email": "c@d.com", "idle_minutes": 10, "cart_total_minor": 20_000},
            ],
        })
        self.assertEqual(c["abandoned_count"], 1)
        self.assertEqual(c["recoverable_value_minor"], 50_000)

        f = enterprise_operations.run({
            "op": "finance_treasury_runway",
            "cash_balance_minor": 600_000,
            "monthly_inflow_minor": 100_000,
            "monthly_outflow_minor": 200_000,
        })
        self.assertEqual(f["runway_months"], 6)
        self.assertEqual(f["liquidity_status"], "healthy")

    def test_apps_17_to_24_engines(self):
        m = enterprise_operations.run({
            "op": "marketing_funnel",
            "delivered": 1000,
            "opened": 400,
            "clicked": 100,
            "converted": 25,
            "attributed_revenue_minor": 500_000,
            "spend_minor": 100_000,
        })
        self.assertEqual(m["open_rate_bps"], 4000)
        self.assertEqual(m["roi_bps"], 40000)

        s = enterprise_operations.run({
            "op": "support_sla_evaluate",
            "tickets": [
                {"ticket_id": "t1", "sla_target_minutes": 120, "elapsed_minutes": 90},
                {"ticket_id": "t2", "sla_target_minutes": 120, "elapsed_minutes": 180},
            ],
        })
        self.assertEqual(s["compliance_bps"], 5000)
        self.assertEqual(s["breached_count"], 1)

        sub = enterprise_operations.run({
            "op": "subscriptions_nrr",
            "starting_mrr_minor": 1_000_000,
            "expansion_mrr_minor": 200_000,
            "contraction_mrr_minor": 50_000,
            "churn_mrr_minor": 50_000,
        })
        self.assertEqual(sub["nrr_bps"], 11000)

        mrp = enterprise_operations.run({
            "op": "mrp_workcenter_oee",
            "planned_minutes": 100,
            "downtime_minutes": 10,
            "ideal_cycle_seconds": 60,
            "total_units": 90,
            "good_units": 81,
        })
        self.assertEqual(mrp["availability_bps"], 9000)
        self.assertEqual(mrp["performance_bps"], 10000)
        self.assertEqual(mrp["quality_bps"], 9000)
        self.assertEqual(mrp["oee_bps"], 8100)

        rent = enterprise_operations.run({
            "op": "rental_pricing",
            "period": "day",
            "duration_units": 5,
            "rate_minor": 10_000,
            "late_units": 1,
            "late_fee_per_unit_minor": 5_000,
        })
        self.assertEqual(rent["grand_total_minor"], 55_000)

        hosp = enterprise_operations.run({
            "op": "hospitality_revpar",
            "available_room_nights": 100,
            "occupied_room_nights": 80,
            "room_revenue_minor": 800_000,
        })
        self.assertEqual(hosp["occupancy_bps"], 8000)
        self.assertEqual(hosp["adr_minor"], 10_000)
        self.assertEqual(hosp["revpar_minor"], 8_000)

        quiz = enterprise_operations.run({
            "op": "learning_quiz_grade",
            "pass_threshold_bps": 7000,
            "questions": [
                {"points": 2, "submitted": "A", "expected": "a"},
                {"points": 2, "submitted": "B", "expected": "b"},
                {"points": 1, "submitted": "C", "expected": "d"},
            ],
        })
        self.assertEqual(quiz["score_bps"], 8000)
        self.assertTrue(quiz["passed"])


if __name__ == "__main__":
    unittest.main()
