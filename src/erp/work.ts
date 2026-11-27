import { entitlement } from '../marketplace/engine';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { type Access, fail } from '../platform/auth';
import { permitted } from '../platform/domain';
import {
  authorize,
  read,
  insert,
  update,
  visible,
  operation,
  history,
  decode,
  type ERPObject,
} from './store';
import { recordTaskEvent } from './work-time';

const id = z.string().uuid(),
  text = z.string().trim().min(1).max(200),
  date = z.string().date().nullable().default(null);
const stage = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    name: text,
    complete: z.boolean().default(false),
  })
  .strict();
export const projectInput = z
  .object({
    name: text,
    description: z.string().max(10000).default(''),
    owner_id: id,
    members: z
      .array(z.object({ user_id: id, permission: z.enum(['view', 'edit', 'manage']) }).strict())
      .min(1)
      .max(100),
    stages: z
      .array(stage)
      .min(2)
      .max(30)
      .default([
        { id: 'planned', name: 'Planned', complete: false },
        { id: 'in_progress', name: 'In progress', complete: false },
        { id: 'complete', name: 'Complete', complete: true },
      ]),
    deadline: date,
    status: z.enum(['active', 'on_hold', 'completed', 'archived']).default('active'),
    starts_on: date,
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    planned_minutes: z.number().int().min(0).max(525600).default(0),
    customer_id: id.nullable().default(null),
    order_id: id.nullable().default(null),
    milestones: z
      .array(
        z
          .object({
            id,
            name: text,
            due_on: z.string().date(),
            completed: z.boolean(),
            owner_id: id.nullable().default(null),
            criteria: z.string().max(2000).default(''),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();
export const taskInput = z
  .object({
    title: text,
    description: z.string().max(20000).default(''),
    stage: z.string().min(1).max(40),
    assignee_id: id.nullable().default(null),
    followers: z.array(id).max(100).default([]),
    due_on: date,
    starts_on: date,
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    labels: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    parent_id: id.nullable().default(null),
    dependencies: z.array(id).max(50).default([]),
    checklist: z
      .array(z.object({ id, title: text, completed: z.boolean() }))
      .max(100)
      .default([]),
    estimate_minutes: z.number().int().min(0).max(525600).default(0),
    milestone_id: id.nullable().default(null),
    task_status: z
      .enum(['in_progress', 'changes_requested', 'approved', 'completed', 'cancelled'])
      .optional(),
    recurrence: z
      .object({
        rule_id: id.nullable().optional(),
        unit: z.enum(['day', 'week', 'month', 'year']),
        interval: z.number().int().min(1).max(365),
        ends_on: date.optional().default(null),
        next_on: z.string().date().optional(),
        active: z.boolean().default(true),
      })
      .strict()
      .nullable()
      .default(null),
    recurrence_occurrence: z
      .object({ rule_id: id, source_task_id: id, occurrence_on: z.string().date() })
      .nullable()
      .optional(),
  })
  .strict();
export const taskMoveInput = z
  .object({
    expected_project_version: z.number().int().min(1),
    task_id: id,
    expected_task_version: z.number().int().min(1),
    stage: z.string().min(1).max(40),
    task_status: z
      .enum(['in_progress', 'changes_requested', 'approved', 'completed', 'cancelled'])
      .optional(),
    before_id: id.nullable(),
  })
  .strict();
export const workMessageInput = z
  .object({
    body: z.string().trim().min(1).max(10000),
    task_id: id.nullable().default(null),
    reply_to: id.nullable().default(null),
    mentions: z.array(id).max(30).default([]),
  })
  .strict();

export const projectEditInput = z
  .object({ expected_version: z.number().int().min(1), project: projectInput })
  .strict();
export const taskSaveInput = z
  .object({ expected_version: z.number().int().min(0), task: taskInput })
  .strict();
async function members(a: Access, ids: string[], write = false) {
  for (const user of new Set(ids)) {
    const m = await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?', [
      a.org,
      user,
    ]);
    if (!m || !permitted(m.role, write ? 'operations' : 'read'))
      fail(400, 'Choose current authorized workspace members');
  }
}
async function project(a: Access, projectId: string, write = false) {
  const p = await read(a, projectId, 'work_project');
  await authorize(a, 'work', p.id, write);
  return p;
}
async function projectManager(a: Access, p: ERPObject) {
  const role = await authorize(a, 'work', p.id, true);
  if (['owner', 'admin'].includes(role)) return;
  const g = await dbGet(
    'SELECT permission FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=? AND user_id=?',
    [a.org, a.environment, p.id, a.actor],
  );
  if (g?.permission !== 'manage') fail(403, 'Project management authority required');
}
async function validateProject(a: Access, d: z.infer<typeof projectInput>) {
  if (
    new Set(d.members.map((m) => m.user_id)).size !== d.members.length ||
    !d.members.some((m) => m.user_id === d.owner_id && m.permission === 'manage')
  )
    fail(400, 'The project owner must be a unique managing participant');
  if (d.starts_on && d.deadline && d.starts_on > d.deadline)
    fail(400, 'Project start date must not follow its deadline');
  if (
    new Set(d.stages.map((s) => s.id)).size !== d.stages.length ||
    !d.stages.some((s) => s.complete) ||
    d.stages.every((s) => s.complete)
  )
    fail(400, 'Stages must be unique and include open and completed states');
  if (new Set(d.milestones.map((m) => m.id)).size !== d.milestones.length)
    fail(400, 'Milestone identifiers must be unique');
  if (
    d.milestones.some(
      (m) =>
        m.owner_id &&
        !d.members.some((member) => member.user_id === m.owner_id && member.permission !== 'view'),
    )
  )
    fail(400, 'Milestone owners must be project participants with edit access');
  for (const m of d.members) await members(a, [m.user_id], m.permission !== 'view');
  for (const [kind, ref] of [
    ['customers', d.customer_id],
    ['orders', d.order_id],
  ])
    if (ref) {
      const r = await dbGet(
        'SELECT data FROM ac_records WHERE id=? AND org_id=? AND environment=? AND kind=?',
        [ref, a.org, a.environment, kind],
      );
      if (!r) fail(400, 'Related shared record not found');
      if (kind === 'orders' && d.customer_id && JSON.parse(r.data).customer_id !== d.customer_id)
        fail(400, 'Order belongs to a different shared customer');
    }
}
async function grants(a: Access, p: ERPObject) {
  await dbRun('DELETE FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=?', [
    a.org,
    a.environment,
    p.id,
  ]);
  for (const m of p.data.members)
    await dbRun(
      'INSERT INTO ac_erp_grants(org_id,environment,resource_id,user_id,permission) VALUES (?,?,?,?,?)',
      [a.org, a.environment, p.id, m.user_id, m.permission],
    );
}
export async function createProject(a: Access, input: unknown, key: string) {
  const d = projectInput.parse(input);
  return operation(
    a,
    'work.project.create',
    key,
    d,
    () => authorize(a, 'work', undefined, true),
    async () => {
      await validateProject(a, d);
      const p = await insert(a, 'work_project', d, {
        owner: d.owner_id,
        status: d.status,
        due: d.deadline,
      });
      await grants(a, p);
      const { notify } = await import('../operations/automation');
      for (const m of d.members) {
        if (m.user_id === a.actor) continue;
        await notify(a, {
          category: 'work',
          title: 'Added to project',
          body: `You were added to project "${d.name}". Open Work to see your project tasks and schedule.`,
          user_id: m.user_id,
          resource_id: p.id,
          key: 'work-project-member:' + p.id + ':' + m.user_id,
          severity: 'informational',
          action_data: { app_id: 'work', section: 'work_project', record_id: p.id },
        });
      }
      const { create: createOpObj } = await import('../operations/store');
      await createOpObj(a, 'work_channel_message', {
        channel_id: 'project:' + p.id,
        body: `Project channel created for "${d.name}". Team members can coordinate deliverables here or mention the workspace agent.`,
        is_agent: true,
        author_id: 'agent',
        author_name: 'AfriCore Agent',
        author_username: 'agent',
        reply_to: null,
        mentions: [],
        agent_run: null,
      }).catch(() => {});
      return p;
    },
    { authorizeReplay: (p) => authorize(a, 'work', p.id) },
  );
}
export async function editProject(a: Access, projectId: string, input: unknown, key: string) {
  const d = projectEditInput.parse(input);
  return operation(
    a,
    'work.project.edit:' + projectId,
    key,
    d,
    async () => projectManager(a, await project(a, projectId, true)),
    async () => {
      const p = await project(a, projectId, true);
      if (p.version !== d.expected_version) fail(409, 'Project changed; reload');
      await validateProject(a, d.project);
      const tasks = await dbAll(
        "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='work_task'",
        [a.org, a.environment, projectId],
      );
      for (const t of tasks) {
        const value = await read(a, t.id, 'work_task'),
          nextStage = d.project.stages.find((s) => s.id === t.stage);
        if (!nextStage) fail(409, 'Retain stages referenced by existing tasks');
        if (nextStage?.complete && value.status !== 'completed')
          fail(
            409,
            'Move incomplete tasks out of completed stages before changing the stage policy',
          );
        if (
          value.data.milestone_id &&
          !d.project.milestones.some((m) => m.id === value.data.milestone_id)
        )
          fail(409, 'Move tasks to another milestone before removing their current milestone');
        if (
          value.data.milestone_id &&
          d.project.milestones.find((m) => m.id === value.data.milestone_id)?.completed &&
          t.status !== 'completed'
        )
          fail(409, 'A completed milestone cannot contain an incomplete task');
        if (d.project.status === 'completed' && t.status !== 'completed')
          fail(409, 'Complete all project tasks before closing the project');
        if (
          value.data.assignee_id &&
          !d.project.members.some(
            (m) => m.user_id === value.data.assignee_id && m.permission !== 'view',
          )
        )
          fail(409, 'Reassign tasks before removing a participant');
        const followers = value.data.followers.filter((id: string) =>
          d.project.members.some((m) => m.user_id === id),
        );
        if (followers.length !== value.data.followers.length)
          await update(
            a,
            value,
            { ...value.data, followers },
            {},
            'removed_project_participants_unfollowed',
          );
      }
      for (const milestone of d.project.milestones) {
        if (
          milestone.completed &&
          tasks.some(
            (task) => task.status !== 'completed' && task.data.milestone_id === milestone.id,
          )
        )
          fail(409, 'Complete all linked tasks before completing their milestone');
      }
      const result = await update(
        a,
        p,
        {
          ...d.project,
          ...(p.data.review ? { review: p.data.review } : {}),
          ...(p.data.template ? { template: p.data.template } : {}),
          ...(p.data.automation_policy ? { automation_policy: p.data.automation_policy } : {}),
        },
        { owner_id: d.project.owner_id, status: d.project.status, due_on: d.project.deadline },
      );
      await grants(a, result);
      const { notify } = await import('../operations/automation');
      const priorMemberIds = new Set((p.data.members || []).map((m: any) => m.user_id));
      for (const m of d.project.members) {
        if (m.user_id === a.actor || priorMemberIds.has(m.user_id)) continue;
        await notify(a, {
          category: 'work',
          title: 'Added to project',
          body: `You were added to project "${d.project.name}". Open Work to review assigned tasks and milestones.`,
          user_id: m.user_id,
          resource_id: result.id,
          key: 'work-project-member:' + result.id + ':' + result.version + ':' + m.user_id,
          severity: 'informational',
          action_data: { app_id: 'work', section: 'work_project', record_id: result.id },
        });
      }
      return result;
    },
  );
}
export async function workProjects(a: Access) {
  const role = await authorize(a, 'work');
  const data = await visible(a, 'work_project');
  const ids = data.slice(0, 1000).map((p) => p.id);
  const counts = ids.length
    ? await dbAll(
        "SELECT root_id,COUNT(*) AS total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open,SUM(CASE WHEN status='open' AND due_on<? THEN 1 ELSE 0 END) AS overdue FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='work_task' AND root_id IN (" +
          ids.map(() => '?').join(',') +
          ') GROUP BY root_id',
        [
          new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }),
          a.org,
          a.environment,
          ...ids,
        ],
      )
    : [];
  return {
    actor_id: a.actor,
    can_create:
      permitted(role, 'operations') && (await entitlement(a, 'work'))?.status === 'active',
    data: data.slice(0, 1000).map((p) => ({
      ...p,
      task_summary: {
        total: Number(counts.find((c) => c.root_id === p.id)?.total || 0),
        completed: Number(counts.find((c) => c.root_id === p.id)?.completed || 0),
        open: Number(counts.find((c) => c.root_id === p.id)?.open || 0),
        overdue: Number(counts.find((c) => c.root_id === p.id)?.overdue || 0),
      },
    })),
    truncated: data.length > 1000,
    limit: 1000,
  };
}
export async function workProject(a: Access, projectId: string, messageOffset = 0) {
  z.number().int().min(0).max(100000).parse(messageOffset);
  const p = await project(a, projectId),
    role = await authorize(a, 'work', p.id),
    grant = await dbGet(
      'SELECT permission FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=? AND user_id=?',
      [a.org, a.environment, p.id, a.actor],
    ),
    admin = ['owner', 'admin'].includes(role);
  const active = (await entitlement(a, 'work'))?.status === 'active',
    tasks = await visible(a, 'work_task', p.id),
    messages = await visible(a, 'work_message', p.id, messageOffset);
  const milestones = p.data.milestones.map((m: any) => {
    const linked = tasks.filter((t) => t.data.milestone_id === m.id);
    const completed = linked.filter((t) => t.status === 'completed').length;
    return {
      ...m,
      task_count: linked.length,
      completed_task_count: completed,
      progress_percent: linked.length ? Math.round((completed * 100) / linked.length) : 0,
      tasks: linked.map((t) => ({ id: t.id, title: t.data.title, status: t.status })),
    };
  });
  return {
    project: { ...p, data: { ...p.data, milestones } },
    permissions: {
      write:
        active &&
        (admin ||
          (permitted(role, 'operations') && ['edit', 'manage'].includes(grant?.permission))),
      manage:
        active && (admin || (permitted(role, 'operations') && grant?.permission === 'manage')),
    },
    tasks: tasks.slice(0, 1000),
    messages: messages.slice(0, 100).reverse(),
    message_page: { offset: messageOffset, has_more: messages.length > 100 },
    truncated: tasks.length > 1000 || messages.length > 100,
    tasks_truncated: tasks.length > 1000,
    coverage:
      'Up to 1000 tasks; discussions load in pages of 100 messages with earlier-history navigation.',
  };
}
async function validateTask(a: Access, p: ERPObject, d: z.infer<typeof taskInput>, taskId: string) {
  if (p.status !== 'active') fail(409, 'Project is not active');
  const selected = p.data.stages.find((s: any) => s.id === d.stage);
  if (!selected) fail(400, 'Unknown project stage');
  if (d.milestone_id && !p.data.milestones.some((m: any) => m.id === d.milestone_id))
    fail(400, 'Milestone must belong to the selected project');
  if (d.starts_on && d.due_on && d.starts_on > d.due_on)
    fail(400, 'Start date must not follow due date');
  if (
    new Set(d.dependencies).size !== d.dependencies.length ||
    new Set(d.checklist.map((c) => c.id)).size !== d.checklist.length ||
    new Set(d.followers).size !== d.followers.length
  )
    fail(400, 'Task references must be unique');
  const assigned = [...(d.assignee_id ? [d.assignee_id] : []), ...d.followers];
  await members(a, assigned);
  for (const user of assigned)
    if (
      !p.data.members.some(
        (m: any) => m.user_id === user && (user !== d.assignee_id || m.permission !== 'view'),
      )
    )
      fail(400, 'Assignments require current project participants with edit access');
  const rows = await dbAll(
    "SELECT id FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='work_task' ORDER BY id LIMIT 1001",
    [a.org, a.environment, p.id],
  );
  if (rows.length > 1000) fail(409, 'This project exceeds the supported 1000-task graph limit');
  const map = new Map<string, ERPObject>();
  for (const r of rows) map.set(r.id, await read(a, r.id, 'work_task'));
  if (!map.has(taskId) && rows.length >= 1000) fail(409, 'The project task limit has been reached');
  for (const ref of [...d.dependencies, ...(d.parent_id ? [d.parent_id] : [])])
    if (ref === taskId || !map.has(ref))
      fail(400, 'Task references must belong to this project and cannot refer to themselves');
  const walk = (
    start: string,
    field: 'dependencies' | 'parent_id',
    seen = new Set<string>(),
  ): boolean => {
    if (start === taskId) return true;
    if (seen.has(start)) return false;
    seen.add(start);
    const value = map.get(start)?.data;
    return (
      field === 'dependencies'
        ? value?.dependencies || []
        : value?.parent_id
          ? [value.parent_id]
          : []
    ).some((next: string) => walk(next, field, seen));
  };
  if (
    d.dependencies.some((ref) => walk(ref, 'dependencies')) ||
    (d.parent_id && walk(d.parent_id, 'parent_id'))
  )
    fail(400, 'Task dependencies or subtasks cannot form a cycle');
  // A parent also waits for its children. Include those implicit edges so a
  // child cannot depend on its own parent (or create a longer mixed deadlock).
  const graph = new Map<string, string[]>();
  for (const [key, value] of map) graph.set(key, [...(value.data.dependencies || [])]);
  graph.set(taskId, [...d.dependencies]);
  for (const [key, value] of map) {
    const parent = key === taskId ? d.parent_id : value.data.parent_id;
    if (parent) graph.get(parent)?.push(key);
  }
  if (!map.has(taskId) && d.parent_id) graph.get(d.parent_id)?.push(taskId);
  const visited = new Set<string>(),
    active = new Set<string>();
  const visit = (node: string) => {
    if (active.has(node)) fail(400, 'Dependencies and subtasks cannot form a completion cycle');
    if (visited.has(node)) return;
    active.add(node);
    for (const next of graph.get(node) || []) visit(next);
    active.delete(node);
    visited.add(node);
  };
  for (const key of graph.keys()) visit(key);
  const taskStatus = d.task_status || (selected.complete ? 'completed' : 'in_progress');
  if (
    d.milestone_id &&
    p.data.milestones.find((m: any) => m.id === d.milestone_id)?.completed &&
    taskStatus !== 'completed'
  )
    fail(409, 'A completed milestone cannot receive an incomplete task');
  if (
    taskStatus !== 'completed' &&
    [...map.values()].some(
      (t) => t.status === 'completed' && (t.data.dependencies || []).includes(taskId),
    )
  )
    fail(409, 'Reopen completed dependent tasks before reopening a prerequisite');
  if (d.parent_id && map.get(d.parent_id)?.status === 'completed' && !selected.complete)
    fail(409, 'Reopen the parent before adding or reopening an incomplete subtask');
  if (
    taskStatus === 'completed' &&
    (d.dependencies.some((ref) => map.get(ref)?.status !== 'completed') ||
      d.checklist.some((c) => !c.completed) ||
      [...map.values()].some(
        (t) => t.parent_id === taskId && !['completed', 'cancelled'].includes(t.status),
      ))
  )
    fail(409, 'Complete dependencies, subtasks and checklist items first');
  return taskStatus === 'completed'
    ? 'completed'
    : taskStatus === 'cancelled'
      ? 'cancelled'
      : 'open';
}
export async function saveTask(
  a: Access,
  projectId: string,
  taskId: string | null,
  input: unknown,
  key: string,
) {
  const d = taskSaveInput.parse(input),
    nextId = taskId || randomUUID();
  return operation(
    a,
    'work.task.save:' + projectId + ':' + (taskId || 'new'),
    key,
    d,
    async () => {
      await project(a, projectId, true);
    },
    async () => {
      const p = await project(a, projectId, true),
        old = taskId ? await read(a, taskId, 'work_task') : null;
      if (old?.root_id && old.root_id !== p.id) fail(404, 'Task not found');
      if ((old?.version || 0) !== d.expected_version) fail(409, 'Task changed; reload');
      const stageComplete = p.data.stages.find((s: any) => s.id === d.task.stage)?.complete;
      d.task.task_status ||= stageComplete ? 'completed' : 'in_progress';
      if (d.task.recurrence) {
        d.task.recurrence.rule_id ||= old?.data.recurrence?.rule_id || randomUUID();
        d.task.recurrence.next_on ||=
          d.task.due_on ||
          d.task.starts_on ||
          new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
      }
      const status = await validateTask(a, p, d.task, nextId);
      let value: ERPObject;
      if (old)
        value = await update(
          a,
          old,
          d.task,
          { stage: d.task.stage, status, due_on: d.task.due_on, parent_id: d.task.parent_id },
          status === 'completed' && old.status !== 'completed' ? 'completed' : 'updated',
        );
      else {
        const pos = await dbGet(
          "SELECT MAX(position) AS position FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='work_task'",
          [a.org, a.environment, p.id],
        );
        value = await insert(a, 'work_task', d.task, {
          id: nextId,
          root: p.id,
          parent: d.task.parent_id,
          stage: d.task.stage,
          status,
          due: d.task.due_on,
          position: Number(pos?.position ?? -1) + 1,
        });
      }
      await recordTaskEvent(
        a,
        p.id,
        value,
        old
          ? old.stage !== value.stage
            ? 'stage_changed'
            : old.status !== value.status
              ? 'status_changed'
              : 'task_updated'
          : 'created',
      );
      // Board version changes for every task mutation, including concurrent new cards.
      const updatedProject = await update(a, p, p.data, {}, 'task_updated'),
        workflow_runs =
          status === 'completed' && old?.status !== 'completed'
            ? await (await import('./work-automation')).executeWorkRules(a, updatedProject, value)
            : [];
      const { notify } = await import('../operations/automation');
      if (d.task.assignee_id && d.task.assignee_id !== a.actor && d.task.assignee_id !== old?.data.assignee_id) {
        await notify(a, {
          category: 'work',
          title: 'Task assigned to you',
          body: `You were assigned "${d.task.title}" in project "${p.data.name}"${d.task.due_on ? ' (due ' + d.task.due_on + ')' : ''}.`,
          user_id: d.task.assignee_id,
          resource_id: value.id,
          key: 'work-assign:' + value.id + ':' + value.version + ':' + d.task.assignee_id,
          severity: 'action_required',
          action_data: { app_id: 'work', section: 'work_task', record_id: value.id },
        });
      } else if (
        old &&
        d.task.assignee_id &&
        d.task.assignee_id !== a.actor &&
        (old.due_on !== d.task.due_on || old.stage !== d.task.stage || old.status !== status)
      ) {
        await notify(a, {
          category: 'work',
          title: 'Assigned task updated',
          body: `"${d.task.title}" in "${p.data.name}" was updated (${d.task.stage}${d.task.due_on ? ', due ' + d.task.due_on : ''}).`,
          user_id: d.task.assignee_id,
          resource_id: value.id,
          key: 'work-task-update:' + value.id + ':' + value.version + ':' + d.task.assignee_id,
          action_data: { app_id: 'work', section: 'work_task', record_id: value.id },
        });
      }
      const priorFollowers = new Set<string>(old?.data.followers || []);
      for (const followerId of new Set(d.task.followers || [])) {
        if (followerId === a.actor || followerId === d.task.assignee_id || priorFollowers.has(followerId))
          continue;
        await notify(a, {
          category: 'work',
          title: 'Following project task',
          body: `You were added as a follower on "${d.task.title}" in "${p.data.name}".`,
          user_id: followerId,
          resource_id: value.id,
          key: 'work-follow:' + value.id + ':' + value.version + ':' + followerId,
          action_data: { app_id: 'work', section: 'work_task', record_id: value.id },
        });
      }
      return { ...value, workflow_runs };
    },
  );
}
export async function moveTask(a: Access, projectId: string, input: unknown, key: string) {
  const d = taskMoveInput.parse(input);
  return operation(
    a,
    'work.task.move:' + projectId,
    key,
    d,
    async () => {
      await project(a, projectId, true);
    },
    async () => {
      const p = await project(a, projectId, true);
      if (p.version !== d.expected_project_version)
        fail(409, 'Board changed; reload before moving cards');
      const task = await read(a, d.task_id, 'work_task');
      if (task.root_id !== p.id) fail(404, 'Task not found');
      if (task.version !== d.expected_task_version) fail(409, 'Task changed; reload');
      const data = taskInput.parse({
          ...task.data,
          stage: d.stage,
          task_status:
            d.task_status ||
            task.data.task_status ||
            (task.status === 'completed' ? 'completed' : 'in_progress'),
        }),
        status = await validateTask(a, p, data, task.id);
      const rows = (await visible(a, 'work_task', p.id)).filter(
        (t) => t.stage === d.stage && t.id !== task.id,
      );
      if (d.before_id && !rows.some((t) => t.id === d.before_id))
        fail(400, 'Choose a destination card in the selected stage');
      const index = d.before_id ? rows.findIndex((t) => t.id === d.before_id) : rows.length;
      rows.splice(index, 0, task);
      for (let i = 0; i < rows.length; i++) {
        const t = rows[i];
        if (t.id === task.id)
          await update(a, t, data, { stage: d.stage, status, position: i }, 'moved');
        else if (t.position !== i) await update(a, t, t.data, { position: i }, 'reordered');
      }
      const board = await update(a, p, p.data, {}, 'board_reordered'),
        result = await read(a, task.id, 'work_task'),
        workflow_runs =
          status === 'completed' && task.status !== 'completed'
            ? await (await import('./work-automation')).executeWorkRules(a, board, result)
            : [];
      if (task.stage !== result.stage || task.status !== result.status)
        await recordTaskEvent(
          a,
          p.id,
          result,
          task.stage !== result.stage ? 'stage_changed' : 'status_changed',
        );
      return { project_version: board.version, task: result, workflow_runs };
    },
  );
}
export async function addWorkMessage(a: Access, projectId: string, input: unknown, key: string) {
  const d = workMessageInput.parse(input);
  return operation(
    a,
    'work.message:' + projectId,
    key,
    d,
    async () => {
      await project(a, projectId, true);
    },
    async () => {
      const p = await project(a, projectId, true);
      if (p.status === 'archived') fail(409, 'Project is archived');
      if (d.task_id && (await read(a, d.task_id, 'work_task')).root_id !== p.id)
        fail(404, 'Task not found');
      if (d.reply_to) {
        const reply = await read(a, d.reply_to, 'work_message');
        if (reply.root_id !== p.id || reply.data.task_id !== d.task_id)
          fail(400, 'Reply must stay in the same discussion');
      }
      await members(a, d.mentions);
      if (d.mentions.some((user) => !p.data.members.some((m: any) => m.user_id === user)))
        fail(400, 'Mentions require current project participants');
      const value = await insert(
          a,
          'work_message',
          { ...d, author_id: a.actor },
          { root: p.id, parent: d.reply_to },
        ),
        { notify } = await import('../operations/automation');
      for (const user of new Set(d.mentions)) {
        if (user === a.actor) continue;
        await notify(a, {
          category: 'work',
          title: 'Private project mention',
          body: 'A project discussion mentions you. Open the current authorized project to read it.',
          user_id: user,
          resource_id: d.task_id || p.id,
          key: 'work-mention:' + value.id,
          action_data: { app_id: 'work', section: 'work_task', record_id: d.task_id || p.id },
        });
      }
      return value;
    },
  );
}
export async function myWork(a: Access, input: unknown) {
  const q = z
      .object({
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
        status: z.enum(['open', 'completed', 'all']).default('open'),
      })
      .strict()
      .parse(input),
    role = await authorize(a, 'work'),
    admin = ['owner', 'admin'].includes(role),
    rows = await dbAll(
      "SELECT o.* FROM ac_erp_objects o WHERE o.org_id=? AND o.environment=? AND o.kind='work_task'" +
        (!admin
          ? ' AND EXISTS(SELECT 1 FROM ac_erp_grants g WHERE g.org_id=o.org_id AND g.environment=o.environment AND g.resource_id=o.root_id AND g.user_id=?)'
          : '') +
        ' ORDER BY (o.due_on IS NULL),o.due_on,o.id LIMIT 10001',
      [a.org, a.environment, ...(!admin ? [a.actor] : [])],
    ),
    matching = rows
      .slice(0, 10000)
      .map((r) => decode(a, r))
      .filter(
        (t) => t.data.assignee_id === a.actor && (q.status === 'all' || t.status === q.status),
      ),
    projects = new Map<string, ERPObject>(),
    page = matching.slice(q.offset, q.offset + 50);
  for (const t of page)
    if (!projects.has(t.root_id)) projects.set(t.root_id, await project(a, t.root_id));

  // Include upcoming Calendar meetings & workspace events visible to this worker
  // Shared workspace events (visibility !== 'private') are visible to every current member,
  // even if they joined after the event was scheduled or have minimal role access.
  const nowIso = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const horizonIso = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
  const [calRows, memberProfiles] = await Promise.all([
    dbAll(
      "SELECT o.* FROM ac_erp_objects o WHERE o.org_id=? AND o.environment=? AND o.kind='calendar_event' AND o.status='active' ORDER BY o.created_at DESC LIMIT 200",
      [a.org, a.environment],
    ),
    dbAll(
      'SELECT u.id,u.email,p.display_name FROM ac_memberships m JOIN ac_users u ON u.id=m.user_id LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE m.org_id=?',
      [a.org],
    ),
  ]);
  const memberNameById = new Map<string, string>(
    memberProfiles.map((m: any) => [String(m.id), String(m.display_name || m.email || 'Team member')]),
  );
  const { expandCalendarSeries } = await import('../apps/calendar-recurrence');
  const meetings = calRows
    .map((r) => decode(a, r))
    .filter((ev) => {
      if (ev.data.cancelled_at) return false;
      const invited = (ev.data.attendees || []).some((p: any) => p.user_id === a.actor);
      const isOrganizer = ev.data.organizer_id === a.actor;
      if (ev.data.visibility === 'private' && !invited && !isOrganizer) return false;
      return true;
    })
    .flatMap((ev) =>
      expandCalendarSeries(ev, nowIso, horizonIso).map((occ) => {
        const invited = (ev.data.attendees || []).find((p: any) => p.user_id === a.actor);
        return {
          id: occ.id,
          event_id: ev.id,
          title: occ.data.title,
          description: occ.data.description || '',
          start: occ.data.start,
          starts_at: occ.data.start,
          end: occ.data.end,
          ends_at: occ.data.end,
          timezone: occ.data.timezone,
          location: occ.data.location || '',
          meeting_url: occ.data.meeting_url || '',
          visibility: ev.data.visibility || 'default',
          organizer_id: ev.data.organizer_id,
          organizer_name: memberNameById.get(String(ev.data.organizer_id)) || 'Workspace organizer',
          invited: !!invited,
          my_response: invited?.response || (ev.data.organizer_id === a.actor ? 'organizer' : 'shared'),
        };
      }),
    )
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start))
    .slice(0, 25);

  // Include assigned CRM follow-ups, pending approvals, field dispatches, and support tickets for this worker
  const [crmRows, approvalRows, dispatchRows, ticketRows, actorProfile] = await Promise.all([
    dbAll(
      "SELECT id,kind,status,data,updated_at FROM ac_crm_entries WHERE org_id=? AND environment=? AND status NOT IN ('completed','cancelled','archived') ORDER BY updated_at DESC LIMIT 100",
      [a.org, a.environment],
    ),
    dbAll(
      "SELECT id,action,resource_id,status,expires_at,created_at FROM ac2_approvals WHERE org_id=? AND environment=? AND approver=? AND status='pending' ORDER BY created_at DESC LIMIT 25",
      [a.org, a.environment, a.actor],
    ),
    dbAll(
      "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='field_dispatch' AND status NOT IN ('completed','cancelled') ORDER BY created_at DESC LIMIT 50",
      [a.org, a.environment],
    ),
    dbAll(
      "SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='support_ticket' AND status NOT IN ('resolved','closed','cancelled') ORDER BY created_at DESC LIMIT 50",
      [a.org, a.environment],
    ),
    dbGet(
      'SELECT u.email,p.display_name FROM ac_users u LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE u.id=?',
      [a.actor],
    ),
  ]);
  const actorNames = [actorProfile?.display_name, actorProfile?.email]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  const activities: any[] = [];
  for (const row of crmRows) {
    try {
      const parsed = JSON.parse(row.data);
      if (parsed.assigned_to === a.actor) {
        activities.push({
          id: row.id,
          kind: 'crm_followup',
          app_id: 'crm',
          section: row.kind === 'follow_up' ? 'followups' : 'pipeline',
          title: parsed.title || parsed.subject || 'CRM follow-up',
          status: row.status,
          due_on: parsed.due_on || parsed.expected_close_date || null,
        });
      }
    } catch {
      /* ignore malformed */
    }
  }
  for (const row of approvalRows) {
    activities.push({
      id: row.id,
      kind: 'approval',
      app_id: 'automations',
      section: 'Approvals',
      title: `Approval needed: ${String(row.action).replace(/_/g, ' ')}`,
      status: row.status,
      due_on: row.expires_at ? String(row.expires_at).slice(0, 10) : null,
    });
  }
  for (const row of dispatchRows) {
    const decoded = decode(a, row);
    const tech = String(decoded.data.technician || '').toLowerCase();
    if (decoded.owner_id === a.actor || (tech && actorNames.some((n) => n.includes(tech) || tech.includes(n)))) {
      activities.push({
        id: decoded.id,
        kind: 'field_dispatch',
        app_id: 'field_operations',
        section: 'dispatches',
        title: decoded.data.title || 'Field dispatch',
        status: decoded.status,
        due_on: decoded.data.scheduled_on || null,
      });
    }
  }
  for (const row of ticketRows) {
    const decoded = decode(a, row);
    const assignee = String(decoded.data.assignee || decoded.data.assigned_to || '').toLowerCase();
    if (
      decoded.owner_id === a.actor ||
      decoded.data.assignee_id === a.actor ||
      (assignee && actorNames.some((n) => n.includes(assignee) || assignee.includes(n)))
    ) {
      activities.push({
        id: decoded.id,
        kind: 'support_ticket',
        app_id: 'support',
        section: 'tickets',
        title: decoded.data.subject || decoded.data.title || 'Support ticket',
        status: decoded.status,
        due_on: decoded.data.sla_due_on || null,
      });
    }
  }

  return {
    data: page.map((t) => ({ ...t, project_name: projects.get(t.root_id)!.data.name })),
    meetings,
    activities: activities.slice(0, 30),
    total: matching.length,
    offset: q.offset,
    has_more: q.offset + 50 < matching.length,
    truncated: rows.length > 10000,
    limit: 50,
    definition:
      'Tasks assigned to your current login across currently authorized projects, plus scheduled workspace meetings and assigned operational activities.',
  };
}
export async function respondWorkMeeting(
  a: Access,
  eventId: string,
  input: unknown,
  key: string,
) {
  const d = z
    .object({ response: z.enum(['accepted', 'declined', 'tentative']) })
    .strict()
    .parse(input);
  return operation(
    a,
    'work.meeting.respond:' + eventId,
    key,
    d,
    async () => {
      await authorize(a, 'work');
    },
    async () => {
      const old = await read(a, eventId, 'calendar_event');
      if (old.status !== 'active' || old.data.cancelled_at)
        fail(409, 'This meeting is no longer active');
      const attendees: { user_id: string; response: string }[] = Array.isArray(old.data.attendees)
        ? old.data.attendees
        : [];
      const existing = attendees.find((x) => x.user_id === a.actor);
      const isOrganizer = old.data.organizer_id === a.actor;
      if (old.data.visibility === 'private' && !existing && !isOrganizer)
        fail(404, 'Meeting not found');
      const nextAttendees = existing
        ? attendees.map((x) => (x.user_id === a.actor ? { ...x, response: d.response } : x))
        : [...attendees, { user_id: a.actor, response: d.response }];
      const updated = await update(a, old, { ...old.data, attendees: nextAttendees });
      return { event_id: updated.id, response: d.response };
    },
    { meter: false },
  );
}
export async function workTarget(a: Access, id: string) {
  await authorize(a, 'work');
  const row = await dbGet(
    "SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind IN ('work_project','work_task')",
    [id, a.org, a.environment],
  );
  if (!row) fail(404, 'Work target not found');
  const p = await project(a, row.root_id);
  return { project_id: p.id, task_id: row.kind === 'work_task' ? row.id : null };
}
export async function workHistory(
  a: Access,
  projectId: string,
  resourceId: string,
  input: unknown = {},
) {
  const q = z
    .object({ offset: z.coerce.number().int().min(0).max(1000000).default(0) })
    .strict()
    .parse(input);
  await project(a, projectId);
  const p = await read(a, resourceId, resourceId === projectId ? 'work_project' : 'work_task');
  if (p.root_id !== projectId) fail(404, 'Resource not found');
  const rows = await history(a, p, 101, q.offset);
  return { data: rows.slice(0, 100), has_more: rows.length > 100, offset: q.offset, limit: 100 };
}
