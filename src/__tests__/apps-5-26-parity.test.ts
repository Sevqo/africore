import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('apps-5-26-parity');
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
    password: 'Synthetic-suite-parity-2026!',
  });
  cookie = s.cookie;
  await api('/api/auth/verify', 'POST', { token: s.data.verification_token });
  const ws = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Odoo Full Suite Co',
    display_name: 'COO',
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
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test('Apps #5-#26 Odoo 20 Feature Parity End-to-End', async () => {
  const p = `/api/v1/organizations/${org}`;

  // App #5: Procurement (vendor tiers, calloff, scorecard, dropship)
  assert.equal(
    (
      await api(`${p}/procurement/vendor-tiers`, 'POST', {
        product_id: 'SKU-A',
        supplier_id: 'SUP-1',
        supplier_name: 'Alpha Distributors',
        min_qty: 50,
        unit_price_minor: 420,
        lead_days: 3,
      })
    ).status,
    201,
  );
  const best = await api(`${p}/procurement/vendor-tiers/best`, 'POST', {
    product_id: 'SKU-A',
    quantity: 100,
  });
  assert.equal(best.status, 200);
  assert.equal(best.data.best.total_minor, 42_000);

  const calloff = await api(`${p}/procurement/agreements/calloff`, 'POST', {
    ceiling_qty: 200,
    already_ordered_qty: 50,
    requested_qty: 100,
    unit_price_minor: 500,
  });
  assert.equal(calloff.status, 200);
  assert.equal(calloff.data.approved, true);

  const score = await api(`${p}/procurement/vendors/scorecard`, 'POST', {
    supplier_id: 'SUP-1',
    deliveries: [{ ordered_qty: 10, received_qty: 10, defective_qty: 0, on_time: true }],
  });
  assert.equal(score.status, 200);
  assert.equal(score.data.composite_score_bps, 10_000);

  assert.equal(
    (
      await api(`${p}/procurement/dropships`, 'POST', {
        sales_order_id: 'SO-1',
        supplier_id: 'SUP-1',
        customer_address: 'Westlands, Nairobi',
        product_id: 'SKU-A',
        quantity: 5,
      })
    ).status,
    201,
  );

  // App #6: POS (floors, tables, KDS, split bill, combo, self-order)
  const floor = await api(`${p}/pos/floors`, 'POST', { name: 'Terrace', location: 'Rooftop' });
  assert.equal(floor.status, 201);
  assert.equal(
    (await api(`${p}/pos/tables`, 'POST', { floor_id: floor.data.id, table_number: 'T-01', seats: 4 })).status,
    201,
  );
  const kds = await api(`${p}/pos/kds/tickets`, 'POST', {
    order_ref: 'POS-101',
    table_number: 'T-01',
    station: 'grill',
    items: [{ name: 'Nyama Choma Platter', qty: 1 }],
  });
  assert.equal(kds.status, 201);
  assert.equal(
    (await api(`${p}/pos/kds/tickets/${kds.data.id}/status`, 'POST', { status: 'ready' })).data.status,
    'ready',
  );
  const split = await api(`${p}/pos/bills/split`, 'POST', {
    subtotal_minor: 10_000,
    tax_minor: 1_600,
    tip_bps: 1000,
    guests: 3,
  });
  assert.equal(split.data.grand_total_minor, 12_600);
  const combo = await api(`${p}/pos/combos/price`, 'POST', {
    base_price_minor: 850,
    quantity: 2,
    modifiers: [{ name: 'Avocado', extra_price_minor: 150 }],
  });
  assert.equal(combo.data.line_total_minor, 2000);
  assert.equal((await api(`${p}/pos/self-order/sessions`, 'POST', { table_number: 'T-01', guest_count: 3 })).status, 201);

  // App #7 Work, #8 People, #9 Commerce, #10 Finance, #11 Documents Sign, #12 Analytics
  assert.equal(
    (
      await api(`${p}/work/profitability`, 'POST', {
        revenue_minor: 1_000_000,
        labor_cost_minor: 400_000,
        expense_cost_minor: 100_000,
        planned_hours: 100,
        logged_hours: 80,
        billable_hours: 80,
      })
    ).data.margin_bps,
    5000,
  );
  assert.equal(
    (
      await api(`${p}/people/shifts/overtime`, 'POST', {
        regular_limit_minutes: 480,
        hourly_rate_minor: 1000,
        overtime_multiplier_bps: 15_000,
        shifts: [{ worked_minutes: 600 }],
      })
    ).data.total_pay_minor,
    11_000,
  );
  assert.equal(
    (
      await api(`${p}/commerce/abandoned-carts`, 'POST', {
        threshold_minutes: 30,
        carts: [{ cart_id: 'C1', customer_email: 'buyer@shop.ke', idle_minutes: 90, cart_total_minor: 50_000 }],
      })
    ).data.abandoned_count,
    1,
  );
  assert.equal(
    (await api(`${p}/commerce/wishlists`, 'POST', { customer_id: 'CUST-1', product_id: 'SKU-A' })).status,
    201,
  );
  assert.equal(
    (
      await api(`${p}/finance/treasury/runway`, 'POST', {
        cash_balance_minor: 600_000,
        monthly_inflow_minor: 100_000,
        monthly_outflow_minor: 200_000,
      })
    ).data.runway_months,
    6,
  );
  const env = await api(`${p}/documents/sign/envelopes`, 'POST', {
    document_title: 'Master Services Agreement 2026',
    signers: [{ name: 'Jane Doe', email: 'jane@client.co.ke', order: 1 }],
  });
  assert.equal(env.status, 201);
  const signed = await api(`${p}/documents/sign/envelopes/${env.data.id}/sign`, 'POST', {
    signer_email: 'jane@client.co.ke',
    signature_text: 'Jane Doe',
  });
  assert.equal(signed.data.status, 'completed');
  assert.equal(
    (
      await api(`${p}/analytics/snapshots`, 'POST', {
        title: 'Nov 2026 Executive KPI',
        currency: 'KES',
        metrics: { revenue_minor: 5_000_000, gross_margin_bps: 4200 },
      })
    ).status,
    201,
  );

  // Apps #17-#24: Marketing, Support SLA, Subscriptions NRR, MRP OEE, Field Rental, Hospitality RevPAR, Learning Quiz
  assert.equal(
    (
      await api(`${p}/marketing/funnel`, 'POST', {
        delivered: 1000,
        opened: 400,
        clicked: 100,
        converted: 25,
        attributed_revenue_minor: 500_000,
        spend_minor: 100_000,
      })
    ).data.roi_bps,
    40_000,
  );
  assert.equal(
    (
      await api(`${p}/support/sla/evaluate`, 'POST', {
        tickets: [{ ticket_id: 'T1', sla_target_minutes: 120, elapsed_minutes: 90 }],
      })
    ).data.compliance_bps,
    10_000,
  );
  assert.equal(
    (
      await api(`${p}/subscriptions/nrr`, 'POST', {
        starting_mrr_minor: 1_000_000,
        expansion_mrr_minor: 200_000,
        contraction_mrr_minor: 50_000,
        churn_mrr_minor: 50_000,
      })
    ).data.nrr_bps,
    11_000,
  );
  assert.equal(
    (
      await api(`${p}/mrp/workcenters/oee`, 'POST', {
        planned_minutes: 100,
        downtime_minutes: 10,
        ideal_cycle_seconds: 60,
        total_units: 90,
        good_units: 81,
      })
    ).data.oee_bps,
    8100,
  );
  assert.equal(
    (
      await api(`${p}/field-ops/rentals/price`, 'POST', {
        period: 'day',
        duration_units: 5,
        rate_minor: 10_000,
        late_units: 1,
        late_fee_per_unit_minor: 5_000,
      })
    ).data.grand_total_minor,
    55_000,
  );
  assert.equal(
    (
      await api(`${p}/property/revpar`, 'POST', {
        available_room_nights: 100,
        occupied_room_nights: 80,
        room_revenue_minor: 800_000,
      })
    ).data.revpar_minor,
    8000,
  );
  assert.equal(
    (
      await api(`${p}/learning/quizzes/grade`, 'POST', {
        pass_threshold_bps: 7000,
        questions: [
          { points: 2, submitted: 'A', expected: 'A' },
          { points: 2, submitted: 'B', expected: 'B' },
        ],
      })
    ).data.passed,
    true,
  );
});
