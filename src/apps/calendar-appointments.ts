import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/adapter';
import { fail, type Access, audit } from '../platform/auth';
import { hash, now, seal, unseal } from '../platform/crypto';
import { authorize, currentMember, insert, read, update } from '../erp/store';
import { calendarAvailability } from './phase3';
import { notify } from '../operations/automation';
import { lockWorkspace, requireServices } from '../marketplace/engine';

const workDay = z.object({
  weekday: z.number().int().min(0).max(6),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict().refine((x) => x.end > x.start, { message: 'End must follow start' });
const linkInput = z.object({
  capacity: z.number().int().min(1).max(20).default(1),
  work_days: z.array(workDay).max(7).default([1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00' }))),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.work_days.map((day) => day.weekday)).size !== value.work_days.length)
    ctx.addIssue({ code: 'custom', message: 'Each weekday may appear once', path: ['work_days'] });
});
const bookingInput = z.object({
  start: z.string().datetime({ offset: true }),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).default(''),
  note: z.string().trim().max(1000).default(''),
  consent: z.literal(true),
  request_key: z.string().uuid(),
}).strict();
const context = (org: string, environment: string, id: string) =>
  JSON.stringify(['calendar-public-booking', org, environment, id]);
const encrypt = (org: string, environment: string, id: string, value: unknown) =>
  seal(JSON.stringify(value), context(org, environment, id), '2');
const decrypt = (row: any) =>
  JSON.parse(unseal(row.payload, context(row.org_id, row.environment, row.id)));
const bookingSecret = () => randomBytes(32).toString('base64url');
const safeDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const localParts = (stamp: number, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(stamp);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};
function localToInstant(date: string, time: string, timezone: string): string | null {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set<number>();
  for (const delta of [-18, -6, 6, 18]) {
    const sample = wall + delta * 3600000;
    const p = localParts(sample, timezone);
    const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    offsets.add(represented - sample);
  }
  for (const offset of offsets) {
    const candidate = wall - offset;
    const p = localParts(candidate, timezone);
    if (Number(p.year) === year && Number(p.month) === month && Number(p.day) === day && Number(p.hour) === hour && Number(p.minute) === minute)
      return new Date(candidate).toISOString();
  }
  return null;
}
function addLocalMinutes(date: string, time: string, minutes: number) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes));
  return result.toISOString().slice(0, 10) + 'T' + result.toISOString().slice(11, 16);
}
function wallDateAndTime(instant: string, timezone: string) {
  const p = localParts(Date.parse(instant), timezone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

async function contextForToken(token: string, activeOnly = true) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) fail(404, 'Booking page not found');
  const link = await dbGet(
    'SELECT * FROM ac_calendar_appointment_links WHERE token_hash=?' + (activeOnly ? ' AND active=1' : ''),
    [hash(token)],
  );
  if (!link) fail(404, 'Booking page not found');
  const owner = await dbGet(
    'SELECT m.role,w.kind,w.status FROM ac_memberships m JOIN ac_workspaces w ON w.id=m.org_id WHERE m.org_id=? AND m.user_id=?',
    [link.org_id, (await dbGet('SELECT owner_id FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?', [link.type_id, link.org_id, link.environment, 'calendar_appointment_type']))?.owner_id || ''],
  );
  if (!owner || owner.kind !== 'business' || owner.status !== 'active') fail(404, 'Booking page not found');
  const typeRow = await dbGet('SELECT owner_id,data,status FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?', [link.type_id, link.org_id, link.environment, 'calendar_appointment_type']);
  if (!typeRow || typeRow.status !== 'active') fail(404, 'Booking page not found');
  const a: Access = { org: link.org_id, environment: link.environment, actor: typeRow.owner_id, role: owner.role, api: false };
  await requireServices(a, ['calendar']);
  await authorize(a, 'calendar', link.type_id, false);
  const type = await read(a, link.type_id, 'calendar_appointment_type');
  if (!type.data.active) fail(404, 'Booking page not found');
  if (type.data.staff.length < Number(link.capacity)) fail(409, 'Appointment capacity exceeds the configured staff');
  return { a, link, type };
}

