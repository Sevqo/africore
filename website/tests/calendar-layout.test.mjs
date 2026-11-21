import assert from 'node:assert/strict';
import test from 'node:test';
import { eventsOnDay, layoutOverlappingEvents } from '../src/apps/calendar-layout.ts';

const local = (year, month, day, hour, minute = 0) =>
  new Date(year, month, day, hour, minute).toISOString();
const event = (id, start, end, all_day = false) => ({ id, data: { start, end, all_day } });

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
