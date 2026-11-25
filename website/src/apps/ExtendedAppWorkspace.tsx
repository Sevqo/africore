import { useEffect, useState, type ReactNode } from 'react';
import { BarChart } from '../charts/BarChart';
import { DonutChart } from '../charts/DonutChart';
import { WorkspaceSkeleton } from '../components/Skeleton';
import { isDemo } from '../demo/transport';
import { peekQuery } from '../lib/query-cache';
import { Field as BaseField, Form as BaseForm, money, today, type API } from '../operations/UI';
import { AppControlPanel, KpiStrip } from './MinimalAppChrome';
import { appNavigationEvent } from './AppNavigation';

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

function useAppData(
  api: API,
  scope: string,
  path: string,
  rev: number,
): { data?: any; error?: string; loading: boolean } {
  const [orgId = '', env = 'sandbox'] = scope.split('\0');
  const fullUrl = orgId && path ? `/api/v1/organizations/${orgId}${path}` : '';
  const warm = fullUrl ? peekQuery<any>(fullUrl, env, isDemo()) : undefined;
  const [state, setState] = useState<{ path: string; data?: any; error?: string; loading: boolean }>(
    () => ({
      path,
      data: warm,
      loading: !!path && warm === undefined,
    }),
  );

  useEffect(() => {
    if (!path) {
      setState({ path: '', loading: false });
      return;
    }
    let live = true;
    const cached = fullUrl ? peekQuery<any>(fullUrl, env, isDemo()) : undefined;
    if (cached !== undefined) {
      setState((prev) => ({ path, data: cached, error: prev.error, loading: false }));
    } else {
      setState((prev) =>
        prev.path === path && prev.data !== undefined
          ? { ...prev, loading: false }
          : { path, loading: true },
      );
    }
    api(path).then(
      (data) => {
        if (live) setState({ path, data, loading: false });
      },
      (error) => {
        if (live) setState({ path, error: error.message, loading: false });
      },
    );
    return () => {
      live = false;
    };
  }, [api, scope, path, rev]);

  if (!path) return { loading: false };
  return state.path === path ? state : { data: warm, loading: warm === undefined };
}

function goSection(appId: string, targetSection: string) {
  const url = new URL(location.href);
  url.searchParams.set('app', appId);
  url.searchParams.set('section', targetSection);
  url.hash = 'Apps';
  history.pushState(null, '', url.pathname + url.search + url.hash);
  dispatchEvent(new Event(appNavigationEvent));
}

