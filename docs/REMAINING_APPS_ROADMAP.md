# Remaining application roadmap

Prepared 2026-11-20 from the existing app/service catalog, current architecture and Odoo 20 reference notes. Build order: **Calendar → Website → Marketing → Support → Subscriptions**. This is a sequencing proposal; it does not add those apps or change catalog entitlements in the current checkpoint.

## Shared delivery gates

Every app must reuse existing workspace membership, service entitlements, canonical records, server-side authorization and audit history. First ship a read-only source-backed register and navigation, then forms/transitions only when an existing or explicitly reviewed canonical authority supports them. Keep installed-app surfaces distinct from shared services. Each phase needs backend lifecycle tests, role/cross-workspace tests, responsive browser captures and exact-source reporting. Don't announce an integration until the provider and a real success response exist.

## 1. Calendar — next

### Product boundary and dependencies

Calendar is shared meeting/event scheduling, not a duplicate task planner. Work owns task dates and task dependencies; Calendar may link to those records and display due dates only with current Work access. Reuse Contacts for attendee identity, Notifications for reminders, CRM activities for lead meetings, People for permission-filtered leave visibility, Documents for authorized links, and the current workspace timezone settings. Do not create separate People, task, CRM or contact authorities.

### Navigation and screens

- App nav: Calendar; My Calendar; Team; Invitations; Settings.
- Day, week, month views with timezone display and current-date navigation.
- Event register and detail form: subject, start/end, timezone, attendees, location/link, description, recurrence, visibility, reminders, linked source record and state.
- Invitation inbox with accept/decline/tentative and organizer response visibility.
- Availability picker with conflict warnings and team resource access; never reveal private event titles to unauthorized viewers.
- Create/edit dialog with attendee search and clear validation. Series edits must offer an explicit scope (this event/future/all) if recurrence storage supports it.

### Lifecycle and acceptance

Draft → invitation sent (only if a delivery path exists) → accepted/tentative/declined responses → updated/cancelled/completed. Without configured outbound delivery, label invitations as pending in-app and don't claim an email was sent. Use idempotency on create and response, version checks on edits, UTC storage with IANA timezone display, recurrence expansion caps and explicit DST behavior.

Acceptance: create a cross-timezone meeting; invite two authorized members; accept/decline separately; reject overlaps or explain them; test daily/weekly recurrence across DST boundaries; cancel/update series; confirm reminders appear only through Notifications; link a CRM activity and Work task without changing source dates; verify People leave dates are visible only to permitted viewers; ensure documents and attendees do not bypass source permissions.

### Build phases

1. Calendar event authority, day/week/month views, timezone and single-event create/edit/cancel.
2. Attendees and in-app invitations/responses, availability and conflict detection.
3. Recurrence/reminders and permission-filtered integrations with Work, CRM, People, Documents and Notifications.
4. Reporting, imported/exported calendar formats or external sync only after provider and security review.

## 2. Website

### Boundary and dependencies

Website is a site/page publishing and composition app. Commerce remains canonical for products, public shop, cart and checkout. Website can embed or link to the published Commerce shop; it must not manage a second catalog or cart. Reuse the reviewed typed page-section/publication/media model and host/slug mapping; never accept arbitrary scripts or private Documents paths as public content.

### Navigation and screens

- Overview, Pages, Menus, Theme, Media, Publication, Settings.
- Page list with draft/published state, version and preview; typed section editor; navigation tree; brand colors/fonts from approved design tokens; media selector restricted to reviewed public assets.
- Preview must use the selected immutable draft projection, distinguish preview from published URL, and explain unavailable custom domains.
- Publish/unpublish review shows the exact public projection and current references; rollback creates a new publication version rather than rewriting history.

### Acceptance

Build a multi-page site, reorder sections/menu, preview draft, publish and open anonymous route, edit and republish, unpublish and confirm stale content is withdrawn. Confirm embedded shop links to Commerce without cloning product or payment data; test media withdrawal, route collision, cross-tenant isolation, sanitizer/schema rejection and responsive pages.

