# Phase 2 — Applications Progress

Current checkpoint: **2.4 Inventory app rebuild** — implemented and verified at build/test level.

Source checkpoint: Phase 1 committed by the founder; this work is uncommitted by design.
Hard limits observed: no commits, pushes, deployments, production data or provider changes.

## Checkpoint status

| Checkpoint | App | State |
| --- | --- | --- |
| 2.1 | Commerce | Implemented; build/tests green; browser click-through not executed |
| 2.2 | Finance | Not started |
| 2.3 | Sales | Implemented (Odoo-style document workspace); build/tests green; browser click-through not executed |
| 2.4 | Inventory | Implemented (Odoo-style warehouse workspace); build/tests green; browser click-through not executed |
| 2.5 | CRM | Not started |
| 2.6 | Procurement | Not started |
| 2.7 | Accounting | Not started |
| 2.8 | POS | Not started |
| 2.9 | Work | Not started |
| 2.10 | People | Not started |
| 2.11 | Documents | Not started |
| 2.12 | Analytics | Not started |
| 2.13 | Automations | Not started |
| 2.14 | Business ID | Not started |

## Checkpoint 2.1 — what was wrong

`AppsWorkspace` dispatched `app.id === 'commerce'` to `<CommerceWorkspace embedded>`, the same
component the independent Commerce service renders. The app only added an identity header,
installation review and a two-item navigation (`dashboard`, `orders`). Opening the app therefore
opened the service with a wrapper; the app added no operational composition.

## Architecture change

- `src/apps/catalog.ts` — Commerce app navigation now follows a merchant workflow:
  Overview, Catalogue, Orders, Storefront, Inventory, Payments, Reports, Settings.
  Required/optional services, preview availability and uninstall semantics unchanged.
- `website/src/commerce/merchant-sections.ts` — one exported workflow order shared by the app
  registry test and the UI.
- `website/src/commerce/CommerceMerchantWorkspace.tsx` — dedicated app-level workspace. It reads
  the same authoritative `/commerce/stores`, `/configuration`, `/listings` and `/orders` endpoints
  through the shared idempotent API. It does not import, wrap or duplicate `CommerceWorkspace`.
- `website/src/apps/AppsWorkspace.tsx` — installed Commerce app renders
  `CommerceMerchantWorkspace`; the direct service path in `BusinessApp.tsx` still renders
  `CommerceWorkspace`.
- `website/src/apps/lazy-workspaces.tsx` — lazy export for the merchant workspace.
- `website/src/workspace-navigation.ts` + `website/src/apps/AppNavigation.tsx` — app section
  routing helper. Commerce sidebar sections stay in the app (`#Apps&section=…`) instead of
  leaving for a same-named shared service tab; other apps keep their existing mapping.
- `website/src/approved-platform.css` — merchant context header, section tabs, overview grid,
  fact lists and responsive collapse using existing tokens/classes.

## How the independent service differs

The Commerce **service** remains the full store operator: create/edit store settings, listings,
collections, delivery and discount rules, media library, checkout authorization, publication
review/publish/unpublish, plus order and overview panels. It stays available without the app.

The Commerce **app** is a merchant control room: store context and switching, pending-action
queue, catalogue/order reporting from authorized pages, storefront readiness and public link,
inventory link state, payment-evidence distinction, supported reports and configuration summaries.
Editing that belongs to authoritative service records links back to the service editor rather than
creating a second editor or state store.

## Checkpoint 2.3 — Sales app rebuild

**What changed.** The installed Sales app previously rendered `SalesWorkspace`, the independent
service screen. It now renders a dedicated `SalesAppWorkspace`; the service keeps its existing
quotation/price-list interface when opened from My Services.

**App composition.**

- App navigation in `src/apps/catalog.ts`: Sales, Orders, Products, Reporting, Configuration.
- A top module bar mirrors the Odoo composition: Sales, Orders (Quotations, Sales Orders, To
  Deliver, To Invoice), Products, Reporting (Analysis, By Customer, By Product), Configuration
  (Settings, Price Lists, Templates).
