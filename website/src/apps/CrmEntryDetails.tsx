import { CrmExtraFields, crmExtraValues } from './CrmExtraFields';
import { CrmCustomerSelect } from './CrmCustomerSelect';
import { useEffect, useRef, useState } from 'react';
import { Overlay } from '../components/Overlay';
import { Field, Form, type API } from '../operations/UI';
import { parseMoney } from '../../../src/finance/money';

export function CrmEntryDetails({
  entry,
  customers,
  members,
  writable,
  save,
  convert,
  close,
  configuration,
  api,
  refresh,
  newQuotation,
  openQuotation,
  salesEnabled = false,
}: {
  api: API;
  configuration: any;
  entry: any;
  customers: any[];
  members: any[];
  writable: boolean;
  save: (entry: any) => Promise<any>;
  convert: (assignment: any) => Promise<any>;
  close: () => void;
  refresh: () => void;
  newQuotation: () => void;
  openQuotation: (id: string) => void;
  salesEnabled?: boolean;
}) {
  const [history, setHistory] = useState<any>(null),
    [activityPage, setActivityPage] = useState<any>(null),
    [activityError, setActivityError] = useState(''),
    [historyError, setHistoryError] = useState(''),
    [dialog, setDialog] = useState<'convert' | 'lost' | 'schedule' | null>(null),
    [tab, setTab] = useState<'notes' | 'activities' | 'history'>('notes'),
    [quotes, setQuotes] = useState<any[]>([]),
    [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing'),
    [quoteError, setQuoteError] = useState('');
  useEffect(() => {
    let current = true;
    setHistory(null);
    setHistoryError('');
    api('/crm/entries/' + entry.id + '/history')
      .then((r) => {
        if (current) setHistory(r);
      })
      .catch((e) => {
        if (current) setHistoryError(e.message);
      });
    return () => {
      current = false;
    };
  }, [entry.id, entry.version, api]);
  useEffect(() => {
    let current = true;
    setActivityPage(null);
    setActivityError('');
    if (entry.kind !== 'opportunity') return;
    api(
      '/crm/entries?' +
        new URLSearchParams({ parent_entry_id: entry.id, limit: '200', offset: '0' }),
    )
      .then((result) => current && setActivityPage(result))
      .catch((e) => current && setActivityError((e as Error).message));
    return () => {
      current = false;
    };
  }, [api, entry.id, entry.kind]);
  useEffect(() => {
    let live = true;
    setQuotes([]);
    setQuoteError('');
    if (entry.kind === 'opportunity' && salesEnabled)
      api('/sales/quotations?' + new URLSearchParams({ customer_id: entry.customer_id }))
        .then((r) => {
          if (live)
            setQuotes((r.data || []).filter((q: any) => q.customer_id === entry.customer_id));
        })
        .catch(() => {
          if (live)
            setQuoteError('Sales quotations are unavailable to your current role or services.');
        });
    return () => {
      live = false;
    };
  }, [api, entry.id, entry.customer_id, entry.kind, salesEnabled]);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
    setDialog(null);
  }, [entry.id]);
  const customer = customers.find((c) => c.id === entry.customer_id),
    activities: any[] = activityPage?.data || [];
  function payload(changes: any) {
    const { id: _, version: __, created_at: ___, updated_at: ____, ...rest } = entry;
    return { ...rest, ...changes };
  }
  async function updateActivity(item: any, changes: any) {
    const { id, version, created_at, updated_at, ...rest } = item;
    const updated = await api(
      '/crm/entries/' + id,
      'PATCH',
      { expected_version: version, entry: { ...rest, ...changes } },
      { 'Idempotency-Key': crypto.randomUUID() },
    );
    setActivityPage((previous: any) =>
      previous
        ? { ...previous, data: previous.data.map((activity: any) => activity.id === id ? updated : activity) }
        : previous,
    );
    refresh();
  }
  async function addActivity(d: any, kind: 'follow_up' | 'interaction') {
    const created = await api(
      '/crm/entries',
      'POST',
      {
        kind,
        customer_id: entry.customer_id,
        parent_entry_id: entry.id,
        title: d.title,
        notes: d.notes || '',
        stage: entry.stage,
        assigned_to: d.assigned_to || null,
        due_at: d.due ? new Date(d.due).toISOString() : null,
        activity_type: kind === 'interaction' ? 'note' : d.activity_type,
      },
      { 'Idempotency-Key': crypto.randomUUID() },
    );
    setActivityPage((previous: any) =>
      previous
        ? {
            ...previous,
            data: [created, ...previous.data],
            total: previous.total + 1,
            has_more: previous.data.length + 1 < previous.total + 1,
          }
        : previous,
    );
    refresh();
    setTab('activities');
  }
  return (
    <section ref={ref} tabIndex={-1} className="crm-document" aria-labelledby="crm-record-title">
      <div className="crm-document-top">
        <button className="quiet-button" onClick={close}>
          ← Pipeline / records
        </button>
        <span>{entry.kind.replaceAll('_', ' ')}</span>
      </div>
      <div className="crm-document-actions">
        {entry.kind === 'opportunity' && salesEnabled && (
          <button className="secondary-button" disabled={!writable} onClick={newQuotation}>
            New quotation
          </button>
        )}
        {entry.kind === 'opportunity' && entry.status === 'open' && (
          <>
            <Form
              className="compact-form"
              disabled={!writable}
              submit={() => save(payload({ stage: 'won', outcome_reason: '' }))}
            >
              <button className="button">Won</button>
            </Form>
            <button
              className="secondary-button"
              disabled={!writable}
              onClick={() => setDialog('lost')}
            >
              Lost
            </button>
          </>
        )}
        {entry.kind === 'opportunity' && ['won', 'lost'].includes(entry.stage) && (
          <Form
            className="compact-form"
            disabled={!writable}
            submit={() => save(payload({ stage: 'new', status: 'open', outcome_reason: '' }))}
          >
            <button className="secondary-button">Restore</button>
          </Form>
        )}
        {entry.kind === 'lead' &&
          entry.status === 'open' &&
          !['won', 'lost'].includes(entry.stage) && (
            <button className="button" disabled={!writable} onClick={() => setDialog('convert')}>
              Convert to opportunity
            </button>
          )}
        <details className="crm-record-actions">
          <summary className="secondary-button">Actions</summary>
          <div className="crm-record-actions-menu">
            {entry.kind === 'opportunity' && (
              <button type="button" onClick={() => setDialog('schedule')}>
                Schedule activity
              </button>
            )}
            <button type="button" onClick={() => setTab('activities')}>
              View activities
            </button>
            <button type="button" onClick={() => setTab('history')}>
              Revision history
            </button>
          </div>
        </details>
      </div>
      {entry.kind === 'opportunity' && (
        <nav className="crm-stage-progress" aria-label="Opportunity stage">
          {configuration.stages.map((s: any) => (
            <span key={s.id} aria-current={s.id === entry.stage ? 'step' : undefined}>
              {s.name}
            </span>
          ))}
        </nav>
      )}
      <div className="panel crm-document-sheet">
        <h2 id="crm-record-title">{entry.title}</h2>
        <p className="environment-note">
          {customer?.name || 'Customer not in loaded list'} · Created{' '}
          {new Date(entry.created_at).toLocaleString()} · Updated{' '}
          {new Date(entry.updated_at).toLocaleString()}
        </p>
        <Form
          key={entry.id + ':' + entry.version}
          disabled={!writable}
          submit={(d) =>
            save(
              payload({
                ...crmExtraValues(d, parseMoney),
                title: d.title,
                notes: d.notes,
                status: d.status,
                stage: d.stage,
                assigned_to: d.assigned_to || null,
                due_at: d.due ? new Date(d.due).toISOString() : null,
                amount_minor: parseMoney(d.amount, d.currency),
                currency: d.currency,
              }),
            )
          }
        >
          <div className="form-grid">
            <Field label="Opportunity / lead title">
              <input
                name="title"
                required
                minLength={2}
                maxLength={200}
                defaultValue={entry.title}
              />
            </Field>
            <Field label="Expected revenue">
              <input
                name="amount"
                required
                inputMode="decimal"
                defaultValue={String(
                  entry.amount_minor / (['UGX', 'RWF'].includes(entry.currency) ? 1 : 100),
                )}
              />
            </Field>
            <Field label="Currency">
              <select name="currency" defaultValue={entry.currency}>
                {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Stage">
              <select name="stage" defaultValue={entry.stage}>
                {configuration.stages.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={entry.status}>
                {['open', 'completed', 'cancelled', 'archived'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Salesperson">
              <select name="assigned_to" defaultValue={entry.assigned_to || ''}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || m.email} · {m.role}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due time">
              <input
                name="due"
                type="datetime-local"
                required={entry.kind === 'follow_up'}
                defaultValue={
                  entry.due_at
                    ? new Date(
                        new Date(entry.due_at).getTime() -
                          new Date(entry.due_at).getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ''
                }
              />
            </Field>
            <CrmExtraFields entry={entry} configuration={configuration} />
          </div>
          <p>
            Contact: {customer?.name || 'Not loaded'}
            {customer?.email ? ' · ' + customer.email : ''}
            {customer?.phone ? ' · ' + customer.phone : ''}
          </p>
          <Field label="Internal notes">
            <textarea name="notes" maxLength={4000} defaultValue={entry.notes} />
          </Field>
          <button className="button">Save changes</button>
        </Form>
        {entry.kind === 'opportunity' && (
          <section>
            <h3>Related sales</h3>
            {!salesEnabled ? (
              <p>Sales service is not active. Linked quotation information remains read-only.</p>
            ) : quoteError ? (
              <p>{quoteError}</p>
            ) : (
              <Form
                disabled={!writable}
                submit={(d) => save(payload({ quotation_id: d.quotation_id || null }))}
              >
                <Field label="Link an existing quotation for this customer">
                  <select
                    key={(entry.quotation_id || 'none') + ':' + quotes.length}
                    name="quotation_id"
                    defaultValue={entry.quotation_id || ''}
                  >
                    <option value="">No linked quotation</option>
                    {entry.quotation_id && !quotes.some((q) => q.id === entry.quotation_id) && (
                      <option value={entry.quotation_id}>
                        Current linked quotation ({entry.quotation_id})
                      </option>
                    )}
                    {quotes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.reference || q.id} · {q.status}
                      </option>
                    ))}
                  </select>
                </Field>
                <button className="secondary-button">Save quotation link</button>
              </Form>
            )}
            {entry.quotation_id && (
              <p>
                Linked quotation:{' '}
                {salesEnabled ? (
                  <button className="quiet-button" onClick={() => openQuotation(entry.quotation_id)}>
                    {quotes.find((q) => q.id === entry.quotation_id)?.reference || entry.quotation_id}
                  </button>
                ) : (
                  <span>{entry.quotation_id}</span>
                )}
              </p>
            )}
            {entry.order_id && <p>Linked order: {entry.order_id}</p>}
          </section>
        )}
        <p className="environment-note">Outbound messaging is not configured here.</p>
      </div>
      <div className="crm-detail-tabs" role="group" aria-label="Record information">
        {(
          [
            ['notes', 'Log note'],
            ['activities', 'Activities'],
            ['history', 'History'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className="secondary-button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'notes' && entry.kind === 'opportunity' && (
        <Form disabled={!writable} submit={(d) => addActivity(d, 'interaction')}>
          <h3>Log an internal note</h3>
          <Field label="Summary">
            <input name="title" required minLength={2} maxLength={200} />
          </Field>
          <Field label="Note">
            <textarea name="notes" maxLength={4000} />
          </Field>
          <button className="button">Log note</button>
        </Form>
      )}
      {tab === 'activities' && (
        <section className="panel">
          <h3>Activities and notes</h3>
          {activityError && <p role="alert">Activity history unavailable: {activityError}</p>}
          {entry.kind === 'opportunity' && (
            <button className="secondary-button" disabled={!writable} onClick={() => setDialog('schedule')}>
              Schedule activity
            </button>
          )}
          {!activityPage && !activityError && <p role="status">Loading all linked activities…</p>}
          {activityPage && !activities.length && <p>No linked activities or notes recorded.</p>}
          {activities.map((a) => (
            <article className="crm-timeline-item" key={a.id}>
              <strong>{a.title}</strong>
              <p>
                {a.activity_type} · {a.status}
                {a.due_at ? ' · Due ' + new Date(a.due_at).toLocaleString() : ''}
              </p>
              {a.notes && <p>{a.notes}</p>}
              <small>Created {new Date(a.created_at).toLocaleString()}</small>
              {a.kind === 'follow_up' && a.status === 'open' && (
                <Form
                  className="compact-form"
                  disabled={!writable}
                  submit={(d) =>
                    updateActivity(a, {
                      status: 'completed',
                      notes: [a.notes, d.completion].filter(Boolean).join('\n'),
                    })
                  }
                >
                  <Field label="Completion note">
                    <input name="completion" maxLength={1000} />
                  </Field>
                  <button className="secondary-button">Mark done</button>
                </Form>
              )}
              {a.kind === 'follow_up' && a.status === 'open' && (
                <details>
                  <summary>Reschedule or cancel</summary>
                  <Form
                    className="compact-form"
                    disabled={!writable}
                    submit={(d) => updateActivity(a, { due_at: new Date(d.due).toISOString() })}
                  >
                    <Field label="New due date and time">
                      <input name="due" type="datetime-local" required />
                    </Field>
                    <button className="secondary-button">Reschedule</button>
                  </Form>
                  <Form
                    className="compact-form"
                    disabled={!writable}
                    submit={() => updateActivity(a, { status: 'cancelled' })}
                  >
                    <button className="secondary-button">Cancel activity</button>
                  </Form>
                </details>
              )}
            </article>
          ))}
          {activityPage?.has_more && (
            <button
              className="secondary-button"
              onClick={async () => {
                try {
                  const next = await api(
                    '/crm/entries?' +
                      new URLSearchParams({
                        parent_entry_id: entry.id,
                        limit: String(activityPage.limit),
                        offset: String(activityPage.offset + activityPage.limit),
                      }),
                  );
                  setActivityPage((previous: any) => ({
                    ...next,
                    data: [...previous.data, ...next.data],
                  }));
                } catch (e) {
                  setActivityError((e as Error).message);
                }
              }}
            >
              Load more linked activities
            </button>
          )}
        </section>
      )}
      {tab === 'history' && (
        <section className="panel">
          <h3>Record revision history</h3>
          {historyError && <p role="alert">{historyError}</p>}
          {!history && !historyError && <p role="status">Loading revision history…</p>}
          {history && (
            <>
              <p>{history.coverage}</p>
              {history.data.map((r: any) => (
                <article className="crm-timeline-item" key={r.entry_version}>
                  <strong>
                    Version {r.entry_version} · {r.action}
                  </strong>
                  <p>
                    {r.snapshot.title} · {r.snapshot.stage} · {r.snapshot.status}
                  </p>
                  <small>Recorded {new Date(r.recorded_at).toLocaleString()}</small>
                </article>
              ))}
            </>
          )}
        </section>
      )}
      {dialog && (
        <Overlay portal onClose={() => setDialog(null)}>
          <section
            className="panel crm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              dialog === 'lost'
                ? 'Mark opportunity lost'
                : dialog === 'schedule'
                  ? 'Schedule activity'
                  : 'Convert to opportunity'
            }
          >
            <div className="crm-dialog-heading">
              <h3>
                {dialog === 'lost'
                  ? 'Mark opportunity lost'
                  : dialog === 'schedule'
                    ? 'Schedule activity'
                    : 'Convert to opportunity'}
              </h3>
              <button className="icon-button" aria-label="Close dialog" onClick={() => setDialog(null)}>
                ×
              </button>
            </div>
            {dialog === 'lost' ? (
              <Form
                disabled={!writable}
                submit={async (d) => {
                  await save(
                    payload({
                      stage: 'lost',
                      outcome_reason: [d.reason, d.closing_note].filter(Boolean).join('\n'),
                    }),
                  );
                  setDialog(null);
                }}
              >
                {configuration.lost_reasons?.length ? (
                  <Field label="Lost reason">
                    <select name="reason" required defaultValue="">
                      <option value="">Choose a reason</option>
                      {configuration.lost_reasons.map((reason: string) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field label="Lost reason">
                    <input name="reason" required maxLength={120} />
                  </Field>
                )}
                <Field label="Closing note">
                  <textarea name="closing_note" maxLength={1800} />
                </Field>
                <button className="button">Mark lost</button>{' '}
                <button type="button" className="secondary-button" onClick={() => setDialog(null)}>
                  Cancel
                </button>
              </Form>
            ) : dialog === 'schedule' ? (
              <Form
                disabled={!writable}
                submit={async (d) => {
                  await addActivity(d, 'follow_up');
                  setDialog(null);
                }}
              >
                <div className="form-grid">
                  <Field label="Activity type">
                    <select name="activity_type" defaultValue="task">
                      <option value="task">To-do</option>
                      <option value="call">Call</option>
                      <option value="meeting">Meeting</option>
                    </select>
                  </Field>
                  <Field label="Summary">
                    <input name="title" required minLength={2} maxLength={200} />
                  </Field>
                  <Field label="Due date and time">
                    <input name="due" type="datetime-local" required />
                  </Field>
                  <Field label="Assigned member">
                    <select name="assigned_to" defaultValue={entry.assigned_to || ''}>
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.display_name || m.email}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Description">
                  <textarea name="notes" maxLength={4000} />
                </Field>
                <div className="form-actions">
                  <button className="button">Schedule activity</button>
                  <button type="button" className="secondary-button" onClick={() => setDialog(null)}>
                    Cancel
                  </button>
                </div>
              </Form>
            ) : (
              <Form
                disabled={!writable}
                submit={async (d) => {
                  if (customerMode === 'existing' && !d.customer_id)
                    throw new Error('Choose a customer from the search results.');
                  await convert({
                    assigned_to: d.assigned_to || null,
                    team_id: d.team_id || null,
                    ...(customerMode === 'existing'
                      ? { customer_id: d.customer_id }
                      : {
                          new_customer: {
                            name: d.customer_name,
                            type: d.customer_type,
                            email: d.customer_email || '',
                            phone: d.customer_phone || '',
                            address: '',
                            notes: '',
                          },
                        }),
                  });
                  setDialog(null);
                }}
              >
                <p>
                  Convert this lead in place. Notes, amount and record history are retained; choose
                  the customer below.
                </p>
                <fieldset>
                  <legend>Customer</legend>
                  <label>
                    <input
                      type="radio"
                      name="customer_mode"
                      checked={customerMode === 'existing'}
                      onChange={() => setCustomerMode('existing')}
                    />{' '}
                    Link existing customer
                  </label>{' '}
                  <label>
                    <input
                      type="radio"
                      name="customer_mode"
                      checked={customerMode === 'new'}
                      onChange={() => setCustomerMode('new')}
                    />{' '}
                    Create a new customer
                  </label>
                </fieldset>
                {customerMode === 'existing' ? (
                  <Field label="Customer">
                    <CrmCustomerSelect
                      api={api}
                      name="customer_id"
                      defaultValue={entry.customer_id}
                      required
                    />
                  </Field>
                ) : (
                  <div className="form-grid">
                    <Field label="Customer name">
                      <input name="customer_name" required maxLength={200} />
                    </Field>
                    <Field label="Customer type">
                      <select name="customer_type">
                        <option value="individual">Individual</option>
                        <option value="business">Business</option>
                      </select>
                    </Field>
                    <Field label="Email">
                      <input name="customer_email" type="email" />
                    </Field>
                    <Field label="Phone">
                      <input name="customer_phone" maxLength={50} />
                    </Field>
                  </div>
                )}
                <Field label="Salesperson">
                  <select name="assigned_to" defaultValue={entry.assigned_to || ''}>
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name || m.email}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Sales team">
                  <select name="team_id" defaultValue={entry.team_id || ''}>
                    <option value="">No team</option>
                    {configuration.teams
                      .filter((t: any) => t.active)
                      .map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <p>
                  Existing customers with the same email or phone must be reviewed and linked
                  instead. Opportunity merging is not supported.
                </p>
                <button className="button">Create opportunity</button>{' '}
                <button type="button" className="secondary-button" onClick={() => setDialog(null)}>
                  Cancel
                </button>
              </Form>
            )}
          </section>
        </Overlay>
      )}
    </section>
  );
}
