import unittest

from domain.procurement_matching import compare_bids, evaluate_three_way_match


class ProcurementMatchingTests(unittest.TestCase):
    def test_exact_three_way_match_and_variance_holds(self):
        matched = evaluate_three_way_match(
            {
                "tolerance_bps": 0,
                "lines": [
                    {
                        "id": "l1",
                        "ordered_milli": 10000,
                        "received_milli": 10000,
                        "billed_milli": 10000,
                        "po_unit_price_minor": 5000,
                        "bill_unit_price_minor": 5000,
                    }
                ],
            }
        )
        self.assertEqual(matched["status"], "matched")
        self.assertTrue(matched["pay_eligible"])
        self.assertEqual(matched["total_variance_minor"], 0)

        over = evaluate_three_way_match(
            {
                "tolerance_bps": 0,
                "lines": [
                    {
                        "id": "l1",
                        "ordered_milli": 10000,
                        "received_milli": 6000,
                        "billed_milli": 10000,
                        "po_unit_price_minor": 5000,
                        "bill_unit_price_minor": 5000,
                    }
                ],
            }
        )
        self.assertEqual(over["status"], "over_billed")
        self.assertFalse(over["pay_eligible"])
        self.assertEqual(over["lines"][0]["quantity_variance_milli"], 4000)

        price_var = evaluate_three_way_match(
            {
                "tolerance_bps": 100,  # 1% tolerance
                "lines": [
                    {
                        "id": "l1",
                        "ordered_milli": 10000,
                        "received_milli": 10000,
                        "billed_milli": 10000,
                        "po_unit_price_minor": 5000,
                        "bill_unit_price_minor": 5500,  # +10%
                    }
                ],
            }
        )
        self.assertEqual(price_var["status"], "price_variance")
        self.assertFalse(price_var["pay_eligible"])
        self.assertEqual(price_var["total_variance_minor"], 5000)

    def test_compare_bids_ranks_lowest_cost_then_lead_time(self):
        res = compare_bids(
            {
                "bids": [
                    {"id": "b1", "vendor_name": "Alpha", "total_minor": 120000, "lead_time_days": 5},
                    {"id": "b2", "vendor_name": "Beta", "total_minor": 100000, "lead_time_days": 7},
                    {"id": "b3", "vendor_name": "Gamma", "total_minor": 100000, "lead_time_days": 3},
                ]
            }
        )
        self.assertEqual(res["ranked"][0]["id"], "b3")
        self.assertEqual(res["ranked"][1]["id"], "b2")
        self.assertEqual(res["ranked"][2]["delta_vs_lowest_minor"], 20000)
