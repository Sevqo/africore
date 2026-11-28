import { useEffect, useState, type FormEvent } from 'react';
import { DataTable } from '../components/DataTable';
import { Field, money, type API } from '../operations/UI';
import { Currency, today } from './AccountUI';
import { nextOccurrence, parseMoney } from '../../../src/finance/money';

const EXPENSE_CATEGORIES = [
  'subscriptions',
  'groceries',
  'transport',
  'rent',
  'utilities',
  'software',
  'health',
  'education',
  'entertainment',
  'other',
] as const;

function monthlyFactor(recurrence: string) {
  if (recurrence === 'weekly') return 52 / 12;
  if (recurrence === 'biweekly') return 26 / 12;
  if (recurrence === 'quarterly') return 1 / 3;
  if (recurrence === 'yearly') return 1 / 12;
  if (recurrence === 'once') return 0;
  return 1;
}

export function PersonalExpenses({
  api,
  scope,
  currency = 'KES',
  timezone = 'Africa/Nairobi',
  writable = true,
  onChanged,
  onOpenSubscriptions,
}: {
  api: API;
  scope: string;
  currency?: string;
  timezone?: string;
  writable?: boolean;
  onChanged?: () => void;
  onOpenSubscriptions?: () => void;
}) {
  const [expenses, setExpenses] = useState<any[]>([]),
    [subscriptions, setSubscriptions] = useState<any[]>([]),
    [budgets, setBudgets] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [query, setQuery] = useState(''),
    [categoryFilter, setCategoryFilter] = useState(''),
    [draft, setDraft] = useState({
      description: '',
      amount: '',
      currency,
      occurred_on: today(timezone),
      category: 'groceries',
      supplier: '',
      notes: '',
    }),
    [budgetDraft, setBudgetDraft] = useState({
      category: 'groceries',
      monthly_limit: '',
      currency,
    });

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    Promise.allSettled([
      api('/expenses?limit=100'),
      api('/obligations?limit=100'),
      api('/personal-budgets'),
    ])
      .then(([exp, obs, bud]) => {
        if (!live) return;
        if (exp.status === 'fulfilled') setExpenses(exp.value?.data || []);
        else setError('Expenses: ' + exp.reason.message);
        if (obs.status === 'fulfilled') setSubscriptions(obs.value?.data || []);
        if (bud.status === 'fulfilled') setBudgets(bud.value?.data || []);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [scope, revision]);

  async function addExpense(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(
        '/expenses',
        'POST',
        {
          description: draft.description.trim(),
          amount_minor: parseMoney(draft.amount, draft.currency),
          currency: draft.currency,
          occurred_on: draft.occurred_on,
          category: draft.category,
          supplier: draft.supplier.trim(),
          notes: draft.notes.trim(),
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setDraft({
        description: '',
        amount: '',
        currency,
        occurred_on: today(timezone),
        category: 'groceries',
        supplier: '',
        notes: '',
      });
      setNotice('Expense recorded.');
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveBudget(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/personal-budgets', 'PUT', {
        category: budgetDraft.category,
        monthly_limit_minor: parseMoney(budgetDraft.monthly_limit, budgetDraft.currency),
        currency: budgetDraft.currency,
      });
      setBudgetDraft((p) => ({ ...p, monthly_limit: '' }));
      setNotice(`Monthly budget saved for ${budgetDraft.category}.`);
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function paySubscription(item: any) {
    setBusy(true);
    setError('');
    setNotice('');
    const localToday = today(timezone);
    try {
      if (item.next_due_date && item.next_due_date <= localToday) {
        await api(
          '/obligations/' + item.id + '/fulfill',
          'POST',
          { action: 'fulfill', record_expense: true },
          { 'Idempotency-Key': crypto.randomUUID() },
        );
      } else {
        await api(
          '/expenses',
          'POST',
          {
            description: item.description,
            amount_minor: Number(item.amount_minor),
            currency: item.currency,
            occurred_on: localToday,
            category: item.category || 'subscriptions',
            supplier: item.supplier || '',
            obligation_id: item.id,
          },
          { 'Idempotency-Key': crypto.randomUUID() },
        );
        const next = nextOccurrence(
          item.next_due_date || localToday,
          item.recurrence,
          item.anchor_day || Number((item.next_due_date || localToday).slice(8)),
        );
        await api(
          '/obligations/' + item.id,
          'PATCH',
          next ? { next_due_date: next } : { status: 'completed' },
        );
      }
      setNotice(`Recorded subscription "${item.description}" in Expenses.`);
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const localToday = today(timezone);
  const currentMonth = localToday.slice(0, 7);
  const inCurrency = expenses.filter((e) => e.currency === currency);
  const totalExpensesMinor = inCurrency.reduce((acc, e) => acc + Number(e.amount_minor || 0), 0);
  const monthExpenses = inCurrency.filter((e) => String(e.occurred_on || '').startsWith(currentMonth));
  const monthTotalMinor = monthExpenses.reduce((acc, e) => acc + Number(e.amount_minor || 0), 0);

  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const dueSubs = activeSubs.filter((s) => s.next_due_date && s.next_due_date <= localToday);
  const monthlySubsMinor = Math.round(
    activeSubs
      .filter((s) => s.currency === currency)
      .reduce((acc, s) => acc + Number(s.amount_minor || 0) * monthlyFactor(s.recurrence), 0),
  );

  const budgetMap = new Map(
    budgets
      .filter((b) => b.currency === currency)
      .map((b) => [String(b.category), Number(b.monthly_limit_minor || 0)]),
  );
  const otherCurrencyBudgets = budgets.filter((b) => b.currency !== currency);
  const monthByCat = new Map<string, number>();
  for (const exp of monthExpenses) {
    const cat = String(exp.category || 'other');
    monthByCat.set(cat, (monthByCat.get(cat) || 0) + Number(exp.amount_minor || 0));
  }
  for (const cat of budgetMap.keys()) {
    if (!monthByCat.has(cat)) monthByCat.set(cat, 0);
  }
  const categoryBreakdown = [...monthByCat.entries()]
    .map(([category, spent]) => {
      const limit = budgetMap.get(category) ?? null;
      const pct = limit && limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : null;
      return { category, spent, limit, pct, over: limit !== null && spent > limit };
    })
    .sort((a, b) => b.spent - a.spent);
  const overBudgetCount = categoryBreakdown.filter((c) => c.over).length;

  const filtered = expenses.filter((e) => {
    if (categoryFilter && e.category !== categoryFilter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        String(e.description || '').toLowerCase().includes(q) ||
        String(e.supplier || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="apps-workspace">
      <div className="account-metrics">
        <section>
          <span>This month&apos;s spending</span>
          <strong>{money(monthTotalMinor, currency)}</strong>
          <small>{currentMonth} · {monthExpenses.length} expenses</small>
        </section>
        <section>
          <span>Total recorded expenses</span>
          <strong>{money(totalExpensesMinor, currency)}</strong>
          <small>{currency} · {inCurrency.length} entries</small>
        </section>
        <section>
          <span>Subscriptions run rate</span>
          <strong>{money(monthlySubsMinor, currency)}</strong>
          <small>{activeSubs.length} active · {dueSubs.length} due now</small>
        </section>
        <section>
          <span>Monthly budgets</span>
          <strong>{overBudgetCount > 0 ? `${overBudgetCount} over` : `${budgetMap.size} set`}</strong>
          <small>{overBudgetCount > 0 ? 'Review category limits' : 'Spending within targets'}</small>
        </section>
      </div>

      {error && (
        <div className="alert error" role="alert">
          <p>{error}</p>
          <button type="button" className="secondary-button" onClick={() => setRevision((v) => v + 1)}>
            Retry
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}

      {activeSubs.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>Subscriptions &amp; recurring bills ({activeSubs.length})</h3>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                Subscriptions are part of your Expenses. Mark any renewal as paid to record it immediately below.
              </p>
            </div>
            {onOpenSubscriptions && (
              <button type="button" className="secondary-button" onClick={onOpenSubscriptions}>
                Manage Subscriptions
              </button>
            )}
          </div>
          {activeSubs.slice(0, 6).map((sub) => {
            const isDue = sub.next_due_date && sub.next_due_date <= localToday;
            return (
              <article className="account-record" key={sub.id}>
                <div>
                  <strong>{sub.description}</strong>
                  {isDue && (
                    <span className="badge" style={{ marginLeft: 8 }}>
                      Due now
                    </span>
                  )}
                  <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                    {money(Number(sub.amount_minor || 0), sub.currency)} · {sub.recurrence} · Due{' '}
                    {sub.next_due_date} · {sub.category}
                  </p>
                </div>
                {writable && (
                  <button
                    type="button"
                    className={isDue ? 'button' : 'secondary-button'}
                    disabled={busy}
                    onClick={() => void paySubscription(sub)}
                  >
                    {isDue ? 'Mark paid → Expense' : 'Log payment today'}
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <h3>Monthly spending by category &amp; budgets ({currentMonth})</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13 }}>
              Track where your money goes each month and set optional spending limits per category.
            </p>
          </div>
        </div>
        {categoryBreakdown.length > 0 ? (
          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {categoryBreakdown.map((row) => (
              <div key={row.category} style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <strong style={{ textTransform: 'capitalize' }}>{row.category}</strong>
                  <span>
                    {money(row.spent, currency)}
                    {row.limit !== null ? ` / ${money(row.limit, currency)}` : ''}
                    {row.over ? ' · Over budget' : ''}
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: '#e5e7eb',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${
                        row.pct !== null
                          ? row.pct
                          : monthTotalMinor > 0
                            ? Math.max(4, Math.round((row.spent / monthTotalMinor) * 100))
                            : 0
                      }%`,
                      background: row.over ? '#b91c1c' : '#166534',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">No expenses recorded in {currentMonth} yet.</p>
        )}
        {otherCurrencyBudgets.length > 0 && (
          <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
            <small className="muted">Monthly budgets in other currencies</small>
            {otherCurrencyBudgets.map((b: any) => (
              <div
                key={`${b.category}:${b.currency}`}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}
              >
                <strong style={{ textTransform: 'capitalize' }}>{b.category}</strong>
                <span>{money(Number(b.monthly_limit_minor || 0), b.currency)} / mo</span>
              </div>
            ))}
          </div>
        )}
        {writable && (
          <form className="account-inline-form" onSubmit={saveBudget}>
            <Field label="Budget category">
              <select
                value={budgetDraft.category}
                onChange={(e) => setBudgetDraft((p) => ({ ...p, category: e.target.value }))}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Monthly limit">
              <input
                required
                inputMode="decimal"
                placeholder="15000.00"
                value={budgetDraft.monthly_limit}
                onChange={(e) => setBudgetDraft((p) => ({ ...p, monthly_limit: e.target.value }))}
              />
            </Field>
            <Field label="Currency">
              <Currency
                value={budgetDraft.currency}
                onChange={(e: any) => setBudgetDraft((p) => ({ ...p, currency: e.target.value }))}
              />
            </Field>
            <button className="secondary-button" disabled={busy}>
              Set monthly budget
            </button>
          </form>
        )}
      </section>

      {writable && (
        <section className="panel">
          <h3>Record an expense</h3>
          <p>Manually recorded. This does not confirm a provider payment.</p>
          <form className="account-inline-form" onSubmit={addExpense}>
            <Field label="Description">
              <input
                required
                maxLength={300}
                placeholder="e.g. Supermarket groceries, Fuel, Electricity"
                value={draft.description}
                onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
              />
            </Field>
            <Field label="Amount">
              <input
                required
                inputMode="decimal"
                placeholder="2500.00"
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
            <Field label="Date">
              <input
                type="date"
                required
                max={localToday}
                value={draft.occurred_on}
                onChange={(e) => setDraft((p) => ({ ...p, occurred_on: e.target.value }))}
              />
            </Field>
            <Field label="Category">
              <select
                value={draft.category}
                onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Merchant / Supplier (optional)">
              <input
                maxLength={200}
                placeholder="e.g. Carrefour, KPLC, Spotify"
                value={draft.supplier}
                onChange={(e) => setDraft((p) => ({ ...p, supplier: e.target.value }))}
              />
            </Field>
            <button className="button" disabled={busy}>
              Record expense
            </button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <h3>Recorded expenses ({filtered.length})</h3>
          <div className="form-actions">
            <input
              type="search"
              placeholder="Search expenses…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {filtered.length > 0 && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const csv = [
                    'Date,Description,Category,Supplier,Currency,Amount Minor',
                    ...filtered.map((e) =>
                      [
                        e.occurred_on,
                        JSON.stringify(e.description || ''),
                        e.category || 'other',
                        JSON.stringify(e.supplier || ''),
                        e.currency,
                        e.amount_minor,
                      ].join(','),
                    ),
                  ].join('\n');
                  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'africore-personal-expenses.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export CSV
              </button>
            )}
          </div>
        </div>
        {loading && <p role="status">Loading expenses…</p>}
        {!loading && filtered.length > 0 ? (
          <DataTable>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Merchant</th>
                <th>Currency</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>{e.occurred_on}</td>
                  <td>
                    {e.description}
                    {e.obligation_id && (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        Subscription
                      </span>
                    )}
                  </td>
                  <td>{e.category || 'other'}</td>
                  <td>{e.supplier || '—'}</td>
                  <td>{e.currency}</td>
                  <td>{money(Number(e.amount_minor || 0), e.currency)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          !loading && <p className="empty">No recorded expenses match your filters.</p>
        )}
      </section>
    </div>
  );
}
