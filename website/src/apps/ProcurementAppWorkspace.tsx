import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Field, Form, money, today, type API } from '../operations/UI';
import { DocumentAttachments } from './DocumentAttachments';
import { ProcurementEditor } from './ProcurementEditor';
import { ProcurementReports, ProcurementReplenishment } from './ProcurementReports';
import { useIdempotentAPI } from './useIdempotentAPI';
import { displayQuantity, quantityMilli } from '../../../src/inventory/quantity';
import {
  approvalCounts,
  comparisonRows,
  confirmedMetrics,
  dashboardCounts,
  defaultViewForSection,
  labelForStatus,
  lateReceipt,
  lineTotal,
  orderBillingStatus,
  orderHasOpenReceipt,
  pageCount,
  procurementViewTitles,
  procurementViews,
  purchaseHistoryForProduct,
  requestForRfq,
  sectionForView,
  viewsForSection,
  type ProcurementView,
} from './procurement-app-model';

const listTypes = [
  'request',
  'rfq',
  'order',
  'receipt',
  'bill',
  'payment',
  'credit',
  'supplier',
  'price',
  'agreement',
  'template',
] as const;
const labels: Record<string, string> = {
  request: 'purchase requests',
  rfq: 'supplier offers',
  order: 'purchase orders',
  receipt: 'receipts',
  bill: 'vendor bills',
  payment: 'payment observations',
  credit: 'supplier credits',
  supplier: 'vendors',
  price: 'vendor pricelists',
  agreement: 'purchase agreements',
  template: 'purchase templates',
};
const typeForView: Partial<Record<ProcurementView, string>> = {
  requests: 'request',
  rfqs: 'rfq',
  orders: 'order',
  receipts: 'receipt',
  bills: 'bill',
  payments: 'payment',
  credits: 'credit',
  vendors: 'supplier',
  agreements: 'agreement',
  pricelists: 'price',
  templates: 'template',
};

