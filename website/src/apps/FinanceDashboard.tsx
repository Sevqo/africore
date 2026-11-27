import { useEffect, useState } from 'react';
import { DonutChart } from '../charts/DonutChart';
import { InteractiveChart } from '../charts/InteractiveChart';
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
  writable: _writable = false,
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
        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <SegmentedControl
          label="Period"
          value={months}
          options={[1, 3, 6, 12].map((value) => ({ value, label: value + 'M' }))}
          onChange={setMonths}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
          {[
            ['Invoices', 'Invoices'],
            ['Expenses', 'Expenses'],
            ['Payments', 'Payments'],
            ['Reconciliation', 'Reconciliation'],
          ].map(([tab, label]) => (
            <button type="button" className="secondary-button" key={tab} onClick={() => navigate(tab)}>
              {label}
            </button>
          ))}
          <button className="quiet-button" onClick={() => setRevision((v) => v + 1)}>
            Refresh
          </button>
        </div>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading covered financial records…</p>}
      {data && (
        <>
          <div className="o-kpi-row" aria-label="Financial summary">
            {[
              ['Confirmed collections', data.totals.confirmed_inflows_minor, `${data.period.from} — ${data.period.to}`],
              ['Recorded outflows', data.totals.recorded_outflows_minor, 'Recorded expenses'],
              ['Net movement', data.totals.net_movement_minor, 'Collections minus outflows'],
              ['Receivables', data.totals.outstanding_minor, 'Open customer balances'],
            ].map(([label, value, sub]) => (
              <div className="o-kpi-cell" key={String(label)}>
                <span>{String(label)}</span>
                <strong>{money(Number(value), currency)}</strong>
                <small>{String(sub)}</small>
              </div>
            ))}
          </div>
          <div className="finance-app-main" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: 20, alignItems: 'start' }}>
            <section className="panel finance-trend-panel">
              <div className="finance-panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>Financial performance</h2>
                <span className="finance-period-label" style={{ fontSize: 12, color: '#6b7280' }}>
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
            <section className="panel finance-invoice-panel" style={{ borderLeft: '1px solid #eef2f7', paddingLeft: 18 }}>
              <div className="section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>Recent invoices</h2>
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
              {!invoices.length && <p className="o-flat-note">No invoices in this currency yet.</p>}
            </section>
          </div>
          <div className="finance-app-bottom" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, borderTop: '1px solid #eef2f7', paddingTop: 10 }}>
            <Breakdown
              title="Receivables aging"
              currency={currency}
              rows={Object.entries(data.aging).map(([label, amount]) => ({
                label: label.replaceAll('_', ' '),
                amount: Number(amount),
              }))}
            />
            <Breakdown
              title="Expense mix"
              currency={currency}
              rows={data.expense_categories.map((row: any) => ({
                label: row.category,
                amount: row.amount_minor,
              }))}
            />
          </div>
          <details className="panel">
            <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#4b5563' }}>
              Recorded cash &amp; accounting definitions
            </summary>
            {typeof data.totals.recorded_cash_receipts_minor === 'number' && (
              <p className="o-flat-note">
                Recorded cash: Receipts {money(data.totals.recorded_cash_receipts_minor, currency)} · Returns{' '}
                {money(data.totals.recorded_cash_returns_minor, currency)} · Net{' '}
                {money(data.totals.recorded_cash_net_minor, currency)}. {data.definitions.recorded_cash}
              </p>
            )}
            <p className="o-flat-note">{data.definitions.net_movement}</p>
            <p className="o-flat-note">
              Provider returns: {money(data.totals.returned_minor || 0, currency)} ·{' '}
              {data.quality.history_days} observed history days ·{' '}
              {data.quality.unreconciled_count} unresolved exceptions.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
