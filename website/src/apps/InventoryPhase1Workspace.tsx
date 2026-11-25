import { useEffect, useState } from 'react';
import { Field, Form, money, today, type API } from '../operations/UI';
import { displayQuantity, quantityMilli } from '../../../src/inventory/quantity';
import type { InventoryView } from './inventory-app-model';

type Props = {
  api: API;
  view: InventoryView;
  products: any[];
  warehouses: any[];
  movements: any[];
  writable: boolean;
  revision: number;
  refresh: (message: string) => void;
};

function useInvData(api: API, path: string, revision: number): { data?: any; error?: string } {
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
  }, [api, path, revision]);
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

function LotsView({ api, products, warehouses, writable, revision, refresh }: Props) {
  const { data, error } = useInvData(api, '/inventory/lots', revision);
  const tracked = products.filter((p) => p.track_inventory);
  return (
    <section className="panel">
      <div className="inventory-list-head">
        <div>
          <h2>Lots & Serial Numbers</h2>
          <p>FEFO-ordered lot and serial tracking with expiry alerts and quarantine controls.</p>
        </div>
      </div>
      {error && <p className="alert error" role="alert">{error}</p>}
      {data?.summary && (
        <div className="commerce-metrics">
          <article>
            <span>Active lots</span>
            <strong>{data.summary.active}</strong>
          </article>
          <article>
            <span>Expiring within 30d</span>
            <strong>{data.summary.expiring_soon}</strong>
          </article>
          <article>
            <span>Expired</span>
            <strong>{data.summary.expired}</strong>
          </article>
          <article>
            <span>Quarantined</span>
            <strong>{data.summary.quarantined}</strong>
          </article>
        </div>
      )}
      {writable && tracked.length > 0 && warehouses.length > 0 && (
        <details>
          <summary>Register new lot or serial number</summary>
          <Form
            submit={async (d) => {
              await api('/inventory/lots', 'POST', {
                product_id: d.product_id,
                warehouse_id: d.warehouse_id,
                lot_number: d.lot_number,
                tracking_type: d.tracking_type,
                quantity_milli: quantityMilli(String(d.quantity || '0')),
                manufactured_on: d.manufactured_on || null,
                expiry_on: d.expiry_on || null,
                notes: d.notes || '',
              });
              refresh('Lot/serial number registered.');
            }}
          >
            <Field label="Product">
              <select name="product_id" required>
                {tracked.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Warehouse">
              <select name="warehouse_id" required>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lot / Serial #">
              <input name="lot_number" required minLength={1} maxLength={80} />
            </Field>
            <Field label="Tracking">
              <select name="tracking_type" defaultValue="lot">
                <option value="lot">Lot (Batch)</option>
                <option value="serial">Unique Serial</option>
              </select>
            </Field>
            <Field label="Quantity">
              <input name="quantity" defaultValue="1" required />
            </Field>
            <Field label="Manufactured on">
              <input name="manufactured_on" type="date" />
            </Field>
            <Field label="Expiry date">
              <input name="expiry_on" type="date" />
            </Field>
            <Field label="Notes">
              <input name="notes" maxLength={1000} />
            </Field>
            <button className="acc-primary">Save lot</button>
          </Form>
        </details>
      )}
      <div className="acc-journal-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Lot / Serial</th>
              <th>Product</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Expiry</th>
              <th>Status</th>
              {writable && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {(data?.data || []).map((lot: any) => (
              <tr key={lot.id}>
                <td><strong>{lot.lot_number}</strong></td>
                <td>{lot.product_sku} · {lot.product_name}</td>
                <td>{lot.tracking_type}</td>
                <td className="acc-num">{displayQuantity(lot.quantity_milli)} {lot.unit}</td>
                <td>{lot.expiry_on || '—'} {lot.expiry_state !== 'none' && lot.expiry_state !== 'ok' ? `(${lot.expiry_state})` : ''}</td>
                <td>{lot.status}</td>
                {writable && (
                  <td>
                    <button
                      type="button"
                      className="acc-secondary"
                      onClick={async () => {
                        const nextStatus = lot.status === 'quarantined' ? 'active' : 'quarantined';
                        await api('/inventory/lots/' + lot.id, 'PATCH', {
                          expected_version: lot.version,
                          status: nextStatus,
                        });
                        refresh(`Lot ${lot.lot_number} marked ${nextStatus}.`);
                      }}
                    >
                      {lot.status === 'quarantined' ? 'Release' : 'Quarantine'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && !data.data.length && <p>No lots or serial numbers registered yet.</p>}
    </section>
  );
}

function ScrapView({ api, products, warehouses, writable, revision, refresh }: Props) {
  const { data, error } = useInvData(api, '/inventory/scraps', revision);
  const { data: lots } = useInvData(api, '/inventory/lots', revision);
  const tracked = products.filter((p) => p.track_inventory);
  return (
    <section className="panel">
      <div className="inventory-list-head">
        <div>
          <h2>Scrap Orders</h2>
          <p>Remove damaged or expired inventory through audited negative stock movements.</p>
        </div>
      </div>
      {error && <p className="alert error" role="alert">{error}</p>}
      {writable && tracked.length > 0 && warehouses.length > 0 && (
        <Form
          submit={async (d) => {
            await api('/inventory/scraps', 'POST', {
              product_id: d.product_id,
              warehouse_id: d.warehouse_id,
              lot_id: d.lot_id || null,
              quantity_milli: quantityMilli(String(d.quantity || '1')),
              reason: d.reason,
            });
            refresh('Scrap order posted to stock ledger.');
          }}
        >
          <Field label="Product">
            <select name="product_id" required>
              {tracked.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Warehouse">
            <select name="warehouse_id" required>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lot / Serial (optional)">
            <select name="lot_id" defaultValue="">
              <option value="">No specific lot</option>
              {(lots?.data || [])
                .filter((l: any) => l.quantity_milli > 0)
                .map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.lot_number} · {l.product_sku} ({displayQuantity(l.quantity_milli)})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Quantity to scrap">
            <input name="quantity" defaultValue="1" required />
          </Field>
          <Field label="Scrap reason">
            <input name="reason" required minLength={8} maxLength={980} />
          </Field>
          <button className="acc-primary">Validate scrap</button>
        </Form>
      )}
      <div className="acc-journal-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Lot</th>
              <th>Quantity</th>
              <th>Reason</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.data || []).map((s: any) => (
              <tr key={s.id}>
                <td>{String(s.created_at).slice(0, 10)}</td>
                <td>{s.product_sku} · {s.product_name}</td>
                <td>{s.lot_number || '—'}</td>
                <td className="acc-num">{displayQuantity(s.quantity_milli)}</td>
                <td>{s.reason}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && !data.data.length && <p>No scrap orders recorded.</p>}
    </section>
  );
}

function ValuationView({ api, writable, revision, refresh }: Props) {
  const { data, error } = useInvData(api, '/inventory/valuation', revision);
  return (
    <section className="panel">
      <div className="inventory-list-head">
        <div>
          <h2>Stock Valuation</h2>
          <p>
            Exact integer-minor-unit inventory valuation powered by the Python FIFO / AVCO /
            Standard Cost engine.
          </p>
        </div>
        {data?.data?.length > 0 && (
          <button
            type="button"
            className="acc-secondary"
            onClick={() =>
              exportCsv(
                'stock-valuation.csv',
                ['SKU', 'Product', 'Method', 'On hand', 'Unit cost minor', 'Total value minor', 'COGS minor', 'Currency'],
                data.data.map((r: any) => [
                  r.sku,
                  r.name,
                  r.method,
                  displayQuantity(r.on_hand_milli),
                  r.unit_cost_minor,
                  r.total_value_minor,
                  r.total_cogs_minor,
                  r.currency,
                ]),
              )
            }
          >
            Export CSV
          </button>
        )}
      </div>
      {error && <p className="alert error" role="alert">{error}</p>}
      {data && (
        <>
          <div className="commerce-metrics">
            {Object.entries(data.totals_by_currency || {}).map(([cur, totals]: [string, any]) => (
              <article key={cur}>
                <span>Inventory value ({cur})</span>
                <strong>{money(totals.value_minor, cur)}</strong>
                <small>Cumulative COGS: {money(totals.cogs_minor, cur)}</small>
              </article>
            ))}
          </div>
          {writable && (
            <Form
              submit={async (d) => {
                await api('/inventory/valuation/policy', 'PUT', {
                  default_method: d.default_method,
                  product_methods: data.policy?.product_methods || {},
                });
                refresh('Inventory costing policy updated.');
              }}
            >
              <Field label="Default costing method">
                <select name="default_method" defaultValue={data.policy?.default_method || 'average'}>
                  <option value="average">Average Cost (AVCO)</option>
                  <option value="fifo">First In, First Out (FIFO)</option>
                  <option value="standard">Standard Cost</option>
                </select>
              </Field>
              <button className="acc-primary">Save costing policy</button>
            </Form>
          )}
          <div className="acc-journal-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Method</th>
                  <th className="acc-num">On Hand</th>
                  <th className="acc-num">Unit Cost</th>
                  <th className="acc-num">Total Value</th>
                  <th className="acc-num">Cumulative COGS</th>
                  <th>FIFO Layers</th>
                </tr>
              </thead>
              <tbody>
                {(data.data || []).map((row: any) => (
                  <tr key={row.product_id}>
                    <td><strong>{row.sku}</strong> · {row.name}</td>
                    <td>{row.method.toUpperCase()}</td>
                    <td className="acc-num">{displayQuantity(row.on_hand_milli)} {row.unit}</td>
                    <td className="acc-num">{money(row.unit_cost_minor, row.currency)}</td>
                    <td className="acc-num">{money(row.total_value_minor, row.currency)}</td>
                    <td className="acc-num">{money(row.total_cogs_minor, row.currency)}</td>
                    <td>{row.layers?.length ? `${row.layers.length} active` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function LandedCostsView({ api, movements, writable, revision, refresh }: Props) {
  const { data, error } = useInvData(api, '/inventory/landed-costs', revision);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const receipts = movements.filter((m) => m.kind === 'receipt' && Number(m.quantity_milli) > 0);
  return (
    <section className="panel">
      <div className="inventory-list-head">
        <div>
          <h2>Landed Costs</h2>
          <p>Allocate freight, customs, and insurance across posted stock receipts with exact minor-unit conservation.</p>
        </div>
      </div>
      {error && <p className="alert error" role="alert">{error}</p>}
      {writable && receipts.length > 0 && (
        <Form
          submit={async (d) => {
            if (!selectedIds.length) throw new Error('Select at least one stock receipt.');
            await api('/inventory/landed-costs', 'POST', {
              reference: d.reference,
              date_on: d.date_on,
              currency: d.currency,
              split_method: d.split_method,
              total_cost_minor: Math.round(Number(d.total_cost) * 100),
              description: d.description,
              movement_ids: selectedIds,
            });
            setSelectedIds([]);
            refresh('Landed cost posted and allocated to stock valuation.');
          }}
        >
          <Field label="Reference">
            <input name="reference" required minLength={2} maxLength={120} placeholder="LC-2026-001" />
          </Field>
          <Field label="Date">
            <input name="date_on" type="date" defaultValue={today()} required />
          </Field>
          <Field label="Currency">
            <select name="currency" defaultValue="KES">
              {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Split method">
            <select name="split_method" defaultValue="by_quantity">
              <option value="equal">Equal</option>
              <option value="by_quantity">By Quantity</option>
              <option value="by_current_cost">By Current Cost</option>
            </select>
          </Field>
          <Field label="Total additional cost">
            <input name="total_cost" type="number" step="0.01" min="0.01" required />
          </Field>
          <Field label="Description">
            <input name="description" required minLength={3} maxLength={1000} placeholder="Freight and customs clearance" />
          </Field>
          <fieldset>
            <legend>Target stock receipts</legend>
            {receipts.slice(0, 30).map((r) => (
              <label key={r.id} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(r.id)}
                  onChange={(e) =>
                    setSelectedIds((prev) =>
                      e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                    )
                  }
                />{' '}
                {String(r.created_at).slice(0, 10)} · {r.product_name || r.product_id.slice(0, 8)} · Qty{' '}
                {displayQuantity(r.quantity_milli)}
              </label>
            ))}
          </fieldset>
          <button className="acc-primary">Validate & allocate landed cost</button>
        </Form>
      )}
      <div className="acc-journal-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Split</th>
              <th className="acc-num">Total Cost</th>
              <th>Lines</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.data || []).map((lc: any) => (
              <tr key={lc.id}>
                <td>{lc.date_on}</td>
                <td><strong>{lc.reference}</strong></td>
                <td>{lc.split_method}</td>
                <td className="acc-num">{money(lc.total_cost_minor, lc.currency)}</td>
                <td>{lc.allocations?.length || 0} receipts</td>
                <td>{lc.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && !data.data.length && <p>No landed costs posted yet.</p>}
    </section>
  );
}

export function InventoryPhase1Workspace(props: Props) {
  if (props.view === 'lots') return <LotsView {...props} />;
  if (props.view === 'scrap') return <ScrapView {...props} />;
  if (props.view === 'valuation') return <ValuationView {...props} />;
  return <LandedCostsView {...props} />;
}
