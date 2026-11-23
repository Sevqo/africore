import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
const { isPg } = configureTestEnv('phase3-apps');
import { closeDb, dbAll, dbGet, dbRun, migrate } from '../db';
import { createApp } from '../app';
import { seal, unseal } from '../platform/crypto';
import { processBusinessEvents, processCalendarReminders } from '../operations/business-worker';
import { websitePageIsIndexable } from '../apps/phase3';
import sharp from 'sharp';

let server: any,
  base = '',
  org = '',
  ownerCookie = '',
  guestCookie = '',
  guestId = '',
  ownerId = '';
const key = () => randomUUID();
async function tableExists(name: string) {
  return isPg
    ? dbGet('SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=?', [name])
    : dbGet("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name]);
}
async function call(
  path: string,
  session: string,
  method = 'GET',
  body?: unknown,
  environment = 'sandbox',
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Cookie: session,
      'Content-Type': 'application/json',
      'Idempotency-Key': key(),
      'X-Environment': environment,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const orgPath = (suffix: string) => `/api/v1/organizations/${org}${suffix}`;
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const first = await fetch(base + '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: randomUUID() + '@example.test',
      password: 'Synthetic-phase3-fixture-2026!',
    }),
  });
  const signup = await first.json();
  ownerCookie = first.headers.get('set-cookie')?.split(';')[0] || '';
  assert.equal(first.status, 201);
  await call('/api/auth/verify', ownerCookie, 'POST', { token: signup.verification_token });
  ownerId = (await call('/api/auth/account', ownerCookie)).body.user.id;
  const workspace = await call('/api/auth/workspaces', ownerCookie, 'POST', {
    kind: 'business',
    name: 'Phase 3 fixture',
    display_name: 'Fixture Owner',
    services: [],
  });
  assert.equal(workspace.status, 201, JSON.stringify(workspace.body));
  org = workspace.body.id;
  const second = await fetch(base + '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: randomUUID() + '@example.test',
      password: 'Synthetic-phase3-fixture-2026!',
    }),
  });
  const secondData = await second.json();
  guestCookie = second.headers.get('set-cookie')?.split(';')[0] || '';
  await call('/api/auth/verify', guestCookie, 'POST', { token: secondData.verification_token });
  const account = await call('/api/auth/account', guestCookie);
  guestId = account.body.user.id;
  await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'owner')", [
    org,
    guestId,
  ]);
});
after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(resolve));
  await closeDb();
});

test('Website sitemap omits pages marked noindex while allowing public pages', () => {
  assert.equal(websitePageIsIndexable({ noindex: true }), false);
  assert.equal(websitePageIsIndexable({ noindex: false }), true);
  assert.equal(websitePageIsIndexable({}), true);
  assert.equal(websitePageIsIndexable(null), false);
});

