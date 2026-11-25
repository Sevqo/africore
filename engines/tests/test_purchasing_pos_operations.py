import unittest

from domain import purchasing_pos_operations


class TestProcurementPosParity(unittest.TestCase):
    def test_best_vendor_quote(self):
        res = purchasing_pos_operations.run({
            "op": "best_vendor_quote",
            "quantity": 100,
            "tiers": [
                {"supplier_id": "s1", "supplier_name": "Alpha", "min_qty": 1, "unit_price_minor": 500, "lead_days": 2},
                {"supplier_id": "s2", "supplier_name": "Beta", "min_qty": 50, "unit_price_minor": 420, "lead_days": 4},
                {"supplier_id": "s3", "supplier_name": "Gamma", "min_qty": 200, "unit_price_minor": 380, "lead_days": 5},
            ],
        })
        self.assertEqual(res["best"]["supplier_id"], "s2")
        self.assertEqual(res["best"]["total_minor"], 42_000)

    def test_agreement_calloff(self):
        ok = purchasing_pos_operations.run({
            "op": "agreement_calloff",
            "ceiling_qty": 100,
            "already_ordered_qty": 60,
            "requested_qty": 30,
            "unit_price_minor": 1000,
        })
        self.assertTrue(ok["approved"])
        self.assertEqual(ok["remaining_after"], 10)
        self.assertEqual(ok["calloff_total_minor"], 30_000)

    def test_vendor_scorecard(self):
        res = purchasing_pos_operations.run({
            "op": "vendor_scorecard",
            "deliveries": [
                {"ordered_qty": 10, "received_qty": 10, "defective_qty": 0, "on_time": True},
                {"ordered_qty": 10, "received_qty": 10, "defective_qty": 1, "on_time": False},
            ],
        })
        self.assertEqual(res["otif_bps"], 5000)
        self.assertEqual(res["defect_bps"], 500)
        self.assertEqual(res["composite_score_bps"], 6350)

    def test_split_bill_and_combo(self):
        bill = purchasing_pos_operations.run({
            "op": "split_bill",
            "subtotal_minor": 10_000,
            "tax_minor": 1_600,
            "tip_bps": 1000,
            "guests": 3,
        })
        # 10000 + 1600 + 1000 = 12600 / 3 = 4200 each
        self.assertEqual(bill["grand_total_minor"], 12_600)
        self.assertEqual(sum(s["amount_minor"] for s in bill["shares"]), 12_600)

        combo = purchasing_pos_operations.run({
            "op": "combo_price",
            "base_price_minor": 850,
            "quantity": 2,
            "modifiers": [{"name": "Extra Cheese", "extra_price_minor": 150}],
        })
        self.assertEqual(combo["line_total_minor"], 2000)


if __name__ == "__main__":
    unittest.main()
