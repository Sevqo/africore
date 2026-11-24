import { useEffect, useRef, useState } from 'react';
import { currencyDigits, parseMoney } from '../../../src/finance/money';
import { Field, Form, money, type API } from '../operations/UI';
import type { AccountingView } from './accounting-app-model';

const currencies = Object.keys(currencyDigits);
const methods: Record<string, string> = {
  straight_line: 'Straight line',
  declining: 'Declining balance',
  none: 'Non-depreciable',
};
const statusLabel = (status: string) => status.replaceAll('_', ' ');
const amountText = (n: number | undefined, currency: string) =>
  n === undefined ? '' : String(n / 10 ** currencyDigits[currency]);

function values(d: any) {
  return {
    method: d.method,
    frequency: d.frequency,
    periods: d.method === 'none' ? 0 : Number(d.periods),
    rate_bps: d.method === 'declining' ? parseMoney(d.rate, 'KES') : 0,
    prorata: d.prorata === 'on',
  };
}
function PlanFields({ initial }: { initial?: any }) {
  const [method, setMethod] = useState(initial?.method || 'straight_line');
  const [frequency, setFrequency] = useState(initial?.frequency || 'monthly');
  return (
    <>
      <Field label="Depreciation method">
        <select name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {Object.entries(methods).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Frequency">
        <select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
        </select>
      </Field>
      {method !== 'none' && (
        <Field label="Useful life in periods">
          <input
            name="periods"
            type="number"
            min="1"
            max={frequency === 'annual' ? 60 : 360}
            defaultValue={initial?.periods || 12}
            required
          />
        </Field>
      )}
      {method === 'declining' && (
        <Field label="Declining rate per period (%)">
          <input
            name="rate"
            type="number"
            min="0.01"
            max="100"
            step="0.01"
            required
            defaultValue={initial?.rate_bps ? initial.rate_bps / 100 : ''}
          />
        </Field>
      )}
      {method !== 'none' && (
        <label>
          <input name="prorata" type="checkbox" defaultChecked={initial?.prorata} /> Prorate first
          period
        </label>
      )}
    </>
  );
}

function AccountOptions({ configuration, type }: { configuration: any; type: string }) {
  return (
    <>
      <option value="">Select an account</option>
      {configuration.accounts
        .filter((a: any) => a.type === type && Number(a.active))
        .map((a: any) => (
          <option key={a.id} value={a.id}>
            {a.code} · {a.name}
          </option>
        ))}
    </>
  );
}

function AssetEditor({
  api,
  configuration,
  initial,
  defaults,
  isModel,
  modelId,
  onSaved,
  onDiscard,
}: {
  api: API;
  configuration: any;
  initial?: any;
  defaults?: any;
  isModel: boolean;
  modelId?: string;
  onSaved: (result: any) => void;
  onDiscard: () => void;
}) {
  const data = initial?.data ?? defaults ?? {};
  const [currency, setCurrency] = useState(data.currency || configuration.settings.currency);
  const [account, setAccount] = useState(data.accounts?.asset_account_id || '');
  const [source, setSource] = useState(data.acquisition_entry_id || '');
  const [gross, setGross] = useState(amountText(data.gross_minor, currency));
  const [acquired, setAcquired] = useState(data.acquisition_on || '');
  const [start, setStart] = useState(data.start_on || '');
  const [sources, setSources] = useState<any[]>([]);
  const [error, setError] = useState('');
  const base = isModel ? '/accounting/asset-models' : '/accounting/assets';

  useEffect(() => {
    if (isModel || !account) return;
    let current = true;
    const query = new URLSearchParams({ account, currency });
    api('/accounting/asset-sources?' + query).then(
      (result) => {
        if (current) {
          setSources(result.data);
          setError('');
        }
      },
      (e) => {
        if (current) setError(e.message);
      },
    );
    return () => {
      current = false;
    };
  }, [api, account, currency, isModel]);

  function chooseSource(next: string) {
    setSource(next);
    const selected = sources.find((row) => row.id === next);
    if (selected) {
      setGross(amountText(Number(selected.amount_minor), currency));
      setAcquired(selected.entry_on);
      setStart(selected.entry_on);
    }
  }

  return (
    <Form
      submit={async (d) => {
        const common = {
          name: d.name,
          expected_version: initial?.version ?? 0,
          terms: values(d),
          accounts: {
            asset_account_id: account,
            accumulated_account_id: d.accumulated,
            expense_account_id: d.expense,
            journal_id: d.journal,
          },
        };
        const payload = isModel
          ? common
          : {
              ...common,
              ...(modelId ? { model_id: modelId } : {}),
              acquisition_entry_id: source,
              currency,
              acquisition_on: acquired,
              start_on: start,
              gross_minor: parseMoney(gross, currency),
              salvage_minor: parseMoney(d.salvage, currency),
              prior_minor: parseMoney(d.prior, currency),
            };
        onSaved(
          await api(base + (initial ? '/' + initial.id : ''), initial ? 'PUT' : 'POST', payload),
        );
      }}
    >
      <Field label={isModel ? 'Model name' : 'Asset name'}>
        <input name="name" defaultValue={initial?.data.name} required maxLength={100} />
      </Field>
      <h4>Account configuration</h4>
      <Field label="Fixed asset account">
        <select
          value={account}
          required
          onChange={(e) => {
            setAccount(e.target.value);
            setSources([]);
            setSource('');
          }}
        >
          <AccountOptions configuration={configuration} type="asset" />
        </select>
      </Field>
      <Field label="Accumulated depreciation account">
        <select
          name="accumulated"
          defaultValue={data.accounts?.accumulated_account_id || ''}
          required
        >
          <AccountOptions configuration={configuration} type="asset" />
        </select>
      </Field>
      <Field label="Depreciation expense account">
        <select name="expense" defaultValue={data.accounts?.expense_account_id || ''} required>
          <AccountOptions configuration={configuration} type="expense" />
        </select>
      </Field>
      <Field label="Depreciation journal">
        <select name="journal" defaultValue={data.accounts?.journal_id || ''} required>
          <option value="">Select a journal</option>
          {configuration.journals
            .filter((j: any) => Number(j.active))
            .map((j: any) => (
              <option key={j.id} value={j.id}>
                {j.code} · {j.name}
              </option>
            ))}
        </select>
      </Field>
      {!isModel && (
        <>
          <h4>Acquisition and current values</h4>
          <Field label="Currency">
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setSource('');
                setSources([]);
              }}
            >
              {currencies.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Posted acquisition journal entry">
            <select value={source} required onChange={(e) => chooseSource(e.target.value)}>
              <option value="">Select a posted acquisition</option>
              {initial?.data.acquisition_entry_id &&
                !sources.some((row) => row.id === initial.data.acquisition_entry_id) && (
                  <option value={initial.data.acquisition_entry_id}>Current acquisition</option>
                )}
              {sources.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.reference} · {row.entry_on} · {money(Number(row.amount_minor), currency)}
                </option>
              ))}
            </select>
          </Field>
          {account && !sources.length && !source && (
            <p>No available posted acquisitions for this asset account and currency.</p>
          )}
          {error && <p role="alert">{error}</p>}
          <Field label="Acquisition date">
            <input
              type="date"
              required
              value={acquired}
              onChange={(e) => setAcquired(e.target.value)}
            />
          </Field>
          <Field label="Acquisition value">
            <input
              inputMode="decimal"
              required
              value={gross}
              onChange={(e) => setGross(e.target.value)}
            />
          </Field>
          <Field label="Salvage value">
            <input
              name="salvage"
              inputMode="decimal"
              required
              defaultValue={amountText(data.salvage_minor ?? 0, currency)}
            />
          </Field>
          <Field label="Already depreciated">
            <input
              name="prior"
              inputMode="decimal"
              required
              defaultValue={amountText(data.prior_minor ?? 0, currency)}
            />
          </Field>
          <Field label="Depreciation start or prorata date">
            <input
              type="date"
              min={acquired}
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
        </>
      )}
      <h4>Depreciation configuration</h4>
      <PlanFields initial={data.terms} />
      <button className="button">Save {isModel ? 'model' : 'draft'}</button>{' '}
      <button type="button" className="secondary-button" onClick={onDiscard}>
        Discard
      </button>
    </Form>
  );
}