export async function createPublicCalendarLink(a: Access, typeId: string, input: unknown) {
  const data = linkInput.parse(input);
  await authorize(a, 'calendar', typeId, true);
  const type = await read(a, typeId, 'calendar_appointment_type');
  const role = await currentMember(a);
  if (type.owner_id !== a.actor && !['owner', 'admin'].includes(role)) fail(403, 'Only the appointment type owner or workspace administrator can publish it');
  if (!type.data.active) fail(409, 'Activate the appointment type before publishing a booking page');
  if (data.capacity > type.data.staff.length) fail(400, 'Capacity cannot exceed the number of assigned staff');
  const token = bookingSecret();
  await dbTransaction(async () => {
    await dbRun('UPDATE ac_calendar_appointment_links SET active=0,revoked_at=? WHERE org_id=? AND environment=? AND type_id=? AND active=1', [now(), a.org, a.environment, typeId]);
    await dbRun('INSERT INTO ac_calendar_appointment_links(id,org_id,environment,type_id,token_hash,capacity,work_days,active,created_at,revoked_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)', [randomUUID(), a.org, a.environment, typeId, hash(token), data.capacity, JSON.stringify(data.work_days), 1, now()]);
  });
  await audit(a.org, a.actor, 'calendar.appointment.public_link.created', typeId);
  return { url: `/calendar/book/${token}`, capacity: data.capacity, work_days: data.work_days };
}

export async function revokePublicCalendarLink(a: Access, typeId: string) {
  await authorize(a, 'calendar', typeId, true);
  const type = await read(a, typeId, 'calendar_appointment_type');
  const role = await currentMember(a);
  if (type.owner_id !== a.actor && !['owner', 'admin'].includes(role)) fail(403, 'Only the appointment type owner or workspace administrator can manage it');
  await dbRun('UPDATE ac_calendar_appointment_links SET active=0,revoked_at=? WHERE org_id=? AND environment=? AND type_id=? AND active=1', [now(), a.org, a.environment, typeId]);
  await audit(a.org, a.actor, 'calendar.appointment.public_link.revoked', typeId);
  return { revoked: true };
}

export async function publicAppointmentInfo(token: string) {
  const { link, type } = await contextForToken(token);
  return { name: type.data.name, duration_minutes: type.data.duration_minutes, timezone: type.data.timezone, capacity: Number(link.capacity), work_days: JSON.parse(link.work_days) };
}

async function availableStaff(a: Access, type: any, start: string, end: string): Promise<string[]> {
  const availability = await calendarAvailability(a, start, end, type.data.staff);
  return availability.data.filter((person: any) => !person.busy.some((slot: any) => Date.parse(slot.start) < Date.parse(end) && Date.parse(slot.end) > Date.parse(start))).map((person: any) => person.member_id);
}
async function slotCount(link: any, type: any, start: string, end: string) {
  const booked = await dbGet('SELECT occupied FROM ac_calendar_booking_slots WHERE org_id=? AND environment=? AND type_id=? AND start_at=?', [link.org_id, link.environment, link.type_id, start]);
  return Number(booked?.occupied || 0) < Number(link.capacity) && (await availableStaff({ org: link.org_id, environment: link.environment, actor: type.owner_id, role: 'owner', api: false }, type, start, end)).length > 0;
}

