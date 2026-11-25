import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('crm-parity');
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
    password: 'Synthetic-crm-parity-2026!',
  });
  cookie = s.cookie;
  await api('/api/auth/verify', 'POST', { token: s.data.verification_token });
  const ws = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Odoo CRM Parity Co',
    display_name: 'CRM Lead',
    services: ['customers'],
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.data));
  org = ws.data.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test('App #3 Odoo CRM Parity: Lead Routing, Lost-Reason Analytics, Recurring MRR/ARR, Quotas & Enrichment', async () => {
  // 1. Lead Routing
  const rule = await api(`/api/v1/organizations/${org}/crm/routing-rules`, 'POST', {
    name: 'Kenya Enterprise',
    team_name: 'Enterprise KE',
    priority: 10,
    country: 'KE',
    min_revenue_minor: 100_000,
    reps: [
      { rep_id: 'rep-1', active_leads: 9, max_capacity: 15 },
      { rep_id: 'rep-2', active_leads: 2, max_capacity: 15 },
    ],
  });
  assert.equal(rule.status, 201, JSON.stringify(rule.data));

  const routed = await api(`/api/v1/organizations/${org}/crm/leads/route`, 'POST', {
    country: 'KE',
    source: 'website',
    expected_revenue_minor: 500_000,
  });
  assert.equal(routed.status, 200, JSON.stringify(routed.data));
  assert.equal(routed.data.matched, true);
  assert.equal(routed.data.assigned_rep_id, 'rep-2');

  // 2. Lost Reason + Win/Loss Analytics
  const lr = await api(`/api/v1/organizations/${org}/crm/lost-reasons`, 'POST', {
    code: 'PRICE',
    label: 'Price too high',
    category: 'pricing',
  });
  assert.equal(lr.status, 201, JSON.stringify(lr.data));

  const wl = await api(`/api/v1/organizations/${org}/crm/analytics/win-loss`, 'POST', {
    deals: [
      { outcome: 'won', expected_revenue_minor: 400_000, cycle_days: 10 },
      { outcome: 'lost', expected_revenue_minor: 200_000, lost_reason: 'Price too high' },
    ],
  });
  assert.equal(wl.status, 200, JSON.stringify(wl.data));
  assert.equal(wl.data.win_rate_bps, 5000);
  assert.equal(wl.data.lost_reasons[0].reason, 'Price too high');

  // 3. Recurring Revenue Rollup
  const rr = await api(`/api/v1/organizations/${org}/crm/recurring/rollup`, 'POST', {
    opportunities: [
      { opportunity_id: 'opp-1', recurring_plan: 'annual', recurring_revenue_minor: 240_000, probability_bps: 5000 },
    ],
  });
  assert.equal(rr.status, 200, JSON.stringify(rr.data));
  assert.equal(rr.data.total_mrr_minor, 20_000);
  assert.equal(rr.data.total_weighted_mrr_minor, 10_000);

  // 4. Quotas & Attainment
  const q = await api(`/api/v1/organizations/${org}/crm/quotas`, 'POST', {
    owner_id: 'rep-2',
    owner_name: 'Amina',
    period_start: '2026-10-01',
    period_end: '2026-12-31',
    currency: 'KES',
    target_minor: 1_000_000,
    won_minor: 1_200_000,
  });
  assert.equal(q.status, 201, JSON.stringify(q.data));

  const qEval = await api(`/api/v1/organizations/${org}/crm/quotas/evaluate`);
  assert.equal(qEval.status, 200, JSON.stringify(qEval.data));
  assert.equal(qEval.data.total_attainment_bps, 12000);

  // 5. Enrichment
  const enr = await api(`/api/v1/organizations/${org}/crm/enrichments`, 'POST', {
    lead_id: 'lead-1',
    company_domain: 'nairobi-tech.co.ke',
    industry: 'Fintech',
    employee_band: '51-200',
    country: 'KE',
    confidence_bps: 9200,
  });
  assert.equal(enr.status, 201, JSON.stringify(enr.data));
});
