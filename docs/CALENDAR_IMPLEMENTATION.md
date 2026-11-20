# Calendar implementation — Phase 3 local checkpoint

Status: **first functional slice implemented; full Calendar scope is incomplete**.

## Authority and API

Calendar uses the existing encrypted ERP record store (`calendar_event`) with workspace/environment scoping, current-membership attendee validation, record grants, optimistic version checks on organizer edits/cancellation, and idempotent create/update/respond/cancel operations. Event instants must include offsets and are stored as UTC ISO strings with the submitted IANA timezone. Invalid timezone and end-before-start values are rejected. The app install references the single `calendar` service.

Routes under `/api/v1/organizations/:org/calendar/events` list/create events, update an event, respond `accepted`/`declined`/`tentative`, and cancel it. Invitations create notices via the existing Notifications helper; delivery is in-app only. Private event titles and descriptions are redacted server-side as `Busy` for unrelated workspace owners/admins. Attendees are validated against current workspace membership; invitations cannot add a user to a workspace.

## Interface implemented

The Calendar workspace includes day/week/month selection, date navigation, a date picker, attendee visibility toggles, all-day and timed-event display, and a compact create dialog with title, start/end, timezone, attendees, location, meeting link, all-day and description. Local wall-time input is converted through the selected IANA zone and rejects nonexistent DST-gap times. Invitation response actions update the server.

## Open implementation gaps

This checkpoint does **not** implement recurring-instance expansion/exceptions/series editing, reminders, working-hours or team availability, conflict suggestions, resource booking, appointment types/public booking, event editing/cancellation controls in the interface, accessible attendee filtering by separate roles, full organizer selection, activity links to CRM/Sales/Work, People leave projection, Documents references, durable automation lifecycle triggers, or email/calendar provider integrations. The recurrence value is stored as metadata and must not be treated as a complete recurring-meeting workflow. No external invitation delivery is claimed.

## Tests and visual evidence

`src/__tests__/phase3-apps.test.ts` covers reviewed independent activation, in-app invitation creation/response and private-event redaction. UI reference screenshots supplied by the user were reviewed; no running browser comparison at matched desktop/mobile sizes was completed. Odoo source notes cite `addons/calendar/models/calendar_event.py`, `calendar_recurrence.py`, `calendar_attendee.py`, and `tests/test_access_rights.py`. Official Odoo 20 docs fetch timed out; the supplied UI captures are Odoo 19.
