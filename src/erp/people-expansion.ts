import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { hash, now } from '../platform/crypto';
import {
  applicationInput,
  appraisalInput,
  candidateInput,
  employeeCertificationInput,
  employeePrivateInput,
  employeeResumeInput,
  employeeSkillInput,
  goalInput,
  hireCandidateInput,
  lifecycleCaseInput,
  lifecyclePlanInput,
  openingInput,
  peoplePositionInput,
  peopleSkillInput,
  lifecycleTaskInput,
  lifecycleCompleteInput,
  goalProgressInput,
  appraisalSelfInput,
} from './people-contracts';
import {
  employeeAccess,
  employeeRow,
  peopleContext,
  requireHR,
  requirePerformance,
  requireRecruitment,
  employeeVisibility,
} from './people-access';
import { type ERPObject, authorize, decode, insert, operation, read, update } from './store';
import { saveEmployee } from './people-profiles';
import { peopleDateBoundsUtc, peopleDay } from './people-calendar';

const idInput = z.string().uuid();
const privateProfileKind = 'employee_private_profile' as const;
const dates = z
  .object({ from: z.string().date(), to: z.string().date() })
  .strict()
  .refine((d) => d.from <= d.to, 'Use an ordered date range');

function attendanceScheduleReview(checkIn: string, checkOut: string | null, policy: any) {
  const schedule = policy.working_hours;
  if (!schedule) return null;
  const local = (value: string) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: policy.timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date(value))
        .map((part) => [part.type, part.value]),
    );
    return {
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
      minutes: Number(parts.hour) * 60 + Number(parts.minute),
      date: peopleDay(new Date(value), policy.timezone),
    };
  };
  const inTime = local(checkIn),
    workday =
      policy.working_week.includes(inTime.weekday) &&
      !policy.holidays.some((holiday: any) => holiday.date === inTime.date),
    start = Number(schedule.start.slice(0, 2)) * 60 + Number(schedule.start.slice(3)),
    end = Number(schedule.end.slice(0, 2)) * 60 + Number(schedule.end.slice(3)),
    outTime = checkOut ? local(checkOut) : null;
  const review = {
    outside_configured_workday: !workday,
    late_arrival_minutes: workday ? Math.max(0, inTime.minutes - start) : 0,
    early_departure_minutes:
      workday && outTime?.date === inTime.date ? Math.max(0, end - outTime.minutes) : 0,
  };
  return review.outside_configured_workday ||
    review.late_arrival_minutes ||
    review.early_departure_minutes
    ? review
    : null;
}

async function employeeRows(a: Access, employeeId: string, kind: string) {
  return dbAll(
    'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? AND root_id=? ORDER BY position,created_at,id LIMIT 501',
    [a.org, a.environment, kind, employeeId],
  );
}
function safeEmployeeResource(value: ERPObject) {
  return {
    id: value.id,
    version: value.version,
    status: value.status,
    created_at: value.created_at,
    updated_at: value.updated_at,
    data: value.data,
  };
}
async function requireSelfOrHR(a: Access, employeeId: string) {
  const c = await employeeAccess(a, employeeId),
    allowed = c.hr_view || c.self;
  if (!allowed) fail(403, 'Employee self or HR profile access required');
  return c;
}

async function employeeWriteAccess(a: Access, employeeId: string) {
  const c = await employeeAccess(a, employeeId);
  if (c.hr_write) return c;
  if (c.self) return employeeAccess(a, employeeId, 'self_write');
  return fail(403, 'Employee self-service or HR write authority required');
}

export async function peoplePositions(a: Access) {
  const c = await peopleContext(a);
  if (!c.hr_view && !c.recruitment_view)
    return {
      data: [],
      has_more: false,
      notice: 'Job positions require HR or recruiter visibility.',
    };
  const rows = await dbAll(
    "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='people_position' ORDER BY status DESC,created_at,id LIMIT 201",
    [a.org, a.environment],
  );
  const employees = c.hr_view
      ? await dbAll(
          "SELECT o.* FROM ac_people_employees e JOIN ac_erp_objects o ON o.id=e.employee_id AND o.org_id=e.org_id AND o.environment=e.environment WHERE e.org_id=? AND e.environment=? AND e.status IN ('active','onboarding') LIMIT 5001",
          [a.org, a.environment],
        )
      : [],
    employeeCounts = new Map<string, number>();
  for (const row of employees) {
    const employee = decode(a, row),
      positionId = employee.data.position_id;
    if (positionId) employeeCounts.set(positionId, (employeeCounts.get(positionId) || 0) + 1);
  }
  return {
    data: await Promise.all(
      rows.slice(0, 200).map(async (row) => {
        const position = decode(a, row);
        return {
          ...safeEmployeeResource(position),
          employee_count: employeeCounts.get(position.id) || 0,
        };
      }),
    ),
    has_more: rows.length > 200,
    limit: 200,
  };
}

export async function savePeoplePosition(
  a: Access,
  positionId: string | null,
  input: unknown,
  key: string,
) {
  const d = peoplePositionInput.parse(input);
  return operation(
    a,
    'people.position:' + String(positionId || 'new'),
    key,
    d,
    () => requireHR(a, true),
    async () => {
      const c = await requireHR(a, true),
        old = positionId ? await read(a, positionId, 'people_position') : null;
      if (!c.settings) fail(409, 'Review People policy first');
      const settings = c.settings;
      if ((old?.version || 0) !== d.expected_version) fail(409, 'Job position changed; reload');
      if (d.department_id) {
        const department = await read(a, d.department_id, 'department');
        if (department.status !== 'active') fail(400, 'Choose an active department');
      }
      if (d.hiring_manager_id && (await employeeRow(a, d.hiring_manager_id)).status !== 'active')
        fail(400, 'Choose an active hiring manager');
      const skillNames: string[] = [];
      for (const skillId of new Set(d.required_skill_ids)) {
        const skill = await read(a, skillId, 'people_skill');
        if (skill.status !== 'active') fail(400, 'Required skills must be active');
        skillNames.push(skill.data.name);
      }
      const existing = await dbAll(
        "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='people_position' ORDER BY id LIMIT 201",
        [a.org, a.environment],
      );
      if (
        existing.some((row) => {
          const item = decode(a, row);
          return (
            item.id !== positionId &&
            item.status === 'active' &&
            (item.data.department_id || null) === d.department_id &&
            item.data.title.normalize('NFKC').toLowerCase() ===
              d.title.normalize('NFKC').toLowerCase()
          );
        })
      )
        fail(409, 'An active position with this title already exists in the department');
      const data = { ...d, required_skill_names: skillNames };
      if (old && !d.active) {
        const opening = await dbGet(
          "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='people_recruitment_opening' AND parent_id=? AND status='open' LIMIT 1",
          [a.org, a.environment, old.id],
        );
        if (opening) fail(409, 'Close open recruitment before archiving this position');
      }
      return old
        ? update(a, old, data, { status: d.active ? 'active' : 'archived' })
        : insert(a, 'people_position', data, {
            root: settings!.id,
            status: d.active ? 'active' : 'archived',
          });
    },
  );
}

