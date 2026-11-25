import { useEffect, useState, type FormEvent } from 'react';
import { money, today, type API } from '../operations/UI';

type Row = Record<string, any>;
export type AccountingFeatureView =
  | 'cash-flow'
  | 'fx-revaluation'
  | 'budgets'
  | 'follow-ups'
  | 'batch-payments'
  | 'debit-notes';

const VIEW_HEADERS: Record<AccountingFeatureView, { title: string; subtitle: string }> = {
  'cash-flow': {
    title: 'Cash Flow Statement',
    subtitle: 'Operating, investing, and financing cash movement classification.',
  },
  'fx-revaluation': {
    title: 'Foreign Currency Revaluation',
    subtitle: 'Compute unrealized exchange gains and losses on open multi-currency balances.',
  },
  budgets: {
    title: 'Analytic Accounts & Budgets',
    subtitle: 'Track cost centers and planned vs. actual budget variance.',
  },
  'follow-ups': {
    title: 'Customer Follow-up Levels',
    subtitle: 'Configure automated payment reminder and escalation schedules.',
  },
  'batch-payments': {
    title: 'Batch Payments & Remittances',
    subtitle: 'Group supplier or customer payments into bank and mobile-money remittance files.',
  },
  'debit-notes': {
    title: 'Customer Debit Notes',
    subtitle: 'Issue supplementary debit notes linked to posted invoices.',
  },
};

