import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv, productFixtureBody } from './helpers';

configureTestEnv('autonomous-agent');

import { migrate, dbGet, closeDb } from '../db';
import { createApp } from '../app';

let server: any;
let base = '';
let cookie = '';
let businessOrg1 = '';
let businessOrg2 = '';
let personalOrg = '';
let developerOrg = '';

async function api(
  p: string,
  method = 'GET',
  body?: any,
  session = cookie,
  key = randomUUID(),
) {
  const r = await fetch(base + p, {
    method,
    headers: {
      Cookie: session,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: body === undefined ? undefined : JSON.stringify(productFixtureBody(p, method, body)),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get('set-cookie')?.split(';')[0] || '',
  };
}

before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;

  const signup = await api('/api/auth/signup', 'POST', {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-agent-isolation-2026!',
  });
  assert.equal(signup.status, 201);
  cookie = signup.cookie;
  await api('/api/auth/verify', 'POST', { token: signup.data.verification_token });

  const b1 = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Savannah Supplies Ltd',
    display_name: 'Founder Owner',
    timezone: 'Africa/Nairobi',
    services: ['customers', 'invoicing', 'expenses', 'cash_flow', 'calendar', 'work', 'crm', 'assistant'],
  });
  assert.equal(b1.status, 201);
  businessOrg1 = b1.data.id;

  const b2 = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Rift Valley Logistics Ltd',
    display_name: 'Founder Owner',
    timezone: 'Africa/Nairobi',
    services: ['customers', 'assistant'],
  });
  assert.equal(b2.status, 201);
  businessOrg2 = b2.data.id;

  const p = await api('/api/auth/workspaces', 'POST', {
    kind: 'personal',
    name: 'Founder Personal',
    display_name: 'Founder Owner',
    timezone: 'Africa/Nairobi',
    services: ['income', 'expenses', 'cash_flow', 'calendar', 'assistant'],
  });
  assert.equal(p.status, 201);
  personalOrg = p.data.id;

  const d = await api('/api/auth/workspaces', 'POST', {
    kind: 'developer',
    name: 'Founder Developer',
    display_name: 'Founder Owner',
    timezone: 'Africa/Nairobi',
    services: ['developer_api', 'webhooks', 'assistant'],
  });
  assert.equal(d.status, 201);
  developerOrg = d.data.id;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDb();
});

test('Business agent is strictly sandboxed and hard-blocks Personal, Developer, and other Business workspaces', async () => {
  const ov = await api(`/api/v1/organizations/${businessOrg1}/agent/overview`);
  assert.equal(ov.status, 200);
  assert.equal(ov.data.runtime, 'python3');
  assert.equal(ov.data.boundary.source_kind, 'business');
  assert.equal(ov.data.boundary.cross_workspace_bridge, false);
  assert.deepEqual(ov.data.boundary.allowed_workspace_ids, [businessOrg1]);
  assert.ok(ov.data.boundary.blocked_kinds.includes('personal'));
  assert.ok(ov.data.boundary.blocked_kinds.includes('developer'));

  // Attempt to enable cross-workspace bridge on Business must fail closed (403)
  const bridgeAttempt = await api(
    `/api/v1/organizations/${businessOrg1}/agent/permissions`,
    'PUT',
    { cross_dev_bridge_enabled: true },
  );
  assert.equal(bridgeAttempt.status, 403);

  // Attempt to target Personal, Developer, or second Business workspace from Business agent -> 403
  for (const forbiddenTarget of [personalOrg, developerOrg, businessOrg2]) {
    const attempt = await api(`/api/v1/organizations/${businessOrg1}/agent/runs`, 'POST', {
      prompt: 'Analyze workspace records',
      target_workspace_id: forbiddenTarget,
      currency: 'KES',
    });
    assert.equal(
      attempt.status,
      403,
      `Business agent must be blocked from targeting ${forbiddenTarget}`,
    );
    const auditRow = await dbGet(
      "SELECT action FROM ac_audit WHERE org_id=? AND action='agent.boundary_violation_blocked' AND resource_id=?",
      [businessOrg1, forbiddenTarget],
    );
    assert.ok(auditRow, 'Boundary violation must be recorded in audit log');
  }
});