export async function peopleSkills(a: Access) {
  const c = await peopleContext(a);
  if (!c.hr_view) fail(403, 'HR visibility required for the skills catalogue');
  const rows = await dbAll(
    "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='people_skill' ORDER BY status DESC,position,created_at,id LIMIT 201",
    [a.org, a.environment],
  );
  return {
    data: rows.slice(0, 200).map((row) => safeEmployeeResource(decode(a, row))),
    has_more: rows.length > 200,
  };
}

export async function savePeopleSkill(
  a: Access,
  skillId: string | null,
  input: unknown,
  key: string,
) {
  const d = peopleSkillInput.parse(input);
  return operation(
    a,
    'people.skill:' + String(skillId || 'new'),
    key,
    d,
    () => requireHR(a, true),
    async () => {
      const c = await requireHR(a, true),
        old = skillId ? await read(a, skillId, 'people_skill') : null;
      if (!c.settings) fail(409, 'Review People policy first');
      const settings = c.settings;
      if ((old?.version || 0) !== d.expected_version) fail(409, 'Skill changed; reload');
      const rows = await dbAll(
        "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='people_skill' ORDER BY id LIMIT 501",
        [a.org, a.environment],
      );
      if (
        rows.some((row) => {
          const item = decode(a, row);
          return (
            item.id !== skillId &&
            item.data.name.normalize('NFKC').toLowerCase() ===
              d.name.normalize('NFKC').toLowerCase()
          );
        })
      )
        fail(409, 'Skill name already exists');
      return old
        ? update(a, old, d, { status: d.active ? 'active' : 'archived' })
        : insert(a, 'people_skill', d, {
            root: settings!.id,
            status: d.active ? 'active' : 'archived',
          });
    },
  );
}

export async function employeePrivateProfile(a: Access, employeeId: string) {
  await requireHR(a);
  await employeeRow(a, employeeId);
  const rows = await dbAll(
    'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? AND parent_id=? ORDER BY created_at DESC,id LIMIT 1',
    [a.org, a.environment, privateProfileKind, employeeId],
  );
  return rows[0] ? safeEmployeeResource(decode(a, rows[0])) : { id: null, version: 0, data: null };
}

export async function saveEmployeePrivateProfile(
  a: Access,
  employeeId: string,
  input: unknown,
  key: string,
) {
  const d = employeePrivateInput.parse(input);
  return operation(
    a,
    'people.private_profile:' + employeeId,
    key,
    d,
    async () => {
      await requireHR(a, true);
      await employeeRow(a, employeeId);
    },
    async () => {
      const rows = await dbAll(
          'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? AND parent_id=? ORDER BY created_at DESC,id LIMIT 1',
          [a.org, a.environment, privateProfileKind, employeeId],
        ),
        old = rows[0] ? decode(a, rows[0]) : null;
      if ((old?.version || 0) !== d.expected_version)
        fail(409, 'Private employee profile changed; reload');
      return old
        ? update(a, old, d, {}, 'private_profile_updated')
        : insert(a, privateProfileKind, d, {
            root: employeeId,
            parent: employeeId,
            status: 'private',
          });
    },
  );
}

export async function employeeResumeEntries(a: Access, employeeId: string) {
  const c = await requireSelfOrHR(a, employeeId),
    rows = await employeeRows(a, employeeId, 'employee_resume_entry');
  return {
    data: rows
      .filter((row) => row.status === 'active')
      .map((row) => safeEmployeeResource(decode(a, row))),
    has_more: rows.length > 500,
    notice:
      c.hr_view || c.self
        ? 'Professional history is private to the employee and authorized HR.'
        : '',
  };
}

export async function saveEmployeeResumeEntry(
  a: Access,
  employeeId: string,
  entryId: string | null,
  input: unknown,
  key: string,
) {
  const d = employeeResumeInput.parse(input);
  return operation(
    a,
    'people.resume:' + employeeId + ':' + String(entryId || 'new'),
    key,
    d,
    async () => {
      const c = await employeeWriteAccess(a, employeeId);
      if (entryId) await read(a, entryId, 'employee_resume_entry');
    },
    async () => {
      const c = await employeeWriteAccess(a, employeeId),
        old = entryId ? await read(a, entryId, 'employee_resume_entry') : null;
      if (old && (old.root_id !== employeeId || old.version !== d.expected_version))
        fail(409, 'Resume entry changed or does not belong to this employee');
      if (!old && d.expected_version !== 0) fail(409, 'Reload before creating a resume entry');
      return old
        ? update(a, old, d)
        : insert(a, 'employee_resume_entry', d, { root: employeeId, parent: employeeId });
    },
  );
}

export async function employeeSkillRecords(a: Access, employeeId: string) {
  await requireSelfOrHR(a, employeeId);
  const rows = await employeeRows(a, employeeId, 'employee_skill');
  return {
    data: rows
      .filter((row) => row.status === 'active')
      .map((row) => safeEmployeeResource(decode(a, row))),
    has_more: rows.length > 500,
  };
}

export async function saveEmployeeSkillRecord(
  a: Access,
  employeeId: string,
  skillRecordId: string | null,
  input: unknown,
  key: string,
) {
  const d = employeeSkillInput.parse(input);
  return operation(
    a,
    'people.employee_skill:' + employeeId + ':' + String(skillRecordId || d.skill_id),
    key,
    d,
    async () => {
      const c = await employeeWriteAccess(a, employeeId);
      if (d.verified && !c.hr_write) fail(403, 'Only HR may verify a recorded skill');
      await read(a, d.skill_id, 'people_skill');
    },
    async () => {
      const c = await employeeWriteAccess(a, employeeId),
        old = skillRecordId ? await read(a, skillRecordId, 'employee_skill') : null;
      if (d.verified && !c.hr_write) fail(403, 'Only HR may verify a recorded skill');
      const skill = await read(a, d.skill_id, 'people_skill');
      if (skill.status !== 'active') fail(400, 'Choose an active skill');
      if (old && (old.root_id !== employeeId || old.version !== d.expected_version))
        fail(409, 'Employee skill changed or belongs to another employee');
      if (
        !old &&
        (await dbGet(
          "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='employee_skill' AND root_id=? AND parent_id=? AND status='active'",
          [a.org, a.environment, employeeId, skill.id],
        ))
      )
        fail(409, 'This skill is already recorded for the employee');
      const data = { ...d, skill_name: skill.data.name, verified: !!d.verified && c.hr_write };
      return old
        ? update(a, old, data)
        : insert(a, 'employee_skill', data, { root: employeeId, parent: skill.id });
    },
  );
}

export async function employeeCertifications(a: Access, employeeId: string) {
  await requireSelfOrHR(a, employeeId);
  const rows = await employeeRows(a, employeeId, 'employee_certification');
  return {
    data: rows
      .filter((row) => row.status === 'active')
      .map((row) => safeEmployeeResource(decode(a, row))),
    has_more: rows.length > 500,
  };
}

export async function saveEmployeeCertification(
  a: Access,
  employeeId: string,
  certificationId: string | null,
  input: unknown,
  key: string,
) {
  const d = employeeCertificationInput.parse(input);
  return operation(
    a,
    'people.certification:' + employeeId + ':' + String(certificationId || 'new'),
    key,
    d,
    async () => {
      await requireHR(a, true);
      await employeeRow(a, employeeId);
    },
    async () => {
      const old = certificationId ? await read(a, certificationId, 'employee_certification') : null;
      if (old && (old.root_id !== employeeId || old.version !== d.expected_version))
        fail(409, 'Certification changed or belongs to another employee');
      if (!old && d.expected_version !== 0) fail(409, 'Reload before creating a certification');
      return old
        ? update(a, old, d)
        : insert(a, 'employee_certification', d, { root: employeeId, parent: employeeId });
    },
  );
}

