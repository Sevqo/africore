import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('odoo-phases4-10');
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
    { email: randomUUID() + '@example.test', password: 'Synthetic-odoo-suite-2026!' },
    '',
  );
  cookie = s.cookie;
  await api('/api/auth/verify', 'POST', { token: s.data.verification_token });
  const ws = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'AfriCore Full Odoo Suite Ltd',
    display_name: 'Suite Owner',
    services: [
      'products',
      'inventory',
      'customers',
      'invoicing',
      'cash_flow',
      'orders',
      'expenses',
      'pos',
      'crm',
      'work',
      'people',
    ],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  org = ws.data.id;

  const rev = await api(
    '/api/auth/signup',
    'POST',
    { email: randomUUID() + '@example.test', password: 'Synthetic-odoo-suite-2026!' },
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

test('Phase 4 POS: cash drawer variance count and loyalty earn/redeem engine', async () => {
  const root = '/api/v1/organizations/' + org;
  const count = await api(root + '/pos/cash-counts', 'POST', {
    session_ref: 'POS-2026-SHIFT-1',
    currency: 'KES',
    opening_minor: 500000,
    cash_sales_minor: 1200000,
    cash_in_minor: 0,
    cash_out_minor: 100000,
    denominations: [
      { denomination_minor: 100000, count: 15 },
      { denomination_minor: 50000, count: 1 },
    ],
    notes: 'End of day shift count',
  });
  assert.equal(count.status, 201, JSON.stringify(count.data));
  assert.equal(count.data.result.expected_minor, 1600000);
  assert.equal(count.data.result.counted_minor, 1550000);
  assert.equal(count.data.result.variance_minor, -50000);
  assert.equal(count.data.status, 'shortage');

  const prog = await api(root + '/pos/loyalty-programs', 'POST', {
    name: 'Nairobi Gold Rewards',
    currency: 'KES',
    points_per_1000_minor: 10,
    minor_per_point: 100,
    active: true,
  });
  assert.equal(prog.status, 201, JSON.stringify(prog.data));

  const calc = await api(root + '/pos/loyalty/calculate', 'POST', {
    order_total_minor: 500000,
    points_per_1000_minor: 10,
    redeem_points: 200,
    available_points: 500,
    minor_per_point: 100,
  });
  assert.equal(calc.status, 200, JSON.stringify(calc.data));
  assert.equal(calc.data.discount_minor, 20000);
  assert.equal(calc.data.net_payable_minor, 480000);
  assert.equal(calc.data.earned_points, 4800);
});

test('Phase 5 CRM: lead scoring, weighted pipeline forecast, and scheduled activities', async () => {
  const root = '/api/v1/organizations/' + org;
  const score = await api(root + '/crm/scoring/evaluate', 'POST', {
    has_email: true,
    has_phone: true,
    has_company: true,
    expected_revenue_minor: 25000000,
    activities_completed: 5,
    days_stale: 1,
  });
  assert.equal(score.status, 200, JSON.stringify(score.data));
  assert.equal(score.data.tier, 'hot');

  const forecast = await api(root + '/crm/weighted-forecast', 'POST', {
    leads: [
      { stage: 'proposal', currency: 'KES', expected_revenue_minor: 1000000, probability_bps: 5000 },
      { stage: 'won', currency: 'KES', expected_revenue_minor: 2000000, probability_bps: 10000 },
    ],
  });
  assert.equal(forecast.status, 200, JSON.stringify(forecast.data));
  assert.equal(forecast.data.totals_by_currency.KES.weighted_revenue_minor, 2500000);

  const act = await api(root + '/crm/scheduled-activities', 'POST', {
    lead_ref: 'OPP-001',
    activity_type: 'meeting',
    summary: 'Live product walkthrough',
    due_on: '2026-12-01',
    notes: 'Prepare demo environment',
  });
  assert.equal(act.status, 201, JSON.stringify(act.data));
  const done = await api(root + '/crm/scheduled-activities/' + act.data.id, 'PATCH', {
    expected_version: act.data.version,
    status: 'done',
    outcome: 'Client requested enterprise quote',
  });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.status, 'done');
});

test('Phase 6 Work: milestones and billable timesheet burn calculation', async () => {
  const root = '/api/v1/organizations/' + org;
  const ms = await api(root + '/work/milestones', 'POST', {
    project_ref: 'PRJ-2026-ERP',
    name: 'Phase 1 Go-Live',
    target_on: '2026-12-15',
    progress_pct: 50,
    notes: 'Core accounting live',
  });
  assert.equal(ms.status, 201, JSON.stringify(ms.data));
  const reached = await api(root + '/work/milestones/' + ms.data.id, 'PATCH', {
    expected_version: ms.data.version,
    progress_pct: 100,
    status: 'reached',
  });
  assert.equal(reached.status, 200, JSON.stringify(reached.data));
  assert.equal(reached.data.status, 'reached');

  const billing = await api(root + '/work/billing-summaries', 'POST', {
    project_ref: 'PRJ-2026-ERP',
    currency: 'KES',
    budget_minor: 1000000,
    entries: [
      { id: 't1', minutes: 150, hourly_rate_minor: 200000, hourly_cost_minor: 80000, billable: true },
      { id: 't2', minutes: 60, hourly_rate_minor: 200000, hourly_cost_minor: 80000, billable: false },
    ],
  });
  assert.equal(billing.status, 201, JSON.stringify(billing.data));
  assert.equal(billing.data.result.billable_minor, 500000);
  assert.equal(billing.data.result.budget_burn_bps, 5000);
});

