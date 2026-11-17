import { useEffect, useRef, useState } from 'react';
import { Field, money, type API } from '../operations/UI';
import { isDemo } from '../demo/transport';
import { parseMoney } from '../../../src/finance/money';
import { Overlay } from '../components/Overlay';
import { DataTable } from '../components/DataTable';
import './finance.css';
const currencies = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'];
export function PaymentCentre({
  api,
  scope,
  writable,
  reconcile = false,
  admin = false,
}: {
  api: API;
  scope: string;
  writable: boolean;
  reconcile?: boolean;
  admin?: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [status, setStatus] = useState('all'),
    [currency, setCurrency] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0),
    [selected, setSelected] = useState<any>(null),
    [notice, setNotice] = useState('');
  const key = useRef(new Map<string, string>());
  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    if (isDemo()) return;
    setBusy(true);
    const params = new URLSearchParams({ limit: '20', offset: String(page * 20) });
    if (status !== 'all') params.set('status', status);
    if (currency) params.set('currency', currency);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (query.trim()) params.set('q', query.trim());
    Promise.allSettled([
      api('/payment-events?' + params),
      reconcile ? Promise.resolve(null) : api('/payment-providers'),
      reconcile ? Promise.resolve({ data: [] }) : api('/payment-attempts'),
      reconcile ? Promise.resolve({ data: [] }) : api('/payment-requests?limit=50'),
    ])
      .then((results) => {
        if (!live) return;
        const events = results[0];
        if (events.status === 'rejected') {
          setData(null);
          setError('Payment events: ' + events.reason.message);
        } else {
          const getValue = (index: number) =>
            results[index].status === 'fulfilled' ? results[index].value : null;
          setTotal(Number(events.value.total || 0));
          setData({
            events: events.value.data || [],
            providers: getValue(1),
            attempts: getValue(2)?.data || [],
            requests: getValue(3)?.data || [],
          });
          const failures = results
            .slice(1)
            .flatMap((result, index) =>
              result.status === 'rejected'
                ? [['Provider setup', 'Attempts', 'Requests'][index] + ': ' + result.reason.message]
                : [],
            );
          if (failures.length) setError(failures.join(' · '));
        }
        setBusy(false);
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setBusy(false);
        }
      });
    return () => {
      live = false;
    };
  }, [scope, version, status, currency, from, to, query, reconcile, page]);
  async function run(path: string, body: any) {
    setBusy(true);
    setError('');
    try {
      const identity = path + JSON.stringify(body);
      if (!key.current.has(identity)) key.current.set(identity, crypto.randomUUID());
      const result = await api(path, 'POST', body, {
        'Idempotency-Key': key.current.get(identity)!,
      });
      setNotice(result.message || 'Saved. Test operations move no real funds.');
      setVersion((v) => v + 1);
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (isDemo())
    return (
      <p>
        Connected provider records and financial adjustments are available in a signed-in workspace.
        The existing browser checkout remains a labelled local simulation.
      </p>
    );
  return (
    <section className="finance-details panel">
      <h2>{reconcile ? 'Review payment evidence' : 'Payment activity & provider readiness'}</h2>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="alert">
          {notice}
        </p>
      )}
      <div className="finance-toolbar">
        <Field label="Payment outcome">
          <select
            value={status}
            onChange={(e) => {
              setPage(0);
              setStatus(e.target.value);
            }}
          >
            {['all', 'pending', 'succeeded', 'failed', 'refunded', 'reversed'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Currency">
          <select
            value={currency}
            onChange={(e) => {
              setPage(0);
              setCurrency(e.target.value);
            }}
          >
            <option value="">All currencies</option>
            {currencies.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label="From date">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              setPage(0);
              setFrom(e.target.value);
            }}
          />
        </Field>
        <Field label="To date">
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              setPage(0);
              setTo(e.target.value);
            }}
          />
        </Field>
        <Field label="Search">
          <input
            value={query}
            onChange={(e) => {
              setPage(0);
              setQuery(e.target.value);
            }}
            placeholder="Reference, provider or amount"
          />
        </Field>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => setVersion((v) => v + 1)}
        >
          Refresh activity
        </button>
      </div>
      {!data && !error && <p role="status">Loading payment records…</p>}
      {data?.providers && (
        <details>
          <summary>Providers & supported operations</summary>
          {data.providers.providers.map((p: any) => (
            <article key={p.id}>
              <h3>{p.name}</h3>
              <p>
                {p.status.replaceAll('_', ' ')} · {p.mode} · {p.currencies.join(', ')}
              </p>
              <p>{p.operations.join(' · ')}</p>
              {p.limitation && <p>{p.limitation}</p>}
            </article>
          ))}
          <p>
            Live collection is disabled. Daraja requires separately configured server credentials
            and a successful authorized provider test. No callback body alone confirms payment.
          </p>
          {data.providers.connections.map((c: any) => (
            <p key={c.id}>
              {c.label} · {c.status} · {c.account_id}
            </p>
          ))}
        </details>
      )}
      {admin && !reconcile && (
        <details>
          <summary>Configure a Daraja sandbox connection</summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                d = new FormData(form);
              setBusy(true);
              setError('');
              try {
                await api('/payment-providers/daraja', 'POST', {
                  label: d.get('label'),
                  configuration: {
                    consumer_key: d.get('consumer_key'),
                    consumer_secret: d.get('consumer_secret'),
                    shortcode: d.get('shortcode'),
                    passkey: d.get('passkey'),
                    transaction_type: 'CustomerPayBillOnline',
                  },
                });
                form.reset();
                setNotice(
                  'Test connection saved as unverified. External calls require explicit server enablement and provider qualification.',
                );
                setVersion((v) => v + 1);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              Use an authorized Daraja sandbox app only. Credentials stay in encrypted server
              custody; no live payment method is enabled.
            </p>
            {['label', 'consumer_key', 'consumer_secret', 'shortcode', 'passkey'].map((name) => (
              <Field key={name} label={name.replaceAll('_', ' ')}>
                <input
                  name={name}
                  type={
                    ['consumer_key', 'consumer_secret', 'passkey'].includes(name)
                      ? 'password'
                      : 'text'
                  }
                  autoComplete="off"
                  required
                  maxLength={name === 'label' ? 100 : 500}
                />
              </Field>
            ))}
            <button className="secondary-button" disabled={busy}>
              Save unverified test connection
            </button>
          </form>
        </details>
      )}
      {data?.requests?.length > 0 && (
        <details>
          <summary>Payment requests & test initiation</summary>
          {data.requests.map((r: any) => (
            <article key={r.id}>
              <p>
                {money(Number(r.amount_minor), r.currency)} · {r.status} · Expires{' '}
                {new Date(r.expires_at).toLocaleString()}
              </p>
              {writable && ['pending', 'failed'].includes(r.status) && (
                <button
                  className="quiet-button"
                  disabled={busy}
                  onClick={() => setSelected({ event: r, cancel: true })}
                >
                  Cancel request
                </button>
              )}
              {writable &&
                data.providers?.providers.some((p: any) => p.id === 'daraja' && p.enabled) &&
                ['pending', 'failed'].includes(r.status) && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      await run('/payment-requests/' + r.id + '/daraja', {
                        connection_id: d.get('connection_id'),
                        phone: d.get('phone'),
                      });
                    }}
                  >
                    <Field label="Daraja test connection">
                      <select name="connection_id" required>
                        {data.providers.connections.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.label} · {c.status}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Authorized test mobile number">
                      <input name="phone" type="tel" required />
                    </Field>
                    <button className="secondary-button" disabled={busy}>
                      Request sandbox phone prompt
                    </button>
                  </form>
                )}
            </article>
          ))}
        </details>
      )}
      {data && (
        <div className="finance-rows">
          <DataTable className="finance-wide-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Payment reference</th>
                <th>Provider</th>
                <th>Currency</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((event: any) => (
                <tr key={event.id}>
                  <td>{new Date(event.created_at).toLocaleString()}</td>
                  <td>
                    <code>{event.provider_reference || event.provider_ref || '—'}</code>
                    {['reversed', 'refunded'].includes(event.status) && (
                      <small className="finance-payment-return-note">
                        {event.related_event_id
                          ? 'Linked return'
                          : 'Unlinked return evidence · review required'}
                      </small>
                    )}
                  </td>
                  <td>{event.provider || 'retained provider record'}</td>
                  <td>{event.currency}</td>
                  <td>{money(Number(event.amount_minor), event.currency)}</td>
                  <td>
                    <span className="badge">{event.status}</span>
                  </td>
                  <td>
                    {writable &&
                    event.status === 'succeeded' &&
                    (reconcile || !event.provider || event.provider === 'sandbox') ? (
                      reconcile ? (
                        <button
                          className="secondary-button"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              setSelected(await api('/reconciliation/' + event.id + '/candidates'));
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Review allocation
                        </button>
                      ) : (
                        <button
                          className="secondary-button"
                          onClick={() => setSelected({ event, return: true })}
                        >
                          Test return
                        </button>
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <div className="finance-pager">
            <span>
              {total
                ? `${page * 20 + 1}–${Math.min((page + 1) * 20, total)} of ${total}`
                : '0 records'}
            </span>
            <button
              className="secondary-button"
              disabled={page === 0 || busy}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              Previous
            </button>
            <button
              className="secondary-button"
              disabled={(page + 1) * 20 >= total || busy}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
          {!data.events.length && (
            <p>
              No payment events match this outcome. Initiate a test checkout from an issued invoice
              to create genuine test records.
            </p>
          )}
        </div>
      )}
      {data?.attempts?.length > 0 && (
        <details>
          <summary>Provider initiation attempts</summary>
          {data.attempts.map((a: any) => (
            <p key={a.id}>
              {a.provider} · {a.status} · {new Date(a.created_at).toLocaleString()}
              {writable && a.remote_reference && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => run('/payment-attempts/' + a.id + '/refresh', {})}
                >
                  Query authenticated status
                </button>
              )}
            </p>
          ))}
        </details>
      )}
      {selected?.cancel && (
        <Overlay onClose={() => setSelected(null)}>
          <section
            className="service-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Cancel payment request"
          >
            <h2>Cancel this payment request?</h2>
            <p>
              The link will stop accepting new payments. Late provider confirmations remain
              preserved for review.
            </p>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={async () => {
                const r = await run('/payment-requests/' + selected.event.id + '/cancel', {
                  confirm: true,
                });
                if (r) setSelected(null);
              }}
            >
              Confirm cancellation
            </button>
            <button className="quiet-button" onClick={() => setSelected(null)}>
              Keep request
            </button>
          </section>
        </Overlay>
      )}
      {selected && !selected.cancel && (
        <Overlay onClose={() => setSelected(null)}>
          <section
            className="service-detail finance-details"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-action-title"
          >
            <h2 id="payment-action-title">
              {selected.return ? 'Simulate a payment return' : 'Allocate confirmed evidence'}
            </h2>
            {error && (
              <p role="alert" className="alert error">
                {error}
              </p>
            )}
            <p>
              {money(Number(selected.event.amount_minor), selected.event.currency)} ·{' '}
              {selected.event.status}
            </p>
            {selected.return ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  try {
                    const r = await run('/payment-events/' + selected.event.id + '/test-return', {
                      type: d.get('type'),
                      amount_minor: parseMoney(String(d.get('amount')), selected.event.currency),
                      reason: d.get('reason'),
                    });
                    if (r) setSelected(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <p>
                  This appends a sandbox return and adjusts invoice balances. It cannot move real
                  funds. Original payment evidence is retained.
                </p>
                <Field label="Return type">
                  <select name="type">
                    <option value="refunded">Partial or full refund</option>
                    <option value="reversed">Full reversal</option>
                  </select>
                </Field>
                <Field label={'Amount · ' + selected.event.currency}>
                  <input name="amount" required inputMode="decimal" />
                </Field>
                <Field label="Reason">
                  <textarea name="reason" required minLength={5} maxLength={1000} />
                </Field>
                <button className="button" disabled={busy}>
                  Confirm test return
                </button>
              </form>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  try {
                    const allocations = selected.candidates
                      .map((c: any) => ({
                        document_id: c.id,
                        amount_minor: parseMoney(String(d.get(c.id) || '0'), c.currency),
                      }))
                      .filter((v: any) => v.amount_minor > 0);
                    const r = await run('/payment-events/' + selected.event.id + '/allocate', {
                      allocations,
                      reason: d.get('reason'),
                    });
                    if (r) setSelected(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <p>{selected.policy}</p>
                {selected.candidates.map((c: any) => (
                  <Field
                    key={c.id}
                    label={c.reference + ' · Open ' + money(c.outstanding_minor, c.currency)}
                  >
                    <input name={c.id} inputMode="decimal" placeholder="Leave blank to skip" />
                  </Field>
                ))}
                <Field label="Evidence and allocation reason">
                  <textarea name="reason" minLength={5} maxLength={1000} required />
                </Field>
                <button className="button" disabled={busy || !selected.candidates.length}>
                  Confirm reviewed allocation
                </button>
              </form>
            )}
            <button className="secondary-button" onClick={() => setSelected(null)}>
              Cancel
            </button>
          </section>
        </Overlay>
      )}
    </section>
  );
}