- Quotations/orders use a dense records list with search, canonical status filters, active filter
  chips, pagination, selection, list/kanban/calendar/graph/pivot views and a compact To Confirm /
  To Deliver / To Invoice + date-range performance strip. Filters operate on the latest authorized
  API page (100 records); the list states that coverage rather than implying a full-history query.
- Quotation documents provide customer selection or canonical customer creation, metadata, editable
  order lines, document tax/discount, authoritative totals, Other Info and Notes tabs, revision
  activity from `/sales/quotations/:id/history`, and Save/Send/Preview/Confirm/Revise/Cancel.
- Confirmed orders expose canonical smart state, Create invoice, Issue invoice, Cancel, linked
  invoice/outstanding evidence, and links to Fulfillment/Invoices.
- Sales reporting only uses confirmed order document value and counts loaded records; it explicitly
  states that order value is not recognized revenue, invoiced value, collected cash or margin.
- Configuration shows read-only policy from `/business/policy` and reuses the existing canonical
  `SalesPriceLists` component.

**Authoritative workflow.** Quotation create/update, `mark_shared`, `accept`, `convert`, `cancel`
and `revise` call `/sales/quotations…/action` with `expected_version`. Convert creates the canonical
order; confirmation then PATCHes `/records/orders/:id` to `awaiting_payment`. Invoices are created
through `/records/invoices` with `order_id` and issued through `/records/invoices/:id`. No payment
is recorded by creating or issuing an invoice. Send marks the quotation shared and states that no
message was delivered; there is no outbound quotation email provider.

**Files.** `src/apps/catalog.ts`; `website/src/apps/SalesAppWorkspace.tsx` (new);
`website/src/apps/sales-app-model.ts` (new); `website/src/apps/AppsWorkspace.tsx`;
`website/src/apps/lazy-workspaces.tsx`; `website/src/workspace-navigation.ts`;
`website/src/approved-platform.css`; `website/tests/sales-app.test.mjs` (new).

## Checkpoint 2.4 — Inventory app rebuild

**What was wrong.** The installed Inventory app dispatched to `InventoryWorkspace`, the same
component the independent service renders, with the same register/dashboard sections. The app added
only its identity header and could not be distinguished from opening `My Services → Inventory`.

**Architecture change.** `AppsWorkspace` now dispatches `app.id === 'inventory'` to a dedicated
`InventoryAppWorkspace`, lazily loaded. The independent service continues to render
`InventoryWorkspace` unchanged and remains available without the app. App navigation is registry
driven: Overview, Operations, Products, Reporting, Configuration. The view is URL-backed with
`?app=inventory&section=…&view=…`, so refresh, Back/Forward and workspace changes restore the same
warehouse screen. Inventory was added to `appOwnedWorkspaces` so its sidebar sections stay inside
the installed app instead of jumping to the shared Products/Reports tabs.

**Implemented warehouse interface.**
- Overview with real operation cards for receipts (incoming plans), delivery orders (shipments),
  posted internal transfers, physical inventory attention, replenishment suggestions and returns.
  Counts come from loaded authorized records; unsupported Odoo counts are not invented.
- Receipts: planned incoming table, overdue flag, posted receipt movements, plan creation, and a
  full-page receipt document with Planned → Received/Cancelled status. Receive validates the full
  planned quantity through `/inventory/incoming/:id/action`; purchase-linked plans are routed to
  Procurement instead of being received here.
- Deliveries: seller-reported shipment list with status/overdue filters and pagination; full-page
  delivery document with status pipeline, order lines, authoritative on-hand/available snapshot,
  activity history and lifecycle transitions through `/shipments/:id/transition`. Creating a
  shipment remains in the shared confirmed-order/Fulfillment workflow. Shipment, order and customer
  enrichment requests are issued only when those optional services are active; without Fulfillment the
  Deliveries view states the dependency while inventory stock stays usable.
- Internal transfers: source/destination warehouse form posting a paired atomic movement through
  `/inventory/movements`; posted transfer list exposes the paired destination. The UI states that
  the backend has no draft, waiting or backorder transfer state.