export async function publicAppointmentAvailability(token: string, date: string) {
  const { a, link, type } = await contextForToken(token);
  if (!safeDate(date)) fail(400, 'Use a valid calendar date');
  const offset = Date.parse(date + 'T00:00:00Z') - Date.now();
  if (offset < -86400000 || offset > 180 * 86400000) fail(400, 'Choose a date within the next 180 days');
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  const rules = JSON.parse(link.work_days) as z.infer<typeof workDay>[];
  const intervals = rules.filter((rule) => rule.weekday === weekday);
  const candidates: { start: string; end: string }[] = [];
  for (const interval of intervals) {
    const [startHour, startMinute] = interval.start.split(':').map(Number);
    const [endHour, endMinute] = interval.end.split(':').map(Number);
    const first = startHour * 60 + startMinute;
    const last = endHour * 60 + endMinute - Number(type.data.duration_minutes);
    for (let minute = first; minute <= last; minute += 15) {
      const localStart = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      const localEnd = addLocalMinutes(date, localStart, Number(type.data.duration_minutes));
      const start = localToInstant(date, localStart, type.data.timezone);
      const end = localToInstant(localEnd.slice(0, 10), localEnd.slice(11), type.data.timezone);
      if (!start || !end || Date.parse(start) < Date.now() + 30 * 60000) continue;
      candidates.push({ start, end });
    }
  }
  if (!candidates.length) return { date, timezone: type.data.timezone, duration_minutes: type.data.duration_minutes, slots: [] };
  const availability = await calendarAvailability(a, candidates[0].start, candidates[candidates.length - 1].end, type.data.staff);
  const occupiedRows = await dbAll('SELECT start_at,occupied FROM ac_calendar_booking_slots WHERE org_id=? AND environment=? AND type_id=? AND start_at>=? AND start_at<=?', [link.org_id, link.environment, link.type_id, candidates[0].start, candidates[candidates.length - 1].start]);
  const occupied = new Map(occupiedRows.map((row: any) => [row.start_at, Number(row.occupied)]));
  const slots = candidates.filter((slot) => {
    if ((occupied.get(slot.start) || 0) >= Number(link.capacity)) return false;
    return availability.data.some((person: any) => !person.busy.some((busy: any) => Date.parse(busy.start) < Date.parse(slot.end) && Date.parse(busy.end) > Date.parse(slot.start)));
  }).map((slot) => slot.start);
  return { date, timezone: type.data.timezone, duration_minutes: type.data.duration_minutes, slots };
}

