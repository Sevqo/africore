import { z } from 'zod';
import { dbAll, dbGet } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { authorize, decode, insert, operation, read, type ERPObject } from './store';

const date = z.string().date(),
  text = z.string().trim().min(1).max(5000);
const updateInput = z
  .object({
    reporting_date: date,
    status: z.enum(['on_track', 'at_risk', 'off_track', 'on_hold', 'completed']),
    summary: text,
    achievements: z.string().max(5000).default(''),
    risks: z.string().max(5000).default(''),
    blockers: z.string().max(5000).default(''),
    next_steps: z.string().max(5000).default(''),
    milestone_summary: z.string().max(5000).default(''),
    related_tasks: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict();

async function authorizedProject(a: Access, id: string, write: boolean) {
  const p = await read(a, id, 'work_project');
  await authorize(a, 'work', id, write);
  return p;
}
async function requireManager(a: Access, p: ERPObject) {
  const role = await authorize(a, 'work', p.id, true);
  if (['owner', 'admin'].includes(role)) return;
  const grant = await dbGet(
    'SELECT permission FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=? AND user_id=?',
    [a.org, a.environment, p.id, a.actor],
  );
  if (grant?.permission !== 'manage') fail(403, 'Project management authority required');
}

export async function projectStatusUpdates(a: Access, projectId: string, offset = 0) {
  z.number().int().min(0).max(100000).parse(offset);
  const p = await authorizedProject(a, projectId, false);
  const rows = await dbAll(
    "SELECT o.* FROM ac_erp_objects o WHERE o.org_id=? AND o.environment=? AND o.kind='work_project_update' AND o.root_id=? ORDER BY o.created_at DESC,o.id DESC LIMIT 51 OFFSET ?",
    [a.org, a.environment, p.id, offset],
  );
  // The project ACL was checked above; decode only the bounded rows fetched for this page.
  return {
    data: rows.slice(0, 50).map((row) => decode(a, row)),
    offset,
    limit: 50,
    has_more: rows.length > 50,
  };
}
export async function publishProjectUpdate(
  a: Access,
  projectId: string,
  input: unknown,
  key: string,
) {
  const d = updateInput.parse(input);
  return operation(
    a,
    'work.project.update:' + projectId,
    key,
    d,
    async () => {
      const p = await authorizedProject(a, projectId, true);
      await requireManager(a, p);
    },
    async () => {
      const p = await authorizedProject(a, projectId, true);
      await requireManager(a, p);
      if (new Set(d.related_tasks).size !== d.related_tasks.length)
        fail(400, 'Related tasks must be unique');
      for (const id of d.related_tasks) {
        const task = await read(a, id, 'work_task');
        if (task.root_id !== p.id) fail(400, 'Related tasks must belong to this project');
      }
      const taskRows = await dbAll(
        "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='work_task' ORDER BY due_on,id LIMIT 1001",
        [a.org, a.environment, p.id],
      );
      const upcoming = taskRows
        .slice(0, 1000)
        .map((row) => decode(a, row))
        .filter(
          (task) =>
            task.due_on &&
            task.due_on >= d.reporting_date &&
            task.due_on <=
              new Date(Date.parse(d.reporting_date + 'T12:00:00Z') + 30 * 86400000)
                .toISOString()
                .slice(0, 10),
        )
        .map((task) => ({ task_id: task.id, title: task.data.title, due_on: task.due_on }));
      const milestones = p.data.milestones.map((milestone: any) => ({
        id: milestone.id,
        name: milestone.name,
        due_on: milestone.due_on,
        completed: milestone.completed,
      }));
      return insert(
        a,
        'work_project_update',
        {
          ...d,
          author_id: a.actor,
          milestone_snapshot: milestones,
          upcoming_deadlines: upcoming,
          deadlines_truncated: taskRows.length > 1000,
        },
        { root: p.id, owner: a.actor, status: d.status, due: d.reporting_date },
      );
    },
  );
}
