import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { DataTable } from '../components/DataTable';
import { Overlay } from '../components/Overlay';
import { Field, money, type API } from '../operations/UI';
import { parseMoney } from '../../../src/finance/money';
import { FinanceDashboard } from './lazy-workspaces';
import { FinancialOverview } from '../finance/FinancialOverview';
import { MoneyTools } from '../marketplace/MoneyTools';
import { PaymentCentre } from '../finance/PaymentCentre';
import { RecordFinanceDetails } from '../finance/RecordFinanceDetails';
import { appNavigationEvent } from './AppNavigation';
import { FinanceOperationsOverview } from './FinanceOperationsOverview';
import './finance-app.css';

const currencies = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'];
const pageSize = 20;
const todayIn = (timezone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());

type Props = {
  api: API;
  scope: string;
  section?: string;
  navigate: (tab: string) => void;
  openRecord?: (tab: string, id: string) => void;
  services?: any[];
  writable?: boolean;
  role?: string;
  timezone?: string;
  admin?: boolean;
};

export function FinanceAppWorkspace({
  api,
  scope,
  section = 'dashboard',
  navigate,
  openRecord,
  services = [],
  writable = false,
  role = 'viewer',
  timezone = 'Africa/Nairobi',
  admin = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [customerLookup, setCustomerLookup] = useState('');
  const [status, setStatus] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [customerId, setCustomerId] = useState('');
  const [issueFrom, setIssueFrom] = useState('');
  const [issueTo, setIssueTo] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [asOf, setAsOf] = useState(todayIn(timezone));
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [records, setRecords] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerLoadError, setCustomerLoadError] = useState('');
  const [balances, setBalances] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createKind, setCreateKind] = useState<'invoice' | 'customer' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const operationsMenu = useRef<HTMLDetailsElement>(null);

  const activeService = (id: string) =>
    services.some((service) => service.id === id && service.status === 'active');
  const invoiceAvailable = activeService('invoicing');
  const expenseAvailable = activeService('expenses');
  const customerWritable = ['owner', 'admin', 'operations', 'finance', 'accountant'].includes(role);
  const paymentAvailable = activeService('payments');
  const reconciliationAvailable = activeService('reconciliation');
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!operationsMenu.current?.contains(event.target as Node))
        operationsMenu.current?.removeAttribute('open');
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') operationsMenu.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);
  const navigateSection = (value: string) => {
    const url = new URL(location.href);
    url.searchParams.set('app', 'finance');
    url.searchParams.set('section', value);
    url.hash = encodeURIComponent('Apps');
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event(appNavigationEvent));
    navigate('Apps');
  };
  const closeOperationsMenu = () => operationsMenu.current?.removeAttribute('open');
  const navigateFromMenu = (value: string) => {
    closeOperationsMenu();
    navigateSection(value);
  };
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (query.trim()) params.set('q', query.trim());
    if (section === 'Invoices') {
      if (status) params.set('status', status);
      if (currency) params.set('currency', currency);
      if (customerId) params.set('customer_id', customerId);
      if (issueFrom) params.set('issue_from', issueFrom);
      if (issueTo) params.set('issue_to', issueTo);
      if (dueFrom) params.set('due_from', dueFrom);
      if (dueTo) params.set('due_to', dueTo);
    }
    return params.toString();
  }, [query, status, currency, customerId, issueFrom, issueTo, dueFrom, dueTo, page, section]);

  useEffect(() => {
    setPage(0);
  }, [section, query, status, currency, customerId, issueFrom, issueTo, dueFrom, dueTo, asOf]);

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ limit: '100' });
    if (customerLookup.trim()) params.set('q', customerLookup.trim());
    setCustomerLoadError('');
    api('/records/customers?' + params)
      .then((result) => live && setCustomers(result.data || []))
      .catch((reason) => {
        if (!live) return;
        setCustomers([]);
        setCustomerLoadError('Could not load customer choices: ' + reason.message);
      });
    return () => {
      live = false;
    };
  }, [api, scope, revision, customerLookup]);

  useEffect(() => {
    let live = true;
    setError('');
    if (section === 'Invoices' || section === 'Customers') {
      setLoading(true);
      setRecords([]);
      const kind = section === 'Invoices' ? 'invoices' : 'customers';
      const fetches = [api(`/records/${kind}?${filterQuery}`)];
      if (section === 'Invoices')
        fetches.push(api('/financial-summary?' + new URLSearchParams({ range: 'all', currency })));
      Promise.allSettled(fetches).then((results) => {
        if (!live) return;
        const first = results[0];
        if (first.status === 'fulfilled') {
          setRecords(first.value.data || []);
          setTotal(Number(first.value.total || 0));
        } else setError('Could not load ' + kind + ': ' + first.reason.message);
        if (section === 'Invoices') {
          const summary = results[1];
          if (summary?.status === 'fulfilled') setBalances(summary.value.invoices || []);
          else
            setError(
              (message) =>
                message || 'Invoice balances are unavailable: ' + summary?.reason?.message,
            );
        } else setBalances([]);
        setLoading(false);
      });
    } else if (section === 'receivables') {
      setLoading(true);
      setRecords([]);
      api('/financial-summary?' + new URLSearchParams({ range: 'all', currency, to: asOf }))
        .then((result) => {
          if (live) {
            setBalances(result.invoices || []);
            setTotal((result.invoices || []).length);
          }
        })
        .catch(
          (reason) =>
            live && setError('Could not load receivables as of ' + asOf + ': ' + reason.message),
        )
        .finally(() => live && setLoading(false));
    }
    return () => {
      live = false;
    };
  }, [api, scope, section, filterQuery, currency, asOf, revision, createKind]);

  const balanceById = new Map(balances.map((invoice) => [invoice.id, invoice]));
  const outstandingRows = balances.filter(
    (invoice) =>
      invoice.status !== 'draft' && invoice.status !== 'voided' && invoice.outstanding_minor > 0,
  );
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  async function submitNew(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createKind) return;
    const form = e.currentTarget;
    const values = new FormData(form);
    setLoading(true);
    setError('');
    try {
      const key = crypto.randomUUID();
      if (createKind === 'customer') {
        const result = await api(
          '/records/customers',
          'POST',
          {
            name: values.get('name'),
            type: values.get('type'),
            email: values.get('email'),
            phone: values.get('phone'),
            address: values.get('address'),
            notes: values.get('notes'),
          },
          { 'Idempotency-Key': key },
        );
        setNotice('Customer saved: ' + result.name);
        if (section !== 'Customers') navigateSection('Customers');
      } else {
        const invoiceCurrency = String(values.get('currency'));
        const result = await api(
          '/records/invoices',
          'POST',
          {
            customer_id: values.get('customer_id'),
            currency: invoiceCurrency,
            issue_date: values.get('issue_date'),
            due_date: values.get('due_date'),
            items: [
              {
                description: values.get('description'),
                quantity: Number(values.get('quantity')),
                unit_price_minor: parseMoney(String(values.get('unit_price')), invoiceCurrency),
              },
            ],
            discount_minor: values.get('discount')
              ? parseMoney(String(values.get('discount')), invoiceCurrency)
              : 0,
            tax_bps: 0,
            notes: values.get('notes') || '',
            terms: values.get('terms') || '',
            payment_instructions: values.get('payment_instructions') || '',
          },
          { 'Idempotency-Key': key },
        );
        if (invoiceCurrency && invoiceCurrency !== currency) setCurrency(invoiceCurrency);
        if (section !== 'Invoices') navigateSection('Invoices');
        setNotice(
          `Draft invoice ${result.reference} created. Review and issue it from its detail.`,
        );
      }
      setCreateKind(null);
      form.reset();
      setRevision((value) => value + 1);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const header = (
    title: string,
    action?: { label: string; run: () => void; disabled?: boolean },
  ) => (
    <div className="finance-page-heading">
      <div>
        <h1>{title}</h1>
        <span className="finance-page-context">Finance · {title}</span>
      </div>
      {action && writable && (
        <button className="button" disabled={action.disabled} onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );

  return (
    <div className="apps-workspace finance-app-workspace o-app-sheet">
      {section !== 'dashboard' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -4 }}>
          <details className="finance-operation-menu" ref={operationsMenu}>
            <summary className="secondary-button">
              Operations <span aria-hidden="true">▾</span>
            </summary>
            <div className="finance-operation-menu-panel">
              <div>
                <strong>View</strong>
                <button onClick={() => navigateFromMenu('operations')}>Financial operations</button>
                <button onClick={() => navigateFromMenu('Invoices')}>Invoices</button>
                <button onClick={() => navigateFromMenu('Customers')}>Customers</button>
                <button onClick={() => navigateFromMenu('Payments')}>Payments</button>
              </div>
              <div>
                <strong>New</strong>
                <button
                  disabled={!writable || !activeService('invoicing')}
                  onClick={() => {
                    closeOperationsMenu();
                    setCreateKind('invoice');
                  }}
                >
                  Invoice
                </button>
                <button
                  disabled={!customerWritable}
                  onClick={() => {
                    closeOperationsMenu();
                    setCreateKind('customer');
                  }}
                >
                  Customer
                </button>
              </div>
              <div>
                <strong>Reporting</strong>
                <button onClick={() => navigateFromMenu('receivables')}>Aged receivables</button>
                <button onClick={() => navigateFromMenu('Reports')}>Financial reports</button>
              </div>
            </div>
          </details>
        </div>
      )}
      {notice && (
        <p className="alert finance-notice" role="status">
          {notice}
        </p>
      )}
      {section === 'dashboard' && (
        <FinanceDashboard
          key={scope}
          api={api}
          scope={scope}
          navigate={navigateSection}
          section={section}
          writable={writable}
          openRecord={openRecord}
          timezone={timezone}
        />
      )}
      {section === 'operations' && (
        <section className="panel">
          <FinanceOperationsOverview
            api={api}
            scope={scope}
            services={services}
            writable={writable}
            onCreateInvoice={() => setCreateKind('invoice')}
            navigate={navigateSection}
          />
        </section>
      )}
      {section === 'Invoices' && (
        <section className="panel finance-register">
          {header('Invoices', {
            label: 'New Invoice',
            run: () => setCreateKind('invoice'),
            disabled: !invoiceAvailable,
          })}
          {!invoiceAvailable && (
            <p className="alert" role="status">
              Invoice service entitlement is inactive; this register is read only or unavailable.
            </p>
          )}
          <div className="finance-filter-bar">
            <Field label="Search">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Number, customer or reference"
              />
            </Field>
            <Field label="Status">
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All statuses</option>
                {[
                  'draft',
                  'issued',
                  'partially_paid',
                  'paid',
                  'outstanding',
                  'overdue',
                  'voided',
                ].map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {currencies.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Customer">
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">All customers</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Find customer">
              <input
                value={customerLookup}
                onChange={(event) => {
                  setCustomerId('');
                  setCustomerLookup(event.target.value);
                }}
                placeholder="Search all customers"
              />
            </Field>
            <Field label="Issued from">
              <input
                type="date"
                value={issueFrom}
                onChange={(event) => setIssueFrom(event.target.value)}
              />
            </Field>
            <Field label="Issued to">
              <input
                type="date"
                value={issueTo}
                onChange={(event) => setIssueTo(event.target.value)}
              />
            </Field>
            <Field label="Due from">
              <input
                type="date"
                value={dueFrom}
                onChange={(event) => setDueFrom(event.target.value)}
              />
            </Field>
            <Field label="Due to">
              <input type="date" value={dueTo} onChange={(event) => setDueTo(event.target.value)} />
            </Field>
          </div>
          {customerLoadError && (
            <p className="alert error" role="alert">
              {customerLoadError}
            </p>
          )}
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          {loading && <p role="status">Loading invoice register…</p>}
          <DataTable className="finance-wide-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Issue date</th>
                <th>Due date</th>
                <th>Currency</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Outstanding</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((invoice) => {
                const balance = balanceById.get(invoice.id);
                return (
                  <tr key={invoice.id}>
                    <td>
                      <button
                        className="quiet-button"
                        onClick={() => setSelected({ ...invoice, kind: 'invoices' })}
                      >
                        {invoice.reference || invoice.number || invoice.id.slice(0, 8)}
                      </button>
                    </td>
                    <td>
                      {customers.find((customer) => customer.id === invoice.customer_id)?.name ||
                        invoice.customer_name ||
                        '—'}
                    </td>
                    <td>{invoice.issue_date || '—'}</td>
                    <td>{invoice.due_date || '—'}</td>
                    <td>{invoice.currency}</td>
                    <td>{money(Number(invoice.total_minor || 0), invoice.currency)}</td>
                    <td>
                      {balance ? money(Number(balance.paid_minor || 0), invoice.currency) : '—'}
                    </td>
                    <td>
                      {balance
                        ? money(Number(balance.outstanding_minor || 0), invoice.currency)
                        : 'Balance unavailable'}
                    </td>
                    <td>
                      <span className="badge">{invoice.status?.replaceAll('_', ' ')}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          {!loading && records.length === 0 && <p>No invoices match these filters.</p>}
          <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </section>
      )}
      {section === 'Customers' && (
        <section className="panel finance-register">
          {header('Customers', {
            label: 'New Customer',
            run: () => setCreateKind('customer'),
            disabled: !customerWritable,
          })}
          <div className="finance-filter-bar finance-customer-filter">
            <Field label="Search customers">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, email or phone"
              />
            </Field>
          </div>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          {loading && <p role="status">Loading customers…</p>}
          <DataTable className="finance-wide-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Address</th>
                <th>Financial history</th>
              </tr>
            </thead>
            <tbody>
              {records.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <button
                      className="quiet-button"
                      onClick={() => setSelected({ ...customer, kind: 'customers' })}
                    >
                      {customer.name}
                    </button>
                  </td>
                  <td>{customer.type || '—'}</td>
                  <td>{customer.email || '—'}</td>
                  <td>{customer.phone || '—'}</td>
                  <td>
                    <span className="badge">{customer.status || 'active'}</span>
                  </td>
                  <td>{customer.address || '—'}</td>
                  <td>
                    <button
                      className="secondary-button"
                      onClick={() => setSelected({ ...customer, kind: 'customers' })}
                    >
                      Open activity
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {!loading && records.length === 0 && <p>No customers match this search.</p>}
          <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </section>
      )}
      {section === 'Payments' && (
        <section className="panel finance-register">
          {header('Payments')}
          {paymentAvailable ? (
            <PaymentCentre api={api} scope={scope} writable={writable} admin={admin} />
          ) : (
            <DependencyNotice
              title="Payments service is not active"
              detail="Activate Payments to view confirmed provider events and payment requests. This Finance screen does not infer settlements from invoices."
            />
          )}
        </section>
      )}
      {section === 'Expenses' && (
        <section className="panel finance-register">
          {header('Expenses')}
          <p className="finance-source-note">
            Recorded expenses are merchant supplied. Vendor bills remain in Procurement; no
            accounting journal is created here.
          </p>
          {activeService('procurement') && (
            <button
              className="secondary-button finance-procurement-link"
              onClick={() => navigate('Procurement')}
            >
              Open Procurement for vendor bills
            </button>
          )}
          {!activeService('procurement') && (
            <p className="finance-source-note">
              Procurement service is not active; vendor bills are not available from this Finance
              workspace.
            </p>
          )}
          {!expenseAvailable && (
            <p className="alert" role="status">
              Expenses service entitlement is inactive; expense recording is unavailable.
            </p>
          )}
          <MoneyTools
            api={api}
            scope={scope}
            writable={writable && expenseAvailable}
            cashFlow={false}
            compact
          />
        </section>
      )}
      {section === 'Reconciliation' && (
        <section className="panel finance-register">
          {header('Payment reconciliation')}
          {reconciliationAvailable ? (
            <PaymentCentre api={api} scope={scope} writable={writable} reconcile />
          ) : (
            <DependencyNotice
              title="Reconciliation service is not active"
              detail="No matching or settlement action is available until the reconciliation service is enabled. Matching is evidence review and does not post an accounting journal."
            />
          )}
        </section>
      )}
      {section === 'receivables' && (
        <section className="panel finance-register">
          {header('Aged receivables')}
          <div className="finance-filter-bar finance-asof-bar">
            <Field label="As of">
              <input
                type="date"
                value={asOf}
                max={todayIn(timezone)}
                required
                onChange={(event) => setAsOf(event.target.value)}
              />
            </Field>
            <Field label="Currency">
              <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {currencies.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
          </div>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          {loading && <p role="status">Loading covered receivables…</p>}
          <div className="finance-aging-strip">
            {['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_over_90'].map((key) => (
              <div key={key}>
                <span>{key.replaceAll('_', ' ')}</span>
                <strong>
                  {money(
                    Number(
                      balances
                        .filter(
                          (invoice) =>
                            invoice.outstanding_minor > 0 &&
                            agingBucket(Number(invoice.overdue_days || 0)) === key,
                        )
                        .reduce((sum, invoice) => sum + invoice.outstanding_minor, 0),
                    ),
                    currency,
                  )}
                </strong>
              </div>
            ))}
          </div>
          <p className="finance-source-note">
            Aging uses issued invoices, recorded allocations and credits as of {asOf}. Historical
            payment or credit status is limited to evidence retained by AfriCore; this is not an
            accounting ledger aging report.
          </p>
          <DataTable className="finance-wide-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Issue date</th>
                <th>Due date</th>
                <th>Days overdue</th>
                <th>1–30</th>
                <th>31–60</th>
                <th>61–90</th>
                <th>Over 90</th>
                <th>Total due</th>
              </tr>
            </thead>
            <tbody>
              {outstandingRows.slice(page * pageSize, (page + 1) * pageSize).map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <button
                      className="quiet-button"
                      onClick={() => setSelected({ ...invoice, kind: 'invoices' })}
                    >
                      {invoice.reference || invoice.number || invoice.id.slice(0, 8)}
                    </button>
                  </td>
                  <td>
                    {invoice.customer_name ||
                      customers.find((customer) => customer.id === invoice.customer_id)?.name ||
                      '—'}
                  </td>
                  <td>{invoice.issue_date}</td>
                  <td>{invoice.due_date}</td>
                  <td>{Number(invoice.overdue_days || 0)}</td>
                  <td>
                    {money(
                      agingBucket(Number(invoice.overdue_days || 0)) === 'days_1_30'
                        ? invoice.outstanding_minor
                        : 0,
                      currency,
                    )}
                  </td>
                  <td>
                    {money(
                      agingBucket(Number(invoice.overdue_days || 0)) === 'days_31_60'
                        ? invoice.outstanding_minor
                        : 0,
                      currency,
                    )}
                  </td>
                  <td>
                    {money(
                      agingBucket(Number(invoice.overdue_days || 0)) === 'days_61_90'
                        ? invoice.outstanding_minor
                        : 0,
                      currency,
                    )}
                  </td>
                  <td>
                    {money(
                      agingBucket(Number(invoice.overdue_days || 0)) === 'days_over_90'
                        ? invoice.outstanding_minor
                        : 0,
                      currency,
                    )}
                  </td>
                  <td>{money(invoice.outstanding_minor, currency)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {!loading && outstandingRows.length === 0 && (
            <p>
              No covered outstanding invoices in {currency} as of {asOf}.
            </p>
          )}
          <Pager
            page={page}
            pageCount={Math.max(1, Math.ceil(outstandingRows.length / pageSize))}
            total={outstandingRows.length}
            onPage={setPage}
          />
        </section>
      )}
      {section === 'Reports' && (
        <section className="panel finance-register">
          {header('Financial reports')}
          <FinancialOverview api={api} scope={scope} timezone={timezone} />
        </section>
      )}
      {createKind && (
        <Overlay onClose={() => setCreateKind(null)}>
          <section
            className="record-modal finance-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-create-title"
          >
            <header>
              <h2 id="finance-create-title">Create {createKind}</h2>
              <button
                className="quiet-button"
                onClick={() => setCreateKind(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            {error && (
              <p role="alert" className="alert error">
                {error}
              </p>
            )}
            <form onSubmit={submitNew}>
              {createKind === 'customer' ? (
                <>
                  <Field label="Name">
                    <input name="name" required maxLength={200} autoFocus />
                  </Field>
                  <Field label="Type">
                    <select name="type">
                      <option value="individual">Individual</option>
                      <option value="business">Business</option>
                    </select>
                  </Field>
                  <Field label="Email">
                    <input name="email" type="email" maxLength={254} />
                  </Field>
                  <Field label="Phone">
                    <input name="phone" type="tel" maxLength={50} />
                  </Field>
                  <Field label="Address">
                    <textarea name="address" maxLength={1000} />
                  </Field>
                  <Field label="Notes">
                    <textarea name="notes" maxLength={3000} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Find customer">
                    <input
                      value={customerLookup}
                      onChange={(event) => setCustomerLookup(event.target.value)}
                      placeholder="Search all customers"
                    />
                  </Field>
                  {customerLoadError && (
                    <p className="alert error" role="alert">
                      {customerLoadError}
                    </p>
                  )}
                  <Field label="Customer">
                    <select name="customer_id" required defaultValue="">
                      <option value="" disabled>
                        Select customer
                      </option>
                      {customers
                        .filter((customer) => customer.status !== 'archived')
                        .map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <div className="finance-form-grid">
                    <Field label="Currency">
                      <select name="currency">
                        {currencies.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Issue date">
                      <input
                        name="issue_date"
                        type="date"
                        required
                        defaultValue={todayIn(timezone)}
                      />
                    </Field>
                    <Field label="Due date">
                      <input
                        name="due_date"
                        type="date"
                        required
                        defaultValue={todayIn(timezone)}
                      />
                    </Field>
                  </div>
                  <Field label="Line description">
                    <input name="description" required maxLength={500} />
                  </Field>
                  <div className="finance-form-grid">
                    <Field label="Quantity">
                      <input
                        name="quantity"
                        type="number"
                        min="0.001"
                        max="100000"
                        step="0.001"
                        defaultValue="1"
                        required
                      />
                    </Field>
                    <Field label="Unit price">
                      <input name="unit_price" inputMode="decimal" required />
                    </Field>
                    <Field label="Discount">
                      <input name="discount" inputMode="decimal" defaultValue="0" />
                    </Field>
                  </div>
                  <Field label="Payment instructions">
                    <textarea name="payment_instructions" maxLength={3000} />
                  </Field>
                  <Field label="Terms">
                    <textarea name="terms" maxLength={3000} />
                  </Field>
                  <Field label="Notes">
                    <textarea name="notes" maxLength={3000} />
                  </Field>
                  <p className="finance-source-note">
                    Creates a draft commercial invoice. No invoice is issued and no payment is
                    recorded until you review the saved document.
                  </p>
                </>
              )}
              <footer>
                <button className="button" disabled={loading}>
                  {loading ? 'Saving…' : 'Save'}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setCreateKind(null)}
                >
                  Cancel
                </button>
              </footer>
            </form>
          </section>
        </Overlay>
      )}
      {selected && (
        <Overlay onClose={() => setSelected(null)}>
          <section
            className="record-modal finance-editor finance-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-detail-title"
          >
            <header>
              <h2 id="finance-detail-title">
                {selected.kind === 'invoices' ? 'Invoice details' : 'Customer financial history'}
              </h2>
              <button className="quiet-button" onClick={() => setSelected(null)} aria-label="Close">
                ×
              </button>
            </header>
            <RecordFinanceDetails
              row={selected}
              api={api}
              writable={writable}
              onChanged={() => setRevision((value) => value + 1)}
            />
          </section>
        </Overlay>
      )}
    </div>
  );
}

function Pager({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="finance-pager">
      <span>
        {total
          ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} of ${total}`
          : '0 records'}
      </span>
      <button className="secondary-button" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <button
        className="secondary-button"
        disabled={page + 1 >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

function DependencyNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="finance-dependency-notice">
      <span aria-hidden="true">🔒</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function agingBucket(overdueDays: number) {
  return overdueDays === 0
    ? 'current'
    : overdueDays <= 30
      ? 'days_1_30'
      : overdueDays <= 60
        ? 'days_31_60'
        : overdueDays <= 90
          ? 'days_61_90'
          : 'days_over_90';
}