export function ProcurementAppWorkspace({
  api: providedApi,
  scope,
  section = 'dashboard',
  navigate,
}: {
  api: API;
  scope: string;
  section?: string;
  navigate: (tab: string) => void;
}) {
  const api = useIdempotentAPI(providedApi, scope);
  const [view, setView] = useState<ProcurementView>(() => {
    const requested = new URLSearchParams(location.search).get('view') as ProcurementView | null;
    return requested && procurementViews.includes(requested)
      ? requested
      : defaultViewForSection[section] || 'dashboard';
  });
  const [lists, setLists] = useState<Record<string, any[]>>({
    request: [],
    rfq: [],
    order: [],
    receipt: [],
    bill: [],
    payment: [],
    credit: [],
    supplier: [],
    price: [],
    agreement: [],
    template: [],
  });
  const [listMeta, setListMeta] = useState<Record<string, any>>({});
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [display, setDisplay] = useState<'list' | 'kanban'>('list');
  const [page, setPage] = useState(0);
  const [doc, setDoc] = useState<{ type: string; id: string } | null>(() => {
    const raw = new URLSearchParams(location.search).get('doc');
    if (!raw || !raw.includes(':')) return null;
    const [type, id] = raw.split(':');
    return type && id ? { type, id } : null;
  });
  const [detail, setDetail] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [docTab, setDocTab] = useState('lines');
  const [editor, setEditor] = useState<{ type: string; record?: any; source?: string } | null>(
    null,
  );
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const permissions =
    Object.values(listMeta).find((row: any) => row?.permissions)?.permissions || {};
  const writable = !!permissions.write;
  const finance = !!permissions.finance;
  const review = !!permissions.review;

  useEffect(() => {
    const timer = setTimeout(() => {
      setView((current) => {
        if (viewsForSection[section]?.includes(current)) return current;
        const next = defaultViewForSection[section] || 'dashboard';
        const url = new URL(location.href);
        url.searchParams.set('view', next);
        history.replaceState(history.state, '', url);
        return next;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [section]);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(location.search);
      const requested = params.get('view') as ProcurementView | null;
      if (requested && procurementViews.includes(requested)) setView(requested);
      const raw = params.get('doc');
      setDoc(raw && raw.includes(':') ? { type: raw.split(':')[0], id: raw.split(':')[1] } : null);
    };
    addEventListener('popstate', restore);
    addEventListener('africore:app-navigation', restore);
    return () => {
      removeEventListener('popstate', restore);
      removeEventListener('africore:app-navigation', restore);
    };
  }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    Promise.allSettled(listTypes.map((type) => api('/procurement?type=' + type))).then(
      (results) => {
        if (!live) return;
        const next: Record<string, any[]> = {};
        const meta: Record<string, any> = {};
        let failure = '';
        results.forEach((result, index) => {
          const type = listTypes[index];
          if (result.status === 'fulfilled') {
            next[type] = result.value?.data || [];
            meta[type] = result.value;
          } else {
            next[type] = [];
            const reason = result.reason as any;
            if (reason?.status !== 403)
              failure ||= reason?.message || 'Unable to load purchasing records.';
          }
        });
        setLists(next);
        setListMeta(meta);
        if (failure) setError(failure);
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [scope, revision, api]);

  const activeListType = view === 'dashboard' ? 'rfq' : typeForView[view];
  useEffect(() => {
    if (!activeListType || !listTypes.includes(activeListType as any)) return;
    let live = true;
    setLoading(true);
    const query = new URLSearchParams({
      type: activeListType,
      limit: '50',
      offset: String(page * 50),
      search,
      status: filter,
      sort: activeListType === 'rfq' || activeListType === 'order' ? 'amount' : 'date',
      direction: 'desc',
    });
    api('/procurement?' + query.toString())
      .then((result) => {
        if (!live) return;
        setLists((current) => ({ ...current, [activeListType]: result.data || [] }));
        setListMeta((current) => ({ ...current, [activeListType]: result }));
        setError('');
        setLoading(false);
      })
      .catch((reason) => {
        if (!live) return;
        setError(reason?.message || 'Unable to search purchasing records.');
        setLoading(false);
      });
    return () => { live = false; };
  }, [scope, revision, activeListType, search, filter, page, api]);

  useEffect(() => {
    let live = true;
    api('/procurement-report').then((report) => {
      if (live) setReportData(report);
    }).catch(() => {
      if (live) setReportData(null);
    });
    return () => { live = false; };
  }, [scope, revision, api]);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setBalance(null);
    if (!doc) return;
    api('/procurement/' + doc.type + '/' + doc.id)
      .then(async (value) => {
        if (!live) return;
        setDetail(value);
        if (doc.type === 'bill') {
          try {
            const value2 = await api('/procurement/bills/' + doc.id + '/balance');
            if (live) setBalance(value2);
          } catch {
            if (live) setBalance(null);
          }
        }
      })
      .catch((reason) => {
        if (live) setError((reason as Error).message);
      });
    return () => {
      live = false;
    };
  }, [scope, doc?.type, doc?.id, revision, api]);

  function go(next: ProcurementView) {
    const nextSection = sectionForView(next);
    const url = new URL(location.href);
    url.searchParams.set('app', 'procurement');
    url.searchParams.set('section', nextSection);
    url.searchParams.set('view', next);
    url.searchParams.delete('doc');
    url.hash = encodeURIComponent('Apps');
    history.pushState(history.state, '', url);
    dispatchEvent(new Event('africore:app-navigation'));
    setView(next);
    setDoc(null);
    setDetail(null);
    setSearch('');
    setFilter('all');
    setPage(0);
    setSelectedProduct(null);
    setDocTab('lines');
    if (navigate) navigate('Apps');
  }

  function openDoc(type: string, id: string) {
    const url = new URL(location.href);
    url.searchParams.set('doc', type + ':' + id);
    history.pushState(history.state, '', url);
    setDoc({ type, id });
    setDocTab('lines');
    setNotice('');
    setError('');
  }

  function closeDoc() {
    const url = new URL(location.href);
    url.searchParams.delete('doc');
    history.pushState(history.state, '', url);
    setDoc(null);
    setDetail(null);
    setBalance(null);
  }

  function refresh(message = '') {
    if (message) setNotice(message);
    setRevision((value) => value + 1);
  }

  async function recordAction(action: string, reason: string) {
    if (!doc || !detail?.record) return;
    await api('/procurement/' + doc.type + '/' + detail.record.id + '/decision', 'POST', {
      expected_version: detail.record.version,
      action,
      reason,
    });
    refresh('Exact ' + doc.type + ' version recorded as ' + action + '.');
  }

  async function receiveOrder(payload: any) {
    await api('/procurement/orders/' + doc?.id + '/receive', 'POST', payload);
    refresh('Inspected receipt posted. Only accepted quantities increased stock.');
  }

  async function recordPayment(payload: any) {
    await api('/procurement/bills/' + doc?.id + '/payment', 'POST', payload);
    refresh('Manual payment observation retained. No funds were executed.');
  }

  const openDocRecord = detail?.record || null;
  const openType = doc?.type || '';
  const documents = openDocRecord ? detail : null;

  return (
    <div className="proc-app">
      <nav className="proc-app-nav" aria-label="Procurement sections">
        <button
          className={'proc-app-brand' + (view === 'dashboard' ? ' active' : '')}
          onClick={() => go('dashboard')}
        >
          <Icon name="bag" />
          <span>Purchase</span>
        </button>
        <details className="proc-app-menu">
          <summary className={viewsForSection.orders.includes(view) ? 'active' : ''}>
            Orders
            <Icon name="down" />
          </summary>
          <div>
            <button onClick={() => go('requests')}>Purchase Requests</button>
            <button onClick={() => go('rfqs')}>Requests for Quotation</button>
            <button onClick={() => go('orders')}>Purchase Orders</button>
            <button onClick={() => go('agreements')}>Purchase Agreements</button>
            <button onClick={() => go('approvals')}>Orders Awaiting Approval</button>
            <button onClick={() => go('receipts')}>Receipts</button>
            <button onClick={() => go('bills')}>Vendor Bills</button>
            <button onClick={() => go('payments')}>Payment Observations</button>
            <button onClick={() => go('credits')}>Supplier Credits</button>
            <button onClick={() => go('vendors')}>Vendors</button>
          </div>
        </details>
        <details className="proc-app-menu">
          <summary className={viewsForSection.products.includes(view) ? 'active' : ''}>
            Products
            <Icon name="down" />
          </summary>
          <div>
            <button onClick={() => go('products')}>Products</button>
            <button onClick={() => go('pricelists')}>Vendor Pricelists</button>
            <button onClick={() => go('replenishment')}>Replenishment Requirements</button>
          </div>
        </details>
        <details className="proc-app-menu">
          <summary className={viewsForSection.reporting.includes(view) ? 'active' : ''}>
            Reporting
            <Icon name="down" />
          </summary>
          <div>
            <button onClick={() => go('analysis')}>Purchase Analysis</button>
            <button onClick={() => go('vendor-report')}>Purchases by Vendor</button>
            <button onClick={() => go('product-report')}>Purchases by Product</button>
            <button onClick={() => go('approval-report')}>Approval Performance</button>
            <button onClick={() => go('receipt-report')}>Receipt Performance</button>
          </div>
        </details>
        <details className="proc-app-menu">
          <summary className={view === 'settings' ? 'active' : ''}>
            Configuration
            <Icon name="down" />
          </summary>
          <div>
            <button onClick={() => go('settings')}>Purchasing Settings</button>
            <button onClick={() => go('templates')}>Purchase Templates</button>
            <button onClick={() => go('approvals')}>Approval Rules</button>
          </div>
        </details>
        <span className="proc-app-sandbox">
          Manual purchasing records · no automatic orders, emails or bank payments
        </span>
      </nav>

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}
      {doc ? (
        <DocumentPage
          type={openType}
          api={api}
          detail={documents}
          balance={balance}
          writable={writable}
          finance={finance}
          docTab={docTab}
          setDocTab={setDocTab}
          onBack={closeDoc}
          onOpen={openDoc}
          onAction={recordAction}
          onReceive={receiveOrder}
          onPayment={recordPayment}
          onCreate={(type, source) => setEditor({ type, source })}
          onRevise={(record) => setEditor({ type: openType, record })}
          bills={lists.bill}
        />
      ) : (
        <>{renderView()}</>
      )}
      {editor && (
        <ProcurementEditor
          key={editor.type + (editor.record?.id || '') + (editor.source || '')}
          api={api}
          type={editor.type}
          record={editor.record}
          defaultSource={editor.source}
          onSaved={() => {
            setEditor(null);
            refresh('Purchase draft saved for review.');
          }}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );

  function renderView() {
    if (view === 'replenishment')
      return <ProcurementReplenishment api={api} scope={scope} writable={writable} />;
    if (view === 'analysis') return <ProcurementReports api={api} scope={scope} />;
    if (view === 'settings')
      return <SettingsView writable={writable} finance={finance} review={review} go={go} />;
    if (view === 'products')
      return (
        <ProductsView
          api={api}
          selected={selectedProduct}
          setSelected={setSelectedProduct}
        />
      );
    if (view === 'vendors')
      return (
        <VendorsView
          suppliers={lists.supplier}
          orders={lists.order}
          rfqs={lists.rfq}
          search={search}
          setSearch={setSearch}
          total={listMeta.supplier?.total || 0}
          page={page}
          setPage={setPage}
          pages={pageCount(listMeta.supplier?.total || 0, 50)}
          writable={writable}
          onCreate={() => setEditor({ type: 'supplier' })}
          onOpen={openDoc}
        />
      );
    if (view === 'dashboard')
      return (
        <DashboardView
          lists={lists}
          listMeta={listMeta}
          report={reportData}
          loading={loading}
          search={search}
          setSearch={setSearch}
          filter={filter}
          setFilter={setFilter}
          display={display}
          setDisplay={setDisplay}
          page={page}
          setPage={setPage}
          onOpen={openDoc}
          go={go}
          onCreate={(type) => setEditor({ type })}
          writable={writable}
        />
      );
    if (view === 'vendor-report') return <VendorReport rows={reportData?.by_vendor || []} />;
    if (view === 'product-report') return <ProductReport rows={reportData?.by_product || []} />;
    if (view === 'approval-report') return <ApprovalReport lists={lists} />;
    if (view === 'receipt-report')
      return <ReceiptReport orders={lists.order} rfqs={lists.rfq} receipts={lists.receipt} />;
    if (view === 'approvals')
      return (
        <ApprovalQueue
          api={api}
          scope={scope}
          canReview={review}
          canReviewFinance={finance}
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          page={page}
          setPage={setPage}
          onOpen={openDoc}
        />
      );
    return (
      <RecordsView
        view={view}
        type={typeForView[view] || 'rfq'}
        lists={lists}
        listMeta={listMeta}
        loading={loading}
        search={search}
        setSearch={setSearch}
        filter={filter}
        setFilter={setFilter}
        display={display}
        setDisplay={setDisplay}
        page={page}
        setPage={setPage}
        onOpen={openDoc}
        writable={writable}
        onCreate={(type) => setEditor({ type })}
      />
    );
  }
}

function DashboardView({
  lists,
  listMeta,
  report,
  loading,
  search,
  setSearch,
  filter,
  setFilter,
  display,
  setDisplay,
  page,
  setPage,
  onOpen,
  go,
  onCreate,
  writable,
}: {
  lists: Record<string, any[]>;
  listMeta: Record<string, any>;
  report: any;
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  display: 'list' | 'kanban';
  setDisplay: (v: 'list' | 'kanban') => void;
  page: number;
  setPage: (v: number) => void;
  onOpen: (type: string, id: string) => void;
  go: (view: ProcurementView) => void;
  onCreate: (type: string) => void;
  writable: boolean;
}) {
  const localCounts = dashboardCounts({
    requests: lists.request,
    rfqs: lists.rfq,
    orders: lists.order,
    receipts: lists.receipt,
    bills: lists.bill,
  });
  const counts = {
    newRfqs: listMeta.rfq?.status_counts?.draft || 0,
    sentRfqs: listMeta.rfq?.status_counts?.accepted || 0,
    awaitingApproval: (listMeta.request?.status_counts?.submitted || 0) +
      (listMeta.order?.status_counts?.draft || 0) + (listMeta.bill?.status_counts?.draft || 0),
    lateReceipts: report?.late_receipts ?? localCounts.lateReceipts,
    confirmedOrders: report?.total_orders ?? localCounts.confirmedOrders,
  };
  const metrics = report?.currencies
    ? Object.fromEntries(Object.entries(report.currencies).map(([currency, values]: any) => [currency, { value_minor: values.issued_minor, orders: values.orders }]))
    : confirmedMetrics(lists.order);
  const rows = lists.rfq || [];
  const total = listMeta.rfq?.total ?? rows.length;
  const totalPages = pageCount(total, 50);
  const statusOptions = ['all', ...Object.keys(listMeta.rfq?.status_counts || {})];
  return (
    <>
      <header className="proc-page-heading">
        <div>
          <p className="proc-eyebrow">Purchase</p>
          <h1>Requests for Quotation</h1>
          <p>
            Supplier offers under an approved purchase request. Confirmations, receipts and bills
            use separate authority.
          </p>
        </div>
        <div className="proc-page-actions">
          {writable && <NewMenu onCreate={onCreate} />}
          <button className="secondary-button" onClick={() => go('orders')}>
            Purchase Orders
          </button>
        </div>
      </header>
      <section className="proc-activity-strip" aria-label="Purchasing activity">
        <button
          className="proc-activity new"
          onClick={() => {
            setFilter('draft');
            setPage(0);
          }}
        >
          <span>{counts.newRfqs}</span>
          <strong>Draft quotations</strong>
          <small>Not transmitted externally</small>
        </button>
        <button
          className="proc-activity"
          onClick={() => {
            setFilter('accepted');
            setPage(0);
          }}
        >
          <span>{counts.sentRfqs}</span>
          <strong>Awarded offers</strong>
          <small>Ready for order draft</small>
        </button>
        <button className="proc-activity warn" onClick={() => go('approvals')}>
          <span>{counts.awaitingApproval}</span>
          <strong>Awaiting approval</strong>
          <small>Separate reviewer</small>
        </button>
        <button className="proc-activity danger" onClick={() => go('receipt-report')}>
          <span>{counts.lateReceipts}</span>
          <strong>Late receipts</strong>
          <small>Open tracked orders</small>
        </button>
        <button className="proc-activity ok" onClick={() => go('orders')}>
          <span>{counts.confirmedOrders}</span>
          <strong>Confirmed orders</strong>
          <small>Issued or confirmed</small>
        </button>
        <div className="proc-performance">
          <span>Confirmed purchase value</span>
          {Object.keys(metrics).length ? (
            Object.entries(metrics as Record<string, { value_minor: number; orders: number }>).map(([currency, value]) => (
              <strong key={currency}>
                {money(value.value_minor, currency)} <small>{value.orders} orders</small>
              </strong>
            ))
          ) : (
            <strong>No confirmed orders</strong>
          )}
          <small>
            Recorded commitment, not cash paid. Average cycle-time and on-time comparisons are not
            supplied by the current record fields.
          </small>
        </div>
      </section>
      <section className="proc-list-panel">
        <div className="proc-toolbar">
          <label className="proc-search">
            <Icon name="search" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search reference, vendor or title"
              aria-label="Search requests for quotation"
            />
          </label>
          <label className="proc-filter">
            <span>Filter</span>
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(0);
              }}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === 'all' ? 'All RFQs' : labelForStatus(status)}
                </option>
              ))}
            </select>
          </label>
          <div className="proc-view-switch" role="group" aria-label="Record view">
            <button
              className={display === 'list' ? 'active' : ''}
              onClick={() => setDisplay('list')}
              aria-label="List view"
            >
              <Icon name="menu" />
            </button>
            <button
              className={display === 'kanban' ? 'active' : ''}
              onClick={() => setDisplay('kanban')}
              aria-label="Kanban view"
            >
              <Icon name="grid" />
            </button>
          </div>
          <span className="proc-count">
            {rows.length} of {total} matching records
          </span>
        </div>
        {loading && <p role="status">Loading authorized purchasing records…</p>}
        {!loading && !rows.length && (
          <div className="proc-empty">
            <h2>No requests for quotation</h2>
            <p>
              Create a purchase request, approve its exact version, then record at least one
              supplier offer.
            </p>
            {writable && (
              <button className="button" onClick={() => onCreate('request')}>
                Create purchase request
              </button>
            )}
          </div>
        )}
        {!!rows.length &&
          (display === 'list' ? (
            <div className="proc-table-wrap">
              <table className="proc-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Vendor</th>
                    <th>Buyer</th>
                    <th>Request</th>
                    <th>Expected arrival</th>
                    <th className="numeric">Total</th>
                    <th>Status</th>
                    <th>Order</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const request = requestForRfq(lists.request, row.data?.request_id);
                    const order = lists.order.find((o) => o.data?.rfq_id === row.id);
                    return (
                      <tr
                        key={row.id}
                        onClick={() => onOpen('rfq', row.id)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') onOpen('rfq', row.id);
                        }}
                      >
                        <td>
                          <strong>{row.data?.reference || 'Supplier offer'}</strong>
                          <small>Version {row.version}</small>
                        </td>
                        <td>{row.data?.supplier_snapshot?.name || 'Vendor'}</td>
                        <td>{shortActor(row.data?.prepared_by)}</td>
                        <td>{request?.data?.title || 'Purchase request'}</td>
                        <td>{row.data?.delivery_on || '—'}</td>
                        <td className="numeric">
                          {row.data?.currency
                            ? money(row.data.total_minor || 0, row.data.currency)
                            : '—'}
                        </td>
                        <td>
                          <Pill status={row.status} />
                        </td>
                        <td>
                          {order ? (
                            <span
                              className="proc-link"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpen('order', order.id);
                              }}
                            >
                              {order.data?.reference}
                            </span>
                          ) : (
                            <span className="muted">Not ordered</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="proc-kanban">
              {rows.map((row) => (
                <button
                  className="proc-kanban-card"
                  key={row.id}
                  onClick={() => onOpen('rfq', row.id)}
                >
                  <span className="proc-kanban-top">
                    <Pill status={row.status} />
                    <small>{row.data?.delivery_on || 'No arrival'}</small>
                  </span>
                  <strong>{row.data?.reference || 'Supplier offer'}</strong>
                  <span>{row.data?.supplier_snapshot?.name || 'Vendor'}</span>
                  <span className="numeric">
                    {row.data?.currency ? money(row.data.total_minor || 0, row.data.currency) : '—'}
                  </span>
                </button>
              ))}
            </div>
          ))}
        <Pager page={page} pages={totalPages} setPage={setPage} label={total + ' offers'} />
        <p className="proc-coverage">
          Server searched and counted the full authorized register. Draft quotations are not emailed by this workspace.
        </p>
      </section>
    </>
  );
}