export async function peopleLeaveCalendar(a: Access, input: unknown) {
  const q = dates
      .extend({
        employee_id: z.string().uuid().optional(),
        department_id: z.string().uuid().optional(),
        leave_type_id: z.string().uuid().optional(),
        status: z.enum(['approved', 'pending']).optional(),
      })
      .strict()
      .parse(input),
    c = await peopleContext(a),
    own = await dbGet(
      "SELECT employee_id FROM ac_people_employees WHERE org_id=? AND environment=? AND linked_user_id=? AND status='active'",
      [a.org, a.environment, a.actor],
    ),
    filter = c.hr_view
      ? { sql: '1=1', params: [] as unknown[] }
      : c.policy.share_leave_calendar_with_managers
        ? employeeVisibility(a, c, 'leave', 'e')
        : own
          ? { sql: 'e.linked_user_id=?', params: [a.actor] as unknown[] }
          : { sql: '1=0', params: [] as unknown[] };
  if (!c.hr_view && !own && !c.policy.share_leave_calendar_with_managers)
    fail(403, 'Leave calendar visibility is not enabled for this account');
  if (q.employee_id) {
    const access = await employeeAccess(a, q.employee_id, 'leave');
    if (!c.hr_view && !access.self && !c.policy.share_leave_calendar_with_managers)
      fail(404, 'Employee not found');
  }
  if (Date.parse(q.to + 'T00:00:00Z') - Date.parse(q.from + 'T00:00:00Z') > 366 * 86400000)
    fail(400, 'Use a calendar range of at most one year');
  const rows = await dbAll(
    'SELECT o.*,r.employee_id,r.leave_type_id,r.from_on,r.to_on,r.units_milli,r.status AS request_status,e.linked_user_id,e.department_id FROM ac_people_leave_requests r JOIN ac_people_employees e ON e.employee_id=r.employee_id AND e.org_id=r.org_id AND e.environment=r.environment JOIN ac_erp_objects o ON o.id=r.request_id AND o.org_id=r.org_id AND o.environment=r.environment WHERE r.org_id=? AND r.environment=? AND ' +
      filter.sql +
      " AND r.from_on<=? AND r.to_on>=? AND r.status IN ('approved','pending')" +
      (q.employee_id ? ' AND r.employee_id=?' : '') +
      (q.department_id ? ' AND e.department_id=?' : '') +
      (q.leave_type_id ? ' AND r.leave_type_id=?' : '') +
      (q.status ? ' AND r.status=?' : '') +
      ' ORDER BY r.from_on,r.to_on,r.request_id LIMIT 1001',
    [
      a.org,
      a.environment,
      ...filter.params,
      q.to,
      q.from,
      ...(q.employee_id ? [q.employee_id] : []),
      ...(q.department_id ? [q.department_id] : []),
      ...(q.leave_type_id ? [q.leave_type_id] : []),
      ...(q.status ? [q.status] : []),
    ],
  );
  const data = await Promise.all(
      rows.slice(0, 1000).map(async (row) => {
        const record = decode(a, row),
          employeeRowData = await dbGet(
            "SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind='employee'",
            [row.employee_id, a.org, a.environment],
          );
        if (!employeeRowData) return null;
        const employee = decode(a, employeeRowData),
          personal = c.hr_view || row.linked_user_id === a.actor,
          type = personal ? await read(a, row.leave_type_id, 'leave_type').catch(() => null) : null;
        return {
          id: record.id,
          version: record.version,
          from: row.from_on,
          to: row.to_on,
          units_milli: Number(row.units_milli),
          status: row.request_status,
          employee_id: row.employee_id,
          employee_name: employee.data.name,
          leave_type_id: personal ? row.leave_type_id : null,
          label: personal ? type?.data.name || 'Planned absence' : 'Planned absence',
          department_id: row.department_id,
          reason: personal ? record.data.reason : undefined,
        };
      }),
    ),
    holidays = c.policy.holidays
      .filter((holiday: any) => holiday.date >= q.from && holiday.date <= q.to)
      .map((holiday: any) => ({ ...holiday, status: 'holiday' }));
  return {
    period: q,
    timezone: c.policy.timezone || 'Africa/Nairobi',
    data: data.filter(Boolean),
    holidays,
    total: rows.length,
    truncated: rows.length > 1000,
    notice:
      'Calendar entries show dates and status only. Private leave reasons and medical details are never exposed to other employees.',
  };
}