- Physical Inventory: warehouse-scoped product table, exact on-hand snapshot, editable counted
  quantity, live difference, reason, revision check and authorization-aware adjustment posting via
  `/inventory/stock-counts`; significant negative differences use the existing approval controls.
- Products/Stock: search and stock filters, on hand/reserved/available/incoming/forecast, product
  stock detail with movement history and links to canonical Products. No competing product master.
- Replenishment: existing workflow suggestions (`plan_incoming`, reviewed, dismissed) plus low-stock
  products; planning creates incoming plans and never a purchase order, receipt or payment.
- Reporting: stock, moves history, detailed stock from the loaded movement register, reservations
  and incoming plans. No inventory valuation is shown because the backend returns `valuation: null`.
- Configuration: existing warehouses and locations with revision-bound edits; unsupported operation
  types, lots/serials, manufacturing, quality, scrap, routing and valuation are listed as
  unsupported rather than rendered as working settings.

**Authoritative workflow and data safety.** All screens use existing inventory, product, shipment,
record and replenishment endpoints. Movements and counts are posted to the existing stock authority;
no second stock balance, no client-side quantity mutation, no frontend accounting journals, no
courier/payment claims. Delivery state is explicitly seller-reported. Empty, loading, failure,
read-only and missing-dependency states are rendered instead of blank pages.

**Files.** `src/apps/catalog.ts`; `website/src/apps/InventoryAppWorkspace.tsx` (new);
`website/src/apps/inventory-app-model.ts` (new); `website/src/apps/AppsWorkspace.tsx`;
`website/src/apps/lazy-workspaces.tsx`; `website/src/workspace-navigation.ts`;
`website/src/approved-platform.css`; `website/tests/inventory-app.test.mjs` (new).

**Known limitations.** No receipt/delivery/transfer draft documents exist in the backend, so the
app labels plans, posted movements and seller-reported shipments accurately instead of simulating
Odoo states. Physical counts are one product at a time; there is no bulk apply, lot/serial tracking,
operation-type CRUD or inventory valuation. The receipt flow only supports a full-plan receipt.
Filters and reports operate on the latest authorized API page (100 movements / 1,000 products).

## Verification

| Check | Result |
| --- | --- |
| `website: npm run typecheck` | Pass |
| `website: node --test tests/sales-app.test.mjs` | 6/6 pass |
| `website: npm run build` (tsc, Vite 492 modules, prerender 82 pages, content tests) | 87/87 pass |
| Root `npm run lint` | Pass (181 frontend modules, no static import cycles) |
| Root `npm run build` | Pass |
| Backend `business-app-workflows`, `financial-operations` suites | 52/52 pass |
| `website/src/apps/sales-app-model.ts` money/quantity tests | Exact integer minor-unit totals, tax rounding, discounts and paging |
| Inventory: `website: npm run typecheck` | Pass |
| Inventory: `node --test tests/inventory-app.test.mjs` | 6/6 pass |
| Inventory + Sales + Commerce + navigation + application-quality tests | 30/30 pass |
| Inventory: `website: npm run build` (Vite 494 modules, prerender 82 pages, content tests) | 93/93 pass |
| Inventory: Root `npm run lint` | Pass (183 frontend modules, no static import cycles) |
| Inventory: Root `npm run build` | Pass |
| Inventory: backend `business-app-workflows`, `app-installations`, `marketplace` suites | 47/47 pass |
| Full backend regression `npm test` | 435 tests, 434 pass, 0 fail, 1 skipped (21 suites) |

Browser click-through: **not executed**. No authenticated local workspace/browser control is
available to this session; demo mode has no `/apps` transport, so it cannot install the app.
Do not present screenshots or live-flow evidence as completed.

## Phase 2 application matrix (working assessment)

