# Calendar implementation — Phase 3 local checkpoint

Status: **first functional slice implemented; full Calendar scope is incomplete**.

## Authority and API

Calendar uses the existing encrypted ERP record store (`calendar_event`) with workspace/environment scoping, current-membership attendee validation, record grants, optimistic version checks on organizer edits/cancellation, and idempotent create/update/respond/cancel operations. Event instants must include offsets and are stored as UTC ISO strings with the submitted IANA timezone. Invalid timezone and end-before-start values are rejected. The app install references the single `calendar` service.

Routes under `/api/v1/organizations/:org/calendar/events` list/create events, update an event, respond `accepted`/`declined`/`tentative`, and cancel it. Invitations create notices via the existing Notifications helper; delivery is in-app only. Private event titles and descriptions are redacted server-side as `Busy` for unrelated workspace owners/admins. Attendees are validated against current workspace membership; invitations cannot add a user to a workspace.

## Interface implemented

The Calendar workspace includes day/week/month selection, date navigation, a date picker, attendee visibility toggles, all-day and timed-event display, and a compact create dialog with title, start/end, timezone, attendees, location, meeting link, all-day and description. Local wall-time input is converted through the selected IANA zone and rejects nonexistent DST-gap times. Invitation response actions update the server.

## Open implementation gaps

This checkpoint does **not** implement reminders, working-hours or team availability, conflict suggestions, resource booking, appointment types/public booking, accessible attendee filtering by separate roles, full organizer selection, activity links to CRM/Sales/Work, People leave projection, Documents references, durable automation lifecycle triggers, or email/calendar provider integrations. No external invitation delivery is claimed.

## Tests and visual evidence

`src/__tests__/phase3-apps.test.ts` covers reviewed independent activation, in-app invitation creation/response and private-event redaction. UI reference screenshots supplied by the user were reviewed; no running browser comparison at matched desktop/mobile sizes was completed. Odoo source notes cite `addons/calendar/models/calendar_event.py`, `calendar_recurrence.py`, `calendar_attendee.py`, and `tests/test_access_rights.py`. Official Odoo 20 docs fetch timed out; the supplied UI captures are Odoo 19.

## Calendar repair checkpoint — 20 November 2026

The Calendar UI now normalizes team-member IDs from id to user_id, supports opening events for version-checked edits and cancellation, includes meeting search and creates from hourly slots. In synthetic browser checks, a meeting was created, edited, cancelled and hidden after cancellation; the app remained installed after refresh. The editor no longer offers recurrence intervals because durable recurrence behavior is not implemented. See [Phase 3 acceptance](PHASE3_ACCEPTANCE.md). Recurrence/exception series, reminders, availability, appointments, conflict suggestions, cross-app links and several acceptance cases remain open; this app is not complete.

## Odoo 20 behavior reference — 21 November 2026

The official Odoo 20 Calendar guide describes creating an event by selecting a slot, choosing a date/time or all-day span, managing attendees, adding a virtual meeting URL/description, and configuring recurrence, timezone and reminders in the expanded event form. It also documents showing/hiding individual attendee calendars and sharing selected availability slots. AfriCore's recurrence support is recorded below; availability and reminder behavior remain open. See [Odoo 20 Calendar](https://www.odoo.com/documentation/20.0/applications/productivity/calendar.html) and [Odoo 20 Appointments](https://www.odoo.com/documentation/20.0/applications/productivity/appointments.html). The official docs search result was readable; direct docs fetch and GitHub source-tree fetch timed out in the research tool. Supplied Calendar screenshots are Odoo 19 references.

## Recurrence implementation continuation — 21 November 2026

Calendar now stores interval/end/weekdays rules and per-occurrence exceptions on the existing encrypted versioned event record. The API expands only the requested period (maximum 370 days) and caps output at 5,000 instances. Daily, weekly, monthly and yearly instances preserve the series' local wall time; monthly and leap-day dates clamp to the target month's last valid day. DST-gap wall times are omitted. The UI offers interval, weekly day selection, never/count/date endings, and scope selection between one occurrence and the series. One occurrence can be moved at most 366 days and each series accepts at most 1,000 exceptions. Series writes remain optimistic-version checked; occurrence changes create normal ERP history snapshots and in-app attendee notifications.