export async function peopleAttendanceAnalysis(a: Access, input: unknown) {
  const q = dates
      .extend({
        employee_id: z.string().uuid().optional(),
        status: z.enum(['open', 'closed']).optional(),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
      })
      .strict()
      .parse(input),
    c = await requireHR(a);
  if (q.from > q.to || Date.parse(q.to) - Date.parse(q.from) > 92 * 86400000)
    fail(400, 'Use an ordered attendance period of at most 93 days');
  const { from, to } = peopleDateBoundsUtc(q.from, q.to, c.policy.timezone);
  const rows = await dbAll(
    'SELECT o.*,r.employee_id,r.check_in,r.check_out,r.status AS attendance_status,r.source,r.superseded_by,e.department_id FROM ac_people_attendance r JOIN ac_people_employees e ON e.employee_id=r.employee_id AND e.org_id=r.org_id AND e.environment=r.environment JOIN ac_erp_objects o ON o.id=r.id AND o.org_id=r.org_id AND o.environment=r.environment WHERE r.org_id=? AND r.environment=? AND r.superseded_by IS NULL AND r.check_in>=? AND r.check_in<?' +
      (q.employee_id ? ' AND r.employee_id=?' : '') +
      (q.status ? ' AND r.status=?' : '') +
      ' ORDER BY r.check_in DESC,r.id DESC LIMIT 51 OFFSET ?',
    [
      a.org,
      a.environment,
      from,
      to,
      ...(q.employee_id ? [q.employee_id] : []),
      ...(q.status ? [q.status] : []),
      q.offset,
    ],
  );
  const data = await Promise.all(
    rows.slice(0, 50).map(async (row) => {
      const record = decode(a, row),
        employeeRowData = await dbGet(
          "SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind='employee'",
          [row.employee_id, a.org, a.environment],
        );
      const employee = employeeRowData ? decode(a, employeeRowData) : null;
      return {
        id: record.id,
        version: record.version,
        employee_id: row.employee_id,
        employee_name: employee?.data.name || 'Employee',
        department_id: row.department_id,
        check_in: row.check_in,
        check_out: row.check_out,
        status: row.attendance_status,
        source: row.source,
        schedule_review: attendanceScheduleReview(row.check_in, row.check_out, c.policy),
        duration_seconds: row.check_out
          ? Math.max(0, Math.floor((Date.parse(row.check_out) - Date.parse(row.check_in)) / 1000))
          : null,
        exception:
          row.attendance_status === 'open' &&
          peopleDay(new Date(row.check_in), c.policy.timezone) < q.to
            ? 'missing_check_out_review'
            : null,
      };
    }),
  );
  const total = Number(
    (
      await dbGet(
        'SELECT COUNT(*) AS n FROM ac_people_attendance WHERE org_id=? AND environment=? AND superseded_by IS NULL AND check_in>=? AND check_in<?' +
          (q.employee_id ? ' AND employee_id=?' : '') +
          (q.status ? ' AND status=?' : ''),
        [
          a.org,
          a.environment,
          from,
          to,
          ...(q.employee_id ? [q.employee_id] : []),
          ...(q.status ? [q.status] : []),
        ],
      )
    )?.n || 0,
  );
  const summaryRows = await dbAll(
    'SELECT check_in,check_out,status,source FROM ac_people_attendance WHERE org_id=? AND environment=? AND superseded_by IS NULL AND check_in>=? AND check_in<?' +
      (q.employee_id ? ' AND employee_id=?' : '') +
      (q.status ? ' AND status=?' : '') +
      ' ORDER BY check_in DESC,id DESC LIMIT 10001',
    [
      a.org,
      a.environment,
      from,
      to,
      ...(q.employee_id ? [q.employee_id] : []),
      ...(q.status ? [q.status] : []),
    ],
  );
  if (summaryRows.length > 10000)
    fail(
      409,
      'Narrow the attendance period to 10,000 records or fewer for an exact duration summary',
    );
  return {
    period: { from: q.from, to: q.to },
    data,
    total,
    offset: q.offset,
    has_more: q.offset + data.length < total,
    summary: {
      sessions: total,
      open_sessions: summaryRows.filter((record) => record.status === 'open').length,
      missing_checkout_reviews: summaryRows.filter(
        (record) =>
          record.status === 'open' &&
          peopleDay(new Date(record.check_in), c.policy.timezone) < q.to,
      ).length,
      schedule_reviews: summaryRows.filter(
        (record) => !!attendanceScheduleReview(record.check_in, record.check_out, c.policy),
      ).length,
      corrected_current_records: summaryRows.filter((record) => record.source === 'hr_correction')
        .length,
      recorded_seconds: summaryRows.reduce(
        (sum, record) =>
          sum +
          (record.check_out
            ? Math.max(
                0,
                Math.floor((Date.parse(record.check_out) - Date.parse(record.check_in)) / 1000),
              )
            : 0),
        0,
      ),
    },
    schedules: c.policy.working_hours
      ? { configured: true, timezone: c.policy.timezone }
      : {
          configured: false,
          notice:
            'No work hours are configured; schedule-based absence or overtime findings are unavailable.',
        },
    notice:
      'Attendance exceptions require human review and do not establish misconduct, overtime entitlement, payroll, location or biometrics. Current reports cannot reconstruct past schedule revisions.',
  };
}

const resourceRows = (a: Access, kind: string, limit = 1001) =>
  dbAll(
    'SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=? ORDER BY created_at DESC,id LIMIT ?',
    [a.org, a.environment, kind, limit],
  );

export async function recruitmentOpenings(a: Access) {
  const c = await requireRecruitment(a),
    rows = await resourceRows(a, 'people_recruitment_opening');
  const data = await Promise.all(
    rows.slice(0, 500).map(async (row) => {
      const opening = decode(a, row),
        position = await read(a, opening.data.position_id, 'people_position').catch(() => null),
        apps = await dbGet(
          "SELECT COUNT(*) AS n FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='people_application' AND root_id=? AND status='active'",
          [a.org, a.environment, opening.id],
        );
      return {
        ...safeEmployeeResource(opening),
        position_title: position?.data.title || 'Position unavailable',
        department_id: position?.data.department_id || null,
        applicant_count: Number(apps?.n || 0),
        can_manage: c.recruitment_write,
      };
    }),
  );
  return { data, has_more: rows.length > 500, limit: 500 };
}

export async function saveRecruitmentOpening(
  a: Access,
  openingId: string | null,
  input: unknown,
  key: string,
) {
  const d = openingInput.parse(input);
  return operation(
    a,
    'people.opening:' + String(openingId || 'new'),
    key,
    d,
    () => requireRecruitment(a, true),
    async () => {
      const c = await requireRecruitment(a, true),
        old = openingId ? await read(a, openingId, 'people_recruitment_opening') : null,
        position = await read(a, d.position_id, 'people_position'),
        recruiter = await employeeRow(a, d.recruiter_id);
      if (!c.settings) fail(409, 'Review People policy before opening a position');
      if (position.status !== 'active') fail(400, 'Choose an active job position');
      if (!['active', 'onboarding'].includes(recruiter.status))
        fail(400, 'Choose a current recruiter');
      if (!c.hr_write && !c.admin) {
        const own = await dbGet(
          "SELECT employee_id FROM ac_people_employees WHERE org_id=? AND environment=? AND linked_user_id=? AND status='active'",
          [a.org, a.environment, a.actor],
        );
        if (!own || own.employee_id !== d.recruiter_id)
          fail(403, 'Recruiters may manage only openings assigned to their employee profile');
      }
      if ((old?.version || 0) !== d.expected_version)
        fail(409, 'Recruitment opening changed; reload');
      if (
        old &&
        old.data.position_id !== d.position_id &&
        (await dbGet(
          "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='people_application' AND root_id=? AND stage NOT IN ('rejected','hired') LIMIT 1",
          [a.org, a.environment, old.id],
        ))
      )
        fail(409, 'An opening with active applicants cannot change position');
      const data = { ...d, position_title: position.data.title };
      return old
        ? update(a, old, data, { status: d.status === 'open' ? 'open' : d.status, stage: d.status })
        : insert(a, 'people_recruitment_opening', data, {
            root: c.settings!.id,
            parent: position.id,
            status: d.status,
            stage: d.status,
          });
    },
  );
}

export async function recruitmentCandidates(a: Access, input: unknown = {}) {
  await requireRecruitment(a);
  const q = z
      .object({
        q: z.string().trim().max(100).optional(),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
      })
      .strict()
      .parse(input),
    rows = await resourceRows(a, 'people_candidate', 5001),
    query = q.q?.normalize('NFKC').toLowerCase() || '',
    values = rows.map((row) => decode(a, row));
  const filtered = values.filter(
      (candidate) =>
        !query ||
        [candidate.data.name, candidate.data.email, candidate.data.phone].some((v: string) =>
          String(v || '')
            .normalize('NFKC')
            .toLowerCase()
            .includes(query),
        ),
    ),
    total = filtered.length;
  return {
    data: filtered.slice(q.offset, q.offset + 50).map(safeEmployeeResource),
    total,
    offset: q.offset,
    has_more: q.offset + 50 < total,
    truncated: rows.length > 5000,
    limit: 50,
  };
}

