import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('apps-17-26-connections');
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
    password: 'Synthetic-connected-26-2026!',
  });
  cookie = s.cookie;
  await api('/api/auth/verify', 'POST', { token: s.data.verification_token });
  const ws = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'AfriCore 26-App Connected Enterprise',
    display_name: 'Platform Owner',
    services: ['products', 'inventory', 'customers', 'invoicing', 'cash_flow', 'orders', 'crm', 'work'],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  org = ws.data.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test('All 10 new apps (Apps 17–26) preview and install cleanly from a fresh empty workspace', async () => {
  const freshWs = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Fresh Install Test Ltd',
    display_name: 'Installer',
    services: [],
  });
  assert.equal(freshWs.status, 201, JSON.stringify(freshWs.data));
  const freshRoot = '/api/v1/organizations/' + freshWs.data.id;
  for (const appId of [
    'marketing',
    'support',
    'subscriptions',
    'manufacturing',
    'field_operations',
    'logistics',
    'property_hospitality',
    'knowledge_learning',
    'studio',
    'integrations_hub',
  ]) {
    const prev = await api(freshRoot + '/apps/' + appId + '/installation-preview');
    assert.equal(prev.status, 200, appId + ' preview failed: ' + JSON.stringify(prev.data));
    const inst = await api(freshRoot + '/apps/' + appId + '/install', 'POST', {
      review_hash: prev.data.review_hash,
      optional_services: [],
    });
    assert.equal(inst.status, 200, appId + ' install failed: ' + JSON.stringify(inst.data));
    assert.equal(inst.data.status, 'installed');
  }
});

test('All 26 Business Apps are registered and exposed in the workspace app catalog', async () => {
  const root = '/api/v1/organizations/' + org;
  const catalog = await api(root + '/apps');
  assert.equal(catalog.status, 200, JSON.stringify(catalog.data));
  assert.equal(catalog.data.apps.length, 26);
  const ids = new Set(catalog.data.apps.map((a: any) => a.id));
  for (const required of [
    'marketing',
    'support',
    'subscriptions',
    'manufacturing',
    'field_operations',
    'logistics',
    'property_hospitality',
    'knowledge_learning',
    'studio',
    'integrations_hub',
  ]) {
    assert.ok(ids.has(required), 'missing app ' + required);
  }
});

test('Connected Sale-to-Cash: single sale auto-creates Order, canonical Invoice, Inventory deduction, Logistics shipment & POD', async () => {
  const root = '/api/v1/organizations/' + org;
  const sale = await api(root + '/connections/sales/complete-sale', 'POST', {
    reference: 'SO-CONN-2026-01',
    customer_name: 'Kilimanjaro Wholesale Ltd',
    currency: 'KES',
    issue_date: '2026-11-24',
    due_date: '2026-12-24',
    destination: 'Mombasa Road Depot',
    carrier_name: 'AfriCore Fleet',
    items: [
      { sku: 'INV-5KW', description: 'Hybrid Solar Inverter', quantity: 2, unit_price_minor: 5000000 },
    ],
  });
  assert.equal(sale.status, 201, JSON.stringify(sale.data));
  assert.equal(sale.data.order.reference, 'SO-CONN-2026-01');
  assert.equal(sale.data.invoice.reference, 'INV-SO-CONN-2026-01');
  assert.equal(sale.data.invoice.total_minor, 10000000);
  assert.equal(sale.data.stock_deductions.length, 1);
  assert.equal(sale.data.stock_deductions[0].quantity_milli, -2000);
  assert.equal(sale.data.shipment.status, 'booked');

  // Verify Logistics POD captures signed proof of delivery
  const pod = await api(root + '/logistics/shipments/' + sale.data.shipment.id + '/pod', 'POST', {
    expected_version: sale.data.shipment.version,
    received_by: 'Grace Mutua',
    delivered_on: '2026-11-26',
  });
  assert.equal(pod.status, 200, JSON.stringify(pod.data));
  assert.equal(pod.data.status, 'delivered');
  assert.equal(pod.data.pod.received_by, 'Grace Mutua');
});

