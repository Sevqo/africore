import { useEffect, useState } from 'react';
import { DonutChart } from '../charts/DonutChart';
import { InteractiveChart } from '../charts/InteractiveChart';
import { MetricStrip, MetricTile } from '../charts/MetricTile';
import { vizPalette } from '../charts/viz';
import { DataTable } from '../components/DataTable';
import { Field, money, type API } from '../operations/UI';
import { Icon } from '../components/Icon';
import { SegmentedControl } from '../components/SegmentedControl';

function Breakdown({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: { label: string; amount: number }[];
  currency: string;
}) {
  return (
    <section
      id={title.startsWith('Receivables') ? 'finance-receivables' : undefined}
      className="panel finance-breakdown"
    >
      <h3>{title}</h3>
      <DonutChart
        title={title}
        currency={currency}
        emptyText="No covered amounts in this period."
        rows={rows.map((r) => ({
          key: r.label,
          label: r.label,
          value: r.amount,
        }))}
      />
    </section>
  );
}
export function FinanceDashboard({
  api,
  scope,
  navigate,
  openRecord,
  section = 'dashboard',
  writable = false,
  timezone = 'Africa/Nairobi',
}: {
  openRecord?: (tab: string, id: string) => void;
  writable?: boolean;
  section?: string;
  api: API;
  scope: string;
  navigate: (tab: string) => void;
  timezone?: string;
}) {
  const [data, setData] = useState<any>(null),
    [invoices, setInvoices] = useState<any[]>([]),
    [error, setError] = useState(''),
    [currency, setCurrency] = useState('KES'),
    [months, setMonths] = useState(12),
    [revision, setRevision] = useState(0);
  const to = new Date().toLocaleDateString('en-CA', { timeZone: timezone }),
    from = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - months, 1))
      .toISOString()
      .slice(0, 10);
  useEffect(() => {
    let current = true;
    setData(null);
    setInvoices([]);
    setError('');
    Promise.allSettled([
      api('/financial-summary?' + new URLSearchParams({ currency, from, to })),
      api('/records/invoices?limit=5&currency=' + currency),
    ]).then(([summary, invoiceRows]) => {
      if (!current) return;
      const failures: string[] = [];
      if (summary.status === 'fulfilled') setData(summary.value);
      else failures.push('Financial summary: ' + summary.reason.message);
      if (invoiceRows.status === 'fulfilled') setInvoices(invoiceRows.value.data || []);
      else failures.push('Recent invoices: ' + invoiceRows.reason.message);
      setError(failures.join(' · '));
    });
    return () => {
      current = false;
    };
  }, [scope, currency, months, revision, from, to, timezone]);
  useEffect(() => {
    if (section === 'receivables' && data)
      document.getElementById('finance-receivables')?.scrollIntoView({ block: 'start' });
  }, [section, !!data]);
  return (
    <div className="apps-workspace finance-workspace">
      <div className="finance-toolbar" aria-label="Finance report controls">
        <Field label="Reporting currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <SegmentedControl
          label="Reporting period"
          value={months}
          options={[1, 3, 6, 12].map((value) => ({ value, label: value + 'M' }))}
          onChange={setMonths}
        />
        <button className="quiet-button" onClick={() => setRevision((v) => v + 1)}>
          Refresh
        </button>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading covered financial records…</p>}
      {data && (
        <>
          <MetricStrip label="Financial summary">
            {[
              [
                'Confirmed collections',
                data.totals.confirmed_inflows_minor,
                data.definitions?.confirmed_inflows,
                data.series.map((p: any) => Number(p.confirmed_inflows_minor || 0)),
                vizPalette[0],
              ],
              [
                'Recorded outflows',
                data.totals.recorded_outflows_minor,
                data.definitions?.recorded_outflows,
                data.series.map((p: any) => Number(p.recorded_outflows_minor || 0)),
                vizPalette[3],
              ],
              [
                'Net movement',
                data.totals.net_movement_minor,
                data.definitions?.net_movement,
                data.series.map(
                  (p: any) =>
                    Number(p.confirmed_inflows_minor || 0) - Number(p.recorded_outflows_minor || 0),
                ),
                vizPalette[2],
              ],
              [
                'Receivables',
                data.totals.outstanding_minor,
                data.definitions?.receivables,
                undefined,
                vizPalette[1],
              ],
            ].map(([label, value, definition, spark, color]) => (
              <MetricTile
                key={String(label)}
                label={String(label)}
                value={money(Number(value), currency)}
                definition={definition ? String(definition) : undefined}
                spark={spark as number[] | undefined}
                color={String(color)}
                caption={`${data.period.from} — ${data.period.to} · ${currency}`}
              />
            ))}
          </MetricStrip>
          <div className="finance-app-main">
            <section className="panel finance-trend-panel">
              <div className="finance-panel-heading">
                <div>
                  <span className="eyebrow">CASH FLOW</span>
                  <h2>Financial performance</h2>
                </div>
                <span className="finance-period-label">
                  {data.period.from} — {data.period.to}
                </span>
              </div>
              <InteractiveChart
                variant="area"
                compact
                headingLevel={3}
                title="Confirmed collections, outflows and recorded movement"
                currency={currency}
                points={data.series.map((point: any) => ({
                  ...point,
                  net: point.confirmed_inflows_minor - point.recorded_outflows_minor,
                }))}
                series={[
                  {
                    key: 'confirmed_inflows_minor',
                    label: 'Confirmed collections',
                    color: vizPalette[0],
                  },
                  {
                    key: 'recorded_outflows_minor',
                    label: 'Recorded expenses',
                    color: vizPalette[3],
                  },
                  { key: 'net', label: 'Net movement', color: vizPalette[2], dashed: true },
                ]}
                description={data.definitions.net_movement}
              />
            </section>
            <section className="panel finance-quick-actions">
              <div className="finance-panel-heading">
                <div>
                  <span className="eyebrow">WORKSPACE</span>
                  <h2>Quick actions</h2>
                </div>
                <span className="dashboard-action-mark">
                  <Icon name="bolt" />
                </span>
              </div>
              {[
                ['Invoices', 'Create or manage invoices'],
                ['Expenses', 'Record an expense'],
                ['Payments', 'Review payment requests'],
                ['Reconciliation', 'Match payments'],
              ].map(([tab, label]) => (
                <button className="finance-action-row" key={tab} onClick={() => navigate(tab)}>
                  <span>{writable ? label : 'View ' + tab.toLowerCase()}</span>
                  <Icon name="right" />
                </button>
              ))}
            </section>
          </div>
          <div className="finance-app-bottom">
            <Breakdown
              title="Receivables aging"
              currency={currency}
              rows={Object.entries(data.aging).map(([label, amount]) => ({
                label: label.replaceAll('_', ' '),
                amount: Number(amount),
              }))}
            />
            <section className="panel finance-invoice-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">ACCOUNTS RECEIVABLE</span>
                  <h2>Recent invoices</h2>
                </div>
                <button className="quiet-button" onClick={() => navigate('Invoices')}>
                  All invoices <Icon name="right" />
                </button>
              </div>
              <DataTable>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Issue date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <button
                          className="quiet-button stock-product-link"
                          onClick={() =>
                            openRecord ? openRecord('Invoices', invoice.id) : navigate('Invoices')
                          }
                        >
                          {invoice.number || invoice.reference || invoice.id.slice(0, 8)}
                        </button>
                      </td>
                      <td>{invoice.issue_date}</td>
                      <td>{money(invoice.total_minor, invoice.currency)}</td>
                      <td>
                        <span className="badge">{invoice.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              {!invoices.length && <p>No invoices in this currency yet.</p>}
            </section>
            <Breakdown
              title="Expense mix"
              currency={currency}
              rows={data.expense_categories.map((row: any) => ({
                label: row.category,
                amount: row.amount_minor,
              }))}
            />
          </div>
          <div className="finance-evidence-grid">
            <section className="panel">
              <h2>Recorded cash</h2>
              {typeof data.totals.recorded_cash_receipts_minor === 'number' ? (
                <>
                  <p>
                    Receipts {money(data.totals.recorded_cash_receipts_minor, currency)} · Returns{' '}
                    {money(data.totals.recorded_cash_returns_minor, currency)} · Net{' '}
                    {money(data.totals.recorded_cash_net_minor, currency)}
                  </p>
                  <small>{data.definitions.recorded_cash}</small>
                </>
              ) : (
                <p>Recorded cash coverage is not available from this backend version.</p>
              )}
            </section>
            <details className="panel">
              <summary>Sources and accounting definitions</summary>
              <p>{data.definitions.net_movement}</p>
              <p>
                Provider returns: {money(data.totals.returned_minor || 0, currency)} ·{' '}
                {data.quality.history_days} observed history days ·{' '}
                {data.quality.unreconciled_count} unresolved exceptions.
              </p>
              <p>
                Net movement is not profit or a bank balance. Expenses retain merchant-stated
                assurance. Currencies remain separate. Test provider events remain simulations.
                Receivable aging reflects covered allocations and credits.
              </p>
              <p>
                {data.quality.unknown_provider_occurrence_dates || 0} provider events have
                observation dates only.
              </p>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
