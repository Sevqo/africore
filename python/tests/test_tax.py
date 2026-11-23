import unittest

from africore_accounting.tax import calculate_tax, round_cash


class TaxCalculationTests(unittest.TestCase):
    def test_half_minor_unit_rounds_up_without_float(self):
        self.assertEqual(
            calculate_tax({"base_minor": 10, "rate_bps": 1500}),
            {
                "base_minor": 10,
                "rate_bps": 1500,
                "tax_minor": 2,
                "total_minor": 12,
                "rounding": "half_up_once_to_integer_minor_unit",
            },
        )

    def test_zero_rate_is_valid(self):
        result = calculate_tax({"base_minor": 101, "rate_bps": 0})
        self.assertEqual((result["tax_minor"], result["total_minor"]), (0, 101))

    def test_boolean_is_not_accepted_as_an_integer_amount(self):
        with self.assertRaises(ValueError):
            calculate_tax({"base_minor": True, "rate_bps": 1500})

    def test_rate_is_bounded(self):
        with self.assertRaises(ValueError):
            calculate_tax({"base_minor": 100, "rate_bps": 10001})

    def test_cash_rounding_matches_signed_coin_increments(self):
        for amount, method, expected in [
            (115, "HALF-UP", 120), (-115, "HALF-UP", -120),
            (119, "DOWN", 110), (-119, "DOWN", -110),
            (111, "UP", 120), (-111, "UP", -120),
            (110, "UP", 110),
        ]:
            with self.subTest(amount=amount, method=method):
                self.assertEqual(
                    round_cash(amount, {"increment_minor": 10, "method": method}),
                    {"rounded_total_minor": expected, "difference_minor": expected - amount},
                )

    def test_cash_rounding_rejects_invalid_precision_and_method(self):
        for rule in [
            {"increment_minor": 0, "method": "UP"},
            {"increment_minor": True, "method": "UP"},
            {"increment_minor": 5, "method": "HALF-EVEN"},
        ]:
            with self.assertRaises(ValueError):
                round_cash(115, rule)


if __name__ == "__main__":
    unittest.main()
