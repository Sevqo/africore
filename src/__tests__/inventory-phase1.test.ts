import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('inventory-phase1');
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
    { email: randomUUID() + '@example.test', password: 'Synthetic-inventory-2026!' },
    '',
  );
  cookie = s.cookie;
  await api('/api/auth/verify', 'POST', { token: s.data.verification_token });
  const ws = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Phase 1 Inventory Ltd',
    display_name: 'Inventory Owner',
    services: ['products', 'inventory'],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  org = ws.data.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test('Phase 1 Inventory: FEFO lots, scrap deduction, landed cost allocation, and Python FIFO valuation', async () => {
  const root = '/api/v1/organizations/' + org;
  const wh = await api(root + '/inventory/warehouses', 'POST', {
    code: 'MAIN',
    name: 'Main Warehouse',
  });
  assert.equal(wh.status, 201, JSON.stringify(wh.data));

  const prod = await api(root + '/products', 'POST', {
    sku: 'COFFEE-1KG',
    name: 'Kenyan AA Coffee 1kg',
    purchase_cost_minor: 10000,
    sale_price_minor: 18000,
    currency: 'KES',
    track_inventory: true,
  });
  assert.equal(prod.status, 201, JSON.stringify(prod.data));

  const r1 = await api(root + '/inventory/movements', 'POST', {
    product_id: prod.data.id,
    warehouse_id: wh.data.id,
    kind: 'receipt',
    quantity_milli: 10000,
    reason: 'Initial supplier receipt batch 1',
  });
  assert.equal(r1.status, 201, JSON.stringify(r1.data));

  const r2 = await api(root + '/inventory/movements', 'POST', {
    product_id: prod.data.id,
    warehouse_id: wh.data.id,
    kind: 'receipt',
    quantity_milli: 10000,
    reason: 'Second supplier receipt batch 2',
  });
  assert.equal(r2.status, 201, JSON.stringify(r2.data));

  // Register FEFO lots & check constraints
  const lotLate = await api(root + '/inventory/lots', 'POST', {
    product_id: prod.data.id,
    warehouse_id: wh.data.id,
    lot_number: 'LOT-2027-B',
    tracking_type: 'lot',
    quantity_milli: 10000,
    expiry_on: '2027-06-30',
  });
  assert.equal(lotLate.status, 201, JSON.stringify(lotLate.data));

  const lotEarly = await api(root + '/inventory/lots', 'POST', {
    product_id: prod.data.id,
    warehouse_id: wh.data.id,
    lot_number: 'LOT-2026-A',
    tracking_type: 'lot',
    quantity_milli: 10000,
    expiry_on: '2026-12-15',
  });
  assert.equal(lotEarly.status, 201, JSON.stringify(lotEarly.data));

  // Duplicate lot rejected
  assert.equal(
    (
      await api(root + '/inventory/lots', 'POST', {
        product_id: prod.data.id,
        warehouse_id: wh.data.id,
        lot_number: 'LOT-2026-A',
        tracking_type: 'lot',
        quantity_milli: 1000,
      })
    ).status,
    409,
  );

  // Serial > 1 rejected
  assert.equal(
    (
      await api(root + '/inventory/lots', 'POST', {
        product_id: prod.data.id,
        warehouse_id: wh.data.id,
        lot_number: 'SN-001',
        tracking_type: 'serial',
        quantity_milli: 2000,
      })
    ).status,
    400,
  );

  // FEFO ordering check
  const lotsList = await api(root + '/inventory/lots');
  assert.equal(lotsList.status, 200);
  assert.equal(lotsList.data.data[0].lot_number, 'LOT-2026-A');
  assert.equal(lotsList.data.data[1].lot_number, 'LOT-2027-B');

  // Quarantine and release lot
  const q = await api(root + '/inventory/lots/' + lotEarly.data.id, 'PATCH', {
    expected_version: lotEarly.data.version,
    status: 'quarantined',
  });
  assert.equal(q.status, 200);
  assert.equal(q.data.status, 'quarantined');

  // Scrap 2 units from lotEarly
  const scrap = await api(root + '/inventory/scraps', 'POST', {
    product_id: prod.data.id,
    warehouse_id: wh.data.id,
    lot_id: lotEarly.data.id,
    quantity_milli: 2000,
    reason: 'Water damaged packaging during inspection',
  });
  assert.equal(scrap.status, 201, JSON.stringify(scrap.data));
  assert.ok(scrap.data.movement_id);
  const lotsAfterScrap = await api(root + '/inventory/lots');
  assert.equal(lotsAfterScrap.data.data[0].quantity_milli, 8000);

  // Switch policy to FIFO
  const pol = await api(root + '/inventory/valuation/policy', 'PUT', {
    default_method: 'fifo',
    product_methods: {},
  });
  assert.equal(pol.status, 200);
  assert.equal(pol.data.default_method, 'fifo');

  // Preview and post Landed Cost (KES 180.00 = 18000 minor) split by quantity across both receipts
  const lcPayload = {
    reference: 'LC-2026-001',
    date_on: '2026-11-24',
    currency: 'KES',
    split_method: 'by_quantity',
    total_cost_minor: 18000,
    description: 'Port freight and customs clearance',
    movement_ids: [r1.data.id, r2.data.id],
  };
  const preview = await api(root + '/inventory/landed-costs/preview', 'POST', lcPayload);
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.data.allocations.length, 2);
  assert.equal(preview.data.allocations[0].additional_cost_minor, 9000);
  assert.equal(preview.data.allocations[1].additional_cost_minor, 9000);

  const postedLc = await api(root + '/inventory/landed-costs', 'POST', lcPayload);
  assert.equal(postedLc.status, 201, JSON.stringify(postedLc.data));

  // Verify Python FIFO valuation: 20 units received @ 10000 (200000) - 2 scrapped @ 10000 (20000 COGS) + 18000 landed cost = 198000 value for 18 units (11000/unit)
  const val = await api(root + '/inventory/valuation');
  assert.equal(val.status, 200, JSON.stringify(val.data));
  const row = val.data.data.find((x: any) => x.product_id === prod.data.id);
  assert.equal(row.method, 'fifo');
  assert.equal(row.on_hand_milli, 18000);
  assert.equal(row.total_cogs_minor, 20000);
  assert.equal(row.total_value_minor, 198000);
  assert.equal(row.unit_cost_minor, 11000);
});
