import { useEffect, useState, type FormEvent } from 'react';
import { Field, Form, money, today, type API } from '../operations/UI';
import { DataTable } from '../components/DataTable';
import { useIdempotentAPI } from './useIdempotentAPI';
import { JournalEditor } from './JournalEditor';
import { AccountingConfiguration } from './AccountingConfiguration';
import { AccountingAging } from './AccountingAging';
import { AccountingTax } from './AccountingTax';
import { AccountingBankStatements } from './AccountingBankStatements';
import { AccountingAssets } from './AccountingAssets';
import { DocumentAttachments } from './DocumentAttachments';
import {
  AccountingSourceRegister,
  JournalEntriesView,
  JournalItemsView,
} from './AccountingRegisters';
import {
  accountingSections,
  balanceTotals,
  billCurrency,
  billStatus,
  billTotal,
  dashboardCounts,
  defaultViewForSection,
  invoiceCurrency,
  invoiceCustomer,
  invoiceDue,
  invoiceOutstanding,
  invoiceStatus,
  invoiceTotal,
  journalLabel,
  journalType,
  profitLines,
  recordData,
  sectionForView,
  viewTitles,
  viewsForSection,
  type AccountingView,
} from './accounting-app-model';

type Props = {
  api: API;
  scope: string;
  section?: string;
  navigate: (tab: string) => void;
  manager?: boolean;
};