function RecordsView({
  view,
  type,
  lists,
  listMeta,
  loading,
  search,
  setSearch,
  filter,
  setFilter,
  display,
  setDisplay,
  page,
  setPage,
  onOpen,
  writable,
  onCreate,
}: {
  view: ProcurementView;
  type: string;
  lists: Record<string, any[]>;
  listMeta: Record<string, any>;
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  display: 'list' | 'kanban';
  setDisplay: (v: 'list' | 'kanban') => void;
  page: number;
  setPage: (v: number) => void;
  onOpen: (type: string, id: string) => void;
  writable: boolean;
  onCreate: (type: string) => void;
}) {
  const rows = lists[type] || [];
  const meta = listMeta[type] || {};
  const total = meta.total ?? rows.length;
  const statuses = ['all', ...Object.keys(meta.status_counts || {})];
  return (
    <>
      <header className="proc-page-heading">
        <div>
          <p className="proc-eyebrow">Orders</p>
          <h1>{procurementViewTitles[view]}</h1>
          <p>
            {view === 'receipts'
              ? 'Posted inspection records. Accepted quantities are the only quantities that increased stock.'
              : view === 'bills'
                ? 'Approved vendor bills create payables only after matching accepted goods or services.'
                : view === 'payments'
                  ? 'Manual payment observations are evidence records, not bank confirmation.'
                  : 'Exact versions retain their review and authority history.'}
          </p>
        </div>
        {writable &&
          ['requests', 'rfqs', 'orders', 'bills', 'credits', 'agreements', 'pricelists', 'templates'].includes(view) && (
            <button className="button" onClick={() => onCreate(type)}>
              New {labels[type]?.replace(/s$/, '') || 'record'}
            </button>
          )}
        {view === 'vendors' && writable && (
          <button className="button" onClick={() => onCreate('supplier')}>
            New vendor profile
          </button>
        )}
      </header>
      <div className="proc-toolbar">
        <label className="proc-search">
          <Icon name="search" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder={'Search ' + labels[type]}
            aria-label={'Search ' + labels[type]}
          />
        </label>
        <label className="proc-filter">
          <span>Filter</span>
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === 'all' ? 'All' : labelForStatus(status)}
              </option>
            ))}
          </select>
        </label>
        {['rfqs', 'orders'].includes(view) && (
          <div className="proc-view-switch" role="group" aria-label="Record view">
            <button
              className={display === 'list' ? 'active' : ''}
              onClick={() => setDisplay('list')}
              aria-label="List view"
            >
              <Icon name="menu" />
            </button>
            <button
              className={display === 'kanban' ? 'active' : ''}
              onClick={() => setDisplay('kanban')}
              aria-label="Kanban view"
            >
              <Icon name="grid" />
            </button>
          </div>
        )}
        <span className="proc-count">{rows.length} of {total} matching</span>
      </div>
      {loading && <p role="status">Searching authorized purchase records…</p>}
      {!rows.length && loading && <p role="status">Loading matching records…</p>}
      {!rows.length && (
        <div className="proc-empty">
          <h2>No {labels[type]}</h2>
          <p>No matching authorized records are available.</p>
        </div>
      )}
      {!!rows.length && (
        <RecordsTable
          view={view}
          type={type}
          rows={rows}
          lists={lists}
          display={display}
          onOpen={onOpen}
        />
      )}
      <Pager
        page={page}
        pages={pageCount(total, 50)}
        setPage={setPage}
        label={total + ' records'}
      />
      <p className="proc-coverage">
        Search, status filtering, counts and paging are computed over the authorized server-side register.
      </p>
    </>
  );
}

function RecordsTable({
  view,
  type,
  rows,
  lists,
  display,
  onOpen,
}: {
  view: ProcurementView;
  type: string;
  rows: any[];
  lists: Record<string, any[]>;
  display: 'list' | 'kanban';
  onOpen: (type: string, id: string) => void;
}) {
  if (display === 'kanban' && ['rfqs', 'orders'].includes(view))
    return (
      <div className="proc-kanban">
        {rows.map((row) => (
          <button className="proc-kanban-card" key={row.id} onClick={() => onOpen(type, row.id)}>
            <span className="proc-kanban-top">
              <Pill status={row.status} />
              <small>{row.data?.currency || ''}</small>
            </span>
            <strong>{row.data?.reference || row.data?.title || 'Record'}</strong>
            <span>
              {row.data?.supplier_snapshot?.name || row.data?.contact_snapshot?.name || ''}
            </span>
            <span className="numeric">
              {row.data?.currency
                ? money(row.data.total_minor || row.data.amount_minor || 0, row.data.currency)
                : '—'}
            </span>
          </button>
        ))}
      </div>
    );
  if (type === 'receipt')
    return (
      <Table
        rows={rows}
        onOpen={(id) => onOpen('receipt', id)}
        columns={[
          ['Reference', (row) => row.data?.reference],
          ['Received on', (row) => row.data?.received_on],
          [
            'Accepted lines',
            (row) => row.data?.lines?.filter((l: any) => l.accepted_milli > 0).length || 0,
          ],
          [
            'Rejected lines',
            (row) => row.data?.lines?.filter((l: any) => l.rejected_milli > 0).length || 0,
          ],
          ['Inspection', (row) => <span className="proc-truncate">{row.data?.inspection}</span>],
          ['State', (row) => <Pill status={row.status} />],
        ]}
      />
    );
  if (type === 'payment')
    return (
      <Table
        rows={rows}
        onOpen={(id) => onOpen('payment', id)}
        columns={[
          ['Reference', (row) => row.data?.reference],
          ['Paid on', (row) => row.data?.paid_on],
          [
            'Amount',
            (row) => (row.data?.currency ? money(row.data.amount_minor, row.data.currency) : '—'),
          ],
          [
            'Assurance',
            (row) => (
              <span className="proc-truncate">{row.data?.assurance?.replaceAll('_', ' ')}</span>
            ),
          ],
          ['Note', (row) => <span className="proc-truncate">{row.data?.note}</span>],
        ]}
      />
    );
  if (type === 'credit')
    return (
      <Table
        rows={rows}
        onOpen={(id) => onOpen('credit', id)}
        columns={[
          ['Reference', (row) => row.data?.reference],
          ['Issued', (row) => row.data?.issued_on],
          [
            'Amount',
            (row) => (row.data?.currency ? money(row.data.amount_minor, row.data.currency) : '—'),
          ],
          ['Reason', (row) => <span className="proc-truncate">{row.data?.reason}</span>],
          ['Status', (row) => <Pill status={row.status} />],
        ]}
      />
    );
  if (type === 'supplier')
    return (
      <Table
        rows={rows}
        onOpen={(id) => onOpen('supplier', id)}
        columns={[
          ['Vendor', (row) => row.data?.contact_snapshot?.name],
          ['Email', (row) => row.data?.contact_snapshot?.email || '—'],
          ['Terms', (row) => <span className="proc-truncate">{row.data?.terms || '—'}</span>],
          ['Lead time', (row) => (row.data?.lead_days || 0) + ' days'],
          ['State', (row) => <Pill status={row.status} />],
        ]}
      />
    );
  if (type === 'price')
    return (
      <Table
        rows={rows}
        onOpen={(id) => onOpen('price', id)}
        columns={[
          ['Vendor', (row) => row.data?.supplier_snapshot?.name || '—'],
          ['Product', (row) => row.data?.product_snapshot?.name || '—'],
          ['Vendor SKU', (row) => row.data?.vendor_sku || '—'],
          ['Minimum quantity', (row) => displayQuantity(row.data?.minimum_quantity_milli || 1000)],
          ['Unit price', (row) => money(row.data?.unit_price_minor || 0, row.data?.currency || 'KES')],
          ['Lead time', (row) => (row.data?.lead_days || 0) + ' days'],
          ['Validity', (row) => (row.data?.valid_from || 'Any date') + ' – ' + (row.data?.valid_to || 'Open')],
        ]}
      />
    );
  if (type === 'agreement')
    return (
      <Table
        rows={rows}
        onOpen={(id) => onOpen('agreement', id)}
        columns={[
          ['Agreement', (row) => row.data?.title || '—'],
          ['Vendor', (row) => row.data?.supplier_snapshot?.name || '—'],
          ['Valid from', (row) => row.data?.valid_from],
          ['Valid to', (row) => row.data?.valid_to],
          ['Products', (row) => row.data?.lines?.length || 0],
          ['Currency', (row) => row.data?.currency],
          ['Status', (row) => <Pill status={row.status} />],
        ]}
      />
    );
  if (type === 'template')
    return (
      <Table
        rows={rows}
        onOpen={(id) => onOpen('template', id)}
        columns={[
          ['Template', (row) => row.data?.title || '—'],
          ['Vendor', (row) => row.data?.supplier_snapshot?.name || 'Any vendor'],
          ['Products', (row) => row.data?.lines?.length || 0],
          ['Currency', (row) => row.data?.currency],
          ['Status', (row) => <Pill status={row.status} />],
        ]}
      />
    );
  if (type === 'bill')
    return (
      <Table
        rows={rows}
        onOpen={(id) => onOpen('bill', id)}
        columns={[
          ['Reference', (row) => row.data?.reference],
          ['Vendor', (row) => row.data?.supplier_snapshot?.name || '—'],
          ['Issued', (row) => row.data?.issued_on],
          ['Due', (row) => row.data?.due_on],
          [
            'Total',
            (row) =>
              row.data?.currency ? money(row.data.total_minor || 0, row.data.currency) : '—',
          ],
          ['Status', (row) => <Pill status={row.status} />],
        ]}
      />
    );
  if (type === 'order')
    return (
      <Table
        rows={rows}
        onOpen={(id) => onOpen('order', id)}
        columns={[
          ['Reference', (row) => row.data?.reference],
          ['Vendor', (row) => row.data?.supplier_snapshot?.name || '—'],
          ['Expected arrival', (row) => row.data?.delivery_on || '—'],
          [
            'Total',
            (row) =>
              row.data?.currency ? money(row.data.total_minor || 0, row.data.currency) : '—',
          ],
          ['Billing', (row) => orderBillingStatus(row, lists.bill)],
          ['Status', (row) => <Pill status={row.status} />],
        ]}
      />
    );
  return (
    <Table
      rows={rows}
      onOpen={(id) => onOpen(type, id)}
      columns={[
        ['Reference', (row) => row.data?.reference || row.data?.title],
        ['Supplier', (row) => row.data?.supplier_snapshot?.name || '—'],
        ['Delivery', (row) => row.data?.delivery_on || row.data?.needed_on || '—'],
        [
          'Total',
          (row) => (row.data?.currency ? money(row.data.total_minor || 0, row.data.currency) : '—'),
        ],
        ['Status', (row) => <Pill status={row.status} />],
      ]}
    />
  );
}

