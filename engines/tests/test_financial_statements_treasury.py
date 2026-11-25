import unittest

from domain import financial_statements_treasury


class TestAccountingParity(unittest.TestCase):
    def test_cash_flow_statement(self):
        res = financial_statements_treasury.run({
            "op": "cash_flow_statement",
            "opening_cash_minor": 100_000,
            "movements": [
                {"activity": "operating", "amount_minor": 50_000},
                {"activity": "operating", "amount_minor": -15_000},
                {"activity": "investing", "amount_minor": -20_000},
                {"activity": "financing", "amount_minor": 30_000},
            ],
        })
        self.assertEqual(res["operating"]["net_minor"], 35_000)
        self.assertEqual(res["investing"]["net_minor"], -20_000)
        self.assertEqual(res["financing"]["net_minor"], 30_000)
        self.assertEqual(res["net_change_minor"], 45_000)
        self.assertEqual(res["closing_cash_minor"], 145_000)

    def test_fx_revaluation(self):
        # 1000.00 USD receivable booked at 128.50 KES, revalued at 130.00 KES => +1500.00 KES gain
        res = financial_statements_treasury.run({
            "op": "fx_revaluation",
            "base_currency": "KES",
            "positions": [
                {
                    "reference": "INV-001",
                    "currency": "USD",
                    "foreign_amount_minor": 100_000,
                    "booked_rate_micros": 128_500_000,
                    "closing_rate_micros": 130_000_000,
                },
                {
                    "reference": "BILL-001",
                    "currency": "USD",
                    "foreign_amount_minor": -50_000,
                    "booked_rate_micros": 128_500_000,
                    "closing_rate_micros": 130_000_000,
                },
            ],
        })
        self.assertEqual(res["total_unrealized_gain_minor"], 150_000)
        self.assertEqual(res["total_unrealized_loss_minor"], 75_000)
        self.assertEqual(res["net_unrealized_minor"], 75_000)

    def test_budget_variance(self):
        res = financial_statements_treasury.run({
            "op": "budget_variance",
            "lines": [
                {"analytic_account_id": "cc-1", "name": "Ops", "planned_minor": 100_000, "actual_minor": 120_000},
                {"analytic_account_id": "cc-2", "name": "Sales", "planned_minor": 200_000, "actual_minor": 150_000},
            ],
        })
        self.assertEqual(res["lines"][0]["achievement_bps"], 12_000)
        self.assertTrue(res["lines"][0]["over_budget"])
        self.assertEqual(res["total_planned_minor"], 300_000)
        self.assertEqual(res["total_actual_minor"], 270_000)
        self.assertEqual(res["total_variance_minor"], -30_000)
        self.assertEqual(res["total_achievement_bps"], 9_000)

    def test_followup_evaluate(self):
        res = financial_statements_treasury.run({
            "op": "followup_evaluate",
            "levels": [
                {"id": "lv1", "name": "7d Reminder", "days_overdue": 7, "channel": "email", "auto_send": True},
                {"id": "lv2", "name": "30d Final Notice", "days_overdue": 30, "channel": "sms", "auto_send": False},
            ],
            "invoices": [
                {"invoice_id": "inv1", "customer_id": "c1", "days_overdue": 12, "amount_due_minor": 50_000},
                {"invoice_id": "inv2", "customer_id": "c2", "days_overdue": 45, "amount_due_minor": 80_000},
                {"invoice_id": "inv3", "customer_id": "c3", "days_overdue": 3, "amount_due_minor": 20_000},
            ],
        })
        self.assertEqual(res["action_count"], 2)
        self.assertEqual(res["actions"][0]["level_id"], "lv1")
        self.assertEqual(res["actions"][1]["level_id"], "lv2")
        self.assertEqual(res["total_overdue_minor"], 130_000)

    def test_batch_payment_summary(self):
        res = financial_statements_treasury.run({
            "op": "batch_payment_summary",
            "currency": "KES",
            "payments": [
                {"payment_id": "p1", "partner_name": "Acme", "reference": "REF1", "amount_minor": 40_000, "currency": "KES"},
                {"payment_id": "p2", "partner_name": "Beta", "reference": "REF2", "amount_minor": 60_000, "currency": "KES"},
            ],
        })
        self.assertEqual(res["payment_count"], 2)
        self.assertEqual(res["total_minor"], 100_000)


if __name__ == "__main__":
    unittest.main()
