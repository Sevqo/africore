import { useEffect, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { money, type API } from '../operations/UI';

export function AccountingSourceRegister({
  api,
  scope,
  sourceType,
  title,
  counterparty,
  navigate,
}: {
  api: API;
  scope: string;
  sourceType: string;
  title: string;
  counterparty: string;
  navigate: (tab: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ source_type: sourceType, offset: String(offset) });
    if (search.trim()) params.set('search', search.trim());
    api('/accounting/sources?' + params)
      .then((data: any) => {
        if (live) setResult(data);
      })
      .catch((reason: any) => {
        if (live) {
          setResult(null);
          setError(reason?.message || 'The canonical source register could not be loaded.');
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, scope, sourceType, offset, search, attempt]);
  const rows = result?.data || [];
  return (
    <section className="acc-panel">
      <header>
        <h2>{title}</h2>
        <span>{result ? `${result.total} records` : 'Canonical source records'}</span>
      </header>
      <div className="acc-toolbar">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          placeholder={`Search ${title.toLowerCase()}…`}
          aria-label={`Search ${title.toLowerCase()}`}
        />
        <button
          className="acc-secondary"
          onClick={() => navigate(sourceType.startsWith('supplier') ? 'Procurement' : 'Invoices')}
        >
          Open source service
        </button>
      </div>
      {result?.notice && <p className="acc-hint">{result.notice}</p>}
      {error && (
        <div className="alert error" role="alert">
          <span>{error}</span>{' '}
          <button className="acc-secondary" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}
      {loading && <p role="status">Loading canonical records…</p>}
      {!loading && !error && (
        <DataTable>
          <thead>
            <tr>
              <th>Reference</th>
              <th>{counterparty}</th>
              <th>Date</th>
              <th>Source status</th>
              <th className="num">Amount</th>
              <th>Accounting link</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any) => (
              <tr key={row.id}>
                <td>{row.reference || row.id}</td>
                <td>{row.vendor || row.partner || 'Canonical invoice allocation'}</td>
                <td>{row.source_on || '—'}</td>
                <td>{row.status || row.time_basis || 'Recorded source'}</td>
                <td className="num">{money(row.amount_minor, row.currency)}</td>
                <td>
                  {row.entry_id ? (
                    <span className={`acc-pill ${row.entry_status || 'muted'}`}>
                      {row.entry_status} journal
                    </span>
                  ) : (
                    <span className="acc-hint">Not posted to this ledger</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {!loading && !error && !rows.length && <p>No canonical records match this register.</p>}
      {result && (
        <footer className="acc-register-pager">
          <span>
            {result.total
              ? `${offset + 1}–${Math.min(offset + rows.length, result.total)} of ${result.total}`
              : '0 records'}
          </span>
          <button
            className="acc-secondary"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous
          </button>
          <button
            className="acc-secondary"
            disabled={!result.has_more || loading}
            onClick={() => setOffset(offset + 50)}
          >
            Next
          </button>
        </footer>
      )}
    </section>
  );
}

export function JournalItemsView({
  api,
  scope,
  accounts,
  journals,
  onSelect,
}: {
  api: API;
  scope: string;
  accounts: any[];
  journals: any[];
  onSelect: (entry: any) => void;
}) {
  const [search, setSearch] = useState('');
  const [accountId, setAccountId] = useState('');
  const [journalId, setJournalId] = useState('');
  const [partner, setPartner] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [currency, setCurrency] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ offset: String(offset) });
    if (search.trim()) params.set('search', search.trim());
    if (accountId) params.set('account_id', accountId);
    if (journalId) params.set('journal_id', journalId);
    if (partner.trim()) params.set('partner', partner.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (currency) params.set('currency', currency);
    if (status) params.set('status', status);
    api('/accounting/items?' + params)
      .then((data: any) => {
        if (live) setResult(data);
      })
      .catch((reason: any) => {
        if (live) {
          setResult(null);
          setError(reason?.message || 'Journal items could not be loaded.');
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, scope, search, accountId, journalId, partner, from, to, currency, status, offset, attempt]);
  const rows = result?.data || [];
  return (
    <section className="acc-panel">
      <header>
        <h2>Journal Items</h2>
        <span>{result ? `${result.total} ledger lines` : 'Canonical ledger lines'}</span>
      </header>
      <div className="acc-toolbar">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          placeholder="Search reference or account…"
          aria-label="Search journal items"
        />
        <select
          value={accountId}
          onChange={(event) => {
            setAccountId(event.target.value);
            setOffset(0);
          }}
          aria-label="Filter account"
        >
          <option value="">All accounts</option>
          {accounts.map((account: any) => (
            <option key={account.id} value={account.id}>
              {account.code} · {account.name}
            </option>
          ))}
        </select>
        <select
          value={journalId}
          onChange={(event) => {
            setJournalId(event.target.value);
            setOffset(0);
          }}
          aria-label="Filter journal"
        >
          <option value="">All journals</option>
          {journals.map((journal: any) => (
            <option key={journal.id} value={journal.id}>
              {journal.code} · {journal.name}
            </option>
          ))}
        </select>
        <input
          value={partner}
          onChange={(event) => {
            setPartner(event.target.value);
            setOffset(0);
          }}
          placeholder="Partner ID…"
          aria-label="Filter partner"
        />
        <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setOffset(0); }} aria-label="From accounting date" />
        <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setOffset(0); }} aria-label="To accounting date" />
        <select value={currency} onChange={(event) => { setCurrency(event.target.value); setOffset(0); }} aria-label="Filter currency">
          <option value="">All currencies</option>{['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setOffset(0);
          }}
          aria-label="Filter posting status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
        </select>
      </div>
      {result?.notice && <p className="acc-hint">{result.notice}</p>}
      {error && (
        <div className="alert error" role="alert">
          {error}{' '}
          <button className="acc-secondary" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}
      {loading && <p role="status">Loading ledger lines…</p>}
      {!loading && !error && (
        <DataTable>
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry</th>
              <th>Journal</th>
              <th>Account</th>
              <th>Partner</th>
              <th>Label</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
              <th>Reconciliation</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((line: any) => (
              <tr key={line.id}>
                <td>{line.entry_on}</td>
                <td>
                  <button className="acc-link" onClick={() => onSelect({ id: line.entry_id })}>
                    {line.reference}
                  </button>
                </td>
                <td>{line.journal_code} · {line.journal_name}</td>
                <td>{line.account_code} · {line.account_name}</td>
                <td>{line.contact_id ? 'Linked contact' : '—'}</td>
                <td>{line.memo || '—'}</td>
                <td className="num">{money(line.debit_minor, line.currency)}</td>
                <td className="num">{money(line.credit_minor, line.currency)}</td>
                <td>Not tracked</td>
                <td>{line.source_type === 'manual' ? '—' : `${line.source_type}: ${line.source_id}`}</td>
                <td><span className={`acc-pill ${line.status}`}>{line.status}</span></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {!loading && !error && !rows.length && <p>No journal items match the selected filters.</p>}
      {result && (
        <footer className="acc-register-pager">
          <span>
            {result.total
              ? `${offset + 1}–${Math.min(offset + rows.length, result.total)} of ${result.total}`
              : '0 ledger lines'}
          </span>
          <button className="acc-secondary" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
          <button className="acc-secondary" disabled={!result.has_more || loading} onClick={() => setOffset(offset + 50)}>Next</button>
        </footer>
      )}
    </section>
  );
}

export function JournalEntriesView({
  api,
  scope,
  journals,
  writable,
  onCreate,
  onSelect,
}: {
  api: API;
  scope: string;
  journals: any[];
  writable: boolean;
  onCreate: () => void;
  onSelect: (entry: any) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [journalId, setJournalId] = useState('');
  const [partner, setPartner] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [currency, setCurrency] = useState('');
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ offset: String(offset) });
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    if (journalId) params.set('journal_id', journalId);
    if (partner.trim()) params.set('partner', partner.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (currency) params.set('currency', currency);
    api('/accounting/entries?' + params)
      .then((data: any) => {
        if (live) setResult(data);
      })
      .catch((reason: any) => {
        if (live) {
          setResult(null);
          setError(reason?.message || 'Journal entries could not be loaded.');
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, scope, search, status, journalId, partner, from, to, currency, offset, attempt]);
  const rows = result?.data || [];
  return (
    <section className="acc-panel">
      <header>
        <h2>Journal Entries</h2>
        <button className="acc-primary" disabled={!writable} onClick={onCreate}>New</button>
      </header>
      <div className="acc-toolbar">
        <input value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} placeholder="Search reference or source…" aria-label="Search journal entries" />
        <select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }} aria-label="Filter entry status">
          <option value="">All entries</option><option value="draft">Draft</option><option value="posted">Posted</option>
        </select>
        <select value={journalId} onChange={(event) => { setJournalId(event.target.value); setOffset(0); }} aria-label="Filter journal">
          <option value="">All journals</option>{journals.map((journal) => <option key={journal.id} value={journal.id}>{journal.code} · {journal.name}</option>)}
        </select>
        <input value={partner} onChange={(event) => { setPartner(event.target.value); setOffset(0); }} placeholder="Partner ID…" aria-label="Filter partner" />
        <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setOffset(0); }} aria-label="From accounting date" />
        <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setOffset(0); }} aria-label="To accounting date" />
        <select value={currency} onChange={(event) => { setCurrency(event.target.value); setOffset(0); }} aria-label="Filter currency">
          <option value="">All currencies</option>{['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      </div>
      {error && <div className="alert error" role="alert">{error}{' '}<button className="acc-secondary" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>}
      {loading && <p role="status">Loading journal entries…</p>}
      {!loading && !error && (
        <DataTable>
          <thead><tr><th>Number</th><th>Accounting date</th><th>Journal</th><th>Partner</th><th>Description</th><th className="num">Total</th><th>Status</th></tr></thead>
          <tbody>{rows.map((entry: any) => <tr key={entry.id}>
            <td><button className="acc-link" onClick={() => onSelect({ id: entry.id })}>{entry.reference}</button></td>
            <td>{entry.entry_on}</td>
            <td>{journals.find((journal) => journal.id === entry.journal_id)?.code || '—'}</td>
            <td>{entry.lines.find((line: any) => line.contact_id) ? 'Linked contact' : '—'}</td>
            <td>{entry.data?.description || '—'}</td>
            <td className="num">{money(entry.lines.reduce((sum: number, line: any) => sum + line.debit_minor, 0), entry.currency)}</td>
            <td><span className={`acc-pill ${entry.status}`}>{entry.status}</span></td>
          </tr>)}</tbody>
        </DataTable>
      )}
      {!loading && !error && !rows.length && <p>No journal entries match the selected filters.</p>}
      {result && <footer className="acc-register-pager"><span>{result.total ? `${offset + 1}–${Math.min(offset + rows.length, result.total)} of ${result.total}` : '0 entries'}</span><button className="acc-secondary" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><button className="acc-secondary" disabled={!result.has_more || loading} onClick={() => setOffset(offset + 50)}>Next</button></footer>}
      <p className="acc-hint">Posting remains protected by open-period checks, exact-version independent approval and immutable ledger controls.</p>
    </section>
  );
}
