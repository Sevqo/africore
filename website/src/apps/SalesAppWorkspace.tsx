import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Overlay } from '../components/Overlay';
import { Field, money, today, type API } from '../operations/UI';
import { QuotationPreview } from './QuotationPreview';
import { ReviewFields } from './ReviewFields';
import { SalesPriceLists } from './SalesPriceLists';
import {
  confirmedOrdersInRange,
  documentTotals,
  formatTotals,
  groupQuotations,
  invoiceForOrder,
  lineAmountMinor,
  monthGrid,
  orderIsConfirmed,
  orderIsOpenForDelivery,
  orderNeedsInvoice,
  pageOf,
  quantityValue,
  quotationInvoiceState,
  reportByCustomer,
  reportByProduct,
  reportByStatus,
  reportSeries,
  salesComparison,
  salesDashboard,
  salesSummary,
  searchOrders,
  searchQuotations,
  toMinor,
  type OrderFilter,
  type QuotationFilter,
  type SalesRecord,
} from './sales-app-model';

const currencies = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'] as const;
const views = ['list', 'kanban', 'calendar', 'graph', 'pivot'] as const;
type ViewMode = (typeof views)[number];

type Props = {
  api: API;
  scope: string;
  section?: string;
  navigate: (tab: string) => void;
  services?: string[];
  writable?: boolean;
  admin?: boolean;
};

type EditorState = { quote: SalesRecord | null; isNew: boolean; customerId?: string; opportunityId?: string } | null;
type Line = {
  key: string;
  description: string;
  quantity: string;
  price: string;
  product_id?: string;
  warehouse_id?: string;
  location_id?: string;
};

const rowsOf = (result: any): SalesRecord[] => {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.data) ? result.data : [];
};

const dateLabel = (value?: string) =>
  value
    ? new Date(value + (value.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-CA', {
        timeZone: 'Africa/Nairobi',
      })
    : '—';

const statusLabel = (value?: string) => String(value || 'unknown').replaceAll('_', ' ');

let lineSequence = 0;
const blankLine = (): Line => ({
  key: `line-${Date.now()}-${lineSequence++}`,
  description: '',
  quantity: '1',
  price: '',
});