async function saveHistory(org: string, environment: string, bookingId: string, actorType: string, actorId: string | null, action: string, details: unknown = {}) {
  await dbRun('INSERT INTO ac_calendar_booking_history(id,org_id,environment,booking_id,actor_type,actor_id,action,details,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [randomUUID(), org, environment, bookingId, actorType, actorId, action, JSON.stringify(details), now()]);
}
async function reserveSlot(link: any, typeId: string, start: string) {
  const result = await dbRun(
    'INSERT INTO ac_calendar_booking_slots(id,org_id,environment,type_id,start_at,occupied) VALUES (?,?,?,?,?,1) ON CONFLICT(org_id,environment,type_id,start_at) DO UPDATE SET occupied=ac_calendar_booking_slots.occupied+1 WHERE ac_calendar_booking_slots.occupied < ?',
    [randomUUID(), link.org_id, link.environment, typeId, start, Number(link.capacity)],
  );
  if (!result.changes) fail(409, 'This time has reached its booking capacity');
}
async function releaseSlot(row: any, typeId: string, start: string) {
  await dbRun('UPDATE ac_calendar_booking_slots SET occupied=occupied-1 WHERE org_id=? AND environment=? AND type_id=? AND start_at=? AND occupied>0', [row.org_id, row.environment, typeId, start]);
}

export async function createPublicAppointmentRequest(token: string, input: unknown) {
  const request = bookingInput.parse(input);
  const { a, link, type } = await contextForToken(token);
  const start = new Date(request.start).toISOString();
  const end = new Date(Date.parse(start) + Number(type.data.duration_minutes) * 60000).toISOString();
  const prior = await dbGet('SELECT * FROM ac_calendar_booking_requests WHERE org_id=? AND environment=? AND type_id=? AND request_key=?', [link.org_id, link.environment, type.id, request.request_key]);
  if (prior) {
    const existing = decrypt(prior);
    if (prior.start_at !== start || existing.email !== request.email.toLowerCase() || existing.name !== request.name)
      fail(409, 'Request key was already used for a different appointment');
    return { id: prior.id, status: prior.status, manage_url: `/calendar/manage/${existing.manage}`, message: 'This request was already submitted.' };
  }
  const local = wallDateAndTime(start, type.data.timezone);
  const id = randomUUID();
  const manage = bookingSecret();
  const at = now();
  const payload = encrypt(link.org_id, link.environment, id, {
    name: request.name, email: request.email.toLowerCase(), phone: request.phone, note: request.note, manage,
  });
  let savedId = id, savedManage = manage, savedStatus = 'pending';
  await dbTransaction(async () => {
    await lockWorkspace(link.org_id);
    const replay = await dbGet('SELECT * FROM ac_calendar_booking_requests WHERE org_id=? AND environment=? AND type_id=? AND request_key=?', [link.org_id, link.environment, type.id, request.request_key]);
    if (replay) {
      const existing = decrypt(replay);
      if (replay.start_at !== start || existing.email !== request.email.toLowerCase() || existing.name !== request.name)
        fail(409, 'Request key was already used for a different appointment');
      savedId = replay.id; savedManage = existing.manage; savedStatus = replay.status;
      return;
    }
    const dateSlots = await publicAppointmentAvailability(token, local.date);
    if (!dateSlots.slots.includes(start)) fail(409, 'Choose a currently available time');
    await reserveSlot(link, type.id, start);
    await dbRun('INSERT INTO ac_calendar_booking_requests(id,org_id,environment,type_id,link_id,start_at,end_at,proposed_start,proposed_end,status,payload,manage_hash,event_id,assigned_staff,request_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, link.org_id, link.environment, type.id, link.id, start, end, null, null, 'pending', payload, hash(manage), null, null, request.request_key, at, at]);
    await saveHistory(link.org_id, link.environment, id, 'visitor', null, 'requested', { start, end });
  });
  if (savedId === id) await notify(a, { category: 'calendar', title: 'Appointment request received', body: 'A visitor requested a time. Open Calendar to review the request.', resource_id: id, key: 'calendar-public-booking:' + id, user_id: type.owner_id, capability: 'read', action_data: { app_id: 'calendar', section: 'appointments', record_id: id } });
  return { id: savedId, status: savedStatus, manage_url: `/calendar/manage/${savedManage}`, message: savedStatus === 'pending' ? 'Your request is waiting for confirmation. No email has been sent.' : 'This request was already submitted.' };
}

export async function publicAppointmentManage(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) fail(404, 'Booking request not found');
  const row = await dbGet('SELECT * FROM ac_calendar_booking_requests WHERE manage_hash=?', [hash(token)]);
  if (!row) fail(404, 'Booking request not found');
  const typeRow = await dbGet('SELECT owner_id FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?', [row.type_id, row.org_id, row.environment, 'calendar_appointment_type']);
  if (!typeRow) fail(404, 'Booking request not found');
  const type = await read({ org: row.org_id, environment: row.environment, actor: typeRow.owner_id, role: 'owner', api: false }, row.type_id, 'calendar_appointment_type');
  return { id: row.id, status: row.status, start: row.start_at, end: row.end_at, proposed_start: row.proposed_start, proposed_end: row.proposed_end, timezone: type.data.timezone, duration_minutes: type.data.duration_minutes };
}

export async function updatePublicAppointmentRequest(token: string, input: unknown) {
  const action = z.discriminatedUnion('action', [
    z.object({ action: z.literal('cancel') }).strict(),
    z.object({ action: z.literal('reschedule'), start: z.string().datetime({ offset: true }) }).strict(),
  ]).parse(input);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) fail(404, 'Booking request not found');
  const manageHash = hash(token);
  const scope = await dbGet('SELECT org_id FROM ac_calendar_booking_requests WHERE manage_hash=?', [manageHash]);
  if (!scope) fail(404, 'Booking request not found');
  return dbTransaction(async () => {
    await lockWorkspace(scope.org_id);
    return updateLockedPublicAppointment(manageHash, action);
  });
}