function Table({
  rows,
  columns,
  onOpen,
}: {
  rows: any[];
  columns: [string, (row: any) => ReactNode][];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="proc-table-wrap">
      <table className="proc-table">
        <thead>
          <tr>
            {columns.map(([label]) => (
              <th key={label} className={label === 'Total' || label === 'Amount' ? 'numeric' : ''}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onOpen(row.id)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onOpen(row.id);
              }}
            >
              {columns.map(([label, render]) => (
                <td
                  key={label}
                  className={label === 'Total' || label === 'Amount' ? 'numeric' : ''}
                >
                  {render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalQueue({
  api,
  scope,
  canReview,
  canReviewFinance,
  filter,
  setFilter,
  search,
  setSearch,
  page,
  setPage,
  onOpen,
}: {
  api: API;
  scope: string;
  canReview: boolean;
  canReviewFinance: boolean;
  filter: string;
  setFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  page: number;
  setPage: (v: number) => void;
  onOpen: (type: string, id: string) => void;
}) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (!canReview) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    const query = new URLSearchParams({
      type: filter === 'all' ? 'all' : filter,
      search,
      limit: '50',
      offset: String(page * 50),
    });
    api('/procurement-approvals?' + query.toString())
      .then((value) => { if (live) setResult(value); })
      .catch((reason) => { if (live) { setError(reason?.message || 'Unable to load review queue.'); setResult(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api, canReview, scope, filter, search, page]);
  const rows = result?.data || [];
  const total = result?.total || 0;
  const pages = pageCount(total, 50);
  const kindLabels: Record<string, string> = {
    request: 'Purchase request',
    order: 'Purchase order',
    bill: 'Vendor bill',
    credit: 'Supplier credit',
    agreement: 'Purchase agreement',
  };
  return (
    <>
      <header className="proc-page-heading">
        <div>
          <p className="proc-eyebrow">Orders</p>
          <h1>Awaiting Approval</h1>
          <p>Review actions bind the exact version and require a different current owner or administrator. Financial documents remain visible only to authorized finance reviewers.</p>
        </div>
      </header>
      <div className="proc-toolbar">
        <label className="proc-search">
          <Icon name="search" />
          <input
            value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(0); }}
            placeholder="Search approval queue"
            aria-label="Search approval queue"
          />
        </label>
        <label className="proc-filter">
          <span>Record type</span>
          <select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0); }}>
            <option value="all">All awaiting review</option>
            <option value="request">Purchase requests</option>
            <option value="order">Purchase orders</option>
            {canReviewFinance && <option value="bill">Vendor bills</option>}
            {canReviewFinance && <option value="credit">Supplier credits</option>}
            <option value="agreement">Purchase agreements</option>
          </select>
        </label>
        <span className="proc-count">{rows.length} of {total} pending review</span>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading authorized review items…</p>}
      {!canReview && <p role="status">A current owner or administrator is required to access this review queue.</p>}
      {!rows.length ? (
        <div className="proc-empty">
          <h2>Nothing awaiting approval</h2>
          <p>{error ? 'The review queue could not be loaded.' : 'Submitted requests, agreements and reviewable order or financial drafts appear here.'}</p>
        </div>
      ) : (
        <div className="proc-table-wrap">
          <table className="proc-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Type</th>
                <th>Vendor</th>
                <th>Recorded amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ record: row, type }: any) => (
                <tr key={type + row.id}>
                  <td>
                    <strong>{row.data?.reference || row.data?.title || 'Draft'}</strong>
                    <small>Version {row.version}</small>
                  </td>
                  <td>{kindLabels[type] || type}</td>
                  <td>{row.data?.supplier_snapshot?.name || '—'}</td>
                  <td className="numeric">
                    {row.data?.currency
                      ? money(
                          row.data.total_minor ||
                            row.data.amount_minor ||
                            row.data.budget_minor ||
                            0,
                          row.data.currency,
                        )
                      : '—'}
                  </td>
                  <td>
                    <Pill status={row.status} />
                  </td>
                  <td>
                    <button className="secondary-button" onClick={() => onOpen(type, row.id)}>
                      Review exact version
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="proc-coverage">
        Approval history and reviewer identity are shown inside each exact record and its retained history. Requests must be submitted before review.
      </p>
      <Pager page={page} pages={pages} setPage={setPage} label={total + ' pending items'} />
    </>
  );
}

function DocumentPage({
  type,
  api,
  detail,
  balance,
  writable,
  finance,
  docTab,
  setDocTab,
  onBack,
  onOpen,
  onAction,
  onReceive,
  onPayment,
  onCreate,
  onRevise,
  bills,
}: {
  type: string;
  api: API;
  detail: any;
  balance: any;
  writable: boolean;
  finance: boolean;
  docTab: string;
  setDocTab: (v: string) => void;
  onBack: () => void;
  onOpen: (type: string, id: string) => void;
  onAction: (action: string, reason: string) => void;
  onReceive: (payload: any) => Promise<void>;
  onPayment: (payload: any) => Promise<void>;
  onCreate: (type: string, source: string) => void;
  onRevise: (record: any) => void;
  bills: any[];
}) {
  if (!detail)
    return (
      <section className="panel proc-empty">
        <p role="status">Loading exact purchase record…</p>
        <button className="secondary-button" onClick={onBack}>
          Back to records
        </button>
      </section>
    );
  const record = detail.record;
  const data = record.data || {};
  if (type === 'supplier')
    return (
      <VendorDocument
        record={record}
        detail={detail}
        writable={writable}
        onBack={onBack}
        onRevise={onRevise}
      />
    );
  const linkedBills = bills.filter((bill: any) => bill.data?.order_id === record.id);
  const receiptRows = detail.receipts || [];
  const currency = data.currency || 'KES';
  const pipeline =
    type === 'request'
      ? ['draft', 'submitted', 'approved']
      : type === 'rfq'
        ? ['draft', 'accepted']
        : type === 'agreement'
          ? ['draft', 'confirmed', 'closed']
        : type === 'order'
          ? ['draft', 'approved', 'issued', 'confirmed']
          : type === 'receipt'
            ? ['posted']
            : ['draft', 'approved'];
  const activeStage = pipeline.indexOf(record.status);
  const canReview = !!detail.can_review;
  return (
    <article className="proc-doc">
      <header className="proc-doc-head">
        <div>
          <button className="proc-back" onClick={onBack}>
            <Icon name="left" />
            Back to {type === 'rfq' ? 'RFQs' : labels[type]}
          </button>
          <p className="proc-eyebrow">
            {type === 'request'
              ? 'Purchase request'
              : type === 'rfq'
                ? 'Requests for Quotation'
                : type === 'order'
                  ? 'Purchase Order'
                  : type === 'bill'
                    ? 'Vendor Bill'
                    : type === 'credit'
                      ? 'Supplier Credit'
                      : type === 'supplier'
                        ? 'Vendor profile'
                        : 'Purchase record'}
          </p>
          <h1>
            {data.reference || data.title || data.contact_snapshot?.name || record.id.slice(0, 8)}
          </h1>
          <div className="proc-doc-meta">
            <Pill status={record.status} />
            <span>Retained version {record.version}</span>
            {data.prepared_by && <span>Buyer {shortActor(data.prepared_by)}</span>}
          </div>
        </div>
        <div className="proc-doc-actions">
          {['rfq', 'order'].includes(type) && !['cancelled', 'rejected'].includes(record.status) && (
            <button className="secondary-button" onClick={() => window.print()}>Print document</button>
          )}
          {writable && ['request', 'rfq', 'order', 'bill', 'credit', 'supplier'].includes(type) && (
            <button className="secondary-button" onClick={() => onRevise(record)}>
              Revise draft
            </button>
          )}
      {writable && type === 'request' && record.status === 'approved' && (
            <button className="button" onClick={() => onCreate('rfq', record.id)}>
              Create supplier offer
            </button>
          )}
          {writable && type === 'agreement' && record.status === 'confirmed' && (
            <button className="button" onClick={() => onCreate('rfq', '')}>
              New quotation from agreement
            </button>
          )}
          {writable && type === 'rfq' && record.status === 'accepted' && (
            <button className="button" onClick={() => onCreate('order', record.id)}>
              Create purchase order
            </button>
          )}
          {writable && type === 'order' && ['issued', 'confirmed'].includes(record.status) && (
            <button className="secondary-button" onClick={() => onCreate('bill', record.id)}>
              Create vendor bill
            </button>
          )}
          {writable && type === 'bill' && record.status === 'approved' && (
            <button className="secondary-button" onClick={() => onCreate('credit', record.id)}>
              Record supplier credit
            </button>
          )}
        </div>
      </header>
      <div className="proc-pipeline" aria-label="Document status progression">
        {pipeline.map((stage, index) => (
          <span
            key={stage}
            className={index === activeStage ? 'active' : index < activeStage ? 'done' : ''}
          >
            {labelForStage(stage, type)}
          </span>
        ))}
      </div>
      {type !== 'supplier' && (
        <div className="proc-doc-facts">
          <div>
            <span>Vendor</span>
            <strong>
              {data.supplier_snapshot?.name || data.contact_snapshot?.name || 'Not recorded'}
            </strong>
            <small>{data.terms || 'No additional terms recorded'}</small>
          </div>
          <div>
            <span>{type === 'request' ? 'Needed on' : 'Expected arrival'}</span>
            <strong>{data.delivery_on || data.needed_on || 'Not recorded'}</strong>
            <small>
              {type === 'order'
                ? 'Recording a receipt does not guarantee this date'
                : 'Recorded plan, not a courier commitment'}
            </small>
          </div>
          <div>
            <span>Currency and total</span>
            <strong>
              {data.total_minor !== undefined
                ? money(data.total_minor, currency)
                : data.amount_minor !== undefined
                  ? money(data.amount_minor, currency)
                  : 'Not monetary'}
            </strong>
            <small>
              {data.tax_minor
                ? 'Recorded tax ' + money(data.tax_minor, currency)
                : 'No automatic tax claim'}
            </small>
          </div>
          <div>
            <span>Authority</span>
            <strong>
              {record.status === 'draft' ? 'Awaiting review' : 'Reviewed exact version'}
            </strong>
            <small>
              {canReview
                ? 'You may record the separate decision'
                : 'A different owner or administrator must review'}
            </small>
          </div>
        </div>
      )}
      <div className="proc-doc-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={docTab === 'lines'}
          className={docTab === 'lines' ? 'active' : ''}
          onClick={() => setDocTab('lines')}
        >
          Products
        </button>
        <button
          role="tab"
          aria-selected={docTab === 'info'}
          className={docTab === 'info' ? 'active' : ''}
          onClick={() => setDocTab('info')}
        >
          Other information
        </button>
        {type === 'request' && (
          <button
            role="tab"
            aria-selected={docTab === 'comparison'}
            className={docTab === 'comparison' ? 'active' : ''}
            onClick={() => setDocTab('comparison')}
          >
            Alternatives
          </button>
        )}
        {type === 'agreement' && (
          <button
            role="tab"
            aria-selected={docTab === 'comparison'}
            className={docTab === 'comparison' ? 'active' : ''}
            onClick={() => setDocTab('comparison')}
          >
            Related quotations & orders
          </button>
        )}
        <button
          role="tab"
          aria-selected={docTab === 'history'}
          className={docTab === 'history' ? 'active' : ''}
          onClick={() => setDocTab('history')}
        >
          Activity
        </button>
      </div>
      {docTab === 'lines' && (
        <>
          {type === 'receipt' ? (
            <ReceiptDetail record={record} />
          ) : type === 'payment' ? (
            <PaymentDetail record={record} />
          ) : (
            <LinesTable type={type} record={record} detail={detail} />
          )}
          {type !== 'receipt' && type !== 'payment' && (
            <div className="proc-doc-totals">
              <span>
                Untaxed <strong>{money(record.data?.subtotal_minor || 0, currency)}</strong>
              </span>
              <span>
                Tax <strong>{money(record.data?.tax_minor || 0, currency)}</strong>
              </span>
              <span className="grand">
                Total <strong>{money(record.data?.total_minor || 0, currency)}</strong>
              </span>
            </div>
          )}
          {type === 'order' && (
            <OrderSmartButtons detail={detail} bills={linkedBills} onOpen={onOpen} />
          )}
          {type === 'order' && ['issued', 'confirmed'].includes(record.status) && writable && (
            <ReceiptForm record={record} detail={detail} onSubmit={onReceive} />
          )}
          {receiptRows.length > 0 && (
            <details className="proc-audit">
              <summary>Inspected receipts · {receiptRows.length}</summary>
              {receiptRows.map((receipt: any) => (
                <div key={receipt.id} className="proc-history-row">
                  <strong>{receipt.data?.reference}</strong>
                  <span>
                    {receipt.data?.received_on} · {receipt.status} ·{' '}
                    {receipt.data?.lines?.filter((line: any) => line.accepted_milli > 0).length}{' '}
                    accepted line(s)
                  </span>
                  <p>{receipt.data?.inspection}</p>
                </div>
              ))}
            </details>
          )}
          {type === 'bill' && (
            <BillPanel
              record={record}
              detail={detail}
              balance={balance}
              finance={finance}
              writable={writable}
              onPayment={onPayment}
            />
          )}
          {type === 'request' && <OfferComparison detail={detail} onOpen={onOpen} />}
          {['order', 'bill'].includes(type) && (
            <DocumentAttachments
              api={api}
              sourceKind={type === 'order' ? 'purchase_order' : 'supplier_bill'}
              sourceId={record.id}
              writable={writable}
              allowUpload={false}
            />
          )}
        </>
      )}
      {docTab === 'info' && (
        <div className="proc-info-grid">
          <section>
            <h3>Purchasing information</h3>
            <dl>
              <dt>Reference</dt>
              <dd>{data.reference || '—'}</dd>
              <dt>Vendor reference</dt>
              <dd>{data.vendor_reference || '—'}</dd>
              <dt>Source request</dt>
              <dd>{data.request_id || data.request_version || '—'}</dd>
              <dt>Supplier offer</dt>
              <dd>{data.rfq_id || '—'}</dd>
              <dt>Delivery warehouse</dt>
              <dd>{data.lines?.[0]?.warehouse_id || 'Per line'}</dd>
              <dt>Currency</dt>
              <dd>{currency}</dd>
            </dl>
          </section>
          <section>
            <h3>Terms and notes</h3>
            <p>{data.terms || 'No supplier terms recorded.'}</p>
            <p>
              {data.reason || data.variance_reason || data.note || 'No additional note recorded.'}
            </p>
            <p className="muted">
              No email, order transmission, supplier portal or bank payment is performed by this
              workspace.
            </p>
          </section>
        </div>
      )}
      {docTab === 'history' && (
        <section className="proc-history">
          <h3>Retained activity</h3>
          {(detail.history || []).map((entry: any) => (
            <div key={entry.version} className="proc-history-row">
              <strong>
                Version {entry.version} · {String(entry.action || '').replaceAll('_', ' ')}
              </strong>
              <span>
                {new Date(entry.created_at).toLocaleString('en-KE')} · {shortActor(entry.actor)}
              </span>
              {entry.snapshot?.data?.last_decision?.reason && (
                <p>{entry.snapshot.data.last_decision.reason}</p>
              )}
            </div>
          ))}
          {!detail.history?.length && <p>No retained actions yet.</p>}
        </section>
      )}
      {docTab === 'comparison' && (
        type === 'request' ? <section className="proc-comparison">
          <h3>Supplier comparison</h3>
          <p>
            Recorded offers linked to this request. Choosing an offer does not approve or issue a
            purchase order.
          </p>
          <ComparisonTable rows={comparisonRows(detail.offers || [])} onOpen={onOpen} />
        </section> : type === 'agreement' ? <AgreementLinks detail={detail} onOpen={onOpen} /> : null
      )}
      <DecisionStrip
        type={type}
        record={record}
        canReview={canReview}
        writable={writable}
        onAction={onAction}
      />
      <p className="proc-sandbox-note">
        Sandbox and recorded purchasing only. Confirmations, receipts and payment observations are
        manual business records; no live supplier connection, bank movement or statutory filing is
        performed.
      </p>
    </article>
  );
}

function LinesTable({ type, record, detail }: { type: string; record: any; detail: any }) {
  const lines = record.data?.lines || [];
  const order = type === 'order';
  const received = order ? detail.received || {} : {};
  return (
    <div className="proc-table-wrap">
      <table className="proc-table proc-lines">
        <thead>
          <tr>
            <th>Product</th>
            <th className="numeric">Quantity</th>
            <th>Unit</th>
            {order && <th className="numeric">Received</th>}
            {order && <th className="numeric">Outstanding</th>}
            <th className="numeric">Unit price</th>
            <th>Tax</th>
            <th className="numeric">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line: any) => (
            <tr key={line.id}>
              <td>
                <strong>{line.product_snapshot?.name || 'Product'}</strong>
                <small>{line.product_snapshot?.sku || ''}</small>
              </td>
              <td className="numeric">{displayQuantity(line.quantity_milli)}</td>
              <td>{line.product_snapshot?.unit || 'unit'}</td>
              {order && <td className="numeric">{displayQuantity(received[line.id] || 0)}</td>}
              {order && (
                <td className="numeric">
                  {displayQuantity(Math.max(0, line.quantity_milli - (received[line.id] || 0)))}
                </td>
              )}
              <td className="numeric">
                {money(line.unit_price_minor || 0, record.data?.currency || 'KES')}
              </td>
              <td>0.00%</td>
              <td className="numeric">{money(lineTotal(line), record.data?.currency || 'KES')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderSmartButtons({
  detail,
  bills,
  onOpen,
}: {
  detail: any;
  bills: any[];
  onOpen: (type: string, id: string) => void;
}) {
  return (
    <div className="proc-smart-buttons">
      <button
        onClick={() => {
          const first = detail.receipts?.[0];
          if (first) onOpen('receipt', first.id);
        }}
        disabled={!detail.receipts?.length}
      >
        <Icon name="box" />
        <strong>{detail.receipts?.length || 0}</strong>
        <span>Receipts</span>
      </button>
      <button onClick={() => bills[0] && onOpen('bill', bills[0].id)} disabled={!bills.length}>
        <Icon name="document" />
        <strong>{bills.length}</strong>
        <span>Vendor bills</span>
      </button>
    </div>
  );
}

function ReceiptForm({
  record,
  detail,
  onSubmit,
}: {
  record: any;
  detail: any;
  onSubmit: (payload: any) => Promise<void>;
}) {
  const lines = (record.data?.lines || []).filter(
    (line: any) =>
      line.product_snapshot?.track_inventory &&
      (detail.received?.[line.id] || 0) < line.quantity_milli,
  );
  const [error, setError] = useState('');
  if (!lines.length)
    return (
      <p className="alert">
        All tracked quantities have been inspected. Untracked services do not produce stock
        receipts.
      </p>
    );
  return (
    <details className="proc-receipt" open>
      <summary>Inspect a goods delivery</summary>
      <p>
        Record one physical delivery. Accepted quantities increase stock; rejected quantities remain
        visible and never increase available stock. Replacement deliveries fill the remaining
        accepted quantity.
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <Form
        submit={async (data) => {
          try {
            const quantities = lines
              .map((line: any) => ({
                line_id: line.id,
                accepted_milli: quantityMilli(String(data['accepted_' + line.id] || '0')),
                rejected_milli: quantityMilli(String(data['rejected_' + line.id] || '0')),
              }))
              .filter((line: any) => line.accepted_milli + line.rejected_milli > 0);
            await onSubmit({
              expected_version: record.version,
              reference: String(data.reference),
              received_on: String(data.date),
              inspection: String(data.inspection),
              lines: quantities,
            });
          } catch (reason) {
            setError((reason as Error).message);
          }
        }}
      >
        <div className="proc-form-grid">
          <Field label="Delivery reference">
            <input name="reference" required minLength={2} />
          </Field>
          <Field label="Received on">
            <input name="date" type="date" defaultValue={today()} required />
          </Field>
        </div>
        {lines.map((line: any) => {
          const remaining = line.quantity_milli - (detail.received?.[line.id] || 0);
          return (
            <fieldset key={line.id} className="proc-line-fieldset">
              <legend>
                {line.product_snapshot.name} · {displayQuantity(remaining)}{' '}
                {line.product_snapshot.unit} remaining
              </legend>
              <div className="proc-form-grid">
                <Field label="Accepted quantity">
                  <input
                    name={'accepted_' + line.id}
                    type="number"
                    step="0.001"
                    min="0"
                    max={displayQuantity(remaining)}
                    defaultValue={displayQuantity(remaining)}
                    required
                  />
                </Field>
                <Field label="Rejected quantity">
                  <input
                    name={'rejected_' + line.id}
                    type="number"
                    step="0.001"
                    min="0"
                    max={displayQuantity(remaining)}
                    defaultValue="0"
                    required
                  />
                </Field>
              </div>
            </fieldset>
          );
        })}
        <Field label="Inspection findings">
          <textarea name="inspection" required minLength={8} maxLength={2000} />
        </Field>
        <button className="button">Post inspected delivery</button>
      </Form>
    </details>
  );
}

function BillPanel({
  record,
  detail,
  balance,
  finance,
  writable,
  onPayment,
}: {
  record: any;
  detail: any;
  balance: any;
  finance: boolean;
  writable: boolean;
  onPayment: (payload: any) => Promise<void>;
}) {
  const [error, setError] = useState('');
  return (
    <section className="proc-bill-panel">
      <h3>Supplier payable</h3>
      {detail.matching && (
        <p className={detail.matching.eligible ? 'alert' : 'alert error'}>
          {detail.matching.reason}
        </p>
      )}
      {balance ? (
        <>
          <div className="proc-doc-totals">
            <span>
              Paid observations <strong>{money(balance.paid_minor, record.data?.currency)}</strong>
            </span>
            <span>
              Approved credits{' '}
              <strong>{money(balance.credited_minor, record.data?.currency)}</strong>
            </span>
            <span className="grand">
              Outstanding <strong>{money(balance.outstanding_minor, record.data?.currency)}</strong>
            </span>
          </div>
          <p>{balance.assurance}</p>
        </>
      ) : (
        <p className="muted">Payable balance is available to financial roles.</p>
      )}
      {finance &&
        writable &&
        record.status === 'approved' &&
        balance &&
        balance.outstanding_minor > 0 && (
          <details className="proc-receipt">
            <summary>Record a manual payment observation</summary>
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <Form
              submit={async (data) => {
                try {
                  await onPayment({
                    expected_version: record.version,
                    reference: String(data.reference),
                    paid_on: String(data.date),
                    amount_minor: Number(data.amount),
                    note: String(data.note),
                  });
                } catch (reason) {
                  setError((reason as Error).message);
                }
              }}
            >
              <Field label="Payment reference">
                <input name="reference" required minLength={2} />
              </Field>
              <Field label="Observed payment date">
                <input
                  name="date"
                  type="date"
                  min={record.data?.issued_on}
                  defaultValue={today()}
                  required
                />
              </Field>
              <Field label="Amount in minor units">
                <input
                  name="amount"
                  type="number"
                  min={1}
                  max={balance.outstanding_minor}
                  required
                />
              </Field>
              <Field label="Evidence and source note">
                <textarea name="note" required minLength={8} />
              </Field>
              <button className="secondary-button">Record observation</button>
            </Form>
          </details>
        )}
      <p className="muted">
        A vendor bill is not a stock receipt and does not prove payment. Three-way matching is
        checked from the issued order and accepted quantities.
      </p>
    </section>
  );
}

function OfferComparison({
  detail,
  onOpen,
}: {
  detail: any;
  onOpen: (type: string, id: string) => void;
}) {
  const offers = detail.offers || [];
  const currencies = [...new Set(offers.map((offer: any) => offer.data?.currency).filter(Boolean))];
  return (
    <section className="proc-comparison">
      <h3>Recorded supplier offers · {offers.length}</h3>
      {offers.length ? (
        <>
          <p>
            Compare currency, delivery dates and quantities as well as price. Selection is an
            explicit supplier-offer decision inside that exact offer.
          </p>
          {currencies.length > 1 && <p className="alert" role="note">These quotations use different currencies. Prices are shown in each offer's currency and are not converted into a common basis.</p>}
          <ComparisonTable rows={comparisonRows(offers)} onOpen={onOpen} />
          <div className="proc-offer-cards">
            {offers.map((offer: any) => (
              <button
                key={offer.id}
                className="proc-offer-card"
                onClick={() => onOpen('rfq', offer.id)}
              >
                <span>
                  <Pill status={offer.status} />
                  <strong>{offer.data?.reference}</strong>
                  <small>
                    {offer.data?.supplier_snapshot?.name} ·{' '}
                    {offer.data?.delivery_on || 'No delivery'}
                  </small>
                </span>
                <span className="numeric">
                  {money(offer.data?.total_minor || 0, offer.data?.currency || 'KES')}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p>
          No supplier offers are linked yet. An approved purchase request is required before
          recording an offer.
        </p>
      )}
    </section>
  );
}

function AgreementLinks({ detail, onOpen }: { detail: any; onOpen: (type: string, id: string) => void }) {
  const agreement = detail.record;
  const orders = (detail.linked_orders || []).filter((row: any) => ['issued', 'confirmed'].includes(row.status));
  return (
    <section className="proc-comparison">
      <h3>Agreement commitments</h3>
      <div className="proc-table-wrap">
        <table className="proc-table">
          <thead><tr><th>Product</th><th className="numeric">Agreed quantity</th><th className="numeric">Ordered</th><th className="numeric">Remaining</th><th className="numeric">Contract price</th></tr></thead>
          <tbody>{(agreement.data.lines || []).map((line: any) => {
            const used = orders.flatMap((order: any) => order.data.lines || []).filter((item: any) => item.product_id === line.product_id).reduce((sum: number, item: any) => sum + Number(item.quantity_milli || 0), 0);
            return <tr key={line.id}><td>{line.product_snapshot?.name || 'Product'}</td><td className="numeric">{displayQuantity(line.quantity_milli)}</td><td className="numeric">{displayQuantity(used)}</td><td className="numeric">{displayQuantity(Math.max(0, line.quantity_milli - used))}</td><td className="numeric">{money(line.unit_price_minor, agreement.data.currency)}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <h3>Linked quotations</h3>
      <ComparisonTable rows={comparisonRows(detail.offers || [])} onOpen={onOpen} />
      <h3>Issued orders</h3>
      {orders.length ? <div className="proc-table-wrap"><table className="proc-table"><thead><tr><th>Reference</th><th>Delivery</th><th>Currency</th><th className="numeric">Total</th><th>Status</th><th></th></tr></thead><tbody>{orders.map((order: any) => <tr key={order.id}><td>{order.data.reference}</td><td>{order.data.delivery_on || '—'}</td><td>{order.data.currency}</td><td className="numeric">{money(order.data.total_minor, order.data.currency)}</td><td><Pill status={order.status} /></td><td><button className="secondary-button" onClick={() => onOpen('order', order.id)}>Open</button></td></tr>)}</tbody></table></div> : <p>No issued orders are linked to this agreement.</p>}
      <p className="proc-coverage">Order quantities count only after issue. Draft and approved orders do not consume the contracted quantity.</p>
    </section>
  );
}

function ComparisonTable({
  rows,
  onOpen,
}: {
  rows: any[];
  onOpen: (type: string, id: string) => void;
}) {
  if (!rows.length) return <p>No comparable product lines are available.</p>;
  return (
    <div className="proc-table-wrap">
      <table className="proc-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Supplier</th>
            <th>Reference</th>
            <th className="numeric">Quantity</th>
            <th className="numeric">Unit price</th>
            <th>Expected arrival</th>
            <th className="numeric">Total</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((group) =>
            group.offers.map((offer: any) => (
              <tr key={group.product + offer.offer_id}>
                <td>
                  {group.product}
                  <small>{group.sku}</small>
                </td>
                <td>{offer.supplier}</td>
                <td>{offer.reference}</td>
                <td className="numeric">{displayQuantity(offer.quantity_milli)}</td>
                <td className="numeric">{money(offer.unit_price_minor, offer.currency)}</td>
                <td>{offer.delivery_on || '—'}</td>
                <td className="numeric">{money(offer.amount_minor, offer.currency)}</td>
                <td>
                  <Pill status={offer.status} />
                </td>
                <td>
                  <button
                    className="secondary-button"
                    onClick={() => onOpen('rfq', offer.offer_id)}
                  >
                    Open offer
                  </button>
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function DecisionStrip({
  type,
  record,
  canReview,
  writable,
  onAction,
}: {
  type: string;
  record: any;
  canReview: boolean;
  writable: boolean;
  onAction: (action: string, reason: string) => void;
}) {
  const draft = record.status === 'draft';
  const approvalType = ['request', 'order', 'bill', 'credit'].includes(type);
  return (
    <section className="proc-decisions">
      {writable && type === 'request' && draft && (
        <div className="proc-decision-block">
          <h3>Request approval</h3>
          <p>Submit this draft so a separate owner or administrator can review its exact version.</p>
          <ActionForm label="Submit for approval" action="submit" onSubmit={onAction} primary />
        </div>
      )}
      {writable && approvalType && (type === 'request' ? record.status === 'submitted' : draft) && (
        <div className="proc-decision-block">
          <h3>Separate-person decision</h3>
          <p>
            {canReview
              ? 'Approve or reject this exact retained version.'
              : 'A different current owner or administrator must record this decision.'}
          </p>
          {canReview && (
            <>
              <ActionForm
                label="Approve exact version"
                action="approve"
                onSubmit={onAction}
                primary
              />
              <ActionForm label="Reject with reason" action="reject" onSubmit={onAction} />
            </>
          )}
        </div>
      )}
      {writable && type === 'rfq' && draft && (
        <div className="proc-decision-block">
          <h3>Quotation award decision</h3>
          <p>Compare alternatives, then record one winning offer for this request. This does not issue an order or send an email.</p>
          <ActionForm label="Award this supplier offer" action="accept" onSubmit={onAction} primary />
          <ActionForm label="Reject supplier offer" action="reject" onSubmit={onAction} />
        </div>
      )}
      {writable && type === 'agreement' && draft && (
        <div className="proc-decision-block">
          <h3>Agreement confirmation</h3>
          <p>A different owner or administrator must activate the contracted quantities and prices.</p>
          {canReview && <ActionForm label="Confirm agreement" action="confirm" onSubmit={onAction} primary />}
        </div>
      )}
      {writable && type === 'agreement' && record.status === 'confirmed' && (
        <div className="proc-decision-block">
          <h3>Agreement closure</h3>
          <p>Draft quotations linked to the agreement must be resolved before closure.</p>
          <ActionForm label="Close agreement" action="close" onSubmit={onAction} />
        </div>
      )}
      {writable && type === 'order' && record.status === 'approved' && (
        <div className="proc-decision-block">
          <h3>Issue purchase order</h3>
          <p>Issue creates planned incoming stock for tracked lines. It does not receive goods.</p>
          <ActionForm label="Issue reviewed order" action="issue" onSubmit={onAction} primary />
        </div>
      )}
      {writable && type === 'order' && record.status === 'issued' && (
        <div className="proc-decision-block">
          <h3>Supplier confirmation</h3>
          <p>Record a manually confirmed supplier acknowledgement. This is not courier proof.</p>
          <ActionForm label="Record supplier confirmation" action="confirm" onSubmit={onAction} />
        </div>
      )}
      {writable &&
        !['receipt', 'payment', 'supplier'].includes(type) &&
        !['cancelled', 'rejected'].includes(record.status) &&
        !(type === 'bill' && record.status === 'approved') && (
          <div className="proc-decision-block danger">
            <h3>Cancel remaining workflow</h3>
            <p>
              History and posted evidence are retained. Approved bills require a supplier credit
              instead.
            </p>
            <ActionForm label="Cancel remaining workflow" action="cancel" onSubmit={onAction} />
          </div>
        )}
    </section>
  );
}

function ActionForm({
  label,
  action,
  onSubmit,
  primary,
}: {
  label: string;
  action: string;
  onSubmit: (action: string, reason: string) => void;
  primary?: boolean;
}) {
  return (
    <details className={primary ? 'proc-action primary' : 'proc-action'}>
      <summary className={primary ? 'button' : 'secondary-button'}>{label}</summary>
      <Form
        submit={async (data) => {
          await onSubmit(action, String(data.reason));
        }}
      >
        <Field label="Reason for this exact decision">
          <textarea name="reason" required minLength={8} maxLength={1000} />
        </Field>
        <button className={primary ? 'button' : 'secondary-button'}>{label}</button>
      </Form>
    </details>
  );
}

function SettingsView({
  writable,
  finance,
  review,
  go,
}: {
  writable: boolean;
  finance: boolean;
  review: boolean;
  go: (view: ProcurementView) => void;
}) {
  return (
    <>
      <header className="proc-page-heading">
        <div>
          <p className="proc-eyebrow">Configuration</p>
          <h1>Purchasing Settings</h1>
          <p>
            This workspace delegates purchasing rules to the Procurement service and financial
            authority to the finance role.
          </p>
        </div>
      </header>
      <div className="proc-info-grid">
        <section className="panel">
          <h3>Supported controls</h3>
          <dl>
            <dt>Record purchase</dt>
            <dd>{writable ? 'Operations role available' : 'Read-only'}</dd>
            <dt>Approve exact version</dt>
            <dd>
              {review
                ? 'Owner or administrator · separate person'
                : 'Reviewer authority unavailable'}
            </dd>
            <dt>Vendor bills and payments</dt>
            <dd>{finance ? 'Financial role available' : 'Financial role required'}</dd>
            <dt>Approval basis</dt>
            <dd>One exact retained version; prepared-by cannot approve</dd>
          </dl>
        </section>
        <section className="panel">
          <h3>Available purchasing records</h3>
          <p>Supplier pricelists, purchase agreements and reusable templates are stored against the shared supplier and product records. Agreement confirmation needs a separate owner or administrator.</p>
          <p>Approval limits, department-level policies, supplier portals and automated RFQ email delivery are not configured here. Draft quotations can be reviewed, printed or copied, but are never marked as sent.</p>
          <p>Goods receiving remains owned by Inventory. Bills and payment evidence remain separate from stock and are never inferred from a receipt.</p>
        </section>
      </div>
      <div className="proc-settings-links">
        <button className="secondary-button" onClick={() => go('vendors')}>
          Manage vendors
        </button>
        <button className="secondary-button" onClick={() => go('approvals')}>
          Review approval queue
        </button>
        <button className="secondary-button" onClick={() => go('pricelists')}>
          Vendor pricelist status
        </button>
      </div>
    </>
  );
}

function VendorsView({
  suppliers,
  orders,
  rfqs,
  search,
  setSearch,
  total,
  page,
  setPage,
  pages,
  writable,
  onCreate,
  onOpen,
}: {
  suppliers: any[];
  orders: any[];
  rfqs: any[];
  search: string;
  setSearch: (value: string) => void;
  total: number;
  page: number;
  setPage: (value: number) => void;
  pages: number;
  writable: boolean;
  onCreate: () => void;
  onOpen: (type: string, id: string) => void;
}) {
  const rows = suppliers;
  return (
    <>
      <header className="proc-page-heading">
        <div>
          <p className="proc-eyebrow">Orders</p>
          <h1>Vendors</h1>
          <p>
            Vendor profiles reuse canonical customer/contact identities. A supplier profile adds
            purchasing terms and lead time.
          </p>
        </div>
        {writable && (
          <button className="button" onClick={onCreate}>
            New vendor profile
          </button>
        )}
      </header>
      <div className="proc-toolbar">
        <label className="proc-search">
          <Icon name="search" />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(0); }}
            placeholder="Search vendors"
            aria-label="Search vendors"
          />
        </label>
        <span className="proc-count">{rows.length} of {total} profiles</span>
      </div>
      {!rows.length ? (
        <div className="proc-empty">
          <h2>No vendor profiles</h2>
          <p>Create or reuse a canonical contact in Customers, then add its supplier terms here.</p>
        </div>
      ) : (
        <div className="proc-table-wrap">
          <table className="proc-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Contact</th>
                <th>Terms</th>
                <th className="numeric">Lead time</th>
                <th className="numeric">Open orders</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = orders.filter(
                  (order) =>
                    order.data?.supplier_id === row.id &&
                    ['issued', 'confirmed'].includes(order.status),
                ).length;
                const offers = rfqs.filter((offer) => offer.data?.supplier_id === row.id).length;
                return (
                  <tr key={row.id} onClick={() => onOpen('supplier', row.id)} tabIndex={0}>
                    <td>
                      <strong>{row.data?.contact_snapshot?.name}</strong>
                      <small>{offers} recorded offers</small>
                    </td>
                    <td>{row.data?.contact_snapshot?.email || '—'}</td>
                    <td>
                      <span className="proc-truncate">{row.data?.terms || '—'}</span>
                    </td>
                    <td className="numeric">{row.data?.lead_days || 0} days</td>
                    <td className="numeric">{open}</td>
                    <td>
                      <Pill status={row.status} />
                    </td>
                    <td>
                      <button
                        className="secondary-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen('supplier', row.id);
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={pages} setPage={setPage} label={total + ' vendors'} />
    </>
  );
}

function ProductsView({
  api,
  selected,
  setSelected,
}: {
  api: API;
  selected: any;
  setSelected: (v: any) => void;
}) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const search = new URLSearchParams({ q: query, limit: '50', offset: String(page * 50) });
    api('/products?' + search.toString()).then((result) => {
      if (live) { setRows(result.data || []); setTotal(result.total || 0); setLoading(false); }
    }).catch(() => { if (live) { setRows([]); setTotal(0); setLoading(false); } });
    return () => { live = false; };
  }, [api, query, page]);
  useEffect(() => {
    let live = true;
    if (!selected) { setHistory([]); return; }
    api('/procurement?type=order&search=' + encodeURIComponent(selected.id) + '&limit=100')
      .then((result) => { if (live) setHistory(purchaseHistoryForProduct(result.data || [], selected.id)); })
      .catch(() => { if (live) setHistory([]); });
    return () => { live = false; };
  }, [api, selected?.id]);
  return (
    <>
      <header className="proc-page-heading">
        <div>
          <p className="proc-eyebrow">Products</p>
          <h1>Purchasing Products</h1>
          <p>
            Canonical products from the Products service. Negotiated supplier prices belong to
            recorded offers and orders.
          </p>
        </div>
      </header>
      <div className="proc-toolbar">
        <label className="proc-search">
          <Icon name="search" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            placeholder="Search products or SKU"
            aria-label="Search products"
          />
        </label>
        <span className="proc-count">{rows.length} of {total} products</span>
      </div>
      {loading && <p role="status">Searching shared products…</p>}
      <div className="proc-product-grid">
        {rows.map((product) => (
          <button
            key={product.id}
            className={'proc-product-card' + (selected?.id === product.id ? ' active' : '')}
            onClick={() => setSelected(product)}
          >
            <span className="proc-product-mark">
              <Icon name="box" />
            </span>
            <span>
              <strong>{product.name}</strong>
              <small>
                {product.sku || 'No SKU'} · {product.unit}
              </small>
            </span>
            <span className="numeric">
              {money(product.purchase_cost_minor || 0, product.currency || 'KES')}
              <small>Reference cost</small>
            </span>
          </button>
        ))}
      </div>
      {!rows.length && (
        <p className="proc-empty">
          No canonical products are available. Add products in the shared Products service first.
        </p>
      )}
      <Pager page={page} pages={pageCount(total, 50)} setPage={setPage} label={total + ' products'} />
      {selected && (
        <section className="panel proc-product-detail">
          <header>
            <div>
              <h2>{selected.name}</h2>
              <p>
                {selected.sku || 'No SKU'} · {selected.unit} ·{' '}
                {selected.category || 'Uncategorised'}
              </p>
            </div>
            <button className="quiet-button" onClick={() => setSelected(null)}>
              Close
            </button>
          </header>
          <div className="proc-info-grid">
            <section>
              <h3>Purchase reference</h3>
              <p>
                Reference cost{' '}
                {money(selected.purchase_cost_minor || 0, selected.currency || 'KES')} · sale price{' '}
                {money(selected.sale_price_minor || 0, selected.currency || 'KES')}.
              </p>
              <p>
                {selected.track_inventory
                  ? 'Tracked in Inventory. Purchase orders create planned incoming receipts when issued.'
                  : 'Untracked service. No stock receipt is posted for its purchase lines.'}
              </p>
            </section>
            <section>
              <h3>Recorded purchase history</h3>
              {history.length ? (
                history.map((row, index) => (
                  <p key={index}>
                    {row.reference} · {row.vendor || 'Vendor'} ·{' '}
                    {displayQuantity(row.quantity_milli)} {selected.unit} at{' '}
                    {money(row.unit_price_minor, row.currency)}
                  </p>
                ))
              ) : (
                <p>No purchase order history is loaded for this product.</p>
              )}
            </section>
          </div>
        </section>
      )}
    </>
  );
}

function VendorReport({ rows }: { rows: any[] }) {
  return (
    <>
      <header className="proc-page-heading">
        <div>
          <p className="proc-eyebrow">Reporting</p>
          <h1>Purchases by Vendor</h1>
          <p>
            Confirmed issued purchase commitments grouped by canonical vendor identity and kept
            separate by currency.
          </p>
        </div>
      </header>
      {!rows.length ? (
        <div className="proc-empty">
          <h2>No confirmed purchases</h2>
          <p>Issue an approved purchase order to include it in this analysis.</p>
        </div>
      ) : (
        <div className="proc-table-wrap">
          <table className="proc-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th className="numeric">Orders</th>
                <th className="numeric">Committed value</th>
                <th className="numeric">Open orders</th>
                <th>Currency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.vendor + row.currency}>
                  <td>{row.vendor}</td>
                  <td className="numeric">{row.order_count}</td>
                  <td className="numeric">{money(row.value_minor, row.currency)}</td>
                  <td className="numeric">{row.open_orders}</td>
                  <td>{row.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="proc-coverage">Server aggregated the full authorized order set. Committed purchase value is not cash paid; each currency is shown separately.</p>
    </>
  );
}

function ProductReport({ rows }: { rows: any[] }) {
  return (
    <>
      <header className="proc-page-heading">
        <div>
          <p className="proc-eyebrow">Reporting</p>
          <h1>Purchases by Product</h1>
          <p>Ordered quantities and committed values from issued purchase orders.</p>
        </div>
      </header>
      {!rows.length ? (
        <div className="proc-empty">
          <h2>No purchased products</h2>
          <p>Confirmed purchase orders will populate this analysis.</p>
        </div>
      ) : (
        <div className="proc-table-wrap">
          <table className="proc-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="numeric">Quantity ordered</th>
                <th>Unit</th>
                <th className="numeric">Committed value</th>
                <th>Currency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.product + row.currency}>
                  <td>{row.product}</td>
                  <td>{row.sku || '—'}</td>
                  <td className="numeric">{displayQuantity(row.quantity_milli)}</td>
                  <td>{row.unit}</td>
                  <td className="numeric">{money(row.value_minor, row.currency)}</td>
                  <td>{row.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="proc-coverage">
        Server aggregated the full authorized order set. Received quantities remain in Inventory; this is ordered quantity, not accepted stock.
      </p>
    </>
  );
}

function ApprovalReport({ lists }: { lists: Record<string, any[]> }) {
  const counts = approvalCounts({
    requests: lists.request,
    rfqs: lists.rfq,
    orders: lists.order,
    bills: lists.bill,
    credits: lists.credit,
  });
  return (
    <>
      <header className="proc-page-heading">
        <div>
          <p className="proc-eyebrow">Reporting</p>
          <h1>Approval Performance</h1>
          <p>
            Current exact-version states. Average approval time is not available because duration
            records are not exposed as a report field.
          </p>
        </div>
      </header>
      <div className="proc-metric-row">
        <Metric label="Drafts" value={counts.drafts} />
        <Metric label="Approved" value={counts.approved} />
        <Metric label="Accepted offers" value={counts.accepted} />
        <Metric label="Rejected" value={counts.rejected} />
        <Metric label="Cancelled" value={counts.cancelled} />
      </div>
      <section className="panel">
        <h3>Decision rules</h3>
        <p>
          A request, order, bill or credit is approved by a different current owner or
          administrator. Supplier offers are accepted separately. No average-time figure is inferred
          without a complete decision-duration source.
        </p>
      </section>
    </>
  );
}

function ReceiptReport({
  orders,
  rfqs,
  receipts,
}: {
  orders: any[];
  rfqs: any[];
  receipts: any[];
}) {
  const open = orders.filter(
    (order) =>
      ['issued', 'confirmed'].includes(order.status) &&
      orderHasOpenReceipt(order, { received: {} }),
  );
  const late = orders.filter((order) =>
    lateReceipt(
      order,
      rfqs.find((r) => r.id === order.data?.rfq_id),
    ),
  );
  return (
    <>
      <header className="proc-page-heading">
        <div>
          <p className="proc-eyebrow">Reporting</p>
          <h1>Receipt Performance</h1>
          <p>
            Expected arrivals and open purchase orders from the loaded page. Planned incoming goods
            are not received stock.
          </p>
        </div>
      </header>
      <div className="proc-metric-row">
        <Metric
          label="Posted receipts"
          value={receipts.filter((r) => r.status === 'posted').length}
        />
        <Metric label="Open orders" value={open.length} />
        <Metric label="Late expected" value={late.length} />
      </div>
      <div className="proc-table-wrap">
        <table className="proc-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Vendor</th>
              <th>Expected arrival</th>
              <th>Status</th>
              <th>Timing</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders
              .filter((order) => ['issued', 'confirmed'].includes(order.status))
              .map((order) => {
                const rfq = rfqs.find((r) => r.id === order.data?.rfq_id);
                const isLate = lateReceipt(order, rfq);
                return (
                  <tr key={order.id}>
                    <td>{order.data?.reference}</td>
                    <td>{order.data?.supplier_snapshot?.name || '—'}</td>
                    <td>{order.data?.delivery_on || '—'}</td>
                    <td>
                      <Pill status={order.status} />
                    </td>
                    <td>
                      {isLate ? (
                        <span className="proc-late">Past expected arrival</span>
                      ) : (
                        'Within recorded window'
                      )}
                    </td>
                    <td>
                      <span className="muted">Open order to inspect quantities</span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <p className="proc-coverage">
        Receipt timing is derived from the recorded expected arrival and today’s date. It is not
        courier proof or supplier scorecard.
      </p>
    </>
  );
}

function NewMenu({ onCreate }: { onCreate: (type: string) => void }) {
  return (
    <details className="proc-new">
      <summary className="button">
        New
        <Icon name="down" />
      </summary>
      <div>
        <button onClick={() => onCreate('request')}>Purchase request</button>
        <button onClick={() => onCreate('rfq')}>Supplier offer</button>
        <button onClick={() => onCreate('supplier')}>Vendor profile</button>
      </div>
    </details>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="proc-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Pill({ status }: { status: string }) {
  return (
    <span className={'proc-pill proc-pill-' + (status || '').replaceAll('_', '-')}>
      {labelForStatus(status)}
    </span>
  );
}

function Pager({
  page,
  pages,
  setPage,
  label,
}: {
  page: number;
  pages: number;
  setPage: (v: number) => void;
  label: string;
}) {
  return (
    <div className="proc-pager">
      <span>
        {label} · page {page + 1} of {pages}
      </span>
      <div>
        <button
          className="secondary-button"
          disabled={page <= 0}
          onClick={() => setPage(page - 1)}
          aria-label="Previous page"
        >
          <Icon name="left" />
        </button>
        <button
          className="secondary-button"
          disabled={page + 1 >= pages}
          onClick={() => setPage(page + 1)}
          aria-label="Next page"
        >
          <Icon name="right" />
        </button>
      </div>
    </div>
  );
}

function VendorDocument({
  record,
  detail,
  writable,
  onBack,
  onRevise,
}: {
  record: any;
  detail: any;
  writable: boolean;
  onBack: () => void;
  onRevise: (record: any) => void;
}) {
  const data = record.data || {};
  return (
    <article className="proc-doc">
      <header className="proc-doc-head">
        <div>
          <button className="proc-back" onClick={onBack}>
            <Icon name="left" />
            Back to vendors
          </button>
          <p className="proc-eyebrow">Vendor profile</p>
          <h1>{data.contact_snapshot?.name || 'Vendor'}</h1>
          <div className="proc-doc-meta">
            <Pill status={record.status} />
            <span>Retained version {record.version}</span>
          </div>
        </div>
        <div className="proc-doc-actions">
          {writable && record.status === 'draft' && (
            <button className="secondary-button" onClick={() => onRevise(record)}>
              Revise vendor profile
            </button>
          )}
        </div>
      </header>
      <div className="proc-doc-facts">
        <div>
          <span>Contact</span>
          <strong>{data.contact_snapshot?.name || '—'}</strong>
          <small>{data.contact_snapshot?.email || 'No email recorded'}</small>
        </div>
        <div>
          <span>Supplier terms</span>
          <strong>{data.terms || 'No terms recorded'}</strong>
          <small>Recorded manually; not an enforceable contract</small>
        </div>
        <div>
          <span>Lead time</span>
          <strong>{data.lead_days || 0} days</strong>
          <small>Reference planning value, not a delivery promise</small>
        </div>
        <div>
          <span>Purchase history</span>
          <strong>{detail.purchase_summary?.orders ?? '—'} orders</strong>
          <small>Derived only when the service exposes linked orders</small>
        </div>
      </div>
      <section className="proc-info-grid">
        <section>
          <h3>Canonical identity</h3>
          <p>
            The supplier profile references customer/contact record <code>{data.contact_id}</code>.
            Editing that contact is performed in the shared Customers service; this profile only
            stores purchasing terms.
          </p>
        </section>
        <section>
          <h3>Activity</h3>
          {(detail.history || []).map((entry: any) => (
            <p key={entry.version}>
              Version {entry.version} · {String(entry.action || 'recorded').replaceAll('_', ' ')} ·{' '}
              {new Date(entry.created_at).toLocaleString('en-KE')}
            </p>
          ))}
          {!detail.history?.length && <p>No retained actions yet.</p>}
        </section>
      </section>
    </article>
  );
}

function ReceiptDetail({ record }: { record: any }) {
  const data = record.data || {};
  return (
    <section className="proc-info-grid">
      <section>
        <h3>Inspection</h3>
        <dl>
          <dt>Reference</dt>
          <dd>{data.reference || '—'}</dd>
          <dt>Received on</dt>
          <dd>{data.received_on || '—'}</dd>
          <dt>Inspection</dt>
          <dd>{data.inspection || '—'}</dd>
        </dl>
      </section>
      <section>
        <h3>Accepted quantities</h3>
        {(data.lines || []).map((line: any) => (
          <p key={line.line_id}>
            <strong>{line.product_snapshot?.name || line.product_name || 'Purchase line'}</strong> ·
            accepted {displayQuantity(line.accepted_milli || 0)} · rejected{' '}
            {displayQuantity(line.rejected_milli || 0)}
          </p>
        ))}
      </section>
    </section>
  );
}

function PaymentDetail({ record }: { record: any }) {
  const data = record.data || {};
  return (
    <section className="proc-info-grid">
      <section>
        <h3>Manual payment observation</h3>
        <dl>
          <dt>Reference</dt>
          <dd>{data.reference || '—'}</dd>
          <dt>Observed on</dt>
          <dd>{data.paid_on || '—'}</dd>
          <dt>Amount</dt>
          <dd>{money(data.amount_minor || 0, data.currency || 'KES')}</dd>
        </dl>
        <p>{data.note || 'No evidence note recorded.'}</p>
      </section>
      <section>
        <h3>Assurance</h3>
        <p>{data.assurance || 'No bank or provider confirmation is attached.'}</p>
        <p className="muted">A recorded observation does not execute or prove a bank payment.</p>
      </section>
    </section>
  );
}

function labelForStage(stage: string, type: string) {
  if (type === 'request') return stage === 'draft' ? 'Draft request' : 'Approved';
  if (type === 'rfq') return stage === 'draft' ? 'Draft offer' : 'Accepted';
  if (type === 'order')
    return stage === 'draft'
      ? 'Draft order'
      : stage === 'approved'
        ? 'Approved'
        : stage === 'issued'
          ? 'Purchase order'
          : 'Confirmed';
  return stage === 'draft' ? 'Draft' : 'Approved';
}

function shortActor(id: string) {
  return id ? String(id).slice(0, 8) : 'System';
}
