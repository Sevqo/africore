import { useEffect, useState } from 'react';
import { DataTable } from '../components/DataTable';
export function WorkTaskTable({
  tasks,
  stages,
  name,
  open,
  projectName,
}: {
  tasks: any[];
  stages: any[];
  name: (id: string) => string;
  open: (task: any) => void;
  projectName: string;
}) {
  const [page, setPage] = useState(1),
    [sort, setSort] = useState('title'),
    [group, setGroup] = useState('none');
  useEffect(() => setPage(1), [tasks, sort, group]);
  const groupLabel = (t: any) =>
    group === 'stage'
      ? stages.find((s) => s.id === t.stage)?.name || t.stage
      : group === 'assignee'
        ? name(t.data.assignee_id)
        : group === 'priority'
          ? t.data.priority
          : '';
  const rows = [...tasks].sort(
    (a, b) =>
      groupLabel(a).localeCompare(groupLabel(b)) ||
      (sort === 'due'
        ? String(a.due_on || '9999').localeCompare(String(b.due_on || '9999'))
        : sort === 'priority'
          ? ['urgent', 'high', 'normal', 'low'].indexOf(a.data.priority) -
            ['urgent', 'high', 'normal', 'low'].indexOf(b.data.priority)
          : a.data.title.localeCompare(b.data.title)),
  );
  const paged = rows.slice((page - 1) * 25, page * 25);
  return (
    <>
      <div className="form-actions">
        <label>
          Sort{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="title">Title</option>
            <option value="due">Deadline</option>
            <option value="priority">Priority</option>
          </select>
        </label>
        <label>
          Group by{' '}
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="none">None</option>
            <option value="stage">Stage</option>
            <option value="assignee">Assignee</option>
            <option value="priority">Priority</option>
          </select>
        </label>
        <span>{tasks.length} matching tasks</span>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>Title</th>
            <th>Project</th>
            <th>Assignee</th>
            <th>Priority</th>
            <th>Start</th>
            <th>Deadline</th>
            <th>Checklist</th>
            <th>Prerequisites</th>
            <th>Stage</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {paged.flatMap((t, i) => [
            ...(group !== 'none' && (i === 0 || groupLabel(t) !== groupLabel(paged[i - 1]))
              ? [
                  <tr key={'group-' + t.id} className="work-table-group">
                    <th colSpan={10}>{groupLabel(t)}</th>
                  </tr>,
                ]
              : []),
            <tr key={t.id}>
              <td>
                <button className="quiet-button" onClick={() => open(t)}>
                  {t.data.title}
                </button>
              </td>
              <td>{projectName}</td>
              <td>{name(t.data.assignee_id)}</td>
              <td>{t.data.priority}</td>
              <td>{t.data.starts_on || 'Unscheduled'}</td>
              <td>{t.due_on || 'Unscheduled'}</td>
              <td>
                {t.data.checklist.filter((c: any) => c.completed).length}/{t.data.checklist.length}
              </td>
              <td>{t.data.dependencies.length}</td>
              <td>{stages.find((s) => s.id === t.stage)?.name || t.stage}</td>
              <td>{t.status}</td>
            </tr>,
          ])}
        </tbody>
      </DataTable>
      <nav className="pagination" aria-label="Task pages">
        <button
          className="secondary-button"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {Math.max(1, Math.ceil(rows.length / 25))}
        </span>
        <button
          className="secondary-button"
          disabled={page * 25 >= rows.length}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </nav>
    </>
  );
}
export function WorkAnalysis({
  tasks,
  stages,
  truncated,
  name,
  milestones = [],
}: {
  tasks: any[];
  stages: any[];
  truncated: boolean;
  milestones?: any[];
  name: (id: string) => string;
}) {
  const [group, setGroup] = useState('stage'),
    [measure, setMeasure] = useState('count'),
    [mode, setMode] = useState('graph'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }),
    covered = tasks.filter(
      (t) => (!from || (t.due_on && t.due_on >= from)) && (!to || (t.due_on && t.due_on <= to)),
    );
  const key = (t: any) =>
    group === 'stage'
      ? t.stage
      : group === 'priority'
        ? t.data.priority
        : t.data.assignee_id || 'unassigned';
  const ids = group === 'stage' ? stages.map((s) => s.id) : [...new Set(covered.map(key))];
  const rows = ids.map((id) => {
    const items = covered.filter((t) => key(t) === id);
    return {
      id,
      label:
        group === 'stage'
          ? stages.find((s) => s.id === id)?.name || id
          : group === 'priority'
            ? id
            : id === 'unassigned'
              ? 'Unassigned'
              : name(id),
      count: items.length,
      open: items.filter((t) => t.status === 'open').length,
      overdue: items.filter((t) => t.status === 'open' && t.due_on && t.due_on < today).length,
      completed: items.filter((t) => t.status === 'completed').length,
      estimate: items.reduce((n, t) => n + t.data.estimate_minutes, 0),
    };
  });
  const value = (row: (typeof rows)[number]) =>
      measure === 'estimate'
        ? row.estimate
        : measure === 'completed'
          ? row.completed
          : measure === 'open'
            ? row.open
            : measure === 'overdue'
              ? row.overdue
              : row.count,
    max = Math.max(1, ...rows.map(value));
  return (
    <section className="panel work-analysis">
      <h2>Task analysis</h2>
      <div className="form-actions">
        <label>
          Measures{' '}
          <select value={measure} onChange={(e) => setMeasure(e.target.value)}>
            <option value="count">Task count</option>
            <option value="completed">Completed count</option>
            <option value="open">Open count</option>
            <option value="overdue">Overdue count</option>
            <option value="estimate">Estimated minutes</option>
          </select>
        </label>
        <label>
          Group by{' '}
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="stage">Stage</option>
            <option value="assignee">Assignee</option>
            <option value="priority">Priority</option>
          </select>
        </label>
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
      <div className="form-actions">
        <label>
          Due from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Due to{' '}
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <p>
        {from && to && from > to
          ? 'Choose an ordered date range.'
          : 'Date filters apply to recorded deadlines; undated tasks are excluded when a date bound is set.'}
      </p>
      <p>
        {!truncated && covered.length
          ? Math.round(
              (100 * covered.filter((t) => t.status === 'completed').length) / covered.length,
            ) + '% of matching tasks completed'
          : 'Completion rate unavailable for empty or truncated coverage.'}
      </p>
      <p>
        {truncated
          ? 'Counts cover returned tasks only.'
          : 'Counts cover the loaded project task graph.'}{' '}
        Estimated effort is planned effort. Historical burndown is unavailable.
      </p>
      {mode === 'graph' ? (
        <div className="work-report-chart">
          <svg viewBox="0 0 1000 400" role="img" aria-label={measure + ' grouped by ' + group}>
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <line x1="55" x2="980" y1={340 - i * 75} y2={340 - i * 75} stroke="#dfe5e2" />
                <text x="45" y={345 - i * 75} textAnchor="end" fontSize="13">
                  {Math.round(((max * i) / 4) * 100) / 100}
                </text>
              </g>
            ))}
            {rows.map((row, i) => {
              const width = 900 / Math.max(1, rows.length),
                height = (300 * value(row)) / max;
              return (
                <g key={row.id}>
                  <rect
                    x={65 + i * width + width * 0.15}
                    y={340 - height}
                    width={width * 0.7}
                    height={height}
                    fill={['#4aa4e8', '#eb6077', '#43bca9', '#f1a359'][i % 4]}
                  >
                    <title>{row.label + ': ' + value(row)}</title>
                  </rect>
                  <text x={65 + i * width + width * 0.5} y="370" textAnchor="middle" fontSize="14">
                    {row.label.length > 20 ? row.label.slice(0, 19) + '…' : row.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>
                {group === 'stage' ? 'Stage' : group === 'priority' ? 'Priority' : 'Assignee'}
              </th>
              <th>Tasks</th>
              <th>Completed</th>
              <th>Estimated minutes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.label}</td>
                <td>{row.count}</td>
                <td>{row.completed}</td>
                <td>{row.estimate}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <h3>Project milestones</h3>
      {milestones.map((m: any) => (
        <p key={m.id}>
          {m.name} · {m.due_on} ·{' '}
          {m.completed ? 'Completed' : m.due_on < today ? 'Overdue' : 'Planned'}
        </p>
      ))}
      {!milestones.length && <p>No milestones configured.</p>}
    </section>
  );
}