test('Personal agent bridges owned Personal + Developer workspaces and permanently blocks Business workspaces', async () => {
  const ov = await api(`/api/v1/organizations/${personalOrg}/agent/overview`);
  assert.equal(ov.status, 200);
  assert.equal(ov.data.boundary.source_kind, 'personal');
  assert.equal(ov.data.boundary.cross_workspace_bridge, true);
  assert.ok(ov.data.boundary.allowed_workspace_ids.includes(personalOrg));
  assert.ok(ov.data.boundary.allowed_workspace_ids.includes(developerOrg));
  assert.ok(!ov.data.boundary.allowed_workspace_ids.includes(businessOrg1));
  assert.ok(!ov.data.boundary.allowed_workspace_ids.includes(businessOrg2));

  // Personal agent CAN inspect linked Developer workspace
  const devInspect = await api(`/api/v1/organizations/${personalOrg}/agent/runs`, 'POST', {
    prompt: 'Check my linked Developer workspace API health',
    currency: 'KES',
  });
  assert.equal(devInspect.status, 201);
  assert.equal(devInspect.data.status, 'completed');
  assert.equal(devInspect.data.target_workspace_id, developerOrg);
  assert.equal(devInspect.data.tool_name, 'inspect_linked_developer_workspace');

  // Personal agent CANNOT access Business workspace -> 403
  const personalToBiz = await api(`/api/v1/organizations/${personalOrg}/agent/runs`, 'POST', {
    prompt: 'Analyze my business finances',
    target_workspace_id: businessOrg1,
    currency: 'KES',
  });
  assert.equal(personalToBiz.status, 403);

  // Developer agent CANNOT access Business workspace -> 403
  const devToBiz = await api(`/api/v1/organizations/${developerOrg}/agent/runs`, 'POST', {
    prompt: 'Inspect business workspace',
    target_workspace_id: businessOrg1,
    currency: 'KES',
  });
  assert.equal(devToBiz.status, 403);
});

test('Business agent enforces restraint-first approval, executes real meetings & projects with Computer Use, and respects owner autonomy', async () => {
  // Default schedule_meeting requires approval
  const planned = await api(`/api/v1/organizations/${businessOrg1}/agent/runs`, 'POST', {
    prompt: 'Schedule a meeting for "Q4 Supplier Review" tomorrow',
    currency: 'KES',
    computer_use: true,
  });
  assert.equal(planned.status, 201);
  assert.equal(planned.data.status, 'awaiting_approval');
  assert.equal(planned.data.tool_name, 'schedule_meeting');
  assert.ok(planned.data.result.approval_id);
  assert.equal(planned.data.result.sandbox_clone?.clone_kind, 'calendar');
  assert.ok(Array.isArray(planned.data.steps) && planned.data.steps.length >= 3);

  // Approve & execute live (with user-edited title in sandbox!) -> creates a real calendar event in ac_erp_objects
  const approved = await api(
    `/api/v1/organizations/${businessOrg1}/agent/approvals/${planned.data.result.approval_id}/decide`,
    'POST',
    {
      decision: 'approve',
      note: 'Proceed with booking',
      edited_params: { title: 'Q4 Supplier Review (Confirmed)' },
    },
  );
  assert.equal(approved.status, 200);
  assert.equal(approved.data.status, 'approved');
  assert.equal(approved.data.run.status, 'completed');
  assert.ok(approved.data.run.summary.includes('Q4 Supplier Review (Confirmed)'));
  assert.ok(approved.data.run.result.record_id);
  const calRow = await dbGet(
    "SELECT id FROM ac_erp_objects WHERE id=? AND org_id=? AND kind='calendar_event'",
    [approved.data.run.result.record_id, businessOrg1],
  );
  assert.ok(calRow, 'Calendar event must be persisted in canonical ERP store');

  // Owner grants autonomous permission to create_project, and disables record_expense
  const perm = await api(`/api/v1/organizations/${businessOrg1}/agent/permissions`, 'PUT', {
    permissions: {
      create_project: 'autonomous',
      record_expense: 'disabled',
    },
  });
  assert.equal(perm.status, 200);
  assert.equal(perm.data.permissions.create_project, 'autonomous');
  assert.equal(perm.data.permissions.record_expense, 'disabled');

  // Creating a project now runs autonomously with Computer Use trace!
  const projRun = await api(`/api/v1/organizations/${businessOrg1}/agent/runs`, 'POST', {
    prompt: 'Set up a project for "Nairobi Store Expansion"',
    currency: 'KES',
    computer_use: true,
  });
  assert.equal(projRun.status, 201);
  assert.equal(projRun.data.engine, 'python_autonomous_agent_v2');
  assert.equal(projRun.data.status, 'completed');
  assert.equal(projRun.data.tool_name, 'create_project');
  assert.ok(projRun.data.result.record_id);
  assert.ok(projRun.data.steps.some((s: any) => s.target_tab === 'Work'));

  // Even when create_project is autonomous, UI stage_in_sandbox=true stages in the Clone Sandbox first!
  const stagedProj = await api(`/api/v1/organizations/${businessOrg1}/agent/runs`, 'POST', {
    prompt: 'Set up a project for "Mombasa Hub" and schedule a kickoff meeting tomorrow',
    currency: 'KES',
    computer_use: true,
    stage_in_sandbox: true,
  });
  assert.equal(stagedProj.status, 201);
  assert.equal(stagedProj.data.status, 'awaiting_approval');
  assert.equal(stagedProj.data.result.sandbox_clone?.clone_kind, 'work');
  assert.equal(stagedProj.data.result.chained_actions?.length, 1);

  // Disabled tool fails closed with 403
  const blockedExpense = await api(`/api/v1/organizations/${businessOrg1}/agent/runs`, 'POST', {
    prompt: 'Record an expense of KES 5000 for rent',
    currency: 'KES',
  });
  assert.equal(blockedExpense.status, 403);
});

