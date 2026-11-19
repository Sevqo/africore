import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet, dbRun, dbTransaction } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { now } from '../platform/crypto';
import { authorize, decode, insert, operation, read, update, type ERPObject } from './store';

const uuid = z.string().uuid();
const entryInput = z
  .object({
    project_id: uuid,
    task_id: uuid,
    work_date: z.string().date(),
    minutes: z.number().int().min(1).max(1440),
    description: z.string().trim().max(4000).default(''),
  })
  .strict();

async function projectFor(a: Access, projectId: string, write = false) {
  const p = await read(a, projectId, 'work_project');
  await authorize(a, 'work', p.id, write);
  return p;
}
async function taskFor(a: Access, projectId: string, taskId: string) {
  const task = await read(a, taskId, 'work_task');
  if (task.root_id !== projectId) fail(404, 'Task not found');
  return task;
}
async function manager(a: Access, p: ERPObject, write = true) {
  const role = await authorize(a, 'work', p.id, write);
  if (['owner', 'admin'].includes(role)) return;
  const grant = await dbGet(
    'SELECT permission FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=? AND user_id=?',
    [a.org, a.environment, p.id, a.actor],
  );
  if (grant?.permission !== 'manage') fail(403, 'Project management authority required');
}
function localDate(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}
function decodeEntry(a: Access, row: any) {
  return decode(a, row);
}
async function taskWritePermission(a: Access, p: ERPObject) {
  await projectFor(a, p.id, true);
  const member = p.data.members?.find((m: any) => m.user_id === a.actor);
  if (!member || member.permission === 'view')
    fail(403, 'Timesheet entry requires project edit access');
}

