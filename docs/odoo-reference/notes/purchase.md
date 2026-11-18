# purchase — Odoo 20.0 notes

- Odoo commit: `5dcff8c0e0d5e97bc6897ba1806c4ea8747670e2`
- Path root: `odoo-reference/addons/purchase` (with `purchase_stock`, `purchase_requisition`, and `purchase_alternative` extensions)
- AfriCore question: which purchase-document, alternative-offer, vendor-price, agreement, bill, receipt, analytics and layout patterns inform Phase 2.6B?
- Status: deep-dive
- Last updated: 2026-11-18
- Research log: [Procurement workflows](../RESEARCH_LOG.md#2026-11-18--procurement-workflows-and-supplied-odoo-reference-screens)

## Model and menu map

- `purchase.order` is the shared RFQ/purchase-order record. Its view and menu hierarchy are defined in `addons/purchase/views/purchase_views.xml`; the module depends on Accounting (`addons/purchase/__manifest__.py`). The form switches actions by state and exposes product, notes and other-information tabs.
- `purchase.order.line` holds product/UoM, ordered quantity, price, discount, taxes and planned date. Received and invoiceable quantities are derived according to inventory/accounting state (`addons/purchase/models/purchase_order_line.py`).
- Vendor price entries extend shared `product.supplierinfo`, rather than creating an unrelated price list (`addons/purchase/models/product.py`, `addons/purchase/views/product_views.xml`).
- Purchase agreements live in `purchase_requisition` (`addons/purchase_requisition/models/purchase_requisition.py` and its form/list views). Alternatives are an optional extension in `purchase_alternative`, which links purchase orders and compares their lines (`addons/purchase_alternative/models/purchase.py`).
- Inventory integration is an extension under `purchase_stock`, where stock moves drive received quantity and receipt status. Supplier bill matching is implemented in the Purchase/Accounting integration (`addons/purchase/models/account_invoice.py`).
- Purchase analytics use `purchase.report` and graph/pivot/list actions (`addons/purchase/report/purchase_report.py`, `purchase_report_views.xml`). The source states that the report is not multi-currency.

## Lifecycle and validation

- Confirming a draft/sent RFQ approves it when the current policy allows; otherwise it enters `to approve`. A separate approval action moves it to the confirmed purchase state (`purchase/models/purchase_order.py`, `button_confirm`, `button_approve`).
- Cancellation checks lock state and related posted bills before changing the purchase state (`button_cancel`).
- RFQ and purchase-order form actions are state-specific: send, confirm, approve, receive, print, cancel and lock/unlock. This provides useful placement and state visibility, but AfriCore may only show a sent/paid/received outcome after its own corresponding service confirms it.
- Purchase receiving updates received quantity through stock moves where `purchase_stock` is enabled. A planned incoming document does not itself prove that goods arrived.
- Bill creation/matching links vendor bill lines to purchase-order quantities; invoiceable quantity respects ordered-versus-received purchasing policy. This is the behavioral reference for AfriCore's supplier-bill controls, while AfriCore Accounting remains the canonical ledger.
- Alternative RFQs are linked in `purchase_alternative`; line comparisons and supplier selection happen through explicit actions. AfriCore's award therefore stays a separate reviewed decision attached to compatible offers for an approved request.

## Presentation and reporting

- `purchase_views.xml` provides Orders, Products, Reporting and Configuration navigation, searchable record lists, group-by controls, a form with horizontal document tabs, status progression, and row-level actions.
- `product_views.xml` presents vendor product prices as compact editable lines with quantity, currency/price, validity and delivery information.
- `purchase_requisition_views.xml` presents agreement type, vendor, buyer, validity and product quantities with related RFQs/orders and close/cancel/create quotation actions.
- `purchase.report` includes buyer, vendor, product/category, order/confirmation dates and ordered/received/billed quantities. The explicit no-multi-currency warning supports AfriCore's separate currency groups until an authorized rate basis exists.
- The provided Odoo 19 images show six screens (dashboard/list, RFQ/order detail, purchase agreement, vendor pricelists, bill, analysis). AfriCore uses its own design tokens and global shell. No local running-app side-by-side comparison is recorded yet.

## AfriCore choices

- Keep the canonical shared Customer, Product, Inventory and Accounting records and the existing workspace/environment/role boundary.
- Require a submitted/approved request and an accepted offer before order issue; require separate reviewers for actionable approvals and persist the selected supplier award.
- Preserve exact integer quantity/money storage, and display decimal values only at input/output boundaries.
- Link planned incoming orders to Inventory; post physical stock only from accepted receipt quantities. Keep unverified manual payment observations distinct from bank settlement.
- Keep every currency group separate and clearly disclose mixed-currency comparison limitations.
- State accurately when RFQ/PO email, portal, bank execution or statutory integrations are not available.

Implementation details, follow-ups, Odoo source provenance and limits: [RESEARCH_LOG.md](../RESEARCH_LOG.md#2026-11-18--procurement-workflows-and-supplied-odoo-reference-screens). See [D-006](../DECISIONS.md#d-006-keep-supplier-awards-receipt-evidence-and-currency-semantics-explicit).
