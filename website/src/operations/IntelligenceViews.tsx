import { DateRange } from '../components/DateRange';
import { useState, type ReactNode } from 'react';
import { DataTable } from '../components/DataTable';
import { Icon } from '../components/Icon';
import {
  Field,
  Form,
  MetricDefinition,
  Provenance,
  Empty,
  Trend,
  money,
  factor,
  today,
  type API,
  type Action,
} from './UI';
export function IntelligenceView({
  alerts,
  data,
  secondary,
  api,
  action,
  currency,
  writable,
  onNavigate,
  dates,
  onDates,
  expenseAccess = true,
  obligationAccess = true,
}: {
  alerts?: ReactNode;
  data: any;
  secondary: any;
  api: API;
  action: Action;
  currency: string;
  writable: boolean;
  onNavigate: (tab: string) => void;
  dates: { from: string; to: string };
  onDates: (from: string, to: string) => void;
  expenseAccess?: boolean;
  obligationAccess?: boolean;
}) {
  if (!data) return null;
  return (
    <div className="o-app-sheet">
      {alerts}
      <DateRange from={dates.from} to={dates.to} onApply={onDates} />

      <div className="o-kpi-row" aria-label="Financial intelligence summary">
        {[
          ['Confirmed collections', data.totals.confirmed_inflows_minor, data.definitions.confirmed_inflows],
          ['Recorded outflows', data.totals.recorded_outflows_minor, data.definitions.recorded_outflows],
          ['Outstanding receivables', data.totals.outstanding_minor, data.definitions.receivables],
          ['Recorded net movement', data.totals.net_movement_minor, data.definitions.net_movement],
        ].map(([label, value, definition]) => (
          <div className="o-kpi-cell" key={String(label)} title={String(definition || '')}>
            <span>{String(label)}</span>
            <strong>{money(Number(value), currency)}</strong>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <section className="o-flat-section">
          <h2>Financial activity</h2>
          <Trend
            points={data.series.filter(
              (p: any) => p.confirmed_inflows_minor || p.recorded_outflows_minor,
            )}
            currency={currency}
          />
        </section>
        <section className="o-flat-section data-quality">
          <h2>Data quality & coverage</h2>
          <ul>
            <li>{data.quality.history_days} days of observed history</li>
            <li>{data.quality.source_count} synchronized sources</li>
            <li>{data.quality.unreconciled_count} reconciliation exceptions</li>
            <li>{data.quality.unallocated_confirmations} unallocated confirmations</li>
            <li>Last sync: {data.quality.last_sync || 'Not available'}</li>
          </ul>
          {data.quality.limited_history && <Provenance label="limited_history" />}
          {data.quality.missing_expense_data && <p>Expense coverage is incomplete.</p>}
          <p>Bank balance and complete profit are unavailable.</p>
        </section>
      </div>
      <section className="o-flat-section">
        <h2>Explainable insights</h2>
        {data.insights.map((i: any) => (
          <div className="insight-row" key={i.id}>
            <Provenance label={i.classification} />
            <h3>{i.title}</h3>
            <p>{i.limitation}</p>
            <small>
              {i.period.from} – {i.period.to}
            </small>
            <button className="text-button" onClick={() => onNavigate(i.action)}>
              Review {i.action.toLowerCase()} <Icon name="right" />
            </button>
          </div>
        ))}
      </section>
      <section className="o-flat-section customer-payment-behavior">
        <h2>Customer payment behavior</h2>
        <p className="muted">
          Delay and on-time rates require three fully settled invoices. Late payments are not proof
          of fraud.
        </p>
        <div className="table-scroll customer-payment-behavior-desktop">
          <DataTable>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Invoiced</th>
                <th>Outstanding</th>
                <th>Observed delay</th>
                <th>On-time</th>
              </tr>
            </thead>
            <tbody>
              {data.customers.map((c: any) => (
                <tr key={c.customer_id}>
                  <td>{c.name}</td>
                  <td>{money(c.total_invoiced_minor, currency)}</td>
                  <td>{money(c.outstanding_minor, currency)}</td>
                  <td>
                    {c.average_delay_days === null
                      ? 'Limited data'
                      : c.average_delay_days + ' days'}
                  </td>
                  <td>{c.on_time_percent === null ? 'Limited data' : c.on_time_percent + '%'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
        <div className="customer-payment-behavior-mobile" aria-label="Customer payment summaries">
          {data.customers.map((c: any) => (
            <div className="customer-payment-record" key={c.customer_id}>
              <h3>{c.name}</h3>
              <dl>
                <div>
                  <dt>Invoiced</dt>
                  <dd>{money(c.total_invoiced_minor, currency)}</dd>
                </div>
                <div>
                  <dt>Outstanding</dt>
                  <dd>{money(c.outstanding_minor, currency)}</dd>
                </div>
                <div>
                  <dt>Observed delay</dt>
                  <dd>
                    {c.average_delay_days === null
                      ? 'Limited data'
                      : c.average_delay_days + ' days'}
                  </dd>
                </div>
                <div>
                  <dt>On-time</dt>
                  <dd>{c.on_time_percent === null ? 'Limited data' : c.on_time_percent + '%'}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>
      <div className="dashboard-columns">
        {writable && expenseAccess && (
          <Form
            className="o-flat-section"
            submit={(d) =>
              action(
                () =>
                  api('/expenses', 'POST', {
                    description: d.description,
                    amount_minor: Math.round(Number(d.amount) * factor(currency)),
                    currency,
                    occurred_on: d.occurred_on,
                    category: d.category,
                    ...(d.obligation_id ? { obligation_id: d.obligation_id } : {}),
                  }),
                'Expense recorded as self-reported information.',
              )
            }
          >
            <h2>Record an expense</h2>
            <Field label="Description">
              <input name="description" required maxLength={300} />
            </Field>
            <Field label={'Amount (' + currency + ')'}>
              <input
                name="amount"
                type="number"
                min={1 / factor(currency)}
                step={1 / factor(currency)}
                required
              />
            </Field>
            <Field label="Date paid">
              <input name="occurred_on" type="date" defaultValue={today()} max={today()} required />
            </Field>
            <Field label="Category">
              <select name="category">
                {['stock', 'rent', 'payroll', 'utilities', 'delivery', 'other'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Linked obligation (optional)">
              <select name="obligation_id">
                <option value="">None</option>
                {secondary.obligations
                  ?.filter((o: any) => o.currency === currency)
                  .map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.description}
                    </option>
                  ))}
              </select>
            </Field>
            <button className="button">Record expense</button>
            <p>Merchant-recorded, not independently verified.</p>
          </Form>
        )}
        {writable && obligationAccess && (
          <Form
            className="o-flat-section"
            submit={(d) =>
              action(() =>
                api('/obligations', 'POST', {
                  description: d.description,
                  amount_minor: Math.round(Number(d.amount) * factor(currency)),
                  currency,
                  next_due_date: d.next_due_date,
                  recurrence: d.recurrence,
                }),
              )
            }
          >
            <h2>Plan a recurring obligation</h2>
            <Field label="Description">
              <input name="description" required />
            </Field>
            <Field label={'Expected amount (' + currency + ')'}>
              <input
                name="amount"
                type="number"
                min={1 / factor(currency)}
                step={1 / factor(currency)}
                required
              />
            </Field>
            <Field label="Next due date">
              <input name="next_due_date" type="date" required />
            </Field>
            <Field label="Recurrence">
              <select name="recurrence">
                {['once', 'weekly', 'monthly', 'quarterly', 'yearly'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <button className="button">Save obligation</button>
          </Form>
        )}
      </div>
      <section className="o-flat-section">
        <h2>Obligations</h2>
        <p className="muted">
          Active items inform forecasts. Paused, completed and cancelled items remain in the
          history.
        </p>
        {secondary.obligations?.length ? (
          secondary.obligations.map((o: any) => (
            <div className="list-row" key={o.id}>
              <span>
                {o.description} · {money(o.amount_minor, o.currency)} · {o.next_due_date}
              </span>
              <small>
                {o.recurrence} · {o.status}
              </small>
              {writable && (
                <div className="row-actions">
                  {['active', 'paused'].includes(o.status) && (
                    <button
                      onClick={() =>
                        action(() =>
                          api('/obligations/' + o.id, 'PATCH', {
                            status: o.status === 'active' ? 'paused' : 'active',
                          }),
                        )
                      }
                    >
                      {o.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      action(() => api('/obligations/' + o.id, 'PATCH', { status: 'completed' }))
                    }
                    disabled={o.status === 'completed'}
                  >
                    Complete
                  </button>
                  <button
                    onClick={() =>
                      action(() => api('/obligations/' + o.id, 'PATCH', { status: 'cancelled' }))
                    }
                    disabled={o.status === 'cancelled'}
                  >
                    Cancel obligation
                  </button>
                  <details>
                    <summary>Edit obligation</summary>
                    <Form
                      className="account-inline-form"
                      submit={(d) =>
                        action(() =>
                          api('/obligations/' + o.id, 'PATCH', {
                            description: d.description,
                            amount_minor: Math.round(Number(d.amount) * factor(o.currency)),
                            next_due_date: d.next_due_date,
                            recurrence: d.recurrence,
                          }),
                        )
                      }
                    >
                      <Field label="Description">
                        <input name="description" required defaultValue={o.description} />
                      </Field>
                      <Field label={'Amount (' + o.currency + ')'}>
                        <input
                          name="amount"
                          required
                          type="number"
                          min={1 / factor(o.currency)}
                          step={1 / factor(o.currency)}
                          defaultValue={o.amount_minor / factor(o.currency)}
                        />
                      </Field>
                      <Field label="Next due date">
                        <input
                          type="date"
                          name="next_due_date"
                          required
                          defaultValue={o.next_due_date}
                        />
                      </Field>
                      <Field label="Recurrence">
                        <select name="recurrence" defaultValue={o.recurrence}>
                          {['once', 'weekly', 'monthly', 'quarterly', 'yearly'].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </Field>
                      <button className="secondary-button">Save changes</button>
                    </Form>
                  </details>
                </div>
              )}
            </div>
          ))
        ) : (
          <Empty text="Record obligations to improve forecast coverage." />
        )}
      </section>
    </div>
  );
}
export function ForecastView({
  data,
  currency,
  api,
  setData,
}: {
  data: any;
  currency: string;
  api: API;
  setData: (data: any) => void;
}) {
  const [scenario, setScenario] = useState('expected');
  return (
    <>
      <Form
        className="panel"
        submit={async (d) =>
          setData(
            await api('/forecasts', 'POST', {
              currency,
              horizon: Number(d.horizon),
              scenario: d.scenario,
              ...(d.scenario === 'custom'
                ? {
                    collection_bps: Math.round(Number(d.collection) * 100),
                    delay_days: Number(d.delay),
                    outflow_bps: Math.round(Number(d.outflow) * 100),
                  }
                : {}),
            }),
          )
        }
      >
        <div className="form-grid">
          <Field label="Horizon">
            <select name="horizon" defaultValue="30">
              {[7, 30, 60, 90].map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </select>
          </Field>
          <Field label="Scenario">
            <select name="scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}>
              {['expected', 'optimistic', 'conservative', 'custom'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          {scenario === 'custom' && (
            <>
              <Field label="Custom expected collection (%)">
                <input name="collection" type="number" min={0} max={100} defaultValue={90} />
              </Field>
              <Field label="Custom additional delay (days)">
                <input name="delay" type="number" min={0} max={120} defaultValue={0} />
              </Field>
              <Field label="Custom outflow assumption (%)">
                <input name="outflow" type="number" min={0} max={300} defaultValue={100} />
              </Field>
            </>
          )}
        </div>
        <button className="button">Calculate scenario</button>
      </Form>
      {data && (
        <>
          <Provenance label="forecast_estimate" />
          <div className="metric-grid">
            <MetricDefinition
              label="Projected inflows"
              value={money(data.projected_inflows_minor, currency)}
              definition="Scheduled recurring income and due invoices adjusted by scenario assumptions."
            />
            <MetricDefinition
              label="Projected outflows"
              value={money(data.projected_outflows_minor, currency)}
              definition="Active subscriptions, recorded obligations, and eligible historical outflows."
            />
            <MetricDefinition
              label="Estimated net movement"
              value={money(data.estimated_net_movement_minor, currency)}
              definition="Projected inflows minus projected outflows. No opening bank balance is assumed."
            />
            <MetricDefinition
              label="Data sufficiency"
              value={data.confidence.replaceAll('_', ' ')}
              definition={data.uncertainty}
            />
          </div>
          <section className="panel">
            <h2>
              {data.horizon}-day {data.scenario} scenario
            </h2>
            <Trend points={data.series} currency={currency} forecast />
            <p>
              Scenario assumptions are not statistical confidence intervals or guaranteed receipts.
            </p>
            <p>
              Collection: {data.assumptions.collection_bps / 100}% · Additional delay:{' '}
              {data.assumptions.additional_delay_days} days · Outflows:{' '}
              {data.assumptions.outflow_bps / 100}%
              {data.assumptions.recorded_recurring_income_minor > 0
                ? ` · Recurring income: ${money(data.assumptions.recorded_recurring_income_minor, currency)}`
                : ''}
              {data.assumptions.recorded_obligations_minor > 0
                ? ` · Subscriptions & obligations: ${money(data.assumptions.recorded_obligations_minor, currency)}`
                : ''}
              .
            </p>
            {data.actions.map((s: string) => (
              <p className="forecast-action" key={s}>
                {s}
              </p>
            ))}
          </section>
          {Array.isArray(data.projected_recurring_income) && data.projected_recurring_income.length > 0 && (
            <section className="panel">
              <h2>Projected recurring income</h2>
              <div className="table-scroll">
                <DataTable>
                  <thead>
                    <tr>
                      <th>Income source</th>
                      <th>Category</th>
                      <th>Frequency</th>
                      <th>Expected date</th>
                      <th>Estimated receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projected_recurring_income.map((item: any, idx: number) => (
                      <tr key={`${item.recurring_income_id}-${item.expected_date}-${idx}`}>
                        <td>
                          {item.description}
                          {item.source ? ` (${item.source})` : ''}
                        </td>
                        <td>{item.category}</td>
                        <td>{item.recurrence}</td>
                        <td>{item.expected_date}</td>
                        <td>{money(item.expected_amount_minor, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            </section>
          )}
          {Array.isArray(data.projected_obligations) && data.projected_obligations.length > 0 && (
            <section className="panel">
              <h2>Projected subscriptions &amp; obligations</h2>
              <div className="table-scroll">
                <DataTable>
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Frequency</th>
                      <th>Due date</th>
                      <th>Estimated outflow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projected_obligations.map((item: any, idx: number) => (
                      <tr key={`${item.obligation_id}-${item.due_date}-${idx}`}>
                        <td>
                          {item.description}
                          {item.supplier ? ` (${item.supplier})` : ''}
                        </td>
                        <td>{item.category}</td>
                        <td>{item.recurrence}</td>
                        <td>{item.due_date}</td>
                        <td>{money(item.expected_amount_minor, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            </section>
          )}
          {Array.isArray(data.projected_invoices) && data.projected_invoices.length > 0 && (
            <section className="panel">
              <h2>Projected receivables</h2>
              <div className="table-scroll">
                <DataTable>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Expected date</th>
                      <th>Estimated receipt</th>
                      <th>Observed settlements</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projected_invoices.map((i: any) => (
                      <tr key={i.invoice_id}>
                        <td>{i.invoice_id}</td>
                        <td>{i.expected_date}</td>
                        <td>{money(i.expected_receipt_minor, currency)}</td>
                        <td>{i.delay_observations}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
