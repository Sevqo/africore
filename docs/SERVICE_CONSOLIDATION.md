# Service consolidation — Phase 3 local checkpoint

Status: **implemented in local source; not CI or production verified**. This registry changes presentation only. Service IDs, activation sources, entitlements, prices, usage ledgers and histories remain independently owned by the existing service engine.

## Canonical families

| Family | Existing service IDs (each appears once) | New association |
|---|---|---|
| Finance & Payments | income, expenses, cash_flow, payments, reconciliation, protected_payments, invoicing, accounting | — |
| Commerce & Customers | commerce, products, customers, orders, sales, crm, pos | — |
| Inventory & Supply | inventory, procurement, fulfillment | — |
| People & Work | people, work | calendar |
| Intelligence & Automation | intelligence, forecasting, assistant, automations | — |
| Business Identity & Trust | passport, verification, credentials, trust_network, blockchain | — |
| Data & Integrations | data, connect, developer_api, webhooks, verification_api | website |
| Documents | documents | — |

The original 35 IDs are unchanged. Calendar and Website are two new, independently activatable service IDs, yielding 37 catalog entries. `src/marketplace/families.ts` is the typed family registry. Membership is exactly once for every catalog service; family filtering does not install, activate or bill services.

## User interface and compatibility

The marketplace retains All services, My services, search, pricing/category filters, usage and billing, and adds family filtering and family labels. Service cards still open their service-specific destinations. New app installation declares only `calendar` or `website` as the required service; it does not activate all services in that family. Existing Apps installation/history and uninstall policy continue to preserve historical records and independent activation references.

Migration `026-app15-16` inserts only the two service definitions and evaluation price rows with conflict-safe writes. It does not backfill entitlements, change prices or rewrite service history. Hosted migration mode remains verify-only. The deployment verifier now expects this migration, but no hosted migration was run.

## Verification and limits

Added a focused registry test for 35 legacy IDs, unique membership, 16 app definitions and 37 service definitions. The website content suite reported 135/135 passing after catalog/nav adjustments. Full backend regression is being rerun with loopback access after updating the deployment verifier fixture; its final result is appended to deployment results. No browser screenshot comparison was completed. Marketplace family filters were verified from source/content tests only.


## Phase 3 runtime regression — 20 November 2026

The disposable synthetic Business DB applied migration 026-app15-16, contained Calendar and Website service definitions and effective evaluation-v1 price rows, and installed both apps through the normal preview/confirmation flow. The app endpoint returned 16 eligible apps even before service activation; the cards showed each service’s availability. Existing 35 plus 2 new definitions remain 37 total; the eight families remain presentation-only. See [Phase 3 acceptance](PHASE3_ACCEPTANCE.md) for the exact runtime and release limits.

## Phase 3 regression snapshot, 21 November 2026

Calendar/Website work continues to use their exact existing service dependencies and the existing entitlement/usage model. Calendar appointments store encrypted ERP objects and linked Calendar events and add no migration or scheduler. Route policy validation passed with 553 workspace operations; no service-family mapping or billing behavior was intentionally changed in this continuation. Full service-family regression was not rerun after this continuation.

Latest focused check covers appointment type creation, member booking, conflict rejection and deactivation; 5/5 Phase 3 API tests passed. The operations model still uses the existing Calendar service, encrypted ERP records and idempotency receipts. No migration was introduced.
# Phase 3 local catalog verification — 21 November 2026

Read-only inspection of the repository's local `africore.db` found 26 rows in `platform_migrations`, including `021-people-expansion`, `026-app15-16` and `027-website-forms`. The persisted `ac_services` catalog contains 37 definitions. Calendar and Website each have one `evaluation-v1` KES price row, model `free`, effective 28 October 2026, with no expiry; both are current for the inspection date. No entitlements were fabricated and no migration was applied by this check. This is local SQLite evidence only; it does not establish hosted Neon/Render state.

## Phase 3 status — 22 November 2026

The consolidated catalog remains at 37 service definitions (35 prior IDs plus Calendar and Website). Calendar and Website retain their separate service IDs, current evaluation prices and exact app dependencies. Latest local suite: 491 passed, 0 failed, 1 PostgreSQL-only skipped. Marketplace install/open was browser exercised for both apps in synthetic Business scope. No service mapping, billing semantics, entitlement history or family assignment was changed by this follow-up. Hosted billing and PostgreSQL behavior were not newly verified.

The public Calendar appointment capability uses the existing Calendar service and entitlement; it adds no service ID, evaluation price, usage meter or billing rule. Migration 028 stores appointment link/request/capacity/history state only. The 37-definition catalog and eight service families are unchanged by this flow.
## Superseding service verification — 22 November 2026

Local registry and database checks retain the 35 legacy service definitions and add Calendar and Website for 37 total. Both new services have current evaluation-v1 KES price rows locally. The full isolated PostgreSQL 17 suite passed 494/494 after the Calendar slot capacity fix. Service family and Marketplace checks remain local; this is not evidence of hosted billing behavior. No historical records or hosted service rows were changed.
### Latest regression — 23 November 2026

Fresh isolated PostgreSQL 17 full suite passed 497/497 with no skips. Catalog/database checks and Marketplace browser checks cover both new app cards and their reviewed free evaluation services. Hosted billing behavior was not changed or tested.

### Phase 3 regression status — 23 November 2026

Current local regression passes: 496 backend tests, zero failures and one optional PostgreSQL-only skip; the earlier disposable PostgreSQL 17 run passed 497/497. OpenAPI validation covers 59 registered operations and platform validation covers 560 workspace operations. Calendar/Website service definitions and dependencies remain part of the broader Phase 3 integration tests. The local database previously showed migrations 021, 026, 027, and 028 and evaluation price rows for Calendar and Website. These local results do not establish hosted ledger state or billing readiness.