async function updateLockedPublicAppointment(manageHash: string, action: { action: 'cancel' } | { action: 'reschedule'; start: string }) {
  const row = await dbGet('SELECT * FROM ac_calendar_booking_requests WHERE manage_hash=?', [manageHash]);
  if (!row) fail(404, 'Booking request not found');
  const type = await read({ org: row.org_id, environment: row.environment, actor: (await dbGet('SELECT owner_id FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=?', [row.type_id, row.org_id, row.environment]))?.owner_id, role: 'owner', api: false } as Access, row.type_id, 'calendar_appointment_type');
  if (action.action === 'cancel') {
    if (row.status === 'pending') {
      await releaseSlot(row, row.type_id, row.start_at);
      await dbRun("UPDATE ac_calendar_booking_requests SET status='cancelled',updated_at=? WHERE id=? AND status='pending'", [now(), row.id]);
      await saveHistory(row.org_id, row.environment, row.id, 'visitor', null, 'cancelled');
      return { status: 'cancelled' };
    }
    if (row.status !== 'confirmed') fail(409, 'This booking cannot be cancelled in its current state');
    await dbRun("UPDATE ac_calendar_booking_requests SET status='cancellation_requested',updated_at=? WHERE id=? AND status='confirmed'", [now(), row.id]);
    await saveHistory(row.org_id, row.environment, row.id, 'visitor', null, 'cancellation_requested');
    return { status: 'cancellation_requested' };
  }
  if (!['pending', 'confirmed'].includes(row.status)) fail(409, 'This booking cannot be rescheduled in its current state');
  const { link } = await contextForBooking(row);
  const start = new Date(action.start).toISOString();
  const end = new Date(Date.parse(start) + Number(type.data.duration_minutes) * 60000).toISOString();
  const info = await availabilityForLink(link, type, start);
  if (!info) fail(409, 'Choose a currently available time');
  await reserveSlot(link, row.type_id, start);
  if (row.status === 'pending') {
    await releaseSlot(row, row.type_id, row.start_at);
    await dbRun("UPDATE ac_calendar_booking_requests SET start_at=?,end_at=?,updated_at=? WHERE id=? AND status='pending'", [start, end, now(), row.id]);
    await saveHistory(row.org_id, row.environment, row.id, 'visitor', null, 'rescheduled_request', { start, end });
    return { status: 'pending', start, end };
  }
  await dbRun("UPDATE ac_calendar_booking_requests SET proposed_start=?,proposed_end=?,status='reschedule_requested',updated_at=? WHERE id=? AND status='confirmed'", [start, end, now(), row.id]);
  await saveHistory(row.org_id, row.environment, row.id, 'visitor', null, 'reschedule_requested', { start, end });
  return { status: 'reschedule_requested', proposed_start: start, proposed_end: end };
}

async function contextForBooking(row: any) {
  const link = await dbGet('SELECT * FROM ac_calendar_appointment_links WHERE id=? AND org_id=? AND environment=?', [row.link_id, row.org_id, row.environment]);
  if (!link) fail(404, 'Booking request not found');
  return { link };
}
async function availabilityForLink(link: any, type: any, start: string) {
  const wall = wallDateAndTime(start, type.data.timezone);
  const weekday = new Date(wall.date + 'T12:00:00Z').getUTCDay();
  const matches = (JSON.parse(link.work_days) as z.infer<typeof workDay>[]).some((item) => {
    const minutes = Number(wall.time.slice(0, 2)) * 60 + Number(wall.time.slice(3));
    return minutes % 15 === 0 && item.weekday === weekday && minutes >= Number(item.start.slice(0, 2)) * 60 + Number(item.start.slice(3)) && minutes + Number(type.data.duration_minutes) <= Number(item.end.slice(0, 2)) * 60 + Number(item.end.slice(3));
  });
  if (!matches || Date.parse(start) < Date.now() + 30 * 60000) return false;
  const end = new Date(Date.parse(start) + Number(type.data.duration_minutes) * 60000).toISOString();
  const a: Access = { org: link.org_id, environment: link.environment, actor: type.owner_id, role: 'owner', api: false };
  if (!(await availableStaff(a, type, start, end)).length) return false;
  const count = await dbGet('SELECT occupied FROM ac_calendar_booking_slots WHERE org_id=? AND environment=? AND type_id=? AND start_at=?', [link.org_id, link.environment, rowTypeId(type), start]);
  return Number(count?.occupied || 0) < Number(link.capacity);
}
const rowTypeId = (type: any) => type.id;