test('Calendar keeps member invitations scoped, private details redacted, and responses durable', async () => {
  const preview = await call(orgPath('/apps/calendar/installation-preview'), ownerCookie);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.services.map((s: any) => s.id).join(','), 'calendar');
  const installed = await call(orgPath('/apps/calendar/install'), ownerCookie, 'POST', {
    review_hash: preview.body.review_hash,
    optional_services: [],
  });
  assert.equal(installed.status, 200);
  const created = await call(orgPath('/calendar/events'), ownerCookie, 'POST', {
    title: 'Fixture planning session',
    description: 'Private agenda text',
    start: '2026-11-22T09:00:00+03:00',
    end: '2026-11-22T10:00:00+03:00',
    timezone: 'Africa/Nairobi',
    visibility: 'private',
    recurrence: 'none',
    attendees: [{ user_id: guestId, response: 'pending' }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const ownerHistory = await call(
    orgPath(`/calendar/events/${created.body.id}/history`),
    ownerCookie,
  );
  assert.equal(ownerHistory.status, 200, JSON.stringify(ownerHistory.body));
  assert.equal(ownerHistory.body.data[0].action, 'created');
  assert.equal(ownerHistory.body.data[0].title, 'Fixture planning session');
  const attendeeHistory = await call(
    orgPath(`/calendar/events/${created.body.id}/history`),
    guestCookie,
  );
  assert.equal(attendeeHistory.status, 403);
  const invite = await call(orgPath('/calendar/events'), guestCookie);
  assert.equal(invite.status, 200);
  assert.equal(
    invite.body.data.find((e: any) => e.id === created.body.id)?.data.my_response,
    'pending',
  );
  const notification = await dbAll(
    'SELECT id FROM ac2_notifications WHERE org_id=? AND user_id=? AND category=?',
    [org, guestId, 'calendar'],
  );
  assert.equal(notification.length, 1);
  const response = await call(
    orgPath(`/calendar/events/${created.body.id}/respond`),
    guestCookie,
    'POST',
    { response: 'accepted' },
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const accepted = await call(orgPath('/calendar/events'), guestCookie);
  assert.equal(
    accepted.body.data.find((e: any) => e.id === created.body.id)?.data.my_response,
    'accepted',
  );
  const privateEvent = await call(orgPath('/calendar/events'), guestCookie, 'POST', {
    title: 'Confidential board session',
    description: 'Do not disclose this',
    start: '2026-11-23T09:00:00+03:00',
    end: '2026-11-23T10:00:00+03:00',
    timezone: 'Africa/Nairobi',
    visibility: 'private',
    recurrence: 'none',
    attendees: [],
  });
  assert.equal(privateEvent.status, 201);
  const ownerCalendar = await call(orgPath('/calendar/events'), ownerCookie);
  const redacted = ownerCalendar.body.data.find(
    (e: any) => e.data.start === privateEvent.body.data.start,
  );
  assert.equal(redacted.data.title, 'Busy');
  assert.equal(redacted.data.description, '');
});

test('Calendar CRM, Work, Sales and Documents links stay scoped to their source apps', async () => {
  const calendarPreview = await call(orgPath('/apps/calendar/installation-preview'), ownerCookie);
  assert.equal(calendarPreview.status, 200, JSON.stringify(calendarPreview.body));
  const calendarInstalled = await call(
    orgPath('/apps/calendar/install'),
    ownerCookie,
    'POST',
    { review_hash: calendarPreview.body.review_hash, optional_services: [] },
  );
  assert.equal(calendarInstalled.status, 200, JSON.stringify(calendarInstalled.body));
  const preview = await call(orgPath('/apps/work/installation-preview'), ownerCookie);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const installed = await call(orgPath('/apps/work/install'), ownerCookie, 'POST', {
    review_hash: preview.body.review_hash,
    optional_services: [],
  });
  assert.equal(installed.status, 200, JSON.stringify(installed.body));
  const crmPreview = await call(orgPath('/apps/crm/installation-preview'), ownerCookie);
  assert.equal(crmPreview.status, 200, JSON.stringify(crmPreview.body));
  const crmInstalled = await call(orgPath('/apps/crm/install'), ownerCookie, 'POST', {
    review_hash: crmPreview.body.review_hash,
    optional_services: [],
  });
  assert.equal(crmInstalled.status, 200, JSON.stringify(crmInstalled.body));
  const documentsPreview = await call(orgPath('/apps/documents/installation-preview'), ownerCookie);
  assert.equal(documentsPreview.status, 200, JSON.stringify(documentsPreview.body));
  const documentsInstalled = await call(orgPath('/apps/documents/install'), ownerCookie, 'POST', {
    review_hash: documentsPreview.body.review_hash,
    optional_services: [],
  });
  assert.equal(documentsInstalled.status, 200, JSON.stringify(documentsInstalled.body));
  assert.equal(
    (await call(orgPath('/services/calendar/activate'), ownerCookie, 'POST', {})).status,
    200,
  );
  assert.equal(
    (await call(orgPath('/services/work/activate'), ownerCookie, 'POST', {})).status,
    200,
  );
  assert.equal(
    (await call(orgPath('/services/crm/activate'), ownerCookie, 'POST', {})).status,
    200,
  );
  assert.equal(
    (await call(orgPath('/services/documents/activate'), ownerCookie, 'POST', {})).status,
    200,
  );

  const project = await call(orgPath('/work/projects'), ownerCookie, 'POST', {
    name: 'Calendar link fixture',
    description: 'Synthetic project for a Calendar link',
    owner_id: ownerId,
    members: [{ user_id: ownerId, permission: 'manage' }],
  });
  assert.equal(project.status, 201, JSON.stringify(project.body));
  const task = await call(
    orgPath(`/work/projects/${project.body.id}/tasks`),
    ownerCookie,
    'POST',
    { expected_version: 0, task: { title: 'Prepare meeting agenda', stage: 'planned' } },
  );
  assert.equal(task.status, 201, JSON.stringify(task.body));
  const crmEntry = await call(orgPath('/crm/entries'), ownerCookie, 'POST', {
    kind: 'lead',
    title: 'Discuss project delivery',
    company: 'Synthetic Fixture Ltd',
    currency: 'KES',
  });
  assert.equal(crmEntry.status, 201, JSON.stringify(crmEntry.body));

  const event = {
    title: 'Task linked meeting',
    description: '',
    start: '2026-11-24T09:00:00+03:00',
    end: '2026-11-24T10:00:00+03:00',
    timezone: 'Africa/Nairobi',
    recurrence: 'none',
    attendees: [],
    linked_record: { kind: 'work_task', id: task.body.id },
  };
  const created = await call(orgPath('/calendar/events'), ownerCookie, 'POST', event);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.deepEqual(created.body.data.linked_record, event.linked_record);

  const crmEvent = await call(orgPath('/calendar/events'), ownerCookie, 'POST', {
    ...event,
    title: 'CRM follow-up meeting',
    linked_record: { kind: 'crm_entry', id: crmEntry.body.id },
  });
  assert.equal(crmEvent.status, 201, JSON.stringify(crmEvent.body));
  assert.deepEqual(crmEvent.body.data.linked_record, {
    kind: 'crm_entry',
    id: crmEntry.body.id,
  });

  const privateDocument = await call(orgPath('/documents'), ownerCookie, 'POST', {
    metadata: { name: 'Calendar private attachment' },
    policy: { visibility: 'private', grants: [], folder_id: null, inherit_folder: false, employee_id: null },
    file: { filename: 'agenda.txt', content_type: 'text/plain', content_base64: Buffer.from('Synthetic agenda').toString('base64') },
  });
  assert.equal(privateDocument.status, 200, JSON.stringify(privateDocument.body));
  const documentEvent = await call(orgPath('/calendar/events'), ownerCookie, 'POST', {
    ...event,
    title: 'Document linked meeting',
    linked_record: { kind: 'document', id: privateDocument.body.id },
  });
  assert.equal(documentEvent.status, 201, JSON.stringify(documentEvent.body));
  assert.deepEqual(documentEvent.body.data.linked_record, { kind: 'document', id: privateDocument.body.id });
  const guestDocumentEvent = await call(orgPath('/calendar/events'), guestCookie, 'POST', {
    ...event,
    title: 'Unauthorized private document link',
    linked_record: { kind: 'document', id: privateDocument.body.id },
  });
  assert.equal(guestDocumentEvent.status, 404, JSON.stringify(guestDocumentEvent.body));

  assert.equal((await call(orgPath('/services/products/activate'), ownerCookie, 'POST', {})).status, 200);
  assert.equal((await call(orgPath('/services/sales/activate'), ownerCookie, 'POST', {})).status, 200);
  assert.equal((await call(orgPath('/services/customers/activate'), ownerCookie, 'POST', {})).status, 200);
  const customer = await call(orgPath('/records/customers'), ownerCookie, 'POST', {
    name: 'Calendar Sales link fixture',
  });
  assert.equal(customer.status, 201, JSON.stringify(customer.body));
  const quote = await call(orgPath('/sales/quotations'), ownerCookie, 'POST', {
    customer_id: customer.body.id,
    currency: 'KES',
    items: [{ description: 'Consultation', quantity: 1, unit_price_minor: 2500 }],
    issue_date: '2026-11-21',
    due_date: '2026-12-21',
  });
  assert.equal(quote.status, 201, JSON.stringify(quote.body));
  const salesEvent = await call(orgPath('/calendar/events'), ownerCookie, 'POST', {
    ...event,
    title: 'Sales customer meeting',
    linked_record: { kind: 'sales_quote', id: quote.body.id },
  });
  assert.equal(salesEvent.status, 201, JSON.stringify(salesEvent.body));
  assert.deepEqual(salesEvent.body.data.linked_record, { kind: 'sales_quote', id: quote.body.id });
  const foreignQuote = await call(orgPath('/calendar/events'), ownerCookie, 'POST', {
    ...event,
    title: 'Foreign Sales link rejected',
    linked_record: { kind: 'sales_quote', id: randomUUID() },
  });
  assert.equal(foreignQuote.status, 404, JSON.stringify(foreignQuote.body));

  const unsupported = await call(orgPath('/calendar/events'), ownerCookie, 'POST', {
    ...event,
    title: 'Unsupported link rejected',
    linked_record: { kind: 'private_customer_record', id: randomUUID() },
  });
  assert.equal(unsupported.status, 400, JSON.stringify(unsupported.body));

  const outsiderSignup = await fetch(base + '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: randomUUID() + '@example.test',
      password: 'Synthetic-phase3-outsider-2026!',
    }),
  });
  const outsiderData = await outsiderSignup.json();
  const outsiderCookie = outsiderSignup.headers.get('set-cookie')?.split(';')[0] || '';
  await call('/api/auth/verify', outsiderCookie, 'POST', {
    token: outsiderData.verification_token,
  });
  const outsiderId = (await call('/api/auth/account', outsiderCookie)).body.user.id;
  await dbRun('INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,? ,?)', [
    org,
    outsiderId,
    'operations',
  ]);
  const inaccessible = await call(orgPath('/calendar/events'), outsiderCookie, 'POST', {
    ...event,
    title: 'Unauthorized Work link rejected',
  });
  assert.equal(inaccessible.status, 404, JSON.stringify(inaccessible.body));
});

