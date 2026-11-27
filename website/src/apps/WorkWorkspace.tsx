import { workBlocked, workQuickFilter, loadWorkDirectory } from './work-app-model';
import { WorkTaskTable } from './WorkTaskTable';
import { WorkAutomation } from './WorkAutomation';
import { WorkTemplates } from './WorkTemplates';
import { WorkReviews } from './WorkReviews';
import { MyWork } from './MyWork';
import { appNavigationEvent } from './AppNavigation';
import { WorkDateViews } from './WorkDateViews';
import { WorkTaskDetails } from './WorkTaskDetails';
import { useEffect, useRef, useState } from 'react';
import { Field, today, type API } from '../operations/UI';
import { useIdempotentAPI } from './useIdempotentAPI';
import { ProjectEditor, TaskEditor } from './WorkEditors';
import { WorkTimesheets } from './WorkTimesheets';
import { WorkProjectUpdates } from './WorkProjectUpdates';
import { WorkReports } from './WorkReports';
import { WorkSchedulePlanner } from './WorkSchedulePlanner';
import { WorkDiscussions } from './WorkDiscussions';

export function WorkWorkspace({
  api: provided,
  scope,
  section = 'dashboard',
  openRecord,
}: {
  api: API;
  scope: string;
  section?: string;
  openRecord?: (tab: string, id: string) => void;
}) {
  const api = useIdempotentAPI(provided, scope),
    [directory, setDirectory] = useState<any>(null),
    [members, setMembers] = useState<any[]>([]),
    [teamError, setTeamError] = useState(''),
    [selected, setSelected] = useState(''),
    [board, setBoard] = useState<any>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [editingProject, setEditingProject] = useState<any>(null),
    [editingTask, setEditingTask] = useState<any>(null),
    [view, setView] = useState('board'),
    [busy, setBusy] = useState(false),
    [activity, setActivity] = useState<any[]>([]),
    [query, setQuery] = useState(''),
    [quickFilter, setQuickFilter] = useState('all'),
    [projectFilter, setProjectFilter] = useState('all'),
    [projectMode, setProjectMode] = useState('cards'),
    [projectGroup, setProjectGroup] = useState('none'),
    [statusFilter, setStatusFilter] = useState('all'),
    [assigneeFilter, setAssigneeFilter] = useState('all'),
    [workspaceMeetings, setWorkspaceMeetings] = useState<any[]>([]),
    [workspaceActivities, setWorkspaceActivities] = useState<any[]>([]),
    [myAssignedTasksCount, setMyAssignedTasksCount] = useState(0),
    [focusChannelId, setFocusChannelId] = useState<string | undefined>(undefined);
  const targetRequest = useRef(0);
  const [viewing, setViewing] = useState<any>(null),
    [targetTask, setTargetTask] = useState('');
  useEffect(() => {
    let live = true;
    const resolve = () => {
      const request = ++targetRequest.current;
      const target = new URL(location.href).searchParams.get('work_target');
      if (target && /^[0-9a-f-]{36}$/i.test(target)) {
        api('/work/target/' + target)
          .then((r) => {
            if (live && request === targetRequest.current) {
              setSelected(r.project_id);
              setViewing(null);
              setQuery('');
              setTargetTask(r.task_id || '');
              const requested = new URL(location.href).searchParams.get('work_view');
              setView(
                requested &&
                  [
                    'board',
                    'list',
                    'calendar',
                    'timeline',
                    'my-work',
                    'workload',
                    'report',
                    'timesheets',
                    'planning',
                    'reporting',
                    'configuration',
                  ].includes(requested)
                  ? requested
                  : 'board',
              );
            }
          })
          .catch((e) => {
            if (live && request === targetRequest.current) setError(e.message);
          });
      } else {
        setSelected('');
        setViewing(null);
        setBoard(null);
      }
    };
    resolve();
    addEventListener(appNavigationEvent, resolve);
    addEventListener('popstate', resolve);
    return () => {
      live = false;
      removeEventListener(appNavigationEvent, resolve);
      removeEventListener('popstate', resolve);
    };
  }, [scope]);
  useEffect(() => {
    if (board && targetTask && board.tasks.some((t: any) => t.id === targetTask)) {
      setViewing(board.tasks.find((t: any) => t.id === targetTask));
      setTargetTask('');
    }
  }, [board, targetTask]);
  useEffect(() => {
    setViewing(null);
    setSelected('');
    setBoard(null);
    setEditingTask(null);
    setEditingProject(null);
    setActivity([]);
    setDirectory(null);
  }, [scope]);
  useEffect(() => {
    let current = true;
    setTeamError('');
    api('/work/my-work')
      .then((res) => {
        if (current) {
          setWorkspaceMeetings(res?.meetings || []);
          setWorkspaceActivities(res?.activities || []);
          setMyAssignedTasksCount(Number(res?.total || 0));
        }
      })
      .catch(() => {
        if (current) {
          setWorkspaceMeetings([]);
          setWorkspaceActivities([]);
          setMyAssignedTasksCount(0);
        }
      });
    void loadWorkDirectory(
      api,
      (d) => {
        if (current) setDirectory(d);
      },
      (data) => {
        if (current) setMembers(data);
      },
      (message) => {
        if (current) setError(message);
      },
      (message) => {
        if (current) {
          setMembers([]);
          setTeamError(message);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [scope, revision]);
  useEffect(() => {
    let current = true;
    setBoard(null);
    setViewing(null);
    setActivity([]);
    if (selected)
      api('/work/projects/' + selected)
        .then((d) => {
          if (current) setBoard(d);
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    return () => {
      current = false;
    };
  }, [scope, selected, revision]);
  useEffect(() => {
    if (section === 'discussions') {
      setSelected('');
      setViewing(null);
      setView('discussions');
      return;
    }
    if (
      [
        'calendar',
        'timeline',
        'workload',
        'my-work',
        'workflows',
        'timesheets',
        'planning',
        'reporting',
        'configuration',
      ].includes(section)
    )
      setView(section);
    else if (section === 'dashboard' || section === 'board') setView('board');
  }, [section]);
  function recordUrl(id: string, nextView = view) {
    const url = new URL(location.href);
    url.searchParams.set('work_target', id);
    url.searchParams.set('work_view', nextView);
    history.pushState(null, '', url.pathname + url.search + url.hash);
  }
  function changeView(next: string) {
    setViewing(null);
    setView(next);
    const url = new URL(location.href);
    url.searchParams.set('work_view', next);
    if (selected) url.searchParams.set('work_target', selected);
    history.pushState(null, '', url.pathname + url.search + url.hash);
  }
  function openTask(task: any) {
    recordUrl(task.id);
    setViewing(task);
  }
  function saved(label: string) {
    setBoard(null);
    setViewing(null);
    setEditingProject(null);
    setEditingTask(null);
    setRevision((v) => v + 1);
    setNotice(label);
  }
  const p = board?.project,
    tasks = board?.tasks || [],
    name = (id: string) =>
      members.find((m) => m.id === id)?.display_name ||
      members.find((m) => m.id === id)?.email ||
      'Unassigned',
    filtered = tasks.filter(
      (t: any) =>
        workQuickFilter(t, tasks, quickFilter, today()) &&
        (statusFilter === 'all' || t.status === statusFilter) &&
        (assigneeFilter === 'all' ||
          (assigneeFilter === 'unassigned'
            ? !t.data.assignee_id
            : t.data.assignee_id === assigneeFilter)) &&
        (!query ||
          [t.data.title, t.data.description, ...t.data.labels]
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (view !== 'my-work' || t.data.assignee_id === directory?.actor_id),
    );
  const projects = (directory?.data || [])
    .filter(
      (item: any) =>
        (projectFilter === 'all' ||
          (projectFilter === 'mine'
            ? item.owner_id === directory.actor_id
            : item.status === projectFilter)) &&
        [item.data.name, item.data.description, name(item.owner_id), item.status]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a: any, b: any) => {
      const key = (v: any) =>
        projectGroup === 'owner' ? name(v.owner_id) : projectGroup === 'status' ? v.status : '';
      return key(a).localeCompare(key(b)) || a.data.name.localeCompare(b.data.name);
    });
  useEffect(() => {
    if (view === 'configuration' && board?.project) {
      if (board.permissions.manage) setEditingProject(board.project);
      else setError('Project configuration requires project management access.');
    }
  }, [view, board?.project?.id, board?.permissions?.manage]);
  async function move(task: any, stage: string, before: string | null) {
    if (!board || busy || !board.permissions.write) return;
    const previous = board;
    setBusy(true);
    setError('');
    const ordered = tasks.filter((t: any) => t.id !== task.id && t.stage === stage),
      index = before ? ordered.findIndex((t: any) => t.id === before) : ordered.length;
    ordered.splice(index < 0 ? ordered.length : index, 0, { ...task, stage });
    setBoard({
      ...board,
      tasks: tasks
        .filter((t: any) => t.id !== task.id && t.stage !== stage)
        .concat(ordered.map((t: any, i: number) => ({ ...t, position: i }))),
    });
    try {
      await api('/work/projects/' + p.id + '/move', 'POST', {
        expected_project_version: p.version,
        task_id: task.id,
        expected_task_version: task.version,
        stage,
        before_id: before,
      });
      setNotice('Task move saved.');
      setRevision((v) => v + 1);
    } catch (e) {
      setBoard(previous);
      setError((e as Error).message);
      setRevision((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory(task: any) {
    setError('');
    try {
      setActivity((await api('/work/projects/' + p.id + '/history/' + task.id)).data);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function card(t: any) {
    const same = tasks
        .filter((n: any) => n.stage === t.stage)
        .sort((a: any, b: any) => a.position - b.position),
      index = same.findIndex((n: any) => n.id === t.id);
    return (
      <article
        key={t.id}
        className="panel work-task"
        draggable={!!board.permissions.write && !busy}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', t.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (board.permissions.write) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const source = tasks.find((n: any) => n.id === e.dataTransfer.getData('text/plain'));
          if (source && source.id !== t.id) void move(source, t.stage, t.id);
        }}
      >
        <h4>
          <button className="quiet-button work-task-title" onClick={() => openTask(t)}>
            {t.data.title}
          </button>
        </h4>
        <p>{name(t.data.assignee_id)}</p>
        <p>
          {t.due_on ? 'Due ' + t.due_on : 'No due date'} · {t.status}
        </p>
        {t.data.labels.length > 0 && (
          <div className="work-tags">
            {t.data.labels.map((label: string) => (
              <span className="badge" key={label}>
                {label}
              </span>
            ))}
          </div>
        )}
        <div className="work-card-footer">
          <span aria-label={t.data.priority + ' priority'}>
            {'★'.repeat(
              ({ low: 0, normal: 1, high: 2, urgent: 3 } as Record<string, number>)[
                t.data.priority
              ] || 0,
            )}
            {'☆'.repeat(
              3 -
                (({ low: 0, normal: 1, high: 2, urgent: 3 } as Record<string, number>)[
                  t.data.priority
                ] || 0),
            )}
          </span>
          <span className="work-avatar" title={name(t.data.assignee_id)}>
            {t.data.assignee_id ? name(t.data.assignee_id).slice(0, 2).toUpperCase() : '—'}
          </span>
        </div>
        {t.data.dependencies.length > 0 && <p>{t.data.dependencies.length} prerequisite task(s)</p>}
        {workBlocked(t, tasks) && t.status === 'open' && (
          <p className="work-blocked">
            Completion blocked: review prerequisites, subtasks or checklist.
          </p>
        )}
        <p>
          {t.data.checklist.filter((c: any) => c.completed).length}/{t.data.checklist.length}{' '}
          checklist · {tasks.filter((n: any) => n.parent_id === t.id).length} subtasks
        </p>
        <details className="work-task-actions">
          <summary>Task actions</summary>
          <div className="work-task-controls">
            <button className="quiet-button" onClick={() => openTask(t)}>
              View task
            </button>
            <button
              className="quiet-button"
              disabled={!board.permissions.write || busy}
              onClick={() => setEditingTask(t)}
            >
              Edit task
            </button>
            <button className="quiet-button" onClick={() => void loadHistory(t)}>
              View task history
            </button>
            <Field label={'Move ' + t.data.title + ' to stage'}>
              <select
                value={t.stage}
                disabled={!board.permissions.write || busy}
                onChange={(e) => void move(t, e.target.value, null)}
              >
                {p.data.stages.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="quiet-button"
              disabled={!board.permissions.write || busy || index === 0}
              onClick={() => void move(t, t.stage, same[index - 1].id)}
            >
              Move task earlier
            </button>
            <button
              className="quiet-button"
              disabled={!board.permissions.write || busy || index === same.length - 1}
              onClick={() => void move(t, t.stage, same[index + 2]?.id || null)}
            >
              Move task later
            </button>
          </div>
        </details>
      </article>
    );
  }
  if (section === 'templates')
    return (
      <WorkTemplates
        api={api}
        scope={scope}
        onCreated={(id) => {
          const url = new URL(location.href);
          url.searchParams.set('app', 'work');
          url.searchParams.set('section', 'board');
          url.searchParams.set('work_target', id);
          url.hash = 'Apps';
          history.pushState(null, '', url.pathname + url.search + url.hash);
          setSelected(id);
          setView('board');
          setNotice('Private project prepared from the reviewed sources.');
          dispatchEvent(new Event('popstate'));
          dispatchEvent(new Event(appNavigationEvent));
        }}
      />
    );
  if (view === 'timesheets')
    return (
      <div className="apps-workspace work-app">
        <nav className="work-module-nav" aria-label="Work modules">
          <button onClick={() => changeView('board')}>Projects</button>
          <button
            onClick={() => {
              setSelected('');
              changeView('my-work');
            }}
          >
            My Tasks
          </button>
          <button
            onClick={() => {
              setSelected('');
              changeView('discussions');
            }}
          >
            Discussions
          </button>
          <button onClick={() => changeView('planning')}>Planning</button>
          <button aria-current="page" onClick={() => changeView('timesheets')}>
            Timesheets
          </button>
          <button onClick={() => changeView(selected ? 'report' : 'reporting')}>Reporting</button>
          <button disabled={!board?.permissions.manage} onClick={() => setEditingProject(p)}>
            Configuration
          </button>
        </nav>
        <WorkTimesheets api={api} revision={revision} members={members} />
      </div>
    );
  return (
    <div className="apps-workspace work-app">
      <nav className="work-module-nav" aria-label="Work modules">
        <button
          onClick={() => {
            setSelected('');
            setViewing(null);
            setQuery('');
            setView('board');
            const url = new URL(location.href);
            url.searchParams.delete('work_target');
            history.pushState(null, '', url.pathname + url.search + url.hash);
          }}
        >
          Projects
        </button>
        <button
          onClick={() => {
            setSelected('');
            changeView('my-work');
          }}
        >
          My Tasks &amp; Schedule
          {workspaceMeetings.length + workspaceActivities.length + myAssignedTasksCount > 0
            ? ` (${workspaceMeetings.length + workspaceActivities.length + myAssignedTasksCount})`
            : ''}
        </button>
        <button
          onClick={() => {
            setSelected('');
            changeView('calendar');
          }}
        >
          Calendar
        </button>
        <button
          aria-current={view === 'discussions' ? 'page' : undefined}
          onClick={() => {
            setSelected('');
            changeView('discussions');
          }}
        >
          Discussions
        </button>
        <button onClick={() => changeView(selected ? 'timeline' : 'planning')}>Planning</button>
        <button onClick={() => changeView('timesheets')}>Timesheets</button>
        <button onClick={() => changeView(selected ? 'report' : 'reporting')}>Reporting</button>
        <button
          disabled={!selected || !board?.permissions.manage}
          onClick={() => setEditingProject(p)}
        >
          Configuration
        </button>
      </nav>
      {teamError && (
        <p className="alert" role="status">
          Member information unavailable: {teamError}{' '}
          <button className="quiet-button" onClick={() => setRevision((v) => v + 1)}>
            Retry member lookup
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!directory && !error && <p role="status">Loading authorized projects…</p>}
      {directory && !viewing && !selected && !editingProject && !editingTask && (
        <>
          {view === 'my-work' && (
            <MyWork
              api={api}
              scope={scope}
              revision={revision}
              onProject={(id) => {
                setSelected(id);
                setView('board');
              }}
            />
          )}
          {view === 'planning' && (
            <section className="panel">
              <h2>Planning</h2>
              <p>Choose an authorized project to open its scheduled task timeline.</p>
              <Field label="Project">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelected(e.target.value);
                      setView('timeline');
                      recordUrl(e.target.value, 'timeline');
                    }
                  }}
                >
                  <option value="">Choose a project</option>
                  {directory.data.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.data.name}
                    </option>
                  ))}
                </select>
              </Field>
            </section>
          )}
          {view === 'configuration' && (
            <section className="panel">
              <h2>Project configuration</h2>
              <p>
                Choose a project you manage to edit its dates, stages, milestones, participants and
                planning settings.
              </p>
              <Field label="Project">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelected(e.target.value);
                      recordUrl(e.target.value, 'configuration');
                    }
                  }}
                >
                  <option value="">Choose a project</option>
                  {directory.data.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.data.name}
                    </option>
                  ))}
                </select>
              </Field>
            </section>
          )}
          {view === 'reporting' && (
            <WorkReports api={api} projects={directory.data} members={members} />
          )}
          {view === 'calendar' && (
            <WorkDateViews
              tasks={[]}
              milestones={[]}
              meetings={workspaceMeetings}
              view="calendar"
              onOpen={openTask}
            />
          )}
          {view === 'discussions' && (
            <WorkDiscussions api={api} scope={scope} initialChannelId={focusChannelId} />
          )}
          {view !== 'my-work' && !['reporting', 'planning', 'configuration', 'calendar', 'discussions'].includes(view) && (
            <>
              {(workspaceMeetings.length > 0 || workspaceActivities.length > 0) && (
                <section className="panel" aria-label="Upcoming schedule and assigned work">
                  <div className="section-heading">
                    <div>
                      <h2>Upcoming meetings &amp; assigned schedule</h2>
                      <p>
                        Synced directly from Workspace Calendar and cross-app assignments so every
                        team member stays up to date inside Work.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setSelected('');
                        changeView('my-work');
                      }}
                    >
                      Open full schedule &amp; RSVP
                    </button>
                  </div>
                  <div className="app-directory">
                    {workspaceMeetings.slice(0, 4).map((m: any) => (
                      <article className="panel" key={m.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <strong>{m.title}</strong>
                          <span className="badge">
                            {m.invited ? `Invited (${m.my_response})` : m.my_response}
                          </span>
                        </div>
                        <p style={{ margin: '6px 0', fontSize: 13 }}>
                          {new Date(m.start).toLocaleString('en-KE', {
                            timeZone: m.timezone || 'Africa/Nairobi',
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                          {m.location ? ` · ${m.location}` : ''}
                        </p>
                      </article>
                    ))}
                    {workspaceActivities.slice(0, 4).map((act: any) => (
                      <article className="panel" key={act.kind + ':' + act.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <strong>{act.title}</strong>
                          <span className="badge">{act.kind.replaceAll('_', ' ')}</span>
                        </div>
                        <p style={{ margin: '6px 0', fontSize: 13 }}>
                          Status: {act.status}
                          {act.due_on ? ` · Due ${act.due_on}` : ''}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <section className="panel">
              <div className="section-heading">
                <h2>Projects</h2>
                <button
                  className="button"
                  disabled={!directory.can_create || !members.length}
                  onClick={() => setEditingProject({ new: true })}
                >
                  Create project
                </button>
              </div>
              <p>
                Projects are private to their participants and workspace administrators. Task counts
                cover the selected project.
              </p>
              {directory.truncated && (
                <p role="status">Showing the first {directory.limit} authorized projects.</p>
              )}
              {!selected && (
                <div className="work-toolbar">
                  <Field label="Search projects">
                    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </Field>
                  <Field label="Project filter">
                    <select
                      value={projectFilter}
                      onChange={(e) => setProjectFilter(e.target.value)}
                    >
                      {['all', 'mine', 'active', 'on_hold', 'completed', 'archived'].map((v) => (
                        <option key={v} value={v}>
                          {v === 'mine'
                            ? 'My projects'
                            : v === 'all'
                              ? 'All authorized projects'
                              : v.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Group projects by">
                    <select value={projectGroup} onChange={(e) => setProjectGroup(e.target.value)}>
                      <option value="none">None</option>
                      <option value="owner">Owner</option>
                      <option value="status">Status</option>
                    </select>
                  </Field>
                  <button
                    className="secondary-button"
                    aria-pressed={projectMode === 'cards'}
                    onClick={() => setProjectMode('cards')}
                  >
                    Cards
                  </button>
                  <button
                    className="secondary-button"
                    aria-pressed={projectMode === 'list'}
                    onClick={() => setProjectMode('list')}
                  >
                    List
                  </button>
                </div>
              )}
              {!selected && projectMode === 'cards' && (
                <div className="project-directory">
                  {projects.map((project: any, index: number) => (
                    <div className="work-project-card-wrap" key={project.id}>
                      {projectGroup !== 'none' &&
                        (index === 0 ||
                          (projectGroup === 'owner'
                            ? project.owner_id !== projects[index - 1].owner_id
                            : project.status !== projects[index - 1].status)) && (
                          <h3>
                            {projectGroup === 'owner' ? name(project.owner_id) : project.status}
                          </h3>
                        )}
                      <button
                        className="project-directory-card"
                        key={project.id}
                        onClick={() => {
                          setViewing(null);
                          setView('board');
                          recordUrl(project.id, 'board');
                          setSelected(project.id);
                          setQuery('');
                        }}
                      >
                        <span className="project-directory-icon" aria-hidden="true">
                          {project.data.name.slice(0, 1).toUpperCase()}
                        </span>
                        <strong>{project.data.name}</strong>
                        <p>{project.data.description || 'Private project workspace'}</p>
                        <p>
                          {name(project.owner_id)}
                          {project.due_on ? ' · Due ' + project.due_on : ''}
                        </p>
                        <small>
                          <strong>{project.task_summary?.total ?? '—'} Tasks</strong> ·{' '}
                          {project.task_summary?.completed ?? '—'} completed ·{' '}
                          {project.task_summary?.overdue ?? '—'} overdue · {project.status} ·{' '}
                          {project.data.milestones.filter((m: any) => m.completed).length}/
                          {project.data.milestones.length} milestones
                        </small>
                        <span className="work-card-members" aria-label="Project participants">
                          {project.data.members.slice(0, 5).map((m: any) => (
                            <span
                              className="work-assignee-avatar"
                              key={m.user_id}
                              title={name(m.user_id)}
                            >
                              {name(m.user_id)
                                .split(' ')
                                .map((v: string) => v[0])
                                .slice(0, 2)
                                .join('')}
                            </span>
                          ))}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!selected && projectMode === 'list' && (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Owner</th>
                        <th>Deadline</th>
                        <th>Status</th>
                        <th>Tasks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((item: any) => (
                        <tr key={item.id}>
                          <td>
                            <button
                              className="quiet-button"
                              onClick={() => {
                                recordUrl(item.id, 'board');
                                setSelected(item.id);
                                setQuery('');
                              }}
                            >
                              {item.data.name}
                            </button>
                          </td>
                          <td>{name(item.owner_id)}</td>
                          <td>{item.due_on || 'Unscheduled'}</td>
                          <td>{item.status}</td>
                          <td>{item.task_summary?.total ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!projects.length && <p>No projects match the current search and filters.</p>}
              <Field label="Open project">
                <select
                  value={selected}
                  onChange={(e) => {
                    setBoard(null);
                    setViewing(null);
                    setSelected(e.target.value);
                    setQuery('');
                    if (e.target.value) recordUrl(e.target.value, 'board');
                  }}
                >
                  <option value="">Choose a project</option>
                  {directory.data.map((n: any) => (
                    <option key={n.id} value={n.id}>
                      {n.data.name} · {n.status}
                    </option>
                  ))}
                </select>
              </Field>
              {!directory.data.length && (
                <p>
                  No projects are visible to you yet.{' '}
                  {!directory.can_create
                    ? 'A workspace owner, administrator or operational member can create a project and invite you.'
                    : !members.length
                      ? 'Load current Team members before choosing a project owner.'
                      : 'Create a project to start your task board.'}
                </p>
              )}
            </section>
            </>
          )}
        </>
      )}
      {selected && !board && !error && <p role="status">Loading project tasks…</p>}
      {board && !viewing && !editingProject && !editingTask && (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>{p.data.name}</h2>
              {openRecord && p.data.customer_id && (
                <button
                  className="quiet-button"
                  onClick={() => openRecord('Customers', p.data.customer_id)}
                >
                  Open customer
                </button>
              )}
              {openRecord && p.data.order_id && (
                <button
                  className="quiet-button"
                  onClick={() => openRecord('Orders', p.data.order_id)}
                >
                  Open linked order
                </button>
              )}
              <button
                className="secondary-button"
                onClick={() => {
                  setFocusChannelId('project:' + p.id);
                  setSelected('');
                  setViewing(null);
                  const url = new URL(location.href);
                  url.searchParams.delete('work_target');
                  url.searchParams.set('work_view', 'discussions');
                  history.pushState(null, '', url.pathname + url.search + url.hash);
                  setView('discussions');
                }}
              >
                Open #project channel
              </button>
              <button
                className="secondary-button"
                disabled={!board.permissions.manage || busy}
                onClick={() => setEditingProject(p)}
              >
                Project settings
              </button>
            </div>
            <details className="work-project-information">
              <summary>
                Project information · {tasks.length} loaded tasks · {p.status}
              </summary>
              <p>{p.data.description}</p>
              <details className="work-management">
                <summary>Project reviews and workflows</summary>
                <WorkAutomation
                  key={'rules:' + p.id}
                  api={api}
                  scope={scope}
                  project={p}
                  expanded={view === 'workflows'}
                  onSaved={() =>
                    saved('Private workflow policy saved. A fresh separate review is required.')
                  }
                />
                <WorkReviews
                  key={p.id}
                  api={api}
                  project={p}
                  members={members}
                  actor={directory?.actor_id}
                  canRequest={board.permissions.manage}
                  onSaved={() =>
                    saved('Exact project review saved. Financial actions remain separate.')
                  }
                />
              </details>
              <p>
                {p.status.replaceAll('_', ' ')} · Owner {name(p.owner_id)} ·{' '}
                {p.due_on ? 'Deadline ' + p.due_on : 'No deadline'} · Board version {p.version}
              </p>
              <div className="work-summary-strip">
                {[
                  ['Open tasks', tasks.filter((t: any) => t.status === 'open').length],
                  [
                    'Assigned to me',
                    tasks.filter(
                      (t: any) => t.data.assignee_id === directory?.actor_id && t.status === 'open',
                    ).length,
                  ],
                  [
                    'Overdue tasks',
                    tasks.filter((t: any) => t.status === 'open' && t.due_on && t.due_on < today())
                      .length,
                  ],
                  ['Completed', tasks.filter((t: any) => t.status === 'completed').length],
                ].map(([label, value]) => (
                  <article key={String(label)}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </article>
                ))}
              </div>
              {p.data.milestones.length > 0 && (
                <>
                  <h3>Milestones</h3>
                  {p.data.milestones.map((m: any) => (
                    <p key={m.id}>
                      {m.name} · {m.due_on} · {m.completed ? 'Completed' : 'Upcoming'}
                    </p>
                  ))}
                </>
              )}
              <p>{board.coverage}</p>
              {(board.tasks_truncated ?? board.truncated) && (
                <p className="alert">This view is truncated; totals cover returned records.</p>
              )}
            </details>
          </section>
          <nav className="app-service-chips" aria-label="Project views">
            {[
              'board',
              'list',
              'calendar',
              'timeline',
              'my-work',
              'workload',
              'report',
              'updates',
            ].map((v) => (
              <button
                key={v}
                className="secondary-button"
                aria-current={view === v ? 'page' : undefined}
                onClick={() => changeView(v)}
              >
                {v.replaceAll('-', ' ')}
              </button>
            ))}
          </nav>
          {!['workload', 'updates'].includes(view) && (
            <div className="work-toolbar">
              <Field label="Search loaded project tasks">
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
              </Field>
              <Field label="Quick filter">
                <select value={quickFilter} onChange={(e) => setQuickFilter(e.target.value)}>
                  <option value="all">All tasks</option>
                  <option value="overdue">Overdue</option>
                  <option value="priority">High priority</option>
                  <option value="blocked">Blocked completion</option>
                  <option value="week">Due this week</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  {['all', 'open', 'completed', 'cancelled'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Assignee">
                <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                  <option value="all">All project assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {p.data.members.map((m: any) => (
                    <option key={m.user_id} value={m.user_id}>
                      {name(m.user_id)}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="button"
                disabled={!board.permissions.write || busy || p.status !== 'active'}
                onClick={() => setEditingTask({ new: true })}
              >
                Create task
              </button>
            </div>
          )}
          {view === 'board' ? (
            <div className="work-board">
              {p.data.stages.map((s: any) => (
                <section
                  key={s.id}
                  className="work-stage"
                  aria-label={s.name + ' tasks'}
                  onDragOver={(e) => {
                    if (board.permissions.write) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const source = tasks.find(
                      (t: any) => t.id === e.dataTransfer.getData('text/plain'),
                    );
                    if (source) void move(source, s.id, null);
                  }}
                >
                  <h3>
                    {s.name} <small>{filtered.filter((t: any) => t.stage === s.id).length}</small>
                    <button
                      className="quiet-button"
                      disabled={!board.permissions.write || p.status !== 'active'}
                      aria-label={'Add task to ' + s.name}
                      onClick={() => setEditingTask({ new: true, stage: s.id })}
                    >
                      +
                    </button>
                  </h3>
                  {!filtered.some((t: any) => t.stage === s.id) && (
                    <p className="work-stage-empty">
                      {board.permissions.write ? 'Drop a task here' : 'No matching tasks'}
                    </p>
                  )}
                  {filtered
                    .filter((t: any) => t.stage === s.id)
                    .sort((a: any, b: any) => a.position - b.position)
                    .map(card)}
                </section>
              ))}
            </div>
          ) : ['list', 'my-work'].includes(view) ? (
            <section className="panel">
              <h3>{view === 'my-work' ? 'My assigned tasks' : 'Project task list'}</h3>
              {filtered.length ? (
                <WorkTaskTable
                  projectName={p.data.name}
                  tasks={filtered}
                  stages={p.data.stages}
                  name={name}
                  open={openTask}
                />
              ) : (
                <p>No matching tasks.</p>
              )}
            </section>
          ) : ['calendar', 'timeline'].includes(view) ? (
            <>
              <WorkDateViews
                tasks={filtered}
                milestones={p.data.milestones}
                meetings={workspaceMeetings}
                view={view}
                onOpen={openTask}
              />
              {view === 'timeline' && board.permissions.write && (
                <WorkSchedulePlanner
                  api={api}
                  projectId={p.id}
                  tasks={tasks}
                  changed={() => setRevision((v) => v + 1)}
                />
              )}
            </>
          ) : view === 'report' ? (
            <WorkReports
              api={api}
              projects={directory?.data || []}
              projectId={p.id}
              members={members}
            />
          ) : view === 'updates' ? (
            <WorkProjectUpdates
              project={p}
              tasks={tasks}
              members={members}
              api={api}
              canManage={board.permissions.manage}
              revision={revision}
              changed={() => setRevision((v) => v + 1)}
            />
          ) : view === 'workload' ? (
            <section className="panel">
              <h3>Current team workload</h3>
              <p>
                Open assignments and their recorded estimates in this project; this is not
                attendance or payroll.
              </p>
              {[
                ...new Set(
                  tasks.filter((t: any) => t.status === 'open').map((t: any) => t.data.assignee_id),
                ),
              ].map((id: any) => {
                const assigned = tasks.filter(
                  (t: any) => t.status === 'open' && t.data.assignee_id === id,
                );
                return (
                  <p key={id || 'unassigned'}>
                    {name(id)} · {assigned.length} tasks ·{' '}
                    {assigned.reduce((sum: number, t: any) => sum + t.data.estimate_minutes, 0)}{' '}
                    estimated minutes
                  </p>
                );
              })}
            </section>
          ) : view === 'workflows' ? null : null}
          {activity.length > 0 && (
            <section className="panel">
              <h3>Saved task revisions</h3>
              {activity.map((v) => (
                <details key={v.version}>
                  <summary>
                    Version {v.version} · {v.action} · {new Date(v.created_at).toLocaleString()}
                  </summary>
                  <p>
                    {v.snapshot.data.title} · {v.snapshot.stage} · {v.snapshot.status}
                  </p>
                  <p>{v.snapshot.data.description}</p>
                </details>
              ))}
            </section>
          )}
        </>
      )}
      {viewing && p && (
        <WorkTaskDetails
          key={viewing.id}
          task={viewing}
          project={p}
          tasks={tasks}
          members={members}
          api={api}
          writable={board.permissions.write}
          onOpen={openTask}
          onSubtask={() => {
            setEditingTask({
              new: true,
              parent_id: viewing.id,
              stage: p.data.stages.find((s: any) => !s.complete)?.id,
            });
            setViewing(null);
          }}
          onEdit={() => {
            setEditingTask(viewing);
            setViewing(null);
          }}
          onDiscuss={() => {
            setFocusChannelId('project:' + p.id);
            setViewing(null);
            setSelected('');
            const url = new URL(location.href);
            url.searchParams.delete('work_target');
            url.searchParams.set('work_view', 'discussions');
            history.pushState(null, '', url.pathname + url.search + url.hash);
            setView('discussions');
          }}
          onClose={() => {
            if (p) recordUrl(p.id);
            setViewing(null);
          }}
        />
      )}{' '}
      {editingProject && (
        <ProjectEditor
          key={editingProject.id || 'new-project'}
          project={editingProject.new ? undefined : editingProject}
          usedStages={editingProject.id === p?.id ? tasks.map((t: any) => t.stage) : []}
          members={members}
          api={api}
          onSaved={(record) => {
            saved('Project saved.');
            if (record?.id) {
              setSelected(record.id);
              setView('board');
              recordUrl(record.id, 'board');
            }
          }}
          onClose={() => setEditingProject(null)}
        />
      )}{' '}
      {editingTask && p && (
        <TaskEditor
          key={editingTask.id || 'new-task'}
          project={p}
          task={editingTask.new ? undefined : editingTask}
          initialStage={editingTask.stage}
          initialParent={editingTask.parent_id}
          tasks={tasks}
          members={members}
          api={api}
          onSaved={(record) => {
            saved('Task saved.');
            const id = record?.task?.id || record?.id;
            if (id) {
              setTargetTask(id);
              recordUrl(id);
            }
          }}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
