import { DocumentAttachments } from './DocumentAttachments';
import { useState } from 'react';
import type { API } from '../operations/UI';
export function WorkTaskDetails({
  task: t,
  project,
  tasks,
  members,
  api,
  writable,
  onOpen,
  onEdit,
  onSubtask,
  onDiscuss,
  onClose,
}: {
  task: any;
  project: any;
  tasks: any[];
  members: any[];
  api: API;
  writable: boolean;
  onOpen: (task: any) => void;
  onEdit: () => void;
  onSubtask: () => void;
  onDiscuss: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState('description');
  const [history, setHistory] = useState<any[]>([]),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [error, setError] = useState(''),
    name = (id: string) =>
      members.find((m) => m.id === id)?.display_name ||
      members.find((m) => m.id === id)?.email ||
      'Former or unassigned member';
  async function load(start = 0) {
    try {
      const r = await api('/work/projects/' + project.id + '/history/' + t.id + '?offset=' + start);
      setHistory(r.data);
      setOffset(start);
      setMore(r.has_more);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="work-task-document">
      <section className="panel work-task-sheet" aria-labelledby="work-task-detail-title">
        <button className="quiet-button" onClick={onClose}>
          ← Back to tasks
        </button>
        <nav className="work-stage-progress" aria-label="Task stage">
          {project.data.stages.map((s: any) => (
            <span key={s.id} aria-current={t.stage === s.id ? 'step' : undefined}>
              {s.name}
            </span>
          ))}
        </nav>
        <h2 id="work-task-detail-title">{t.data.title}</h2>
        <p>
          Version {t.version} · {t.status} · {t.data.priority} priority
        </p>
        <div className="form-actions">
          {writable && (
            <button className="button" onClick={onEdit}>
              Edit task
            </button>
          )}
          <button className="secondary-button" onClick={onDiscuss}>
            Discussion
          </button>
        </div>
        <dl className="work-task-facts">
          <dt>Project</dt>
          <dd>{project.data.name}</dd>
          <dt>Stage</dt>
          <dd>{project.data.stages.find((s: any) => s.id === t.stage)?.name || t.stage}</dd>
          <dt>Assignee</dt>
          <dd>{name(t.data.assignee_id)}</dd>
          <dt>Start</dt>
          <dd>{t.data.starts_on || 'Unscheduled'}</dd>
          <dt>Due</dt>
          <dd>{t.due_on || 'Unscheduled'}</dd>
          <dt>Estimate</dt>
          <dd>{t.data.estimate_minutes} minutes · planned, not recorded time</dd>
          <dt>Labels</dt>
          <dd>{t.data.labels.join(', ') || 'None'}</dd>
        </dl>
        <nav className="work-detail-tabs" aria-label="Task information">
          {[
            ['description', 'Description'],
            ['dependencies', 'Blocked By'],
            ['checklist', 'Checklist'],
            ['subtasks', 'Subtasks'],
            ['documents', 'Documents'],
            ['discussion', 'Discussion'],
            ['history', 'History'],
          ].map(([id, label]) => (
            <button
              className="secondary-button"
              key={id}
              aria-pressed={tab === id}
              onClick={() => {
                setTab(id);
                if (id === 'discussion') onDiscuss();
                if (id === 'history') void load();
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === 'description' && (
          <p className="work-message-body">{t.data.description || 'No description recorded.'}</p>
        )}
        {t.parent_id && (
          <p>
            Parent:{' '}
            <button
              className="quiet-button"
              disabled={!tasks.some((n) => n.id === t.parent_id)}
              onClick={() => onOpen(tasks.find((n) => n.id === t.parent_id))}
            >
              {tasks.find((n) => n.id === t.parent_id)?.data.title || 'Retained parent reference'}
            </button>
          </p>
        )}
        {tab === 'dependencies' && (
          <>
            {' '}
            <h3>Prerequisites</h3>
            {t.data.dependencies.length ? (
              t.data.dependencies.map((id: string) => {
                const next = tasks.find((n) => n.id === id);
                return (
                  <p key={id}>
                    <button className="quiet-button" disabled={!next} onClick={() => onOpen(next)}>
                      {next?.data.title || 'Retained dependency'} · {next?.status}
                    </button>
                  </p>
                );
              })
            ) : (
              <p>No prerequisites recorded.</p>
            )}
          </>
        )}
        {tab === 'checklist' && (
          <>
            {' '}
            <h3>Checklist</h3>
            {t.data.checklist.length ? (
              <ul>
                {t.data.checklist.map((c: any) => (
                  <li key={c.id}>
                    {c.completed ? 'Completed' : 'Open'} · {c.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No checklist items recorded.</p>
            )}
          </>
        )}
        {tab === 'subtasks' && (
          <>
            {' '}
            <h3>Subtasks</h3>
            {writable && (
              <button className="secondary-button" onClick={onSubtask}>
                Add subtask
              </button>
            )}
            {tasks
              .filter((n) => n.parent_id === t.id)
              .map((n) => (
                <p key={n.id}>
                  <button className="quiet-button" onClick={() => onOpen(n)}>
                    {n.data.title} · {n.status}
                  </button>
                </p>
              ))}
          </>
        )}
        {tab === 'documents' && (
          <DocumentAttachments
            api={api}
            sourceKind="work_task"
            sourceId={t.id}
            writable={writable}
            allowUpload={true}
          />
        )}
        <p>Followers: {t.data.followers.map(name).join(', ') || 'None'}</p>
        <div className="form-actions">
          <button
            className="secondary-button"
            onClick={() => {
              setTab('history');
              void load();
            }}
          >
            Load task revision history
          </button>
          <button className="quiet-button" onClick={onClose}>
            Close task details
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {tab === 'history' && history.length > 0 && (
          <>
            <h3>Retained revisions</h3>
            {history.map((v) => (
              <details key={v.version}>
                <summary>
                  Version {v.version} · {v.action} · {new Date(v.created_at).toLocaleString()}
                </summary>
                <p>
                  {v.snapshot.data.title} · {v.snapshot.stage} · {v.snapshot.status}
                </p>
                <p className="work-message-body">{v.snapshot.data.description}</p>
              </details>
            ))}
            <nav className="pagination" aria-label="Task revision pages">
              <button
                className="quiet-button"
                disabled={!offset}
                onClick={() => void load(Math.max(0, offset - 100))}
              >
                Earlier revisions
              </button>
              <button
                className="quiet-button"
                disabled={!more}
                onClick={() => void load(offset + 100)}
              >
                Later revisions
              </button>
            </nav>
          </>
        )}
      </section>
    </div>
  );
}
