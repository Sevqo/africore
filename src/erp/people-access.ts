import { dbAll, dbGet } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { permitted } from '../platform/domain';
import { requireServices, entitlement } from '../marketplace/engine';
import { currentMember, read, type ERPObject } from './store';
import { peopleDay } from './people-calendar';
export const defaultPeoplePolicy = {
  working_week: [1, 2, 3, 4, 5],
  timezone: 'Africa/Nairobi',
  working_hours: null,
  holidays: [],
  allow_manager_profiles: true,
  allow_manager_leave_approval: false,
  share_leave_calendar_with_managers: false,
  share_self_personnel_files: false,
  share_self_compensation: false,
  hr_members: [],
  compensation_members: [],
  recruitment_members: [],
  performance_members: [],
  share_appraisal_feedback: false,
};
export async function peopleContext(a: Access, write = false) {
  const role = await currentMember(a);
  await requireServices(a, ['people'], !write);
  const row = await dbGet(
      "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='people_settings'",
      [a.org, a.environment],
    ),
    settings = row ? await read(a, row.id, 'people_settings') : null,
    policy = { ...defaultPeoplePolicy, ...(settings?.data || {}) },
    admin = ['owner', 'admin'].includes(role),
    hrRole = role === 'hr',
    grant = policy.hr_members.find((m: any) => m.user_id === a.actor)?.permission,
    comp = policy.compensation_members.find((m: any) => m.user_id === a.actor)?.permission,
    recruiter = policy.recruitment_members.find((m: any) => m.user_id === a.actor)?.permission,
    performance = policy.performance_members.find((m: any) => m.user_id === a.actor)?.permission;
  return {
    role,
    admin,
    settings,
    policy,
    service_active: (await entitlement(a, 'people'))?.status === 'active',
    hr_view: admin || hrRole || !!grant,
    hr_write: admin || hrRole || (permitted(role, 'operations') && ['edit', 'manage'].includes(grant)),
    hr_manage: admin || hrRole || (permitted(role, 'operations') && grant === 'manage'),
    comp_view: admin || hrRole || !!comp,
    comp_write: admin || hrRole || (permitted(role, 'operations') && comp === 'edit'),
    recruitment_view: admin || hrRole || !!grant || !!recruiter,
    recruitment_write:
      admin ||
      hrRole ||
      (permitted(role, 'operations') && ['edit', 'manage'].includes(grant)) ||
      (permitted(role, 'operations') && recruiter === 'edit'),
    performance_view: admin || hrRole || !!grant || !!performance,
    performance_write:
      admin ||
      hrRole ||
      (permitted(role, 'operations') && ['edit', 'manage'].includes(grant)) ||
      (permitted(role, 'operations') && performance === 'edit'),
  };
}
export async function requireHR(a: Access, write = false, manage = false) {
  const c = await peopleContext(a, write);
  if (manage ? !c.hr_manage : write ? !c.hr_write : !c.hr_view)
    fail(403, 'Current delegated HR authority required');
  return c;
}
export async function employeeRow(a: Access, id: string) {
  const row = await dbGet(
    'SELECT * FROM ac_people_employees WHERE employee_id=? AND org_id=? AND environment=?',
    [id, a.org, a.environment],
  );
  if (!row) fail(404, 'Employee not found');
  return row;
}
export async function employeeAccess(
  a: Access,
  id: string,
  purpose:
    | 'basic'
    | 'leave'
    | 'attendance'
    | 'self_write'
    | 'hr_edit'
    | 'personnel'
    | 'compensation' = 'basic',
) {
  const c = await peopleContext(a, purpose === 'self_write' || purpose === 'hr_edit'),
    row = await employeeRow(a, id),
    self = row.linked_user_id === a.actor,
    manager =
      !!row.manager_id &&
      !!(await dbGet(
        "SELECT employee_id FROM ac_people_employees WHERE employee_id=? AND org_id=? AND environment=? AND linked_user_id=? AND status='active'",
        [row.manager_id, a.org, a.environment, a.actor],
      ));
  if (purpose === 'hr_edit') {
    if (!c.hr_write) fail(403, 'Current HR write authority required');
    return { ...c, row, self, manager };
  }
  if (purpose === 'self_write') {
    if (!self || row.status !== 'active' || row.start_on > peopleDay(new Date(), c.policy.timezone))
      fail(403, 'Active linked employee self-service required');
    const e = await read(a, id, 'employee');
    if (!e.data.self_service) fail(403, 'Employee self-service is not enabled');
    return { ...c, row, self, manager };
  }
  if (purpose === 'compensation') {
    if (!c.comp_view && !(self && c.policy.share_self_compensation))
      fail(403, 'Separate compensation authority required');
    return { ...c, row, self, manager };
  }
  if (purpose === 'personnel') {
    if (!c.hr_view && !(self && c.policy.share_self_personnel_files))
      fail(403, 'Personnel file authority required');
    return { ...c, row, self, manager };
  }
  const reportsToSubject =
    purpose === 'basic' &&
    c.policy.allow_manager_profiles &&
    !!(await dbGet(
      'SELECT employee_id FROM ac_people_employees WHERE org_id=? AND environment=? AND linked_user_id=? AND manager_id=?',
      [a.org, a.environment, a.actor, id],
    ));
  const allowed =
    c.hr_view ||
    self ||
    reportsToSubject ||
    (manager &&
      (purpose === 'basic'
        ? c.policy.allow_manager_profiles
        : purpose === 'leave'
          ? c.policy.share_leave_calendar_with_managers || c.policy.allow_manager_leave_approval
          : c.policy.allow_manager_profiles));
  if (!allowed) fail(404, 'Employee not found');
  return { ...c, row, self, manager };
}
export function employeeProjection(value: ERPObject, privateHR: boolean) {
  const { onboarding_projects, ...d } = value.data;
  return {
    onboarding_projects: privateHR ? onboarding_projects || [] : [],
    id: value.id,
    version: value.version,
    created_at: value.created_at,
    updated_at: value.updated_at,
    status: value.status,
    data: privateHR
      ? d
      : Object.fromEntries(
          [
            'employee_number',
            'name',
            'job_title',
            'position_id',
            'department_id',
            'manager_id',
            'linked_user_id',
            'self_service',
            'work_email',
            'work_phone',
            'start_on',
            'status',
          ].map((key) => [key, d[key]]),
        ),
  };
}
/** SQL predicates are selected from fixed policy branches, never client SQL. */
export function employeeVisibility(
  a: Access,
  c: Awaited<ReturnType<typeof peopleContext>>,
  purpose: 'basic' | 'leave' | 'attendance' = 'basic',
  alias = 'e',
) {
  if (c.hr_view) return { sql: '1=1', params: [] };
  const own = alias + '.linked_user_id=?',
    report =
      alias +
      '.manager_id IN (SELECT manager.employee_id FROM ac_people_employees manager WHERE manager.org_id=' +
      alias +
      '.org_id AND manager.environment=' +
      alias +
      ".environment AND manager.linked_user_id=? AND manager.status='active')";
  let sql = own;
  const params = [a.actor];
  if (
    purpose === 'basic'
      ? c.policy.allow_manager_profiles
      : purpose === 'leave'
        ? c.policy.share_leave_calendar_with_managers || c.policy.allow_manager_leave_approval
        : c.policy.allow_manager_profiles
  ) {
    sql += ' OR ' + report;
    params.push(a.actor);
  }
  if (purpose === 'basic' && c.policy.allow_manager_profiles) {
    sql +=
      ' OR ' +
      alias +
      '.employee_id IN (SELECT self.manager_id FROM ac_people_employees self WHERE self.org_id=' +
      alias +
      '.org_id AND self.environment=' +
      alias +
      '.environment AND self.linked_user_id=?)';
    params.push(a.actor);
  }
  return { sql: '(' + sql + ')', params };
}
export async function scopedEmployees(
  a: Access,
  c: Awaited<ReturnType<typeof peopleContext>>,
  purpose: 'basic' | 'leave' | 'attendance' = 'basic',
) {
  const filter = employeeVisibility(a, c, purpose);
  return dbAll(
    'SELECT e.* FROM ac_people_employees e WHERE e.org_id=? AND e.environment=? AND ' +
      filter.sql +
      ' ORDER BY e.employee_id LIMIT 5001',
    [a.org, a.environment, ...filter.params],
  );
}

export async function requireRecruitment(a: Access, write = false) {
  const c = await peopleContext(a, write);
  if (!(write ? c.recruitment_write : c.recruitment_view))
    fail(
      403,
      write ? 'Current recruitment write authority required' : 'Recruitment authority required',
    );
  return c;
}

export async function requirePerformance(a: Access, write = false) {
  const c = await peopleContext(a, write);
  if (!(write ? c.performance_write : c.performance_view))
    fail(
      403,
      write ? 'Current performance write authority required' : 'Performance authority required',
    );
  return c;
}
