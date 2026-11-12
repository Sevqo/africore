# Wave 3 implementation record

Updated 12 November 2026. The complete request remains in WAVE_3_MASTER_PLAN.md. This is an active checkpoint, not a Wave 3 completion or deployment claim.

## Release state

Wave 3 source is local and unreleased. Hosted application baseline was Render `228b16c` and Cloudflare `e5ce8dee-103e-4a4f-bb7b-a0697f4ef598` during preflight. Approved Neon development has migrations 001–016; migrations 017 and 018 have NOT been applied there. No production branch, identity, real payment, paid hosting or external provider activation changed. Hosted status must be checked again before release.

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

Checkpoint 3 is NOT complete. Custom-domain verification/routing/TLS, fuller page/SEO publication, customer-identity checkout, recovery messaging, B2B catalogs/terms/verification consent and remaining Commerce lifecycle/acceptance remain outstanding. Current checkout is sandbox-only, not externally qualified M-Pesa or live readiness. No automatic email, courier delivery, refund execution, digital fulfillment or verified marketing consent is implied.

Checkpoints 4–8 (POS, Website editor, Marketing, Support and Subscriptions), checkpoint 9 cross-app/security/full acceptance and checkpoint 10 guarded migration/backend-before-frontend deployment remain pending. Only after core Wave 3 qualification do checkpoints 11–20 begin the eighteen-app/direct-service/Personal/Developer UI transformation. Manufacturing, industry apps and AfriCore Studio remain excluded. Nothing in the master request is cancelled by this checkpoint.

## Public-media follow-up, 11 November 2026

Verified separate public-use image custody, explicit upload/rights acknowledgements, bounded raster decoding and metadata stripping, encrypted canonical WebP storage, immutable asset/history, version-safe named descriptive revisions, scoped private previews, reviewed listing/logo references and immediate public withdrawal. Current publication, workspace/service state, listing/product visibility and currency authorize each public image request. Private Documents are not public media sources. Metadata reads do not load every image body. Upload processing runs outside the asset write transaction, with current authority rechecked in its atomic operation.

Merchant UI supports image preparation, upload, selection, private preview during publication review and withdrawal. The isolated browser uploaded a fictional green raster fixture, attached it to the notebook, reviewed the actual private image, published, and verified decoded public dimensions of 800 × 600. At 390px the document width remained 375px. These are local fictional-data checks, not production media publication. Evidence: [public image desktop](evidence/wave3/storefront-public-image-desktop.png) and [public image mobile](evidence/wave3/storefront-public-image-mobile.png).

Final local regression for this follow-up: PostgreSQL 413/413 pass; SQLite 412 pass and one PostgreSQL-only skip; website build/content 62/62; gateway 10/10; 406 workspace and 59 legacy API operations validated; lint/type/architecture and isolated chain checks pass. The new historical-media-read case preserves owner/admin review after service deactivation while blocking writes and public delivery. Root npm audit reported zero known vulnerabilities after the narrowly scoped development-tool patches described in PUBLIC_MEDIA_ARCHITECTURE.md.

Migration 018 is additive and remains local-only. The checkout checkpoint is committed as 3e17335; hosted schema/release is unchanged. POS checkpoint design is retained in WAVE_3_POS_ARCHITECTURE.md, with cash observations explicitly distinct from provider confirmation. None of these checks marks the remaining five apps, Commerce extensions or Phase 2 complete.

