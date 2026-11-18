# Phase 2 — Applications Progress

Current checkpoint: **2.2 Finance completion** — requested after the previously recorded 2.14 work; Finance implementation and automated checks are recorded at the end of this file; founder manual acceptance and live screenshot comparison remain pending.

Source checkpoint: Phase 1 committed by the founder; this work is uncommitted by design.
Hard limits observed: no commits, pushes, deployments, production data or provider changes.

## Checkpoint status

| Checkpoint | App         | State                                                                                                                                                             |
| ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1        | Commerce    | Implemented; build/tests green; browser click-through not executed                                                                                                |
| 2.2        | Finance     | Implemented and automatically verified; live visual comparison and founder acceptance pending                                                                    |
| 2.3        | Sales       | Implemented (Odoo-style document workspace); build/tests green; browser click-through not executed                                                                |
| 2.4        | Inventory   | Implemented (Odoo-style warehouse workspace); build/tests green; browser click-through not executed                                                               |
| 2.5        | CRM         | Partial — pipeline increment recorded at the end of this file; browser acceptance not performed                                                                   |
| 2.6        | Procurement | Implemented (Odoo-style purchasing workspace); build/tests green; browser click-through not executed                                                              |
| 2.7        | Accounting  | Implemented (Odoo-style ledger workspace); build/tests green; browser click-through not executed                                                                  |
| 2.8        | POS         | Implemented (Odoo-style register, cashier, payment, receipt, closing, orders, reporting and configuration); build/tests green; browser click-through not executed |
| 2.9        | Work        | Implemented; focused engineering/browser verification recorded below; founder acceptance pending                                                                  |
| 2.10       | People      | Implemented — independent source loading/retry; backend People tests and production builds pass; founder browser acceptance pending                               |
| 2.11       | Documents   | Source implementation and focused checks pass; live request-recipient route needs runtime verification; populated-file and founder acceptance pending             |
| 2.12       | Analytics   | Implemented; prior focused checks recorded below; founder screenshot acceptance pending                                                                           |
| 2.13       | Automations | Implemented; focused tests/checks recorded below; browser screenshot comparison not performed; founder acceptance pending                                         |
| 2.14       | Business ID | Implemented; build/tests green; founder manual and visual acceptance pending                                                                                      |

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

## Checkpoint 2.6 — Procurement app rebuild

**What was wrong.** The installed Procurement app dispatched to `ProcurementWorkspace`, the same
generic register the independent service renders. Its sections (`request`, `rfq`, `order`, `receipt`,
`bill`, `payment`, `credit`, `supplier`) mirrored backend record types rather than a purchasing
workflow, so the app could not be distinguished from `My Services → Procurement`.

**Architecture change.** `AppsWorkspace` now dispatches `app.id === 'procurement'` to a dedicated,
lazily loaded `ProcurementAppWorkspace`; the independent service keeps `ProcurementWorkspace`
unchanged. App navigation is registry driven: Purchase, Orders, Products, Reporting, Configuration.
The view is URL-backed (`?app=procurement&section=…&view=…`, plus `?doc=<type>:<id>`), so refresh,
Back/Forward and workspace changes restore the same purchasing screen. Procurement was added to
`appOwnedWorkspaces` so its Products/Reporting sidebar sections stay inside the installed app.

**Implemented purchasing interface.**

- Purchase dashboard: RFQ-first landing page with compact activity counters (new RFQs, accepted
  offers, awaiting approval, late receipts, confirmed orders), confirmed purchase value separated by
  currency, search, status filter, list/kanban, pagination and a dense RFQ table with vendor, buyer,
  source request, expected arrival, total, status and linked order. Counters are shortcuts into the
  relevant queue; unsupported counts are not invented.
- Orders: Purchase Requests, Requests for Quotation, Purchase Orders, Awaiting Approval, Receipts,
  Vendor Bills, Payment Observations, Supplier Credits and Vendors. Requests are visible as soon as
  they are approved so they can be offered to suppliers.
- RFQ document: backend-accurate pipeline, vendor context, metadata, editable-product requirements
  through the existing editor, version-bound Save/Revise, Send RFQ (marks the offer for supplier
  response without claiming email delivery), Preview, Accept, Cancel and Create purchase order from
  an accepted offer. Totals are integer minor units from canonical lines.
- Purchase order document: ordered/received/outstanding quantities, smart links to receipts and
  vendor bills, supplier confirmation, cancellation rules, revision history and attachments.
- Approvals: separate reviewer queue across requests, offers, orders, bills and credits; decision
  forms carry a reason and `expected_version`, and the backend still enforces that the current actor
  cannot approve their own request.
- Supplier comparison: multiple RFQs linked to one approved request are compared by product with
  vendor, unit price, quantity, tax, expected arrival and selection. There is no separate
  alternatives table and no automatic lowest-price selection.
- Vendors: canonical contact identity with purchasing terms, lead time, history and outstanding
  orders; no procurement-owned contact database.
- Products and replenishment: canonical product list with purchase history; inventory replenishment
  requirements reuse the existing Procurement replenishment component to create requests only.
- Reporting: purchase analysis, by vendor, by product, approval performance and receipt performance
  from loaded authoritative records, with explicit loaded-page coverage and separated currencies.
- Configuration: purchasing settings and approval rules described from backend policy; unsupported
  Odoo controls are listed rather than rendered as working settings.

**Authoritative workflow and integrations.** Request approval, offer acceptance, order approval,
issuing and supplier confirmation, receiving, supplier bills, credits and manual payments all use the
existing `/procurement` endpoints with `expected_version`. Order issue creates Inventory incoming
plans but no physical stock; receiving records accepted/rejected quantities against the order and
posts stock only for accepted tracked quantities. Multiple partial inspections are supported. Vendor
bills are validated against received quantities and create the canonical bill/credit/payment records
used by Accounting; Procurement does not create a second ledger. Payments are explicitly manual,
unverified observations and never claim bank settlement. No outbound email or supplier portal exists.

**Files.** `src/apps/catalog.ts`; `website/src/apps/ProcurementAppWorkspace.tsx` (new);
`website/src/apps/procurement-app-model.ts` (new); `website/src/apps/AppsWorkspace.tsx`;
`website/src/apps/lazy-workspaces.tsx`; `website/src/apps/ProcurementEditor.tsx`;
`website/src/workspace-navigation.ts`; `website/src/approved-platform.css`;
`website/tests/procurement-app.test.mjs` (new).

**Known limitations.** Vendor pricelists and purchase agreements have no backend model and are
explicitly unsupported. Supplier comparison uses multiple offers under one request rather than a
dedicated alternatives relation. Receipts are posted purchase-receipt inspections, not draft or
backorder documents. There is no automatic email/PO transmission, supplier portal, bank payment,
statutory filing or three-way matching beyond the backend's received-quantity bill validation.
Reports and counters cover the latest loaded page (50 records per register); averages and on-time
percentages appear only where derivable from loaded dates. Browser/visual acceptance was not
performed.

## Checkpoint 2.7 — Accounting app rebuild

The installed Accounting app previously rendered the same `AccountingWorkspace` used by the service.
The app is now a separate `AccountingAppWorkspace` with Odoo-style module navigation:
Dashboard, Customers, Vendors, Accounting, Review, Reporting, Configuration. The independent service
still opens its own journals workspace and remains usable without the app.

### Existing architecture and dependencies

The authoritative ledger is `src/erp/accounting.ts`: accounts, periods, journals, entries and lines
are stored in `ac_accounting_*` tables. Posted entries and lines are immutable at database-trigger
level, and posting requires a balanced entry plus an approved review of the exact version by a
different owner/administrator. Customer invoices come from the canonical Invoicing ledger; supplier
bills come from Procurement; payment evidence comes from Payments/Reconciliation. Accounting does not
create a second invoice, bill, payment or ledger.

| Area              | Existing authority         | Required configuration                          | App treatment                                             |
| ----------------- | -------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| Chart of Accounts | Accounting accounts        | Setup or an explicit account                    | List, search, create, edit, activate/deactivate           |
| Journals          | Accounting journals        | A journal code/name; type is derived            | List, create, edit; type/default accounts are not stored  |
| Journal entries   | Accounting entries/lines   | Open period, active journal and accounts        | Full-page document, balanced lines, review, post, reverse |
| Customer invoices | Invoicing records          | Invoicing service                               | Read-only canonical list and detail; opens Invoicing      |
| Vendor bills      | Procurement supplier bills | Procurement service                             | Read-only canonical list and detail; opens Procurement    |
| Payments          | Payments/Reconciliation    | Payment service                                 | Evidence list; links to canonical payment/reconciliation  |
| Reports           | Posted ledger              | Posted entries for the selected currency/period | P&L, balance sheet, trial balance, general ledger, aging  |

### Service gaps fixed

- Added `saveJournal` plus `POST /accounting/journals` and `PUT /accounting/journals/:id` so journals
  can be configured through the UI. Codes are unique per workspace/environment; updates use the
  journal version for optimistic concurrency and require finance authority.
- Added the journal `version` column with an additive `ALTER TABLE` guard for existing databases.
- Registered both journal routes in the ERP route-policy map so the workspace route guard accepts them.
- No ledger, invoice, bill or payment authority was duplicated.

### Screens and behavior

- **Dashboard:** journal cards derived from the real configured journals, with draft/posted counts and
  links; customer/vendor/accounting queues; recent entries. No invented balances or trends.
- **Customers:** canonical invoices with search/status filters, amounts, outstanding and a full-page
  invoice detail (lines, dates, totals, linked order). Credit notes and customer payments link to the
  canonical services instead of creating competing records.
- **Vendors:** canonical Procurement bills with a full-page detail (lines, ordered/received/billed
  quantities, totals). Payment records remain outside Accounting.
- **Accounting:** journal entry register and document, exact-version review request with a real
  reviewer selector, posting only with an unconsumed approval for the same version, and reversal drafts.
  Chart of Accounts and Journals provide inline create/edit forms with backend-required fields.
  Periods can be created and locked/reopened with a reason.
- **Review:** pending drafts, awaiting-review entries, unmatched payment evidence and closing checks.
- **Reporting:** period/currency report controls backed by `/accounting/report`; profit and loss,
  balance sheet with a visible balance check, trial balance totals, general ledger with account filter,
  and aged receivables/payables through the existing aging view.
- **Bank/Cash:** configured cash/bank journals and payment evidence; internal records only, with no
  live bank provider, statement import or externally verified balance.
- **Configuration:** existing setup/readiness workspace, accounts, journals, periods, tax codes and
  explicit unsupported-state notices.
- Readiness banners disclose a missing open period, a period that does not cover today, or inactive
  journals/accounts, with direct links to configuration. Journal entry creation remains server-validated.

### Form completeness audit

| Form                   | Required inputs                                | Option source                | Prerequisite handling                                                       | Ready                       |
| ---------------------- | ---------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| Account create/edit    | code, name, type                               | Local enums                  | Duplicate code and version errors surfaced                                  | Yes                         |
| Journal create/edit    | code, name, active                             | Local form                   | Duplicate code, version conflicts surfaced; type/default account not stored | Partial                     |
| Journal entry          | journal, date, currency, description, ≥2 lines | Configured journals/accounts | Missing period/accounts/journals banner; balanced total shown               | Yes, subject to open period |
| Posting                | exact entry version + approval                 | Business approvals           | Reviewer selector; no self-approval path                                    | Yes                         |
| Reversal               | date, reason                                   | Local form                   | Posted history stays immutable                                              | Yes                         |
| Period                 | name, start, end; lock reason                  | Local form                   | Reason required for state change                                            | Yes                         |
| Invoice/bill detail    | none (canonical records)                       | Invoicing/Procurement        | Read-only disclosure and service link                                       | Yes                         |
| Payment/reconciliation | none in Accounting                             | Payments/Reconciliation      | Links to the authoritative workspace                                        | Partial by design           |

### Verification

| Check                                                                                      | Result                                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `website: npm run typecheck`                                                               | Pass                                                        |
| `node --test tests/accounting-app.test.mjs`                                                | 7/7 pass                                                    |
| Accounting + Procurement + Inventory + Sales + Commerce + navigation + application-quality | 44/44 pass                                                  |
| Root `npm run lint`                                                                        | Pass (189 frontend modules, no static import cycles)        |
| Root `npm run build`                                                                       | Pass                                                        |
| `dist/__tests__/accounting.test.js`                                                        | 17/17 pass                                                  |
| `website: npm run build` (Vite, prerender 82 pages, content tests)                         | 107/107 pass                                                |
| Full backend regression `npm test`                                                         | 446 tests, 445 pass, 0 fail, 1 skipped (21 suites)          |
| `npm run validate:openapi`                                                                 | Pass: 59/59 mounted legacy operations documented            |
| `npm run validate:platform`                                                                | Pass: 430 workspace operations validated after regeneration |

### Limitations

- No live bank provider or statement import; no claimed external balance or external reconciliation.
- Reconciliation is handled by the canonical Payments/Reconciliation workspace, not a second matcher.
- Journal type and default accounts are derived from the journal code; the backend has no stored
  type/default-account/payment-method mapping.
- Vendor bills are created and approved in Procurement; Accounting is a payable view, not a duplicate
  bill editor. Invoices remain canonical Invoicing records.
- No automatic invoice/bill-to-journal posting screen; source-linked postings remain governed by the
  existing accounting source policy.
- No fiscal localization, eTIMS, withholding filing, cash-flow statement, statutory tax return or
  currency conversion.
- Reports use posted accrual entries only; general ledger pages 100 lines. Opening balances and
  posted-history immutability follow the existing policy.
- Visual fidelity is a source-level structural approximation of the eight references. No authenticated
  browser session or screenshot comparison was available in this session.

### Founder manual checklist

1. Open the installed Accounting app; confirm the journal dashboard differs from the independent
   Accounting service.
2. Review Dashboard cards and open a count-filtered list.
3. Open Chart of Accounts; create an account; confirm a duplicate code is rejected.
4. Open Journals; create a journal; confirm it appears in the journal-entry selector.
5. Create a period covering today; confirm the readiness warning clears.
6. Create a balanced journal entry; save, reopen and request review from a different owner/admin.
7. Post the exact approved version; confirm it appears in General Ledger and cannot be edited.
8. Open Customer invoices and a canonical invoice detail; confirm no second invoice is created.
9. Open Vendor bills and a bill detail; confirm the Procurement link and received/billed quantities.
10. Open Bank/Cash and Review; confirm payment evidence and the Reconciliation handoff.
11. Open Profit and Loss, Balance Sheet and Trial Balance; verify period/currency and totals.
12. Refresh and confirm persistence; test a read-only/non-finance role and a missing-period state.
13. Confirm the independent Accounting service still works.

### Status

