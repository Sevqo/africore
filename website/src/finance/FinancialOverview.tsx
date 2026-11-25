import { useEffect, useState } from 'react';
import { BarChart } from '../charts/BarChart';
import { InteractiveChart } from '../charts/InteractiveChart';
import { MetricStrip, MetricTile } from '../charts/MetricTile';
import { vizPalette } from '../charts/viz';
import { DateRange } from '../components/DateRange';
import { DataTable } from '../components/DataTable';
import { Field, money, type API } from '../operations/UI';
import { isDemo } from '../demo/transport';
import './finance.css';
export function FinancialOverview({
  api,
  scope,
  timezone = 'Africa/Nairobi',
}: {
  api: API;
  scope: string;
  timezone?: string;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [currency, setCurrency] = useState('KES'),
    [period, setPeriod] = useState('90D'),
    [custom, setCustom] = useState({ from: '', to: '' }),
    [revision, setRevision] = useState(0),
    [view, setView] = useState<'chart' | 'table'>('chart');
  const now = new Date().toLocaleDateString('en-CA', { timeZone: timezone }),
    from =
      period === 'Custom'
        ? custom.from
        : period === 'All'
          ? ''
          : period === 'YTD'
            ? now.slice(0, 4) + '-01-01'
            : new Date(
                Date.parse(now + 'T00:00:00Z') -
                  (({ '7D': 6, '30D': 29, '90D': 89, '1Y': 364 } as Record<string, number>)[
                    period
                  ] || 89) *
                    86400000,
              )
                .toISOString()
                .slice(0, 10),
    to = period === 'Custom' ? custom.to : now;
  const query = new URLSearchParams({
    currency,
    ...(period === 'All' ? { range: 'all' } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }).toString();
  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    if (isDemo()) return;
    api('/financial-summary?' + query)
      .then((r) => {
        if (live) setData(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [scope, query, revision, timezone]);
  if (isDemo()) return null;
  return (
    <section className="panel finance-details">
      <h2>Recorded financial activity</h2>
      <div className="finance-toolbar" aria-label="Financial period">
        {['7D', '30D', '90D', 'YTD', '1Y', 'All'].map((p) => (
          <button
            className="secondary-button"
            aria-pressed={period === p}
            key={p}
            onClick={() => setPeriod(p)}
          >
            {p}
          </button>
        ))}
        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <button className="quiet-button" onClick={() => setRevision((v) => v + 1)}>
          Refresh totals
        </button>
        <button
          className="secondary-button"
          aria-pressed={view === 'chart'}
          onClick={() => setView('chart')}
        >
          Chart
        </button>
        <button
          className="secondary-button"
          aria-pressed={view === 'table'}
          onClick={() => setView('table')}
        >
          Table
        </button>
      </div>
      <DateRange
        from={custom.from}
        to={custom.to}
        onApply={(from, to) => {
          setCustom({ from, to });
          setPeriod('Custom');
        }}
      />
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading covered financial records…</p>}
      {data && (
        <>
          <MetricStrip label="Recorded financial summary">
            {[
              [
                'Net confirmed collections',
                data.totals.confirmed_inflows_minor,
                data.series.map((p: any) => Number(p.confirmed_inflows_minor || 0)),
                vizPalette[0],
              ],
              [
                'Recorded outflows',
                data.totals.recorded_outflows_minor,
                data.series.map((p: any) => Number(p.recorded_outflows_minor || 0)),
                vizPalette[3],
              ],
              ['Outstanding invoices', data.totals.outstanding_minor, undefined, vizPalette[1]],
              ['Overdue invoices', data.totals.overdue_minor, undefined, vizPalette[4]],
            ].map(([label, n, spark, color]) => (
              <MetricTile
                key={String(label)}
                label={String(label)}
                value={money(Number(n), currency)}
                spark={spark as number[] | undefined}
                color={String(color)}
              />
            ))}
          </MetricStrip>
          {view === 'chart' ? (
            <InteractiveChart
              compact
              title="Collections and recorded expenses"
              currency={currency}
              points={data.series}
              series={[
                {
                  key: 'confirmed_inflows_minor',
                  label: 'Net confirmed collections',
                  color: vizPalette[0],
                },
                {
                  key: 'recorded_outflows_minor',
                  label: 'Recorded expenses / imports',
                  color: vizPalette[3],
                },
              ]}
              description={data.definitions.net_movement}
            />
          ) : (
            <div className="finance-report-table-wrap">
              <DataTable>
                <thead>
                  <tr>
                    <th>Period date</th>
                    <th>Confirmed collections</th>
                    <th>Recorded outflows</th>
                    <th>Net movement</th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.map((point: any) => (
                    <tr key={point.date}>
                      <td>{point.date}</td>
                      <td>{money(Number(point.confirmed_inflows_minor), currency)}</td>
                      <td>{money(Number(point.recorded_outflows_minor), currency)}</td>
                      <td>
                        {money(
                          Number(point.confirmed_inflows_minor) -
                            Number(point.recorded_outflows_minor),
                          currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}
          <p>
            Net recorded movement: {money(data.totals.net_movement_minor, currency)}. This is not a
            bank balance or profit.
          </p>
          <p>
            {data.period.from} to {data.period.to} · Provider returns:{' '}
            {money(data.totals.returned_minor || 0, currency)}
          </p>
          <details>
            <summary>Receivables aging & data coverage</summary>
            <div style={{ margin: '10px 0' }}>
              <BarChart
                title="Receivables aging"
                currency={currency}
                orientation="horizontal"
                allowOrientationSwitch={false}
                rows={Object.entries(data.aging).map(([bucket, n]) => ({
                  key: bucket,
                  label: bucket.replaceAll('_', ' '),
                  value: Number(n),
                }))}
              />
            </div>
            <p>
              {data.quality.history_days} days of observed history ·{' '}
              {data.quality.unreconciled_count} unresolved exceptions ·{' '}
              {data.quality.unallocated_confirmations} confirmations needing allocation.
            </p>
            <p>
              {data.quality.unknown_provider_occurrence_dates || 0} provider events have observation
              dates only; those receipts are excluded from payment-delay statistics.
            </p>
            <p>
              Manual expenses and imports retain their stated assurance. Mixed currencies are
              separate. This is not a bank balance, profit statement or complete financial
              statement.
            </p>
          </details>
          <button
            className="secondary-button"
            onClick={() => {
              const csv = [
                'Date,Currency,Net confirmed collections minor,Recorded outflows minor',
                ...data.series.map((r: any) =>
                  [r.date, currency, r.confirmed_inflows_minor, r.recorded_outflows_minor].join(
                    ',',
                  ),
                ),
              ].join('\r\n');
              const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
                a = document.createElement('a');
              a.href = url;
              a.download = 'africore-financial-activity.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export displayed activity CSV
          </button>
        </>
      )}
    </section>
  );
}
