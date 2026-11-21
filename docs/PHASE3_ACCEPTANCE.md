# Phase 3 repair checkpoint — 20 November 2026

> **Status note — 21 November 2026:** Later continuations in this file supersede earlier checkpoint descriptions of current capabilities. The implementation remains incomplete; use the final continuation below for current state.

## Scope and baseline

This checkpoint worked from `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e` in `Sevqo/africore`. The founder asked for Calendar and Website marketplace visibility, Render diagnosis, and complete Calendar and Website applications. Work here is a repair checkpoint, not Phase 3 completion: several requested workflows are still absent and production deployment was not attempted.

## Marketplace diagnosis and repair

The current server catalog has 16 business apps. `appsFor()` filters by workspace kind and installation state only; it does not require a service to be active. Calendar and Website are `business` only, have `calendar` and `website` as exact required services, and appear as available cards when uninstalled. The served local Brave page at `localhost:5000` showed the older 14-app catalog, while no process was listening on the local website/API ports during inspection. The exact commit of the process that last served that stale page is unavailable, so the remaining explanation is a stale or mismatched local process/build; a source filter or inactive service did not cause the omission in the current code.

In a disposable synthetic Business workspace served from `.tmp/phase3-acceptance.db`, `GET /apps` rendered 16 cards, including Calendar and Website, with both required services in `available` state. `021-people-expansion` and `026-app15-16` were present in that disposable DB. Calendar and Website each resolved `evaluation-v1`, passed installation preview, installed, opened and remained installed after refresh. Browser screenshots were captured in the task session at the Marketplace and Calendar screens; this checkpoint does not check screenshot binaries into the repository.

Two additional defects were repaired:

- Calendar’s team endpoint returns a member identifier as `id`, while Calendar filtered events and populated attendee inputs by `user_id`. Normalizing the returned member ID made newly saved meetings visible and selectable. The editor now opens events and supports version-checked updates and cancellation.
- Website draft records include a `template` field, but the strict page update schema rejected it. The schema now accepts the supported `blank` template value. The editor now keeps a selected page ID in the URL, restores it after refresh, and exposes working draft menu reorder/add/remove, theme color/width, and SEO fields. Theme values now reach the draft canvas.

Browser verified on synthetic data: Calendar create, edit and cancel; Website page create, draft save, menu draft save, page deep link and refresh, sandbox publication, and unpublish. Sandbox publication correctly has no production URL. Calendar invitation response APIs are covered in the backend suite, but a second synthetic browser member was not set up for this run.

## Render and CI

