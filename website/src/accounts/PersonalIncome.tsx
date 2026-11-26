import { useEffect, useState, type FormEvent } from 'react';
import { DataTable } from '../components/DataTable';
import { Field, money, type API } from '../operations/UI';
import { Currency, today } from './AccountUI';
import { parseMoney } from '../../../src/finance/money';

const INCOME_PRESETS = [
  { name: 'Monthly Salary', source: 'Employer', recurrence: 'monthly', amount: '120000', category: 'salary' },
  { name: 'Freelance Retainer', source: 'Client', recurrence: 'monthly', amount: '45000', category: 'freelance' },
  { name: 'Rental Income', source: 'Tenant', recurrence: 'monthly', amount: '35000', category: 'rental' },
  { name: 'Dividends / Interest', source: 'Investments', recurrence: 'quarterly', amount: '15000', category: 'dividends' },
  { name: 'Side Business Payout', source: 'Side Hustle', recurrence: 'biweekly', amount: '20000', category: 'side_hustle' },
  { name: 'Stipend / Allowance', source: 'Family / Grant', recurrence: 'monthly', amount: '15000', category: 'allowance' },
] as const;

const INCOME_CATEGORIES = [
  { value: 'salary', label: 'Salary & Wages' },
  { value: 'freelance', label: 'Freelance & Consulting' },
  { value: 'business', label: 'Business Drawings' },
  { value: 'rental', label: 'Rental Income' },
  { value: 'dividends', label: 'Dividends & Interest' },
  { value: 'side_hustle', label: 'Side Hustle' },
  { value: 'pension', label: 'Pension & Benefits' },
  { value: 'allowance', label: 'Allowance & Stipend' },
  { value: 'other', label: 'Other' },
] as const;

function monthlyFactor(recurrence: string) {
  if (recurrence === 'weekly') return 52 / 12;
  if (recurrence === 'biweekly') return 26 / 12;
  if (recurrence === 'quarterly') return 1 / 3;
  if (recurrence === 'yearly') return 1 / 12;
  if (recurrence === 'once') return 0;
  return 1;
}