test('Phase 7 People: progressive payroll run, self-approval block, separate manager approval, leave allocations', async () => {
  const root = '/api/v1/organizations/' + org;
  const run = await api(root + '/people/payroll-runs', 'POST', {
    period_label: '2026-11',
    pay_date: '2026-11-30',
    currency: 'KES',
    tax_brackets: [
      { up_to_minor: 2400000, rate_bps: 1000 },
      { up_to_minor: null, rate_bps: 3000 },
    ],
    employees: [
      {
        employee_id: 'EMP-101',
        name: 'Grace Wanjiku',
        base_salary_minor: 10000000,
        allowances_minor: 1000000,
        pre_tax_deductions_minor: 500000,
        post_tax_deductions_minor: 100000,
        tax_relief_minor: 240000,
      },
    ],
  });
  assert.equal(run.status, 201, JSON.stringify(run.data));
  assert.equal(run.data.status, 'draft');
  assert.equal(run.data.result.totals.gross_minor, 11000000);

  // Self-approval must be blocked (403)
  const selfApprove = await api(root + '/people/payroll-runs/' + run.data.id, 'PATCH', {
    expected_version: run.data.version,
    decision: 'approve',
    reason: 'Attempting self approval should fail',
  });
  assert.equal(selfApprove.status, 403, JSON.stringify(selfApprove.data));

  // Separate manager approves
  const mgrApprove = await api(
    root + '/people/payroll-runs/' + run.data.id,
    'PATCH',
    {
      expected_version: run.data.version,
      decision: 'approve',
      reason: 'Verified payroll register and tax brackets',
    },
    reviewerCookie,
  );
  assert.equal(mgrApprove.status, 200, JSON.stringify(mgrApprove.data));
  assert.equal(mgrApprove.data.status, 'approved');

  const alloc = await api(root + '/people/leave-allocations', 'POST', {
    employee_name: 'Grace Wanjiku',
    leave_type: 'annual',
    year: 2026,
    allocated_days_tenths: 210,
    used_days_tenths: 45,
  });
  assert.equal(alloc.status, 201, JSON.stringify(alloc.data));
  assert.equal(alloc.data.remaining_days_tenths, 165);
});

test('Phase 8 Subscriptions: plans, contracts, proration preview, and MRR/ARR report', async () => {
  const root = '/api/v1/organizations/' + org;
  const plan = await api(root + '/subscriptions/plans', 'POST', {
    code: 'ENT-ANNUAL',
    name: 'Enterprise Annual',
    currency: 'KES',
    interval: 'annual',
    price_minor: 12000000,
    trial_days: 14,
  });
  assert.equal(plan.status, 201, JSON.stringify(plan.data));

  const contract = await api(root + '/subscriptions/contracts', 'POST', {
    customer_name: 'Rift Valley Logistics',
    plan_id: plan.data.id,
    quantity: 2,
    starts_on: '2026-11-01',
    next_invoice_on: '2027-11-01',
  });
  assert.equal(contract.status, 201, JSON.stringify(contract.data));

  const mrr = await api(root + '/subscriptions/mrr-report');
  assert.equal(mrr.status, 200, JSON.stringify(mrr.data));
  assert.equal(mrr.data.totals_by_currency.KES.mrr_minor, 2000000);
  assert.equal(mrr.data.totals_by_currency.KES.arr_minor, 24000000);

  const pro = await api(root + '/subscriptions/proration/preview', 'POST', {
    period_start: '2026-11-01',
    period_end: '2026-11-30',
    change_on: '2026-11-16',
    old_price_minor: 300000,
    new_price_minor: 600000,
  });
  assert.equal(pro.status, 200, JSON.stringify(pro.data));
  assert.equal(pro.data.net_adjustment_minor, 150000);
});

