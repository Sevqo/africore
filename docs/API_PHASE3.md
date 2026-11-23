# Phase 3 API contracts

## Website media

Authenticated Website and Commerce administrators can list public media at `GET /api/v1/organizations/{org}/commerce/assets`, upload a bounded raster at `POST /api/v1/organizations/{org}/commerce/assets`, and preview an asset through `GET /api/v1/organizations/{org}/commerce/assets/{id}/preview`. Either the Website or Commerce service must be active. Writes meter against the active service selected for that upload. Private Documents are not a source for this API. Public Website delivery uses `GET /api/public/sites/{slug}/media/{id}` and requires the active production snapshot to reference the same image ID.

## Website contact forms

`POST /api/public/sites/{slug}/forms` is anonymous and accepts JSON fields `name`, `email`, optional `company`, `message`, `consent: true`, and optional honeypot `website`. The named production publication must be active and contain a `contact_form` block. Success returns `202 { "accepted": true }`; an unpublished page or page without the form returns `404`; invalid fields or missing consent return `400`; global IP rate limits return `429`. A populated honeypot receives the generic success response but is not stored.

Submissions are stored as authenticated-encryption envelopes with organization/environment-bound context in `ac_website_form_submissions`. `GET /api/v1/organizations/{org}/website/forms` is restricted to current workspace administrators and requires the Website service. It returns at most the newest 100 records. Content expires after 90 days and is cleared when this inbox is next read. An administrator can explicitly hand a new inquiry to `POST /api/v1/organizations/{org}/website/forms/{submission}/convert-to-crm`; this requires active Website and CRM services and creates a canonical CRM lead through the normal CRM operation path. The encrypted inbox copy is cleared after conversion, while the CRM lead retains its normal CRM retention and access policy. No email delivery is claimed. Migration `027-website-forms` adds the table and index, enables PostgreSQL RLS and revokes public table access. Deployments in verify mode must have this migration applied before startup.

## Website identity and publications

`GET /api/v1/organizations/{org}/website/settings` reads the independent encrypted `website_identity` ERP object. Owner/admin `PUT` requires the exact `expected_version` after the first save and accepts name, description, `public_enabled`, nullable default page and logo media IDs, `brand_color`, and `content_width`. The logo must be active reviewed public media in the same organization and environment. Disabling public access withdraws currently active website publications. Re-enabling requires explicit republishing. Public snapshots retain the identity that was published with them. Custom hostnames are not supported; the public route remains `/sites/{page-slug}`.

`GET /api/v1/organizations/{org}/website/pages/{id}/publication-history` returns the newest 50 immutable publication versions and actor/time metadata. `POST /api/v1/organizations/{org}/website/pages/{id}/publication-history/{version}/restore` validates the old encrypted snapshot and current media references, then republishes it as a new version. It does not roll back or overwrite the editable page draft. Production publication and anonymous success flows still require a production-enabled Website service and were not validated by the synthetic sandbox.

## Calendar

Calendar uses the encrypted, versioned `calendar_event` record as the durable recurrence authority; there is no second scheduler or recurrence table. `GET /api/v1/organizations/{org}/calendar/events?from={RFC3339}&to={RFC3339}` expands instances in a bounded range of at most 370 days. Without bounds, it returns 90 days before through 180 days after the current instant. Output is capped at 5,000 occurrences. Event creation/update accepts `recurrence` (`none`, `daily`, `weekly`, `monthly`, `yearly`) and nullable `recurrence_rule` with `frequency`, `interval` (1–99), weekly `weekdays` (Sunday 0 through Saturday 6), `end` (`never`, `count`, `until`), and the matching `count` (1–1,000) or local `until` date.

`PUT /api/v1/organizations/{org}/calendar/events/{id}/occurrences/{key}` edits one instance; `POST .../{key}/cancel` cancels one instance. `key` is the scheduled local wall time `YYYY-MM-DDTHH:mm:ss` in the series timezone. Both require the current series `expected_version`; the organizer or workspace administrator must authorize the write. A one-instance move is bounded to 366 days and each series allows up to 1,000 exceptions. Normal `PUT /events/{id}` and `/cancel` continue to operate on the whole series. Invalid recurrence keys, stale versions, and cross-tenant/non-member access are rejected.

Expansion preserves local wall time across DST offset changes. A nonexistent local time in a DST gap is omitted; monthly day 29–31 and yearly leap-day dates clamp to the final valid day of the target month. Pure recurrence tests and HTTP series/exception tests cover the current behavior. Browser interaction with recurrence controls has not yet been verified. Reminders, appointments, integrations, and visual acceptance remain separate open Calendar work. See [Calendar implementation](CALENDAR_IMPLEMENTATION.md) and [Phase 3 acceptance](PHASE3_ACCEPTANCE.md).

Personal hours use the encrypted versioned `calendar_settings` ERP record. `GET /api/v1/organizations/{org}/calendar/settings` returns the current member's timezone, weekly work ranges, share flag and whether the values were configured. `PUT` validates unique weekdays, local `HH:mm` ranges and an IANA timezone. Work hours are private unless `share_with_team` is true. `GET /api/v1/organizations/{org}/calendar/availability?from={RFC3339}&to={RFC3339}&members={comma-separated-ids}` accepts current workspace members only, at most 50, over a maximum 31-day range. It returns member IDs, timezone, shared work hours if opted in, and merged busy intervals without event titles, locations, attendees or links. Busy/free is based on authorized Calendar event ownership/attendance, including private events. The client suggests one-hour free windows only when every selected member has shared work hours. This is not a public appointment-booking capability.