Implemented and verified at engineering level. Manual browser, screenshot comparison, PostgreSQL and
physical-device acceptance were **not executed**. Checkpoint 2.8 POS is recorded below.

## Checkpoint 2.8 — POS app rebuild

### What was wrong

The installed POS app dispatched `app.id === 'pos'` to `<POSWorkspace embedded>`, the same register
management component the independent POS service renders. The app had no operational overview, no
register dashboard, no product grid, no cashier keypad, no dedicated payment screen and no Odoo-style
orders/reporting/configuration composition. `appOwnedWorkspaces` also omitted POS, so sidebar sections
such as Products could leave the installed app for a shared service tab.

### Boundary preserved

| Layer                    | Responsibility                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| POS service (`/pos/...`) | Registers, sessions, drawered cash, drafts, quotes, confirmation, receipts, handovers, cash/stock returns, daily report |
| Canonical services       | Products, Orders, Invoicing, Cash Flow, Customers, Inventory, Payments                                                  |
| Installed POS app        | Management workspace and cashier flow that coordinate the authoritative service APIs                                    |

No second transaction engine, stock authority, invoice ledger or payment processor was created.

### Backend read-projection corrections

- `src/pos/queries.ts` product listing now accepts `category` and returns the canonical category plus
  the available category list. Product images and per-location balances remain unavailable.
- Register sales now accept `q`, `from`, `to` and `state`, join the canonical customer and session, and
  expose `customer_name`, `cashier_id`, `session_status`, `payment_status`, `paid_minor`,
  `outstanding_minor` and `register_id`. Each invoice balance is read from the existing ledger.
- No POS mutation contract, transaction state machine or authorization rule was changed.

### Application composition

`POSAppWorkspace` renders five management sections:

1. **Dashboard** — readiness strip, register cards, real expected cash for open shifts, open/continue
   selling, counted opening dialog, manage-registers path.
2. **Orders** — register-scoped authoritative sales, state/date/search filters, true pagination, canonical
   customer/cashier/payment/handover columns, resume draft or open receipt.
3. **Products** — canonical product cards with category, price, unit and tracked flag; search and category
   filter; explicit note that images and per-location stock are not supplied.
4. **Reporting** — existing single-day register report enhanced with a top-product value chart.
5. **Configuration** — dependency status, register list and editor, grouped cash/payment/discount/tax/
   warehouse/location summary, and an explicit unsupported-capability list.

The cashier is an internal full-screen flow: two-panel basket/catalogue, quantity and discount keypad,
customer selector, authoritative quote review, separate payment screen, acknowledgement-gated
confirmation, receipt, handover and return actions. Cashier/session/register are URL-backed so refresh
and back/forward keep the current destination.

### Service dependency audit

| Dependency       | Actual behavior                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Products         | Required; canonical product search, price, unit and tracking flag                                                                                                                         |
| Orders           | Required; confirmed sale creates the canonical channel order                                                                                                                              |
| Invoicing        | Required; confirmed sale creates one issued invoice linked to the order                                                                                                                   |
| Cash Flow        | Required; recorded cash is a merchant-observed drawer movement, not bank settlement                                                                                                       |
| Customers        | Canonical walk-in/named customer is required by register/quote validation; the POS app reports this dependency and links to Customers, but the marketplace dependency list still omits it |
| Inventory        | Required for tracked products; warehouse/location must be configured and active; stock is checked on quote and dispatched through the canonical order flow                                |
| Payments         | Sandbox electronic intent only; a request is not confirmed collection                                                                                                                     |
| Business policy  | Sales discount ceiling is read authoritatively; the lower of register/policy ceiling applies                                                                                              |
| Team/permissions | Managers configure and close; cashiers may only use assigned registers and their own sessions                                                                                             |

### Form completeness

| Action                 | Required fields and resolved dependencies                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create/revise register | Name, currency, timezone, tax, canonical customer, ≥1 payment intent, cashier/manager members, discount ceilings, acknowledgements; warehouse/location only when Inventory is active |
| Open shift             | Register version, opening cash, note, counted-cash acknowledgement                                                                                                                   |
| Save draft             | Open session, version, customer, ≥1 eligible product line, non-negative discount                                                                                                     |
| Review quote           | Current session version; server validates products, tracked availability, discount ceiling, tax and totals                                                                           |
| Confirm sale           | Exact quote hash, payment intent, tenders/acknowledgements, optional handover; backend rejects stale/duplicate requests                                                              |
| Record cash / close    | Manager authority, open session, exact version, counted cash, variance reason                                                                                                        |
| Cash return            | Original cash receipt, manager, open original session, amount not exceeding remaining cash                                                                                           |
| Stock return           | Original dispatch, manager, Inventory/warehouse, remaining quantity                                                                                                                  |
| Drawer adjustment      | Manager, direction, amount, reason, physical-cash acknowledgement                                                                                                                    |

Warehouse requests show their error and a Retry action; they are not converted into an empty list.
Register submit validates at least one enabled intent and cashier ceiling ≤ manager ceiling before
posting. Closing and receipt actions surface backend errors rather than generic success.

### Files

- New: `website/src/pos/pos-app-model.ts`, `POSAppWorkspace.tsx`, `POSAppDashboard.tsx`,
  `POSAppOrders.tsx`, `POSAppProducts.tsx`, `POSAppReporting.tsx`, `POSAppConfiguration.tsx`,
  `POSCashier.tsx`, `pos-app.css`, `website/tests/pos-app.test.mjs`.
- Modified: `src/pos/queries.ts`, `src/apps/catalog.ts`, `website/src/apps/AppsWorkspace.tsx`,
  `website/src/apps/lazy-workspaces.tsx`, `website/src/workspace-navigation.ts`,
  `website/src/pos/POSCounter.tsx`, `POSDailyReport.tsx`, `POSRegisterEditor.tsx`, `pos.css`.
- The independent service keeps `POSWorkspace`; its counter now delegates to the shared `POSCashier`.

### Verification

| Check                                                                                                         | Result                                               |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `website: npm run typecheck`                                                                                  | Pass                                                 |
| `node --test tests/pos-app.test.mjs`                                                                          | 6/6 pass                                             |
| POS + Accounting + Procurement + Inventory + Sales + Commerce + navigation + application-quality + app-intent | 52/52 pass                                           |
| Root `npm run lint`                                                                                           | Pass (197 frontend modules, no static import cycles) |
| `npm run clean:test && npm run build`                                                                         | Pass                                                 |
| Backend `pos-registers`, `pos-settlement` suites                                                              | 21/21 pass                                           |
| `website: npm run build`                                                                                      | See the checkpoint verification row below            |

### Limitations and unsupported capability

- No live card terminal, M-Pesa or Daraja collection. `daraja_sandbox` remains rejected by the backend
  until separately qualified; sandbox electronic requests are not confirmed money.
- No offline queue, automatic drawer, customer display, scales, restaurant tables or live printer driver.
- Browser printing uses the system print dialog. No hardware printer integration is claimed.
- Reporting is a single register-local day; multi-day ranges, cashier comparison and provider settlement
  totals are not supplied by the authoritative report.
- Orders and products are register-scoped and paginated; no all-register aggregate is presented as a
  business total.
- Product images and per-location stock are not exposed by the POS read projection.
- The POS service dependency list omits Customers even though register/quote validation requires a
  canonical customer; the app reports and explains the dependency instead of auto-provisioning it.
- Browser click-through and screenshot comparison against the nine Odoo references were not executed.

### Founder manual checklist

1. Install POS; open the dashboard and compare register cards with Image 1.
2. Create a register using a real canonical customer, cashier/manager, cash and sandbox electronic;
   configure Inventory/warehouse only when tracked products are used.
3. Open a counted shift; compare the dialog with Image 2.
4. Add products, adjust quantity with the keypad, apply a permitted discount and review totals.
5. Compare the cashier layout with Image 3; confirm basket left, catalogue right and keypad behavior.
6. Open Payment; compare with Image 4; test cash, split, pending and sandbox electronic states.
7. Confirm a sale; compare receipt with Image 5; print and start a new order.
8. Search the sale in Orders; reopen receipt, invoice/order links and returns.
9. Close the shift; compare with Image 6; verify variance reason and that new sales are rejected.
10. Compare Orders with Image 7, Reporting with Image 8 and Configuration with Image 9.
11. Refresh the cashier URL and confirm the open session/destination persists.
12. Test an unauthorized cashier, an inactive required service, missing warehouse and stale version.

### Status

Implemented and automatically verified. Manual browser, screenshot comparison, PostgreSQL and
physical-device acceptance were **not executed**. The next application has not been started.

## Verification

| Check                                                                                                         | Result                                                              |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `website: npm run typecheck`                                                                                  | Pass                                                                |
| `website: node --test tests/sales-app.test.mjs`                                                               | 6/6 pass                                                            |
| `website: npm run build` (tsc, Vite 492 modules, prerender 82 pages, content tests)                           | 87/87 pass                                                          |
| Root `npm run lint`                                                                                           | Pass (181 frontend modules, no static import cycles)                |
| Root `npm run build`                                                                                          | Pass                                                                |
| Backend `business-app-workflows`, `financial-operations` suites                                               | 52/52 pass                                                          |
| `website/src/apps/sales-app-model.ts` money/quantity tests                                                    | Exact integer minor-unit totals, tax rounding, discounts and paging |
| Inventory: `website: npm run typecheck`                                                                       | Pass                                                                |
| Inventory: `node --test tests/inventory-app.test.mjs`                                                         | 6/6 pass                                                            |
| Inventory + Sales + Commerce + navigation + application-quality tests                                         | 30/30 pass                                                          |
| Inventory: `website: npm run build` (Vite 494 modules, prerender 82 pages, content tests)                     | 93/93 pass                                                          |
| Inventory: Root `npm run lint`                                                                                | Pass (183 frontend modules, no static import cycles)                |
| Inventory: Root `npm run build`                                                                               | Pass                                                                |
| Inventory: backend `business-app-workflows`, `app-installations`, `marketplace` suites                        | 47/47 pass                                                          |
| Full backend regression `npm test`                                                                            | 435 tests, 434 pass, 0 fail, 1 skipped (21 suites)                  |
| Procurement: `website: npm run typecheck`                                                                     | Pass                                                                |
| Procurement: `node --test tests/procurement-app.test.mjs`                                                     | 7/7 pass                                                            |
| Procurement + Inventory + Sales + Commerce + navigation + application-quality                                 | 37/37 pass                                                          |
| Procurement: `website: npm run build` (Vite 498 modules, prerender 82 pages, content tests)                   | 100/100 pass                                                        |
| Procurement: Root `npm run lint`                                                                              | Pass (187 frontend modules, no static import cycles)                |
| Procurement: Root `npm run build`                                                                             | Pass                                                                |
| Procurement: backend `procurement`, `app-installations` suites                                                | 17/17 pass                                                          |
| Accounting: `website: npm run typecheck`                                                                      | Pass                                                                |
| Accounting: `node --test tests/accounting-app.test.mjs`                                                       | 7/7 pass                                                            |
| Accounting: `website: npm run build` (prerender 82 pages, content tests)                                      | 107/107 pass                                                        |
| Accounting: Root `npm run lint`                                                                               | Pass (189 frontend modules, no static import cycles)                |
| Accounting: backend full regression                                                                           | 446 tests, 445 pass, 0 fail, 1 skipped                              |
| Accounting: `validate:openapi` / `validate:platform`                                                          | 59/59 operations / 430 workspace operations                         |
| POS: `website: npm run typecheck`                                                                             | Pass                                                                |
| POS: `node --test tests/pos-app.test.mjs`                                                                     | 6/6 pass                                                            |
| POS + Accounting + Procurement + Inventory + Sales + Commerce + navigation + application-quality + app-intent | 52/52 pass                                                          |
| POS: Root `npm run lint`                                                                                      | Pass (197 frontend modules, no static import cycles)                |
| POS: backend `pos-registers`, `pos-settlement`                                                                | 21/21 pass                                                          |
| POS: `website: npm run build` (Vite 509 modules, prerender 82 pages, content tests)                           | 113/113 pass                                                        |

Browser click-through: **not executed**. No authenticated local workspace/browser control is
available to this session; demo mode has no `/apps` transport, so it cannot install the app.
Do not present screenshots or live-flow evidence as completed.

## Phase 2 application matrix (working assessment)

| App         | Required services                                                              | Current app screen                                                                                                       | Duplication / gap                                                                      | Target next action                                                                                                          |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Commerce    | products, commerce, orders, invoicing, payments                                | Dedicated merchant workspace (new)                                                                                       | Service editor intentionally separate                                                  | Verify with an installed app and browser session                                                                            |
| Finance     | invoicing, expenses, cash_flow                                                 | `FinanceDashboard`; nav mirrors service tabs                                                                             | High: Invoices/Payments/Expenses/Reconciliation open service views                     | Operational finance overview; keep record detail shared                                                                     |
| Sales       | customers, products, sales, orders, invoicing, fulfillment                     | Dedicated Odoo-style sales workspace (new)                                                                               | Service editor remains separate                                                        | Verify with an installed app and browser session                                                                            |
| Inventory   | products, inventory                                                            | Dedicated Odoo-style warehouse workspace (new)                                                                           | Service register remains independent; no document/draft states invented                | Verify operation cards and receipts/deliveries with an installed app                                                        |
| CRM         | customers, crm                                                                 | `CrmWorkspace`                                                                                                           | Medium: pipeline exists; Customers duplicates service                                  | Pipeline-first composition, shared customer detail                                                                          |
| Procurement | customers, products, procurement (+ inventory, accounting, documents)          | Dedicated Odoo-style purchasing workspace (new)                                                                          | Service register remains independent; vendor pricing/agreements unsupported by backend | Verify RFQ → approval → order → receipt → bill flow with an installed app                                                   |
| Accounting  | accounting                                                                     | Dedicated Odoo-style ledger workspace (new)                                                                              | Service journals screen remains independent; no second ledger                          | Verify forms and reports in an installed browser session                                                                    |
| POS         | products, orders, invoicing, cash_flow, pos (+ customers, inventory, payments) | Dedicated Odoo-style POS workspace (new): dashboard, orders, products, reporting, configuration, cashier/payment/receipt | Service register remains independent; cashier flow is shared                           | Verify register setup, counted shift, sale, receipt, return, close and nine-screen fidelity in an installed browser session |
| Work        | work                                                                           | `WorkWorkspace`                                                                                                          | High                                                                                   | Portfolio/board composition distinct from project service                                                                   |
| People      | people                                                                         | `PeopleWorkspace`                                                                                                        | High                                                                                   | HR overview; preserve private access rules                                                                                  |
| Documents   | documents                                                                      | `DocumentsWorkspace`                                                                                                     | High                                                                                   | File manager is legitimate app workspace; distinguish service access                                                        |
| Analytics   | intelligence (+ forecasting)                                                   | `AnalyticsWorkspace`                                                                                                     | Low-medium: already app-shaped                                                         | Confirm coverage/unsupported measures                                                                                       |
| Automations | automations                                                                    | `AutomationsWorkspace`                                                                                                   | Medium                                                                                 | Run/exception overview distinct from rule editor                                                                            |
| Business ID | passport, verification, credentials, trust_network (+ blockchain)              | `BusinessIDWorkspace` wraps `PassportWorkspace` sections                                                                 | High: same trust workspace under app identity                                          | Identity/evidence overview with app workflow; retain trust detail                                                           |