export function AccountingAppWorkspace({
  api: provided,
  scope,
  section = 'dashboard',
  navigate,
  manager = false,
}: Props) {
  const api = useIdempotentAPI(provided, scope);
  const [view, setView] = useState<AccountingView>(defaultViewForSection[section] || 'dashboard');
  const [configuration, setConfiguration] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [billDetail, setBillDetail] = useState<any>(null);
  const [editor, setEditor] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [invoiceError, setInvoiceError] = useState('');
  const [billError, setBillError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const next =
      defaultViewForSection[section] ||
      (viewsForSection[section]?.[0] as AccountingView) ||
      'dashboard';
    setView(next);
    const url = new URL(location.href);
    if (url.searchParams.get('view') !== next) {
      url.searchParams.set('app', 'accounting');
      url.searchParams.set('section', section);
      url.searchParams.set('view', next);
      url.hash = 'Apps';
      history.replaceState(history.state, '', url);
    }
  }, [section]);

  useEffect(() => {
    let live = true;
    setError('');
    Promise.allSettled([
      api('/accounting/configuration'),
      api('/accounting/entries?offset=0'),
      api('/records/invoices?limit=100'),
      api('/procurement?type=bill'),
      api('/payment-events?limit=100'),
      api('/business/approvals'),
      api('/team'),
    ]).then((results) => {
      if (!live) return;
      const [config, entryList, invoiceList, billList, eventList, approvalList, teamList] = results;
      if (config.status === 'fulfilled') setConfiguration(config.value);
      else setError(config.reason?.message || 'Accounting configuration could not be loaded');
      if (entryList.status === 'fulfilled') setEntries(entryList.value.data || []);
      if (invoiceList.status === 'fulfilled') {
        setInvoices(invoiceList.value.data || []);
        setInvoiceError('');
      } else setInvoiceError(invoiceList.reason?.message || 'Invoicing records are unavailable.');
      if (billList.status === 'fulfilled') {
        setBills(billList.value.data || []);
        setBillError('');
      } else setBillError(billList.reason?.message || 'Procurement bills are unavailable.');
      if (eventList.status === 'fulfilled') setEvents(eventList.value.data || []);
      if (approvalList.status === 'fulfilled') setReviews(approvalList.value);
      if (teamList.status === 'fulfilled') setTeam(teamList.value.data || []);
    });
    return () => {
      live = false;
    };
  }, [scope, revision]);

  useEffect(() => {
    const restore = () => {
      const url = new URL(location.href);
      const raw = url.searchParams.get('view') as AccountingView | null;
      if (raw && viewsForSection[section]?.includes(raw)) setView(raw);
    };
    addEventListener('popstate', restore);
    addEventListener('africore:app-navigation', restore);
    return () => {
      removeEventListener('popstate', restore);
      removeEventListener('africore:app-navigation', restore);
    };
  }, [section]);

  function go(next: AccountingView) {
    const url = new URL(location.href);
    url.searchParams.set('app', 'accounting');
    url.searchParams.set('section', sectionForView(next));
    url.searchParams.set('view', next);
    url.hash = 'Apps';
    history.pushState(history.state, '', url);
    dispatchEvent(new Event('africore:app-navigation'));
    setView(next);
    setSelected(null);
    setInvoiceDetail(null);
    setBillDetail(null);
    setEditor(null);
    setQuery('');
    setStatus('');
  }

  function refresh(message: string) {
    setRevision((value) => value + 1);
    setNotice(message);
    window.setTimeout(() => setNotice(''), 5000);
  }

  const ready = !!configuration?.settings;
  const drafts = entries.filter((entry) => entry.status === 'draft');
  const counts = dashboardCounts({
    entries,
    invoices,
    bills,
    events,
    periods: configuration?.periods,
  });
  const accounts: any[] = configuration?.accounts || [];
  const journals: any[] = configuration?.journals || [];
  const periods: any[] = configuration?.periods || [];
  const openPeriods = periods.filter((period: any) => period.status === 'open');
  const periodCoversToday = openPeriods.some(
    (period: any) => period.starts_on <= today() && period.ends_on >= today(),
  );
  const approvers = team.filter(
    (member) => ['owner', 'admin'].includes(member.role) && member.id !== reviews?.current_actor,
  );

  return (
    <div className="apps-workspace acc-workspace">
      <header className="acc-context">
        <div>
          <span className="acc-eyebrow">AfriCore Accounting</span>
          <h1>{viewTitles[view]}</h1>
        </div>
        <div className="acc-context-meta">
          <span>
            {ready
              ? `${configuration.settings.currency} books from ${configuration.settings.start_on}`
              : 'Accounting setup required'}
          </span>
          {ready && (
            <span className={`acc-pill ${configuration.writable ? 'ok' : 'muted'}`}>
              {configuration.writable ? 'Active' : 'Read only'}
            </span>
          )}
        </div>
      </header>

      <nav className="acc-module-nav" aria-label="Accounting modules">
        {accountingSections.map((item) => (
          <div className="acc-menu" key={item.section}>
            <button
              className={section === item.section ? 'active' : ''}
              aria-current={section === item.section ? 'page' : undefined}
              onClick={() => {
                if (item.section === section) go(defaultViewForSection[item.section]);
                else {
                  const url = new URL(location.href);
                  url.searchParams.set('app', 'accounting');
                  url.searchParams.set('section', item.section);
                  url.searchParams.delete('view');
                  url.hash = 'Apps';
                  history.pushState(history.state, '', url);
                  dispatchEvent(new Event('africore:app-navigation'));
                }
              }}
            >
              {item.label}
            </button>
            {section === item.section && (
              <div className="acc-subnav">
                {viewsForSection[item.section].map((key) => (
                  <button
                    key={key}
                    className={view === key ? 'active' : ''}
                    onClick={() => go(key)}
                  >
                    {viewTitles[key]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="acc-notice">
          {notice}
        </p>
      )}
      {!configuration && !error && <p role="status">Loading authorized accounting records…</p>}

      {configuration && !ready && (
        <AccountingConfiguration
          configuration={configuration}
          api={api}
          manager={manager}
          onSaved={() => refresh('Accounting start reviewed.')}
        />
      )}
      {configuration && ready && (
        <>
          {!configuration.writable && (
            <p role="status" className="alert">
              Accounting is inactive. Authorized history and reports remain available; new drafts
              and posting require activation.
            </p>
          )}
          {configuration.writable && !openPeriods.length && (
            <div className="acc-setup-warning" role="status">
              <strong>No open accounting period.</strong>
              <span>
                Journal posting needs a period covering the accounting date. Reports and history
                remain available.
              </span>
              <button className="acc-secondary" onClick={() => go('periods')}>
                Configure period
              </button>
            </div>
          )}
          {configuration.writable && !!openPeriods.length && !periodCoversToday && (
            <div className="acc-setup-warning" role="status">
              <strong>No open period covers today.</strong>
              <span>
                Choose an accounting date inside an open period, or open a period that covers the
                posting date.
              </span>
              <button className="acc-secondary" onClick={() => go('periods')}>
                Review periods
              </button>
            </div>
          )}
          {configuration.writable &&
            (!accounts.some((account: any) => account.active) ||
              !journals.some((journal: any) => journal.active)) && (
              <div className="acc-setup-warning" role="status">
                <strong>Accounting configuration is incomplete.</strong>
                <span>
                  An active chart of accounts and at least one active journal are required before
                  posting.
                </span>
                <button className="acc-secondary" onClick={() => go('coa')}>
                  Review accounts
                </button>
              </div>
            )}

          {view === 'dashboard' && (
            <Dashboard
              counts={counts}
              journals={journals}
              entries={entries}
              invoices={invoices}
              bills={bills}
              go={go}
            />
          )}

          {['invoices', 'credit-notes', 'customer-payments', 'customers', 'receivables'].includes(
            view,
          ) && (
            <CustomersView
              view={view}
              invoices={invoices}
              query={query}
              setQuery={setQuery}
              status={status}
              setStatus={setStatus}
              navigate={navigate}
              api={api}
              scope={scope}
              onSelect={setInvoiceDetail}
              unavailable={invoiceError}
            />
          )}

          {['bills', 'vendor-credits', 'vendor-payments', 'vendors', 'payables'].includes(view) && (
            <VendorsView
              view={view}
              bills={bills}
              query={query}
              setQuery={setQuery}
              status={status}
              setStatus={setStatus}
              navigate={navigate}
              api={api}
              scope={scope}
              onSelect={setBillDetail}
              unavailable={billError}
            />
          )}

          {['entries', 'items'].includes(view) && (
            <EntriesView
              entries={entries}
              accounts={accounts}
              journals={journals}
              query={query}
              setQuery={setQuery}
              status={status}
              setStatus={setStatus}
              writable={configuration.writable}
              onCreate={() => setEditor({ new: true })}
              onSelect={setSelected}
              view={view}
              api={api}
              scope={scope}
            />
          )}

          {view === 'coa' && (
            <ChartOfAccounts
              accounts={accounts}
              api={api}
              writable={configuration.writable}
              onSaved={() => refresh('Chart of accounts updated.')}
              query={query}
              setQuery={setQuery}
            />
          )}

          {view === 'journals' && (
            <Journals
              journals={journals}
              api={api}
              writable={configuration.writable}
              onSaved={() => refresh('Journal configuration updated.')}
            />
          )}

          {view === 'periods' && (
            <Periods
              periods={periods}
              api={api}
              writable={configuration.writable}
              start={configuration.settings.start_on}
              onSaved={() => refresh('Accounting period updated.')}
            />
          )}

          {(view === 'bank' || view === 'reconciliation') && (
            <AccountingBankStatements
              key={scope}
              api={api}
              configuration={configuration}
              manager={manager}
              onOpenEntry={setSelected}
            />
          )}
          {view === 'bank' && <Bank events={events} navigate={navigate} go={go} />}

          {['assets', 'asset-models', 'depreciation-board'].includes(view) && (
            <AccountingAssets
              key={scope}
              view={view}
              api={api}
              configuration={configuration}
              manager={manager}
              revision={revision}
              go={go}
              onOpenEntry={setSelected}
            />
          )}

          {view === 'reconciliation' && <Reconciliation events={events} navigate={navigate} />}

          {view === 'review' && (
            <Review
              drafts={drafts}
              reviews={reviews}
              events={events}
              periods={periods}
              accounts={accounts}
              onOpen={setSelected}
              go={go}
            />
          )}

          {view === 'closing' && (
            <Closing drafts={drafts} events={events} periods={periods} accounts={accounts} />
          )}

          {['profit-loss', 'balance-sheet', 'trial-balance', 'ledger'].includes(view) && (
            <Reports
              view={view}
              api={api}
              scope={scope}
              start={configuration.settings.start_on}
              initialCurrency={configuration.settings.currency}
              revision={revision}
              accounts={accounts}
            />
          )}

          {view === 'aged' && <AccountingAging api={api} scope={scope} />}
          {view === 'tax' && <TaxReport />}
          {view === 'tax-codes' && (
            <AccountingTax
              configuration={configuration}
              api={api}
              onChanged={() => refresh('Tax code revision retained.')}
              onPrepared={(entry) => {
                setSelected(entry);
                setView('entries');
                refresh('Tax adjustment draft prepared for separate review.');
              }}
            />
          )}

          {view === 'settings' && (
            <AccountingConfiguration
              configuration={configuration}
              api={api}
              manager={manager}
              onSaved={() => refresh('Accounting configuration updated.')}
            />
          )}

          {selected && (
            <EntryDocument
              entry={selected}
              configuration={configuration}
              reviews={reviews}
              approvers={approvers}
              api={api}
              writable={configuration.writable}
              navigate={navigate}
              onClose={() => setSelected(null)}
              onEdit={() => setEditor(selected)}
              onChanged={(message: string) => {
                setSelected(null);
                refresh(message);
              }}
            />
          )}
          {invoiceDetail && (
            <InvoiceDetail
              invoice={invoiceDetail}
              api={api}
              writable={configuration.writable}
              navigate={navigate}
              onClose={() => setInvoiceDetail(null)}
            />
          )}
          {billDetail && (
            <BillDetail bill={billDetail} navigate={navigate} onClose={() => setBillDetail(null)} />
          )}
          {editor && configuration.writable && (
            <JournalEditor
              entry={editor.new ? undefined : editor}
              configuration={configuration}
              api={api}
              onSaved={(saved: any) => {
                setEditor(null);
                setSelected(saved);
                setView('entries');
                refresh('Journal draft saved. Posting requires a separate approval.');
              }}
              onClose={() => setEditor(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function Dashboard({ counts, journals, entries, invoices, bills, go }: any) {
  const recent = entries.slice(0, 6);
  const cards = journals.map((journal: any) => {
    const type = journalType(journal);
    const related = entries.filter((entry: any) => entry.journal_id === journal.id);
    const draft = related.filter((entry: any) => entry.status === 'draft').length;
    const posted = related.filter((entry: any) => entry.status === 'posted').length;
    return { ...journal, type, draft, posted };
  });
  return (
    <>
      <div className="acc-journal-grid">
        {cards.map((card: any) => (
          <article className="acc-journal-card" key={card.id}>
            <header>
              <span className="acc-journal-mark" data-type={card.type} />
              <h2>{journalLabel(card.type)}</h2>
              <span className="acc-code">{card.code}</span>
            </header>
            <div className="acc-journal-body">
              <button
                className="acc-primary"
                onClick={() =>
                  card.type === 'sales'
                    ? go('invoices')
                    : card.type === 'purchase'
                      ? go('bills')
                      : go('entries')
                }
              >
                {card.type === 'sales'
                  ? 'Invoices'
                  : card.type === 'purchase'
                    ? 'Bills'
                    : 'Journal entries'}
              </button>
              <dl>
                <dt>Draft entries</dt>
                <dd>{card.draft}</dd>
                <dt>Posted entries</dt>
                <dd>{card.posted}</dd>
              </dl>
            </div>
            <footer>
              <button onClick={() => go('entries')}>View journal</button>
              <span>{card.active ? 'Active' : 'Archived'}</span>
            </footer>
          </article>
        ))}
        {!cards.length && (
          <article className="acc-journal-card empty">
            <h2>No journals configured</h2>
            <p>Accounting setup creates the general, sales, purchase and cash journals.</p>
            <button className="acc-secondary" onClick={() => go('journals')}>
              Configure journals
            </button>
          </article>
        )}
      </div>
      <div className="acc-dashboard-split">
        <section className="acc-panel">
          <header>
            <h2>Customers</h2>
            <span>{counts.unpaidInvoices} unpaid</span>
          </header>
          <div className="acc-mini-metrics">
            <div>
              <strong>{counts.draftInvoices}</strong>
              <span>To validate</span>
            </div>
            <div>
              <strong>{counts.overdueInvoices}</strong>
              <span>Late</span>
            </div>
            <div>
              <strong>{invoices.filter((i: any) => invoiceOutstanding(i) > 0).length}</strong>
              <span>Open on page</span>
            </div>
          </div>
          <button className="acc-link" onClick={() => go('invoices')}>
            Open customer invoices
          </button>
        </section>
        <section className="acc-panel">
          <header>
            <h2>Vendors</h2>
            <span>{bills.filter((b: any) => billStatus(b) === 'approved').length} payable</span>
          </header>
          <div className="acc-mini-metrics">
            <div>
              <strong>{bills.filter((b: any) => billStatus(b) === 'draft').length}</strong>
              <span>To validate</span>
            </div>
            <div>
              <strong>{bills.filter((b: any) => billStatus(b) === 'approved').length}</strong>
              <span>Open on page</span>
            </div>
          </div>
          <button className="acc-link" onClick={() => go('bills')}>
            Open vendor bills
          </button>
        </section>
        <section className="acc-panel">
          <header>
            <h2>Accounting</h2>
            <span>{counts.openPeriods} open periods</span>
          </header>
          <div className="acc-mini-metrics">
            <div>
              <strong>{counts.draftEntries}</strong>
              <span>Draft entries</span>
            </div>
            <div>
              <strong>{counts.postedEntries}</strong>
              <span>Posted on page</span>
            </div>
          </div>
          <button className="acc-link" onClick={() => go('entries')}>
            Open journal entries
          </button>
        </section>
      </div>
      <section className="acc-panel">
        <header>
          <h2>Recent journal entries</h2>
          <button className="acc-secondary" onClick={() => go('entries')}>
            All entries
          </button>
        </header>
        <DataTable>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Accounting date</th>
              <th>Journal</th>
              <th>Description</th>
              <th className="num">Debit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((entry: any) => (
              <tr key={entry.id}>
                <td>{entry.reference}</td>
                <td>{entry.entry_on}</td>
                <td>{journals.find((j: any) => j.id === entry.journal_id)?.code || '—'}</td>
                <td>{entry.data?.description}</td>
                <td className="num">
                  {money(
                    entry.lines.reduce((sum: number, line: any) => sum + line.debit_minor, 0),
                    entry.currency,
                  )}
                </td>
                <td>
                  <span className={`acc-pill ${entry.status}`}>{entry.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {!recent.length && (
          <p>No journal entries yet. Create accounts and an open period before posting.</p>
        )}
      </section>
    </>
  );
}

function CustomersView({
  view,
  invoices,
  query,
  setQuery,
  status,
  setStatus,
  navigate,
  api,
  scope,
  onSelect,
  unavailable,
}: any) {
  if (view === 'receivables') return <AccountingAging api={api} scope={scope} />;
  if (view === 'customers')
    return (
      <section className="acc-panel">
        <h2>Customers</h2>
        <p>Customer identities are authoritative in the Customers service.</p>
        <button className="acc-secondary" onClick={() => navigate('Customers')}>
          Open Customers
        </button>
      </section>
    );
  if (view === 'credit-notes' || view === 'customer-payments')
    return (
      <AccountingSourceRegister
        api={api}
        scope={scope}
        sourceType={view === 'credit-notes' ? 'credit_note' : 'allocation'}
        title={view === 'credit-notes' ? 'Customer Credit Notes' : 'Customer Payments'}
        counterparty="Customer / invoice"
        navigate={navigate}
      />
    );
  const filtered = invoices.filter(
    (invoice: any) =>
      (!query || JSON.stringify(invoice).toLowerCase().includes(query.toLowerCase())) &&
      (!status || invoiceStatus(invoice) === status),
  );
  return (
    <section className="acc-panel">
      <header>
        <h2>
          {view === 'credit-notes'
            ? 'Credit notes'
            : view === 'customer-payments'
              ? 'Customer payments'
              : 'Invoices'}
        </h2>
        <span>{filtered.length} on page</span>
      </header>
      {unavailable && (
        <p className="acc-setup-warning" role="status">
          <strong>Invoicing records are unavailable.</strong>
          <span>
            {unavailable} Activate the Invoicing entitlement to review canonical invoices here.
          </span>
        </p>
      )}
      <div className="acc-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search invoices…"
          aria-label="Search invoices"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Invoice status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="partially_paid">Partially paid</option>
          <option value="paid">Paid</option>
        </select>
        <button className="acc-primary" onClick={() => navigate('Invoices')}>
          Open invoice service
        </button>
      </div>
      {view === 'customer-payments' ? (
        <p className="acc-hint">
          Payment evidence is owned by Payments and Reconciliation. Accounting does not create
          payment records.
        </p>
      ) : null}
      <DataTable>
        <thead>
          <tr>
            <th>Number</th>
            <th>Customer</th>
            <th>Invoice date</th>
            <th>Due date</th>
            <th className="num">Total</th>
            <th className="num">Outstanding</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((invoice: any) => (
            <tr key={invoice.id}>
              <td>
                <button className="acc-link" onClick={() => onSelect?.(invoice)}>
                  {recordData(invoice).number || invoice.id.slice(0, 8)}
                </button>
              </td>
              <td>{invoiceCustomer(invoice)}</td>
              <td>{recordData(invoice).issue_date || recordData(invoice).date || '—'}</td>
              <td>{invoiceDue(invoice) || '—'}</td>
              <td className="num">{money(invoiceTotal(invoice), invoiceCurrency(invoice))}</td>
              <td className="num">
                {money(invoiceOutstanding(invoice), invoiceCurrency(invoice))}
              </td>
              <td>
                <span className={`acc-pill ${invoiceStatus(invoice)}`}>
                  {invoiceStatus(invoice)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {!filtered.length && (
        <p>No invoices match this view. Invoices are created by the canonical Invoicing service.</p>
      )}
    </section>
  );
}

function VendorsView({
  view,
  bills,
  query,
  setQuery,
  status,
  setStatus,
  navigate,
  api,
  scope,
  onSelect,
  unavailable,
}: any) {
  if (view === 'payables') return <AccountingAging api={api} scope={scope} />;
  if (view === 'vendors')
    return (
      <section className="acc-panel">
        <h2>Vendors</h2>
        <p>Vendor identities are canonical counterparties used by Procurement.</p>
        <button className="acc-secondary" onClick={() => navigate('Procurement')}>
          Open Procurement
        </button>
      </section>
    );
  if (view === 'vendor-credits' || view === 'vendor-payments')
    return (
      <AccountingSourceRegister
        api={api}
        scope={scope}
        sourceType={view === 'vendor-credits' ? 'supplier_credit' : 'supplier_payment'}
        title={view === 'vendor-credits' ? 'Vendor Credits' : 'Vendor Payments'}
        counterparty="Vendor"
        navigate={navigate}
      />
    );
  const filtered = bills.filter(
    (bill: any) =>
      (!query || JSON.stringify(bill).toLowerCase().includes(query.toLowerCase())) &&
      (!status || billStatus(bill) === status),
  );
  return (
    <section className="acc-panel">
      <header>
        <h2>
          {view === 'vendor-credits'
            ? 'Vendor credits'
            : view === 'vendor-payments'
              ? 'Vendor payments'
              : 'Vendor bills'}
        </h2>
        <span>{filtered.length} on page</span>
      </header>
      {unavailable && (
        <p className="acc-setup-warning" role="status">
          <strong>Supplier bills are unavailable.</strong>
          <span>
            {unavailable} Activate Procurement and its supplier-bill access to review payables here;
            Accounting does not duplicate supplier bills.
          </span>
        </p>
      )}
      <div className="acc-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search bills…"
          aria-label="Search vendor bills"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Bill status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="acc-primary" onClick={() => navigate('Procurement')}>
          Open purchasing
        </button>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Vendor</th>
            <th>Bill date</th>
            <th>Due date</th>
            <th className="num">Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((bill: any) => (
            <tr key={bill.id}>
              <td>
                <button className="acc-link" onClick={() => onSelect?.(bill)}>
                  {recordData(bill).reference || bill.id.slice(0, 8)}
                </button>
              </td>
              <td>
                {recordData(bill).vendor_name ||
                  recordData(bill).supplier_name ||
                  recordData(bill).supplier_id ||
                  'Canonical vendor'}
              </td>
              <td>{recordData(bill).issued_on || '—'}</td>
              <td>{recordData(bill).due_on || '—'}</td>
              <td className="num">{money(billTotal(bill), billCurrency(bill))}</td>
              <td>
                <span className={`acc-pill ${billStatus(bill)}`}>{billStatus(bill)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {!filtered.length && (
        <p>
          No vendor bills on this page. Bills are created and approved through Procurement and its
          supplier-bill controls.
        </p>
      )}
      <p className="acc-hint">
        Procurement owns supplier bill validation and received-quantity matching; Accounting exposes
        the resulting payable.
      </p>
    </section>
  );
}

function EntriesView({
  entries,
  accounts,
  journals,
  query,
  setQuery,
  status,
  setStatus,
  writable,
  onCreate,
  onSelect,
  view,
  api,
  scope,
}: any) {
  if (view === 'entries')
    return (
      <JournalEntriesView
        api={api}
        scope={scope}
        journals={journals}
        writable={writable}
        onCreate={onCreate}
        onSelect={onSelect}
      />
    );
  if (view === 'items')
    return (
      <JournalItemsView
        api={api}
        scope={scope}
        accounts={accounts}
        journals={journals}
        onSelect={onSelect}
      />
    );
  const filtered = entries.filter(
    (entry: any) =>
      (!status || entry.status === status) &&
      (!query || JSON.stringify(entry).toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <section className="acc-panel">
      <header>
        <h2>Journal Entries</h2>
        <button className="acc-primary" disabled={!writable} onClick={onCreate}>
          New
        </button>
      </header>
      <div className="acc-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search journal entries…"
          aria-label="Search journal entries"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Entry status"
        >
          <option value="">All entries</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
        </select>
        <span className="acc-hint">Latest 50 entries</span>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>Number</th>
            <th>Accounting date</th>
            <th>Journal</th>
            <th>Partner</th>
            <th>Description</th>
            <th className="num">Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((entry: any) => (
            <tr key={entry.id}>
              <td>
                <button className="acc-link" onClick={() => onSelect(entry)}>
                  {entry.reference}
                </button>
              </td>
              <td>{entry.entry_on}</td>
              <td>
                {journals.find((journal: any) => journal.id === entry.journal_id)?.code || '—'}
              </td>
              <td>
                {entry.lines.find((line: any) => line.contact_id)?.contact_id
                  ? 'Shared contact'
                  : '—'}
              </td>
              <td>{entry.data?.description}</td>
              <td className="num">
                {money(
                  entry.lines.reduce((sum: number, line: any) => sum + line.debit_minor, 0),
                  entry.currency,
                )}
              </td>
              <td>
                <span className={`acc-pill ${entry.status}`}>{entry.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {!filtered.length && (
        <p>
          No journal entries. You can create a draft when an active journal and an open period
          exist.
        </p>
      )}
      <p className="acc-hint">
        Accounts available: {accounts.length}. Every draft must balance before a separate reviewer
        can approve posting.
      </p>
    </section>
  );
}

function ChartOfAccounts({ accounts, api, writable, onSaved, query, setQuery }: any) {
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const visible = accounts.filter(
    (account: any) =>
      !query ||
      `${account.code} ${account.name} ${account.type}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api(
        '/accounting/accounts' + (editing.id ? '/' + editing.id : ''),
        editing.id ? 'PUT' : 'POST',
        {
          expected_version: Number(editing.version || 0),
          code: String(data.get('code')).toUpperCase(),
          name: String(data.get('name')),
          type: String(data.get('type')),
          active: data.get('active') === 'on',
        },
      );
      setEditing(null);
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="acc-panel">
      <header>
        <h2>Chart of Accounts</h2>
        <button className="acc-primary" disabled={!writable} onClick={() => setEditing({})}>
          New
        </button>
      </header>
      <div className="acc-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search accounts…"
          aria-label="Search accounts"
        />
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>Code</th>
            <th>Account Name</th>
            <th>Type</th>
            <th>Allow Reconciliation</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((account: any) => (
            <tr key={account.id}>
              <td>{account.code}</td>
              <td>{account.name}</td>
              <td>{account.type}</td>
              <td>
                {['asset', 'liability'].includes(account.type)
                  ? 'Eligible by control account'
                  : '—'}
              </td>
              <td>
                <span className={`acc-pill ${account.active ? 'posted' : 'muted'}`}>
                  {account.active ? 'Active' : 'Archived'}
                </span>
              </td>
              <td>
                <button
                  className="acc-link"
                  disabled={!writable}
                  onClick={() => setEditing(account)}
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {!visible.length && <p>No accounts match. Create an account or clear the search.</p>}
      {editing && (
        <form className="acc-form" onSubmit={save}>
          <h3>{editing.id ? 'Edit account' : 'New account'}</h3>
          <label>
            Code
            <input
              name="code"
              required
              pattern="[A-Za-z0-9-]{1,20}"
              defaultValue={editing.code || ''}
            />
          </label>
          <label>
            Account name
            <input
              name="name"
              required
              minLength={2}
              maxLength={150}
              defaultValue={editing.name || ''}
            />
          </label>
          <label>
            Type
            <select name="type" defaultValue={editing.type || 'asset'}>
              {['asset', 'liability', 'equity', 'revenue', 'expense'].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="checkbox-field">
            <input
              name="active"
              type="checkbox"
              defaultChecked={editing.id ? !!editing.active : true}
            />
            Active
          </label>
          <div className="acc-form-actions">
            <button className="acc-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save account'}
            </button>
            <button type="button" className="acc-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
          <p className="acc-hint">
            Codes and types cannot change after a journal line references the account.
          </p>
        </form>
      )}
    </section>
  );
}

function Journals({ journals, api, writable, onSaved }: any) {
  const [editing, setEditing] = useState<any>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await api(
      '/accounting/journals' + (editing.id ? '/' + editing.id : ''),
      editing.id ? 'PUT' : 'POST',
      {
        expected_version: Number(editing.version || 0),
        code: String(data.get('code')).toUpperCase(),
        name: String(data.get('name')),
        active: data.get('active') === 'on',
      },
    );
    setEditing(null);
    onSaved();
  }
  return (
    <section className="acc-panel">
      <header>
        <h2>Journals</h2>
        <button className="acc-primary" disabled={!writable} onClick={() => setEditing({})}>
          New
        </button>
      </header>
      <DataTable>
        <thead>
          <tr>
            <th>Journal Name</th>
            <th>Short Code</th>
            <th>Type</th>
            <th>Currency</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {journals.map((journal: any) => (
            <tr key={journal.id}>
              <td>{journal.name}</td>
              <td>{journal.code}</td>
              <td>{journalLabel(journalType(journal))}</td>
              <td>Workspace base</td>
              <td>
                <span className={`acc-pill ${journal.active ? 'posted' : 'muted'}`}>
                  {journal.active ? 'Active' : 'Archived'}
                </span>
              </td>
              <td>
                <button
                  className="acc-link"
                  disabled={!writable}
                  onClick={() => setEditing(journal)}
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <p className="acc-hint">
        Journal type is derived from the canonical short code (SALES, PURCHASE, CASH, BANK,
        GENERAL). Dedicated default-account and payment-method mappings are not stored by this
        ledger.
      </p>
      {editing && (
        <form className="acc-form" onSubmit={save}>
          <h3>{editing.id ? 'Edit journal' : 'New journal'}</h3>
          <label>
            Journal name
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={editing.name || ''}
            />
          </label>
          <label>
            Short code
            <input
              name="code"
              required
              pattern="[A-Za-z0-9-]{2,12}"
              defaultValue={editing.code || ''}
            />
          </label>
          <label className="checkbox-field">
            <input
              name="active"
              type="checkbox"
              defaultChecked={editing.id ? !!editing.active : true}
            />
            Active
          </label>
          <div className="acc-form-actions">
            <button className="acc-primary">Save journal</button>
            <button type="button" className="acc-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Periods({ periods, api, writable, start, onSaved }: any) {
  const [creating, setCreating] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await api('/accounting/periods', 'POST', {
      name: String(data.get('name')),
      starts_on: String(data.get('starts_on')),
      ends_on: String(data.get('ends_on')),
    });
    setCreating(false);
    onSaved();
  }
  async function toggle(period: any) {
    const status = period.status === 'locked' ? 'open' : 'locked';
    const reason = prompt(
      status === 'locked'
        ? 'Reason for locking this period (at least 8 characters)'
        : 'Reason for reopening this period (at least 8 characters)',
    );
    if (!reason || reason.trim().length < 8) return;
    await api('/accounting/periods/' + period.id + '/state', 'PUT', {
      expected_version: Number(period.version),
      status,
      reason,
    });
    onSaved();
  }
  return (
    <section className="acc-panel">
      <header>
        <h2>Lock Dates</h2>
        <button className="acc-primary" disabled={!writable} onClick={() => setCreating(true)}>
          New period
        </button>
      </header>
      <DataTable>
        <thead>
          <tr>
            <th>Name</th>
            <th>Start</th>
            <th>End</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {periods.map((period: any) => (
            <tr key={period.id}>
              <td>{period.name}</td>
              <td>{period.starts_on}</td>
              <td>{period.ends_on}</td>
              <td>
                <span className={`acc-pill ${period.status === 'open' ? 'posted' : 'muted'}`}>
                  {period.status}
                </span>
              </td>
              <td>
                <button className="acc-link" disabled={!writable} onClick={() => toggle(period)}>
                  {period.status === 'open' ? 'Lock' : 'Reopen'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {!periods.length && (
        <p>No accounting periods. Posting requires an open period covering the accounting date.</p>
      )}
      {creating && (
        <form className="acc-form" onSubmit={create}>
          <h3>New accounting period</h3>
          <label>
            Name
            <input name="name" required minLength={2} defaultValue="Current period" />
          </label>
          <label>
            Start
            <input name="starts_on" type="date" required min={start} defaultValue={start} />
          </label>
          <label>
            End
            <input name="ends_on" type="date" required defaultValue={today()} />
          </label>
          <div className="acc-form-actions">
            <button className="acc-primary">Create period</button>
            <button type="button" className="acc-secondary" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Bank({ events, navigate, go }: any) {
  return (
    <section className="acc-panel">
      <header>
        <h2>Bank and Cash</h2>
        <span>Internal ledger only</span>
      </header>
      <p className="acc-hint">
        AfriCore does not connect to a live bank provider or import bank statements. Cash and bank
        journals reflect posted internal ledger movements. Payment evidence is reviewed separately.
      </p>
      <div className="acc-dashboard-split">
        <article className="acc-panel">
          <h3>Unmatched payment evidence</h3>
          <strong className="acc-big">
            {
              events.filter((event: any) => event.status === 'succeeded' && !event.allocated_at)
                .length
            }
          </strong>
          <button className="acc-link" onClick={() => go('reconciliation')}>
            Review reconciliation
          </button>
        </article>
        <article className="acc-panel">
          <h3>Journal configuration</h3>
          <p>
            Cash and bank journals are created during accounting setup. Dedicated default-account
            mappings are not part of this ledger contract.
          </p>
          <button className="acc-link" onClick={() => go('journals')}>
            Configure journals
          </button>
        </article>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Status</th>
            <th className="num">Amount</th>
            <th>Currency</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {events.slice(0, 40).map((event: any) => (
            <tr key={event.id}>
              <td>{String(event.created_at || '').slice(0, 10)}</td>
              <td>{event.type || event.event_type || 'payment evidence'}</td>
              <td>{event.status}</td>
              <td className="num">
                {money(Number(event.amount_minor || 0), event.currency || 'KES')}
              </td>
              <td>{event.currency || 'KES'}</td>
              <td>
                <button className="acc-link" onClick={() => navigate('Reconciliation')}>
                  Open payments
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {!events.length && (
        <p>
          No payment evidence loaded. Bank synchronization and statement import are unsupported.
        </p>
      )}
    </section>
  );
}

function Reconciliation({ events, navigate }: any) {
  const pending = events.filter(
    (event: any) => event.status === 'succeeded' && !event.allocated_at,
  );
  return (
    <section className="acc-panel">
      <header>
        <h2>Reconciliation</h2>
        <span>{pending.length} unmatched</span>
      </header>
      <p className="acc-hint">
        Matching uses authoritative payment evidence and open invoice balances. A matching amount
        alone is not proof of the intended recipient. Bank statement matching is not implemented.
      </p>
      <DataTable>
        <thead>
          <tr>
            <th>Date</th>
            <th>Reference</th>
            <th className="num">Amount</th>
            <th>Currency</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pending.map((event: any) => (
            <tr key={event.id}>
              <td>{String(event.created_at || '').slice(0, 10)}</td>
              <td>{event.reference || event.id.slice(0, 8)}</td>
              <td className="num">
                {money(Number(event.amount_minor || 0), event.currency || 'KES')}
              </td>
              <td>{event.currency || 'KES'}</td>
              <td>
                <span className="acc-pill draft">To match</span>
              </td>
              <td>
                <button className="acc-link" onClick={() => navigate('Reconciliation')}>
                  Open matching workspace
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {!pending.length && <p>No unmatched payment evidence on the loaded page.</p>}
    </section>
  );
}

function Review({ drafts, reviews, events, periods, accounts, onOpen, go }: any) {
  return (
    <>
      <div className="acc-dashboard-split">
        <article className="acc-panel">
          <h3>Draft journal entries</h3>
          <strong className="acc-big">{drafts.length}</strong>
          <p>Posting requires a separate owner or administrator approval for the exact version.</p>
          <button className="acc-link" onClick={() => go('entries')}>
            Open entries
          </button>
        </article>
        <article className="acc-panel">
          <h3>Awaiting review</h3>
          <strong className="acc-big">
            {
              (reviews?.data || []).filter(
                (review: any) => review.action === 'journal_posting' && review.status === 'pending',
              ).length
            }
          </strong>
          <button className="acc-link" onClick={() => go('entries')}>
            Open drafts
          </button>
        </article>
        <article className="acc-panel">
          <h3>Unmatched evidence</h3>
          <strong className="acc-big">
            {
              events.filter((event: any) => event.status === 'succeeded' && !event.allocated_at)
                .length
            }
          </strong>
          <button className="acc-link" onClick={() => go('reconciliation')}>
            Reconcile
          </button>
        </article>
      </div>
      <section className="acc-panel">
        <header>
          <h2>Closing readiness</h2>
          <button className="acc-secondary" onClick={() => go('closing')}>
            Open checklist
          </button>
        </header>
        <p>
          Open periods: {periods.filter((period: any) => period.status === 'open').length}. Active
          accounts: {accounts.filter((account: any) => account.active).length}.
        </p>
      </section>
      <section className="acc-panel">
        <h2>Draft queue</h2>
        <DataTable>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Date</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {drafts.slice(0, 20).map((entry: any) => (
              <tr key={entry.id}>
                <td>
                  <button className="acc-link" onClick={() => onOpen(entry)}>
                    {entry.reference}
                  </button>
                </td>
                <td>{entry.entry_on}</td>
                <td>{entry.data?.description}</td>
                <td>{entry.status}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>
    </>
  );
}

function Closing({ drafts, events, periods, accounts }: any) {
  const checks = [
    ['Draft journal entries', drafts.length, 'Post or reverse drafts before closing.'],
    [
      'Unmatched payment evidence',
      events.filter((event: any) => event.status === 'succeeded' && !event.allocated_at).length,
      'Reconcile authorized payment evidence.',
    ],
    [
      'Open periods',
      periods.filter((period: any) => period.status === 'open').length,
      'Lock reviewed periods after close.',
    ],
    [
      'Active ledger accounts',
      accounts.filter((account: any) => account.active).length,
      'Confirm the chart of accounts is complete.',
    ],
  ];
  return (
    <section className="acc-panel">
      <h2>Closing checklist</h2>
      <p className="acc-hint">
        These are readiness checks from loaded records, not an automated period-close statement.
      </p>
      <div className="acc-check-list">
        {checks.map(([label, value, hint]: any) => (
          <div key={label} className={value ? 'warn' : 'ok'}>
            <span>{value}</span>
            <div>
              <strong>{label}</strong>
              <p>{hint}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function InvoiceDetail({ invoice, api, writable, navigate, onClose }: any) {
  const data = recordData(invoice);
  const items = Array.isArray(data.items) ? data.items : [];
  return (
    <section className="acc-panel acc-document" aria-label="Invoice detail">
      <header>
        <div>
          <button className="acc-back" onClick={onClose}>
            Back to invoices
          </button>
          <h2>{data.number || invoice.id.slice(0, 8)}</h2>
          <span className={`acc-pill ${invoiceStatus(invoice)}`}>{invoiceStatus(invoice)}</span>
        </div>
        <button className="acc-secondary" onClick={() => navigate('Invoices')}>
          Open in Invoicing
        </button>
      </header>
      <dl className="acc-facts">
        <div>
          <dt>Customer</dt>
          <dd>{invoiceCustomer(invoice)}</dd>
        </div>
        <div>
          <dt>Invoice date</dt>
          <dd>{data.issue_date || data.date || '—'}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{invoiceDue(invoice) || '—'}</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{invoiceCurrency(invoice)}</dd>
        </div>
        <div>
          <dt>Payment status</dt>
          <dd>{data.payment_status || 'not recorded'}</dd>
        </div>
        <div>
          <dt>Linked order</dt>
          <dd>{data.order_id || 'None linked'}</dd>
        </div>
      </dl>
      <DataTable>
        <thead>
          <tr>
            <th>Description</th>
            <th>Product</th>
            <th className="num">Quantity</th>
            <th className="num">Unit price</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, index: number) => (
            <tr key={index}>
              <td>{item.description}</td>
              <td>{item.product_id || '—'}</td>
              <td className="num">{Number(item.quantity || 0).toFixed(3)}</td>
              <td className="num">
                {money(Number(item.unit_price_minor || 0), invoiceCurrency(invoice))}
              </td>
              <td className="num">
                {money(
                  Math.floor(
                    (Number(item.quantity || 0) * 1000 * Number(item.unit_price_minor || 0) + 500) /
                      1000,
                  ),
                  invoiceCurrency(invoice),
                )}
              </td>
            </tr>
          ))}
          {!items.length && (
            <tr>
              <td colSpan={5}>No line items are available on this invoice page.</td>
            </tr>
          )}
        </tbody>
      </DataTable>
      <div className="acc-totals">
        <span>
          Total <strong>{money(invoiceTotal(invoice), invoiceCurrency(invoice))}</strong>
        </span>
        <span>
          Paid <strong>{money(Number(data.paid_minor || 0), invoiceCurrency(invoice))}</strong>
        </span>
        <span>
          Outstanding{' '}
          <strong>{money(invoiceOutstanding(invoice), invoiceCurrency(invoice))}</strong>
        </span>
      </div>
      <p className="acc-hint">
        This is the canonical invoice record. Issued ledger evidence is posted separately; opening
        this panel does not create a second invoice or a payment.
      </p>
      <DocumentAttachments
        api={api}
        sourceKind="invoice"
        sourceId={invoice.id}
        writable={writable}
        allowUpload
      />
    </section>
  );
}

function BillDetail({ bill, navigate, onClose }: any) {
  const data = recordData(bill);
  const lines = Array.isArray(data.lines) ? data.lines : [];
  return (
    <section className="acc-panel acc-document" aria-label="Vendor bill detail">
      <header>
        <div>
          <button className="acc-back" onClick={onClose}>
            Back to bills
          </button>
          <h2>{data.reference || bill.id.slice(0, 8)}</h2>
          <span className={`acc-pill ${billStatus(bill)}`}>{billStatus(bill)}</span>
        </div>
        <button className="acc-secondary" onClick={() => navigate('Procurement')}>
          Open in Procurement
        </button>
      </header>
      <dl className="acc-facts">
        <div>
          <dt>Vendor</dt>
          <dd>
            {data.vendor_name || data.supplier_name || data.supplier_id || 'Canonical vendor'}
          </dd>
        </div>
        <div>
          <dt>Bill date</dt>
          <dd>{data.issued_on || '—'}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{data.due_on || '—'}</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{billCurrency(bill)}</dd>
        </div>
        <div>
          <dt>Purchase order</dt>
          <dd>{data.order_id || 'None linked'}</dd>
        </div>
        <div>
          <dt>Variance reason</dt>
          <dd>{data.variance_reason || 'Not recorded'}</dd>
        </div>
      </dl>
      <DataTable>
        <thead>
          <tr>
            <th>Description</th>
            <th className="num">Quantity</th>
            <th className="num">Received</th>
            <th className="num">Billed</th>
            <th className="num">Unit price</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line: any, index: number) => (
            <tr key={line.id || index}>
              <td>{line.description || line.product_id || 'Purchase line'}</td>
              <td className="num">{Number(line.quantity_milli || 0) / 1000}</td>
              <td className="num">{Number(line.received_milli || 0) / 1000}</td>
              <td className="num">
                {Number(line.billed_milli ?? line.quantity_milli ?? 0) / 1000}
              </td>
              <td className="num">
                {money(Number(line.unit_price_minor || 0), billCurrency(bill))}
              </td>
              <td className="num">
                {money(
                  line.amount_minor ??
                    Math.floor(
                      (Number(line.quantity_milli || 0) * Number(line.unit_price_minor || 0) +
                        500) /
                        1000,
                    ),
                  billCurrency(bill),
                )}
              </td>
            </tr>
          ))}
          {!lines.length && (
            <tr>
              <td colSpan={6}>No line items are available on this bill page.</td>
            </tr>
          )}
        </tbody>
      </DataTable>
      <div className="acc-totals">
        <span>
          Total <strong>{money(billTotal(bill), billCurrency(bill))}</strong>
        </span>
      </div>
      <p className="acc-hint">
        Procurement owns supplier-bill validation, approval and received-quantity matching. The
        payable here is the resulting canonical record; no payment is created from this panel.
      </p>
    </section>
  );
}

function EntryDocument({
  entry,
  configuration,
  reviews,
  approvers,
  api,
  writable,
  navigate,
  onClose,
  onEdit,
  onChanged,
}: any) {
  const [reviewer, setReviewer] = useState('');
  const accountName = (id: string) => {
    const account = configuration.accounts.find((item: any) => item.id === id);
    return account ? `${account.code} · ${account.name}` : 'Account';
  };
  const approved = (reviews?.data || []).filter((review: any) => {
    try {
      return (
        review.action === 'journal_posting' &&
        review.resource_id === entry.id &&
        review.requester === reviews?.current_actor &&
        review.status === 'approved' &&
        !review.consumed_at &&
        review.expires_at > new Date().toISOString() &&
        JSON.parse(review.parameters).journal_posting.entry_version === entry.version
      );
    } catch {
      return false;
    }
  });
  return (
    <section className="acc-document">
      <header>
        <button className="acc-back" onClick={onClose}>
          ← Journal entries
        </button>
        <span className={`acc-pill ${entry.status}`}>{entry.status}</span>
      </header>
      <div className="acc-document-head">
        <div>
          <h2>{entry.reference}</h2>
          <p>{entry.data?.description}</p>
        </div>
        <div className="acc-document-actions">
          {entry.status === 'draft' && entry.source_type === 'manual' && (
            <button className="acc-secondary" disabled={!writable} onClick={onEdit}>
              Edit draft
            </button>
          )}
          {entry.status === 'posted' && (
            <button className="acc-secondary" onClick={() => navigate('Approvals')}>
              Approval Center
            </button>
          )}
        </div>
      </div>
      <div className="acc-doc-facts">
        <dl>
          <dt>Accounting date</dt>
          <dd>{entry.entry_on}</dd>
          <dt>Journal</dt>
          <dd>
            {configuration.journals.find((journal: any) => journal.id === entry.journal_id)?.name ||
              '—'}
          </dd>
          <dt>Currency</dt>
          <dd>{entry.currency}</dd>
          <dt>Source</dt>
          <dd>{String(entry.source_type).replaceAll('_', ' ')}</dd>
          <dt>Version</dt>
          <dd>{entry.version}</dd>
        </dl>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>Account</th>
            <th>Partner</th>
            <th>Label</th>
            <th className="num">Debit</th>
            <th className="num">Credit</th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((line: any) => (
            <tr key={line.id}>
              <td>{accountName(line.account_id)}</td>
              <td>{line.contact_id ? 'Shared contact' : '—'}</td>
              <td>{line.data?.memo}</td>
              <td className="num">{money(line.debit_minor, entry.currency)}</td>
              <td className="num">{money(line.credit_minor, entry.currency)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <div className="acc-totals">
        <div>
          <span>Total debit</span>
          <strong>
            {money(
              entry.lines.reduce((sum: number, line: any) => sum + line.debit_minor, 0),
              entry.currency,
            )}
          </strong>
        </div>
        <div>
          <span>Total credit</span>
          <strong>
            {money(
              entry.lines.reduce((sum: number, line: any) => sum + line.credit_minor, 0),
              entry.currency,
            )}
          </strong>
        </div>
        <div>
          <span>Difference</span>
          <strong>
            {money(
              entry.lines.reduce(
                (sum: number, line: any) => sum + line.debit_minor - line.credit_minor,
                0,
              ),
              entry.currency,
            )}
          </strong>
        </div>
      </div>
      {entry.status === 'draft' && (
        <section className="acc-panel">
          <h3>Independent review</h3>
          <p>
            Posting needs an approved review of this exact entry version by a different owner or
            administrator.
          </p>
          {approvers.length ? (
            <div className="acc-toolbar">
              <select
                value={reviewer}
                onChange={(event) => setReviewer(event.target.value)}
                aria-label="Reviewer"
              >
                <option value="">Select a reviewer…</option>
                {approvers.map((member: any) => (
                  <option key={member.id} value={member.id}>
                    {member.name || member.email || member.id}
                  </option>
                ))}
              </select>
              <button
                className="acc-secondary"
                disabled={!writable || !reviewer}
                onClick={async () => {
                  await api('/accounting/entries/' + entry.id + '/review', 'POST', {
                    approver: reviewer,
                    expected_version: entry.version,
                  });
                  onChanged('Exact journal review requested.');
                }}
              >
                Request review
              </button>
            </div>
          ) : (
            <p>
              No separate eligible owner or administrator exists. Invite a reviewer in Team; posting
              cannot bypass separation of duties.
            </p>
          )}
        </section>
      )}
      {entry.status === 'draft' && (
        <section className="acc-panel">
          <h3>Post exact reviewed version</h3>
          {approved.length ? (
            <Form
              submit={async (data: any) => {
                await api('/accounting/entries/' + entry.id + '/post', 'POST', {
                  expected_version: entry.version,
                  approval_id: String(data.get('approval')),
                });
                onChanged('Balanced journal posted. History is immutable; no funds were moved.');
              }}
            >
              <Field label="Approved journal version">
                <select name="approval" required>
                  {approved.map((review: any) => (
                    <option key={review.id} value={review.id}>
                      Approved · version {entry.version}
                    </option>
                  ))}
                </select>
              </Field>
              <button className="acc-primary">Post journal</button>
            </Form>
          ) : (
            <p className="acc-hint">
              No unconsumed approval matches this exact version. Request a review from a different
              owner or administrator.
            </p>
          )}
        </section>
      )}
      {entry.status === 'posted' && (
        <section className="acc-panel">
          <h3>Correction</h3>
          <p>
            Posted entries are immutable. A reversal creates a separate opposite draft that needs
            its own review.
          </p>
          <Form
            submit={async (data: any) => {
              await api('/accounting/entries/' + entry.id + '/reverse', 'POST', {
                entry_on: String(data.get('date')),
                reason: String(data.get('reason')),
              });
              onChanged('Reversal draft prepared.');
            }}
          >
            <Field label="Reversal date">
              <input name="date" type="date" required min={entry.entry_on} defaultValue={today()} />
            </Field>
            <Field label="Reason">
              <input name="reason" required minLength={8} />
            </Field>
            <button className="acc-secondary">Prepare reversal</button>
          </Form>
        </section>
      )}
    </section>
  );
}

function Reports({ view, api, scope, start, initialCurrency, revision, accounts }: any) {
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(today());
  const [currency, setCurrency] = useState(initialCurrency);
  const [accountId, setAccountId] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerOffset, setLedgerOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [requestState, setRequestState] = useState<any>({ key: '', status: 'loading' });
  const requested = new URLSearchParams({
    from,
    to,
    currency,
    ...(view === 'ledger' && accountId ? { account_id: accountId } : {}),
    offset: String(view === 'ledger' ? ledgerOffset : 0),
    ...(view === 'ledger' && ledgerSearch.trim() ? { search: ledgerSearch.trim() } : {}),
  });
  const requestKey = `${scope}:${revision}:${attempt}:${view}:${requested.toString()}`;
  useEffect(() => {
    let live = true;
    setRequestState({ key: requestKey, status: 'loading' });
    api('/accounting/report?' + requested)
      .then((data: any) => {
        if (live) setRequestState({ key: requestKey, status: 'ready', data });
      })
      .catch((reason: any) => {
        if (live)
          setRequestState({
            key: requestKey,
            status: 'error',
            error: reason?.message || 'The requested financial report could not be loaded.',
          });
      });
    return () => {
      live = false;
    };
  }, [api, requestKey]);
  const requestStatus = requestState.key === requestKey ? requestState.status : 'loading';
  const report = requestStatus === 'ready' ? requestState.data : null;
  const error = requestStatus === 'error' ? requestState.error : '';
  const pnl = profitLines(report);
  const balance = balanceTotals(report);
  return (
    <section className="acc-panel">
      <header>
        <h2>{viewTitles[view as AccountingView]}</h2>
        <div className="acc-report-controls">
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setLedgerOffset(0);
            }}
            aria-label="From date"
          />
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setLedgerOffset(0);
            }}
            aria-label="To date"
          />
          <select
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value);
              setLedgerOffset(0);
            }}
            aria-label="Report currency"
          >
            {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </div>
      </header>
      {error && (
        <div className="alert error" role="alert">
          <span>{error}</span>{' '}
          <button className="acc-secondary" onClick={() => setAttempt((value) => value + 1)}>
            Retry report
          </button>
        </div>
      )}
      {!report && !error && (
        <p role="status">
          Loading report for {from} through {to} in {currency}…
        </p>
      )}
      {report && (
        <>
          <p className="acc-hint">{report.notice}</p>
          {view === 'profit-loss' && (
            <>
              <div className="acc-report-head">
                <span>Profit and Loss</span>
                <span>
                  {report.period?.from} → {report.period?.to} · {report.currency}
                </span>
              </div>
              <div className="acc-statement">
                {[
                  { label: 'Revenue', rows: pnl.revenue, invert: true },
                  { label: 'Cost of Sales and Expenses', rows: pnl.expenses, invert: false },
                ].map((group) => (
                  <div key={group.label}>
                    <h3>{group.label}</h3>
                    {group.rows.map((line: any) => {
                      const value = group.invert
                        ? line.credit_minor - line.debit_minor
                        : line.debit_minor - line.credit_minor;
                      return (
                        <div className="acc-statement-row" key={line.id}>
                          <span>
                            {line.code} {line.name}
                          </span>
                          <strong>{money(value, currency)}</strong>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="acc-statement-row total">
                  <span>Net Profit / Loss</span>
                  <strong>{money(pnl.net, currency)}</strong>
                </div>
              </div>
            </>
          )}
          {view === 'balance-sheet' && (
            <>
              <div className="acc-report-head">
                <span>Balance Sheet</span>
                <span>
                  Cumulative through {report.period?.to} · {report.currency}
                </span>
              </div>
              <div className="acc-statement">
                {[
                  { label: 'Assets', key: 'asset', invert: false },
                  { label: 'Liabilities', key: 'liability', invert: true },
                  { label: 'Equity', key: 'equity', invert: true },
                ].map((group) => (
                  <div key={group.label}>
                    <h3>{group.label}</h3>
                    {(report.balance_sheet || [])
                      .filter((line: any) => line.type === group.key)
                      .map((line: any) => {
                        const value = group.invert ? -line.net_debit_minor : line.net_debit_minor;
                        return (
                          <div className="acc-statement-row" key={line.id}>
                            <span>
                              {line.code} {line.name}
                            </span>
                            <strong>{money(value, report.currency)}</strong>
                          </div>
                        );
                      })}
                  </div>
                ))}
                <div className="acc-statement-row total">
                  <span>Assets = Liabilities + Equity</span>
                  <strong>{money(balance.difference, currency)}</strong>
                </div>
              </div>
            </>
          )}
          {view === 'trial-balance' && (
            <>
              <div className="acc-report-head">
                <span>Trial Balance</span>
                <span>
                  {report.period?.from} → {report.period?.to} · {report.currency}
                </span>
              </div>
              <DataTable>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.trial_balance || []).map((line: any) => (
                    <tr key={line.id}>
                      <td>
                        {line.code} · {line.name}
                      </td>
                      <td className="num">{money(line.debit_minor, report.currency)}</td>
                      <td className="num">{money(line.credit_minor, report.currency)}</td>
                      <td className="num">{money(line.net_debit_minor, report.currency)}</td>
                    </tr>
                  ))}
                  <tr className="acc-total-row">
                    <td>Total</td>
                    <td className="num">{money(report.total_debit_minor, report.currency)}</td>
                    <td className="num">{money(report.total_credit_minor, report.currency)}</td>
                    <td className="num">{report.balanced ? 'Balanced' : 'Review'}</td>
                  </tr>
                </tbody>
              </DataTable>
            </>
          )}
          {view === 'ledger' && (
            <>
              <div className="acc-report-head">
                <span>General Ledger</span>
                <span>
                  {report.period?.from} → {report.period?.to} · {report.currency}
                </span>
              </div>
              <div className="acc-toolbar">
                <select
                  value={accountId}
                  onChange={(event) => {
                    setAccountId(event.target.value);
                    setLedgerOffset(0);
                  }}
                  aria-label="Account filter"
                >
                  <option value="">All accounts</option>
                  {accounts.map((account: any) => (
                    <option key={account.id} value={account.id}>
                      {account.code} · {account.name}
                    </option>
                  ))}
                </select>
                <input
                  value={ledgerSearch}
                  onChange={(event) => {
                    setLedgerSearch(event.target.value);
                    setLedgerOffset(0);
                  }}
                  placeholder="Search reference or account…"
                  aria-label="Search general ledger"
                />
              </div>
              <DataTable>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Entry</th>
                    <th>Account</th>
                    <th>Memo</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.general_ledger || []).map((line: any) => (
                    <tr key={line.id}>
                      <td>{line.entry_on}</td>
                      <td>{line.reference}</td>
                      <td>
                        {line.account_code} · {line.account_name}
                      </td>
                      <td>{line.data?.memo}</td>
                      <td className="num">{money(line.debit_minor, report.currency)}</td>
                      <td className="num">{money(line.credit_minor, report.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              {report.has_more && (
                <p className="acc-hint">
                  Showing {report.offset + 1}–
                  {Math.min(report.offset + report.general_ledger.length, report.total)} of{' '}
                  {report.total} posted lines.
                </p>
              )}
              {report.total > report.limit && (
                <footer className="acc-register-pager">
                  <span>{report.total} posted lines</span>
                  <button
                    className="acc-secondary"
                    disabled={report.offset === 0}
                    onClick={() => setLedgerOffset(Math.max(0, ledgerOffset - report.limit))}
                  >
                    Previous
                  </button>
                  <button
                    className="acc-secondary"
                    disabled={!report.has_more}
                    onClick={() => setLedgerOffset(ledgerOffset + report.limit)}
                  >
                    Next
                  </button>
                </footer>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function TaxReport() {
  return (
    <section className="acc-panel">
      <h2>Tax Report</h2>
      <p>
        No statutory tax report is generated. Tax codes and controlled manual adjustments are
        available under Configuration → Taxes. AfriCore does not claim eTIMS or jurisdictional
        filing compliance.
      </p>
    </section>
  );
}