Pure tests passed 5/5 for DST, month-end, weekly interval, count across a later query window, and moved/cancelled exceptions. The HTTP integration test passed for five generated weekly occurrences, one move, one cancellation, and rejection of a range over 370 days. Browser interaction, yearly leap-day and weekly weekday UI, and production PostgreSQL qualification remain unverified. Reminders, availability, appointments, cross-app event linking and Odoo screenshot comparison remain open.

Personal calendar settings and availability now use the existing encrypted ERP store. Members can configure timezone, weekly work hours and explicit team-sharing preference. Team availability returns only merged busy intervals and opted-in work hours; it never returns event titles or private details. The UI displays shared hours, busy/free periods and candidate one-hour windows only when every selected member shared work hours. Availability spans are limited to 31 days and 50 selected current members. Focused API tests confirm work hours are private by default, shared after explicit opt-in, and busy output omits event titles. Browser acceptance and PostgreSQL qualification remain open. Settings/Availability and My Calendar/Team Calendar now route to their respective workflows.

## Continuation — 21 November 2026

The all-day recurrence calculation now preserves local calendar-day duration across DST offset changes. A yearly leap-day series clamps to the final valid day of February in non-leap years; the original anchor is retained so later leap years return to February 29. Added pure cases cover leap-year clamping and a one-day event spanning the spring DST transition.

Calendar availability endpoints:

- `GET /calendar/settings` returns the current member's timezone/work hours and sharing preference.
- `PUT /calendar/settings` saves them as encrypted actor-owned ERP history.
- `GET /calendar/availability?from=...&to=...&members=...` accepts at most 31 days and 50 current members. It returns merged busy intervals and only opted-in work hours. It does not disclose event names, locations or attendee lists.

The endpoint implementation has focused synthetic API coverage. Browser acceptance, year/leap and all-day DST execution in the latest full suite, and PostgreSQL persistence verification remain separate states. Appointments, reminders, cross-app source links and Calendar event history UI remain unimplemented.

### Current status correction — 21 November 2026

The latest full backend run now includes leap-day and all-day DST recurrence cases (485 passed, one PostgreSQL-only skip). Calendar also has timezone/work-hours settings and privacy-limited availability/suggested windows. In the synthetic browser, the recurring-event form displayed frequency, interval, weekday, and ending controls; this pass did not save a recurrence. No browser pass covers recurrence exceptions, attendee responses, availability, or desktop Odoo comparison. Appointments/public booking, Automations-backed reminders, event history UI, and CRM/Work/Sales/People/Documents integrations remain unimplemented. Calendar remains incomplete.

### Calendar reminder slice — 21 November 2026

Personal Calendar Settings now include a reminder choice (none, 5/15/30/60 minutes, or one day). Existing `processOperations` checks the Calendar entitlement and schedules due notices through `ac2_events` and the existing business notification consumer; no second scheduler or migration was added. Reminder deduplication includes event, occurrence start, recipient and interval. The durable event payload carries only event ID, recipient ID and UTC start; notification display uses the recipient's IANA timezone and a generic body, without event title/description. The notification receipt pipeline retries unprocessed events on the next worker pass. No email delivery is claimed and a sleeping worker can delay notices.

Focused `phase3-apps` integration coverage verifies two members receive independently configured reminders, repeat worker passes do not create duplicate notices, and notification text omits the private title. Calendar history is available to the event organizer through `GET /calendar/events/:id/history`; it returns at most 50 encrypted ERP snapshots projected to version/action/time/title/schedule fields, and denies invitees. The UI exposes history in the organizer's event dialog. The full backend suite completed with 485 passing tests, zero failures and one PostgreSQL-only skip, including organizer access and attendee denial. The calendar canvas now lays out overlapping events in separate columns, clips overnight events to each day, includes all 24 hourly slots, marks the current time, and shows a month overflow action that opens the selected day. Pure Calendar layout tests cover overlaps, sequential reuse, overnight clipping and all-day exclusion. Website production build/content checks passed 138/138 and lint passed. Browser interaction of the new canvas, history panel and reminder preference, PostgreSQL durability and multi-day recurrence reminder execution remain unverified. Appointments/public booking and cross-app integrations remain open.

### Member appointment slice — 21 November 2026

