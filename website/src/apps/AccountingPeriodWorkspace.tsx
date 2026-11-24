import { useEffect, useState } from 'react';
import { Field, Form, money, today, type API } from '../operations/UI';
import type { AccountingView } from './accounting-app-model';

const titles: Record<string, string> = {
  sales: 'Lock sales',
  purchases: 'Lock purchases',
  tax: 'Lock tax-sensitive entries',
  all: 'Lock all journal entries',
  draft_journals: 'Unposted journal entries',
  unbalanced_journals: 'Incomplete or unbalanced journals',
  unreconciled_bank_lines: 'Unreconciled bank lines',
  pending_bank_decisions: 'Outstanding reconciliation decisions',
  depreciation_due: 'Depreciation due',
  deferral_recognition_due: 'Deferred recognition due',
  period_consistency: 'Period consistency',
  trial_balance_variance: 'Posted trial balance variance',
  opening_balance_required: 'Required opening balance',
  pending_journal_reviews: 'Pending journal reviews',
  open: 'Open',
  under_review: 'Under review',
  approved: 'Approved for close',
  closed: 'Closed',
  reopen_review: 'Reopening under review',
};
const label = (key: string) => titles[key] || key.replaceAll('_', ' ');
const flags = ['sales', 'purchases', 'tax', 'all'];
const currencyOptions = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'];
const statementViews = {
  'trial-balance': 'trial',
  ledger: 'ledger',
  'balance-sheet': 'balance',
  'profit-loss': 'profit',
  'account-balances': 'accounts',
  'journal-audit': 'audit',
  'closing-summary': 'summary',
} as const;
type Props = {
  api: API;
  view: AccountingView;
  configuration: any;
  manager: boolean;
  revision: number;
  openEntry: (entry: { id: string }) => void;
  newOpening: () => void;
  refresh: (message: string) => void;
  go: (view: AccountingView) => void;
  openAccount: (id: string) => void;
};