| App | Required services | Current app screen | Duplication / gap | Target next action |
| --- | --- | --- | --- | --- |
| Commerce | products, commerce, orders, invoicing, payments | Dedicated merchant workspace (new) | Service editor intentionally separate | Verify with an installed app and browser session |
| Finance | invoicing, expenses, cash_flow | `FinanceDashboard`; nav mirrors service tabs | High: Invoices/Payments/Expenses/Reconciliation open service views | Operational finance overview; keep record detail shared |
| Sales | customers, products, sales, orders, invoicing, fulfillment | Dedicated Odoo-style sales workspace (new) | Service editor remains separate | Verify with an installed app and browser session |
| Inventory | products, inventory | Dedicated Odoo-style warehouse workspace (new) | Service register remains independent; no document/draft states invented | Verify operation cards and receipts/deliveries with an installed app |
| CRM | customers, crm | `CrmWorkspace` | Medium: pipeline exists; Customers duplicates service | Pipeline-first composition, shared customer detail |
| Procurement | customers, products, procurement | `ProcurementWorkspace` | Medium: app tabs mirror procurement stages | Buying desk overview; approval/delivery exceptions |
| Accounting | accounting | `AccountingWorkspace` | High: app opens same journals workspace | Period-close and review overview, not a second ledger |
| POS | products, orders, invoicing, cash_flow, pos | `POSWorkspace` | High: the counter is the app | Keep counter; add shift/cash overview distinct from register |
| Work | work | `WorkWorkspace` | High | Portfolio/board composition distinct from project service |
| People | people | `PeopleWorkspace` | High | HR overview; preserve private access rules |
| Documents | documents | `DocumentsWorkspace` | High | File manager is legitimate app workspace; distinguish service access |
| Analytics | intelligence (+ forecasting) | `AnalyticsWorkspace` | Low-medium: already app-shaped | Confirm coverage/unsupported measures |
| Automations | automations | `AutomationsWorkspace` | Medium | Run/exception overview distinct from rule editor |
| Business ID | passport, verification, credentials, trust_network (+ blockchain) | `BusinessIDWorkspace` wraps `PassportWorkspace` sections | High: same trust workspace under app identity | Identity/evidence overview with app workflow; retain trust detail |

## Service-overlap register (deferred)

- `verification` vs `credentials` vs `blockchain` vs `verification_api`: shared trust evidence and
  verification paths, different authority/qualification. Do not merge in Phase 2.
- `orders` vs `sales` vs `fulfillment`: canonical order records with distinct lifecycle stages.
- `payments` vs `reconciliation` vs `cash_flow`: evidence, matching and movement are separate facts.
- `invoicing` vs `accounting`: source documents vs reviewed double-entry posting.
- No merge, rename, deletion or deprecation is authorized in Phase 2.

## Next step

Checkpoint 2.4 is complete pending founder acceptance. The remaining apps continue in separate
checkpoints; the next suggested app is CRM. Do not start it without authorization.

## Checkpoint 2.5 — CRM implementation in progress (14 November 2026)

The existing CRM uses the shared app registry and CRM service. It already provides scoped CRM entries, configurable stages and teams, versioned edits, a lead-to-opportunity transition, customer activity, a bounded opportunity board with accessible stage movement and rollback, and a filtered aggregate report. Customer identity remains owned by the Customers service; quotations remain owned by Sales. CRM entry listing is limited to 200 records and customer selection to 100 records. The current conversion changes the existing lead in place and retains its customer; it does not implement customer creation/link selection or opportunity merging. Follow-ups are customer-linked CRM entries, not opportunity-linked activities. There is no persisted priority field or predictive model.

This increment makes the installed app pipeline-first, adds distinct lead and activity navigation, puts a New action in the CRM toolbar, presents selected records without the underlying board, and changes the board to horizontally scrolling compact columns with persisted tags. Existing mutations, authorization, configuration and direct CRM service access are retained. Stage totals remain sums of the loaded open records, separated by currency; the coverage notice discloses the bounded list. Modified files: `website/src/apps/CrmWorkspace.tsx`, `website/src/apps/CrmPipeline.tsx`, `website/src/approved-platform.css`, and this report. Existing uncommitted Sales and Inventory changes were retained.

Status: **partial, not acceptance-complete**. The requested full-page document design, linked activity lifecycle, safe customer-selection conversion dialog, Won/Lost dialogs, CRM-to-Sales quotation creation, calendar and graph views, authoritative pipeline pagination/aggregation, priority, and comprehensive reporting controls remain outstanding. Existing record editing, conversion, configuration and report functions are reused; their full end-to-end behavior has not been manually verified in this increment. No screenshot comparison or authenticated browser verification has been performed. No migration, deployment, production data modification, commit, or push was performed. The next checkpoint is not ready until the remaining CRM workflows and security, responsive, browser and regression acceptance tests are completed.