export async function saveRecruitmentCandidate(
  a: Access,
  candidateId: string | null,
  input: unknown,
  key: string,
) {
  const d = candidateInput.parse(input);
  return operation(
    a,
    'people.candidate:' + String(candidateId || 'new'),
    key,
    d,
    () => requireRecruitment(a, true),
    async () => {
      const old = candidateId ? await read(a, candidateId, 'people_candidate') : null;
      if ((old?.version || 0) !== d.expected_version) fail(409, 'Candidate changed; reload');
      if (old?.data.employee_id)
        fail(409, 'A hired candidate record is retained and cannot be edited');
      const existing = await resourceRows(a, 'people_candidate', 5001);
      if (existing.length > 5000)
        fail(409, 'Candidate duplicate check limit reached; narrow the recruitment archive first');
      const email = d.email.normalize('NFKC').trim().toLowerCase(),
        phone = d.phone.replace(/[^0-9+]/g, '');
      if (
        existing.some((row) => {
          const v = decode(a, row);
          return (
            v.id !== candidateId &&
            ((email &&
              String(v.data.email || '')
                .normalize('NFKC')
                .trim()
                .toLowerCase() === email) ||
              (phone && String(v.data.phone || '').replace(/[^0-9+]/g, '') === phone))
          );
        })
      )
        fail(409, 'A candidate with this email or phone already exists');
      return old
        ? update(a, old, d)
        : insert(a, 'people_candidate', d, { root: a.org, status: 'active' });
    },
  );
}

export async function recruitmentApplications(a: Access, input: unknown = {}) {
  await requireRecruitment(a);
  const q = z
      .object({
        opening_id: z.string().uuid().optional(),
        stage: z
          .enum(['new', 'screening', 'interview', 'assessment', 'offer', 'hired', 'rejected'])
          .optional(),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
      })
      .strict()
      .parse(input),
    rows = await resourceRows(a, 'people_application', 5001),
    values = rows
      .map((row) => decode(a, row))
      .filter(
        (v) => (!q.opening_id || v.root_id === q.opening_id) && (!q.stage || v.stage === q.stage),
      );
  const data = await Promise.all(
    values.slice(q.offset, q.offset + 50).map(async (app) => {
      const candidate = await read(a, app.data.candidate_id, 'people_candidate'),
        opening = await read(a, app.root_id, 'people_recruitment_opening');
      return {
        ...safeEmployeeResource(app),
        candidate: {
          id: candidate.id,
          name: candidate.data.name,
          email: candidate.data.email,
          phone: candidate.data.phone,
        },
        opening: {
          id: opening.id,
          position_title: opening.data.position_title,
          status: opening.data.status,
        },
      };
    }),
  );
  return {
    data,
    total: values.length,
    offset: q.offset,
    has_more: q.offset + 50 < values.length,
    truncated: rows.length > 5000,
    limit: 50,
  };
}

export async function saveRecruitmentApplication(
  a: Access,
  applicationId: string | null,
  input: unknown,
  key: string,
) {
  const d = applicationInput.parse(input);
  return operation(
    a,
    'people.application:' + String(applicationId || 'new'),
    key,
    d,
    () => requireRecruitment(a, true),
    async () => {
      const c = await requireRecruitment(a, true),
        old = applicationId ? await read(a, applicationId, 'people_application') : null,
        candidate = await read(a, d.candidate_id, 'people_candidate'),
        opening = await read(a, d.opening_id, 'people_recruitment_opening'),
        recruiter = await employeeRow(a, d.recruiter_id);
      if (opening.data.status !== 'open' && !old)
        fail(409, 'Only an open position can receive a new application');
      if (candidate.data.employee_id) fail(409, 'This candidate is already linked to an employee');
      if (!['active', 'onboarding'].includes(recruiter.status))
        fail(400, 'Choose a current recruiter');
      if (!c.hr_write && !c.admin) {
        const own = await dbGet(
          "SELECT employee_id FROM ac_people_employees WHERE org_id=? AND environment=? AND linked_user_id=? AND status='active'",
          [a.org, a.environment, a.actor],
        );
        if (!own || own.employee_id !== d.recruiter_id)
          fail(403, 'Recruiters may manage only applications assigned to their employee profile');
      }
      if ((old?.version || 0) !== d.expected_version) fail(409, 'Application changed; reload');
      if (old && (old.root_id !== opening.id || old.data.candidate_id !== candidate.id))
        fail(400, 'Application candidate and opening cannot be reassigned');
      if (
        !old &&
        (await dbGet(
          "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='people_application' AND root_id=? AND parent_id=? AND status='active'",
          [a.org, a.environment, opening.id, candidate.id],
        ))
      )
        fail(409, 'This candidate already has an active application for the opening');
      const prev = old?.stage || 'new',
        next = d.stage,
        allowed: Record<string, string[]> = {
          new: ['new', 'screening', 'rejected'],
          screening: ['screening', 'interview', 'assessment', 'rejected'],
          interview: ['interview', 'assessment', 'offer', 'rejected'],
          assessment: ['assessment', 'offer', 'rejected'],
          offer: ['offer', 'hired', 'rejected'],
          hired: ['hired'],
          rejected: ['rejected'],
        };
      if (!allowed[prev]?.includes(next))
        fail(409, 'Application stages must move forward through the recruitment pipeline');
      const data = {
        ...d,
        opening_title: opening.data.position_title,
        candidate_name: candidate.data.name,
        employee_id: old?.data.employee_id || null,
      };
      return old
        ? update(a, old, data, { stage: next, status: next === 'rejected' ? 'archived' : 'active' })
        : insert(a, 'people_application', data, {
            root: opening.id,
            parent: candidate.id,
            stage: next,
            status: next === 'rejected' ? 'archived' : 'active',
          });
    },
  );
}

export async function hireRecruitmentCandidate(
  a: Access,
  applicationId: string,
  input: unknown,
  key: string,
) {
  const d = hireCandidateInput.parse(input);
  return operation(
    a,
    'people.hire:' + applicationId,
    key,
    d,
    async () => {
      await requireRecruitment(a, true);
      await requireHR(a, true);
    },
    async () => {
      const c = await requireRecruitment(a, true);
      await requireHR(a, true);
      const app = await read(a, applicationId, 'people_application');
      if (app.version !== d.expected_version)
        fail(409, 'Application changed; reload before hiring');
      if (app.stage !== 'offer' && app.stage !== 'hired')
        fail(409, 'Move the applicant to Offer before hiring');
      if (app.data.employee_id)
        return { status: 'already_hired', employee_id: app.data.employee_id };
      const candidate = await read(a, app.data.candidate_id, 'people_candidate'),
        opening = await read(a, app.root_id, 'people_recruitment_opening'),
        position = await read(a, opening.data.position_id, 'people_position');
      if (candidate.data.employee_id) fail(409, 'Candidate is already linked to an employee');
      const employee = await saveEmployee(
        a,
        null,
        {
          expected_version: 0,
          employee_number: d.employee_number,
          name: candidate.data.name,
          job_title: position.data.title,
          position_id: position.id,
          department_id: position.data.department_id || null,
          manager_id: d.manager_id,
          linked_user_id: d.linked_user_id,
          self_service: false,
          work_email: candidate.data.email || '',
          work_phone: candidate.data.phone || '',
          start_on: d.start_on,
          status: 'onboarding',
          hr_notes: '',
        },
        'hire-employee-' + hash(key).slice(0, 40),
      );
      await update(
        a,
        app,
        { ...app.data, stage: 'hired', employee_id: employee.id },
        { stage: 'hired', status: 'active' },
        'candidate_hired',
      );
      await update(
        a,
        candidate,
        { ...candidate.data, employee_id: employee.id, hired_on: now().slice(0, 10) },
        { status: 'hired' },
        'candidate_hired',
      );
      return { status: 'hired', employee_id: employee.id, application_id: applicationId, employee };
    },
  );
}

