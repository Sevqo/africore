import unittest

from domain.inventory_valuation import allocate_landed_cost, evaluate_valuation


class InventoryValuationTests(unittest.TestCase):
    def test_fifo_consumes_oldest_layer_first_and_preserves_exact_minor_units(self):
        res = evaluate_valuation(
            {
                "method": "fifo",
                "standard_cost_minor": 1000,
                "events": [
                    {"id": "r1", "kind": "receipt", "quantity_milli": 10000, "unit_cost_minor": 1000},
                    {"id": "r2", "kind": "receipt", "quantity_milli": 10000, "unit_cost_minor": 1500},
                    {"id": "d1", "kind": "dispatch", "quantity_milli": -12000, "unit_cost_minor": 0},
                ],
            }
        )
        self.assertEqual(res["on_hand_milli"], 8000)
        # 10 units @ 1000 + 2 units @ 1500 = 13000 COGS
        self.assertEqual(res["total_cogs_minor"], 13000)
        # 8 units @ 1500 = 12000 remaining
        self.assertEqual(res["total_value_minor"], 12000)
        self.assertEqual(res["unit_cost_minor"], 1500)
        self.assertEqual(len(res["layers"]), 1)

    def test_avco_recomputes_weighted_average_with_landed_cost(self):
        res = evaluate_valuation(
            {
                "method": "average",
                "standard_cost_minor": 1000,
                "events": [
                    {"id": "r1", "kind": "receipt", "quantity_milli": 10000, "unit_cost_minor": 1000},
                    {"id": "r2", "kind": "receipt", "quantity_milli": 10000, "unit_cost_minor": 2000},
                    {"id": "lc1", "kind": "landed_cost", "additional_cost_minor": 2000},
                    {"id": "d1", "kind": "dispatch", "quantity_milli": -5000, "unit_cost_minor": 0},
                ],
            }
        )
        # Total value before dispatch: 10000 + 20000 + 2000 = 32000 for 20 units (1600/unit)
        # 5 units out => 8000 COGS, 15 units left => 24000 value
        self.assertEqual(res["on_hand_milli"], 15000)
        self.assertEqual(res["total_cogs_minor"], 8000)
        self.assertEqual(res["total_value_minor"], 24000)
        self.assertEqual(res["unit_cost_minor"], 1600)

    def test_landed_cost_exact_residual_conservation(self):
        res = allocate_landed_cost(
            {
                "total_cost_minor": 100,
                "split_method": "equal",
                "lines": [
                    {"id": "a", "quantity_milli": 1000, "former_cost_minor": 500},
                    {"id": "b", "quantity_milli": 1000, "former_cost_minor": 500},
                    {"id": "c", "quantity_milli": 1000, "former_cost_minor": 500},
                ],
            }
        )
        self.assertEqual(sum(line["additional_cost_minor"] for line in res["lines"]), 100)
        by_qty = allocate_landed_cost(
            {
                "total_cost_minor": 1000,
                "split_method": "by_quantity",
                "lines": [
                    {"id": "a", "quantity_milli": 1000, "former_cost_minor": 500},
                    {"id": "b", "quantity_milli": 3000, "former_cost_minor": 1500},
                ],
            }
        )
        self.assertEqual(by_qty["lines"][0]["additional_cost_minor"], 250)
        self.assertEqual(by_qty["lines"][1]["additional_cost_minor"], 750)

    def test_rejects_invalid_inputs(self):
        with self.assertRaises(ValueError):
            evaluate_valuation({"method": "lifo", "events": []})
        with self.assertRaises(ValueError):
            allocate_landed_cost({"total_cost_minor": 0, "split_method": "equal", "lines": []})