test('Calendar recurrence expands bounded series and edits or cancels one occurrence', async () => {
  const created = await call(orgPath('/calendar/events'), ownerCookie, 'POST', {
    title: 'Weekly recurrence fixture',
    description: 'Synthetic series body',
    start: '2026-12-07T09:00:00+03:00',
    end: '2026-12-07T10:00:00+03:00',
    timezone: 'Africa/Nairobi',
    recurrence: 'weekly',
    recurrence_rule: {
      frequency: 'weekly',
      interval: 1,
      weekdays: [1, 3],
      end: 'count',
      count: 5,
      until: null,
    },
    attendees: [],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const from = '2026-12-01T00:00:00.000Z',
    to = '2027-01-01T00:00:00.000Z';
  const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const initial = await call(orgPath('/calendar/events' + query), ownerCookie);
  const occurrences = initial.body.data.filter((x: any) => x.series_id === created.body.id);
  assert.equal(occurrences.length, 5);
  assert.deepEqual(
    occurrences.map((x: any) => x.occurrence_key),
    [
      '2026-12-07T09:00:00',
      '2026-12-09T09:00:00',
      '2026-12-14T09:00:00',
      '2026-12-16T09:00:00',
      '2026-12-21T09:00:00',
    ],
  );
  const moved = occurrences[1];
  const edit = await call(
    orgPath(
      `/calendar/events/${created.body.id}/occurrences/${encodeURIComponent(moved.occurrence_key)}`,
    ),
    ownerCookie,
    'PUT',
    {
      expected_version: moved.version,
      title: 'Moved Wednesday session',
      description: 'Updated one occurrence',
      start: '2026-12-09T11:00:00+03:00',
      end: '2026-12-09T12:00:00+03:00',
      timezone: 'Africa/Nairobi',
      location: 'Room B',
      meeting_url: '',
      all_day: false,
    },
  );
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  const current = await call(orgPath('/calendar/events' + query), ownerCookie);
  const changed = current.body.data.find(
    (x: any) => x.series_id === created.body.id && x.occurrence_key === moved.occurrence_key,
  );
  assert.equal(changed.data.title, 'Moved Wednesday session');
  assert.equal(changed.data.start, '2026-12-09T08:00:00.000Z');
  const cancel = await call(
    orgPath(
      `/calendar/events/${created.body.id}/occurrences/${encodeURIComponent(occurrences[2].occurrence_key)}/cancel`,
    ),
    ownerCookie,
    'POST',
    { expected_version: changed.version },
  );
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  const afterCancel = await call(orgPath('/calendar/events' + query), ownerCookie);
  assert.equal(afterCancel.body.data.filter((x: any) => x.series_id === created.body.id).length, 4);
  const invalidRange = await call(
    orgPath('/calendar/events?from=2026-01-01&to=2028-01-01'),
    ownerCookie,
  );
  assert.equal(invalidRange.status, 400);
});

test('Calendar work hours are private by default and availability returns busy windows only', async () => {
  const initial = await call(orgPath('/calendar/settings'), ownerCookie);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.configured, false);
  const saved = await call(orgPath('/calendar/settings'), ownerCookie, 'PUT', {
    timezone: 'Africa/Nairobi',
    work_days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '08:30', end: '16:30' })),
    share_with_team: true,
    reminder_minutes_before: 15,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.configured, true);
  const from = '2026-12-07T00:00:00.000Z',
    to = '2026-12-14T00:00:00.000Z';
  const query = new URLSearchParams({ from, to, members: [ownerId, guestId].join(',') });
  const result = await call(orgPath('/calendar/availability?' + query.toString()), ownerCookie);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const owner = result.body.data.find((member: any) => member.member_id === ownerId);
  const guest = result.body.data.find((member: any) => member.member_id === guestId);
  assert.ok(owner.work_days);
  assert.ok(owner.busy.length > 0);
  assert.equal(guest.work_days, null);
  assert.ok(!JSON.stringify(result.body).includes('Weekly recurrence fixture'));

  const guestSettings = await call(orgPath('/calendar/settings'), guestCookie, 'PUT', {
    timezone: 'Africa/Nairobi', work_days: [], share_with_team: false, reminder_minutes_before: 15,
  });
  assert.equal(guestSettings.status, 200, JSON.stringify(guestSettings.body));
  const start = new Date(Date.now() + 10 * 60_000), end = new Date(start.getTime() + 60 * 60_000);
  const event = await call(orgPath('/calendar/events'), ownerCookie, 'POST', {
    title: 'Reminder pipeline fixture', description: '', start: start.toISOString(), end: end.toISOString(),
    timezone: 'Africa/Nairobi', recurrence: 'none', attendees: [{ user_id: guestId, response: 'pending' }],
  });
  assert.equal(event.status, 201, JSON.stringify(event.body));
  const worker = { org, environment: 'sandbox', actor: 'stage2_worker', role: 'system', api: false } as any;
  const scheduled = await processCalendarReminders(worker, new Date());
  const repeated = await processCalendarReminders(worker, new Date());
  assert.equal(scheduled.scheduled, 2); // Organizer and invited attendee each receive their own setting.
  assert.equal(repeated.scheduled, 0);
  await processBusinessEvents(worker);
  const notices = await dbAll(
    "SELECT user_id,title,body FROM ac2_notifications WHERE org_id=? AND environment='sandbox' AND category='calendar' AND resource_id=? AND title='Meeting reminder'",
    [org, event.body.id],
  );
  assert.equal(notices.length, 2);
  assert.ok(notices.every((notice: any) => notice.body.includes('GMT+3')));
  assert.ok(!notices.some((notice: any) => notice.body.includes(event.body.data.title)));
});

