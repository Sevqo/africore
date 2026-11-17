import { useEffect, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { Field, Form, type API } from '../operations/UI';
export function CrmActivityReport({
  api,
  members,
  back,
  open,
}: {
  api: API;
  members: any[];
  back: () => void;
  open: (id: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState('');
  async function load(query: Record<string, string> = {}) {
    setError('');
    setData(null);
    try {
      setData(await api('/crm/activity-report?' + new URLSearchParams(query)));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [api]);
  return (
    <section className="panel">
      <h3>Activity analysis</h3>
      <button className="secondary-button" onClick={back}>
        Pipeline analysis
      </button>
      <Form
        submit={(d) =>
          load(
            Object.fromEntries(Object.entries(d).filter(([, v]) => v !== '')) as Record<
              string,
              string
            >,
          )
        }
      >
        <div className="form-grid">
          <Field label="From">
            <input name="from" type="date" />
          </Field>
          <Field label="To">
            <input name="to" type="date" />
          </Field>
          <Field label="Assigned member">
            <select name="assignee">
              <option value="">All authorized members</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name || m.email}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button className="button">Apply filters</button>
      </Form>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading activity analysis…</p>}
      {data && (
        <>
          <p>{data.definition}</p>
          <p>
            {data.period.from}–{data.period.to} · Updated {new Date(data.as_of).toLocaleString()}
          </p>
          {data.truncated && (
            <p role="alert">The report reached its record limit; narrow the date range.</p>
          )}
          <DataTable>
            <thead>
              <tr>
                <th>Assigned member</th>
                <th>Follow-ups</th>
                <th>Open</th>
                <th>Overdue</th>
                <th>Completed</th>
                <th>Cancelled</th>
              </tr>
            </thead>
            <tbody>
              {data.by_assignee.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    {r.id === 'unassigned'
                      ? 'Unassigned'
                      : members.find((m) => m.id === r.id)?.display_name ||
                        members.find((m) => m.id === r.id)?.email ||
                        r.id}
                  </td>
                  <td>{r.total}</td>
                  <td>{r.open}</td>
                  <td>{r.overdue}</td>
                  <td>{r.completed}</td>
                  <td>{r.cancelled}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {!data.by_assignee.length && <p>No follow-ups match this period.</p>}
          <h4>Scheduled activity matrix</h4>
          <p>Each activity appears in its saved type column; only internal CRM tasks, calls and meetings are included.</p>
          <DataTable>
            <thead>
              <tr>
                <th>Activity</th>
                <th>Assignee</th>
                <th>To-do</th>
                <th>Call</th>
                <th>Meeting</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((record: any) => (
                <tr key={record.id}>
                  <th scope="row">
                    <button className="quiet-button" onClick={() => open(record.id)}>
                      {record.title}
                    </button>
                  </th>
                  <td>
                    {members.find((member) => member.id === record.assigned_to)?.display_name ||
                      members.find((member) => member.id === record.assigned_to)?.email ||
                      (record.assigned_to ? 'Authorized member' : 'Unassigned')}
                  </td>
                  {(['task', 'call', 'meeting'] as const).map((type) => (
                    <td key={type}>
                      {record.activity_type === type ? (
                        <span className={'crm-activity-cell is-' + record.status}>
                          {type === 'task' ? 'To-do' : type}
                        </span>
                      ) : (
                        <span aria-label="No activity" className="crm-activity-empty">—</span>
                      )}
                    </td>
                  ))}
                  <td>
                    {record.due_at
                      ? new Date(record.due_at).toLocaleString('en-KE', {
                          timeZone: 'Africa/Nairobi',
                        })
                      : 'No due date'}
                  </td>
                  <td>{record.status}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {!data.records.length && <p>No scheduled activities match this period.</p>}
        </>
      )}
    </section>
  );
}
