import { useEffect, useState } from 'react';
import { Field, Form, money, today, type API } from '../operations/UI';
import { displayQuantity, quantityMilli } from '../../../src/inventory/quantity';

type Props = {
  api: API;
  view: 'margins' | 'down-payments' | 'optional-products';
  orders: any[];
  quotations: any[];
  products: any[];
  onNotify: (message: string) => void;
};

function useSalesData(api: API, path: string, rev: number): { data?: any; error?: string } {
  const [state, setState] = useState<{ path: string; data?: any; error?: string }>({ path: '' });
  useEffect(() => {
    if (!path) return;
    let live = true;
    api(path).then(
      (data) => {
        if (live) setState({ path, data });
      },
      (error) => {
        if (live) setState({ path, error: error.message });
      },
    );
    return () => {
      live = false;
    };
  }, [api, path, rev]);
  return state.path === path ? state : {};
}

function exportCsv(filename: string, columns: string[], rows: unknown[][]) {
  const cell = (v: unknown) => {
    const s = typeof v === 'string' && /^[\s]*[=+@-]/.test(v) ? "'" + v : String(v ?? '');
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const blob = new Blob([[columns, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MarginsView({ api }: Props) {
  const [rev, setRev] = useState(0);
  const { data, error } = useSalesData(api, '/sales/margin-report', rev);
  return (
    <section className="panel">
      <div className="sales-toolbar">
        <div>
          <h2>Sales Margin Analysis</h2>
          <p>Exact integer-minor-unit revenue, cost, gross margin, and margin % powered by Python.</p>
        </div>
        <div className="acc-toolbar">
          <button type="button" className="acc-secondary" onClick={() => setRev((n) => n + 1)}>
            Refresh
          </button>
          {data?.data?.length > 0 && (
            <button
              type="button"
              className="acc-secondary"
              onClick={() =>
                exportCsv(
                  'sales-margins.csv',
                  ['Order', 'Date', 'Status', 'Currency', 'Revenue minor', 'Cost minor', 'Margin minor', 'Margin %'],
                  data.data.map((r: any) => [
                    r.reference,
                    r.order_date,
                    r.status,
                    r.currency,
                    r.revenue_minor,
                    r.cost_minor,
                    r.margin_minor,
                    (r.margin_bps / 100).toFixed(2),
                  ]),
                )
              }
            >
              Export CSV
            </button>
          )}
        </div>
      </div>
      {error && <p className="alert error" role="alert">{error}</p>}
      {data && (
        <>
          <div className="commerce-metrics">
            {Object.entries(data.totals_by_currency || {}).map(([cur, t]: [string, any]) => (
              <article key={cur}>
                <span>Gross margin ({cur})</span>
                <strong>{money(t.margin_minor, cur)}</strong>
                <small>
                  Revenue {money(t.revenue_minor, cur)} · Cost {money(t.cost_minor, cur)} ·{' '}
                  {(t.margin_bps / 100).toFixed(2)}%
                </small>
              </article>
            ))}
          </div>
          <div className="acc-journal-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="acc-num">Revenue</th>
                  <th className="acc-num">Cost</th>
                  <th className="acc-num">Margin</th>
                  <th className="acc-num">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {(data.data || []).map((row: any) => (
                  <tr key={row.id}>
                    <td><strong>{row.reference}</strong></td>
                    <td>{row.order_date || '—'}</td>
                    <td>{row.status}</td>
                    <td className="acc-num">{money(row.revenue_minor, row.currency)}</td>
                    <td className="acc-num">{money(row.cost_minor, row.currency)}</td>
                    <td className={'acc-num' + (row.margin_minor < 0 ? ' acc-num-negative' : '')}>
                      {money(row.margin_minor, row.currency)}
                    </td>
                    <td className={'acc-num' + (row.margin_bps < 0 ? ' acc-num-negative' : '')}>
                      {(row.margin_bps / 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.data?.length && <p>No confirmed sales orders found for margin analysis.</p>}
        </>
      )}
    </section>
  );
}

function DownPaymentsView({ api, orders, onNotify }: Props) {
  const [rev, setRev] = useState(0);
  const { data, error } = useSalesData(api, '/sales/down-payments', rev);
  const eligible = orders.filter((o) => !['draft', 'cancelled'].includes(o.status));
  return (
    <section className="panel">
      <h2>Down Payments & Advance Invoices</h2>
      <p>Request percentage or fixed-amount advance payments against confirmed sales orders without over-invoicing.</p>
      {error && <p className="alert error" role="alert">{error}</p>}
      {eligible.length > 0 && (
        <Form
          submit={async (d) => {
            const mode = d.mode === 'fixed' ? 'fixed' : 'percentage';
            const ord = eligible.find((o) => o.id === d.order_id);
            const curr = ord?.currency || 'KES';
            const scale = ['UGX', 'RWF'].includes(curr) ? 1 : 100;
            await api('/sales/down-payments', 'POST', {
              order_id: d.order_id,
              mode,
              ...(mode === 'percentage'
                ? { percentage_bps: Math.round(Number(d.percentage || 30) * 100) }
                : { fixed_amount_minor: Math.round(Number(d.fixed_amount || 0) * scale) }),
              reference: d.reference,
              due_on: d.due_on,
              notes: d.notes || '',
            });
            setRev((n) => n + 1);
            onNotify('Down payment recorded.');
          }}
        >
          <Field label="Confirmed order">
            <select name="order_id" required>
              {eligible.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number || o.reference || o.id.slice(0, 8)} · {money(o.total_minor || 0, o.currency || 'KES')}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mode">
            <select name="mode" defaultValue="percentage">
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </Field>
          <Field label="Percentage (when % mode)">
            <input name="percentage" type="number" step="0.01" min="0.01" max="100" defaultValue="30" />
          </Field>
          <Field label="Fixed amount (when fixed mode)">
            <input name="fixed_amount" type="number" step="0.01" min="0.01" />
          </Field>
          <Field label="Reference">
            <input name="reference" required minLength={2} maxLength={120} placeholder="DP-2026-001" />
          </Field>
          <Field label="Due date">
            <input name="due_on" type="date" defaultValue={today()} required />
          </Field>
          <Field label="Notes">
            <input name="notes" maxLength={1000} />
          </Field>
          <button className="acc-primary">Create down payment</button>
        </Form>
      )}
      <div className="acc-journal-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Order</th>
              <th>Due Date</th>
              <th>Mode</th>
              <th className="acc-num">Down Payment</th>
              <th className="acc-num">Remaining Order</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.data || []).map((dp: any) => (
              <tr key={dp.id}>
                <td><strong>{dp.reference}</strong></td>
                <td>{dp.order_reference}</td>
                <td>{dp.due_on}</td>
                <td>{dp.mode === 'percentage' ? `${(dp.percentage_bps / 100).toFixed(2)}%` : 'Fixed'}</td>
                <td className="acc-num">{money(dp.amount_minor, dp.currency)}</td>
                <td className="acc-num">{money(dp.remaining_after_minor, dp.currency)}</td>
                <td>{dp.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && !data.data.length && <p>No down payments recorded yet.</p>}
    </section>
  );
}

function OptionalProductsView({ api, quotations, products, onNotify }: Props) {
  const [rev, setRev] = useState(0);
  const [actionError, setActionError] = useState('');
  const { data, error } = useSalesData(api, '/sales/optional-products', rev);
  const activeProducts = products.filter((p) => p.status === 'active');
  return (
    <section className="panel">
      <h2>Quotation Optional Products (Upsells)</h2>
      <p>Offer complementary add-on items on quotations and track customer acceptance.</p>
      {(error || actionError) && <p className="alert error" role="alert">{error || actionError}</p>}
      {quotations.length > 0 && activeProducts.length > 0 && (
        <Form
          submit={async (d) => {
            const q = quotations.find((item) => item.id === d.quotation_id);
            const curr = q?.currency || 'KES';
            const scale = ['UGX', 'RWF'].includes(curr) ? 1 : 100;
            await api('/sales/optional-products', 'POST', {
              quotation_id: d.quotation_id,
              product_id: d.product_id,
              quantity_milli: quantityMilli(String(d.quantity || '1')),
              unit_price_minor: Math.round(Number(d.unit_price || 0) * scale),
              description: d.description || '',
            });
            setRev((n) => n + 1);
            onNotify('Optional product added to quotation.');
          }}
        >
          <Field label="Quotation">
            <select name="quotation_id" required>
              {quotations.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.reference || q.id.slice(0, 8)} · {q.status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Optional product">
            <select name="product_id" required>
              {activeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <input name="quantity" defaultValue="1" required />
          </Field>
          <Field label="Unit price">
            <input name="unit_price" type="number" step="0.01" min="0" required />
          </Field>
          <Field label="Description">
            <input name="description" maxLength={500} placeholder="Extended warranty or installation" />
          </Field>
          <button className="acc-primary">Add optional product</button>
        </Form>
      )}
      <div className="acc-journal-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Description</th>
              <th className="acc-num">Quantity</th>
              <th className="acc-num">Unit Price</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(data?.data || []).map((item: any) => (
              <tr key={item.id}>
                <td><strong>{item.product_sku}</strong> · {item.product_name}</td>
                <td>{item.description || '—'}</td>
                <td className="acc-num">{displayQuantity(item.quantity_milli)} {item.unit}</td>
                <td className="acc-num">{money(item.unit_price_minor, item.currency)}</td>
                <td>{item.status}</td>
                <td>
                  {item.status === 'offered' && (
                    <div className="acc-toolbar">
                      <button
                        type="button"
                        className="acc-primary"
                        onClick={async () => {
                          setActionError('');
                          try {
                            await api('/sales/optional-products/' + item.id, 'PATCH', {
                              expected_version: item.version,
                              status: 'accepted',
                            });
                            setRev((n) => n + 1);
                            onNotify('Optional product accepted.');
                          } catch (e) {
                            setActionError((e as Error).message);
                          }
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="acc-secondary"
                        onClick={async () => {
                          setActionError('');
                          try {
                            await api('/sales/optional-products/' + item.id, 'PATCH', {
                              expected_version: item.version,
                              status: 'declined',
                            });
                            setRev((n) => n + 1);
                            onNotify('Optional product declined.');
                          } catch (e) {
                            setActionError((e as Error).message);
                          }
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && !data.data.length && <p>No optional products offered yet.</p>}
    </section>
  );
}

export function SalesPhase2Workspace(props: Props) {
  if (props.view === 'margins') return <MarginsView {...props} />;
  if (props.view === 'down-payments') return <DownPaymentsView {...props} />;
  return <OptionalProductsView {...props} />;
}
