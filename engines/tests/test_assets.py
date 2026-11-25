import unittest

from domain.assets import calculate


class DepreciationTests(unittest.TestCase):
    def plan(self, **overrides):
        inputs = {
            "gross_minor": 120001, "salvage_minor": 20000, "prior_minor": 0,
            "method": "straight_line", "frequency": "monthly", "periods": 4,
            "rate_bps": 0, "prorata": False, "start_on": "2026-11-04",
        }
        return calculate({**inputs, **overrides})["rows"]

    def test_straight_line_reconciles_minor_units_and_month_ends(self):
        rows = self.plan()
        self.assertEqual([r["date"] for r in rows],
                         ["2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28"])
        self.assertEqual(sum(r["amount_minor"] for r in rows), 100001)
        self.assertEqual(rows[-1]["book_minor"], 20000)
        self.assertEqual(rows[-1]["remaining_minor"], 0)

    def test_declining_with_evidenced_prior_and_final_balance(self):
        rows = self.plan(method="declining", rate_bps=2500, gross_minor=120000, prior_minor=20000)
        self.assertEqual([r["amount_minor"] for r in rows], [20000, 15000, 11250, 33750])
        self.assertEqual(rows[-1]["cumulative_minor"], 100000)

    def test_annual_prorata_includes_leap_year_and_stubs(self):
        rows = self.plan(start_on="2024-12-31", frequency="annual", periods=1,
                         gross_minor=36600, salvage_minor=0, prorata=True)
        self.assertEqual([r["date"] for r in rows], ["2024-12-31", "2025-12-31"])
        self.assertEqual([r["amount_minor"] for r in rows], [100, 36500])

    def test_non_depreciable_and_invalid_terms(self):
        self.assertEqual(self.plan(method="none", periods=0), [])
        for args in [{"periods": 0}, {"prior_minor": 100002}, {"method": "declining_then_straight"},
                     {"frequency": "annual", "periods": 61}, {"start_on": "2026-02-29"}]:
            with self.subTest(**args), self.assertRaises(ValueError):
                self.plan(**args)
