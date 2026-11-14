import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Form, today, type API } from '../operations/UI';
import { ReplenishmentReview } from './ReplenishmentReview';
import { ReviewFields } from './ReviewFields';
import {
  defaultViewForSection,
  filterProducts,
  incomingIsOverdue,
  inventoryViews,
  movementLabels,
  pageCount,
  pageSlice,
  sectionForView,
  shipmentIsLate,
  shipmentIsOpen,
  shipmentLabels,
  shipmentNext,
  shipmentQuantity,
  transferDestination,
  viewsForSection,
  type InventoryView,
} from './inventory-app-model';
import { displayQuantity, quantityMilli } from '../../../src/inventory/quantity';

const idempotency = () => ({ 'Idempotency-Key': crypto.randomUUID() });
const short = (id: string) => id.slice(0, 8).toUpperCase();
const stamp = (value?: string) =>
  value ? new Date(value).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }) : 'Not recorded';

type Props = {
  api: API;
  scope: string;
  section?: string;
  navigate: (tab: string) => void;
  services?: string[];
  writable?: boolean;
};

export function InventoryAppWorkspace({
  api,
  scope,
  section = 'dashboard',
  navigate,
  services = [],
  writable = true,
}: Props) {
  const [overview, setOverview] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any>({ data: [], locations: [] });
  const [movements, setMovements] = useState<any[]>([]);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<InventoryView>(() => {
    const fromUrl = new URLSearchParams(location.search).get('view') as InventoryView | null;
    return fromUrl && inventoryViews.includes(fromUrl) ? fromUrl : defaultViewForSection[section] || 'overview';
  });
  const previousSection = useRef(section);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [warehouseId, setWarehouseId] = useState('');
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [deliveryId, setDeliveryId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [editWarehouse, setEditWarehouse] = useState<any>(null);
  const [countProductId, setCountProductId] = useState('');
  const [countSnapshot, setCountSnapshot] = useState<any>(null);
  const [countValue, setCountValue] = useState('');
  const [availability, setAvailability] = useState(false);

  const refresh = () => setRevision((value) => value + 1);
  const serviceKey = services.join(',');

  useEffect(() => {
    let current = true;
    setError('');
    setLoading(true);
    const optional = (id: string, path: string) => services.includes(id) ? api(path) : Promise.resolve({ data: [] });
    Promise.allSettled([
      api('/inventory'),
      api('/inventory/warehouses'),
      api('/inventory/movements'),
      api('/inventory/incoming'),
      api('/inventory/reservations'),
      optional('fulfillment', '/shipments?limit=100'),
      optional('orders', '/records/orders?limit=100'),
      optional('customers', '/records/customers?limit=100'),
      api('/inventory/replenishment-suggestions?status=open'),
    ]).then((results) => {
      if (!current) return;
      const failure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
      if (failure) setError(String(failure.reason?.message || failure.reason || 'Unable to load inventory records'));
      const value = (index: number) =>
        results[index].status === 'fulfilled' ? (results[index] as PromiseFulfilledResult<any>).value : undefined;
      const inventory = value(0);
      if (inventory) setOverview(inventory);
      const warehouseData = value(1);
      if (warehouseData) setWarehouses(warehouseData);
      setMovements(value(2)?.data || []);
      setIncoming(value(3)?.data || []);
      setReservations(value(4)?.data || []);
      setShipments(value(5)?.data || []);
      setOrders(value(6)?.data || []);
      setCustomers(value(7)?.data || []);
      setSuggestions(value(8) || null);
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [scope, revision, serviceKey]);

  useEffect(() => {
    const onPop = () => {
      const fromUrl = new URLSearchParams(location.search).get('view') as InventoryView | null;
      if (fromUrl && inventoryViews.includes(fromUrl)) setView(fromUrl);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (previousSection.current === section) return;
    previousSection.current = section;
    const fromUrl = new URLSearchParams(location.search).get('view') as InventoryView | null;
    const allowed = viewsForSection[section] || [];
    const next = fromUrl && allowed.includes(fromUrl) ? fromUrl : defaultViewForSection[section] || 'overview';
    setView(next);
    if (next !== fromUrl) {
      const url = new URL(location.href);
      if (next === defaultViewForSection[section]) url.searchParams.delete('view');
      else url.searchParams.set('view', next);
      history.replaceState(history.state, '', url);
    }
    setReceiptId(null);
    setDeliveryId(null);
    setProductId(null);
    setPage(0);
  }, [section]);

  useEffect(() => {
    setPage(0);
    setNotice('');
    setAvailability(false);
  }, [view]);

  const products: any[] = overview?.data || [];
  const locations: any[] = warehouses.locations || [];
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseMap = useMemo(() => new Map<string, any>((warehouses.data || []).map((w: any) => [w.id, w] as [string, any])), [warehouses]);
  const orderMap = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const movementMap = useMemo(() => new Map(movements.map((m) => [m.id, m])), [movements]);
  const currentWarehouse = warehouseMap.get(warehouseId) as any;
  const activeWarehouses = (warehouses.data || []).filter((w: any) => w.status === 'active');

  const title: Record<InventoryView, string> = {
    overview: 'Inventory Overview',
    receipts: 'Receipts',
    deliveries: 'Delivery Orders',
    transfers: 'Internal Transfers',
    counts: 'Physical Inventory',
    replenishment: 'Replenishment',
    stock: 'Stock',
    movements: 'Moves History',
    detailed: 'Detailed Stock',
    reservations: 'Reservations',
    incoming: 'Incoming',
    warehouses: 'Warehouses',
    locations: 'Locations',
    settings: 'Inventory Settings',
  };

  function go(next: InventoryView) {
    const nextSection = sectionForView[next];
    const url = new URL(location.href);
    url.searchParams.set('app', 'inventory');
    url.searchParams.set('section', nextSection);
    url.searchParams.set('view', next);
    url.hash = 'Apps';
    history.pushState({}, '', url);
    setView(next);
    setQuery('');
    setFilter('all');
    setPage(0);
    setReceiptId(null);
    setDeliveryId(null);
    setProductId(null);
    setEditWarehouse(null);
    window.dispatchEvent(new Event('africore:app-navigation'));
  }

  function productName(id: string) {
    return productMap.get(id)?.name || 'Retained product reference';
  }
  function warehouseName(id: string) {
    return warehouseMap.get(id)?.name || 'Retained warehouse reference';
  }
  function orderFor(shipment: any) {
    return orderMap.get(shipment.order_id) as any;
  }
  function customerFor(order: any) {
    return order?.customer_id ? customerMap.get(order.customer_id) : undefined;
  }

  const pendingIncoming = incoming.filter((row) => row.status === 'planned');
  const openShipments = shipments.filter((row) => shipmentIsOpen(row.status));
  const lateShipments = openShipments.filter((row) => shipmentIsLate(row, today()));
  const transfers = transferDestination(movements);
  const receipts = movements
    .filter((row) => row.kind === 'receipt' && movementMap.get(row.source_id)?.kind !== 'transfer')
    .map((row) => row);
  const openSuggestionCount = suggestions?.data?.length || 0;

  const Pager = ({ total }: { total: number }) => {
    const pages = pageCount(total);
    if (total <= 25) return null;
    return (
      <nav className="inventory-pager" aria-label="Record pages">
        <button className="secondary-button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
          Previous
        </button>
        <span>
          {page * 25 + 1}–{Math.min(total, (page + 1) * 25)} of {total} loaded
        </span>
        <button className="secondary-button" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>
          Next
        </button>
      </nav>
    );
  };

  function SectionTabs({ views }: { views: InventoryView[] }) {
    return (
      <nav className="inventory-view-tabs" aria-label="Inventory section views">
        {views.map((value) => (
          <button key={value} aria-current={view === value ? 'page' : undefined} onClick={() => go(value)}>
            {title[value]}
          </button>
        ))}
      </nav>
    );
  }

  function StockTable({ rows, showLow = true }: { rows: any[]; showLow?: boolean }) {
    const filtered = filterProducts(rows, filter, query);
    const paged = pageSlice(filtered, page);
    return (
      <section className="panel inventory-panel">
        <div className="inventory-toolbar">
          <label className="field inventory-search">
            <span>Search products</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, SKU, category or barcode" />
          </label>
          <label className="field">
            <span>Stock filter</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">All products</option>
              <option value="tracked">Tracked only</option>
              <option value="in">In stock</option>
              <option value="out">Out of stock</option>
              <option value="low">Low stock</option>
            </select>
          </label>
          <span className="inventory-record-count" role="status">{filtered.length} products</span>
        </div>
        <div className="inventory-table-scroll">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th className="numeric">On hand</th>
                <th className="numeric">Reserved</th>
                <th className="numeric">Available</th>
                <th className="numeric">Incoming</th>
                <th className="numeric">Forecast</th>
                <th>Unit</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((product) => (
                <tr key={product.id}>
                  <td>
                    <button className="inventory-link" onClick={() => { if (section !== 'products' && view !== 'stock') go('stock'); setProductId(product.id); }}>
                      {product.name}
                    </button>
                    {showLow && product.low_stock && <span className="inventory-flag">Low stock</span>}
                  </td>
                  <td>{product.sku}</td>
                  <td>{product.category || 'Uncategorised'}</td>
                  <td className="numeric">{displayQuantity(product.on_hand_milli || 0)}</td>
                  <td className="numeric">{displayQuantity(product.reserved_milli || 0)}</td>
                  <td className="numeric">{displayQuantity(product.available_milli || 0)}</td>
                  <td className="numeric">{displayQuantity(product.incoming_milli || 0)}</td>
                  <td className="numeric">{displayQuantity(product.forecasted_milli || 0)}</td>
                  <td>{product.unit}</td>
                  <td>{product.track_inventory ? <span className="inventory-pill">Tracked</span> : 'Not tracked'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && <p className="inventory-empty">No products match these filters.</p>}
        <Pager total={filtered.length} />
        <p className="inventory-note">
          Quantities are the authoritative shared stock totals for the first 1,000 products. No valuation is inferred from reference purchase prices.
        </p>
      </section>
    );
  }

  function ProductDocument({ id }: { id: string }) {
    const product = productMap.get(id) as any;
    if (!product) return <p className="alert error">This product is outside the loaded inventory set.</p>;
    const history = movements.filter((row) => row.product_id === id).slice(0, 40);
    const related = shipments.filter((shipment) => {
      const order = orderFor(shipment);
      return order?.items?.some((item: any) => item.product_id === id);
    });
    return (
      <section className="inventory-document">
        <button className="inventory-back" onClick={() => setProductId(null)}>
          <Icon name="left" /> Back to stock
        </button>
        <header className="inventory-document-head">
          <div>
            <span className="eyebrow">Product stock</span>
            <h2>{product.name}</h2>
            <p>{product.sku} · {product.category || 'Uncategorised'} · {product.unit}</p>
          </div>
          <div className="inventory-document-actions">
            <span className={'inventory-pill' + (product.low_stock ? ' danger' : '')}>{product.low_stock ? 'Low stock' : 'Stock recorded'}</span>
            <button className="secondary-button" onClick={() => navigate('Products')}>Open shared Products service</button>
          </div>
        </header>
        <div className="inventory-kpis">
          {[
            ['On hand', product.on_hand_milli],
            ['Reserved', product.reserved_milli],
            ['Available', product.available_milli],
            ['Incoming', product.incoming_milli],
            ['Forecast', product.forecasted_milli],
          ].map(([label, amount]) => (
            <article className="inventory-kpi" key={String(label)}>
              <span>{label}</span>
              <strong>{displayQuantity(Number(amount || 0))} {product.unit}</strong>
            </article>
          ))}
        </div>
        <div className="inventory-document-grid">
          <section className="panel">
            <h3>General information</h3>
            <dl className="inventory-facts">
              <dt>Tracking</dt><dd>{product.track_inventory ? 'Tracked stock' : 'Not tracked'}</dd>
              <dt>Reorder point</dt><dd>{displayQuantity(product.reorder_point_milli || 0)} {product.unit}</dd>
              <dt>Status</dt><dd>{product.status}</dd>
              <dt>Barcode</dt><dd>{product.barcode || 'Not recorded'}</dd>
              <dt>Variant</dt><dd>{product.variant || 'Not recorded'}</dd>
            </dl>
            <p className="inventory-note">Product master data is owned by the shared Products service. Warehouse allocation is not exposed as a balance endpoint; the movement register below is authoritative.</p>
          </section>
          <section className="panel">
            <h3>Related open deliveries</h3>
            {related.length ? related.map((shipment) => (
              <p key={shipment.id}>
                <button className="inventory-link" onClick={() => { go('deliveries'); setDeliveryId(shipment.id); }}>
                  {shipment.tracking_reference}
                </button>{' '}
                · {shipmentLabels[shipment.status] || shipment.status}
              </p>
            )) : <p className="inventory-empty">No loaded delivery references this product.</p>}
          </section>
        </div>
        <section className="panel">
          <h3>Movement history · latest 40 loaded movements</h3>
          {history.length ? (
            <div className="inventory-table-scroll">
              <table className="inventory-table">
                <thead><tr><th>Date</th><th>Type</th><th className="numeric">Quantity</th><th>Warehouse</th><th>Reason</th></tr></thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td>{stamp(row.created_at)}</td>
                      <td>{movementLabels[row.kind] || row.kind}</td>
                      <td className={'numeric ' + (Number(row.quantity_milli) < 0 ? 'negative' : 'positive')}>{displayQuantity(Number(row.quantity_milli))}</td>
                      <td>{warehouseName(row.warehouse_id)}</td>
                      <td>{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="inventory-empty">No loaded movement history for this product.</p>}
        </section>
      </section>
    );
  }

  function ReceiptDocument({ id }: { id: string }) {
    const row = incoming.find((item) => item.id === id);
    if (!row) return <p className="alert error">This receipt plan is outside the loaded records.</p>;
    const product = productMap.get(row.product_id) as any;
    const linkedPurchase = row.purchase_order_id;
    return (
      <section className="inventory-document">
        <button className="inventory-back" onClick={() => setReceiptId(null)}><Icon name="left" /> Back to receipts</button>
        <header className="inventory-document-head">
          <div>
            <span className="eyebrow">Receipt · incoming plan</span>
            <h2>IN/{short(row.id)}</h2>
            <p>{warehouseName(row.warehouse_id)} · expected {row.due_on}</p>
          </div>
          <div className="inventory-status-flow">
            <span className={row.status === 'planned' ? 'active' : ''}>Planned</span>
            <Icon name="right" />
            <span className={row.status === 'received' ? 'active' : ''}>Received</span>
            {row.status === 'cancelled' && <><Icon name="right" /><span className="active">Cancelled</span></>}
          </div>
        </header>
        {notice && <p className="alert" role="status">{notice}</p>}
        <div className="inventory-document-grid">
          <section className="panel">
            <h3>Receipt details</h3>
            <dl className="inventory-facts">
              <dt>Receive from</dt><dd>{linkedPurchase ? 'Linked purchase order' : 'Manually planned incoming stock'}</dd>
              <dt>Operation</dt><dd>Full physical receipt</dd>
              <dt>Destination</dt><dd>{warehouseName(row.warehouse_id)}</dd>
              <dt>Scheduled</dt><dd>{row.due_on}</dd>
              <dt>Source document</dt><dd>{linkedPurchase ? 'PO/' + short(linkedPurchase) : 'Incoming plan IN/' + short(row.id)}</dd>
              <dt>Recorded</dt><dd>{stamp(row.created_at)}</dd>
            </dl>
            <p>{row.reason}</p>
            {linkedPurchase && <p className="inventory-note">This plan belongs to a purchase order. Receive or cancel it through the Procurement goods-receipt workflow.</p>}
          </section>
          <section className="panel">
            <h3>Products</h3>
            <div className="inventory-table-scroll">
              <table className="inventory-table">
                <thead><tr><th>Product</th><th>Demand</th><th>Received</th><th>Unit</th></tr></thead>
                <tbody>
                  <tr>
                    <td>{product?.name || 'Retained product reference'}<small>{product?.sku}</small></td>
                    <td>{displayQuantity(Number(row.quantity_milli))}</td>
                    <td>{displayQuantity(Number(row.received_milli || 0))}</td>
                    <td>{product?.unit || 'unit'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {row.status === 'planned' && writable && !linkedPurchase && (
              <div className="inventory-action-grid">
                <Form className="inventory-inline-form" submit={async (data) => {
                  await api('/inventory/incoming/' + row.id + '/action', 'POST', { action: 'receive', reason: data.reason }, idempotency());
                  setNotice('The full planned quantity was received and an authoritative movement was posted.');
                  setReceiptId(null);
                  refresh();
                }}>
                  <Field label="Receiving reason"><textarea name="reason" required minLength={8} maxLength={1000} /></Field>
                  <button className="button">Validate receipt</button>
                </Form>
                <Form className="inventory-inline-form" submit={async (data) => {
                  await api('/inventory/incoming/' + row.id + '/action', 'POST', { action: 'cancel', reason: data.reason }, idempotency());
                  setNotice('The incoming plan was cancelled without a stock movement.');
                  setReceiptId(null);
                  refresh();
                }}>
                  <Field label="Cancellation reason"><textarea name="reason" required minLength={8} maxLength={1000} /></Field>
                  <button className="secondary-button">Cancel plan</button>
                </Form>
              </div>
            )}
            {!writable && <p className="inventory-note">Your role can review this receipt but cannot post stock.</p>}
          </section>
        </div>
      </section>
    );
  }

  function DeliveryDocument({ id }: { id: string }) {
    const shipment = shipments.find((row) => row.id === id);
    if (!shipment) return <p className="alert error">This delivery is outside the loaded records.</p>;
    const order = orderFor(shipment);
    const customer = customerFor(order);
    const nextStatuses = shipmentNext[shipment.status] || [];
    return (
      <section className="inventory-document">
        <button className="inventory-back" onClick={() => setDeliveryId(null)}><Icon name="left" /> Back to deliveries</button>
        <header className="inventory-document-head">
          <div>
            <span className="eyebrow">Delivery order · seller reported</span>
            <h2>{shipment.tracking_reference}</h2>
            <p>{order?.reference || 'Order ' + short(shipment.order_id)} · {customer?.name || 'Customer reference unavailable'}</p>
          </div>
          <div className="inventory-document-actions">
            <span className="inventory-pill">{shipmentLabels[shipment.status] || shipment.status}</span>
            <button className="secondary-button" onClick={() => navigate('Orders')}>Open shared orders</button>
          </div>
        </header>
        {notice && <p className="alert" role="status">{notice}</p>}
        {error && <p className="alert error" role="alert">{error}</p>}
        <div className="inventory-status-flow wide">
          {['pending', 'processing', 'ready_for_dispatch', 'shipped', 'out_for_delivery', 'delivered'].map((status) => (
            <span key={status} className={shipment.status === status ? 'active' : ''}>{shipmentLabels[status]}</span>
          ))}
        </div>
        <div className="inventory-document-grid">
          <section className="panel">
            <h3>Delivery details</h3>
            <dl className="inventory-facts">
              <dt>Customer</dt><dd>{customer?.name || 'Not loaded'}</dd>
              <dt>Source order</dt><dd>{order?.reference || short(shipment.order_id)}</dd>
              <dt>Courier</dt><dd>{shipment.courier === 'sandbox_courier' ? 'Sandbox courier' : 'Manual'}</dd>
              <dt>Tracking</dt><dd>{shipment.tracking_reference}</dd>
              <dt>Scheduled</dt><dd>{shipment.estimated_delivery}</dd>
              <dt>Assurance</dt><dd>{shipment.delivery_assurance || 'seller_reported'} — not proven customer acceptance</dd>
            </dl>
            <p className="inventory-note">Delivery status is recorded by the seller. Shipped stock is deducted from the confirmed order reservation only; payment or invoicing never dispatches goods.</p>
          </section>
          <section className="panel">
            <h3>Products</h3>
            <div className="inventory-table-scroll">
              <table className="inventory-table">
                <thead><tr><th>Product</th><th className="numeric">Demand</th><th className="numeric">Reserved</th><th className="numeric">Available</th><th>Unit</th></tr></thead>
                <tbody>
                  {(shipment.items || []).map((item: any) => {
                    const line = order?.items?.[item.item_index];
                    const product = line?.product_id ? productMap.get(line.product_id) as any : undefined;
                    return (
                      <tr key={item.item_index}>
                        <td>{line?.description || product?.name || 'Order line ' + item.item_index}</td>
                        <td className="numeric">{String(item.quantity)}</td>
                        <td className="numeric">{product ? displayQuantity(product.reserved_milli || 0) : '—'}</td>
                        <td className="numeric">{product ? displayQuantity(product.available_milli || 0) : '—'}</td>
                        <td>{product?.unit || line?.unit || 'unit'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="secondary-button" onClick={() => setAvailability((value) => !value)}>Check availability</button>
            {availability && (
              <div className="inventory-availability">
                <p>Current shared balances. Reserved quantities are already held for confirmed order lines; shipment dispatch still requires its exact reservation.</p>
                {(order?.items || []).map((line: any, index: number) => {
                  const product = line.product_id ? productMap.get(line.product_id) as any : undefined;
                  return (
                    <p key={index}>
                      {line.description} · demand {line.quantity} {product?.unit || ''} · on hand {product ? displayQuantity(product.on_hand_milli || 0) : 'untracked'} · available {product ? displayQuantity(product.available_milli || 0) : '—'}
                    </p>
                  );
                })}
              </div>
            )}
          </section>
        </div>
        <section className="panel">
          <h3>Operational actions</h3>
          {writable && nextStatuses.length > 0 ? (
            <Form className="inventory-inline-form" submit={async (data) => {
              await api('/shipments/' + shipment.id + '/transition', 'POST', { status: data.status, note: data.note || '' }, idempotency());
              setNotice('Delivery state recorded from the authoritative fulfillment workflow.');
              refresh();
            }}>
              <div className="form-grid">
                <Field label="Next state">
                  <select name="status" required>
                    {nextStatuses.map((status) => <option key={status} value={status}>{shipmentLabels[status] || status}</option>)}
                  </select>
                </Field>
                <Field label="Note"><input name="note" maxLength={1000} /></Field>
              </div>
              <button className="button">Record transition</button>
            </Form>
          ) : <p className="inventory-empty">{writable ? 'No further transition is available from this state.' : 'Your role can review this delivery but cannot post fulfillment changes.'}</p>}
        </section>
        <section className="panel">
          <h3>Activity</h3>
          {(shipment.history || []).slice().reverse().map((event: any, index: number) => (
            <p key={index}><strong>{shipmentLabels[event.state] || event.state}</strong> · {stamp(event.at)} · {event.actor}{event.note ? ' · ' + event.note : ''}</p>
          ))}
          <p className="inventory-note">Events are seller-reported fulfillment history. They are not courier scans, payment proof or customer acceptance.</p>
        </section>
      </section>
    );
  }

  function Overview() {
    return (
      <>
        <div className="inventory-overview-head">
          <div>
            <h2>Inventory Overview</h2>
            <p>Warehouse operations backed by shared stock movements. Counts cover loaded authorized records.</p>
          </div>
          <button className="secondary-button" onClick={refresh}>Refresh</button>
        </div>
        <div className="inventory-op-grid">
          <OperationCard title="Receipts" icon="box" context="Incoming plans" action={`${pendingIncoming.length} To Process`} onAction={() => { go('receipts'); setFilter('planned'); }} metrics={[
            ['Overdue', pendingIncoming.filter((row) => incomingIsOverdue(row, today())).length, () => { go('receipts'); setFilter('overdue'); }],
            ['Received', receipts.length, () => { go('receipts'); setFilter('closed'); }],
          ]} />
          <OperationCard title="Delivery Orders" icon="bag" context={services.includes('fulfillment') ? 'Seller-reported fulfillment' : 'Fulfillment service required'} action={services.includes('fulfillment') ? `${openShipments.length} To Process` : 'Unavailable'} onAction={() => go('deliveries')} metrics={services.includes('fulfillment') ? [
            ['Late', lateShipments.length, () => { go('deliveries'); setFilter('late'); }],
            ['Delivered', shipments.filter((row) => row.status === 'delivered').length, () => { go('deliveries'); setFilter('delivered'); }],
          ] : []} />
          <OperationCard title="Internal Transfers" icon="network" context="Posted paired movements" action={`${transfers.length} Posted`} onAction={() => go('transfers')} metrics={[
            ['Last 30 days', transfers.filter((row) => row.created_at >= new Date(Date.now() - 30 * 86400000).toISOString()).length, () => go('transfers')],
          ]} />
          <OperationCard title="Physical Inventory" icon="calculator" context="Authoritative counts" action={`${overview?.low_stock || 0} Low Stock`} onAction={() => go('counts')} metrics={[
            ['Out of stock', overview?.out_of_stock || 0, () => { go('stock'); setFilter('out'); }],
            ['Tracked products', products.filter((p) => p.track_inventory).length, () => { go('stock'); setFilter('tracked'); }],
          ]} />
          <OperationCard title="Replenishment" icon="tag" context="Workflow suggestions" action={`${openSuggestionCount} Open`} onAction={() => go('replenishment')} metrics={[
            ['Planned incoming', pendingIncoming.length, () => go('incoming')],
          ]} />
          <OperationCard title="Returns" icon="left" context="Returned dispatch stock" action={`${movements.filter((row) => row.kind === 'return').length} Recorded`} onAction={() => { go('movements'); setFilter('return'); }} metrics={[
            ['Transfers in', transfers.length, () => go('transfers')],
          ]} />
        </div>
        <div className="inventory-overview-grid">
          <section className="panel">
            <h3>Warehouse context</h3>
            {activeWarehouses.length ? activeWarehouses.map((warehouse: any) => (
              <p key={warehouse.id}><strong>{warehouse.name}</strong> · {warehouse.code} · {locations.filter((location: any) => location.warehouse_id === warehouse.id).length} locations</p>
            )) : <p className="inventory-empty">No active warehouse is configured. Add one in Configuration before posting stock.</p>}
            <button className="secondary-button" onClick={() => go('warehouses')}>Manage warehouses</button>
          </section>
          <section className="panel">
            <h3>Stock attention</h3>
            <p>{overview?.low_stock || 0} low-stock products · {overview?.out_of_stock || 0} out of stock · {overview?.truncated ? 'first 1,000 products shown' : 'all products shown'}.</p>
            <p className="inventory-note">{overview?.valuation_note || 'No aggregate valuation is inferred from reference cost.'}</p>
            <button className="secondary-button" onClick={() => { go('stock'); setFilter('low'); }}>Review low stock</button>
          </section>
        </div>
        <p className="inventory-note">Sandbox-safe: no external provider, courier or payment is activated by these operations. Stock quantities are shared with Sales, Commerce, POS and Procurement.</p>
      </>
    );
  }

  function OperationCard({ title: heading, icon, context, action, onAction, metrics }: {
    title: string;
    icon: any;
    context: string;
    action: string;
    onAction: () => void;
    metrics: [string, number, () => void][];
  }) {
    return (
      <article className="inventory-op-card">
        <header>
          <h3><Icon name={icon} /> {heading}</h3>
          <span>{context}</span>
        </header>
        <button className="inventory-op-primary" onClick={onAction}>{action}</button>
        <div className="inventory-op-metrics">
          {metrics.map(([label, amount, handler]) => (
            <button key={label} onClick={handler}><strong>{amount}</strong><span>{label}</span></button>
          ))}
        </div>
      </article>
    );
  }

  function ReceiptsView() {
    if (receiptId) return <ReceiptDocument id={receiptId} />;
    const planRows = incoming.filter((row) => {
      if (filter === 'planned' && row.status !== 'planned') return false;
      if (filter === 'closed' && row.status === 'planned') return false;
      if (filter === 'overdue' && !incomingIsOverdue(row, today())) return false;
      const text = query.toLowerCase();
      return !text || [productName(row.product_id), warehouseName(row.warehouse_id), row.reason].some((value) => value.toLowerCase().includes(text));
    });
    const historyRows = receipts.filter((row) => {
      const text = query.toLowerCase();
      return !text || [productName(row.product_id), warehouseName(row.warehouse_id), row.reason].some((value) => value.toLowerCase().includes(text));
    });
    return (
      <>
        <div className="inventory-list-head">
          <div><h2>Receipts</h2><p>Planned incoming stock and posted physical receipts. Receipt plans are the only supported pre-receipt record.</p></div>
          <span className="inventory-record-count">{planRows.length} plans · {historyRows.length} posted receipts</span>
        </div>
        <div className="inventory-toolbar">
          <label className="field inventory-search"><span>Search receipts</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Product, warehouse or reason" /></label>
          <label className="field"><span>Plan state</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All plans</option><option value="planned">Planned</option><option value="overdue">Overdue</option><option value="closed">Received or cancelled</option></select></label>
        </div>
        <section className="panel inventory-panel">
          <h3>Incoming plans</h3>
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead><tr><th>Reference</th><th>Product</th><th>Receive from</th><th>Scheduled</th><th className="numeric">Demand</th><th>Warehouse</th><th>Status</th></tr></thead>
              <tbody>
                {pageSlice(planRows, page).map((row) => (
                  <tr key={row.id}>
                    <td><button className="inventory-link" onClick={() => setReceiptId(row.id)}>IN/{short(row.id)}</button></td>
                    <td>{productName(row.product_id)}</td>
                    <td>{row.purchase_order_id ? 'Purchase order' : 'Manual plan'}</td>
                    <td>{row.due_on}{incomingIsOverdue(row, today()) && <span className="inventory-flag">Overdue</span>}</td>
                    <td className="numeric">{displayQuantity(Number(row.quantity_milli))}</td>
                    <td>{warehouseName(row.warehouse_id)}</td>
                    <td><span className={'inventory-pill' + (row.status === 'planned' ? ' muted' : '')}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!planRows.length && <p className="inventory-empty">No incoming plans match these filters.</p>}
          <Pager total={planRows.length} />
        </section>
        <section className="panel inventory-panel">
          <h3>Posted receipt movements</h3>
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead><tr><th>Date</th><th>Product</th><th className="numeric">Quantity</th><th>Warehouse</th><th>Reason</th></tr></thead>
              <tbody>
                {pageSlice(historyRows, page).map((row) => (
                  <tr key={row.id}>
                    <td>{stamp(row.created_at)}</td>
                    <td>{productName(row.product_id)}</td>
                    <td className="numeric positive">{displayQuantity(Number(row.quantity_milli))}</td>
                    <td>{warehouseName(row.warehouse_id)}</td>
                    <td>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!historyRows.length && <p className="inventory-empty">No receipt movements match these filters.</p>}
        </section>
        <IncomingPlanForm />
      </>
    );
  }

  function IncomingPlanForm() {
    return (
      <details className="panel inventory-form-panel">
        <summary>Plan incoming stock</summary>
        <Form submit={async (data) => {
          await api('/inventory/incoming', 'POST', {
            product_id: data.product,
            warehouse_id: data.warehouse,
            quantity_milli: quantityMilli(data.quantity),
            due_on: data.due,
            reason: data.reason,
          }, idempotency());
          setNotice('Incoming plan recorded. It does not increase physical stock until a receipt is validated.');
          refresh();
        }} disabled={!writable}>
          <div className="form-grid">
            <Field label="Tracked product">
              <select name="product" required>
                <option value="">Choose product</option>
                {products.filter((product) => product.status === 'active' && product.track_inventory).map((product) => (
                  <option key={product.id} value={product.id}>{product.sku} · {product.name} ({product.unit})</option>
                ))}
              </select>
            </Field>
            <Field label="Receiving warehouse">
              <select name="warehouse" required>
                <option value="">Choose warehouse</option>
                {activeWarehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </Field>
            <Field label="Planned quantity"><input name="quantity" required inputMode="decimal" placeholder="0.000" /></Field>
            <Field label="Expected arrival"><input name="due" type="date" required defaultValue={today()} /></Field>
          </div>
          <Field label="Planning reason"><textarea name="reason" required minLength={8} maxLength={1000} /></Field>
          <button className="button">Record incoming plan</button>
        </Form>
      </details>
    );
  }

  function DeliveriesView() {
    if (!services.includes('fulfillment')) return (
      <section className="panel inventory-panel">
        <h2>Delivery Orders</h2>
        <p className="inventory-empty">Delivery records belong to the Fulfillment service. Activate Fulfillment to list shipments, check availability and record sender-reported delivery events.</p>
        <p className="inventory-note">Inventory stock remains usable without Fulfillment. No delivery record is inferred from a stock movement.</p>
      </section>
    );
    if (deliveryId) return <DeliveryDocument id={deliveryId} />;
    const rows = shipments.filter((shipment) => {
      if (filter === 'open' && !shipmentIsOpen(shipment.status)) return false;
      if (filter === 'late' && !shipmentIsLate(shipment, today())) return false;
      if (!['all', 'open', 'late'].includes(filter) && shipment.status !== filter) return false;
      const order = orderFor(shipment);
      const customer = customerFor(order);
      const text = query.toLowerCase();
      return !text || [shipment.tracking_reference, order?.reference, customer?.name].filter(Boolean).some((value: string) => String(value).toLowerCase().includes(text));
    });
    return (
      <>
        <div className="inventory-list-head">
          <div><h2>Delivery Orders</h2><p>Shipments created from confirmed orders. Status is seller-reported; it is not a courier scan or customer acceptance.</p></div>
          <span className="inventory-record-count">{rows.length} deliveries</span>
        </div>
        <div className="inventory-toolbar">
          <label className="field inventory-search"><span>Search deliveries</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tracking, order or customer" /></label>
          <label className="field"><span>Status</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">All</option><option value="open">Open</option><option value="late">Late</option>
              {Object.entries(shipmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <section className="panel inventory-panel">
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead><tr><th>Reference</th><th>Customer</th><th>Source order</th><th>Scheduled</th><th className="numeric">Quantity</th><th>Status</th><th>Assurance</th></tr></thead>
              <tbody>
                {pageSlice(rows, page).map((shipment) => {
                  const order = orderFor(shipment);
                  const customer = customerFor(order);
                  return (
                    <tr key={shipment.id}>
                      <td><button className="inventory-link" onClick={() => setDeliveryId(shipment.id)}>{shipment.tracking_reference}</button></td>
                      <td>{customer?.name || 'Not loaded'}</td>
                      <td>{order?.reference || short(shipment.order_id)}</td>
                      <td>{shipment.estimated_delivery}{shipmentIsLate(shipment, today()) && <span className="inventory-flag">Late</span>}</td>
                      <td className="numeric">{displayQuantity(shipmentQuantity(shipment.items || []))}</td>
                      <td><span className={'inventory-pill' + (shipmentIsOpen(shipment.status) ? '' : ' muted')}>{shipmentLabels[shipment.status] || shipment.status}</span></td>
                      <td>{shipment.delivery_assurance || 'seller_reported'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && <p className="inventory-empty">No deliveries match these filters. Fulfillment records come from the shared orders workflow.</p>}
          <Pager total={rows.length} />
          <p className="inventory-note">Creating a shipment requires a confirmed order and is performed from the shared Orders / Fulfillment workflow. This application records transitions and checks availability but does not invent delivery drafts.</p>
        </section>
      </>
    );
  }

  function TransfersView() {
    return (
      <>
        <div className="inventory-list-head">
          <div><h2>Internal Transfers</h2><p>Transfers post immediately as paired outbound and inbound movements. There is no draft, waiting or backorder state in the current backend.</p></div>
          <span className="inventory-record-count">{transfers.length} posted transfers</span>
        </div>
        <section className="panel">
          <h3>Post an internal transfer</h3>
          <Form submit={async (data) => {
            await api('/inventory/movements', 'POST', {
              product_id: data.product,
              warehouse_id: data.source,
              kind: 'transfer',
              quantity_milli: quantityMilli(data.quantity),
              destination_warehouse_id: data.destination,
              reason: data.reason,
            }, idempotency());
            setNotice('Transfer posted. Company-owned stock is unchanged; source decreased and destination increased.');
            refresh();
          }} disabled={!writable}>
            <div className="form-grid">
              <Field label="Tracked product">
                <select name="product" required>
                  <option value="">Choose product</option>
                  {products.filter((product) => product.status === 'active' && product.track_inventory).map((product) => (
                    <option key={product.id} value={product.id}>{product.sku} · {product.name} ({product.unit})</option>
                  ))}
                </select>
              </Field>
              <Field label="Source warehouse">
                <select name="source" required>
                  <option value="">Choose source</option>
                  {activeWarehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
              </Field>
              <Field label="Destination warehouse">
                <select name="destination" required>
                  <option value="">Choose destination</option>
                  {activeWarehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
              </Field>
              <Field label="Quantity"><input name="quantity" required inputMode="decimal" /></Field>
            </div>
            <Field label="Transfer reason"><textarea name="reason" required minLength={8} maxLength={1000} /></Field>
            <button className="button">Post transfer</button>
          </Form>
        </section>
        <section className="panel inventory-panel">
          <h3>Posted transfers</h3>
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead><tr><th>Reference</th><th>Product</th><th>From</th><th>To</th><th className="numeric">Quantity</th><th>Posted</th></tr></thead>
              <tbody>
                {transfers.map((row) => (
                  <tr key={row.id}>
                    <td>TR/{short(row.id)}</td>
                    <td>{productName(row.product_id)}</td>
                    <td>{warehouseName(row.warehouse_id)}</td>
                    <td>{row.destination_warehouse_id ? warehouseName(row.destination_warehouse_id) : 'Retained destination reference'}</td>
                    <td className="numeric">{displayQuantity(Math.abs(Number(row.quantity_milli)))}</td>
                    <td>{stamp(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!transfers.length && <p className="inventory-empty">No posted transfers are in the loaded movement register.</p>}
          <p className="inventory-note">Transfer movements retain their paired source and destination references. They do not create a second stock balance.</p>
        </section>
      </>
    );
  }

  function CountsView() {
    const countProduct = productMap.get(countProductId) as any;
    const countedMilli = (() => { try { return countValue ? quantityMilli(countValue) : null; } catch { return null; } })();
    const difference = countSnapshot && countedMilli !== null ? countedMilli - Number(countSnapshot.on_hand_milli) : null;
    const rows = filterProducts(products.filter((product) => product.track_inventory), filter === 'all' ? '' : filter, query);
    return (
      <>
        <div className="inventory-list-head">
          <div><h2>Physical Inventory</h2><p>Observe an exact product balance, enter the physically counted quantity and post a revision-checked adjustment. Counts never consume reserved stock.</p></div>
          <span className="inventory-record-count">{products.filter((product) => product.track_inventory).length} tracked products</span>
        </div>
        <section className="panel inventory-panel">
          <div className="inventory-toolbar">
            <label className="field"><span>Count warehouse</span>
              <select value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setCountSnapshot(null); }}>
                <option value="">Choose warehouse</option>
                {activeWarehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </label>
            <label className="field inventory-search"><span>Find product</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or SKU" /></label>
            <span className="inventory-record-count">{rows.length} products</span>
          </div>
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead><tr><th>Location</th><th>Product</th><th className="numeric">On hand</th><th className="numeric">Counted</th><th className="numeric">Difference</th><th>Unit</th><th>Action</th></tr></thead>
              <tbody>
                {pageSlice(rows, page).map((product) => (
                  <tr key={product.id} className={countProductId === product.id ? 'selected' : ''}>
                    <td>{currentWarehouse?.name || warehouseName(warehouseId) || 'Select warehouse'}</td>
                    <td>{product.name}<small>{product.sku}</small></td>
                    <td className="numeric">{displayQuantity(product.on_hand_milli || 0)}</td>
                    <td className="numeric">{countProductId === product.id ? (countedMilli !== null ? displayQuantity(countedMilli) : '—') : '—'}</td>
                    <td className="numeric">{countProductId === product.id ? (difference === null ? '—' : displayQuantity(difference)) : '—'}</td>
                    <td>{product.unit}</td>
                    <td>
                      <button className="secondary-button" disabled={!warehouseId} onClick={async () => {
                        setError('');
                        setCountProductId(product.id);
                        setCountSnapshot(null);
                        setCountValue('');
                        try {
                          const result = await api('/inventory/stock-counts/preview?' + new URLSearchParams({ product_id: product.id, warehouse_id: warehouseId }));
                          setCountSnapshot(result);
                          setCountValue(displayQuantity(Number(result.on_hand_milli)));
                        } catch (reason) {
                          setError((reason as Error).message);
                        }
                      }}>Count</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p className="inventory-empty">No tracked products match this search.</p>}
          <Pager total={rows.length} />
        </section>
        {countProduct && countSnapshot && (
          <section className="panel inventory-count-editor">
            <h3>Count {countProduct.name}</h3>
            <p>Observed {displayQuantity(Number(countSnapshot.on_hand_milli))} {countSnapshot.unit}; reserved {displayQuantity(Number(countSnapshot.reserved_milli))}. Observed {stamp(countSnapshot.observed_at)}.</p>
            <Form submit={async (data) => {
              if (data.review_mode === 'review') {
                if (!(difference !== null && difference < 0)) throw new Error('Review applies to a negative count difference.');
                await api('/inventory/adjustment-approvals', 'POST', {
                  approver: data.approver,
                  movement: {
                    product_id: countSnapshot.product_id,
                    warehouse_id: countSnapshot.warehouse_id,
                    ...(countSnapshot.location_id ? { location_id: countSnapshot.location_id } : {}),
                    kind: 'adjustment',
                    quantity_milli: difference,
                    reason: 'Stock count: ' + data.reason,
                  },
                }, idempotency());
                setNotice('Write-off review requested. After approval, select that exact approval and post the same count.');
                return;
              }
              await api('/inventory/stock-counts', 'POST', {
                product_id: countSnapshot.product_id,
                warehouse_id: countSnapshot.warehouse_id,
                ...(countSnapshot.location_id ? { location_id: countSnapshot.location_id } : {}),
                expected_revision: countSnapshot.revision,
                counted_quantity_milli: quantityMilli(data.counted),
                reason: data.reason,
                ...(data.approval ? { approval_id: data.approval } : {}),
              }, idempotency());
              setNotice('Count recorded. The authoritative adjustment was posted when a difference existed.');
              setCountSnapshot(null);
              setCountProductId('');
              refresh();
            }} disabled={!writable}>
              <Field label={'Physically counted quantity · ' + countSnapshot.unit}>
                <input name="counted" required inputMode="decimal" value={countValue} onChange={(event) => setCountValue(event.target.value)} />
              </Field>
              <p>Adjustment difference: {difference === null ? 'Enter an exact supported quantity' : displayQuantity(difference) + ' ' + countSnapshot.unit}</p>
              <Field label="Count reason"><textarea name="reason" required minLength={8} maxLength={980} /></Field>
              <ReviewFields api={api} scope={scope} resourceId={countSnapshot.product_id} action="stock_adjustment" stock />
              <p className="inventory-note">A significant negative adjustment requires a different authorized reviewer. If stock or reservations changed since observation, the stale revision is rejected and the count must be reloaded.</p>
              <button className="button">Post count</button>
            </Form>
          </section>
        )}
      </>
    );
  }

  function MovementsView() {
    const rows = movements.filter((row) => {
      if (!['all', 'receipt', 'adjustment', 'return', 'transfer', 'dispatch'].includes(filter)) return false;
      if (filter !== 'all' && row.kind !== filter) return false;
      if (warehouseId && row.warehouse_id !== warehouseId) return false;
      const text = query.toLowerCase();
      return !text || [productName(row.product_id), warehouseName(row.warehouse_id), row.reason].some((value) => value.toLowerCase().includes(text));
    });
    return (
      <>
        <div className="inventory-list-head"><div><h2>Moves History</h2><p>Posted authoritative stock movements, newest first. The API returns the latest 100 per request.</p></div><span className="inventory-record-count">{rows.length} movements</span></div>
        <section className="panel inventory-panel">
          <div className="inventory-toolbar">
            <label className="field inventory-search"><span>Search movements</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Product, warehouse or reason" /></label>
            <label className="field"><span>Movement type</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All</option>{Object.entries(movementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field"><span>Warehouse</span><select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">All warehouses</option>{activeWarehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
          </div>
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead><tr><th>Date</th><th>Reference</th><th>Product</th><th>From / To</th><th className="numeric">Quantity</th><th>Unit</th><th>Type</th><th>Reason</th></tr></thead>
              <tbody>
                {pageSlice(rows, page).map((row) => {
                  const product = productMap.get(row.product_id) as any;
                  const source = movementMap.get(row.source_id);
                  return (
                    <tr key={row.id}>
                      <td>{stamp(row.created_at)}</td>
                      <td>MV/{short(row.id)}</td>
                      <td>{product?.name || 'Retained product reference'}</td>
                      <td>{warehouseName(row.warehouse_id)}{source ? ' · from ' + warehouseName(source.warehouse_id) : ''}</td>
                      <td className={'numeric ' + (Number(row.quantity_milli) < 0 ? 'negative' : 'positive')}>{displayQuantity(Number(row.quantity_milli))}</td>
                      <td>{product?.unit || 'unit'}</td>
                      <td>{movementLabels[row.kind] || row.kind}</td>
                      <td>{row.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && <p className="inventory-empty">No movements match these filters.</p>}
          <Pager total={rows.length} />
        </section>
      </>
    );
  }

  function InventoryReports() {
    if (view === 'movements') return <MovementsView />;
    if (view === 'reservations') return (
      <section className="panel inventory-panel">
        <h3>Reservations</h3>
        <div className="inventory-table-scroll">
          <table className="inventory-table">
            <thead><tr><th>Product</th><th>Warehouse</th><th className="numeric">Held</th><th className="numeric">Dispatched</th><th>Status</th><th>Order</th></tr></thead>
            <tbody>
              {reservations.map((row) => (
                <tr key={row.id}>
                  <td>{productName(row.product_id)}</td><td>{warehouseName(row.warehouse_id)}</td>
                  <td className="numeric">{displayQuantity(Number(row.quantity_milli))}</td>
                  <td className="numeric">{displayQuantity(Number(row.dispatched_milli || 0))}</td>
                  <td>{row.status}</td><td>{row.order_id ? short(row.order_id) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!reservations.length && <p className="inventory-empty">No held or historical reservations are in the loaded records.</p>}
        <p className="inventory-note">Reservations reduce availability but are not physical movements. Dispatch consumes held stock exactly once.</p>
      </section>
    );
    if (view === 'incoming') return (
      <section className="panel inventory-panel">
        <h3>Incoming plans</h3>
        <div className="inventory-table-scroll">
          <table className="inventory-table">
            <thead><tr><th>Reference</th><th>Product</th><th>Warehouse</th><th className="numeric">Planned</th><th>Scheduled</th><th>Status</th></tr></thead>
            <tbody>
              {incoming.map((row) => (
                <tr key={row.id}>
                  <td><button className="inventory-link" onClick={() => { go('receipts'); setReceiptId(row.id); }}>IN/{short(row.id)}</button></td>
                  <td>{productName(row.product_id)}</td><td>{warehouseName(row.warehouse_id)}</td>
                  <td className="numeric">{displayQuantity(Number(row.quantity_milli) - Number(row.received_milli || 0))}</td>
                  <td>{row.due_on}</td><td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!incoming.length && <p className="inventory-empty">No incoming plans are loaded.</p>}
        <p className="inventory-note">Planned incoming affects forecasted availability, not physical on-hand stock.</p>
      </section>
    );
    if (view === 'detailed') {
      const current = currentWarehouse as any;
      const rows = movements.filter((row) => !warehouseId || row.warehouse_id === warehouseId);
      return (
        <>
          <div className="inventory-list-head"><div><h2>Detailed Stock</h2><p>Warehouse movement register and location structure. Aggregate per-location balances are not exposed as a read endpoint.</p></div></div>
          <section className="panel">
            <div className="inventory-toolbar">
              <label className="field"><span>Warehouse</span><select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">All warehouses</option>{activeWarehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
            </div>
            {current && <p><strong>{current.name}</strong> · {current.code} · {locations.filter((location: any) => location.warehouse_id === current.id).length} locations</p>}
            <div className="inventory-table-scroll">
              <table className="inventory-table">
                <thead><tr><th>Product</th><th>Warehouse</th><th className="numeric">Loaded movement net</th><th>Unit</th></tr></thead>
                <tbody>
                  {Object.entries(rows.reduce((acc: Record<string, number>, row) => {
                    const key = row.product_id + '|' + row.warehouse_id;
                    acc[key] = (acc[key] || 0) + Number(row.quantity_milli);
                    return acc;
                  }, {})).map(([key, total]) => {
                    const [product, warehouse] = key.split('|');
                    return <tr key={key}><td>{productName(product)}</td><td>{warehouseName(warehouse)}</td><td className="numeric">{displayQuantity(total)}</td><td>{(productMap.get(product) as any)?.unit || 'unit'}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
            {!rows.length && <p className="inventory-empty">No movements match this warehouse.</p>}
            <p className="inventory-note">The net shown covers only the latest 100 loaded movements and is not a substitute for the authoritative aggregate stock report.</p>
          </section>
        </>
      );
    }
    return <StockTable rows={products} />;
  }

  function ConfigurationView() {
    if (view === 'locations') return (
      <>
        <div className="inventory-list-head"><div><h2>Locations</h2><p>Storage locations belong to a warehouse and retain their parent reference.</p></div></div>
        <section className="panel">
          <h3>Add location</h3>
          <Form submit={async (data) => {
            await api('/inventory/warehouses/' + data.warehouse + '/locations', 'POST', { code: data.code, name: data.name }, idempotency());
            setNotice('Location added to the selected warehouse.');
            refresh();
          }} disabled={!writable}>
            <div className="form-grid">
              <Field label="Warehouse"><select name="warehouse" required><option value="">Choose warehouse</option>{activeWarehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
              <Field label="Location code"><input name="code" required maxLength={40} /></Field>
              <Field label="Location name"><input name="name" required maxLength={120} /></Field>
            </div>
            <button className="button">Add location</button>
          </Form>
        </section>
        <section className="panel inventory-panel">
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead><tr><th>Code</th><th>Name</th><th>Warehouse</th><th>Status</th></tr></thead>
              <tbody>
                {locations.map((location: any) => (
                  <tr key={location.id}><td>{location.code}</td><td>{location.name}</td><td>{warehouseName(location.warehouse_id)}</td><td>{location.status || 'active'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {!locations.length && <p className="inventory-empty">No storage locations are configured.</p>}
        </section>
      </>
    );
    if (view === 'settings') return (
      <>
        <div className="inventory-list-head"><div><h2>Inventory Settings</h2><p>Supported configuration is limited to warehouses, locations and shared product reorder points.</p></div></div>
        <div className="inventory-overview-grid">
          <section className="panel">
            <h3>Supported</h3>
            <p>Warehouse and location records, product stock tracking, reorder points, movements and stock counts.</p>
            <button className="secondary-button" onClick={() => go('warehouses')}>Manage warehouses</button>
          </section>
          <section className="panel">
            <h3>Not provided by the backend</h3>
            <p>Operation types, lots or serial numbers, manufacturing, quality control, scrap, barcode hardware, multi-step routes and inventory valuation policies are not implemented. They are not shown as working settings.</p>
            <p className="inventory-note">Reference purchase prices are not accounting valuation. Journal entries remain in Accounting and are never created by this workspace.</p>
          </section>
        </div>
      </>
    );
    return (
      <>
        <div className="inventory-list-head"><div><h2>Warehouses</h2><p>Warehouses and their locations are the authoritative stock locations used by every operation.</p></div><span className="inventory-record-count">{(warehouses.data || []).length} warehouses</span></div>
        <section className="panel">
          <h3>New warehouse</h3>
          <Form submit={async (data) => {
            await api('/inventory/warehouses', 'POST', { code: data.code, name: data.name, address: data.address, status: 'active' }, idempotency());
            setNotice('Warehouse created.');
            refresh();
          }} disabled={!writable}>
            <div className="form-grid">
              <Field label="Short code"><input name="code" required maxLength={20} /></Field>
              <Field label="Warehouse name"><input name="name" required maxLength={120} /></Field>
              <Field label="Address"><input name="address" maxLength={300} /></Field>
            </div>
            <button className="button">Create warehouse</button>
          </Form>
        </section>
        <section className="panel inventory-panel">
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead><tr><th>Code</th><th>Name</th><th>Address</th><th>Locations</th><th>Status</th><th>Revision</th><th>Action</th></tr></thead>
              <tbody>
                {(warehouses.data || []).map((warehouse: any) => (
                  <tr key={warehouse.id}>
                    <td>{warehouse.code}</td><td>{warehouse.name}</td><td>{warehouse.address || '—'}</td>
                    <td>{locations.filter((location: any) => location.warehouse_id === warehouse.id).length}</td>
                    <td>{warehouse.status}</td><td>{String(warehouse.revision || '').slice(0, 10)}</td>
                    <td>{writable && <button className="secondary-button" onClick={() => setEditWarehouse(warehouse)}>Edit</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!(warehouses.data || []).length && <p className="inventory-empty">No warehouses are configured. Add one before posting stock.</p>}
        </section>
        {editWarehouse && (
          <section className="panel">
            <h3>Edit {editWarehouse.name}</h3>
            <Form submit={async (data) => {
              await api('/inventory/warehouses/' + editWarehouse.id, 'PATCH', {
                expected_revision: editWarehouse.revision,
                warehouse: { code: data.code, name: data.name, address: data.address, status: data.status },
              }, idempotency());
              setNotice('Warehouse updated.');
              setEditWarehouse(null);
              refresh();
            }} disabled={!writable}>
              <div className="form-grid">
                <Field label="Short code"><input name="code" required maxLength={20} defaultValue={editWarehouse.code} /></Field>
                <Field label="Warehouse name"><input name="name" required maxLength={120} defaultValue={editWarehouse.name} /></Field>
                <Field label="Address"><input name="address" maxLength={300} defaultValue={editWarehouse.address || ''} /></Field>
                <Field label="Status"><select name="status" defaultValue={editWarehouse.status}><option value="active">Active</option><option value="archived">Archived</option></select></Field>
              </div>
              <div className="inventory-action-grid">
                <button className="button">Save warehouse</button>
                <button type="button" className="secondary-button" onClick={() => setEditWarehouse(null)}>Keep unchanged</button>
              </div>
            </Form>
          </section>
        )}
      </>
    );
  }

  const sectionViews = viewsForSection[section] || [];
  const showSectionTabs = sectionViews.length > 1;

  return (
    <div className="inventory-app">
      <header className="inventory-app-head">
        <div>
          <span className="eyebrow">AfriCore Inventory</span>
          <h1>Warehouse operations</h1>
          <p>Shared stock authority for Sales, Commerce, POS and Procurement.</p>
        </div>
        <div className="inventory-app-badges">
          <span className="inventory-pill">{writable ? 'Manager operations' : 'Read-only review'}</span>
          <span className="inventory-pill muted">{services.includes('inventory') ? 'Inventory service active' : 'Service access required'}</span>
        </div>
      </header>
      <nav className="inventory-module-nav" aria-label="Inventory modules">
        {[
          ['dashboard', 'Overview', 'home'],
          ['operations', 'Operations', 'box'],
          ['products', 'Products', 'tag'],
          ['reporting', 'Reporting', 'chart'],
          ['configuration', 'Configuration', 'settings'],
        ].map(([value, label, icon]) => (
          <button key={value} aria-current={section === value ? 'page' : undefined} onClick={() => go(defaultViewForSection[value])}>
            <Icon name={icon as any} /> {label}
          </button>
        ))}
      </nav>
      {showSectionTabs && <SectionTabs views={sectionViews} />}
      {notice && <p className="alert" role="status">{notice}</p>}
      {error && <p className="alert error" role="alert">{error}</p>}
      {loading && !overview && <p role="status">Loading authorized inventory records…</p>}
      {view === 'overview' && <Overview />}
      {view === 'receipts' && <ReceiptsView />}
      {view === 'deliveries' && <DeliveriesView />}
      {view === 'transfers' && <TransfersView />}
      {view === 'counts' && <CountsView />}
      {view === 'replenishment' && (
        <>
          <div className="inventory-list-head"><div><h2>Replenishment</h2><p>Quality workflow suggestions and low-stock products. Planning incoming stock never places a supplier order.</p></div></div>
          <ReplenishmentReview api={api} scope={scope} warehouses={warehouses} writable={writable} />
          <StockTable rows={products.filter((product) => product.low_stock)} showLow={false} />
        </>
      )}
      {view === 'stock' && (productId ? <ProductDocument id={productId} /> : <StockTable rows={products} />)}
      {['movements', 'reservations', 'incoming', 'detailed'].includes(view) && <InventoryReports />}
      {['warehouses', 'locations', 'settings'].includes(view) && <ConfigurationView />}
    </div>
  );
}