The checked-in `render.yaml` remains fail-closed with `AFRICORE_MIGRATIONS_MODE=verify` and `/v1/readiness`. The repository now requires `021-people-expansion`, `026-app15-16`, and `027-website-forms` in the applicable schema verifier. The authenticated read-only Render dashboard shows [deployment `dep-dc08d315efls73b3m2p0`](https://dashboard.render.com/web/srv-dbr0fom1egvs73e3lnrg/deploys/dep-dc08d315efls73b3m2p0) failed at commit `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e`. Build and image push succeeded; `prepareDatabase()` rejected the incomplete migration ledger before readiness. The log does not identify the missing ledger IDs. Hosted ledger and backup status remain unavailable. No hosted migration, configuration change or deployment was performed.

Latest GitHub Actions evidence for the reviewed base is [run 125](https://github.com/Sevqo/africore/actions/runs/44785878428), successful for exact commit `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e`. This is baseline CI evidence, not CI for the uncommitted repair changes. Docker checks could not run because the Docker Desktop Linux engine pipe was absent. Local PostgreSQL testing was skipped by `npm test`; it reported 476 passed, 0 failed, and 1 PostgreSQL-only skip.

## Current verification

- `npm run typecheck` — passed.
- `npm run lint` — passed (architecture and fixture-isolation checks included).
- `npm run build` — passed via `npm run validate:platform` and `npm test`.
- `npm run validate:openapi` — passed, 59 mounted operations documented.
- `npm run validate:platform` — passed, 538 workspace operations checked.
- `npm test` — passed, 476 passed, 1 skipped because no disposable PostgreSQL service was available.
- `npm --prefix website run build` — passed; 135/135 website checks.
- `npm run test:render-deploy` — passed, 5/5 verifier tests. This tests the verifier, not a real Render deployment.
- `git diff --check` — passed.

## Calendar and Website limits still open

Calendar is not complete. Daily/weekly/monthly/yearly recurrence, bounded expansion, count/until/interval rules and per-occurrence edit/cancel exceptions are implemented in the versioned Calendar record. Recurrence pure tests passed 5/5 and the Calendar HTTP workflow test passed for expansion, moving/cancelling instances and rejecting oversized ranges. The recurrence UI has compiled but has not had a browser acceptance pass. Reminders, personal/team availability, work-hour settings, conflict suggestions, appointments/public booking, source integrations, HR/CRM/Work/Document links, and matched-size Odoo visual/browser acceptance remain incomplete or unverified. The recurrence implementation now uses no new migration or second scheduler.

Website is not complete. It still has no canonical website identity/settings record, media replacement/withdrawal UI, redirects/sitemap/canonical URL control, publication history/restore UI, true public production tenant/site mapping verification, or Commerce-sourced product renderer. Several block types still use a shared basic presentation contract. A published production URL was not exercised.

## Phase 3 continuation — 21 November 2026

The existing public-media subsystem is now usable from Website. Website-only activation is sufficient to list/upload and preview media; upload usage is metered to whichever allowed service is active, preserving Commerce metering when Commerce is active. Website page saves and publish recheck active organization/environment media references, and anonymous media delivery requires that the active production publication snapshot reference the image. The editor requires bounded JPEG/PNG/WebP uploads, descriptive alt text and explicit public-use/rights acknowledgements. Private Documents URLs cannot be attached.

Website contact-form blocks now render real required fields and explicit consent. The public submit endpoint accepts only an active production snapshot containing a contact block, applies the global IP limiter, validates payloads and uses a honeypot. Submissions are encrypted with organization/environment-bound context, visible only to current workspace administrators, and their content expires after 90 days (cleared when the inbox is next read after expiry). No email delivery or CRM handoff is claimed. Added additive migration `027-website-forms`; Render schema verification now requires it. It adds one scoped encrypted-submission table and index, enables PostgreSQL RLS and revokes public table access. No hosted migration was run; no isolated PostgreSQL rehearsal was available. Live Website activation is intentionally rejected in the synthetic environment, so accepted production submission persistence and public route behavior remain unverified.

The in-app synthetic browser verified the Website Forms administrator inbox/empty state at 550px width. `phase3-apps.test.ts` and `deployment-database.test.ts` passed 3/3 after fixing Website-only upload usage metering and adding the migration 027 readiness requirement. Full `npm test` passed 476, failed 0, skipped 1 PostgreSQL-only test. `npm run typecheck`, `npm run lint`, `npm run validate:openapi` (59/59 mounted operations), `npm run validate:platform` (540 workspace operations), `npm --prefix website run build` (135/135 content checks), `npm run test:render-deploy` (5/5) and `git diff --check` passed. The build printed upstream Zod Rollup annotation warnings but completed. No PostgreSQL service or Docker engine was available, so migration 027 and runtime were not exercised against PostgreSQL.

The Website draft canvas and published renderer now provide typed layouts for hero, heading, image/gallery, feature cards, columns, FAQ, pricing, testimonial, contact form, commerce link and footer. Feature/column/FAQ/pricing input formats are documented next to the editor controls; selected blocks expose background, alt text and CTA settings. The production website build and 135/135 content tests passed after this change; this change has not had a fresh browser screenshot review. Platform validation now reports 540 workspace operations. The previously recorded full backend suite predates only these frontend rendering changes.

Odoo 20 primary documentation was reached through search results for Calendar and Website building blocks, headers/menus and theme guidance; direct source directory fetch timed out. The current UI was not compared side by side at the supplied desktop dimensions. Odoo comparison, full Calendar recurrence/availability/appointments/integrations, Website identity/publication history/SEO sitemap/commerce rendering, anonymous production form success path, hosted Render evidence, PostgreSQL, browser mobile/desktop acceptance, and founder acceptance remain open. This continuation does not complete Phase 3 and does not change the service billing model.

No matched-size Odoo desktop comparison was performed. The supplied Odoo references show a 1280px Calendar screen and a 1024px Website editor/menu. The in-app browser used a narrow mobile viewport and confirmed responsive content, which is not visual parity evidence. Founder acceptance and production readiness are not claimed. Marketing and Support were not started.

## Phase 3 continuation — 21 November 2026, afternoon

This update supersedes older status lines above where they say Website identity/history or Calendar availability are absent. Work remains incomplete and is not a founder acceptance or production release.

### New implementation

- Calendar recurrence expands bounded daily, weekly, monthly and yearly rules with interval, weekday, count/until limits, DST-aware local wall time, month-end/leap-day clamping, and single-occurrence move/cancel exceptions. All-day recurrence preserves local calendar-day duration. A series is limited to 31 days per event, 370 days per API query, 5,000 returned instances and 1,000 exceptions.
- Calendar personal settings now store IANA timezone, weekly work hours and a separate team-sharing opt-in in encrypted ERP records. Availability returns merged busy windows and only opted-in work hours, not titles or private details; suggested windows require every selected member to share work hours.
- Website now has a separate encrypted `website_identity` ERP record, independent from pages. Owners/admins can set name, description, public access, default page, reviewed logo media, brand color and content width. Public hostnames are not configurable: the product uses the scoped `/sites/<page-slug>` route. Disabling public access withdraws active Website publications; enabling it does not republish automatically.
- Website publication history lists immutable publication versions. Restoring a prior version creates a new version and does not overwrite the editable page draft. Publication snapshots carry the site identity and validate current media references before restore.

### Verification of this continuation

- Backend build and typecheck passed after these changes.
- Latest full `npm test` passed 485/485 runnable tests; one PostgreSQL-only test was skipped because no disposable PostgreSQL service is available. This run includes the new leap-day and all-day DST cases.
- Website production build and content tests passed 135/135 after identity, history and public renderer UI changes. Vite emitted upstream Zod annotation warnings and completed successfully.
- Platform schema check passed with 549 workspace operations. OpenAPI drift check passed for all 59 mounted operations. Render verifier tests passed 5/5; they do not verify the live Render service.
- An unprivileged full-suite attempt failed because the sandbox blocked each ephemeral localhost HTTP integration server with `connect EACCES`. The authorized loopback rerun passed 485 tests with zero failures and one PostgreSQL-only skip on the latest backend code.
- In-app synthetic browser verified the current 16-app catalog, both installable cards, Calendar installation/opening, Website installation, and the Website Settings panel saving an identity before any page exists. A synthetic Landing Page was created and appears in the page register. Screenshots were captured at the marketplace, Calendar week view and Website settings; they remain in the browser interaction record rather than repository files. Publication-history restore has API coverage but no UI/browser pass yet.
- The browser check exposed and fixed a navigation issue: the Pages action now clears the page selection and switches the URL section to Pages, while Templates records its section before opening the gallery. The production bundle was rebuilt afterward; this final navigation correction has not yet been rechecked in the browser.

  Follow-up browser check after rebuilding confirmed `section=pages` and the synthetic Landing Page in the register. The Settings identity form remains available and persisted across reload. The in-app browser viewport was 550px wide; this confirms navigation behavior, not desktop parity.

  Final code review found that the site-wide Media route also fell back to the Pages register when no page was selected. It now renders the public media library with upload consent/validation, preview, and refresh in that state; page-bound Menus, Theme, and SEO show an explicit page-selection workflow. Website build and all 135 content checks passed after this fix. The no-selection Media panel has not yet been browser-interacted.

Calendar reminder settings were added to encrypted per-member Calendar preferences. The existing operations worker schedules notices through the durable event and notification consumer. Focused API/worker coverage verifies member-specific settings, repeat-pass deduplication, localized recipient timezone, and private-title redaction. This is in-app delivery and may be delayed while the worker sleeps. Browser control interaction, PostgreSQL persistence and multi-day recurrence reminders remain unverified. The full backend suite passed 485 tests with 0 failures and 1 PostgreSQL-only skip.

The Calendar canvas was then adjusted to place overlapping events side by side, clip overnight events into each day, display 24 hourly slots and a current-time line, and expose month overflow through a day-opening control. Three pure tests cover overlap lanes, overnight clipping and all-day exclusion. Event history now appears in the organizer's event dialog and is guarded by organizer authorization; API coverage confirms invitees cannot read it. The Website production build/content checks passed 138/138 after these changes, and lint passed. The fresh synthetic browser attempt reached an expired session after the disposable server was restarted; no credentials were entered and no fresh browser validation of the canvas or history panel is claimed. Typecheck and final platform validation passed afterward with 550 registered workspace operations.

### Remaining acceptance blockers

Calendar still lacks appointments/public booking, team-level administration and integrations to Work, CRM, Sales, People leave and Documents. Reminder delivery uses the existing in-app worker and notification queue; attendee reminder preferences are implemented but Automations-backed scheduling and sleeping-worker timing remain limited. Full recurrence and availability browser acceptance, responsive/desktop visual comparison, two-member invitation interaction, and PostgreSQL persistence verification remain open.

Website still lacks host verification/custom domains, redirects, sitemap/robots/canonical metadata, Commerce-backed product data, nested menu hierarchy, undo/redo, media replacement/withdrawal UI, and browser comparison of editor/menu/page management against Odoo. The default page is recorded but root-domain routing is unavailable without a website host mapping. Production publication and anonymous form success cannot be tested with the current synthetic fixture because production Website activation is deliberately rejected. Template-specific blocks have typed rendering but not all the full editing contracts requested.

The operator supplied sanitized logs for `africore-api`, commit `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e`. The Docker build and image push succeeded; process startup then failed in `prepareDatabase()` with `Deployment schema is incomplete; run reviewed migrations separately`, before readiness. The failure stage and migration-verification root-cause class are confirmed. That commit required 001–021 plus 026; the logs do not reveal which ledger version(s) were absent. The current working tree additionally requires additive migration 027. The hosted ledger, backup/restore readiness and current Render status are still unavailable, so no hosted migration or redeploy was done. No commit or push was made.

### Appointment continuation — 21 November 2026

Added a member-only appointment type editor and booking flow, conflict-checking against assigned staff Calendar busy intervals. API route registry validates all 553 workspace operations; OpenAPI remains 59/59 mounted operations. Website build and 138 content tests pass. The backend full-suite run includes a new synthetic appointment type/booking/conflict integration test; the final test result and fresh typecheck after the last server adjustment are pending. No fresh browser session was used, so this workflow is API/build verified only until further browser acceptance. Anonymous public booking and capacity management remain open requirements.

### Verification update — 21 November 2026

Calendar appointment routes and public Website metadata have been added since the earlier acceptance notes. Final local checks include a 5/5 focused Calendar/Website integration run, a 138/138 website content/build suite, backend build/typecheck/lint, 553-operation platform route validation, 59/59 OpenAPI validation, 5/5 Render verifier tests and clean `git diff --check`. The broader backend suite reported 486 pass, 0 failures, 1 PostgreSQL-only skip; its run preceded the last small booking permission refinement, which is covered by the fresh focused suite. No CUA browser pass or matched-size Odoo comparison was possible in this continuation. The Render root-cause class is confirmed from user-supplied logs; exact absent ledger versions and current deployment health remain unverified pending the read-only hosted migration ledger and readiness evidence.

Latest follow-up added appointment type deactivation/activation, page-register duplication into an unpublished draft, and client-side SEO/social metadata. The focused Phase 3 API suite passed 5/5 after the type lifecycle update. Website build/content tests passed 138/138. Platform route validation is being rerun after the new appointment PUT route. Browser acceptance, Odoo desktop comparison, real public production route, PostgreSQL and hosted Render recovery remain incomplete.

The operator cannot retrieve the hosted migration ledger or current backup status. The sanitized deployment log still proves migration verification blocked startup but cannot identify absent versions. The exact hosted migration list and backup readiness therefore remain unresolved. Do not produce an executable hosted migration batch until those read-only results and an isolated PostgreSQL rehearsal are available.

### Final local continuation — 21 November 2026

The Appointments section now lists upcoming appointment-backed Calendar events and offers reschedule through the existing version-checked event editor or cancellation through the existing cancellation endpoint. Appointment edits retain their appointment type and staff, enforce the configured duration, and reject overlaps against current staff busy windows; a focused integration test verifies both a rejected conflicting reschedule and a successful free-time move. This remains internal member booking. Public booking capability, approval/capacity controls and appointment-specific history are not implemented.

Final local checks after this change: `npm test` passed 486, failed 0, with 1 PostgreSQL-only skip; the focused Phase 3 HTTP suite passed 5/5; `npm run typecheck`, `npm run lint`, Website production build/content checks (138/138), OpenAPI drift check (59/59), platform route registration (554), Render verifier tests (5/5), and `git diff --check` passed. The first sandboxed full-suite attempt was denied localhost sockets (`EACCES`) and was rerun successfully with the repository's ephemeral localhost tests permitted. That does not verify disposable PostgreSQL, hosted Render, CI for these uncommitted changes, or production readiness.

The latest local browser session reports an expired account session. No fresh screenshot was captured for this continuation, and no desktop/mobile matched-size Odoo comparison is claimed. Website metadata is currently set from the public client renderer; server-rendered metadata, sitemap and redirect management remain outstanding. Website still lacks verified public host mapping, production publication verification and Commerce-backed product showcase. Calendar cross-app record integration, member-to-member invitation browser flow, and full visual acceptance also remain open. The full phase therefore remains incomplete.

Hosted deployment status remains bounded by read-only Render evidence: deployment `dep-dc08d315efls73b3m2p0` is failed at SHA `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e`; build and image push succeeded; `prepareDatabase()` rejected the hosted migration ledger at startup before readiness. The log cannot identify individual missing migration IDs. The hosted ledger, backup status and current `/v1/readiness` are unavailable, and no hosted migration or deployment was made.

### Fresh browser verification — 21 November 2026

Started `npm run demo:server` with `AFRICORE_DEMO_MINIMAL=true`, port 4011, and a new disposable `.tmp/phase3-final-20261121.db`. The normal development database was not used. At a 550px browser viewport, the Apps Marketplace showed 16 Business apps; Calendar appeared as installable, then installed and opened to the week grid. Website appeared as installable, its required Website publishing service preview succeeded with optional add-ons left off, then installed and opened to the page register. Refresh preserved the Website app route and installation. Screenshots of the Marketplace, Calendar week grid, and Website page register were captured in the task session. This confirms local sandbox visibility/install/open/refresh on the current working tree; it does not cover desktop/mobile matching, Browser Back/Forward, cross-member invitations, public host routing, or the remaining workflow acceptance matrix. The demo API server was stopped after verification.

### Website link routing follow-up — 21 November 2026

Internal published menu and CTA paths now route through `/sites/<page-slug>`; root links resolve to the publication snapshot's default page slug when configured. The slug resolver rejects encoded and nested paths that the publication route does not support. Verification after the final change: Website production build/content tests passed 142/142; backend typecheck passed; focused Calendar/Website integration suite passed 5/5; `git diff --check` passed. This code change has not had a separate browser click-through. Sitemap/redirect support, server-rendered metadata and host mapping remain outstanding, as do the Calendar and Website acceptance items above.

The focused integration test now verifies the configured default slug is present in the scoped immutable publication snapshot used by the public renderer; it passed 5/5 after the assertion.

Website publishing now rejects menu/CTA links to unpublished same-site pages. The endpoint accepts current-page links and links to active publications in the same workspace/environment; root links resolve from the configured default-page slug in the immutable snapshot. Regression coverage confirms an unpublished target returns 409 and normal publication succeeds. Focused Phase 3 API tests passed 5/5 after this validation change. Browser click-through for cross-page public navigation remains open.

### Render failure confirmation — operator log supplied 21 November 2026

The operator supplied the sanitized build/start log for `africore-api`, deployment `dep-dc08d315efls73b3m2p0`, commit `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e`. Docker build, both application builds, image export and registry push completed. During startup, `prepareDatabase()` logged `Deployment schema is incomplete; run reviewed migrations separately`; the process exited with status 1 before the readiness check. This confirms the failure phase and required-schema verification as the failure class. It does not identify which ledger rows are missing. The operator cannot currently access the hosted ledger or confirm backup status, so no hosted migration, deploy or readiness claim is made. The hosted migration procedure remains: read the ledger, identify missing versions in dependency order, confirm a restorable backup, rehearse reviewed additive SQL against isolated PostgreSQL, then obtain separate authorization before any hosted apply.

### Current local verification — 21 November 2026

- `npm run typecheck` and `npm run lint` — passed.
- `npm run validate:openapi` — passed, 59/59 operations.
- `npm run validate:platform` — passed, 554 workspace operations.
- `npm --prefix website run build` — passed, 142/142 content tests.
- `npm run test:render-deploy` — passed, 5/5 verifier tests; no live deployment was triggered.
- `npm test` — passed, 486 passed, 0 failed, 1 PostgreSQL-only test skipped because no disposable PostgreSQL service was available.
- Focused Calendar/Website integration tests — passed, 5/5, including recurrence, appointment conflict handling, private detail authorization, Website publication history, root-link snapshot, and unpublished-link rejection.
- `git diff --check` — passed. The checkout retains pre-existing uncommitted Phase 3 work; nothing was committed or pushed.

Docker image build/start, disposable PostgreSQL migration rehearsal, current-SHA GitHub CI, Render readiness and anonymous production publication were not verified in this continuation. The original Render build log is now available and confirms migration verification failure before readiness; hosted ledger versions and backup status are still unknown. Desktop/mobile matched-size Odoo review and remaining Calendar/Website workflow acceptance are still open. Phase 3 is incomplete.

PostgreSQL 17 binaries are installed, but Docker's Linux engine is unavailable. I attempted to initialize a fresh temporary local cluster with trust auth and bounded server settings; `initdb` stalled while detecting system shared-memory/connection defaults in the restricted environment and was interrupted before a server started. No application database was passed to it, no PostgreSQL test ran, and no PostgreSQL server remains listening on the dedicated test port.

### Website browser follow-up — 21 November 2026

The prior in-app tab referenced a stopped server. Restarting the synthetic demo against the same disposable `.tmp/phase3-final-20261121.db` restored the session; the observed `Failed to fetch` was a stopped local process. At the 550px viewport, the Website landing template created a draft, the editor saved it, preview switched the page into visitor-style rendering, and browser refresh restored the selected draft and editor. A current editor screenshot was captured in the task browser record. No private or production database was used. This adds browser evidence for create/save/preview/refresh; menu editing, public anonymous navigation, desktop geometry and Odoo visual comparison remain open.

### Cloudflare public-route repair — 21 November 2026

Source review found the existing Cloudflare Worker rejected the public Website SPA path and its anonymous API paths, making production Website access impossible through the configured gateway. The worker now allows `/sites/<safe-slug>`, public snapshot GET, publication-referenced media GET and POST contact forms with no-store headers; unsupported methods and malformed/nested paths remain denied. Cloudflare Worker unit tests passed 11/11. This code-level repair has not been deployed and has no live edge or production URL verification.

## Public sitemap and final local regression — 21 November 2026

Added `GET /api/public/sites/:slug/sitemap.xml`. It derives scope from an active production page, enumerates active publications for that organization, rechecks each candidate through the anonymous publication gate, and emits absolute HTTPS URLs only when `AFRICORE_PUBLIC_ORIGIN` is an exact valid origin. The Cloudflare allowlist forwards only this exact sitemap route. The Phase 3 integration suite confirms sandbox publications do not become public sitemap routes; the gateway suite verifies GET forwarding and rejects POST. A successful sitemap response under a production-enabled tenant remains unverified.

Final local backend regression passed **486 tests, 0 failures, 1 PostgreSQL-only skip**. The focused Phase 3 integration passed **5/5**. Website production build/content suite passed **142/142**. Typecheck, lint, OpenAPI drift (**59/59**), platform route registration (**554**), Render verifier (**5/5**), Cloudflare Worker (**11/11**) and `git diff --check` passed. Docker, disposable PostgreSQL, production browser publication/sitemap, hosted readiness/ledger, and matched-size Odoo comparison remain unverified. No commit, push, hosted migration, or deployment was made.

### Calendar to Work record links — 21 November 2026

Calendar event links are now limited to supported appointment type, Work task and CRM lead/opportunity record kinds. Creating or editing a Work task link reauthorizes the Work service and task/project access in the current workspace; CRM links reauthorize CRM service access and confirm the entry is active in the current organization and environment. The Calendar editor lists the signed-in member's assigned Work tasks and active CRM leads/opportunities when those apps are installed, and links open through the source app's own scoped target/record route. Work rechecks authorization before showing task details. Focused API coverage passed for valid Work and CRM links, rejection of arbitrary record kinds, and 404 for a workspace member without access to the linked Work project. The UI compiled; the specific selector/launch actions have not yet been browser exercised.

The full backend suite after both integrations passed **489 tests, 0 failures and 1 PostgreSQL-only skip** (490 tests total). Typecheck, lint, Website production build/content (**142/142**), OpenAPI (**59/59**), platform route registration (**554 operations**), Render verifier (**5/5**), Cloudflare Worker (**11/11**) and `git diff --check` also passed. These are local checks; PostgreSQL, Docker, current-tree CI, public-production browsing, matched-size Odoo comparison and hosted Render readiness remain unverified.

### Current synthetic browser follow-up — 21 November 2026

The rebuilt Website template flow was exercised at the 550px in-app viewport. Selecting the Contact template created and selected the Contact draft; refreshing restored that draft and its two typed sections. This exposed a stale-selection race where the page list refresh replaced the new selection with the old draft; create now refreshes the list before selecting the returned new record. A sandbox Contact publication succeeded after choosing it as the synthetic site's default page, and the Publication section displayed version 1. Sandbox publication still has no public production URL. Calendar appointment UI created an active 30-minute type, confirmed a member booking against staff availability, rescheduled it from 15:21 to 16:00 through the event editor, and cancelled it. The reschedule attempt exposed a strict-schema rejection because `organizer_id` was being sent as an editable field; the UI now omits that display-only value from the update payload. The final browser view showed no booked appointments. These were synthetic-only records in `.tmp/phase3-final-20261121.db`. Browser screenshots were captured in the task session; this is mobile-width workflow evidence, not Odoo visual parity.
# Media withdrawal acceptance — 21 November 2026

Website media now has a visible withdrawal control. It uses the existing versioned, idempotent API. Website-only activation is sufficient. Active Website publication snapshots are checked before withdrawal; referenced images return 409 and remain available. Commerce media retains its prior immediate-withdrawal behavior. Browser interaction with this new control has not yet been captured. Final `npm test` passed 486, failed 0, skipped 1 PostgreSQL-only test. The Calendar and Website fixtures passed together after the change. Typecheck, lint, platform route validation (554 operations), Website production build/content checks (142), and `git diff --check` passed.

### Server-rendered Website metadata — 21 November 2026

The public `/sites/:slug` HTML route now validates the active production publication and serves page-specific SEO metadata, a robots policy and a canonical URL only under a valid configured HTTPS origin. It strips the homepage prerendered content and leaves an empty SPA root to render the requested page. The pure metadata tests passed 2/2; the Calendar/Website integration pair passed 2/2 with the sandbox HTML route returning 404. The backend regression after the Commerce showcase schema addition passed **488 tests, 0 failures, 1 PostgreSQL-only skip**. The route has not been verified on a production host; it returns metadata server-side while visitor page blocks still render client-side.

### Commerce showcase continuation — 21 November 2026

Website's `commerce_showcase` block now accepts a validated storefront slug and reads up to four products from the production Commerce public catalog, including its current canonical price and reviewed public image. Its editor links to the Commerce storefront for cart and checkout. A focused Phase 3 HTTP suite passed **5/5** after adding rejection of unsafe storefront slugs. Website production build/content checks passed **142/142**, backend typecheck and lint passed, and the public catalog remains unverified against a live production publication. The worktree remains in progress; Calendar cross-app links, anonymous appointment capabilities, full visual browser comparison, and deployment/database acceptance are still open.

### Local browser continuation — 21 November 2026

A fresh disposable Business workspace was opened in the synthetic browser at 1280×720. Browse Apps showed both Calendar and Website as available, with their required service states. Calendar installation preview/confirmation opened the Calendar week view. Website installation preview/confirmation opened its workspace; a new draft and Commerce showcase block were created, saved, and restored after refresh with the storefront slug intact. The Marketplace screen and Calendar canvas screenshots are present in the task interaction record. These screenshots show local behavior and layout, not side-by-side Odoo parity. Afterwards, Calendar's time grid was updated to initially scroll to 06:00; typecheck, lint, and Website build/content checks passed (142/142), but the new scroll position has not yet received browser verification.