## Service-overlap register (deferred)

- `verification` vs `credentials` vs `blockchain` vs `verification_api`: shared trust evidence and
  verification paths, different authority/qualification. Do not merge in Phase 2.
- `orders` vs `sales` vs `fulfillment`: canonical order records with distinct lifecycle stages.
- `payments` vs `reconciliation` vs `cash_flow`: evidence, matching and movement are separate facts.
- `invoicing` vs `accounting`: source documents vs reviewed double-entry posting.
- No merge, rename, deletion or deprecation is authorized in Phase 2.

## Next step

The preceding next-step note records the plan at the time it was written. Checkpoint 2.11 Documents is
now recorded at the end of this file. Founder acceptance remains pending; do not start Phase 2.12 or
modify `odoo-reference` as part of this checkpoint.

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

## Work Phase 2.9 — implementation and focused verification, 15 November 2026

Work remains an installed application over the canonical Work service, encrypted ERP records, current workspace membership and project grants. Existing project/task mutation, review, template, workflow and document services were reused. No parallel project store, customer register, financial workflow or file store was introduced.

The application now provides the two-column Projects directory, project search/status/owner filters and grouping, card/register modes, authoritative task totals, participant initials, horizontal task stages, stage quick creation, priority and labels, drag/drop plus accessible movement and ordering, full-page task documents, and a dense sortable/groupable/paged task register. Task documents preserve descriptions, parents, dependencies, checklists, subtasks, followers, discussions, attachments and paginated revisions. Project settings provide members, owner, status, deadline, stages and milestones in a full-page form. Used stages cannot be removed or reclassified, and the final complete/incomplete category is protected.

Calendar uses recorded starts, deadlines and milestones. Timeline provides a real date grid, date-span bars, milestone positions, day/week/month scale, previous/next/Today and task opening. Task analysis provides graph/table modes, measures (count, open, completed, overdue, estimated minutes), stage/assignee/priority grouping, recorded-deadline filters, completion rate and milestone states. Workload uses real project assignments. Project and task URLs support refresh and browser history; selected view is retained. Financial and customer links open their existing canonical record screens.

Dependency fixes: project reads no longer depend on Team success; templates and Sales sources load independently; attachment reads survive a document-chooser failure. Missing member data has retry and restricts member-dependent creation. Member search preserves selected values. Customer/order fields use searchable readable canonical selectors, retain existing links if lookup fails, clear an order when its customer changes and expose service availability. Predecessor selection uses a searchable checked-row dialog and detects mixed parent/dependency cycles; parent choices also prevent completion deadlocks. Rejected moves roll back and retain their error message. Task saves reopen the authoritative saved task. Backend authorization, version conflicts, idempotency and completion checks remain mandatory.

Backend additions: authorized project-directory aggregates for total/open/completed/overdue tasks; validated discussion page offset on the existing project GET; bounded SQL message pages with current project ACL; separate task-coverage flag so older discussions do not incorrectly invalidate task reporting. No schema migration or service entitlement change was required. The task graph remains bounded to 1,000 and the directory to 1,000; coverage is disclosed. Message and task revision history load in pages of 100. Customer/order lookup discloses its 100-record matching limit; document choices retain the existing 50-record limit.

| Dependency         | Actual integration and failure behavior                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Work               | Canonical project/task/stage/milestone/message/history APIs; scoped grants and expected versions; no client-side authority                      |
| Team/identity      | Current owner, participants, assignee, follower, mention and separate-reviewer choices; role/project eligibility; independent load and retry    |
| Customers          | Searchable authorized customer records; canonical ID persisted; optional link retained on service error                                         |
| Sales/Orders       | Searchable customer-consistent order links and canonical navigation; existing separately reviewed Sales-source templates                        |
| Documents          | Existing authorized attachment read/link/upload and document viewer; private permissions retained; service-availability explanation             |
| Business approvals | Existing exact-version request/decision/reason/history; separate reviewer required; no self-approval shortcut                                   |
| Automations        | Existing policy configuration, service/readiness state, separate policy review and paginated run history; inactive service does not block board |
| Notifications      | Existing permitted Work workflow/mention notification infrastructure; no invented email or push delivery                                        |
| Reporting          | Authorized loaded task graph plus directory SQL aggregates; explicit bounded coverage and planned-effort labels                                 |

Form-completeness audit:

| Form                     | Supplied contract and usable prerequisites                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project create/edit      | Name, owner, current eligible members/permissions, stable stages, status, deadline, milestones, canonical optional customer/order; expected version for update           |
| Task create/edit         | Title, stage, eligible assignee/followers, description, dates, priority, labels, estimate, parent, predecessor IDs, checklist; expected version; ordered date validation |
| Dependency selection     | Real same-project tasks, staged selection/removal, readable assignee/stage/status/date, mixed-cycle checks; persisted by task mutation                                   |
| Subtask/checklist        | Existing parent linkage and checklist IDs/completion; backend rejects incomplete parent completion                                                                       |
| Milestones               | Stable ID, name, due date, completed state through versioned project settings                                                                                            |
| Discussion/reply/mention | Existing task/thread/member selectors and persistent Work message API; older-history navigation                                                                          |
| Documents                | Authorized document selection or existing private uploader, canonical source kind/ID and current file rights                                                             |
| Review                   | Current project version and separate eligible reviewer; decision/reason through shared approvals; missing reviewer explained                                             |
| Workflow                 | Current project/policy version, supported completion recipe, eligibility filters, service readiness, independent review and execution history                            |
| Sales-source project     | Existing approved template/source selection, required owner/participants and idempotent source conversion; missing prerequisites explained                               |

Focused verification: isolated SQLite integration passed **61/61** across Work, business-app workflows and workspace experiences. Work tests cover current membership/grants, private projects, assignee/date/dependency validation, optimistic concurrency, subtasks/checklists, retained history, threaded discussion/mentions, deactivation, exact reviews, Sales-template conversion and approved workflow fences. Added coverage checks authoritative directory counts, discussion access and history beyond 100 messages. Frontend tests additionally cover mixed cycles, cancelled subtasks, quick filters and independent directory loading with Team failure/retry. Build, lint and contract results are recorded below after final execution.

Running-screen comparison used a disposable synthetic local SQLite workspace in the isolated in-app browser. Compared all eight corresponding structures: (1) two-column project cards, (2) horizontal Kanban with compact actions, (3) full-page task sheet and tabs, (4) dense task register, (5) wide searchable predecessor dialog with lower-left actions, (6) date-grid timeline, (7) grouped project settings/stages/milestones, and (8) measures/grouping/chart/table analysis. The comparisons exposed excess board administration panels, a short dependency dialog, hidden record-save return and overwritten failure feedback; these were corrected. The existing global shell, AfriCore typography/green controls, real fields and permissions intentionally remain. Configuration exposes actual supported settings rather than copying Odoo billing/recurrence toggles. Reporting uses present-state task counts rather than fabricating historical burndown points. This is running-screen engineering comparison, not a claim of pixel identity or founder acceptance.

Browser flows exercised project creation with a selectable current owner, task editing and return to the saved record, persisted predecessor selection, rejected blocked completion, milestone completion reflected in scheduling/reporting, task opening from timeline, Documents capability controls and refresh of a selected task. Final responsive and navigation checks are recorded below. Approval, Sales-source and workflow failure/security paths were exercised by integration tests; comprehensive browser acceptance of those paths remains the founder's checklist, not a fabricated test claim.

Unsupported by the current authoritative model: actual timesheets/time spent, task billing/invoice/report signing, automatic recurring tasks, automatic schedule changes, historical burndown reconstruction, map routes, external email/push delivery, document unlink where no API exists, and graphical dependency connectors. No enabled decorative controls advertise those actions. Project milestones are project records; task-to-milestone assignment is not represented by the current task schema. Estimated effort and checklist completion remain distinct from recorded time. Offset discussion history is bounded to the supported 100,000 offset and can shift if new messages arrive between page reads; duplicate IDs are merged in the client.

Files: `src/erp/work.ts`, `src/erp/store.ts`, `src/erp/routes.ts`, `src/__tests__/work.test.ts`; `website/src/apps/WorkWorkspace.tsx`, `WorkEditors.tsx`, `WorkTaskDetails.tsx`, `WorkTaskTable.tsx`, `WorkDateViews.tsx`, `WorkDependencyPicker.tsx`, `WorkRecordLinks.tsx`, `work-app-model.ts`, `WorkReviews.tsx`, `WorkTemplates.tsx`, `DocumentAttachments.tsx`, `AppsWorkspace.tsx`; `website/src/BusinessApp.tsx`, `website/src/approved-platform.css`, `website/tests/work-app.test.mjs`, and this report.

Founder manual acceptance checklist:

1. Open Work and compare Projects to Image 1; search, group, filter and switch register/cards.
2. Create a project, choose owner/members and refresh; verify private access with another account.
3. Edit settings/stages/deadline/customer/order and confirm canonical linked-record navigation.
4. Create/assign/date/prioritize/tag tasks; refresh and compare board to Image 2.
5. Drag and reorder tasks, then use the keyboard-accessible stage actions; test stale edits.
6. Open the full task document and compare Image 3; inspect every information tab and retained history.
7. Create a subtask/checklist and test completion constraints, predecessor selection/removal/cycle rejection against Image 5.
8. Compare list/grouping/sorting/pagination to Image 4 and exercise overdue/unassigned/blocked/week filters.
9. Inspect calendar dates and open a task; compare timeline to Image 6 and test all scales/navigation.
10. Save milestone dates/completion and compare project configuration to Image 7.
11. Post/reply/mention and refresh discussion; load earlier messages.
12. Link/upload/open authorized documents; verify unrelated private documents remain inaccessible.
13. Request a separate review, approve/reject with reason and test stale snapshots.
14. Configure/review/run supported workflows; inspect inactive-service and blocked execution states.
15. Create from an eligible Sales source and separately reviewed template; test duplicate protection.
16. Compare reporting to Image 8, switch graph/table/measures/grouping and reconcile against real tasks.
17. Test browser Back/Forward/refresh and narrow-screen layouts; verify no lost edits on error.

Status: supported Phase 2.9 implementation is ready for founder review after the final checks below. Unsupported capabilities are explicitly separated above. No commit, push, deployment, production records or live notifications were performed. At the time of this historical Work report, People was the next checkpoint.

Final verification: backend production build passed; isolated focused integration **61/61** passed (the sandbox initially denied loopback connections; the same disposable tests passed with localhost access). Website production build and frontend/content tests **117/117** passed. Lint, architecture/import isolation, `git diff --check`, development configuration **3/3**, and API registration validation **430 operations** passed. No PostgreSQL/physical-device or exhaustive browser acceptance is claimed. The tested board had no document-wide horizontal overflow at requested 390, 768, 1280 and 1440 widths; horizontal board scrolling stays inside the board. Refresh retained both selected task and reporting view. A final board screenshot is retained locally in `.tmp/work-final-board.jpg`; it contains only synthetic fixture records. The isolated server was stopped. All edits remain uncommitted for founder review.

## Checkpoint 2.10 — People Odoo reference and dependency repair, 16 November 2026

The Phase 2.9 Work implementation and its completion report are recorded above; the original checkpoint table was stale and has been corrected. Founder acceptance of Work remains pending. This prompt explicitly starts the People checkpoint; Documents and later apps have not been started.

### Odoo Community reference

Focused read-only study at Odoo `20.0`, commit `9d233dca4156d58ca573e9cdc3b32327c97aa282`: `addons/hr` (employee/department), `addons/hr_attendance` (attendance validation), and `addons/hr_holidays` (leave and approval states). Odoo Employee and Attendance manifests are LGPL-3. Model paths and observed validation/state behavior are indexed in `docs/odoo-reference/notes/hr.md` and `docs/odoo-reference/RESEARCH_LOG.md`. No Odoo code/assets were copied; no Odoo files changed.

### AfriCore findings and parity

People already has dedicated employee, department, org-chart, onboarding, policy, leave, balance, approval, attendance, correction, compensation privacy and reporting flows. Authoritative services are `src/erp/people-profiles.ts`, `people-access.ts`, `people-leave.ts`, `people-attendance.ts`, `people-contracts.ts`, and `people-reports.ts`; routes are in `src/erp/routes.ts`. UI flows live in `PeopleWorkspace.tsx`, `PeopleEditors.tsx`, `PeopleManagement.tsx`, `PeopleRecordActions.tsx`, and `PeopleReports.tsx`. Service tests are in `src/__tests__/people.test.ts`. The People service, not Odoo, remains the authorization and business-rule authority. Payroll and statutory deductions are not supported or represented as calculated.

| Feature                                    | Odoo source                                                                        | AfriCore implementation                                                              | Status / gap                                                                                | Priority |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------- |
| Employee profile, department and hierarchy | `addons/hr/models/hr_employee.py`, `hr_department.py`                              | `people-profiles.ts`, private employee directory and organization chart              | Existing; founder role/browser acceptance pending                                           | High     |
| HR privacy and manager visibility          | HR manifest/security and employee field groups                                     | `people-access.ts`, scoped projections and current-member checks                     | Existing service fences; test cross-role boundaries                                         | Critical |
| Leave request, balance and approvals       | `addons/hr_holidays/models/hr_leave.py` state transitions and validation           | `people-leave.ts`, policy versioning, integer-milli ledger and separate exact review | Existing; no statutory entitlement assumed                                                  | Critical |
| Attendance interval and correction         | `addons/hr_attendance/models/hr_attendance.py` date/order/open/overlap constraints | `people-attendance.ts`, overlap validation and reasoned retained corrections         | Existing; no location or biometric claim                                                    | High     |
| Auxiliary service failure                  | Odoo integrated addon registry                                                     | Independently loaded People/team/approval sources                                    | Fixed here; per-source errors and People data retry, including policy load failure recovery | High     |
| Payroll/work-entry calculations            | Separate Odoo dependencies/addons                                                  | No AfriCore payroll service                                                          | Unsupported and disclosed                                                                   | Low      |

### Change in this increment