## 3. Marketing

### Boundary and dependencies

Marketing manages consent-aware campaigns and segments over canonical Contacts/CRM. It does not become a second contact database or messaging provider. Reuse current consent/suppression records, allowed templates, Notifications/audit, and supported email configuration only after real delivery capability is provisioned.

### Navigation and screens

- Overview, Campaigns, Audiences, Templates, Activity, Settings.
- Campaign register and editor (draft/review/scheduled/sending/sent/paused/cancelled), recipient count with source coverage, consent/suppression preview, template preview, schedule in explicit timezone, execution results and retry controls.
- Saved segment builder limited to server allowlisted fields/operators. Personalized content is escaped and sensitive People/finance fields are unavailable.

### Acceptance

Preview a campaign on synthetic contacts, verify opt-outs and suppression are applied immediately before dispatch, test idempotent send/retry and partial provider failures, ensure unsubscribe is durable, verify duplicate suppression and do-not-contact, and prove audit results distinguish simulated delivery from provider-confirmed delivery. No open/click rate unless the provider reports it.

## 4. Support

### Boundary and dependencies

Support owns customer support tickets and SLA clocks, with a public reply channel only through an authorized customer capability. Reuse canonical Contacts and Documents attachments with ticket-scoped access; link to Orders/Commerce without granting financial or staff access. Notifications remain the alert authority.

### Navigation and screens

- Inbox, My Tickets, Teams, SLA, Reports, Configuration.
- Dense searchable/filterable ticket register, kanban by lifecycle, ticket detail with customer/order, priority, category, owner/team, due time, messages, internal notes clearly separated, linked authorized files, assignment and close/reopen transitions.
- SLA policy editor supports business hours/timezone, pause conditions and escalation destination only where an actual internal notification path is available.

### Acceptance

Create an anonymous/customer ticket through scoped capability; exchange public response while internal note stays private; assign and transition; check SLA clock through business hours/pause; attach/revoke file access; link order read-only; test spam/rate bounds, customer capability expiry and cross-tenant denial. No email/WhatsApp delivery claim without provider confirmation.

## 5. Subscriptions

### Boundary and dependencies

Subscriptions manages recurring commercial agreements, not payment mandates. Reuse canonical Sales, Invoicing, Customers and Payments. Every generated invoice must retain the agreed plan price, taxes/currency and occurrence identity; only existing invoice approval/posting authority may post. No automatic debit or recurring revenue claim without a real provider mandate and confirmed settlement.

### Navigation and screens

- Plans, Contracts, Renewals, Invoices, Reporting, Configuration.
- Plan register with billing interval, currency, price/version and optional trial; contract form with customer, plan snapshot, start/end/renewal policy and explicit status; renewal queue; occurrence/invoice history and source drilldown.
- Lifecycle: draft → active after authorized acceptance → renewal due → renewed/ended/cancelled; pause/resume and proration only when precisely specified and supported by ledger policy.

### Acceptance

Create a plan and contract, change plan while preserving old price history, generate one occurrence idempotently, verify invoice draft and approval boundaries, retry a failed run without duplicates, end/cancel and retain history, test timezone/date anchors and currency separation. Confirm no debit is attempted and no settled status appears without canonical provider proof.

## Later catalog — separate gated proposals

- **Manufacturing:** bill of materials, work centers, planned production, consumption and finished stock movements; depends on qualified Inventory/Procurement/Quality. No production order may write stock outside canonical movement controls.
- **Field Service:** dispatch and onsite work linked to Work/Inventory/People/Calendar; location/route/tracking require explicit privacy and device consent.
- **Rental:** time-bounded reservations, availability, pickup/return, deposit and damage evidence linked to Products, Inventory and Finance; no assumed custody or deposit settlement.
- **Quality:** inspection plans, checkpoints, lots and disposition; quarantine must be an explicit Inventory state transition.
- **Maintenance:** equipment, preventive/corrective requests, downtime and parts, connected to Inventory and Work; avoid claiming machine telemetry absent an integration.
- **AfriCore Studio:** only after core application closure; isolated, permissioned customization with schema/version review, audit and safe rollback. No arbitrary server code or bypass of tenant/data boundaries.

