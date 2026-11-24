import { Fragment, useEffect, useRef, useState } from 'react';
import { currencyDigits } from '../../../src/finance/money';
import { Field, Form, money, today, type API } from '../operations/UI';
import type { AccountingView } from './accounting-app-model';

type Kind = 'expense' | 'revenue';
type Action = { action: string; [key: string]: unknown };
const base = '/accounting/deferrals';
const modelPath = '/accounting/deferral-models';
const label = (value: string) => value.replaceAll('_', ' ');
const statuses = ['draft', 'running', 'recognized', 'archived'];

function Policy({ value }: { value?: { frequency: string; method: string } }) {
  return (
    <>
      <Field label="Frequency">
        <select name="frequency" defaultValue={value?.frequency || 'monthly'}>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
        </select>
      </Field>
      <Field label="Allocation basis">
        <select name="method" defaultValue={value?.method || 'equal'}>
          <option value="equal">Equal periods</option>
          <option value="days">Actual days</option>
          <option value="months">Months with prorata</option>
          <option value="full_months">Full months, prorate the final month</option>
        </select>
      </Field>
    </>
  );
}

function StateOptions() {
  return (
    <>
      <option value="">All states</option>
      {statuses.map((state) => (
        <option key={state}>{state}</option>
      ))}
    </>
  );
}

function rangeEnd(start: string, months: number) {
  const initial = new Date(start + 'T00:00:00Z');
  if (!Number.isFinite(initial.getTime())) return '';
  const last = new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth() + months + 1, 0));
  const target = new Date(
    Date.UTC(
      last.getUTCFullYear(),
      last.getUTCMonth(),
      Math.min(initial.getUTCDate(), last.getUTCDate()),
    ),
  );
  return new Date(target.getTime() - 86_400_000).toISOString().slice(0, 10);
}

