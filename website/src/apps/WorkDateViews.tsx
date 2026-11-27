import { useState } from 'react';
import { Field, today } from '../operations/UI';

export function WorkDateViews({
  tasks,
  milestones,
  meetings = [],
  view,
  onOpen,
}: {
  tasks: any[];
  milestones: any[];
  meetings?: any[];
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
            ‹ Previous
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
            Next ›
          </button>
        </div>
        <p className="muted" style={{ margin: '4px 0 8px', fontSize: 12 }}>
          Recorded task dates. Bars show planned date spans; estimates are not actual time worked.
        </p>
        <div className="work-gantt-scroll">
          <div
            className="work-gantt-axis"
            style={{ gridTemplateColumns: '200px repeat(' + count + ',38px)' }}
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
                style={{ gridTemplateColumns: '200px repeat(' + count + ',38px)' }}
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
                style={{ gridTemplateColumns: '200px repeat(' + count + ',38px)' }}
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
        {undated.length > 0 && (
          <>
            <h4>Unscheduled tasks</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {undated.map((t) => (
                <button key={t.id} className="secondary-button" onClick={() => onOpen(t)}>
                  {t.data.title}
                </button>
              ))}
            </div>
          </>
        )}
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

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, number - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const monthHeading = firstDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <section className="panel o-work-calendar-panel">
      <header className="o-work-calendar-bar">
        <div className="o-work-calendar-left">
          <h3>Work &amp; Meetings Schedule</h3>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMonth(today().slice(0, 7))}
          >
            Today
          </button>
          <div className="o-calendar-arrows" role="group" aria-label="Navigate month">
            <button
              type="button"
              className="secondary-button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="secondary-button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
            >
              ›
            </button>
          </div>
          <strong className="o-calendar-heading-label">{monthHeading}</strong>
        </div>
        <div className="o-work-calendar-right">
          <span className="o-legend-chip is-task">Task</span>
          <span className="o-legend-chip is-meeting">Meeting</span>
          <span className="o-legend-chip is-milestone">Milestone</span>
          <input
            type="month"
            aria-label="Calendar month"
            required
            value={month}
            onChange={(e) => {
              if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value);
            }}
          />
        </div>
      </header>

      <div className="work-calendar o-work-grid" role="group" aria-label={'Project calendar ' + month}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <strong className="work-weekday" key={day}>
            {day}
          </strong>
        ))}
        {cells.map((date, index) => {
          const isTodayCell = date === today();
          return (
            <section
              className={
                'work-calendar-day' +
                (isTodayCell ? ' today' : '') +
                (!date ? ' is-outside' : '')
              }
              key={date || 'blank-' + index}
              aria-label={date || 'Outside this month'}
            >
              {date && (
                <>
                  <div className="o-work-day-top">
                    <time
                      dateTime={date}
                      className={isTodayCell ? 'o-work-day-badge is-today' : 'o-work-day-badge'}
                    >
                      {Number(date.slice(-2))}
                    </time>
                  </div>
                  <div className="o-work-day-items">
                    {tasks
                      .filter((t) => t.due_on === date || t.data.starts_on === date)
                      .map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="o-work-chip is-task"
                          onClick={() => onOpen(t)}
                          title={t.data.title}
                        >
                          {t.due_on === date ? 'Due · ' : 'Start · '}
                          {t.data.title}
                        </button>
                      ))}
                    {milestones
                      .filter((m) => m.due_on === date)
                      .map((m) => (
                        <div key={m.id} className="o-work-chip is-milestone" title={m.name}>
                          ◆ {m.name}
                        </div>
                      ))}
                    {meetings
                      .filter((ev) => String(ev.starts_at || ev.start || '').slice(0, 10) === date)
                      .map((ev) => (
                        <div
                          key={`${ev.event_id || ev.id}:${ev.starts_at || ev.start}`}
                          className="o-work-chip is-meeting"
                          title={`${ev.title}${ev.location ? ' · ' + ev.location : ''}`}
                        >
                          {ev.starts_at || ev.start
                            ? new Date(ev.starts_at || ev.start).toLocaleTimeString('en-KE', {
                                timeZone: ev.timezone || 'Africa/Nairobi',
                                hour: '2-digit',
                                minute: '2-digit',
                              }) + ' '
                            : ''}
                          {ev.title}
                        </div>
                      ))}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      {undated.length > 0 && (
        <footer className="o-work-unscheduled">
          <strong>Unscheduled tasks ({undated.length}):</strong>
          <div className="o-work-unscheduled-list">
            {undated.map((t) => (
              <button key={t.id} type="button" className="secondary-button" onClick={() => onOpen(t)}>
                {t.data.title}
              </button>
            ))}
          </div>
        </footer>
      )}
    </section>
  );
}
