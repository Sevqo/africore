import { useEffect, useState } from 'react';
import { factor, Field, Form, money, today, type API } from '../operations/UI';
import { quantityMilli } from '../../../src/inventory/quantity';

type Props = {
  api: API;
  view: 'three-way-match' | 'blanket-orders';
  writable: boolean;
  onNotify: (message: string) => void;
};

function useProcData(api: API, path: string, rev: number): { data?: any; error?: string } {
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

function ThreeWayView({ api, writable, onNotify }: Props) {
  const [rev, setRev] = useState(0);
  const { data, error } = useProcData(api, '/procurement/three-way-match', rev);
  return (
    <section className="panel">
      <h2>3-Way Matching (PO ↔ Receipt ↔ Vendor Bill)</h2>
      <p>
        Verify billed quantities and unit prices against Purchase Orders and Warehouse Receipts
        using exact integer arithmetic. Discrepancies hold payment until a separate manager reviews.
      </p>
      {error && <p className="alert error" role="alert">{error}</p>}
      {writable && (
        <Form
          submit={async (d) => {
            await api('/procurement/three-way-match', 'POST', {
              purchase_order_ref: d.po_ref,
              vendor_bill_ref: d.bill_ref,
              currency: d.currency,
              tolerance_bps: Math.round(Number(d.tolerance_pct || 0) * 100),
              lines: [
                {
                  id: 'line-1',
                  description: d.description || 'Matched item',
                  ordered_milli: quantityMilli(String(d.ordered || '0')),
                  received_milli: quantityMilli(String(d.received || '0')),
                  billed_milli: quantityMilli(String(d.billed || '0')),
                  po_unit_price_minor: Math.round(Number(d.po_price || 0) * factor(d.currency || 'KES')),
                  bill_unit_price_minor: Math.round(Number(d.bill_price || 0) * factor(d.currency || 'KES')),
                },
              ],
            });
            setRev((n) => n + 1);
            onNotify('3-way match evaluated and recorded.');
          }}
        >
          <Field label="Purchase Order Ref">
            <input name="po_ref" required minLength={2} maxLength={120} placeholder="PO-2026-001" />
          </Field>
          <Field label="Vendor Bill Ref">
            <input name="bill_ref" required minLength={2} maxLength={120} placeholder="BILL-2026-001" />
          </Field>
          <Field label="Currency">
            <select name="currency" defaultValue="KES">
              {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Price tolerance (%)">
            <input name="tolerance_pct" type="number" step="0.01" min="0" max="50" defaultValue="0" />
          </Field>
          <Field label="Item description">
            <input name="description" maxLength={300} placeholder="Raw materials" />
          </Field>
          <Field label="PO Qty">
            <input name="ordered" defaultValue="10" required />
          </Field>
          <Field label="Received Qty">
            <input name="received" defaultValue="10" required />
          </Field>
          <Field label="Billed Qty">
            <input name="billed" defaultValue="10" required />
          </Field>
          <Field label="PO Unit Price">
            <input name="po_price" type="number" step="0.01" min="0" required />
          </Field>
          <Field label="Bill Unit Price">
            <input name="bill_price" type="number" step="0.01" min="0" required />
          </Field>
          <button className="acc-primary">Evaluate & save 3-way match</button>
        </Form>
      )}
      <div className="acc-journal-table-scroll">
        <table>
          <thead>
            <tr>
              <th>PO Ref</th>
              <th>Bill Ref</th>
              <th>Match Result</th>
              <th className="acc-num">PO Value</th>
              <th className="acc-num">Bill Value</th>
              <th className="acc-num">Variance</th>
              <th>Payment Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.data || []).map((row: any) => (
              <tr key={row.id}>
                <td><strong>{row.purchase_order_ref}</strong></td>
                <td>{row.vendor_bill_ref}</td>
                <td>{row.result?.status || row.status}</td>
                <td className="acc-num">{money(row.result?.total_po_minor || 0, row.currency)}</td>
                <td className="acc-num">{money(row.result?.total_bill_minor || 0, row.currency)}</td>
                <td
                  className={
                    'acc-num' +
                    ((row.result?.total_variance_minor || 0) !== 0 ? ' acc-num-negative' : '')
                  }
                >
                  {money(row.result?.total_variance_minor || 0, row.currency)}
                </td>
                <td>{row.result?.pay_eligible ? 'Eligible for payment' : row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && !data.data.length && <p>No 3-way match records yet.</p>}
    </section>
  );
}

function BlanketOrdersView({ api, writable, onNotify }: Props) {
  const [rev, setRev] = useState(0);
  const [actionError, setActionError] = useState('');
  const { data, error } = useProcData(api, '/procurement/blanket-orders', rev);
  return (
    <section className="panel">
      <h2>Blanket Purchase Orders</h2>
      <p>Long-term supplier quantity and unit-price agreements with validity windows.</p>
      {(error || actionError) && <p className="alert error" role="alert">{error || actionError}</p>}
      {writable && (
        <Form
          submit={async (d) => {
            await api('/procurement/blanket-orders', 'POST', {
              reference: d.reference,
              vendor_name: d.vendor_name,
              currency: d.currency,
              starts_on: d.starts_on,
              ends_on: d.ends_on,
              lines: [
                {
                  sku: d.sku,
                  description: d.description,
                  agreed_quantity_milli: quantityMilli(String(d.qty || '100')),
                  ordered_quantity_milli: 0,
                  unit_price_minor: Math.round(Number(d.price || 0) * factor(d.currency || 'KES')),
                },
              ],
              notes: d.notes || '',
            });
            setRev((n) => n + 1);
            onNotify('Blanket purchase order created.');
          }}
        >
          <Field label="Agreement Ref">
            <input name="reference" required minLength={2} maxLength={120} placeholder="BO-2026-001" />
          </Field>
          <Field label="Vendor">
            <input name="vendor_name" required minLength={2} maxLength={200} />
          </Field>
          <Field label="Currency">
            <select name="currency" defaultValue="KES">
              {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Valid from">
            <input name="starts_on" type="date" defaultValue={today()} required />
          </Field>
          <Field label="Valid through">
            <input name="ends_on" type="date" defaultValue={today()} required />
          </Field>
          <Field label="SKU">
            <input name="sku" required minLength={1} maxLength={80} />
          </Field>
          <Field label="Item description">
            <input name="description" required minLength={1} maxLength={300} />
          </Field>
          <Field label="Agreed quantity">
            <input name="qty" defaultValue="100" required />
          </Field>
          <Field label="Agreed unit price">
            <input name="price" type="number" step="0.01" min="0" required />
          </Field>
          <Field label="Notes">
            <input name="notes" maxLength={1000} />
          </Field>
          <button className="acc-primary">Create blanket order</button>
        </Form>
      )}
      <div className="acc-journal-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Vendor</th>
              <th>Validity</th>
              <th>Lines</th>
              <th>Status</th>
              {writable && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {(data?.data || []).map((bo: any) => (
              <tr key={bo.id}>
                <td><strong>{bo.reference}</strong></td>
                <td>{bo.vendor_name}</td>
                <td>{bo.starts_on} → {bo.ends_on}</td>
                <td>{bo.lines?.length || 0}</td>
                <td>{bo.status}</td>
                {writable && (
                  <td>
                    {bo.status === 'ongoing' && (
                      <button
                        type="button"
                        className="acc-secondary"
                        onClick={async () => {
                          setActionError('');
                          try {
                            await api('/procurement/blanket-orders/' + bo.id, 'PATCH', {
                              expected_version: bo.version,
                              status: 'closed',
                              reason: 'Agreement fulfilled',
                            });
                            setRev((n) => n + 1);
                            onNotify(`Blanket order ${bo.reference} closed.`);
                          } catch (e) {
                            setActionError((e as Error).message);
                          }
                        }}
                      >
                        Close
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && !data.data.length && <p>No blanket purchase orders recorded.</p>}
    </section>
  );
}

export function ProcurementPhase3Workspace(props: Props) {
  if (props.view === 'three-way-match') return <ThreeWayView {...props} />;
  return <BlanketOrdersView {...props} />;
}
