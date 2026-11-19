import { useEffect, useMemo, useState } from 'react';
import { Field, type API, today } from '../operations/UI';

export function WorkTimesheets({
  api,
  revision,
  members = [],
}: {
  api: API;
  revision: number;
  members?: any[];
}) {
  const [data, setData] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [projectId, setProjectId] = useState(''),
    [taskId, setTaskId] = useState(''),
    [workDate, setWorkDate] = useState(today()),
    [minutes, setMinutes] = useState('30'),
    [description, setDescription] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [elapsed, setElapsed] = useState(0),
    [editing, setEditing] = useState<any>(null),
    [offset, setOffset] = useState(0),
    [reviewNotes, setReviewNotes] = useState<Record<string, string>>({}),
    [weekStart, setWeekStart] = useState(() => {
      const date = new Date(today() + 'T12:00:00Z');
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      return date.toISOString().slice(0, 10);
    });
  const query = useMemo(() => {
    const q = new URLSearchParams({ offset: String(offset), limit: '100' });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return q.toString();
  }, [from, to, offset]);
  async function reload() {
    const result = await api('/work/timesheets?' + query);
    setData(result);
    if (!projectId && result.projects[0]) setProjectId(result.projects[0].id);
  }
  useEffect(() => {
    let live = true;
    api('/work/timesheets?' + query)
      .then((r) => {
        if (live) {
          setData(r);
          if (!projectId && r.projects[0]) setProjectId(r.projects[0].id);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [api, query, revision]);
  useEffect(() => {
    if (!data?.active_timer) {
      setElapsed(0);
      return;
    }
    const started = Date.parse(data.active_timer.started_at);
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [data?.active_timer?.id, data?.active_timer?.started_at]);
  const project = data?.projects.find((p: any) => p.id === projectId);
  function duration(seconds: number) {
    return `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;
  }
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  function moveWeek(direction: number) {
    const date = new Date(weekStart + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + direction * 7);
    setWeekStart(date.toISOString().slice(0, 10));
  }
  async function act(work: () => Promise<any>, message: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      await reload();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createEntry() {
    if (!projectId || !taskId) {
      setError('Choose a project and task first.');
      return;
    }
    await act(
      () =>
        api('/work/timesheets', 'POST', {
          project_id: projectId,
          task_id: taskId,
          work_date: workDate,
          minutes: Number(minutes),
          description,
        }),
      'Draft time entry saved.',
    );
    setDescription('');
  }
  async function startTimer() {
    if (!projectId || !taskId) {
      setError('Choose a project and task first.');
      return;
    }
    await act(
      () => api('/work/timers', 'POST', { project_id: projectId, task_id: taskId }),
      'Timer started on the server.',
    );
  }
  const own = (entry: any) => entry.owner_id === data?.actor_id;
  const name = (id: string) =>
    members.find((m) => m.id === id)?.display_name ||
    members.find((m) => m.id === id)?.email ||
    (id === data?.actor_id ? 'You' : 'Project member');
  return (
    <section className="panel work-timesheets" aria-labelledby="work-timesheets-title">
      <div className="section-heading">
        <div>
          <h2 id="work-timesheets-title">My Timesheets</h2>
          <p>Recorded effort is separate from estimates, attendance and invoices.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Loading authorized time entries…</p>}
      {data && (
        <>
          <div className="work-time-entry-form">
            <h3>Log time</h3>
            <div className="form-grid">
              <Field label="Project">
                <select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setTaskId('');
                  }}
                >
                  <option value="">Choose project</option>
                  {data.projects.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Task">
                <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">Choose task</option>
                  {project?.tasks.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Work date">
                <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
              </Field>
              <Field label="Duration (minutes)">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Description">
              <input
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did you work on?"
              />
            </Field>
            <div className="form-actions">
              <button
                className="button"
                disabled={busy || !projectId || !taskId}
                onClick={() => void createEntry()}
              >
                Save draft
              </button>
              {!data.active_timer ? (
                <button
                  className="secondary-button"
                  disabled={busy || !projectId || !taskId}
                  onClick={() => void startTimer()}
                >
                  Start timer
                </button>
              ) : (
                <div className="work-active-timer" role="status">
                  <strong>{duration(elapsed)}</strong>
                  <span>
                    {data.projects.find((p: any) => p.id === data.active_timer.project_id)?.name} ·{' '}
                    {
                      data.projects
                        .flatMap((p: any) => p.tasks)
                        .find((t: any) => t.id === data.active_timer.task_id)?.title
                    }
                  </span>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => api('/work/timers/' + data.active_timer.id + '/stop', 'POST', {}),
                        'Timer stopped and saved as a draft.',
                      )
                    }
                  >
                    Stop and save
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => api('/work/timers/' + data.active_timer.id + '/discard', 'POST', {}),
                        'Timer discarded without creating a timesheet entry.',
                      )
                    }
                  >
                    Discard timer
                  </button>
                </div>
              )}
            </div>
            <small>
              Manual entries store durations, so the system cannot detect overlap between manually
              entered periods. One active timer per user and environment is enforced.
            </small>
          </div>
          <div className="work-time-filters">
            <Field label="From">
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setOffset(0);
                }}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setOffset(0);
                }}
              />
            </Field>
            <span>
              {data.total == null ? '5,000+ possible entries' : `${data.total} matching entries`} ·{' '}
              {data.coverage}
            </span>
          </div>
          <section className="work-timesheet-week">
            <div className="section-heading">
              <h3>Weekly recorded time</h3>
              <div className="form-actions">
                <button className="secondary-button" onClick={() => moveWeek(-1)}>
                  Previous week
                </button>
                <strong>
                  {weekStart} – {weekDates[6]}
                </strong>
                <button className="secondary-button" onClick={() => moveWeek(1)}>
                  Next week
                </button>
              </div>
            </div>
            <p>
              Totals include non-rejected records (draft, submitted and approved) in the authorized
              report set. They do not represent attendance or payroll.
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Work date</th>
                    <th>Recorded time</th>
                  </tr>
                </thead>
                <tbody>
                  {weekDates.map((date) => (
                    <tr key={date}>
                      <td>{date}</td>
                      <td>{duration(data.time_totals?.by_day?.[date] || 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Week total</th>
                    <th>{duration(data.time_totals?.by_week_starting_monday?.[weekStart] || 0)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
            {data.total == null && (
              <small>Weekly totals use the capped set of most recently created entries.</small>
            )}
          </section>
          {data.project_truncated && (
            <p role="status">
              Project selection is limited to the first 1,000 authorized projects.
            </p>
          )}
          {data.data.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Project / Task</th>
                    <th>Person</th>
                    <th>Description</th>
                    <th>Time</th>
                    <th>State</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((entry: any) => {
                    const p = data.projects.find((item: any) => item.id === entry.root_id),
                      t = p?.tasks.find((item: any) => item.id === entry.parent_id),
                      canReview = p?.can_review && !own(entry);
                    return (
                      <tr key={entry.id}>
                        <td>{entry.data.work_date}</td>
                        <td>
                          {p?.name || 'Project'}
                          <br />
                          <small>{t?.title || 'Task'}</small>
                        </td>
                        <td>{name(entry.owner_id)}</td>
                        <td>
                          {entry.data.description ||
                            (entry.data.source_timer_id ? 'Server timer' : '—')}
                        </td>
                        <td>{duration(Number(entry.data.seconds || entry.data.minutes * 60))}</td>
                        <td>
                          <span className={'work-time-state is-' + entry.status}>
                            {entry.status}
                          </span>
                          {entry.data.review_note && (
                            <small className="work-review-note">{entry.data.review_note}</small>
                          )}
                        </td>
                        <td>
                          <div className="work-time-actions">
                            {own(entry) && ['draft', 'rejected'].includes(entry.status) && (
                              <>
                                <button
                                  className="quiet-button"
                                  disabled={busy}
                                  onClick={() =>
                                    setEditing(
                                      editing?.id === entry.id
                                        ? null
                                        : {
                                            id: entry.id,
                                            version: entry.version,
                                            work_date: entry.data.work_date,
                                            minutes: entry.data.minutes,
                                            description: entry.data.description,
                                          },
                                    )
                                  }
                                >
                                  Edit
                                </button>
                                <button
                                  className="quiet-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(
                                      () =>
                                        api('/work/timesheets/' + entry.id + '/submit', 'POST', {
                                          expected_version: entry.version,
                                        }),
                                      'Timesheet submitted for review.',
                                    )
                                  }
                                >
                                  Submit
                                </button>
                              </>
                            )}
                            {canReview && entry.status === 'submitted' && (
                              <>
                                <input
                                  aria-label="Review note"
                                  value={reviewNotes[entry.id] || ''}
                                  onChange={(e) =>
                                    setReviewNotes((old) => ({
                                      ...old,
                                      [entry.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Required if rejecting"
                                />
                                <button
                                  className="quiet-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(
                                      () =>
                                        api('/work/timesheets/' + entry.id + '/review', 'POST', {
                                          expected_version: entry.version,
                                          decision: 'approved',
                                          note: '',
                                        }),
                                      'Timesheet approved.',
                                    )
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  className="quiet-button"
                                  disabled={busy || !reviewNotes[entry.id]?.trim()}
                                  onClick={() =>
                                    void act(
                                      () =>
                                        api('/work/timesheets/' + entry.id + '/review', 'POST', {
                                          expected_version: entry.version,
                                          decision: 'rejected',
                                          note: reviewNotes[entry.id],
                                        }),
                                      'Timesheet returned for correction.',
                                    )
                                  }
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                          {editing?.id === entry.id && (
                            <div className="work-time-edit">
                              <input
                                type="date"
                                value={editing.work_date}
                                onChange={(e) =>
                                  setEditing({ ...editing, work_date: e.target.value })
                                }
                              />
                              <input
                                type="number"
                                min={1}
                                max={1440}
                                value={editing.minutes}
                                onChange={(e) =>
                                  setEditing({ ...editing, minutes: Number(e.target.value) })
                                }
                              />
                              <input
                                value={editing.description}
                                maxLength={4000}
                                onChange={(e) =>
                                  setEditing({ ...editing, description: e.target.value })
                                }
                              />
                              <button
                                className="quiet-button"
                                disabled={busy}
                                onClick={() =>
                                  void act(async () => {
                                    const result = await api(
                                      '/work/timesheets/' + entry.id,
                                      'PUT',
                                      {
                                        expected_version: editing.version,
                                        work_date: editing.work_date,
                                        minutes: editing.minutes,
                                        description: editing.description,
                                      },
                                    );
                                    setEditing(null);
                                    return result;
                                  }, 'Draft entry updated.')
                                }
                              >
                                Save changes
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No time entries match this period. Record a draft above to get started.</p>
          )}
          <nav className="pagination" aria-label="Timesheet pages">
            <button
              className="secondary-button"
              disabled={offset === 0 || busy}
              onClick={() => setOffset(Math.max(0, offset - 100))}
            >
              Previous
            </button>
            <span>
              {data.total == null
                ? `Entries ${offset + 1}–${offset + data.data.length} · 5,000 most recently created scanned`
                : `Entries ${data.total ? offset + 1 : 0}–${Math.min(offset + data.data.length, data.total)} of ${data.total}`}
            </span>
            <button
              className="secondary-button"
              disabled={!data.has_more || busy}
              onClick={() => setOffset(offset + 100)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