Verification for this increment: `npm --prefix website run typecheck` passed. `npm --prefix website run build` passed, including 93 frontend/content tests. These checks do not establish CRM workflow, permission, responsive, or browser acceptance; backend and full regression suites were not run.

### CRM continuation — 14 November 2026

Further implementation adds a document-style record, stage progression, Won/Lost and restore actions, an assignment-aware conversion dialog, customer-scoped existing quotation links, internal notes, linked follow-up scheduling/completion/rescheduling/cancellation, and persisted revision history. CRM activity links are stored on existing CRM entries, validated against an opportunity in the same workspace/environment and customer, and cannot be silently reassigned. The existing CRM entry, customer, quotation and reporting services remain authoritative. Conversion remains an in-place transition with the original customer; new-customer creation, customer replacement and merging are not implemented. A chronological closing-date view, loaded-record activity indicator, and stage/salesperson count/value graph or table were added. Older CRM records use a stable created-at/id cursor. CRM reporting remains bounded to 10,000 records with explicit truncation, and board totals cover loaded records by currency.

Backend/API changes are in `src/operations/crm.ts` and `src/operations/business-routes.ts`; the generated `platform-openapi.json` reflects the extended inputs. UI changes are in `CrmWorkspace.tsx`, `CrmPipeline.tsx`, `CrmEntryDetails.tsx`, `CrmReport.tsx` and `approved-platform.css`. Integration tests in `business-app-workflows.test.ts` cover linked activity lifecycle and retained linkage, conversion assignment and duplicate prevention, and cursor stability. The isolated SQLite business workflow suite passed 37/37 after the changes. Frontend typecheck, website production build and 93 frontend/content tests, lint/architecture checks, legacy OpenAPI, and generated workspace OpenAPI validation passed. The first sandboxed localhost test attempt failed to connect and is not counted. No PostgreSQL suite, full backend suite, authenticated browser workflow, responsive screenshot comparison, or physical-device test was completed.

Remaining work prevents acceptance: priority and a genuine salesperson-default pipeline; full customer selection/creation during conversion; quotation creation and navigation from CRM; complete lead filtering/sorting; activity email delivery and notification integration; full calendar and graph options; deep-link and browser-history support; reusable lost-reason configuration; complete report measures and views; and comprehensive accessibility, browser and cross-workspace acceptance. Linked activity display is limited to loaded CRM pages, and the current Sales link selects an existing same-customer quotation rather than creating one. No screenshots were captured. No production data, deployment, commit or push was performed.

### CRM continuation — quotation navigation and priority

CRM now defaults to the current salesperson's pipeline when the authorized actor is a current operational member, with an all-authorized selector. Priority is persisted on CRM records and exposed in the record form and board. Lead views gained assignment filters, sorting and pagination of loaded records. CRM record URLs now carry a record identifier and react to browser history. CRM can open the existing Sales quotation editor with the opportunity customer, link the saved quotation back through the CRM service, return to the originating opportunity, and reopen a linked quotation. A failed link leaves the saved quotation intact and provides a recovery message. Customer and workspace validation still occur on the server. The Sales editor now retains a successful create response before a follow-up read to avoid treating a saved quotation as a new draft on retry.

The isolated SQLite workflow suite passed 39/39, including priority bounds/replay and same-customer quotation-link validation. The generated workspace OpenAPI check passed. These tests do not establish the browser handoff itself: authenticated browser, responsive screenshot, full PostgreSQL and full backend regression checks remain unperformed. Customer creation or replacement in conversion, broader reporting/notification controls and the other limitations in the preceding continuation remain outstanding. No deployment, production-data change, commit or push was made.

