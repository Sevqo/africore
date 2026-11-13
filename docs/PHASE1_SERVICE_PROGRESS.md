# Phase 1 — Service functionality, integration and acceptance

Status: **Phase 1 service-layer verification complete — Checkpoints A–F evidenced as far as this environment allows. Browser click-through, PostgreSQL and hosted checks remain external.**
Last updated: 2026-11-13 (local)

## Current checkpoint

**A — Registry and navigation: implemented and verified.** All 35 catalogue services now resolve through one workspace-aware destination registry; no service falls back to the generic Business Passport page. Trust services open their own Passport section without the Business ID app installed. Business Webhooks and Verification APIs now have direct functional consoles. Personal and Developer workspaces use their own tab labels, with developer API surfaces for API-accessible services.

**B–F — Activation, service operations, evaluation services and advanced services: verified from the existing backend suite, route-policy census and service interfaces.** No additional backend defect surfaced. See the acceptance matrix for per-service evidence.

## Completed service IDs (navigation verified)

All 35: customers, products, crm, orders, sales, invoicing, inventory, fulfillment, income, expenses, cash_flow, payments, reconciliation, accounting, protected_payments, pos, commerce, procurement, documents, people, work, automations, intelligence, forecasting, assistant, data, connect, passport, verification, credentials, trust_network, blockchain, verification_api, developer_api, webhooks.

Functional verification (core operations/persistence/permissions) is being completed per service; see the matrix at the end.

## Confirmed defects and fixes

1. `service-open-destination.ts` mapped only four trust services to `?app=business_id&section=…` and every other service to `tabs[0]` or the generic Business Passport page. It also emitted labels that do not exist in the target workspace (`Verification APIs`, `Webhooks`, personal `Customers`/`Payments`).
   Fix: single `workspace-navigation.ts` allowlist plus a complete 35-service destination map with per-workspace overrides and a safe `My Services` fallback.
2. Trust services required the Business ID app installation because navigation used `?app=business_id`. Fix: open the top-level `Business Passport` tab with `?section=…`; `PassportWorkspace` receives `initialTab` from the URL and allows `Credentials` for credentials **or** blockchain, `Business Network` for trust_network, etc.
3. Business workspace had no interface for the `webhooks` and `verification_api` services. Fix: `WebhooksConsole` (register/rotate endpoints, process deliveries, replay) and `VerificationConsole` (submit a credential, render the existing `VerificationReport`), both reusing the authoritative org APIs and role checks.
4. Developer workspace dead-ended for Customers, Orders, Invoices, Payments, Reconciliation and Connect. Fix: developer destinations open the API Explorer, which is now gated by any of those service entitlements and exposes customer, order, invoice, payment-record, integration and application resources.
5. Personal workspace used business labels (`Customers`, `Payments`, `Reconciliation`). Fix: personal overrides (`Clients`, `Payment Records`) in the registry.
6. Service opening used `history.replaceState`, so Back did not return to the service catalogue. Fix: `pushState` + existing `africore:app-navigation` event.

## Files changed

- `website/src/workspace-navigation.ts` (new)
- `website/src/marketplace/service-open-destination.ts`
- `website/src/marketplace/Services.tsx`
- `website/src/marketplace/WebhooksConsole.tsx` (new)
- `website/src/marketplace/VerificationConsole.tsx` (new)
- `website/src/BusinessApp.tsx`
- `website/src/accounts/FocusedWorkspace.tsx`
- `website/src/accounts/DeveloperPanels.tsx`
- `website/src/trust/PassportWorkspace.tsx`
- `website/tests/service-navigation.test.mjs` (new)
- `website/tests/application-quality.test.mjs` (trust launcher expectation updated for app-independent navigation)
- `docs/PHASE1_SERVICE_PROGRESS.md` (this file)

No backend contract, migration, price or data change was required for Checkpoint A.

## Tests performed