test('Apps 17–22 cross-app flows: Subscriptions auto-invoice, Manufacturing QC->Stock, Support escalation, Marketing->CRM', async () => {
  const root = '/api/v1/organizations/' + org;

  // Subscriptions -> auto-bill canonical invoice
  const plan = await api(root + '/subscriptions/plans', 'POST', {
    code: 'BIZ-MO',
    name: 'Business Monthly',
    currency: 'KES',
    interval: 'monthly',
    price_minor: 1500000,
    trial_days: 0,
  });
  const contract = await api(root + '/subscriptions/contracts', 'POST', {
    customer_name: 'Savannah Tech',
    plan_id: plan.data.id,
    quantity: 3,
    starts_on: '2026-11-01',
    next_invoice_on: '2026-11-24',
  });
  const billed = await api(root + '/subscriptions/contracts/' + contract.data.id + '/bill', 'POST', {
    expected_version: contract.data.version,
    issue_date: '2026-11-24',
  });
  assert.equal(billed.status, 201, JSON.stringify(billed.data));
  assert.equal(billed.data.invoice.total_minor, 4500000);
  assert.equal(billed.data.contract.next_invoice_on, '2026-12-24');

  // Manufacturing -> QC + automatic finished-goods inventory lot
  const bom = await api(root + '/mrp/boms', 'POST', {
    code: 'BOM-BAT-01',
    finished_product_name: 'LiFePO4 Battery Pack',
    currency: 'KES',
    bom_quantity_milli: 1000,
    components: [{ sku: 'CELL-32V', quantity_milli: 4000, unit_cost_minor: 200000, scrap_bps: 0 }],
    operations: [{ name: 'Pack Assembly', duration_minutes: 30, hourly_cost_minor: 100000 }],
  });
  const mo = await api(root + '/mrp/orders', 'POST', {
    reference: 'MO-CONN-01',
    bom_id: bom.data.id,
    produce_quantity_milli: 3000,
    scheduled_on: '2026-11-25',
  });
  const doneMo = await api(root + '/mrp/orders/' + mo.data.id + '/complete', 'POST', {
    expected_version: mo.data.version,
    quality_passed: true,
    inspector_notes: 'Voltage and thermal check passed',
  });
  assert.equal(doneMo.status, 200, JSON.stringify(doneMo.data));
  assert.equal(doneMo.data.order.status, 'done');
  assert.equal(doneMo.data.quality_check.status, 'passed');
  assert.equal(doneMo.data.inventory_lot.quantity_milli, 3000);

  // Support KB + Ticket -> Escalate to Field Operations
  const kb = await api(root + '/support/kb-articles', 'POST', {
    title: 'Inverter Troubleshooting Guide',
    category: 'Hardware',
    body: 'Check breaker and battery voltage first.',
    published: true,
  });
  assert.equal(kb.status, 201);
  const ticket = await api(root + '/support/tickets', 'POST', {
    subject: 'Site inverter fault',
    customer_name: 'Kibo Farms',
    priority: 'urgent',
    sla_due_on: '2026-11-26',
    description: 'Needs technician dispatch',
  });
  const esc = await api(root + '/support/tickets/' + ticket.data.id + '/escalate', 'POST', {
    target: 'field_operations',
    scheduled_on: '2026-11-25',
    assignee: 'Peter Mwangi',
  });
  assert.equal(esc.status, 201, JSON.stringify(esc.data));
  assert.equal(esc.data.target_app, 'field_operations');

  // Marketing -> Capture lead into CRM
  const camp = await api(root + '/marketing/campaigns', 'POST', {
    name: 'East Africa CleanTech Expo',
    channel: 'event',
    audience_segment: 'Agri-processors',
    scheduled_on: '2026-11-28',
    subject_line: 'Meet us at Booth 14',
  });
  const lead = await api(root + '/marketing/campaigns/' + camp.data.id + '/capture-lead', 'POST', {
    lead_name: 'Rift Dairy Co-op',
    due_on: '2026-11-29',
  });
  assert.equal(lead.status, 201, JSON.stringify(lead.data));
  assert.equal(lead.data.status, 'planned');
});