export function SalesAppWorkspace({
  api,
  scope,
  section = 'quotations',
  navigate,
  services = [],
  writable = true,
  admin = false,
}: Props) {
  const inventoryActive = services.includes('inventory');
  const [view, setView] = useState<string>(section);
  const [mode, setMode] = useState<ViewMode>('list');
  const [quotations, setQuotations] = useState<SalesRecord[]>([]);
  const [orders, setOrders] = useState<SalesRecord[]>([]);
  const [invoices, setInvoices] = useState<SalesRecord[]>([]);
  const [customers, setCustomers] = useState<SalesRecord[]>([]);
  const [products, setProducts] = useState<SalesRecord[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorState>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [preview, setPreview] = useState<SalesRecord | null>(null);

  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('crm-opportunity');
    if (!id) return;
    let live = true;
    const quoteId = new URLSearchParams(location.search).get('sales-quotation');
    Promise.all([api('/crm/entries/' + encodeURIComponent(id) + '/history'), quoteId ? api('/sales/quotations/' + encodeURIComponent(quoteId)) : Promise.resolve(null)]).then(([result, quoteResult]) => {
      if (!live || result.entry?.kind !== 'opportunity') return;
      const quote = quoteResult?.quotation || quoteResult;
      if (quote && (quote.customer_id !== result.entry.customer_id || result.entry.quotation_id !== quote.id)) throw new Error('The quotation is not linked to this opportunity.');
      setEditor({quote:quote || null,isNew:!quote,customerId:result.entry.customer_id,opportunityId:id});
    }).catch(reason => {if (live) setError('Could not open the CRM opportunity or quotation: ' + reason.message);});
    return () => {live = false;};
  }, [api, scope]);

  useEffect(() => {
    setView(section);
    setPage(1);
    setSelected([]);
  }, [section]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    Promise.allSettled([
      api('/sales/quotations'),
      api('/records/orders?limit=100'),
      api('/records/invoices?limit=100'),
      api('/records/customers?limit=100'),
      api('/products'),
      inventoryActive ? api('/inventory/warehouses') : Promise.resolve({ data: [], locations: [] }),
    ]).then((results) => {
      if (!live) return;
      const value = (index: number) => (results[index].status === 'fulfilled' ? results[index].value : null);
      setQuotations(rowsOf(value(0)));
      setOrders(rowsOf(value(1)));
      setInvoices(rowsOf(value(2)));
      setCustomers(rowsOf(value(3)));
      setProducts(rowsOf(value(4)));
      const warehousePayload = value(5);
      setLocations([...(warehousePayload?.data || []), ...(warehousePayload?.locations || [])]);
      const failures = results
        .map((result, index) =>
          result.status === 'rejected'
            ? `${['Quotations', 'Orders', 'Invoices', 'Customers', 'Products', 'Inventory'][index]}: ${result.reason?.message || 'unavailable'}`
            : '',
        )
        .filter(Boolean);
      setError(failures[0] || '');
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [api, scope, revision, inventoryActive]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const dashboard = salesDashboard(quotations, orders, invoices);
  const comparison = salesComparison(orders, days, today());
  const currentSummary = salesSummary(comparison.current);
  const previousSummary = salesSummary(comparison.previous);
  const filteredQuotations = searchQuotations(quotations, query, customers, filter as QuotationFilter, invoices);
  const filteredOrders = searchOrders(orders, query, customers, invoices, filter as OrderFilter);
  const sortedQuotations = sortRows(
    filteredQuotations,
    mode,
    (row) => customers.find((customer) => customer.id === row.customer_id)?.name || '',
  );
  const sortedOrders = sortRows(
    filteredOrders,
    mode,
    (row) => customers.find((customer) => customer.id === row.customer_id)?.name || '',
  );

  const go = (next: string) => {
    setView(next);
    setPage(1);
    setFilter('all');
    setQuery('');
    setOrderId(null);
    setEditor(null);
    const url = new URL(location.href);
    url.searchParams.set('app', 'sales');
    url.searchParams.set('section', next);
    url.hash = 'Apps';
    history.pushState({}, '', url.toString());
    dispatchEvent(new Event('africore:app-navigation'));
  };

  const openQuotation = (quote: SalesRecord) => setEditor({ quote, isNew: false });
  const openOrder = (order: SalesRecord) => setOrderId(String(order.id));
  const selectedOrder = orderId ? orders.find((order) => order.id === orderId) || null : null;

  return (
    <div className="sales-app">
      <SalesModuleNav
        view={view}
        go={go}
        onNew={() => setEditor({ quote: null, isNew: true })}
        onOrdersFilter={(value) => {
          go('orders');
          setFilter(value);
        }}
      />
      {notice && (
        <p className="alert success sales-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {editor ? (
        <QuotationDocument
          quote={editor.quote}
          isNew={editor.isNew}
          initialCustomerId={editor.customerId}
          opportunityId={editor.opportunityId}
          api={api}
          scope={scope}
          customers={customers}
          products={products}
          locations={locations}
          inventoryActive={inventoryActive}
          writable={writable}
          onBack={() => {if (editor.opportunityId) {const url = new URL(location.href); url.searchParams.delete('crm-opportunity'); url.searchParams.delete('sales-quotation'); url.searchParams.set('app','crm'); url.searchParams.set('section','pipeline'); url.searchParams.set('crm-record',editor.opportunityId); url.hash='Apps'; window.history.pushState(null, '', url.pathname + url.search + url.hash); dispatchEvent(new Event('africore:app-navigation'));} setEditor(null);}}
          onRefresh={refresh}
          onNotify={setNotice}
          onOpenOrder={(id) => {
            setEditor(null);
            go('orders');
            setOrderId(id);
          }}
          onPreview={setPreview}
        />
      ) : selectedOrder ? (
        <OrderDocument
          order={selectedOrder}
          invoices={invoices}
          customers={customers}
          api={api}
          writable={writable}
          onBack={() => setOrderId(null)}
          onRefresh={refresh}
          onNotify={setNotice}
          navigate={navigate}
        />
      ) : view === 'quotations' ? (
        <SalesList
          title="Quotations"
          eyebrow="Sales"
          newLabel="New quotation"
          onNew={() => setEditor({ quote: null, isNew: true })}
          query={query}
          setQuery={setQuery}
          mode={mode}
          setMode={setMode}
          filter={filter}
          setFilter={setFilter}
          filters={[
            { id: 'all', label: 'All quotations' },
            { id: 'draft', label: 'Draft' },
            { id: 'shared', label: 'Sent' },
            { id: 'accepted', label: 'Accepted' },
            { id: 'converted', label: 'Converted' },
            { id: 'to_invoice', label: 'To invoice' },
            { id: 'cancelled', label: 'Cancelled' },
          ]}
          total={filteredQuotations.length}
          countLabel={`${filteredQuotations.length} quotations`}
          page={page}
          setPage={setPage}
          loading={loading}
          dashboard={dashboard}
          dashboardHandler={(target) => {
            if (target === 'to_confirm') {
              go('quotations');
              setFilter('draft');
            }
            if (target === 'to_deliver') {
              go('orders');
              setFilter('to_deliver');
            }
            if (target === 'to_invoice') {
              go('orders');
              setFilter('to_invoice');
            }
          }}
          days={days}
          setDays={setDays}
          current={currentSummary}
          previous={previousSummary}
          selection={selected}
          setSelection={setSelected}
        >
          {mode === 'list' && (
            <QuotationsTable
              rows={pageOf(sortedQuotations, page, 15).rows}
              customers={customers}
              invoices={invoices}
              selection={selected}
              setSelection={setSelected}
              onOpen={openQuotation}
              onPreview={setPreview}
            />
          )}
          {mode === 'kanban' && (
            <QuotationKanban rows={pageOf(sortedQuotations, page, 15).rows} customers={customers} onOpen={openQuotation} />
          )}
          {mode === 'calendar' && (
            <SalesCalendar
              rows={filteredQuotations}
              dateField="issue_date"
              customers={customers}
              label={(row) => row.reference || 'Quotation'}
              onOpen={openQuotation}
            />
          )}
          {mode === 'graph' && <SalesGraph rows={filteredQuotations} label={(row) => row.reference || 'Quotation'} />}
          {mode === 'pivot' && <QuotationPivot rows={filteredQuotations} customers={customers} />}
          <Pager page={page} setPage={setPage} total={sortedQuotations.length} size={15} />
        </SalesList>
      ) : view === 'orders' ? (
        <SalesList
          title="Sales orders"
          eyebrow="Orders"
          newLabel=""
          query={query}
          setQuery={setQuery}
          mode={mode}
          setMode={setMode}
          filter={filter}
          setFilter={setFilter}
          filters={[
            { id: 'all', label: 'All orders' },
            { id: 'to_deliver', label: 'To deliver' },
            { id: 'to_invoice', label: 'To invoice' },
            { id: 'confirmed', label: 'Confirmed' },
            { id: 'cancelled', label: 'Cancelled' },
          ]}
          total={filteredOrders.length}
          countLabel={`${filteredOrders.length} orders`}
          page={page}
          setPage={setPage}
          loading={loading}
          dashboard={dashboard}
          dashboardHandler={(target) => {
            if (target === 'to_confirm') go('quotations');
            if (target === 'to_deliver') setFilter('to_deliver');
            if (target === 'to_invoice') setFilter('to_invoice');
          }}
          days={days}
          setDays={setDays}
          current={currentSummary}
          previous={previousSummary}
          selection={selected}
          setSelection={setSelected}
        >
          {mode === 'list' && (
            <OrdersTable
              rows={pageOf(sortedOrders, page, 15).rows}
              customers={customers}
              invoices={invoices}
              selection={selected}
              setSelection={setSelected}
              onOpen={openOrder}
            />
          )}
          {mode === 'kanban' && (
            <OrderKanban rows={pageOf(sortedOrders, page, 15).rows} customers={customers} invoices={invoices} onOpen={openOrder} />
          )}
          {mode === 'calendar' && (
            <SalesCalendar
              rows={filteredOrders}
              dateField="issue_date"
              customers={customers}
              label={(row) => row.number || row.reference || 'Order'}
              onOpen={openOrder}
            />
          )}
          {mode === 'graph' && <SalesGraph rows={filteredOrders} label={(row) => row.number || 'Order'} />}
          {mode === 'pivot' && <OrderPivot rows={filteredOrders} customers={customers} />}
          <Pager page={page} setPage={setPage} total={sortedOrders.length} size={15} />
        </SalesList>
      ) : view === 'catalog' ? (
        <ProductSection products={products} loading={loading} navigate={navigate} />
      ) : view === 'reporting' ? (
        <ReportingSection orders={orders} invoices={invoices} customers={customers} days={days} setDays={setDays} />
      ) : (
        <ConfigurationSection
          api={api}
          admin={admin}
          products={products}
          customers={customers}
          navigate={navigate}
          onNotify={setNotice}
        />
      )}
      {preview && <QuotationPreview quotation={preview} api={api} onClose={() => setPreview(null)} />}
    </div>
  );
}

function sortRows(rows: SalesRecord[], mode: ViewMode, customerName: (row: SalesRecord) => string) {
  if (mode === 'list') {
    return [...rows].sort((a, b) =>
      String(b.created_at || b.issue_date || '').localeCompare(String(a.created_at || a.issue_date || '')),
    );
  }
  return [...rows].sort((a, b) => customerName(a).localeCompare(customerName(b)));
}

function SalesModuleNav({
  view,
  go,
  onNew,
  onOrdersFilter,
}: {
  view: string;
  go: (next: string) => void;
  onNew: () => void;
  onOrdersFilter: (filter: string) => void;
}) {
  return (
    <div className="sales-module-nav" role="navigation" aria-label="Sales application">
      <button className={view === 'quotations' ? 'active' : ''} onClick={() => go('quotations')}>
        Sales
      </button>
      <details className="sales-menu">
        <summary className={view === 'orders' ? 'active' : ''}>Orders</summary>
        <div>
          <button onClick={() => go('quotations')}>Quotations</button>
          <button onClick={() => go('orders')}>Sales Orders</button>
          <button onClick={() => onOrdersFilter('to_deliver')}>Orders to Deliver</button>
          <button onClick={() => onOrdersFilter('to_invoice')}>Orders to Invoice</button>
        </div>
      </details>
      <button className={view === 'catalog' ? 'active' : ''} onClick={() => go('catalog')}>
        Products
      </button>
      <details className="sales-menu">
        <summary className={view === 'reporting' ? 'active' : ''}>Reporting</summary>
        <div>
          <button onClick={() => go('reporting')}>Sales Analysis</button>
          <button onClick={() => go('reporting')}>Sales by Customer</button>
          <button onClick={() => go('reporting')}>Sales by Product</button>
        </div>
      </details>
      <details className="sales-menu">
        <summary className={view === 'configuration' ? 'active' : ''}>Configuration</summary>
        <div>
          <button onClick={() => go('configuration')}>Sales Settings</button>
          <button onClick={() => go('configuration')}>Price Lists</button>
          <button onClick={() => go('configuration')}>Templates</button>
        </div>
      </details>
      <span className="sales-nav-spacer" />
      <button className="sales-new" onClick={onNew}>
        New
      </button>
    </div>
  );
}

function SalesList({
  title,
  eyebrow,
  newLabel,
  onNew,
  query,
  setQuery,
  mode,
  setMode,
  filter,
  setFilter,
  filters,
  total,
  countLabel,
  page,
  setPage,
  loading,
  dashboard,
  dashboardHandler,
  days,
  setDays,
  current,
  previous,
  selection,
  setSelection,
  children,
}: {
  title: string;
  eyebrow: string;
  newLabel: string;
  onNew?: () => void;
  query: string;
  setQuery: (value: string) => void;
  mode: ViewMode;
  setMode: (value: ViewMode) => void;
  filter: string;
  setFilter: (value: string) => void;
  filters: { id: string; label: string }[];
  total: number;
  countLabel: string;
  page: number;
  setPage: (value: number) => void;
  loading: boolean;
  dashboard: { toConfirm: number; toDeliver: number; toInvoice: number };
  dashboardHandler: (target: string) => void;
  days: number;
  setDays: (value: number) => void;
  current: { orders: number; totals: Record<string, number> };
  previous: { orders: number; totals: Record<string, number> };
  selection: string[];
  setSelection: (value: string[]) => void;
  children: ReactNode;
}) {
  const currentAmount = Object.values(current.totals)[0] || 0;
  const previousAmount = Object.values(previous.totals)[0] || 0;
  const delta = previousAmount > 0 ? Math.round(((currentAmount - previousAmount) / previousAmount) * 100) : null;
  return (
    <section className="sales-list">
      <div className="sales-title-row">
        <div className="sales-title">
          {newLabel && onNew && (
            <button className="sales-primary" onClick={onNew}>
              {newLabel}
            </button>
          )}
          <div>
            <span className="sales-eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
        </div>
        <div className="sales-toolbar">
          <div className="sales-search">
            <Icon name="search" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search records…"
              aria-label={`Search ${title.toLowerCase()}`}
            />
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(1);
              }}
              aria-label="Filter records"
            >
              {filters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <span className="sales-count">
            {total ? `${(page - 1) * 15 + 1}–${Math.min(page * 15, total)} / ${total}` : '0 records'}
          </span>
          <div className="sales-view-switch" role="group" aria-label="View">
            {views.map((item) => (
              <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)} title={`${item} view`}>
                {item === 'list' ? 'List' : item === 'kanban' ? 'Kanban' : item === 'calendar' ? 'Calendar' : item === 'graph' ? 'Graph' : 'Pivot'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="sales-pulse" aria-label="Sales performance">
        <button onClick={() => dashboardHandler('to_confirm')} className="pulse-cell confirm">
          <strong>{dashboard.toConfirm}</strong>
          <span>To Confirm</span>
        </button>
        <button onClick={() => dashboardHandler('to_deliver')} className="pulse-cell deliver">
          <strong>{dashboard.toDeliver}</strong>
          <span>To Deliver</span>
        </button>
        <button onClick={() => dashboardHandler('to_invoice')} className="pulse-cell invoice">
          <strong>{dashboard.toInvoice}</strong>
          <span>To Invoice</span>
        </button>
        <div className="pulse-spacer" />
        <label className="sales-range">
          <span>Period</span>
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
        <div className="pulse-metric">
          <span>Sales Orders</span>
          <strong>{current.orders}</strong>
          {delta !== null && (
            <small>
              {delta > 0 ? '+' : ''}
              {delta}% vs previous
            </small>
          )}
          {delta === null && <small>No previous-period orders</small>}
        </div>
        <div className="pulse-metric">
          <span>Sales Revenue</span>
          <strong>{formatTotals(current.totals, money)}</strong>
          <small>Confirmed order value in period</small>
        </div>
      </div>
      <div className="sales-active-filter">
        <span className="badge">{filters.find((item) => item.id === filter)?.label || 'All records'}</span>
        {query && <span className="badge">Search: {query}</span>}
        {selection.length > 0 && (
          <span className="sales-selection">
            {selection.length} selected
            <button onClick={() => setSelection([])}>Clear</button>
          </span>
        )}
        <span className="sales-coverage">
          {countLabel}. Records are limited to the latest 100 per API page; totals describe loaded records only.
        </span>
      </div>
      {loading ? (
        <p className="sales-empty" role="status">
          Loading sales records…
        </p>
      ) : total === 0 ? (
        <div className="sales-empty">
          <Icon name="document" />
          <h3>No records match this view</h3>
          <p>Change the search, filter or period. No placeholder opportunities or amounts are shown.</p>
        </div>
      ) : (
        <div className="sales-table-wrap">{children}</div>
      )}
    </section>
  );
}

function Pager({ page, setPage, total, size }: { page: number; setPage: (value: number) => void; total: number; size: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="sales-pager">
      <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
        <Icon name="left" />
      </button>
      <span>
        {page} / {pages}
      </span>
      <button disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
        <Icon name="right" />
      </button>
    </div>
  );
}

function QuotationsTable({
  rows,
  customers,
  invoices,
  selection,
  setSelection,
  onOpen,
  onPreview,
}: {
  rows: SalesRecord[];
  customers: SalesRecord[];
  invoices: SalesRecord[];
  selection: string[];
  setSelection: (value: string[]) => void;
  onOpen: (row: SalesRecord) => void;
  onPreview: (row: SalesRecord) => void;
}) {
  const toggle = (id: string) =>
    setSelection(selection.includes(id) ? selection.filter((value) => value !== id) : [...selection, id]);
  return (
    <table className="sales-table">
      <thead>
        <tr>
          <th className="check">
            <input
              type="checkbox"
              aria-label="Select all loaded quotations"
              checked={rows.length > 0 && rows.every((row) => selection.includes(row.id))}
              onChange={(event) => setSelection(event.target.checked ? rows.map((row) => row.id) : [])}
            />
          </th>
          <th>Number</th>
          <th>Issue date</th>
          <th>Customer</th>
          <th className="num">Total</th>
          <th>Status</th>
          <th>Invoice status</th>
          <th>Activities</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((quotation) => {
          const customer = customers.find((row) => row.id === quotation.customer_id);
          return (
            <tr key={quotation.id} onClick={() => onOpen(quotation)}>
              <td className="check" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select ${quotation.reference}`}
                  checked={selection.includes(quotation.id)}
                  onChange={() => toggle(quotation.id)}
                />
              </td>
              <td>
                <button className="sales-link" onClick={() => onOpen(quotation)}>
                  {quotation.reference}
                </button>
              </td>
              <td>{dateLabel(quotation.issue_date)}</td>
              <td>{customer?.name || 'Shared customer'}</td>
              <td className="num">{money(quotation.total_minor, quotation.currency || 'KES')}</td>
              <td>
                <span className={`sales-pill status-${quotation.status}`}>{statusLabel(quotation.status)}</span>
              </td>
              <td>{quotationInvoiceState(quotation, invoices)}</td>
              <td>
                <button
                  className="sales-ghost"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPreview(quotation);
                  }}
                >
                  Preview
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function OrdersTable({
  rows,
  customers,
  invoices,
  selection,
  setSelection,
  onOpen,
}: {
  rows: SalesRecord[];
  customers: SalesRecord[];
  invoices: SalesRecord[];
  selection: string[];
  setSelection: (value: string[]) => void;
  onOpen: (row: SalesRecord) => void;
}) {
  const toggle = (id: string) =>
    setSelection(selection.includes(id) ? selection.filter((value) => value !== id) : [...selection, id]);
  return (
    <table className="sales-table">
      <thead>
        <tr>
          <th className="check">
            <input
              type="checkbox"
              aria-label="Select all loaded orders"
              checked={rows.length > 0 && rows.every((row) => selection.includes(row.id))}
              onChange={(event) => setSelection(event.target.checked ? rows.map((row) => row.id) : [])}
            />
          </th>
          <th>Number</th>
          <th>Order date</th>
          <th>Promised delivery</th>
          <th>Customer</th>
          <th className="num">Total</th>
          <th>Status</th>
          <th>Invoice status</th>
          <th>Fulfillment</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((order) => {
          const customer = customers.find((row) => row.id === order.customer_id);
          const invoice = invoiceForOrder(invoices, order.id);
          return (
            <tr key={order.id} onClick={() => onOpen(order)}>
              <td className="check" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select ${order.number || order.reference}`}
                  checked={selection.includes(order.id)}
                  onChange={() => toggle(order.id)}
                />
              </td>
              <td>
                <button className="sales-link" onClick={() => onOpen(order)}>
                  {order.number || order.reference || 'Order'}
                </button>
              </td>
              <td>{dateLabel(order.issue_date || order.created_at)}</td>
              <td>{dateLabel(order.due_date)}</td>
              <td>{customer?.name || 'Shared customer'}</td>
              <td className="num">{money(order.total_minor, order.currency || 'KES')}</td>
              <td>
                <span className={`sales-pill status-${order.status}`}>{statusLabel(order.status)}</span>
              </td>
              <td>{invoice ? statusLabel(invoice.status) : orderNeedsInvoice(order, invoices) ? 'To invoice' : 'Nothing to invoice'}</td>
              <td>{statusLabel(order.fulfillment_status)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function QuotationKanban({ rows, customers, onOpen }: { rows: SalesRecord[]; customers: SalesRecord[]; onOpen: (row: SalesRecord) => void }) {
  return (
    <div className="sales-kanban">
      {rows.map((quotation) => {
        const customer = customers.find((row) => row.id === quotation.customer_id);
        return (
          <button key={quotation.id} className="sales-kanban-card" onClick={() => onOpen(quotation)}>
            <span className={`sales-pill status-${quotation.status}`}>{statusLabel(quotation.status)}</span>
            <strong>{quotation.reference}</strong>
            <span>{customer?.name || 'Shared customer'}</span>
            <span className="sales-kanban-amount">{money(quotation.total_minor, quotation.currency || 'KES')}</span>
            <small>{dateLabel(quotation.issue_date)}</small>
          </button>
        );
      })}
    </div>
  );
}

function OrderKanban({
  rows,
  customers,
  invoices,
  onOpen,
}: {
  rows: SalesRecord[];
  customers: SalesRecord[];
  invoices: SalesRecord[];
  onOpen: (row: SalesRecord) => void;
}) {
  return (
    <div className="sales-kanban">
      {rows.map((order) => {
        const customer = customers.find((row) => row.id === order.customer_id);
        return (
          <button key={order.id} className="sales-kanban-card" onClick={() => onOpen(order)}>
            <span className={`sales-pill status-${order.status}`}>{statusLabel(order.status)}</span>
            <strong>{order.number || order.reference}</strong>
            <span>{customer?.name || 'Shared customer'}</span>
            <span className="sales-kanban-amount">{money(order.total_minor, order.currency || 'KES')}</span>
            <small>{invoiceForOrder(invoices, order.id)?.status || order.payment_status || 'No invoice'}</small>
          </button>
        );
      })}
    </div>
  );
}

function SalesCalendar({
  rows,
  dateField,
  customers,
  label,
  onOpen,
}: {
  rows: SalesRecord[];
  dateField: string;
  customers: SalesRecord[];
  label: (row: SalesRecord) => string;
  onOpen: (row: SalesRecord) => void;
}) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const shifted = (offset: number) => {
    const date = new Date(month + '-01T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + offset);
    setMonth(date.toISOString().slice(0, 7));
  };
  return (
    <div className="sales-calendar">
      <div className="sales-calendar-head">
        <button onClick={() => shifted(-1)} aria-label="Previous month">
          <Icon name="left" />
        </button>
        <strong>{new Date(month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
        <button onClick={() => shifted(1)} aria-label="Next month">
          <Icon name="right" />
        </button>
      </div>
      <div className="sales-calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <span key={day} className="sales-calendar-weekday">
            {day}
          </span>
        ))}
        {monthGrid(month, rows, dateField).map((day) => (
          <div key={day.date} className={`sales-calendar-day ${day.inMonth ? '' : 'outside'}`}>
            <span>{Number(day.date.slice(8))}</span>
            {day.records.slice(0, 3).map((record) => (
              <button key={record.id} onClick={() => onOpen(record)} title={customers.find((c) => c.id === record.customer_id)?.name}>
                {label(record)}
              </button>
            ))}
            {day.records.length > 3 && <small>+{day.records.length - 3} more</small>}
          </div>
        ))}
      </div>
      {rows.length === 0 && <p className="sales-empty">No dated records in this filtered view.</p>}
    </div>
  );
}

function SalesGraph({ rows, label }: { rows: SalesRecord[]; label: (row: SalesRecord) => string }) {
  const series = reportSeries(rows, 12);
  const max = Math.max(1, ...series.map((item) => item.value));
  return (
    <div className="sales-graph">
      <div className="sales-chart">
        {series.map((item) => (
          <div key={item.month} className="sales-chart-column" title={`${item.orders} orders`}>
            <span>{money(item.value, 'KES')}</span>
            <div style={{ height: `${Math.max(4, Math.round((item.value / max) * 100))}%` }} />
            <small>{new Date(item.month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short' })}</small>
          </div>
        ))}
      </div>
      <p className="sales-note">
        Order value by issue month for loaded records. This is document value, not recognized revenue or collected cash.
      </p>
      <details>
        <summary>Records in graph</summary>
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              {label(row)} · {dateLabel(row.issue_date)} · {money(row.total_minor, row.currency || 'KES')}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function QuotationPivot({ rows, customers }: { rows: SalesRecord[]; customers: SalesRecord[] }) {
  const [group, setGroup] = useState('customer');
  return (
    <div className="sales-pivot">
      <label className="sales-range">
        <span>Group by</span>
        <select value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="customer">Customer</option>
          <option value="status">Status</option>
          <option value="issue_date">Issue date</option>
        </select>
      </label>
      <PivotTable
        rows={groupQuotations(rows, customers, group).map(([key, records]) => ({
          group: key,
          records: records.length,
          value: money(
            records.reduce((sum, row) => sum + Number(row.total_minor || 0), 0),
            records[0]?.currency || 'KES',
          ),
        }))}
      />
    </div>
  );
}

function OrderPivot({ rows, customers }: { rows: SalesRecord[]; customers: SalesRecord[] }) {
  const [group, setGroup] = useState('customer');
  const groups = new Map<string, SalesRecord[]>();
  for (const order of rows) {
    const key =
      group === 'customer'
        ? customers.find((row) => row.id === order.customer_id)?.name || 'Shared customer'
        : group === 'status'
          ? order.status
          : String(order.issue_date || 'No issue date');
    groups.set(key, [...(groups.get(key) || []), order]);
  }
  return (
    <div className="sales-pivot">
      <label className="sales-range">
        <span>Group by</span>
        <select value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="customer">Customer</option>
          <option value="status">Status</option>
          <option value="issue_date">Issue date</option>
        </select>
      </label>
      <PivotTable
        rows={[...groups.entries()].map(([key, records]) => ({
          group: key,
          records: records.length,
          value: money(
            records.reduce((sum, row) => sum + Number(row.total_minor || 0), 0),
            records[0]?.currency || 'KES',
          ),
        }))}
      />
    </div>
  );
}

function QuotationDocument({
  quote,
  isNew,
  initialCustomerId,
  opportunityId,
  api,
  scope,
  customers,
  products,
  locations,
  inventoryActive,
  writable,
  onBack,
  onRefresh,
  onNotify,
  onOpenOrder,
  onPreview,
}: {
  quote: SalesRecord | null;
  isNew: boolean;
  initialCustomerId?: string;
  opportunityId?: string;
  api: API;
  scope: string;
  customers: SalesRecord[];
  products: SalesRecord[];
  locations: any[];
  inventoryActive: boolean;
  writable: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onNotify: (message: string) => void;
  onOpenOrder: (id: string) => void;
  onPreview: (quote: SalesRecord) => void;
}) {
  const [current, setCurrent] = useState<SalesRecord | null>(quote);
  const [history, setHistory] = useState<SalesRecord[]>([]);
  const [tab, setTab] = useState<'lines' | 'other' | 'notes'>('lines');
  const [customerId, setCustomerId] = useState(quote?.customer_id || initialCustomerId || '');
  const [currency, setCurrency] = useState(quote?.currency || 'KES');
  const [issueDate, setIssueDate] = useState(quote?.issue_date || today());
  const [dueDate, setDueDate] = useState(quote?.due_date || today());
  const [validUntil, setValidUntil] = useState(quote?.valid_until || today());
  const [discount, setDiscount] = useState(
    quote ? String(Number(quote.discount_minor || 0) / (['UGX', 'RWF'].includes(quote.currency) ? 1 : 100)) : '0',
  );
  const [taxPercent, setTaxPercent] = useState(quote ? String(Number(quote.tax_bps || 0) / 100) : '0');
  const [terms, setTerms] = useState(quote?.terms || '');
  const [notes, setNotes] = useState(quote?.notes || '');
  const [paymentInstructions, setPaymentInstructions] = useState(quote?.payment_instructions || '');
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseReason, setReviseReason] = useState('');
  const [approvalHint, setApprovalHint] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [orderLink, setOrderLink] = useState<string>(quote?.order_id || '');

  const status = current?.status || (isNew ? 'draft' : '');
  const editable = writable && (isNew || status === 'draft');

  useEffect(() => {
    if (!quote?.id) {
      setLines([blankLine()]);
      return;
    }
    let live = true;
    api(`/sales/quotations/${quote.id}`)
      .then((result) => {
        if (!live) return;
        const record = result?.quotation || result;
        setCurrent(record);
        hydrate(record);
      })
      .catch((reason) => setError(reason.message));
    return () => {
      live = false;
    };
  }, [api, quote?.id]);

  useEffect(() => {
    if (!current?.id) return;
    let live = true;
    api(`/sales/quotations/${current.id}/history`)
      .then((result) => {
        if (live) setHistory(rowsOf(result).reverse());
      })
      .catch(() => {
        if (live) setHistory([]);
      });
    return () => {
      live = false;
    };
  }, [api, current?.id, current?.version]);

  function hydrate(record: SalesRecord) {
    setCustomerId(record.customer_id || '');
    setCurrency(record.currency || 'KES');
    setIssueDate(record.issue_date || today());
    setDueDate(record.due_date || today());
    setValidUntil(record.valid_until || record.due_date || today());
    setDiscount(
      String(Number(record.discount_minor || 0) / (['UGX', 'RWF'].includes(record.currency) ? 1 : 100)),
    );
    setTaxPercent(String(Number(record.tax_bps || 0) / 100));
    setTerms(record.terms || '');
    setNotes(record.notes || '');
    setPaymentInstructions(record.payment_instructions || '');
    setLines(
      (record.items || []).length
        ? record.items.map((item: any, index: number) => ({
            key: `saved-${index}-${item.product_id || item.description}`,
            description: item.description || '',
            quantity: String(item.quantity ?? '1'),
            price: String(Number(item.unit_price_minor || 0) / (['UGX', 'RWF'].includes(record.currency) ? 1 : 100)),
            product_id: item.product_id,
            warehouse_id: item.warehouse_id,
            location_id: item.location_id,
          }))
        : [blankLine()],
    );
    setOrderLink(record.order_id || '');
  }

  const selectedCustomer = customers.find((row) => row.id === customerId);
  const computedLines = lines.map((line) => ({
    quantity: quantityValue(line.quantity),
    priceMinor: toMinor(line.price, currency),
  }));
  const validLines =
    computedLines.length > 0 &&
    computedLines.every((line) => Number.isFinite(line.quantity) && line.quantity > 0 && Number.isFinite(line.priceMinor) && line.priceMinor >= 0);
  const totals = validLines
    ? documentTotals(computedLines, toMinor(discount, currency), Math.round(Number(taxPercent || 0) * 100))
    : { subtotal: 0, discount: 0, tax: 0, total: 0 };
  const totalsValid = validLines && lines.every((line) => line.description.trim().length > 0);

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((rows) => rows.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const removeLine = (key: string) =>
    setLines((rows) => (rows.length > 1 ? rows.filter((line) => line.key !== key) : rows));

  function buildDocument() {
    return {
      customer_id: customerId,
      currency,
      items: lines.map((line) => ({
        description: line.description.trim(),
        quantity: Number(line.quantity),
        unit_price_minor: toMinor(line.price, currency),
        ...(line.product_id ? { product_id: line.product_id } : {}),
        ...(inventoryActive && line.warehouse_id ? { warehouse_id: line.warehouse_id } : {}),
        ...(inventoryActive && line.location_id ? { location_id: line.location_id } : {}),
      })),
      discount_minor: toMinor(discount, currency),
      tax_bps: Math.round(Number(taxPercent || 0) * 100),
      issue_date: issueDate,
      due_date: dueDate,
      valid_until: validUntil,
      terms,
      notes,
      payment_instructions: paymentInstructions,
    };
  }

  function validate() {
    if (!customerId) return 'Select an existing customer. Quotations link to canonical customer records.';
    if (!validLines) return 'Every line needs a description, a positive quantity and a non-negative unit price.';
    if (!Number.isFinite(toMinor(discount, currency)) || toMinor(discount, currency) < 0)
      return 'Discount must be a non-negative amount.';
    if (!Number.isFinite(Number(taxPercent)) || Number(taxPercent) < 0 || Number(taxPercent) > 100)
      return 'Tax must be a percentage between 0 and 100.';
    if (toMinor(discount, currency) > totals.subtotal) return 'Discount cannot exceed the untaxed subtotal.';
    return '';
  }

  async function save() {
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError('');
    let savedId = '';
    try {
      if (!current?.id) {
        const result = await api('/sales/quotations', 'POST', buildDocument());
        const id = result?.id || result?.quotation?.id;
        if (id) {
          savedId = id;
          setCurrent(result?.quotation || result);
          const record = await api(`/sales/quotations/${id}`);
          setCurrent(record?.quotation || record);
          hydrate(record?.quotation || record);
          setOrderLink((record?.quotation || record)?.order_id || '');
          if (opportunityId) {
            const url = new URL(location.href); url.searchParams.delete('crm-opportunity'); window.history.replaceState(null, '', url.pathname + url.search + url.hash);
            try {
              const parent = (await api('/crm/entries/' + encodeURIComponent(opportunityId) + '/history')).entry;
              if (parent.customer_id !== customerId) throw new Error('The quotation customer differs from the opportunity customer.');
              const {id: _id, version, created_at: _created, updated_at: _updated, ...entry} = parent;
              await api('/crm/entries/' + encodeURIComponent(opportunityId), 'PATCH', {expected_version:version,entry:{...entry,quotation_id:id}});
            } catch (reason) {
              setError('Quotation saved, but it could not be linked to CRM: ' + (reason as Error).message + ' Link this existing quotation from the opportunity.');
            }
          }
        }
        onNotify('Quotation saved.');
      } else {
        const result = await api(`/sales/quotations/${current.id}`, 'PATCH', {
          expected_version: current.version,
          document: buildDocument(),
        });
        const record = result?.quotation || result;
        if (record?.id) {
          setCurrent(record);
          hydrate(record);
        } else {
          const fresh = await api(`/sales/quotations/${current.id}`);
          setCurrent(fresh?.quotation || fresh);
        }
        onNotify('Quotation saved.');
      }
      onRefresh();
    } catch (reason) {
      setError(savedId ? 'Quotation was saved, but the follow-up read failed. Reopen quotation ' + savedId + ' before retrying: ' + (reason as Error).message : (reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function action(name: string, extra: Record<string, any> = {}) {
    if (!current?.id) return null;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/sales/quotations/${current.id}/action`, 'POST', {
        action: name,
        expected_version: current.version,
        ...extra,
      });
      const fresh = await api(`/sales/quotations/${current.id}`);
      const record = fresh?.quotation || fresh;
      setCurrent(record);
      hydrate(record);
      onRefresh();
      return result;
    } catch (reason) {
      const message = (reason as Error).message;
      if (/approval/i.test(message)) setApprovalHint(true);
      setError(message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (status === 'draft') {
      const result = await action('mark_shared');
      if (result) onNotify('Quotation marked as sent. No message was delivered.');
    } else {
      onNotify('This quotation is already shared.');
    }
    setSendOpen(false);
  }

  async function confirm() {
    setError('');
    setBusy(true);
    try {
      const approvalId =
        (document.querySelector('select[name="approval"]') as HTMLSelectElement | null)?.value || undefined;
      let version = current?.version;
      let nextStatus = status;
      if (nextStatus === 'draft' || nextStatus === 'shared') {
        const accepted = await api(`/sales/quotations/${current?.id}/action`, 'POST', {
          action: 'accept',
          expected_version: version,
          ...(approvalId ? { approval_id: approvalId } : {}),
        });
        version = accepted?.version || accepted?.quotation?.version || version;
        nextStatus = 'accepted';
      }
      if (nextStatus === 'accepted') {
        const converted = await api(`/sales/quotations/${current?.id}/action`, 'POST', {
          action: 'convert',
          expected_version: version,
        });
        const orderId = converted?.order_id || converted?.order?.id;
        if (orderId) {
          setOrderLink(orderId);
          await api(`/records/orders/${orderId}`, 'PATCH', { status: 'awaiting_payment' });
        }
      }
      const fresh = await api(`/sales/quotations/${current?.id}`);
      setCurrent(fresh?.quotation || fresh);
      hydrate(fresh?.quotation || fresh);
      onRefresh();
      onNotify('Quotation confirmed and converted to a shared sales order.');
    } catch (reason) {
      const message = (reason as Error).message;
      if (/approval/i.test(message)) setApprovalHint(true);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelQuotation() {
    if (!window.confirm('Cancel this quotation? The retained revision history remains available.')) return;
    const result = await action('cancel');
    if (result) onNotify('Quotation cancelled.');
  }

  async function revise() {
    if (reviseReason.trim().length < 8) {
      setError('Give a revision reason of at least 8 characters.');
      return;
    }
    const result = await action('revise', { reason: reviseReason.trim() });
    if (result) {
      setReviseOpen(false);
      setReviseReason('');
      onNotify('Quotation revised to draft.');
    }
  }


  return (
    <div className="sales-document">
      <div className="sales-doc-top">
        <button className="sales-ghost" onClick={onBack}>
          <Icon name="left" /> Quotations
        </button>
        <div className="sales-breadcrumb">
          <span>Sales</span>
          <Icon name="right" />
          <span>Quotations</span>
          <Icon name="right" />
          <strong>{current?.reference || 'New quotation'}</strong>
        </div>
        <div className="sales-doc-actions">
          {editable && (
            <button className="sales-primary" disabled={busy} onClick={save}>
              Save
            </button>
          )}
          {status === 'draft' && writable && (
            <button disabled={busy} onClick={() => setSendOpen(true)}>
              Send
            </button>
          )}
          {current && (
            <button disabled={busy} onClick={() => onPreview(current)}>
              Preview
            </button>
          )}
          {['draft', 'shared', 'accepted'].includes(status) && writable && (
            <button className="sales-primary" disabled={busy} onClick={confirm}>
              Confirm
            </button>
          )}
          {['shared', 'accepted'].includes(status) && writable && (
            <button disabled={busy} onClick={() => setReviseOpen(true)}>
              Revise
            </button>
          )}
          {status !== 'converted' && status !== 'cancelled' && !isNew && writable && (
            <button className="sales-danger" disabled={busy} onClick={cancelQuotation}>
              Cancel
            </button>
          )}
          {orderLink && (
            <button className="sales-primary" onClick={() => onOpenOrder(orderLink)}>
              Open sales order
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {approvalHint && (
        <div className="alert info">
          <strong>Discount approval required.</strong> This document exceeds the workspace discount threshold. Ask an
          eligible reviewer to approve the exact quotation version, then confirm again.
          {current && (
            <ReviewFields
              api={api}
              scope={scope}
              action="sales_discount"
              resourceId={current.id}
            />
          )}
        </div>
      )}
      <div className="sales-doc-grid">
        <article className="sales-doc-main panel">
          <header className="sales-doc-identity">
            <div>
              <span className="sales-eyebrow">Quotation</span>
              <h1>{current?.reference || 'New quotation'}</h1>
              <div className="sales-doc-pipeline">
                {['draft', 'shared', 'accepted', 'converted'].map((step) => (
                  <span
                    key={step}
                    className={
                      status === step ||
                      (step === 'draft' && ['draft'].includes(status)) ||
                      (step === 'shared' && ['shared', 'accepted', 'converted'].includes(status)) ||
                      (step === 'accepted' && ['accepted', 'converted'].includes(status)) ||
                      (step === 'converted' && status === 'converted')
                        ? 'active'
                        : ''
                    }
                  >
                    {statusLabel(step)}
                  </span>
                ))}
              </div>
            </div>
            <span className={`sales-pill status-${status || 'draft'}`}>{statusLabel(status || 'draft')}</span>
          </header>
          <section className="sales-doc-section">
            <div className="sales-doc-two">
              <div>
                <h3>Customer</h3>
                {editable ? (
                  <div className="sales-customer-select">
                    <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                      <option value="">Select a customer…</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="sales-ghost" onClick={() => setCustomerOpen(true)}>
                      New customer
                    </button>
                  </div>
                ) : (
                  <strong>{selectedCustomer?.name || 'Shared customer'}</strong>
                )}
                {selectedCustomer && (
                  <address className="sales-address">
                    {selectedCustomer.email && <span>{selectedCustomer.email}</span>}
                    {selectedCustomer.phone && <span>{selectedCustomer.phone}</span>}
                    {selectedCustomer.address && <span>{selectedCustomer.address}</span>}
                  </address>
                )}
              </div>
              <dl className="sales-meta">
                <div>
                  <dt>Quotation date</dt>
                  <dd>
                    {editable ? (
                      <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
                    ) : (
                      dateLabel(issueDate)
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Expiration</dt>
                  <dd>
                    {editable ? (
                      <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
                    ) : (
                      dateLabel(validUntil)
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Delivery date</dt>
                  <dd>
                    {editable ? (
                      <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                    ) : (
                      dateLabel(dueDate)
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Currency</dt>
                  <dd>
                    {editable ? (
                      <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                        {currencies.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    ) : (
                      currency
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
          <div className="sales-doc-tabs" role="tablist">
            <button className={tab === 'lines' ? 'active' : ''} onClick={() => setTab('lines')}>
              Order lines
            </button>
            <button className={tab === 'other' ? 'active' : ''} onClick={() => setTab('other')}>
              Other info
            </button>
            <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
              Notes
            </button>
          </div>
          {tab === 'lines' && (
            <section className="sales-lines">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Unit</th>
                    <th className="num">Unit price</th>
                    <th className="num">Tax</th>
                    <th className="num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const product = products.find((item) => item.id === line.product_id);
                    const amount = lineAmountMinor(quantityValue(line.quantity), toMinor(line.price, currency));
                    const showWarehouse = inventoryActive && product?.track_inventory;
                    return (
                      <tr key={line.key}>
                        <td>
                          {editable ? (
                            <>
                              <input
                                value={line.description}
                                onChange={(event) => updateLine(line.key, { description: event.target.value })}
                                placeholder={`Line ${index + 1} description`}
                                aria-label={`Line ${index + 1} description`}
                              />
                              {showWarehouse && (
                                <select
                                  value={line.warehouse_id || ''}
                                  onChange={(event) => updateLine(line.key, { warehouse_id: event.target.value })}
                                  aria-label={`Line ${index + 1} warehouse`}
                                >
                                  <option value="">Default warehouse</option>
                                  {locations.map((location) => (
                                    <option key={location.id} value={location.id}>
                                      {location.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </>
                          ) : (
                            <span>{line.description}</span>
                          )}
                        </td>
                        <td>
                          {editable ? (
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={line.quantity}
                              onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                              aria-label={`Line ${index + 1} quantity`}
                            />
                          ) : (
                            line.quantity
                          )}
                        </td>
                        <td>{product?.unit || 'Units'}</td>
                        <td className="num">
                          {editable ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.price}
                              onChange={(event) => updateLine(line.key, { price: event.target.value })}
                              aria-label={`Line ${index + 1} unit price`}
                            />
                          ) : (
                            money(toMinor(line.price, currency), currency)
                          )}
                        </td>
                        <td className="num">{taxPercent}%</td>
                        <td className="num">{Number.isFinite(amount) ? money(amount, currency) : '—'}</td>
                        <td>
                          {editable && (
                            <button className="sales-ghost" onClick={() => removeLine(line.key)} aria-label="Remove line">
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {editable && (
                <div className="sales-line-actions">
                  <button onClick={() => setLines((rows) => [...rows, blankLine()])}>Add line</button>
                  <button onClick={() => setPickerOpen(true)}>Add product</button>
                  <button className="sales-ghost" onClick={() => setPickerOpen(true)}>
                    Catalog
                  </button>
                </div>
              )}
              <p className="sales-note">
                Taxes and discounts apply at document level in the authoritative document schema. Line-level discounts
                and taxes are not exposed as separate fields, so they are not simulated here.
              </p>
              <div className="sales-totals">
                <div>
                  <span>Untaxed amount</span>
                  <strong>{money(totals.subtotal, currency)}</strong>
                </div>
                <div>
                  <span>Discount</span>
                  <strong>{money(totals.discount, currency)}</strong>
                </div>
                <div>
                  <span>Tax ({taxPercent}%)</span>
                  <strong>{money(totals.tax, currency)}</strong>
                </div>
                <div className="grand">
                  <span>Total</span>
                  <strong>{money(totals.total, currency)}</strong>
                </div>
                {editable && (
                  <div className="sales-total-inputs">
                    <Field label="Discount amount">
                      <input value={discount} onChange={(event) => setDiscount(event.target.value)} inputMode="decimal" />
                    </Field>
                    <Field label="Tax %">
                      <input value={taxPercent} onChange={(event) => setTaxPercent(event.target.value)} inputMode="decimal" />
                    </Field>
                  </div>
                )}
              </div>
              {!totalsValid && <p className="sales-note">Complete every line to calculate authoritative totals.</p>}
            </section>
          )}
          {tab === 'other' && (
            <section className="sales-doc-section sales-other">
              <div className="sales-doc-two">
                <div>
                  <h3>Payment instructions</h3>
                  {editable ? (
                    <textarea
                      rows={4}
                      value={paymentInstructions}
                      onChange={(event) => setPaymentInstructions(event.target.value)}
                      maxLength={3000}
                    />
                  ) : (
                    <p>{paymentInstructions || 'No payment instructions recorded.'}</p>
                  )}
                </div>
                <div>
                  <h3>Terms and conditions</h3>
                  {editable ? (
                    <textarea rows={4} maxLength={3000} value={terms} onChange={(event) => setTerms(event.target.value)} />
                  ) : (
                    <p>{terms || 'No terms recorded.'}</p>
                  )}
                </div>
              </div>
              <dl className="sales-meta">
                <div>
                  <dt>Linked order</dt>
                  <dd>{orderLink || 'Not converted'}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{current?.version ?? 'New'}</dd>
                </div>
                <div>
                  <dt>Salesperson</dt>
                  <dd>Not exposed by the Sales API</dd>
                </div>
              </dl>
            </section>
          )}
          {tab === 'notes' && (
            <section className="sales-doc-section">
              <h3>Notes</h3>
              {editable ? (
                <textarea rows={7} maxLength={3000} value={notes} onChange={(event) => setNotes(event.target.value)} />
              ) : (
                <p>{notes || 'No notes recorded.'}</p>
              )}
              <p className="sales-note">
                Optional products and quote builder are not shown because the current quotation model does not expose
                those capabilities. No empty tabs are rendered.
              </p>
            </section>
          )}
        </article>
        <aside className="sales-activity panel">
          <div className="sales-activity-head">
            <h3>Activity</h3>
            <span className="badge">Record history</span>
          </div>
          {history.length === 0 ? (
            <p className="sales-note">
              No saved revisions are exposed yet. Activity is populated from genuine quotation revision events.
            </p>
          ) : (
            <ol className="sales-timeline">
              {history.map((entry) => (
                <li key={`${entry.quotation_version}-${entry.recorded_at}-${entry.action}`}>
                  <span className={`sales-dot action-${entry.action}`} />
                  <div>
                    <strong>{statusLabel(entry.action)}</strong>
                    <small>
                      Revision {entry.quotation_version} · {dateLabel(String(entry.recorded_at).slice(0, 10))}
                    </small>
                    {entry.actor && <small>Actor: {entry.actor}</small>}
                    {entry.reason && <p>{entry.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="sales-activity-note">
            <strong>Delivery status</strong>
            <p>
              AfriCore has no configured outbound quotation email provider. "Sent" records the quotation state; it does
              not claim a delivered message.
            </p>
          </div>
        </aside>
      </div>
      {sendOpen && (
        <Overlay onClose={() => setSendOpen(false)} portal>
          <div className="modal panel sales-dialog" role="dialog" aria-modal="true" aria-label="Send quotation">
            <h3>Mark quotation as sent</h3>
            <p>
              No outbound email or messaging channel is configured for quotations. Marking this quotation shared
              records the authoritative sales state without claiming that a message was delivered.
            </p>
            <p>
              Recipient: <strong>{selectedCustomer?.email || selectedCustomer?.name || 'No customer selected'}</strong>
            </p>
            <div className="sales-dialog-actions">
              <button onClick={() => setSendOpen(false)}>Keep draft</button>
              <button className="sales-primary" onClick={send} disabled={busy}>
                Mark as sent
              </button>
            </div>
          </div>
        </Overlay>
      )}
      {reviseOpen && (
        <Overlay onClose={() => setReviseOpen(false)} portal>
          <div className="modal panel sales-dialog" role="dialog" aria-modal="true" aria-label="Revise quotation">
            <h3>Revise quotation</h3>
            <p>The revision reason is retained in immutable quotation history.</p>
            <textarea
              rows={3}
              value={reviseReason}
              maxLength={500}
              onChange={(event) => setReviseReason(event.target.value)}
              placeholder="Reason (at least 8 characters)"
            />
            <div className="sales-dialog-actions">
              <button onClick={() => setReviseOpen(false)}>Cancel</button>
              <button className="sales-primary" onClick={revise} disabled={busy}>
                Revise to draft
              </button>
            </div>
          </div>
        </Overlay>
      )}
      {customerOpen && (
        <NewCustomerDialog
          api={api}
          onClose={() => setCustomerOpen(false)}
          onCreated={(customer) => {
            setCustomerId(customer.id);
            setCustomerOpen(false);
            onRefresh();
          }}
        />
      )}
      {pickerOpen && (
        <ProductPicker
          products={products}
          onClose={() => setPickerOpen(false)}
          onPick={(product) => {
            setLines((rows) => [
              ...rows.filter((line) => line.description.trim() || line.price),
              {
                key: `pick-${Date.now()}`,
                description: product.name,
                quantity: '1',
                price: String(Number(product.sale_price_minor || 0) / (['UGX', 'RWF'].includes(product.currency) ? 1 : 100)),
                product_id: product.id,
              },
            ]);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NewCustomerDialog({ api, onClose, onCreated }: { api: API; onClose: () => void; onCreated: (customer: SalesRecord) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const customer = await api('/records/customers', 'POST', {
        name: form.get('name'),
        type: 'business',
        email: form.get('email') || undefined,
        phone: form.get('phone') || undefined,
        address: form.get('address') || undefined,
      });
      onCreated(customer);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Overlay onClose={onClose} portal>
      <form className="modal panel sales-dialog" onSubmit={submit}>
        <h3>New customer</h3>
        <p>Creates a canonical customer record shared with CRM and Invoicing.</p>
        <Field label="Name">
          <input name="name" required maxLength={200} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" />
        </Field>
        <Field label="Phone">
          <input name="phone" />
        </Field>
        <Field label="Address">
          <textarea name="address" rows={2} />
        </Field>
        {error && <p className="alert error">{error}</p>}
        <div className="sales-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="sales-primary" disabled={busy}>
            Create customer
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function ProductPicker({ products, onClose, onPick }: { products: SalesRecord[]; onClose: () => void; onPick: (product: SalesRecord) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];
  const filtered = products.filter(
    (product) =>
      (!category || product.category === category) &&
      `${product.name || ''} ${product.sku || ''} ${product.description || ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <Overlay onClose={onClose} portal>
      <div className="modal panel sales-catalog-picker" role="dialog" aria-modal="true" aria-label="Product catalog">
        <div className="sales-dialog-head">
          <div>
            <span className="sales-eyebrow">Canonical catalog</span>
            <h3>Add products</h3>
          </div>
          <button className="sales-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="sales-toolbar">
          <div className="sales-search">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products…" />
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="sales-product-grid">
          {filtered.map((product) => (
            <button key={product.id} className="sales-product-card" onClick={() => onPick(product)}>
              <strong>{product.name}</strong>
              <span>{product.sku || 'No SKU'}</span>
              <span>{product.description || 'No description'}</span>
              <em>{money(product.sale_price_minor, product.currency || 'KES')}</em>
              <small>{product.track_inventory ? 'Stock tracked' : 'Not stock tracked'}</small>
            </button>
          ))}
          {filtered.length === 0 && <p className="sales-empty">No authorized products match this search.</p>}
        </div>
      </div>
    </Overlay>
  );
}

function OrderDocument({
  order,
  invoices,
  customers,
  api,
  writable,
  onBack,
  onRefresh,
  onNotify,
  navigate,
}: {
  order: SalesRecord;
  invoices: SalesRecord[];
  customers: SalesRecord[];
  api: API;
  writable: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onNotify: (message: string) => void;
  navigate: (tab: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const invoice = invoiceForOrder(invoices, order.id);
  const customer = customers.find((row) => row.id === order.customer_id);
  const confirmed = orderIsConfirmed(order);

  async function update(path: string, body: unknown, message: string) {
    setBusy(true);
    setError('');
    try {
      await api(path, 'PATCH', body);
      onRefresh();
      onNotify(message);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createInvoice() {
    setBusy(true);
    setError('');
    try {
      await api('/records/invoices', 'POST', {
        customer_id: order.customer_id,
        order_id: order.id,
        currency: order.currency || 'KES',
        issue_date: today(),
        due_date: order.due_date || today(),
        items: (order.items || []).map((item: any) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price_minor: item.unit_price_minor,
          ...(item.product_id ? { product_id: item.product_id } : {}),
          ...(item.warehouse_id ? { warehouse_id: item.warehouse_id } : {}),
          ...(item.location_id ? { location_id: item.location_id } : {}),
        })),
        discount_minor: order.discount_minor || 0,
        tax_bps: order.tax_bps || 0,
        notes: `Invoice for ${order.number || order.reference || 'sales order'}`,
      });
      onRefresh();
      onNotify('Draft invoice created from the linked sales order. No payment was recorded.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function issueInvoice() {
    if (!invoice) return;
    await update(`/records/invoices/${invoice.id}`, { status: 'issued' }, 'Invoice issued. Payment status remains unchanged until evidence is recorded.');
  }

  return (
    <div className="sales-document">
      <div className="sales-doc-top">
        <button className="sales-ghost" onClick={onBack}>
          <Icon name="left" /> Sales orders
        </button>
        <div className="sales-breadcrumb">
          <span>Orders</span>
          <Icon name="right" />
          <strong>{order.number || order.reference}</strong>
        </div>
        <div className="sales-doc-actions">
          {writable && order.status === 'draft' && (
            <button
              className="sales-primary"
              disabled={busy}
              onClick={() => update(`/records/orders/${order.id}`, { status: 'awaiting_payment' }, 'Order confirmed.')}
            >
              Confirm order
            </button>
          )}
          {writable && confirmed && !invoice && (
            <button disabled={busy} onClick={createInvoice}>
              Create invoice
            </button>
          )}
          {writable && invoice?.status === 'draft' && (
            <button disabled={busy} onClick={issueInvoice}>
              Issue invoice
            </button>
          )}
          {writable && ['draft', 'awaiting_payment'].includes(order.status) && (
            <button
              className="sales-danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Cancel this order? Existing records are retained.'))
                  void update(`/records/orders/${order.id}`, { status: 'cancelled' }, 'Order cancelled.');
              }}
            >
              Cancel order
            </button>
          )}
        </div>
      </div>
      {error && <p className="alert error">{error}</p>}
      <div className="sales-doc-grid">
        <article className="sales-doc-main panel">
          <header className="sales-doc-identity">
            <div>
              <span className="sales-eyebrow">Sales order</span>
              <h1>{order.number || order.reference}</h1>
              <div className="sales-smart-buttons">
                <span>
                  <strong>{invoice ? 1 : 0}</strong>
                  <small>Invoice</small>
                </span>
                <span>
                  <strong>{statusLabel(order.fulfillment_status)}</strong>
                  <small>Fulfillment</small>
                </span>
                <span>
                  <strong>{statusLabel(order.payment_status)}</strong>
                  <small>Payment evidence</small>
                </span>
              </div>
            </div>
            <span className={`sales-pill status-${order.status}`}>{statusLabel(order.status)}</span>
          </header>
          <section className="sales-doc-section sales-doc-two">
            <div>
              <h3>Customer</h3>
              <strong>{customer?.name || 'Shared customer'}</strong>
              {customer && (
                <address className="sales-address">
                  {customer.email && <span>{customer.email}</span>}
                  {customer.phone && <span>{customer.phone}</span>}
                  {customer.address && <span>{customer.address}</span>}
                </address>
              )}
            </div>
            <dl className="sales-meta">
              <div>
                <dt>Order date</dt>
                <dd>{dateLabel(order.issue_date || order.created_at)}</dd>
              </div>
              <div>
                <dt>Delivery date</dt>
                <dd>{dateLabel(order.due_date)}</dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>{order.currency}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{money(order.total_minor, order.currency || 'KES')}</dd>
              </div>
            </dl>
          </section>
          <section className="sales-doc-section">
            <h3>Order lines</h3>
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Quantity</th>
                  <th className="num">Unit price</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((item: any, index: number) => (
                  <tr key={`${item.product_id || 'line'}-${index}`}>
                    <td>{item.description}</td>
                    <td className="num">{item.quantity}</td>
                    <td className="num">{money(item.unit_price_minor, order.currency || 'KES')}</td>
                    <td className="num">
                      {money(lineAmountMinor(Number(item.quantity), Number(item.unit_price_minor)), order.currency || 'KES')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {invoice && (
            <section className="sales-doc-section sales-linked">
              <h3>Linked invoice</h3>
              <div className="sales-linked-row">
                <div>
                  <strong>{invoice.number || invoice.reference || invoice.id}</strong>
                  <span className={`sales-pill status-${invoice.status}`}>{statusLabel(invoice.status)}</span>
                </div>
                <div>
                  <span>Total {money(invoice.total_minor, invoice.currency || order.currency)}</span>
                  <span>Paid {money(invoice.paid_minor || 0, invoice.currency || order.currency)}</span>
                  <span>Outstanding {money(invoice.outstanding_minor || 0, invoice.currency || order.currency)}</span>
                </div>
                <button onClick={() => navigate('Invoices')}>Open invoices workspace</button>
              </div>
              <p className="sales-note">
                Invoice state is linked to the shared ledger. Creating an invoice never records payment; collection is
                represented only by authorized payment evidence.
              </p>
            </section>
          )}
        </article>
        <aside className="sales-activity panel">
          <div className="sales-activity-head">
            <h3>Order activity</h3>
            <span className="badge">Current record</span>
          </div>
          <dl className="sales-meta">
            <div>
              <dt>Created</dt>
              <dd>{dateLabel(order.created_at)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{statusLabel(order.status)}</dd>
            </div>
            <div>
              <dt>Fulfillment</dt>
              <dd>{statusLabel(order.fulfillment_status)}</dd>
            </div>
            <div>
              <dt>Payment status</dt>
              <dd>{statusLabel(order.payment_status)}</dd>
            </div>
            <div>
              <dt>Invoice</dt>
              <dd>{invoice ? `${invoice.number || invoice.id} · ${statusLabel(invoice.status)}` : 'Not invoiced'}</dd>
            </div>
          </dl>
          <p className="sales-note">
            The order API exposes current linked state, not a complete event stream. No fabricated activity entries are
            displayed.
          </p>
          {orderIsOpenForDelivery(order) && (
            <button onClick={() => navigate('Fulfillment')}>Open fulfillment workspace</button>
          )}
        </aside>
      </div>
    </div>
  );
}

function ProductSection({
  products,
  loading,
  navigate,
}: {
  products: SalesRecord[];
  loading: boolean;
  navigate: (tab: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<SalesRecord | null>(null);
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];
  const filtered = products.filter(
    (product) =>
      (!category || product.category === category) &&
      `${product.name || ''} ${product.sku || ''} ${product.description || ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="sales-list">
      <div className="sales-title-row">
        <div className="sales-title">
          <div>
            <span className="sales-eyebrow">Products</span>
            <h2>Authorized product catalog</h2>
          </div>
        </div>
        <div className="sales-toolbar">
          <div className="sales-search">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products…" />
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Product category">
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button onClick={() => navigate('Products')}>Open Products service</button>
        </div>
      </div>
      <p className="sales-note">
        Sales reuses the canonical Products service. Product creation and advanced editing remain in the Products
        service instead of a duplicate editor.
      </p>
      {loading ? (
        <p className="sales-empty">Loading products…</p>
      ) : (
        <div className="sales-product-layout">
          <div className="sales-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th className="num">Sales price</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id} onClick={() => setSelected(product)}>
                    <td>{product.name}</td>
                    <td>{product.sku || '—'}</td>
                    <td>{product.category || '—'}</td>
                    <td>{product.unit || 'Units'}</td>
                    <td className="num">{money(product.sale_price_minor, product.currency || 'KES')}</td>
                    <td>{product.track_inventory ? 'Tracked' : 'Not tracked'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="sales-empty">No authorized products match this view.</p>}
          </div>
          <aside className="panel sales-product-detail">
            {selected ? (
              <>
                <span className="sales-eyebrow">{selected.category || 'Product'}</span>
                <h3>{selected.name}</h3>
                <p>{selected.description || 'No description recorded.'}</p>
                <dl className="sales-meta">
                  <div>
                    <dt>SKU</dt>
                    <dd>{selected.sku || '—'}</dd>
                  </div>
                  <div>
                    <dt>Variant</dt>
                    <dd>{selected.variant || '—'}</dd>
                  </div>
                  <div>
                    <dt>Sales price</dt>
                    <dd>{money(selected.sale_price_minor, selected.currency || 'KES')}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{statusLabel(selected.status)}</dd>
                  </div>
                </dl>
                <button onClick={() => navigate('Products')}>Edit in Products service</button>
              </>
            ) : (
              <p className="sales-note">Select a product to inspect its authorized record. Stock quantities are owned by Inventory and are not fabricated here.</p>
            )}
          </aside>
        </div>
      )}
      <p className="sales-note">Sales is a read-only view of the canonical catalog. Editing stays in Products.</p>
    </section>
  );
}

function ReportingSection({
  orders,
  invoices,
  customers,
  days,
  setDays,
}: {
  orders: SalesRecord[];
  invoices: SalesRecord[];
  customers: SalesRecord[];
  days: number;
  setDays: (value: number) => void;
}) {
  const [report, setReport] = useState<'analysis' | 'customer' | 'product' | 'status'>('analysis');
  const selection = confirmedOrdersInRange(orders, days, today());
  const summary = salesSummary(selection);
  const invoiced = selection.filter((order) => invoiceForOrder(invoices, order.id));
  const byCustomer = reportByCustomer(selection, customers).slice(0, 12);
  const byProduct = reportByProduct(selection).slice(0, 15);
  const byStatus = reportByStatus(selection);
  return (
    <section className="sales-list">
      <div className="sales-title-row">
        <div className="sales-title">
          <div>
            <span className="sales-eyebrow">Reporting</span>
            <h2>Sales analysis</h2>
          </div>
        </div>
        <div className="sales-toolbar">
          <label className="sales-range">
            <span>Period</span>
            <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 365 days</option>
            </select>
          </label>
          <div className="sales-view-switch">
            {[
              ['analysis', 'Sales Analysis'],
              ['customer', 'By Customer'],
              ['product', 'By Product'],
              ['status', 'By Status'],
            ].map(([id, label]) => (
              <button key={id} className={report === id ? 'active' : ''} onClick={() => setReport(id as typeof report)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="sales-report-summary">
        <article>
          <span>Confirmed order value</span>
          <strong>{formatTotals(summary.totals, money)}</strong>
          <small>Document totals of confirmed, non-cancelled orders issued in the period.</small>
        </article>
        <article>
          <span>Confirmed orders</span>
          <strong>{summary.orders}</strong>
          <small>Order documents, not quotations.</small>
        </article>
        <article>
          <span>Average order value</span>
          <strong>{summary.orders ? money(summary.average, selection[0]?.currency || 'KES') : '—'}</strong>
          <small>Confirmed order value divided by confirmed order count.</small>
        </article>
        <article>
          <span>Orders with invoice</span>
          <strong>{invoiced.length}</strong>
          <small>Linked invoices in any non-voided state.</small>
        </article>
      </div>
      {report === 'analysis' && (
        <div className="panel sales-report-panel">
          <h3>Confirmed order value by issue month</h3>
          <SalesGraph rows={selection} label={(row) => row.number || row.reference || 'Order'} />
          <p className="sales-note">
            This reports order document value. It is not recognized revenue, invoiced value, collected cash or margin.
            Salesperson performance is unsupported because ownership is not exposed by the Sales API.
          </p>
        </div>
      )}
      {report === 'customer' && (
        <div className="panel">
          <h3>Sales by customer</h3>
          <PivotTable
            rows={byCustomer.map((row) => ({
              customer: row.name,
              orders: row.orders,
              value: money(row.value, row.currency),
            }))}
          />
          {byCustomer.length === 0 && <p className="sales-empty">No confirmed orders in this period.</p>}
        </div>
      )}
      {report === 'product' && (
        <div className="panel">
          <h3>Sales by product</h3>
          <PivotTable
            rows={byProduct.map((row) => ({
              product: row.name,
              quantity: row.quantity,
              lines: row.orders,
              value: money(row.value, row.currency),
            }))}
          />
          {byProduct.length === 0 && <p className="sales-empty">No confirmed order lines in this period.</p>}
        </div>
      )}
      {report === 'status' && (
        <div className="panel">
          <h3>Orders by status and fulfillment</h3>
          <PivotTable
            rows={byStatus.map((row) => ({
              status: row.status,
              orders: row.orders,
              value: money(row.value, row.currency),
            }))}
          />
        </div>
      )}
    </section>
  );
}

const pivotLabels: Record<string, string> = {
  group: 'Group',
  records: 'Records',
  value: 'Value',
  customer: 'Customer',
  orders: 'Orders',
  product: 'Product',
  quantity: 'Quantity',
  lines: 'Lines',
  status: 'Status',
};

function PivotTable({ rows }: { rows: Record<string, string | number>[] }) {
  if (!rows.length) return null;
  const headers = Object.keys(rows[0]);
  const numeric = new Set(['records', 'value', 'orders', 'quantity', 'lines']);
  return (
    <table className="sales-table">
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} className={numeric.has(header) ? 'num' : undefined}>
              {pivotLabels[header] || header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {headers.map((header) => (
              <td key={header} className={numeric.has(header) ? 'num' : undefined}>
                {row[header]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConfigurationSection({
  api,
  admin,
  products,
  customers,
  navigate,
  onNotify,
}: {
  api: API;
  admin: boolean;
  products: SalesRecord[];
  customers: SalesRecord[];
  navigate: (tab: string) => void;
  onNotify: (message: string) => void;
}) {
  const [templates, setTemplates] = useState<SalesRecord[]>([]);
  const [policy, setPolicy] = useState<SalesRecord | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    Promise.allSettled([api('/sales/templates'), admin ? api('/business/policy') : Promise.resolve(null)]).then(
      (results) => {
        if (!live) return;
        if (results[0].status === 'fulfilled') setTemplates(rowsOf(results[0].value));
        if (results[1].status === 'fulfilled') setPolicy(results[1].value);
        const failure = results.find((result) => result.status === 'rejected');
        if (failure && failure.status === 'rejected') setError(failure.reason?.message || '');
      },
    );
    return () => {
      live = false;
    };
  }, [api, admin]);
  return (
    <section className="sales-list">
      <div className="sales-title-row">
        <div className="sales-title">
          <div>
            <span className="sales-eyebrow">Configuration</span>
            <h2>Sales settings</h2>
          </div>
        </div>
        <div className="sales-toolbar">
          <button onClick={() => navigate('Settings')}>Open business settings</button>
        </div>
      </div>
      {error && <p className="alert error">{error}</p>}
      <div className="sales-config-grid">
        <article className="panel">
          <h3>Quotation templates</h3>
          <p>Reusable defaults are exposed by the Sales service. Create a quotation and save it as a template from the service editor.</p>
          {templates.length === 0 ? (
            <p className="sales-empty">No templates are configured.</p>
          ) : (
            <ul className="sales-config-list">
              {templates.map((template) => (
                <li key={template.id}>
                  <strong>{template.name}</strong>
                  <span>{statusLabel(template.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="panel">
          <h3>Business sales policy</h3>
          {!admin ? (
            <p className="sales-note">Only workspace owners and administrators can inspect or change sales policy.</p>
          ) : policy ? (
            <dl className="sales-meta">
              <div>
                <dt>Prepare draft invoice on confirmation</dt>
                <dd>{policy.configuration?.prepare_draft_invoice ? 'Enabled' : 'Disabled'}</dd>
              </div>
              <div>
                <dt>Discount approval threshold</dt>
                <dd>{Number(policy.configuration?.discount_approval_bps || 0) / 100}%</dd>
              </div>
              <div>
                <dt>Invoice correction approval</dt>
                <dd>{policy.configuration?.require_invoice_correction_approval ? 'Required' : 'Not required'}</dd>
              </div>
            </dl>
          ) : (
            <p className="sales-empty">Policy could not be loaded.</p>
          )}
          <button onClick={() => navigate('Settings')}>Manage policy in Settings</button>
        </article>
      </div>
      <div className="panel">
        <h3>Price lists</h3>
        <SalesPriceLists
          api={api}
          products={products}
          customers={customers}
          admin={admin}
          onChanged={() => onNotify('Price lists refreshed.')}
        />
      </div>
    </section>
  );
}


