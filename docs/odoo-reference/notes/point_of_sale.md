# Point of Sale — focused Odoo 20 comparison

## Scope and source

This is a focused reference for the AfriCore Phase 2.8B POS expansion. The read-only Odoo Community checkout was on branch `20.0` at commit `373b237cac51920a664a07c242c337e7b095b0c1`; the working tree was clean. The supplied screenshots are primarily Odoo 19 visual references. Odoo code is used as behavior evidence, not copied source or an AfriCore data model.

The detailed source paths and observations are recorded in [RESEARCH_LOG.md](../RESEARCH_LOG.md#2026-11-19--point-of-sale-workflows-and-supplied-odoo-reference-screens). Official Odoo 20 Payment Methods and Reporting pages were consulted. Direct fetches for Multi-cashier, Reprint receipts, Restaurant, and Floors/Tables documentation timed out, so those page-specific behaviors are not inferred from documentation.

## Odoo observations

- `pos.config` owns register identity and operational setup: payment methods, session/cash control, product and partner loading bounds, pricelist/currency, warehouse, cashier policies and optional restaurant/device settings. Settings that affect an open session are guarded. Configuration is therefore a control boundary, not just a list of cosmetic toggles (`addons/point_of_sale/models/pos_config.py`; `addons/point_of_sale/views/pos_config_view.xml`).
- `pos.session` uses explicit opening, opened, closing-control and closed states. Opening and closing cash, orders, payments and the closing difference are associated with the session; closing has validation and accounting consequences (`addons/point_of_sale/models/pos_session.py`).
- `pos.order` carries its session/configuration and customer context, order lines, payment relations, state, invoice relationship and refund origin. Odoo's model and tests cover duplicate synchronization, refunds, partial quantities, invoice relationships and cash rounding (`addons/point_of_sale/models/pos_order.py`; `addons/point_of_sale/tests/test_point_of_sale_flow.py`, including `test_paid_order_synced_twice_no_duplicate_change`, refund and invoice tests).
- `pos.payment` is a separate amount-bearing payment record linked to an order and payment method. The method and order state matter to payment status; an initiated request alone is not a successful external collection (`addons/point_of_sale/models/pos_payment.py`).
- The POS client separates product selection, order summary, keypad and payment-line interactions. Product selection handles configured products and barcode input; payment choices derive from configured methods and payment lines carry explicit status/actions (`addons/point_of_sale/static/src/app/screens/product_screen/product_screen.js`, `addons/point_of_sale/static/src/app/screens/product_screen/order_summary/order_summary.js`, `addons/point_of_sale/static/src/app/screens/payment_screen/payment_screen.js`, `addons/point_of_sale/static/src/app/screens/payment_screen/payment_lines/payment_lines.js`, `addons/point_of_sale/static/src/app/components/product_card/product_card.js`, `addons/point_of_sale/static/src/app/components/numpad/numpad.js`).
- POS analysis is a dedicated report projection over order lines, with measures and dimensions, rather than a total derived from the current page (`addons/point_of_sale/report/pos_order_report.py`; `addons/point_of_sale/tests/test_report_pos_order.py`). Session cash reporting is separately covered (`addons/point_of_sale/tests/test_report_session.py`).

## AfriCore baseline before Phase 2.8B

AfriCore already has an independent POS service for register assignments, versioned open/close and drawer operations, sale drafts and server quotes, idempotent sale confirmation, canonical order/invoice links, cash observations, sandbox electronic intents, receipts, cash and stock returns, and register-local daily reporting. The installed POS app composes Dashboard, Orders, Products, Reporting, Configuration and a full-screen cashier. Products, Customers, Orders, Invoicing, Cash Flow, Inventory and Payments retain their own canonical authorities; POS does not own a second catalog, order ledger, accounting ledger, payment processor or stock table.

The audit found a catalog inconsistency: the register and quote services require a canonical Customer while POS installation metadata did not. The existing reporting endpoint covered one register and one local day. Register manager setup, assignment scoping, counted cash, quote hashing, idempotency, and existing payment/return boundaries were retained.

## AfriCore implementation implications

- Require Customers consistently in app/service dependency metadata, register write authorization and setup readiness. An additive startup migration may update the stored POS service definition/version; it must not activate Customers, create a fake customer or rewrite historical POS records.
- Keep registers and shifts under the POS service, while transaction balances, customer identities, stock and payment evidence come from their current canonical services. Register assignment does not confer general finance or inventory access.
- Expand analysis through a bounded server endpoint over confirmed POS-to-invoice links. Resolve visibility per register and cashier, apply date windows in each register's timezone, aggregate across the full authorized result, and keep each currency separate. Reject over-limit results instead of returning misleading partial totals.
- State report definitions beside data: current invoice balance/credits/allocations, merchant-observed cash movements, sandbox/provider evidence, current product categories, no profit valuation and no FX conversion. Drawer events use their own event dates and remain distinct from product/payment/status-filtered sales.
- Preserve online-only confirmation, explicit sandbox payment status, counted cash as an observation, browser print as a software option, and existing order/invoice/inventory idempotency. Restaurant tables, offline confirmation and physical hardware remain unavailable until their required canonical state or qualified device integration exists.

## Screenshots and acceptance

The supplied POS references cover the dashboard, register cashier, payment, order register, receipt, closing/discrepancy, search/grouping and analysis. AfriCore retains its own semantic tokens and immersive shell. Source checks and automated tests do not establish screen parity. Running-browser captures, side-by-side comparison, tablet/device checks and founder acceptance are recorded separately in the Phase 2.8B checkpoint.
