import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('accounting-parity');
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
    password: 'Synthetic-accounting-parity-2026!',
  });
  cookie = s.cookie;
  await api('/api/auth/verify', 'POST', { token: s.data.verification_token });
  const ws = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Odoo Accounting Parity Co',
    display_name: 'Finance Director',
    services: ['accounting'],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  org = ws.data.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test('App #2 Odoo Accounting Parity: Cash Flow, FX Revaluation, Analytic Budgets, Follow-ups, Batch Payments & Debit Notes', async () => {
  // 1. Classified Cash Flow Statement
  const cf = await api(`/api/v1/organizations/${org}/accounting/cash-flow`, 'POST', {
    currency: 'KES',
    opening_cash_minor: 500_000,
    movements: [
      { activity: 'operating', label: 'Customer receipts', amount_minor: 250_000 },
      { activity: 'operating', label: 'Supplier bills', amount_minor: -90_000 },
      { activity: 'investing', label: 'Equipment purchase', amount_minor: -100_000 },
      { activity: 'financing', label: 'Working capital loan', amount_minor: 150_000 },
    ],
  });
  assert.equal(cf.status, 200, JSON.stringify(cf.data));
  assert.equal(cf.data.operating.net_minor, 160_000);
  assert.equal(cf.data.closing_cash_minor, 710_000);

  // 2. Multi-Currency FX Revaluation
  const fx = await api(`/api/v1/organizations/${org}/accounting/fx-revaluations`, 'POST', {
    as_of: '2026-11-30',
    base_currency: 'KES',
    positions: [
      {
        reference: 'INV-USD-1',
        currency: 'USD',
        foreign_amount_minor: 100_000,
        booked_rate_micros: 128_000_000,
        closing_rate_micros: 130_000_000,
      },
    ],
  });
  assert.equal(fx.status, 201, JSON.stringify(fx.data));
  assert.equal(fx.data.total_unrealized_gain_minor, 200_000);

  // 3. Analytic Account + Budget Variance
  const aa = await api(`/api/v1/organizations/${org}/accounting/analytic-accounts`, 'POST', {
    code: 'OPS-01',
    name: 'Operations',
    plan: 'Departments',
    currency: 'KES',
  });
  assert.equal(aa.status, 201, JSON.stringify(aa.data));

  const bud = await api(`/api/v1/organizations/${org}/accounting/budgets`, 'POST', {
    name: 'Q4 Operating Budget',
    period_start: '2026-10-01',
    period_end: '2026-12-31',
    currency: 'KES',
    lines: [
      {
        analytic_account_id: aa.data.id,
        name: 'Operations',
        planned_minor: 400_000,
        actual_minor: 300_000,
      },
    ],
  });
  assert.equal(bud.status, 201, JSON.stringify(bud.data));
  assert.equal(bud.data.total_achievement_bps, 7500);

  const evalBud = await api(
    `/api/v1/organizations/${org}/accounting/budgets/${bud.data.id}/evaluate`,
    'POST',
    { actuals: [{ analytic_account_id: aa.data.id, actual_minor: 440_000 }] },
  );
  assert.equal(evalBud.status, 200, JSON.stringify(evalBud.data));
  assert.equal(evalBud.data.total_achievement_bps, 11000);
  assert.equal(evalBud.data.lines[0].over_budget, true);

  // 4. Follow-up / Dunning Levels
  const lv1 = await api(`/api/v1/organizations/${org}/accounting/followup-levels`, 'POST', {
    name: '7-day reminder',
    days_overdue: 7,
    channel: 'email',
    auto_send: true,
  });
  assert.equal(lv1.status, 201, JSON.stringify(lv1.data));
  const lv2 = await api(`/api/v1/organizations/${org}/accounting/followup-levels`, 'POST', {
    name: '30-day escalation',
    days_overdue: 30,
    channel: 'sms',
    auto_send: false,
  });
  assert.equal(lv2.status, 201, JSON.stringify(lv2.data));

  const fuEval = await api(`/api/v1/organizations/${org}/accounting/followups/evaluate`, 'POST', {
    invoices: [
      { invoice_id: 'inv-1', customer_id: 'cust-1', days_overdue: 10, amount_due_minor: 50_000 },
      { invoice_id: 'inv-2', customer_id: 'cust-2', days_overdue: 45, amount_due_minor: 120_000 },
    ],
  });
  assert.equal(fuEval.status, 200, JSON.stringify(fuEval.data));
  assert.equal(fuEval.data.action_count, 2);
  assert.equal(fuEval.data.total_overdue_minor, 170_000);

  // 5. Batch Payment
  const batch = await api(`/api/v1/organizations/${org}/accounting/batch-payments`, 'POST', {
    name: 'November Supplier Remittance',
    direction: 'outbound',
    method: 'bank_transfer',
    currency: 'KES',
    batch_date: '2026-11-25',
    payments: [
      { payment_id: 'pay-1', partner_name: 'Nairobi Supplies', reference: 'BILL-01', amount_minor: 75_000 },
      { payment_id: 'pay-2', partner_name: 'Rift Logistics', reference: 'BILL-02', amount_minor: 25_000 },
    ],
  });
  assert.equal(batch.status, 201, JSON.stringify(batch.data));
  assert.equal(batch.data.total_minor, 100_000);
  assert.ok(String(batch.data.remittance_csv).includes('Nairobi Supplies'));

  // 6. Debit Note
  const dn = await api(`/api/v1/organizations/${org}/accounting/debit-notes`, 'POST', {
    original_invoice_id: 'inv-1',
    reason: 'Additional customs handling charge',
    issue_date: '2026-11-25',
    currency: 'KES',
    amount_minor: 15_000,
  });
  assert.equal(dn.status, 201, JSON.stringify(dn.data));
  assert.equal(dn.data.number, 'DN-0001');
});
