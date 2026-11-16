import { createsWorkCycle } from './work-app-model';
import { useState } from 'react';
import { Overlay } from '../components/Overlay';
import { DataTable } from '../components/DataTable';
export function WorkDependencyPicker({
  tasks,
  taskId,
  parentId,
  value,
  onChange,
  members = [],
  stages = [],
}: {
  tasks: any[];
  members?: any[];
  stages?: any[];
  taskId?: string;
  parentId?: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value),
    [query, setQuery] = useState('');
  function cycle(id: string) {
    return createsWorkCycle(tasks, taskId, parentId || null, [...new Set([...draft, id])]);
  }
  return (
    <fieldset>
      <legend>Blocked by</legend>
      <p>{value.length} prerequisite task(s). Completion is checked by the Work service.</p>
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
      >
        Select predecessor tasks
      </button>
      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <section
            className="panel work-dependency-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Add: Blocked By"
          >
            <h2>Add: Blocked By</h2>
            <label className="field">
              <span>Search tasks</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <p>{draft.length} selected</p>
            <DataTable>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Title</th>
                  <th>Assignee</th>
                  <th>Stage</th>
                  <th>Deadline</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks
                  .filter(
                    (t) =>
                      t.id !== taskId && t.data.title.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((t) => (
                    <tr key={t.id} aria-selected={draft.includes(t.id)}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={'Select ' + t.data.title}
                          disabled={!draft.includes(t.id) && cycle(t.id)}
                          checked={draft.includes(t.id)}
                          onChange={(e) =>
                            setDraft(
                              e.target.checked
                                ? [...draft, t.id]
                                : draft.filter((id) => id !== t.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        {t.data.title}
                        {cycle(t.id) && <small> · Would create a dependency cycle</small>}
                      </td>
                      <td>
                        {members.find((m) => m.id === t.data.assignee_id)?.display_name ||
                          members.find((m) => m.id === t.data.assignee_id)?.email ||
                          'Unassigned'}
                      </td>
                      <td>{stages.find((s) => s.id === t.stage)?.name || t.stage}</td>
                      <td>{t.due_on || 'Unscheduled'}</td>
                      <td>{t.status}</td>
                    </tr>
                  ))}
              </tbody>
            </DataTable>
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                Select
              </button>
              <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </section>
        </Overlay>
      )}
    </fieldset>
  );
}