export async function listCalendarAppointmentRequests(a: Access, typeId: string) {
  await authorize(a, 'calendar', typeId, false);
  const type = await read(a, typeId, 'calendar_appointment_type');
  const role = await currentMember(a);
  if (type.owner_id !== a.actor && !['owner', 'admin'].includes(role)) fail(403, 'Only the appointment type owner or workspace administrator can review requests');
  const rows = await dbAll('SELECT * FROM ac_calendar_booking_requests WHERE org_id=? AND environment=? AND type_id=? ORDER BY created_at DESC LIMIT 200', [a.org, a.environment, typeId]);
  return { data: rows.map((row) => ({ id: row.id, status: row.status, start: row.start_at, end: row.end_at, proposed_start: row.proposed_start, proposed_end: row.proposed_end, event_id: row.event_id, visitor: (() => { const { name, email, phone, note } = decrypt(row); return { name, email, phone, note }; })() })) };
}

export async function reviewCalendarAppointmentRequest(a: Access, typeId: string, bookingId: string, input: unknown) {
  const request = z.object({ action: z.enum(['approve', 'decline', 'approve_reschedule', 'approve_cancellation', 'reject_change']) }).strict().parse(input);
  return dbTransaction(async () => {
    await lockWorkspace(a.org);
    return reviewLockedCalendarAppointment(a, typeId, bookingId, request.action);
  });
}

