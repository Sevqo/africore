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

## Phase 3 source follow-up — 2026-11-21

Focused source paths at the pinned commit confirm the lifecycle details behind the observations above:

- `addons/calendar/models/calendar_event.py` owns event create/write and the recurrence transition methods (`_edit`, `_edit_recurrence`, `_break_series`, `_split_and_shorten_recurrence`). Recurrence edits distinguish a single occurrence, following occurrences and the whole series. A recurrence label alone does not implement those behaviors.
- `addons/calendar/models/calendar_recurrence.py` is the series authority; `addons/calendar/models/calendar_attendee.py` handles attendee transitions and event-linked invitations. Keep event permissions and invitation changes at those authorities rather than treating UI visibility as authorization.
- `addons/calendar/views/calendar_views.xml` supplies the calendar, event form and search/action views that inform the Odoo-style toolbar, calendar canvas and compact-to-full event editing path.

AfriCore follow-up decision: maintain bounded occurrence expansion and persist exception/series changes through the Calendar service; make the UI expose only transitions the service validates. The supplied Odoo 19 captures remain visual references. No matched-viewport AfriCore comparison was completed in this session.