Before adding these entries to the app catalog, close the original 14-app items in [`APP_EXPANSION_CLOSURE.md`](APP_EXPANSION_CLOSURE.md), qualify PostgreSQL and hosted release gates, and complete founder acceptance for the recently expanded apps.

## 26-app catalog update — Phase 3 local checkpoint, 20 November 2026

The maintained target catalog remains 26:

| # | App | Status / purpose |
|---:|---|---|
| 1–14 | Commerce, Finance, Sales, Inventory, CRM, Procurement, Accounting, POS, Work, People, Documents, Analytics, Automations, Business ID | Existing apps; consult the separate original-app closure matrix. |
| 15 | Calendar | Registered local app; event/invitation core and day/week/month shell implemented; recurrence, availability, appointments and integrations remain. |
| 16 | Website | Registered local app; typed page editor and immutable snapshot publication core implemented; menus/forms/media/product sourcing and full lifecycle remain. |
| 17 | Marketing | Campaigns, audiences, templates and consent-aware delivery over canonical CRM/Contacts. |
| 18 | Support | Tickets, inbox, teams, SLA and scoped customer replies. |
| 19 | Subscriptions | Plans, contracts, renewals and invoice occurrences without payment mandates. |
| 20 | Manufacturing | BOM, work centers, production planning and canonical stock movements. |
| 21 | Field Operations | Dispatch and onsite workflows using Work/Inventory/People/Calendar. |
| 22 | Logistics | Shipment planning, carriers and tracking only after providers/authority exist. |
| 23 | Property & Hospitality | Property/unit and reservation/guest workflows over existing shared records where possible. |
| 24 | Knowledge & Learning | Published knowledge base and learning paths, separate from private Documents blobs. |
| 25 | AfriCore Studio | Governed low-code metadata and workflows; no arbitrary executable surface. |
| 26 | Integrations Hub | Connectors, credentials, scopes, webhooks and health; reuses existing integration services. |

Apps 17–26 remain roadmap-only. Do not implement them in this assignment. Each must reuse canonical customer/product/order/finance/document authorities, use workspace/role-scoped data boundaries, have app navigation and lifecycle tests, and pass app-specific founder acceptance before installation is enabled. Suggested order after Phase 3 closure: Marketing → Support → Subscriptions → Manufacturing → Field Operations → Logistics → Property & Hospitality → Knowledge & Learning → Studio → Integrations Hub. This order is provisional and subject to dependency review.


## Phase 3 sequencing update — 20 November 2026

Marketing and Support remain the next roadmap apps and were not started. Do not begin them until Calendar and Website close their remaining acceptance work in [PHASE3_ACCEPTANCE.md](PHASE3_ACCEPTANCE.md). As of 21 November, recurrence/availability and Website identity/media/forms/publication-history slices exist locally, but appointments, reminders, integrations, complete SEO/public routing/Commerce support, PostgreSQL regression, Render evidence and matched-size Odoo review remain outstanding.

### Phase 3 current status — 21 November 2026

The implementation table above is an earlier checkpoint. Calendar and Website remain partial. Current implemented and verified slices, local tests, browser scope, and release blockers are tracked in [PHASE3_ACCEPTANCE.md](PHASE3_ACCEPTANCE.md). Marketing and Support have not been started.

## Phase 3 status, 21 November 2026

