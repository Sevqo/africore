import { useEffect, useState } from 'react';
import { Field, Form, today, type API } from '../operations/UI';
export function OrganizationChart({
  api,
  scope,
  onSelect,
}: {
  api: API;
  scope: string;
  onSelect?: (id: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [query, setQuery] = useState('');
  useEffect(() => {
    let live = true;
    api('/people/org-chart')
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [scope]);
  return (
    <section className="panel">
      <h2>Organization chart</h2>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading visible reporting lines…</p>}
      {data && (
        <>
          <p>{data.notice}</p>
          <Field label="Find an employee in the visible reporting tree">
            <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} />
          </Field>
          {(() => {
            const rows: any[] = data.data,
              byId = new Map(rows.map((e) => [e.id, e])),
              children = new Map<string, any[]>(),
              needle = query.normalize('NFKC').toLowerCase(),
              included = new Set<string>();
            for (const person of rows) {
              const list = children.get(person.manager_id) || [];
              list.push(person);
              if (person.manager_id) children.set(person.manager_id, list);
            }
            if (needle) {
              for (const person of rows) {
                if (
                  [person.name, person.job_title].some((v) =>
                    String(v || '')
                      .normalize('NFKC')
                      .toLowerCase()
                      .includes(needle),
                  )
                ) {
                  let cursor: any = person;
                  const visited = new Set<string>();
                  while (cursor && !visited.has(cursor.id)) {
                    visited.add(cursor.id);
                    included.add(cursor.id);
                    cursor = cursor.manager_id ? byId.get(cursor.manager_id) : null;
                  }
                }
              }
            }
            const render = (person: any, depth: number, visited: Set<string>): any => {
              if (visited.has(person.id) || (needle && !included.has(person.id))) return null;
              const seen = new Set(visited);
              seen.add(person.id);
              const reports = (children.get(person.id) || []).filter(
                (child) => !needle || included.has(child.id),
              );
              return (
                <li key={person.id} className="org-chart-node">
                  <details open={depth === 0 || !!needle}>
                    <summary>
                      <span className="org-chart-card">
                        <strong>{person.name}</strong>
                        <span>{person.job_title || 'Job title not recorded'}</span>
                        <small>
                          {person.status}
                          {person.manager_outside_visible_directory
                            ? ' · manager outside visible records'
                            : ''}
                        </small>
                      </span>
                    </summary>
                    {onSelect && (
                      <button className="quiet-button" onClick={() => onSelect(person.id)}>
                        Open employee profile
                      </button>
                    )}
                    {reports.length > 0 && (
                      <ul>{reports.map((child) => render(child, depth + 1, seen))}</ul>
                    )}
                  </details>
                </li>
              );
            };
            const roots = rows.filter(
              (person) => !person.manager_id || !byId.has(person.manager_id),
            );
            return (
              <ul className="org-chart-tree">{roots.map((root) => render(root, 0, new Set()))}</ul>
            );
          })()}
          {!data.data.length && <p>No authorized reporting lines yet.</p>}
          {data.truncated && <p>Showing the first 5,000 currently authorized records.</p>}
        </>
      )}
    </section>
  );
}
export function PeopleReports({ api, scope }: { api: API; scope: string }) {
  const [query, setQuery] = useState({ from: today().slice(0, 7) + '-01', to: today() }),
    [data, setData] = useState<any>(null),
    [expansion, setExpansion] = useState<any>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null);
    setExpansion(null);
    setError('');
    const search = new URLSearchParams(query).toString();
    Promise.all([api('/people/report?' + search), api('/people/report/expansion?' + search)])
      .then(([people, additional]) => {
        if (live) {
          setData(people);
          setExpansion(additional);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [scope, query]);
  return (
    <section className="panel">
      <h2>People reports</h2>
      <Form submit={async (d) => setQuery({ from: d.from, to: d.to })}>
        <Field label="People report from">
          <input name="from" type="date" defaultValue={query.from} required />
        </Field>
        <Field label="People report to">
          <input name="to" type="date" defaultValue={query.to} required />
        </Field>
        <button className="secondary-button">Apply reporting period</button>
      </Form>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading authorized HR aggregates…</p>}
      {data && (
        <>
          <p>{data.definitions}</p>
          <h3>Current employment</h3>
          {data.employees.map((e: any) => (
            <p key={e.status}>
              {e.status}: {e.count}
            </p>
          ))}
          <p>{data.active_departments} active departments</p>
          <h3>Leave requests overlapping selected dates</h3>
          {data.leave.map((l: any) => (
            <p key={l.status}>
              {l.status}: {l.requests} requests · {l.days} configured days
            </p>
          ))}
          <h3>Recorded attendance</h3>
          <p>
            {data.attendance.sessions} sessions · {data.attendance.open_sessions} open ·{' '}
            {data.attendance.manual_corrections} current HR corrections
          </p>
          <p>
            {(data.attendance.closed_seconds / 3600).toFixed(2)} recorded hours in closed sessions.
            No wages are calculated.
          </p>
          {expansion && (
            <>
              <h3>Hiring, development and lifecycle</h3>
              <div className="people-metric-row">
                <strong>{expansion.positions.active} active positions</strong>
                <strong>{expansion.recruitment.openings} open roles</strong>
                <strong>{expansion.recruitment.applicants} active applications</strong>
                <strong>{expansion.recruitment.hired_in_period} hires in period</strong>
                <strong>{expansion.performance.pending_reviews} reviews in progress</strong>
                <strong>{expansion.performance.completed_reviews} reviews completed</strong>
                <strong>{expansion.performance.active_goals} active goals</strong>
                <strong>{expansion.lifecycle.open_cases} open lifecycle cases</strong>
                <strong>{expansion.lifecycle.completed_in_period} cases completed</strong>
                <strong>
                  {expansion.certifications.expiring_next_90_days} certifications expiring within 90
                  days
                </strong>
              </div>
              <p>{expansion.notice}</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
