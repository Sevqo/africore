import { useEffect, useState, type ReactNode } from 'react';
import { Field as BaseField, Form as BaseForm, money, today, type API } from '../operations/UI';
import { SuiteParityToolsPanel } from './SuiteParityToolsPanel';

function Field({
  name,
  label,
  type = 'text',
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <BaseField label={label}>
      <input name={name} type={type} defaultValue={defaultValue} required={required} />
    </BaseField>
  );
}

function Form({
  submit,
  label,
  children,
}: {
  submit: (data: any) => Promise<any>;
  label: string;
  children: ReactNode;
}) {
  return (
    <BaseForm submit={submit}>
      {children}
      <button className="button" type="submit">
        {label}
      </button>
    </BaseForm>
  );
}

type SuiteTab =
  | 'pos'
  | 'crm'
  | 'work'
  | 'people'
  | 'subscriptions'
  | 'support'
  | 'marketing'
  | 'mrp'
  | 'operations';

type Props = {
  api: API;
  scope: string;
  writable: boolean;
  financeWritable: boolean;
};

function useSuiteData(api: API, path: string, rev: number): { data?: any; error?: string } {
  const [state, setState] = useState<{ path: string; data?: any; error?: string }>({ path: '' });
  useEffect(() => {
    if (!path) return;
    let live = true;
    api(path).then(
      (data) => {
        if (live) setState({ path, data });
      },
      (error) => {
        if (live) setState({ path, error: error.message });
      },
    );
    return () => {
      live = false;
    };
  }, [api, path, rev]);
  return state.path === path ? state : {};
}