`GET /api/v1/organizations/{org}/calendar/events/{id}/history` returns the most recent 50 ERP versions as a limited summary (version, actor, action, timestamp, title and schedule). The event organizer is the only role allowed; workspace administrators and invitees who did not organize the event are denied to preserve Calendar privacy.

Settings also accept `reminder_minutes_before`: `null`, `5`, `15`, `30`, `60`, or `1440`. This is a member-specific in-app reminder preference. The existing Operations worker schedules a durable notification event and the existing notification consumer delivers it; no second scheduler or email delivery is used or claimed. A sleeping worker may delay the notice.

## Calendar member appointments

`GET /api/v1/organizations/{org}/calendar/appointment-types` lists active types. Operational users create a type with `POST /api/v1/organizations/{org}/calendar/appointment-types` using `name`, `duration_minutes` (15–480), `timezone`, current-member `staff` IDs, and `active`. A current workspace member books through `POST /api/v1/organizations/{org}/calendar/appointment-types/{id}/bookings` with an offset-bearing `start`; the server checks staff free/busy, creates a linked Calendar event and sends in-app invitations. Conflicts return `409`. These routes require an authenticated Business workspace; they do not enable anonymous booking or represent an external public booking link.

`PUT /api/v1/organizations/{org}/calendar/appointment-types/{id}` updates a type with the complete validated type body and `expected_version`. Only the type owner or a workspace owner/admin can change it. Deactivating a type preserves history and blocks new bookings; it does not cancel existing Calendar events.

Nested menu contract: each Website page menu item has `label`, safe `url`, and nullable `parent_index` referring only to an earlier item in the same page menu array. The hierarchy is limited to three levels. Menu updates are page-draft edits and affect public visitors only after publishing a new snapshot.
# Website public endpoints

| Method | Path | Access | Behavior |
| --- | --- | --- | --- |
| GET | `/api/public/sites/:slug` | Anonymous, production publication only | Returns the active published page snapshot. |
| GET | `/api/public/sites/:slug/media/:id` | Anonymous, publication reference required | Serves an active public media object referenced by the site. |
| GET | `/api/public/sites/:slug/sitemap.xml` | Anonymous, production publication only | Emits absolute sitemap URLs for active published pages in the same organization using the validated `AFRICORE_PUBLIC_ORIGIN`; otherwise returns 404. |
| POST | `/api/public/sites/:slug/forms` | Anonymous, published contact block required | Validates consent and fields, rate-limits, then persists an encrypted submission. |

The Cloudflare worker forwards only these exact public routes. GET/HEAD are allowed for page, media, and sitemap routes; contact forms accept POST only. Public responses are not cached at the gateway.

## Calendar public appointment capabilities — 22 November 2026

This section supersedes earlier text saying Calendar has no anonymous booking link. Current workspace users can create/rotate or revoke scoped links using `POST`/`DELETE /api/v1/organizations/{org}/calendar/appointment-types/{id}/public-link`; links accept capacity and weekly 09:00–17:00 hours. Owner review endpoints list requests, confirm/decline, approve rescheduling/cancellation and expose request history under `/calendar/appointment-types/{id}/requests`.

Anonymous routes are `GET /api/public/calendar/{token}`, `GET /api/public/calendar/{token}/availability?date=YYYY-MM-DD`, `POST /api/public/calendar/{token}/bookings`, and `GET|POST /api/public/calendar/manage/{token}`. Public responses return times only, never staff IDs or event names. Visitor name/email/phone/note are encrypted; capability tokens are random and stored as hashes. New bookings await owner confirmation; visitor changes to confirmed events also await owner review. No external email is sent. Migration `028-calendar-appointments` adds appointment-link, request, capacity-slot and history tables and is now a required schema version.
## Calendar public booking migration verification — 22 November 2026

Migration 028-calendar-appointments is present in the local development database and participates in the isolated PostgreSQL test suite. The full suite passed 494/494 on fresh PostgreSQL 17 after the booking-slot capacity upsert was corrected. The local check is not authorization or evidence to apply the migration to hosted PostgreSQL; hosted ledger and backup readiness remain unknown.
### Migration preflight ordering — 23 November 2026

The guarded Phase 3 maintenance runner now checks 021, 026 and 027 before it can apply 028. Missing version IDs are reported in the sanitized diagnostic. Focused preflight cases and the full isolated PostgreSQL suite pass. No hosted migration was run.

### Anonymous Calendar page routing — 23 November 2026

The Express static SPA allowlist now includes `/calendar/*`, matching the public capability URLs already allowed by the Cloudflare Worker. `/calendar/book/:token` and `/calendar/manage/:token` therefore load the Website application shell while their data remains token-scoped through `/api/public/calendar/...`. The route regression checks both paths and requires an HTML response. Browser verification after the fix is still outstanding.

Website settings accepts an optional `site_slug`. The settings read exposes `public_home_url` only while the current workspace's home can resolve. `GET /sites/:siteSlug/home` returns a no-store 307 to the current published default page or 404 when unavailable. The binding changes when the configured default page is published. Anonymous page payloads expose a resolved `site.home_url` for safe Home navigation.
