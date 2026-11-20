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
