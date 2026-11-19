import { useEffect, useMemo, useState } from 'react';
import { Field, type API } from '../operations/UI';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const offsetDate = (date: string, days: number) => {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const duration = (seconds: number | null) =>
  seconds == null
    ? 'Unavailable'
    : `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;

export function WorkReports({
  api,
  projects = [],
  projectId = '',
  members = [],
}: {
  api: API;
  projects?: any[];
  projectId?: string;
  members?: any[];
}) {
  const [chosenProject, setChosenProject] = useState(projectId),
    [group, setGroup] = useState('stage'),
    [timeGroup, setTimeGroup] = useState('user'),
    [measure, setMeasure] = useState('count'),
    [mode, setMode] = useState<'graph' | 'table'>('graph'),
    [from, setFrom] = useState(offsetDate(today(), -29)),
    [to, setTo] = useState(today()),
    [assignee, setAssignee] = useState(''),
    [priority, setPriority] = useState(''),
    [status, setStatus] = useState(''),
    [search, setSearch] = useState(''),
    [report, setReport] = useState<any>(null),
    [timeReport, setTimeReport] = useState<any>(null),
    [progress, setProgress] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [offset, setOffset] = useState(0),
    [timeOffset, setTimeOffset] = useState(0);
  useEffect(() => setChosenProject(projectId), [projectId]);
  const selected = projects.find((item) => item.id === chosenProject);
  const query = useMemo(() => {
    const value = new URLSearchParams({ group_by: group, offset: String(offset), limit: '100' });
    if (from) value.set('from', from);
    if (to) value.set('to', to);
    if (assignee) value.set('assignee_id', assignee);
    if (priority) value.set('priority', priority);
    if (status) value.set('status', status);
    if (search.trim()) value.set('search', search.trim());
    return value.toString();
  }, [group, offset, from, to, assignee, priority, status, search]);
  useEffect(() => {
    if (!chosenProject) {
      setReport(null);
      setProgress(null);
      return;
    }
    let live = true;
    setBusy(true);
    setError('');
    Promise.all([
      api(`/work/projects/${chosenProject}/reports/tasks?${query}`),
      api(
        `/work/projects/${chosenProject}/reports/timesheets?group_by=${timeGroup}&offset=${timeOffset}&limit=100${from ? `&from=${encodeURIComponent(from)}` : ''}${to ? `&to=${encodeURIComponent(to)}` : ''}`,
      ),
      from && to
        ? api(
            `/work/projects/${chosenProject}/reports/progress?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          )
        : Promise.resolve(null),
    ])
      .then(([tasks, timesheets, history]) => {
        if (live) {
          setReport(tasks);
          setTimeReport(timesheets);
          setProgress(history);
        }
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [api, chosenProject, query, from, to, timeGroup, timeOffset]);
  const groupRows = report?.data || [];
  const value = (row: any) =>
    measure === 'completed'
      ? row.completed
      : measure === 'overdue'
        ? row.overdue
        : measure === 'blocked'
          ? row.blocked
          : measure === 'estimate'
            ? row.estimated_minutes
            : measure === 'actual'
              ? row.actual_seconds
              : row.task_count;
  const max = Math.max(1, ...groupRows.map((row: any) => Number(value(row) || 0)));
  const projectName = (id: string) =>
    projects.find((item) => item.id === id)?.data?.name ||
    projects.find((item) => item.id === id)?.name ||
    'Project';
  return (
    <section className="panel work-analysis" aria-labelledby="work-report-title">
      <div className="section-heading">
        <div>
          <h2 id="work-report-title">Work reporting</h2>
          <p>
            Task records and recorded timesheets are aggregated under your current project access.
          </p>
        </div>
      </div>
      {!projectId && (
        <Field label="Project">
          <select
            value={chosenProject}
            onChange={(e) => {
              setChosenProject(e.target.value);
              setOffset(0);
              setTimeOffset(0);
            }}
          >
            <option value="">Choose a project</option>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.data?.name || item.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {chosenProject && (
        <>
          <p>
            <strong>{projectName(chosenProject)}</strong>
          </p>
          <div className="work-report-filters">
            <Field label="Due date from">
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setOffset(0);
                  setTimeOffset(0);
                }}
              />
            </Field>
            <Field label="Due date to">
              <input
                type="date"
                min={from || undefined}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setOffset(0);
                  setTimeOffset(0);
                }}
              />
            </Field>
            <Field label="Assignee">
              <select
                value={assignee}
                onChange={(e) => {
                  setAssignee(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">All assignees</option>
                {selected?.data?.members?.map((member: any) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.display_name || member.email || member.user_id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">All priorities</option>
                {['urgent', 'high', 'normal', 'low'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Task state">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">All states</option>
                {['in_progress', 'changes_requested', 'approved', 'completed', 'cancelled'].map(
                  (item) => (
                    <option key={item} value={item}>
                      {item.replaceAll('_', ' ')}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Search tasks">
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
              />
            </Field>
            <Field label="Group by">
              <select
                value={group}
                onChange={(e) => {
                  setGroup(e.target.value);
                  setOffset(0);
                }}
              >
                {[
                  ['stage', 'Stage'],
                  ['status', 'Task state'],
                  ['assignee', 'Assignee'],
                  ['priority', 'Priority'],
                  ['milestone', 'Milestone'],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Measure">
              <select value={measure} onChange={(e) => setMeasure(e.target.value)}>
                {[
                  ['count', 'Task count'],
                  ['completed', 'Completed'],
                  ['overdue', 'Overdue'],
                  ['blocked', 'Dependency blockers'],
                  ['estimate', 'Estimated minutes'],
                  ['actual', 'Recorded time (seconds)'],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-actions">
              <button
                className="secondary-button"
                aria-pressed={mode === 'graph'}
                onClick={() => setMode('graph')}
              >
                Graph
              </button>
              <button
                className="secondary-button"
                aria-pressed={mode === 'table'}
                onClick={() => setMode('table')}
              >
                Table
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="alert error">
              {error}
            </p>
          )}
          {busy && <p role="status">Updating report…</p>}
          {report && (
            <>
              <div className="work-report-summary">
                <span>{report.total_tasks} matching tasks</span>
                <span>
                  {Math.round((report.total_estimated_minutes / 60) * 10) / 10} estimated hours
                </span>
                <span>
                  {duration(report.complete ? report.total_actual_seconds : null)} recorded time
                </span>
                <span>{report.blocked_tasks} dependency blocked</span>
                <span>
                  {report.cycle_time?.average_days == null
                    ? 'Cycle time unavailable'
                    : `${report.cycle_time.average_days.toFixed(1)} day average cycle`}
                </span>
              </div>
              <p>
                {report.task_coverage} {report.actual_time_scope} {report.time_coverage}
              </p>
              {!report.complete && (
                <p role="status">
                  Recorded time exceeds the report limit; time measures are incomplete and marked
                  unavailable.
                </p>
              )}
              {mode === 'graph' ? (
                <div className="work-report-chart">
                  <svg
                    viewBox="0 0 1000 400"
                    role="img"
                    aria-label={`${measure} grouped by ${group}`}
                  >
                    {[0, 1, 2, 3, 4].map((i) => (
                      <g key={i}>
                        <line
                          x1="55"
                          x2="980"
                          y1={340 - i * 75}
                          y2={340 - i * 75}
                          stroke="#dfe5e2"
                        />
                        <text x="45" y={345 - i * 75} textAnchor="end" fontSize="13">
                          {Math.round(((max * i) / 4) * 100) / 100}
                        </text>
                      </g>
                    ))}
                    {groupRows.map((row: any, i: number) => {
                      const width = 900 / Math.max(1, groupRows.length),
                        raw = value(row),
                        height = raw == null ? 0 : (300 * Number(raw)) / max;
                      return (
                        <g key={row.key}>
                          <rect
                            x={65 + i * width + width * 0.15}
                            y={340 - height}
                            width={width * 0.7}
                            height={height}
                            fill={['#4aa4e8', '#eb6077', '#43bca9', '#f1a359'][i % 4]}
                          >
                            <title>{`${row.label}: ${raw == null ? 'Unavailable' : raw}`}</title>
                          </rect>
                          <text
                            x={65 + i * width + width * 0.5}
                            y="370"
                            textAnchor="middle"
                            fontSize="14"
                          >
                            {row.label.length > 20 ? row.label.slice(0, 19) + '…' : row.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{group}</th>
                        <th>Tasks</th>
                        <th>Completed</th>
                        <th>Overdue</th>
                        <th>Estimated minutes</th>
                        <th>Recorded time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((row: any) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>{row.task_count}</td>
                          <td>{row.completed}</td>
                          <td>{row.overdue}</td>
                          <td>{row.estimated_minutes}</td>
                          <td>{duration(report.complete ? row.actual_seconds : null)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <nav className="pagination" aria-label="Work report groups">
                <button
                  className="secondary-button"
                  disabled={offset === 0 || busy}
                  onClick={() => setOffset(Math.max(0, offset - 100))}
                >
                  Previous
                </button>
                <span>
                  Groups {report.total_groups ? offset + 1 : 0}–
                  {Math.min(offset + 100, report.total_groups)} of {report.total_groups}
                </span>
                <button
                  className="secondary-button"
                  disabled={!report.has_more || busy}
                  onClick={() => setOffset(offset + 100)}
                >
                  Next
                </button>
              </nav>
            </>
          )}
          <h3>Historical task progress</h3>
          {progress && (
            <>
              <p>{progress.disclosure}</p>
              <div className="work-report-chart">
                <svg
                  viewBox="0 0 1000 320"
                  role="img"
                  aria-label="Historical open, completed and cancelled task counts"
                >
                  {[0, 1, 2, 3, 4].map((i) => (
                    <line
                      key={i}
                      x1="55"
                      x2="980"
                      y1={270 - i * 55}
                      y2={270 - i * 55}
                      stroke="#dfe5e2"
                    />
                  ))}
                  {(['open', 'completed', 'cancelled'] as const).map((key, line) => {
                    const points = progress.days.filter((d: any) => d.available && d[key] != null);
                    if (points.length < 2) return null;
                    const maxTotal = Math.max(1, ...points.map((d: any) => d.total)),
                      x = (date: string) =>
                        65 +
                        (900 *
                          (Date.parse(date + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z'))) /
                          Math.max(
                            86400000,
                            Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z'),
                          ),
                      y = (n: number) => 270 - (220 * n) / maxTotal;
                    return (
                      <polyline
                        key={key}
                        fill="none"
                        stroke={['#4aa4e8', '#43bca9', '#f1a359'][line]}
                        strokeWidth="4"
                        points={points.map((d: any) => `${x(d.date)},${y(d[key])}`).join(' ')}
                      >
                        <title>{key}</title>
                      </polyline>
                    );
                  })}
                  <text x="65" y="300" fontSize="13">
                    {from}
                  </text>
                  <text x="980" y="300" textAnchor="end" fontSize="13">
                    {to}
                  </text>
                </svg>
              </div>
              <div className="work-report-legend">
                <span>Open</span>
                <span>Completed</span>
                <span>Cancelled</span>
              </div>
            </>
          )}
          {!progress && <p>Choose both dates to see available task history.</p>}
          <h3>Timesheet analysis</h3>
          {timeReport && (
            <>
              <div className="form-actions">
                <Field label="Group recorded time by">
                  <select
                    value={timeGroup}
                    onChange={(e) => {
                      setTimeGroup(e.target.value);
                      setTimeOffset(0);
                    }}
                  >
                    {[
                      ['user', 'Contributor'],
                      ['task', 'Task'],
                      ['date', 'Work date'],
                      ['week', 'Week'],
                    ].map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <strong>
                  {timeReport.total_seconds == null
                    ? 'Total unavailable above 50,000 entries'
                    : `${duration(timeReport.total_seconds)} total`}
                </strong>
              </div>
              <p>
                {timeReport.actual_time_scope} {timeReport.coverage}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>
                        {timeGroup === 'user'
                          ? 'Contributor'
                          : timeGroup === 'task'
                            ? 'Task'
                            : timeGroup === 'week'
                              ? 'Week starting'
                              : 'Work date'}
                      </th>
                      <th>Entries</th>
                      <th>Recorded time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeReport.data.map((row: any) => (
                      <tr key={row.key}>
                        <td>
                          {timeGroup === 'user'
                            ? members.find((member) => member.id === row.key)?.display_name ||
                              members.find((member) => member.id === row.key)?.email ||
                              'Project contributor'
                            : row.label}
                        </td>
                        <td>{row.entries ?? 'Unavailable'}</td>
                        <td>{duration(row.seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <nav className="pagination" aria-label="Timesheet report groups">
                <button
                  className="secondary-button"
                  disabled={timeOffset === 0 || busy}
                  onClick={() => setTimeOffset(Math.max(0, timeOffset - 100))}
                >
                  Previous
                </button>
                <span>
                  {timeReport.total_groups == null
                    ? `Groups ${timeOffset + 1}–${timeOffset + timeReport.data.length} in capped set`
                    : `Groups ${timeReport.total_groups ? timeOffset + 1 : 0}–${Math.min(timeOffset + 100, timeReport.total_groups)} of ${timeReport.total_groups}`}
                </span>
                <button
                  className="secondary-button"
                  disabled={!timeReport.has_more || busy}
                  onClick={() => setTimeOffset(timeOffset + 100)}
                >
                  Next
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </section>
  );
}