function Editor({
  api,
  configuration,
  type,
  initial,
  preset,
  model,
  onSave,
  discard,
}: {
  api: API;
  configuration: any;
  type: Kind;
  initial?: any;
  preset?: any;
  model: boolean;
  onSave: (value: any) => void;
  discard: () => void;
}) {
  const data = initial?.data || preset?.data || {};
  const [kind, setKind] = useState<Kind>(data.kind || type);
  const [account, setAccount] = useState(data.deferred_account_id || '');
  const [currency, setCurrency] = useState(data.currency || configuration.settings.currency);
  const [selected, setSelected] = useState(data.source_entry_id || '');
  const [start, setStart] = useState(data.start_on || '');
  const [end, setEnd] = useState(data.end_on || '');
  const [options, setOptions] = useState<any[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (model || !account) return;
    let active = true;
    api('/accounting/deferral-sources?' + new URLSearchParams({ account, kind, currency })).then(
      (result) => {
        if (active) {
          setOptions(result.data);
          setError('');
        }
      },
      (e) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [account, currency, model, kind, api]);
  const source = options.find((row) => row.id === selected);
  const expectedType = kind === 'expense' ? 'asset' : 'liability';
  const accounts = (accountType: string) =>
    configuration.accounts.filter((a: any) => a.type === accountType && Number(a.active));
  const setStartDate = (date: string) => {
    setStart(date);
    if (preset?.data.duration_months) setEnd(rangeEnd(date, preset.data.duration_months));
  };
  return (
    <Form
      submit={async (d) => {
        const record = {
          kind,
          name: d.name,
          expected_version: initial?.version || 0,
          deferred_account_id: account,
          recognition_account_id: d.recognition,
          journal_id: d.journal,
          policy: { frequency: d.frequency, method: d.method },
        };
        const payload = model
          ? { ...record, active: d.active === 'on', duration_months: Number(d.duration) }
          : {
              ...record,
              source_entry_id: selected,
              currency,
              start_on: d.start_on,
              end_on: d.end_on,
              amount_minor: Number(source?.amount_minor ?? initial?.data.amount_minor),
              ...(preset?.id || initial?.data.model_id
                ? { model_id: preset?.id || initial.data.model_id }
                : {}),
            };
        onSave(
          await api(
            (model ? modelPath : base) + (initial ? '/' + initial.id : ''),
            initial ? 'PUT' : 'POST',
            payload,
          ),
        );
      }}
    >
      {model && (
        <Field label="Deferral type">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              setAccount('');
            }}
          >
            <option value="expense">Expense</option>
            <option value="revenue">Revenue</option>
          </select>
        </Field>
      )}
      <Field label={model ? 'Model name' : 'Deferral name'}>
        <input name="name" defaultValue={initial?.data.name} maxLength={100} required />
      </Field>
      <Field label={kind === 'expense' ? 'Prepaid expense account' : 'Deferred revenue account'}>
        <select
          value={account}
          required
          onChange={(e) => {
            setAccount(e.target.value);
            setSelected('');
            setOptions([]);
          }}
        >
          <option value="">Select account</option>
          {accounts(expectedType).map((a: any) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Recognition account">
        <select
          key={kind}
          name="recognition"
          defaultValue={data.recognition_account_id || ''}
          required
        >
          <option value="">Select account</option>
          {accounts(kind).map((a: any) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Recognition journal">
        <select name="journal" defaultValue={data.journal_id || ''} required>
          <option value="">Select journal</option>
          {configuration.journals
            .filter((j: any) => Number(j.active))
            .map((j: any) => (
              <option key={j.id} value={j.id}>
                {j.code} · {j.name}
              </option>
            ))}
        </select>
      </Field>
      <Policy value={data.policy} />
      {model ? (
        <>
          <Field label="Default duration in months">
            <input
              name="duration"
              type="number"
              min="1"
              max="360"
              defaultValue={data.duration_months || 12}
              required
            />
          </Field>
          <label>
            <input name="active" type="checkbox" defaultChecked={data.active ?? true} /> Active
            model
          </label>
        </>
      ) : (
        <>
          <Field label="Currency">
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setSelected('');
                setOptions([]);
              }}
            >
              {Object.keys(currencyDigits).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Posted source journal">
            <select
              value={selected}
              required
              onChange={(e) => {
                setSelected(e.target.value);
                const row = options.find((option) => option.id === e.target.value);
                if (row) setStartDate(row.entry_on);
              }}
            >
              <option value="">Select a posted balance</option>
              {initial?.data.source_entry_id &&
                !options.some((row) => row.id === initial.data.source_entry_id) && (
                  <option value={initial.data.source_entry_id}>
                    {initial.data.source_reference}
                  </option>
                )}
              {options.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.reference} · {money(Number(row.amount_minor), currency)}
                </option>
              ))}
            </select>
          </Field>
          {error && <p role="alert">{error}</p>}
          {selected && (
            <p>
              Original deferred amount{' '}
              {money(Number(source?.amount_minor ?? initial?.data.amount_minor ?? 0), currency)}
            </p>
          )}
          <Field label="Recognition start">
            <input
              type="date"
              name="start_on"
              value={start}
              required
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="Recognition end">
            <input
              type="date"
              name="end_on"
              min={start}
              value={end}
              required
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </>
      )}
      <button className="button">Save {model ? 'model' : 'draft'}</button>{' '}
      <button type="button" className="secondary-button" onClick={discard}>
        Discard
      </button>
    </Form>
  );
}