The conversion continuation now permits explicitly selecting another existing, active canonical customer in the same workspace. The lead's earlier customer remains visible in the saved revision history; the selected customer and any existing sales links are validated before the transition. Creating a customer during conversion and merging opportunities remain unsupported. The isolated SQLite workflow suite passed 40/40, including this conversion and invalid customer rejection. The workspace OpenAPI was regenerated and validated. Browser handoff, responsive visual acceptance, PostgreSQL and full backend regression remain unverified.

### CRM isolated browser verification

A disposable local SQLite workspace was seeded with synthetic data and used in the in-app browser. Verified pipeline opening, lead creation, conversion with a newly created canonical customer, Lost and Restore, follow-up scheduling and completion, and quotation creation in Sales with return to the linked CRM record. Refresh retained the selected record and the saved quotation. The initial visual check exposed hidden module navigation and a quotation selector showing the wrong option; both were corrected and verified after reload. The lead creation form now defaults to lead when opened from Leads. A reload-related activity-tab reset was corrected in source after its initial observation. Page-width checks in the tested leads view found no document-wide overflow at requested 390, 768, 1280 and 1440 widths; this is not a full responsive or accessibility audit. No screenshots were saved. The isolated server was stopped; no production records were touched.

The CRM suite passed 41/41 with atomic customer creation, duplicate email/phone protection, rollback and idempotent conversion replay. Website build/content tests passed 93/93 before the final wording-only change. Pipeline graph and table reporting now additionally support sales-team grouping and weighted, won and lost measures. The report remains bounded and discloses truncation. Unsupported or incomplete areas remain: reusable lost-reason configuration, broader activity and win/loss reporting, email delivery and notification integration, full calendar/pivot capabilities, and comprehensive role, concurrency, cross-browser, physical-device, PostgreSQL and full regression acceptance. The application should not be described as fully satisfying every requested acceptance test yet.

Final isolated SQLite regression for this continuation: 442 tests discovered, 441 passed, one skipped, zero failed. The monthly CRM calendar uses loaded opportunity closing dates and scrolls within its own region on narrow screens. The browser test did not cover every permission or failure path; PostgreSQL and physical-device checks remain outstanding.

### CRM reporting and configuration continuation

Authorized workspace owners and administrators can now configure reusable lost reasons. Legacy configuration updates that omit the new field retain existing reasons; duplicate reason labels are rejected. The Lost dialog uses configured reasons when present and stores the selected text and closing note in the opportunity revision history. Pipeline analysis can group lost opportunities by recorded reason. A new scoped activity analysis endpoint and screen report follow-up counts by assignee, including completed, open, cancelled and overdue; the creation-date period, observation time and 10,000-record limit are disclosed. The endpoint is explicitly registered in the CRM workspace and service capability map.

The isolated CRM workflow suite passed 43/43, including configuration compatibility, exact activity-count changes, and unauthorized activity-report access. In the in-app browser with synthetic SQLite data, the activity report showed the completed follow-up, and a saved synthetic lost reason appeared in the Lost dialog. The generated workspace OpenAPI validates 428 operations. The existing notification infrastructure emits a follow-up-created notification; due/overdue notification scheduling remains unsupported. Full PostgreSQL, comprehensive responsive/accessibility and full browser acceptance remain unverified. No deployment, production records, commit or push were changed.

### Follow-up reminders continuation

The existing operations worker now emits durable, deduplicated daily reminders for assigned open follow-ups due by the end of the Nairobi day, in bounded batches. It uses the existing CRM event and notification infrastructure, respects current member permissions and notification preferences, and rechecks CRM entitlement, assignee, due date and open status before delivery. Reminder identity includes the assignee so reassignment can notify the new owner. No email or external message is sent.

The focused SQLite CRM suite passed 44/44 after the final reassignment change, including deduplication, completion suppression and reassignment. The immediately preceding full SQLite backend run passed 444/445 with one PostgreSQL-only skip and zero failures; that run preceded the final reminder-key refinement, which was covered by the focused suite. The website build and 93 frontend/content tests passed for the current report and settings UI; workspace OpenAPI validates 428 operations. Due notifications have not been browser-tested, and PostgreSQL, exhaustive cross-role/browser, and physical-device acceptance remain unverified. The earlier statement that due reminders were unsupported is superseded by this entry.
