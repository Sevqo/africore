# Odoo 20 Sales — Complete Feature Parity Research & Implementation Plan

**Reference:** Odoo 20.0 Community (`addons/sale*`, 30 modules) + Official Odoo 20 Sales Documentation  
**Domain Engine:** Python 3 exact-integer (`python/africore_accounting/sales_parity.py` + `sales_pricing.py`)  
**Canonical API:** TypeScript (`src/erp/sales-parity.ts`, zero DB migrations via encrypted `ac_erp_objects`)

## Feature Coverage Matrix

| # | Odoo 20 Feature | Source Module | AfriCore Implementation |
|---|---|---|---|
| 1 | Quotations & Version History | `sale` | Existing (`src/operations/sales.ts`) |
| 2 | Quotation Templates | `sale_management` | Existing (`src/operations/sales-pricing.ts`) |
| 3 | Optional Products / Upsells | `sale_management` | Existing (`src/operations/sales-phase2.ts`) |
| 4 | Pricelists & Volume Rules | `product` / `sale` | Existing (`src/operations/sales-pricing.ts`) |
| 5 | Margin Analysis | `sale_margin` | Existing (`sales_pricing.py` + `sales-phase2.ts`) |
| 6 | Down Payments & Over-Invoice Guard | `sale` | Existing (`sales_pricing.py` + `sales-phase2.ts`) |
| 7 | Coupons, Promo Codes & Discounts | `sale_loyalty` | **Added:** `sales_parity.py` (`promo_evaluate`) + `/sales/promos/*` |
| 8 | Online Quote E-Signature | `sale` portal | **Added:** SHA-256 signed quote proof + `/sales/signatures` |
| 9 | Sales Commissions & Quota Tiers | `sales_team` | **Added:** `sales_parity.py` (`commission_calculate`) + `/sales/commissions/*` |
| 10 | Delivery / Shipping Rate Rules | `delivery` | **Added:** `sales_parity.py` (`shipping_rate`) + `/sales/shipping-methods/*` |
| 11 | Product Variant Matrix Grid Entry | `sale_product_matrix` | **Added:** `sales_parity.py` (`variant_matrix`) + `/sales/variant-matrix/expand` |
| 12 | Ordered vs. Delivered Invoicing Policy | `sale` | **Added:** `sales_parity.py` (`invoiceable_policy`) + `/sales/invoicing-policy/evaluate` |
| 13 | Customer / Product Sales Warnings & Blocks | `sale` | **Added:** `/sales/warnings` + `/sales/warnings/check` |