export function AccountingParityPanel({
  api,
  writable,
  activeView = 'cash-flow',
}: {
  api: API;
  writable: boolean;
  activeView?: AccountingFeatureView;
}) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [openingCash, setOpeningCash] = useState('500000');
  const [opIn, setOpIn] = useState('250000');
  const [opOut, setOpOut] = useState('90000');
  const [invOut, setInvOut] = useState('100000');
  const [finIn, setFinIn] = useState('150000');
  const [cashFlow, setCashFlow] = useState<Row | null>(null);

  const [revals, setRevals] = useState<Row[]>([]);
  const [fxRef, setFxRef] = useState('INV-USD-001');
  const [fxAmount, setFxAmount] = useState('100000');
  const [fxBooked, setFxBooked] = useState('128500000');
  const [fxClosing, setFxClosing] = useState('130000000');

  const [analytics, setAnalytics] = useState<Row[]>([]);
  const [budgets, setBudgets] = useState<Row[]>([]);
  const [aaCode, setAaCode] = useState('OPS-01');
  const [aaName, setAaName] = useState('Operations');
  const [budgetName, setBudgetName] = useState('Q4 Operating Budget');
  const [budgetPlanned, setBudgetPlanned] = useState('400000');
  const [budgetActual, setBudgetActual] = useState('320000');

  const [levels, setLevels] = useState<Row[]>([]);
  const [lvName, setLvName] = useState('15-day Payment Reminder');
  const [lvDays, setLvDays] = useState('15');
  const [lvChannel, setLvChannel] = useState<'email' | 'sms' | 'whatsapp'>('email');

  const [batches, setBatches] = useState<Row[]>([]);
  const [batchName, setBatchName] = useState('Supplier Bank Batch');
  const [batchPartner, setBatchPartner] = useState('Nairobi Supplies');
  const [batchAmount, setBatchAmount] = useState('75000');

  const [debits, setDebits] = useState<Row[]>([]);
  const [dnInvoice, setDnInvoice] = useState('INV-0001');
  const [dnReason, setDnReason] = useState('Additional freight surcharge');
  const [dnAmount, setDnAmount] = useState('15000');

  async function refresh() {
    const [r1, r2, r3, r4, r5, r6] = await Promise.allSettled([
      api('/accounting/fx-revaluations'),
      api('/accounting/analytic-accounts'),
      api('/accounting/budgets'),
      api('/accounting/followup-levels'),
      api('/accounting/batch-payments'),
      api('/accounting/debit-notes'),
    ]);
    if (r1.status === 'fulfilled') setRevals(r1.value?.revaluations || []);
    if (r2.status === 'fulfilled') setAnalytics(r2.value?.analytic_accounts || []);
    if (r3.status === 'fulfilled') setBudgets(r3.value?.budgets || []);
    if (r4.status === 'fulfilled') setLevels(r4.value?.levels || []);
    if (r5.status === 'fulfilled') setBatches(r5.value?.batches || []);
    if (r6.status === 'fulfilled') setDebits(r6.value?.debit_notes || []);
  }

  useEffect(() => {
    refresh();
  }, [api]);

  async function runCashFlow(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await api('/accounting/cash-flow', 'POST', {
        currency: 'KES',
        opening_cash_minor: Number(openingCash) || 0,
        movements: [
          { activity: 'operating', label: 'Operating receipts', amount_minor: Number(opIn) || 0 },
          { activity: 'operating', label: 'Operating disbursements', amount_minor: -(Number(opOut) || 0) },
          { activity: 'investing', label: 'Capital expenditures', amount_minor: -(Number(invOut) || 0) },
          { activity: 'financing', label: 'Financing inflows', amount_minor: Number(finIn) || 0 },
        ],
      });
      setCashFlow(res);
      setNotice('Cash flow statement updated.');
    } catch (err: any) {
      setError(err?.message || 'Cash flow calculation failed');
    }
  }

  async function runFx(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/accounting/fx-revaluations', 'POST', {
        as_of: today(),
        base_currency: 'KES',
        positions: [
          {
            reference: fxRef,
            currency: 'USD',
            foreign_amount_minor: Number(fxAmount) || 0,
            booked_rate_micros: Number(fxBooked) || 1_000_000,
            closing_rate_micros: Number(fxClosing) || 1_000_000,
          },
        ],
      });
      setNotice('FX revaluation run recorded.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'FX revaluation failed');
    }
  }

  async function addAnalyticAndBudget(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const aa = await api('/accounting/analytic-accounts', 'POST', {
        code: aaCode,
        name: aaName,
        plan: 'Departments',
        currency: 'KES',
      });
      await api('/accounting/budgets', 'POST', {
        name: budgetName,
        period_start: '2026-01-01',
        period_end: '2026-12-31',
        currency: 'KES',
        lines: [
          {
            analytic_account_id: aa.id,
            name: aaName,
            planned_minor: Number(budgetPlanned) || 0,
            actual_minor: Number(budgetActual) || 0,
          },
        ],
      });
      setNotice('Analytic account and budget saved.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to save analytic budget');
    }
  }

  async function addFollowup(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/accounting/followup-levels', 'POST', {
        name: lvName,
        days_overdue: Number(lvDays) || 7,
        channel: lvChannel,
        auto_send: true,
      });
      setNotice('Follow-up level saved.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to save follow-up level');
    }
  }

  async function addBatch(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/accounting/batch-payments', 'POST', {
        name: batchName,
        direction: 'outbound',
        method: 'bank_transfer',
        currency: 'KES',
        batch_date: today(),
        payments: [
          {
            payment_id: `PAY-${Date.now()}`,
            partner_name: batchPartner,
            reference: 'REM-001',
            amount_minor: Number(batchAmount) || 1000,
          },
        ],
      });
      setNotice('Batch payment remittance generated.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to create batch payment');
    }
  }

  async function addDebitNote(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/accounting/debit-notes', 'POST', {
        original_invoice_id: dnInvoice,
        reason: dnReason,
        issue_date: today(),
        currency: 'KES',
        amount_minor: Number(dnAmount) || 1000,
      });
      setNotice('Debit note posted.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to create debit note');
    }
  }

  const header = VIEW_HEADERS[activeView];

  return (
    <section>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>{header.title}</h3>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{header.subtitle}</p>
      </div>
      {notice && <p className="alert success">{notice}</p>}
      {error && <p className="alert error">{error}</p>}

      {activeView === 'cash-flow' && (
        <div>
          <form onSubmit={runCashFlow} className="ac-inline-form">
            <label>Opening cash (minor)<input value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} /></label>
            <label>Operating inflow<input value={opIn} onChange={(e) => setOpIn(e.target.value)} /></label>
            <label>Operating outflow<input value={opOut} onChange={(e) => setOpOut(e.target.value)} /></label>
            <label>Investing outflow<input value={invOut} onChange={(e) => setInvOut(e.target.value)} /></label>
            <label>Financing inflow<input value={finIn} onChange={(e) => setFinIn(e.target.value)} /></label>
            <button type="submit" className="button">Compute statement</button>
          </form>
          {cashFlow && (
            <table className="data-table">
              <thead><tr><th>Activity</th><th className="num">Net amount</th></tr></thead>
              <tbody>
                <tr><td>Operating activities</td><td className="num">{money(cashFlow.operating?.net_minor, 'KES')}</td></tr>
                <tr><td>Investing activities</td><td className="num">{money(cashFlow.investing?.net_minor, 'KES')}</td></tr>
                <tr><td>Financing activities</td><td className="num">{money(cashFlow.financing?.net_minor, 'KES')}</td></tr>
                <tr><td><strong>Closing cash balance</strong></td><td className="num"><strong>{money(cashFlow.closing_cash_minor, 'KES')}</strong></td></tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeView === 'fx-revaluation' && (
        <div>
          {writable && (
            <form onSubmit={runFx} className="ac-inline-form">
              <label>Document reference<input value={fxRef} onChange={(e) => setFxRef(e.target.value)} /></label>
              <label>Foreign amount (minor)<input value={fxAmount} onChange={(e) => setFxAmount(e.target.value)} /></label>
              <label>Booked rate (micros)<input value={fxBooked} onChange={(e) => setFxBooked(e.target.value)} /></label>
              <label>Closing rate (micros)<input value={fxClosing} onChange={(e) => setFxClosing(e.target.value)} /></label>
              <button type="submit" className="button">Run revaluation</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>As of</th><th>Base</th><th className="num">Unrealized gain</th><th className="num">Unrealized loss</th><th className="num">Net</th></tr></thead>
            <tbody>
              {revals.map((r) => (
                <tr key={r.id}>
                  <td>{r.as_of}</td><td>{r.base_currency}</td>
                  <td className="num">{money(r.total_unrealized_gain_minor, r.base_currency)}</td>
                  <td className="num">{money(r.total_unrealized_loss_minor, r.base_currency)}</td>
                  <td className="num">{money(r.net_unrealized_minor, r.base_currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'budgets' && (
        <div>
          {writable && (
            <form onSubmit={addAnalyticAndBudget} className="ac-inline-form">
              <label>Cost center code<input value={aaCode} onChange={(e) => setAaCode(e.target.value)} /></label>
              <label>Cost center name<input value={aaName} onChange={(e) => setAaName(e.target.value)} /></label>
              <label>Budget name<input value={budgetName} onChange={(e) => setBudgetName(e.target.value)} /></label>
              <label>Planned (minor)<input value={budgetPlanned} onChange={(e) => setBudgetPlanned(e.target.value)} /></label>
              <label>Actual (minor)<input value={budgetActual} onChange={(e) => setBudgetActual(e.target.value)} /></label>
              <button type="submit" className="button">Save budget</button>
            </form>
          )}
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Active cost centers: {analytics.length}</p>
          <table className="data-table">
            <thead><tr><th>Budget</th><th className="num">Planned</th><th className="num">Actual</th><th className="num">Achievement</th></tr></thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td className="num">{money(b.total_planned_minor, b.currency)}</td>
                  <td className="num">{money(b.total_actual_minor, b.currency)}</td>
                  <td className="num">{(Number(b.total_achievement_bps || 0) / 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'follow-ups' && (
        <div>
          {writable && (
            <form onSubmit={addFollowup} className="ac-inline-form">
              <label>Level name<input value={lvName} onChange={(e) => setLvName(e.target.value)} /></label>
              <label>Days overdue<input value={lvDays} onChange={(e) => setLvDays(e.target.value)} /></label>
              <label>Channel
                <select value={lvChannel} onChange={(e) => setLvChannel(e.target.value as any)}>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </label>
              <button type="submit" className="button">Add level</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Level</th><th>Days overdue</th><th>Channel</th><th>Auto-send</th></tr></thead>
            <tbody>
              {levels.map((lv) => (
                <tr key={lv.id}><td>{lv.name}</td><td>{lv.days_overdue}d</td><td>{lv.channel}</td><td>{lv.auto_send ? 'Yes' : 'No'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'batch-payments' && (
        <div>
          {writable && (
            <form onSubmit={addBatch} className="ac-inline-form">
              <label>Batch name<input value={batchName} onChange={(e) => setBatchName(e.target.value)} /></label>
              <label>Beneficiary<input value={batchPartner} onChange={(e) => setBatchPartner(e.target.value)} /></label>
              <label>Amount (minor)<input value={batchAmount} onChange={(e) => setBatchAmount(e.target.value)} /></label>
              <button type="submit" className="button">Create batch</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Batch</th><th>Method</th><th>Payments</th><th className="num">Total</th></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}><td>{b.name}</td><td>{b.method}</td><td>{b.payment_count}</td><td className="num">{money(b.total_minor, b.currency)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'debit-notes' && (
        <div>
          {writable && (
            <form onSubmit={addDebitNote} className="ac-inline-form">
              <label>Original invoice ID<input value={dnInvoice} onChange={(e) => setDnInvoice(e.target.value)} /></label>
              <label>Reason<input value={dnReason} onChange={(e) => setDnReason(e.target.value)} /></label>
              <label>Amount (minor)<input value={dnAmount} onChange={(e) => setDnAmount(e.target.value)} /></label>
              <button type="submit" className="button">Issue debit note</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Number</th><th>Original invoice</th><th>Reason</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {debits.map((d) => (
                <tr key={d.id}><td>{d.number}</td><td>{d.original_invoice_id}</td><td>{d.reason}</td><td className="num">{money(d.amount_minor, d.currency)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
