import { useEffect, useState, type FormEvent } from 'react';
import { Field, money, type API } from '../operations/UI';
import { today } from './AccountUI';
import { nextOccurrence, parseMoney } from '../../../src/finance/money';

const PRESETS = [
  { name: 'Spotify Premium', supplier: 'Spotify', recurrence: 'monthly', amount: '499', category: 'subscriptions' },
  { name: 'Netflix Standard', supplier: 'Netflix', recurrence: 'monthly', amount: '1100', category: 'subscriptions' },
  { name: 'YouTube Premium', supplier: 'Google', recurrence: 'monthly', amount: '650', category: 'subscriptions' },
  { name: 'iCloud+ / Google One', supplier: 'Cloud Storage', recurrence: 'monthly', amount: '350', category: 'software' },
  { name: 'Home Fiber Internet', supplier: 'ISP', recurrence: 'monthly', amount: '4100', category: 'utilities' },
  { name: 'Gym Membership', supplier: 'Fitness Club', recurrence: 'monthly', amount: '5000', category: 'health' },
  { name: 'ChatGPT / AI Tools', supplier: 'SaaS', recurrence: 'monthly', amount: '2600', category: 'software' },
] as const;

function monthlyFactor(recurrence: string) {
  if (recurrence === 'weekly') return 52 / 12;
  if (recurrence === 'biweekly') return 26 / 12;
  if (recurrence === 'quarterly') return 1 / 3;
  if (recurrence === 'yearly') return 1 / 12;
  if (recurrence === 'once') return 0;
  return 1;
}

