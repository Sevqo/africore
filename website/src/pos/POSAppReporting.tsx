import { useEffect, useMemo, useState } from 'react';
import { BarChart } from '../charts/BarChart';
import { money, type API } from '../operations/UI';
import { POSDailyReport } from './POSDailyReport';
import {
  posReportMeasureForGroup,
  posReportMeasures,
  posReportMeasuresForGroup,
  type POSReportMeasureKey,
} from './pos-app-model';

const numberFormat = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 });
const valueFor = (group: any, measure: POSReportMeasureKey) =>
  Number(group?.totals?.[measure] || 0);
const csvCell = (value: unknown) => '"' + String(value ?? '').replaceAll('"', '""') + '"';

export function POSAppReporting({
  api,
  registers,
  team,
  online,
  revision,
  identity,
  onOpen,
}: {
  api: API;
  registers: any[];
  team: any[];
  online: boolean;
  revision: number;
  identity: string;
  onOpen: (sale: any) => void;
}) {
  const [registerIds, setRegisterIds] = useState<string[]>(registers.map((row: any) => row.id)),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [cashier, setCashier] = useState(''),
    [paymentMethod, setPaymentMethod] = useState(''),
    [status, setStatus] = useState(''),
    [product, setProduct] = useState(''),
    [category, setCategory] = useState(''),
    [currency, setCurrency] = useState(''),
    [session, setSession] = useState(''),
    [groupBy, setGroupBy] = useState('register'),
    [measure, setMeasure] = useState<POSReportMeasureKey>('invoice_total_minor'),
    [view, setView] = useState<'chart' | 'table'>('chart'),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [report, setReport] = useState<any>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [exporting, setExporting] = useState(false);

  useEffect(() => {
    setRegisterIds((current) => {
      const permitted = new Set(registers.map((row: any) => row.id));
      const next = current.filter((id) => permitted.has(id));
      return next.length ? next : registers.map((row: any) => row.id);
    });
  }, [registers]);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      register_ids: registerIds.join(','),
      group_by: groupBy,
      limit: '100',
      offset: String(offset),
    });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (cashier) params.set('cashier_id', cashier);
    if (paymentMethod) params.set('payment_method', paymentMethod);
    if (status) params.set('status', status);
    if (product) params.set('product_id', product);
    if (category) params.set('category', category);
    if (currency) params.set('currency', currency);
    if (session) params.set('session_id', session.trim());
    return params.toString();
  }, [
    registerIds,
    groupBy,
    from,
    to,
    cashier,
    paymentMethod,
    status,
    product,
    category,
    currency,
    session,
    offset,
  ]);

  useEffect(() => {
    let current = true;
    setReport(null);
    setError('');
    if (!online || !registerIds.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api('/pos/report?' + query)
      .then((value) => {
        if (current) setReport(value);
      })
      .catch((e) => {
        if (current) setError(e.message || 'The report could not be loaded.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [api, identity, online, query, refresh, revision, registerIds.length]);

  const names = new Map(
      team.map((member: any) => [
        member.user_id || member.id,
        member.name || member.display_name || member.email || 'Teammate',
      ]),
    ),
    series = (report?.groups || []).filter(
      (group: any) => !currency || group.currency === currency,
    ),
    chartCurrencies = Array.from(
      new Set<string>(series.map((group: any) => String(group.currency))),
    ),
    lineGroup = groupBy === 'product' || groupBy === 'category',
    groupedMeasure = posReportMeasureForGroup(groupBy, measure),
    availableMeasures = posReportMeasuresForGroup(groupBy),
    measureLabel = posReportMeasures.find(([key]) => key === groupedMeasure)?.[1] || 'Invoice total';

  async function downloadCsv() {
    if (!online || !report) return;
    setExporting(true);
    setError('');
    try {
      const params = new URLSearchParams(query);
      params.set('offset', '0');
      params.set('limit', '100000');
      const complete = await api('/pos/report?' + params.toString());
      if (!complete.coverage?.complete || complete.records.length !== complete.total_count)
        throw new Error(
          'The server did not confirm complete report coverage; CSV was not created.',
        );
      const columns = [
        'Reference',
        'Sale ID',
        'Date',
        'Register',
        'Session ID',
        'Cashier',
        'Order ID',
        'Invoice ID',
        'Payment intent',
        'Invoice status',
        'Currency',
        'Invoice total minor',
        'Paid minor',
        'Outstanding minor',
        'Credits minor',
      ];
      const rows = complete.records.map((row: any) => [
        row.reference,
        row.id,
        row.created_at,
        row.register_name,
        row.session_id,
        names.get(row.cashier_id) || row.cashier_id,
        row.order_id,
        row.invoice_id,
        row.payment_method,
        row.status,
        row.currency,
        row.total_minor,
        row.paid_minor,
        row.outstanding_minor,
        row.credited_minor,
      ]);
      const content = [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
      const blob = new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }),
        url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'africore-pos-report-' + new Date().toISOString().slice(0, 10) + '.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="pos-app-reporting">
      <header className="pos-app-page-head pos-report-heading">
        <div>
          <span className="eyebrow">Reporting</span>
          <h2>POS analysis</h2>
          <p>
            Sales, payment allocations, returns and drawer observations from authorized registers.
          </p>
        </div>
        <div className="pos-report-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => window.print()}
            disabled={!report}
          >
            Print report
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={downloadCsv}
            disabled={!report || exporting || !online}
          >
            {exporting ? 'Preparing CSV…' : 'Export complete CSV'}
          </button>
        </div>
      </header>

      <section className="pos-report-filters panel" aria-label="Report filters">
        <label className="pos-report-registers">
          <span>Registers</span>
          <select
            multiple
            size={Math.min(4, Math.max(2, registers.length))}
            value={registerIds}
            onChange={(event) => {
              setRegisterIds(
                Array.from(event.currentTarget.selectedOptions, (option) => option.value),
              );
              setOffset(0);
            }}
          >
            {registers.map((row: any) => (
              <option key={row.id} value={row.id}>
                {row.data.name}
              </option>
            ))}
          </select>
          <small>Select one or more registers assigned to your account.</small>
        </label>
        <label>
          <span>From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          <span>Cashier</span>
          <select
            value={cashier}
            onChange={(e) => {
              setCashier(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All authorized cashiers</option>
            {team.map((member: any) => {
              const id = member.user_id || member.id;
              return (
                <option key={id} value={id}>
                  {names.get(id)}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          <span>Payment intent</span>
          <select
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All</option>
            <option value="cash">Cash</option>
            <option value="electronic">Electronic request</option>
            <option value="split">Split</option>
            <option value="pending">Pending</option>
            <option value="unknown">Unclassified legacy</option>
          </select>
        </label>
        <label>
          <span>Invoice status</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="partially_paid">Partially paid</option>
            <option value="outstanding">Outstanding</option>
            <option value="credited">Credited</option>
          </select>
        </label>
        <label>
          <span>Product</span>
          <select
            value={product}
            onChange={(e) => {
              setProduct(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All products</option>
            {(report?.products || []).map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Category</span>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All categories</option>
            {(report?.categories || []).map((item: string) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Currency</span>
          <select
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All currencies (separate)</option>
            {(report?.currencies || []).map((item: any) => (
              <option key={item.currency} value={item.currency}>
                {item.currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Session ID</span>
          <input
            value={session}
            onChange={(e) => {
              setSession(e.target.value);
              setOffset(0);
            }}
            placeholder="Optional UUID"
          />
        </label>
      </section>

      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {!online && (
        <p role="status" className="alert">
          Reconnect to retrieve current POS report data.
        </p>
      )}
      {registers.length === 0 && <p role="status">No register is assigned to this account.</p>}
      {!!registers.length && registerIds.length === 0 && (
        <p role="status">Select at least one register.</p>
      )}
      {loading && <p role="status">Loading the complete authorized report…</p>}

      {report && (
        <>
          <div className="pos-report-toolbar">
            <label>
              <span>Group by</span>
              <select
                value={groupBy}
                onChange={(e) => {
                  const nextGroup = e.target.value;
                  setGroupBy(nextGroup);
                  setMeasure((current) => posReportMeasureForGroup(nextGroup, current));
                  setOffset(0);
                }}
              >
                <option value="register">Register</option>
                <option value="cashier">Cashier</option>
                <option value="date">Date</option>
                <option value="hour">Hour</option>
                <option value="payment_method">Payment intent</option>
                <option value="status">Invoice status</option>
                <option value="session">Session</option>
                <option value="product">Product</option>
                <option value="category">Category</option>
              </select>
            </label>
            <label>
              <span>Measure</span>
              <select
                value={groupedMeasure}
                onChange={(e) => setMeasure(e.target.value as POSReportMeasureKey)}
              >
                {availableMeasures.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="pos-report-view-toggle" role="group" aria-label="Report view">
              <button
                type="button"
                className={view === 'chart' ? 'active' : ''}
                onClick={() => setView('chart')}
              >
                Chart
              </button>
              <button
                type="button"
                className={view === 'table' ? 'active' : ''}
                onClick={() => setView('table')}
              >
                Table
              </button>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setRefresh((v) => v + 1)}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
          {lineGroup && (
            <p className="pos-report-definition" role="note">
              Product and category groups count a sale once in each matching group. Line subtotal
              excludes invoice-level discount and tax; invoice totals and balances remain available
              in the sale records below.
            </p>
          )}

          <div className="pos-metrics pos-report-metrics">
            {(report.currencies || []).map((item: any) => (
              <article key={item.currency}>
                <span>{item.currency} · Confirmed sales</span>
                <strong>{item.totals.transaction_count}</strong>
                <small>Invoice value {money(item.totals.invoice_total_minor, item.currency)}</small>
                <small>
                  Product line subtotal {money(item.totals.product_subtotal_minor, item.currency)}
                </small>
                <small>
                  Quantity {numberFormat.format(item.totals.product_quantity_milli / 1000)}
                </small>
              </article>
            ))}
            {(report.currencies || []).map((item: any) => (
              <article key={'due-' + item.currency}>
                <span>{item.currency} · Settlement now</span>
                <strong>{money(item.totals.paid_minor, item.currency)} allocated</strong>
                <small>Outstanding {money(item.totals.outstanding_minor, item.currency)}</small>
                <small>Credits {money(item.totals.credited_minor, item.currency)}</small>
                <small>
                  Tax {money(item.totals.tax_minor, item.currency)} · Discount{' '}
                  {money(item.totals.discount_minor, item.currency)}
                </small>
              </article>
            ))}
            {(report.cash_activity || []).map((item: any) => (
              <article key={'cash-' + item.currency}>
                <span>{item.currency} · Dated cash activity</span>
                <strong>{money(item.received_minor, item.currency)} received</strong>
                <small>
                  {money(item.returned_minor, item.currency)} returned · {item.return_count} returns
                </small>
                <small>{item.receipt_count} cash receipts</small>
                <small>Merchant recorded physical cash</small>
              </article>
            ))}
            {(report.drawer_adjustments || []).map((item: any) => (
              <article key={'adjustment-' + item.currency}>
                <span>{item.currency} · Drawer adjustments</span>
                <strong>{money(item.net_minor, item.currency)} net</strong>
                <small>{item.transaction_count} dated adjustments</small>
                <small>Cash movement is not revenue or expense by itself.</small>
              </article>
            ))}
            {(report.session_closures || []).map((item: any) => (
              <article key={'closure-' + item.currency}>
                <span>{item.currency} · Session cash counts</span>
                <strong>{money(item.variance_minor, item.currency)} variance</strong>
                <small>{item.session_count} closed sessions in the period</small>
                <small>
                  Expected {money(item.expected_minor, item.currency)} · Counted{' '}
                  {money(item.counted_minor, item.currency)}
                </small>
              </article>
            ))}
          </div>

          {view === 'chart' ? (
            <section
              className="panel pos-report-chart"
              aria-label={measureLabel + ' by ' + groupBy}
            >
              <div className="pos-report-chart-head">
                <h3>
                  {measureLabel} by {groupBy.replaceAll('_', ' ')}
                </h3>
                <span>
                  {report.total_count} matching sales · {series.length} groups
                </span>
              </div>
              {series.length ? (
                chartCurrencies.map((chartCurrency: string) => {
                  const currencySeries = series.filter(
                    (group: any) => group.currency === chartCurrency,
                  );
                  return (
                    <div className="pos-report-chart-currency" key={chartCurrency}>
                      <BarChart
                        title={`${measureLabel} · ${chartCurrency}`}
                        subtitle={`${currencySeries.length} ${groupBy.replaceAll('_', ' ')} group(s)`}
                        currency={groupedMeasure.endsWith('_minor') ? chartCurrency : undefined}
                        valueFormatter={
                          groupedMeasure === 'product_quantity_milli'
                            ? (val) => numberFormat.format(val / 1000)
                            : undefined
                        }
                        orientation="vertical"
                        rows={currencySeries.slice(0, 30).map((group: any) => ({
                          key: String(group.key),
                          label: String(group.label),
                          value: valueFor(group, groupedMeasure),
                        }))}
                      />
                      {currencySeries.length > 30 && (
                        <p>
                          Chart shows the first 30 groups for {chartCurrency}; the table and CSV
                          preserve complete totals.
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <p>No matching POS sales in the selected period.</p>
              )}
            </section>
          ) : null}

          <section className="panel pos-report-groups">
            <header className="pos-report-chart-head">
              <h3>Grouped analysis</h3>
              <span>Exact currency groups · complete aggregate</span>
            </header>
            <div className="pos-app-table-wrap">
              <table className="pos-app-table">
                <thead>
                  <tr>
                    <th>{groupBy.replaceAll('_', ' ')}</th>
                    <th>Currency</th>
                    <th className="numeric">Transactions</th>
                    {lineGroup ? (
                      <>
                        <th className="numeric">Product subtotal</th>
                        <th className="numeric">Items</th>
                      </>
                    ) : (
                      <>
                        <th className="numeric">Invoice total</th>
                        <th className="numeric">Product subtotal</th>
                        <th className="numeric">Items</th>
                        <th className="numeric">Paid</th>
                        <th className="numeric">Outstanding</th>
                        <th className="numeric">Credits</th>
                        <th className="numeric">Cash returned</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {series.map((group: any) => (
                    <tr key={group.currency + ':' + group.key}>
                      <td>{group.label}</td>
                      <td>{group.currency}</td>
                      <td className="numeric">{group.totals.transaction_count}</td>
                      {lineGroup ? (
                        <>
                          <td className="numeric">
                            {money(group.totals.product_subtotal_minor, group.currency)}
                          </td>
                          <td className="numeric">
                            {numberFormat.format(group.totals.product_quantity_milli / 1000)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="numeric">
                            {money(group.totals.invoice_total_minor, group.currency)}
                          </td>
                          <td className="numeric">
                            {money(group.totals.product_subtotal_minor, group.currency)}
                          </td>
                          <td className="numeric">
                            {numberFormat.format(group.totals.product_quantity_milli / 1000)}
                          </td>
                          <td className="numeric">
                            {money(group.totals.paid_minor, group.currency)}
                          </td>
                          <td className="numeric">
                            {money(group.totals.outstanding_minor, group.currency)}
                          </td>
                          <td className="numeric">
                            {money(group.totals.credited_minor, group.currency)}
                          </td>
                          <td className="numeric">
                            {money(group.totals.cash_returned_minor, group.currency)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel pos-report-records">
            <header className="pos-report-chart-head">
              <div>
                <h3>Sales records</h3>
                <p>
                  {report.total_count} matching records · page of {report.records.length}
                </p>
              </div>
            </header>
            <div className="pos-app-table-wrap">
              <table className="pos-app-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Date</th>
                    <th>Register</th>
                    <th>Cashier</th>
                    <th>Payment intent</th>
                    <th>Invoice status</th>
                    <th>Currency</th>
                    <th className="numeric">Invoice</th>
                    <th className="numeric">Paid</th>
                    <th className="numeric">Due</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {report.records.map((row: any) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.reference}</strong>
                      </td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <td>{row.register_name}</td>
                      <td>{names.get(row.cashier_id) || '—'}</td>
                      <td>{row.payment_method}</td>
                      <td>{row.status}</td>
                      <td>{row.currency}</td>
                      <td className="numeric">{money(row.total_minor, row.currency)}</td>
                      <td className="numeric">{money(row.paid_minor, row.currency)}</td>
                      <td className="numeric">{money(row.outstanding_minor, row.currency)}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            onOpen({
                              id: row.id,
                              register_id: row.register_id,
                              status: 'confirmed',
                            })
                          }
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pos-report-pagination">
              <button
                type="button"
                className="secondary-button"
                disabled={loading || offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - 100))}
              >
                Previous
              </button>
              <span>
                Showing {report.records.length ? Math.min(offset + 1, report.total_count) : 0}–
                {Math.min(offset + report.records.length, report.total_count)} of{' '}
                {report.total_count}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={!report.has_more || loading}
                onClick={() => setOffset((value) => value + 100)}
              >
                Next
              </button>
            </div>
          </section>

          <section className="panel pos-report-records">
            <header className="pos-report-chart-head">
              <div>
                <h3>Session cash reports</h3>
                <p>Closed sessions within their register-local reporting windows.</p>
              </div>
            </header>
            <div className="pos-app-table-wrap">
              <table className="pos-app-table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Register</th>
                    <th>Cashier</th>
                    <th>Opened</th>
                    <th>Closed</th>
                    <th>Currency</th>
                    <th className="numeric">Opening</th>
                    <th className="numeric">Expected</th>
                    <th className="numeric">Counted</th>
                    <th className="numeric">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.session_cash_reports || []).map((item: any) => (
                    <tr key={item.session_id}>
                      <td>{item.session_id.slice(0, 8)}</td>
                      <td>{item.register_name}</td>
                      <td>{names.get(item.cashier_id) || '—'}</td>
                      <td>{new Date(item.opened_at).toLocaleString()}</td>
                      <td>{new Date(item.closed_at).toLocaleString()}</td>
                      <td>{item.currency}</td>
                      <td className="numeric">{money(item.opening_cash_minor, item.currency)}</td>
                      <td className="numeric">{money(item.expected_minor, item.currency)}</td>
                      <td className="numeric">{money(item.counted_minor, item.currency)}</td>
                      <td className="numeric">{money(item.variance_minor, item.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.session_cash_reports_has_more && (
              <p className="pos-app-note">
                Showing the first 1,000 session details. Currency-level closure totals above include
                the complete matching set.
              </p>
            )}
          </section>

          <p className="pos-app-note">
            {report.coverage.definition} Cash activity, drawer adjustments and closures use their
            own event date and selected register/cashier scope; product, payment and invoice-status
            filters apply to sales, not unrelated drawer facts. Payment intent is the requested
            tender route, not provider settlement. Date windows follow each register’s local
            timezone.
          </p>
          <p className="pos-app-note">
            Registers covered:{' '}
            {(report.date_windows || [])
              .map(
                (window: any) =>
                  `${window.register_name} (${window.from}–${window.to}, ${window.timezone})`,
              )
              .join(' · ')}
          </p>
        </>
      )}

      {registers[0] && (
        <details className="pos-report-daily-details">
          <summary>Daily stock warnings and register-local overview</summary>
          <POSDailyReport
            api={api}
            register={registers.find((row: any) => row.id === registerIds[0]) || registers[0]}
            revision={revision}
            online={online}
          />
        </details>
      )}
    </div>
  );
}
