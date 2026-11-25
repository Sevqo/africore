import unittest

from domain.pos_session import evaluate_cash_count, evaluate_loyalty
from domain.crm_forecast import evaluate_forecast, score_lead
from domain.work_billing import evaluate_billing
from domain.payroll import calculate_payroll
from domain.subscriptions import compute_mrr, compute_proration
from domain.mrp_costing import evaluate_bom_cost


class Phases4To10EngineTests(unittest.TestCase):
    def test_pos_cash_count_and_loyalty(self):
        cc = evaluate_cash_count(
            {
                "opening_minor": 10000,
                "cash_sales_minor": 25000,
                "cash_in_minor": 0,
                "cash_out_minor": 5000,
                "denominations": [
                    {"denomination_minor": 10000, "count": 2},
                    {"denomination_minor": 5000, "count": 2},
                ],
            }
        )
        self.assertEqual(cc["expected_minor"], 30000)
        self.assertEqual(cc["counted_minor"], 30000)
        self.assertEqual(cc["status"], "balanced")

        loy = evaluate_loyalty(
            {
                "order_total_minor": 50000,
                "points_per_1000_minor": 1,
                "redeem_points": 10,
                "available_points": 25,
                "minor_per_point": 100,
            }
        )
        self.assertEqual(loy["discount_minor"], 1000)
        self.assertEqual(loy["net_payable_minor"], 49000)
        self.assertEqual(loy["earned_points"], 49)
        self.assertEqual(loy["ending_points"], 64)

    def test_crm_forecast_and_lead_scoring(self):
        fc = evaluate_forecast(
            {
                "leads": [
                    {"stage": "proposal", "currency": "KES", "expected_revenue_minor": 100000, "probability_bps": 6000},
                    {"stage": "proposal", "currency": "KES", "expected_revenue_minor": 50000, "probability_bps": 4000},
                ]
            }
        )
        self.assertEqual(fc["totals_by_currency"]["KES"]["weighted_revenue_minor"], 80000)
        sc = score_lead(
            {
                "has_email": True,
                "has_phone": True,
                "has_company": True,
                "expected_revenue_minor": 200000,
                "activities_completed": 2,
                "days_stale": 0,
            }
        )
        self.assertEqual(sc["tier"], "hot")
        self.assertEqual(sc["score"], 90)

    def test_work_billable_timesheets(self):
        res = evaluate_billing(
            {
                "budget_minor": 100000,
                "entries": [
                    {"id": "t1", "minutes": 90, "hourly_rate_minor": 40000, "hourly_cost_minor": 15000, "billable": True},
                    {"id": "t2", "minutes": 60, "hourly_rate_minor": 40000, "hourly_cost_minor": 15000, "billable": False},
                ],
            }
        )
        self.assertEqual(res["billable_minor"], 60000)
        self.assertEqual(res["cost_minor"], 37500)
        self.assertEqual(res["budget_burn_bps"], 6000)

    def test_payroll_progressive_brackets(self):
        res = calculate_payroll(
            {
                "tax_brackets": [
                    {"up_to_minor": 2400000, "rate_bps": 1000},
                    {"up_to_minor": 3233300, "rate_bps": 2500},
                    {"up_to_minor": None, "rate_bps": 3000},
                ],
                "employees": [
                    {
                        "employee_id": "e1",
                        "name": "Amina",
                        "base_salary_minor": 5000000,
                        "allowances_minor": 0,
                        "pre_tax_deductions_minor": 0,
                        "post_tax_deductions_minor": 100000,
                        "tax_relief_minor": 240000,
                    }
                ],
            }
        )
        slip = res["payslips"][0]
        # 2400000*10% = 240000; 833300*25% = 208325; 1766700*30% = 530010 => raw 978335 - 240000 = 738335
        self.assertEqual(slip["tax_minor"], 738335)
        self.assertEqual(slip["net_pay_minor"], 5000000 - 738335 - 100000)

    def test_subscriptions_mrr_and_proration(self):
        mrr = compute_mrr(
            {
                "contracts": [
                    {"status": "active", "currency": "KES", "interval": "annual", "price_minor": 120000, "quantity": 2},
                    {"status": "active", "currency": "KES", "interval": "monthly", "price_minor": 15000, "quantity": 1},
                ]
            }
        )
        self.assertEqual(mrr["totals_by_currency"]["KES"]["mrr_minor"], 35000)
        self.assertEqual(mrr["totals_by_currency"]["KES"]["arr_minor"], 420000)

        pro = compute_proration(
            {
                "period_start": "2026-11-01",
                "period_end": "2026-11-30",
                "change_on": "2026-11-16",
                "old_price_minor": 10000,
                "new_price_minor": 20000,
            }
        )
        self.assertEqual(pro["remaining_days"], 15)
        self.assertEqual(pro["net_adjustment_minor"], 5000)

    def test_mrp_bom_explosion_and_cost_rollup(self):
        bom = evaluate_bom_cost(
            {
                "produce_quantity_milli": 5000,
                "bom_quantity_milli": 1000,
                "components": [
                    {"sku": "BEAN", "quantity_milli": 2000, "unit_cost_minor": 500, "scrap_bps": 500},
                ],
                "operations": [
                    {"duration_minutes": 12, "hourly_cost_minor": 6000},
                ],
            }
        )
        # 5 * 2.000 * 1.05 = 10.500 kg @ 500 = 5250 material; 5 * 12 = 60 mins @ 6000/hr = 6000 labor
        self.assertEqual(bom["material_cost_minor"], 5250)
        self.assertEqual(bom["labor_overhead_minor"], 6000)
        self.assertEqual(bom["total_cost_minor"], 11250)
        self.assertEqual(bom["unit_cost_minor"], 2250)