test('Calendar appointment types confirm member bookings only when staff calendars are free', async () => {
  const createdType = await call(orgPath('/calendar/appointment-types'), ownerCookie, 'POST', {
    name: 'Fixture consultation',
    duration_minutes: 30,
    timezone: 'Africa/Nairobi',
    staff: [ownerId],
    active: true,
  });
  assert.equal(createdType.status, 201, JSON.stringify(createdType.body));
  const listed = await call(orgPath('/calendar/appointment-types'), ownerCookie);
  assert.equal(listed.status, 200);
  assert.ok(listed.body.data.some((item: any) => item.id === createdType.body.data.id));
  const future = new Date(Date.now() + 14 * 86400000);
  future.setUTCHours(11, 0, 0, 0);
  await dbRun("UPDATE ac_memberships SET role='viewer' WHERE org_id=? AND user_id=?", [org, guestId]);
  const first = await call(
    orgPath(`/calendar/appointment-types/${createdType.body.data.id}/bookings`),
    guestCookie,
    'POST',
    { start: future.toISOString() },
  );
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.status, 'confirmed');
  assert.equal(first.body.event.data.title, 'Fixture consultation');
  const secondFuture = new Date(future.getTime() + 86400000);
  const second = await call(
    orgPath(`/calendar/appointment-types/${createdType.body.data.id}/bookings`),
    guestCookie,
    'POST',
    { start: secondFuture.toISOString() },
  );
  assert.equal(second.status, 201, JSON.stringify(second.body));
  const appointmentInput = Object.fromEntries(
    Object.entries(first.body.event.data).filter(
      ([key]) => !['occurrence_exceptions', 'organizer_id', 'cancelled_at'].includes(key),
    ),
  );
  const blockedMove = await call(
    orgPath(`/calendar/events/${first.body.event.id}`),
    ownerCookie,
    'PUT',
    {
      ...appointmentInput,
      start: secondFuture.toISOString(),
      end: new Date(secondFuture.getTime() + 30 * 60000).toISOString(),
      expected_version: first.body.event.version,
    },
  );
  assert.equal(blockedMove.status, 409, JSON.stringify(blockedMove.body));
  const freeFuture = new Date(future.getTime() + 2 * 86400000);
  const moved = await call(
    orgPath(`/calendar/events/${first.body.event.id}`),
    ownerCookie,
    'PUT',
    {
      ...appointmentInput,
      start: freeFuture.toISOString(),
      end: new Date(freeFuture.getTime() + 30 * 60000).toISOString(),
      expected_version: first.body.event.version,
    },
  );
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(moved.body.data.start, freeFuture.toISOString());
  const deactivated = await call(
    orgPath(`/calendar/appointment-types/${createdType.body.data.id}`),
    ownerCookie,
    'PUT',
    { ...createdType.body.data.data, active: false, expected_version: createdType.body.data.version },
  );
  assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body));
  const inactiveBooking = await call(
    orgPath(`/calendar/appointment-types/${createdType.body.data.id}/bookings`),
    guestCookie,
    'POST',
    { start: new Date(future.getTime() + 86400000).toISOString() },
  );
  assert.equal(inactiveBooking.status, 409);
  await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?", [org, guestId]);
});

test('Calendar public appointment links reserve capacity and support review, reschedule and cancellation', async () => {
  assert.ok(await dbGet('SELECT version FROM platform_migrations WHERE version=?', ['028-calendar-appointments']));
  for (const table of ['ac_calendar_appointment_links', 'ac_calendar_booking_requests', 'ac_calendar_booking_history', 'ac_calendar_booking_slots'])
    assert.ok(await tableExists(table), `missing ${table}`);
  const preview = await call(orgPath('/apps/calendar/installation-preview'), ownerCookie);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const install = await call(orgPath('/apps/calendar/install'), ownerCookie, 'POST', { review_hash: preview.body.review_hash, optional_services: [] });
  assert.equal(install.status, 200, JSON.stringify(install.body));
  const activation = await call(orgPath('/services/calendar/activate'), ownerCookie, 'POST', {});
  assert.equal(activation.status, 200, JSON.stringify(activation.body));
  const created = await call(orgPath('/calendar/appointment-types'), ownerCookie, 'POST', {
    name: 'Public synthetic consultation', duration_minutes: 30, timezone: 'Africa/Nairobi', staff: [ownerId], active: true,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const typeId = created.body.data.id;
  const link = await call(orgPath(`/calendar/appointment-types/${typeId}/public-link`), ownerCookie, 'POST', {
    capacity: 1, work_days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
  });
  assert.equal(link.status, 201, JSON.stringify(link.body));
  const publicToken = link.body.url.split('/').pop();
  assert.match(publicToken, /^[A-Za-z0-9_-]{40,60}$/);
  const publicInfo = await fetch(base + `/api/public/calendar/${publicToken}`);
  assert.equal(publicInfo.status, 200);
  const publicData = await publicInfo.json();
  assert.equal(publicData.name, 'Public synthetic consultation');
  assert.equal(JSON.stringify(publicData).includes(ownerId), false);

  const date = new Date(Date.now() + 21 * 86400000);
  date.setUTCHours(0, 0, 0, 0);
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((part) => [part.type, part.value]));
  const dateLabel = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const availability = await fetch(base + `/api/public/calendar/${publicToken}/availability?date=${dateLabel}`);
  assert.equal(availability.status, 200);
  const available = await availability.json();
  assert.ok(available.slots.length > 0, JSON.stringify(available));
  const start = available.slots[0];
  const createBody = { start, name: 'Visitor Synthetic', email: 'visitor@example.test', phone: '+254700000001', note: 'Please bring a project outline.', consent: true, request_key: randomUUID() };
  const submit = () => fetch(base + `/api/public/calendar/${publicToken}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createBody) });
  const [requested, duplicate] = await Promise.all([submit(), submit()]);
  assert.equal(requested.status, 201, await requested.clone().text());
  const booking = await requested.json();
  assert.equal(booking.status, 'pending');
  assert.ok(!JSON.stringify(booking).includes(createBody.email));
  const stored = await dbGet('SELECT payload FROM ac_calendar_booking_requests WHERE id=?', [booking.id]);
  assert.ok(stored && !stored.payload.includes(createBody.email), 'visitor details are encrypted at rest');
  assert.equal(duplicate.status, 201);
  assert.equal((await duplicate.json()).manage_url, booking.manage_url);
  const atCapacity = await fetch(base + `/api/public/calendar/${publicToken}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...createBody, request_key: randomUUID(), email: 'other@example.test' }) });
  assert.equal(atCapacity.status, 409);

  const manageToken = booking.manage_url.split('/').pop();
  const manageUrl = base + `/api/public/calendar/manage/${manageToken}`;
  assert.equal((await fetch(manageUrl)).status, 200);
  let visitorBooking = await (await fetch(manageUrl)).json();
  assert.equal(visitorBooking.status, 'pending');
  const later = available.slots.find((slot: string) => slot !== start);
  assert.ok(later);
  const reschedule = await fetch(manageUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reschedule', start: later }) });
  assert.equal(reschedule.status, 200, await reschedule.clone().text());
  assert.equal((await reschedule.json()).start, later);
  visitorBooking = await (await fetch(manageUrl)).json();
  assert.equal(visitorBooking.status, 'pending');
  assert.equal(visitorBooking.start, later);
  const requests = await call(orgPath(`/calendar/appointment-types/${typeId}/requests`), ownerCookie);
  assert.equal(requests.status, 200, JSON.stringify(requests.body));
  assert.equal(requests.body.data.find((row: any) => row.id === booking.id).visitor.email, createBody.email);
  const approve = () => call(orgPath(`/calendar/appointment-types/${typeId}/requests/${booking.id}/review`), ownerCookie, 'POST', { action: 'approve' });
  const decisions = await Promise.all([approve(), approve()]);
  assert.deepEqual(decisions.map((result) => result.status).sort(), [200, 409]);
  assert.equal(decisions.find((result) => result.status === 200)?.body.status, 'confirmed');

  const change = available.slots.find((slot: string) => Date.parse(slot) >= Date.parse(later) + 30 * 60000);
  if (change) {
    const requestedMove = await fetch(manageUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reschedule', start: change }) });
    assert.equal(requestedMove.status, 200);
    const listed = await call(orgPath(`/calendar/appointment-types/${typeId}/requests`), ownerCookie);
    assert.equal(listed.body.data.find((row: any) => row.id === booking.id).status, 'reschedule_requested');
    const moved = await call(orgPath(`/calendar/appointment-types/${typeId}/requests/${booking.id}/review`), ownerCookie, 'POST', { action: 'approve_reschedule' });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.status, 'confirmed');
  }
  const cancellation = await fetch(manageUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) });
  assert.equal(cancellation.status, 200);
  assert.equal((await cancellation.json()).status, 'cancellation_requested');
  const cancelled = await call(orgPath(`/calendar/appointment-types/${typeId}/requests/${booking.id}/review`), ownerCookie, 'POST', { action: 'approve_cancellation' });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.status, 'cancelled');
  const history = await call(orgPath(`/calendar/appointment-types/${typeId}/requests/${booking.id}/history`), ownerCookie);
  assert.equal(history.status, 200, JSON.stringify(history.body));
  assert.equal(history.body.data.filter((event: any) => event.action === 'confirmed').length, 1);
  assert.ok(history.body.data.some((event: any) => event.action === 'cancellation_approved'));
});

