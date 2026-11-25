import { z } from 'zod';
import { dbAll, dbTransaction } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { authorize, decode, operation, read, update, type ERPObject } from './store';
import { recordTaskEvent } from './work-time';

const date = z.string().date();
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000);
function shiftDate(value: string | null, days: number) {
  if (!value) return null;
  const result = new Date(value + 'T12:00:00Z');
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

async function schedule(a: Access, projectId: string, taskId: string, startsOn: string) {
  const project = await read(a, projectId, 'work_project');
  await authorize(a, 'work', project.id, true);
  const rows = await dbAll(
    "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='work_task' ORDER BY id LIMIT 1001",
    [a.org, a.environment, project.id],
  );
  if (rows.length > 1000)
    fail(409, 'This project exceeds the supported 1000-task scheduling graph limit');
  const tasks = rows.map((row) => decode(a, row)),
    byId = new Map<string, ERPObject>(tasks.map((task) => [task.id, task]));
  const target = byId.get(taskId);
  if (!target) fail(404, 'Task not found in this project');
  const targetTask = target!;
  if (targetTask.status !== 'open') fail(409, 'Only open tasks can be rescheduled');
  const existingStart = targetTask.data.starts_on || targetTask.due_on || startsOn;
  const duration = targetTask.due_on
    ? Math.max(0, daysBetween(existingStart, targetTask.due_on))
    : 0;
  const planned = new Map<string, { starts_on: string | null; due_on: string | null }>();
  for (const task of tasks)
    planned.set(task.id, { starts_on: task.data.starts_on, due_on: task.due_on });
  planned.set(targetTask.id, {
    starts_on: startsOn,
    due_on: targetTask.due_on ? shiftDate(startsOn, duration) : null,
  });

  const indegree = new Map(tasks.map((task) => [task.id, 0]));
  const successors = new Map<string, string[]>();
  for (const task of tasks)
    for (const predecessor of task.data.dependencies || []) {
      if (!byId.has(predecessor)) fail(409, 'A dependency is outside the current project');
      indegree.set(task.id, (indegree.get(task.id) || 0) + 1);
      successors.set(predecessor, [...(successors.get(predecessor) || []), task.id]);
    }
  const queue = tasks.filter((task) => indegree.get(task.id) === 0).map((task) => task.id),
    ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const successor of successors.get(id) || []) {
      indegree.set(successor, (indegree.get(successor) || 1) - 1);
      if (indegree.get(successor) === 0) queue.push(successor);
    }
  }
  if (ordered.length !== tasks.length) fail(409, 'Dependency cycle prevents safe scheduling');

  for (const id of ordered) {
    const task = byId.get(id)!;
    if (task.status !== 'open') continue;
    const current = planned.get(id)!;
    let push = 0;
    for (const predecessorId of task.data.dependencies || []) {
      const predecessor = planned.get(predecessorId)!;
      if (!predecessor.due_on)
        fail(409, 'Add a deadline to every predecessor before using finish-to-start scheduling');
      const start = current.starts_on || current.due_on;
      if (!start) continue;
      push = Math.max(push, daysBetween(start, shiftDate(predecessor.due_on, 1)!));
    }
    if (push > 0)
      planned.set(id, {
        starts_on: shiftDate(current.starts_on || current.due_on, push),
        due_on: shiftDate(current.due_on, push),
      });
  }

  const changes = tasks.flatMap((task) => {
    const next = planned.get(task.id)!;
    if (next.starts_on === task.data.starts_on && next.due_on === task.due_on) return [];
    return [
      {
        id: task.id,
        expected_version: task.version,
        starts_on: next.starts_on,
        due_on: next.due_on,
        title: task.data.title,
      },
    ];
  });
  return {
    project_version: project.version,
    task_id: targetTask.id,
    requested_start: startsOn,
    changes,
  };
}

const previewInput = z.object({ task_id: z.string().uuid(), starts_on: date }).strict();
export async function previewWorkSchedule(a: Access, projectId: string, input: unknown) {
  const d = previewInput.parse(input);
  return schedule(a, projectId, d.task_id, d.starts_on);
}

const applyInput = z
  .object({
    expected_project_version: z.number().int().min(1),
    task_id: z.string().uuid(),
    starts_on: date,
    changes: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            expected_version: z.number().int().min(1),
            starts_on: date.nullable(),
            due_on: date.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();
export async function applyWorkSchedule(a: Access, projectId: string, input: unknown, key: string) {
  const d = applyInput.parse(input);
  return operation(
    a,
    'work.schedule.apply:' + projectId,
    key,
    d,
    async () => {
      const p = await read(a, projectId, 'work_project');
      await authorize(a, 'work', p.id, true);
    },
    async () =>
      dbTransaction(async () => {
        const p = await read(a, projectId, 'work_project');
        await authorize(a, 'work', p.id, true);
        if (p.version !== d.expected_project_version)
          fail(409, 'Project changed; preview the schedule again');
        const currentPlan = await schedule(a, projectId, d.task_id, d.starts_on);
        const expected = currentPlan.changes
          .map(({ id, expected_version, starts_on, due_on }) => ({
            id,
            expected_version,
            starts_on,
            due_on,
          }))
          .sort((left, right) => left.id.localeCompare(right.id));
        const submitted = [...d.changes].sort((left, right) => left.id.localeCompare(right.id));
        if (
          expected.length !== submitted.length ||
          expected.some((change, index) => {
            const candidate = submitted[index];
            return (
              change.id !== candidate.id ||
              change.expected_version !== candidate.expected_version ||
              change.starts_on !== candidate.starts_on ||
              change.due_on !== candidate.due_on
            );
          })
        )
          fail(409, 'The schedule changed after preview; review the updated proposal');
        const applied: ERPObject[] = [];
        for (const change of d.changes) {
          const task = await read(a, change.id, 'work_task');
          if (task.root_id !== p.id || task.version !== change.expected_version)
            fail(409, 'An affected task changed; preview the schedule again');
          const result = await update(
            a,
            task,
            { ...task.data, starts_on: change.starts_on, due_on: change.due_on },
            { due_on: change.due_on },
            'dependency_schedule',
          );
          await recordTaskEvent(a, p.id, result, 'schedule_rescheduled');
          applied.push(result);
        }
        const project = await update(a, p, p.data, {}, 'dependency_schedule');
        const { notify } = await import('../operations/automation');
        for (const task of applied) {
          if (task.data.assignee_id && task.data.assignee_id !== a.actor) {
            await notify(a, {
              category: 'work',
              title: 'Task schedule updated',
              body: `"${task.data.title}" in "${p.data.name}" was rescheduled (${task.data.starts_on || 'no start'} → ${task.due_on || 'no due date'}).`,
              user_id: task.data.assignee_id,
              resource_id: task.id,
              key: 'work-schedule:' + task.id + ':' + task.version + ':' + task.data.assignee_id,
              action_data: { app_id: 'work', section: 'work_task', record_id: task.id },
            });
          }
        }
        return { project_version: project.version, changed: applied.length, tasks: applied };
      }),
  );
}
