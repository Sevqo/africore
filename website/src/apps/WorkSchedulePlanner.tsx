import { useState } from 'react';
import { Field, type API } from '../operations/UI';

export function WorkSchedulePlanner({
  api,
  projectId,
  tasks,
  changed,
}: {
  api: API;
  projectId: string;
  tasks: any[];
  changed: () => void;
}) {
  const [taskId, setTaskId] = useState(''),
    [startsOn, setStartsOn] = useState(''),
    [proposal, setProposal] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function preview() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setProposal(
        await api(`/work/projects/${projectId}/schedule/preview`, 'POST', {
          task_id: taskId,
          starts_on: startsOn,
        }),
      );
    } catch (e) {
      setProposal(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!proposal) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const changes = proposal.changes.map(
        ({ id, expected_version, starts_on: start, due_on }: any) => ({
          id,
          expected_version,
          starts_on: start,
          due_on,
        }),
      );
      const result = await api(`/work/projects/${projectId}/schedule/apply`, 'POST', {
        expected_project_version: proposal.project_version,
        task_id: proposal.task_id,
        starts_on: proposal.requested_start,
        changes,
      });
      setProposal(null);
      setNotice(`${result.changed} task date${result.changed === 1 ? '' : 's'} saved.`);
      changed();
    } catch (e) {
      setError((e as Error).message);
      setProposal(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel work-schedule-planner">
      <h3>Dependency-aware rescheduling</h3>
      <p>
        Finish-to-start rules require each predecessor to have a deadline. Review every proposed
        date before saving.
      </p>
      <div className="form-grid">
        <Field label="Task to reschedule">
          <select
            value={taskId}
            onChange={(e) => {
              setTaskId(e.target.value);
              setProposal(null);
            }}
          >
            <option value="">Choose an open task</option>
            {tasks
              .filter((task) => task.status === 'open')
              .map((task) => (
                <option key={task.id} value={task.id}>
                  {task.data.title}
                </option>
              ))}
          </select>
        </Field>
        <Field label="New start date">
          <input
            type="date"
            value={startsOn}
            onChange={(e) => {
              setStartsOn(e.target.value);
              setProposal(null);
            }}
          />
        </Field>
      </div>
      <div className="form-actions">
        <button
          className="secondary-button"
          disabled={busy || !taskId || !startsOn}
          onClick={() => void preview()}
        >
          Preview affected dates
        </button>
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {proposal && (
        <>
          <p>
            {proposal.changes.length
              ? `${proposal.changes.length} task dates will change.`
              : 'No task dates need to change.'}
          </p>
          {proposal.changes.length > 0 && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>New start</th>
                    <th>New deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.changes.map((change: any) => (
                    <tr key={change.id}>
                      <td>{change.title}</td>
                      <td>{change.starts_on || 'Unscheduled'}</td>
                      <td>{change.due_on || 'Unscheduled'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="form-actions">
            <button
              className="button"
              disabled={busy || !proposal.changes.length}
              onClick={() => void apply()}
            >
              Confirm schedule
            </button>
            <button className="secondary-button" disabled={busy} onClick={() => setProposal(null)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}