test('Website installs without backfilling an unrelated service and publishes only the production route', async () => {
  assert.ok(
    await dbGet('SELECT version FROM platform_migrations WHERE version=?', ['027-website-forms']),
    'the isolated schema must include the additive Website forms migration',
  );
  assert.ok(
    await tableExists('ac_website_form_submissions'),
  );
  const preview = await call(orgPath('/apps/website/installation-preview'), ownerCookie);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.services.map((s: any) => s.id).join(','), 'website');
  const installed = await call(orgPath('/apps/website/install'), ownerCookie, 'POST', {
    review_hash: preview.body.review_hash,
    optional_services: [],
  });
  assert.equal(installed.status, 200);
  const activated = await call(orgPath('/services/website/activate'), ownerCookie, 'POST', {});
  assert.equal(activated.status, 200, JSON.stringify(activated.body));
  const identityBefore = await call(orgPath('/website/settings'), ownerCookie);
  assert.equal(identityBefore.status, 200, JSON.stringify(identityBefore.body));
  assert.equal(identityBefore.body.data.public_enabled, false);
  const identitySaved = await call(orgPath('/website/settings'), ownerCookie, 'PUT', {
    ...identityBefore.body.data,
    name: 'Fixture Company Website',
    description: 'Synthetic workspace site identity.',
    public_enabled: true,
    expected_version: undefined,
  });
  assert.equal(identitySaved.status, 200, JSON.stringify(identitySaved.body));
  assert.equal(identitySaved.body.data.name, 'Fixture Company Website');
  const image = await sharp({
    create: { width: 12, height: 8, channels: 3, background: '#227766' },
  })
    .png()
    .toBuffer();
  const media = await call(orgPath('/commerce/assets'), ownerCookie, 'POST', {
    label: 'Synthetic website media',
    alt: 'A fictional green rectangle',
    image_base64: image.toString('base64'),
    acknowledge_public_use: true,
    acknowledge_rights: true,
  });
  assert.equal(media.status, 201, JSON.stringify(media.body));
  assert.match(media.body.id, /^[0-9a-f-]{36}$/i);
  const previewImage = await call(
    orgPath(`/commerce/assets/${media.body.id}/preview`),
    ownerCookie,
  );
  assert.equal(previewImage.status, 200, JSON.stringify(previewImage.body));
  assert.match(previewImage.body.data_url, /^data:image\/webp;base64,/);
  const created = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Fixture About',
    slug: 'fixture-about',
    noindex: true,
    theme: {
      primary: '#087e78',
      width: 'wide',
      typography: 'serif',
      section_spacing: 'relaxed',
      header_style: 'sticky',
      footer_style: 'dark',
      background: '#f4f7f6',
      button_style: 'square',
    },
    menus: [
      { label: 'Home', url: '/', parent_index: null },
      { label: 'Services', url: '/fixture-about?section=services', parent_index: null },
      { label: 'Consulting', url: '/fixture-about#consulting', parent_index: 1 },
    ],
    sections: [
      {
        type: 'gallery',
        title: 'About Fixture Gallery',
        body: 'Safe typed content',
        image_ids: [media.body.id],
        alt: media.body.alt,
        content_width: 'narrow',
        alignment: 'center',
        layout_columns: 'three',
      },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.deepEqual(created.body.data.sections[0].image_ids, [media.body.id]);
  assert.equal(created.body.data.sections[0].layout_columns, 'three');
  assert.equal(created.body.data.menus[2].parent_index, 1);
  assert.equal(created.body.data.theme.typography, 'serif');
  assert.equal(created.body.data.theme.section_spacing, 'relaxed');
  assert.equal(created.body.data.theme.header_style, 'sticky');
  assert.equal(created.body.data.theme.footer_style, 'dark');
  assert.equal(created.body.data.theme.background, '#f4f7f6');
  assert.equal(created.body.data.theme.button_style, 'square');
  const invalidTheme = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Unsafe theme rejected',
    slug: 'unsafe-theme-rejected',
    sections: [],
    theme: { primary: '#087e78', width: 'wide', font_family: 'url(javascript:alert(1))' },
  });
  assert.equal(invalidTheme.status, 400, 'theme accepts enumerated design tokens, never arbitrary CSS');
  const invalidLayout = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Unsupported block layout', slug: 'unsupported-block-layout',
    sections: [{ type: 'text', layout_columns: 'three' }],
  });
  assert.equal(invalidLayout.status, 400, 'only grid blocks offer explicit columns');
  const duplicateGallery = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Duplicate gallery rejected',
    slug: 'duplicate-gallery-rejected',
    sections: [{ type: 'gallery', image_ids: [media.body.id, media.body.id] }],
  });
  assert.equal(duplicateGallery.status, 400, JSON.stringify(duplicateGallery.body));
  const oversizedGallery = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Oversized gallery rejected',
    slug: 'oversized-gallery-rejected',
    sections: [{ type: 'gallery', image_ids: Array.from({ length: 13 }, () => randomUUID()) }],
  });
  assert.equal(oversizedGallery.status, 400, JSON.stringify(oversizedGallery.body));
  const identityWithDefaultPage = await call(orgPath('/website/settings'), ownerCookie, 'PUT', {
    ...identitySaved.body.data,
    default_page_id: created.body.id,
    expected_version: identitySaved.body.version,
  });
  assert.equal(identityWithDefaultPage.status, 200, JSON.stringify(identityWithDefaultPage.body));
  const linkedDraft = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Unpublished target',
    slug: 'unpublished-target',
    sections: [],
  });
  assert.equal(linkedDraft.status, 201, JSON.stringify(linkedDraft.body));
  const linkedSource = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Links to draft',
    slug: 'links-to-draft',
    menus: [{ label: 'Target', url: '/unpublished-target', parent_index: null }],
    sections: [],
  });
  assert.equal(linkedSource.status, 201, JSON.stringify(linkedSource.body));
  const blockedBrokenLink = await call(
    orgPath(`/website/pages/${linkedSource.body.id}/publish`),
    ownerCookie,
    'POST',
    { expected_version: linkedSource.body.version },
  );
  assert.equal(blockedBrokenLink.status, 409, 'a public page cannot link to an unpublished page');
  const unsafe = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Unsafe link',
    slug: 'unsafe-link',
    sections: [{ type: 'cta', title: 'Click', button_url: '//attacker.invalid' }],
  });
  assert.equal(unsafe.status, 400, 'protocol-relative external URLs must be rejected');
  const invalidCommerceSlug = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Invalid product showcase',
    slug: 'invalid-commerce-showcase',
    sections: [{ type: 'commerce_showcase', title: 'Products', storefront_slug: '../private' }],
  });
  assert.equal(invalidCommerceSlug.status, 400, 'showcases accept only a safe storefront slug');
  const invalidMenu = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Invalid menu hierarchy',
    slug: 'invalid-menu',
    sections: [],
    menus: [{ label: 'Child before parent', url: '/', parent_index: 1 }],
  });
  assert.equal(invalidMenu.status, 400, 'a child menu cannot precede or point past its parent');
  const publish = await call(
    orgPath(`/website/pages/${created.body.id}/publish`),
    ownerCookie,
    'POST',
    { expected_version: created.body.version },
  );
  assert.equal(publish.status, 200, JSON.stringify(publish.body));
  assert.equal(
    publish.body.url,
    null,
    'sandbox publications must not claim an anonymous production URL',
  );
  const firstPublication = await dbGet(
    "SELECT * FROM ac_publications WHERE org_id=? AND environment='sandbox' AND source_id=? AND source_kind='website'",
    [org, created.body.id],
  );
  assert.ok(firstPublication);
  const sandboxSitemap = await fetch(base + '/api/public/sites/fixture-about/sitemap.xml');
  assert.equal(
    sandboxSitemap.status,
    404,
    'sandbox and non-production publications must never enter public sitemaps',
  );
  const sandboxHtmlRoute = await fetch(base + '/sites/fixture-about');
  assert.equal(sandboxHtmlRoute.headers.get('X-AfriCore-Website-Response'), '1');
  assert.equal(sandboxHtmlRoute.headers.get('Cache-Control'), 'no-store');
  assert.equal(
    sandboxHtmlRoute.status,
    404,
    'sandbox Website pages must not be served by anonymous production routes',
  );
  const publishedSnapshot = JSON.parse(
    unseal(
      firstPublication.snapshot,
      JSON.stringify([
        'website-publication',
        org,
        'sandbox',
        firstPublication.id,
        Number(firstPublication.version),
      ]),
    ),
  );
  assert.equal(publishedSnapshot.site.default_page_slug, 'fixture-about');
  assert.deepEqual(
    [publishedSnapshot.sections[0].content_width, publishedSnapshot.sections[0].alignment, publishedSnapshot.sections[0].layout_columns],
    ['narrow', 'center', 'three'],
  );
  const changedPage = await call(orgPath(`/website/pages/${created.body.id}`), ownerCookie, 'PUT', {
    ...created.body.data,
    slug: 'fixture-about-updated',
    expected_version: created.body.version,
  });
  assert.equal(changedPage.status, 200, JSON.stringify(changedPage.body));
  const republish = await call(
    orgPath(`/website/pages/${created.body.id}/publish`),
    ownerCookie,
    'POST',
    { expected_version: changedPage.body.version },
  );
  assert.equal(republish.status, 200, JSON.stringify(republish.body));
  const history = await call(
    orgPath(`/website/pages/${created.body.id}/publication-history`),
    ownerCookie,
  );
  assert.equal(history.status, 200, JSON.stringify(history.body));
  assert.deepEqual(
    history.body.data.map((version: any) => version.version),
    [2, 1],
  );
  const restored = await call(
    orgPath(`/website/pages/${created.body.id}/publication-history/1/restore`),
    ownerCookie,
    'POST',
    {},
  );
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(restored.body.version, 3);
  assert.equal(restored.body.slug, 'fixture-about');
  const blockedMediaWithdrawal = await call(
    orgPath(`/commerce/assets/${media.body.id}/withdraw`),
    ownerCookie,
    'POST',
    { expected_version: media.body.version, acknowledge_withdrawal: true },
  );
  assert.equal(
    blockedMediaWithdrawal.status,
    409,
    JSON.stringify(blockedMediaWithdrawal.body),
  );
  const entitlements = await dbAll(
    'SELECT service_id FROM ac_service_entitlements WHERE org_id=? AND environment=? AND service_id IN (?,?)',
    [org, 'sandbox', 'calendar', 'website'],
  );
  assert.deepEqual(entitlements.map((x: any) => x.service_id).sort(), ['calendar', 'website']);

  const productionActivation = await call(
    orgPath('/services/website/activate'),
    ownerCookie,
    'POST',
    {},
    'production',
  );
  assert.equal(
    productionActivation.status,
    409,
    'live service activation remains intentionally unavailable in the synthetic fixture',
  );
  const unpublishedSubmit = await call(
    '/api/public/sites/public-contact-fixture/forms',
    '',
    'POST',
    {
      name: 'Synthetic Visitor',
      email: 'visitor@example.test',
      company: 'Fixture Co',
      message: 'Please send the product guide.',
      consent: true,
      website: '',
    },
  );
  assert.equal(unpublishedSubmit.status, 404, 'unpublished pages must not accept public data');
  const invalidSubmit = await call('/api/public/sites/fixture-about/forms', '', 'POST', {
    name: 'Synthetic Visitor',
    email: 'visitor@example.test',
    message: 'This submission has no consent.',
    consent: false,
    website: '',
  });
  assert.equal(invalidSubmit.status, 400, 'explicit consent is required by the server contract');
});

