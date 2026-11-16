import { useState } from 'react';
import { Field, today } from '../operations/UI';
export function WorkDateViews({
  tasks,
  milestones,
  view,
  onOpen,
}: {
  tasks: any[];
  milestones: any[];
  view: string;
  onOpen: (task: any) => void;
}) {
  const [month, setMonth] = useState(today().slice(0, 7)),
    [scale, setScale] = useState('month'),
    [anchor, setAnchor] = useState(today());
  const timestamp = (value: string) => Date.parse(value + 'T00:00:00Z');
  const dated = tasks.filter((t) => t.data.starts_on || t.due_on),
    undated = tasks.filter((t) => !t.data.starts_on && !t.due_on);
  if (view === 'timeline') {
    const [year, number] = anchor.split('-').map(Number),
      date = new Date(anchor + 'T00:00:00Z'),
      count =
        scale === 'month'
          ? new Date(Date.UTC(year, number, 0)).getUTCDate()
          : scale === 'week'
            ? 7
            : 1;
    if (scale === 'month') date.setUTCDate(1);
    else if (scale === 'week') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const first = date.getTime(),
      last = first + (count - 1) * 86400000;
    const change = (delta: number) => {
      const next = new Date(anchor + 'T00:00:00Z');
      if (scale === 'month') {
        next.setUTCDate(1);
        next.setUTCMonth(next.getUTCMonth() + delta);
      } else next.setUTCDate(next.getUTCDate() + delta * (scale === 'week' ? 7 : 1));
      setAnchor(next.toISOString().slice(0, 10));
    };
    return (
      <section className="panel work-gantt">
        <div className="form-actions">
          <button className="secondary-button" onClick={() => change(-1)}>
            Previous
          </button>
          <Field label="Timeline scale">
            <select value={scale} onChange={(e) => setScale(e.target.value)}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </Field>
          <Field label="Planning date">
            <input
              type="date"
              value={anchor}
              onChange={(e) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setAnchor(e.target.value);
              }}
            />
          </Field>
          <button className="secondary-button" onClick={() => setAnchor(today())}>
            Today
          </button>
          <button className="secondary-button" onClick={() => change(1)}>
            Next
          </button>
        </div>
        <p>
          Recorded task dates. Bars show planned date spans; estimates are not actual time worked.
        </p>
        <div className="work-gantt-scroll">
          <div
            className="work-gantt-axis"
            style={{ gridTemplateColumns: '220px repeat(' + count + ',42px)' }}
          >
            <strong>Planning</strong>
            {Array.from({ length: count }, (_, i) => (
              <span key={i}>
                {new Date(first + i * 86400000).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            ))}
          </div>
          {dated.map((t) => {
            const start = timestamp(t.data.starts_on || t.due_on),
              end = timestamp(t.due_on || t.data.starts_on);
            if (end < first || start > last) return null;
            const left = Math.max(0, Math.floor((start - first) / 86400000)),
              width = Math.max(
                1,
                Math.floor((Math.min(last, end) - Math.max(first, start)) / 86400000) + 1,
              );
            return (
              <div
                className="work-gantt-row"
                key={t.id}
                style={{ gridTemplateColumns: '220px repeat(' + count + ',42px)' }}
              >
                <button className="quiet-button" onClick={() => onOpen(t)}>
                  {t.data.title}
                </button>
                <button
                  className="work-gantt-bar"
                  style={{ gridColumn: left + 2 + ' / span ' + width }}
                  title={(t.data.starts_on || t.due_on) + ' to ' + (t.due_on || t.data.starts_on)}
                  onClick={() => onOpen(t)}
                >
                  {t.data.title}
                </button>
              </div>
            );
          })}
          {milestones
            .filter((m) => m.due_on && timestamp(m.due_on) >= first && timestamp(m.due_on) <= last)
            .map((m) => (
              <div
                key={m.id}
                className="work-gantt-row work-gantt-milestone"
                style={{ gridTemplateColumns: '220px repeat(' + count + ',42px)' }}
              >
                <strong>{m.name}</strong>
                <span
                  style={{ gridColumn: Math.floor((timestamp(m.due_on) - first) / 86400000) + 2 }}
                  title={m.due_on + ' · ' + (m.completed ? 'Completed' : 'Planned')}
                >
                  ◆
                </span>
              </div>
            ))}
        </div>
        <h4>Unscheduled tasks</h4>
        {undated.map((t) => (
          <p key={t.id}>
            <button className="quiet-button" onClick={() => onOpen(t)}>
              {t.data.title}
            </button>
          </p>
        ))}
      </section>
    );
  }
  const [year, number] = month.split('-').map(Number),
    firstDate = new Date(Date.UTC(year, number - 1, 1)),
    leading = (firstDate.getUTCDay() + 6) % 7,
    days = new Date(Date.UTC(year, number, 0)).getUTCDate(),
    cells = Array.from({ length: Math.ceil((leading + days) / 7) * 7 }, (_, index) => {
      const day = index - leading + 1;
      return day >= 1 && day <= days ? month + '-' + String(day).padStart(2, '0') : null;
    });
  return (
    <section className="panel">
      <h3>Task calendar</h3>
      <p>
        Task start/due dates and project milestones. All dates use the workspace's recorded calendar
        dates.
      </p>
      <Field label="Calendar month">
        <input
          type="month"
          required
          value={month}
          onChange={(e) => {
            if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value);
          }}
        />
      </Field>
      <div className="work-calendar" role="group" aria-label={'Project calendar ' + month}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <strong className="work-weekday" key={day}>
            {day}
          </strong>
        ))}
        {cells.map((date, index) => (
          <section
            className={'work-calendar-day' + (date === today() ? ' today' : '')}
            key={date || 'blank-' + index}
            aria-label={date || 'Outside this month'}
          >
            {date && (
              <>
                <time dateTime={date}>{Number(date.slice(-2))}</time>
                {tasks
                  .filter((t) => t.due_on === date || t.data.starts_on === date)
                  .map((t) => (
                    <button key={t.id} className="quiet-button" onClick={() => onOpen(t)}>
                      {t.due_on === date ? 'Due: ' : 'Start: '}
                      {t.data.title}
                    </button>
                  ))}
                {milestones
                  .filter((m) => m.due_on === date)
                  .map((m) => (
                    <p key={m.id}>
                      Milestone: {m.name} · {m.completed ? 'Completed' : 'Planned'}
                    </p>
                  ))}
              </>
            )}
          </section>
        ))}
      </div>
      {undated.length > 0 && (
        <>
          <h4>Unscheduled tasks</h4>
          {undated.map((t) => (
            <p key={t.id}>
              <button className="quiet-button" onClick={() => onOpen(t)}>
                {t.data.title}
              </button>
            </p>
          ))}
        </>
      )}
    </section>
  );
}