function appraisalProjection(
  record: ERPObject,
  c: Awaited<ReturnType<typeof peopleContext>>,
  self: boolean,
) {
  const data = { ...record.data };
  if (!c.hr_view) delete data.private_manager_notes;
  if (self) {
    const feedback = c.policy.share_appraisal_feedback && record.data.state === 'completed';
    for (const field of [
      'manager_assessment',
      'skills_development',
      'feedback',
      'private_manager_notes',
      'reviewer_id',
    ])
      if (!feedback || field === 'private_manager_notes') delete data[field];
  }
  return { ...safeEmployeeResource({ ...record, data }), data };
}

export async function peopleGoals(a: Access, input: unknown = {}) {
  const c = await peopleContext(a),
    q = z
      .object({
        employee_id: z.string().uuid().optional(),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
      })
      .strict()
      .parse(input);
  const own = await dbGet(
      'SELECT employee_id FROM ac_people_employees WHERE org_id=? AND environment=? AND linked_user_id=?',
      [a.org, a.environment, a.actor],
    ),
    employeeId = q.employee_id || (c.performance_view ? undefined : own?.employee_id);
  if (!c.performance_view && !own) fail(403, 'Performance visibility required');
  if (!c.performance_view && employeeId !== own?.employee_id) fail(404, 'Employee goals not found');
  const rows = await resourceRows(a, 'people_goal', 5001),
    values = rows
      .map((r) => decode(a, r))
      .filter((v) => !employeeId || v.data.employee_id === employeeId);
  return {
    data: values.slice(q.offset, q.offset + 50).map(safeEmployeeResource),
    total: values.length,
    offset: q.offset,
    has_more: q.offset + 50 < values.length,
    limit: 50,
  };
}

export async function savePeopleGoal(
  a: Access,
  goalId: string | null,
  input: unknown,
  key: string,
) {
  const d = goalInput.parse(input);
  return operation(
    a,
    'people.goal:' + String(goalId || 'new'),
    key,
    d,
    () => requirePerformance(a, true),
    async () => {
      const c = await requirePerformance(a, true),
        old = goalId ? await read(a, goalId, 'people_goal') : null,
        employee = await employeeRow(a, d.employee_id);
      if (!c.settings) fail(409, 'Review People policy before creating goals');
      if (!['active', 'onboarding'].includes(employee.status))
        fail(400, 'Goals can only be assigned to current employees');
      if ((old?.version || 0) !== d.expected_version) fail(409, 'Goal changed; reload');
      if (old && old.data.employee_id !== d.employee_id)
        fail(400, 'A goal cannot be reassigned to another employee');
      for (const skillId of d.skill_ids)
        if ((await read(a, skillId, 'people_skill')).status !== 'active')
          fail(400, 'Choose active skills for this goal');
      if (d.work_task_id) {
        const task = await read(a, d.work_task_id, 'work_task');
        await authorize(a, 'work', task.root_id);
      }
      const data = { ...d };
      return old
        ? update(a, old, data, { status: d.status })
        : insert(a, 'people_goal', data, {
            root: c.settings!.id,
            parent: d.employee_id,
            status: d.status,
          });
    },
  );
}

export async function updateOwnGoalProgress(
  a: Access,
  goalId: string,
  input: unknown,
  key: string,
) {
  const d = goalProgressInput.parse(input);
  return operation(
    a,
    'people.goal_progress:' + goalId,
    key,
    d,
    async () => {
      const goal = await read(a, goalId, 'people_goal'),
        own = await dbGet(
          'SELECT employee_id FROM ac_people_employees WHERE org_id=? AND environment=? AND linked_user_id=?',
          [a.org, a.environment, a.actor],
        );
      if (!own || goal.data.employee_id !== own.employee_id) fail(404, 'Goal not found');
      await employeeAccess(a, own.employee_id, 'self_write');
    },
    async () => {
      const goal = await read(a, goalId, 'people_goal'),
        own = await dbGet(
          'SELECT employee_id FROM ac_people_employees WHERE org_id=? AND environment=? AND linked_user_id=?',
          [a.org, a.environment, a.actor],
        );
      if (!own || goal.data.employee_id !== own.employee_id || goal.version !== d.expected_version)
        fail(409, 'Goal changed or is unavailable');
      await employeeAccess(a, own.employee_id, 'self_write');
      return safeEmployeeResource(await update(a, goal, { ...goal.data, progress: d.progress }));
    },
  );
}

export async function peopleAppraisals(a: Access, input: unknown = {}) {
  const c = await peopleContext(a),
    q = z
      .object({
        employee_id: idInput.optional(),
        state: z
          .enum(['draft', 'scheduled', 'in_progress', 'pending_review', 'completed', 'cancelled'])
          .optional(),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
      })
      .strict()
      .parse(input),
    own = await dbGet(
      'SELECT employee_id FROM ac_people_employees WHERE org_id=? AND environment=? AND linked_user_id=?',
      [a.org, a.environment, a.actor],
    );
  if (!c.performance_view && !own) fail(403, 'Performance visibility required');
  const rows = await resourceRows(a, 'people_appraisal', 5001),
    values = rows
      .map((r) => decode(a, r))
      .filter(
        (v) =>
          (!q.employee_id || v.data.employee_id === q.employee_id) &&
          (!q.state || v.data.state === q.state) &&
          (c.performance_view || v.data.employee_id === own?.employee_id),
      );
  return {
    data: values
      .slice(q.offset, q.offset + 50)
      .map((v) => appraisalProjection(v, c, !c.performance_view)),
    total: values.length,
    offset: q.offset,
    has_more: q.offset + 50 < values.length,
    limit: 50,
  };
}

export async function savePeopleAppraisal(
  a: Access,
  appraisalId: string | null,
  input: unknown,
  key: string,
) {
  const d = appraisalInput.parse(input);
  return operation(
    a,
    'people.appraisal:' + String(appraisalId || 'new'),
    key,
    d,
    () => requirePerformance(a, true),
    async () => {
      const c = await requirePerformance(a, true),
        old = appraisalId ? await read(a, appraisalId, 'people_appraisal') : null,
        employee = await employeeRow(a, d.employee_id),
        reviewer = await employeeRow(a, d.reviewer_id);
      if (!['active', 'onboarding'].includes(employee.status) || reviewer.status !== 'active')
        fail(400, 'Choose a current employee and active reviewer');
      if ((old?.version || 0) !== d.expected_version) fail(409, 'Appraisal changed; reload');
      if (old && old.data.employee_id !== d.employee_id)
        fail(400, 'An appraisal cannot be reassigned to another employee');
      if (!c.settings) fail(409, 'Review People policy before creating appraisals');
      if (old) {
        const transitions: Record<string, string[]> = {
          draft: ['draft', 'scheduled', 'cancelled'],
          scheduled: ['scheduled', 'in_progress', 'cancelled'],
          in_progress: ['in_progress', 'pending_review', 'cancelled'],
          pending_review: ['pending_review', 'completed', 'cancelled'],
          completed: ['completed'],
          cancelled: ['cancelled'],
        };
        if (!transitions[old.data.state]?.includes(d.state))
          fail(409, 'Appraisal state must move through the review workflow');
      } else if (!['draft', 'scheduled'].includes(d.state))
        fail(400, 'A new appraisal must start as Draft or Scheduled');
      for (const goalId of d.goal_ids) {
        const goal = await read(a, goalId, 'people_goal');
        if (goal.data.employee_id !== d.employee_id)
          fail(400, 'Appraisal goals must belong to the reviewed employee');
      }
      const data = {
        ...d,
        private_manager_notes: c.hr_view
          ? d.private_manager_notes
          : old?.data.private_manager_notes || '',
      };
      const saved = old
        ? await update(a, old, data, { status: d.state, stage: d.state })
        : await insert(a, 'people_appraisal', data, {
            root: c.settings!.id,
            parent: d.employee_id,
            status: d.state,
            stage: d.state,
          });
      return appraisalProjection(saved, c, false);
    },
  );
}

