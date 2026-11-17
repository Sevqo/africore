import { useEffect, useState } from 'react';
import { InteractiveChart } from '../charts/InteractiveChart';
import { Field, money, type API } from '../operations/UI';
import './finance-app.css';

const currencies = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'];

type Props = {
  api: API;
  scope: string;
  services: any[];
  writable: boolean;
  onCreateInvoice: () => void;
  navigate: (section: string) => void;
};

export function FinanceOperationsOverview({
  api,
  scope,
  services,
  writable,
  onCreateInvoice,
  navigate,
}: Props) {
  const [currency, setCurrency] = useState('KES');
  const [data, setData] = useState<any>(null);
  const [invoiceCount, setInvoiceCount] = useState<number | null>(null);
  const [expenseCount, setExpenseCount] = useState<number | null>(null);
  const [paymentCount, setPaymentCount] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  const hasService = (id: string) =>
    services.some((service) => service.id === id && service.status === 'active');
  const invoicesOn = hasService('invoicing');
  const expensesOn = hasService('expenses');
  const paymentsOn = hasService('payments');
  const reconciliationOn = hasService('reconciliation');

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErrors([]);
    const jobs = [
      api('/financial-summary?' + new URLSearchParams({ currency })),
      invoicesOn
        ? api('/records/invoices?limit=1&status=outstanding&currency=' + currency)
        : Promise.resolve(null),
      expensesOn ? api('/expenses?limit=1') : Promise.resolve(null),
      paymentsOn ? api('/payment-events?limit=1&status=succeeded') : Promise.resolve(null),
    ];
    Promise.allSettled(jobs).then((results) => {
      if (!live) return;
      const failures: string[] = [];
      if (results[0].status === 'fulfilled') setData(results[0].value);
      else {
        setData(null);
        failures.push('Financial movement: ' + results[0].reason.message);
      }
      if (invoicesOn && results[1].status === 'fulfilled')
        setInvoiceCount(Number(results[1].value?.total || 0));
      else if (invoicesOn && results[1].status === 'rejected') {
        setInvoiceCount(null);
        failures.push('Invoices: ' + results[1].reason.message);
      } else setInvoiceCount(null);
      if (expensesOn && results[2].status === 'fulfilled')
        setExpenseCount(Number(results[2].value?.total || 0));
      else if (expensesOn && results[2].status === 'rejected') {
        setExpenseCount(null);
        failures.push('Expenses: ' + results[2].reason.message);
      } else setExpenseCount(null);
      if (paymentsOn && results[3].status === 'fulfilled')
        setPaymentCount(Number(results[3].value?.total || 0));
      else if (paymentsOn && results[3].status === 'rejected') {
        setPaymentCount(null);
        failures.push('Payments: ' + results[3].reason.message);
      } else setPaymentCount(null);
      setErrors(failures);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [api, scope, currency, revision, invoicesOn, expensesOn, paymentsOn]);

  const totals = data?.totals;
  const series = data?.series || [];

  return (
    <section
      className="finance-register finance-operations-overview"
      aria-labelledby="finance-ops-title"
    >
      <div className="finance-page-heading">
        <div>
          <h1 id="finance-ops-title">Financial operations</h1>
          <span className="finance-page-context">
            Source overview · {data?.period?.from || '—'} — {data?.period?.to || '—'}
          </span>
        </div>
        <div className="finance-operations-controls">
          <Field label="Reporting currency">
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {currencies.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setRevision((value) => value + 1)}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {errors.map((message) => (
        <p className="alert error" role="alert" key={message}>
          {message}
        </p>
      ))}
      {loading && !data && <p role="status">Loading financial source records…</p>}

      <div className="finance-source-grid">
        <article className="finance-source-card">
          <h2>Invoicing</h2>
          {invoicesOn ? (
            <>
              <dl>
                <div>
                  <dt>Open invoice records</dt>
                  <dd>{invoiceCount === null ? '—' : invoiceCount}</dd>
                </div>
                <div>
                  <dt>Outstanding amount</dt>
                  <dd>{totals ? money(totals.outstanding_minor, currency) : '—'}</dd>
                </div>
              </dl>
              <div className="finance-source-actions">
                {writable && (
                  <button className="button" onClick={onCreateInvoice}>
                    New invoice
                  </button>
                )}
                <button className="secondary-button" onClick={() => navigate('Invoices')}>
                  View invoices
                </button>
              </div>
            </>
          ) : (
            <p className="finance-source-note">Invoicing service is not active.</p>
          )}
        </article>

        <article className="finance-source-card">
          <h2>Expenses</h2>
          {expensesOn ? (
            <>
              <dl>
                <div>
                  <dt>Recorded entries</dt>
                  <dd>{expenseCount === null ? '—' : expenseCount}</dd>
                </div>
                <div>
                  <dt>Recorded outflows in period · {currency}</dt>
                  <dd>{totals ? money(totals.recorded_outflows_minor, currency) : '—'}</dd>
                </div>
              </dl>
              <div className="finance-source-actions">
                <button className="secondary-button" onClick={() => navigate('Expenses')}>
                  View and record expenses
                </button>
              </div>
            </>
          ) : (
            <p className="finance-source-note">Expenses service is not active.</p>
          )}
        </article>

        <article className="finance-source-card">
          <h2>Payments</h2>
          {paymentsOn ? (
            <>
              <dl>
                <div>
                  <dt>Confirmed events · all currencies</dt>
                  <dd>{paymentCount === null ? '—' : paymentCount}</dd>
                </div>
                <div>
                  <dt>Confirmed collections in period · {currency}</dt>
                  <dd>{totals ? money(totals.confirmed_inflows_minor, currency) : '—'}</dd>
                </div>
              </dl>
              <div className="finance-source-actions">
                <button className="secondary-button" onClick={() => navigate('Payments')}>
                  Review payments
                </button>
              </div>
            </>
          ) : (
            <p className="finance-source-note">
              Payments service is not active. No settlement is inferred from invoice status.
            </p>
          )}
        </article>

        <article className="finance-source-card finance-source-chart">
          <h2>Cash flow</h2>
          {data ? (
            <>
              <InteractiveChart
                variant="area"
                compact
                headingLevel={3}
                title="Confirmed collections and recorded outflows"
                currency={currency}
                points={series}
                series={[
                  {
                    key: 'confirmed_inflows_minor',
                    label: 'Confirmed collections',
                    color: '#238c83',
                  },
                  { key: 'recorded_outflows_minor', label: 'Recorded outflows', color: '#805077' },
                ]}
                description="Movement recorded in the selected currency and covered period."
              />
              <p className="finance-source-note">
                Net recorded movement {money(totals.net_movement_minor, currency)} · not a bank
                balance or profit.
              </p>
            </>
          ) : (
            <p className="finance-source-note">Movement data is unavailable.</p>
          )}
        </article>

        <article className="finance-source-card">
          <h2>Reconciliation</h2>
          {reconciliationOn ? (
            <>
              <dl>
                <div>
                  <dt>Exceptions pending review</dt>
                  <dd>{data ? data.quality.unreconciled_count : '—'}</dd>
                </div>
                <div>
                  <dt>Unallocated confirmations</dt>
                  <dd>{data ? data.quality.unallocated_confirmations : '—'}</dd>
                </div>
              </dl>
              <div className="finance-source-actions">
                <button className="secondary-button" onClick={() => navigate('Reconciliation')}>
                  Review matching
                </button>
              </div>
              <p className="finance-source-note">
                Matching reviews evidence; it does not post to Accounting.
              </p>
            </>
          ) : (
            <p className="finance-source-note">Reconciliation service is not active.</p>
          )}
        </article>
      </div>

      <p className="finance-source-note">
        Amounts use authorized records, retain their currency and respect the displayed coverage
        period. Expense entries are merchant recorded; provider events are confirmed activity
        (sandbox events may be simulations). Finance does not create a general ledger, bank balance
        or profit statement.
      </p>
    </section>
  );
}