`PeopleWorkspace.tsx` no longer uses one all-or-nothing `Promise.all` for configuration, employees, Team, departments, leave types, leave requests, attendance and approvals. Each response is applied independently. Employee detail, leave balances and restricted compensation also load independently. Failures stay visible with their source name and a People data retry; policy failure has a retry path instead of an endless initial spinner. Permission errors and backend validation remain unchanged.

Changed files for this checkpoint: `website/src/apps/PeopleWorkspace.tsx`; `docs/PHASE2_APP_PROGRESS.md`; `docs/odoo-reference/RESEARCH_LOG.md`; `docs/odoo-reference/MODULES.md`; new `docs/odoo-reference/notes/hr.md`. Existing unrelated uncommitted Work, workspace and documentation changes were preserved.

### Verification and completion

The People frontend typecheck and production build completed; the build's content/frontend suite passed **117/117**. The focused backend People integration suite passed **9/9** against disposable test data. Backend production build and repository lint, architecture and import-isolation checks passed. `git diff --check` passed (Git emitted only its standard working-copy LF-to-CRLF notices). The detail-panel regression was also repaired so balance-read failure cannot suppress an authorized compensation read. No visual browser comparison was performed; there was no People-specific approved screenshot in this checkpoint's attachments, and founder browser/role acceptance remains pending.

Checkpoint status: implementation and engineering checks complete for the audited People functionality and source-loading recovery. Existing People records, policy, directory, leave, approval, attendance, correction, compensation privacy and reports continue to use their existing canonical services; no parallel business model was added. No migration, production records, deployment, commit or push. This report records the completed checkpoint and stops here as instructed; Documents has not been started.

## Checkpoint 2.11 — Documents implementation and verification, 16 November 2026

### Architecture findings and Odoo comparison

AfriCore Documents is a dedicated installed application over the existing `documents` service, not a
second storage authority. `website/src/apps/DocumentsWorkspace.tsx` owns the file browser, folder
navigation, details panel, preview, configuration, request/review sections and file actions. The
authoritative data and policy live in `src/erp/documents.ts`, `documents-access.ts`,
`documents-contracts.ts`, `document-links.ts`, `document-requests.ts`, and `document-reviews.ts`;
route and capability declarations are in `src/erp/routes.ts` and `src/erp/metadata.ts`. Content is
encrypted and retained in the existing document blob/version tables, with grants, usage limits,
audit events, optimistic versions and idempotent operations enforced server-side.