export async function listWorkTimesheets(a: Access, input: unknown) {
  const q = z
    .object({
      project_id: uuid.nullable().optional(),
      from: z.string().date().optional(),
      to: z.string().date().optional(),
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .strict()
    .parse(input);
  if (q.from && q.to && q.from > q.to) fail(400, 'Start date must not follow end date');
  const role = await authorize(a, 'work'),
    admin = ['owner', 'admin'].includes(role);
  const projects = await dbAll(
    "SELECT o.* FROM ac_erp_objects o WHERE o.org_id=? AND o.environment=? AND o.kind='work_project'" +
      (q.project_id ? ' AND o.id=?' : '') +
      (!admin
        ? ' AND EXISTS(SELECT 1 FROM ac_erp_grants g WHERE g.org_id=o.org_id AND g.environment=o.environment AND g.resource_id=o.id AND g.user_id=?)'
        : '') +
      ' ORDER BY o.created_at DESC,o.id LIMIT 1001',
    [a.org, a.environment, ...(q.project_id ? [q.project_id] : []), ...(!admin ? [a.actor] : [])],
  );
  const authorizedProjects = projects.slice(0, 1000).map((row) => decode(a, row));
  const projectIds = authorizedProjects.map((p) => p.id);
  const projectMetadata: any[] = [];
  for (const p of authorizedProjects) {
    const canReview =
      admin || p.data.members?.some((m: any) => m.user_id === a.actor && m.permission === 'manage');
    const taskRows = await dbAll(
      "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='work_task' AND status<>'cancelled' ORDER BY due_on,id LIMIT 1001",
      [a.org, a.environment, p.id],
    );
    projectMetadata.push({
      id: p.id,
      name: p.data.name,
      can_review: !!canReview,
      tasks: taskRows.slice(0, 1000).map((r) => {
        const t = decode(a, r);
        return { id: t.id, title: t.data.title, status: t.status };
      }),
      tasks_truncated: taskRows.length > 1000,
    });
  }
  let where =
    "o.org_id=? AND o.environment=? AND o.kind='work_timesheet' AND o.root_id IN (" +
    (projectIds.length ? projectIds.map(() => '?').join(',') : "''") +
    ')';
  const values: any[] = [a.org, a.environment, ...projectIds];
  const rows = projectIds.length
    ? await dbAll(
        'SELECT o.* FROM ac_erp_objects o WHERE ' +
          where +
          (admin
            ? ''
            : " AND (o.owner_id=? OR EXISTS(SELECT 1 FROM ac_erp_grants g WHERE g.org_id=o.org_id AND g.environment=o.environment AND g.resource_id=o.root_id AND g.user_id=? AND g.permission='manage'))") +
          ' ORDER BY o.created_at DESC,o.id LIMIT 5001',
        [...values, ...(!admin ? [a.actor, a.actor] : [])],
      )
    : [];
  const matching = rows
    .slice(0, 5000)
    .map((r) => decodeEntry(a, r))
    .filter(
      (entry) =>
        (!q.from || entry.data.work_date >= q.from) && (!q.to || entry.data.work_date <= q.to),
    );
  const visibleRows = matching.slice(q.offset, q.offset + q.limit);
  const timers = await dbAll(
    "SELECT * FROM ac_work_timers WHERE org_id=? AND environment=? AND user_id=? AND state='running' ORDER BY started_at DESC LIMIT 2",
    [a.org, a.environment, a.actor],
  );
  const timer = timers[0];
  const effort = new Map<string, number>();
  const byDay = new Map<string, number>(),
    byWeek = new Map<string, number>(),
    byUser = new Map<string, number>();
  for (const entry of matching) {
    if (entry.status === 'rejected') continue;
    const seconds = Number(entry.data.seconds || entry.data.minutes * 60),
      day = entry.data.work_date,
      weekday = new Date(day + 'T12:00:00Z').getUTCDay(),
      monday = new Date(day + 'T12:00:00Z');
    monday.setUTCDate(monday.getUTCDate() - ((weekday + 6) % 7));
    const week = monday.toISOString().slice(0, 10);
    if (entry.parent_id) effort.set(entry.parent_id, (effort.get(entry.parent_id) || 0) + seconds);
    byDay.set(day, (byDay.get(day) || 0) + seconds);
    byWeek.set(week, (byWeek.get(week) || 0) + seconds);
    byUser.set(entry.owner_id, (byUser.get(entry.owner_id) || 0) + seconds);
  }
  return {
    actor_id: a.actor,
    projects: projectMetadata,
    project_truncated: projects.length > 1000,
    data: visibleRows,
    total: rows.length > 5000 ? null : matching.length,
    offset: q.offset,
    limit: q.limit,
    has_more:
      q.offset + q.limit < matching.length || (rows.length > 5000 && q.offset + q.limit < 5000),
    active_timer: timer
      ? {
          id: timer.id,
          project_id: timer.project_id,
          task_id: timer.task_id,
          started_at: timer.started_at,
          elapsed_seconds: Math.max(
            0,
            Math.floor((Date.now() - Date.parse(timer.started_at)) / 1000),
          ),
          version: Number(timer.version),
        }
      : null,
    task_effort_seconds: Object.fromEntries(effort),
    time_totals: {
      by_day: Object.fromEntries(byDay),
      by_week_starting_monday: Object.fromEntries(byWeek),
      by_user_seconds: Object.fromEntries(byUser),
    },
    overlap_policy:
      'Manual entries record durations rather than clock intervals, so manual overlaps cannot be detected. Only one active timer per user and environment is allowed.',
    coverage:
      rows.length > 5000
        ? 'More than 5,000 authorized entries exist. The page is drawn from the 5,000 most recently created entries; date filtering applies to that capped set.'
        : 'Complete matching set within the 5,000-entry limit.',
  };
}

export async function createWorkTimesheet(a: Access, input: unknown, key: string) {
  const d = entryInput.parse(input);
  return operation(
    a,
    'work.timesheet.create',
    key,
    d,
    async () => {
      const p = await projectFor(a, d.project_id, true);
      await taskWritePermission(a, p);
      const task = await taskFor(a, p.id, d.task_id);
      if (task.status === 'cancelled') fail(409, 'Cancelled tasks cannot receive time entries');
    },
    async () => {
      const p = await projectFor(a, d.project_id, true);
      await taskWritePermission(a, p);
      const task = await taskFor(a, p.id, d.task_id);
      return insert(
        a,
        'work_timesheet',
        {
          user_id: a.actor,
          work_date: d.work_date,
          minutes: d.minutes,
          seconds: d.minutes * 60,
          description: d.description,
          reviewer_id: null,
          review_note: '',
          source_timer_id: null,
        },
        { root: p.id, parent: task.id, owner: a.actor, status: 'draft' },
      );
    },
  );
}

const editInput = z
  .object({
    expected_version: z.number().int().min(1),
    work_date: z.string().date(),
    minutes: z.number().int().min(1).max(1440),
    description: z.string().trim().max(4000),
  })
  .strict();
export async function editWorkTimesheet(a: Access, entryId: string, input: unknown, key: string) {
  const d = editInput.parse(input);
  return operation(
    a,
    'work.timesheet.edit:' + entryId,
    key,
    d,
    async () => {
      const entry = await read(a, entryId, 'work_timesheet');
      await projectFor(a, entry.root_id, true);
    },
    async () => {
      const entry = await read(a, entryId, 'work_timesheet');
      if (entry.owner_id !== a.actor || !['draft', 'rejected'].includes(entry.status))
        fail(403, 'Only your draft or rejected entries can be edited');
      if (entry.version !== d.expected_version) fail(409, 'Timesheet changed; reload');
      return update(
        a,
        entry,
        {
          ...entry.data,
          work_date: d.work_date,
          minutes: d.minutes,
          seconds: d.minutes * 60,
          description: d.description,
          reviewer_id: null,
          review_note: '',
        },
        {},
        'edited',
      );
    },
  );
}
export async function submitWorkTimesheet(
  a: Access,
  entryId: string,
  expectedVersion: number,
  key: string,
) {
  const input = { expected_version: z.number().int().min(1).parse(expectedVersion) };
  return operation(
    a,
    'work.timesheet.submit:' + entryId,
    key,
    input,
    async () => {
      const entry = await read(a, entryId, 'work_timesheet');
      await projectFor(a, entry.root_id, true);
    },
    async () => {
      const entry = await read(a, entryId, 'work_timesheet');
      if (entry.owner_id !== a.actor || !['draft', 'rejected'].includes(entry.status))
        fail(403, 'Only your draft or rejected entries can be submitted');
      if (entry.version !== input.expected_version) fail(409, 'Timesheet changed; reload');
      return update(
        a,
        entry,
        { ...entry.data, reviewer_id: null, review_note: '' },
        { status: 'submitted' },
        'submitted',
      );
    },
  );
}
const reviewInput = z
  .object({
    expected_version: z.number().int().min(1),
    decision: z.enum(['approved', 'rejected']),
    note: z.string().trim().max(2000).default(''),
  })
  .strict();
export async function reviewWorkTimesheet(a: Access, entryId: string, input: unknown, key: string) {
  const d = reviewInput.parse(input);
  if (d.decision === 'rejected' && !d.note) fail(400, 'A rejection note is required');
  return operation(
    a,
    'work.timesheet.review:' + entryId,
    key,
    d,
    async () => {
      const entry = await read(a, entryId, 'work_timesheet');
      const p = await projectFor(a, entry.root_id, true);
      await manager(a, p);
    },
    async () => {
      const entry = await read(a, entryId, 'work_timesheet');
      const p = await projectFor(a, entry.root_id, true);
      await manager(a, p);
      if (entry.owner_id === a.actor) fail(403, 'A contributor cannot review their own timesheet');
      if (entry.status !== 'submitted') fail(409, 'Only submitted entries can be reviewed');
      if (entry.version !== d.expected_version) fail(409, 'Timesheet changed; reload');
      return update(
        a,
        entry,
        { ...entry.data, reviewer_id: a.actor, review_note: d.note },
        { status: d.decision },
        d.decision,
      );
    },
  );
}

export async function startWorkTimer(a: Access, input: unknown, key: string) {
  const d = z.object({ project_id: uuid, task_id: uuid }).strict().parse(input);
  try {
    return await operation(
      a,
      'work.timer.start',
      key,
      d,
      async () => {
        const p = await projectFor(a, d.project_id, true);
        await taskWritePermission(a, p);
        await taskFor(a, p.id, d.task_id);
      },
      async () => {
        const p = await projectFor(a, d.project_id, true);
        await taskWritePermission(a, p);
        await taskFor(a, p.id, d.task_id);
        if (
          await dbGet(
            "SELECT id FROM ac_work_timers WHERE org_id=? AND environment=? AND user_id=? AND state='running'",
            [a.org, a.environment, a.actor],
          )
        )
          fail(409, 'Stop the active timer before starting another');
        const timer = {
          id: randomUUID(),
          org_id: a.org,
          environment: a.environment,
          user_id: a.actor,
          project_id: p.id,
          task_id: d.task_id,
          started_at: now(),
          stopped_at: null,
          state: 'running',
          version: 1,
          created_at: now(),
          updated_at: now(),
        };
        await dbRun(
          'INSERT INTO ac_work_timers(id,org_id,environment,user_id,project_id,task_id,started_at,stopped_at,state,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [
            timer.id,
            timer.org_id,
            timer.environment,
            timer.user_id,
            timer.project_id,
            timer.task_id,
            timer.started_at,
            null,
            timer.state,
            timer.version,
            timer.created_at,
            timer.updated_at,
          ],
        );
        return { ...timer, elapsed_seconds: 0 };
      },
    );
  } catch (e) {
    if (String(e).includes('ac_work_one_active_timer'))
      fail(409, 'Stop the active timer before starting another');
    throw e;
  }
}
export async function stopWorkTimer(a: Access, timerId: string, key: string) {
  const id = uuid.parse(timerId);
  return operation(
    a,
    'work.timer.stop:' + id,
    key,
    { timer_id: id },
    async () => {
      const timer = await dbGet(
        'SELECT * FROM ac_work_timers WHERE id=? AND org_id=? AND environment=? AND user_id=?',
        [id, a.org, a.environment, a.actor],
      );
      if (!timer) fail(404, 'Active timer not found');
      await projectFor(a, timer.project_id, true);
    },
    async () =>
      dbTransaction(async () => {
        const timer = await dbGet(
          'SELECT * FROM ac_work_timers WHERE id=? AND org_id=? AND environment=? AND user_id=?',
          [id, a.org, a.environment, a.actor],
        );
        if (!timer || timer.state !== 'running') fail(409, 'Timer is no longer running');
        const p = await projectFor(a, timer.project_id, true);
        await taskWritePermission(a, p);
        const task = await taskFor(a, p.id, timer.task_id);
        const stopped = now(),
          startAt = Date.parse(timer.started_at),
          stopAt = Date.parse(stopped),
          seconds = Math.max(1, Math.floor((stopAt - startAt) / 1000));
        const changed = await dbRun(
          "UPDATE ac_work_timers SET stopped_at=?,state='stopped',version=version+1,updated_at=? WHERE id=? AND org_id=? AND environment=? AND user_id=? AND state='running' AND version=?",
          [stopped, stopped, id, a.org, a.environment, a.actor, timer.version],
        );
        if (!changed.changes) fail(409, 'Timer changed in another tab; reload');
        const entries = [];
        let cursor = startAt;
        while (cursor < stopAt) {
          const day = localDate(new Date(cursor).toISOString()),
            midnight = Date.parse(day + 'T21:00:00.000Z');
          const segmentEnd = Math.min(stopAt, midnight),
            segmentSeconds = Math.max(1, Math.floor((segmentEnd - cursor) / 1000));
          const segment = await insert(
            a,
            'work_timesheet',
            {
              user_id: a.actor,
              work_date: day,
              minutes: Math.max(1, Math.round(segmentSeconds / 60)),
              seconds: segmentSeconds,
              description: 'Timer entry',
              reviewer_id: null,
              review_note: '',
              source_timer_id: id,
              timer_started_at: new Date(cursor).toISOString(),
              timer_stopped_at: new Date(segmentEnd).toISOString(),
            },
            { root: p.id, parent: task.id, owner: a.actor, status: 'draft' },
          );
          entries.push(segment);
          cursor = segmentEnd;
        }
        return {
          timer: {
            ...timer,
            stopped_at: stopped,
            state: 'stopped',
            version: Number(timer.version) + 1,
          },
          entry: entries[0],
          entries,
        };
      }),
  );
}

export async function discardWorkTimer(a: Access, timerId: string, key: string) {
  const id = uuid.parse(timerId);
  return operation(
    a,
    'work.timer.discard:' + id,
    key,
    { timer_id: id },
    async () => {
      const timer = await dbGet(
        "SELECT id FROM ac_work_timers WHERE id=? AND org_id=? AND environment=? AND user_id=? AND state='running'",
        [id, a.org, a.environment, a.actor],
      );
      if (!timer) fail(404, 'Active timer not found');
    },
    async () =>
      dbTransaction(async () => {
        const timer = await dbGet(
          'SELECT * FROM ac_work_timers WHERE id=? AND org_id=? AND environment=? AND user_id=?',
          [id, a.org, a.environment, a.actor],
        );
        if (!timer || timer.state !== 'running') fail(409, 'Timer is no longer running');
        const stopped = now();
        const result = await dbRun(
          "UPDATE ac_work_timers SET stopped_at=?,state='discarded',version=version+1,updated_at=? WHERE id=? AND org_id=? AND environment=? AND user_id=? AND state='running' AND version=?",
          [stopped, stopped, id, a.org, a.environment, a.actor, timer.version],
        );
        if (!result.changes) fail(409, 'Timer changed in another tab; reload');
        return {
          ...timer,
          stopped_at: stopped,
          state: 'discarded',
          version: Number(timer.version) + 1,
          entry: null,
        };
      }),
  );
}

export async function recordTaskEvent(
  a: Access,
  projectId: string,
  task: ERPObject,
  eventType: string,
) {
  await dbRun(
    'INSERT INTO ac_work_task_events(id,org_id,environment,project_id,task_id,actor,event_type,stage,task_status,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [
      randomUUID(),
      a.org,
      a.environment,
      projectId,
      task.id,
      a.actor,
      eventType,
      task.stage,
      task.data.task_status || task.status,
      task.updated_at || now(),
    ],
  );
}

