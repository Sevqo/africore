import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('rbac-pricing-connections');
import { migrate, closeDb } from '../db';
import { dbRun } from '../db/adapter';
import { createApp } from '../app';

let server: any,
  base: string,
  org: string,
  ownerCookie: string,
  financeCookie: string,
  salesCookie: string,
  inventoryCookie: string,
  hrCookie: string,
  viewerCookie: string;

async function signupMember(role: string) {
  const s = await api('/api/auth/signup', '', 'POST', {
    email: `${role}-${randomUUID()}@example.test`,
    password: 'Synthetic-rbac-password-2026!',
  });
  await api('/api/auth/verify', s.cookie, 'POST', { token: s.data.verification_token });
  const acc = await api('/api/auth/account', s.cookie);
  await dbRun('INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,?)', [
    org,
    acc.data.user.id,
    role,
  ]);
  return s.cookie;
}

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

  const owner = await api('/api/auth/signup', '', 'POST', {
    email: `owner-${randomUUID()}@example.test`,
    password: 'Synthetic-owner-password-2026!',
  });
  ownerCookie = owner.cookie;
  await api('/api/auth/verify', ownerCookie, 'POST', { token: owner.data.verification_token });

  const ws = await api('/api/auth/workspaces', ownerCookie, 'POST', {
    kind: 'business',
    name: 'AfriCore Unified RBAC & Pricing Co',
    display_name: 'Owner',
    services: [
      'products',
      'inventory',
      'customers',
      'sales',
      'accounting',
      'procurement',
      'orders',
      'invoicing',
      'cash_flow',
      'payments',
      'pos',
      'work',
      'people',
      'documents',
    ],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  org = ws.data.id;

  financeCookie = await signupMember('finance');
  salesCookie = await signupMember('sales');
  inventoryCookie = await signupMember('inventory_manager');
  hrCookie = await signupMember('hr');
  viewerCookie = await signupMember('viewer');
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test('RBAC role permissions, cross-app replenishment/accounting/sign connections, and SME service pricing', async () => {
  const p = `/api/v1/organizations/${org}`;

  // 1. Service Pricing Catalog check: fair SME pricing & workspace cap
  const cat = await api(`${p}/services`, ownerCookie);
  assert.equal(cat.status, 200);
  assert.equal(cat.data.workspace_bundle_cap_minor, 199_000); // KSh 1,990/mo
  const invSvc = cat.data.services.find((s: any) => s.id === 'invoicing');
  assert.equal(invSvc.commercial_plan.monthly_minor, 39_000); // KSh 390/mo
  const custSvc = cat.data.services.find((s: any) => s.id === 'customers');
  assert.equal(custSvc.commercial_plan.monthly_minor, 0); // Free starter directory

  // 2. Viewer can read, but is strictly denied (403) on all mutations across apps
  assert.equal((await api(`${p}/sales/promos`, viewerCookie)).status, 200);
  assert.equal(
    (
      await api(`${p}/sales/promos`, viewerCookie, 'POST', {
        code: 'VIEWER10',
        name: 'Denied',
        discount_type: 'percent_bps',
        value: 1000,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api(`${p}/accounting/debit-notes`, viewerCookie, 'POST', {
        original_invoice_id: 'INV-1',
        reason: 'Denied',
        issue_date: '2026-11-26',
        amount_minor: 5000,
      })
    ).status,
    403,
  );

  // 3. Sales role can create Sales promos & CRM rules, but CANNOT post Accounting Debit Notes or HR Payroll Overtime
  assert.equal(
    (
      await api(`${p}/sales/promos`, salesCookie, 'POST', {
        code: 'SALES15',
        name: 'Sales Promo',
        discount_type: 'percent_bps',
        value: 1500,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await api(`${p}/accounting/debit-notes`, salesCookie, 'POST', {
        original_invoice_id: 'INV-1',
        reason: 'Sales cannot post accounting entries',
        issue_date: '2026-11-26',
        amount_minor: 5000,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api(`${p}/people/shifts/overtime`, salesCookie, 'POST', {
        hourly_rate_minor: 1000,
        shifts: [{ worked_minutes: 540 }],
      })
    ).status,
    403,
  );

  // 4. Finance role CAN post Accounting Debit Notes & Treasury Runway, and automatically emits Hub Event
  const dn = await api(`${p}/accounting/debit-notes`, financeCookie, 'POST', {
    original_invoice_id: 'INV-900',
    reason: 'Approved freight adjustment',
    issue_date: '2026-11-26',
    amount_minor: 12_500,
  });
  assert.equal(dn.status, 201);
  assert.equal(
    (
      await api(`${p}/finance/treasury/runway`, financeCookie, 'POST', {
        cash_balance_minor: 900_000,
        monthly_inflow_minor: 400_000,
        monthly_outflow_minor: 300_000,
      })
    ).status,
    200,
  );

  // 5. HR role CAN run Shift Overtime, but CANNOT create Inventory Reordering Rules
  assert.equal(
    (
      await api(`${p}/people/shifts/overtime`, hrCookie, 'POST', {
        hourly_rate_minor: 1000,
        shifts: [{ worked_minutes: 540 }],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(`${p}/inventory/reordering-rules`, hrCookie, 'POST', {
        product_id: 'SKU-HR',
        min_qty: 5,
        max_qty: 20,
      })
    ).status,
    403,
  );

  // 6. Inventory Manager creates Reordering Rule & runs Replenishment with auto_create_requests -> auto-generates Procurement RFQ + Hub Event!
  assert.equal(
    (
      await api(`${p}/inventory/reordering-rules`, inventoryCookie, 'POST', {
        product_id: 'SKU-AUTO-RFQ',
        warehouse: 'WH-MAIN',
        min_qty: 25,
        max_qty: 100,
        qty_multiple: 25,
        lead_days: 5,
      })
    ).status,
    201,
  );
  const rep = await api(`${p}/inventory/replenishment/run`, inventoryCookie, 'POST', {
    auto_create_requests: true,
    positions: [{ product_id: 'SKU-AUTO-RFQ', warehouse: 'WH-MAIN', on_hand_qty: 10 }],
  });
  assert.equal(rep.status, 200, JSON.stringify(rep.data));
  assert.equal(rep.data.created_purchase_request_ids.length, 1);

  // 7. Verify Integrations Hub captured both Cross-App Events (Accounting Debit Note + Inventory->Procurement Auto-RFQ)
  const hub = await api(`${p}/integrations-hub/events`, ownerCookie);
  assert.equal(hub.status, 200);
  const types = (hub.data.events || hub.data.data || []).map((e: any) => e.event_type);
  assert.ok(types.includes('debit_note.posted'), `Missing debit_note.posted in ${JSON.stringify(types)}`);
  assert.ok(types.includes('replenishment.rfq_created'), `Missing replenishment.rfq_created in ${JSON.stringify(types)}`);
});
