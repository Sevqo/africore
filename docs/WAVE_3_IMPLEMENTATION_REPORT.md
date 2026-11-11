# Wave 3 implementation record

Updated 11 November 2026. The complete request remains in WAVE_3_MASTER_PLAN.md. This is an active checkpoint, not a Wave 3 completion or deployment claim.

## Release state

Wave 3 source is local and unreleased. Hosted application baseline was Render `228b16c` and Cloudflare `e5ce8dee-103e-4a4f-bb7b-a0697f4ef598` during preflight. Approved Neon development has migrations 001–016; migration 017 has NOT been applied there. No production branch, identity, real payment, paid hosting or external provider activation changed. Hosted status must be checked again before release.

## Checkpoint 1: preflight and targeted repairs

The backend initially returned an HTML Cloudflare challenge with status 429 while the application gateway returned 503. This was not an application abuse-limit response or proof of an invalid identity. A normal restart of the unchanged Render release restored readiness 200. The existing managed session recovered without credential reconstruction. All twelve installed app entry screens opened in the sandbox browser. These were navigation checks, not hosted mutation/provider qualification. Read-only guarded Neon inspection confirmed 001–016. Sanitized evidence: evidence/wave3/preflight.json.

An unlinked sandbox reversal report does not undo an allocation. It retains reversal_requires_review; linked authorized simulator returns bind the original receipt and append negative allocations. Public checkout, invoice finance details and Payment activity explain this distinction. Settled invoices hide new-payment affordances; an older open link cannot collect again after another request settles the balance. Same-receipt replay remains harmless. Historical evidence is retained.

Accounting explains separate reviewer onboarding and administrator permissions. Self-approval remains prohibited. Generated payment links remain separate from ordinary notices/private query caches; record finance details refresh on financial revisions and window focus.

## Checkpoints 2–3: connected Commerce foundation and checkout

Implemented locally:

- Encrypted, scoped and versioned stores, collections, listings, delivery/pickup options and discount rules. Canonical product/variant identities, prices, units and Inventory remain authoritative. Selected service dependencies are ordered without silently activating unselected services.
- Explicit reviewed publication snapshots, immutable revision history, reserved storefront addresses, unpublishing, literal search before pagination and curated public projections. Supplier costs, private documents, merchant credentials and unrelated customer records are excluded.
- Public catalog with theme, brand color, collection/search controls, current currency pricing, product details and responsive presentation. Unqualified images use a small typographic fallback; photographs are not fabricated.
- Expiring, random, hashed cart capabilities in store-scoped HttpOnly/SameSite cookies. Cart/contact content is encrypted and context bound. Managed login is unnecessary for guest checkout; a cart never grants merchant authority.
- Add/change/remove, browser persistence, shipping/pickup selection, contact/address entry, discounts, exact minor-unit totals and quote fingerprints. Prices, publication membership, current stock, currency, consent notice and service availability are rechecked by the server.
- Explicit sandbox checkout policy configured by a current human owner or administrator. That member and every dependent service are rechecked before conversion. Disabling policy or revoking authority prevents new checkout.
- Atomic conversion to one canonical customer, Sales order, issued invoice, payment request and cart-to-order link. Guest emails never merge Neon identities or existing customers. Automation provenance records the system actor and configuring policy owner. Marketing requests remain pending confirmation, never verified subscriptions or delivered campaigns.
- Existing Sales transition owns stock reservation and configured draft-invoice automation. Checkout reuses that linked draft rather than creating a competing invoice. Payment uses the canonical request factory and existing allocation services. Dispatch and Accounting posting remain separate authorized operations.
- Duplicate confirmations, including a fresh retry key for the same accepted cart, return the same order and capability. Permanent operation receipts contain identifiers/revisions rather than contact details or checkout tokens. The strong buyer cookie can read an accepted order after unpublishing; new carts cannot be created there.
- Merchant interface for store creation, catalog revisions, collections, presentation/SEO settings, delivery options, explicit checkout authorization, reviewed publication/unpublication and canonical order balances. Listing search/pagination and bounded canonical-product search are explicit. Commerce is registered as a local evaluation preview, not a completed hosted rollout. Direct-service and installable-app paths use the same implementation.

Migration 017 is additive: publications, immutable revisions, encrypted carts and unique canonical order links. Hosted startup remains verify-only; do not deploy before guarded development migration qualification.

## Verification

Full checkpoint regression: PostgreSQL 407/407 pass; SQLite 406 pass with one PostgreSQL-only skip, zero failures. This includes concurrent independent buyers for the last unit, usage-cap rollback, canonical payment readback, post-unpublication buyer receipts, explicit Commerce installation and scoped merchant search. Website production/content checks pass 62/62 after the app-intent navigation repair. API contract validation covers 401 workspace and 59 legacy operations. Gateway 9/9, startup/development 3/3, lint/type/architecture and isolated local chain checks pass. Backend suites were not repeated after the subsequent frontend-only app-intent repair because no backend source changed.

The isolated sandbox browser exercised fictional local data: published notebook → cart → saved contact → reviewed sandbox order/invoice → existing payment screen → successful simulator confirmation → paid storefront receipt. Remaining amount became zero; fulfillment stayed unfulfilled. At a measured 390px viewport, document width was 375px with no horizontal overflow. This is browser emulation, not physical iPhone qualification.

Merchant browser checks also verified exact publication review, the same paid order balance, mobile direct-service access and app-context navigation after sign-in. A confirmed bug dropped the requested app at login; validated catalog app/section intent now survives sign-in and workspace selection without arbitrary return URLs, credential query parameters or workspace permission changes. Merchant mobile document width remained 375px at a 390px viewport. Evidence includes commerce-orders-desktop.png, commerce-orders-mobile.png, commerce-direct-mobile.png and commerce-signin-context.png.

Evidence: [desktop checkout](evidence/wave3/storefront-checkout-desktop.png), [mobile accepted order](evidence/wave3/storefront-order-mobile.png), [mobile paid order](evidence/wave3/storefront-paid-mobile.png), and earlier [catalog desktop](evidence/wave3/storefront-catalog-desktop.png)/[catalog mobile](evidence/wave3/storefront-catalog-mobile.png).

## Outstanding scope

Checkpoint 3 is NOT complete. Public media custody, custom-domain verification/routing/TLS, fuller page/SEO publication, customer-identity checkout, recovery messaging, B2B catalogs/terms/verification consent and remaining Commerce lifecycle/acceptance remain outstanding. Current checkout is sandbox-only, not externally qualified M-Pesa or live readiness. No automatic email, courier delivery, refund execution, digital fulfillment or verified marketing consent is implied.

Checkpoints 4–8 (POS, Website editor, Marketing, Support and Subscriptions), checkpoint 9 cross-app/security/full acceptance and checkpoint 10 guarded migration/backend-before-frontend deployment remain pending. Only after core Wave 3 qualification do checkpoints 11–20 begin the eighteen-app/direct-service/Personal/Developer UI transformation. Manufacturing, industry apps and AfriCore Studio remain excluded. Nothing in the master request is cancelled by this checkpoint.