export async function workProgressReport(a: Access, projectId: string, input: unknown) {
  const q = z.object({ from: z.string().date(), to: z.string().date() }).strict().parse(input);
  if (q.from > q.to) fail(400, 'Start date must not follow end date');
  if ((Date.parse(q.to) - Date.parse(q.from)) / 86400000 > 365)
    fail(400, 'Choose a range of at most 366 days');
  await projectFor(a, projectId);
  const events = await dbAll(
    'SELECT task_id,event_type,stage,task_status,occurred_at FROM ac_work_task_events WHERE org_id=? AND environment=? AND project_id=? AND occurred_at<? ORDER BY occurred_at,task_id LIMIT 50001',
    [a.org, a.environment, projectId, q.to + 'T23:59:59.999Z'],
  );
  if (events.length > 50000)
    fail(413, 'Progress history exceeds the supported project report limit');
  const byTask = new Map<string, any[]>();
  for (const event of events) {
    const list = byTask.get(event.task_id) || [];
    list.push(event);
    byTask.set(event.task_id, list);
  }
  const days: any[] = [];
  for (let date = q.from; date <= q.to; ) {
    let open = 0,
      completed = 0,
      cancelled = 0;
    for (const timeline of byTask.values()) {
      let last: any;
      for (const event of timeline)
        if (event.occurred_at.slice(0, 10) <= date) last = event;
        else break;
      if (!last) continue;
      if (last.task_status === 'completed' || last.task_status === 'done') completed++;
      else if (last.task_status === 'cancelled') cancelled++;
      else open++;
    }
    days.push({ date, open, completed, cancelled, total: open + completed + cancelled });
    const next = new Date(date + 'T12:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }
  const coverageStart = events[0]?.occurred_at.slice(0, 10) || null;
  const coveredDays = days.map((day) =>
    day.date < (coverageStart || '9999-12-31')
      ? {
          date: day.date,
          open: null,
          completed: null,
          cancelled: null,
          total: null,
          available: false,
        }
      : { ...day, available: true },
  );
  return {
    project_id: projectId,
    generated_at: now(),
    from: q.from,
    to: q.to,
    days: coveredDays,
    coverage_start: coverageStart,
    coverage_complete: !!coverageStart && q.from >= coverageStart,
    disclosure: coverageStart
      ? `Reliable event history begins ${coverageStart}; earlier states are unavailable.`
      : 'No task state history exists in this project yet.',
  };
}
