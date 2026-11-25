import unittest

from domain.sales_pricing import compute_down_payment, compute_margins


class SalesPricingTests(unittest.TestCase):
    def test_order_margin_with_discount_and_exact_basis_points(self):
        res = compute_margins(
            {
                "orders": [
                    {
                        "id": "ord-1",
                        "currency": "KES",
                        "lines": [
                            {
                                "product_id": "p1",
                                "quantity_milli": 10000,
                                "unit_price_minor": 2000,
                                "discount_bps": 1000,  # 10% off => 18000 rev
                                "unit_cost_minor": 1200,  # 12000 cost
                            }
                        ],
                    }
                ]
            }
        )
        o = res["orders"][0]
        self.assertEqual(o["revenue_minor"], 18000)
        self.assertEqual(o["cost_minor"], 12000)
        self.assertEqual(o["margin_minor"], 6000)
        self.assertEqual(o["margin_bps"], 3333)  # 33.33%

    def test_down_payment_percentage_and_over_invoice_guard(self):
        dp = compute_down_payment(
            {
                "order_total_minor": 100000,
                "already_invoiced_minor": 20000,
                "mode": "percentage",
                "percentage_bps": 3000,  # 30%
            }
        )
        self.assertEqual(dp["amount_minor"], 30000)
        self.assertEqual(dp["remaining_after_minor"], 50000)

        with self.assertRaises(ValueError):
            compute_down_payment(
                {
                    "order_total_minor": 100000,
                    "already_invoiced_minor": 80000,
                    "mode": "fixed",
                    "fixed_amount_minor": 25000,
                }
            )
