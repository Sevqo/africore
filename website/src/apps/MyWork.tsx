import { useEffect, useState } from 'react';
import { Field, type API } from '../operations/UI';
import { appNavigationEvent } from './AppNavigation';

export function MyWork({
  api,
  scope,
  revision,
  onProject,
}: {
  api: API;
  scope: string;
  revision: number;
  onProject: (id: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [offset, setOffset] = useState(0),
    [status, setStatus] = useState('open'),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    api('/work/my-work?' + new URLSearchParams({ status, offset: String(offset) }))
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [scope, revision, offset, status]);

  function openAppSection(appId: string, section: string, param?: [string, string]) {
    const url = new URL(location.href);
    url.searchParams.set('app', appId);
    url.searchParams.set('section', section);
    if (param) url.searchParams.set(param[0], param[1]);
    url.hash = 'Apps';
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event(appNavigationEvent));
  }

  return (
    <section className="panel">
      <h2>My work, meetings &amp; assigned activities</h2>
      <Field label="My task status">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="open">Open tasks</option>
          <option value="completed">Completed tasks</option>
          <option value="all">All assigned tasks</option>
        </select>
      </Field>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading currently authorized assignments…</p>}
      {data && (
        <>
          {Array.isArray(data.meetings) && data.meetings.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ marginBottom: 8 }}>Upcoming calendar meetings &amp; workspace schedule</h3>
              <div className="app-directory">
                {data.meetings.map((m: any) => (
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
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        openAppSection(
                          'calendar',
                          m.invited ? 'invitations' : 'calendar',
                          ['event', m.event_id],
                        )
                      }
                    >
                      Open in Calendar
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(data.activities) && data.activities.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ marginBottom: 8 }}>Assigned cross-app activities &amp; approvals</h3>
              <div className="app-directory">
                {data.activities.map((act: any) => (
                  <article className="panel" key={act.kind + ':' + act.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{act.title}</strong>
                      <span className="badge">{act.kind.replaceAll('_', ' ')}</span>
                    </div>
                    <p style={{ margin: '6px 0', fontSize: 13 }}>
                      Status: {act.status}
                      {act.due_on ? ` · Due ${act.due_on}` : ''}
                    </p>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => openAppSection(act.app_id, act.section)}
                    >
                      Open in {act.app_id.replaceAll('_', ' ')}
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}

          <h3 style={{ marginBottom: 8 }}>Project tasks assigned to me ({data.total})</h3>
          <p>{data.definition}</p>
          {data.truncated && (
            <p role="status">
              Candidate limit reached; open individual projects to inspect additional tasks.
            </p>
          )}
          <div className="app-directory">
            {data.data.map((t: any) => (
              <article className="panel" key={t.id}>
                <h3>{t.data.title}</h3>
                <p>
                  {t.project_name} · {t.status} · {t.data.priority}
                </p>
                <p>{t.due_on ? 'Due ' + t.due_on : 'No due date'}</p>
                <button className="secondary-button" onClick={() => onProject(t.root_id)}>
                  Open assigned project
                </button>
              </article>
            ))}
          </div>
          {!data.data.length && <p>No matching assignments in currently authorized projects.</p>}
          <div className="form-actions">
            <button
              className="secondary-button"
              disabled={!offset}
              onClick={() => setOffset((v) => Math.max(0, v - 50))}
            >
              Previous assignments
            </button>
            <button
              className="secondary-button"
              disabled={!data.has_more}
              onClick={() => setOffset((v) => v + 50)}
            >
              More assignments
            </button>
          </div>
        </>
      )}
    </section>
  );
}
