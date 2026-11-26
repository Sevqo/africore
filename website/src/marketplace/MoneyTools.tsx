import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DateRange } from '../components/DateRange';
import { Field, today, money, type API } from '../operations/UI';
import { parseMoney } from '../../../src/finance/money';
import { Overlay } from '../components/Overlay';
import { DocumentAttachments } from '../apps/DocumentAttachments';
import { DataTable } from '../components/DataTable';
const categories = [
  'subscriptions',
  'groceries',
  'transport',
  'rent',
  'utilities',
  'software',
  'health',
  'education',
  'entertainment',
  'stock',
  'payroll',
  'delivery',
  'other',
];
const currencies = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'];
export function MoneyTools({
  api,
  scope,
  cashFlow = false,
  writable,
  documentsEnabled = false,
  compact = false,
}: {
  api: API;
  scope: string;
  cashFlow?: boolean;
  writable: boolean;
  documentsEnabled?: boolean;
  compact?: boolean;
}) {
  const [expenses, setExpenses] = useState<any[]>([]),
    [obligations, setObligations] = useState<any[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [range, setRange] = useState({ from: '', to: '' }),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [filterCurrency, setFilterCurrency] = useState(''),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0),
    [historyRows, setHistoryRows] = useState<any[]>([]),
    [editing, setEditing] = useState<any>(null),
    [documentsFor, setDocumentsFor] = useState<any>(null);
  const formKeys = useRef(new WeakMap<HTMLFormElement, string>());
  useEffect(() => {
    let live = true;
    setExpenses([]);
    setObligations([]);
    setError('');
    setBusy(true);
    const params = new URLSearchParams({ limit: '20', offset: String(page * 20) });
    if (query.trim()) params.set('q', query.trim());
    if (category) params.set('category', category);
    if (filterCurrency) params.set('currency', filterCurrency);
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    Promise.allSettled([
      api('/expenses?' + params),
      cashFlow ? api('/obligations?limit=100') : Promise.resolve({ data: [] }),
      api('/expenses?limit=100&include_history=true'),
    ]).then(([e, o, h]) => {
      if (!live) return;
      if (e.status === 'fulfilled') {
        setExpenses(e.value.data || []);
        setTotal(Number(e.value.total || 0));
      } else setError('Expense records: ' + e.reason.message);
      if (o.status === 'fulfilled') setObligations(o.value.data || []);
      else if (cashFlow) setError((current) => current || 'Obligations: ' + o.reason.message);
      if (h.status === 'fulfilled') setHistoryRows(h.value.data || []);
      setBusy(false);
    });
    return () => {
      live = false;
    };
  }, [scope, cashFlow, version, query, category, filterCurrency, range.from, range.to, page]);
  async function save(path: string, method: string, body: any, key: string = crypto.randomUUID()) {
    setBusy(true);
    setError('');
    try {
      const result = await api(path, method, body, { 'Idempotency-Key': key });
      setVersion((n) => n + 1);
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>, kind: 'expense' | 'obligation') {
    e.preventDefault();
    const form = e.currentTarget,
      d = Object.fromEntries(new FormData(form)),
      currency = String(d.currency);
    setError('');
    setNotice('');
    try {
      if (!formKeys.current.has(form)) formKeys.current.set(form, crypto.randomUUID());
      const result = await save(
        kind === 'expense' ? '/expenses' : '/obligations',
        'POST',
        {
          description: d.description,
          currency,
          amount_minor: parseMoney(String(d.amount), currency),
          supplier: d.supplier || '',
          ...(kind === 'expense'
            ? { occurred_on: d.date, category: d.category, notes: d.notes || '' }
            : {
                next_due_date: d.date,
                recurrence: d.recurrence,
                category: d.category,
                timezone: d.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                reminder_days: Number(d.reminder_days || 3),
              }),
        },
        formKeys.current.get(form),
      );
      if (result) {
        formKeys.current.delete(form);
        form.reset();
        setNotice(
          kind === 'expense'
            ? 'Expense recorded as self-reported information.'
            : 'Obligation saved; no payment was sent.',
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const replaced = new Set(historyRows.map((e) => e.supersedes_id).filter(Boolean));
  const current = expenses;
  function expenseCorrection(row: any, changes: any) {
    const {
      description,
      amount_minor,
      currency,
      occurred_on,
      category,
      transaction_id,
      obligation_id,
      supplier,
      notes,
    } = row;
    return {
      description,
      amount_minor,
      currency,
      occurred_on,
      category,
      transaction_id,
      obligation_id,
      supplier: supplier || '',
      notes: notes || '',
      supersedes_id: row.id,
      ...changes,
    };
  }
  return (
    <section className="service-marketplace">
      {error && (
        <div role="alert" className="alert error">
          <p>{error}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setVersion((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Updating records…</p>}
      {writable && (
        <details className={compact ? 'finance-expense-create' : ''} open={!compact}>
          <summary>{compact ? 'Record an expense' : 'Expense entry'}</summary>
          <div className="service-grid">
            {(['expense', ...(cashFlow ? ['obligation'] : [])] as ('expense' | 'obligation')[]).map(
              (kind) => (
                <form
                  key={kind}
                  className="panel account-stack-form"
                  onSubmit={(e) => submit(e, kind)}
                >
                  <h2>{kind === 'expense' ? 'Record an expense' : 'Plan an obligation'}</h2>
                  <Field label="Description">
                    <input name="description" required maxLength={300} />
                  </Field>
                  <Field label="Currency">
                    <select name="currency">
                      {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Amount">
                    <input name="amount" type="text" inputMode="decimal" required />
                  </Field>
                  <Field label={kind === 'expense' ? 'Date paid' : 'Next due date'}>
                    <input
                      name="date"
                      type="date"
                      required
                      defaultValue={kind === 'expense' ? today() : undefined}
                      max={kind === 'expense' ? today() : undefined}
                    />
                  </Field>
                  <Field label="Category">
                    <select name="category">
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Supplier (optional)">
                    <input name="supplier" maxLength={200} />
                  </Field>
                  {kind === 'obligation' ? (
                    <>
                      <Field label="Reminder timezone">
                        <input
                          name="timezone"
                          required
                          defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
                        />
                      </Field>
                      <Field label="Remind this many days before due">
                        <input
                          name="reminder_days"
                          type="number"
                          min="0"
                          max="30"
                          defaultValue="3"
                          required
                        />
                      </Field>
                      <Field label="Recurrence">
                        <select name="recurrence">
                          {['once', 'weekly', 'monthly', 'quarterly', 'yearly'].map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </Field>
                    </>
                  ) : (
                    <Field label="Notes">
                      <textarea name="notes" maxLength={3000} />
                    </Field>
                  )}
                  <button className="button" disabled={busy}>
                    {kind === 'expense' ? 'Record expense' : 'Save obligation'}
                  </button>
                  <p>
                    {kind === 'expense'
                      ? 'Manually recorded; this does not send money or independently confirm a transaction.'
                      : 'A planned obligation is not a paid expense or automatic payment.'}
                  </p>
                </form>
              ),
            )}
          </div>
        </details>
      )}
      <section className="panel">
        <h2>Recorded expenses</h2>
        <div className="finance-toolbar">
          <Field label="Search">
            <input
              value={query}
              onChange={(e) => {
                setPage(0);
                setQuery(e.target.value);
              }}
              placeholder="Description or supplier"
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => {
                setPage(0);
                setCategory(e.target.value);
              }}
            >
              <option value="">All categories</option>
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Currency">
            <select
              value={filterCurrency}
              onChange={(e) => {
                setPage(0);
                setFilterCurrency(e.target.value);
              }}
            >
              <option value="">All currencies</option>
              {currencies.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        </div>
        <DateRange from={range.from} to={range.to} onApply={(from, to) => setRange({ from, to })} />
        <p>
          {total} effective entries · Reports use covered records and exclude superseded
          corrections.
        </p>
        <DataTable className="finance-wide-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Supplier</th>
              <th>Currency</th>
              <th>Amount</th>
              <th>Assurance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {current.map((e) => (
              <tr key={e.id}>
                <td>{e.occurred_on}</td>
                <td>{e.description}</td>
                <td>{e.category}</td>
                <td>{e.supplier || '—'}</td>
                <td>{e.currency}</td>
                <td>{money(e.amount_minor, e.currency)}</td>
                <td>{String(e.assurance || 'merchant_recorded').replaceAll('_', ' ')}</td>
                <td>
                  <div className="finance-actions">
                    {documentsEnabled && (
                      <button className="secondary-button" onClick={() => setDocumentsFor(e)}>
                        Documents
                      </button>
                    )}
                    {writable && (
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => setEditing(e)}
                      >
                        Correct / archive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {!current.length && !busy && <p>No recorded expenses match these filters.</p>}
        <div className="finance-pager">
          <span>
            {total
              ? `${page * 20 + 1}–${Math.min((page + 1) * 20, total)} of ${total}`
              : '0 records'}
          </span>
          <button
            className="secondary-button"
            disabled={page === 0 || busy}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <button
            className="secondary-button"
            disabled={(page + 1) * 20 >= total || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
        <details>
          <summary>Retained expense history</summary>
          {historyRows
            .filter((e) => replaced.has(e.id) || e.status === 'archived')
            .map((e) => (
              <p key={e.id}>
                {e.description} · {money(e.amount_minor, e.currency)} ·{' '}
                {e.status === 'archived' ? 'Archived' : 'Superseded'}
              </p>
            ))}
        </details>
      </section>
      {cashFlow && (
        <section className="panel">
          <h2>Upcoming obligations</h2>
          {obligations.map((o) => (
            <article className="list-row" key={o.id}>
              <span>
                {o.description} · {o.next_due_date} · {o.status} · {o.recurrence}
              </span>
              <strong>{money(o.amount_minor, o.currency)}</strong>
              {writable && ['active', 'paused'].includes(o.status) && (
                <div className="finance-actions">
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      save('/obligations/' + o.id, 'PATCH', {
                        status: o.status === 'active' ? 'paused' : 'active',
                      })
                    }
                  >
                    {o.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                  {o.status === 'active' && o.next_due_date <= today() && (
                    <>
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() =>
                          save('/obligations/' + o.id + '/fulfill', 'POST', {
                            action: 'fulfill',
                            record_expense: true,
                          })
                        }
                      >
                        Record paid occurrence
                      </button>
                      <button
                        className="quiet-button"
                        disabled={busy}
                        onClick={() =>
                          save('/obligations/' + o.id + '/fulfill', 'POST', {
                            action: 'skip',
                            record_expense: false,
                          })
                        }
                      >
                        Skip occurrence
                      </button>
                    </>
                  )}
                  <button
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => save('/obligations/' + o.id, 'PATCH', { status: 'cancelled' })}
                  >
                    Cancel future plan
                  </button>
                </div>
              )}
            </article>
          ))}
          {!obligations.length && !busy && <p>No upcoming obligations.</p>}
          <p>
            Paid occurrences explicitly create a self-reported expense. Recurring plans advance from
            their original calendar anchor, retaining every handled occurrence.
          </p>
        </section>
      )}
      {editing && (
        <Overlay onClose={() => setEditing(null)}>
          <section
            className="service-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-correction"
          >
            <h2 id="expense-correction">Correct {editing.description}</h2>
            {error && (
              <p role="alert" className="alert error">
                {error}
              </p>
            )}
            <p>Corrections append a new version. Original records are retained.</p>
            <form
              className="account-stack-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                try {
                  const r = await save(
                    '/expenses',
                    'POST',
                    expenseCorrection(editing, {
                      description: d.get('description'),
                      amount_minor: parseMoney(String(d.get('amount')), editing.currency),
                      category: d.get('category'),
                    }),
                  );
                  if (r) setEditing(null);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Field label="Description">
                <input name="description" required defaultValue={editing.description} />
              </Field>
              <Field label={'Amount · ' + editing.currency}>
                <input
                  name="amount"
                  required
                  inputMode="decimal"
                  defaultValue={String(
                    editing.amount_minor / (['UGX', 'RWF'].includes(editing.currency) ? 1 : 100),
                  )}
                />
              </Field>
              <Field label="Category">
                <select name="category" defaultValue={editing.category}>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <button className="button" disabled={busy}>
                Save correction
              </button>
            </form>
            <div className="finance-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={async () => {
                  const r = await save(
                    '/expenses',
                    'POST',
                    expenseCorrection(editing, { status: 'archived' }),
                  );
                  if (r) setEditing(null);
                }}
              >
                Confirm archive
              </button>
              <button className="quiet-button" onClick={() => setEditing(null)}>
                Keep record
              </button>
            </div>
          </section>
        </Overlay>
      )}
      {documentsFor && (
        <Overlay onClose={() => setDocumentsFor(null)}>
          <section
            className="service-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-documents-heading"
          >
            <h2 id="expense-documents-heading">Documents · {documentsFor.description}</h2>
            <p>
              Expense files remain private and are accessible only through their own current file
              permissions. Linking does not verify the expense or alter its financial record.
            </p>
            <DocumentAttachments
              api={api}
              sourceKind="expense"
              sourceId={documentsFor.id}
              writable={writable}
              allowUpload
            />
            <button className="secondary-button" onClick={() => setDocumentsFor(null)}>
              Close
            </button>
          </section>
        </Overlay>
      )}
    </section>
  );
}
