import test from 'node:test';
import assert from 'node:assert/strict';
import { expandCalendarSeries } from '../apps/calendar-recurrence';

const event = (start: string, end: string, rule: any, extras: Record<string, unknown> = {}) => ({
  id: 'series-id',
  version: 1,
  data: {
    title: 'Planning',
    start,
    end,
    timezone: 'UTC',
    all_day: false,
    recurrence: rule?.frequency || 'none',
    recurrence_rule: rule,
    occurrence_exceptions: [],
    attendees: [],
    organizer_id: 'owner',
    ...extras,
  },
});
const rule = (frequency: string, values: Record<string, unknown> = {}) => ({
  frequency,
  interval: 1,
  weekdays: [],
  end: 'never',
  count: null,
  until: null,
  ...values,
});
const range = (from: string, to: string, value: any) =>
  expandCalendarSeries(value, from, to).map((x: any) => x.data.start);

test('daily recurrence retains wall time over a daylight-saving transition', () => {
  const e = event('2026-03-01T14:00:00.000Z', '2026-03-01T15:00:00.000Z', rule('daily'), {
    timezone: 'America/New_York',
  });
  assert.deepEqual(range('2026-03-07T00:00:00Z', '2026-03-10T00:00:00Z', e), [
    '2026-03-07T14:00:00.000Z',
    '2026-03-08T13:00:00.000Z',
    '2026-03-09T13:00:00.000Z',
  ]);
});

test('monthly recurrence clamps the original month-end day without drifting', () => {
  const e = event('2025-01-31T09:00:00.000Z', '2025-01-31T10:00:00.000Z', rule('monthly'));
  assert.deepEqual(range('2025-01-01T00:00:00Z', '2025-05-01T00:00:00Z', e), [
    '2025-01-31T09:00:00.000Z',
    '2025-02-28T09:00:00.000Z',
    '2025-03-31T09:00:00.000Z',
    '2025-04-30T09:00:00.000Z',
  ]);
});

test('yearly leap-day recurrence clamps to February month-end', () => {
  const e = event('2024-02-29T09:00:00.000Z', '2024-02-29T10:00:00.000Z', rule('yearly'));
  const dates = [2024, 2025, 2026, 2027].flatMap((year) =>
    range(`${year}-01-01T00:00:00Z`, `${year + 1}-01-01T00:00:00Z`, e),
  );
  assert.deepEqual(dates, [
    '2024-02-29T09:00:00.000Z',
    '2025-02-28T09:00:00.000Z',
    '2026-02-28T09:00:00.000Z',
    '2027-02-28T09:00:00.000Z',
  ]);
});

test('all-day recurrence keeps calendar-day duration through a DST change', () => {
  const e = event('2026-03-07T05:00:00.000Z', '2026-03-08T05:00:00.000Z', rule('daily'), {
    timezone: 'America/New_York',
    all_day: true,
  });
  const occurrences = expandCalendarSeries(e, '2026-03-07T00:00:00Z', '2026-03-10T00:00:00Z');
  assert.deepEqual(
    occurrences.map((item: any) => [item.data.start, item.data.end]),
    [
      ['2026-03-07T05:00:00.000Z', '2026-03-08T05:00:00.000Z'],
      ['2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z'],
      ['2026-03-09T04:00:00.000Z', '2026-03-10T04:00:00.000Z'],
    ],
  );
});

test('weekly interval and weekdays are applied from the anchor week', () => {
  const e = event(
    '2025-01-06T09:00:00.000Z',
    '2025-01-06T10:00:00.000Z',
    rule('weekly', { interval: 2, weekdays: [1, 3] }),
  );
  assert.deepEqual(range('2025-01-01T00:00:00Z', '2025-01-30T00:00:00Z', e), [
    '2025-01-06T09:00:00.000Z',
    '2025-01-08T09:00:00.000Z',
    '2025-01-20T09:00:00.000Z',
    '2025-01-22T09:00:00.000Z',
  ]);
});

test('occurrence counts include occurrences before the requested range', () => {
  const e = event(
    '2025-01-01T09:00:00.000Z',
    '2025-01-01T10:00:00.000Z',
    rule('daily', { end: 'count', count: 5 }),
  );
  assert.deepEqual(range('2025-01-04T00:00:00Z', '2025-01-12T00:00:00Z', e), [
    '2025-01-04T09:00:00.000Z',
    '2025-01-05T09:00:00.000Z',
  ]);
});

test('a moved exception changes one occurrence and a cancellation suppresses only one', () => {
  const e = event('2025-01-01T09:00:00.000Z', '2025-01-01T10:00:00.000Z', rule('daily'), {
    occurrence_exceptions: [
      {
        key: '2025-01-02T09:00:00',
        data: { start: '2025-01-02T12:00:00Z', end: '2025-01-02T13:00:00Z', title: 'Rescheduled' },
      },
      { key: '2025-01-03T09:00:00', cancelled: true },
    ],
  });
  const result = expandCalendarSeries(e, '2025-01-01T00:00:00Z', '2025-01-05T00:00:00Z');
  assert.equal(result.length, 3);
  assert.equal((result[1] as any).data.start, '2025-01-02T12:00:00.000Z');
  assert.equal((result[1] as any).data.title, 'Rescheduled');
  assert.equal((result[2] as any).data.start, '2025-01-04T09:00:00.000Z');
});
