import unittest
from domain.sales_promotions_commissions import (
    calculate_commission,
    calculate_shipping,
    evaluate_invoicing_policy,
    evaluate_promo,
    expand_variant_matrix,
)


class SalesParityEngineTests(unittest.TestCase):
    def test_promo_percent_and_buy_x_get_y(self):
        pct = evaluate_promo({
            "order_subtotal_minor": 100000,
            "discount_type": "percent_bps",
            "value": 1500,
            "min_order_minor": 50000,
            "max_discount_minor": 12000,
        })
        self.assertTrue(pct["eligible"])
        self.assertEqual(pct["discount_minor"], 12000)
        self.assertEqual(pct["net_total_minor"], 88000)

        bxgy = evaluate_promo({
            "order_subtotal_minor": 60000,
            "discount_type": "buy_x_get_y",
            "buy_x": 2,
            "get_y": 1,
            "qualifying_qty": 6,
            "qualifying_unit_price_minor": 10000,
        })
        self.assertEqual(bxgy["discount_minor"], 20000)
        self.assertEqual(bxgy["net_total_minor"], 40000)

    def test_tiered_commission_calculation(self):
        res = calculate_commission({
            "achieved_revenue_minor": 1500000,
            "quota_minor": 1000000,
            "tiers": [
                {"up_to_minor": 1000000, "rate_bps": 500},
                {"up_to_minor": None, "rate_bps": 1000},
            ],
        })
        self.assertEqual(res["attainment_bps"], 15000)
        # 5% of 1,000,000 (50,000) + 10% of 500,000 (50,000) = 100,000
        self.assertEqual(res["total_commission_minor"], 100000)

    def test_shipping_weight_and_free_threshold(self):
        weighted = calculate_shipping({
            "order_subtotal_minor": 40000,
            "weight_grams": 2400,
            "pricing_mode": "weight_based",
            "base_fee_minor": 5000,
            "per_kg_minor": 2000,
            "free_over_minor": 100000,
        })
        # 2400g -> 3 billable kg -> 5000 + 6000 = 11000
        self.assertEqual(weighted["shipping_minor"], 11000)
        self.assertFalse(weighted["free_shipping_applied"])

        free = calculate_shipping({
            "order_subtotal_minor": 120000,
            "weight_grams": 5000,
            "pricing_mode": "weight_based",
            "base_fee_minor": 5000,
            "per_kg_minor": 2000,
            "free_over_minor": 100000,
        })
        self.assertEqual(free["shipping_minor"], 0)
        self.assertTrue(free["free_shipping_applied"])

    def test_variant_matrix_and_invoicing_policy(self):
        matrix = expand_variant_matrix({
            "base_sku": "TEE",
            "base_name": "Cotton Polo",
            "base_price_minor": 200000,
            "cells": [
                {"row_value": "M", "col_value": "Black", "quantity": 3, "price_delta_minor": 0},
                {"row_value": "XL", "col_value": "Green", "quantity": 2, "price_delta_minor": 25000},
                {"row_value": "S", "col_value": "White", "quantity": 0, "price_delta_minor": 0},
            ],
        })
        self.assertEqual(matrix["line_count"], 2)
        self.assertEqual(matrix["total_quantity"], 5)
        self.assertEqual(matrix["grand_total_minor"], 1050000)

        inv = evaluate_invoicing_policy({
            "policy": "delivered_qty",
            "lines": [
                {"id": "l1", "description": "Inverter", "ordered_qty": 10, "delivered_qty": 6, "already_invoiced_qty": 2, "unit_price_minor": 50000},
            ],
        })
        self.assertTrue(inv["can_invoice"])
        self.assertEqual(inv["total_invoiceable_minor"], 200000)


if __name__ == "__main__":
    unittest.main()
