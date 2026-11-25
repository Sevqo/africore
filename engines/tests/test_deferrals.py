import unittest

from domain.deferrals import schedule


class RecognitionTests(unittest.TestCase):
    def plan(self, **changes):
        return schedule({
            "amount_minor": 120000, "prior_minor": 0,
            "start_on": "2024-01-01", "end_on": "2024-12-31",
            "method": "equal", "frequency": "monthly", **changes,
        })["rows"]

    def test_annual_contract_and_month_end(self):
        rows = self.plan()
        self.assertEqual([row["amount_minor"] for row in rows], [10000] * 12)
        self.assertEqual(rows[1]["date"], "2024-02-29")
        self.assertEqual(rows[-1]["remaining_minor"], 0)

    def test_days_and_partial_months(self):
        dates = {"start_on": "2024-02-15", "end_on": "2024-03-14"}
        self.assertEqual([row["amount_minor"] for row in self.plan(method="days", amount_minor=2900, **dates)],
                         [1500, 1400])
        months = self.plan(method="months", **dates)
        full = self.plan(method="full_months", **dates)
        self.assertGreater(full[0]["amount_minor"], months[0]["amount_minor"])
        self.assertEqual(full[-1]["date"], "2024-03-14")

    def test_quarters_and_prior_recognition_with_rounding(self):
        rows = self.plan(frequency="quarterly", amount_minor=101, prior_minor=6)
        self.assertEqual([row["date"][5:] for row in rows], ["03-31", "06-30", "09-30", "12-31"])
        self.assertEqual(sum(row["amount_minor"] for row in rows), 95)
        self.assertEqual(rows[-1]["cumulative_minor"], 101)
        self.assertEqual(len(self.plan(frequency="annual")), 1)

    def test_invalid_amounts_ranges_and_policies(self):
        for change in [
            {"start_on": "2023-02-29"}, {"end_on": "2023-12-31"}, {"end_on": "2054-02-01"},
            {"amount_minor": -1}, {"amount_minor": 100_000_000_001},
            {"prior_minor": 120001}, {"prior_minor": -1}, {"method": "unknown"},
        ]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.plan(**change)
