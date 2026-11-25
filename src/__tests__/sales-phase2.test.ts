import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('sales-phase2');
import { migrate, closeDb } from '../db';
import { createApp } from '../app';

let server: any, base: string, org: string, cookie: string;

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
    { email: randomUUID() + '@example.test', password: 'Synthetic-sales-2026!' },
    '',
  );
  cookie = s.cookie;
  await api('/api/auth/verify', 'POST', { token: s.data.verification_token });
  const ws = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Phase 2 Sales Ltd',
    display_name: 'Sales Owner',
    services: ['products', 'customers', 'orders', 'sales'],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  org = ws.data.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test('Phase 2 Sales: Python margin analysis, down payments with over-invoice guard, and optional upsells', async () => {
  const root = '/api/v1/organizations/' + org;
  const customer = await api(root + '/records/customers', 'POST', { name: 'Savannah Retail' });
  assert.equal(customer.status, 201, JSON.stringify(customer.data));

  const prod = await api(root + '/products', 'POST', {
    sku: 'POS-TERM-1',
    name: 'POS Terminal',
    purchase_cost_minor: 120000,
    sale_price_minor: 200000,
    currency: 'KES',
    track_inventory: false,
  });
  assert.equal(prod.status, 201, JSON.stringify(prod.data));

  const order = await api(root + '/records/orders', 'POST', {
    customer_id: customer.data.id,
    currency: 'KES',
    issue_date: '2026-11-24',
    due_date: '2026-12-24',
    items: [
      {
        product_id: prod.data.id,
        description: 'POS Terminal',
        quantity: 2,
        unit_price_minor: 200000,
      },
    ],
  });
  assert.equal(order.status, 201, JSON.stringify(order.data));

  // 1. Margin report via Python: revenue 400000, cost 240000, margin 160000, margin_bps 4000 (40.00%)
  const margins = await api(root + '/sales/margin-report');
  assert.equal(margins.status, 200, JSON.stringify(margins.data));
  assert.equal(margins.data.totals_by_currency.KES.revenue_minor, 400000);
  assert.equal(margins.data.totals_by_currency.KES.cost_minor, 240000);
  assert.equal(margins.data.totals_by_currency.KES.margin_minor, 160000);
  assert.equal(margins.data.totals_by_currency.KES.margin_bps, 4000);

  // 2. Down payment: reject draft order, then issue -> 30% preview & create (120000 minor), then reject 80% over-invoicing
  assert.equal(
    (
      await api(root + '/sales/down-payments/preview', 'POST', {
        order_id: order.data.id,
        mode: 'percentage',
        percentage_bps: 3000,
        reference: 'DP-DRAFT',
        due_on: '2026-12-01',
      })
    ).status,
    409,
  );
  const activeOrder = await api(root + '/records/orders/' + order.data.id, 'PATCH', {
    status: 'awaiting_payment',
  });
  assert.equal(activeOrder.status, 200, JSON.stringify(activeOrder.data));

  const dpPreview = await api(root + '/sales/down-payments/preview', 'POST', {
    order_id: order.data.id,
    mode: 'percentage',
    percentage_bps: 3000,
    reference: 'DP-2026-01',
    due_on: '2026-12-01',
  });
  assert.equal(dpPreview.status, 200, JSON.stringify(dpPreview.data));
  assert.equal(dpPreview.data.amount_minor, 120000);
  assert.equal(dpPreview.data.remaining_after_minor, 280000);

  const dp1 = await api(root + '/sales/down-payments', 'POST', {
    order_id: order.data.id,
    mode: 'percentage',
    percentage_bps: 3000,
    reference: 'DP-2026-01',
    due_on: '2026-12-01',
  });
  assert.equal(dp1.status, 201, JSON.stringify(dp1.data));

  const overDp = await api(root + '/sales/down-payments', 'POST', {
    order_id: order.data.id,
    mode: 'fixed',
    fixed_amount_minor: 300000,
    reference: 'DP-2026-OVER',
    due_on: '2026-12-05',
  });
  assert.equal(overDp.status, 400);

  // 3. Optional upsell product: add & accept
  const opt = await api(root + '/sales/optional-products', 'POST', {
    quotation_id: order.data.id,
    product_id: prod.data.id,
    quantity_milli: 1000,
    unit_price_minor: 15000,
    description: '1-Year Extended Warranty',
  });
  assert.equal(opt.status, 201, JSON.stringify(opt.data));
  const accepted = await api(root + '/sales/optional-products/' + opt.data.id, 'PATCH', {
    expected_version: opt.data.version,
    status: 'accepted',
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.status, 'accepted');
});