function exportBoard(rows: any[], currency: string) {
  const header =
    'date,period,depreciation_minor,cumulative_minor,remaining_minor,book_minor,currency,journal_reference,posting_state';
  const csv = [
    header,
    ...rows.map((row, i) =>
      [
        row.date,
        i + 1,
        row.amount_minor,
        row.cumulative_minor,
        row.remaining_minor,
        row.book_minor,
        currency,
        row.journal_reference || '',
        row.posting,
      ].join(','),
    ),
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const download = document.createElement('a');
  download.href = url;
  download.download = 'depreciation-board.csv';
  download.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AccountingAssets({
  view,
  api,
  configuration,
  manager,
  revision,
  go,
  onOpenEntry,
}: {
  view: AccountingView;
  api: API;
  configuration: any;
  manager: boolean;
  revision: number;
  go: (view: AccountingView) => void;
  onOpenEntry: (entry: any) => void;
}) {
  const [assets, setAssets] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [assetId, setAssetId] = useState(
    () => new URL(location.href).searchParams.get('asset') || '',
  );
  const [detail, setDetail] = useState<any>(null);
  const [editor, setEditor] = useState<any>(null);
  const [modelId, setModelId] = useState('');
  const [updated, refresh] = useState(0);
  const [pending, setPending] = useState(false);
  const [postedOnly, setPostedOnly] = useState(false);
  const [error, setError] = useState('');
  const writable = configuration.writable;
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const sync = () => {
      const id = new URL(location.href).searchParams.get('asset') || '';
      setAssetId(id);
      setEditor(null);
    };
    window.addEventListener('popstate', sync);
    return () => {
      mounted.current = false;
      window.removeEventListener('popstate', sync);
    };
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([api('/accounting/assets'), api('/accounting/asset-models')]).then(
      ([a, m]) => {
        if (active) {
          setAssets(a.data);
          setModels(m.data);
        }
      },
      (e) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [api, updated, revision]);
  useEffect(() => {
    if (!assetId) return;
    let active = true;
    api('/accounting/assets/' + encodeURIComponent(assetId)).then(
      (result) => {
        if (active) setDetail(result);
      },
      (e) => {
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [api, assetId, updated, revision]);
  const record = detail?.asset.id === assetId ? detail : null;
  const current = record?.asset;
  const rows = record?.rows || [];
  const shownRows = rows
    .map((row: any, index: number) => ({ row, index }))
    .filter(({ row }: { row: any }) => !postedOnly || row.posting === 'posted');
  const next = rows.find((r: any) => r.amount_minor && r.posting !== 'posted');
  const model = models.find((m) => m.id === modelId);

  function chooseAsset(id: string) {
    if (!mounted.current) return;
    const url = new URL(location.href);
    if (id) url.searchParams.set('asset', id);
    else url.searchParams.delete('asset');
    history.pushState(history.state, '', url);
    setAssetId(id);
    setPostedOnly(false);
    setEditor(null);
    setError('');
  }
  async function action(action: string, payload: object = {}) {
    setError('');
    setPending(true);
    try {
      const result = await api('/accounting/assets/' + current.id + '/action', 'POST', {
        action,
        expected_version: current.version,
        ...payload,
      });
      refresh((n) => n + 1);
      if (action === 'prepare' && mounted.current) onOpenEntry(result);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }
  async function openEntry(id: string) {
    try {
      const entry = await api('/accounting/entries/' + id);
      if (mounted.current) onOpenEntry(entry);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="acc-panel">
      <p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            chooseAsset('');
            go('assets');
          }}
        >
          Asset Register
        </button>
        {current ? ' / ' + current.data.name : ''}
      </p>
      <h2>
        {view === 'asset-models' ? 'Depreciation Models' : current?.data.name || 'Fixed Assets'}
      </h2>
      <nav aria-label="Asset views">
        {(
          [
            ['assets', 'Asset Register'],
            ['asset-models', 'Depreciation Models'],
            ['depreciation-board', 'Depreciation Board'],
          ] as const
        ).map(([target, label]) => (
          <button
            key={target}
            type="button"
            className="secondary-button"
            aria-current={view === target ? 'page' : undefined}
            onClick={() => {
              setEditor(null);
              go(target);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      {view === 'asset-models' ? (
        <>
          {manager && writable && (
            <button type="button" className="button" onClick={() => setEditor({ kind: 'model' })}>
              New depreciation model
            </button>
          )}
          {!models.length && <p>No depreciation models.</p>}
          <ul>
            {models.map((item) => (
              <li key={item.id}>
                {item.data.name} · {methods[item.data.terms.method]} · {item.data.terms.periods}{' '}
                {item.data.terms.frequency} periods{' '}
                {manager && writable && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditor({ kind: 'model', item })}
                  >
                    Edit model
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editor?.kind === 'model' && (
            <AssetEditor
              key={editor.item?.id || 'new-model'}
              api={api}
              configuration={configuration}
              initial={editor.item}
              isModel
              onDiscard={() => setEditor(null)}
              onSaved={() => {
                setEditor(null);
                refresh((n) => n + 1);
              }}
            />
          )}
        </>
      ) : (
        <>
          <Field label="Select asset">
            <select value={assetId} onChange={(e) => chooseAsset(e.target.value)}>
              <option value="">Select from the register</option>
              {assets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {statusLabel(item.status)}
                </option>
              ))}
            </select>
          </Field>
          {view === 'assets' && writable && (
            <button
              type="button"
              className="button"
              onClick={() => {
                setModelId('');
                setEditor({ kind: 'asset' });
              }}
            >
              New asset
            </button>
          )}
          {view === 'assets' && !assetId && !editor && (
            <div
              className="acc-journal-table-scroll"
              tabIndex={0}
              aria-label="Fixed asset register"
            >
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Acquisition value</th>
                    <th>Book value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => chooseAsset(item.id)}
                        >
                          {item.name}
                        </button>
                      </td>
                      <td>{money(item.gross_minor, item.currency)}</td>
                      <td>{money(item.book_minor, item.currency)}</td>
                      <td>{statusLabel(item.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!assets.length && <p>No fixed assets have been registered.</p>}
            </div>
          )}
          {editor?.kind === 'asset' && (
            <>
              <Field label="Apply a depreciation model">
                <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                  <option value="">Enter settings manually</option>
                  {models.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.data.name}
                    </option>
                  ))}
                </select>
              </Field>
              <AssetEditor
                key={(editor.item?.id || 'new') + ':' + modelId}
                api={api}
                configuration={configuration}
                initial={
                  editor.item &&
                  (model && editor.item.data.model_id !== modelId
                    ? {
                        ...editor.item,
                        data: {
                          ...editor.item.data,
                          accounts: model.data.accounts,
                          terms: model.data.terms,
                        },
                      }
                    : editor.item)
                }
                defaults={model?.data}
                modelId={modelId || undefined}
                isModel={false}
                onDiscard={() => setEditor(null)}
                onSaved={(result) => {
                  chooseAsset(result.id);
                  refresh((n) => n + 1);
                }}
              />
            </>
          )}
          {assetId && !record && !error && <p role="status">Loading asset…</p>}
          {current && !editor && (
            <>
              <p aria-label="Asset status">{statusLabel(record.status)}</p>
              <p>
                Acquired {current.data.acquisition_on} ·{' '}
                {money(current.data.gross_minor, current.data.currency)}
                {' · '}Salvage {money(current.data.salvage_minor, current.data.currency)}
                {' · '}Book value {money(record.book_minor, current.data.currency)}
              </p>
              <p>
                {methods[current.data.terms.method]} · {current.data.terms.frequency} · starts{' '}
                {current.data.start_on}
              </p>
              <details>
                <summary>Asset and account details</summary>
                <dl>
                  <dt>Opening depreciation</dt>
                  <dd>{money(current.data.prior_minor, current.data.currency)}</dd>
                  <dt>Posted depreciation for this asset</dt>
                  <dd>{money(record.posted_minor, current.data.currency)}</dd>
                  {(
                    [
                      ['Fixed asset', 'asset_account_id'],
                      ['Accumulated depreciation', 'accumulated_account_id'],
                      ['Depreciation expense', 'expense_account_id'],
                    ] as const
                  ).map(([label, key]) => {
                    const account = configuration.accounts.find(
                      (row: any) => row.id === current.data.accounts[key],
                    );
                    return (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>{account ? account.code + ' · ' + account.name : 'Unavailable'}</dd>
                      </div>
                    );
                  })}
                </dl>
              </details>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void openEntry(current.data.acquisition_entry_id)}
              >
                Open acquisition entry
              </button>{' '}
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setPostedOnly(true);
                  go('depreciation-board');
                }}
              >
                Posted entries ({rows.filter((row: any) => row.posting === 'posted').length})
              </button>
              {writable && current.status === 'draft' && (
                <p>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={pending}
                    onClick={() => {
                      setModelId(current.data.model_id || '');
                      setEditor({ kind: 'asset', item: current });
                    }}
                  >
                    Edit draft
                  </button>{' '}
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={pending}
                    onClick={() => void action('compute')}
                  >
                    {current.data.rows ? 'Recompute draft board' : 'Compute depreciation'}
                  </button>{' '}
                  {current.data.rows && (
                    <button
                      type="button"
                      className="button"
                      disabled={pending}
                      onClick={() => void action('confirm')}
                    >
                      Confirm reviewed board
                    </button>
                  )}{' '}
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={pending}
                    onClick={() => void action('archive')}
                  >
                    Archive draft
                  </button>
                </p>
              )}
              <details
                key={current.id + ':' + view}
                open={view === 'depreciation-board' || rows.length > 0}
              >
                <summary>Depreciation board</summary>
                {!rows.length && (
                  <p>
                    {current.data.terms.method === 'none'
                      ? 'This asset is non-depreciable.'
                      : 'No depreciation periods calculated.'}
                  </p>
                )}
                {!!rows.length && (
                  <>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => exportBoard(rows, current.data.currency)}
                    >
                      Export board CSV
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setPostedOnly((v) => !v)}
                    >
                      {postedOnly ? 'Show all periods' : 'Show posted periods'}
                    </button>
                    {postedOnly && !shownRows.length && <p>No posted depreciation periods.</p>}
                    <div
                      className="acc-journal-table-scroll"
                      tabIndex={0}
                      aria-label="Depreciation periods"
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Period</th>
                            <th>Depreciation</th>
                            <th>Cumulative</th>
                            <th>Remaining</th>
                            <th>Book value</th>
                            <th>Journal entry</th>
                            <th>Posting state</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shownRows.map(({ row, index }: { row: any; index: number }) => (
                            <tr key={row.date}>
                              <td>{row.date}</td>
                              <td>{index + 1}</td>
                              {[
                                'amount_minor',
                                'cumulative_minor',
                                'remaining_minor',
                                'book_minor',
                              ].map((field) => (
                                <td key={field}>{money(row[field], current.data.currency)}</td>
                              ))}
                              <td>
                                {row.journal_entry_id ? (
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={() => void openEntry(row.journal_entry_id)}
                                  >
                                    {row.journal_reference}
                                  </button>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td>
                                {statusLabel(row.posting)}{' '}
                                {writable &&
                                  current.status === 'running' &&
                                  next?.date === row.date &&
                                  (['proposed', 'reversed'].includes(row.posting) ? (
                                    <button
                                      type="button"
                                      className="button"
                                      disabled={pending}
                                      onClick={() => void action('prepare', { date: row.date })}
                                    >
                                      Prepare journal
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="secondary-button"
                                      disabled={pending}
                                      onClick={() => void action('withdraw', { date: row.date })}
                                    >
                                      Withdraw draft
                                    </button>
                                  ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </details>
              {writable &&
                record.status === 'running' &&
                current.data.terms.method !== 'none' &&
                !['draft', 'approved'].includes(next?.posting) && (
                  <details>
                    <summary>Revise future depreciation</summary>
                    <Form
                      key={current.version}
                      disabled={pending}
                      submit={async (d) => {
                        if (d.method === 'none')
                          throw Error('A running asset cannot be changed to non-depreciable');
                        await action('revise', { terms: values(d), reason: d.reason });
                      }}
                    >
                      <p>
                        Set useful life to the number of remaining periods. Posted entries stay on
                        the board.
                      </p>
                      <PlanFields initial={current.data.terms} />
                      <Field label="Reason for revision">
                        <input name="reason" required minLength={5} maxLength={400} />
                      </Field>
                      <button className="button">Recompute future periods</button>
                    </Form>
                  </details>
                )}
              <details>
                <summary>Lifecycle history</summary>
                <ol>
                  {record.history.map((event: any) => (
                    <li key={event.version}>
                      {statusLabel(event.action)} · {event.created_at}
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
