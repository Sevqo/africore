# POS checkpoint design

This is the implementation design for checkpoint 4, not an assertion that POS is available. Commerce/public-media source remains separate from this next work.

## Canonical records and cashier authority

POS will retain register configuration, explicit current-member cashier assignments, shifts and sale intents. Completed sale identities map uniquely to canonical Sales orders and Invoicing records. They must reuse the existing Sales confirmation/reservation and fulfillment/movement services. No POS product, stock or provider-event ledger is introduced.

A cashier is a register-scoped permission on an existing human Business member, separate from Neon identity roles and broad workspace Finance/Operations authority. Current workspace membership, register assignment, active service, open shift and configuring owner's current authority are rechecked for every operation and replay. Owner/admin configures discount ceilings and explicitly authorizes automated issuance. Granting cashier access must not grant general Finance, HR or private Documents access. Refunds, register configuration, cash adjustments and exceptional closure require stronger manager authority.

Walk-in sales use a configured canonical customer, selected or explicitly created by the register manager. Customer email never merges identities. Current products, currencies, units, warehouse/location stock and server prices determine totals. Price/discount controls cannot exceed the current business policy or silently bypass Sales approval. Unsupported overrides must use the existing reviewed Sales workflow.

## Cash is merchant observation

Cash receipt/return records belong to the shared Finance domain and retain their recorded-cash classification. They are not inserted as succeeded provider events. Invoice balances must account for authorized cash allocations, while confirmed-provider series remain separate. All receivable readers must agree on effective allocations. The proposed additive cash-allocation view extension requires explicit evidence classification, matching tests and a reviewed migration; do not update a historical migration in place.

Cash records retain applied amount, tendered amount, change, currency, shift, original sale/receipt reference, occurrence/observation time and actor provenance. A split cash/electronic sale can request only the remaining open invoice balance. Provider confirmation remains subject to existing simulator/Daraja qualification and duplicate protections. No live provider is enabled by POS installation.

Refunds must be bounded by the original recorded receipt and prior returns, append history and preserve invoice corrections. They cannot manufacture provider evidence. Cash return, stock return and invoice credit are distinct facts. A returned-cash invoice may need a collection hold while exact approved credit correction is pending; the design must prevent accidental recollection and preserve existing separate-reviewer requirements. This must be resolved and tested before claiming the refund flow complete.

Accounting needs an explicit recorded-cash source adapter rather than accepting cash as a confirmed-provider allocation. Journal preparation remains optional; posting retains exact independent approval and immutable corrections. Financial reports must name cash observations separately and respect Finance versus register-only permissions.

## Register and shift lifecycle

Only one open shift is allowed per register. Opening cash is an explicit observed amount. Cash receipts, returns and manager adjustments append drawer movements under the organization lock. The expected drawer is opening cash plus net recorded physical cash; electronic confirmations do not change physical drawer totals. Closing binds an exact shift version and requires counted cash and a variance reason when expected differs from actual. Closed observations cannot be rewritten or reopened; delayed electronic confirmation remains a separate current settlement view.

Creating an order or recording a payment does not silently hand over goods. Explicit handover requires the current authorized workflow and stock reservation. Canonical dispatch idempotency prevents duplicate deductions. Physical item return must bind original dispatched lines and bounded quantities; it is not inferred from a refund or reversal.

## Network and hardware

The first qualified implementation remains network-required. No offline transaction guarantee or durable browser queue is claimed without conflict, authorization-expiry and reconnect tests. Browser keyboard barcode input and printable receipts are supported targets. Camera scanners, automatic drawers, terminals and other hardware remain unavailable until genuinely integrated and tested. No card credentials are stored.

## Official benchmark research

[Shopify register sessions](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/register-sessions-in-shopify-pos) describes opening/counting cash, expected-versus-counted variance and closed-session history. [Odoo payment methods](https://www.odoo.com/documentation/20.0/applications/sales/point_of_sale/payment_methods.html) distinguishes ordinary cash from configured terminal/provider methods in its official indexed description; direct page fetch timed out on 11 November 2026. These are functional references, not copied source or third-party brand identity.

## Required qualification

Fresh SQLite and PostgreSQL tests must cover wrong register/workspace/environment, revoked cashier/configuring-owner authority, duplicate/concurrent sales, stock competition with Commerce, split tender, overpayment, linked returns, exact cash variance, closed-shift writes, service caps, unchanged confirmed-provider totals and independent Accounting approval. Browser checks must exercise product/barcode search, cash tender/change, pending electronic status, receipt, handover, shift closing and mobile layout using fictional data only. POS must not enter the app registry merely because its schema exists.