export async function submitAppraisalSelfAssessment(
  a: Access,
  appraisalId: string,
  input: unknown,
  key: string,
) {
  const d = appraisalSelfInput.parse(input);
  return operation(
    a,
    'people.appraisal_self:' + appraisalId,
    key,
    d,
    async () => {
      const record = await read(a, appraisalId, 'people_appraisal'),
        own = await dbGet(
          'SELECT employee_id FROM ac_people_employees WHERE org_id=? AND environment=? AND linked_user_id=?',
          [a.org, a.environment, a.actor],
        );
      if (!own || record.data.employee_id !== own.employee_id) fail(404, 'Appraisal not found');
      await employeeAccess(a, own.employee_id, 'self_write');
    },
    async () => {
      const record = await read(a, appraisalId, 'people_appraisal'),
        own = await dbGet(
          'SELECT employee_id FROM ac_people_employees WHERE org_id=? AND environment=? AND linked_user_id=?',
          [a.org, a.environment, a.actor],
        );
      if (
        !own ||
        record.data.employee_id !== own.employee_id ||
        record.version !== d.expected_version
      )
        fail(409, 'Appraisal changed or is unavailable');
      if (!['scheduled', 'in_progress'].includes(record.data.state))
        fail(409, 'Self assessment is not open for this review');
      await employeeAccess(a, own.employee_id, 'self_write');
      const saved = await update(
        a,
        record,
        { ...record.data, self_assessment: d.self_assessment, state: 'pending_review' },
        { stage: 'pending_review', status: 'pending_review' },
        'self_assessment_submitted',
      );
      return appraisalProjection(saved, await peopleContext(a), true);
    },
  );
}

export async function peopleLifecyclePlans(a: Access) {
  await requireHR(a);
  const rows = await resourceRows(a, 'people_lifecycle_plan', 501);
  return {
    data: rows.slice(0, 500).map((r) => safeEmployeeResource(decode(a, r))),
    has_more: rows.length > 500,
    limit: 500,
  };
}

export async function savePeopleLifecyclePlan(
  a: Access,
  planId: string | null,
  input: unknown,
  key: string,
) {
  const d = lifecyclePlanInput.parse(input);
  return operation(
    a,
    'people.lifecycle_plan:' + String(planId || 'new'),
    key,
    d,
    () => requireHR(a, true),
    async () => {
      const c = await requireHR(a, true),
        old = planId ? await read(a, planId, 'people_lifecycle_plan') : null;
      if ((old?.version || 0) !== d.expected_version) fail(409, 'Lifecycle plan changed; reload');
      if (d.department_id && (await read(a, d.department_id, 'department')).status !== 'active')
        fail(400, 'Choose an active department');
      if (d.position_id && (await read(a, d.position_id, 'people_position')).status !== 'active')
        fail(400, 'Choose an active position');
      const rows = await resourceRows(a, 'people_lifecycle_plan', 501);
      if (
        rows
          .map((r) => decode(a, r))
          .some(
            (p) =>
              p.id !== planId &&
              p.data.name.normalize('NFKC').toLowerCase() ===
                d.name.normalize('NFKC').toLowerCase(),
          )
      )
        fail(409, 'Lifecycle plan name already exists');
      return old
        ? update(a, old, d, { status: d.active ? 'active' : 'archived' })
        : insert(a, 'people_lifecycle_plan', d, {
            root: c.settings?.id || a.org,
            status: d.active ? 'active' : 'archived',
          });
    },
  );
}

export async function peopleLifecycleCases(a: Access, input: unknown = {}) {
  await requireHR(a);
  const q = z
      .object({
        employee_id: idInput.optional(),
        status: z.enum(['open', 'completed', 'cancelled']).optional(),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
      })
      .strict()
      .parse(input),
    rows = await resourceRows(a, 'people_lifecycle_case', 5001),
    values = rows
      .map((r) => decode(a, r))
      .filter(
        (v) =>
          (!q.employee_id || v.root_id === q.employee_id) && (!q.status || v.status === q.status),
      );
  return {
    data: values.slice(q.offset, q.offset + 50).map(safeEmployeeResource),
    total: values.length,
    offset: q.offset,
    has_more: q.offset + 50 < values.length,
    limit: 50,
  };
}

export async function startPeopleLifecycleCase(a: Access, input: unknown, key: string) {
  const d = lifecycleCaseInput.parse(input);
  return operation(
    a,
    'people.lifecycle_case:new:' + d.employee_id,
    key,
    d,
    () => requireHR(a, true),
    async () => {
      const c = await requireHR(a, true),
        employee = await employeeRow(a, d.employee_id),
        plan = await read(a, d.plan_id, 'people_lifecycle_plan');
      if (!plan.data.active) fail(400, 'Choose an active lifecycle plan');
      if (
        (plan.data.direction === 'onboarding' && employee.status !== 'onboarding') ||
        (plan.data.direction === 'offboarding' && employee.status !== 'active')
      )
        fail(400, 'Lifecycle plan does not match the current employee status');
      const existing = await employeeRows(a, d.employee_id, 'people_lifecycle_case');
      if (existing.some((r) => r.status === 'open'))
        fail(409, 'An open lifecycle case already exists for this employee');
      const tasks = plan.data.tasks.map((task: any, index: number) => ({
        index,
        title: task.title,
        due_on: new Date(
          Date.parse(d.effective_on + 'T00:00:00Z') + task.due_offset_days * 86400000,
        )
          .toISOString()
          .slice(0, 10),
        done: false,
        note: '',
      }));
      const data = {
        ...d,
        direction: plan.data.direction,
        plan_name: plan.data.name,
        tasks,
        opened_at: now(),
      };
      return insert(a, 'people_lifecycle_case', data, {
        root: d.employee_id,
        parent: plan.id,
        status: 'open',
        stage: plan.data.direction,
      });
    },
  );
}

