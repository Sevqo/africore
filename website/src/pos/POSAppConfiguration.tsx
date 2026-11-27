import { useState } from 'react';
import { type API } from '../operations/UI';
import { POSRegisterEditor } from './POSRegisterEditor';

export function POSAppConfiguration({
  api,
  registers,
  selected,
  onSelect,
  onSaved,
  manager,
  online,
  busy,
  navigate,
  services,
}: {
  api: API;
  registers: any[];
  selected: any;
  onSelect: (id: string) => void;
  onSaved: (record: any) => void;
  manager: boolean;
  online: boolean;
  busy: boolean;
  navigate: (tab: string) => void;
  services: any[];
}) {
  const [creating, setCreating] = useState(!registers.length),
    record = registers.find((row: any) => row.id === selected) || registers[0];
  const status = (id: string) => {
    const row = services.find((item: any) => item.id === id);
    return row?.status || row?.entitlement?.status || 'unavailable';
  };
  const customersReady = status('customers') === 'active';
  if (!manager)
    return (
      <div className="pos-app-config o-app-sheet">
        <header className="pos-app-page-head">
          <div>
            <span className="eyebrow">Configuration</span>
            <h2>Register policy</h2>
          </div>
        </header>
        <p className="alert">
          A current workspace owner or administrator configures registers, cashiers, stock locations
          and payment limits. Assigned managers can review shifts and recorded cash separately.
        </p>
      </div>
    );
  return (
    <div className="pos-app-config o-app-sheet">
      <header className="pos-app-page-head">
        <div>
          <span className="eyebrow">Configuration</span>
          <h2>Point of Sale settings</h2>
          <p>
            Every setting below is enforced by the POS backend. Unsupported Odoo options are listed
            separately rather than shown as working controls.
          </p>
        </div>
        <button
          type="button"
          className="button"
          disabled={!customersReady}
          onClick={() => setCreating(true)}
        >
          New register
        </button>
      </header>
      <div className="pos-app-config-layout">
        <aside className="pos-app-config-side">
          <h3>Registers</h3>
          {registers.map((row: any) => (
            <button
              type="button"
              key={row.id}
              className={row.id === selected && !creating ? 'active' : ''}
              onClick={() => {
                onSelect(row.id);
                setCreating(false);
              }}
            >
              <strong>{row.data.name}</strong>
              <small>
                {row.data.currency} · {row.status}
              </small>
            </button>
          ))}
          {!registers.length && <p>No register policies yet.</p>}
          <h3>Dependencies</h3>
          <ul className="pos-dependency-list">
            {[
              'pos',
              'products',
              'orders',
              'invoicing',
              'cash_flow',
              'customers',
              'inventory',
              'payments',
            ].map((id) => (
              <li key={id}>
                <span>{id.replaceAll('_', ' ')}</span>
                <span className={'pos-dep ' + status(id)}>{status(id)}</span>
              </li>
            ))}
          </ul>
          <div className="pos-config-links">
            <button type="button" className="quiet-button" onClick={() => navigate('Inventory')}>
              Configure warehouse
            </button>
            <button type="button" className="quiet-button" onClick={() => navigate('Customers')}>
              Configure customers
            </button>
            <button type="button" className="quiet-button" onClick={() => navigate('Products')}>
              Canonical products
            </button>
          </div>
        </aside>
        <section className="pos-app-config-main">
          {!customersReady ? (
            <div className="alert" role="alert">
              <h3>Customers service required</h3>
              <p>
                Register setup and every POS write use an existing canonical customer. Activate
                Customers before configuring a register; POS will not create a customer or service
                entitlement for you.
              </p>
              <button type="button" className="button" onClick={() => navigate('Explore Services')}>
                Activate Customers
              </button>
            </div>
          ) : creating ? (
            <>
              <h3>Create a register policy</h3>
              <p>
                Choose a walk-in customer, an active warehouse and current workspace members.
                Tracked products cannot be sold until Inventory and the location are configured.
              </p>
              <POSRegisterEditor
                key="new"
                api={api}
                disabled={busy || !online}
                onSaved={(value) => {
                  setCreating(false);
                  onSaved(value);
                }}
                navigate={navigate}
              />
            </>
          ) : record ? (
            <>
              <h3>{record.data.name}</h3>
              <p>
                Currency and timezone become fixed after the first shift. Register policy cannot
                change while a shift is open.
              </p>
              <POSRegisterEditor
                key={record.id + '\0' + record.version}
                api={api}
                record={record}
                disabled={busy || !online}
                onSaved={onSaved}
                navigate={navigate}
              />
              <section className="pos-config-summary">
                <h4>Cash and payment behavior</h4>
                <dl>
                  <div>
                    <dt>Cash recording</dt>
                    <dd>{record.data.allow_cash ? 'Enabled' : 'Disabled'}</dd>
                  </div>
                  <div>
                    <dt>Electronic method</dt>
                    <dd>
                      {record.data.electronic_method === 'sandbox_simulator'
                        ? 'Sandbox simulator'
                        : record.data.electronic_method === 'daraja_sandbox'
                          ? 'Unavailable pending provider qualification'
                          : record.data.electronic_method}
                    </dd>
                  </div>
                  <div>
                    <dt>Pending orders</dt>
                    <dd>{record.data.allow_pending_orders ? 'Allowed' : 'Not allowed'}</dd>
                  </div>
                  <div>
                    <dt>Cashier discount ceiling</dt>
                    <dd>{record.data.cashier_discount_bps / 100}%</dd>
                  </div>
                  <div>
                    <dt>Manager discount ceiling</dt>
                    <dd>{record.data.manager_discount_bps / 100}%</dd>
                  </div>
                  <div>
                    <dt>Configured tax</dt>
                    <dd>{record.data.tax_bps / 100}%</dd>
                  </div>
                  <div>
                    <dt>Warehouse</dt>
                    <dd>
                      {record.data.warehouse_id
                        ? record.data.warehouse_id.slice(0, 8)
                        : 'Not configured'}
                    </dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>
                      {record.data.location_id
                        ? record.data.location_id.slice(0, 8)
                        : 'Not configured'}
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="pos-config-summary">
                <h4>Not supported in this checkpoint</h4>
                <p>
                  Live card terminals, live M-Pesa/Daraja collection, offline transaction queues,
                  customer-display hardware, weighing scales, restaurant tables and automatic cash
                  drawers are not implemented. No setting here pretends otherwise.
                </p>
              </section>
            </>
          ) : (
            <p>Select a register to review its policy.</p>
          )}
        </section>
      </div>
    </div>
  );
}