test('Apps 23–26: Property & Hospitality auto-invoicing, Knowledge & Learning grading, Studio no-code, Integrations Hub', async () => {
  const root = '/api/v1/organizations/' + org;

  // App 23: Property & Hospitality
  const unit = await api(root + '/property/units', 'POST', {
    code: 'SUITE-101',
    name: 'Kilimani Executive Suite 101',
    unit_type: 'apartment',
    currency: 'KES',
    rate_minor: 9500000,
    rate_period: 'month',
  });
  assert.equal(unit.status, 201);
  const lease = await api(root + '/property/leases', 'POST', {
    unit_id: unit.data.id,
    tenant_name: 'Amina Hassan',
    starts_on: '2026-11-01',
    ends_on: '2027-10-31',
    monthly_rent_minor: 9500000,
    currency: 'KES',
  });
  const rentInv = await api(root + '/property/leases/' + lease.data.id + '/bill', 'POST', {
    billing_month: '2026-11',
    issue_date: '2026-11-24',
  });
  assert.equal(rentInv.status, 201);
  assert.equal(rentInv.data.invoice.total_minor, 9500000);

  const resv = await api(root + '/property/reservations', 'POST', {
    unit_id: unit.data.id,
    guest_name: 'Dr. Samuel Osei',
    check_in: '2026-11-20',
    check_out: '2026-11-24',
    nights: 4,
    nightly_rate_minor: 1500000,
    currency: 'KES',
  });
  const checkout = await api(root + '/property/reservations/' + resv.data.id + '/checkout', 'POST', {
    expected_version: resv.data.version,
    checkout_date: '2026-11-24',
    extras_minor: 500000,
  });
  assert.equal(checkout.status, 200);
  assert.equal(checkout.data.invoice.total_minor, 6500000);

  // App 24: Knowledge & Learning
  const wiki = await api(root + '/learning/articles', 'POST', {
    title: 'AfriCore Security & Separation of Duties Policy',
    space: 'Governance',
    content: 'All payroll runs and period closes require a separate authorized reviewer.',
  });
  assert.equal(wiki.status, 201);
  const course = await api(root + '/learning/courses', 'POST', {
    code: 'SEC-201',
    title: 'Internal Controls Certification',
    department: 'Finance',
    passing_score_pct: 80,
    duration_minutes: 60,
  });
  const enroll = await api(root + '/learning/enrollments', 'POST', {
    course_id: course.data.id,
    employee_name: 'Grace Wanjiku',
    due_on: '2026-12-15',
  });
  const graded = await api(root + '/learning/enrollments/' + enroll.data.id + '/assess', 'POST', {
    expected_version: enroll.data.version,
    correct_answers: 9,
    total_questions: 10,
  });
  assert.equal(graded.status, 200);
  assert.equal(graded.data.status, 'certified');
  assert.equal(graded.data.score_pct, 90);
  assert.ok(graded.data.certificate_ref.startsWith('CERT-SEC-201-'));

  // App 25: AfriCore Studio
  const studioApp = await api(root + '/studio/apps', 'POST', {
    slug: 'site_inspections',
    name: 'Site Safety Inspections',
    default_view: 'table',
    fields: [
      { key: 'site_name', label: 'Site Name', type: 'text', required: true },
      { key: 'score', label: 'Safety Score', type: 'number', required: false },
    ],
  });
  assert.equal(studioApp.status, 201);
  const badRec = await api(root + '/studio/apps/' + studioApp.data.id + '/records', 'POST', {
    values: { score: 95 },
  });
  assert.equal(badRec.status, 400);
  const goodRec = await api(root + '/studio/apps/' + studioApp.data.id + '/records', 'POST', {
    values: { site_name: 'Eldoret Depot', score: 98 },
  });
  assert.equal(goodRec.status, 201);

  // App 26: Integrations Hub
  const conn = await api(root + '/integrations-hub/connectors', 'POST', {
    name: 'ERP-to-BI Sync',
    connector_type: 'database_sync',
    source_app: 'accounting',
    target_app: 'analytics',
  });
  assert.equal(conn.status, 201);
  const pipe = await api(root + '/integrations-hub/pipelines', 'POST', {
    name: 'Nightly Revenue Sync',
    source_app: 'sales',
    target_app: 'analytics',
    trigger_event: 'sales.completed',
    action_summary: 'Refresh executive revenue dashboards',
  });
  const run = await api(root + '/integrations-hub/pipelines/' + pipe.data.id + '/run', 'POST', {});
  assert.equal(run.status, 200);
  assert.equal(run.data.pipeline.run_count, 1);

  const topo = await api(root + '/integrations-hub/topology');
  assert.equal(topo.status, 200);
  assert.equal(topo.data.total_apps, 26);
  assert.ok(topo.data.events_delivered >= 8, `expected >=8 cross-app events, got ${topo.data.events_delivered}`);
});
