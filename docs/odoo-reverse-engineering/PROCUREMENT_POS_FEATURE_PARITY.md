# Odoo 20 Procurement & POS — Feature Parity Audit & Implementation Plan

> Audited against official Odoo 20 Purchase (`odoo.com/app/purchase-features`, 11 `purchase*` modules) and Odoo 20 POS (`odoo.com/app/point-of-sale-features`, 45 `pos_*` modules).

## App #5: Procurement Parity Matrix

| Odoo 20 Purchase Feature | Reference Module | AfriCore Status | Implementation |
| --- | --- | --- | --- |
| RFQs, Purchase Orders, Receipts & Supplier Bills | `purchase` | Shipped | `src/erp/procurement.ts` |
| 3-Way Match & Bid Comparison | `purchase`, `purchase_alternative` | Shipped | `python/.../procurement_matching.py` |
| **Vendor Tiered Pricelists & Best-Vendor Selection** | `purchase` (`product.supplierinfo`) | **Added in App #5** | `python/.../procurement_pos_parity.py` (`best_vendor_quote`) + `/procurement/vendor-tiers`, `/procurement/vendor-tiers/best` |
| **Blanket Agreement Call-Off Guard** | `purchase_requisition` | **Added in App #5** | `python/.../procurement_pos_parity.py` (`agreement_calloff`) + `/procurement/agreements/calloff` |
| **Vendor Scorecard (OTIF & Defect Rate)** | `purchase` KPIs | **Added in App #5** | `python/.../procurement_pos_parity.py` (`vendor_scorecard`) + `/procurement/vendors/scorecard` |
| **Dropship Order Links** | `stock_dropshipping` | **Added in App #5** | `/procurement/dropships` |

## App #6: Point of Sale Parity Matrix

| Odoo 20 POS Feature | Reference Module | AfriCore Status | Implementation |
| --- | --- | --- | --- |
| Retail Checkout, Sessions, Cash Drawers & Receipts | `point_of_sale` | Shipped | `src/erp/pos.ts` |
| Cash Count Variance & Loyalty Points | `pos_loyalty` | Shipped | `python/.../pos_session.py` |
| **Restaurant Floors & Tables** | `pos_restaurant` | **Added in App #6** | `/pos/floors`, `/pos/tables` |
| **Kitchen Display System (KDS) Tickets** | `pos_restaurant` | **Added in App #6** | `/pos/kds/tickets`, `/pos/kds/tickets/:id/status` |
| **Split Bill & Tip Calculator** | `pos_restaurant` | **Added in App #6** | `python/.../procurement_pos_parity.py` (`split_bill`) + `/pos/bills/split` |
| **Combo Products & Modifiers Pricing** | `point_of_sale` | **Added in App #6** | `python/.../procurement_pos_parity.py` (`combo_price`) + `/pos/combos/price` |
| **Self-Order QR Sessions** | `pos_self_order` | **Added in App #6** | `/pos/self-order/sessions` |