export function PersonalIncome({
  api,
  scope,
  currency = 'KES',
  timezone = 'Africa/Nairobi',
  writable = true,
  onChanged,
  onOpenForecasts,
}: {
  api: API;
  scope: string;
  currency?: string;
  timezone?: string;
  writable?: boolean;
  onChanged?: () => void;
  onOpenForecasts?: () => void;
}) {
  const [records, setRecords] = useState<any[]>([]),
    [plans, setPlans] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [filter, setFilter] = useState<'active' | 'paused' | 'cancelled' | 'all'>('active'),
    [query, setQuery] = useState(''),
    [draft, setDraft] = useState({
      description: '',
      source: '',
      amount: '',
      currency,
      recurrence: 'monthly',
      next_pay_date: today(timezone),
      category: 'salary',
    }),
    [oneOff, setOneOff] = useState({
      description: '',
      amount: '',
      currency,
      occurred_on: today(timezone),
    });

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    Promise.all([api('/personal-income'), api('/personal-income/recurring')])
      .then(([inc, rec]) => {
        if (!live) return;
        setRecords(inc?.data || []);
        setPlans(rec?.data || []);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [scope, revision]);

  async function addRecurring(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(
        '/personal-income/recurring',
        'POST',
        {
          description: draft.description.trim(),
          source: draft.source.trim(),
          amount_minor: parseMoney(draft.amount, draft.currency),
          currency: draft.currency,
          recurrence: draft.recurrence,
          next_pay_date: draft.next_pay_date,
          category: draft.category,
          timezone,
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setDraft({
        description: '',
        source: '',
        amount: '',
        currency,
        recurrence: 'monthly',
        next_pay_date: today(timezone),
        category: 'salary',
      });
      setNotice('Recurring income saved and automatically included in Forecasts.');
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addOneOff(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(
        '/personal-income',
        'POST',
        {
          description: oneOff.description.trim(),
          amount_minor: parseMoney(oneOff.amount, oneOff.currency),
          currency: oneOff.currency,
          occurred_on: oneOff.occurred_on,
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setOneOff({
        description: '',
        amount: '',
        currency,
        occurred_on: today(timezone),
      });
      setNotice('Income recorded.');
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function receiveRecurring(plan: any) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(
        '/personal-income/recurring/' + plan.id + '/receive',
        'POST',
        {},
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setNotice(`Recorded "${plan.description}" into Income and advanced next pay date.`);
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function receiveAllDue() {
    const localToday = today(timezone);
    const due = activePlans.filter((p) => p.next_pay_date && p.next_pay_date <= localToday);
    if (!due.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (const plan of due) {
        await api(
          '/personal-income/recurring/' + plan.id + '/receive',
          'POST',
          {},
          { 'Idempotency-Key': crypto.randomUUID() },
        );
      }
      setNotice(`Recorded ${due.length} due recurring income payment${due.length === 1 ? '' : 's'}.`);
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updatePlanStatus(id: string, status: 'active' | 'paused' | 'cancelled') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/personal-income/recurring/' + id, 'PATCH', { status });
      setNotice(`Recurring income marked as ${status}.`);
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const localToday = today(timezone);
  const activePlans = plans.filter((p) => p.status === 'active');
  const duePlans = activePlans.filter((p) => p.next_pay_date && p.next_pay_date <= localToday);
  const monthlyRecurringMinor = Math.round(
    activePlans
      .filter((p) => p.currency === currency)
      .reduce((acc, p) => acc + Number(p.amount_minor || 0) * monthlyFactor(p.recurrence), 0),
  );
  const annualRecurringMinor = monthlyRecurringMinor * 12;
  const recordedTotalMinor = records
    .filter((r) => r.currency === currency)
    .reduce((acc, r) => acc + Number(r.amount_minor || 0), 0);

  const visiblePlans = plans.filter((p) => (filter === 'all' ? true : p.status === filter));
  const filteredRecords = records.filter((r) =>
    !query.trim()
      ? true
      : String(r.description || '')
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
  );

  return (
    <div className="apps-workspace">
      <div className="account-metrics">
        <section>
          <span>Recorded income</span>
          <strong>{money(recordedTotalMinor, currency)}</strong>
          <small>{currency} · {records.filter((r) => r.currency === currency).length} entries</small>
        </section>
        <section>
          <span>Active recurring sources</span>
          <strong>{activePlans.length}</strong>
          <small>{duePlans.length > 0 ? `${duePlans.length} due now` : 'Scheduled paydays'}</small>
        </section>
        <section>
          <span>Monthly recurring income</span>
          <strong>{money(monthlyRecurringMinor, currency)}</strong>
          <small>Feeds directly into Forecasts</small>
        </section>
        <section>
          <span>Projected annual income</span>
          <strong>{money(annualRecurringMinor, currency)}</strong>
          <small>12-month recurring estimate</small>
        </section>
      </div>

      {duePlans.length > 0 && writable && (
        <section className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <strong>{duePlans.length} recurring income payment{duePlans.length === 1 ? ' is' : 's are'} due now</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13 }}>
              Mark due paydays as received to record them into your Income ledger and advance the next pay date.
            </p>
          </div>
          <div className="form-actions">
            <button type="button" className="button" disabled={busy} onClick={() => void receiveAllDue()}>
              {busy ? 'Recording…' : `Record all due income (${duePlans.length})`}
            </button>
            {onOpenForecasts && (
              <button type="button" className="secondary-button" onClick={onOpenForecasts}>
                View Forecasts
              </button>
            )}
          </div>
        </section>
      )}

      {error && (
        <div className="alert error" role="alert">
          <p>{error}</p>
          <button type="button" className="secondary-button" onClick={() => setRevision((v) => v + 1)}>
            Retry
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}

      {writable && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>Add a recurring income source</h3>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                Active recurring income sources automatically project into your Cash Flow Forecasts.
              </p>
            </div>
            {onOpenForecasts && (
              <button type="button" className="secondary-button" onClick={onOpenForecasts}>
                Open Forecasts
              </button>
            )}
          </div>
          <div className="account-type-tabs" aria-label="Quick recurring income presets">
            {INCOME_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="secondary-button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    description: preset.name,
                    source: preset.source,
                    amount: preset.amount,
                    recurrence: preset.recurrence,
                    category: preset.category,
                  }))
                }
              >
                + {preset.name}
              </button>
            ))}
          </div>
          <form className="account-inline-form" onSubmit={addRecurring}>
            <Field label="Income name">
              <input
                required
                maxLength={300}
                placeholder="e.g. Monthly Salary, Retainer, Rent"
                value={draft.description}
                onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
              />
            </Field>
            <Field label="Source / Payer">
              <input
                maxLength={200}
                placeholder="e.g. Employer or Client name"
                value={draft.source}
                onChange={(e) => setDraft((p) => ({ ...p, source: e.target.value }))}
              />
            </Field>
            <Field label="Expected amount">
              <input
                required
                inputMode="decimal"
                placeholder="120000.00"
                value={draft.amount}
                onChange={(e) => setDraft((p) => ({ ...p, amount: e.target.value }))}
              />
            </Field>
            <Field label="Currency">
              <Currency
                value={draft.currency}
                onChange={(e: any) => setDraft((p) => ({ ...p, currency: e.target.value }))}
              />
            </Field>
            <Field label="Frequency">
              <select
                value={draft.recurrence}
                onChange={(e) => setDraft((p) => ({ ...p, recurrence: e.target.value }))}
              >
                <option value="monthly">Monthly</option>
                <option value="biweekly">Biweekly (every 2 weeks)</option>
                <option value="weekly">Weekly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="once">One-time scheduled</option>
              </select>
            </Field>
            <Field label="Next pay date">
              <input
                type="date"
                required
                value={draft.next_pay_date}
                onChange={(e) => setDraft((p) => ({ ...p, next_pay_date: e.target.value }))}
              />
            </Field>
            <Field label="Category">
              <select
                value={draft.category}
                onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
              >
                {INCOME_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <button className="button" disabled={busy}>
              {busy ? 'Saving…' : 'Save recurring income'}
            </button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <h3>Recurring income plans ({visiblePlans.length})</h3>
          <div className="account-type-tabs" style={{ margin: 0 }}>
            {(['active', 'paused', 'cancelled', 'all'] as const).map((status) => (
              <button
                key={status}
                type="button"
                className={filter === status ? 'button' : 'secondary-button'}
                onClick={() => setFilter(status)}
              >
                {status[0].toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {loading && <p role="status">Loading recurring income…</p>}
        {!loading && !visiblePlans.length && (
          <p className="empty">
            No {filter === 'all' ? '' : filter + ' '}recurring income plans yet. Pick a preset above
            to add your salary, retainer, or other regular income.
          </p>
        )}
        {visiblePlans.map((plan) => {
          const isDue = plan.status === 'active' && plan.next_pay_date && plan.next_pay_date <= localToday;
          return (
            <article className="account-record" key={plan.id}>
              <div>
                <strong>{plan.description}</strong>
                {isDue && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    Due now
                  </span>
                )}
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                  {money(Number(plan.amount_minor || 0), plan.currency)} · {plan.recurrence} · Next
                  payday {plan.next_pay_date}
                  {plan.source ? ` · ${plan.source}` : ''} · {plan.category}
                </p>
              </div>
              <div className="form-actions">
                <span className="badge">{plan.status}</span>
                {writable && plan.status === 'active' && (
                  <>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => void receiveRecurring(plan)}
                    >
                      {isDue ? 'Mark received → Income' : 'Log payment today'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void updatePlanStatus(plan.id, 'paused')}
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={busy}
                      onClick={() => void updatePlanStatus(plan.id, 'cancelled')}
                    >
                      Cancel
                    </button>
                  </>
                )}
                {writable && plan.status !== 'active' && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void updatePlanStatus(plan.id, 'active')}
                  >
                    Resume
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {writable && (
        <section className="panel">
          <h3>Record one-off income</h3>
          <p>Manually recorded. This does not confirm a provider payment.</p>
          <form className="account-inline-form" onSubmit={addOneOff}>
            <Field label="Description">
              <input
                required
                maxLength={300}
                placeholder="e.g. Consulting project, Bonus, Gift"
                value={oneOff.description}
                onChange={(e) => setOneOff((p) => ({ ...p, description: e.target.value }))}
              />
            </Field>
            <Field label="Amount">
              <input
                required
                inputMode="decimal"
                placeholder="25000.00"
                value={oneOff.amount}
                onChange={(e) => setOneOff((p) => ({ ...p, amount: e.target.value }))}
              />
            </Field>
            <Field label="Currency">
              <Currency
                value={oneOff.currency}
                onChange={(e: any) => setOneOff((p) => ({ ...p, currency: e.target.value }))}
              />
            </Field>
            <Field label="Date received">
              <input
                type="date"
                required
                max={localToday}
                value={oneOff.occurred_on}
                onChange={(e) => setOneOff((p) => ({ ...p, occurred_on: e.target.value }))}
              />
            </Field>
            <button className="button" disabled={busy}>
              Record income
            </button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <h3>Recorded income ({filteredRecords.length})</h3>
          <div className="form-actions">
            <input
              type="search"
              placeholder="Search income…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {filteredRecords.length > 0 && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const csv = [
                    'Date,Description,Currency,Amount Minor',
                    ...filteredRecords.map((r) =>
                      [r.occurred_on, JSON.stringify(r.description || ''), r.currency, r.amount_minor].join(','),
                    ),
                  ].join('\n');
                  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'africore-personal-income.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export CSV
              </button>
            )}
          </div>
        </div>
        {filteredRecords.length ? (
          <DataTable>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Currency</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((r) => (
                <tr key={r.id}>
                  <td>{r.occurred_on}</td>
                  <td>{r.description}</td>
                  <td>{r.currency}</td>
                  <td>{money(Number(r.amount_minor || 0), r.currency)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <p className="empty">No recorded income yet. Record a payday or one-off income above.</p>
        )}
      </section>
    </div>
  );
}
