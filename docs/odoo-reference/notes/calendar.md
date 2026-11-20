# Calendar comparison notes

Reference: Odoo Community 20.0 checkout at `c1ef83e9c`.

## Observations

- `addons/calendar/models/calendar_event.py` stores start/stop as datetimes and models all-day, attendee, privacy, and recurrence relationships on calendar events. Recurrence data is represented through a linked recurrence model rather than treating a recurrence label as independent events.
- `addons/calendar/models/calendar_recurrence.py` owns recurrence rules and occurrence updates. It uses rule fields such as interval, end date/count and exception/update paths; the implementation is intentionally more complete than a single recurrence enum.
- `addons/calendar/models/calendar_attendee.py` has distinct pending/accepted/declined/tentative response states and attendee transition behavior.
- `addons/calendar/tests/test_access_rights.py` exercises privacy behavior and confirms access must be tested for event owners, invitees and unrelated users.
- Supplied Calendar references show week/day navigation, attendee calendars, a mini month and a compact event dialog with an expanded-form path.

## AfriCore decision

Keep event authority workspace-scoped and encrypted. Invitations use current members and the existing notification authority. Store UTC instants plus the IANA timezone. A recurrence choice must not be represented as a working series until bounded expansion and exception editing are implemented. Private-event redaction is server-side. No external calendar sync or email delivery is implied.

## Limits

Official Odoo 20 documentation URLs for Calendar and Appointments timed out in the available reader on 2026-11-20. This comparison is based on the pinned Community source and supplied screenshots. The screenshots show Odoo 19 UI, not Odoo 20 UI.