function PosExpansion({ api, writable, onNotify }: { api: API; writable: boolean; onNotify: (m: string) => void }) {
  const [rev, setRev] = useState(0);
  const counts = useSuiteData(api, '/pos/cash-counts', rev);
  const programs = useSuiteData(api, '/pos/loyalty-programs', rev);
  return (
    <div className="stack">
      <section className="panel">
        <h3>POS Cash Drawer Control (Phase 4)</h3>
        {counts.error && <p className="alert error">{counts.error}</p>}
        {writable && (
          <Form
            submit={async (d) => {
              await api('/pos/cash-counts', 'POST', {
                session_ref: d.session_ref,
                currency: d.currency || 'KES',
                opening_minor: Math.round(Number(d.opening || 0) * 100),
                cash_sales_minor: Math.round(Number(d.sales || 0) * 100),
                cash_in_minor: 0,
                cash_out_minor: 0,
                denominations: [
                  { denomination_minor: 100000, count: Number(d.notes_1000 || 0) },
                  { denomination_minor: 50000, count: Number(d.notes_500 || 0) },
                ],
                notes: d.notes || '',
              });
              setRev((n) => n + 1);
              onNotify('POS cash drawer count recorded.');
            }}
            label="Record cash count"
          >
            <Field name="session_ref" label="Session reference" defaultValue="POS-SHIFT-01" required />
            <Field name="currency" label="Currency" defaultValue="KES" required />
            <Field name="opening" label="Opening float" type="number" defaultValue="5000" required />
            <Field name="sales" label="Cash sales" type="number" defaultValue="12500" required />
            <Field name="notes_1000" label="1,000 notes counted" type="number" defaultValue="17" required />
            <Field name="notes_500" label="500 notes counted" type="number" defaultValue="1" required />
            <Field name="notes" label="Notes" />
          </Form>
        )}
        <table className="data-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Expected</th>
              <th>Counted</th>
              <th>Variance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(counts.data?.data || []).map((c: any) => (
              <tr key={c.id}>
                <td>{c.session_ref}</td>
                <td>{money(c.result?.expected_minor || 0, c.currency)}</td>
                <td>{money(c.result?.counted_minor || 0, c.currency)}</td>
                <td>{money(c.result?.variance_minor || 0, c.currency)}</td>
                <td><span className="badge">{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h3>POS Loyalty Programs</h3>
        {programs.error && <p className="alert error">{programs.error}</p>}
        {writable && (
          <Form
            submit={async (d) => {
              await api('/pos/loyalty-programs', 'POST', {
                name: d.name,
                currency: d.currency || 'KES',
                points_per_1000_minor: Number(d.earn_rate || 10),
                minor_per_point: Number(d.redeem_minor || 100),
                active: true,
              });
              setRev((n) => n + 1);
              onNotify('Loyalty program created.');
            }}
            label="Create loyalty program"
          >
            <Field name="name" label="Program name" defaultValue="AfriCore Gold Rewards" required />
            <Field name="currency" label="Currency" defaultValue="KES" required />
            <Field name="earn_rate" label="Points per 1,000 minor" type="number" defaultValue="10" required />
            <Field name="redeem_minor" label="Minor value per point" type="number" defaultValue="100" required />
          </Form>
        )}
        <ul>
          {(programs.data?.data || []).map((p: any) => (
            <li key={p.id}>
              <strong>{p.name}</strong> · {p.points_per_1000_minor} pts / 1,000 minor · {p.minor_per_point} minor/pt ({p.currency})
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CrmExpansion({ api, writable, onNotify }: { api: API; writable: boolean; onNotify: (m: string) => void }) {
  const [rev, setRev] = useState(0);
  const [score, setScore] = useState<any>(null);
  const activities = useSuiteData(api, '/crm/scheduled-activities', rev);
  return (
    <div className="stack">
      <section className="panel">
        <h3>CRM Predictive Lead Scoring & Scheduled Activities (Phase 5)</h3>
        {activities.error && <p className="alert error">{activities.error}</p>}
        <Form
          submit={async (d) => {
            const res = await api('/crm/scoring/evaluate', 'POST', {
              has_email: true,
              has_phone: true,
              has_company: true,
              expected_revenue_minor: Math.round(Number(d.revenue || 0) * 100),
              activities_completed: Number(d.events || 3),
              days_stale: Number(d.days || 2),
            });
            setScore(res);
          }}
          label="Score opportunity"
        >
          <Field name="revenue" label="Expected revenue" type="number" defaultValue="250000" required />
          <Field name="events" label="Completed activities" type="number" defaultValue="4" required />
          <Field name="days" label="Days stale" type="number" defaultValue="1" required />
        </Form>
        {score && (
          <p className="alert">
            Lead score: <strong>{score.score}/100</strong> ({score.tier.toUpperCase()}) · Suggested probability: {(score.suggested_probability_bps / 100).toFixed(2)}%
          </p>
        )}
        {writable && (
          <Form
            submit={async (d) => {
              await api('/crm/scheduled-activities', 'POST', {
                lead_ref: d.opp_ref,
                activity_type: d.type || 'call',
                summary: d.summary,
                due_on: d.due_on || today(),
                notes: d.notes || '',
              });
              setRev((n) => n + 1);
              onNotify('CRM activity scheduled.');
            }}
            label="Schedule activity"
          >
            <Field name="opp_ref" label="Lead ref" defaultValue="OPP-2026-01" required />
            <Field name="type" label="Type (call/meeting/email/todo)" defaultValue="call" required />
            <Field name="summary" label="Summary" defaultValue="Follow up on proposal" required />
            <Field name="due_on" label="Due date" type="date" defaultValue={today()} required />
            <Field name="notes" label="Notes" />
          </Form>
        )}
        <ul>
          {(activities.data?.data || []).map((a: any) => (
            <li key={a.id}>
              <strong>{a.lead_ref}</strong> [{a.activity_type}] {a.summary} · Due {a.due_on} · <span className="badge">{a.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function WorkExpansion({ api, writable, onNotify }: { api: API; writable: boolean; onNotify: (m: string) => void }) {
  const [rev, setRev] = useState(0);
  const milestones = useSuiteData(api, '/work/milestones', rev);
  const summaries = useSuiteData(api, '/work/billing-summaries', rev);
  return (
    <div className="stack">
      <section className="panel">
        <h3>Work Project Milestones & Billable Burn (Phase 6)</h3>
        {milestones.error && <p className="alert error">{milestones.error}</p>}
        {writable && (
          <Form
            submit={async (d) => {
              await api('/work/milestones', 'POST', {
                project_ref: d.project_ref,
                name: d.name,
                target_on: d.deadline || today(),
                progress_pct: Number(d.pct || 25),
                notes: d.notes || '',
              });
              setRev((n) => n + 1);
              onNotify('Project milestone created.');
            }}
            label="Add milestone"
          >
            <Field name="project_ref" label="Project ref" defaultValue="PRJ-001" required />
            <Field name="name" label="Milestone name" defaultValue="Architecture Sign-off" required />
            <Field name="deadline" label="Target date" type="date" defaultValue={today()} required />
            <Field name="pct" label="Progress (%)" type="number" defaultValue="25" required />
            <Field name="notes" label="Notes" />
          </Form>
        )}
        <ul>
          {(milestones.data?.data || []).map((m: any) => (
            <li key={m.id}>
              <strong>{m.project_ref}</strong> · {m.name} ({m.progress_pct}%) · Target {m.target_on} · <span className="badge">{m.status}</span>
            </li>
          ))}
        </ul>
        <p>Billing summaries recorded: {(summaries.data?.data || []).length}</p>
      </section>
    </div>
  );
}

function PeopleExpansionPanel({ api, financeWritable, onNotify }: { api: API; financeWritable: boolean; onNotify: (m: string) => void }) {
  const [rev, setRev] = useState(0);
  const runs = useSuiteData(api, '/people/payroll-runs', rev);
  const allocations = useSuiteData(api, '/people/leave-allocations', rev);
  return (
    <div className="stack">
      <section className="panel">
        <h3>People Payroll Runs & Leave Allocations (Phase 7)</h3>
        {runs.error && <p className="alert error">{runs.error}</p>}
        {financeWritable && (
          <Form
            submit={async (d) => {
              await api('/people/payroll-runs', 'POST', {
                period_label: d.period,
                pay_date: d.pay_date || today(),
                currency: d.currency || 'KES',
                employees: [
                  {
                    employee_id: d.emp_id || 'EMP-001',
                    name: d.emp_name || 'Grace Wanjiku',
                    base_salary_minor: Math.round(Number(d.gross || 120000) * 100),
                    allowances_minor: Math.round(Number(d.allowances || 15000) * 100),
                    pre_tax_deductions_minor: 0,
                    post_tax_deductions_minor: 0,
                    tax_relief_minor: 240000,
                  },
                ],
                tax_brackets: [
                  { up_to_minor: 2400000, rate_bps: 1000 },
                  { up_to_minor: 5000000, rate_bps: 2500 },
                  { up_to_minor: null, rate_bps: 3000 },
                ],
              });
              setRev((n) => n + 1);
              onNotify('Payroll run created in pending_approval state (requires separate manager).');
            }}
            label="Create payroll run"
          >
            <Field name="period" label="Pay period" defaultValue="2026-11" required />
            <Field name="pay_date" label="Pay date" type="date" defaultValue={today()} required />
            <Field name="currency" label="Currency" defaultValue="KES" required />
            <Field name="emp_name" label="Employee name" defaultValue="Grace Wanjiku" required />
            <Field name="gross" label="Monthly gross" type="number" defaultValue="120000" required />
            <Field name="allowances" label="Allowances" type="number" defaultValue="15000" required />
          </Form>
        )}
        <table className="data-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Gross</th>
              <th>Tax</th>
              <th>Net Pay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(runs.data?.data || []).map((r: any) => (
              <tr key={r.id}>
                <td>{r.period_label}</td>
                <td>{money(r.result?.totals?.gross_minor || 0, r.currency)}</td>
                <td>{money(r.result?.totals?.tax_minor || 0, r.currency)}</td>
                <td>{money(r.result?.totals?.net_pay_minor || 0, r.currency)}</td>
                <td><span className="badge">{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Leave allocations recorded: {(allocations.data?.data || []).length}</p>
      </section>
    </div>
  );
}

function SubscriptionsExpansion({ api, writable, onNotify }: { api: API; writable: boolean; onNotify: (m: string) => void }) {
  const [rev, setRev] = useState(0);
  const plans = useSuiteData(api, '/subscriptions/plans', rev);
  const contracts = useSuiteData(api, '/subscriptions/contracts', rev);
  const report = useSuiteData(api, '/subscriptions/mrr-report', rev);
  return (
    <div className="stack">
      <section className="panel">
        <h3>Subscriptions & Recurring Billing (Phase 8)</h3>
        {plans.error && <p className="alert error">{plans.error}</p>}
        {writable && (
          <Form
            submit={async (d) => {
              await api('/subscriptions/plans', 'POST', {
                code: d.code,
                name: d.name,
                currency: d.currency || 'KES',
                interval: d.interval || 'monthly',
                price_minor: Math.round(Number(d.price || 0) * 100),
                trial_days: Number(d.trial_days || 14),
              });
              setRev((n) => n + 1);
              onNotify('Subscription plan created.');
            }}
            label="Create plan"
          >
            <Field name="code" label="Plan code" defaultValue="PRO-MONTHLY" required />
            <Field name="name" label="Plan name" defaultValue="AfriCore Pro Monthly" required />
            <Field name="currency" label="Currency" defaultValue="KES" required />
            <Field name="interval" label="Interval (monthly/quarterly/annual)" defaultValue="monthly" required />
            <Field name="price" label="Price" type="number" defaultValue="15000" required />
            <Field name="trial_days" label="Trial days" type="number" defaultValue="14" required />
          </Form>
        )}
        <p>
          Active plans: {(plans.data?.data || []).length} · Contracts: {(contracts.data?.data || []).length}
        </p>
        {report.data?.totals_by_currency && (
          <ul>
            {Object.entries(report.data.totals_by_currency).map(([ccy, row]: [string, any]) => (
              <li key={ccy}>
                <strong>{ccy}</strong> · MRR: {money(row.mrr_minor, ccy)} · ARR: {money(row.arr_minor, ccy)} ({row.active_count} active)
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SupportExpansion({ api, writable, onNotify }: { api: API; writable: boolean; onNotify: (m: string) => void }) {
  const [rev, setRev] = useState(0);
  const tickets = useSuiteData(api, '/support/tickets', rev);
  const sla = useSuiteData(api, '/support/sla-report', rev);
  return (
    <section className="panel">
      <h3>Support Helpdesk & SLA Tracking (Phase 9)</h3>
      {tickets.error && <p className="alert error">{tickets.error}</p>}
      {sla.data && (
        <p>
          Total tickets: <strong>{sla.data.total}</strong> · Open: {sla.data.open} · Solved: {sla.data.solved_or_closed} · Overdue: {sla.data.overdue_sla}
        </p>
      )}
      {writable && (
        <Form
          submit={async (d) => {
            await api('/support/tickets', 'POST', {
              subject: d.subject,
              customer_name: d.customer,
              priority: d.priority || 'high',
              sla_due_on: d.sla_due_on || today(),
              description: d.description || '',
            });
            setRev((n) => n + 1);
            onNotify('Support ticket created.');
          }}
          label="Open ticket"
        >
          <Field name="subject" label="Subject" defaultValue="Invoice PDF tax breakdown question" required />
          <Field name="customer" label="Customer" defaultValue="Savannah Traders Ltd" required />
          <Field name="priority" label="Priority (low/normal/high/urgent)" defaultValue="high" required />
          <Field name="sla_due_on" label="SLA due date" type="date" defaultValue={today()} required />
          <Field name="description" label="Description" defaultValue="Customer inquiry on invoice VAT lines" />
        </Form>
      )}
      <ul>
        {(tickets.data?.data || []).map((t: any) => (
          <li key={t.id}>
            <strong>{t.subject}</strong> · {t.customer_name} [{t.priority}] · SLA {t.sla_due_on} · <span className="badge">{t.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MarketingExpansion({ api, writable, onNotify }: { api: API; writable: boolean; onNotify: (m: string) => void }) {
  const [rev, setRev] = useState(0);
  const campaigns = useSuiteData(api, '/marketing/campaigns', rev);
  return (
    <section className="panel">
      <h3>Marketing Campaigns (Phase 9)</h3>
      {campaigns.error && <p className="alert error">{campaigns.error}</p>}
      {writable && (
        <Form
          submit={async (d) => {
            await api('/marketing/campaigns', 'POST', {
              name: d.name,
              channel: d.channel || 'email',
              audience_segment: d.segment || 'Enterprise Customers',
              scheduled_on: d.scheduled_on || today(),
              subject_line: d.subject_line || d.name,
            });
            setRev((n) => n + 1);
            onNotify('Marketing campaign created.');
          }}
          label="Create campaign"
        >
          <Field name="name" label="Campaign name" defaultValue="Q4 Enterprise Launch" required />
          <Field name="channel" label="Channel (email/sms/social/event)" defaultValue="email" required />
          <Field name="segment" label="Audience segment" defaultValue="Enterprise CFOs" required />
          <Field name="scheduled_on" label="Scheduled date" type="date" defaultValue={today()} required />
          <Field name="subject_line" label="Subject line" defaultValue="Introducing AfriCore Suite" required />
        </Form>
      )}
      <ul>
        {(campaigns.data?.data || []).map((c: any) => (
          <li key={c.id}>
            <strong>{c.name}</strong> [{c.channel}] · {c.audience_segment} · {c.scheduled_on} · <span className="badge">{c.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MrpExpansion({ api, writable, onNotify }: { api: API; writable: boolean; onNotify: (m: string) => void }) {
  const [rev, setRev] = useState(0);
  const boms = useSuiteData(api, '/mrp/boms', rev);
  const orders = useSuiteData(api, '/mrp/orders', rev);
  return (
    <section className="panel">
      <h3>Manufacturing MRP — Bills of Materials & Production Orders (Phase 10)</h3>
      {boms.error && <p className="alert error">{boms.error}</p>}
      {writable && (
        <Form
          submit={async (d) => {
            await api('/mrp/boms', 'POST', {
              code: d.code,
              finished_product_name: d.product_name,
              currency: d.currency || 'KES',
              bom_quantity_milli: 1000,
              components: [
                {
                  sku: d.comp_code || 'RAW-01',
                  quantity_milli: 2000,
                  unit_cost_minor: Math.round(Number(d.comp_cost || 1500) * 100),
                  scrap_bps: 500,
                },
              ],
              operations: [
                {
                  name: 'Assembly',
                  duration_minutes: 45,
                  hourly_cost_minor: 120000,
                },
              ],
            });
            setRev((n) => n + 1);
            onNotify('Bill of Materials created with cost rollup.');
          }}
          label="Create BOM"
        >
          <Field name="code" label="BOM code" defaultValue="BOM-SOLAR-01" required />
          <Field name="product_name" label="Finished product" defaultValue="Solar Cold-Chain Unit" required />
          <Field name="currency" label="Currency" defaultValue="KES" required />
          <Field name="comp_code" label="Primary component code" defaultValue="RAW-PANEL-01" required />
          <Field name="comp_name" label="Primary component" defaultValue="Photovoltaic Panel" required />
          <Field name="comp_cost" label="Component unit cost" type="number" defaultValue="4500" required />
        </Form>
      )}
      <p>
        BOMs defined: {(boms.data?.data || []).length} · Manufacturing Orders: {(orders.data?.data || []).length}
      </p>
      <ul>
        {(boms.data?.data || []).map((b: any) => (
          <li key={b.id}>
            <strong>{b.code}</strong> · {b.finished_product_name} · Unit cost: {money(b.standard_rollup?.unit_cost_minor || 0, b.currency)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function OperationsExpansion({ api, writable, onNotify }: { api: API; writable: boolean; onNotify: (m: string) => void }) {
  const [rev, setRev] = useState(0);
  const maint = useSuiteData(api, '/maintenance/requests', rev);
  const fleet = useSuiteData(api, '/fleet/vehicles', rev);
  const ship = useSuiteData(api, '/logistics/shipments', rev);
  return (
    <div className="stack">
      <section className="panel">
        <h3>Maintenance, Fleet & Logistics (Phase 10)</h3>
        <p>
          Maintenance requests: <strong>{(maint.data?.data || []).length}</strong> · Fleet vehicles:{' '}
          <strong>{(fleet.data?.data || []).length}</strong> · Logistics shipments:{' '}
          <strong>{(ship.data?.data || []).length}</strong>
        </p>
        {writable && (
          <Form
            submit={async (d) => {
              await api('/fleet/vehicles', 'POST', {
                plate_number: d.plate,
                model: d.model,
                driver_name: d.driver || 'Fleet Driver',
                odometer_km: Number(d.odometer || 0),
                next_service_on: d.service_on || today(),
              });
              setRev((n) => n + 1);
              onNotify('Fleet vehicle registered.');
            }}
            label="Register vehicle"
          >
            <Field name="plate" label="Plate number" defaultValue="KDL 402A" required />
            <Field name="model" label="Model" defaultValue="Isuzu NPR Cargo" required />
            <Field name="driver" label="Driver" defaultValue="Samuel Otieno" required />
            <Field name="odometer" label="Odometer (km)" type="number" defaultValue="14200" required />
            <Field name="service_on" label="Next service" type="date" defaultValue={today()} required />
          </Form>
        )}
        <ul>
          {(fleet.data?.data || []).map((v: any) => (
            <li key={v.id}>
              <strong>{v.plate_number}</strong> · {v.model} ({v.odometer_km} km) · <span className="badge">{v.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function OdooSuiteExpansionWorkspace({ api, writable, financeWritable }: Props) {
  const [tab, setTab] = useState<SuiteTab>('subscriptions');
  const [notice, setNotice] = useState('');
  const tabs: { id: SuiteTab; label: string }[] = [
    { id: 'pos', label: 'POS Control' },
    { id: 'crm', label: 'CRM Scoring' },
    { id: 'work', label: 'Work Milestones' },
    { id: 'people', label: 'Payroll & Leave' },
    { id: 'subscriptions', label: 'Subscriptions' },
    { id: 'support', label: 'Support Desk' },
    { id: 'marketing', label: 'Marketing' },
    { id: 'mrp', label: 'Manufacturing' },
    { id: 'operations', label: 'Maintenance · Fleet · Logistics' },
  ];
  return (
    <section className="panel" aria-label="Operations Suite">
      <h2>Extended Operations Suite (Phases 4–10)</h2>
      <p>
        Unified AfriCore operational apps covering POS cash control &amp; loyalty, CRM lead scoring,
        Work milestones, Payroll runs, Subscriptions, Support SLA, Marketing, Manufacturing MRP,
        Maintenance, Fleet, and Logistics.
      </p>
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}
      <div className="form-actions" role="tablist" aria-label="Suite apps">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'button' : 'secondary-button'}
            onClick={() => {
              setTab(item.id);
              setNotice('');
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'pos' && <PosExpansion api={api} writable={writable} onNotify={setNotice} />}
      {tab === 'crm' && <CrmExpansion api={api} writable={writable} onNotify={setNotice} />}
      {tab === 'work' && <WorkExpansion api={api} writable={writable} onNotify={setNotice} />}
      {tab === 'people' && (
        <PeopleExpansionPanel api={api} financeWritable={financeWritable} onNotify={setNotice} />
      )}
      {tab === 'subscriptions' && (
        <SubscriptionsExpansion api={api} writable={writable} onNotify={setNotice} />
      )}
      {tab === 'support' && <SupportExpansion api={api} writable={writable} onNotify={setNotice} />}
      {tab === 'marketing' && (
        <MarketingExpansion api={api} writable={writable} onNotify={setNotice} />
      )}
      {tab === 'mrp' && <MrpExpansion api={api} writable={writable} onNotify={setNotice} />}
      {tab === 'operations' && (
        <OperationsExpansion api={api} writable={writable} onNotify={setNotice} />
      )}
      <SuiteParityToolsPanel api={api} writable={writable} />
    </section>
  );
}