test('Website serves a published page and accepts inquiries until the owner disables public access', async () => {
  const original = await dbGet("SELECT definition FROM ac_services WHERE id='website'");
  // Qualify the production code path in this disposable fixture using normal activation.
  await dbRun("UPDATE ac_services SET definition=? WHERE id='website'", [
    JSON.stringify({ ...JSON.parse(original.definition), availability: 'available' }),
  ]);
  const production = (suffix: string, method = 'GET', body?: unknown) =>
    call(orgPath(suffix), ownerCookie, method, body, 'production');
  const title = 'Phase 3 public contact fixture';
  const slug = 'phase3-public-contact-fixture';
  const previousOrigin = process.env.AFRICORE_PUBLIC_ORIGIN;
  process.env.AFRICORE_PUBLIC_ORIGIN = 'https://phase3.example.test';
  const inquiry = {
    name: 'Synthetic visitor', email: 'visitor@example.test', message: 'Please send details.', consent: true,
  };
  try {
    const activation = await production('/services/website/activate', 'POST', {});
    assert.equal(activation.status, 200, JSON.stringify(activation.body));
    let identity = await production('/website/settings', 'PUT', {
      name: 'Fixture Website', public_enabled: true,
    });
    assert.equal(identity.status, 200, JSON.stringify(identity.body));
    const contact = await production('/website/pages', 'POST', {
      title, slug, sections: [{ type: 'contact_form', title: 'Contact us' }],
    });
    assert.equal(contact.status, 201, JSON.stringify(contact.body));
    const siteSlug = 'phase3-fixture-business';
    const homePath = `/sites/${siteSlug}/home`;
    const home = () => fetch(base + homePath, { redirect: 'manual' });
    identity = await production('/website/settings', 'PUT', {
      ...identity.body.data, default_page_id: contact.body.id, site_slug: siteSlug,
      expected_version: identity.body.version,
    });
    assert.equal(identity.status, 200, JSON.stringify(identity.body));
    assert.equal((await home()).status, 404, 'saving a draft address does not publish it');
    const page = `/website/pages/${contact.body.id}`;
    for (const expected of [1, 2]) {
      const published = await production(`${page}/publish`, 'POST', { expected_version: contact.body.version });
      assert.equal(published.status, 200, JSON.stringify(published.body));
      assert.equal(published.body.version, expected);
    }
    const publishedHome = await home();
    assert.equal(publishedHome.status, 307);
    assert.equal(publishedHome.headers.get('Location'), `/sites/${slug}`);
    assert.equal((await production('/website/settings')).body.public_home_url, homePath);
    const otherWorkspace = await call('/api/auth/workspaces', guestCookie, 'POST', {
      kind: 'business', name: 'Independent Website fixture', display_name: 'Independent Owner', services: [],
    });
    assert.equal(otherWorkspace.status, 201, JSON.stringify(otherWorkspace.body));
    const otherWebsite = (suffix: string, method: string, body: unknown) => call(
      `/api/v1/organizations/${otherWorkspace.body.id}${suffix}`, guestCookie, method, body, 'production',
    );
    const otherActivation = await otherWebsite('/services/website/activate', 'POST', {});
    assert.equal(otherActivation.status, 200, JSON.stringify(otherActivation.body));
    const otherPage = await otherWebsite('/website/pages', 'POST', {
      title: 'Independent home', slug: 'independent-site-fixture', sections: [],
    });
    assert.equal(otherPage.status, 201, JSON.stringify(otherPage.body));
    const otherIdentity = await otherWebsite('/website/settings', 'PUT', {
      name: 'Independent Website', default_page_id: otherPage.body.id, site_slug: siteSlug, public_enabled: true,
    });
    assert.equal(otherIdentity.status, 200, JSON.stringify(otherIdentity.body));
    const otherPublish = await otherWebsite(`/website/pages/${otherPage.body.id}/publish`, 'POST', { expected_version: otherPage.body.version });
    assert.equal(otherPublish.status, 409, JSON.stringify(otherPublish.body));
    assert.equal((await home()).headers.get('Location'), `/sites/${slug}`);
    const publicPath = `/api/public/sites/${slug}`;
    const publishedPage = await call(publicPath, '');
    assert.equal(publishedPage.status, 200);
    assert.equal(publishedPage.body.title, title);
    const html = await fetch(`${base}/sites/${slug}`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /<title>Phase 3 public contact fixture<\/title>/);
    const submitted = await call(`${publicPath}/forms`, '', 'POST', inquiry);
    assert.equal(submitted.status, 202, JSON.stringify(submitted.body));
    const inbox = await production('/website/forms');
    assert.equal(inbox.status, 200, JSON.stringify(inbox.body));
    assert.ok(inbox.body.data.some((entry: any) => entry.email === inquiry.email));
    const alternateSlug = 'phase3-alternate-contact';
    const alternate = await production('/website/pages', 'POST', {
      title: 'Alternate contact', slug: alternateSlug, canonical_path: `/sites/${slug}`, sections: [],
    });
    assert.equal(alternate.status, 201, JSON.stringify(alternate.body));
    assert.equal((await production(`/website/pages/${alternate.body.id}/publish`, 'POST', { expected_version: alternate.body.version })).status, 200);
    const alternateHtml = await fetch(`${base}/sites/${alternateSlug}`);
    assert.match(await alternateHtml.text(), new RegExp('href="https://phase3\\.example\\.test/sites/' + slug + '"'));
    const sitemap = await fetch(`${base}${publicPath}/sitemap.xml`);
    const xml = await sitemap.text();
    assert.ok(xml.includes(`/sites/${slug}</loc>`));
    assert.ok(!xml.includes(`/sites/${alternateSlug}</loc>`));
    const externalCanonical = await production('/website/pages', 'POST', {
      title: 'External canonical', slug: 'external-canonical', canonical_path: 'https://other.example.test/sites/contact', sections: [],
    });
    assert.equal(externalCanonical.status, 400);
    const newSlug = `${slug}-new`;
    const updated = await production(page, 'PUT', {
      ...contact.body.data, slug: newSlug, expected_version: contact.body.version,
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal((await fetch(`${base}/sites/${slug}`)).status, 200, 'draft rename has no public effect');
    const renamed = await production(`${page}/publish`, 'POST', { expected_version: updated.body.version });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    const oldUrl = await fetch(`${base}/sites/${slug}`, { redirect: 'manual' });
    assert.equal(oldUrl.status, 308);
    assert.equal(oldUrl.headers.get('Location'), `/sites/${newSlug}`);
    assert.equal((await call(`/api/public/sites/${alternateSlug}`, '')).body.canonical_path, `/sites/${alternateSlug}`);
    assert.equal((await call(`${publicPath}/forms`, '', 'POST', inquiry)).status, 404);
    const conflicting = await production('/website/pages', 'POST', { title: 'Conflicting page', slug, sections: [] });
    assert.equal(conflicting.status, 201);
    assert.equal((await production(`/website/pages/${conflicting.body.id}/publish`, 'POST', { expected_version: conflicting.body.version })).status, 409);
    const restored = await production(`${page}/publication-history/1/restore`, 'POST', {});
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    const reverse = await fetch(`${base}/sites/${newSlug}`, { redirect: 'manual' });
    assert.equal(reverse.status, 308);
    assert.equal(reverse.headers.get('Location'), `/sites/${slug}`);
    identity = await production('/website/settings', 'PUT', {
      ...identity.body.data, default_page_id: alternate.body.id, expected_version: identity.body.version,
    });
    assert.equal(identity.status, 200, JSON.stringify(identity.body));
    assert.equal((await home()).headers.get('Location'), `/sites/${slug}`, 'draft default changes leave the published home alone');
    const newHome = await production(`/website/pages/${alternate.body.id}/publish`, 'POST', { expected_version: alternate.body.version });
    assert.equal(newHome.status, 200, JSON.stringify(newHome.body));
    assert.equal((await home()).headers.get('Location'), `/sites/${alternateSlug}`);
    const disabled = await production('/website/settings', 'PUT', {
      name: 'Fixture Website', public_enabled: false, expected_version: identity.body.version,
    });
    assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
    assert.equal((await home()).status, 404);
    assert.equal((await production('/website/settings')).body.public_home_url, null);
    assert.equal((await call(publicPath, '')).status, 404);
    const withdrawn = await fetch(`${base}/sites/${slug}`);
    assert.equal(withdrawn.status, 404);
    assert.equal((await fetch(`${base}/sites/${newSlug}`, { redirect: 'manual' })).status, 404);
    await withdrawn.text();
    assert.equal((await call(`${publicPath}/forms`, '', 'POST', inquiry)).status, 404);
    const restore = await production(`${page}/publication-history/1/restore`, 'POST', {});
    assert.equal(restore.status, 409, JSON.stringify(restore.body));
  } finally {
    if (previousOrigin === undefined) delete process.env.AFRICORE_PUBLIC_ORIGIN;
    else process.env.AFRICORE_PUBLIC_ORIGIN = previousOrigin;
    await dbRun("UPDATE ac_services SET definition=? WHERE id='website'", [original.definition]);
  }
});

test('Website inquiry CRM handoff uses the canonical lead path once and clears the encrypted inbox copy', async () => {
  for (const service of ['website', 'crm']) {
    const activation = await call(orgPath(`/services/${service}/activate`), ownerCookie, 'POST', {});
    assert.equal(activation.status, 200, JSON.stringify(activation.body));
  }
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const payload = seal(
    JSON.stringify({
      name: 'Synthetic Visitor',
      email: 'visitor@example.test',
      company: 'Fixture Co',
      message: 'Please send the product guide.',
      consent: true,
    }),
    JSON.stringify(['website-form', org, 'sandbox', id]),
    '2',
  );
  await dbRun(
    "INSERT INTO ac_website_form_submissions(id,org_id,environment,publication_id,slug,payload,status,created_at,expires_at) VALUES (?,?, 'sandbox',?,?,?,?,?,?)",
    [id, org, 'synthetic-publication', 'contact', payload, 'new', createdAt, expiresAt],
  );

  const converted = await call(
    orgPath(`/website/forms/${id}/convert-to-crm`),
    ownerCookie,
    'POST',
    {},
  );
  assert.equal(converted.status, 200, JSON.stringify(converted.body));
  assert.deepEqual(converted.body, { status: 'converted', lead_id: id });
  const lead = await dbGet(
    "SELECT kind,data FROM ac_crm_entries WHERE id=? AND org_id=? AND environment='sandbox'",
    [id, org],
  );
  assert.equal(lead.kind, 'lead');
  const leadData = JSON.parse(lead.data);
  assert.equal(leadData.source, 'website');
  assert.equal(leadData.source_ref, 'contact');
  assert.equal(leadData.email, 'visitor@example.test');
  assert.equal(leadData.notes, 'Please send the product guide.');
  const storedSubmission = await dbGet(
    'SELECT status,payload FROM ac_website_form_submissions WHERE id=? AND org_id=?',
    [id, org],
  );
  assert.equal(storedSubmission.status, 'converted');
  assert.equal(storedSubmission.payload, '');

  const replay = await call(
    orgPath(`/website/forms/${id}/convert-to-crm`),
    ownerCookie,
    'POST',
    {},
  );
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.deepEqual(replay.body, converted.body);
  const count = await dbGet(
    "SELECT COUNT(*) AS count FROM ac_crm_entries WHERE id=? AND org_id=? AND environment='sandbox'",
    [id, org],
  );
  assert.equal(Number(count.count), 1);
});
