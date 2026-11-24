import { useEffect, useState } from 'react';
import { parseMoney, currencyDigits } from '../../../src/finance/money';
import { Field, Form, money, type API } from '../operations/UI';

const signedMoney = (value: string, currency: string) =>
  value.startsWith('-') ? -parseMoney(value.slice(1), currency) : parseMoney(value, currency);

const decisionLabels: Record<string, string> = {
  approve: 'Approve',
  reject: 'Reject',
  apply: 'Apply approved decision',
  request_reversal: 'Request reversal',
  cancel: 'Withdraw request',
};

export function AccountingBankStatements({
  api,
  configuration,
  manager,
  onOpenEntry,
}: {
  api: API;
  configuration: any;
  manager: boolean;
  onOpenEntry: (entry: unknown) => void;
}) {
  const [journals, setJournals] = useState<any[]>([]);
  const [journalId, setJournalId] = useState('');
  const [register, setRegister] = useState<any>(null);
  const [registerPage, setRegisterPage] = useState(0);
  const [statementId, setStatementId] = useState('');
  const [statement, setStatement] = useState<any>(null);
  const [lineId, setLineId] = useState('');
  const [line, setLine] = useState<any>(null);
  const [candidateId, setCandidateId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [reportMode, setReportMode] = useState(false);
  const [linePage, setLinePage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [revision, refresh] = useState(0);
  const [error, setError] = useState('');
  const bank = journals.find((j) => j.id === journalId);
  const writable = configuration.writable;

  useEffect(() => {
    let active = true;
    api('/accounting/bank-journals').then(
      (result) => {
        if (active) setJournals(result.data);
      },
      (e) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [api, revision]);

  useEffect(() => {
    if (!journalId) return;
    let active = true;
    setRegister(null);
    const path = reportMode
      ? '/accounting/bank-journals/' + journalId + '/unmatched?page=' + registerPage
      : '/accounting/bank-statements?' +
        new URLSearchParams({
          bank_journal_id: journalId,
          page: String(registerPage),
        });
    api(path).then(
      (result) => {
        if (active) setRegister(result);
      },
      (e) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [api, journalId, registerPage, reportMode, revision]);

  useEffect(() => {
    if (!statementId) return;
    let active = true;
    const params = new URLSearchParams({ page: String(linePage), search });
    if (status) params.set('status', status);
    api('/accounting/bank-statements/' + statementId + '?' + params).then(
      (result) => {
        if (active) setStatement(result);
      },
      (e) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [api, statementId, linePage, search, status, revision]);

  useEffect(() => {
    if (!lineId) return;
    let active = true;
    const params = new URLSearchParams({ history_page: String(historyPage) });
    if (partnerId) params.set('partner_id', partnerId);
    api('/accounting/bank-lines/' + lineId + '?' + params).then(
      (result) => {
        if (active) setLine(result);
      },
      (e) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [api, lineId, historyPage, partnerId, revision]);

  function selectStatement(id: string) {
    setStatementId(id);
    setStatement(null);
    setLinePage(0);
    selectLine('');
  }

  function selectLine(id: string) {
    setLineId(id);
    setLine(null);
    setCandidateId('');
    setPartnerId('');
    setHistoryPage(0);
  }

  const candidate = line?.candidates.find((row: any) => row.id === candidateId);
  async function openEntry(id: string) {
    try {
      onOpenEntry(await api('/accounting/entries/' + id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="acc-panel">
      <h2>Bank statements</h2>
      {error && <p role="alert">{error}</p>}
      <Field label="Bank journal">
        <select
          value={journalId}
          onChange={(e) => {
            setJournalId(e.target.value);
            setRegisterPage(0);
            setRegister(null);
            selectStatement('');
          }}
        >
          <option value="">Choose a bank journal</option>
          {journals.map((j) => (
            <option key={j.id} value={j.id}>
              {configuration.journals.find((item: any) => item.id === j.data.journal_id)?.name ||
                'Bank journal'}
              {' · '}
              {j.data.currency}
            </option>
          ))}
        </select>
      </Field>
      {manager && writable && (
        <details>
          <summary>Set up a bank journal</summary>
          <Form
            submit={async (d) => {
              const journal = await api('/accounting/bank-journals', 'POST', d);
              setJournalId(journal.id);
              setRegisterPage(0);
              selectStatement('');
              refresh((n) => n + 1);
            }}
          >
            <Field label="Accounting journal">
              <select name="journal_id" required>
                <option value="">Choose a journal</option>
                {configuration.journals
                  .filter((j: any) => Number(j.active))
                  .map((j: any) => (
                    <option key={j.id} value={j.id}>
                      {j.code} · {j.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Bank asset account">
              <select name="account_id" required>
                <option value="">Choose an account</option>
                {configuration.accounts
                  .filter((a: any) => a.type === 'asset' && Number(a.active))
                  .map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Statement currency">
              <select name="currency" defaultValue={configuration.settings.currency}>
                {Object.keys(currencyDigits).map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </Field>
            <button className="button">Set up bank journal</button>
          </Form>
        </details>
      )}
      {bank && writable && (
        <details>
          <summary>Import bank statement CSV</summary>
          <p>
            Columns in order: date, reference, description, amount, currency. Use negative amounts
            for money out.
          </p>
          <Form
            key={bank.id}
            submit={async (d) => {
              if (
                !(d.csv instanceof File) ||
                !d.csv.name.toLowerCase().endsWith('.csv') ||
                d.csv.size > 96_000
              )
                throw Error('Choose a CSV file no larger than 96 KB');
              const csv = new TextDecoder('utf-8', { fatal: true }).decode(
                await d.csv.arrayBuffer(),
              );
              const result = await api('/accounting/bank-statements', 'POST', {
                bank_journal_id: bank.id,
                name: d.name,
                csv,
                opening_minor: signedMoney(d.opening, bank.data.currency),
                closing_minor: signedMoney(d.closing, bank.data.currency),
              });
              setRegisterPage(0);
              selectStatement(result.id);
              refresh((n) => n + 1);
            }}
          >
            <Field label="Statement name">
              <input name="name" required maxLength={100} />
            </Field>
            <Field label="Opening balance">
              <input name="opening" inputMode="decimal" required />
            </Field>
            <Field label="Closing balance">
              <input name="closing" inputMode="decimal" required />
            </Field>
            <Field label="CSV file">
              <input name="csv" type="file" accept=".csv,text/csv" required />
            </Field>
            <button className="button">Import statement</button>
          </Form>
        </details>
      )}
      {bank && (
        <>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setReportMode(!reportMode);
              setRegister(null);
              setRegisterPage(0);
            }}
          >
            {reportMode ? 'Show statement register' : 'Show unmatched report'}
          </button>
          <h3>{reportMode ? 'Unmatched and partial transactions' : 'Statement register'}</h3>
          {!register && <p role="status">Loading bank records…</p>}
          {register?.data.length === 0 && <p>No bank records on this page.</p>}
          <ul>
            {register?.data.map((row: any) =>
              reportMode ? (
                <li key={row.id}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      selectStatement(row.root_id);
                      selectLine(row.id);
                    }}
                  >
                    {row.data.reference}
                  </button>{' '}
                  {row.data.date} · {row.status} ·{' '}
                  {money(
                    (Math.abs(row.data.amount_minor) - row.data.matched_minor) *
                      Math.sign(row.data.amount_minor),
                    register.currency,
                  )}
                </li>
              ) : (
                <li key={row.id}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => selectStatement(row.id)}
                  >
                    {row.data.name}
                  </button>{' '}
                  {row.data.line_count} lines · closing{' '}
                  {money(row.data.closing_minor, row.data.currency)}
                </li>
              ),
            )}
          </ul>
          <button
            type="button"
            disabled={!registerPage}
            onClick={() => setRegisterPage((n) => n - 1)}
          >
            Previous statements
          </button>
          <button
            type="button"
            disabled={!register?.has_more}
            onClick={() => setRegisterPage((n) => n + 1)}
          >
            Next statements
          </button>
        </>
      )}
      {statement && (
        <>
          <h3>{statement.statement.data.name}</h3>
          <p>
            Opening{' '}
            {money(statement.statement.data.opening_minor, statement.statement.data.currency)}
            {' · '}closing{' '}
            {money(statement.statement.data.closing_minor, statement.statement.data.currency)}
          </p>
          <p>
            {statement.counts.unmatched} unmatched · {statement.counts.partial} partial ·{' '}
            {statement.counts.reconciled} reconciled
          </p>
          <p>
            Outstanding money in{' '}
            {money(statement.outstanding_in_minor, statement.statement.data.currency)}
            {' · '}money out{' '}
            {money(statement.outstanding_out_minor, statement.statement.data.currency)}
          </p>
          <Form
            submit={async (d) => {
              setSearch(d.search);
              setStatus(d.status);
              setLinePage(0);
              selectLine('');
            }}
          >
            <Field label="Search statement lines">
              <input name="search" maxLength={100} />
            </Field>
            <Field label="Reconciliation status">
              <select name="status">
                <option value="">All lines</option>
                <option value="unmatched">Unmatched</option>
                <option value="partial">Partially matched</option>
                <option value="reconciled">Reconciled</option>
              </select>
            </Field>
            <button className="secondary-button">Filter lines</button>
          </Form>
          {statement.lines.length === 0 && <p>No statement lines match these filters.</p>}
          <div className="acc-journal-table-scroll" tabIndex={0} aria-label="Statement lines">
            <table className="acc-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((row: any) => (
                  <tr key={row.id}>
                    <td>{row.data.date}</td>
                    <td>{row.data.reference}</td>
                    <td>{row.data.description}</td>
                    <td>{money(row.data.amount_minor, statement.statement.data.currency)}</td>
                    <td>{row.status}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => selectLine(row.id)}
                      >
                        Open line
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" disabled={!linePage} onClick={() => setLinePage((n) => n - 1)}>
            Previous lines
          </button>
          <button
            type="button"
            disabled={(linePage + 1) * 25 >= statement.total}
            onClick={() => setLinePage((n) => n + 1)}
          >
            Next lines
          </button>
        </>
      )}
      {line && (
        <section className="acc-panel">
          <h3>
            {line.line.data.reference} · {line.line.data.description}
          </h3>
          <p>
            Remaining{' '}
            {money(
              Math.abs(line.line.data.amount_minor) - line.line.data.matched_minor,
              line.currency,
            )}
          </p>
          <h4>Posted journal candidates</h4>
          {partnerId && (
            <button type="button" className="secondary-button" onClick={() => setPartnerId('')}>
              Show candidates for all contacts
            </button>
          )}
          {!line.candidates.length && <p>No available candidate in this search window.</p>}
          {line.candidates_truncated && (
            <p>Results are limited to the first 100 eligible journal lines.</p>
          )}
          <ul>
            {line.candidates.map((row: any) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!writable}
                  onClick={() => setCandidateId(row.id)}
                >
                  {row.reference}
                </button>{' '}
                {row.date} · {row.source_type.replaceAll('_', ' ')} ·{' '}
                {money(row.available_minor, line.currency)}
                {' · '}score {row.score}/100 · {row.reasons.join(', ')}{' '}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void openEntry(row.entry_id)}
                >
                  Open journal entry
                </button>
                {row.contact_id && !partnerId && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setCandidateId('');
                      setPartnerId(row.contact_id);
                    }}
                  >
                    Filter to this contact
                  </button>
                )}
              </li>
            ))}
          </ul>
          {candidate && (
            <Form
              key={candidate.id}
              disabled={!writable}
              submit={async (d) => {
                await api('/accounting/bank-lines/' + line.line.id + '/matches', 'POST', {
                  candidate_id: candidate.id,
                  amount_minor: parseMoney(d.amount, line.currency),
                  reason: d.reason,
                });
                setCandidateId('');
                refresh((n) => n + 1);
              }}
            >
              <p>Propose a match to {candidate.reference}</p>
              <Field label="Amount to match">
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  defaultValue={String(
                    candidate.suggested_minor / 10 ** currencyDigits[line.currency],
                  )}
                />
              </Field>
              <Field label="Review reason">
                <input name="reason" minLength={4} maxLength={400} required />
              </Field>
              <button className="button">Request match review</button>
            </Form>
          )}
          <h4>Matches and decisions</h4>
          {line.matches.map((match: any) => {
            const actions = match.can_review
              ? ['approve', 'reject']
              : ['approved', 'reversal_approved'].includes(match.status)
                ? ['apply']
                : match.status === 'applied'
                  ? ['request_reversal']
                  : [];
            if (match.can_cancel) actions.push('cancel');
            return (
              <article key={match.id}>
                <p>
                  {match.data.candidate.reference} · {money(match.data.amount_minor, line.currency)}
                  {' · '}
                  {match.status.replaceAll('_', ' ')}
                </p>
                <p>{match.data.reason}</p>
                {writable && actions.length > 0 && (
                  <Form
                    key={match.version}
                    submit={async (d) => {
                      await api('/accounting/bank-matches/' + match.id + '/decision', 'POST', {
                        action: d.action,
                        expected_version: match.version,
                        reason: d.reason,
                      });
                      refresh((n) => n + 1);
                    }}
                  >
                    <Field label="Decision">
                      <select name="action">
                        {actions.map((action) => (
                          <option key={action} value={action}>
                            {decisionLabels[action]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Decision reason">
                      <input name="reason" required minLength={4} maxLength={400} />
                    </Field>
                    <button className="button">Save decision</button>
                  </Form>
                )}
              </article>
            );
          })}
          <h4>Line history</h4>
          <ol>
            {line.history.map((event: any) => (
              <li key={event.version}>
                {event.created_at} · {event.action.replaceAll('_', ' ')} ·{' '}
                {event.snapshot.data.last_reason || 'Statement imported'}
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={!historyPage}
            onClick={() => setHistoryPage((n) => n - 1)}
          >
            Previous history
          </button>
          <button
            type="button"
            disabled={!line.history_has_more}
            onClick={() => setHistoryPage((n) => n + 1)}
          >
            Next history
          </button>
        </section>
      )}
    </section>
  );
}
