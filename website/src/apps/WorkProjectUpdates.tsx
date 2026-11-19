import { useEffect, useState } from 'react';
import { Field, today, type API } from '../operations/UI';

export function WorkProjectUpdates({
  project,
  tasks,
  members,
  api,
  canManage,
  revision,
  changed,
}: {
  project: any;
  tasks: any[];
  members: any[];
  api: API;
  canManage: boolean;
  revision: number;
  changed: () => void;
}) {
  const [data, setData] = useState<any>(null),
    [status, setStatus] = useState('on_track'),
    [date, setDate] = useState(today()),
    [summary, setSummary] = useState(''),
    [milestoneSummary, setMilestoneSummary] = useState(''),
    [achievements, setAchievements] = useState(''),
    [risks, setRisks] = useState(''),
    [blockers, setBlockers] = useState(''),
    [nextSteps, setNextSteps] = useState(''),
    [related, setRelated] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [offset, setOffset] = useState(0);
  async function reload() {
    const result = await api('/work/projects/' + project.id + '/updates?offset=0');
    setData(result);
    setOffset(0);
  }
  useEffect(() => {
    let live = true;
    setOffset(0);
    api('/work/projects/' + project.id + '/updates?offset=0')
      .then((result) => {
        if (live) setData(result);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [project.id, revision]);
  const name = (id: string) =>
    members.find((m) => m.id === id)?.display_name || 'Project participant';
  async function publish() {
    setBusy(true);
    setError('');
    try {
      await api('/work/projects/' + project.id + '/updates', 'POST', {
        reporting_date: date,
        status,
        summary,
        achievements,
        risks,
        blockers,
        next_steps: nextSteps,
        milestone_summary: milestoneSummary,
        related_tasks: related,
      });
      setSummary('');
      setMilestoneSummary('');
      setAchievements('');
      setRisks('');
      setBlockers('');
      setNextSteps('');
      setRelated([]);
      await reload();
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel work-project-updates">
      <div className="section-heading">
        <div>
          <h2>Project status updates</h2>
          <p>Updates are appended to the project history and retain their reporting date.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {canManage && (
        <div className="work-update-composer">
          <h3>Publish an update</h3>
          <div className="form-grid">
            <Field label="Reporting date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Project health">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {[
                  ['on_track', 'On track'],
                  ['at_risk', 'At risk'],
                  ['off_track', 'Off track'],
                  ['on_hold', 'On hold'],
                  ['completed', 'Completed'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Progress summary">
            <textarea
              maxLength={5000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <Field label="Milestone summary">
            <textarea
              maxLength={5000}
              value={milestoneSummary}
              onChange={(e) => setMilestoneSummary(e.target.value)}
              placeholder="Milestone status for this update"
            />
          </Field>
          <div className="form-grid">
            <Field label="Achievements">
              <textarea
                maxLength={5000}
                value={achievements}
                onChange={(e) => setAchievements(e.target.value)}
              />
            </Field>
            <Field label="Risks">
              <textarea maxLength={5000} value={risks} onChange={(e) => setRisks(e.target.value)} />
            </Field>
            <Field label="Blockers">
              <textarea
                maxLength={5000}
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
              />
            </Field>
            <Field label="Next steps">
              <textarea
                maxLength={5000}
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Related tasks">
            <select
              multiple
              value={related}
              onChange={(e) => setRelated(Array.from(e.target.selectedOptions).map((o) => o.value))}
            >
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.data.title}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="button"
            disabled={busy || !summary.trim()}
            onClick={() => void publish()}
          >
            Publish dated update
          </button>
        </div>
      )}
      {!data && !error && <p role="status">Loading project updates…</p>}
      {data?.data.length ? (
        <ol className="work-updates-feed">
          {data.data.map((item: any) => (
            <li key={item.id}>
              <header>
                <strong>{item.data.status.replaceAll('_', ' ')}</strong>
                <time>{item.data.reporting_date}</time>
                <span>{name(item.data.author_id)}</span>
              </header>
              <p>{item.data.summary}</p>
              {item.data.achievements && (
                <p>
                  <b>Achievements:</b> {item.data.achievements}
                </p>
              )}
              {item.data.risks && (
                <p>
                  <b>Risks:</b> {item.data.risks}
                </p>
              )}
              {item.data.blockers && (
                <p>
                  <b>Blockers:</b> {item.data.blockers}
                </p>
              )}
              {item.data.next_steps && (
                <p>
                  <b>Next steps:</b> {item.data.next_steps}
                </p>
              )}
              {item.data.milestone_summary && (
                <p>
                  <b>Milestones:</b> {item.data.milestone_summary}
                </p>
              )}
              {item.data.milestone_snapshot?.length > 0 && (
                <p>
                  <b>Milestone snapshot:</b>{' '}
                  {item.data.milestone_snapshot
                    .map(
                      (m: any) => `${m.name} · ${m.due_on} · ${m.completed ? 'complete' : 'open'}`,
                    )
                    .join('; ')}
                </p>
              )}
              {item.data.upcoming_deadlines?.length > 0 && (
                <p>
                  <b>Upcoming deadlines (30 days):</b>{' '}
                  {item.data.upcoming_deadlines
                    .map((d: any) => `${d.title} · ${d.due_on}`)
                    .join('; ')}
                </p>
              )}
              {item.data.deadlines_truncated && (
                <small>Deadline snapshot includes at most 1,000 project tasks.</small>
              )}
              {item.data.related_tasks.length > 0 && (
                <p>
                  Related tasks:{' '}
                  {item.data.related_tasks
                    .map(
                      (id: string) =>
                        tasks.find((task) => task.id === id)?.data.title || 'Retained task',
                    )
                    .join(', ')}
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        data && <p>No dated updates have been published for this project.</p>
      )}
      {data?.has_more && (
        <button
          className="secondary-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const next = offset + 50,
                page = await api('/work/projects/' + project.id + '/updates?offset=' + next);
              setData((old: any) => ({ ...page, data: [...(old?.data || []), ...page.data] }));
              setOffset(next);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Load older updates
        </button>
      )}
    </section>
  );
}
