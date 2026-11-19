import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { authorize, decode, read } from './store';

const groupField = z.enum(['stage', 'status', 'assignee', 'priority', 'milestone']);
export async function workTaskReport(a: Access, projectId: string, input: unknown) {
  const q = z
    .object({
      group_by: groupField.default('stage'),
      from: z.string().date().optional(),
      to: z.string().date().optional(),
      assignee_id: z.string().uuid().optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      status: z
        .enum(['open', 'in_progress', 'changes_requested', 'approved', 'completed', 'cancelled'])
        .optional(),
      search: z.string().trim().max(200).default(''),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .strict()
    .parse(input);
  if (q.from && q.to && q.from > q.to) fail(400, 'Start date must not follow end date');
  const p = await read(a, projectId, 'work_project');
  await authorize(a, 'work', p.id, false);
  const rows = await dbAll(
    "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='work_task' ORDER BY id LIMIT 50001",
    [a.org, a.environment, p.id],
  );
  if (rows.length > 50000)
    return {
      project_id: p.id,
      data: [],
      total: null,
      complete: false,
      limit: 50000,
      coverage:
        'Project task report exceeds the 50,000-task safety limit; narrow the project or report scope.',
    };
  const tasks = rows
    .map((row) => decode(a, row))
    .filter(
      (t) =>
        (!q.from || (t.due_on && t.due_on >= q.from)) &&
        (!q.to || (t.due_on && t.due_on <= q.to)) &&
        (!q.assignee_id || t.data.assignee_id === q.assignee_id) &&
        (!q.priority || t.data.priority === q.priority) &&
        (!q.status ||
          (t.data.task_status || (t.status === 'open' ? 'in_progress' : t.status)) === q.status) &&
        (!q.search ||
          (t.data.title + ' ' + t.data.description + ' ' + t.data.labels.join(' '))
            .toLowerCase()
            .includes(q.search.toLowerCase())),
    );
  const role = await authorize(a, 'work'),
    admin = ['owner', 'admin'].includes(role),
    grant = await dbGet(
      'SELECT permission FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=? AND user_id=?',
      [a.org, a.environment, p.id, a.actor],
    ),
    canSeeTeamTime = admin || grant?.permission === 'manage';
  const timeRows = await dbAll(
    "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='work_timesheet' AND status<>'rejected'" +
      (canSeeTeamTime ? '' : ' AND owner_id=?') +
      ' ORDER BY created_at LIMIT 50001',
    [a.org, a.environment, p.id, ...(canSeeTeamTime ? [] : [a.actor])],
  );
  const seconds = new Map<string, number>();
  for (const row of timeRows.slice(0, 50000)) {
    const entry = decode(a, row);
    if (
      entry.parent_id &&
      (!q.from || entry.data.work_date >= q.from) &&
      (!q.to || entry.data.work_date <= q.to)
    )
      seconds.set(
        entry.parent_id,
        (seconds.get(entry.parent_id) || 0) + Number(entry.data.seconds || entry.data.minutes * 60),
      );
  }
  const state = (task: any) =>
    task.data.task_status || (task.status === 'open' ? 'in_progress' : task.status);
  const groupValue = (task: any) =>
    q.group_by === 'stage'
      ? task.stage
      : q.group_by === 'status'
        ? state(task)
        : q.group_by === 'assignee'
          ? task.data.assignee_id || 'unassigned'
          : q.group_by === 'priority'
            ? task.data.priority
            : task.data.milestone_id || 'unassigned';
  const groups = new Map<string, any[]>();
  for (const task of tasks) {
    const key = groupValue(task),
      list = groups.get(key) || [];
    list.push(task);
    groups.set(key, list);
  }
  const names = new Map<string, string>([
    ...p.data.stages.map((s: any) => [s.id, s.name] as [string, string]),
    ...p.data.milestones.map((m: any) => [m.id, m.name] as [string, string]),
    ['unassigned', 'Unassigned'],
    ['open', 'Open'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
    ['in_progress', 'In progress'],
    ['changes_requested', 'Changes requested'],
    ['approved', 'Approved'],
  ]);
  const byId = new Map(
    rows.map((row) => {
      const task = decode(a, row);
      return [task.id, task] as [string, any];
    }),
  );
  const blockedTaskIds = new Set(
    tasks
      .filter(
        (task) =>
          task.status === 'open' &&
          (task.data.dependencies || []).some((id: string) => byId.get(id)?.status !== 'completed'),
      )
      .map((task) => task.id),
  );
  const allGroups = [...groups.entries()]
    .map(([key, items]) => ({
      key,
      label: names.get(key) || key,
      task_count: items.length,
      completed: items.filter((t) => t.status === 'completed').length,
      overdue: items.filter(
        (t) =>
          t.status === 'open' &&
          t.due_on &&
          t.due_on < new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }),
      ).length,
      blocked: items.filter((t) => blockedTaskIds.has(t.id)).length,
      estimated_minutes: items.reduce((sum, t) => sum + Number(t.data.estimate_minutes || 0), 0),
      actual_seconds:
        timeRows.length > 50000
          ? null
          : items.reduce((sum, t) => sum + (seconds.get(t.id) || 0), 0),
      task_ids: items.slice(0, 100).map((t) => t.id),
    }))
    .sort((x, y) => x.label.localeCompare(y.label));
  const eventRows = await dbAll(
    'SELECT task_id,event_type,task_status,occurred_at FROM ac_work_task_events WHERE org_id=? AND environment=? AND project_id=? ORDER BY occurred_at,task_id LIMIT 50001',
    [a.org, a.environment, p.id],
  );
  const taskIds = new Set(tasks.map((task) => task.id)),
    timelines = new Map<string, any[]>();
  for (const event of eventRows)
    if (taskIds.has(event.task_id)) {
      const list = timelines.get(event.task_id) || [];
      list.push(event);
      timelines.set(event.task_id, list);
    }
  const cycleDays: number[] = [];
  for (const timeline of timelines.values()) {
    let started: string | null = null;
    for (const event of timeline) {
      if (
        event.event_type === 'created' ||
        event.event_type === 'recurrence_created' ||
        (started === null &&
          ['in_progress', 'changes_requested', 'approved'].includes(event.task_status))
      )
        started = event.occurred_at;
      else if (event.task_status === 'completed' && started) {
        cycleDays.push(
          Math.max(0, (Date.parse(event.occurred_at) - Date.parse(started)) / 86400000),
        );
        started = null;
      } else if (event.task_status === 'in_progress' && started === null)
        started = event.occurred_at;
    }
  }
  return {
    project_id: p.id,
    generated_at: new Date().toISOString(),
    group_by: q.group_by,
    total_tasks: tasks.length,
    total_estimated_minutes: tasks.reduce(
      (sum, t) => sum + Number(t.data.estimate_minutes || 0),
      0,
    ),
    total_actual_seconds:
      timeRows.length > 50000 ? null : tasks.reduce((sum, t) => sum + (seconds.get(t.id) || 0), 0),
    blocked_tasks: blockedTaskIds.size,
    cycle_time:
      eventRows.length > 50000
        ? {
            average_days: null,
            completed_sample: null,
            coverage: 'Task event history exceeds the 50,000-event limit.',
          }
        : {
            average_days: cycleDays.length
              ? cycleDays.reduce((sum, value) => sum + value, 0) / cycleDays.length
              : null,
            completed_sample: cycleDays.length,
            coverage: cycleDays.length
              ? 'Only completions with a recorded creation or reopen event are included.'
              : 'No complete lifecycle interval is available in the recorded event history.',
          },
    data: allGroups.slice(q.offset, q.offset + q.limit),
    total_groups: allGroups.length,
    offset: q.offset,
    limit: q.limit,
    has_more: q.offset + q.limit < allGroups.length,
    complete: timeRows.length <= 50000,
    task_coverage:
      tasks.length + ' matching tasks (all project tasks are within the 50,000-task limit).',
    actual_time_scope: canSeeTeamTime
      ? 'All project timesheets visible to the authorized project manager.'
      : 'Only your own non-rejected time entries; other contributors’ time is not visible to this report.',
    time_coverage:
      timeRows.length > 50000
        ? 'Time entries exceed the 50,000-entry report cap.'
        : 'Matching time entries are within the 50,000-entry limit.',
  };
}

const timeGroupField = z.enum(['user', 'task', 'date', 'week']);
export async function workTimesheetReport(a: Access, projectId: string, input: unknown) {
  const q = z
    .object({
      group_by: timeGroupField.default('user'),
      from: z.string().date().optional(),
      to: z.string().date().optional(),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .strict()
    .parse(input);
  if (q.from && q.to && q.from > q.to) fail(400, 'Start date must not follow end date');
  const project = await read(a, projectId, 'work_project');
  await authorize(a, 'work', project.id, false);
  const role = await authorize(a, 'work'),
    admin = ['owner', 'admin'].includes(role),
    grant = await dbGet(
      'SELECT permission FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=? AND user_id=?',
      [a.org, a.environment, project.id, a.actor],
    ),
    canSeeTeamTime = admin || grant?.permission === 'manage';
  const rows = await dbAll(
    "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='work_timesheet' AND status<>'rejected'" +
      (canSeeTeamTime ? '' : ' AND owner_id=?') +
      ' ORDER BY created_at DESC,id DESC LIMIT 50001',
    [a.org, a.environment, project.id, ...(canSeeTeamTime ? [] : [a.actor])],
  );
  const entries = rows
    .slice(0, 50000)
    .map((row) => decode(a, row))
    .filter(
      (entry) =>
        (!q.from || entry.data.work_date >= q.from) && (!q.to || entry.data.work_date <= q.to),
    );
  const tasks = await dbAll(
    "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='work_task' LIMIT 1001",
    [a.org, a.environment, project.id],
  );
  const taskLabels = new Map(
    tasks.slice(0, 1000).map((row) => {
      const task = decode(a, row);
      return [task.id, task.data.title] as [string, string];
    }),
  );
  const bucket = (entry: any) => {
    if (q.group_by === 'user') return entry.owner_id;
    if (q.group_by === 'task') return entry.parent_id || 'unassigned';
    if (q.group_by === 'date') return entry.data.work_date;
    const date = new Date(entry.data.work_date + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  };
  const groups = new Map<string, any[]>();
  for (const entry of entries) {
    const key = bucket(entry),
      list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  }
  const truncated = rows.length > 50000;
  const all = [...groups.entries()]
    .map(([key, items]) => ({
      key,
      label: q.group_by === 'task' ? taskLabels.get(key) || 'Task no longer in current page' : key,
      entries: truncated ? null : items.length,
      seconds: truncated
        ? null
        : items.reduce(
            (sum, entry) => sum + Number(entry.data.seconds || entry.data.minutes * 60),
            0,
          ),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return {
    project_id: project.id,
    generated_at: new Date().toISOString(),
    group_by: q.group_by,
    total_seconds: truncated
      ? null
      : entries.reduce(
          (sum, entry) => sum + Number(entry.data.seconds || entry.data.minutes * 60),
          0,
        ),
    total_entries: truncated ? null : entries.length,
    data: all.slice(q.offset, q.offset + q.limit),
    total_groups: truncated ? null : all.length,
    offset: q.offset,
    limit: q.limit,
    has_more: q.offset + q.limit < all.length,
    complete: !truncated,
    coverage: truncated
      ? 'More than 50,000 entries exist; rows are derived from the 50,000 most recently created authorized entries and are incomplete.'
      : 'Complete matching authorized set within the 50,000-entry limit.',
    actual_time_scope: canSeeTeamTime
      ? 'All non-rejected entries for this project are visible to the authorized project manager.'
      : 'Only your own non-rejected entries are visible to this report.',
  };
}
