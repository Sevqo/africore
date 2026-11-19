import { useState } from 'react';
import { WorkDependencyPicker } from './WorkDependencyPicker';
import { createsWorkCycle } from './work-app-model';
import { WorkRecordLinks } from './WorkRecordLinks';
import { Field, Form, type API } from '../operations/UI';
export function ProjectEditor({
  project: p,
  usedStages = [],
  members,
  api,
  onSaved,
  onClose,
}: {
  project?: any;
  usedStages?: string[];
  members: any[];
  api: API;
  onSaved: (record?: any) => void;
  onClose: () => void;
}) {
  const [participants, setParticipants] = useState<any[]>(p?.data.members || []),
    [stages, setStages] = useState<any[]>(
      p?.data.stages || [
        { id: 'planned', name: 'Planned', complete: false },
        { id: 'in_progress', name: 'In progress', complete: false },
        { id: 'complete', name: 'Complete', complete: true },
      ],
    ),
    [milestones, setMilestones] = useState<any[]>(p?.data.milestones || []),
    [owner, setOwner] = useState(p?.data.owner_id || '');
  const [memberSearch, setMemberSearch] = useState('');
  const matchesMember = (m: any) =>
    !memberSearch ||
    (m.display_name || m.email || '').toLowerCase().includes(memberSearch.toLowerCase());
  const operational = members.filter((m) =>
    ['owner', 'admin', 'finance', 'operations'].includes(m.role),
  );
  return (
    <div className="work-edit-document">
      <section className="panel work-editor" aria-labelledby="project-editor-title">
        <h2 id="project-editor-title">{p ? 'Project settings' : 'Create a project'}</h2>
        <p>
          Private to the selected participants and workspace administrators. Participants receive
          access to this project's tasks and discussions. Financial records and personnel files
          retain their own permissions.
        </p>
        <Form
          submit={async (d) => {
            if (!stages.some((s) => s.complete) || !stages.some((s) => !s.complete))
              throw new Error('Keep at least one incomplete stage and one completed stage.');
            const value = {
              name: d.name,
              description: d.description,
              owner_id: owner,
              members: participants,
              stages,
              deadline: d.deadline || null,
              starts_on: d.starts_on || null,
              priority: d.priority,
              planned_minutes: Number(d.planned_minutes),
              status: d.status,
              customer_id: d.customer || null,
              order_id: d.order || null,
              milestones,
            };
            const result = await api(
              '/work/projects' + (p ? '/' + p.id : ''),
              p ? 'PUT' : 'POST',
              p ? { expected_version: p.version, project: value } : value,
            );
            onSaved(result);
          }}
        >
          <Field label="Project name">
            <input name="name" required maxLength={200} defaultValue={p?.data.name || ''} />
          </Field>
          <Field label="Project description">
            <textarea
              name="description"
              maxLength={10000}
              defaultValue={p?.data.description || ''}
            />
          </Field>
          <Field label="Find project members">
            <input
              type="search"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search name or email"
            />
          </Field>
          <div className="form-grid">
            <Field label="Project owner">
              <select
                value={owner}
                required
                onChange={(e) => {
                  setOwner(e.target.value);
                  setParticipants((v) => [
                    ...v.filter((m) => m.user_id !== e.target.value),
                    { user_id: e.target.value, permission: 'manage' },
                  ]);
                }}
              >
                <option value="">Choose current member</option>
                {owner && !operational.some((m) => m.id === owner) && (
                  <option value={owner}>Retain current project owner</option>
                )}
                {operational
                  .filter((m) => m.id === owner || matchesMember(m))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name || m.email}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Project deadline">
              <input name="deadline" type="date" defaultValue={p?.data.deadline || ''} />
            </Field>
            <Field label="Project start date">
              <input name="starts_on" type="date" defaultValue={p?.data.starts_on || ''} />
            </Field>
            <Field label="Priority">
              <select name="priority" defaultValue={p?.data.priority || 'normal'}>
                {['low', 'normal', 'high', 'urgent'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Planned effort (minutes)">
              <input
                name="planned_minutes"
                type="number"
                min={0}
                max={525600}
                defaultValue={p?.data.planned_minutes || 0}
              />
            </Field>
            <Field label="Project status">
              <select name="status" defaultValue={p?.status || 'active'}>
                {['active', 'on_hold', 'completed', 'archived'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <fieldset>
            <legend>Project participants</legend>
            {members
              .filter((m) => participants.some((p) => p.user_id === m.id) || matchesMember(m))
              .map((m) => (
                <Field key={m.id} label={m.display_name || m.email}>
                  <select
                    value={participants.find((v) => v.user_id === m.id)?.permission || ''}
                    disabled={m.id === owner}
                    onChange={(e) =>
                      setParticipants((v) => [
                        ...v.filter((n) => n.user_id !== m.id),
                        ...(e.target.value ? [{ user_id: m.id, permission: e.target.value }] : []),
                      ])
                    }
                  >
                    <option value="">No project access</option>
                    <option value="view">View project</option>
                    {operational.some((o) => o.id === m.id) && (
                      <>
                        <option value="edit">Edit tasks and discussions</option>
                        <option value="manage">Manage project and participants</option>
                      </>
                    )}
                  </select>
                </Field>
              ))}
          </fieldset>
          <fieldset>
            <legend>Board stages</legend>
            {stages.map((s, i) => (
              <div className="work-config-row" key={s.id}>
                <Field label={'Stage ' + (i + 1) + ' name'}>
                  <input
                    value={s.name}
                    required
                    maxLength={200}
                    onChange={(e) =>
                      setStages((v) =>
                        v.map((n) => (n.id === s.id ? { ...n, name: e.target.value } : n)),
                      )
                    }
                  />
                </Field>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={s.complete}
                    disabled={
                      usedStages.includes(s.id) ||
                      stages.filter((n) => n.complete === s.complete).length === 1
                    }
                    onChange={(e) =>
                      setStages((v) =>
                        v.map((n) => (n.id === s.id ? { ...n, complete: e.target.checked } : n)),
                      )
                    }
                  />
                  Completed stage
                </label>
                <button
                  className="quiet-button"
                  type="button"
                  disabled={i === 0}
                  onClick={() =>
                    setStages((v) => {
                      const next = [...v];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      return next;
                    })
                  }
                >
                  Move stage earlier
                </button>
                <button
                  className="quiet-button"
                  type="button"
                  disabled={
                    usedStages.includes(s.id) ||
                    stages.length <= 2 ||
                    stages.filter((n) => n.complete === s.complete).length === 1
                  }
                  onClick={() => setStages((v) => v.filter((n) => n.id !== s.id))}
                >
                  Remove unused stage
                </button>
              </div>
            ))}
            <button
              className="secondary-button"
              type="button"
              disabled={stages.length >= 30}
              onClick={() =>
                setStages((v) => [
                  ...v,
                  {
                    id: 'stage_' + crypto.randomUUID().slice(0, 8),
                    name: 'New stage',
                    complete: false,
                  },
                ])
              }
            >
              Add stage
            </button>
          </fieldset>
          <fieldset>
            <legend>Milestones</legend>
            {milestones.map((m) => (
              <div className="work-config-row" key={m.id}>
                <Field label="Milestone name">
                  <input
                    value={m.name}
                    required
                    onChange={(e) =>
                      setMilestones((v) =>
                        v.map((n) => (n.id === m.id ? { ...n, name: e.target.value } : n)),
                      )
                    }
                  />
                </Field>
                <Field label="Milestone due date">
                  <input
                    type="date"
                    required
                    value={m.due_on}
                    onChange={(e) =>
                      setMilestones((v) =>
                        v.map((n) => (n.id === m.id ? { ...n, due_on: e.target.value } : n)),
                      )
                    }
                  />
                </Field>
                <Field label="Completion criteria">
                  <input
                    value={m.criteria || ''}
                    maxLength={2000}
                    onChange={(e) =>
                      setMilestones((v) =>
                        v.map((n) => (n.id === m.id ? { ...n, criteria: e.target.value } : n)),
                      )
                    }
                  />
                </Field>
                <Field label="Milestone owner">
                  <select
                    value={m.owner_id || ''}
                    onChange={(e) =>
                      setMilestones((v) =>
                        v.map((n) =>
                          n.id === m.id ? { ...n, owner_id: e.target.value || null } : n,
                        ),
                      )
                    }
                  >
                    <option value="">No owner</option>
                    {members
                      .filter((member) =>
                        p?.data.members.some(
                          (item: any) => item.user_id === member.id && item.permission !== 'view',
                        ),
                      )
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.display_name || member.email}
                        </option>
                      ))}
                  </select>
                </Field>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={m.completed}
                    onChange={(e) =>
                      setMilestones((v) =>
                        v.map((n) => (n.id === m.id ? { ...n, completed: e.target.checked } : n)),
                      )
                    }
                  />
                  Completed milestone
                </label>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => setMilestones((v) => v.filter((n) => n.id !== m.id))}
                >
                  Remove milestone
                </button>
              </div>
            ))}
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setMilestones((v) => [
                  ...v,
                  {
                    id: crypto.randomUUID(),
                    name: '',
                    due_on: '',
                    completed: false,
                    owner_id: null,
                    criteria: '',
                  },
                ])
              }
            >
              Add milestone
            </button>
          </fieldset>
          <details>
            <summary>Optional shared record references</summary>
            <p>
              Choose an authorized shared customer or order. These references do not copy a customer
              or create a financial document.
            </p>
            <WorkRecordLinks api={api} project={p} />
          </details>
          <button className="button">Save reviewed project</button>
        </Form>
        <button className="secondary-button" onClick={onClose}>
          Cancel project editing
        </button>
      </section>
    </div>
  );
}
export function TaskEditor({
  project: p,
  task: t,
  initialStage,
  initialParent,
  tasks,
  members,
  api,
  onSaved,
  onClose,
}: {
  project: any;
  task?: any;
  initialStage?: string;
  initialParent?: string;
  tasks: any[];
  members: any[];
  api: API;
  onSaved: (record?: any) => void;
  onClose: () => void;
}) {
  const [dependencies, setDependencies] = useState<string[]>(t?.data.dependencies || []),
    [checklist, setChecklist] = useState<any[]>(t?.data.checklist || []),
    [followers, setFollowers] = useState<string[]>(t?.data.followers || []),
    [parentId, setParentId] = useState(t?.parent_id || initialParent || '');
  const [memberSearch, setMemberSearch] = useState(''),
    [assignee, setAssignee] = useState(t?.data.assignee_id || ''),
    [recurrenceEnabled, setRecurrenceEnabled] = useState(!!t?.data.recurrence?.active);
  const matchesMember = (m: any) =>
    !memberSearch ||
    (m.display_name || m.email || '').toLowerCase().includes(memberSearch.toLowerCase());
  const participants = members.filter((m) => p.data.members.some((v: any) => v.user_id === m.id)),
    editors = participants.filter((m) =>
      p.data.members.some((v: any) => v.user_id === m.id && v.permission !== 'view'),
    );
  return (
    <div className="work-edit-document">
      <section className="panel work-editor" aria-labelledby="task-editor-title">
        <h2 id="task-editor-title">{t ? 'Edit task' : 'Create task'}</h2>
        <Form
          submit={async (d) => {
            if (d.starts && d.due && d.starts > d.due)
              throw new Error('Start date must not follow due date.');
            const result = await api(
              '/work/projects/' + p.id + '/tasks' + (t ? '/' + t.id : ''),
              t ? 'PUT' : 'POST',
              {
                expected_version: t?.version || 0,
                task: {
                  title: d.title,
                  description: d.description,
                  stage: d.stage,
                  assignee_id: d.assignee || null,
                  followers,
                  starts_on: d.starts || null,
                  due_on: d.due || null,
                  priority: d.priority,
                  labels: d.labels
                    .split(',')
                    .map((v: string) => v.trim())
                    .filter(Boolean),
                  parent_id: parentId || null,
                  dependencies,
                  checklist,
                  estimate_minutes: Number(d.estimate),
                  milestone_id: d.milestone_id || null,
                  task_status: d.task_status,
                  recurrence: recurrenceEnabled
                    ? {
                        rule_id: t?.data.recurrence?.rule_id || null,
                        unit: d.recurrence_unit,
                        interval: Number(d.recurrence_interval),
                        ends_on: d.recurrence_end || null,
                        next_on: t?.data.recurrence?.next_on || d.recurrence_start || undefined,
                        active: true,
                      }
                    : null,
                  recurrence_occurrence: t?.data.recurrence_occurrence || null,
                },
              },
            );
            onSaved(result);
          }}
        >
          <Field label="Task title">
            <input name="title" required maxLength={200} defaultValue={t?.data.title || ''} />
          </Field>
          <Field label="Task description">
            <textarea
              name="description"
              maxLength={20000}
              defaultValue={t?.data.description || ''}
            />
          </Field>
          <div className="form-grid">
            <Field label="Task stage">
              <select name="stage" defaultValue={t?.stage || initialStage || p.data.stages[0].id}>
                {p.data.stages.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Task status">
              <select
                name="task_status"
                defaultValue={
                  t?.data.task_status || (t?.status === 'completed' ? 'completed' : 'in_progress')
                }
              >
                {[
                  ['in_progress', 'In progress'],
                  ['changes_requested', 'Changes requested'],
                  ['approved', 'Approved'],
                  ['completed', 'Completed'],
                  ['cancelled', 'Cancelled'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Milestone">
              <select name="milestone_id" defaultValue={t?.data.milestone_id || ''}>
                <option value="">No milestone</option>
                {p.data.milestones.map((milestone: any) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Find assignees and followers">
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search project members"
              />
            </Field>
            <Field label="Task assignee">
              <select
                name="assignee"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">Unassigned</option>
                {assignee && !editors.some((m) => m.id === assignee) && (
                  <option value={assignee}>Retain current assignee</option>
                )}
                {editors
                  .filter((m) => m.id === assignee || matchesMember(m))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name || m.email}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Priority">
              <select name="priority" defaultValue={t?.data.priority || 'normal'}>
                {['low', 'normal', 'high', 'urgent'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Start date">
              <input name="starts" type="date" defaultValue={t?.data.starts_on || ''} />
            </Field>
            <Field label="Task due date">
              <input name="due" type="date" defaultValue={t?.due_on || ''} />
            </Field>
            <Field label="Estimated minutes">
              <input
                name="estimate"
                type="number"
                min={0}
                max={525600}
                defaultValue={t?.data.estimate_minutes || 0}
              />
            </Field>
          </div>
          <Field label="Labels separated by commas">
            <input name="labels" defaultValue={t?.data.labels?.join(', ') || ''} />
          </Field>
          <Field label="Parent task">
            <select name="parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Top-level task</option>
              {tasks
                .filter((n) => n.id !== t?.id)
                .map((n) => (
                  <option
                    key={n.id}
                    value={n.id}
                    disabled={createsWorkCycle(tasks, t?.id, n.id, dependencies)}
                  >
                    {n.data.title}
                  </option>
                ))}
            </select>
          </Field>
          <WorkDependencyPicker
            members={members}
            stages={p.data.stages}
            tasks={tasks}
            taskId={t?.id}
            parentId={parentId}
            value={dependencies}
            onChange={setDependencies}
          />
          <fieldset>
            <legend>Recurring task</legend>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={recurrenceEnabled}
                onChange={(e) => setRecurrenceEnabled(e.target.checked)}
              />
              Enable recurrence
            </label>
            {recurrenceEnabled && (
              <div className="form-grid">
                <Field label="Repeat interval">
                  <input
                    name="recurrence_interval"
                    type="number"
                    min={1}
                    max={365}
                    defaultValue={t?.data.recurrence?.interval || 1}
                  />
                </Field>
                <Field label="Repeat unit">
                  <select name="recurrence_unit" defaultValue={t?.data.recurrence?.unit || 'week'}>
                    {[
                      ['day', 'Days'],
                      ['week', 'Weeks'],
                      ['month', 'Months'],
                      ['year', 'Years'],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Next occurrence date">
                  <input
                    name="recurrence_start"
                    type="date"
                    defaultValue={t?.data.recurrence?.next_on || ''}
                  />
                </Field>
                <Field label="Repeat until (optional)">
                  <input
                    name="recurrence_end"
                    type="date"
                    defaultValue={t?.data.recurrence?.ends_on || ''}
                  />
                </Field>
              </div>
            )}
            <p>
              Occurrences are generated through an authorized action; opening this form does not
              create tasks.
            </p>
          </fieldset>
          <fieldset>
            <legend>Checklist</legend>
            {checklist.map((c) => (
              <div className="work-config-row" key={c.id}>
                <Field label="Checklist item">
                  <input
                    required
                    value={c.title}
                    onChange={(e) =>
                      setChecklist((v) =>
                        v.map((n) => (n.id === c.id ? { ...n, title: e.target.value } : n)),
                      )
                    }
                  />
                </Field>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={c.completed}
                    onChange={(e) =>
                      setChecklist((v) =>
                        v.map((n) => (n.id === c.id ? { ...n, completed: e.target.checked } : n)),
                      )
                    }
                  />
                  Completed item
                </label>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => setChecklist((v) => v.filter((n) => n.id !== c.id))}
                >
                  Remove checklist item
                </button>
              </div>
            ))}
            <button
              type="button"
              className="secondary-button"
              disabled={checklist.length >= 100}
              onClick={() =>
                setChecklist((v) => [
                  ...v,
                  { id: crypto.randomUUID(), title: '', completed: false },
                ])
              }
            >
              Add checklist item
            </button>
          </fieldset>
          <fieldset>
            <legend>Followers</legend>
            {participants
              .filter((m) => followers.includes(m.id) || matchesMember(m))
              .map((m) => (
                <label className="checkbox-field" key={m.id}>
                  <input
                    type="checkbox"
                    checked={followers.includes(m.id)}
                    onChange={(e) =>
                      setFollowers((v) =>
                        e.target.checked ? [...v, m.id] : v.filter((id) => id !== m.id),
                      )
                    }
                  />
                  {m.display_name || m.email}
                </label>
              ))}
          </fieldset>
          <button className="button">Save reviewed task</button>
        </Form>
        <button className="secondary-button" onClick={onClose}>
          Cancel task editing
        </button>
      </section>
    </div>
  );
}