export async function updatePeopleLifecycleTask(
  a: Access,
  caseId: string,
  input: unknown,
  key: string,
) {
  const d = lifecycleTaskInput.parse(input);
  return operation(
    a,
    'people.lifecycle_task:' + caseId + ':' + d.task_index,
    key,
    d,
    () => requireHR(a, true),
    async () => {
      const record = await read(a, caseId, 'people_lifecycle_case');
      if (record.version !== d.expected_version || record.status !== 'open')
        fail(409, 'Lifecycle case changed or is closed');
      const tasks = [...record.data.tasks];
      if (!tasks[d.task_index]) fail(404, 'Lifecycle task not found');
      tasks[d.task_index] = { ...tasks[d.task_index], done: d.done, note: d.note };
      return update(a, record, { ...record.data, tasks });
    },
  );
}

export async function completePeopleLifecycleCase(
  a: Access,
  caseId: string,
  input: unknown,
  key: string,
) {
  const d = lifecycleCompleteInput.parse(input);
  return operation(
    a,
    'people.lifecycle_complete:' + caseId,
    key,
    d,
    () => requireHR(a, true),
    async () => {
      const record = await read(a, caseId, 'people_lifecycle_case');
      if (record.version !== d.expected_version || record.status !== 'open')
        fail(409, 'Lifecycle case changed or is closed');
      if (record.data.tasks.some((t: any) => !t.done))
        fail(409, 'Complete every lifecycle task before closing this case');
      const employee = await read(a, record.root_id, 'employee'),
        status = record.data.direction === 'offboarding' ? 'inactive' : 'active',
        { onboarding_projects: _onboardingProjects, ...employeeData } = employee.data;
      await saveEmployee(
        a,
        employee.id,
        { ...employeeData, expected_version: employee.version, status },
        'lifecycle-employee-' + hash(key).slice(0, 40),
      );
      return update(
        a,
        record,
        { ...record.data, completed_at: now() },
        { status: 'completed', stage: 'completed' },
        'lifecycle_completed',
      );
    },
  );
}

export async function peopleExpansionReport(a: Access, input: unknown) {
  const c = await requireHR(a),
    q = dates.parse(input),
    today = q.to,
    { from, to } = peopleDateBoundsUtc(q.from, q.to, c.policy.timezone),
    currentDay = peopleDay(new Date(), c.policy.timezone),
    currentBounds = peopleDateBoundsUtc(currentDay, currentDay, c.policy.timezone);
  const count = async (kind: string, where: string = '', params: unknown[] = []) =>
      Number(
        (
          await dbGet(
            'SELECT COUNT(*) AS n FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind=?' +
              where,
            [a.org, a.environment, kind, ...params],
          )
        )?.n || 0,
      ),
    activePositions = await count('people_position', " AND status='active'"),
    openings = await count('people_recruitment_opening', " AND status='open'"),
    activeApplicants = await count(
      'people_application',
      " AND stage NOT IN ('hired','rejected') AND status='active'",
    ),
    hires = await count(
      'people_application',
      " AND stage='hired' AND updated_at>=? AND updated_at<?",
      [from, to],
    ),
    pendingReviews = await count(
      'people_appraisal',
      " AND stage IN ('scheduled','in_progress','pending_review')",
    ),
    completedReviews = await count(
      'people_appraisal',
      " AND stage='completed' AND updated_at>=? AND updated_at<?",
      [from, to],
    ),
    activeGoals = await count('people_goal', " AND status='active'"),
    openCases = await count('people_lifecycle_case', " AND status='open'"),
    completedCases = await count(
      'people_lifecycle_case',
      " AND status='completed' AND updated_at>=? AND updated_at<?",
      [from, to],
    ),
    certRows = await resourceRows(a, 'employee_certification', 5001),
    employeeStatuses = await dbAll(
      'SELECT status,COUNT(*) AS n FROM ac_people_employees WHERE org_id=? AND environment=? GROUP BY status',
      [a.org, a.environment],
    ),
    departmentRows = await dbAll(
      "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='department' AND status='active' ORDER BY id LIMIT 201",
      [a.org, a.environment],
    ),
    employeesByDepartment = await dbAll(
      "SELECT department_id,COUNT(*) AS n FROM ac_people_employees WHERE org_id=? AND environment=? AND status='active' AND department_id IS NOT NULL GROUP BY department_id",
      [a.org, a.environment],
    ),
    pendingLeaveRequests = Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac_people_leave_requests WHERE org_id=? AND environment=? AND status='pending'",
          [a.org, a.environment],
        )
      )?.n || 0,
    ),
    currentLeaveEmployees = Number(
      (
        await dbGet(
          "SELECT COUNT(DISTINCT employee_id) AS n FROM ac_people_leave_requests WHERE org_id=? AND environment=? AND status='approved' AND from_on<=? AND to_on>=?",
          [a.org, a.environment, currentDay, currentDay],
        )
      )?.n || 0,
    ),
    openAttendanceSessions = Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac_people_attendance WHERE org_id=? AND environment=? AND status='open' AND superseded_by IS NULL",
          [a.org, a.environment],
        )
      )?.n || 0,
    ),
    attendanceExceptions = Number(
      (
        await dbGet(
          "SELECT COUNT(*) AS n FROM ac_people_attendance WHERE org_id=? AND environment=? AND status='open' AND superseded_by IS NULL AND check_in<?",
          [a.org, a.environment, currentBounds.from],
        )
      )?.n || 0,
    );
  if (departmentRows.length > 200)
    fail(409, 'Department summary exceeds the configured limit of 200 departments');
  if (certRows.length > 5000)
    fail(409, 'Narrow the certification archive to 5,000 records for an exact expiry summary');
  const expiryLimit = new Date(Date.parse(today + 'T00:00:00Z') + 90 * 86400000)
      .toISOString()
      .slice(0, 10),
    expiring = certRows
      .map((r) => decode(a, r))
      .filter(
        (v) =>
          v.status === 'active' && v.data.expires_on >= today && v.data.expires_on <= expiryLimit,
      ).length;
  const statusCounts = Object.fromEntries(
      employeeStatuses.map((row) => [row.status, Number(row.n)]),
    ),
    departmentCounts = new Map(
      employeesByDepartment.map((row) => [row.department_id, Number(row.n)]),
    );
  return {
    period: q,
    workforce: {
      total_employees: Object.values(statusCounts).reduce<number>(
        (sum, value) => sum + Number(value),
        0,
      ),
      active_employees: statusCounts.active || 0,
      onboarding_employees: statusCounts.onboarding || 0,
      status_counts: statusCounts,
      active_by_department: departmentRows.map((row) => {
        const department = decode(a, row);
        return {
          id: department.id,
          name: department.data.name,
          active_employees: departmentCounts.get(department.id) || 0,
        };
      }),
      pending_leave_requests: pendingLeaveRequests,
      employees_on_approved_leave_today: currentLeaveEmployees,
      open_attendance_sessions: openAttendanceSessions,
      attendance_missing_checkout_reviews: attendanceExceptions,
    },
    positions: { active: activePositions },
    recruitment: { openings, applicants: activeApplicants, hired_in_period: hires },
    performance: {
      pending_reviews: pendingReviews,
      completed_reviews: completedReviews,
      active_goals: activeGoals,
    },
    lifecycle: { open_cases: openCases, completed_in_period: completedCases },
    certifications: { expiring_next_90_days: expiring },
    notice:
      'Employee totals remain current-state values. Hires, completed reviews and lifecycle completions are grouped by record update date in the selected period. Certification counts include recorded metadata only. Compensation is excluded.',
  };
}