Calendar has an authenticated internal appointment type and booking slice; Websites now set page title, description, robots, Open Graph and canonical metadata in the public renderer. These are not completion claims. Public appointment capability, capacity and lifecycle management, Calendar cross-app integrations, Website sitemap/redirect/domain mapping and full visual editor interactions, production publication verification and hosted migration recovery remain work for Phase 3 acceptance. No Marketing or Support app was started.

### Updated Phase 3 state — 21 November 2026

Calendar now also has recurrence exceptions, work-hour availability, reminders, event history and member appointment rescheduling/cancellation. Website now has public media withdrawal safeguards, sitemap routing, and a Commerce-backed product showcase. The apps remain partial: public appointment capabilities and Calendar cross-app links, live public Website production verification and Odoo-matched visual acceptance, disposable PostgreSQL, and hosted Render ledger/readiness remain open. Marketing and Support stay deferred.

### Phase 3 local continuation — 21 November 2026

Calendar now links meetings to assigned Work tasks, with server-side Work project reauthorization and navigation back into Work's scoped task view. Focused API coverage verifies access denial for a member outside the task's project. The selector is build-verified but not browser-verified. CRM, Sales, People leave and Documents integrations, public appointment capabilities/requests/capacity and full visual acceptance remain outstanding. The latest full backend run passed 489 tests, failed 0 and skipped 1 PostgreSQL-only test. No Marketing or Support work started. Hosted Render recovery still needs read-only migration ledger and backup evidence; no hosted operations were run.

Calendar also supports links to active CRM leads/opportunities with current CRM service checks and same-tenant record validation; opening a link targets the record inside CRM. The full backend run including both integrations passed 489 tests, 0 failed, 1 PostgreSQL-only skipped. CRM/Work link browser interaction, Sales/People/Documents links, public appointments and remaining release acceptance are still open. Marketing and Support remain deferred.

Latest local slice: Calendar's People leave overlay uses the People app's permission-filtered approved-leave API and renders private-reason-free, read-only all-day markers; Website Editor has session-local undo/redo. Current full suite is 489 passed with one PostgreSQL-only skip, and Website content checks are 144/144. These additions do not change the remaining P0 hosted Render migration/readiness evidence or P1 public appointment, cross-app, browser and Odoo comparison work.

Calendar events can also link to Sales quotations. Writes verify active Sales access and same-workspace quotation identity; the UI lists canonical Sales records and routes the selection to Sales' quote preview. Focused HTTP integration passed 6/6, Website build/content passed 144/144, and root typecheck/lint passed. The new selector has not been browser tested; public appointment links, Documents linking and hosted/visual acceptance remain outstanding.

### Calendar and Website follow-up — 21 November 2026

Calendar now supports source-authorized links to Work tasks, CRM leads/opportunities, Sales quotations and Documents files, plus a permission-filtered approved People leave overlay. Website galleries now accept up to 12 unique reviewed media items and reject withdrawal while active publications reference any gallery item. Anonymous Website forms also have a separate in-process 10-per-minute IP limit. These are local implementation slices; public appointment capabilities/capacity, production host/media/form verification, full browser/Odoo comparison, hosted Render readiness and PostgreSQL CI diagnosis remain open. Marketing and Support remain deferred.

## Current Phase 3 boundary — 22 November 2026

The latest full local suite is 491 passed, 0 failed, 1 PostgreSQL-only skip; API route checks and Website build pass. Synthetic browser checks confirmed both cards and install/open paths; Calendar week layout and Website draft lifecycle were exercised. Website sandbox publication has no public URL. The remaining critical work is hosted migration/backup/readiness evidence and CI PostgreSQL diagnosis, plus anonymous appointment capabilities/capacity and broader Website production publication, forms/media/SEO and Odoo visual/browser acceptance. This batch is not closed.

### Phase 3 local acceptance update — 22 November 2026

