import { useEffect, useState } from 'react';
import { Field, Form, factor, money, type API } from '../operations/UI';
import { parseMoney } from '../../../src/finance/money';
import { displayQuantity, quantityMilli } from '../../../src/inventory/quantity';
export function ProcurementReports({ api, scope }: { api: API; scope: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [dateFrom, setDateFrom] = useState(''),
    [dateTo, setDateTo] = useState(''),
    [supplier, setSupplier] = useState(''),
    [buyer, setBuyer] = useState(''),
    [category, setCategory] = useState(''),
    [currency, setCurrency] = useState(''),
    [vendorOptions, setVendorOptions] = useState<any[]>([]),
    [buyerOptions, setBuyerOptions] = useState<any[]>([]),
    [categoryOptions, setCategoryOptions] = useState<any[]>([]);
  useEffect(() => {
    let live = true;
    api('/procurement-report')
      .then((d) => {
        if (live) {
          setData(d);
          setVendorOptions(d.by_vendor || []);
          setBuyerOptions(d.buyer_options || []);
          setCategoryOptions(d.category_options || []);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [scope]);
  useEffect(() => {
    let live = true;
    const query = new URLSearchParams();
    if (dateFrom) query.set('date_from', dateFrom);
    if (dateTo) query.set('date_to', dateTo);
    if (supplier) query.set('supplier', supplier);
    if (buyer) query.set('buyer', buyer);
    if (category === 'uncategorized') query.set('uncategorized', 'true');
    else if (category.startsWith('category:')) query.set('category', category.slice('category:'.length));
    if (currency) query.set('currency', currency);
    api('/procurement-report' + (query.size ? '?' + query.toString() : ''))
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [scope, dateFrom, dateTo, supplier, buyer, category, currency]);
  function exportCsv() {
    if (!data) return;
    const csvRows: (string | number)[][] = [
      ['Section', 'Label', 'Category', 'Currency', 'Count', 'Quantity', 'Value'],
      ...(data.by_vendor || []).map((row: any) => ['Vendor', row.vendor, '', row.currency, row.order_count, '', row.value_minor]),
      ...(data.by_product || []).map((row: any) => ['Product', row.product, row.category, row.currency, row.orders, row.quantity_milli, row.value_minor]),
    ];
    const csv = csvRows.map((row) => row.map((value: string | number) => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'africore-purchase-analysis.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="panel">
          <h2>Purchase Analysis</h2>
          <div className="proc-toolbar" aria-label="Purchase analysis filters">
            <label><span>From</span><input aria-label="Report start date" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
            <label><span>To</span><input aria-label="Report end date" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
            <label><span>Vendor</span><select aria-label="Filter by vendor" value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">All vendors</option>{Array.from(new Map(vendorOptions.map((row: any) => [row.supplier_id, row])).values()).map((row: any) => <option key={row.supplier_id} value={row.supplier_id}>{row.vendor}</option>)}</select></label>
            <label><span>Buyer</span><select aria-label="Filter by buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)}><option value="">All buyers</option>{buyerOptions.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label><span>Product category</span><select aria-label="Filter by product category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categoryOptions.map((row: any) => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label>
            <label><span>Currency</span><select aria-label="Filter by currency" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="">All currencies</option>{['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((code) => <option key={code}>{code}</option>)}</select></label>
            <button className="secondary-button" onClick={exportCsv} disabled={!data}>Export CSV</button>
          </div>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading authorized procurement report…</p>}
      {data && (
        <>
          <p>{data.definitions}</p>
          <div className="app-metric-grid">
            <article className="panel">
              <span>Purchase requests</span>
              <strong>{data.request_count}</strong>
            </article>
            <article className="panel">
              <span>Awaiting review</span>
              <strong>{data.pending_requests}</strong>
            </article>
            <article className="panel">
              <span>Recorded supplier offers</span>
              <strong>{data.offer_count}</strong>
            </article>
            <article className="panel"><span>Late quotations</span><strong>{data.late_rfqs}</strong></article>
            <article className="panel"><span>Late receipts</span><strong>{data.late_receipts}</strong></article>
            <article className="panel"><span>Offers converted to orders</span><strong>{data.rfq_to_order}</strong></article>
          </div>
          {Object.entries(data.currencies).map(([currency, v]: any) => (
            <article className="panel" key={currency}>
              <h3>{currency} purchase commitments</h3>
              <p>
                {money(v.issued_minor, currency)} · {v.orders} issued records · {v.cancelled_orders} cancelled records retained separately · {v.open_receipt_lines} open receipt lines
              </p>
              {v.cancelled_orders > 0 && <p>Cancelled historical value: {money(v.cancelled_minor, currency)}</p>}
            </article>
          ))}
          <h3>Spend by vendor</h3>
          <div className="proc-table-wrap"><table className="proc-table"><thead><tr><th>Vendor</th><th>Currency</th><th className="numeric">Orders</th><th className="numeric">Open orders</th><th className="numeric">Committed value</th></tr></thead><tbody>{data.by_vendor.map((row: any) => <tr key={row.supplier_id + row.currency}><td>{row.vendor}</td><td>{row.currency}</td><td className="numeric">{row.order_count}</td><td className="numeric">{row.open_orders}</td><td className="numeric">{money(row.value_minor, row.currency)}</td></tr>)}</tbody></table></div>
          <h3>Spend by product</h3>
          <div className="proc-table-wrap"><table className="proc-table"><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Currency</th><th className="numeric">Quantity</th><th className="numeric">Value</th></tr></thead><tbody>{data.by_product.map((row: any, index: number) => <tr key={row.product + row.currency + index}><td>{row.product}</td><td>{row.sku || '—'}</td><td>{row.category}</td><td>{row.currency}</td><td className="numeric">{displayQuantity(row.quantity_milli)} {row.unit}</td><td className="numeric">{money(row.value_minor, row.currency)}</td></tr>)}</tbody></table></div>
          <h3>Orders by month</h3>
          {Object.entries(data.by_month || {}).reduce((result: any[], [, row]: any) => {
            const found = result.find((group) => group.currency === row.currency);
            if (found) found.rows.push(row); else result.push({ currency: row.currency, rows: [row] });
            return result;
          }, []).map((group: any) => {
            const max = Math.max(1, ...group.rows.map((row: any) => row.value_minor));
            return <section className="panel" key={group.currency}><h4>{group.currency}</h4>{group.rows.map((row: any) => <div key={row.month} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 140px', gap: 12, alignItems: 'center', margin: '8px 0' }}><span>{row.month}</span><div style={{ height: 18, background: '#edf0f2' }}><div style={{ width: Math.max(2, row.value_minor / max * 100) + '%', height: '100%', background: 'var(--accent, #78506f)' }} /></div><span className="numeric">{money(row.value_minor, group.currency)}</span></div>)}</section>;
          })}
          <h3>Supplier payable aging</h3>
          <p>
            Only current financial roles receive payable details. Manual payment observations do not
            establish a verified bank balance.
          </p>
          {Object.entries(data.aging).map(([currency, v]: any) => (
            <article className="panel" key={currency}>
              <h4>{currency}</h4>
              {Object.entries(v).map(([bucket, amount]: any) => (
                <p key={bucket}>
                  {bucket.replaceAll('_', '–')} days: {money(amount, currency)}
                </p>
              ))}
            </article>
          ))}
          {data.payables.map((b: any) => (
            <p key={b.id}>
              {b.reference} · {b.supplier} · due {b.due_on} ·{' '}
              {money(b.outstanding_minor, b.currency)} outstanding
              {b.credit_due_minor
                ? ' · ' + money(b.credit_due_minor, b.currency) + ' supplier credit due'
                : ''}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
export function ProcurementReplenishment({
  api,
  scope,
  writable,
}: {
  api: API;
  scope: string;
  writable: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [warehouse, setWarehouse] = useState<any[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    Promise.all([api('/inventory'), api('/inventory/warehouses')])
      .then(([d, w]) => {
        if (live) {
          setData(d);
          setWarehouse(w.data);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [scope]);
  return (
    <section className="panel">
      <h2>Replenishment review</h2>
      <p>
        Current low-stock suggestions account for available quantities and planned incoming goods.
        Every action below prepares a purchase request for separate review; it never places an
        order.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data?.data
        .filter((p: any) => p.low_stock && p.status === 'active')
        .map((p: any) => (
          <details key={p.id}>
            <summary>
              {p.name} · available {p.available_milli / 1000} {p.unit} · incoming{' '}
              {p.incoming_milli / 1000}
            </summary>
            <Form
              disabled={!writable}
              submit={async (d) => {
                await api('/procurement', 'POST', {
                  expected_version: 0,
                  record: {
                    type: 'request',
                    title: 'Replenish ' + p.name,
                    reason: d.reason,
                    currency: p.currency,
                    budget_minor: parseMoney(String(d.budget), p.currency),
                    needed_on: d.needed,
                    lines: [
                      {
                        id: crypto.randomUUID(),
                        product_id: p.id,
                        quantity_milli: quantityMilli(String(d.quantity)),
                        unit_price_minor: parseMoney(String(d.price), p.currency),
                        warehouse_id: d.warehouse,
                      },
                    ],
                    suggestion_id: null,
                  },
                });
                setNotice(
                  'Draft purchase request prepared for ' +
                    p.name +
                    '. Review it in Purchase requests.',
                );
              }}
            >
              <Field label={'Requested quantity (' + p.unit + ')'}>
                <input
                  name="quantity"
                  type="number"
                  min={['unit', 'box'].includes(p.unit) ? 1 : 0.001}
                  max={100000}
                  step={['unit', 'box'].includes(p.unit) ? 1 : 0.001}
                  defaultValue={displayQuantity(Math.min(100000000, Math.max(1000, Math.ceil((p.reorder_point_milli * 2 - p.available_milli - p.incoming_milli) / 1000) * 1000)))}
                  required
                />
              </Field>
              <Field label={'Estimated price per unit (' + p.currency + ')'}>
                <input
                  name="price"
                  type="number"
                  min={0}
                  max={100000000000 / factor(p.currency)}
                  step={1 / factor(p.currency)}
                  defaultValue={(p.purchase_cost_minor / factor(p.currency)).toFixed(factor(p.currency) === 1 ? 0 : 2)}
                  required
                />
              </Field>
              <Field label={'Spending ceiling (' + p.currency + ')'}>
                <input name="budget" type="number" min={0} max={100000000000 / factor(p.currency)} step={1 / factor(p.currency)} required />
              </Field>
              <Field label="Receiving warehouse">
                <select name="warehouse" required>
                  <option value="">Choose warehouse</option>
                  {warehouse
                    .filter((w) => w.status === 'active')
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Needed on">
                <input name="needed" type="date" required />
              </Field>
              <Field label="Purchase request reason">
                <textarea name="reason" required minLength={8} maxLength={1000} />
              </Field>
              <button className="secondary-button">Prepare request for separate review</button>
            </Form>
          </details>
        ))}
      {data && !data.data.some((p: any) => p.low_stock && p.status === 'active') && (
        <p>No active products currently need a replenishment review.</p>
      )}
      {data && <p>{data.valuation_note}</p>}
    </section>
  );
}
