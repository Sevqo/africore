import { useEffect, useState, type ReactNode } from 'react';
import { Field as BaseField, Form as BaseForm, money, today, type API } from '../operations/UI';
import { AppControlPanel, KpiStrip } from './MinimalAppChrome';

type Props = {
  appId: string;
  section: string;
  api: API;
  scope: string;
  writable: boolean;
};

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

function SelectField({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <BaseField label={label}>
      <select name={name} defaultValue={defaultValue || options[0]?.value}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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

function useAppData(api: API, path: string, rev: number): { data?: any; error?: string } {
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

export function ExtendedAppWorkspace({ appId, api, writable }: Props) {
  const [rev, setRev] = useState(0);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('list');
  const [selectedStudioApp, setSelectedStudioApp] = useState('');
  const refresh = (msg: string) => {
    setRev((n) => n + 1);
    setNotice(msg);
  };
  const matches = (text: string) =>
    !query.trim() || text.toLowerCase().includes(query.trim().toLowerCase());

  const campaigns = useAppData(api, appId === 'marketing' ? '/marketing/campaigns' : '', rev);
  const tickets = useAppData(api, appId === 'support' ? '/support/tickets' : '', rev);
  const kb = useAppData(api, appId === 'support' ? '/support/kb-articles' : '', rev);
  const sla = useAppData(api, appId === 'support' ? '/support/sla-report' : '', rev);
  const plans = useAppData(api, appId === 'subscriptions' ? '/subscriptions/plans' : '', rev);
  const contracts = useAppData(api, appId === 'subscriptions' ? '/subscriptions/contracts' : '', rev);
  const mrr = useAppData(api, appId === 'subscriptions' ? '/subscriptions/mrr-report' : '', rev);
  const boms = useAppData(api, appId === 'manufacturing' ? '/mrp/boms' : '', rev);
  const mos = useAppData(api, appId === 'manufacturing' ? '/mrp/orders' : '', rev);
  const qcs = useAppData(api, appId === 'manufacturing' ? '/mrp/quality-checks' : '', rev);
  const dispatches = useAppData(api, appId === 'field_operations' ? '/field-ops/dispatches' : '', rev);
  const maint = useAppData(api, appId === 'field_operations' ? '/maintenance/requests' : '', rev);
  const fleet = useAppData(api, appId === 'field_operations' ? '/fleet/vehicles' : '', rev);
  const shipments = useAppData(api, appId === 'logistics' ? '/logistics/shipments' : '', rev);
  const units = useAppData(api, appId === 'property_hospitality' ? '/property/units' : '', rev);
  const leases = useAppData(api, appId === 'property_hospitality' ? '/property/leases' : '', rev);
  const reservations = useAppData(api, appId === 'property_hospitality' ? '/property/reservations' : '', rev);
  const articles = useAppData(api, appId === 'knowledge_learning' ? '/learning/articles' : '', rev);
  const courses = useAppData(api, appId === 'knowledge_learning' ? '/learning/courses' : '', rev);
  const enrollments = useAppData(api, appId === 'knowledge_learning' ? '/learning/enrollments' : '', rev);
  const studioApps = useAppData(api, appId === 'studio' ? '/studio/apps' : '', rev);
  const studioRecords = useAppData(
    api,
    appId === 'studio' && selectedStudioApp ? `/studio/apps/${selectedStudioApp}/records` : '',
    rev,
  );
  const topology = useAppData(api, appId === 'integrations_hub' ? '/integrations-hub/topology' : '', rev);
  const connectors = useAppData(api, appId === 'integrations_hub' ? '/integrations-hub/connectors' : '', rev);
  const pipelines = useAppData(api, appId === 'integrations_hub' ? '/integrations-hub/pipelines' : '', rev);
  const events = useAppData(api, appId === 'integrations_hub' ? '/integrations-hub/events' : '', rev);

  const primaryMrr = mrr.data?.totals_by_currency
    ? (Object.entries(mrr.data.totals_by_currency)[0] as [string, any] | undefined)
    : undefined;

  return (
    <div className="stack">
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}

      {appId === 'marketing' && (
        <>
          <AppControlPanel
            parent="AfriCore Marketing"
            title="Campaigns & Lead Attribution"
            facet="Channel: All"
            search={query}
            onSearch={setQuery}
            pipeline={[
              { label: 'Draft', state: 'done' },
              { label: 'Scheduled', state: 'active' },
              { label: 'Sent', state: 'pending' },
              { label: 'CRM Lead', state: 'pending' },
            ]}
          />
          <KpiStrip
            items={[
              { label: 'Campaigns', value: (campaigns.data?.data || []).length, delta: 'CRM linked' },
              {
                label: 'Active / Sent',
                value: (campaigns.data?.data || []).filter((c: any) => c.status === 'sent').length,
              },
              { label: 'Connected Destination', value: 'CRM', delta: '1-click capture' },
            ]}
          />
          <div className="ac-split-grid">
            <section className="panel">
              <h3>Campaign Register</h3>
              <div className="ac-record-list">
                {(campaigns.data?.data || [])
                  .filter((c: any) => matches(`${c.name} ${c.channel} ${c.audience_segment}`))
                  .map((c: any) => (
                    <div className="ac-record-row" key={c.id}>
                      <div className="ac-record-main">
                        <span className="ac-record-title">{c.name}</span>
                        <span className="ac-record-meta">
                          {c.channel.toUpperCase()} · {c.audience_segment} · {c.scheduled_on}
                        </span>
                      </div>
                      <div className="ac-record-actions">
                        <span className="badge">{c.status}</span>
                        {writable && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={async () => {
                              await api(`/marketing/campaigns/${c.id}/capture-lead`, 'POST', {
                                lead_name: `Prospect from ${c.name}`,
                                due_on: today(),
                              });
                              refresh('Lead captured directly into CRM scheduled activities.');
                            }}
                          >
                            Capture Lead → CRM
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
            {writable && (
              <section className="panel">
                <h3>New Campaign</h3>
                <Form
                  label="Create campaign"
                  submit={async (d) => {
                    await api('/marketing/campaigns', 'POST', {
                      name: d.name,
                      channel: d.channel,
                      audience_segment: d.segment,
                      scheduled_on: d.scheduled_on,
                      subject_line: d.subject_line,
                    });
                    refresh('Campaign created.');
                  }}
                >
                  <Field name="name" label="Campaign name" defaultValue="Q4 Growth Launch" required />
                  <SelectField
                    name="channel"
                    label="Channel"
                    options={[
                      { value: 'email', label: 'Email' },
                      { value: 'sms', label: 'SMS' },
                      { value: 'social', label: 'Social Media' },
                      { value: 'event', label: 'Marketing Event' },
                    ]}
                  />
                  <Field name="segment" label="Audience segment" defaultValue="All Active Buyers" required />
                  <Field name="scheduled_on" label="Scheduled date" type="date" defaultValue={today()} required />
                  <Field name="subject_line" label="Subject / Headline" defaultValue="New AfriCore Release" required />
                </Form>
              </section>
            )}
          </div>
        </>
      )}

      {appId === 'support' && (
        <>
          <AppControlPanel
            parent="AfriCore Support"
            title="Helpdesk Tickets & Knowledge Base"
            facet="SLA Active"
            search={query}
            onSearch={setQuery}
            views={[
              { id: 'list', label: 'Tickets' },
              { id: 'kb', label: 'Knowledge Base' },
            ]}
            activeView={view}
            onViewChange={setView}
          />
          <KpiStrip
            items={[
              { label: 'Total Tickets', value: sla.data?.total ?? 0 },
              { label: 'Open Queue', value: sla.data?.open ?? 0, tone: 'warn' },
              { label: 'Solved / Closed', value: sla.data?.solved_or_closed ?? 0, delta: 'On SLA' },
              {
                label: 'Overdue SLA',
                value: sla.data?.overdue_sla ?? 0,
                tone: (sla.data?.overdue_sla ?? 0) > 0 ? 'down' : 'up',
              },
              { label: 'KB Articles', value: (kb.data?.data || []).length },
            ]}
          />
          {view !== 'kb' ? (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Support Queue</h3>
                <div className="ac-record-list">
                  {(tickets.data?.data || [])
                    .filter((t: any) => matches(`${t.subject} ${t.customer_name} ${t.priority}`))
                    .map((t: any) => (
                      <div className="ac-record-row" key={t.id}>
                        <div className="ac-record-main">
                          <span className="ac-record-title">{t.subject}</span>
                          <span className="ac-record-meta">
                            {t.customer_name} · Priority: {t.priority} · SLA due {t.sla_due_on}
                          </span>
                        </div>
                        <div className="ac-record-actions">
                          <span className="badge">{t.status}</span>
                          {writable && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={async () => {
                                await api(`/support/tickets/${t.id}/escalate`, 'POST', {
                                  target: 'field_operations',
                                  scheduled_on: today(),
                                  assignee: 'Field Technician',
                                });
                                refresh('Escalated ticket to Field Operations dispatch.');
                              }}
                            >
                              Escalate → Field Ops
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </section>
              {writable && (
                <section className="panel">
                  <h3>Open Ticket</h3>
                  <Form
                    label="Create ticket"
                    submit={async (d) => {
                      await api('/support/tickets', 'POST', {
                        subject: d.subject,
                        customer_name: d.customer,
                        priority: d.priority,
                        sla_due_on: d.sla_due_on,
                        description: d.description || '',
                      });
                      refresh('Support ticket created.');
                    }}
                  >
                    <Field name="subject" label="Subject" defaultValue="POS printer setup request" required />
                    <Field name="customer" label="Customer" defaultValue="Savannah Retail" required />
                    <SelectField
                      name="priority"
                      label="Priority"
                      options={[
                        { value: 'normal', label: 'Normal' },
                        { value: 'high', label: 'High' },
                        { value: 'urgent', label: 'Urgent' },
                        { value: 'low', label: 'Low' },
                      ]}
                    />
                    <Field name="sla_due_on" label="SLA due date" type="date" defaultValue={today()} required />
                    <Field name="description" label="Description" defaultValue="Needs on-site setup" />
                  </Form>
                </section>
              )}
            </div>
          ) : (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Published Knowledge Base</h3>
                <div className="ac-record-list">
                  {(kb.data?.data || [])
                    .filter((a: any) => matches(`${a.title} ${a.category}`))
                    .map((a: any) => (
                      <div className="ac-record-row" key={a.id}>
                        <div className="ac-record-main">
                          <span className="ac-record-title">{a.title}</span>
                          <span className="ac-record-meta">{a.category}</span>
                        </div>
                        <span className="badge">{a.status}</span>
                      </div>
                    ))}
                </div>
              </section>
              {writable && (
                <section className="panel">
                  <h3>Publish KB Article</h3>
                  <Form
                    label="Publish KB article"
                    submit={async (d) => {
                      await api('/support/kb-articles', 'POST', {
                        title: d.title,
                        category: d.category,
                        body: d.body,
                        published: true,
                      });
                      refresh('Knowledge base article published.');
                    }}
                  >
                    <Field name="title" label="Title" defaultValue="How to reconcile mobile money receipts" required />
                    <Field name="category" label="Category" defaultValue="Billing" required />
                    <Field name="body" label="Article content" defaultValue="Open Accounting -> Bank Reconciliation..." required />
                  </Form>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {appId === 'subscriptions' && (
        <>
          <AppControlPanel
            parent="AfriCore Subscriptions"
            title="Recurring Contracts & MRR"
            facet="Auto-Invoice"
            search={query}
            onSearch={setQuery}
            pipeline={[
              { label: 'Plan', state: 'done' },
              { label: 'Active Contract', state: 'active' },
              { label: 'Auto-Invoice', state: 'pending' },
            ]}
          />
          <KpiStrip
            items={[
              {
                label: 'Monthly Recurring Revenue',
                value: primaryMrr ? money(primaryMrr[1].mrr_minor, primaryMrr[0]) : money(0, 'KES'),
                delta: 'Verified',
              },
              {
                label: 'Annual Run Rate (ARR)',
                value: primaryMrr ? money(primaryMrr[1].arr_minor, primaryMrr[0]) : money(0, 'KES'),
              },
              { label: 'Active Plans', value: (plans.data?.data || []).length },
              { label: 'Contracts', value: (contracts.data?.data || []).length },
            ]}
          />
          <div className="ac-split-grid">
            <section className="panel">
              <h3>Subscription Contracts</h3>
              <div className="ac-record-list">
                {(contracts.data?.data || [])
                  .filter((c: any) => matches(`${c.customer_name} ${c.plan_name}`))
                  .map((c: any) => (
                    <div className="ac-record-row" key={c.id}>
                      <div className="ac-record-main">
                        <span className="ac-record-title">{c.customer_name}</span>
                        <span className="ac-record-meta">
                          {c.plan_name} · Next billing: {c.next_invoice_on}
                        </span>
                      </div>
                      <div className="ac-record-actions">
                        <span className="badge">{c.status}</span>
                        {writable && c.status === 'active' && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={async () => {
                              const res = await api(`/subscriptions/contracts/${c.id}/bill`, 'POST', {
                                expected_version: c.version,
                                issue_date: today(),
                              });
                              refresh(`Auto-created canonical invoice ${res.invoice?.reference || ''} in Accounting.`);
                            }}
                          >
                            Auto-Bill → Invoice
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
            {writable && (
              <section className="panel">
                <h3>New Subscription Plan</h3>
                <Form
                  label="Create plan"
                  submit={async (d) => {
                    await api('/subscriptions/plans', 'POST', {
                      code: d.code,
                      name: d.name,
                      currency: d.currency || 'KES',
                      interval: d.interval,
                      price_minor: Math.round(Number(d.price || 0) * 100),
                      trial_days: Number(d.trial_days || 0),
                    });
                    refresh('Subscription plan created.');
                  }}
                >
                  <Field name="code" label="Plan code" defaultValue="PRO-MO" required />
                  <Field name="name" label="Plan name" defaultValue="Pro Monthly" required />
                  <SelectField
                    name="interval"
                    label="Billing interval"
                    options={[
                      { value: 'monthly', label: 'Monthly' },
                      { value: 'quarterly', label: 'Quarterly' },
                      { value: 'annual', label: 'Annual' },
                    ]}
                  />
                  <Field name="price" label="Price" type="number" defaultValue="15000" required />
                  <Field name="currency" label="Currency" defaultValue="KES" required />
                </Form>
              </section>
            )}
          </div>
        </>
      )}

      {appId === 'manufacturing' && (
        <>
          <AppControlPanel
            parent="AfriCore Manufacturing"
            title="Bills of Materials, Production & Quality"
            facet="Inventory Sync"
            search={query}
            onSearch={setQuery}
            pipeline={[
              { label: 'BOM Costing', state: 'done' },
              { label: 'Production', state: 'active' },
              { label: 'Quality Check', state: 'pending' },
              { label: 'Stock Receipt', state: 'pending' },
            ]}
          />
          <KpiStrip
            items={[
              { label: 'Active BOMs', value: (boms.data?.data || []).length },
              { label: 'Manufacturing Orders', value: (mos.data?.data || []).length },
              { label: 'Quality Checks', value: (qcs.data?.data || []).length, delta: 'Auto-lot receipt' },
            ]}
          />
          <section className="panel">
            <h3>Manufacturing Orders</h3>
            <div className="ac-record-list">
              {(mos.data?.data || [])
                .filter((mo: any) => matches(`${mo.reference} ${mo.finished_product_name}`))
                .map((mo: any) => (
                  <div className="ac-record-row" key={mo.id}>
                    <div className="ac-record-main">
                      <span className="ac-record-title">
                        {mo.reference} · {mo.finished_product_name}
                      </span>
                      <span className="ac-record-meta">
                        Qty: {(mo.produce_quantity_milli || 0) / 1000} · Scheduled {mo.scheduled_on}
                      </span>
                    </div>
                    <div className="ac-record-actions">
                      <span className="badge">{mo.status}</span>
                      {writable && mo.status !== 'done' && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={async () => {
                            await api(`/mrp/orders/${mo.id}/complete`, 'POST', {
                              expected_version: mo.version,
                              quality_passed: true,
                            });
                            refresh('Completed MO: passed Quality Check and auto-received finished goods into Inventory.');
                          }}
                        >
                          Pass QC &amp; Receive → Inventory
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {appId === 'field_operations' && (
        <>
          <AppControlPanel
            parent="AfriCore Field Operations"
            title="Dispatches, Maintenance & Fleet"
            facet="Active Crew"
            search={query}
            onSearch={setQuery}
          />
          <KpiStrip
            items={[
              { label: 'Field Dispatches', value: (dispatches.data?.data || []).length },
              { label: 'Maintenance Requests', value: (maint.data?.data || []).length },
              { label: 'Fleet Vehicles', value: (fleet.data?.data || []).length },
            ]}
          />
          <div className="ac-split-grid">
            <section className="panel">
              <h3>Scheduled Field Dispatches</h3>
              <div className="ac-record-list">
                {(dispatches.data?.data || [])
                  .filter((d: any) => matches(`${d.title} ${d.customer_name} ${d.technician}`))
                  .map((d: any) => (
                    <div className="ac-record-row" key={d.id}>
                      <div className="ac-record-main">
                        <span className="ac-record-title">{d.title}</span>
                        <span className="ac-record-meta">
                          {d.customer_name} · Tech: {d.technician} · {d.scheduled_on}
                        </span>
                      </div>
                      <span className="badge">{d.status}</span>
                    </div>
                  ))}
              </div>
            </section>
            {writable && (
              <section className="panel">
                <h3>Schedule Dispatch / Rental</h3>
                <Form
                  label="Schedule dispatch"
                  submit={async (d) => {
                    await api('/field-ops/dispatches', 'POST', {
                      title: d.title,
                      customer_name: d.customer,
                      kind: d.kind,
                      technician: d.technician,
                      scheduled_on: d.scheduled_on,
                    });
                    refresh('Field dispatch scheduled.');
                  }}
                >
                  <Field name="title" label="Job title" defaultValue="Solar inverter inspection" required />
                  <Field name="customer" label="Customer" defaultValue="Kibo Farms" required />
                  <SelectField
                    name="kind"
                    label="Type"
                    options={[
                      { value: 'field_service', label: 'Field Service' },
                      { value: 'equipment_rental', label: 'Equipment Rental' },
                    ]}
                  />
                  <Field name="technician" label="Technician" defaultValue="Peter Mwangi" required />
                  <Field name="scheduled_on" label="Scheduled date" type="date" defaultValue={today()} required />
                </Form>
              </section>
            )}
          </div>
        </>
      )}

      {appId === 'logistics' && (
        <>
          <AppControlPanel
            parent="AfriCore Logistics"
            title="Shipments & Proof of Delivery (POD)"
            facet="Sales Linked"
            search={query}
            onSearch={setQuery}
            pipeline={[
              { label: 'Booked', state: 'done' },
              { label: 'In Transit', state: 'active' },
              { label: 'Delivered (POD)', state: 'pending' },
            ]}
          />
          <KpiStrip
            items={[
              { label: 'Total Shipments', value: (shipments.data?.data || []).length },
              {
                label: 'Delivered (POD)',
                value: (shipments.data?.data || []).filter((s: any) => s.status === 'delivered').length,
                delta: 'Signed POD',
              },
            ]}
          />
          <section className="panel">
            <h3>Active Dispatch Board</h3>
            <div className="ac-record-list">
              {(shipments.data?.data || [])
                .filter((s: any) => matches(`${s.tracking_number} ${s.carrier_name} ${s.destination}`))
                .map((s: any) => (
                  <div className="ac-record-row" key={s.id}>
                    <div className="ac-record-main">
                      <span className="ac-record-title">{s.tracking_number}</span>
                      <span className="ac-record-meta">
                        {s.carrier_name} → {s.destination} · ETA {s.estimated_arrival_on}
                      </span>
                    </div>
                    <div className="ac-record-actions">
                      <span className="badge">{s.status}</span>
                      {writable && s.status !== 'delivered' && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={async () => {
                            await api(`/logistics/shipments/${s.id}/pod`, 'POST', {
                              expected_version: s.version,
                              received_by: 'Receiving Clerk',
                              delivered_on: today(),
                            });
                            refresh('Signed Proof of Delivery recorded and synced to Sales.');
                          }}
                        >
                          Capture POD
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {appId === 'property_hospitality' && (
        <>
          <AppControlPanel
            parent="AfriCore Property & Hospitality"
            title="Units, Leases & Hospitality Folios"
            facet="Auto-Invoice"
            search={query}
            onSearch={setQuery}
          />
          <KpiStrip
            items={[
              { label: 'Units / Rooms', value: (units.data?.data || []).length },
              { label: 'Active Leases', value: (leases.data?.data || []).length },
              { label: 'Reservations', value: (reservations.data?.data || []).length, delta: 'Folio linked' },
            ]}
          />
          <div className="ac-split-grid">
            <section className="panel">
              <h3>Active Leases</h3>
              <div className="ac-record-list">
                {(leases.data?.data || [])
                  .filter((l: any) => matches(`${l.unit_code} ${l.tenant_name}`))
                  .map((l: any) => (
                    <div className="ac-record-row" key={l.id}>
                      <div className="ac-record-main">
                        <span className="ac-record-title">
                          {l.unit_code} · {l.tenant_name}
                        </span>
                        <span className="ac-record-meta">
                          {money(l.monthly_rent_minor, l.currency)} / month
                        </span>
                      </div>
                      {writable && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={async () => {
                            await api(`/property/leases/${l.id}/bill`, 'POST', {
                              billing_month: today().slice(0, 7),
                              issue_date: today(),
                            });
                            refresh('Rent invoice auto-created in Accounting.');
                          }}
                        >
                          Auto-Bill Rent → Invoice
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </section>
            {writable && (
              <section className="panel">
                <h3>Register Unit / Room</h3>
                <Form
                  label="Add unit / room"
                  submit={async (d) => {
                    await api('/property/units', 'POST', {
                      code: d.code,
                      name: d.name,
                      unit_type: d.unit_type,
                      currency: d.currency || 'KES',
                      rate_minor: Math.round(Number(d.rate || 0) * 100),
                      rate_period: d.rate_period,
                    });
                    refresh('Property unit registered.');
                  }}
                >
                  <Field name="code" label="Unit code" defaultValue="APT-4B" required />
                  <Field name="name" label="Unit name" defaultValue="Westlands Suite 4B" required />
                  <SelectField
                    name="unit_type"
                    label="Unit type"
                    options={[
                      { value: 'apartment', label: 'Apartment' },
                      { value: 'commercial', label: 'Commercial Office' },
                      { value: 'hotel_room', label: 'Hotel Room' },
                      { value: 'villa', label: 'Villa' },
                      { value: 'conference_hall', label: 'Conference Hall' },
                    ]}
                  />
                  <SelectField
                    name="rate_period"
                    label="Rate period"
                    options={[
                      { value: 'month', label: 'Per Month' },
                      { value: 'night', label: 'Per Night' },
                    ]}
                  />
                  <Field name="rate" label="Rate" type="number" defaultValue="85000" required />
                  <Field name="currency" label="Currency" defaultValue="KES" required />
                </Form>
              </section>
            )}
          </div>
        </>
      )}

      {appId === 'knowledge_learning' && (
        <>
          <AppControlPanel
            parent="AfriCore Knowledge & Learning"
            title="Company Wiki, Courses & Assessments"
            facet="Auto-Graded"
            search={query}
            onSearch={setQuery}
          />
          <KpiStrip
            items={[
              { label: 'Wiki Articles', value: (articles.data?.data || []).length },
              { label: 'Training Courses', value: (courses.data?.data || []).length },
              { label: 'Enrollments', value: (enrollments.data?.data || []).length },
            ]}
          />
          <div className="ac-split-grid">
            <section className="panel">
              <h3>Course Catalog</h3>
              <div className="ac-record-list">
                {(courses.data?.data || [])
                  .filter((c: any) => matches(`${c.code} ${c.title} ${c.department}`))
                  .map((c: any) => (
                    <div className="ac-record-row" key={c.id}>
                      <div className="ac-record-main">
                        <span className="ac-record-title">
                          {c.code} · {c.title}
                        </span>
                        <span className="ac-record-meta">
                          {c.department} · Pass {c.passing_score_pct}% · {c.duration_minutes} mins
                        </span>
                      </div>
                      <span className="badge">{c.status}</span>
                    </div>
                  ))}
              </div>
            </section>
            {writable && (
              <section className="panel">
                <h3>New Training Course</h3>
                <Form
                  label="Create training course"
                  submit={async (d) => {
                    await api('/learning/courses', 'POST', {
                      code: d.code,
                      title: d.title,
                      department: d.department,
                      passing_score_pct: Number(d.passing || 75),
                      duration_minutes: Number(d.duration || 45),
                    });
                    refresh('Training course created.');
                  }}
                >
                  <Field name="code" label="Course code" defaultValue="COMP-101" required />
                  <Field name="title" label="Course title" defaultValue="Financial Controls & Audit Readiness" required />
                  <Field name="department" label="Department" defaultValue="Finance & Operations" required />
                  <Field name="passing" label="Passing score (%)" type="number" defaultValue="75" required />
                  <Field name="duration" label="Duration (minutes)" type="number" defaultValue="45" required />
                </Form>
              </section>
            )}
          </div>
        </>
      )}

      {appId === 'studio' && (
        <>
          <AppControlPanel
            parent="AfriCore Studio"
            title="No-Code Custom App Builder"
            facet="Typed Schema"
            search={query}
            onSearch={setQuery}
          />
          <KpiStrip
            items={[
              { label: 'Published Custom Apps', value: (studioApps.data?.data || []).length },
              {
                label: 'Selected App Records',
                value: studioRecords.data ? (studioRecords.data.data || []).length : '—',
              },
            ]}
          />
          <div className="ac-split-grid">
            <section className="panel">
              <h3>Custom Workspace Apps</h3>
              <div className="ac-record-list">
                {(studioApps.data?.data || [])
                  .filter((a: any) => matches(`${a.name} ${a.slug}`))
                  .map((a: any) => (
                    <div className="ac-record-row" key={a.id}>
                      <div className="ac-record-main">
                        <span className="ac-record-title">{a.name}</span>
                        <span className="ac-record-meta">
                          <code>{a.slug}</code> · View: {a.default_view}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setSelectedStudioApp(a.id)}
                      >
                        Open records
                      </button>
                    </div>
                  ))}
              </div>
            </section>
            {writable && (
              <section className="panel">
                <h3>Build New App</h3>
                <Form
                  label="Create custom app"
                  submit={async (d) => {
                    const created = await api('/studio/apps', 'POST', {
                      slug: d.slug,
                      name: d.name,
                      default_view: d.view,
                      fields: [
                        { key: 'title', label: 'Title', type: 'text', required: true },
                        { key: 'owner', label: 'Owner', type: 'text', required: false },
                      ],
                    });
                    setSelectedStudioApp(created.id);
                    refresh(`Custom Studio app "${d.name}" published.`);
                  }}
                >
                  <Field name="slug" label="App slug" defaultValue="vendor_audits" required />
                  <Field name="name" label="App name" defaultValue="Vendor Compliance Audits" required />
                  <SelectField
                    name="view"
                    label="Default view"
                    options={[
                      { value: 'table', label: 'Database Table' },
                      { value: 'kanban', label: 'Kanban Board' },
                      { value: 'form', label: 'Custom Form' },
                    ]}
                  />
                </Form>
              </section>
            )}
          </div>
        </>
      )}

      {appId === 'integrations_hub' && (
        <>
          <AppControlPanel
            parent="AfriCore Integrations Hub"
            title="26-App Connected Orchestration & Event Bus"
            facet="Live Bus"
            search={query}
            onSearch={setQuery}
          />
          <KpiStrip
            items={[
              { label: 'Connected Apps', value: topology.data?.total_apps ?? 26, delta: 'Unified' },
              { label: 'Connectors', value: (connectors.data?.data || []).length },
              { label: 'Data Pipelines', value: (pipelines.data?.data || []).length },
              { label: 'Events Delivered', value: topology.data?.events_delivered ?? 0, delta: 'Real-time' },
            ]}
          />
          <div className="ac-split-grid">
            <section className="panel">
              <h3>Live Cross-App Event Bus</h3>
              <div className="ac-record-list">
                {(events.data?.data || [])
                  .filter((e: any) => matches(`${e.source_app} ${e.target_app} ${e.summary}`))
                  .slice(0, 15)
                  .map((e: any) => (
                    <div className="ac-record-row" key={e.id}>
                      <div className="ac-record-main">
                        <span className="ac-record-title">
                          {e.source_app} → {e.target_app}
                        </span>
                        <span className="ac-record-meta">{e.summary}</span>
                      </div>
                      <span className="badge">{e.event_type}</span>
                    </div>
                  ))}
              </div>
            </section>
            {writable && (
              <section className="panel">
                <h3>1-Click Connected Sale (Zero Double Entry)</h3>
                <Form
                  label="Complete Connected Sale"
                  submit={async (d) => {
                    const res = await api('/connections/sales/complete-sale', 'POST', {
                      reference: d.reference,
                      customer_name: d.customer,
                      currency: 'KES',
                      issue_date: today(),
                      due_date: today(),
                      destination: d.destination,
                      items: [
                        {
                          sku: d.sku,
                          description: d.description,
                          quantity: Number(d.qty || 1),
                          unit_price_minor: Math.round(Number(d.price || 1000) * 100),
                        },
                      ],
                    });
                    refresh(
                      `Connected sale complete: Order ${res.order?.reference}, Invoice ${res.invoice?.reference}, Inventory deducted, Shipment ${res.shipment?.tracking_number} booked.`,
                    );
                  }}
                >
                  <Field name="reference" label="Sale reference" defaultValue="SO-AUTO-001" required />
                  <Field name="customer" label="Customer name" defaultValue="Nairobi Distributors" required />
                  <Field name="destination" label="Delivery destination" defaultValue="Industrial Area, Nairobi" required />
                  <Field name="sku" label="Product SKU" defaultValue="SKU-100" required />
                  <Field name="description" label="Item description" defaultValue="Solar Inverter 5kW" required />
                  <Field name="qty" label="Quantity" type="number" defaultValue="2" required />
                  <Field name="price" label="Unit price" type="number" defaultValue="45000" required />
                </Form>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