Calendar now has an Appointments navigation section. Operational users can create member-only appointment types with a title, 15–480 minute duration, IANA timezone and one or more current workspace staff members. Current workspace members can select a type and start time; the server checks every assigned staff member's busy calendar in the same transaction before confirming, creates a linked Calendar event and sends generic in-app invitations. Duplicate or newly conflicting times return HTTP 409. The appointment record and event use the existing encrypted/versioned ERP object store; no migration or second scheduler was added. Anonymous/public booking, capacity beyond staff availability and request/approval states remain unimplemented. Reschedule/cancel use the standard Calendar event editor and cancellation flow, as documented in the later appointment lifecycle continuation. Focused integration coverage includes type creation, listing, confirmation and conflict rejection.

## Phase 3 continuation, 21 November 2026

Calendar appointment types now support authenticated member booking with staff free/busy checking and linked Calendar events. Final focused API integration: 5 passed, including a viewer booking and conflict rejection. The frontend exposes appointment type creation and a booking form. Public anonymous booking, appointment capacity/approval lifecycle and browser acceptance remain open. Calendar client canvas/history/reminder and recurrence browser acceptance remains unverified. Full backend run: 486 passed, 0 failed, 1 PostgreSQL-only skip; the final focused Phase 3 test was rerun after the appointment authorization update.

## Latest acceptance additions — 21 November 2026

Appointment type records now support owner/admin version-checked activation and deactivation; inactive types reject new bookings. The final focused integration file passed 5/5 after this lifecycle change. Calendar APIs now register 554 workspace operations. Website Pages can duplicate a page into a draft with a unique slug and no inherited published URL. The public page renderer supplies client-side title/description/robots/Open Graph/canonical metadata. Website build/content tests passed 138/138 with these UI changes.
# Appointment lifecycle continuation — 21 November 2026

Appointments now appear in the Calendar Appointments register. Members can create appointment types, book against current staff availability, open a booking in the version-checked event editor to reschedule, or cancel it through the Calendar event cancellation workflow. Event updates preserve the appointment type and assigned staff, require the configured duration, and reject conflicts against staff busy intervals while excluding the event being moved. Focused HTTP coverage verifies conflict rejection and a successful move into free time. The register currently uses the Calendar event query window (six months around the selected date).

This remains workspace-member booking only. Anonymous capability links, booking requests/approval, capacity, public rescheduling/cancellation and a separate appointment audit register remain unimplemented. Rescheduling uses the standard event editor and event history.

## Appointment type selection follow-up — 21 November 2026

The booking form now lists active appointment types only and resets its selected type if that type is deactivated. The management list retains inactive types and their Activate control. This prevents a disabled type from appearing bookable while preserving its history. Typecheck, lint and Website production build/content checks (142/142) passed after this UI change. Pure tests cover active-only and empty bookable lists. No new browser appointment interaction was performed in this follow-up.

## Appointment browser acceptance follow-up — 21 November 2026

At the synthetic 550px browser viewport, an active 30-minute appointment type was created, a member booking was confirmed, its time was changed from 15:21 to 16:00 through the Calendar event editor, and the appointment was cancelled. The first reschedule submit exposed an API validation error because the editor included read-only `organizer_id` in the strict update body. The client now removes that field before sending edits. After rebuilding, the same reschedule succeeded and the booking register showed the new time; cancellation then removed it from the active six-month register. The flow used only the ignored disposable demo SQLite DB. Typecheck is included in the successful Website TypeScript production build; the Website content suite passed 142/142. Multi-member conflicts and responsive desktop/Odoo comparison remain open.

The latest full backend regression after Website's Commerce showcase schema update passed **488 tests, 0 failures, 1 PostgreSQL-only skip**. Calendar's existing recurrence, history, availability, reminders and member appointment behavior are included in that suite. Public appointment capabilities/requests/capacity, full recurrence browser acceptance and matched-size desktop comparison remain unimplemented or unverified.

### Calendar ↔ Work task links — 21 November 2026

Calendar meeting create/edit now accepts only the declared appointment-type or Work-task link forms. Work task links are reauthorized against the current workspace and Work project access on every write; the Calendar link does not grant a Work record permission. When Work is installed, the event editor lists tasks assigned to the current member. A linked task can be opened through Work's own scoped `work_target` navigation and authorization. When Work is not installed, the editor explains that requirement. Focused integration verifies valid link creation, rejection of unsupported link kinds and denial for a workspace member outside the project's access list. The full backend suite then passed 489 tests, 0 failures and 1 PostgreSQL-only skip. The selector and launch control have not yet been browser exercised. CRM, Sales, People leave and Documents links, public booking capabilities, appointment requests/capacity, and desktop Odoo comparison remain open.

