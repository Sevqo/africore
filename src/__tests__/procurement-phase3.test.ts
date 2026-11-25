import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('procurement-phase3');
import { migrate, dbRun, closeDb } from '../db';
import { createApp } from '../app';

let server: any, base: string, org: string, cookie: string, reviewerCookie: string;

async function api(path: string, method = 'GET', body?: any, session = cookie, key = randomUUID()) {
  const r = await fetch(base + path, {
    method,
    headers: { Cookie: session, 'Content-Type': 'application/json', 'Idempotency-Key': key },
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
  const s = await api(
    '/api/auth/signup',
    'POST',
    { email: randomUUID() + '@example.test', password: 'Synthetic-procurement-2026!' },
    '',
  );
  cookie = s.cookie;
  await api('/api/auth/verify', 'POST', { token: s.data.verification_token });
  const ws = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Phase 3 Procurement Ltd',
    display_name: 'Buyer Owner',
    services: ['products', 'inventory', 'customers', 'expenses', 'procurement'],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  org = ws.data.id;

  const rev = await api(
    '/api/auth/signup',
    'POST',
    { email: randomUUID() + '@example.test', password: 'Synthetic-procurement-2026!' },
    '',
  );
  reviewerCookie = rev.cookie;
  await api('/api/auth/verify', 'POST', { token: rev.data.verification_token }, reviewerCookie);
  const revId = (await api('/api/auth/account', 'GET', undefined, reviewerCookie)).data.user.id;
  await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'admin')", [org, revId]);
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test('Phase 3 Procurement: Python 3-way matching, separate-manager override, blanket orders, and tender ranking', async () => {
  const root = '/api/v1/organizations/' + org;

  // 1. Exact 3-way match => matched & pay_eligible
  const exact = await api(root + '/procurement/three-way-match', 'POST', {
    purchase_order_ref: 'PO-2026-001',
    vendor_bill_ref: 'BILL-2026-001',
    currency: 'KES',
    tolerance_bps: 0,
    lines: [
      {
        id: 'l1',
        description: 'Packaging Cartons',
        ordered_milli: 10000,
        received_milli: 10000,
        billed_milli: 10000,
        po_unit_price_minor: 5000,
        bill_unit_price_minor: 5000,
      },
    ],
  });
  assert.equal(exact.status, 201, JSON.stringify(exact.data));
  assert.equal(exact.data.status, 'matched');
  assert.equal(exact.data.result.pay_eligible, true);

  // 2. Over-billed discrepancy => discrepancy_hold, self-override blocked (403), separate manager approves
  const hold = await api(root + '/procurement/three-way-match', 'POST', {
    purchase_order_ref: 'PO-2026-002',
    vendor_bill_ref: 'BILL-2026-002',
    currency: 'KES',
    tolerance_bps: 0,
    lines: [
      {
        id: 'l1',
        description: 'Packaging Cartons',
        ordered_milli: 10000,
        received_milli: 8000,
        billed_milli: 10000,
        po_unit_price_minor: 5000,
        bill_unit_price_minor: 5000,
      },
    ],
  });
  assert.equal(hold.status, 201, JSON.stringify(hold.data));
  assert.equal(hold.data.status, 'discrepancy_hold');
  assert.equal(hold.data.result.status, 'over_billed');
  assert.equal(hold.data.result.pay_eligible, false);

  assert.equal(
    (
      await api(root + '/procurement/three-way-match/' + hold.data.id, 'PATCH', {
        expected_version: hold.data.version,
        decision: 'approve_override',
        reason: 'Self-override must be rejected',
      })
    ).status,
    403,
  );

  const overridden = await api(
    root + '/procurement/three-way-match/' + hold.data.id,
    'PATCH',
    {
      expected_version: hold.data.version,
      decision: 'approve_override',
      reason: 'Supplier credit note for 2 cartons verified separately',
    },
    reviewerCookie,
  );
  assert.equal(overridden.status, 200, JSON.stringify(overridden.data));
  assert.equal(overridden.data.status, 'approved_override');
  assert.equal(overridden.data.result.pay_eligible, true);

  // 3. Blanket Purchase Order create & close
  const bo = await api(root + '/procurement/blanket-orders', 'POST', {
    reference: 'BO-2026-01',
    vendor_name: 'Nairobi Mills Ltd',
    currency: 'KES',
    starts_on: '2026-01-01',
    ends_on: '2026-12-31',
    lines: [
      {
        sku: 'FLOUR-50KG',
        description: 'Wheat Flour 50kg Bag',
        agreed_quantity_milli: 500000,
        ordered_quantity_milli: 0,
        unit_price_minor: 350000,
      },
    ],
  });
  assert.equal(bo.status, 201, JSON.stringify(bo.data));
  const closed = await api(root + '/procurement/blanket-orders/' + bo.data.id, 'PATCH', {
    expected_version: bo.data.version,
    status: 'closed',
    reason: 'Annual agreement fulfilled',
  });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.status, 'closed');

  // 4. Tender Bid Comparison via Python
  const cmp = await api(root + '/procurement/tenders/compare', 'POST', {
    bids: [
      { id: 'v1', vendor_name: 'Vendor A', total_minor: 500000, lead_time_days: 5 },
      { id: 'v2', vendor_name: 'Vendor B', total_minor: 450000, lead_time_days: 7 },
      { id: 'v3', vendor_name: 'Vendor C', total_minor: 450000, lead_time_days: 3 },
    ],
  });
  assert.equal(cmp.status, 200, JSON.stringify(cmp.data));
  assert.equal(cmp.data.ranked[0].id, 'v3');
  assert.equal(cmp.data.lowest_total_minor, 450000);
});
