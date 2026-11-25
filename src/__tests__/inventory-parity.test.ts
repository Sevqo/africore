import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('inventory-parity');
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
    password: 'Synthetic-inventory-parity-2026!',
  });
  cookie = s.cookie;
  await api('/api/auth/verify', 'POST', { token: s.data.verification_token });
  const ws = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Odoo Inventory Parity Co',
    display_name: 'Warehouse Lead',
    services: ['products', 'inventory'],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  org = ws.data.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test('App #4 Odoo Inventory Parity: Reordering, Putaway, Wave Picking, Packages, Barcode & Backorder Split', async () => {
  // 1. Reordering Rule + Replenishment
  const rr = await api(`/api/v1/organizations/${org}/inventory/reordering-rules`, 'POST', {
    product_id: 'SKU-100',
    warehouse: 'WH-NBO',
    min_qty: 20,
    max_qty: 60,
    qty_multiple: 10,
    lead_days: 4,
  });
  assert.equal(rr.status, 201, JSON.stringify(rr.data));

  const rep = await api(`/api/v1/organizations/${org}/inventory/replenishment/run`, 'POST', {
    positions: [{ product_id: 'SKU-100', warehouse: 'WH-NBO', on_hand_qty: 8, incoming_qty: 0, outgoing_qty: 3 }],
  });
  assert.equal(rep.status, 200, JSON.stringify(rep.data));
  assert.equal(rep.data.suggestion_count, 1);
  assert.equal(rep.data.suggestions[0].order_qty, 60);

  // 2. Putaway Rule + Resolution
  const pa = await api(`/api/v1/organizations/${org}/inventory/putaway-rules`, 'POST', {
    location_in: 'WH/Input',
    location_out: 'WH/ColdRoom-1',
    category: 'perishables',
    storage_category: 'chilled',
    priority: 5,
  });
  assert.equal(pa.status, 201, JSON.stringify(pa.data));

  const paRes = await api(`/api/v1/organizations/${org}/inventory/putaway/resolve`, 'POST', {
    product_id: 'SKU-MILK',
    category: 'perishables',
    location_in: 'WH/Input',
  });
  assert.equal(paRes.status, 200, JSON.stringify(paRes.data));
  assert.equal(paRes.data.location_out, 'WH/ColdRoom-1');

  // 3. Wave Picking
  const waves = await api(`/api/v1/organizations/${org}/inventory/waves/plan`, 'POST', {
    max_weight_grams: 10_000,
    max_pickings_per_wave: 2,
    pickings: [
      { picking_id: 'PICK-1', zone: 'Z1', carrier: 'G4S', weight_grams: 6000 },
      { picking_id: 'PICK-2', zone: 'Z1', carrier: 'G4S', weight_grams: 5000 },
    ],
  });
  assert.equal(waves.status, 200, JSON.stringify(waves.data));
  assert.equal(waves.data.wave_count, 2);

  // 4. Package + Barcode Scan
  const pkg = await api(`/api/v1/organizations/${org}/inventory/packages`, 'POST', {
    barcode: 'PKG-000999',
    package_type: 'box',
    location: 'WH/Packing',
    tare_weight_grams: 300,
    net_weight_grams: 4700,
    items: [{ product_id: 'SKU-100', qty: 10 }],
  });
  assert.equal(pkg.status, 201, JSON.stringify(pkg.data));
  assert.equal(pkg.data.gross_weight_grams, 5000);

  const scan = await api(`/api/v1/organizations/${org}/inventory/barcode/scan`, 'POST', {
    barcode: 'PKG-000999',
    action: 'pack',
    location: 'WH/Packing',
    qty: 1,
  });
  assert.equal(scan.status, 201, JSON.stringify(scan.data));
  assert.equal(scan.data.matched_kind, 'package');

  // 5. Backorder Split
  const bo = await api(`/api/v1/organizations/${org}/inventory/backorders/split`, 'POST', {
    lines: [{ product_id: 'SKU-100', ordered_qty: 20, done_qty: 12 }],
  });
  assert.equal(bo.status, 200, JSON.stringify(bo.data));
  assert.equal(bo.data.needs_backorder, true);
  assert.equal(bo.data.backorder_lines[0].qty, 8);
});
