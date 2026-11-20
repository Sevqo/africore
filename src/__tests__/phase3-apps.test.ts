import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('phase3-apps');
import { closeDb, dbAll, dbRun, migrate } from '../db';
import { createApp } from '../app';

let server: any, base = '', org = '', ownerCookie = '', guestCookie = '', guestId = '';
const key = () => randomUUID();
async function call(path: string, session: string, method = 'GET', body?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: { Cookie: session, 'Content-Type': 'application/json', 'Idempotency-Key': key() },
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
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: randomUUID() + '@example.test', password: 'Synthetic-phase3-fixture-2026!' }),
  });
  const signup = await first.json(); ownerCookie = first.headers.get('set-cookie')?.split(';')[0] || '';
  assert.equal(first.status, 201);
  await call('/api/auth/verify', ownerCookie, 'POST', { token: signup.verification_token });
  const workspace = await call('/api/auth/workspaces', ownerCookie, 'POST', {
    kind: 'business', name: 'Phase 3 fixture', display_name: 'Fixture Owner', services: [],
  });
  assert.equal(workspace.status, 201, JSON.stringify(workspace.body)); org = workspace.body.id;
  const second = await fetch(base + '/api/auth/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: randomUUID() + '@example.test', password: 'Synthetic-phase3-fixture-2026!' }),
  });
  const secondData = await second.json(); guestCookie = second.headers.get('set-cookie')?.split(';')[0] || '';
  await call('/api/auth/verify', guestCookie, 'POST', { token: secondData.verification_token });
  const account = await call('/api/auth/account', guestCookie);
  guestId = account.body.user.id;
  await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'owner')", [org, guestId]);
});
after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(resolve));
  await closeDb();
});

test('Calendar keeps member invitations scoped, private details redacted, and responses durable', async () => {
  const preview = await call(orgPath('/apps/calendar/installation-preview'), ownerCookie);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.services.map((s: any) => s.id).join(','), 'calendar');
  const installed = await call(orgPath('/apps/calendar/install'), ownerCookie, 'POST', {
    review_hash: preview.body.review_hash, optional_services: [],
  });
  assert.equal(installed.status, 200);
  const created = await call(orgPath('/calendar/events'), ownerCookie, 'POST', {
    title: 'Fixture planning session', description: 'Private agenda text',
    start: '2026-11-22T09:00:00+03:00', end: '2026-11-22T10:00:00+03:00',
    timezone: 'Africa/Nairobi', visibility: 'private', recurrence: 'none',
    attendees: [{ user_id: guestId, response: 'pending' }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const invite = await call(orgPath('/calendar/events'), guestCookie);
  assert.equal(invite.status, 200);
  assert.equal(invite.body.data.find((e: any) => e.id === created.body.id)?.data.my_response, 'pending');
  const notification = await dbAll('SELECT id FROM ac2_notifications WHERE org_id=? AND user_id=? AND category=?', [org, guestId, 'calendar']);
  assert.equal(notification.length, 1);
  const response = await call(orgPath(`/calendar/events/${created.body.id}/respond`), guestCookie, 'POST', { response: 'accepted' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const accepted = await call(orgPath('/calendar/events'), guestCookie);
  assert.equal(accepted.body.data.find((e: any) => e.id === created.body.id)?.data.my_response, 'accepted');
  const privateEvent = await call(orgPath('/calendar/events'), guestCookie, 'POST', {
    title: 'Confidential board session', description: 'Do not disclose this',
    start: '2026-11-23T09:00:00+03:00', end: '2026-11-23T10:00:00+03:00',
    timezone: 'Africa/Nairobi', visibility: 'private', recurrence: 'none', attendees: [],
  });
  assert.equal(privateEvent.status, 201);
  const ownerCalendar = await call(orgPath('/calendar/events'), ownerCookie);
  const redacted = ownerCalendar.body.data.find((e: any) => e.id === privateEvent.body.id);
  assert.equal(redacted.data.title, 'Busy');
  assert.equal(redacted.data.description, '');
});

test('Website installs without backfilling an unrelated service and publishes only the production route', async () => {
  const preview = await call(orgPath('/apps/website/installation-preview'), ownerCookie);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.services.map((s: any) => s.id).join(','), 'website');
  const installed = await call(orgPath('/apps/website/install'), ownerCookie, 'POST', {
    review_hash: preview.body.review_hash, optional_services: [],
  });
  assert.equal(installed.status, 200);
  const created = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Fixture About', slug: 'fixture-about', noindex: true,
    sections: [{ type: 'hero', title: 'About Fixture', body: 'Safe typed content' }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const unsafe = await call(orgPath('/website/pages'), ownerCookie, 'POST', {
    title: 'Unsafe link', slug: 'unsafe-link', sections: [{ type: 'cta', title: 'Click', button_url: '//attacker.invalid' }],
  });
  assert.equal(unsafe.status, 400, 'protocol-relative external URLs must be rejected');
  const publish = await call(orgPath(`/website/pages/${created.body.id}/publish`), ownerCookie, 'POST', { expected_version: created.body.version });
  assert.equal(publish.status, 200, JSON.stringify(publish.body));
  assert.equal(publish.body.url, null, 'sandbox publications must not claim an anonymous production URL');
  const entitlements = await dbAll('SELECT service_id FROM ac_service_entitlements WHERE org_id=? AND service_id IN (?,?)', [org, 'calendar', 'website']);
  assert.deepEqual(entitlements.map((x: any) => x.service_id).sort(), ['calendar', 'website']);
});
