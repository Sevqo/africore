# Wave 3 commerce architecture

## Canonical ownership

Commerce orders will be specialized canonical Sales orders, with channel/store/cart references attached through an additive mapping. They never carry an independent mutable financial total. Product variants remain canonical product records with parent_id/variant/SKU/barcode. Canonical stock reservations and physical movements remain the only inventory writer. Canonical invoices, allocations, credits and provider evidence remain the financial sources, including for Accounting and Analytics. Existing protected-sale agreements are a distinct settlement workflow, not a new storefront order database.

## Publishing and public capabilities

Draft stores/pages use scoped encrypted ERP records and strict typed section schemas. Publishing creates a bounded immutable public snapshot and an explicitly reserved host/slug mapping. Public content is an allowlisted projection only; private files, HR/financial attachments, source notes, tenant credentials and arbitrary HTML/scripts never become public through a URL flag. Media must be separately uploaded/validated and explicitly authorized for publication; private Documents grants are not public CDN grants. Custom domains stay unbound until ownership, routing and TLS are genuinely verified.

Guest carts use random hashed expiring capabilities, fixed store/environment/currency, authoritative server product/price/discount/shipping/tax calculations and durable order intent idempotency. Guest contact entry is not a verified account and never email-merges a Neon identity or grants workspace access. No public bearer link authorizes a refund or staff operation. A payment click or acknowledgement is not payment; callbacks require current trusted provider proof. Public order status redacts staff/customer data unrelated to that capability.

## Execution boundaries

Business is the initial tested workspace kind; optional Personal eligibility needs its own implementation and tests. Developer service APIs retain explicit scoped credentials and are not merchant membership bypasses. New app registry entries only ship when their real UI and service journeys exist. Installation reuses reviewed activation ownership, prices and limits without duplicate entitlements.

POS cash entries are explicitly observed cash evidence, never electronic provider confirmation. Hardware input/printing are browser capabilities; offline sale guarantees require a separately qualified durable queue. Recurring invoices use retained plan price and occurrence identities; no automatic mandate debit is inferred. Marketing suppressions and current consent are checked at execution; configured-provider delivery and simulated tests are distinct. Support public replies/attachments use ticket-scoped authorization and never expose internal notes.

## Research

Official Shopify checkout documentation describes server inventory checks throughout checkout and inventory holds at the payment stage: https://help.shopify.com/en/manual/checkout-settings . Its POS documentation describes shared order/inventory synchronization across channels: https://help.shopify.com/en/manual/sell-in-person . Its Analytics overview describes period comparisons and customizable metric cards: https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/ . These are capability benchmarks, not copied code/design or a claim of equivalent readiness. The supplied Odoo20 eCommerce page timed out during initial research and needs a successful primary-source follow-up.

## Guest checkout checkpoint, 11 November 2026

Store-scoped HttpOnly capabilities retain encrypted 14-day carts. Current public snapshot membership, owner/admin checkout authorization, every required service and authoritative quote are revalidated under the workspace lock. The canonical Sales transition reserves stock and can prepare its existing policy-controlled draft invoice; Commerce reuses it, then issues and links the canonical invoice/payment request atomically. Automated provenance names the system actor and configuring owner. No email-based identity merge, hidden accounting approval, automatic physical dispatch or live payment activation occurs. Accepted buyer receipts remain readable by their cookie after unpublishing until capability expiry.

The Odoo20 official checkout/product entries were found through the primary-domain search index on 11 November; direct fetches still timed out. Only their indexed descriptions (checkout organization and independent product visibility) were available. This does not qualify full editor, delivery or customer-account behavior.
