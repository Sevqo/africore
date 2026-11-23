import assert from 'node:assert/strict';
import test from 'node:test';
import { activeAppointmentTypes, approvedLeaveCalendarEvents } from '../src/apps/calendar-appointments.ts';

test('booking options include active appointment types only', () => {
  const active = { id: 'consultation', data: { active: true } };
  assert.deepEqual(
    activeAppointmentTypes([
      active,
      { id: 'retired', data: { active: false } },
      { id: 'legacy', data: {} },
    ]),
    [active],
  );
});

test('booking options are empty when all appointment types are inactive', () => {
  assert.deepEqual(
    activeAppointmentTypes([{ id: 'retired', data: { active: false } }]),
    [],
  );
});

test('Calendar overlay includes approved leave by day without exposing private reasons', () => {
  const events = approvedLeaveCalendarEvents([
    { id: 'leave-1', status: 'approved', from: '2026-11-24', to: '2026-11-25', employee_name: 'Amina', label: 'Planned absence', reason: 'Private medical detail' },
    { id: 'pending', status: 'pending', from: '2026-11-24', to: '2026-11-24', employee_name: 'Ben' },
  ]);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.data.start), ['2026-11-24T00:00:00', '2026-11-25T00:00:00']);
  assert.ok(events.every((event) => event.read_only && event.source === 'people_leave'));
  assert.ok(events.every((event) => !JSON.stringify(event).includes('Private medical detail')));
});

test('Calendar overlay rejects malformed or excessive leave ranges', () => {
  assert.deepEqual(approvedLeaveCalendarEvents([
    { id: 'bad-date', status: 'approved', from: '2026-02-31', to: '2026-03-01' },
    { id: 'long', status: 'approved', from: '2025-01-01', to: '2027-01-01' },
  ]), []);
});