test('Townie-style routines, workspace memory, and separate Agent Credit Billing with hard spend caps work end-to-end', async () => {
  // Create and trigger a routine
  const routine = await api(`/api/v1/organizations/${businessOrg1}/agent/routines`, 'POST', {
    name: 'Morning Business Briefing',
    description: 'Daily executive snapshot',
    trigger_type: 'schedule',
    schedule_label: 'Weekdays at 08:00 EAT',
    prompt: 'Analyze my business performance',
    tool_name: 'analyze_business',
    execution_mode: 'autonomous',
    enabled: true,
  });
  assert.equal(routine.status, 201);

  const triggered = await api(
    `/api/v1/organizations/${businessOrg1}/agent/routines/${routine.data.id}/run`,
    'POST',
    {},
  );
  assert.equal(triggered.status, 200);
  assert.equal(triggered.data.run.status, 'completed');
  assert.equal(triggered.data.run.routine_id, routine.data.id);

  // Save and remove workspace memory
  const mem = await api(`/api/v1/organizations/${businessOrg1}/agent/memory`, 'POST', {
    category: 'business_context',
    content: 'Prefer morning meetings between 09:00 and 11:00 EAT.',
  });
  assert.equal(mem.status, 201);
  const delMem = await api(
    `/api/v1/organizations/${businessOrg1}/agent/memory/${mem.data.id}`,
    'DELETE',
    {},
  );
  assert.equal(delMem.status, 200);

  // Separate Agent Billing verification
  const billing = await api(`/api/v1/organizations/${businessOrg1}/agent/billing`);
  assert.equal(billing.status, 200);
  assert.equal(billing.data.billing_stream, 'separate_agent_credits');
  assert.equal(billing.data.excluded_from_workspace_all_apps_cap, true);
  assert.ok(billing.data.credits_used > 0);
  assert.ok(billing.data.ledger.length > 0);

  // Upgrade to Agent Growth plan and test hard spend cap enforcement
  const upgraded = await api(`/api/v1/organizations/${businessOrg1}/agent/billing`, 'PUT', {
    plan_tier: 'agent_growth',
    monthly_spend_cap_minor: 50_000, // Below Growth plan's 99,000 minor fee -> should hard-stop!
    hard_stop: true,
  });
  assert.equal(upgraded.status, 200);
  assert.equal(upgraded.data.plan.id, 'agent_growth');

  const capped = await api(`/api/v1/organizations/${businessOrg1}/agent/runs`, 'POST', {
    prompt: 'Analyze my business performance',
    currency: 'KES',
  });
  assert.equal(capped.status, 429);
});
