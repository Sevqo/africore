import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('sales-parity');
import { migrate, closeDb } from '../db';
import { createApp } from '../app';

let server: any, base: string, org: string, cookie: string;

async function api(path: string, method = 'GET', body?: any, key = randomUUID()) {
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
  const s = await api('/api/auth/signup', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-sales-parity-2026!',
  });
  cookie = s.cookie;
  await api('/api/auth/verify', 'POST', { token: s.data.verification_token });
  const ws = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Odoo Sales Parity Co',
    display_name: 'Sales Director',
    services: ['products', 'customers', 'sales'],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  org = ws.data.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test('App #1 Odoo Sales Parity: Promos, E-Signatures, Commissions, Shipping, Variant Matrix, Invoicing Policy & Warnings', async () => {
  const root = '/api/v1/organizations/' + org;

  // 1. Promo codes (Python)
  const promo = await api(root + '/sales/promos', 'POST', {
    code: 'LAUNCH15',
    name: 'Launch 15% Off',
    currency: 'KES',
    discount_type: 'percent_bps',
    value: 1500,
    min_order_minor: 50000,
    max_discount_minor: 20000,
    valid_until: '2027-12-31',
    max_uses: 100,
  });
  assert.equal(promo.status, 201, JSON.stringify(promo.data));
  const applied = await api(root + '/sales/promos/apply', 'POST', {
    code: 'launch15',
    order_subtotal_minor: 100000,
    commit: true,
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.data));
  assert.equal(applied.data.eligible, true);
  assert.equal(applied.data.discount_minor, 15000);
  assert.equal(applied.data.net_total_minor, 85000);

  // 2. Online Quote E-Signature (SHA-256)
  const sig = await api(root + '/sales/signatures', 'POST', {
    quotation_ref: 'QT-2026-088',
    signer_name: 'Dr. Grace Omondi',
    signer_email: 'grace@client.test',
    agreed_total_minor: 85000,
    currency: 'KES',
    signature_text: '/s/ Grace Omondi',
  });
  assert.equal(sig.status, 201, JSON.stringify(sig.data));
  assert.equal(sig.data.signature_sha256.length, 64);

  // 3. Sales Commissions (Python progressive tiers)
  const plan = await api(root + '/sales/commissions/plans', 'POST', {
    name: 'Enterprise Quota Plan',
    currency: 'KES',
    quota_minor: 1000000,
    tiers: [
      { up_to_minor: 1000000, rate_bps: 500 },
      { up_to_minor: null, rate_bps: 1000 },
    ],
  });
  assert.equal(plan.status, 201, JSON.stringify(plan.data));
  const comm = await api(root + '/sales/commissions/evaluate', 'POST', {
    plan_id: plan.data.id,
    salesperson_name: 'Amina',
    achieved_revenue_minor: 1500000,
  });
  assert.equal(comm.status, 200, JSON.stringify(comm.data));
  assert.equal(comm.data.total_commission_minor, 100000);
  assert.equal(comm.data.attainment_bps, 15000);

  // 4. Shipping Rate Rules (Python weight + free threshold)
  const ship = await api(root + '/sales/shipping-methods', 'POST', {
    name: 'Nairobi Express',
    carrier_name: 'AfriCore Fleet',
    currency: 'KES',
    pricing_mode: 'weight_based',
    base_fee_minor: 5000,
    per_kg_minor: 2000,
    free_over_minor: 100000,
  });
  assert.equal(ship.status, 201);
  const rate = await api(root + '/sales/shipping-methods/calculate', 'POST', {
    method_id: ship.data.id,
    order_subtotal_minor: 40000,
    weight_grams: 2400,
  });
  assert.equal(rate.status, 200);
  assert.equal(rate.data.shipping_minor, 11000);

  // 5. Product Variant Matrix Grid Entry (Python)
  const matrix = await api(root + '/sales/variant-matrix/expand', 'POST', {
    base_sku: 'SOLAR',
    base_name: 'Solar Kit',
    base_price_minor: 100000,
    cells: [
      { row_value: '5kW', col_value: 'Indoor', quantity: 2, price_delta_minor: 0 },
      { row_value: '10kW', col_value: 'Outdoor', quantity: 1, price_delta_minor: 50000 },
    ],
  });
  assert.equal(matrix.status, 200);
  assert.equal(matrix.data.line_count, 2);
  assert.equal(matrix.data.grand_total_minor, 350000);

  // 6. Invoicing Policy (ordered_qty vs delivered_qty)
  const policy = await api(root + '/sales/invoicing-policy/evaluate', 'POST', {
    policy: 'delivered_qty',
    lines: [
      { id: 'l1', description: 'Solar Kit', ordered_qty: 10, delivered_qty: 6, already_invoiced_qty: 2, unit_price_minor: 50000 },
    ],
  });
  assert.equal(policy.status, 200);
  assert.equal(policy.data.total_invoiceable_minor, 200000);

  // 7. Customer / Product Sales Warnings & Blocks
  const warn = await api(root + '/sales/warnings', 'POST', {
    target_type: 'customer',
    target_ref: 'CREDIT-HOLD-LTD',
    severity: 'blocking',
    message: 'Customer exceeds credit limit; prepayment required.',
  });
  assert.equal(warn.status, 201);
  const check = await api(root + '/sales/warnings/check', 'POST', {
    customer_ref: 'CREDIT-HOLD-LTD',
    product_refs: [],
  });
  assert.equal(check.status, 200);
  assert.equal(check.data.blocked, true);
  assert.equal(check.data.warnings.length, 1);
});
