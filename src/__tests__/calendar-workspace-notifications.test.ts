import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('calendar-workspace-notifications');
import { migrate, closeDb } from '../db';
import { dbRun } from '../db/adapter';
import { createApp } from '../app';

let server: any, base: string, org: string, ownerCookie: string, employeeCookie: string, employeeId: string;

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

before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as any).port;

  // Owner signs up and creates workspace with Calendar
  const o = await api('/api/auth/signup', '', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-owner-2026!',
  });
  ownerCookie = o.cookie;
  await api('/api/auth/verify', ownerCookie, 'POST', { token: o.data.verification_token });
  const ws = await api('/api/auth/workspaces', ownerCookie, 'POST', {
    kind: 'business',
    name: 'Shared Calendar Co',
    display_name: 'Owner',
    services: ['customers'],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  org = ws.data.id;

  // Employee signs up and joins the same workspace
  const e = await api('/api/auth/signup', '', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-employee-2026!',
  });
  employeeCookie = e.cookie;
  await api('/api/auth/verify', employeeCookie, 'POST', { token: e.data.verification_token });
  const acc = await api('/api/auth/account', employeeCookie);
  employeeId = acc.data.user.id;
  await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'operations')", [
    org,
    employeeId,
  ]);
  const prev = await api(`/api/v1/organizations/${org}/apps/calendar/installation-preview`, ownerCookie);
  const inst = await api(`/api/v1/organizations/${org}/apps/calendar/install`, ownerCookie, 'POST', {
    review_hash: prev.data.review_hash,
  });
  assert.ok([200, 201].includes(inst.status), JSON.stringify(inst.data));
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test('Workspace calendar events are visible to invited employees and trigger in-app notifications', async () => {
  const start = new Date(Date.now() + 3600_000).toISOString();
  const end = new Date(Date.now() + 7200_000).toISOString();

  // Owner schedules a shared workspace event without manually listing the employee
  const created = await api(`/api/v1/organizations/${org}/calendar/events`, ownerCookie, 'POST', {
    title: 'Weekly Team Sync',
    description: 'All-hands operations review',
    start,
    end,
    timezone: 'Africa/Nairobi',
    all_day: false,
    location: 'Boardroom A',
    meeting_url: '',
    visibility: 'default',
    recurrence: 'none',
    attendees: [],
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));

  // Employee sees the scheduled event in their Calendar
  const empEvents = await api(`/api/v1/organizations/${org}/calendar/events`, employeeCookie);
  assert.equal(empEvents.status, 200, JSON.stringify(empEvents.data));
  assert.ok(
    (empEvents.data.data || []).some((ev: any) => ev.data?.title === 'Weekly Team Sync'),
    'Employee should see shared workspace calendar event',
  );

  // Employee receives the workspace schedule notification
  const notifs = await api(`/api/v1/organizations/${org}/notifications`, employeeCookie);
  assert.equal(notifs.status, 200, JSON.stringify(notifs.data));
  const items = notifs.data.data || notifs.data.notifications || [];
  assert.ok(
    items.some(
      (n: any) =>
        n.category === 'calendar' &&
        String(n.body || '').includes('Weekly Team Sync'),
    ),
    `Expected calendar notification for employee, got: ${JSON.stringify(items)}`,
  );
});