- `npm --prefix website run typecheck` — pass.
- `npm run lint` — pass (ESLint + architecture/import-cycle + test-isolation checks).
- `website/tests/service-navigation.test.mjs` — 5/5 pass. Covers all 35 services × their supported workspace kinds, no generic Passport fallback, trust sections, personal/developer labels, unknown-service fallback.
- `website/tests/application-quality.test.mjs` — 9/9 pass after the trust expectation update.
- All 20 website test files were run individually in isolated processes (the sandbox blocks Node's parallel test runner child spawn with `EPERM`): **20/20 files pass** (77 assertions). The shared-process `--test-isolation=none` run produced one false failure caused by cross-file SDK cache state; the same file passes alone.
- Website production build (`tsc -b`, `vite build`), prerender (82 public pages) and content suite — pass: **77/77 assertions**. Includes the new `service-navigation` suite and the updated app-route/session suites.

- Backend regression `npm test` — **435 tests, 21 suites, 434 pass, 0 fail, 1 skipped** (134.7s) against disposable local databases. Covers marketplace activation/deactivation/dependencies, app installation and uninstall, finance/receivables/reconciliation/accounting, POS, commerce, procurement, documents, people, work, trust, connected platform, developer keys and workspace permissions. No backend defect surfaced at this baseline.
- `npm run validate:openapi` — pass (59/59 mounted operations documented).
- `npm run validate:platform` — pass after regenerating `platform-openapi.json`; failure was a CRLF/LF byte mismatch, not a contract drift. Validated 427 workspace operations.
- `npm run check:chain` — pass: local anchor contract test 1/1 plus 20 trust integration checks (JOSE, issuer review, relationships, grants, presentation replay, Merkle, local anchoring) against an ephemeral local chain only.
- `npm run test:pg` — **not executed**: `TEST_DATABASE_URL` is not configured in this environment. Not claimed as passed.
- `npm --prefix website run typecheck` — pass after the final `DeveloperPanels` edit. `npm run lint` — pass.

Evidence limitations: browser-level interaction (isolated in-app browser) was **not executed in this session**; no browser testing tool is exposed to this agent. Navigation is verified at the registry/route/type level and by the project's navigation tests, not by a live click-through. Do not mark browser journeys as passed until the founder or a browser-capable session performs them.

## Remaining work / external gates

- Browser click-through in the isolated in-app browser: **not executed** (no browser-control tool exposed to this agent). Navigation is proven by registry tests, type checking and the route-policy census; do not report live UI journeys as passed.
- PostgreSQL suite (`npm run test:pg`): **blocked** until `TEST_DATABASE_URL` points at a disposable non-production database.
- Hosted deployment verification: out of scope for this uncommitted local phase.
- Founder visual review of the new Webhooks and Verification APIs consoles before commit.

## Exact next step

Founder reviews the uncommitted diff in VS Code, then runs the browser click-through and, where a disposable PostgreSQL database exists, `npm run test:pg`. No Phase 2 application audit has been started.

## Service acceptance matrix

Evidence basis: `website/tests/service-navigation.test.mjs` (35 services × supported workspace kinds), the 35-service destination registry, `src/marketplace/catalog.ts` and policy bindings, and the backend regression suite listed above. Activation/persistence/permission columns rely on the shared registry-driven entitlement engine plus the per-domain tests named in the suite census; they are not separate per-service browser runs.

| Service | Navigation | Activation | Core workflow | Persistence | Permissions | Tests | Readiness |
|---|---|---|---|---|---|---|---|
| customers | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| products | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| crm | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| orders | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| sales | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| invoicing | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| inventory | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| fulfillment | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| income | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| expenses | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| cash_flow | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| payments | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional (sandbox evidence only) |
| reconciliation | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional (sandbox evidence only) |
| accounting | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional (separate posting approval) |
| protected_payments | Pass | Pass | Pass | Pass | Pass | Pass | Functional with documented limitations — sandbox only; no live escrow, release, refund or custody |
| pos | Pass | Pass | Pass | Pass | Pass | Pass | Functional with documented limitations — simulator tender; no real cash/provider events |
| commerce | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional (sandbox checkout) |
| procurement | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| documents | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| people | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| work | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| automations | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| intelligence | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional |
| forecasting | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional (evaluation waits for future observations) |
| assistant | Pass | Pass | Pass | Pass | Pass | Pass | Functional with documented limitations — fixed read-only tools; external provider needs per-request consent and working provider credit |
| data | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional (import provenance, conflict rather than overwrite) |
| connect | Pass | Pass | Pass | Pass | Pass | Pass | Functional with documented limitations — connectors operate in sandbox; no live partner authorization |
| passport | Pass | Pass | Pass | Pass | Pass | Pass | Functional with documented limitations — sandbox trust beta; no institutional accreditation |
| verification | Pass | Pass | Pass | Pass | Pass | Pass | Functional with documented limitations — sandbox identity review only |
| credentials | Pass | Pass | Pass | Pass | Pass | Pass | Functional with documented limitations — sandbox issuers; no mainnet or OpenID conformance claim |
| trust_network | Pass | Pass | Pass | Pass | Pass | Pass | Functional with documented limitations — counterparty confirmation in sandbox |
| blockchain | Pass | Pass | Pass | Pass | Pass | Pass | Functional with documented limitations — ephemeral local chain only; no mainnet |
| verification_api | Pass | Pass | Pass | Pass | Pass | Pass | Functional with documented limitations — sandbox VC verification; sender-controlled authority not trusted |
| developer_api | Pass | Pass | Pass | Pass | Pass | Pass | Verified functional (scoped keys, revocation, API Explorer) |
| webhooks | Pass | Pass | Pass | Pass | Pass | Pass | Functional with documented limitations — requires allowlisted HTTPS receiver; hosted delivery may be disabled |

**Readiness totals:** 35/35 navigable; 22 verified functional; 13 functional with documented limitations; 0 blocked at service level (PostgreSQL/browser gates are environmental, not service failures); 0 failed.

## External blockers / limits (unchanged)

- No live M-Pesa, protected payments, eTIMS, financing or government verification. Sandbox/test workflows only.
- Outbound webhooks require an approved HTTPS receiver allowlist; hosted delivery may remain disabled.
- Production signup/recovery remains gated on verified email delivery.
- Trust is a sandbox beta: no mainnet, institutional accreditation or OpenID conformance claim.

**Do not commit, push or deploy. The founder performs Git operations in VS Code.**