export function PersonalSubscriptions({
  api,
  scope,
  currency = 'KES',
  timezone = 'Africa/Nairobi',
  writable = true,
  onChanged,
  onOpenExpenses,
}: {
  api: API;
  scope: string;
  currency?: string;
  timezone?: string;
  writable?: boolean;
  onChanged?: () => void;
  onOpenExpenses?: () => void;
}) {
  const [items, setItems] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [filter, setFilter] = useState<'active' | 'all' | 'paused' | 'cancelled'>('active'),
    [draft, setDraft] = useState({
      description: '',
      supplier: '',
      amount: '',
      currency,
      recurrence: 'monthly',
      next_due_date: today(timezone),
      category: 'subscriptions',
      reminder_days: '3',
    });

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    api('/obligations?limit=100')
      .then((res) => {
        if (live) setItems(res?.data || []);
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

  async function addSubscription(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(
        '/obligations',
        'POST',
        {
          description: draft.description.trim(),
          supplier: draft.supplier.trim(),
          amount_minor: parseMoney(draft.amount, draft.currency),
          currency: draft.currency,
          recurrence: draft.recurrence,
          next_due_date: draft.next_due_date,
          category: draft.category,
          timezone,
          reminder_days: Number(draft.reminder_days || 3),
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setDraft({
        description: '',
        supplier: '',
        amount: '',
        currency,
        recurrence: 'monthly',
        next_due_date: today(timezone),
        category: 'subscriptions',
        reminder_days: '3',
      });
      setNotice('Subscription saved. Active subscriptions automatically feed into Expenses and Forecasts.');
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: 'active' | 'paused' | 'cancelled') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/obligations/' + id, 'PATCH', { status });
      setNotice(`Subscription marked as ${status}.`);
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function recordSingleRenewal(item: any) {
    const localToday = today(timezone);
    if (item.next_due_date && item.next_due_date <= localToday) {
      await api(
        '/obligations/' + item.id + '/fulfill',
        'POST',
        { action: 'fulfill', record_expense: true },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      return;
    }
    // Early payment: record expense today linked to this subscription and advance next_due_date
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
        notes: `Subscription renewal (${item.recurrence})`,
      },
      { 'Idempotency-Key': crypto.randomUUID() },
    );
    const next = nextOccurrence(
      item.next_due_date || localToday,
      item.recurrence,
      item.anchor_day || Number((item.next_due_date || localToday).slice(8)),
    );
    await api('/obligations/' + item.id, 'PATCH', next ? { next_due_date: next } : { status: 'completed' });
  }

  async function logRenewalPayment(item: any) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await recordSingleRenewal(item);
      setNotice(`Recorded "${item.description}" into Expenses and advanced the next renewal date.`);
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function recordAllDue() {
    const localToday = today(timezone);
    const due = activeItems.filter((i) => i.next_due_date && i.next_due_date <= localToday);
    if (!due.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (const item of due) {
        await recordSingleRenewal(item);
      }
      setNotice(`Recorded ${due.length} due subscription payment${due.length === 1 ? '' : 's'} into Expenses.`);
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const localToday = today(timezone);
  const activeItems = items.filter((i) => i.status === 'active');
  const dueNowItems = activeItems.filter((i) => i.next_due_date && i.next_due_date <= localToday);
  const inDisplayCurrency = activeItems.filter((i) => i.currency === currency);
  const monthlyRunRateMinor = Math.round(
    inDisplayCurrency.reduce((sum, i) => sum + Number(i.amount_minor || 0) * monthlyFactor(i.recurrence), 0),
  );
  const annualSpendMinor = monthlyRunRateMinor * 12;
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const dueSoonCount = activeItems.filter((i) => i.next_due_date && i.next_due_date <= in7Days).length;

  const visible = items.filter((i) => (filter === 'all' ? true : i.status === filter));

  return (
    <div className="apps-workspace">
      <div className="account-metrics">
        <section>
          <span>Active subscriptions</span>
          <strong>{activeItems.length}</strong>
          <small>Tracked recurring plans</small>
        </section>
        <section>
          <span>Monthly run rate</span>
          <strong>{money(monthlyRunRateMinor, currency)}</strong>
          <small>{currency} · included in Forecasts</small>
        </section>
        <section>
          <span>Projected annual spend</span>
          <strong>{money(annualSpendMinor, currency)}</strong>
          <small>12-month estimate</small>
        </section>
        <section>
          <span>Due within 7 days</span>
          <strong>{dueSoonCount}</strong>
          <small>{dueNowItems.length > 0 ? `${dueNowItems.length} due now` : 'Upcoming renewals'}</small>
        </section>
      </div>

      {dueNowItems.length > 0 && writable && (
        <section className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <strong>{dueNowItems.length} subscription{dueNowItems.length === 1 ? ' is' : 's are'} due now</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13 }}>
              Recording due renewals logs each charge directly into Expenses and advances its next renewal date.
            </p>
          </div>
          <div className="form-actions">
            <button type="button" className="button" disabled={busy} onClick={() => void recordAllDue()}>
              {busy ? 'Recording…' : `Record all due into Expenses (${dueNowItems.length})`}
            </button>
            {onOpenExpenses && (
              <button type="button" className="secondary-button" onClick={onOpenExpenses}>
                View Expenses
              </button>
            )}
          </div>
        </section>
      )}

      {error && (
        <div className="alert error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setRevision((v) => v + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}

      {writable && (
        <section className="panel">
          <h3>Track a personal subscription or recurring bill</h3>
          <p>
            Subscriptions are linked directly to Expenses and Forecasts. Recording a renewal logs an
            expense entry automatically and advances the next renewal date.
          </p>
          <div className="account-type-tabs" aria-label="Quick subscription presets">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="secondary-button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    description: preset.name,
                    supplier: preset.supplier,
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
          <form className="account-inline-form" onSubmit={addSubscription}>
            <Field label="Subscription name">
              <input
                required
                maxLength={300}
                placeholder="e.g. Spotify Premium, Netflix, iCloud+"
                value={draft.description}
                onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
              />
            </Field>
            <Field label="Provider / Merchant">
              <input
                maxLength={200}
                placeholder="e.g. Spotify, Netflix, Apple"
                value={draft.supplier}
                onChange={(e) => setDraft((p) => ({ ...p, supplier: e.target.value }))}
              />
            </Field>
            <Field label="Amount">
              <input
                required
                inputMode="decimal"
                placeholder="499.00"
                value={draft.amount}
                onChange={(e) => setDraft((p) => ({ ...p, amount: e.target.value }))}
              />
            </Field>
            <Field label="Currency">
              <select
                value={draft.currency}
                onChange={(e) => setDraft((p) => ({ ...p, currency: e.target.value }))}
              >
                {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Billing cycle">
              <select
                value={draft.recurrence}
                onChange={(e) => setDraft((p) => ({ ...p, recurrence: e.target.value }))}
              >
                <option value="monthly">Monthly</option>
                <option value="biweekly">Biweekly</option>
                <option value="weekly">Weekly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="once">One-time bill</option>
              </select>
            </Field>
            <Field label="Next renewal date">
              <input
                type="date"
                required
                value={draft.next_due_date}
                onChange={(e) => setDraft((p) => ({ ...p, next_due_date: e.target.value }))}
              />
            </Field>
            <Field label="Category">
              <select
                value={draft.category}
                onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
              >
                <option value="subscriptions">Subscriptions</option>
                <option value="entertainment">Entertainment</option>
                <option value="software">Software &amp; Cloud</option>
                <option value="utilities">Internet &amp; Utilities</option>
                <option value="health">Health &amp; Fitness</option>
                <option value="education">Education &amp; Learning</option>
                <option value="rent">Rent &amp; Housing</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Remind days before renewal">
              <input
                type="number"
                min={0}
                max={30}
                value={draft.reminder_days}
                onChange={(e) => setDraft((p) => ({ ...p, reminder_days: e.target.value }))}
              />
            </Field>
            <button className="button" disabled={busy}>
              {busy ? 'Saving…' : 'Save subscription'}
            </button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <h3>Your subscriptions ({visible.length})</h3>
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
        {loading && <p role="status">Loading subscriptions…</p>}
        {!loading && !visible.length && (
          <p className="empty">
            No {filter === 'all' ? '' : filter + ' '}subscriptions yet. Pick a preset above or add
            your own recurring plan.
          </p>
        )}
        {visible.map((item) => {
          const isDue = item.status === 'active' && item.next_due_date && item.next_due_date <= localToday;
          return (
            <article className="account-record" key={item.id}>
              <div>
                <strong>{item.description}</strong>
                {isDue && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    Due now
                  </span>
                )}
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                  {money(Number(item.amount_minor || 0), item.currency)} · {item.recurrence} · Next
                  due {item.next_due_date}
                  {item.supplier ? ` · ${item.supplier}` : ''} · {item.category}
                </p>
              </div>
              <div className="form-actions">
                <span className="badge">{item.status}</span>
                {writable && item.status === 'active' && (
                  <>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => void logRenewalPayment(item)}
                    >
                      {isDue ? 'Mark paid → Expense' : 'Log payment today'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void updateStatus(item.id, 'paused')}
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={busy}
                      onClick={() => void updateStatus(item.id, 'cancelled')}
                    >
                      Cancel
                    </button>
                  </>
                )}
                {writable && item.status !== 'active' && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void updateStatus(item.id, 'active')}
                  >
                    Resume
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
