import unittest

from africore_accounting.statements import summarize_statement


class StatementSummaryTests(unittest.TestCase):
    def test_balanced_trial_balance_and_accounting_equation(self):
        result = summarize_statement(
            {
                "rows": [
                    {
                        "type": "asset",
                        "category": "asset",
                        "selected": True,
                        "opening_debit_minor": 120000,
                        "opening_credit_minor": 0,
                        "debit_minor": 30000,
                        "credit_minor": 0,
                        "fiscal_result_minor": 0,
                        "closing_minor": 150000,
                        "movement_minor": 30000,
                    },
                    {
                        "type": "equity",
                        "category": "equity",
                        "selected": True,
                        "opening_debit_minor": 0,
                        "opening_credit_minor": 100000,
                        "debit_minor": 0,
                        "credit_minor": 0,
                        "fiscal_result_minor": 0,
                        "closing_minor": -100000,
                        "movement_minor": 0,
                    },
                    {
                        "type": "revenue",
                        "category": "revenue",
                        "selected": True,
                        "opening_debit_minor": 0,
                        "opening_credit_minor": 20000,
                        "debit_minor": 0,
                        "credit_minor": 45000,
                        "fiscal_result_minor": 45000,
                        "closing_minor": -65000,
                        "movement_minor": -45000,
                    },
                    {
                        "type": "expense",
                        "category": "cost_of_sales",
                        "selected": True,
                        "opening_debit_minor": 0,
                        "opening_credit_minor": 0,
                        "debit_minor": 10000,
                        "credit_minor": 0,
                        "fiscal_result_minor": -10000,
                        "closing_minor": 10000,
                        "movement_minor": 10000,
                    },
                    {
                        "type": "expense",
                        "category": "expense",
                        "selected": True,
                        "opening_debit_minor": 0,
                        "opening_credit_minor": 0,
                        "debit_minor": 5000,
                        "credit_minor": 0,
                        "fiscal_result_minor": -5000,
                        "closing_minor": 5000,
                        "movement_minor": 5000,
                    },
                ]
            }
        )
        t = result["totals"]
        self.assertTrue(t["balanced"])
        self.assertEqual(t["debit_minor"], 45000)
        self.assertEqual(t["credit_minor"], 45000)
        self.assertEqual(t["assets_minor"], 150000)
        self.assertEqual(t["posted_equity_minor"], 100000)
        self.assertEqual(t["retained_earnings_minor"], 20000)
        self.assertEqual(t["current_year_result_minor"], 30000)
        self.assertEqual(t["equity_minor"], 150000)
        self.assertEqual(t["equation_variance_minor"], 0)
        self.assertEqual(t["revenue_minor"], 45000)
        self.assertEqual(t["cost_of_sales_minor"], 10000)
        self.assertTrue(t["has_cost_of_sales"])
        self.assertEqual(t["gross_profit_minor"], 35000)
        self.assertEqual(t["operating_expenses_minor"], 5000)
        self.assertEqual(t["net_profit_minor"], 30000)

    def test_detects_invalid_movement_and_unbalanced_totals(self):
        with self.assertRaises(ValueError):
            summarize_statement(
                {
                    "rows": [
                        {
                            "type": "asset",
                            "debit_minor": 100,
                            "credit_minor": 0,
                            "movement_minor": 50,
                        }
                    ]
                }
            )
        unbalanced = summarize_statement(
            {
                "rows": [
                    {
                        "type": "asset",
                        "debit_minor": 100,
                        "credit_minor": 0,
                        "closing_minor": 100,
                        "movement_minor": 100,
                    }
                ]
            }
        )
        self.assertFalse(unbalanced["totals"]["balanced"])
        self.assertEqual(unbalanced["totals"]["equation_variance_minor"], 100)