function exportCsv(header: string[], rows: unknown[][], filename: string) {
  const encode = (value: unknown) => {
    const text = String(value ?? '');
    return (
      '"' +
      (/^[=+\-@\t\r]/.test(text) && typeof value === 'string' ? "'" + text : text).replaceAll(
        '"',
        '""',
      ) +
      '"'
    );
  };
  const url = URL.createObjectURL(
    new Blob([[header, ...rows].map((row) => row.map(encode).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AccountingDeferrals({
  view,
  api,
  configuration,
  manager,
  revision,
  go,
  onOpenEntry,
  onOpenInvoice,
  onOpenBill,
}: {
  view: AccountingView;
  api: API;
  configuration: any;
  manager: boolean;
  revision: number;
  go: (view: AccountingView, deferralId?: string) => void;
  onOpenEntry: (entry: any) => void;
  onOpenInvoice: (invoice: any) => void;
  onOpenBill: (bill: any) => void;
}) {
  const kind: Kind = view.includes('revenue') ? 'revenue' : 'expense';
  const reportView = view.endsWith('-report');
  const modelsView = view === 'deferral-models';
  const title = kind === 'expense' ? 'Deferred Expenses' : 'Deferred Revenue';
  const writable = configuration.writable;
  const [selected, setSelected] = useState(
    () => new URL(location.href).searchParams.get('deferral') || '',
  );
  const [record, setRecord] = useState<any>(null);
  const [register, setRegister] = useState<any>(null);
  const [models, setModels] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [reportQuery, setReportQuery] = useState(
    new URLSearchParams({ from: today().slice(0, 7) + '-01', to: today() }).toString(),
  );
  const [filters, setFilters] = useState('');
  const [offset, setOffset] = useState(0);
  const [group, setGroup] = useState('');
  const [editor, setEditor] = useState<any>(null);
  const [template, setTemplate] = useState('');
  const [tab, setTab] = useState('board');
  const [posted, setPosted] = useState(false);
  const [changed, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const restore = () => {
      setSelected(new URL(location.href).searchParams.get('deferral') || '');
      setEditor(null);
    };
    window.addEventListener('popstate', restore);
    return () => {
      mounted.current = false;
      window.removeEventListener('popstate', restore);
    };
  }, []);
  useEffect(() => {
    let active = true;
    api(modelPath).then(
      (data) => {
        if (active) setModels(data.data);
      },
      (e) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [api, changed, revision]);
  useEffect(() => {
    let active = true;
    const request = reportView
      ? '/accounting/deferral-report?kind=' + kind + '&' + reportQuery
      : base + '?kind=' + kind + '&offset=' + offset + '&' + filters;
    api(request).then(
      (data) => {
        if (active) {
          if (reportView) setReport(data);
          else setRegister(data);
        }
      },
      (e) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [api, kind, reportView, reportQuery, offset, filters, changed, revision]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    api(base + '/' + encodeURIComponent(selected)).then(
      (result) => {
        if (active) setRecord(result);
      },
      (e) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [api, selected, changed, revision]);

  const current =
    record?.record.id === selected && record?.record.data.kind === kind ? record : null;
  const rows = current?.rows || [];
  const next = rows.find((r: any) => r.amount_minor && r.posting !== 'posted');
  const viewRows = posted ? rows.filter((r: any) => r.posting === 'posted') : rows;
  const registerRows = [...(register?.data || [])];
  if (group) registerRows.sort((a, b) => String(a[group]).localeCompare(String(b[group])));
  const preset = models.find((m) => m.id === template);
  const accountName = (id: string) =>
    configuration.accounts.find((a: any) => a.id === id)?.name || id;
  const journalName = (id: string) =>
    configuration.journals.find((j: any) => j.id === id)?.name || id;
  const pick = (id: string) => {
    if (!mounted.current) return;
    const url = new URL(location.href);
    if (id) url.searchParams.set('deferral', id);
    else url.searchParams.delete('deferral');
    history.pushState(history.state, '', url);
    setSelected(id);
    setEditor(null);
    setError('');
    setPosted(false);
    setTab('board');
  };
  const openJournal = async (id: string) => {
    try {
      const row = await api('/accounting/entries/' + id);
      if (mounted.current) onOpenEntry(row);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  function commercialSource(source: { source_type: string; source_id: string }) {
    const invoice = source.source_type === 'invoice';
    if (!invoice && source.source_type !== 'supplier_bill') return null;
    async function open() {
      setError('');
      try {
        const id = encodeURIComponent(source.source_id);
        const result = await api(invoice ? '/records/invoices/' + id : '/procurement/bill/' + id);
        if (mounted.current) {
          if (invoice) onOpenInvoice(result);
          else onOpenBill(result.record);
        }
      } catch (e) {
        if (mounted.current) setError((e as Error).message);
      }
    }
    return (
      <button type="button" className="secondary-button" onClick={() => void open()}>
        {invoice ? 'Open invoice' : 'Open vendor bill'}
      </button>
    );
  }
  async function apply(action: Action) {
    setError('');
    setBusy(true);
    try {
      const result = await api(base + '/' + current.record.id + '/action', 'POST', {
        ...action,
        expected_version: current.record.version,
      });
      refresh((v) => v + 1);
      if (action.action === 'prepare' && mounted.current) onOpenEntry(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const reportFields = [
    'amount_minor',
    'before_minor',
    'period_minor',
    'recognized_minor',
    'balance_minor',
    'proposed_in_period_minor',
    'later_planned_minor',
    'overdue_minor',
  ];

  return (
    <section className="acc-panel">
      <h2>
        {modelsView
          ? 'Deferral Models'
          : reportView
            ? title + ' Report'
            : current?.record.data.name || title}
      </h2>
      {error && <p role="alert">{error}</p>}
      {modelsView ? (
        <>
          {manager && writable && (
            <button type="button" className="button" onClick={() => setEditor({ model: true })}>
              New model
            </button>
          )}
          <ul>
            {models.map((m) => (
              <li key={m.id}>
                {m.data.name} · {m.data.kind} · {m.data.duration_months} months ·{' '}
                {m.data.active ? 'active' : 'inactive'}{' '}
                {manager && writable && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditor({ model: true, row: m })}
                  >
                    Edit model
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editor?.model && (
            <Editor
              key={editor.row?.id || 'model'}
              api={api}
              configuration={configuration}
              type={kind}
              model
              initial={editor.row}
              discard={() => setEditor(null)}
              onSave={() => {
                setEditor(null);
                refresh((v) => v + 1);
              }}
            />
          )}
        </>
      ) : reportView ? (
        <>
          <p>
            Manually configured deferrals only. Posted recognition is net of posted reversals
            through the report dates. Planned values use the current board.
          </p>
          <Form
            className="panel acc-deferral-filters"
            submit={async (d) => {
              const params = new URLSearchParams();
              for (const key of [
                'period_id',
                'from',
                'to',
                'account',
                'journal',
                'partner',
                'state',
              ])
                if (d[key]) params.set(key, d[key]);
              setReportQuery(params.toString());
              setGroup(d.group);
              setReport(null);
              setError('');
              refresh((v) => v + 1);
            }}
          >
            <Field label="From">
              <input name="from" type="date" defaultValue={today().slice(0, 7) + '-01'} />
            </Field>
            <Field label="To">
              <input name="to" type="date" defaultValue={today()} />
            </Field>
            <Field label="Accounting period (overrides dates)">
              <select name="period_id">
                <option value="">Custom dates</option>
                {configuration.periods.map((period: any) => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Account">
              <select name="account">
                <option value="">All accounts</option>
                {configuration.accounts.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Journal">
              <select name="journal">
                <option value="">All journals</option>
                {configuration.journals.map((j: any) => (
                  <option key={j.id} value={j.id}>
                    {j.code} · {j.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Partner record ID">
              <input name="partner" />
            </Field>
            <Field label="State">
              <select name="state">
                <StateOptions />
              </select>
            </Field>
            <Field label="Group by">
              <select name="group">
                <option value="">None</option>
                <option value="currency">Currency</option>
                <option value="deferred_account_id">Deferred account</option>
                <option value="journal_id">Journal</option>
                <option value="status">State</option>
              </select>
            </Field>
            <button className="button">Run report</button>
          </Form>
          {report && (
            <>
              <p>
                {report.from} to {report.to}
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  exportCsv(
                    [
                      'name',
                      'source',
                      'currency',
                      'account',
                      'journal',
                      'partner',
                      'start',
                      'end',
                      'state',
                      ...reportFields,
                    ],
                    report.data.map((r: any) => [
                      r.name,
                      r.source_reference,
                      r.currency,
                      accountName(r.deferred_account_id),
                      journalName(r.journal_id),
                      r.contact_id,
                      r.start_on,
                      r.end_on,
                      r.status,
                      ...reportFields.map((field) => r[field]),
                    ]),
                    'deferral-report.csv',
                  )
                }
              >
                Export CSV
              </button>
              <div
                className="acc-journal-table-scroll"
                tabIndex={0}
                aria-label="Deferred accounting report"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Deferral</th>
                      <th>Source</th>
                      <th>Account / journal</th>
                      <th>State</th>
                      <th>Original</th>
                      <th>Before period</th>
                      <th>Posted in period</th>
                      <th>Recognized to date</th>
                      <th>Deferred balance</th>
                      <th>Open in period</th>
                      <th>Planned later</th>
                      <th>Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...report.data]
                      .sort((a, b) =>
                        group ? String(a[group]).localeCompare(String(b[group])) : 0,
                      )
                      .map((r: any, index, all) => (
                        <ReportLine
                          key={r.id}
                          row={r}
                          groupTitle={
                            group && (!index || all[index - 1][group] !== r[group])
                              ? group === 'deferred_account_id'
                                ? accountName(r[group])
                                : group === 'journal_id'
                                  ? journalName(r[group])
                                  : r[group]
                              : undefined
                          }
                          fields={reportFields}
                          onSource={() => void openJournal(r.source_entry_id)}
                          commercialSource={commercialSource(r)}
                          accounts={
                            accountName(r.deferred_account_id) + ' / ' + journalName(r.journal_id)
                          }
                          onOpen={() =>
                            go(kind === 'expense' ? 'deferred-expenses' : 'deferred-revenue', r.id)
                          }
                        />
                      ))}
                  </tbody>
                </table>
                {!report.data.length && <p>No deferrals match these filters.</p>}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <button type="button" className="secondary-button" onClick={() => pick('')}>
            {title} register
          </button>{' '}
          {writable && (
            <button
              type="button"
              className="button"
              onClick={() => {
                setTemplate('');
                setEditor({ model: false });
              }}
            >
              New deferral
            </button>
          )}
          {editor && !editor.model && (
            <>
              {!editor.row && (
                <Field label="Apply model">
                  <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                    <option value="">Manual setup</option>
                    {models
                      .filter((m) => m.data.kind === kind && m.data.active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.data.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <Editor
                key={editor.row?.id || 'new:' + template}
                api={api}
                configuration={configuration}
                type={kind}
                model={false}
                initial={editor.row}
                preset={preset}
                discard={() => setEditor(null)}
                onSave={(row) => {
                  pick(row.id);
                  refresh((n) => n + 1);
                }}
              />
            </>
          )}
          {!selected && !editor && (
            <>
              <Form
                submit={async (d) => {
                  const params = new URLSearchParams();
                  for (const key of ['search', 'from', 'to', 'state'])
                    if (d[key]) params.set(key, d[key]);
                  setOffset(0);
                  setFilters(params.toString());
                  setError('');
                }}
              >
                <Field label="Search deferrals">
                  <input name="search" maxLength={100} />
                </Field>
                <Field label="From">
                  <input name="from" type="date" />
                </Field>
                <Field label="To">
                  <input name="to" type="date" />
                </Field>
                <Field label="State">
                  <select name="state">
                    <StateOptions />
                  </select>
                </Field>
                <button className="secondary-button">Filter register</button>
              </Form>
              <Field label="Group this page by">
                <select value={group} onChange={(event) => setGroup(event.target.value)}>
                  <option value="">None</option>
                  <option value="status">State</option>
                  <option value="currency">Currency</option>
                </select>
              </Field>
              <div className="acc-journal-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Deferral</th>
                      <th>Source</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Original amount</th>
                      <th>Recognized</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registerRows.map((r, index) => (
                      <Fragment key={r.id}>
                        {group && r[group] !== registerRows[index - 1]?.[group] && (
                          <tr>
                            <th colSpan={7}>{r[group]}</th>
                          </tr>
                        )}
                        <tr>
                          <td>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => pick(r.id)}
                            >
                              {r.name}
                            </button>
                          </td>
                          <td>{r.source_reference}</td>
                          <td>{r.start_on}</td>
                          <td>{r.end_on}</td>
                          <td>{money(r.amount_minor, r.currency)}</td>
                          <td>{money(r.recognized_minor, r.currency)}</td>
                          <td>{r.status}</td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {register?.data.length === 0 && <p>No deferrals match these filters.</p>}
              <button type="button" disabled={!offset} onClick={() => setOffset((v) => v - 25)}>
                Previous
              </button>{' '}
              <button
                type="button"
                disabled={!register?.has_more}
                onClick={() => setOffset((v) => v + 25)}
              >
                Next
              </button>
            </>
          )}
          {current && !editor && (
            <>
              <header>
                <p>
                  State {current.status} · Version {current.record.version}
                </p>
                {writable && current.status === 'draft' && (
                  <>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setTemplate('');
                        setEditor({ row: current.record });
                      }}
                    >
                      Edit draft
                    </button>{' '}
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void apply({ action: 'compute' })}
                    >
                      Compute schedule
                    </button>{' '}
                    {rows.length > 0 && (
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => void apply({ action: 'confirm' })}
                      >
                        Confirm reviewed schedule
                      </button>
                    )}{' '}
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void apply({ action: 'archive' })}
                    >
                      Archive draft
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setPosted(true);
                    setTab('board');
                  }}
                >
                  Posted entries ({rows.filter((r: any) => r.posting === 'posted').length})
                </button>
              </header>
              {writable &&
                manager &&
                current.status === 'running' &&
                current.recognized_minor === 0 && (
                  <details>
                    <summary>Retire schedule for source correction</summary>
                    <Form
                      submit={(data) => apply({ action: 'retire', reason: data.reason })}
                      disabled={busy}
                    >
                      <Field label="Reason">
                        <input name="reason" minLength={5} maxLength={400} required />
                      </Field>
                      <button className="secondary-button">Retire schedule</button>
                    </Form>
                  </details>
                )}
              <p>
                Original {money(current.record.data.amount_minor, current.record.data.currency)} ·
                Posted {money(current.recognized_minor, current.record.data.currency)}
                {' · '}Remaining {money(current.remaining_minor, current.record.data.currency)}
              </p>
              <nav aria-label="Deferral details">
                {['Details', 'Board', 'Source', 'History'].map((name) => (
                  <button
                    type="button"
                    key={name}
                    aria-current={tab === name.toLowerCase() ? 'page' : undefined}
                    className="secondary-button"
                    onClick={() => {
                      setPosted(false);
                      setTab(name.toLowerCase());
                    }}
                  >
                    {name}
                  </button>
                ))}
              </nav>
              {tab === 'details' && (
                <dl>
                  <dt>Recognition dates</dt>
                  <dd>
                    {current.record.data.start_on} – {current.record.data.end_on}
                  </dd>
                  <dt>Allocation</dt>
                  <dd>
                    {label(current.record.data.policy.method)} ·{' '}
                    {current.record.data.policy.frequency}
                  </dd>
                  <dt>Deferred account</dt>
                  <dd>{accountName(current.record.data.deferred_account_id)}</dd>
                  <dt>Recognition account</dt>
                  <dd>{accountName(current.record.data.recognition_account_id)}</dd>
                  <dt>Journal</dt>
                  <dd>{journalName(current.record.data.journal_id)}</dd>
                </dl>
              )}
              {tab === 'source' && (
                <p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void openJournal(current.record.data.source_entry_id)}
                  >
                    {current.record.data.source_reference}
                  </button>
                  {' · '}
                  {label(current.record.data.source_type)}
                  {' · '}
                  {current.record.data.source_on}
                  {current.record.data.contact_id && (
                    <> · Partner {current.record.data.contact_id}</>
                  )}{' '}
                  {commercialSource(current.record.data)}
                </p>
              )}
              {tab === 'history' && (
                <>
                  {current.record.data.retirement_reason && (
                    <p>Retired: {current.record.data.retirement_reason}</p>
                  )}
                  <ol>
                    {current.history.map((event: any) => (
                      <li key={event.version}>
                        Version {event.version} · {label(event.action)} · {event.created_at}
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {tab === 'board' && (
                <>
                  {!rows.length && <p>Compute a schedule to review the recognition board.</p>}
                  {rows.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setPosted(!posted)}
                      >
                        {posted ? 'Show all periods' : 'Show posted periods'}
                      </button>{' '}
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          exportCsv(
                            [
                              'date',
                              'amount_minor',
                              'cumulative_minor',
                              'remaining_minor',
                              'currency',
                              'journal_reference',
                              'state',
                            ],
                            viewRows.map((r: any) => [
                              r.date,
                              r.amount_minor,
                              r.cumulative_minor,
                              r.remaining_minor,
                              current.record.data.currency,
                              r.journal_reference,
                              r.posting,
                            ]),
                            'recognition-board.csv',
                          )
                        }
                      >
                        Export board CSV
                      </button>
                      <div
                        className="acc-journal-table-scroll acc-deferral-board"
                        tabIndex={0}
                        aria-label="Recognition periods"
                      >
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Recognition</th>
                              <th>Cumulative</th>
                              <th>Remaining</th>
                              <th>Journal entry</th>
                              <th>Posting state</th>
                            </tr>
                          </thead>
                          <tbody>
                            {viewRows.map((r: any) => (
                              <tr key={r.date}>
                                <td>{r.date}</td>
                                {['amount_minor', 'cumulative_minor', 'remaining_minor'].map(
                                  (field) => (
                                    <td key={field}>
                                      {money(r[field], current.record.data.currency)}
                                    </td>
                                  ),
                                )}
                                <td>
                                  {r.journal_entry_id ? (
                                    <button
                                      type="button"
                                      className="secondary-button"
                                      onClick={() => void openJournal(r.journal_entry_id)}
                                    >
                                      {r.journal_reference}
                                    </button>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td>
                                  {label(r.posting)}{' '}
                                  {writable &&
                                    current.status === 'running' &&
                                    next?.date === r.date && (
                                      <button
                                        type="button"
                                        className="secondary-button"
                                        disabled={busy}
                                        onClick={() =>
                                          void apply({
                                            action: ['draft', 'approved'].includes(r.posting)
                                              ? 'withdraw'
                                              : 'prepare',
                                            date: r.date,
                                          })
                                        }
                                      >
                                        {['draft', 'approved'].includes(r.posting)
                                          ? 'Withdraw draft'
                                          : 'Prepare journal'}
                                      </button>
                                    )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {writable &&
                    current.status === 'running' &&
                    !['draft', 'approved'].includes(next?.posting) && (
                      <details>
                        <summary>Revise unposted recognition</summary>
                        <Form
                          key={current.record.version}
                          submit={async (d) =>
                            apply({
                              action: 'revise',
                              start_on: d.start,
                              end_on: d.end,
                              reason: d.reason,
                              policy: { method: d.method, frequency: d.frequency },
                            })
                          }
                          disabled={busy}
                        >
                          <Field label="New start for unposted recognition">
                            <input
                              name="start"
                              type="date"
                              min={current.record.data.start_on}
                              required
                            />
                          </Field>
                          <Field label="New end">
                            <input
                              name="end"
                              type="date"
                              defaultValue={current.record.data.end_on}
                              required
                            />
                          </Field>
                          <Policy value={current.record.data.policy} />
                          <Field label="Reason">
                            <input name="reason" minLength={5} maxLength={400} required />
                          </Field>
                          <button className="button">Update future periods</button>
                        </Form>
                      </details>
                    )}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function ReportLine({
  row,
  groupTitle,
  fields,
  onSource,
  commercialSource,
  onOpen,
  accounts,
}: {
  row: any;
  groupTitle?: string;
  fields: string[];
  onSource: () => void;
  commercialSource: React.ReactNode;
  onOpen: () => void;
  accounts: string;
}) {
  return (
    <>
      {groupTitle && (
        <tr>
          <th colSpan={12} scope="rowgroup">
            {groupTitle}
          </th>
        </tr>
      )}
      <tr>
        <td>
          <button type="button" className="secondary-button" onClick={onOpen}>
            {row.name}
          </button>
        </td>
        <td>
          <button type="button" className="secondary-button" onClick={onSource}>
            {row.source_reference}
          </button>
          {commercialSource}
        </td>
        <td>{accounts}</td>
        <td>{row.status}</td>
        {fields.map((field) => (
          <td key={field}>{money(row[field], row.currency)}</td>
        ))}
      </tr>
    </>
  );
}