test('Phase 9 Support & Marketing: helpdesk SLA report and marketing campaigns', async () => {
  const root = '/api/v1/organizations/' + org;
  const ticket = await api(root + '/support/tickets', 'POST', {
    subject: 'Multi-currency ledger sync',
    customer_name: 'Kilimanjaro Exports',
    priority: 'urgent',
    sla_due_on: '2026-12-31',
    description: 'Customer requested reconciliation check across KES and USD journals.',
  });
  assert.equal(ticket.status, 201, JSON.stringify(ticket.data));

  const solved = await api(root + '/support/tickets/' + ticket.data.id, 'PATCH', {
    expected_version: ticket.data.version,
    status: 'solved',
    rating: 5,
    resolution_note: 'Verified balanced multi-currency journal postings.',
  });
  assert.equal(solved.status, 200, JSON.stringify(solved.data));

  const sla = await api(root + '/support/sla-report');
  assert.equal(sla.status, 200, JSON.stringify(sla.data));
  assert.equal(sla.data.solved_or_closed, 1);
  assert.equal(sla.data.avg_rating_tenths, 50);

  const camp = await api(root + '/marketing/campaigns', 'POST', {
    name: 'East Africa ERP Summit',
    channel: 'event',
    audience_segment: 'Enterprise CFOs',
    scheduled_on: '2026-12-10',
    subject_line: 'Join AfriCore Live in Nairobi',
  });
  assert.equal(camp.status, 201, JSON.stringify(camp.data));
  const sent = await api(root + '/marketing/campaigns/' + camp.data.id, 'PATCH', {
    expected_version: camp.data.version,
    status: 'sent',
    observed_delivered: 780,
    observed_clicks: 145,
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.status, 'sent');
});

test('Phase 10 Operations: MRP BOM cost rollup & MO lifecycle, Maintenance, Fleet, and Logistics', async () => {
  const root = '/api/v1/organizations/' + org;
  const bom = await api(root + '/mrp/boms', 'POST', {
    code: 'BOM-PUMP-01',
    finished_product_name: 'Solar Irrigation Pump',
    currency: 'KES',
    bom_quantity_milli: 1000,
    components: [
      { sku: 'MOTOR-12V', quantity_milli: 1000, unit_cost_minor: 400000, scrap_bps: 0 },
      { sku: 'PIPE-PVC', quantity_milli: 2000, unit_cost_minor: 50000, scrap_bps: 1000 },
    ],
    operations: [{ name: 'Assembly', duration_minutes: 60, hourly_cost_minor: 100000 }],
  });
  assert.equal(bom.status, 201, JSON.stringify(bom.data));
  // Material: 400000 + (2000 * 1.1 = 2200 -> 110000) = 510000; Labor: 100000; Total: 610000
  assert.equal(bom.data.standard_rollup.total_cost_minor, 610000);

  const mo = await api(root + '/mrp/orders', 'POST', {
    reference: 'MO-2026-001',
    bom_id: bom.data.id,
    produce_quantity_milli: 5000,
    scheduled_on: '2026-12-05',
  });
  assert.equal(mo.status, 201, JSON.stringify(mo.data));
  assert.equal(mo.data.cost_rollup.total_cost_minor, 3050000);

  const moDone = await api(root + '/mrp/orders/' + mo.data.id, 'PATCH', {
    expected_version: mo.data.version,
    status: 'done',
  });
  assert.equal(moDone.status, 200, JSON.stringify(moDone.data));
  assert.equal(moDone.data.status, 'done');

  const maint = await api(root + '/maintenance/requests', 'POST', {
    equipment_name: 'CNC Mill #2',
    kind: 'preventive',
    scheduled_on: '2026-12-10',
    priority: 'high',
    notes: 'Spindle bearing lubrication',
  });
  assert.equal(maint.status, 201, JSON.stringify(maint.data));
  const repaired = await api(root + '/maintenance/requests/' + maint.data.id, 'PATCH', {
    expected_version: maint.data.version,
    status: 'repaired',
  });
  assert.equal(repaired.status, 200, JSON.stringify(repaired.data));

  const veh = await api(root + '/fleet/vehicles', 'POST', {
    plate_number: 'KDM 881B',
    model: 'Toyota Hilux',
    driver_name: 'David Kiprop',
    odometer_km: 42000,
    next_service_on: '2027-01-15',
  });
  assert.equal(veh.status, 201, JSON.stringify(veh.data));
  const vehUpd = await api(root + '/fleet/vehicles/' + veh.data.id, 'PATCH', {
    expected_version: veh.data.version,
    odometer_km: 43500,
    status: 'active',
  });
  assert.equal(vehUpd.status, 200, JSON.stringify(vehUpd.data));
  assert.equal(vehUpd.data.odometer_km, 43500);

  const ship = await api(root + '/logistics/shipments', 'POST', {
    tracking_number: 'AWB-KE-99201',
    carrier_name: 'AfriFreight Express',
    destination: 'Mombasa Port',
    currency: 'KES',
    freight_cost_minor: 850000,
    estimated_arrival_on: '2026-12-12',
  });
  assert.equal(ship.status, 201, JSON.stringify(ship.data));
  const delivered = await api(root + '/logistics/shipments/' + ship.data.id, 'PATCH', {
    expected_version: ship.data.version,
    status: 'delivered',
  });
  assert.equal(delivered.status, 200, JSON.stringify(delivered.data));
  assert.equal(delivered.data.status, 'delivered');
});
