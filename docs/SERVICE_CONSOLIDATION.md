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