Odoo 20's official Documents documentation describes a left tree for All, Company, My Drive, Shared
with me, Recent and Trash, folder/file views, preview actions, sharing, version management, request
reminders and centralization settings. The supplied images show those structures. AfriCore now uses
the same recognizable three-region workspace: workspace sections at left, searchable grid/list in
the center, and file properties/activity at right, with modal preview, sharing and request flows.
AfriCore retains its own shell, palette, labels, services and authorization. It does not copy Odoo
code, logos or proprietary assets, and intentionally does not reproduce unsafe public sharing or
unsupported Odoo operations. The reference page is [Odoo 20 Documents documentation](https://www.odoo.com/documentation/20.0/applications/productivity/documents.html).

### Dependency and integration matrix

| Dependency                        | Actual dependency and behavior                                                                                                                                                                              | Status                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Documents service and storage     | Encrypted private file/version storage, current grants, quota accounting, audit, idempotency and expected-version contracts; deactivation stops new writes while authorized retained reads remain available | Implemented and covered by focused backend tests                                                               |
| Workspace identity and Team       | Current member names, recipient search, permission gates and server-side membership rechecks; file directory, member names and record sources load independently with visible retry/error states            | Server endpoint is implemented and integration-tested; the current local browser server returned `Resource not found` for this new route, so recipient loading needs runtime verification after the API process is refreshed |
| Folder service                    | Authorized server-paged folder options, parent/child paths, explicit inherited access and matching personnel classification                                                                                 | Implemented and covered by folder permission tests                                                             |
| Business approvals                | Exact retained document version, separate eligible reviewer, durable decision and reason; changed file revisions invalidate an earlier decision                                                             | Implemented and covered by focused backend tests                                                               |
| People                            | Employee classification, People service and HR/self-service checks are evaluated alongside document rights on each relevant read/write                                                                      | Implemented; cross-role acceptance remains manual                                                              |
| Work                              | Canonical project/task source checks, existing private file grants and task/project navigation                                                                                                              | Implemented; Work regression suite passes                                                                      |
| Sales and Orders                  | Canonical quotation (`ac_sales_quotes`) and order (`ac_records`, kind `orders`) selectors and attachment panels; current Sales/Orders service and operational authority are required                        | Implemented in this checkpoint; covered by the Documents integration suite                                     |
| Procurement                       | Canonical purchase-order and supplier-bill sources; financial source access remains separate; supported order/bill panels use the existing Procurement workspace                                            | Implemented; upload into these screens remains disabled where the panel only supports linking an existing file |
| Accounting / Invoicing            | Canonical invoice relationship and invoice detail attachment panel; financial role plus Invoicing service are independently required                                                                        | Implemented; invoice source access is covered by existing security tests                                       |
| Expenses                          | Receipt/supporting files attach through the existing Expenses service; Documents and financial source rights are rechecked                                                                                  | Implemented and covered by cross-app permission tests                                                          |
| Customers                         | Canonical customer relationship and readable customer selector; a linked file retains its own grants                                                                                                        | Implemented in the customer record detail workflow                                                             |
| Business ID                       | Supplemental verification-document links are kept separate from primary Trust evidence and never raise identity assurance                                                                                   | Implemented in the Trust/Passport workspace                                                                    |
| Notifications                     | Requests notify through existing in-app notification infrastructure; there is no outbound email claim                                                                                                       | Implemented for in-app notifications; email is unsupported                                                     |
| API body parsing and file storage | Route-specific Base64 JSON allowance is 4 MiB to admit a 2 MiB file; unrelated application routes retain the 1 MiB JSON limit                                                                               | Implemented; streaming uploads remain a dependency for larger files                                            |

### Defects investigated and changes completed

| Defect or workflow                                   | Change and evidence                                                                                                                                                                                                                                                                               | State                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Coupled Team/folder reads                            | Independent reads retain their own loading, error and retry state; one failed source no longer hides the other                                                                                                                                                                                    | Implemented; typecheck/build and UI behavior checks pass                                                                             |
| Incomplete folder discovery                          | Folder pickers search and page authorized folders, show readable hierarchy, filter destination type/classification, and submit canonical IDs                                                                                                                                                      | Implemented; backend checks destination access and prevents cycles/classification changes                                            |
| Incomplete existing-file selection                   | Cross-app attachment picker searches the editable authorized file window and pages results; it is not offered after source access fails                                                                                                                                                           | Implemented; Work/Documents integration coverage passes                                                                              |
| Missing inline PDF preview                           | Authorized content is fetched through the protected endpoint and rendered in the preview dialog; image and UTF-8 text previews are also supported                                                                                                                                                 | Implemented; actual file preview awaits populated local data/manual acceptance                                                       |
| Small uploads                                        | The existing bounded 2 MiB per-file and 50 MiB retained workspace limits are disclosed and consistently enforced. They were not raised because the current Base64 JSON, full-buffer validation/encryption path has no streaming backpressure; larger limits would multiply request and memory use | Partially implemented; safe larger upload architecture remains outstanding                                                           |
| Upload destination                                   | Create/upload form exposes authorized destination folder and classification; backend validates the target and effective access                                                                                                                                                                    | Implemented and covered by folder tests                                                                                              |
| Raw source UUID inputs                               | Request and link workflows use server-searched readable records. The selector supports customer, invoice, Sales quotation/order, expense, purchase order, supplier bill, employee, Work task and verification review sources                                                                      | Implemented; source authorization and Sales attachment paths are tested                                                              |
| Candidate coverage                                   | Directory, source and member lookups search server-side before paging; pages contain 50 items and bounded 5,000-candidate windows disclose truncation                                                                                                                                             | Implemented with explicit coverage notices; very large workspaces remain bounded                                                     |
| Malware and physical deletion                        | Configuration and file details state no malware scan; trash is recoverable and retained blobs/versions count toward quota; no permanent-delete control was added                                                                                                                                  | Implemented honestly; external scanning and physical erase are unsupported                                                           |
| Sensitive source access                              | Personnel, financial and Sales links are rechecked against current People/financial/Sales roles and services. Sharing a record never creates file access. File grants, download rights and expiry remain independent                                                                              | Implemented and covered by security regression tests                                                                                 |
| Request recipient could select self/ineligible users | Added `GET /document-request-assignees`: filters the current requester, current membership, operational role, selected source rights and destination folder rights. Request creation revalidates all conditions                                                                                   | Backend integration test verifies requester/viewer exclusion, pagination metadata and eligible recipients; live UI currently receives `Resource not found` from the running API instance               |
| Sales attachments absent                             | Added canonical `sales_quotation` and `sales_order` source kinds, read-time source permission checks, searchable selectors, request choices and attachment panels                                                                                                                                 | Implemented; quote/order creation, linking, listing and explicit-file-grant/source-access boundary pass focused integration coverage |
| Trash displayed create/drop controls                 | Upload, folder creation and drag/drop are disabled in Trash; the empty message describes recoverable retention                                                                                                                                                                                    | Implemented; manually inspected in the local browser                                                                                 |
| Duplicate current folder in sidebar                  | The active folder is omitted from the root quick list when already present in the path                                                                                                                                                                                                            | Implemented; manually inspected in the local browser                                                                                 |

### Screen and feature status

| Screen or feature                  | AfriCore implementation                                                                                                                                      | Status / verification                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Image 1 — main Documents workspace | AfriCore app shell, toolbar/search, folder/workspace tree, document browser, view controls and optional detail panel                                         | Implemented. Live empty-state structure was compared; live workspace had no files to compare populated tiles              |
| Image 2 — grid                     | Folder and file cards, metadata, selectable items, quick actions, folder breadcrumbs and paging                                                              | Implemented and frontend build-tested. Populated file cards were not available for live visual comparison                 |
| Image 3 — list                     | Server-backed sortable/searchable rows, selection, metadata and paging                                                                                       | Implemented and frontend build-tested. Live list was empty; populated row proportions remain founder acceptance           |
| Image 4 — preview                  | Protected PDF iframe, bounded image preview, text preview, safe unsupported-type message, metadata/activity and authorized download                          | Implemented. A real PDF/image/text file was not available for live preview verification                                   |
| Image 5 — actions                  | Rename/description/tags, move, duplicate, star, download, versions, share and recoverable trash/restore use real endpoints                                   | Implemented and endpoint-backed. Populated action menu was not exercised in the empty user workspace                      |
| Image 6 — sharing                  | Current member selector, Viewer/Editor, separate download permission, expiry, folder inheritance acknowledgement and version conflict handling               | Implemented and API/security tested. No live populated share dialog comparison was possible                               |
| Image 7 — request document         | Title, eligible recipient, instructions, due time in East Africa, authorized destination, related-source search, private submission and exact-version review | Dialog structure was visually inspected. Backend selector passes integration tests, but the live request dialog currently shows `Resource not found` for recipient lookup; verify after refreshing the API runtime |
| Reviews                            | Queue, exact file/version, eligible reviewer, reasoned accept/reject and changed-version invalidation                                                        | Implemented and focused backend tested; manual reviewer session remains pending                                           |
| Trash / restore                    | Reasoned state transition, recoverable list, parent/permission checks and folder restrictions                                                                | Implemented and backend tested; empty Trash view was visually inspected                                                   |
| Cross-app links                    | Work, People, Sales/order, Procurement, invoice/accounting, expense, customer and verification links described above                                         | Implemented for supported source kinds; focused Documents, Work and security tests pass                                   |
| Image 8 — configuration            | Actual quota usage/limits, type rules, sharing, version retention, trash, cross-app sources, requests/reviews and honest service availability                | Implemented; configuration page was visually inspected in the live local app                                              |
| Responsive layout                  | CSS adapts the browser, detail panel, toolbar, preview and settings for narrow screens                                                                       | Implemented in stylesheets; representative 1440/1280/768/390 live viewport checks remain founder manual acceptance        |

### Form and API contract audit

| Workflow                | Contract and prerequisite result                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload / create         | File name, allowed MIME/signature, metadata, private policy, optional authorized folder and optional canonical source; server rechecks current service, rights, quota, classification and idempotency |
| Create folder           | Readable name, optional existing authorized parent and policy; server validates parent folder, rights and no cycle                                                                                    |
| Rename / metadata       | Name, description and tags use the document's expected version; server returns conflict instead of overwriting stale edits                                                                            |
| Move                    | Existing file, authorized destination selector, expected version and policy-change acknowledgement; no automatic source audience inheritance                                                          |
| Share                   | Search current members by readable names, Viewer/Editor, distinct download permission and expiry; no public bearer links                                                                              |
| Download / preview      | Current document access and download permission checked by content endpoint; browser does not load content from unauthenticated URLs                                                                  |
| New version             | File, 8+ character change reason and current document version; content is appended as retained immutable version                                                                                      |
| Duplicate               | Authorized source, readable name/metadata and explicit target policy; future source revisions do not grant access to copy                                                                             |
| Trash / restore         | Current version and reason; folder restrictions and parent-state checks remain server-enforced; there is no delete-forever button                                                                     |
| Request                 | Document title, eligible current operational submitter, expiry, optional authorized destination and optional readable canonical source; requester cannot assign themself                              |
| Request submission      | Assigned current member, permitted file, note and current request version; creates retained private file and exact-version review; no role grant occurs                                               |
| Review                  | Authorized separate reviewer, exact version, decision and reason; edit invalidates earlier decision                                                                                                   |
| Source link / cross-app | Canonical source type and server-verified source ID selected by label; `documentSourceAccess` checks each source, and file grants remain separate                                                     |

No database migration or parallel file authority was added. New endpoints are present in route
metadata and generated workspace OpenAPI. The route-level upload parser is limited to the specific
document upload endpoints.

### Visual comparison and limitations

The local Documents screen was opened in the authenticated in-app browser. The live data set had one
empty “Mine” folder and no documents. I compared the shell, workspace sidebar, central browser,
toolbar/search, empty grid/list states, request dialog, configuration grouping and Trash state with
the supplied references. This revealed the duplicate-folder label and misleading Trash create actions,
which were fixed. The request dialog has the expected fields, but its eligible-recipient request returns
`Resource not found` in the currently running API instance even though the endpoint is registered in
source and passes integration tests. The live API process therefore needs to load the current route
before that selector can be accepted. The global AfriCore shell, branding, palette and typography
intentionally differ from Odoo. Populated file cards, row contents, preview, share dialog, version
history and action menu could not be visually compared without file records. I did not create or
upload data in the founder's sandbox. No 1440/1280/768/390 viewport comparison was made. This is a
partial running-screen comparison, not pixel verification or founder acceptance.

The current per-file limit is 2 MiB; storage retains at most 50 MiB per workspace environment,
including trash and historical versions. Uploads travel as Base64 JSON and are buffered for
signature/structure validation and encryption. A larger cap is not claimed until streamed/binary
upload, backpressure, bounded validation and corresponding quota/transaction/idempotency handling
are available. Only PDF, PNG, JPEG and UTF-8 text are accepted. Files are not malware-scanned.
There is no permanent erasure lifecycle, outbound request reminder/email provider, public bearer
sharing, Office-native rendering, OCR/AI sorting, signature, PDF split/merge, ZIP folder download,
file lock, folder automation, full attachment centralization, or app-driven removal from Trash.
These are unsupported and are not shown as operational controls.

### Focused verification

| Check                                                                                   | Result                                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run build`                                                                         | Passed after the final backend changes                                                                        |
| `npm --prefix website run typecheck`                                                    | Passed                                                                                                        |
| `npm --prefix website run build` and frontend/content suite                             | Passed; **117/117**                                                                                           |
| `node --test dist/__tests__/documents.test.js dist/__tests__/document-requests.test.js` | Passed; **23/23** (isolated SQLite data, loopback permission granted)                                         |
| `node --test dist/__tests__/work.test.js`                                               | Passed; **14/14** after the final Sales source-link changes                                                   |
| `npm run lint`                                                                          | Passed; ESLint, architecture and test-isolation checks                                                        |
| `npm run validate:openapi`                                                              | Passed; all **59** mounted Express operations documented                                                      |
| `npm run validate:platform`                                                             | Passed; **433** workspace operations validated against Express registrations                                  |
| `git diff --check`                                                                      | Passed; Git printed only line-ending normalization notices                                                    |

Loopback integration tests require the test process to bind local HTTP servers; the initial sandbox
run was denied by the operating system. Re-running the same isolated tests with loopback permission
passed. Website production builds print the existing Zod/Rollup pure-comment warnings; the build
completes successfully.

### Files changed for Documents and shared integrations

Backend/contracts/tests and contract artifacts: `src/app.ts`, `src/apps/catalog.ts`,
`src/common/private-file.ts`, `src/erp/document-links.ts`, `document-requests.ts`,
`document-reviews.ts`, `documents-access.ts`, `documents-contracts.ts`, `documents.ts`, `routes.ts`,
`metadata.ts`, `store.ts`, `src/operations/business-routes.ts`, `src/erp/work.ts`,
`src/__tests__/documents.test.ts`, `src/__tests__/document-requests.test.ts`,
`src/__tests__/work.test.ts`, and `platform-openapi.json`.

Frontend and styles: `website/src/BusinessApp.tsx`, `website/src/accounts/FocusedWorkspace.tsx`,
`website/src/approved-platform.css`, `website/src/apps/AppsWorkspace.tsx`,
`DocumentAttachments.tsx`, `DocumentEditors.tsx`, `DocumentRequests.tsx`, `DocumentReviews.tsx`,
`DocumentsWorkspace.tsx`, `PeopleWorkspace.tsx`, `SalesAppWorkspace.tsx`,
`AccountingAppWorkspace.tsx`, `website/src/apps/apps.css`, `website/src/apps/document-files.ts`,
`website/src/marketplace/MoneyTools.tsx`, `website/src/trust/PassportWorkspace.tsx`, and
`website/tests/document-files.test.mjs`.

The shared working tree also contains uncommitted Phase 2.5 CRM, Phase 2.9 Work, Phase 2.10 People,
workspace setup and Odoo-reference research changes. Those remain intact and are not represented as
new Documents behavior. No files in `odoo-reference` were modified during this checkpoint. All work
remains uncommitted; no migration, dependency installation, commit, push, deployment, provider change
or production record mutation was performed.

### Founder manual acceptance checklist

The founder should complete these checks against the running app and compare every screenshot before
calling visual acceptance complete:

1. Open AfriCore Documents and compare the landing layout with Image 1.
2. Open My Drive and Company and verify their distinct folder scopes.
3. Create and open a nested folder.
4. Upload a permitted PDF to that folder and verify it appears in grid and list.
5. Open, preview and download the PDF.
6. Rename it, edit tags, move it and duplicate it.
7. Create a new version and open history; download an older version.
8. Share with an eligible current member; verify Viewer, Editor, download and expiry behavior with that account.
9. Revoke or expire the grant and verify access is removed.
10. Create a document request, submit as the eligible person and review the exact retained file.
11. Approve/reject with an authorized reviewer and reason; verify a later version is not certified by the old review.
12. Move a file to Trash, inspect the original-folder metadata, restore it and test parent-folder constraints.
13. Link a document to a Work task and confirm authorized navigation.
14. Verify Work/People/financial source users still need separate document grants.
15. Test Sales quotation/order, procurement order/bill, invoice, expense, customer and verification links.
16. Search, filter, paginate and inspect the 5,000-record coverage notices.
17. Open Configuration and compare quota, supported types, scanning, retention and integrations with Image 8.
18. Compare all eight references with a populated workspace, including the preview, action and share screens.
19. Repeat key flows at 1440px, 1280px, 768px and 390px; verify keyboard focus, touch targets and no page-wide overflow.

Checkpoint 2.11 source implementation and automated verification are complete. The local browser
request dialog still receives `Resource not found` for the new recipient endpoint, despite the route
passing isolated integration tests; the running API runtime must be refreshed or aligned before that
workflow is accepted end to end. Populated-data screenshot comparison, role-by-role browser
acceptance, representative responsive checks and founder approval remain outstanding. Do not start
the next checkpoint until the founder authorizes it.

## Checkpoint 2.12 — Analytics and Business Intelligence

### Completion state

The supported Phase 2.12 Analytics implementation and local automated verification are complete. Founder running-screen comparison and final manual acceptance remain outstanding; this report does not claim pixel verification. Automations work was not started.

### Existing architecture and technology decisions

The active workspace Analytics API is implemented in src/operations/business-analytics.ts, uses src/operations/intelligence.ts for canonical financial snapshots, and is registered through src/operations/business-routes.ts. Workspace route authorization is separately allowlisted in src/operations/business-metadata.ts; the generated workspace API inventory is platform-openapi.json. The React app is website/src/apps/AnalyticsWorkspace.tsx and reuses the existing chart, table and date-range components.

src/services/analyticsService.ts and src/services/businessMetricsService.ts serve older transaction/profile and business-dashboard paths; this checkpoint did not conflate those authorities with the workspace Analytics API. businessMetricsService.ts exists even though an earlier source inventory did not list it.

The implementation stays on TypeScript + React, TypeScript + Express, SQL through src/db/adapter.ts, existing PostgreSQL/SQLite persistence, and CSS/SVG chart components. SQL uses fixed metric/dimension mappings, not client-supplied SQL. This avoids a second backend, arbitrary query execution, a warehouse dependency or another chart framework. Financial values remain canonical integer minor units with explicit currency; order value is never labelled recognized revenue. No package was installed and no migration was added.

### Odoo source findings

The local read-only Odoo Community 20.0 checkout is at commit 1f622740a0688c940c9ed6ab40a4a174326a345d. addons/spreadsheet_dashboard/__manifest__.py confirms Community includes a dashboard module depending on the separate spreadsheet module. The dashboard model persists spreadsheet state, group/sequence, publication, company/group and allowed-user access plus favorites (addons/spreadsheet_dashboard/models/spreadsheet_dashboard.py). Named dashboard filter values and optional default/user scope have their own model (addons/spreadsheet_dashboard/models/spreadsheet_dashboard_favorite_filters.py) and are applied by the dashboard search model. Generic graph and pivot behavior lives in addons/web/static/src/views/graph/graph_model.js and addons/web/static/src/views/pivot/pivot_model.js: graphs bind search domain, measure, mode and group-by; pivots represent two grouped dimensions with expansion and totals.

AfriCore adopts those interaction concepts in its own code and data contracts. It does not copy Odoo source/assets, embed a spreadsheet runtime, or expose public dashboard links without an approved AfriCore sharing service. AfriCore branding, global shell and design tokens remain. Source evidence and the decision are recorded in docs/odoo-reference/notes/spreadsheet_dashboard.md, docs/odoo-reference/RESEARCH_LOG.md, docs/odoo-reference/MODULES.md and docs/odoo-reference/DECISIONS.md. The actual odoo-reference repository was not modified.

### Service dependency matrix

| Capability | Source/service | Permission and coverage behavior |
| --- | --- | --- |
| Business Analytics app | intelligence for Business workspaces | App entitlement does not grant access to every underlying source. Personal workspace access remains subject to its own allowed records. |
| Orders | orders | Counts canonical order headers; orders.count supports status/currency filters and authorized order drill-down. Not revenue. |
| Customers | customers, or eligible invoicing/orders/crm/sales customer authority | Counts canonical customer records; not verified new paying customers. Authorized customer drill-down is supported. |
| CRM | crm | Lead counts by supported date/status; requires operations permission. No opportunity-value metric is inferred. |
| Sales | sales | Canonical quotation counts by date/status/currency; requires operations permission. Not recognized revenue. |
| Inventory | inventory | Movement-row counts and bounded current low-stock snapshot. As-of time, coverage and truncation are exposed; no mixed-unit sum or valuation. |
| Finance | intelligence plus finance role | Canonical confirmed collections, recorded outflows, net movement and receivables, in selected currency; source quality/history limits remain visible. |
| Forecasting | Separate existing Forecasting capability | Not registered as a historical Analytics measure/widget in this checkpoint. |
| Procurement, POS, Work, People, Documents, Automations | Existing separate services | No Analytics measures are registered for these sources. Unsupported or sensitive data is not queried. |

### Metric registry and source access audit

analyticsRegistry() reports source state, record coverage, required service/role, unit, definition, groupings, filters, chart capabilities and drill-down authority. Status choices are queried only from readable sources. Metrics/dimensions map to fixed SQL expressions and strict Zod inputs; authorization is rechecked on each request. The new routes are explicitly added to the workspace capability map, so unknown routes remain denied.

| Metric | Definition and source | Grouping/presentation |
| --- | --- | --- |
| orders.count | Canonical order headers created in the selected window; count, not revenue | Day/month/status/currency; KPI, line, bar, pie, pivot, table; order drill-down |
| customers.count | Canonical customer records created in the selected window | Day/month/status; KPI, line, bar, pie, pivot, table; customer drill-down |
| crm.leads | CRM entries whose canonical kind is lead, grouped by current status | Day/month/status; CRM operations permission; no Analytics drill-down |
| sales.quotations | Canonical quotation records by record date and current status | Day/month/status/currency; Sales operations permission; not recognized revenue |
| inventory.movements | Physical movement rows; transfers have separate outgoing/incoming rows | Day/month; no quantity/value summing |
| inventory.low_stock | Current tracked products at/below reorder point | Snapshot KPI only; timestamp, covered products and truncation notice |
| financial.collections | Confirmed inflows from canonical financial snapshot | KPI only; finance role, selected currency and source quality |
| financial.expenses | Recorded outflows from canonical financial snapshot | KPI only; finance role, selected currency and source quality |
| financial.net_movement | Confirmed collections less recorded outflows | KPI only; not profit or bank balance |
| financial.receivables | Outstanding invoice receivables from canonical financial snapshot | KPI only; finance role, selected currency and source quality |

PostgreSQL and SQLite JSON expressions are isolated behind the existing adapter. Date buckets use a valid workspace IANA timezone. Report windows are bounded to 366 days unless all-history is explicitly selected; day grouping over all-history is rejected. Results state period, timezone, currency, definition, source coverage and refresh/as-of time.

### Feature states

| Feature | State |
| --- | --- |
| Main dashboard | Implemented and automatically verified: Odoo-like dashboard navigation, compact KPI row, trend and lower panels, empty/source coverage and independent source errors. Values use authorized APIs. |
| Sales/business dashboard | Implemented and automatically verified within supported Sales/Orders measures; unavailable sources remain unavailable. |
| Global filters | Implemented and automatically verified: date presets/custom range, source, status and currency are applied to server queries; incompatible status clears when source changes. |
| Graph reporting | Implemented and automatically verified: registry-constrained measure/group/chart choices, date-only line grouping, and table alternative. |
| Pivot analysis | Implemented and automatically verified: server aggregates axes and totals, validates dimensions, expands supported month/day detail and exports cells/totals. |
| Dashboard builder/widget configuration | Implemented and automatically verified for supported types: add/configure/reorder/remove, source/measure/group/chart selection, preview and validated save. |
| Dashboard creation | Implemented and automatically verified: blank, Overview, Sales, Finance, Customers and Inventory templates. |
| Saved dashboards | Implemented and automatically verified: actor-scoped CRUD, duplication/deletion, owner/admin write restriction and optimistic version checks use existing ac_saved_reports. No new schema table/migration. |
| Report explorer/saved views | Implemented and automatically verified: graph/table/pivot query state and axes can be named, saved and reopened; legacy saved report records remain readable. |
| Drill-down | Implemented for registered order/customer aggregates and pivot cells. Unsupported sources show no fake record-open control. CRM/quotation/stock/finance row drill-down is not provided. |
| Exports | Implemented for dashboard, report and pivot CSV. Context/coverage are retained and spreadsheet formula prefixes are escaped. XLSX/PDF are unsupported. |
| Data quality | Implemented and automatically verified: source readiness/coverage, financial quality/history, inventory snapshot timestamp/truncation, metric definition and refresh time. |
| Form/filter completeness | Audited: required names/configuration are validated, incompatible options are disabled or removed, dependencies are explicit, and API failures are surfaced independently. |

### Issues found and fixed

- Analytics and saved-report reads were coupled. They now settle independently; a saved-view failure does not hide successful dashboard data, and sections retain their own error/loading state.
- Date grouping assumed Nairobi. Reports use the configured IANA timezone; integration coverage includes a New York daylight-saving transition.
- Source filters could leave another source's values visible. Queries are source-scoped; excluded metrics return an explicit excluded/null response rather than a made-up zero.
- Status filtering could be applied across incompatible record categories. Registry choices are source-scoped and stale choices clear when the source changes.
- Financial and inventory values could be misleading. Finance uses the canonical snapshot and finance permission; low stock is an as-of snapshot; mixed currency, inventory valuation, mixed-unit quantities, profit and bank balance are not implied.
- Saved dashboards lacked complete version-aware management. CRUD/duplicate/delete, schema validation, role restrictions and expected-version checks now exist.
- New APIs were not in workspace route authorization metadata. The focused tests exposed HTTP 403 failures; the route allowlist was fixed, platform-openapi.json regenerated, and Express route validation now passes.
- Older report/preview responses could replace current selections. Request sequence gates protect dashboard, report, pivot, drill-down and preview state.

No Analytics migration, dependency installation, live-provider change, production record mutation, deployment, commit or push occurred.

### Cross-service, authorization and form audit

Every report endpoint resolves current member/API identity, workspace, environment and route kind. Business metrics require Intelligence service access. Metric source services and roles are checked server-side: finance metrics require finance permission; CRM and Sales reports require operations permission. Status options are only queried for readable sources. User input is enum/schema validated and cannot select SQL columns. Table reads include organization and environment scope. People-private fields, document names and unsupported services are not queried.

### Files modified for Phase 2.12

- Backend: src/operations/business-analytics.ts, src/operations/business-routes.ts, src/operations/business-metadata.ts, src/operations/contracts.ts, src/apps/catalog.ts.
- Contract artifact: platform-openapi.json, regenerated from the workspace route registry.
- Frontend: website/src/apps/AnalyticsWorkspace.tsx, website/src/apps/AppsWorkspace.tsx, website/src/apps/apps.css, website/src/charts/BarChart.tsx, website/src/components/DateRange.tsx.
- Tests: src/__tests__/business-app-workflows.test.ts.
- Documentation/research: this file, docs/odoo-reference/AFRICORE_APPLICATION_COMPARISON.md, docs/odoo-reference/MODULES.md, docs/odoo-reference/RESEARCH_LOG.md, docs/odoo-reference/DECISIONS.md, and new docs/odoo-reference/notes/spreadsheet_dashboard.md.

package-lock.json was already modified in the shared working tree before this Analytics work and was not changed for Phase 2.12. Other pre-existing application checkpoints remain intact.

### Automated verification

| Check | Result |
| --- | --- |
| npm run typecheck | Passed |
| npm --prefix website run typecheck | Passed |
| npm run lint | Passed; architecture and test-isolation checks passed |
| npm run build | Passed |
| npm --prefix website run build | Passed; 82 routes prerendered and content suite 117/117. Existing Zod/Rollup annotation warnings remain non-fatal. |
| business-app-workflows.test.js | Passed 46/46, including metric coverage, source isolation, pivot, CSV safety, dashboard CRUD/roles/versioning and timezone/DST |
| Full npm test | Passed: 452 passed, 0 failed, 1 skipped; disposable SQLite fixtures; TEST_DATABASE_URL unset |
| npm run validate:openapi | Passed; 59 mounted operations match OpenAPI |
| npm run validate:platform | Passed; 445 workspace operations match Express registrations |
| git diff --check | Passed; Git printed line-ending normalization notices only |

PostgreSQL integration was not run because a dedicated local TEST_DATABASE_URL was not configured. No hosted service was contacted. Official Odoo documentation URLs timed out during this run; the local read-only Odoo source checkout was inspected instead.

### Visual fidelity, limitations and unsupported capabilities

The implementation follows the supplied composition in code: dashboard sidebar, search/filter/date toolbar, scorecards, trend/lower panels, report view controls, measures/grouping, pivot axes/totals, widget builder and creation flows. AfriCore branding and global shell remain distinct. No running AfriCore screen was captured or compared with the seven supplied screenshots in this checkpoint; these are reference-informed changes, not verified visual parity. Founder comparison remains required.

Current limitations: only the ten registry measures above are supported. Financial measures are KPI snapshots without dimensional pivots. Low stock is not historical. CRM/Sales/Inventory lack Analytics row-level drill-down. There are no saved shared/global filters separate from named report views, public sharing, XLSX/PDF export, scheduled snapshots, arbitrary model joins, embedded spreadsheet authoring, forecasting widgets or data warehouse. Procurement, POS, Work, People, Documents and Automations are not Analytics sources. Large-workspace performance and PostgreSQL-specific behavior remain to be qualified.

### Founder manual acceptance checklist

1. Open Analytics in a populated Business workspace and compare every supplied screenshot; check sidebar width, toolbar, KPI proportions, charts, measures, pivot, builder and creation dialog.
2. Compare finance figures against canonical records. Confirm order totals are not labelled revenue and currencies are not mixed.
3. Test source/date/status/currency filters and switch sources; stale status/data must disappear. Test empty, unavailable, restricted and API error states.
4. Compare graph/table/pivot totals to records; test axis changes, month/day expansion, keyboard navigation and table alternatives.
5. Open order/customer drill-down and confirm unsupported sources expose no fake links.
6. Create blank/template dashboards, add/reconfigure/reorder/remove widgets, save/reopen/duplicate/delete and test owner/admin versus viewer access.
7. Download dashboard/report/pivot CSV and confirm the selected filters/definitions are present and spreadsheet formulas are escaped.
8. Review coverage, finance quality/history, inventory snapshot timestamp/truncation and unsupported-source notices at desktop, tablet and mobile widths.

### Readiness for the next checkpoint

The supported Phase 2.12 implementation, source research and local automated gates are complete. It is ready for founder screenshot, responsive, populated-data and role acceptance. The next app checkpoint remains unstarted until the founder completes acceptance and explicitly authorizes it.

## Checkpoint 2.13 — Automations

### Implementation scope

- Odoo Community `base_automation` and base `ir.cron` were inspected read-only at commit `1f622740a0688c940c9ed6ab40a4a174326a345d` (`20.0`). The local source comparison is in `docs/odoo-reference/notes/base_automation.md`; the append-only evidence and accepted AfriCore constraint are in `docs/odoo-reference/RESEARCH_LOG.md` and `DECISIONS.md`.
- The supported recipe catalogue in `src/operations/contracts.ts` is the authority for event source, business category, required services, branches and action compatibility. `src/operations/automation.ts` uses the existing durable event/run storage and worker; it does not add a competing engine or schedule service.
- Rules can be created, versioned, filtered, enabled/paused, tested without execution, transferred for authorized review, and inspected in scoped run history. Scheduled rules show frequency/local hour/timezone; **Run Manually** executes only the selected enabled schedule through the existing worker after rechecking owner finance authority, services and rule version.
- The UI provides Odoo-structured rule details, grouped trigger selection, action modal, dense scheduled register/detail, execution history, dashboard, template directory, service config, Work and approval connections. It keeps AfriCore's light theme and shell and excludes arbitrary code, unrestricted external messaging/webhooks, financial postings and fabricated next-call promises.

### Files changed for Phase 2.13

- Backend: `src/apps/catalog.ts`, `src/marketplace/policy.ts`, `src/operations/automation.ts`, `src/operations/connected-routes.ts`, `src/operations/contracts.ts`, `src/operations/routes.ts`, `src/platform/workspace-capabilities.ts`.
- Frontend: `website/src/apps/AutomationsWorkspace.tsx`, `website/src/apps/apps.css`, `website/src/operations/WorkflowBranchFields.tsx`.
- Tests: `src/__tests__/business-app-workflows.test.ts`.
- Documentation/API reference: `docs/AUTOMATIONS.md`, `docs/PHASE2_APP_PROGRESS.md`, `docs/odoo-reference/MODULES.md`, `docs/odoo-reference/RESEARCH_LOG.md`, `docs/odoo-reference/DECISIONS.md`, `docs/odoo-reference/notes/base_automation.md`, `platform-openapi.json` when regenerated.

### Visual acceptance matrix

| Reference | Layout and control implemented | Runtime screenshot compared | Remaining acceptance |
| --- | --- | --- | --- |
| Image 1 — automation rule detail | Full-page record, readable title, source/trigger/conditions, Actions To Do and Notes, history, preview, permission/service state | No | Founder compare populated rule and check compact title/field/tab proportions. |
| Image 2 — trigger dropdown | Inline grouped Business Events and Scheduled Checks selector, selected recipe updates inputs and action choices | No | Compare dropdown width/position/scroll in the running browser. |
| Image 3 — new automation | Document-style creation, editable title, inline trigger/conditions, action tab and Add an Action modal entry | No | Founder compare initial empty action layout and toolbar at desktop/mobile. |
| Image 4 — create action modal | Centered overlay, compact action-type buttons, contextual details, save/close/discard behavior | No | Compare modal geometry and confirm each visible type is compatible and service-gated. |
| Image 5 — scheduled action register | Dense paginated table with name/template/frequency/hour/timezone/owner/last run/status/actions and filters | No | Compare row height/toolbar, then exercise search, state, frequency, owner, pagination and row navigation. |
| Image 6 — schedule detail | Full-page scheduled form, TECHNICAL SETTINGS / ACTION DETAILS, Run Manually, Execution Plan / Help; scoped endpoint | No | Verify one-rule run and next target in a live worker environment; no fake nextcall displayed. |
| Image 7 — contextual action | Modal retains the underlying rule context and shows source, trigger, action, target, conditions and dependencies | No | Compare the modal over a saved CRM rule and confirm saving edits config only; workflow action runs only on a matching event. |

**No pixel parity or screenshot comparison is claimed.** The code was source-reviewed against supplied images and local Odoo view definitions, but no running AfriCore browser capture was available during this implementation. Founder manual comparison remains required for all seven images.

### Focused acceptance steps

1. Open Automations in a populated business workspace; inspect dashboard, rule list, grouped trigger dropdown, action modal and every supported template/service state.
2. Create a paused CRM-stage rule with a matching branch and skip fallback; save a version, verify current-stage behavior, run history and version label, then confirm saving alone did not create the follow-up.
3. Create a schedule at an hour later than the current local time; run **Run Manually** and confirm only the selected enabled rule is evaluated. Verify a paused rule and a revoked-owner/missing-service rule cannot run.
4. Check New York daily/weekly schedule behavior at the DST boundary and ensure a duplicate poll does not duplicate the same natural-period run.
5. Filter the register and run history, page results, inspect a run result, test safe cancellation/retry controls, and confirm raw payloads, stack traces and internal actor IDs are not exposed.
6. Verify role/service restrictions, private Work message handoff, approvals assignment and empty/error/loading states. Compare each screen's macro layout and dimensions with its matching Odoo screenshot at similar viewport size.

### Automated verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm --prefix website run typecheck` | Passed |
| `npm run build` | Passed; backend TypeScript compiled, including final scoped manual-run implementation |
| `npm --prefix website run build` | Passed; Vite build and 82 prerendered pages; website content suite **117/117**. Existing Zod/Rollup annotation warnings were non-fatal. |
| `npm run lint` | Passed; ESLint, architecture-cycle check (201 frontend modules), and backend test-fixture import-order check |
| `business-app-workflows.test.js` | Passed **50/50** against disposable SQLite and temporary localhost API. Includes filters/search escaping, saved run versions, sanitized results, former-owner recovery, New York DST schedules, manual run, and isolation of unrelated pending runs. |
| `operations.test.js` | Passed **20/20** against disposable SQLite and temporary localhost API |
| `connected-platform.test.js` | Passed **14/14** against disposable SQLite and temporary localhost API |
| `npm run validate:openapi` | Passed; **59/59** mounted legacy operations documented |
| `npm run validate:platform` | Passed; **449** workspace operations match Express registrations |
| `git diff --check` | Passed; Git reported only working-tree LF-to-CRLF normalization notices |

The three focused backend suites passed **84/84**. The full backend test suite and PostgreSQL integration were not run; a dedicated `TEST_DATABASE_URL` was not configured. All test API servers and databases were disposable local fixtures; no hosted service was contacted. No running AfriCore browser capture was made, so the seven screenshot comparisons and founder manual acceptance remain outstanding. No dependency was installed, no migration was created, and no commit, push or deploy occurred.

## Checkpoint 2.14 — Business ID and Business Passport

### Architecture and source research

- Business ID remains a presentation and workflow surface over the existing Trust/Passport authority. It does not create a second organization or credential database. Passport, review, evidence, documents, credentials, issuer metadata, grants, verification requests, relationships and audit events continue to use the existing services and SQL adapters.
- Odoo Contacts was inspected at local reference commit `36fef5806` (Odoo 20.0). Contacts extends shared `res.partner`; its visual pattern comes primarily from `odoo/addons/base/views/res_partner_views.xml` (`view_partner_form`): compact record controls, a button box, image/name, grouped fields and notebook tabs. The Contacts extension in `addons/contacts/models/res_partner.py` adds navigation, not digital identity verification. The focused findings are in `docs/odoo-reference/notes/contacts.md`.
- Standards considered: [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model/) and [Verifiable Credential Data Integrity 1.0](https://www.w3.org/TR/vc-data-integrity/) are Recommendations. The [Verifiable Credentials Overview](https://www.w3.org/TR/vc-overview/) is a Group Note, not a Recommendation. The implementation keeps claim data, signature integrity, issuer authority, reviewer judgment, registry verification, status and holder consent as separate assertions.
- TypeScript/React, existing Express/TypeScript routes, SQL through current adapters, Zod input schemas, existing `jose` and key handling, current protected Documents and Trust APIs, and CSS are retained. No identity runtime, cryptographic algorithm, key store, organization store or contract was introduced.

### Dependencies and operation readiness

| Workflow | Existing authority and gate | Selector / availability behavior |
| --- | --- | --- |
| Profile and Passport | Passport service; workspace owner/admin mutations; separate private review state | Uses the active workspace Passport; public discoverability is opt-in and minimal. Blockchain is not needed to view or edit the basic profile. |
| Identity review | Verification service and authorized Trust reviewer | Required legal name, jurisdiction, registration reference, representative statement, selected evidence and consent; reviewer decision remains separate from document upload. |
| Evidence | Trust Evidence plus the source-specific service; owner/admin for source capture | Paginated, kind-specific choices for profile, successful payment, invoice, order, shipment and confirmed relationship; each source kind checks its service and current workspace scope. Unavailable services return an explicit unavailable state. |
| Supporting documents | Protected Documents capability and verification service | Only pending/current reviews are offered; file type and 250 KB UI limit are shown; backend validation/encrypted storage remain authoritative. Malware scanning is not configured. |
| Credentials and issuance requests | Credentials service; eligible approved sandbox issuer, issuer ownership/authorization, request and holder-consent constraints | Issuers are loaded from authorized server results; the UI filters eligible approved sandbox issuers and explains that a request does not itself issue a credential. |
| Credential verification/status | Credentials plus verification API; optional proof lookup is separately gated | Verification uses existing signature/key/status checks. Expired, suspended or revoked states are not presented as currently valid. Blockchain proof remains optional and testnet-only. |
| Sharing | Trust Sharing with credentials and named-recipient authorization/consent | Recipient is a searchable business selector; grant is limited to active credentials, purpose, expiry and one-time/reusable choice; matching inbound requests are selected from eligible records. The server rechecks policy and status. |
| Relationships and business lookup | Trust Network; owner/admin mutations | Search only returns public-profile opt-ins in the current environment; relationship requests remain pending until the counterparty responds. |
| History | Existing scoped audit/event records | Paginated records; a failed history read does not block unrelated profile or evidence operations. |
| Optional proofs | Existing optional blockchain capability | Never activated automatically and never described as proof of legal identity. |

### Defects fixed and application behavior

- Replaced the prior wrapper with ten real sections and URL/browser navigation: **Overview, Business Profile, Verification, Business Passport, Credentials, Evidence, Shared Access, Relationships, History and Settings**. Odoo-style nested horizontal tabs remain within the company record. Toolbar smart buttons navigate to actual sections and show authorized counts; failed reads show `—`, not fabricated zeroes.
- Reworked the company record around the supplied Odoo structure: compact breadcrumb/action header, large business name and mark, related-record button row, aligned two-column fields and thin horizontal tabs. The Overview uses the requested business identity / credential and sharing composition, five source-derived summary measures, and linked actions rather than an unrelated generic KPI dashboard.
- Business Profile has an editable, two-column form, readable country selection that persists ISO country codes, Save/Discard behavior and the existing backend review invalidation transition when material identity fields change.
- Business Passport shows subject/reference, environment, exact review and issuer states, evidence coverage and explicit assurance limitations. It does not claim a DID method or legal registry result.
- Verification supports review submission and reviewer-state display. Authorized record selection is required; the interface distinguishes self-reported claims, uploaded supporting documents and reviewer decisions. Credential verification displays signature and current status separately from issuer recognition.
- Evidence now has a dense source register, paginated kind-specific source picker, lawful-purpose fields, correction requests that select the user's own evidence or credentials, readable persisted source labels, and protected document upload/review entry points. Source IDs remain internal form values; users choose labels rather than typing raw IDs. Old evidence without a persisted label falls back to a shortened reference.
- Credentials show searchable/filterable records, issuer metadata and authority labels, validity/status, detail and signature verification, plus authorized issuance-request flow. No arbitrary issuer or claim can be entered in ordinary workflows.
- Shared Access shows recipient, purpose, types, dates, access and state; the centered consent dialog selects a named recipient, exact active credentials, optional matching inbound request, purpose, expiry and one-time behavior. Newly returned recipient links are held in component state, hidden in the UI until a deliberate copy action, and can be cleared. Revocation blocks future access; the UI says it cannot erase a copy already received.
- Relationships use a centered Odoo-sized creation dialog with counterparty selector, supported relationship type, statement and explicit consent. The workflow is a request, not confirmation; authorized counterparty response and revocation retain backend state rules.
- Verification Requests have selectable required credential types and a named business lookup. Settings show public-profile controls, actual service/environment readiness, and limitations for signatures, issuer authority, selective disclosure, sandbox, retention and optional anchoring.
- Independent resource reads use settled results and per-resource errors/retry paths; history, issuer or source failures no longer suppress the whole workspace. Request-generation guards prevent stale workspace/page results from overwriting current state. Source lists and activity history expose pagination rather than treating a recent page as the full record set.
- Trust source listing now validates source kind/page/limit, enforces owner/admin access and current service/workspace scope, pages every source type, and reports its required service. Evidence records persist a readable canonical source label. Issuer metadata is safe for presentation. Public peer search returns only opt-in minimal profiles; protected issuer and credential data remain out of that endpoint.

### Form and selector matrix

| Form / action | Required fields or choices | Authority and persisted effect |
| --- | --- | --- |
| Create/update Passport | Display name, category, industry, selected country, public-profile preference | Existing Passport create/update route; identity-affecting changes run existing review/credential invalidation logic. |
| Identity review | Legal name, jurisdiction, registration reference, representative statement, one or more eligible evidence records, explicit consent | Existing review service; submitted review remains pending until authorized reviewer action. |
| Attach document | Current pending review, selected accepted file | Protected Documents endpoint with file checks and encrypted storage; not treated as verification. |
| Add evidence | Source kind, authorized paginated record, lawful basis, purpose | Existing Trust Evidence route; source-kind service and business scope are checked server-side. |
| Correction | Record kind, own evidence/credential selector, reason; optional supporting statement | Existing correction workflow and audit history. |
| Credential verification | Credential token/eligible record according to existing verification flow | Existing cryptographic verification plus issuer/status checks; no self-issued trust inference. |
| Issuance request | Authorized approved sandbox issuer, supported credential type(s), selected evidence, request/holder consent | Existing request and issuer authorization; does not issue automatically. |
| Share | Named recipient, eligible active credential(s), purpose, expiry, consent; optional matching request and one-time choice | Existing recipient-bound grant API; server revalidates recipient, types, purpose, expiry and credential state. |
| Verification request | Named public-profile business, one or more supported credential types, purpose, expiry | Existing Trust Network request lifecycle; holder can accept/decline and separately authorize a grant. |
| Relationship request | Searchable counterparty, supported relationship type, statement and explicit consent | Existing Trust Network request; counterparty response is required for confirmation. |
| Public profile setting | Opt in/out | Existing Passport PATCH; public data remains limited to name, category, industry, country, public reference and review status. |

### Files changed for Checkpoint 2.14

- Backend: `src/trust/routes.ts`, `src/trust/domain.ts`, `src/trust/credentials.ts`, `src/apps/catalog.ts`, `src/marketplace/policy.ts`, `src/platform/workspace-capabilities.ts`.
- Frontend: `website/src/apps/BusinessIDWorkspace.tsx`, `website/src/trust/PassportWorkspace.tsx`, new `website/src/apps/business-id.css`.
- Tests and API reference: `src/__tests__/trust.test.ts`, new `website/tests/business-id-quality.test.mjs`, regenerated `platform-openapi.json`.
- Source notes: `docs/odoo-reference/notes/contacts.md`, `docs/odoo-reference/MODULES.md`, `docs/odoo-reference/RESEARCH_LOG.md`.
- Completion record: `docs/PHASE2_APP_PROGRESS.md`.
- No changes were made to the separate `odoo-reference` repository, Pixel, migrations, dependency manifests, or unrelated application screens for this checkpoint. There is no commit, push or deployment.

### Cryptography, permissions and remaining capability gaps

- Existing `jose` algorithms, signing keys, encrypted key storage, status lists and credential issuance controls are reused. The client does not receive private signing keys. Normal profile/evidence/public-search routes do not bypass the server's workspace, owner/admin, source-service or recipient checks.
- A valid signature means integrity under the associated key; it does not establish issuer institutional authority. A reviewed document does not establish government registry truth or representative authority. Relationships are bilateral declarations, not endorsements. Public opt-in does not reveal registration files, credentials, contact details, finance or private relationship data. Grants cannot erase recipient copies.
- Implemented and automatically verified: sandbox Passport/evidence/credential/share/request/relationship flows supported by existing services; paged source and history reads; status and consent gates; public opt-in minimization.
- Partially implemented / awaiting manual acceptance: visual matching, responsive presentation, interactive roles and all populated-data flows require founder browser acceptance. Existing service sources are limited to the canonical source kinds listed above. Old evidence may have only a shortened source reference until a new label is stored.
- Unsupported by the existing platform: government registry integration; a live institutional trust network; production credential issuance/signing; production blockchain anchoring; general cryptographic selective disclosure; full DID method deployment; malware scanning; automatic erasure/legal-hold processing; proof of legal identity based on a signature, document review or blockchain commitment.

### Automated verification

| Check | Result |
| --- | --- |
| Backend TypeScript typecheck | Passed |
| Website TypeScript typecheck | Passed |
| `npm run lint` | Passed; ESLint, architecture-cycle check and backend fixture import-order check |
| `npm run build` | Passed; backend TypeScript compilation |
| `npm --prefix website run build` | Passed; production bundle, 82 prerendered routes and website content tests **123/123**; existing Zod/Rollup annotation notices were non-fatal |
| Focused Trust suite | Passed **21/21**, including the new paginated source-selector/readable-label coverage |
| Full backend regression suite | Passed **457**, failed **0**, skipped **1**; rerun after the final source-selector refinement |
| `npm run validate:openapi` | Passed; all **59** mounted legacy operations match OpenAPI |
| `npm run validate:platform` | Passed; **450** workspace operations match Express registrations |
| `git diff --check` | Passed; Git printed only line-ending normalization notices |

Tests used disposable local database fixtures and temporary localhost servers. No hosted service or production record was used. PostgreSQL integration was not run because no dedicated `TEST_DATABASE_URL` was configured.

### Visual comparison result

The six supplied Odoo screenshots and written Business ID layouts were used to shape the record header, smart-button strip, two-column profile, horizontal tabs, relationship modal, compact register and identity-specific screens. **No running AfriCore screen was captured or compared side by side in this checkpoint**, so there is no claim of pixel parity or completed visual verification. No authenticated AfriCore browser session was available to inspect. Founder comparison remains required, including 1440, 1280, 768 and 390 pixel widths. This is a known acceptance item, not a completed check.

### Founder manual acceptance checklist

Use safe sandbox records:

1. Open Business ID; compare the company profile to Image 1, edit it against Image 2, save and refresh, and confirm the actual review state.
2. Open the Passport, submit an authorized identity review with eligible evidence, attach a supporting document, then confirm it remains pending until an authorized reviewer acts.
3. Add authorized evidence from each available source type; verify unavailable services, paging, labels, corrections and audit events.
4. Inspect existing credentials, issuer authority, signature and current status; submit only an authorized issuance request.
5. Request a named business's credentials; respond as the holder; create a limited share, test recipient access, one-time/replay and expiry behavior, then revoke future access.
6. Request a relationship, respond from the counterparty, and verify pending/confirmed/rejected/revoked states.
7. Review history and public-profile settings; confirm private evidence, credentials, contact and financial information remain hidden when public opt-in is enabled.
8. Test owner/admin and unauthorized roles, each inactive service, empty/loading/error/retry states, browser refresh and workspace switching.
9. Compare all six Odoo references against their matching AfriCore screens at comparable viewport sizes. Check responsive layouts at 1440, 1280, 768 and 390 pixels.
10. Confirm no status claims more assurance than its evidence supports; use no real identity documents in sandbox.

### Phase status

**Checkpoint 2.14 implementation: implemented and automatically verified; awaiting founder manual and visual acceptance.** The full Phase 2 sequence is **not marked accepted**. No other phase was started. No operation remains running or incomplete in this work session. No commit, push, deploy, migration or dependency install occurred.

## Checkpoint 2.2 — Finance completion (requested after the recorded 2.14 work)

### Status and starting point

The old checkpoint table incorrectly said Finance was not started. Finance was already registered in `src/apps/catalog.ts` and had a working, founder-approved landing layout in `website/src/apps/FinanceDashboard.tsx`, plus canonical Invoicing, Expenses, Payment and financial-summary services. The work here preserves that dashboard and completes the missing installed-app operations surfaces around it. Phase 2.2 is implemented and automatically verified; the founder's live browser acceptance and screenshot comparison are still pending. No other phase was started in this work.

### Architecture and Odoo reference findings

- AfriCore's installed Finance app composes services through `website/src/apps/AppsWorkspace.tsx`; its independent service routes remain available. Invoices and customers remain canonical records, Expenses remain merchant-recorded operations, payment events remain provider evidence, and Accounting remains a separate application and ledger.
- Existing source research at `docs/odoo-reference/AFRICORE_APPLICATION_COMPARISON.md`, `MODULES.md`, and `RESEARCH_LOG.md` records Odoo Community 20.0 at `C:\Users\cypri\OneDrive\Desktop\AfriScore\odoo-reference`, commit `9d233dca4156d58ca573e9cdc3b32327c97aa282`. Odoo has no single Community Finance app equivalent: relevant behavior is divided among `addons/account/models/account_move.py`, `addons/account/views/account_move_views.xml`, `addons/payment`, `addons/sale`, and other modules. `addons/account_reports` is absent from that Community checkout; this implementation makes no Enterprise-report parity claim.
- All seven supplied Finance screenshots were inspected at their original resolution before the corresponding operational work. They informed the compact source panels, anchored operations menu, dense invoice register, vendor-bill handoff, aging table, evidence-matching workspace and report table/chart treatments. The previously approved Finance landing design remains the default.
- The implementation uses the existing TypeScript/React frontend, TypeScript/Express APIs, SQL adapters, Zod validation, integer minor-unit currency helpers, CSS and the existing SVG chart component. No charting package, runtime, ledger or storage system was added. Attempts to fetch the five official Odoo documentation URLs listed in the prompt timed out; the supplied screenshots and repository's existing source-based Odoo comparison notes were available and used. No Odoo code or assets were copied.

### Service dependency and workflow matrix

| Screen/workflow | AfriCore authority and behavior | Availability, coverage and guardrails |
| --- | --- | --- |
| Approved Finance dashboard | Existing `/financial-summary` plus a five-row invoice preview; independent source reads; period/currency controls; current SVG cash-flow trend, receivables/expense breakdowns, cash observations and quick links | Structure retained; covered records only; amounts remain currency-scoped; no profit or bank-balance claim |
| Financial operations overview | New separate compact source-panel view backed by summary, invoice, expense and confirmed payment-event APIs | Reached from Operations menu; optional Payments/Reconciliation are shown inactive when unavailable; source failures do not replace successful panels |
| Invoices | `/records/invoices`, `/financial-summary`, canonical invoice detail, credit correction and protected document attachments | Server search, filters and pagination; create action writes a draft only; issue/payment/credit transitions remain in their existing services |
| Customers | `/records/customers`, `/customers/:id/activity`, canonical customer form and document links | Customer register is paginated; server-backed customer search makes invoice filters/create selectors reachable beyond the first 100; history totals use canonical invoices/orders, while the activity timeline is capped at the latest 100 events |
| Expenses and vendor bills | `MoneyTools` and `/expenses` for merchant-reported expenses; Procurement app for supplier bills | Expense search/category/currency/date filters and server pagination; corrected, archived and superseded records are handled through the existing source. A bill is not converted to an expense. No recorded expense implies payment |
| Payments | `PaymentCentre` with `/payment-events`, `/payment-requests`, attempts and provider readiness | Server-side status/currency/date/search filters and pagination; sandbox actions remain simulations; provider credentials/configuration and current role are server-authoritative |
| Reconciliation | `PaymentCentre` candidate lookup and explicit allocation/review endpoints | Optional service gate; currency, candidate and allocation invariants remain backend-checked; matching is evidence review and does not post Accounting journal entries |
| Receivables | `/financial-summary` as of selected date; invoice rows with effective allocations and issued credits | Currency and date selector, aging buckets and invoice drill-down. Historical accuracy is limited to retained AfriCore allocations/credits; this is not an Accounting aging ledger |
| Financial reports | Existing `FinancialOverview` report data, chart/table toggle and CSV export | Financial movement, confirmed collections, outflows and covered receivables only; no fabricated balance sheet, certified cash-flow statement, tax report, profit or FX conversion |

### Existing functionality, missing surfaces and defects addressed

- Before this change, the Finance catalog existed but selecting operational sections did not produce a coherent installed-app view for each destination. The previous screen set did not expose a source-panel overview or dedicated installed-app invoice/customer/receivables layouts.
- Added eight catalog sections with distinct presentations: Dashboard, Invoices, Customers, Payments, Expenses, Reconciliation, Receivables and Financial Reports. Added a separate `Financial operations` view under the compact Operations dropdown to map the Odoo journal/source panels without replacing the approved Finance dashboard. Browser URL state stays in the installed Finance app and supports Back/Forward/refresh through existing app navigation.
- The Operations menu is anchored to its trigger, uses native keyboard disclosure, closes on outside click/Escape/selection, and groups View, New and Reporting actions. Write actions are hidden/disabled according to the Finance UI role; API authorization remains authoritative.
- The invoice register uses server-side search/filter/count/pagination for status, currency, customer and issue/due date. Literal search escapes SQL wildcard input and includes linked customer names while remaining scoped to organization/environment. The table right-aligns money and opens canonical invoice details. The customer selector searches the server instead of treating its first page as the full directory.
- New invoice provides required customer, currency, dates, line, quantity, unit price, optional discount, terms and instructions. Money inputs are converted with the existing currency minor-unit helper. Save creates an idempotent draft and explicitly does not issue it or record payment. Customer details link to complete canonical invoice/order history and covered activity.
- Expense lists now use server pagination, search, category/currency/date filters and total counts, exclude archived/superseded revisions by default and expose historical revisions as history. The compact create flow stays inside the existing Expenses component. Vendor bills navigate to Procurement only when that service is active.
- Payment events now return a filtered distinct-event total and support server-side status/currency/date/literal-search filters. Payment and reconciliation panels use independently settled source loads so failure in optional provider/request data does not erase successfully loaded payment events. Explicit allocations still call the existing candidate and allocation APIs.
- The receivables page uses the existing financial snapshot's selected `to` date, allocations and issued credits. Aging totals are separated by currency and the UI states the historical-evidence limit. Reports expose only supported movement and payment evidence, retain source definitions and export displayed activity to CSV.
- The approved dashboard's parallel summary and invoice-preview reads remain independent, date calculations use the workspace timezone, money formatting respects zero-decimal currencies, and negative breakdown items are not rendered as positive composition.

### Permission audit and form completeness

| Actor/capability | UI behavior | Authority |
| --- | --- | --- |
| Owner/Admin | Finance write controls are available subject to active service and operation-specific UI rules | Existing routes re-check current membership, organization, environment and operation role |
| Finance | Invoice, expense, payment and supported reconciliation controls are available subject to active service | Existing finance authorization and domain invariants remain server-enforced |
| Operations | Read views remain available; invoice/payment/accounting mutations are not granted by Finance's writable flag | Customer and operations routes continue to enforce their own server permission rules |
| Read-only/other | Can inspect authorized views; mutation controls are not exposed | Server still rejects unauthorized reads/writes regardless of UI state |
| Optional service inactive | Screen gives an unavailable/inactive state and does not pretend provider/matching data exists | Existing service entitlement and route checks remain authoritative |

Invoice create exposes the required canonical fields and preserves failed user input. Existing expense forms expose their schema-required amount/currency/category/date/description and source links. Payment allocation forms continue to select canonical candidate records rather than typed IDs and preserve server errors. No new backend permission rule or accounting workflow was introduced.

### API/backend changes and changed files

- `src/platform/routes.ts` — validated invoice filters, server search/count/pagination, escaped literal search and customer-name search within the current scope.
- `src/operations/routes.ts` — expense filtering/search/category/currency/date pagination/count and default active-effective-record behavior.
- `src/finance/routes.ts` — payment-event status/currency/date/search filtering, distinct count and pagination.
- `website/src/apps/FinanceAppWorkspace.tsx` — installed-app routing, operations menu, invoice/customer registers, invoice creation and detail, expenses/payments/reconciliation/receivables/reports composition.
- New `website/src/apps/FinanceOperationsOverview.tsx` and `website/src/apps/finance-app.css` — compact source panels and operational styling.
- `website/src/apps/AppsWorkspace.tsx`, `website/src/apps/lazy-workspaces.tsx`, `website/src/workspace-navigation.ts` — Finance app dispatch, loading and deep-link navigation.
- `website/src/apps/FinanceDashboard.tsx`, `website/src/finance/FinancialOverview.tsx`, `website/src/finance/PaymentCentre.tsx`, `website/src/marketplace/MoneyTools.tsx`, `website/src/BusinessApp.tsx`, `website/src/accounts/FocusedWorkspace.tsx` — direct Finance improvements, existing-component integration and workspace timezone propagation.
- New `website/tests/finance-app.test.mjs`; added HTTP coverage for expense/payment register filters in `src/__tests__/financial-operations.test.ts`; updated app-navigation expectations in `website/tests/accounting-app.test.mjs`, `commerce-app.test.mjs`, `inventory-app.test.mjs`, `procurement-app.test.mjs` and `sales-app.test.mjs`.
- This progress file and no other application, database, migration or dependency files.

### Remaining limitations and unsupported functionality

- A real bank statement import, bank-feed synchronization, bank balance, cash custody ledger, matching against an imported bank statement and automatic bank reconciliation are unsupported. The available workspace matches AfriCore payment evidence and allocations only.
- Formal Accounting journals, a double-entry ledger, certified financial statements, tax/eTIMS filings, tax localization, FX conversion, provider settlement guarantees and vendor payments remain outside this Finance workspace. Use Accounting, Procurement or a qualified provider/service where supported.
- Finance snapshots are limited to authorized canonical records and their recorded history. Payment activity can include sandbox simulations. Older customer invoices may use current contact information where no historical snapshot was captured. Customer domain activity is limited to the latest 100 events.
- No live screenshot comparison or authenticated browser acceptance was completed. An attempt to start the local application failed when the configured Neon hostname did not resolve (`ENOTFOUND`); desktop computer-use became unavailable during the run. This is why the requested side-by-side comparisons are marked pending, not passed. The seven references were inspected, but no AfriCore capture was produced.
- Official Odoo documentation URL fetches timed out; they are not represented as consulted sources. Existing local source-research notes and the actual supplied screenshots were used for implementation boundaries and visual structure.

### Automated verification actually run

| Check | Result |
| --- | --- |
| Backend TypeScript build/typecheck | Passed as part of root build and full test command |
| Website TypeScript project build/typecheck | Passed as part of `npm --prefix website run build` |
| Finance workspace static tests | Passed **9/9** |
| Full website content/app suite | Passed **132/132** in the latest production build |
| Full backend regression suite | Passed **458**, failed **0**, skipped **1** |
| `npm run lint` | Passed; ESLint, architecture and fixture-order checks |
| `npm run validate:openapi` | Passed; 59 mounted legacy operations match the API specification |
| `npm run validate:platform` | Passed; 450 platform operations match Express registrations |
| `npm --prefix website run build` | Passed; production assets and 82 prerendered pages |
| `git diff --check` | Passed; only normal Windows LF-to-CRLF notices |

No hosted finance provider, production record, live payment or user database was used. Test data used disposable local fixtures. No dependencies were installed, no migration was created, and no commit, push or deploy occurred.

### Founder manual acceptance checklist

Use sandbox records only.

1. Open AfriCore Finance.
2. Verify the approved dashboard layout remains intact.
3. Check KPI values and currency formatting.
4. Change reporting period.
5. Change reporting currency.
6. Verify values refresh correctly.
7. Check the main Cash Flow chart.
8. Check Receivables breakdown.
9. Check Expense breakdown.
10. Check Recent Invoices.
11. Click every Quick Action.
12. Open Invoices.
13. Compare the invoice register with Odoo Image 3.
14. Search invoices.
15. Filter by status.
16. Test pagination.
17. Open an invoice.
18. Verify invoice details and allocations.
19. Create an eligible invoice.
20. Open Customers.
21. Open a customer's financial records.
22. Open Expenses.
23. Compare the Expenses layout with Image 4.
24. Record a valid expense.
25. Test invalid expense fields.
26. Open Payments.
27. Review payment requests and attempts.
28. Inspect a confirmed event.
29. Open Reconciliation.
30. Compare Reconciliation with Image 6.
31. Select an eligible payment.
32. Inspect matching invoice candidates.
33. Perform an authorized sandbox allocation.
34. Verify the allocation cannot be duplicated.
35. Open Receivables.
36. Compare Receivables with Image 5.
37. Verify aging amounts.
38. Open a source invoice.
39. Open Financial Reports.
40. Compare the report with Image 7.
41. Change report period and currency.
42. Export the supported report.
43. Verify the exported values.
44. Test inactive Payments.
45. Test inactive Reconciliation.
46. Test a read-only role.
47. Test an unauthorized mutation.
48. Check browser Back/Forward.
49. Refresh individual Finance sections.
50. Test responsive layouts.
51. Confirm Finance and Accounting remain separate.
52. Confirm no amount is misrepresented as profit, settlement or bank balance.
53. Compare all applicable Odoo screenshots and the approved AfriCore dashboard image.

### Phase 2 status

**Checkpoint 2.2 Finance: implemented and automatically verified; awaiting founder manual and visual acceptance.** Visual screenshot comparison is explicitly incomplete. The recorded Phase 2.14 Business ID implementation remains separate and unaccepted pending its own manual/visual review; CRM remains partial. The full Phase 2 sequence is not marked accepted. No operation remains running or incomplete in this checkpoint. No commit, push, deployment, migration or dependency installation occurred.

## Phase 2.5 CRM and immersive application navigation — implementation checkpoint, 18 November 2026

This entry supersedes the earlier CRM-partial status above for the current local source tree. The implementation covers the nine supplied CRM reference screens and the shared installed-app navigation requested in the Phase 2.5 prompt. CRM remains backed by canonical CRM, customer, team, Sales, activity, and reporting services. App availability is derived from the authorized installed-app catalog. Switching sections of an installed app retains its immersive app context; explicit independent service routes retain their own navigation and authority. The app header, launcher, overlay navigation drawer, app information panel, company/workspace controls, direct section/record URLs, browser history, refresh handling, and context updates are integrated across the Business shell and supported Personal/Developer shells. Service detail and related-app repetition is suppressed in the immersive app view while environment and permission notices and installation controls remain available.

CRM implementation includes the stage Kanban with recorded stage totals and priority, opportunity detail and revision history, lead create/edit and conversion, lost-reason configuration, searchable canonical customer selection, scoped Sales quotation handoff/link-back, activity scheduling and lifecycle, activity grid, pipeline graph/pivot-style analysis, and CRM/activity reports. CRM lists use scoped server search, filters, stable pagination and explicit result counts; service lookups load independently so a customer/team lookup failure does not silently invalidate CRM data. Existing server-side tenant, workspace, environment, membership, role, version, idempotency and customer-link checks remain authoritative. Reporting discloses its 10,000-record bound and truncation. No unsupported email delivery or external provider result is represented as working.

The reusable visual and implementation requirements are recorded in [APP_UI_IMPLEMENTATION_STANDARD.md](APP_UI_IMPLEMENTATION_STANDARD.md) and linked from `AGENTS.md`. The nine screenshots were inspected at their supplied native pixel dimensions:

| Reference | Screen | Image dimensions |
| --- | --- | ---: |
| 1 | Pipeline Kanban | 1716 × 894 |
| 2 | Opportunity detail | 1844 × 966 |
| 3 | Lead detail/form | 1842 × 962 |
| 4 | Lead action menu | 1900 × 559 |
| 5 | Schedule activity dialog | 645 × 468 |
| 6 | Activity grid | 1849 × 930 |
| 7 | Pipeline graph | 1918 × 893 |
| 8 | Pipeline pivot | 933 × 439 |
| 9 | Lead conversion dialog | 1904 × 824 |

Visual acceptance is **not complete**. One authenticated sandbox capture showed the immersive CRM pipeline shell at 912 × 960, with no matching records. It confirmed the full-width shell and navigation; its multirow filters and empty board could not be compared at a similar viewport to Reference 1's populated board. The other eight running screens were not captured or compared side by side. The final browser refresh returned a different desktop window, so no further captures are claimed. No final screenshot set is archived. Populated-board geometry, the other eight operational screens, and all-screen responsive/accessibility/manual acceptance remain founder review items.

Automated verification on the current source: website content/app suite **133/133**; full backend suite **460 passed, 1 PostgreSQL-only test skipped, 0 failed**; root TypeScript check passed; lint and architecture checks passed; legacy OpenAPI validation passed (**59 routes**); generated workspace OpenAPI validation passed (**451 operations**); development configuration tests passed (**3/3**); and the website production build passed. A sandbox loopback restriction prevented the initial backend test run; the successful full run used the approved local-network execution context. `git diff --check` passed; Git emitted only its normal Windows LF/CRLF conversion notices. No schema migration, dependency installation, hosted data change, commit, push or deployment occurred.

Source changes for this checkpoint are limited to CRM UI/service integration, generated workspace API metadata, app catalog and immersive navigation/shell behavior, tests, and the implementation standard linked above. The local code and automated checks are complete for this increment. The nine-screen visual comparison and manual acceptance are explicitly pending; this is not a claim of completed Odoo visual reproduction or whole-project acceptance.

## Phase 2.5B CRM functional expansion — implementation checkpoint, 18 November 2026

This continuation adds customerless lead capture and CSV import, duplicate suggestions with reviewed merge/history retention, reusable activity plans with selected owners and retry-safe application, and SQL-backed pipeline/forecast graph and pivot reports. Forecast totals retain explicit currency groups. The UI adds import mapping/preview, duplicate review, activity-plan setup/application, expanded CRM detail and forecast views. Existing CRM, Customers, Sales and activity services remain authoritative; merge history, tenant/environment scope, role checks, optimistic versions and idempotency remain enforced by the backend.

The Odoo 20 source review for the 11 supplied Phase 2.5B images is recorded in [notes/crm.md](odoo-reference/notes/crm.md), [RESEARCH_LOG.md](odoo-reference/RESEARCH_LOG.md), [PATTERNS.md](odoo-reference/PATTERNS.md) and [DECISIONS.md](odoo-reference/DECISIONS.md). The image specifications were reviewed, but no Phase 2.5B running-app capture or side-by-side comparison was made. Visual matching and manual acceptance remain open; no pixel-parity claim is made.

Verification after the final backend change: root TypeScript build and `npm run typecheck` passed; focused isolated SQLite CRM workflow suite passed **53/53**; generated workspace OpenAPI validated **464 operations** after removing a nondeterministic generated UUID default; and `git diff --check` passed. Website production build and content/app tests passed **133/133** immediately before this backend-only correction; it was not rerun because the final correction does not touch website source. No PostgreSQL suite, live/hosted data, app deployment, commit or push was run. No non-test database migration was applied.
