import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbGet, dbRun, dbTransaction } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { now } from '../platform/crypto';
import { authorize, insert, operation, read, update, type ERPObject } from './store';

function advance(date: string, unit: string, interval: number) {
  const d = new Date(date + 'T12:00:00.000Z');
  if (unit === 'day') d.setUTCDate(d.getUTCDate() + interval);
  else if (unit === 'week') d.setUTCDate(d.getUTCDate() + 7 * interval);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + interval);
    else d.setUTCFullYear(d.getUTCFullYear() + interval);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d.toISOString().slice(0, 10);
}
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
async function project(a: Access, projectId: string, write = false) {
  const p = await read(a, projectId, 'work_project');
  await authorize(a, 'work', p.id, write);
  return p;
}
async function manager(a: Access, p: ERPObject) {
  const role = await authorize(a, 'work', p.id, true);
  if (['owner', 'admin'].includes(role)) return;
  const grant = await dbGet(
    'SELECT permission FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=? AND user_id=?',
    [a.org, a.environment, p.id, a.actor],
  );
  if (grant?.permission !== 'manage') fail(403, 'Project management authority required');
}

export async function generateRecurringTask(
  a: Access,
  projectId: string,
  taskId: string,
  key: string,
) {
  const d = {
    project_id: z.string().uuid().parse(projectId),
    task_id: z.string().uuid().parse(taskId),
  };
  return operation(
    a,
    'work.task.recurrence.generate:' + taskId,
    key,
    d,
    async () => {
      const p = await project(a, d.project_id, true);
      await manager(a, p);
      const task = await read(a, d.task_id, 'work_task');
      if (task.root_id !== p.id) fail(404, 'Task not found');
    },
    async () =>
      dbTransaction(async () => {
        const p = await project(a, d.project_id, true);
        await manager(a, p);
        const source = await read(a, d.task_id, 'work_task');
        if (source.root_id !== p.id) fail(404, 'Task not found');
        const rule = source.data.recurrence;
        if (!rule?.active || !rule.rule_id) fail(409, 'This task has no active recurrence rule');
        const occurrenceOn = rule.next_on;
        if (!occurrenceOn || occurrenceOn > today())
          fail(409, `Next occurrence is not due${occurrenceOn ? ' until ' + occurrenceOn : ''}`);
        if (rule.ends_on && occurrenceOn > rule.ends_on) {
          const changed = await update(
            a,
            source,
            { ...source.data, recurrence: { ...rule, active: false } },
            {},
            'recurrence_expired',
          );
          return { generated: null, source: changed, reason: 'end_date_reached' };
        }
        const prior = await dbGet(
          'SELECT task_id FROM ac_work_occurrences WHERE org_id=? AND environment=? AND rule_id=? AND occurrence_on=?',
          [a.org, a.environment, rule.rule_id, occurrenceOn],
        );
        if (prior)
          return { generated: await read(a, prior.task_id, 'work_task'), source, duplicate: true };
        const firstStage = p.data.stages.find((s: any) => !s.complete);
        if (!firstStage)
          fail(409, 'Project needs an open task stage before recurrence can generate');
        const activeAssignee =
          source.data.assignee_id &&
          p.data.members.some(
            (m: any) => m.user_id === source.data.assignee_id && m.permission !== 'view',
          )
            ? source.data.assignee_id
            : null;
        const duration =
          source.data.starts_on && source.data.due_on
            ? Math.max(
                0,
                Math.round(
                  (Date.parse(source.data.due_on + 'T12:00:00Z') -
                    Date.parse(source.data.starts_on + 'T12:00:00Z')) /
                    86400000,
                ),
              )
            : 0;
        const dueOn = source.data.due_on ? advance(occurrenceOn, 'day', duration) : null;
        const generatedId = randomUUID();
        const data = {
          ...source.data,
          stage: firstStage.id,
          task_status: 'in_progress',
          assignee_id: activeAssignee,
          followers: [],
          starts_on: source.data.starts_on ? occurrenceOn : null,
          due_on: dueOn,
          priority: source.data.priority,
          dependencies: [],
          parent_id: null,
          checklist: (source.data.checklist || []).map((item: any) => ({
            ...item,
            id: randomUUID(),
            completed: false,
          })),
          recurrence: null,
          recurrence_occurrence: {
            rule_id: rule.rule_id,
            source_task_id: source.id,
            occurrence_on: occurrenceOn,
          },
        };
        const last = await dbGet(
          "SELECT MAX(position) AS position FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='work_task'",
          [a.org, a.environment, p.id],
        );
        const generated = await insert(a, 'work_task', data, {
          id: generatedId,
          root: p.id,
          owner: a.actor,
          status: 'open',
          stage: firstStage.id,
          due: dueOn,
          position: Number(last?.position ?? -1) + 1,
        });
        await dbRun(
          'INSERT INTO ac_work_occurrences(id,org_id,environment,rule_id,source_task_id,occurrence_on,task_id,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [
            randomUUID(),
            a.org,
            a.environment,
            rule.rule_id,
            source.id,
            occurrenceOn,
            generated.id,
            now(),
          ],
        );
        const nextOn = advance(occurrenceOn, rule.unit, rule.interval),
          active = !rule.ends_on || nextOn <= rule.ends_on;
        const changedSource = await update(
          a,
          source,
          { ...source.data, recurrence: { ...rule, next_on: nextOn, active } },
          {},
          'recurrence_generated',
        );
        await dbRun(
          'INSERT INTO ac_work_task_events(id,org_id,environment,project_id,task_id,actor,event_type,stage,task_status,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [
            randomUUID(),
            a.org,
            a.environment,
            p.id,
            generated.id,
            a.actor,
            'recurrence_created',
            generated.stage,
            generated.data.task_status,
            generated.created_at,
          ],
        );
        await update(a, p, p.data, {}, 'recurring_task_generated');
        return {
          generated,
          source: changedSource,
          duplicate: false,
          copied: [
            'title',
            'description',
            'assignee (if still a project editor)',
            'duration dates',
            'priority',
            'labels',
            'estimate',
            'milestone',
            'unchecked checklist items',
          ],
          omitted: [
            'dependencies',
            'subtasks',
            'followers',
            'discussion',
            'timesheets',
            'attachments',
            'approvals',
          ],
        };
      }),
  );
}

export { advance as nextRecurrenceDate };