### Calendar CRM meeting links — 21 November 2026

Meeting links also support active CRM leads and opportunities. Event writes require current CRM service access and validate that the target is active in the same organization and environment. The editor lists the CRM API's first 100 entries filtered to leads/opportunities when CRM is installed. “Open linked CRM record” routes to the CRM pipeline with its `crm-record` selection so CRM reloads the target through its own API. Focused integration passed for the CRM link and rejection of unsupported link kinds. UI build verification is complete; browser interaction remains open. Sales, People leave and Documents integrations are still outstanding.

The combined Calendar CRM/Work link test and full backend regression passed. The latest result is **489 passed, 0 failed, 1 PostgreSQL-only skipped** (490 total tests). Typecheck, lint and Website production build/content checks passed; link selector browser interaction remains unverified. Public appointment capabilities, approval/capacity, Sales, People leave, Documents, PostgreSQL and desktop Odoo comparison remain open.
# People approved-leave overlay — 21 November 2026

When the People app is installed and the current member is allowed to read the People leave calendar, Calendar now requests approved leave for its visible date range and renders read-only all-day markers. It uses the People endpoint's authorized employee name and label, omits private reasons, and does not create a Calendar event or grant access back to the leave record. Unauthorized/unavailable People leave reads remain hidden with an explanatory state. Website production build/content tests passed (144/144); dedicated tests cover approval filtering, multi-day expansion, private-reason omission, malformed dates and bounded ranges. Root `npm test` passed 489 tests with 0 failures and 1 PostgreSQL-only skip. Root typecheck, lint/architecture checks and `git diff --check` passed. A multi-member permission browser check is still required.
# Calendar Sales quotation links — 21 November 2026

Calendar events can now reference a canonical Sales quotation. Event creation and editing require the current Sales service and a quotation from the same organization/environment; the Calendar link does not grant quotation access. The editor lists quotations from the installed Sales workspace and opens the linked quotation through Sales' own detail preview, which also resolves the selection from the URL after refresh. Focused HTTP integration passed 6/6, including a valid quote link and rejection of an unknown quote ID. Website build/content checks passed 144/144; typecheck and lint passed. The selector and launch control have not yet been browser exercised.

### Calendar Documents links — 21 November 2026

Calendar event links now support existing Documents files. Event creation and editing call the current document access check in the same workspace; Calendar does not grant access. Its picker lists only member-visible files and excludes personnel files, and opens the source document through Documents. Focused Phase 3 integration passed 6/6, including a private file link and a second member's denied attempt. Typecheck, lint, Website build/content (144/144), and the focused HTTP suite passed. Browser interaction remains unverified.

### Latest local regression and browser check — 22 November 2026

After adding explicit sitemap `noindex` exclusion, `npm test` passed 491/492 (one PostgreSQL-only test skipped); the focused Phase 3 API suite passed 7/7. Browser acceptance in a disposable synthetic Business workspace showed Calendar and Website in Browse Apps, Website search, successful installation previews, installation, opening and Website refresh persistence. Calendar week view displayed hourly slots, mini-calendar and attendee selector at desktop width; 550px layout was inspected. Website Contact template, hero block insertion and inline text edit, draft save, preview, sandbox publication and refresh were exercised. Sandbox correctly showed no production public URL. Calendar booking/reschedule/cancel had a previous synthetic browser pass. A complete recurrence/invitation/integration suite and formal Odoo visual parity comparison were not completed. The phase remains incomplete.

## Public appointment lifecycle — 22 November 2026

Calendar owners/admins can create/rotate or revoke a capability URL for an active appointment type. The page returns only bookable start instants, using public weekdays/hours and busy-time checks with staff identities and event titles removed. Visitor details are encrypted at rest; capability tokens are stored as hashes. Requests reserve per-slot capacity transactionally, replay by request key, and appear in the Calendar owner inbox. Owners can confirm or decline; confirmation creates a canonical Calendar event with a currently available staff member. Visitors can request reschedule/cancellation using a second scoped capability; owners review changes and the request has immutable status/date history. External email delivery is not claimed.

Focused synthetic HTTP acceptance passes for link creation, anonymous metadata/availability, privacy/encrypted storage, duplicate replay, capacity rejection, request rescheduling, confirmation, confirmed rescheduling, cancellation approval and history. Cloudflare method/path checks pass. The public page and owner controls compile but still need browser verification. Migration `028-calendar-appointments` is local/additive and hosted application is not verified. Capacity applies per 15-minute start; staff assignment happens on confirmation.