function exportCsv(filename: string, columns: string[], rows: unknown[][]) {
  const cell = (value: unknown) => {
    const safe =
      typeof value === 'string' && /^[\s]*[=+@-]/.test(value) ? "'" + value : String(value ?? '');
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const url = URL.createObjectURL(
    new Blob([[columns, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useData(api: API, path: string, revision: number) {
  const [state, setState] = useState<{ path: string; data?: any; error?: string }>({ path: '' });
  useEffect(() => {
    if (!path) return;
    let active = true;
    api(path).then(
      (data) => {
        if (active) setState({ path, data });
      },
      (error) => {
        if (active) setState({ path, error: error.message });
      },
    );
    return () => {
      active = false;
    };
  }, [api, path, revision]);
  return state.path === path ? state : {};
}

function History({ rows }: { rows: any[] }) {
  if (!rows.length) return null;
  return (
    <details>
      <summary>Review history</summary>
      <ul>
        {rows.map((row) => (
          <li key={row.version}>
            {label(row.action)} · {row.created_at} · {row.actor}
          </li>
        ))}
      </ul>
    </details>
  );
}

function FiscalYears({ api, revision, manager, configuration, refresh, go }: Props) {
  const { data, error } = useData(api, '/accounting/fiscal-years', revision);
  return (
    <section className="acc-panel">
      <h2>Fiscal year register</h2>
      {error && <p role="alert">{error}</p>}
      {manager && configuration.writable && (
        <Form
          submit={async (d) => {
            await api('/accounting/fiscal-years', 'POST', d);
            refresh('Fiscal year added.');
          }}
        >
          <Field label="Fiscal year name">
            <input name="name" required minLength={2} maxLength={100} />
          </Field>
          <Field label="Start date">
            <input name="starts_on" type="date" required />
          </Field>
          <Field label="Year-end date">
            <input name="ends_on" type="date" required />
          </Field>
          <button className="acc-primary">Add fiscal year</button>
        </Form>
      )}
      {data && data.data.length === 0 && (
        <p>
          No configured fiscal years. Reports use calendar years until a fiscal year is configured.
        </p>
      )}
      {data?.data.map((year: any) => (
        <details key={year.id} open={year.current}>
          <summary>
            {year.name} · {year.starts_on} to {year.ends_on}
            {year.current && ' · Current year'}
          </summary>
          <ul>
            {year.periods.map((p: any) => (
              <li key={p.id}>
                {p.name} · {p.starts_on} to {p.ends_on} ·{' '}
                {p.status === 'open'
                  ? 'Period open for posting, subject to lock dates'
                  : 'Period locked'}
              </li>
            ))}
          </ul>
          <button className="acc-secondary" type="button" onClick={() => go('closing')}>
            Period closing
          </button>
        </details>
      ))}
    </section>
  );
}

function LockDates({ api, revision, manager, configuration, refresh }: Props) {
  const { data, error } = useData(api, '/accounting/lock-dates', revision);
  const [reset, setReset] = useState(0);
  if (!data) return <p role={error ? 'alert' : 'status'}>{error || 'Loading lock policies…'}</p>;
  return (
    <section className="acc-panel">
      <h2>Lock Journal Entries</h2>
      <p>
        Lock entries dated on or before each selected date. Closing a period also blocks posting and
        applies independently.
      </p>
      <Form
        key={data.version + ':' + reset}
        disabled={!manager || !configuration.writable}
        submit={async (d) => {
          await api('/accounting/lock-dates', 'PUT', {
            expected_version: data.version,
            reason: d.reason,
            ...Object.fromEntries(flags.map((field) => [field, d[field] || null])),
          });
          refresh('Lock dates updated.');
        }}
      >
        {flags.map((name) => (
          <Field label={label(name)} key={name}>
            <input type="date" name={name} defaultValue={data.dates[name] || ''} />
          </Field>
        ))}
        <Field label="Reason for change">
          <input name="reason" required minLength={8} maxLength={1000} />
        </Field>
        <p role="note">
          Locking all entries applies to every journal, including reversals dated in the locked
          range.
        </p>
        <div className="acc-toolbar">
          <button className="acc-primary">Save lock dates</button>
          <button type="button" className="acc-secondary" onClick={() => setReset((n) => n + 1)}>
            Discard
          </button>
        </div>
      </Form>
      <History rows={data.history} />
    </section>
  );
}

function Closing({ api, configuration, revision, manager, refresh, openEntry, go }: Props) {
  const [selected, setSelected] = useState(configuration.periods.at(-1)?.id || '');
  const { data, error } = useData(
    api,
    selected ? '/accounting/periods/' + selected + '/close' : '',
    revision,
  );
  const state = data?.review?.status || 'open';
  const canWrite = manager && configuration.writable;
  const draft = state === 'open' && data?.period.status === 'open';
  const next =
    state === 'closed'
      ? 'request_reopen'
      : state === 'reopen_review'
        ? 'reopen'
        : draft || data?.stale
          ? 'request'
          : state === 'under_review' && data?.ready
            ? 'approve'
            : state === 'approved' && data?.ready
              ? 'close'
              : '';
  const actions: Record<string, string> = {
    request: 'Request close review',
    approve: 'Approve for close',
    close: 'Close period',
    request_reopen: 'Request reopening',
    reopen: 'Approve reopening',
  };
  return (
    <section className="acc-panel">
      <h2>Period Closing</h2>
      <Field label="Accounting period">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select period</option>
          {configuration.periods.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            <strong>
              {label(data.period.status === 'locked' && !data.review ? 'manually locked' : state)}
            </strong>{' '}
            · {data.period.starts_on} to {data.period.ends_on}
          </p>
          {data.stale && <p role="alert">Records changed after review. Request a fresh review.</p>}
          <div className="acc-journal-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Result</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {data.checks.map((check: any) => (
                  <tr key={check.code}>
                    <td>{label(check.code)}</td>
                    <td>{check.count ? label(check.severity) : 'Clear'}</td>
                    <td>
                      {check.count}
                      {check.details.map((item: any, i: number) =>
                        item.reference ? (
                          <button
                            className="acc-link"
                            key={i}
                            type="button"
                            onClick={() => openEntry({ id: item.id })}
                          >
                            {item.reference}
                          </button>
                        ) : item.date ? (
                          <span key={i}> · {item.date}</span>
                        ) : null,
                      )}
                      {check.count > 0 && check.code.includes('bank') && (
                        <button className="acc-link" onClick={() => go('reconciliation')}>
                          Review bank reconciliation
                        </button>
                      )}
                      {check.count > 0 && check.code === 'depreciation_due' && (
                        <button className="acc-link" onClick={() => go('depreciation-board')}>
                          Review depreciation
                        </button>
                      )}
                      {check.count > 0 && check.code === 'deferral_recognition_due' && (
                        <>
                          <button className="acc-link" onClick={() => go('deferred-expenses')}>
                            Review expenses
                          </button>
                          <button className="acc-link" onClick={() => go('deferred-revenue')}>
                            Review revenue
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canWrite && (next || ['under_review', 'approved', 'reopen_review'].includes(state)) && (
            <Form
              key={(data.review?.version ?? 0) + ':' + selected}
              submit={async (d) => {
                await api('/accounting/periods/' + selected + '/close', 'POST', {
                  action: d.action || next,
                  expected_version: data.review?.version ?? 0,
                  expected_period_version: Number(data.period.version),
                  reason: d.reason,
                });
                refresh('Period review updated.');
              }}
            >
              <Field label="Review decision">
                <select name="action" required>
                  {next && <option value={next}>{actions[next]}</option>}
                  {['under_review', 'approved', 'reopen_review'].includes(state) && (
                    <option value="cancel">Cancel review</option>
                  )}
                </select>
              </Field>
              <Field label="Decision reason">
                <input name="reason" required minLength={8} maxLength={1000} />
              </Field>
              <button className="acc-primary">Save review decision</button>
            </Form>
          )}
          <History rows={data.history} />
        </>
      )}
    </section>
  );
}

function Opening({ api, view, configuration, revision, newOpening, openEntry, refresh }: Props) {
  const { data, error } = useData(api, '/accounting/opening-balances', revision);
  const editable =
    view === 'opening-balances' &&
    configuration.writable &&
    data?.policy === 'reviewed_opening_entry_required';
  const columns = [
    'Date',
    'Currency',
    'Reference',
    'Status',
    'Account',
    'Debit minor',
    'Credit minor',
  ];
  const rows =
    data?.data.flatMap((entry: any) =>
      entry.lines.map((line: any) => {
        const account = configuration.accounts.find((value: any) => value.id === line.account_id);
        return [
          entry.entry_on,
          entry.currency,
          entry.data.opening_reference || entry.reference,
          entry.status,
          account?.code || '',
          line.debit_minor,
          line.credit_minor,
        ];
      }),
    ) || [];
  return (
    <section className="acc-panel">
      <h2>{view === 'opening-report' ? 'Opening Balances Report' : 'Opening Balances'}</h2>
      {error && <p role="alert">{error}</p>}
      {data && (
        <p>
          {data.start_on} ·{' '}
          {data.policy === 'reviewed_opening_entry_required'
            ? 'Reviewed opening journal required per currency'
            : 'Books start with no imported opening balances'}
        </p>
      )}
      {editable && (
        <>
          <button type="button" className="acc-primary" onClick={newOpening}>
            New opening draft
          </button>
          <details>
            <summary>Import opening balances from CSV</summary>
            <p>
              Use account_code, debit_minor, credit_minor, and optional memo. Use integer minor
              units. Receivable and payable control accounts are excluded.
            </p>
            <Form
              submit={async (d) => {
                if (!(d.file instanceof File) || !d.file.size || d.file.size > 65536)
                  throw new Error('Select a CSV file of at most 64 KiB.');
                const entry = await api('/accounting/opening-balances/import', 'POST', {
                  entry_on: data.start_on,
                  journal_id: d.journal,
                  currency: d.currency,
                  opening_reference: d.reference,
                  csv: await d.file.text(),
                });
                openEntry(entry);
                refresh('Opening draft validated and saved.');
              }}
            >
              <Field label="Opening journal">
                <select name="journal" required>
                  {configuration.journals
                    .filter((j: any) => Number(j.active))
                    .map((j: any) => (
                      <option key={j.id} value={j.id}>
                        {j.code} · {j.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Currency">
                <select name="currency" defaultValue={configuration.settings.currency}>
                  {currencyOptions.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Evidence reference">
                <input name="reference" required minLength={3} maxLength={250} />
              </Field>
              <Field label="Opening CSV">
                <input name="file" type="file" accept=".csv,text/csv" required />
              </Field>
              <button className="acc-primary">Validate and create draft</button>
            </Form>
          </details>
        </>
      )}
      {rows.length > 0 && (
        <button
          className="acc-secondary"
          onClick={() => exportCsv('opening-balances.csv', columns, rows)}
        >
          Export CSV
        </button>
      )}
      {data?.data.map((entry: any) => (
        <details key={entry.id} open>
          <summary>
            {entry.currency} · {entry.reference} · {entry.status}
          </summary>
          <p>{entry.data.opening_reference}</p>
          <button className="acc-secondary" onClick={() => openEntry(entry)}>
            Open journal
          </button>
          {entry.correction && (
            <button className="acc-secondary" onClick={() => openEntry(entry.correction)}>
              Open correction journal
            </button>
          )}
          <div className="acc-journal-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line: any) => (
                  <tr key={line.id}>
                    <td>
                      {configuration.accounts.find((a: any) => a.id === line.account_id)?.name}
                    </td>
                    <td>{money(line.debit_minor, entry.currency)}</td>
                    <td>{money(line.credit_minor, entry.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
      {data && !data.data.length && <p>No opening journals recorded.</p>}
    </section>
  );
}

function Statements({ api, configuration, revision, view, openEntry, go, openAccount }: Props) {
  const start = configuration.settings.start_on;
  const currency = configuration.settings.currency;
  const type = statementViews[view as keyof typeof statementViews];
  const account = new URL(location.href).searchParams.get('statementAccount');
  const [filters, setFilters] = useState(() =>
    new URLSearchParams({
      currency,
      from: start,
      to: today() < start ? start : today(),
      ...(account ? { account_id: account } : {}),
    }).toString(),
  );
  const [offset, setOffset] = useState(0);
  const [attempt, rerun] = useState(0);
  const [group, setGroup] = useState(true);
  const { data: years } = useData(api, '/accounting/fiscal-years', revision);
  const { data, error } = useData(
    api,
    '/accounting/statements?view=' + type + '&offset=' + offset + '&' + filters,
    revision + attempt,
  );
  const tableLines = type === 'ledger' || type === 'audit';
  const trial = type === 'trial' || type === 'accounts';
  const t = data?.totals;
  const cash = (amount: number) => money(amount, data.currency);
  const accountColumns = trial
    ? ['Opening debit', 'Opening credit', 'Period debit', 'Period credit', 'Closing net debit']
    : [type === 'profit' ? 'Result' : 'As of balance'];
  const values = (r: any) =>
    trial
      ? [
          r.opening_debit_minor,
          r.opening_credit_minor,
          r.debit_minor,
          r.credit_minor,
          r.closing_minor,
        ]
      : [
          type === 'profit'
            ? -r.movement_minor
            : r.type === 'asset'
              ? r.closing_minor
              : -r.closing_minor,
        ];
  const ledgerHeaders = [
    'Date',
    'Journal',
    'Entry',
    'Source',
    'Account',
    'Description',
    'Debit',
    'Credit',
    'Running balance',
  ];
  const auditHeaders = [
    'Date',
    'Journal',
    'Entry',
    'Source',
    'Created by',
    'Posted by',
    'Posted at',
    'Approver',
    'Approval',
    'Reverses',
  ];
  const lineHeaders = type === 'ledger' ? ledgerHeaders : auditHeaders;
  const lineValues = (row: any, exportMode = false) =>
    type === 'ledger'
      ? [
          row.entry_on,
          row.journal_code,
          row.reference,
          row.source_type + ' · ' + row.source_id,
          row.code + ' · ' + row.name,
          row.description,
          ...[row.debit_minor, row.credit_minor, row.running_minor].map((n) =>
            exportMode ? n : cash(n),
          ),
        ]
      : [
          row.entry_on,
          row.journal_code,
          row.reference,
          row.source_type + ' · ' + row.source_id,
          row.created_by,
          row.posted_by,
          row.posted_at,
          row.approver,
          row.approval_status,
          row.reverses_id,
        ];
  const rowGroups = new Map<string, any[]>();
  for (const row of data?.accounts || []) {
    const name = group ? row.category : 'Accounts';
    const rows = rowGroups.get(name) || [];
    rows.push(row);
    rowGroups.set(name, rows);
  }
  return (
    <section className="acc-panel acc-statement-print">
      <nav className="acc-toolbar" aria-label="Annual statements">
        {(
          [
            ['balance-sheet', 'Balance Sheet'],
            ['profit-loss', 'Profit and Loss'],
            ['trial-balance', 'Trial Balance'],
            ['ledger', 'General Ledger'],
          ] as const
        ).map(([key, name]) => (
          <button
            key={key}
            className={view === key ? 'acc-primary' : 'acc-secondary'}
            type="button"
            aria-current={view === key ? 'page' : undefined}
            onClick={() => go(key)}
          >
            {name}
          </button>
        ))}
      </nav>
      <Form
        className="panel acc-deferral-filters"
        submit={async (d) => {
          setGroup(d.group === 'on');
          setOffset(0);
          rerun((n) => n + 1);
          setFilters(
            new URLSearchParams(
              Object.entries(d)
                .filter(([key, value]) => key !== 'group' && value)
                .map(([key, value]) => [key, String(value)]),
            ).toString(),
          );
        }}
      >
        <Field label="From">
          <input name="from" type="date" defaultValue={start} min={start} />
        </Field>
        <Field label="Through">
          <input
            name="to"
            type="date"
            defaultValue={today() < start ? start : today()}
            min={start}
          />
        </Field>
        <Field label="Accounting period">
          <select name="period_id">
            <option value="">Custom dates</option>
            {configuration.periods.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fiscal year">
          <select name="fiscal_year_id">
            <option value="">Custom dates</option>
            {years?.data.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Currency">
          <select name="currency" defaultValue={currency}>
            {currencyOptions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Journal">
          <select name="journal_id">
            <option value="">All journals</option>
            {configuration.journals.map((j: any) => (
              <option key={j.id} value={j.id}>
                {j.code} · {j.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Account">
          <select name="account_id" defaultValue={account || ''}>
            <option value="">All accounts</option>
            {configuration.accounts.map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Search">
          <input name="search" maxLength={100} />
        </Field>
        <Field label="Comparison">
          <select name="comparison">
            <option value="">None</option>
            <option value="previous_period">Previous period</option>
            <option value="prior_year">Prior year</option>
          </select>
        </Field>
        <label>
          <input type="checkbox" name="group" defaultChecked /> Group accounts by category
        </label>
        <button className="acc-primary">Run statement</button>
      </Form>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            {data.range.from} to {data.range.to} · {data.currency} · Posted entries · Accrual basis
          </p>
          {data.comparison_range && (
            <p>
              Comparison {data.comparison_range.from} to {data.comparison_range.to}
              {!data.comparison_totals && ' · Before reviewed accounting start'}
            </p>
          )}
          <div className="acc-toolbar">
            <button
              className="acc-secondary"
              onClick={() =>
                exportCsv(
                  'accounting-' + type + '.csv',
                  tableLines
                    ? lineHeaders
                    : [
                        'Account',
                        'Category',
                        ...accountColumns,
                        ...(data.comparison_totals ? ['Comparison'] : []),
                      ],
                  tableLines
                    ? data.data.map((r: any) => lineValues(r, true))
                    : data.accounts.map((r: any) => [
                        r.code + ' ' + r.name,
                        r.category,
                        ...values(r),
                        ...(data.comparison_totals
                          ? [r.comparison ? values(r.comparison).at(-1) : null]
                          : []),
                      ]),
                )
              }
            >
              {tableLines ? 'Export current page CSV' : 'Export CSV'}
            </button>
            <button className="acc-secondary" onClick={() => window.print()}>
              Print statement
            </button>
          </div>
          {t && (
            <dl>
              {(trial || type === 'summary') && (
                <>
                  <dt>Posted debits / credits in selected journals</dt>
                  <dd>
                    {cash(t.debit_minor)} / {cash(t.credit_minor)} ·{' '}
                    {t.balanced ? 'Balanced' : 'Review variance'}
                  </dd>
                </>
              )}
              {(type === 'profit' || type === 'summary') && (
                <>
                  <dt>Net profit or loss</dt>
                  <dd>{cash(t.net_profit_minor)}</dd>
                </>
              )}
              {(type === 'balance' || type === 'summary') && (
                <>
                  <dt>Assets</dt>
                  <dd>{cash(t.assets_minor)}</dd>
                  <dt>Liabilities</dt>
                  <dd>{cash(t.liabilities_minor)}</dd>
                  <dt>Equity</dt>
                  <dd>{cash(t.equity_minor)}</dd>
                  <dt>Posted equity</dt>
                  <dd>{cash(t.posted_equity_minor)}</dd>
                  <dt>Prior-year earnings carried forward</dt>
                  <dd>{cash(t.retained_earnings_minor)}</dd>
                  <dt>Current fiscal year result</dt>
                  <dd>{cash(t.current_year_result_minor)}</dd>
                  <dt>Accounting equation variance</dt>
                  <dd>{cash(t.equation_variance_minor)}</dd>
                </>
              )}
            </dl>
          )}
          {type === 'summary' && (
            <button className="acc-secondary" onClick={() => go('closing')}>
              Open period close checklist
            </button>
          )}
          {tableLines ? (
            <>
              {type === 'ledger' && account && data.accounts[0] && (
                <p>Account closing balance {cash(data.accounts[0].closing_minor)}</p>
              )}
              <div className="acc-journal-table-scroll">
                <table>
                  <thead>
                    <tr>
                      {lineHeaders.map((name) => (
                        <th key={name}>{name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((row: any) => (
                      <tr key={row.id}>
                        {lineValues(row).map((cell, index) => (
                          <td key={index}>
                            {index === 2 ? (
                              <button
                                className="acc-link"
                                onClick={() => openEntry({ id: row.entry_id || row.id })}
                              >
                                {cell}
                              </button>
                            ) : (
                              (cell ?? '—')
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.data.length && <p>No posted journal activity matches the selected filters.</p>}
              <div className="acc-toolbar">
                <button
                  disabled={!offset}
                  onClick={() => setOffset((n) => Math.max(0, n - data.limit))}
                >
                  Previous
                </button>
                <button disabled={!data.has_more} onClick={() => setOffset((n) => n + data.limit)}>
                  Next
                </button>
              </div>
            </>
          ) : (
            [...rowGroups].map(([name, rows]) => (
              <details key={name} open>
                <summary>
                  {label(name)}
                  {group &&
                    !trial &&
                    ' · ' +
                      cash(
                        data.categories.find((item: any) => item.category === name)?.[
                          type === 'profit' ? 'profit_minor' : 'balance_minor'
                        ] ?? 0,
                      )}
                </summary>
                <div className="acc-journal-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Account</th>
                        {accountColumns.map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                        {data.comparison_totals && <th>Comparison</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <button className="acc-link" onClick={() => openAccount(row.id)}>
                              {row.code} · {row.name}
                            </button>
                          </td>
                          {values(row).map((amount, index) => (
                            <td key={index}>{cash(amount)}</td>
                          ))}
                          {data.comparison_totals && (
                            <td>{row.comparison ? cash(values(row.comparison).at(-1)!) : '—'}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))
          )}
        </>
      )}
    </section>
  );
}

export function AccountingPeriodWorkspace(props: Props) {
  if (props.view === 'periods') return <LockDates {...props} />;
  if (props.view === 'fiscal-years') return <FiscalYears {...props} />;
  if (props.view === 'closing') return <Closing {...props} />;
  if (props.view === 'opening-balances' || props.view === 'opening-report')
    return <Opening {...props} />;
  return <Statements {...props} />;
}
