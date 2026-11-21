import assert from 'node:assert/strict';
import test from 'node:test';
import { activeAppointmentTypes } from '../src/apps/calendar-appointments.ts';

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