The Commerce/media checkpoints were pushed to codex/wave3-commerce-checkpoints as 906d7fa. Linux CI run [43051442298](https://github.com/Sevqo/afriscore/actions/runs/43051442298) passed all five jobs, including clean npm installation, SQLite, PostgreSQL, type/lint/startup/gateway, website and local-chain checks. Main and hosted deployments remain unchanged. Evidence: evidence/wave3/commerce-ci.json.

## POS foundation continuation — 11 November 2026

Implemented the internal register and shift domain, with strict input contracts, current human/member/register assignment checks, current configuring owner authorization, individually required service dependencies and register discount ceilings bounded by the current Sales policy. Currency/timezone remain fixed after shift history; configuration changes require closing the current shift. No Neon role or shared cashier PIN is introduced.

Opening float, manager drawer adjustments and closing counts are merchant observations. Reasons are encrypted with workspace/environment/object context. Shift closing binds the current version and requires a variance explanation. Immutable SQL facts preserve adjustments and closing counts; one-open-session uniqueness serializes competing opens. Drawer history is bounded while totals aggregate all scoped movements. Current authority is rechecked on idempotent replay.

Added exact tender/change/split-payment/pending and cash-return-capacity calculations. The shared invoice reader now exposes provider_paid_minor and recorded_cash_paid_minor alongside aggregate paid_minor; it accepts both the original allocation view and its additive classified successor. A transactional regression proves that recorded cash receipts/returns alter receivables without creating provider events or changing confirmed-provider inflows. The original migration 008 is unchanged.

Extracted canonical channel order/invoice conversion for reuse by Commerce and POS. It retains Sales-owned stock reservations, existing policy-created draft invoice reuse, exact quote agreement, immutable issued snapshots and shared usage limits. Commerce still creates an unverified guest contact rather than merging identities, and requests payment through the original shared factory.

The POS migration 019 and internal services remain deliberately unwired to hosted startup and app discovery. The register test suite temporarily supplies process-local synthetic service metadata to exercise the real schema and domain; it does not publish POS availability. Sale confirmation, tender persistence, handover/returns, Accounting/report integration, routes and cashier UI still require implementation and qualification. This is not a completed POS app or a deployment. No hosted migration, live provider, identity or financial-data change was performed.

Qualification for this POS-foundation checkpoint: full PostgreSQL 422/422; full SQLite 421 pass, one PostgreSQL-only skip; lint/build/architecture pass; 406 workspace and 59 legacy contracts pass; startup/development 3/3; Cloudflare gateway 10/10; isolated local-chain check passes. Register tests include conflicting simultaneous opens and denied replay after membership revocation. These results qualify the internal foundation and existing Commerce regressions, not the unfinished POS sale/UI journeys.

## POS integrated checkpoint, 12 November 2026

Supersedes the foundation-only wiring/status paragraphs above. POS now has mounted, documented human-only register APIs and shared app/direct-service UI. Local startup applies additive migration 019; hosted startup verifies it without applying migrations. Hosted Neon migrations 017–019 remain unapplied and Wave 3 remains unreleased.

Implemented canonical product/barcode search, version-bound priced drafts, current-policy confirmation, recorded cash/change, split sandbox electronic remainder, pending orders, explicit paid handover, immutable counted shifts, scoped history/receipts, bounded cash returns and original-dispatch stock returns. Stock returns reuse shared Inventory and include returns recorded outside POS in their quantity ceiling. Configuring-owner revocation can be recovered by another current administrator explicitly reauthorizing the unchanged saved policy. Member removal controls wait for the actual team lookup.

Cash is classified as merchant-observed physical cash throughout invoice balances, separate report coverage and optional Accounting sources. Float is excluded from sales. Accounting preparation/posting preserves independent exact review. Cash returns create a derived collection hold while a receivable remains: new links, initiation, local simulator collection and manual allocation are blocked. Authenticated late provider evidence remains immutable but becomes a review exception rather than silently recollecting a held invoice. Invoice credits and physical returns remain separate actions. The original issuing calendar is captured for POS/Commerce credit-date validation.

Sandbox browser verification used fictional local data: counted KES 500 opening float, KES 1,000 product sale, KES 1,500 tender and KES 500 change; explicit dispatch; one physical unit received back; KES 1,000 cash returned; collection-hold notice; shift closed at KES 500 with zero variance. Historical receipt remained readable after closure/reload. The stale quote crossing the register's calendar day was rejected and required a fresh review. At 320px, an existing shared body minimum plus scrollbar and related-app label caused overflow; the minimum now respects available width and app labels wrap. Verified document/scroll width 305/305 at 320px and 375/375 at 390px. Browser emulation is not physical-device or printer qualification. Evidence: pos-quote-desktop.jpg, pos-paid-receipt-desktop.jpg, pos-paid-receipt-mobile.jpg and pos-return-receipt-mobile.jpg.

Qualification: full PostgreSQL 433/433; SQLite 432 pass with one PostgreSQL-only skip; website build/content 62/62; lint/architecture 163 frontend modules; 426 workspace and 59 legacy API contracts; gateway 10/10 and startup/development 3/3; isolated local-chain check passed. Corrected focused POS tests also passed on both engines. All database tests used disposable local databases, never Neon.

Outstanding: the POS daily dashboard/payment mix/top products/low-stock report, broader cross-app acceptance and external provider/hardware qualification; the remaining Commerce requirements above; Website, Marketing, Support and Subscriptions; guarded hosted migration and backend-before-frontend deployment. POS writes are sandbox-only and network-required; no offline queue, live M-Pesa, terminal, automatic drawer, PIN identity or automatic journal posting is advertised. The final eighteen-app/platform UI phase still follows core qualification. This checkpoint is not completion of Wave 3.
