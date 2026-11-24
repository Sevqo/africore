# AfriCore original application expansion closure register

**24 November 2026 — Accounting fixed assets.** Checkpoint 4 adds the source-linked asset register, reusable depreciation models, Python schedule calculation, reviewed journal posting and future-period revisions. Disposal, hybrid methods and matched screenshot acceptance remain separate. See the [fixed assets checkpoint](odoo-reverse-engineering/FIXED_ASSETS.md).

Updated 2026-11-20 against local `main` source at `cdfa55f77e17843eb2b4e166e9cdeaee4310e24a` plus the current Commerce working-tree changes. This is an implementation register, not founder acceptance or a production-readiness claim.

## Status vocabulary

- **Implemented and verified:** source behavior has automated coverage and the relevant local gate passed.
- **Implemented but unverified:** source exists, but a required database, browser, hosted or role check was not run.
- **Partially implemented:** the listed capability exists, but a material workflow or data source is absent.
- **Missing:** no supported implementation exists in the current product.
- **Externally blocked:** verification needs access to a service, provider, device or environment not available in this task.

## Release and verification blockers

| Priority | Item | Evidence / next action |
|---|---|---|
| P0 | Current GitHub CI | **Verified green:** run [44607759099](https://github.com/Sevqo/africore/actions/runs/44607759099), run 123, is `success` on the exact local `main` SHA `cdfa55f77e17843eb2b4e166e9cdeaee4310e24a`. This includes the CRM selected-position `GROUP BY` fix. New local Commerce edits are uncommitted and are not covered by that run. |
| P0 | PostgreSQL after current local edits | **Unverified locally:** the latest hosted CI covered PostgreSQL before this task's frontend-only Commerce changes; this task did not have an isolated PostgreSQL test service. Run the suite against a disposable PostgreSQL database before release. |
| P0 | Render deploy and migration ledger | **Unverified:** no Render integration/credentials or actual build/startup logs were available. The configured deploy pipeline requires manual dispatch and exact-SHA polling. `AFRICORE_MIGRATIONS_MODE=verify` and `/v1/readiness` remain enabled. Do not infer `021-people-expansion` is missing. Operator: inspect the service's latest deployment event/log and exact commit; then read-only verify the migration ledger and readiness before any separately authorized deployment. |
| P0 | Docker image | **Unverified:** Docker CLI is installed, but the Linux engine was not available for an image build during the earlier infrastructure check; recheck `docker info` and build the candidate image in a working engine. |
| P1 | Browser/Odoo visual acceptance | **Unverified for this combined checkpoint:** screenshots were reviewed as references; no fresh running-app capture/side-by-side comparison at matching widths was completed. No pixel-parity claim. Founder acceptance remains pending. |

## Original 14-app capability and acceptance matrix

| App | Core implementation and authority | Automated / local evidence | Remaining closure work and classification |
|---|---|---|---|
| Commerce | Separate merchant app and public storefront; canonical Products/listings, Sales orders, invoices, payment evidence and inventory stay authoritative. Public catalog search/collections/paging, product details, guest cart, server quote, shipping/discount/tax, idempotent order conversion and publication checks exist. | Commerce route/workflow and website tests; approved UI preview artifacts exist. New Promotions register and Cards/List toggle are covered by the focused app test. | **Partially implemented.** No arbitrary attribute/price/stock facets, wishlist, campaign attribution, real payment provider, carrier tracking, or accurate per-variant stock display where the source lacks it. Current screenshots still need live matched-size and complete journey acceptance; PostgreSQL/runtime/hosted migration checks remain separate. |
| Finance | Finance overview and supported Expenses, Invoicing, Payments and canonical financial summaries. Integer money, currency and approval boundaries retained. | Finance app, finance operations and broader platform tests recorded in progress and deployment reports. | **Implemented but unverified for full expansion acceptance.** Reconcile all widget totals, role matrix and cross-service drilldowns; no bank-settlement inference or local statutory coverage claim. |
| Sales | Quotations/orders, product links, canonical pricing, lifecycle controls, reporting and finance/inventory handoffs. | Sales workflow/app tests and broad backend regression recorded in progress report. | **Partially implemented.** Full source-backed report coverage, every state/action, role checks and Odoo comparison remain; test rejected/stale quote and invoice/fulfillment separation. |
| Inventory | Canonical products, locations, stock movements/reservations and warehouse workflows. Commerce listing visibility does not write stock. | Inventory and Commerce integration coverage in the backend and app test suites. | **Partially implemented.** Advanced replenishment, forecast, barcode/hardware and full transfer/return workflows need explicit closure; do not infer exact availability from Commerce listing rows. |
| CRM | Leads/opportunities, activities, pipeline, forecasts and reporting with scope checks. Latest PostgreSQL aggregate defect was fixed by grouping on selected positions. | Run 123 PostgreSQL and SQLite CI is green for committed SHA; CRM workflow tests in local suite. | **Partially implemented.** Complete opportunity/activity end-to-end role/browser matrix, forecast correctness and visual comparison on the candidate SHA; external email/calendar sync remains absent. |
| Procurement | Supplier, RFQ/order, vendor price/agreement comparison and approval/reporting extensions. Receipts and bills remain their canonical services. | Procurement focused backend and app tests and run 123 CI. | **Partially implemented.** Broader vendor-bill/receipt matching, exchange currency semantics, delivery and vendor communication integration need acceptance; no claim of transmitted RFQ without provider evidence. |
| Accounting | Scoped ledger, journals, entries/lines, reports and separate review/post controls; posted history is immutable. | Focused accounting tests and app tests documented in Phase 2.7B. | **Partially implemented.** Bank statement import/matching/reconciliation, fixed assets, deferrals, close/opening balances, fiscal localization, FX and classified cash flow are explicitly missing or limited. These are P1 closure areas. |
| POS | Cashier sessions, orders, cash evidence and bounded POS analysis. Cash is not electronic payment proof. | POS focused tests and CI checks documented in Phase 2.8B. | **Partially implemented.** Advanced multi-register flows, durable offline queue, receipt hardware/printer, barcode/hardware and richer returns remain. Test cash count variance and separate payment/fulfillment lifecycle. |
| Work | Projects/tasks, stages, dependencies, recurring generation, milestones, time entries/timers, review, scheduling preview and reports. Work time is not payroll or accounting. | Focused Work tests; local authenticated route check for Timesheets and Reporting after runtime refresh. | **Partially implemented.** Gantt interaction is date-grid/preview, not full dependency drag scheduling; capacity integration, historical/report breadth, real calendar meetings and payroll/billing are absent. Recheck hosted routes. |
| People | Employee profiles, private data, history/resume/skills, manager hierarchy, leave, attendance, recruitment, goals/appraisals and lifecycle workflows. | People workflow tests and local People report in 2.10B. | **Partially implemented.** Full profile tab parity, leave allocation/calendar, employee schedule rules, payroll/statutory computation, biometric location and external recruitment delivery remain unsupported. Browser/role acceptance pending. |
| Documents | Encrypted/versioned files, folders, grants, private preview, protected requests, tags, trash, PDF preview and integrations to canonical source records. | Documents tests; authenticated synthetic nested folder/PDF route and download were locally exercised. | **Partially implemented.** OCR, malware scanning, public portal shares, batch/ZIP, PDF manipulation, spreadsheet/Sign, office/video preview and external notification delivery are absent. Validate full permissions and responsive workflow. |
| Analytics | Canonical reports, dashboard, graph/table/pivot and source coverage, including automation aggregate measures. | Analytics integration tests, validators, website build and run 123 CI. | **Partially implemented.** Wider source-specific measures, scheduled snapshots, PDF/XLSX, full report builder/shared filters and matched-size screenshots remain. No zero-filling sparse data. |
| Automations | Versioned bounded rules, supported triggers/actions, schedules/run history, manual retry/cancel where supported, and Analytics summary. | Automation app and workflow tests, worker/deployment verifier CI. | **Partially implemented.** 18 registered recipes/four supported action types are bounded; multi-step designer, arbitrary code, external delivery guarantees and broad scheduling/runtime observability remain. Never claim scheduled delivery solely from a rule. |
| Business ID | Ten sections over the existing Passport/Trust authority: profile, review, evidence, credentials, issuer metadata, consent sharing, relationships and history. No duplicate org/credential authority. | Focused quality tests passed 6/6 in this task; existing Trust regression and local gates are documented. | **Implemented and locally verified; browser acceptance unverified.** Government registry checks, recognized production issuer, production signing, full DID method, general selective disclosure, malware scanning and institutional network are absent. Side-by-side Odoo comparison and role workflow acceptance remain. |

### Cross-app closure priorities

1. Validate the full release candidate against PostgreSQL, the Docker image, exact hosted Render build/start/readiness and migration ledger under the authorized deployment procedure.
2. Close authoritative operational journeys first: Accounting statement/reconciliation authority; POS return and cash boundaries; Commerce order through invoice/evidence to independently authorized fulfillment; People/Work time boundaries; Documents source authorization.
3. Run role-by-role and workspace-isolation browser acceptance on the apps with recent expansions; capture exact desktop/mobile widths and compare to the supplied references.
4. Expand reports/scheduling only after source completeness, exact coverage and drilldowns are verified. Avoid adding fake stock, settlement, identity or conversion metrics to fill sparse data.

## Business ID 2.14B and Commerce 2.1B local continuation

- Business ID was already implemented on the existing Passport authority. This continuation rechecked the ten-section app, role/source guards, signature-versus-issuer distinctions and the documented manual visual gates; it added no second identity model, migration, or misleading legal-verification behavior.
- Commerce now includes the requested Promotions destination, reading current configured discount policy from the existing service, and a Cards/List switch for canonical product listings. Editing stays with current Product/Commerce editors. The server quote still validates discount/date/limits. No stock, payment or delivery truth was changed.
- Focused test command: from `website`, `node --test tests/commerce-app.test.mjs tests/business-id-quality.test.mjs` — **10/10 passed**. Full checks for this task are recorded in `DEPLOYMENT_TEST_RESULTS.md` when complete.
- Official Odoo documentation URLs timed out. Focused Odoo 20 source research is recorded in `docs/odoo-reference/notes/contacts.md`, `notes/website_sale.md` and `RESEARCH_LOG.md`. This is not a matched-size visual comparison.

## Phase 3 implementation checkpoint — 20 November 2026

The local branch now has eight service families, adds Calendar and Website as apps 15 and 16, and preserves the other 14 definitions. Families are presentation groupings only; there are 37 independent service definitions (35 old + 2 new). Calendar and Website have core server-backed drafts/events and initial UIs, but remain **partially implemented**. Full recurrence/availability/appointments and Website menus/forms/media/Commerce/publication history/SEO remain closure items. There is no matched-size browser evidence, no disposable PostgreSQL run, no Render verification or founder acceptance for this checkpoint. Do not move these two apps to “complete” in the original 14-app closure matrix; keep the 14-app backlog separate from this new-app work.


## App 15–16 checkpoint — 20 November 2026

Calendar and Website are still partial, not accepted or closed. Runtime visibility, installation, open and refresh were confirmed on a synthetic Business workspace; a Calendar event lifecycle and Website draft/menu/publication smoke workflow also ran. Recurrence, appointments, availability, public contact submissions, media, website identity, publication history, production routing and matched desktop Odoo review remain open. Do not mark Apps 15–16 complete. See [PHASE3_ACCEPTANCE.md](PHASE3_ACCEPTANCE.md).

### Status correction — 21 November 2026

The prior sentence is a 20 November checkpoint. Later local work adds recurrence/availability, Website forms/media, identity/settings and publication-history APIs/UI. The apps remain incomplete and unaccepted; latest evidence and exact open acceptance items are in [PHASE3_ACCEPTANCE.md](PHASE3_ACCEPTANCE.md). Apps 17–26 were not started.

## Phase 3 continuation snapshot, 21 November 2026

Calendar appointment management and member-only booking with staff conflict checks were added, and public Website pages now populate client-rendered SEO/share metadata. Final local focused Calendar/Website integration passed 5/5; website build/content checks passed 138/138; backend suite 486 passed and skipped only its PostgreSQL-only case. This does not close Phase 3: public appointments, full Calendar integrations and browser/Odoo comparison, Website publication/domain/SEO sitemap/redirect/media/editor gaps, disposable PostgreSQL, live Render verification and founder acceptance remain outstanding.

Latest continuation added versioned appointment type activation/deactivation and the Website page duplicate action. The public renderer now sets client-side search/share metadata. Focused Phase 3 integration tests pass 5/5 and the Website production build/content checks pass 138/138. The whole phase remains incomplete pending public appointments, remaining Website product/host/SEO/editor features, browser visual acceptance, PostgreSQL and production deployment verification.

### Work task link update — 21 November 2026

Calendar now stores supported Work task links on events, checks the Work project permission again when creating or editing, and routes link opens back through Work's own scoped target. The focused API test verifies a permitted link and a 404 for a workspace member without project access. Latest full backend regression passed 489 tests with no failures and one PostgreSQL-only skip. This closes only the Work-task link slice; public appointment booking, other source integrations, matched-size browser/Odoo review, hosted schema recovery and the remaining Website release gates remain open.

### CRM links and full local regression — 21 November 2026

The supported Calendar link types now also include active CRM leads and opportunities; each write checks the CRM service and same-tenant active record. The UI routes an event's CRM link back to the CRM pipeline record selection. Backend test coverage confirms both CRM/Work links and unsupported link rejection. Latest full suite: 489 passed, 0 failed, 1 PostgreSQL-only skip. This does not close Calendar: Sales, People and Documents integration, public appointment requests/capability/capacity, and browser/Odoo review remain. Website/Render/PostgreSQL acceptance blockers remain listed in [PHASE3_ACCEPTANCE.md](PHASE3_ACCEPTANCE.md).

## Calendar/Website additions — 21 November 2026

Calendar now includes a permission-filtered approved-People-leave overlay and canonical Sales quotation links in addition to its Work and CRM links. Website Editor includes bounded session-local undo/redo. Focused Calendar/Website integration passed 6/6; root regression passed 489 with 0 failures and 1 PostgreSQL-only skip; Website content passed 144/144. These improvements do not change the partial status of Phase 3. Public appointment capabilities, Documents linking, the remaining Website editor/public-host acceptance, matched-size Odoo comparison, PostgreSQL rehearsal and hosted Render ledger/readiness remain open.

### Calendar Documents record links — 21 November 2026

Calendar now supports permission-checked links to Documents files. Both create and edit recheck the member's current Documents read access; the user can open the file through the Documents workspace, and Calendar grants no document rights. The picker uses the authorized Documents listing and excludes personnel files. The focused HTTP integration suite passes 6/6, including denial for a member without a private-document grant. Browser interaction and cross-app mobile acceptance remain open.

### Website contact-form throttling — 21 November 2026

Anonymous public contact form POSTs now use a separate 10-per-minute in-process per-IP limit, in addition to global IP limiting and the existing honeypot. The limiter test suite passed 6/6. It is not shared across instances or persistent across restart; this is a basic spam control and does not complete Website production acceptance.

### Website multi-image gallery continuation — 21 November 2026

Gallery blocks now use a bounded array of up to 12 reviewed media IDs with distinct-item validation, responsive public rendering, editor removal controls, preview loading, and publication/restore checks. Active-publication media withdrawal checks inspect gallery arrays, closing a reference gap discovered by the focused integration test. The Phase 3 HTTP integration suite passes 6/6, Website build/content passes 144/144, root build and lint pass. Production page/media delivery and matched-size Odoo visual comparison are still unverified.

## Phase 3 remains open — 22 November 2026

Final local results are recorded in `PHASE3_ACCEPTANCE.md`: 491 passed, 0 failed, 1 PostgreSQL-only skip; API/route, Render-verifier and Website build checks passed. Synthetic browser flows confirm marketplace visibility and app install/open; Website draft editing/save/preview/sandbox publication/refresh worked. Calendar week layout was inspected at desktop and mobile widths. Production publication and complete Odoo parity were not established. Hosted Render failure evidence still ends at schema verification in `prepareDatabase()`; without hosted migration ledger and backup readiness, no migration or deployment is authorized. CI run 126's PostgreSQL job remains unexplained. Phase 3 is not closed.

### Current Phase 3 boundary — 22 November 2026

The Website CRM lead handoff is now implemented and locally tested (Phase 3 HTTP integration 8/8). The latest full backend suite passed 492, 0 failures, with one PostgreSQL-only skip; platform route validation now covers 555 operations. The project remains Phase 3 partial until Calendar public appointment lifecycle, Website multi-site/public host and full editor requirements, PostgreSQL/CI, hosted migration/backup/readiness and Odoo browser comparison close.

## Render schema verification — updated 22 November 2026

The founder-provided sanitized log confirms image build/push succeeded, then `prepareDatabase()` refused startup with `Deployment schema is incomplete; run reviewed migrations separately` for commit `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e`. Exact missing entries are unknown without a read-only hosted migration ledger. Backup/restore readiness is also unconfirmed. Keep `AFRICORE_MIGRATIONS_MODE=verify` and `/v1/readiness`; no hosted SQL or redeploy was performed. Current local verifier requires migration 028 in addition to earlier versions.
## Superseding local acceptance record — 22 November 2026

A fresh disposable PostgreSQL 17 cluster ran the full PostgreSQL suite after the Calendar capacity-upsert correction: 494 passed, 0 failed, 0 skipped across 21 suites. This supersedes earlier notes that reported only a partial PostgreSQL rerun. The isolated cluster was stopped afterward; no hosted database was contacted.

A synthetic Business workspace was opened through the isolated in-app browser. Browse Apps showed AfriCore Calendar and AfriCore Website. Website search returned its card. Each installation preview resolved its required free evaluation service; both installations succeeded, each workspace opened, and refresh preserved both installations. Returning to Browse Apps showed Open controls for both. Calendar week view and Website Overview screenshots were inspected in-session; image files were not exported as repository artifacts.

The local development database was inspected read-only: migrations 021, 026, 027 and 028 are present; Calendar and Website exist in ac_services with current evaluation-v1 KES price rows. No database mutation was performed during this inspection.

Phase 3 remains open. The hosted Render migration ledger, backup readiness and post-deploy readiness are unavailable; the CI PostgreSQL failure lacks step logs. Full Calendar recurrence, invitation, availability, appointment and integration acceptance and the full Website editor, media, SEO, anonymous forms, publication-host and commerce matrix remain incomplete or unverified. No commit, push, hosted migration or deployment was performed. Marketing and Support remain deferred.
## Final local regression update — 23 November 2026

After adding the hosted migration prerequisite preflight and correcting a Nairobi-local analytics test date, a fresh disposable PostgreSQL 17 cluster ran npm run test:pg: 497 passed, 0 failed, 0 skipped, 21 suites. Root build was part of that command. Typecheck, lint, migration-runner syntax and diff checks also pass. The isolated cluster was stopped and removed.

The migration runner now checks the full deployment prerequisite chain before Phase 3 DDL and reports all missing versions in dependency order: 016-procurement through 021-people-expansion, then 026-app15-16 and 027-website-forms before target 028-calendar-appointments. This is a local code hardening only; the runner was not pointed at hosted PostgreSQL. Render's actual migration ledger and backup/restore status remain unavailable, and Phase 3 is not closed.

The public Calendar booking URL now has an Express SPA fallback, and the booking/manage deep-link regression passed. Browser verification of the anonymous UI after this fix is still outstanding because the fresh isolated demo endpoint timed out.

### Phase 3 closure decision — 23 November 2026

Do not close Phase 3 yet. Local marketplace, Calendar, Website, routing, service, and build regressions pass, but hosted Render schema readiness remains unresolved and the remaining browser acceptance/visual comparison is incomplete. No Marketing or Support work started. See `PHASE3_ACCEPTANCE.md` for evidence and exact release gates.
