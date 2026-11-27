import { useEffect, useState } from 'react';
import { money, type API } from '../operations/UI';
import { posPaymentState, posReference, posHandoverLabel } from './pos-app-model';

export function POSAppOrders({
  api,
  registers,
  team,
  online,
  busy,
  onOpen,
}: {
  api: API;
  registers: any[];
  team: any[];
  online: boolean;
  busy: boolean;
  onOpen: (sale: any) => void;
}) {
  const [registerId, setRegisterId] = useState(registers[0]?.id || ''),
    [rows, setRows] = useState<any>(null),
    [offset, setOffset] = useState(0),
    [state, setState] = useState('all'),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!registerId && registers[0]) setRegisterId(registers[0].id);
  }, [registers, registerId]);
  useEffect(() => {
    let current = true;
    if (!registerId || !online) return;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ offset: String(offset), q: search });
    if (state !== 'all') params.set('state', state === 'draft' ? 'draft' : 'confirmed');
    if (from) params.set('from', new Date(from + 'T00:00:00').toISOString());
    if (to) params.set('to', new Date(to + 'T23:59:59.999').toISOString());
    api('/pos/registers/' + registerId + '/sales?' + params)
      .then((value) => {
        if (current) setRows(value);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [api, registerId, offset, search, state, from, to, online, revision]);
  const register = registers.find((row: any) => row.id === registerId),
    currency = register?.data?.currency || 'KES',
    names = new Map(
      team.map((member: any) => [
        member.user_id || member.id,
        member.name || member.display_name || member.email || 'Teammate',
      ]),
    );
  return (
    <div className="pos-app-orders o-app-sheet">
      <header className="pos-app-page-head">
        <div>
          <span className="eyebrow">Orders</span>
          <h2>Point of Sale orders</h2>
          <p>Review confirmed receipts and recover saved drafts from the selected register.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setRevision((v) => v + 1)}
          disabled={loading || busy}
        >
          Refresh
        </button>
      </header>
      <div className="pos-app-filters">
        <label>
          <span>Register</span>
          <select
            value={registerId}
            onChange={(e) => {
              setRegisterId(e.target.value);
              setOffset(0);
            }}
          >
            {registers.map((row: any) => (
              <option key={row.id} value={row.id}>
                {row.data.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </label>
        <label>
          <span>From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label className="pos-app-filter-search">
          <span>Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSearch(query);
                setOffset(0);
              }
            }}
            placeholder="Reference or customer"
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setSearch(query);
            setOffset(0);
          }}
        >
          Apply
        </button>
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {loading && !rows && <p role="status">Loading scoped orders…</p>}
      {rows && (
        <>
          <div className="pos-app-table-wrap">
            <table className="pos-app-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Register</th>
                  <th>Session</th>
                  <th>Cashier</th>
                  <th>Customer</th>
                  <th className="numeric">Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Handover</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.data.map((row: any) => {
                  const payment = posPaymentState(row);
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{posReference(row)}</strong>
                        {row.invoice_id && <small className="pos-app-linked">Invoice linked</small>}
                      </td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <td>{register?.data?.name || '—'}</td>
                      <td>
                        <span className="pos-session-ref">
                          {String(row.session_id || '').slice(0, 8)}
                        </span>
                      </td>
                      <td>{names.get(row.cashier_id) || '—'}</td>
                      <td>{row.customer_name || 'Walk-in'}</td>
                      <td className="numeric">
                        {money(row.total_minor || 0, row.currency || currency)}
                      </td>
                      <td>
                        <span className={'pos-pay-state ' + payment.id}>{payment.label}</span>
                      </td>
                      <td>
                        <span
                          className={
                            'pos-state ' + (row.status === 'confirmed' ? 'positive' : 'attention')
                          }
                        >
                          {row.status}
                        </span>
                      </td>
                      <td>{posHandoverLabel(row.handover)}</td>
                      <td>
                        <button
                          type="button"
                          className="quiet-button"
                          disabled={busy}
                          onClick={() => onOpen(row)}
                        >
                          {row.status === 'draft' ? 'Resume' : 'Receipt'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.data.length && (
              <div className="pos-app-empty small">
                <p>No orders match this register and filter.</p>
              </div>
            )}
          </div>
          <nav className="pagination">
            <button
              type="button"
              className="secondary-button"
              disabled={!offset}
              onClick={() => setOffset((v) => Math.max(0, v - 25))}
            >
              Previous
            </button>
            <span>Up to 25 orders · newest first</span>
            <button
              type="button"
              className="secondary-button"
              disabled={!rows.has_more}
              onClick={() => setOffset((v) => v + 25)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
