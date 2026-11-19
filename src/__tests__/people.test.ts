import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureTestEnv } from './helpers';
configureTestEnv('erp-people-operations');
import { migrate, dbRun, dbGet, closeDb } from '../db';
import { createApp } from '../app';
import { defaultPeoplePolicy } from '../erp/people-access';
let server: any,
  base: string,
  org: string,
  owner: any,
  staff: any,
  manager: any,
  outsider: any,
  employee: any,
  supervisor: any,
  policy: any,
  type: any;
const root = () => '/api/v1/organizations/' + org;
async function api(
  path: string,
  method = 'GET',
  body?: any,
  session = owner?.cookie || '',
  key = randomUUID(),
) {
  const r = await fetch(base + path, {
    method,
    headers: { Cookie: session, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get('set-cookie')?.split(';')[0] || '',
  };
}
async function identity() {
  const r = await api(
    '/api/auth/signup',
    'POST',
    { email: randomUUID() + '@example.test', password: 'Synthetic-People-2026!' },
    '',
  );
  await api('/api/auth/verify', 'POST', { token: r.data.verification_token }, r.cookie);
  return {
    id: (await api('/api/auth/account', 'GET', undefined, r.cookie)).data.user.id,
    cookie: r.cookie,
  };
}
before(async () => {
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  owner = await identity();
  const w = await api('/api/auth/workspaces', 'POST', {
    kind: 'business',
    name: 'Synthetic People suite',
    display_name: 'Synthetic owner',
    services: ['people'],
  });
  assert.equal(w.status, 201, JSON.stringify(w.data));
  org = w.data.id;
  staff = await identity();
  manager = await identity();
  outsider = await identity();
  for (const [person, role] of [
    [staff, 'viewer'],
    [manager, 'operations'],
    [outsider, 'finance'],
  ] as const)
    await dbRun('INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,?)', [
      org,
      person.id,
      role,
    ]);
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDb();
});
test('HR configuration and explicit employee identity links preserve independent authority', async () => {
  policy = { ...defaultPeoplePolicy, allow_manager_leave_approval: true };
  const c = await api(root() + '/people/configuration', 'PUT', { expected_version: 0, policy });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal(
    (
      await api(
        root() + '/people/configuration',
        'PUT',
        { expected_version: 1, policy },
        manager.cookie,
      )
    ).status,
    403,
  );
  const m = await api(root() + '/people/employees', 'POST', {
    expected_version: 0,
    employee_number: 'M-1',
    name: 'Synthetic Manager',
    start_on: '2026-01-01',
    status: 'active',
    linked_user_id: manager.id,
    self_service: true,
  });
  assert.equal(m.status, 200, JSON.stringify(m.data));
  supervisor = m.data;
  const e = await api(root() + '/people/employees', 'POST', {
    expected_version: 0,
    employee_number: 'E-1',
    name: 'Synthetic Employee',
    start_on: '2026-01-01',
    status: 'active',
    manager_id: supervisor.id,
    linked_user_id: staff.id,
    self_service: true,
    hr_notes: 'Private synthetic HR note',
  });
  assert.equal(e.status, 200, JSON.stringify(e.data));
  employee = e.data;
  const own = await api(
    root() + '/people/employees/' + employee.id,
    'GET',
    undefined,
    staff.cookie,
  );
  assert.equal(own.status, 200);
  assert.equal(own.data.data.hr_notes, undefined);
  assert.equal(
    (await api(root() + '/people/employees/' + employee.id, 'GET', undefined, outsider.cookie))
      .status,
    404,
  );
  assert.equal(
    (
      await api(
        root() + '/people/employees/' + employee.id + '/compensation',
        'GET',
        undefined,
        manager.cookie,
      )
    ).status,
    403,
  );
});
test('configured leave uses exact separate manager review, encrypted evidence and immutable balances', async () => {
  const t = await api(root() + '/people/leave-types', 'POST', {
    expected_version: 0,
    name: 'Configured annual leave',
    annual_allowance_milli: 20000,
    accrual: 'annual',
  });
  assert.equal(t.status, 200, JSON.stringify(t.data));
  type = t.data;
  const req = await api(
    root() + '/people/employees/' + employee.id + '/leave',
    'POST',
    {
      leave_type_id: type.id,
      from: '2026-11-09',
      to: '2026-11-10',
      reason: 'Private synthetic leave reason',
      approver: manager.id,
    },
    staff.cookie,
  );
  assert.equal(req.status, 200, JSON.stringify(req.data));
  const id = req.data.approval_id;
  const raw = await dbGet(
    'SELECT parameters,review_summary FROM ac_approval_bindings WHERE approval_id=?',
    [id],
  );
  assert.ok(raw.parameters.startsWith('v2.'));
  assert.ok(raw.review_summary.startsWith('v2.'));
  const decision = await api(
    root() + '/approvals/' + id + '/decide',
    'POST',
    { decision: 'approved', reason: 'Synthetic configured manager review' },
    manager.cookie,
  );
  assert.equal(decision.status, 200, JSON.stringify(decision.data));
  assert.equal(decision.data.executed, true);
  const balance = await api(
    root() + '/people/employees/' + employee.id + '/leave-balances',
    'GET',
    undefined,
    staff.cookie,
  );
  assert.equal(balance.data.data[0].used_milli, 2000);
  assert.equal(balance.data.data[0].available_milli, 18000);
  assert.equal(
    (
      await api(
        root() + '/approvals/' + id + '/decide',
        'POST',
        { decision: 'approved', reason: 'Repeated synthetic decision' },
        manager.cookie,
      )
    ).status,
    409,
  );
  await assert.rejects(
    dbRun('UPDATE ac_people_leave_ledger SET units_milli=0 WHERE request_id=?', [req.data.id]),
  );
});
test('former reporting managers lose pending leave details and decision authority', async () => {
  const r = await api(
    root() + '/people/employees/' + employee.id + '/leave',
    'POST',
    {
      leave_type_id: type.id,
      from: '2026-11-12',
      to: '2026-11-12',
      reason: 'Private pending synthetic reason',
      approver: manager.id,
    },
    staff.cookie,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const current = await api(root() + '/people/employees/' + employee.id);
  const changed = await api(root() + '/people/employees/' + employee.id, 'PUT', {
    ...current.data.data,
    expected_version: current.data.version,
    manager_id: null,
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  const queue = await api(root() + '/business/approvals', 'GET', undefined, manager.cookie);
  assert.equal(queue.status, 200);
  assert.ok(!queue.data.data.some((x: any) => x.id === r.data.approval_id));
  assert.equal(
    (
      await api(
        root() + '/approvals/' + r.data.approval_id + '/decide',
        'POST',
        { decision: 'approved', reason: 'Former synthetic manager review' },
        manager.cookie,
      )
    ).status,
    403,
  );
});
test('viewer employee self-service records actual timestamps without granting HR or finance access', async () => {
  const key = randomUUID(),
    path = root() + '/people/employees/' + employee.id + '/check-in',
    first = await api(path, 'POST', { confirm: true }, staff.cookie, key);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const retry = await api(path, 'POST', { confirm: true }, staff.cookie, key);
  assert.equal(retry.data.id, first.data.id);
  assert.equal((await api(path, 'POST', { confirm: true }, staff.cookie)).status, 409);
  assert.equal((await api(path, 'POST', { confirm: true }, owner.cookie)).status, 403);
  const out = await api(
    root() + '/people/employees/' + employee.id + '/check-out',
    'POST',
    { confirm: true },
    staff.cookie,
  );
  assert.equal(out.status, 200, JSON.stringify(out.data));
  assert.equal(out.data.status, 'closed');
  assert.equal(
    (
      await api(
        root() + '/people/employees',
        'POST',
        { expected_version: 0, employee_number: 'X', name: 'No authority', start_on: '2026-01-01' },
        staff.cookie,
      )
    ).status,
    403,
  );
});

test('compensation remains private from delegated HR and retained corrections do not overwrite terms', async () => {
  const cfg = await api(root() + '/people/configuration');
  const value = { ...cfg.data.policy, hr_members: [{ user_id: manager.id, permission: 'manage' }] };
  assert.equal(
    (
      await api(root() + '/people/configuration', 'PUT', {
        expected_version: cfg.data.version,
        policy: value,
      })
    ).status,
    200,
  );
  const terms = {
    effective_from: '2026-01-01',
    amount_minor: 5000000,
    currency: 'KES',
    period: 'month',
    notes: 'Synthetic restricted compensation',
  };
  const created = await api(
    root() + '/people/employees/' + employee.id + '/compensation',
    'POST',
    terms,
  );
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.equal(
    (
      await api(
        root() + '/people/employees/' + employee.id + '/compensation',
        'GET',
        undefined,
        manager.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        root() + '/people/employees/' + employee.id + '/compensation',
        'GET',
        undefined,
        staff.cookie,
      )
    ).status,
    403,
  );
  const corrected = await api(
    root() + '/people/employees/' + employee.id + '/compensation',
    'POST',
    { ...terms, amount_minor: 5100000, supersedes_id: created.data.id },
  );
  assert.equal(corrected.status, 200, JSON.stringify(corrected.data));
  const history = await api(
    root() + '/people/employees/' + employee.id + '/compensation?history=1',
  );
  assert.equal(history.data.data.length, 2);
  assert.equal(
    history.data.data.find((r: any) => r.id === created.data.id).data.amount_minor,
    5000000,
  );
});
test('leave source changes invalidate exact review and adjustment reference retries do not double-credit', async () => {
  const cfg = await api(root() + '/people/configuration');
  assert.equal(
    (
      await api(root() + '/people/configuration', 'PUT', {
        expected_version: cfg.data.version,
        policy: { ...cfg.data.policy, hr_members: [] },
      })
    ).status,
    200,
  );
  const request = await api(
    root() + '/people/employees/' + employee.id + '/leave',
    'POST',
    {
      leave_type_id: type.id,
      from: '2026-11-16',
      to: '2026-11-16',
      reason: 'Synthetic source revision test',
      approver: owner.id,
    },
    staff.cookie,
  );
  assert.equal(request.status, 200, JSON.stringify(request.data));
  const current = await api(root() + '/people/employees/' + employee.id);
  assert.equal(
    (
      await api(root() + '/people/employees/' + employee.id, 'PUT', {
        ...current.data.data,
        expected_version: current.data.version,
        job_title: 'Revised synthetic title',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(root() + '/approvals/' + request.data.approval_id + '/decide', 'POST', {
        decision: 'approved',
        reason: 'Stale synthetic source decision',
      })
    ).status,
    409,
  );
  const change = {
    leave_type_id: type.id,
    year: 2026,
    units_milli: 1000,
    reference: 'SYNTHETIC-ADJUST-1',
    reason: 'Synthetic configured adjustment',
  };
  const first = await api(
    root() + '/people/employees/' + employee.id + '/leave-adjustments',
    'POST',
    change,
  );
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const count = Number(
    (
      await dbGet(
        "SELECT COUNT(*) AS n FROM ac_usage_events WHERE org_id=? AND service_id='people'",
        [org],
      )
    ).n,
  );
  const retry = await api(
    root() + '/people/employees/' + employee.id + '/leave-adjustments',
    'POST',
    change,
  );
  assert.equal(retry.status, 200);
  assert.equal(retry.data.id, first.data.id);
  assert.equal(
    Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac_usage_events WHERE org_id=? AND service_id='people'",
          [org],
        )
      ).n,
    ),
    count,
  );
  assert.equal(
    (
      await api(root() + '/people/employees/' + employee.id + '/leave-adjustments', 'POST', {
        ...change,
        units_milli: 2000,
      })
    ).status,
    409,
  );
});
test('organization charts exclude HR and identity payloads and aggregate reports require current HR authority', async () => {
  const chart = await api(root() + '/people/org-chart');
  assert.equal(chart.status, 200);
  assert.ok(chart.data.data.some((e: any) => e.id === employee.id));
  for (const e of chart.data.data) {
    assert.equal(e.hr_notes, undefined);
    assert.equal(e.linked_user_id, undefined);
    assert.equal(e.employee_number, undefined);
  }
  const report = await api(root() + '/people/report?from=2026-01-01&to=2026-12-31');
  assert.equal(report.status, 200, JSON.stringify(report.data));
  assert.ok(report.data.employees.length);
  assert.equal(
    (
      await api(
        root() + '/people/report?from=2026-01-01&to=2026-12-31',
        'GET',
        undefined,
        staff.cookie,
      )
    ).status,
    403,
  );
  const selfChart = await api(root() + '/people/org-chart', 'GET', undefined, staff.cookie);
  assert.equal(selfChart.status, 200);
  assert.ok(!JSON.stringify(selfChart.data).includes('hr_notes'));
});
test('onboarding prepares private operational Work tasks without copying employee or HR payloads', async () => {
  assert.equal((await api(root() + '/services/work/activate', 'POST', {})).status, 200);
  const current = (await api(root() + '/people/employees/' + employee.id)).data,
    key = randomUUID(),
    body = {
      expected_version: current.version,
      project_name: 'Synthetic onboarding checklist',
      task_titles: ['Prepare synthetic work tools', 'Review synthetic responsibilities'],
    },
    r = await api(
      root() + '/people/employees/' + employee.id + '/onboarding-project',
      'POST',
      body,
      owner.cookie,
      key,
    );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(
    (
      await api(
        root() + '/people/employees/' + employee.id + '/onboarding-project',
        'POST',
        body,
        owner.cookie,
        key,
      )
    ).data.project_id,
    r.data.project_id,
  );
  const board = await api(root() + '/work/projects/' + r.data.project_id);
  assert.equal(board.status, 200);
  assert.equal(board.data.tasks.length, 2);
  assert.equal(board.data.project.data.members.length, 1);
  assert.equal(board.data.project.data.members[0].user_id, owner.id);
  assert.ok(!JSON.stringify(board.data.project.data).includes(employee.id));
  assert.ok(!JSON.stringify(board.data.project.data).includes('hr_notes'));
  assert.equal(
    (await api(root() + '/work/projects/' + r.data.project_id, 'GET', undefined, staff.cookie))
      .status,
    404,
  );
  const updated = (await api(root() + '/people/employees/' + employee.id)).data;
  assert.ok(updated.onboarding_projects.includes(r.data.project_id));
});
test('Phase 2.10B hierarchy, profiles, recruitment, performance, lifecycle and reports persist with scoped access', async () => {
  const parent = await api(root() + '/people/departments', 'POST', {
      expected_version: 0,
      name: 'Synthetic Leadership',
    }),
    child = await api(root() + '/people/departments', 'POST', {
      expected_version: 0,
      name: 'Synthetic Product',
      parent_id: parent.data.id,
    });
  assert.equal(parent.status, 200, JSON.stringify(parent.data));
  assert.equal(child.status, 200, JSON.stringify(child.data));
  const cycle = await api(root() + '/people/departments/' + parent.data.id, 'PUT', {
    expected_version: parent.data.version,
    name: parent.data.data.name,
    parent_id: child.data.id,
    manager_id: null,
    description: '',
    active: true,
  });
  assert.equal(cycle.status, 400, JSON.stringify(cycle.data));

  const skill = await api(root() + '/people/skills', 'POST', {
      expected_version: 0,
      name: 'Synthetic systems design',
      type: 'technical',
      active: true,
    }),
    position = await api(root() + '/people/positions', 'POST', {
      expected_version: 0,
      title: 'Synthetic Engineer',
      department_id: child.data.id,
      hiring_manager_id: supervisor.id,
      description: 'Synthetic position for the expansion suite',
      responsibilities: ['Review synthetic designs'],
      required_skill_ids: [skill.data.id],
      employment_category: 'full_time',
      planned_vacancies: 1,
      active: true,
    });
  assert.equal(skill.status, 200, JSON.stringify(skill.data));
  assert.equal(position.status, 200, JSON.stringify(position.data));

  const resume = await api(
      root() + '/people/employees/' + employee.id + '/resume',
      'POST',
      {
        expected_version: 0,
        title: 'Synthetic engineer',
        organization: 'Synthetic Labs',
        description: 'Synthetic professional history',
        from_on: '2024-01-01',
        to_on: '2025-12-31',
      },
      staff.cookie,
    ),
    employeeSkill = await api(
      root() + '/people/employees/' + employee.id + '/skills',
      'POST',
      {
        expected_version: 0,
        skill_id: skill.data.id,
        proficiency: 'advanced',
        years_experience: 4,
        verified: false,
      },
      staff.cookie,
    );
  assert.equal(resume.status, 200, JSON.stringify(resume.data));
  assert.equal(employeeSkill.status, 200, JSON.stringify(employeeSkill.data));
  const privateProfile = await api(
    root() + '/people/employees/' + employee.id + '/private-profile',
    'PUT',
    {
      expected_version: 0,
      legal_name: 'Synthetic Legal Name',
      emergency_contact_name: 'Synthetic Contact',
    },
  );
  assert.equal(privateProfile.status, 200, JSON.stringify(privateProfile.data));
  assert.equal(
    (
      await api(
        root() + '/people/employees/' + employee.id + '/private-profile',
        'GET',
        undefined,
        outsider.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        root() + '/people/employees/' + employee.id + '/private-profile',
        'GET',
        undefined,
        staff.cookie,
      )
    ).status,
    403,
  );

  const candidateEmail = randomUUID() + '@example.test',
    candidate = await api(root() + '/people/recruitment/candidates', 'POST', {
      expected_version: 0,
      name: 'Synthetic Candidate',
      email: candidateEmail,
      phone: '+254700000100',
      source: 'Synthetic referral',
      private_notes: 'Synthetic recruiter note',
    });
  assert.equal(candidate.status, 200, JSON.stringify(candidate.data));
  assert.equal(
    (
      await api(root() + '/people/recruitment/candidates', 'POST', {
        expected_version: 0,
        name: 'Duplicate Synthetic Candidate',
        email: candidateEmail,
        phone: '+254700000101',
      })
    ).status,
    409,
  );
  const opening = await api(root() + '/people/recruitment/openings', 'POST', {
      expected_version: 0,
      position_id: position.data.id,
      recruiter_id: supervisor.id,
      vacancies: 1,
      description: 'Synthetic opening',
      opening_on: '2026-01-01',
      deadline: '2026-12-31',
      status: 'open',
    }),
    application = await api(root() + '/people/recruitment/applications', 'POST', {
      expected_version: 0,
      candidate_id: candidate.data.id,
      opening_id: opening.data.id,
      stage: 'new',
      recruiter_id: supervisor.id,
      interview_on: null,
      assessment_notes: '',
      decision_reason: '',
    });
  assert.equal(opening.status, 200, JSON.stringify(opening.data));
  assert.equal(application.status, 200, JSON.stringify(application.data));
  let activeApplication = application.data;
  for (const stage of ['screening', 'interview', 'assessment', 'offer']) {
    const moved = await api(
      root() + '/people/recruitment/applications/' + activeApplication.id,
      'PUT',
      {
        expected_version: activeApplication.version,
        candidate_id: candidate.data.id,
        opening_id: opening.data.id,
        recruiter_id: supervisor.id,
        stage,
        interview_on: stage === 'interview' ? '2026-11-20' : null,
        assessment_notes: '',
        decision_reason: '',
      },
    );
    assert.equal(moved.status, 200, JSON.stringify(moved.data));
    activeApplication = moved.data;
  }
  const hireKey = randomUUID(),
    hireBody = {
      expected_version: activeApplication.version,
      employee_number: 'SYNTH-HIRE-1',
      start_on: '2026-12-01',
      manager_id: supervisor.id,
      linked_user_id: null,
    },
    hired = await api(
      root() + '/people/recruitment/applications/' + activeApplication.id + '/hire',
      'POST',
      hireBody,
      owner.cookie,
      hireKey,
    ),
    hiredAgain = await api(
      root() + '/people/recruitment/applications/' + activeApplication.id + '/hire',
      'POST',
      hireBody,
      owner.cookie,
      hireKey,
    );
  assert.equal(hired.status, 200, JSON.stringify(hired.data));
  assert.equal(hired.data.status, 'hired');
  assert.equal(hired.data.employee.data.position_id, position.data.id);
  assert.equal(hired.data.employee.data.linked_user_id, null);
  assert.equal(hiredAgain.data.employee_id, hired.data.employee_id);

  const goal = await api(root() + '/people/goals', 'POST', {
      expected_version: 0,
      employee_id: employee.id,
      title: 'Synthetic development goal',
      description: 'Reach the reviewed milestone.',
      start_on: '2026-01-01',
      deadline: '2026-12-31',
      progress: 0,
      status: 'active',
      skill_ids: [skill.data.id],
      work_task_id: null,
    }),
    appraisal = await api(root() + '/people/appraisals', 'POST', {
      expected_version: 0,
      employee_id: employee.id,
      reviewer_id: supervisor.id,
      period_start: '2026-01-01',
      period_end: '2026-12-31',
      review_on: '2026-11-20',
      state: 'scheduled',
      self_assessment: '',
      manager_assessment: '',
      skills_development: '',
      feedback: '',
      private_manager_notes: 'Synthetic confidential reviewer note',
      goal_ids: [],
    });
  assert.equal(goal.status, 200, JSON.stringify(goal.data));
  assert.equal(appraisal.status, 200, JSON.stringify(appraisal.data));
  const selfSubmitted = await api(
    root() + '/people/appraisals/' + appraisal.data.id + '/self-assessment',
    'POST',
    { expected_version: appraisal.data.version, self_assessment: 'Synthetic self reflection.' },
    staff.cookie,
  );
  assert.equal(selfSubmitted.status, 200, JSON.stringify(selfSubmitted.data));
  assert.equal(selfSubmitted.data.data.private_manager_notes, undefined);
  const staffAppraisals = await api(root() + '/people/appraisals', 'GET', undefined, staff.cookie);
  assert.ok(!JSON.stringify(staffAppraisals.data).includes('Synthetic confidential reviewer note'));

  for (const direction of ['onboarding', 'offboarding']) {
    const plan = await api(root() + '/people/lifecycle/plans', 'POST', {
      expected_version: 0,
      name: 'Synthetic ' + direction + ' plan',
      direction,
      department_id: child.data.id,
      position_id: position.data.id,
      tasks: [{ title: 'Complete synthetic checklist item', due_offset_days: 2 }],
      active: true,
    });
    assert.equal(plan.status, 200, JSON.stringify(plan.data));
    const lifecycle = await api(root() + '/people/lifecycle/cases', 'POST', {
      expected_version: 0,
      employee_id: hired.data.employee_id,
      plan_id: plan.data.id,
      effective_on: '2026-12-01',
      departure_reason: direction === 'offboarding' ? 'Synthetic test completion' : '',
    });
    assert.equal(lifecycle.status, 200, JSON.stringify(lifecycle.data));
    const task = await api(
      root() + '/people/lifecycle/cases/' + lifecycle.data.id + '/tasks',
      'PUT',
      {
        expected_version: lifecycle.data.version,
        task_index: 0,
        done: true,
        note: 'Synthetic task complete',
      },
    );
    assert.equal(task.status, 200, JSON.stringify(task.data));
    const completed = await api(
      root() + '/people/lifecycle/cases/' + lifecycle.data.id + '/complete',
      'POST',
      {
        expected_version: task.data.version,
      },
    );
    assert.equal(completed.status, 200, JSON.stringify(completed.data));
    assert.equal(completed.data.status, 'completed');
  }
  const retainedEmployee = await api(root() + '/people/employees/' + hired.data.employee_id);
  assert.equal(retainedEmployee.status, 200);
  assert.equal(retainedEmployee.data.status, 'inactive');

  const currentConfig = await api(root() + '/people/configuration');
  const invalidTimezone = await api(root() + '/people/configuration', 'PUT', {
    expected_version: currentConfig.data.version,
    policy: { ...currentConfig.data.policy, timezone: 'Not/A_Real_Zone' },
  });
  assert.equal(invalidTimezone.status, 400);
  const timezoneConfig = await api(root() + '/people/configuration', 'PUT', {
    expected_version: currentConfig.data.version,
    policy: {
      ...currentConfig.data.policy,
      timezone: 'America/New_York',
      working_hours: { start: '09:00', end: '17:00', break_minutes: 60 },
    },
  });
  assert.equal(timezoneConfig.status, 200, JSON.stringify(timezoneConfig.data));
  const attendance = await api(
    root() + '/people/attendance/analysis?from=2026-11-01&to=2026-11-30',
  );
  assert.equal(attendance.status, 200, JSON.stringify(attendance.data));
  assert.equal(attendance.data.schedules.timezone, 'America/New_York');
  const leaveCalendar = await api(
    root() + '/people/leave-calendar?from=2026-11-01&to=2026-11-30',
    'GET',
    undefined,
    staff.cookie,
  );
  assert.equal(leaveCalendar.status, 200, JSON.stringify(leaveCalendar.data));
  assert.ok(leaveCalendar.data.data.every((item: any) => item.employee_id === employee.id));
  const expandedReport = await api(
    root() + '/people/report/expansion?from=2026-01-01&to=2026-12-31',
  );
  assert.equal(expandedReport.status, 200, JSON.stringify(expandedReport.data));
  assert.ok(expandedReport.data.recruitment.hired_in_period >= 1);
  assert.ok(expandedReport.data.workforce.total_employees >= 1);
  assert.ok(Array.isArray(expandedReport.data.workforce.active_by_department));
  assert.equal(typeof expandedReport.data.workforce.pending_leave_requests, 'number');
  assert.equal(typeof expandedReport.data.workforce.open_attendance_sessions, 'number');
});
test('People deactivation retains private history and removes write affordances without changing identities', async () => {
  assert.equal(
    (await api(root() + '/services/people/deactivate', 'POST', { confirm: true })).status,
    200,
  );
  try {
    const cfg = await api(root() + '/people/configuration');
    assert.equal(cfg.status, 200);
    assert.equal(cfg.data.service_active, false);
    assert.equal(cfg.data.access.hr_write, false);
    assert.equal(cfg.data.access.comp_write, false);
    assert.equal(cfg.data.access.can_configure, false);
    assert.equal(
      (await api(root() + '/people/employees/' + employee.id, 'GET', undefined, staff.cookie))
        .status,
      200,
    );
    assert.equal(
      (
        await api(
          root() + '/people/employees/' + employee.id + '/check-in',
          'POST',
          { confirm: true },
          staff.cookie,
        )
      ).status,
      402,
    );
    assert.equal(
      (await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?', [org, staff.id]))
        .role,
      'viewer',
    );
  } finally {
    assert.equal((await api(root() + '/services/people/activate', 'POST', {})).status, 200);
  }
});