Website now has an explicit administrator-controlled handoff from inquiry inbox to canonical CRM lead. The new action is idempotent and clears the encrypted inbox payload after success. Latest suite and checks are detailed in [DEPLOYMENT_TEST_RESULTS.md](DEPLOYMENT_TEST_RESULTS.md). Calendar public booking capabilities and capacity workflows, full Website multi-site identity and builder/SEO/publication acceptance, production browser routing, Odoo comparisons, PostgreSQL, current CI failure diagnosis, hosted migration ledger/backup readiness and Render readiness remain open. Marketing and Support remain deferred.

### Phase 3 continuation — 22 November 2026

Calendar now has a public capability-link/request/review lifecycle (migration 028), Calendar owner controls, and a visitor page. Focused API and edge-gateway checks pass; these flows still need browser verification. Remaining acceptance includes Calendar recurrence/invitation/integration browser scenarios; Website editor/menu/media/SEO/publication and production host requirements; formal Odoo comparison; PostgreSQL/CI diagnosis; Docker; and hosted migration/backup/readiness. Marketing and Support remain deferred.

The latest full local backend regression after Calendar public booking passed 493 tests with 0 failures and 1 PostgreSQL-only skip (494 total); Website build/content 146/146, Cloudflare 12/12, Render verifier 5/5 and development-config 6/6. It does not close current CI/PostgreSQL, browser/Odoo, production Website, or hosted Render migration/readiness gates.
## Superseding local acceptance record — 22 November 2026

A fresh disposable PostgreSQL 17 cluster ran the full PostgreSQL suite after the Calendar capacity-upsert correction: 494 passed, 0 failed, 0 skipped across 21 suites. This supersedes earlier notes that reported only a partial PostgreSQL rerun. The isolated cluster was stopped afterward; no hosted database was contacted.

A synthetic Business workspace was opened through the isolated in-app browser. Browse Apps showed AfriCore Calendar and AfriCore Website. Website search returned its card. Each installation preview resolved its required free evaluation service; both installations succeeded, each workspace opened, and refresh preserved both installations. Returning to Browse Apps showed Open controls for both. Calendar week view and Website Overview screenshots were inspected in-session; image files were not exported as repository artifacts.

The local development database was inspected read-only: migrations 021, 026, 027 and 028 are present; Calendar and Website exist in ac_services with current evaluation-v1 KES price rows. No database mutation was performed during this inspection.

Phase 3 remains open. The hosted Render migration ledger, backup readiness and post-deploy readiness are unavailable; the CI PostgreSQL failure lacks step logs. Full Calendar recurrence, invitation, availability, appointment and integration acceptance and the full Website editor, media, SEO, anonymous forms, publication-host and commerce matrix remain incomplete or unverified. No commit, push, hosted migration or deployment was performed. Marketing and Support remain deferred.
## Final local regression update — 23 November 2026

After adding the hosted migration prerequisite preflight and correcting a Nairobi-local analytics test date, a fresh disposable PostgreSQL 17 cluster ran npm run test:pg: 497 passed, 0 failed, 0 skipped, 21 suites. Root build was part of that command. Typecheck, lint, migration-runner syntax and diff checks also pass. The isolated cluster was stopped and removed.

The migration runner now checks Phase 3 prerequisites in dependency order before any migration DDL and reports all missing version IDs: phase3-calendar requires 021-people-expansion, 026-app15-16 and 027-website-forms before target 028-calendar-appointments. This is a local code hardening only; the runner was not pointed at hosted PostgreSQL. Render's actual migration ledger and backup/restore status remain unavailable, and Phase 3 is not closed.

### Phase 3 handoff gate — 23 November 2026

Marketing and Support remain next only after Calendar and Website acceptance. Phase 3 is still open pending hosted Render migration-ledger/backup evidence, current CI and readiness, post-fix browser confirmation of public Calendar booking, full browser acceptance, and Odoo desktop/mobile comparison. Local test counts and known limitations are recorded in `PHASE3_ACCEPTANCE.md`.