async function reviewLockedCalendarAppointment(a: Access, typeId: string, bookingId: string, action: 'approve' | 'decline' | 'approve_reschedule' | 'approve_cancellation' | 'reject_change') {
  await authorize(a, 'calendar', typeId, true);
  const type = await read(a, typeId, 'calendar_appointment_type');
  const role = await currentMember(a);
  if (type.owner_id !== a.actor && !['owner', 'admin'].includes(role)) fail(403, 'Only the appointment type owner or workspace administrator can review requests');
  const row = await dbGet('SELECT * FROM ac_calendar_booking_requests WHERE id=? AND org_id=? AND environment=? AND type_id=?', [bookingId, a.org, a.environment, typeId]);
  if (!row) fail(404, 'Appointment request not found');
    if (action === 'approve') {
      if (row.status !== 'pending') fail(409, 'Only a pending request can be confirmed');
      const staff = await availableStaff(a, type, row.start_at, row.end_at);
      if (!staff.length) fail(409, 'Staff availability changed; propose another time');
      const assigned = staff[0];
      const event = await insert(a, 'calendar_event', {
        title: type.data.name, description: 'Public appointment', start: row.start_at, end: row.end_at,
        timezone: type.data.timezone, all_day: false, location: '', meeting_url: '', visibility: 'default',
        recurrence: 'none', recurrence_rule: null, attendees: [{ user_id: assigned, response: 'accepted' }],
        linked_record: { kind: 'calendar_appointment_type', id: typeId }, occurrence_exceptions: [],
        organizer_id: assigned, cancelled_at: null,
      }, { owner: a.actor });
      await dbRun('INSERT INTO ac_erp_grants(org_id,environment,resource_id,user_id,permission) VALUES (?,?,?,?,?) ON CONFLICT(org_id,environment,resource_id,user_id) DO NOTHING', [a.org, a.environment, event.id, assigned, 'view']);
      await dbRun("UPDATE ac_calendar_booking_requests SET status='confirmed',event_id=?,assigned_staff=?,updated_at=? WHERE id=? AND status='pending'", [event.id, assigned, now(), row.id]);
      await notify(a, { category: 'calendar', title: 'Appointment confirmed', body: 'An appointment request was confirmed. Open Calendar to review it.', resource_id: event.id, key: 'calendar-public-confirm:' + row.id, user_id: assigned, capability: 'read', action_data: { app_id: 'calendar', section: 'calendar', record_id: event.id } });
      await saveHistory(a.org, a.environment, row.id, 'member', a.actor, 'confirmed', { event_id: event.id, assigned_staff: assigned });
    } else if (action === 'decline') {
      if (row.status !== 'pending') fail(409, 'Only a pending request can be declined');
      await releaseSlot(row, typeId, row.start_at);
      await dbRun("UPDATE ac_calendar_booking_requests SET status='declined',updated_at=? WHERE id=? AND status='pending'", [now(), row.id]);
      await saveHistory(a.org, a.environment, row.id, 'member', a.actor, 'declined');
    } else if (action === 'approve_cancellation') {
      if (row.status !== 'cancellation_requested' || !row.event_id) fail(409, 'No cancellation request is awaiting review');
      const event = await read(a, row.event_id, 'calendar_event');
      await update(a, event, { ...event.data, cancelled_at: now() }, { status: 'cancelled' }, 'cancelled');
      await releaseSlot(row, typeId, row.start_at);
      await dbRun("UPDATE ac_calendar_booking_requests SET status='cancelled',updated_at=? WHERE id=?", [now(), row.id]);
      await saveHistory(a.org, a.environment, row.id, 'member', a.actor, 'cancellation_approved');
    } else if (action === 'approve_reschedule') {
      if (row.status !== 'reschedule_requested' || !row.event_id || !row.proposed_start || !row.proposed_end) fail(409, 'No reschedule request is awaiting review');
      const staff = await availableStaff(a, type, row.proposed_start, row.proposed_end);
      if (!staff.length) fail(409, 'Staff availability changed; propose another time');
      const event = await read(a, row.event_id, 'calendar_event');
      const assigned = staff[0];
      await update(a, event, { ...event.data, start: row.proposed_start, end: row.proposed_end, organizer_id: assigned, attendees: [{ user_id: assigned, response: 'accepted' }] }, {}, 'rescheduled');
      await dbRun('DELETE FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=?', [a.org, a.environment, event.id]);
      await dbRun('INSERT INTO ac_erp_grants(org_id,environment,resource_id,user_id,permission) VALUES (?,?,?,?,?) ON CONFLICT(org_id,environment,resource_id,user_id) DO NOTHING', [a.org, a.environment, event.id, assigned, 'view']);
      await releaseSlot(row, typeId, row.start_at);
      await dbRun("UPDATE ac_calendar_booking_requests SET status='confirmed',start_at=proposed_start,end_at=proposed_end,assigned_staff=?,proposed_start=NULL,proposed_end=NULL,updated_at=? WHERE id=?", [assigned, now(), row.id]);
      await saveHistory(a.org, a.environment, row.id, 'member', a.actor, 'reschedule_confirmed', { start: row.proposed_start, end: row.proposed_end, assigned_staff: assigned });
    } else {
      if (!['reschedule_requested', 'cancellation_requested'].includes(row.status)) fail(409, 'No visitor change is awaiting review');
      if (row.status === 'reschedule_requested' && row.proposed_start) await releaseSlot(row, typeId, row.proposed_start);
      await dbRun("UPDATE ac_calendar_booking_requests SET status='confirmed',proposed_start=NULL,proposed_end=NULL,updated_at=? WHERE id=?", [now(), row.id]);
      await saveHistory(a.org, a.environment, row.id, 'member', a.actor, 'change_rejected');
    }
  return { id: row.id, status: (await dbGet('SELECT status FROM ac_calendar_booking_requests WHERE id=?', [row.id]))?.status };
}

export async function calendarAppointmentRequestHistory(a: Access, typeId: string, bookingId: string) {
  const requests = await listCalendarAppointmentRequests(a, typeId);
  if (!requests.data.some((item) => item.id === bookingId)) fail(404, 'Appointment request not found');
  return { data: await dbAll('SELECT actor_type,actor_id,action,details,created_at FROM ac_calendar_booking_history WHERE org_id=? AND environment=? AND booking_id=? ORDER BY created_at,id', [a.org, a.environment, bookingId]) };
}