Final local verification on 22 November 2026: full backend passed 493 with 1 PostgreSQL-only skip; the public booking lifecycle integration passed 1/1; typecheck, lint, platform validation (560), Cloudflare tests (12/12), Website build/content (146/146), and `git diff --check` passed. An attempted browser check of the anonymous booking page timed out before the page could be reached, so the new public UI remains API-tested and build-verified, not browser-verified. Recurrence edge cases, invitation and availability scenarios, team permissions, cross-app links, reminders, appointment UI, and Odoo-matched screenshots still need acceptance.

The public appointment lifecycle also passes under PostgreSQL after qualifying the booking slot's target `occupied` column in its capacity upsert. Full Phase 3 HTTP integration passed 9/9 against an isolated PostgreSQL 17 test database. This does not constitute a post-fix pass of the complete repository PostgreSQL suite or public UI browser acceptance.
## Superseding Calendar browser and database update — 22 November 2026

On a synthetic Business workspace, Marketplace installation and app launch succeeded. The Calendar week workspace opened with hourly slots, mini-calendar and attendee calendar controls; its screenshot was inspected during the browser session. The full disposable PostgreSQL 17 suite passes 494/494 after the slot-capacity SQL correction. The local migration ledger already contains 028-calendar-appointments; no hosted migration was run.

This does not close Calendar acceptance: recurrence exceptions and timezone/DST behavior, invitation interactions, team availability, public booking screens/capacity, reminders, source-app links, mobile layout and Odoo visual comparison are not all browser verified.

### Public Calendar URL routing repair — 23 November 2026

The synthetic owner flow generated a booking URL, but direct browser navigation returned Express JSON 404 because the SPA fallback omitted `/calendar/*`. Added the missing route and extended the route regression to cover booking and manage URLs; the focused Operations HTTP suite passed 20/20. The post-fix browser check could not connect to the fresh demo endpoint, so the anonymous UI route still needs browser verification. Do not treat the API lifecycle tests as proof of public production routing.
### Regression after migration preflight hardening — 23 November 2026

Fresh isolated PostgreSQL 17 full suite: 497 passed, 0 failed, 0 skipped. This includes the Calendar public-booking persistence path, slot capacity upsert and the new maintenance preflight tests. Hosted migration ledger and readiness remain unverified.

### Phase 3 status update — 23 November 2026

The current implementation includes recurrence and exceptions, invitations and responses, timezone-aware availability, appointment types and capacity-scoped public booking, request management, reminders, and scoped links to supported source records. The anonymous booking and management page routes now reach the Website SPA shell; this fixes the observed Express 404 and direct route tests pass. The repaired route timed out in the attempted post-fix browser session, so page rendering is not yet browser-verified. The full local backend suite passes 496/497 with only the optional PostgreSQL test skipped; an isolated PostgreSQL 17 full suite previously passed 497/497 before the SPA-only route change. Calendar workflows and Odoo layout comparison still need the complete browser acceptance matrix; this app is not release-accepted.

### Redirects, appointment concurrency, and connected browser checks — 23 November 2026

Renaming and republishing a Website page retains its old HTML path as a same-site 308 redirect to the page's current publication. Publication history restoration can return to the old path. A different page cannot claim the retained Website path, and withdrawn publications disable their redirects. The Worker accepts only a marked relative Website redirect. This uses existing ERP storage and adds no migration. The SQLite and PostgreSQL 17 focused suites passed 10/10, including concurrent booking replay, competing organizer approvals, and the Website redirect lifecycle. Gateway tests passed 12/12.

In a fresh synthetic Business workspace, the in-app browser displayed Calendar and Website as installable. Both required-service previews resolved, installation opened each workspace, and both showed as installed after reload. The browser created a Contact draft, edited its title, and observed the save confirmation. Calendar saved and displayed a synthetic meeting. The Calendar Appointments screen created a synthetic type and booking link. The direct public route displayed date-specific availability, accepted an inquiry, then rendered the pending booking management screen. Browser inspection found and confirmed the Marketplace text-overlap fix. Desktop screenshots were emitted in the browser trace. Full mobile and Odoo comparison, screenshot export, hosted readiness, and the complete workflow matrix remain outstanding.