export function ExtendedAppWorkspace({ appId, section, api, scope, writable }: Props) {
  const [rev, setRev] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedKbId, setSelectedKbId] = useState('');
  const [selectedWikiId, setSelectedWikiId] = useState('');
  const [selectedStudioApp, setSelectedStudioApp] = useState('');
  const [expandedBomId, setExpandedBomId] = useState('');
  const [studioFields, setStudioFields] = useState<
    { key: string; label: string; type: 'text' | 'number' | 'date' | 'select' | 'currency'; required: boolean }[]
  >([
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'owner', label: 'Owner', type: 'text', required: false },
    { key: 'target_date', label: 'Target Date', type: 'date', required: false },
  ]);

  const refresh = (msg: string) => {
    setError('');
    setRev((n) => n + 1);
    setNotice(msg);
  };
  const matches = (text: string) =>
    !query.trim() || text.toLowerCase().includes(query.trim().toLowerCase());

  const campaigns = useAppData(api, scope, appId === 'marketing' ? '/marketing/campaigns' : '', rev);
  const crmLeads = useAppData(
    api,
    scope,
    appId === 'marketing' ? '/crm/scheduled-activities' : '',
    rev,
  );
  const tickets = useAppData(api, scope, appId === 'support' ? '/support/tickets' : '', rev);
  const kb = useAppData(api, scope, appId === 'support' ? '/support/kb-articles' : '', rev);
  const sla = useAppData(api, scope, appId === 'support' ? '/support/sla-report' : '', rev);
  const plans = useAppData(api, scope, appId === 'subscriptions' ? '/subscriptions/plans' : '', rev);
  const contracts = useAppData(
    api,
    scope,
    appId === 'subscriptions' ? '/subscriptions/contracts' : '',
    rev,
  );
  const mrr = useAppData(
    api,
    scope,
    appId === 'subscriptions' ? '/subscriptions/mrr-report' : '',
    rev,
  );
  const boms = useAppData(api, scope, appId === 'manufacturing' ? '/mrp/boms' : '', rev);
  const mos = useAppData(api, scope, appId === 'manufacturing' ? '/mrp/orders' : '', rev);
  const qcs = useAppData(api, scope, appId === 'manufacturing' ? '/mrp/quality-checks' : '', rev);
  const dispatches = useAppData(
    api,
    scope,
    appId === 'field_operations' ? '/field-ops/dispatches' : '',
    rev,
  );
  const maint = useAppData(
    api,
    scope,
    appId === 'field_operations' ? '/maintenance/requests' : '',
    rev,
  );
  const fleet = useAppData(
    api,
    scope,
    appId === 'field_operations' ? '/fleet/vehicles' : '',
    rev,
  );
  const shipments = useAppData(api, scope, appId === 'logistics' ? '/logistics/shipments' : '', rev);
  const units = useAppData(
    api,
    scope,
    appId === 'property_hospitality' ? '/property/units' : '',
    rev,
  );
  const leases = useAppData(
    api,
    scope,
    appId === 'property_hospitality' ? '/property/leases' : '',
    rev,
  );
  const reservations = useAppData(
    api,
    scope,
    appId === 'property_hospitality' ? '/property/reservations' : '',
    rev,
  );
  const articles = useAppData(
    api,
    scope,
    appId === 'knowledge_learning' ? '/learning/articles' : '',
    rev,
  );
  const courses = useAppData(
    api,
    scope,
    appId === 'knowledge_learning' ? '/learning/courses' : '',
    rev,
  );
  const enrollments = useAppData(
    api,
    scope,
    appId === 'knowledge_learning' ? '/learning/enrollments' : '',
    rev,
  );
  const studioApps = useAppData(api, scope, appId === 'studio' ? '/studio/apps' : '', rev);
  const activeStudioAppId = selectedStudioApp || studioApps.data?.data?.[0]?.id || '';
  const studioRecords = useAppData(
    api,
    scope,
    appId === 'studio' && activeStudioAppId ? `/studio/apps/${activeStudioAppId}/records` : '',
    rev,
  );
  const topology = useAppData(
    api,
    scope,
    appId === 'integrations_hub' ? '/integrations-hub/topology' : '',
    rev,
  );
  const connectors = useAppData(
    api,
    scope,
    appId === 'integrations_hub' ? '/integrations-hub/connectors' : '',
    rev,
  );
  const pipelines = useAppData(
    api,
    scope,
    appId === 'integrations_hub' ? '/integrations-hub/pipelines' : '',
    rev,
  );
  const events = useAppData(
    api,
    scope,
    appId === 'integrations_hub' ? '/integrations-hub/events' : '',
    rev,
  );

  const initialLoading =
    (appId === 'marketing' && campaigns.loading && !campaigns.data) ||
    (appId === 'support' && tickets.loading && !tickets.data) ||
    (appId === 'subscriptions' && contracts.loading && !contracts.data) ||
    (appId === 'manufacturing' && mos.loading && !mos.data) ||
    (appId === 'field_operations' && dispatches.loading && !dispatches.data) ||
    (appId === 'logistics' && shipments.loading && !shipments.data) ||
    (appId === 'property_hospitality' && units.loading && !units.data) ||
    (appId === 'knowledge_learning' && courses.loading && !courses.data) ||
    (appId === 'studio' && studioApps.loading && !studioApps.data) ||
    (appId === 'integrations_hub' && topology.loading && !topology.data);

  if (initialLoading) return <WorkspaceSkeleton />;

  const primaryMrr = mrr.data?.totals_by_currency
    ? (Object.entries(mrr.data.totals_by_currency)[0] as [string, any] | undefined)
    : undefined;

  return (
    <div className="stack">
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}

      {/* 17. MARKETING */}
      {appId === 'marketing' && (
        <>
          <AppControlPanel
            parent="AfriCore Marketing"
            title={section === 'leads' ? 'Campaign Lead Capture & CRM Attribution' : 'Omnichannel Campaign Studio'}
            facet={section === 'leads' ? 'CRM Sync' : 'Channels: Email · SMS · Social · Event'}
            search={query}
            onSearch={setQuery}
            views={[
              { id: 'campaigns', label: 'Campaigns' },
              { id: 'leads', label: 'Lead Capture' },
            ]}
            activeView={section === 'leads' ? 'leads' : 'campaigns'}
            onViewChange={(v) => goSection('marketing', v)}
            pipeline={[
              { label: 'Draft', state: 'done' },
              { label: 'Scheduled', state: section !== 'leads' ? 'active' : 'done' },
              { label: 'Delivered', state: 'pending' },
              { label: 'CRM Attributed', state: section === 'leads' ? 'active' : 'pending' },
            ]}
          />
          <KpiStrip
            items={[
              { label: 'Total Campaigns', value: (campaigns.data?.data || []).length, delta: 'Multi-channel' },
              {
                label: 'Active / Sent',
                value: (campaigns.data?.data || []).filter((c: any) => c.status === 'sent').length,
                tone: 'up',
              },
              {
                label: 'Observed Clicks',
                value: (campaigns.data?.data || []).reduce(
                  (s: number, c: any) => s + Number(c.observed_clicks || 0),
                  0,
                ),
              },
              {
                label: 'CRM Attributed Leads',
                value: (crmLeads.data?.data || []).filter((a: any) => a.source_campaign_id).length,
                delta: 'Zero double-entry',
              },
            ]}
          />

          {section === 'leads' ? (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Attributed Campaign Leads in CRM</h3>
                <p className="muted">
                  Leads captured from campaigns flow straight into CRM scheduled follow-ups.
                </p>
                <div className="ac-record-list">
                  {(crmLeads.data?.data || [])
                    .filter((l: any) => matches(`${l.summary} ${l.lead_ref} ${l.notes || ''}`))
                    .map((l: any) => (
                      <div className="ac-record-row" key={l.id}>
                        <div className="ac-record-main">
                          <span className="ac-record-title">{l.summary}</span>
                          <span className="ac-record-meta">
                            Ref: <code>{l.lead_ref}</code> · Due {l.due_on} · {l.notes || 'CRM follow-up'}
                          </span>
                        </div>
                        <span className="badge">{l.status}</span>
                      </div>
                    ))}
                  {!(crmLeads.data?.data || []).length && (
                    <p className="muted">No attributed leads yet. Capture a response from any campaign.</p>
                  )}
                </div>
              </section>
              {writable && (campaigns.data?.data || []).length > 0 && (
                <section className="panel">
                  <h3>Log Campaign Response → CRM</h3>
                  <Form
                    label="Capture lead into CRM"
                    submit={async (d) => {
                      await api(`/marketing/campaigns/${d.campaign_id}/capture-lead`, 'POST', {
                        lead_name: d.lead_name,
                        due_on: d.due_on,
                        notes: d.notes || '',
                      });
                      refresh('Lead attributed and scheduled in CRM.');
                    }}
                  >
                    <SelectField
                      name="campaign_id"
                      label="Source campaign"
                      options={(campaigns.data?.data || []).map((c: any) => ({
                        value: c.id,
                        label: `${c.name} (${c.channel.toUpperCase()})`,
                      }))}
                    />
                    <Field name="lead_name" label="Prospect / Company name" defaultValue="Rift Valley Retail" required />
                    <Field name="due_on" label="Follow-up date" type="date" defaultValue={today()} required />
                    <Field name="notes" label="Qualification notes" defaultValue="Requested product demo from campaign" />
                  </Form>
                </section>
              )}
            </div>
          ) : (
            <>
              {(campaigns.data?.data || []).length > 0 && (
                <section className="panel">
                  <BarChart
                    title="Campaign Volume by Channel"
                    subtitle="Active and draft workspace campaigns grouped by delivery channel"
                    rows={['email', 'sms', 'social', 'event'].map((ch) => ({
                      key: ch,
                      label: ch.toUpperCase(),
                      value: (campaigns.data?.data || []).filter((c: any) => c.channel === ch).length,
                    }))}
                    orientation="horizontal"
                    allowOrientationSwitch={false}
                  />
                </section>
              )}
              <div className="ac-split-grid">
                <section className="panel">
                  <h3>Campaign Cards &amp; Audience Segments</h3>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {(campaigns.data?.data || [])
                      .filter((c: any) => matches(`${c.name} ${c.channel} ${c.audience_segment}`))
                      .map((c: any) => (
                        <article
                          key={c.id}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            padding: '14px 16px',
                            background: '#fff',
                            display: 'grid',
                            gap: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <div>
                              <span
                                className="badge"
                                style={{ marginInlineEnd: '8px', textTransform: 'uppercase' }}
                              >
                                {c.channel}
                              </span>
                              <strong>{c.name}</strong>
                            </div>
                            <span className="badge">{c.status}</span>
                          </div>
                          <div style={{ fontSize: '13px', color: '#475569' }}>
                            Segment: <strong>{c.audience_segment}</strong> · Scheduled: {c.scheduled_on} · Headline:{' '}
                            <em>{c.subject_line}</em>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <small style={{ color: '#64748b' }}>
                              Delivered: {c.observed_delivered ?? 0} · Clicks: {c.observed_clicks ?? 0}
                            </small>
                            {writable && (
                              <div className="form-actions" style={{ margin: 0 }}>
                                {c.status === 'draft' && (
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={async () => {
                                      await api(`/marketing/campaigns/${c.id}`, 'PATCH', {
                                        expected_version: c.version,
                                        status: 'sent',
                                        observed_delivered: 250,
                                        observed_clicks: 42,
                                      });
                                      refresh(`Marked "${c.name}" as sent with delivery telemetry.`);
                                    }}
                                  >
                                    Mark Sent
                                  </button>
                                )}
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
                              </div>
                            )}
                          </div>
                        </article>
                      ))}
                    {!(campaigns.data?.data || []).length && (
                      <p className="muted">No campaigns launched yet. Create your first campaign on the right.</p>
                    )}
                  </div>
                </section>
                {writable && (
                  <section className="panel">
                    <h3>Launch New Campaign</h3>
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
                          { value: 'email', label: 'Email Broadcast' },
                          { value: 'sms', label: 'SMS / Mobile' },
                          { value: 'social', label: 'Social Campaign' },
                          { value: 'event', label: 'Live Event / Webinar' },
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
        </>
      )}

      {/* 18. SUPPORT */}
      {appId === 'support' && (
        <>
          <AppControlPanel
            parent="AfriCore Support"
            title={section === 'kb' ? 'Help Center & Knowledge Base' : 'SLA Triage Board & Helpdesk'}
            facet="SLA Monitored"
            search={query}
            onSearch={setQuery}
            views={[
              { id: 'tickets', label: 'Tickets & SLA' },
              { id: 'kb', label: 'Knowledge Base' },
            ]}
            activeView={section === 'kb' ? 'kb' : 'tickets'}
            onViewChange={(v) => goSection('support', v)}
          />
          <KpiStrip
            items={[
              { label: 'Total Tickets', value: sla.data?.total ?? 0 },
              { label: 'Open Triage', value: sla.data?.open ?? 0, tone: 'warn' },
              { label: 'Solved / Closed', value: sla.data?.solved_or_closed ?? 0, delta: 'On SLA', tone: 'up' },
              {
                label: 'Overdue SLA',
                value: sla.data?.overdue_sla ?? 0,
                tone: (sla.data?.overdue_sla ?? 0) > 0 ? 'down' : 'up',
              },
              { label: 'Published KB Articles', value: (kb.data?.data || []).length },
            ]}
          />

          {section !== 'kb' ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '14px',
                }}
                aria-label="Support Kanban lanes"
              >
                {[
                  {
                    lane: 'New & Open',
                    filter: (t: any) => ['new', 'open'].includes(t.status),
                    accent: '#f59e0b',
                  },
                  {
                    lane: 'In Progress / Escalated',
                    filter: (t: any) => ['in_progress', 'pending', 'escalated'].includes(t.status),
                    accent: '#0284c7',
                  },
                  {
                    lane: 'Solved & Closed',
                    filter: (t: any) => ['solved', 'closed'].includes(t.status),
                    accent: '#10b981',
                  },
                ].map((col) => {
                  const laneTickets = (tickets.data?.data || [])
                    .filter(col.filter)
                    .filter((t: any) => matches(`${t.subject} ${t.customer_name} ${t.priority}`));
                  return (
                    <section
                      key={col.lane}
                      className="panel"
                      style={{ borderTop: `3px solid ${col.accent}`, alignContent: 'start' }}
                    >
                      <div className="section-heading" style={{ marginBottom: '10px' }}>
                        <h3 style={{ margin: 0, fontSize: '14px' }}>{col.lane}</h3>
                        <span className="badge">{laneTickets.length}</span>
                      </div>
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {laneTickets.map((t: any) => (
                          <article
                            key={t.id}
                            style={{
                              border: '1px solid #e2e8f0',
                              borderRadius: '10px',
                              padding: '12px',
                              background: '#f8fafc',
                              display: 'grid',
                              gap: '6px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                              <strong style={{ fontSize: '13.5px' }}>{t.subject}</strong>
                              <span className="badge">{t.priority}</span>
                            </div>
                            <small style={{ color: '#475569' }}>
                              {t.customer_name} · SLA due {t.sla_due_on}
                            </small>
                            {writable && !['solved', 'closed'].includes(t.status) && (
                              <div className="form-actions" style={{ marginTop: '4px' }}>
                                <button
                                  type="button"
                                  className="quiet-button"
                                  onClick={async () => {
                                    await api(`/support/tickets/${t.id}`, 'PATCH', {
                                      expected_version: t.version,
                                      status: 'solved',
                                      resolution_note: 'Resolved by support desk',
                                    });
                                    refresh(`Marked "${t.subject}" solved.`);
                                  }}
                                >
                                  Mark Solved
                                </button>
                                <button
                                  type="button"
                                  className="quiet-button"
                                  onClick={async () => {
                                    await api(`/support/tickets/${t.id}/escalate`, 'POST', {
                                      target: 'field_operations',
                                      scheduled_on: today(),
                                      assignee: 'Field Technician',
                                    });
                                    refresh('Escalated ticket to Field Operations dispatch.');
                                  }}
                                >
                                  → Field Ops
                                </button>
                              </div>
                            )}
                          </article>
                        ))}
                        {!laneTickets.length && <p className="muted">No tickets in this lane.</p>}
                      </div>
                    </section>
                  );
                })}
              </div>

              {writable && (
                <section className="panel">
                  <h3>Log New Customer Support Ticket</h3>
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
                    <div className="form-grid">
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
                    </div>
                    <Field name="description" label="Issue details" defaultValue="Needs on-site setup and receipt test" />
                  </Form>
                </section>
              )}
            </>
          ) : (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Knowledge Base Reader</h3>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {(kb.data?.data || [])
                    .filter((a: any) => matches(`${a.title} ${a.category} ${a.body || ''}`))
                    .map((a: any) => {
                      const open = selectedKbId === a.id;
                      return (
                        <article
                          key={a.id}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            background: open ? '#f8fafc' : '#fff',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => setSelectedKbId(open ? '' : a.id)}
                            >
                              <strong>{a.title}</strong>
                            </button>
                            <span className="badge">{a.category}</span>
                          </div>
                          {open && (
                            <p style={{ marginTop: '8px', whiteSpace: 'pre-wrap', color: '#334155' }}>
                              {a.body}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  {!(kb.data?.data || []).length && <p className="muted">No KB articles published yet.</p>}
                </div>
              </section>
              {writable && (
                <section className="panel">
                  <h3>Publish Help Article</h3>
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
                    <Field name="category" label="Category" defaultValue="Billing & Payments" required />
                    <BaseField label="Article content">
                      <textarea
                        name="body"
                        rows={5}
                        defaultValue="1. Open Accounting -> Bank Reconciliation.\n2. Match imported statement lines against issued invoices."
                        required
                      />
                    </BaseField>
                  </Form>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* 19. SUBSCRIPTIONS */}
      {appId === 'subscriptions' && (
        <>
          <AppControlPanel
            parent="AfriCore Subscriptions"
            title={section === 'mrr' ? 'MRR / ARR Revenue Intelligence & Renewals' : 'Recurring Plans & Subscriber Contracts'}
            facet="Auto-Invoicing"
            search={query}
            onSearch={setQuery}
            views={[
              { id: 'contracts', label: 'Plans & Contracts' },
              { id: 'mrr', label: 'MRR & Proration' },
            ]}
            activeView={section === 'mrr' ? 'mrr' : 'contracts'}
            onViewChange={(v) => goSection('subscriptions', v)}
          />
          <KpiStrip
            items={[
              {
                label: 'Monthly Recurring Revenue',
                value: primaryMrr ? money(primaryMrr[1].mrr_minor, primaryMrr[0]) : money(0, 'KES'),
                delta: 'Normalized MRR',
                tone: 'up',
              },
              {
                label: 'Annual Run Rate (ARR)',
                value: primaryMrr ? money(primaryMrr[1].arr_minor, primaryMrr[0]) : money(0, 'KES'),
              },
              { label: 'Published Plans', value: (plans.data?.data || []).length },
              { label: 'Active Contracts', value: (contracts.data?.data || []).length },
            ]}
          />

          {section === 'mrr' ? (
            <div className="ac-split-grid">
              <section className="panel">
                <BarChart
                  title="Contract Billing Value by Subscriber"
                  subtitle="Recurring contract value across active subscriber agreements"
                  currency={primaryMrr?.[0] || 'KES'}
                  rows={(contracts.data?.data || []).slice(0, 10).map((c: any) => ({
                    key: c.id,
                    label: c.customer_name,
                    value: Number(c.price_minor || 0) * Number(c.quantity || 1),
                  }))}
                />
              </section>
              <section className="panel">
                <h3>Plan Mix Breakdown</h3>
                <DonutChart
                  title="Subscribers by Billing Interval"
                  rows={['monthly', 'quarterly', 'annual'].map((interval) => ({
                    key: interval,
                    label: interval.charAt(0).toUpperCase() + interval.slice(1),
                    value: (contracts.data?.data || []).filter((c: any) => c.interval === interval).length,
                  }))}
                />
              </section>
            </div>
          ) : (
            <>
              {(plans.data?.data || []).length > 0 && (
                <section className="panel">
                  <h3>Recurring Plan Catalog</h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    {(plans.data?.data || []).map((p: any) => (
                      <article
                        key={p.id}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          padding: '14px',
                          background: '#f8fafc',
                        }}
                      >
                        <span className="badge">{p.code}</span>
                        <h4 style={{ margin: '8px 0 4px' }}>{p.name}</h4>
                        <strong style={{ fontSize: '18px', color: '#0b6e4f' }}>
                          {money(p.price_minor, p.currency)}
                        </strong>
                        <small style={{ display: 'block', color: '#64748b' }}>
                          per {p.interval} · {p.trial_days || 0}d trial
                        </small>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <div className="ac-split-grid">
                <section className="panel">
                  <h3>Subscriber Contracts &amp; 1-Click Renewal Billing</h3>
                  <div className="ac-record-list">
                    {(contracts.data?.data || [])
                      .filter((c: any) => matches(`${c.customer_name} ${c.plan_name}`))
                      .map((c: any) => (
                        <div className="ac-record-row" key={c.id}>
                          <div className="ac-record-main">
                            <span className="ac-record-title">{c.customer_name}</span>
                            <span className="ac-record-meta">
                              {c.plan_name} (×{c.quantity || 1}) · Next invoice: {c.next_invoice_on}
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
                                  refresh(
                                    `Auto-created canonical invoice ${res.invoice?.reference || ''} in Accounting.`,
                                  );
                                }}
                              >
                                Auto-Bill → Invoice
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    {!(contracts.data?.data || []).length && (
                      <p className="muted">No subscriber contracts yet.</p>
                    )}
                  </div>
                </section>

                {writable && (
                  <section className="panel">
                    <h3>Create Plan or Subscriber Contract</h3>
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

                    {(plans.data?.data || []).length > 0 && (
                      <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                        <h4>Enroll Subscriber on Plan</h4>
                        <Form
                          label="Start contract"
                          submit={async (d) => {
                            await api('/subscriptions/contracts', 'POST', {
                              customer_name: d.customer_name,
                              plan_id: d.plan_id,
                              quantity: Number(d.quantity || 1),
                              starts_on: d.starts_on,
                              next_invoice_on: d.starts_on,
                            });
                            refresh('Subscription contract activated.');
                          }}
                        >
                          <Field name="customer_name" label="Subscriber / Customer" defaultValue="Acacia Logistics Ltd" required />
                          <SelectField
                            name="plan_id"
                            label="Plan"
                            options={(plans.data?.data || []).map((p: any) => ({
                              value: p.id,
                              label: `${p.name} (${money(p.price_minor, p.currency)}/${p.interval})`,
                            }))}
                          />
                          <Field name="quantity" label="Seats / Units" type="number" defaultValue="1" required />
                          <Field name="starts_on" label="Start date" type="date" defaultValue={today()} required />
                        </Form>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* 20. MANUFACTURING */}
      {appId === 'manufacturing' && (
        <>
          <AppControlPanel
            parent="AfriCore Manufacturing"
            title={section === 'boms' ? 'Bills of Materials & Scrap/Labor Cost Rollup' : 'Shop-Floor Production & Quality Inspection'}
            facet="Inventory Lot Sync"
            search={query}
            onSearch={setQuery}
            views={[
              { id: 'boms', label: 'Bills of Materials' },
              { id: 'production', label: 'Production & Quality' },
            ]}
            activeView={section === 'boms' ? 'boms' : 'production'}
            onViewChange={(v) => goSection('manufacturing', v)}
            pipeline={[
              { label: 'BOM Costing', state: section === 'boms' ? 'active' : 'done' },
              { label: 'Manufacturing Order', state: section !== 'boms' ? 'active' : 'pending' },
              { label: 'Quality Check', state: 'pending' },
              { label: 'Finished Lot Receipt', state: 'pending' },
            ]}
          />
          <KpiStrip
            items={[
              { label: 'Active BOMs', value: (boms.data?.data || []).length },
              { label: 'Manufacturing Orders', value: (mos.data?.data || []).length },
              {
                label: 'Completed MOs',
                value: (mos.data?.data || []).filter((m: any) => m.status === 'done').length,
                tone: 'up',
              },
              { label: 'Quality Inspections', value: (qcs.data?.data || []).length, delta: 'Auto-lot receipt' },
            ]}
          />

          {section === 'boms' ? (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Bills of Materials (Component &amp; Workcenter Tree)</h3>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {(boms.data?.data || [])
                    .filter((b: any) => matches(`${b.code} ${b.finished_product_name}`))
                    .map((b: any) => {
                      const expanded = expandedBomId === b.id;
                      return (
                        <article
                          key={b.id}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            background: '#fff',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => setExpandedBomId(expanded ? '' : b.id)}
                            >
                              <strong>
                                {b.code} · {b.finished_product_name}
                              </strong>
                            </button>
                            <span className="badge">{(b.components || []).length} components</span>
                          </div>
                          {expanded && (
                            <div style={{ marginTop: '10px', fontSize: '13px', display: 'grid', gap: '6px' }}>
                              <strong>Components:</strong>
                              <ul style={{ margin: 0, paddingInlineStart: '18px' }}>
                                {(b.components || []).map((comp: any, idx: number) => (
                                  <li key={idx}>
                                    <code>{comp.sku}</code> — Qty {(comp.quantity_milli || 0) / 1000} @{' '}
                                    {money(comp.unit_cost_minor || 0, b.currency || 'KES')} (scrap{' '}
                                    {(comp.scrap_bps || 0) / 100}%)
                                  </li>
                                ))}
                              </ul>
                              {(b.operations || []).length > 0 && (
                                <>
                                  <strong>Operations:</strong>
                                  <ul style={{ margin: 0, paddingInlineStart: '18px' }}>
                                    {(b.operations || []).map((op: any, idx: number) => (
                                      <li key={idx}>
                                        {op.name} — {op.duration_minutes} mins
                                      </li>
                                    ))}
                                  </ul>
                                </>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  {!(boms.data?.data || []).length && <p className="muted">No Bills of Materials defined yet.</p>}
                </div>
              </section>
              {writable && (
                <section className="panel">
                  <h3>Define Bill of Materials</h3>
                  <Form
                    label="Save BOM"
                    submit={async (d) => {
                      await api('/mrp/boms', 'POST', {
                        code: d.code,
                        finished_product_name: d.product_name,
                        currency: 'KES',
                        bom_quantity_milli: 1000,
                        components: [
                          {
                            sku: d.comp_sku,
                            quantity_milli: Math.round(Number(d.comp_qty || 1) * 1000),
                            unit_cost_minor: Math.round(Number(d.comp_cost || 0) * 100),
                            scrap_bps: Math.round(Number(d.scrap_pct || 0) * 100),
                          },
                        ],
                        operations: [
                          {
                            name: d.op_name || 'Assembly & QC',
                            duration_minutes: Number(d.op_mins || 30),
                            hourly_cost_minor: Math.round(Number(d.hourly_cost || 1200) * 100),
                          },
                        ],
                      });
                      refresh('Bill of Materials saved with cost rollup.');
                    }}
                  >
                    <Field name="code" label="BOM code" defaultValue="BOM-SOLAR-200" required />
                    <Field name="product_name" label="Finished product" defaultValue="200W Solar Panel Kit" required />
                    <Field name="comp_sku" label="Primary component SKU" defaultValue="CELL-MONO-A" required />
                    <Field name="comp_qty" label="Component qty per unit" type="number" defaultValue="4" required />
                    <Field name="comp_cost" label="Component unit cost (KES)" type="number" defaultValue="1800" required />
                    <Field name="scrap_pct" label="Scrap allowance (%)" type="number" defaultValue="2" />
                    <Field name="op_name" label="Workcenter operation" defaultValue="Lamination & Frame Assembly" required />
                    <Field name="op_mins" label="Duration (minutes)" type="number" defaultValue="45" required />
                  </Form>
                </section>
              )}
            </div>
          ) : (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Shop-Floor Manufacturing Orders &amp; QC</h3>
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
                                refresh(
                                  'Completed MO: passed Quality Check and auto-received finished goods into Inventory.',
                                );
                              }}
                            >
                              Pass QC &amp; Receive → Inventory
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  {!(mos.data?.data || []).length && (
                    <p className="muted">No manufacturing orders scheduled yet.</p>
                  )}
                </div>
              </section>

              {writable && (boms.data?.data || []).length > 0 && (
                <section className="panel">
                  <h3>Schedule Manufacturing Order</h3>
                  <Form
                    label="Release MO to floor"
                    submit={async (d) => {
                      await api('/mrp/orders', 'POST', {
                        reference: d.reference,
                        bom_id: d.bom_id,
                        produce_quantity_milli: Math.round(Number(d.qty || 1) * 1000),
                        scheduled_on: d.scheduled_on,
                      });
                      refresh('Manufacturing order released.');
                    }}
                  >
                    <Field name="reference" label="MO reference" defaultValue="MO-2026-001" required />
                    <SelectField
                      name="bom_id"
                      label="Bill of Materials"
                      options={(boms.data?.data || []).map((b: any) => ({
                        value: b.id,
                        label: `${b.code} — ${b.finished_product_name}`,
                      }))}
                    />
                    <Field name="qty" label="Quantity to produce" type="number" defaultValue="10" required />
                    <Field name="scheduled_on" label="Scheduled production date" type="date" defaultValue={today()} required />
                  </Form>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* 21. FIELD OPERATIONS */}
      {appId === 'field_operations' && (
        <>
          <AppControlPanel
            parent="AfriCore Field Operations"
            title={section === 'fleet' ? 'Preventive Maintenance & Fleet Odometer Board' : 'Technician Dispatch & Rental Schedule'}
            facet="Crew & Fleet"
            search={query}
            onSearch={setQuery}
            views={[
              { id: 'dispatches', label: 'Dispatches & Rentals' },
              { id: 'fleet', label: 'Maintenance & Fleet' },
            ]}
            activeView={section === 'fleet' ? 'fleet' : 'dispatches'}
            onViewChange={(v) => goSection('field_operations', v)}
          />
          <KpiStrip
            items={[
              { label: 'Field Dispatches', value: (dispatches.data?.data || []).length },
              {
                label: 'Equipment Rentals',
                value: (dispatches.data?.data || []).filter((d: any) => d.kind === 'equipment_rental').length,
              },
              { label: 'Maintenance Logs', value: (maint.data?.data || []).length },
              { label: 'Fleet Vehicles', value: (fleet.data?.data || []).length },
            ]}
          />

          {section === 'fleet' ? (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Equipment Maintenance &amp; Fleet Register</h3>
                <div className="ac-record-list">
                  {(fleet.data?.data || [])
                    .filter((v: any) => matches(`${v.plate_number} ${v.model} ${v.driver_name || ''}`))
                    .map((v: any) => (
                      <div className="ac-record-row" key={v.id}>
                        <div className="ac-record-main">
                          <span className="ac-record-title">
                            {v.plate_number} · {v.model}
                          </span>
                          <span className="ac-record-meta">
                            Driver: {v.driver_name || 'Pool'} · Odometer: {v.odometer_km} km
                          </span>
                        </div>
                        <span className="badge">{v.status}</span>
                      </div>
                    ))}
                  {(maint.data?.data || [])
                    .filter((m: any) => matches(`${m.equipment_name} ${m.kind}`))
                    .map((m: any) => (
                      <div className="ac-record-row" key={m.id}>
                        <div className="ac-record-main">
                          <span className="ac-record-title">{m.equipment_name}</span>
                          <span className="ac-record-meta">
                            {m.kind.toUpperCase()} · Priority: {m.priority} · Scheduled {m.scheduled_on}
                          </span>
                        </div>
                        <span className="badge">{m.status}</span>
                      </div>
                    ))}
                  {!(fleet.data?.data || []).length && !(maint.data?.data || []).length && (
                    <p className="muted">No fleet vehicles or maintenance requests recorded yet.</p>
                  )}
                </div>
              </section>
              {writable && (
                <section className="panel">
                  <h3>Log Maintenance or Fleet Vehicle</h3>
                  <Form
                    label="Schedule maintenance"
                    submit={async (d) => {
                      await api('/maintenance/requests', 'POST', {
                        equipment_name: d.equipment_name,
                        kind: d.kind,
                        scheduled_on: d.scheduled_on,
                        priority: d.priority,
                        notes: d.notes || '',
                      });
                      refresh('Maintenance job scheduled.');
                    }}
                  >
                    <Field name="equipment_name" label="Equipment / Asset" defaultValue="Cold-Room Compressor #2" required />
                    <SelectField
                      name="kind"
                      label="Maintenance type"
                      options={[
                        { value: 'preventive', label: 'Preventive Service' },
                        { value: 'corrective', label: 'Corrective Repair' },
                      ]}
                    />
                    <SelectField
                      name="priority"
                      label="Priority"
                      options={[
                        { value: 'normal', label: 'Normal' },
                        { value: 'high', label: 'High' },
                        { value: 'low', label: 'Low' },
                      ]}
                    />
                    <Field name="scheduled_on" label="Service date" type="date" defaultValue={today()} required />
                  </Form>
                </section>
              )}
            </div>
          ) : (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Technician Dispatch &amp; Rental Board</h3>
                <div className="ac-record-list">
                  {(dispatches.data?.data || [])
                    .filter((d: any) => matches(`${d.title} ${d.customer_name} ${d.technician}`))
                    .map((d: any) => (
                      <div className="ac-record-row" key={d.id}>
                        <div className="ac-record-main">
                          <span className="ac-record-title">{d.title}</span>
                          <span className="ac-record-meta">
                            {d.customer_name} · Crew: {d.technician} · {d.scheduled_on} ·{' '}
                            {d.kind === 'equipment_rental' ? 'Rental' : 'On-site Service'}
                          </span>
                        </div>
                        <span className="badge">{d.status}</span>
                      </div>
                    ))}
                  {!(dispatches.data?.data || []).length && (
                    <p className="muted">No active dispatches yet.</p>
                  )}
                </div>
              </section>
              {writable && (
                <section className="panel">
                  <h3>Schedule Technician Dispatch / Rental</h3>
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
                      refresh('Field dispatch scheduled and synced to worker activities.');
                    }}
                  >
                    <Field name="title" label="Job title" defaultValue="Solar inverter inspection" required />
                    <Field name="customer" label="Customer / Site" defaultValue="Kibo Farms" required />
                    <SelectField
                      name="kind"
                      label="Assignment type"
                      options={[
                        { value: 'field_service', label: 'Field Service' },
                        { value: 'equipment_rental', label: 'Equipment Rental' },
                      ]}
                    />
                    <Field name="technician" label="Assigned technician" defaultValue="Peter Mwangi" required />
                    <Field name="scheduled_on" label="Scheduled date" type="date" defaultValue={today()} required />
                  </Form>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* 22. LOGISTICS */}
      {appId === 'logistics' && (
        <>
          <AppControlPanel
            parent="AfriCore Logistics"
            title={section === 'pod' ? 'Proof of Delivery (POD) Verification Desk' : 'Freight Dispatch & Carrier Route Board'}
            facet="Sales Fulfillment Sync"
            search={query}
            onSearch={setQuery}
            views={[
              { id: 'shipments', label: 'Shipments & Dispatch' },
              { id: 'pod', label: 'Proof of Delivery' },
            ]}
            activeView={section === 'pod' ? 'pod' : 'shipments'}
            onViewChange={(v) => goSection('logistics', v)}
            pipeline={[
              { label: 'Booked', state: 'done' },
              { label: 'In Transit', state: section !== 'pod' ? 'active' : 'done' },
              { label: 'Delivered (Signed POD)', state: section === 'pod' ? 'active' : 'pending' },
            ]}
          />
          <KpiStrip
            items={[
              { label: 'Total Shipments', value: (shipments.data?.data || []).length },
              {
                label: 'In Transit / Booked',
                value: (shipments.data?.data || []).filter((s: any) => s.status !== 'delivered').length,
                tone: 'warn',
              },
              {
                label: 'Signed PODs',
                value: (shipments.data?.data || []).filter((s: any) => s.status === 'delivered').length,
                delta: 'Audit verified',
                tone: 'up',
              },
            ]}
          />

          {section === 'pod' ? (
            <section className="panel">
              <h3>Signed Proof of Delivery Register</h3>
              <div className="ac-record-list">
                {(shipments.data?.data || [])
                  .filter((s: any) => matches(`${s.tracking_number} ${s.carrier_name} ${s.destination}`))
                  .map((s: any) => (
                    <div className="ac-record-row" key={s.id}>
                      <div className="ac-record-main">
                        <span className="ac-record-title">
                          {s.tracking_number} · {s.destination}
                        </span>
                        <span className="ac-record-meta">
                          {s.pod
                            ? `Received by ${s.pod.received_by} on ${s.pod.delivered_on} — ${s.pod.notes}`
                            : `Awaiting receiver signature · Carrier: ${s.carrier_name}`}
                        </span>
                      </div>
                      <div className="ac-record-actions">
                        <span className="badge">{s.status}</span>
                        {writable && s.status !== 'delivered' && (
                          <button
                            type="button"
                            className="button"
                            onClick={async () => {
                              await api(`/logistics/shipments/${s.id}/pod`, 'POST', {
                                expected_version: s.version,
                                received_by: 'Authorized Receiving Clerk',
                                delivered_on: today(),
                              });
                              refresh('Signed Proof of Delivery recorded and synced to Sales.');
                            }}
                          >
                            Sign &amp; Confirm POD
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                {!(shipments.data?.data || []).length && <p className="muted">No shipments recorded yet.</p>}
              </div>
            </section>
          ) : (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Active Carrier Dispatch Board</h3>
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
                  {!(shipments.data?.data || []).length && <p className="muted">No shipments booked yet.</p>}
                </div>
              </section>
              {writable && (
                <section className="panel">
                  <h3>Book New Freight Shipment</h3>
                  <Form
                    label="Book shipment"
                    submit={async (d) => {
                      await api('/logistics/shipments', 'POST', {
                        tracking_number: d.tracking_number,
                        carrier_name: d.carrier_name,
                        destination: d.destination,
                        currency: 'KES',
                        freight_cost_minor: Math.round(Number(d.cost || 0) * 100),
                        estimated_arrival_on: d.eta,
                      });
                      refresh('Shipment booked on dispatch board.');
                    }}
                  >
                    <Field name="tracking_number" label="Waybill / Tracking #" defaultValue="AWB-KE-8042" required />
                    <Field name="carrier_name" label="Carrier" defaultValue="East Africa Express" required />
                    <Field name="destination" label="Destination" defaultValue="Mombasa Road Depot" required />
                    <Field name="cost" label="Freight cost (KES)" type="number" defaultValue="3500" required />
                    <Field name="eta" label="Estimated arrival" type="date" defaultValue={today()} required />
                  </Form>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* 23. PROPERTY & HOSPITALITY */}
      {appId === 'property_hospitality' && (
        <>
          <AppControlPanel
            parent="AfriCore Property & Hospitality"
            title={section === 'reservations' ? 'Guest Check-In & Folio Checkout Desk' : 'Unit Occupancy Grid & Tenant Leases'}
            facet="Auto-Invoice"
            search={query}
            onSearch={setQuery}
            views={[
              { id: 'leases', label: 'Units & Leases' },
              { id: 'reservations', label: 'Reservations & Folios' },
            ]}
            activeView={section === 'reservations' ? 'reservations' : 'leases'}
            onViewChange={(v) => goSection('property_hospitality', v)}
          />
          <KpiStrip
            items={[
              { label: 'Total Units / Rooms', value: (units.data?.data || []).length },
              {
                label: 'Occupied Units',
                value: (units.data?.data || []).filter((u: any) => u.status === 'occupied').length,
                tone: 'up',
              },
              { label: 'Active Leases', value: (leases.data?.data || []).length },
              { label: 'Guest Reservations', value: (reservations.data?.data || []).length, delta: 'Folio linked' },
            ]}
          />

          {section === 'reservations' ? (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Hospitality Reservations &amp; Folio Settlement</h3>
                <div className="ac-record-list">
                  {(reservations.data?.data || [])
                    .filter((r: any) => matches(`${r.guest_name} ${r.unit_code}`))
                    .map((r: any) => (
                      <div className="ac-record-row" key={r.id}>
                        <div className="ac-record-main">
                          <span className="ac-record-title">
                            {r.guest_name} · {r.unit_code} ({r.unit_name})
                          </span>
                          <span className="ac-record-meta">
                            {r.check_in} → {r.check_out} ({r.nights} nights) · Folio:{' '}
                            {money(r.folio_total_minor, r.currency || 'KES')}
                          </span>
                        </div>
                        <div className="ac-record-actions">
                          <span className="badge">{r.status}</span>
                          {writable && r.status !== 'checked_out' && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={async () => {
                                await api(`/property/reservations/${r.id}/checkout`, 'POST', {
                                  expected_version: r.version,
                                  checkout_date: today(),
                                  extras_minor: 0,
                                });
                                refresh('Guest checked out and folio invoice issued in Accounting.');
                              }}
                            >
                              Checkout → Issue Folio Invoice
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  {!(reservations.data?.data || []).length && (
                    <p className="muted">No guest reservations recorded yet.</p>
                  )}
                </div>
              </section>
              {writable && (units.data?.data || []).length > 0 && (
                <section className="panel">
                  <h3>Book Guest Reservation</h3>
                  <Form
                    label="Confirm reservation"
                    submit={async (d) => {
                      await api('/property/reservations', 'POST', {
                        unit_id: d.unit_id,
                        guest_name: d.guest_name,
                        check_in: d.check_in,
                        check_out: d.check_out,
                        nights: Number(d.nights || 1),
                        nightly_rate_minor: Math.round(Number(d.rate || 0) * 100),
                        currency: 'KES',
                      });
                      refresh('Hospitality reservation confirmed.');
                    }}
                  >
                    <SelectField
                      name="unit_id"
                      label="Room / Villa / Hall"
                      options={(units.data?.data || []).map((u: any) => ({
                        value: u.id,
                        label: `${u.code} — ${u.name}`,
                      }))}
                    />
                    <Field name="guest_name" label="Guest / Organization" defaultValue="Amina Ochieng" required />
                    <Field name="check_in" label="Check-in date" type="date" defaultValue={today()} required />
                    <Field name="check_out" label="Check-out date" type="date" defaultValue={today()} required />
                    <Field name="nights" label="Nights" type="number" defaultValue="2" required />
                    <Field name="rate" label="Nightly rate (KES)" type="number" defaultValue="14500" required />
                  </Form>
                </section>
              )}
            </div>
          ) : (
            <>
              {(units.data?.data || []).length > 0 && (
                <section className="panel">
                  <h3>Visual Unit / Room Occupancy Grid</h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    {(units.data?.data || []).map((u: any) => (
                      <div
                        key={u.id}
                        style={{
                          padding: '12px',
                          borderRadius: '10px',
                          border: u.status === 'occupied' ? '1px solid #0b6e4f' : '1px solid #cbd5e1',
                          background: u.status === 'occupied' ? '#ecfdf5' : '#ffffff',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>{u.code}</strong>
                          <span className="badge">{u.status}</span>
                        </div>
                        <div style={{ fontSize: '13px', margin: '4px 0' }}>{u.name}</div>
                        <small style={{ color: '#475569' }}>
                          {money(u.rate_minor, u.currency)} / {u.rate_period}
                        </small>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <div className="ac-split-grid">
                <section className="panel">
                  <h3>Active Tenant Leases</h3>
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
                              {money(l.monthly_rent_minor, l.currency)} / month · {l.starts_on} → {l.ends_on}
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
                    {!(leases.data?.data || []).length && <p className="muted">No active leases yet.</p>}
                  </div>
                </section>
                {writable && (
                  <section className="panel">
                    <h3>Register Property Unit / Room</h3>
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
        </>
      )}

      {/* 24. KNOWLEDGE & LEARNING */}
      {appId === 'knowledge_learning' && (
        <>
          <AppControlPanel
            parent="AfriCore Knowledge & Learning"
            title={section === 'articles' ? 'Company Knowledge Wiki & SOP Handbook' : 'Employee Academy, Courses & Auto-Graded Assessments'}
            facet="HR & Compliance"
            search={query}
            onSearch={setQuery}
            views={[
              { id: 'articles', label: 'Knowledge Wiki' },
              { id: 'courses', label: 'Courses & Assessments' },
            ]}
            activeView={section === 'articles' ? 'articles' : 'courses'}
            onViewChange={(v) => goSection('knowledge_learning', v)}
          />
          <KpiStrip
            items={[
              { label: 'Wiki Pages', value: (articles.data?.data || []).length },
              { label: 'Academy Courses', value: (courses.data?.data || []).length },
              { label: 'Enrollments', value: (enrollments.data?.data || []).length },
              {
                label: 'Certified Staff',
                value: (enrollments.data?.data || []).filter((e: any) => e.status === 'certified').length,
                tone: 'up',
              },
            ]}
          />

          {section === 'articles' ? (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Company Handbook &amp; Wiki Spaces</h3>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {(articles.data?.data || [])
                    .filter((a: any) => matches(`${a.title} ${a.space} ${a.content || ''}`))
                    .map((a: any) => {
                      const open = selectedWikiId === a.id || (!selectedWikiId && articles.data?.data?.[0]?.id === a.id);
                      return (
                        <article
                          key={a.id}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '14px',
                            background: open ? '#f8fafc' : '#fff',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => setSelectedWikiId(a.id)}
                            >
                              <strong>{a.title}</strong>
                            </button>
                            <span className="badge">{a.space}</span>
                          </div>
                          {open && (
                            <p style={{ marginTop: '10px', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                              {a.content}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  {!(articles.data?.data || []).length && (
                    <p className="muted">No wiki articles yet. Publish your first company SOP on the right.</p>
                  )}
                </div>
              </section>
              {writable && (
                <section className="panel">
                  <h3>Publish Wiki Article / SOP</h3>
                  <Form
                    label="Publish wiki page"
                    submit={async (d) => {
                      await api('/learning/articles', 'POST', {
                        title: d.title,
                        space: d.space,
                        content: d.content,
                      });
                      refresh('Company wiki page published.');
                    }}
                  >
                    <Field name="title" label="Page title" defaultValue="Procurement Approval & Three-Way Match SOP" required />
                    <Field name="space" label="Wiki space" defaultValue="Operations Handbook" required />
                    <BaseField label="Markdown / Article body">
                      <textarea
                        name="content"
                        rows={6}
                        defaultValue="All purchase orders above KES 50,000 require independent reviewer sign-off and warehouse receipt inspection before bill settlement."
                        required
                      />
                    </BaseField>
                  </Form>
                </section>
              )}
            </div>
          ) : (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Training Courses &amp; Employee Certifications</h3>
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

                {(enrollments.data?.data || []).length > 0 && (
                  <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                    <h4>Active Enrollments &amp; Assessment Grader</h4>
                    <div className="ac-record-list">
                      {(enrollments.data?.data || []).map((en: any) => (
                        <div className="ac-record-row" key={en.id}>
                          <div className="ac-record-main">
                            <span className="ac-record-title">
                              {en.employee_name} — {en.course_title}
                            </span>
                            <span className="ac-record-meta">
                              {en.certificate_ref
                                ? `Certified (${en.score_pct}%) · ${en.certificate_ref}`
                                : `Due ${en.due_on} · Passing score ${en.passing_score_pct}%`}
                            </span>
                          </div>
                          <div className="ac-record-actions">
                            <span className="badge">{en.status}</span>
                            {writable && en.status !== 'certified' && (
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={async () => {
                                  await api(`/learning/enrollments/${en.id}/assess`, 'POST', {
                                    expected_version: en.version,
                                    correct_answers: 9,
                                    total_questions: 10,
                                  });
                                  refresh(`Graded ${en.employee_name} (90%) and issued completion certificate.`);
                                }}
                              >
                                Grade Quiz (90%) → Certify
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {writable && (
                <section className="panel">
                  <h3>Create Course or Enroll Staff</h3>
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

                  {(courses.data?.data || []).length > 0 && (
                    <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                      <h4>Enroll Employee</h4>
                      <Form
                        label="Enroll employee"
                        submit={async (d) => {
                          await api('/learning/enrollments', 'POST', {
                            course_id: d.course_id,
                            employee_name: d.employee_name,
                            due_on: d.due_on,
                          });
                          refresh('Employee enrolled in training course.');
                        }}
                      >
                        <SelectField
                          name="course_id"
                          label="Course"
                          options={(courses.data?.data || []).map((c: any) => ({
                            value: c.id,
                            label: `${c.code} — ${c.title}`,
                          }))}
                        />
                        <Field name="employee_name" label="Employee name" defaultValue="Grace Wanjiku" required />
                        <Field name="due_on" label="Completion due date" type="date" defaultValue={today()} required />
                      </Form>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* 25. STUDIO */}
      {appId === 'studio' && (
        <>
          <AppControlPanel
            parent="AfriCore Studio"
            title={section === 'records' ? 'Custom App Live Database & Form Runner' : 'Visual Schema & No-Code App Builder'}
            facet="Typed Schema"
            search={query}
            onSearch={setQuery}
            views={[
              { id: 'apps', label: 'Custom Apps' },
              { id: 'records', label: 'Live Records' },
            ]}
            activeView={section === 'records' ? 'records' : 'apps'}
            onViewChange={(v) => goSection('studio', v)}
          />
          <KpiStrip
            items={[
              { label: 'Published Studio Apps', value: (studioApps.data?.data || []).length },
              {
                label: 'Active Schema Fields',
                value: studioRecords.data?.app?.fields?.length ?? studioFields.length,
              },
              {
                label: 'Stored Records',
                value: studioRecords.data ? (studioRecords.data.data || []).length : 0,
              },
            ]}
          />

          {section === 'records' ? (
            <div className="ac-split-grid">
              <section className="panel">
                <div className="section-heading">
                  <h3>Live Custom Records</h3>
                  {(studioApps.data?.data || []).length > 0 && (
                    <select
                      aria-label="Select Studio App"
                      value={activeStudioAppId}
                      onChange={(e) => setSelectedStudioApp(e.target.value)}
                    >
                      {(studioApps.data?.data || []).map((a: any) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.slug})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {studioRecords.data?.app ? (
                  <div className="ac-record-list">
                    {(studioRecords.data.data || []).map((rec: any) => (
                      <div className="ac-record-row" key={rec.id}>
                        <div className="ac-record-main">
                          <span className="ac-record-title">
                            {Object.entries(rec.values || {})
                              .map(([k, v]) => `${k}: ${String(v)}`)
                              .join(' · ')}
                          </span>
                          <span className="ac-record-meta">
                            Created {new Date(rec.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="badge">{rec.status}</span>
                      </div>
                    ))}
                    {!(studioRecords.data.data || []).length && (
                      <p className="muted">No records in this custom app yet. Submit the generated form on the right.</p>
                    )}
                  </div>
                ) : (
                  <p className="muted">Create a custom Studio app first to start capturing typed records.</p>
                )}
              </section>

              {writable && studioRecords.data?.app && (
                <section className="panel">
                  <h3>Add Record to {studioRecords.data.app.name}</h3>
                  <Form
                    label="Save custom record"
                    submit={async (d) => {
                      const values: Record<string, any> = {};
                      for (const f of studioRecords.data.app.fields || []) {
                        values[f.key] = f.type === 'number' || f.type === 'currency' ? Number(d[f.key] || 0) : d[f.key] || '';
                      }
                      await api(`/studio/apps/${activeStudioAppId}/records`, 'POST', { values });
                      refresh('Record validated against custom schema and published to Event Bus.');
                    }}
                  >
                    {(studioRecords.data.app.fields || []).map((f: any) => (
                      <Field
                        key={f.key}
                        name={f.key}
                        label={`${f.label} (${f.type})`}
                        type={f.type === 'date' ? 'date' : f.type === 'number' || f.type === 'currency' ? 'number' : 'text'}
                        required={!!f.required}
                      />
                    ))}
                  </Form>
                </section>
              )}
            </div>
          ) : (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Workspace Custom Apps</h3>
                <div className="ac-record-list">
                  {(studioApps.data?.data || [])
                    .filter((a: any) => matches(`${a.name} ${a.slug}`))
                    .map((a: any) => (
                      <div className="ac-record-row" key={a.id}>
                        <div className="ac-record-main">
                          <span className="ac-record-title">{a.name}</span>
                          <span className="ac-record-meta">
                            <code>{a.slug}</code> · View: {a.default_view} · {(a.fields || []).length} typed fields
                          </span>
                        </div>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            setSelectedStudioApp(a.id);
                            goSection('studio', 'records');
                          }}
                        >
                          Open Live Records →
                        </button>
                      </div>
                    ))}
                  {!(studioApps.data?.data || []).length && (
                    <p className="muted">No custom apps built yet. Design your schema on the right.</p>
                  )}
                </div>
              </section>

              {writable && (
                <section className="panel">
                  <h3>Visual Schema Designer</h3>
                  <Form
                    label="Publish custom Studio app"
                    submit={async (d) => {
                      const created = await api('/studio/apps', 'POST', {
                        slug: d.slug,
                        name: d.name,
                        default_view: d.view,
                        fields: studioFields,
                      });
                      setSelectedStudioApp(created.id);
                      refresh(`Custom Studio app "${d.name}" published.`);
                    }}
                  >
                    <Field name="slug" label="App slug (lowercase_underscore)" defaultValue="vendor_audits" required />
                    <Field name="name" label="App display name" defaultValue="Vendor Compliance Audits" required />
                    <SelectField
                      name="view"
                      label="Default view layout"
                      options={[
                        { value: 'table', label: 'Database Table' },
                        { value: 'kanban', label: 'Kanban Board' },
                        { value: 'form', label: 'Entry Form' },
                      ]}
                    />

                    <div style={{ display: 'grid', gap: '8px', margin: '8px 0' }}>
                      <strong style={{ fontSize: '13px' }}>Schema Fields ({studioFields.length})</strong>
                      {studioFields.map((sf, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 110px auto',
                            gap: '6px',
                            alignItems: 'center',
                          }}
                        >
                          <input
                            value={sf.label}
                            aria-label={`Field ${idx + 1} label`}
                            onChange={(e) => {
                              const label = e.target.value;
                              const key =
                                label
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, '_')
                                  .replace(/^_|_$/g, '') || `field_${idx + 1}`;
                              setStudioFields((list) =>
                                list.map((item, i) => (i === idx ? { ...item, label, key } : item)),
                              );
                            }}
                          />
                          <select
                            value={sf.type}
                            aria-label={`Field ${idx + 1} type`}
                            onChange={(e) =>
                              setStudioFields((list) =>
                                list.map((item, i) =>
                                  i === idx ? { ...item, type: e.target.value as any } : item,
                                ),
                              )
                            }
                          >
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="currency">Currency</option>
                            <option value="date">Date</option>
                          </select>
                          {studioFields.length > 1 && (
                            <button
                              type="button"
                              className="quiet-button"
                              onClick={() =>
                                setStudioFields((list) => list.filter((_, i) => i !== idx))
                              }
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          setStudioFields((list) => [
                            ...list,
                            {
                              key: `field_${list.length + 1}`,
                              label: `Custom Field ${list.length + 1}`,
                              type: 'text',
                              required: false,
                            },
                          ])
                        }
                      >
                        + Add schema field
                      </button>
                    </div>
                  </Form>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* 26. INTEGRATIONS HUB */}
      {appId === 'integrations_hub' && (
        <>
          <AppControlPanel
            parent="AfriCore Integrations Hub"
            title={
              section === 'pipelines'
                ? 'Connectors & Automated Sync Pipelines'
                : section === 'events'
                  ? 'Immutable Cross-App Event Bus Stream'
                  : '26-App Connected Architecture & Zero-Double-Entry Flows'
            }
            facet="Live Event Bus"
            search={query}
            onSearch={setQuery}
            views={[
              { id: 'topology', label: 'Connected Flows' },
              { id: 'pipelines', label: 'Connectors & Pipelines' },
              { id: 'events', label: 'Live Event Bus' },
            ]}
            activeView={
              section === 'pipelines' ? 'pipelines' : section === 'events' ? 'events' : 'topology'
            }
            onViewChange={(v) => goSection('integrations_hub', v)}
          />
          <KpiStrip
            items={[
              { label: 'Connected Suite Apps', value: topology.data?.total_apps ?? 26, delta: 'Unified' },
              { label: 'Active Connectors', value: (connectors.data?.data || []).length },
              { label: 'Sync Pipelines', value: (pipelines.data?.data || []).length },
              {
                label: 'Events Delivered',
                value: topology.data?.events_delivered ?? 0,
                delta: 'Real-time',
                tone: 'up',
              },
            ]}
          />

          {section === 'pipelines' ? (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Sync Pipelines &amp; Connectors</h3>
                <div className="ac-record-list">
                  {(pipelines.data?.data || [])
                    .filter((p: any) => matches(`${p.name} ${p.source_app} ${p.target_app}`))
                    .map((p: any) => (
                      <div className="ac-record-row" key={p.id}>
                        <div className="ac-record-main">
                          <span className="ac-record-title">{p.name}</span>
                          <span className="ac-record-meta">
                            <code>{p.source_app}</code> → <code>{p.target_app}</code> on{' '}
                            <code>{p.trigger_event}</code> · Runs: {p.run_count || 0}
                          </span>
                        </div>
                        {writable && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={async () => {
                              await api(`/integrations-hub/pipelines/${p.id}/run`, 'POST', {});
                              refresh(`Executed pipeline "${p.name}".`);
                            }}
                          >
                            Run Now
                          </button>
                        )}
                      </div>
                    ))}
                  {!(pipelines.data?.data || []).length && (
                    <p className="muted">No custom sync pipelines configured yet.</p>
                  )}
                </div>
              </section>
              {writable && (
                <section className="panel">
                  <h3>Create Automated Sync Pipeline</h3>
                  <Form
                    label="Save pipeline"
                    submit={async (d) => {
                      await api('/integrations-hub/pipelines', 'POST', {
                        name: d.name,
                        source_app: d.source_app,
                        target_app: d.target_app,
                        trigger_event: d.trigger_event,
                        action_summary: d.action_summary,
                      });
                      refresh('Automated data pipeline created.');
                    }}
                  >
                    <Field name="name" label="Pipeline name" defaultValue="VIP Order Alert to Support" required />
                    <Field name="source_app" label="Source app" defaultValue="sales" required />
                    <Field name="target_app" label="Target app" defaultValue="support" required />
                    <Field name="trigger_event" label="Trigger event" defaultValue="order.confirmed" required />
                    <Field
                      name="action_summary"
                      label="Action summary"
                      defaultValue="Create onboarding concierge check-in for high-value orders"
                      required
                    />
                  </Form>
                </section>
              )}
            </div>
          ) : section === 'events' ? (
            <section className="panel">
              <h3>Live Cross-App Event Bus</h3>
              <div className="ac-record-list">
                {(events.data?.data || [])
                  .filter((e: any) => matches(`${e.source_app} ${e.target_app} ${e.summary} ${e.event_type}`))
                  .map((e: any) => (
                    <div className="ac-record-row" key={e.id}>
                      <div className="ac-record-main">
                        <span className="ac-record-title">
                          <code>{e.source_app}</code> → <code>{e.target_app}</code>
                        </span>
                        <span className="ac-record-meta">{e.summary}</span>
                      </div>
                      <span className="badge">{e.event_type}</span>
                    </div>
                  ))}
                {!(events.data?.data || []).length && (
                  <p className="muted">No cross-app events emitted yet in this environment.</p>
                )}
              </div>
            </section>
          ) : (
            <div className="ac-split-grid">
              <section className="panel">
                <h3>Built-In Suite Topology</h3>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {(topology.data?.built_in_connections || []).map((flow: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        fontSize: '13px',
                      }}
                    >
                      <strong style={{ color: '#0b6e4f' }}>
                        {flow.from} → {flow.to}
                      </strong>
                      <div style={{ color: '#334155', marginTop: '2px' }}>{flow.flow}</div>
                    </div>
                  ))}
                </div>
              </section>
              {writable && (
                <section className="panel">
                  <h3>1-Click Connected Sale (Order + Invoice + Stock + Shipment)</h3>
                  <Form
                    label="Execute Connected Sale"
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
                    <Field name="price" label="Unit price (KES)" type="number" defaultValue="45000" required />
                  </Form>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
