import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarTimeInput, eventsOnDay, layoutCalendarAllDay, layoutOverlappingEvents, retainedCalendarInstant } from '../src/apps/calendar-layout.ts';

const local = (year, month, day, hour, minute = 0) =>
  new Date(year, month, day, hour, minute).toISOString();
const event = (id, start, end, all_day = false) => ({ id, data: { start, end, all_day } });

test('event edits use the stored timezone and preserve either instant in a repeated hour', () => {
  const timezone = 'America/New_York';
  const first = '2026-11-01T05:30:00.000Z';
  const second = '2026-11-01T06:30:00.000Z';
  const wall = '2026-11-01T01:30';
  assert.equal(calendarTimeInput(first, timezone), wall);
  assert.equal(calendarTimeInput(second, timezone), wall);
  assert.equal(retainedCalendarInstant(wall, timezone, { instant: second, timezone }), second);
  assert.equal(retainedCalendarInstant(wall, timezone, { instant: first, timezone }), first);
  assert.equal(retainedCalendarInstant(wall, 'UTC', { instant: first, timezone }), undefined);
  assert.equal(retainedCalendarInstant('2026-11-01T02:00', timezone, { instant: first, timezone }), undefined);
  assert.equal(calendarTimeInput('2026-11-30T22:00:00.000Z', 'Africa/Nairobi'), '2026-12-01T01:00');
});

test('overlapping meetings receive separate lanes while sequential meetings reuse a lane', () => {
  const day = new Date(2026, 10, 21);
  const positioned = layoutOverlappingEvents(
    [
      event('a', local(2026, 10, 21, 9), local(2026, 10, 21, 10)),
      event('b', local(2026, 10, 21, 9, 30), local(2026, 10, 21, 11)),
      event('c', local(2026, 10, 21, 11), local(2026, 10, 21, 12)),
    ],
    day,
  );
  assert.deepEqual(positioned.map(({ event: item, lane, lanes }) => [item.id, lane, lanes]), [
    ['a', 0, 2],
    ['b', 1, 2],
    ['c', 0, 1],
  ]);
});

test('overnight events are visible and clipped on each intersecting day', () => {
  const firstDay = new Date(2026, 10, 21);
  const secondDay = new Date(2026, 10, 22);
  const overnight = event('overnight', local(2026, 10, 21, 23), local(2026, 10, 22, 2));
  assert.deepEqual(eventsOnDay([overnight], firstDay).map((item) => item.id), ['overnight']);
  assert.deepEqual(eventsOnDay([overnight], secondDay).map((item) => item.id), ['overnight']);
  const firstLayout = layoutOverlappingEvents([overnight], firstDay)[0];
  const secondLayout = layoutOverlappingEvents([overnight], secondDay)[0];
  assert.equal(firstLayout.end, new Date(2026, 10, 22).getTime());
  assert.equal(secondLayout.start, new Date(2026, 10, 22).getTime());
});

test('all-day events stay in the month grid and do not occupy timed layout lanes', () => {
  const day = new Date(2026, 10, 21);
  const allDay = event('all-day', local(2026, 10, 21, 0), local(2026, 10, 22, 0), true);
  assert.deepEqual(eventsOnDay([allDay], day).map((item) => item.id), ['all-day']);
  assert.deepEqual(layoutOverlappingEvents([allDay], day), []);
});

test('all-day events span the correct columns and stack when ranges overlap', () => {
  const days = [21, 22, 23, 24].map((day) => new Date(2026, 10, day));
  const rows = layoutCalendarAllDay([
    event('clipped', local(2026, 10, 20, 0), local(2026, 10, 23, 0), true),
    event('overlap', local(2026, 10, 22, 0), local(2026, 10, 26, 0), true),
    event('later', local(2026, 10, 23, 0), local(2026, 10, 24, 0), true),
    event('timed', local(2026, 10, 22, 10), local(2026, 10, 22, 11)),
  ], days);
  assert.deepEqual(rows.map(({ event, first, last, lane }) => [event.id, first, last, lane]), [
    ['clipped', 0, 1, 0], ['overlap', 1, 3, 1], ['later', 2, 2, 0],
  ]);
});
