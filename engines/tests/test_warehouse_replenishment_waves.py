import unittest

from domain import warehouse_replenishment_waves


class TestInventoryParity(unittest.TestCase):
    def test_replenishment_plan(self):
        res = warehouse_replenishment_waves.run({
            "op": "replenishment_plan",
            "rules": [
                {
                    "product_id": "prod-1",
                    "warehouse": "WH-NBO",
                    "on_hand_qty": 5,
                    "incoming_qty": 2,
                    "outgoing_qty": 4,
                    "min_qty": 10,
                    "max_qty": 30,
                    "qty_multiple": 5,
                    "lead_days": 3,
                },
                {
                    "product_id": "prod-2",
                    "warehouse": "WH-NBO",
                    "on_hand_qty": 50,
                    "min_qty": 10,
                    "max_qty": 30,
                },
            ],
        })
        # forecast = 5 + 2 - 4 = 3 < 10; needed = 30 - 3 = 27 -> rounded up to multiple of 5 = 30
        self.assertEqual(res["suggestion_count"], 1)
        self.assertEqual(res["suggestions"][0]["order_qty"], 30)

    def test_resolve_putaway(self):
        res = warehouse_replenishment_waves.run({
            "op": "resolve_putaway",
            "product_id": "prod-cold-1",
            "category": "cold_chain",
            "location_in": "WH/Input",
            "rules": [
                {"id": "pa-1", "priority": 5, "location_in": "WH/Input", "category": "cold_chain", "location_out": "WH/ColdRoom-A"},
            ],
        })
        self.assertTrue(res["matched"])
        self.assertEqual(res["location_out"], "WH/ColdRoom-A")

    def test_plan_waves(self):
        res = warehouse_replenishment_waves.run({
            "op": "plan_waves",
            "max_weight_grams": 10_000,
            "max_pickings_per_wave": 2,
            "pickings": [
                {"picking_id": "p1", "zone": "A", "carrier": "DHL", "weight_grams": 6000},
                {"picking_id": "p2", "zone": "A", "carrier": "DHL", "weight_grams": 5000},
                {"picking_id": "p3", "zone": "A", "carrier": "DHL", "weight_grams": 3000},
            ],
        })
        self.assertEqual(res["wave_count"], 2)
        self.assertEqual(res["waves"][0]["picking_ids"], ["p1"])
        self.assertEqual(res["waves"][1]["picking_ids"], ["p2", "p3"])

    def test_split_backorder(self):
        res = warehouse_replenishment_waves.run({
            "op": "split_backorder",
            "lines": [
                {"product_id": "p1", "ordered_qty": 10, "done_qty": 6},
                {"product_id": "p2", "ordered_qty": 5, "done_qty": 5},
            ],
        })
        self.assertTrue(res["needs_backorder"])
        self.assertEqual(res["backorder_lines"], [{"product_id": "p1", "qty": 4}])


if __name__ == "__main__":
    unittest.main()
