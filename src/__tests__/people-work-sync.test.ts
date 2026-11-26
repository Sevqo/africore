import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('people-work-sync');
import { migrate, closeDb } from '../db';
import { createApp } from '../app';

let server: any, base: string;

async function api(path: string, cookie: string, method = 'GET', body?: any, key = randomUUID()) {
  const r = await fetch(base + path, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json().catch(() => ({})),
    cookie: r.headers.get('set-cookie')?.split(';')[0] || '',
  };
}

async function signup(emailPrefix: string) {
  const email = `${emailPrefix}-${randomUUID()}@example.test`;
  const r = await api('/api/auth/signup', '', 'POST', {
    email,
    password: 'Synthetic-Sync-2026!',
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  await api('/api/auth/verify', r.cookie, 'POST', { token: r.data.verification_token });
  const acc = await api('/api/auth/account', r.cookie);
  return { id: acc.data.user.id as string, email, cookie: r.cookie };
}

before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as any).port;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(resolve));
  await closeDb();
});

test('Inviting an HR member automatically populates People, grants full HR management, and supports employee removal', async () => {
  const owner = await signup('owner');
  const hrUser = await signup('hr-manager');
  const viewerUser = await signup('minimal-viewer');

  const ws = await api('/api/auth/workspaces', owner.cookie, 'POST', {
    kind: 'business',
    name: 'Continua Sync Co',
    display_name: 'Owner One',
    services: ['people', 'work', 'calendar'],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  const org = ws.data.id;
  const root = `/api/v1/organizations/${org}`;

  // Owner invites HR account and HR accepts
  const hrInvite = await api(root + '/invitations', owner.cookie, 'POST', {
    email: hrUser.email,
    role: 'hr',
  });
  assert.equal(hrInvite.status, 201, JSON.stringify(hrInvite.data));
  const hrAccept = await api('/api/v1/invitations/accept', hrUser.cookie, 'POST', {
    token: hrInvite.data.token,
  });
  assert.equal(hrAccept.status, 200, JSON.stringify(hrAccept.data));

  // People directory automatically contains BOTH Owner and HR without manual policy setup!
  const hrDir = await api(root + '/people/employees', hrUser.cookie);
  assert.equal(hrDir.status, 200, JSON.stringify(hrDir.data));
  assert.equal(hrDir.data.total, 2, 'Both Owner and invited HR member must appear in People');
  assert.ok(hrDir.data.data.some((e: any) => e.data.linked_user_id === owner.id));
  assert.ok(hrDir.data.data.some((e: any) => e.data.linked_user_id === hrUser.id));

  // HR has full People authority: can configure policy, add employees, and remove employees
  const hrConfig = await api(root + '/people/configuration', hrUser.cookie);
  assert.equal(hrConfig.status, 200);
  assert.equal(hrConfig.data.access.can_configure, true);
  assert.equal(hrConfig.data.access.hr_write, true);
  assert.equal(hrConfig.data.access.hr_manage, true);
  assert.equal(hrConfig.data.access.comp_write, true);

  // HR adds a new employee directly from People App
  const added = await api(root + '/people/employees', hrUser.cookie, 'POST', {
    expected_version: 0,
    employee_number: 'EMP-9001',
    name: 'Grace Wanjiku',
    job_title: 'Field Technician',
    start_on: '2026-11-01',
    status: 'active',
    self_service: false,
    work_email: 'grace@continua.test',
  });
  assert.equal(added.status, 200, JSON.stringify(added.data));
  assert.equal(added.data.data.name, 'Grace Wanjiku');

  // HR archives/removes the added employee
  const removed = await api(
    root + '/people/employees/' + added.data.id + '/remove',
    hrUser.cookie,
    'POST',
    { expected_version: added.data.version, remove_membership: false, reason: 'Contract ended' },
  );
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  assert.equal(removed.data.status, 'inactive');

  // Owner schedules a shared workspace meeting BEFORE viewer joins
  const start = new Date(Date.now() + 3600_000).toISOString();
  const end = new Date(Date.now() + 7200_000).toISOString();
  const meeting = await api(root + '/calendar/events', owner.cookie, 'POST', {
    title: 'All-Hands Operations Standup',
    description: 'Weekly company sync for all staff',
    start,
    end,
    timezone: 'Africa/Nairobi',
    all_day: false,
    location: 'Main Hall',
    meeting_url: '',
    visibility: 'default',
    recurrence: 'none',
    attendees: [],
  });
  assert.equal(meeting.status, 201, JSON.stringify(meeting.data));

  // Minimal-access viewer joins AFTER the meeting was scheduled
  const viewerInvite = await api(root + '/invitations', owner.cookie, 'POST', {
    email: viewerUser.email,
    role: 'viewer',
  });
  assert.equal(viewerInvite.status, 201);
  const viewerAccept = await api('/api/v1/invitations/accept', viewerUser.cookie, 'POST', {
    token: viewerInvite.data.token,
  });
  assert.equal(viewerAccept.status, 200);

  // Viewer sees the scheduled meeting right inside Work (/work/my-work) AND can RSVP inside Work!
  const myWorkRes = await api(root + '/work/my-work', viewerUser.cookie);
  assert.equal(myWorkRes.status, 200, JSON.stringify(myWorkRes.data));
  const foundMeeting = (myWorkRes.data.meetings || []).find(
    (m: any) => m.title === 'All-Hands Operations Standup',
  );
  assert.ok(foundMeeting, 'Minimal-access employee must see scheduled workspace meeting in Work');
  assert.equal(foundMeeting.starts_at, foundMeeting.start);

  const rsvp = await api(
    root + '/work/meetings/' + foundMeeting.event_id + '/respond',
    viewerUser.cookie,
    'POST',
    { response: 'accepted' },
  );
  assert.equal(rsvp.status, 200, JSON.stringify(rsvp.data));
  assert.equal(rsvp.data.response, 'accepted');

  // Verify updated RSVP reflects in /work/my-work
  const refreshedWork = await api(root + '/work/my-work', viewerUser.cookie);
  const updatedMeeting = refreshedWork.data.meetings.find(
    (m: any) => m.event_id === foundMeeting.event_id,
  );
  assert.equal(updatedMeeting.my_response, 'accepted');
});
