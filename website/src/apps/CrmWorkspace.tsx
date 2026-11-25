import { CrmReport } from './CrmReport';
import { CrmCalendar } from './CrmCalendar';
import { CrmImport } from './CrmImport';
import { CrmExtraFields, crmExtraValues } from './CrmExtraFields';
import { CrmSettings } from './CrmSettings';
import { CrmPipeline } from './CrmPipeline';
import { CrmEntryDetails } from './CrmEntryDetails';
import { CrmActivityPlans } from './CrmActivityPlans';
import { CrmForecast } from './CrmForecast';
import { CrmDuplicates } from './CrmDuplicates';
import { CrmCustomerSelect } from './CrmCustomerSelect';
import { useIdempotentAPI } from './useIdempotentAPI';
import { useEffect, useRef, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { Field, Form, money, type API } from '../operations/UI';
import { parseMoney } from '../../../src/finance/money';
export function CrmWorkspace({
  api: providedApi,
  scope,
  navigate,
  initialSection = 'dashboard',
  writable = false,
  admin = false,
  salesEnabled = false,
}: {
  admin?: boolean;
  salesEnabled?: boolean;
  writable?: boolean;
  initialSection?: string;
  api: API;
  scope: string;
  navigate: (tab: string) => void;
}) {
  const api = useIdempotentAPI(providedApi, scope);
  const currentScope = useRef(scope),
    selectionRequest = useRef(0);
  currentScope.current = scope;
  const [moveNotice, setMoveNotice] = useState('');
  useEffect(() => setMoveNotice(''), [scope]);
  const [data, setData] = useState<any>(null),
    [entryPage, setEntryPage] = useState<any>(null),
    [customers, setCustomers] = useState<any[]>([]),
    [members, setMembers] = useState<any[]>([]),
    [error, setError] = useState(''),
    [customerError, setCustomerError] = useState(''),
    [teamError, setTeamError] = useState(''),
    [revision, setRevision] = useState(0),
    [section, setSection] = useState(initialSection === 'dashboard' ? 'pipeline' : initialSection),
    [activity, setActivity] = useState<any>(null),
    [profileContactType, setProfileContactType] = useState<'individual' | 'company'>('individual'),
    [customerQuery, setCustomerQuery] = useState(''),
    [customerRows, setCustomerRows] = useState<any[]>([]),
    [customerTotal, setCustomerTotal] = useState(0),
    [customerOffset, setCustomerOffset] = useState(0),
    [customerListLoading, setCustomerListLoading] = useState(false),
    [activityMoreLoading, setActivityMoreLoading] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [extraSelected, setExtraSelected] = useState<any>(null),
    [query, setQuery] = useState(''),
    [createKind, setCreateKind] = useState(
      initialSection === 'leads'
        ? 'lead'
        : initialSection === 'followups'
          ? 'follow_up'
          : 'opportunity',
    ),
    [stateFilter, setStateFilter] = useState('all'),
    [outcomeFilter, setOutcomeFilter] = useState('active'),
    [ownerFilter, setOwnerFilter] = useState('mine'),
    [stageFilter, setStageFilter] = useState('all'),
    [teamFilter, setTeamFilter] = useState('all'),
    [currencyFilter, setCurrencyFilter] = useState('all'),
    [leadFilter, setLeadFilter] = useState('all'),
    [activityWindow, setActivityWindow] = useState('all'),
    [sortOrder, setSortOrder] = useState('recent'),
    [page, setPage] = useState(1),
    [board, setBoard] = useState(initialSection === 'dashboard' || initialSection === 'pipeline'),
    [calendar, setCalendar] = useState(false),
    [createStage, setCreateStage] = useState(''),
    [moving, setMoving] = useState(false),
    [hasMore, setHasMore] = useState(true),
    [loadingMore, setLoadingMore] = useState(false),
    [listLoading, setListLoading] = useState(false);
  function changeSection(next: string, replace = false) {
    const url = new URL(location.href);
    url.searchParams.set('app', 'crm');
    url.searchParams.set('section', next);
    url.searchParams.delete('crm-record');
    url.hash = 'Apps';
    history[replace ? 'replaceState' : 'pushState'](null, '', url.pathname + url.search + url.hash);
    setSection(next);
    dispatchEvent(new Event('africore:app-navigation'));
    navigate('Apps');
  }
  function entryParams(offset = 0) {
    const params = new URLSearchParams({ limit: '200', offset: String(offset), sort: sortOrder });
    if (section === 'pipeline') {
      params.set('kind', 'opportunity');
      if (outcomeFilter !== 'all') params.set('outcome', outcomeFilter);
      if (ownerFilter === 'mine' && data?.current_actor)
        params.set('assigned_to', data.current_actor);
      else if (!['mine', 'all'].includes(ownerFilter)) params.set('assigned_to', ownerFilter);
      if (stageFilter !== 'all') params.set('stage', stageFilter);
      if (teamFilter !== 'all') params.set('team_id', teamFilter);
    } else if (section === 'leads') {
      params.set('kind', 'lead');
      if (leadFilter === 'mine' && data?.current_actor)
        params.set('assigned_to', data.current_actor);
      else if (!['mine', 'all', 'unassigned', 'open', 'cancelled'].includes(leadFilter))
        params.set('assigned_to', leadFilter);
      if (leadFilter === 'unassigned') params.set('unassigned', 'true');
      if (leadFilter === 'open' || leadFilter === 'cancelled') params.set('status', leadFilter);
    } else if (section === 'followups') { params.set('kind', 'follow_up'); if (activityWindow !== 'all') params.set('activity_window', activityWindow); if (ownerFilter === 'mine' && data?.current_actor) params.set('assigned_to', data.current_actor); else if (!['mine','all'].includes(ownerFilter)) params.set('assigned_to', ownerFilter); }
    if (stateFilter !== 'all') params.set('status', stateFilter);
    if (currencyFilter !== 'all') params.set('currency', currencyFilter);
    if (query.trim()) params.set('q', query.trim());
    return params;
  }
  useEffect(() => {
    setData(null);
    setEntryPage(null);
    setCustomers([]);
    setMembers([]);
  }, [scope]);
  useEffect(() => {
    let current = true;
    setError('');
    setCustomerError('');
    setTeamError('');
    api('/crm')
      .then((r) => current && setData(r))
      .catch((e) => current && setError(e.message));
    api('/records/customers?limit=100')
      .then((r) => current && setCustomers(r.data || []))
      .catch((e) => current && setCustomerError(e.message));
    api('/team')
      .then(
        (r) =>
          current &&
          setMembers(
            (r.data || []).filter((m: any) =>
              ['owner', 'admin', 'finance', 'operations'].includes(m.role),
            ),
          ),
      )
      .catch((e) => current && setTeamError(e.message));
    return () => {
      current = false;
    };
  }, [scope, revision]);
  useEffect(() => {
    if (section !== 'customers') return;
    let current = true;
    const timer = window.setTimeout(() => {
      setCustomerListLoading(true);
      api(
        '/records/customers?' +
          new URLSearchParams({ limit: '50', offset: String(customerOffset), q: customerQuery }),
      )
        .then((result) => {
          if (current) {
            setCustomerRows(result.data || []);
            setCustomerTotal(result.total || 0);
          }
        })
        .catch((e) => current && setCustomerError((e as Error).message))
        .finally(() => current && setCustomerListLoading(false));
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [scope, section, customerQuery, customerOffset, revision]);
  useEffect(() => {
    if (!data) return;
    let current = true;
    const params = entryParams(0);
    setListLoading(true);
    setEntryPage(null);
    api('/crm/entries?' + params)
      .then((result) => {
        if (current) {
          setEntryPage(result);
          setHasMore(result.has_more);
        }
      })
      .catch((e) => current && setError((e as Error).message))
      .finally(() => current && setListLoading(false));
    return () => {
      current = false;
    };
  }, [
    scope,
    revision,
    !!data,
    section,
    query,
    stateFilter,
    outcomeFilter,
    ownerFilter,
    stageFilter,
    teamFilter,
    currencyFilter,
    leadFilter,
    activityWindow,
    sortOrder,
    data?.current_actor,
  ]);
  useEffect(() => {
    const next = initialSection === 'dashboard' ? 'pipeline' : initialSection;
    setSection(next);
    setCreateKind(next === 'leads' ? 'lead' : next === 'followups' ? 'follow_up' : 'opportunity');
    setActivity(null);
    setSelected(null);
    setQuery('');
    setStateFilter('all');
    setBoard(next === 'pipeline');
    setCalendar(false);
  }, [scope, initialSection]);
  async function write(path: string, body: any, method = 'POST') {
    const result = await api(path, method, body, { 'Idempotency-Key': crypto.randomUUID() });
    setRevision((v) => v + 1);
    return result;
  }
  async function selectRecord(id: string) {
    const request = ++selectionRequest.current;
    setError('');
    setExtraSelected(null);
    if (data?.entries.some((e: any) => e.id === id)) {
      setSelected(id);
      return;
    }
    try {
      const result = await api('/crm/entries/' + id + '/history');
      if (currentScope.current !== scope || selectionRequest.current !== request) return;
      setExtraSelected(result.entry);
      setSelected(id);
    } catch (e) {
      if (currentScope.current === scope && selectionRequest.current === request)
        setError((e as Error).message);
    }
  }
  function recordUrl(id: string | null) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('crm-record', id);
    else url.searchParams.delete('crm-record');
    history.pushState(null, '', url.pathname + url.search + url.hash);
  }
  function openRecord(id: string) {
    recordUrl(id);
    void selectRecord(id);
  }
  function closeRecord() {
    selectionRequest.current++;
    recordUrl(null);
    setSelected(null);
    setExtraSelected(null);
  }
  useEffect(() => {
    if (!data) return;
    const sync = () => {
      const id = new URLSearchParams(location.search).get('crm-record');
      if (id) void selectRecord(id);
      else {
        selectionRequest.current++;
        setSelected(null);
        setExtraSelected(null);
      }
    };
    sync();
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, [scope, !!data]);
  async function status(entry: any, value: string, stage = entry.stage) {
    const { id: _, version, created_at: __, updated_at: ___, merged_into: ____, contact_completeness: _____, ...rest } = entry,
      prior = data;
    setMoving(true);
    setMoveNotice('');
    setError('');
    setData({
      ...data,
      entries: data.entries.map((e: any) =>
        e.id === entry.id ? { ...e, status: value, stage } : e,
      ),
    });
    try {
      await write(
        '/crm/entries/' + entry.id,
        { expected_version: version, entry: { ...rest, status: value, stage } },
        'PATCH',
      );
      setMoveNotice('Opportunity stage saved.');
    } catch (error) {
      setData(prior);
      setError((error as Error).message);
      throw error;
    } finally {
      setMoving(false);
    }
  }
  const entries: any[] = entryPage?.data || [];
  useEffect(
    () => setPage(1),
    [
      query,
      stateFilter,
      outcomeFilter,
      ownerFilter,
      stageFilter,
      teamFilter,
      currencyFilter,
      leadFilter,
      sortOrder,
      section,
    ],
  );
  const selectedEntry =
    data?.entries.find((e: any) => e.id === selected) ||
    (extraSelected?.id === selected ? extraSelected : null);
  return (
    <div className="apps-workspace crm-workspace">
      {moveNotice && (
        <p role="status" className="alert">
          {moveNotice}
        </p>
      )}
      {!writable && <p className="environment-note">Read-only access in your current role.</p>}
      {error && (
        <p role="alert" className="alert error">
          {error}
          <button className="quiet-button" onClick={() => setRevision((value) => value + 1)}>
            Retry CRM data
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Loading customer relationships…</p>}
      {data && (
        <>
          <nav className="crm-section-nav" aria-label="CRM sections">{[
            ['pipeline','Pipeline'],['leads','Leads'],['followups','Activities'],['forecast','Forecast'],['report','Reporting'],['plans','Activity Plans'],['duplicates','Duplicates'],['import','Import'],['customers','Customers'],['settings','Configuration'],
          ].map(([id,label])=><button key={id} className={section===id?'is-active':''} aria-current={section===id?'page':undefined} onClick={()=>changeSection(id)}>{label}</button>)}</nav>
          {teamError && (
            <p className="alert warning" role="alert">
              Team assignments could not load. CRM records remain available; retry team data before assigning.
              <button className="quiet-button" onClick={() => setRevision((value) => value + 1)}>
                Retry
              </button>
            </p>
          )}
          {customerError && section !== 'customers' && (
            <p className="alert warning" role="alert">
              The shared customer list could not load. Search and customer-linked actions may be limited.
              <button className="quiet-button" onClick={() => setRevision((value) => value + 1)}>
                Retry
              </button>
            </p>
          )}
          {section === 'dashboard' && (
            <div className="app-metric-grid">
              {[
                ['Shared customers', data.total_customers],
                ['New in 30 days', data.new_customers_30d],
                ['Active opportunities', data.active_opportunities],
                ['Follow-ups due', data.follow_ups_due],
              ].map(([label, n]) => (
                <article className="panel" key={label}>
                  <span>{label}</span>
                  <strong>{n}</strong>
                </article>
              ))}
            </div>
          )}
          {selectedEntry && (
            <CrmEntryDetails
              entry={selectedEntry}
              customers={customers}
              members={members}
              writable={writable && !moving}
              salesEnabled={salesEnabled}
              configuration={data.configuration}
              api={api}
              openQuotation={(quoteId) => {
                const url = new URL(location.href);
                url.searchParams.set('app', 'sales');
                url.searchParams.set('section', 'quotations');
                url.searchParams.set('crm-opportunity', selectedEntry.id);
                url.searchParams.set('sales-quotation', quoteId);
                url.hash = 'Apps';
                history.pushState(null, '', url.pathname + url.search + url.hash);
                dispatchEvent(new Event('africore:app-navigation'));
                navigate('Apps');
              }}
              newQuotation={() => {
                const url = new URL(location.href);
                url.searchParams.delete('sales-quotation');
                url.searchParams.set('app', 'sales');
                url.searchParams.set('section', 'quotations');
                url.searchParams.set('crm-opportunity', selectedEntry.id);
                url.hash = 'Apps';
                history.pushState(null, '', url.pathname + url.search + url.hash);
                dispatchEvent(new Event('africore:app-navigation'));
                navigate('Apps');
              }}
              refresh={() => setRevision((v) => v + 1)}
              close={closeRecord}
              save={(entry) =>
                write(
                  '/crm/entries/' + selectedEntry.id,
                  { expected_version: selectedEntry.version, entry },
                  'PATCH',
                ).then((result) => {
                  setExtraSelected(result);
                })
              }
              convert={(assignment) =>
                write('/crm/entries/' + selectedEntry.id + '/convert', {
                  expected_version: selectedEntry.version,
                  ...assignment,
                }).then((result) => {
                  setExtraSelected(result);
                })
              }
              qualify={(outcome, notes, reason) => write('/crm/entries/' + selectedEntry.id + '/qualify', { expected_version: selectedEntry.version, outcome, notes, reason }, 'POST').then((result) => setExtraSelected(result))}
            />
          )}{' '}
          {!selectedEntry &&
            (section === 'report' ? (
              <CrmReport
                api={api}
                configuration={data.configuration}
                members={members}
                open={openRecord}
              />
            ) : section === 'forecast' ? (
              <CrmForecast api={api} open={openRecord} writable={writable} members={members} />
            ) : section === 'plans' ? (
              <CrmActivityPlans api={api} members={members} writable={writable} />
            ) : section === 'duplicates' ? (
              <CrmDuplicates api={api} writable={writable} open={openRecord} />
            ) : section === 'import' ? (
              <CrmImport
                api={api}
                customers={customers}
                writable={writable}
                onSaved={() => {
                  changeSection('leads', true);
                  setRevision((v) => v + 1);
                }}
              />
            ) : section === 'settings' ? (
              <CrmSettings
                key={data.configuration.version}
                configuration={data.configuration}
                members={members}
                api={api}
                onSaved={() => setRevision((v) => v + 1)}
                admin={admin}
              />
            ) : section === 'customers' ? (
              <section className="panel">
                <div className="crm-customer-heading">
                  <h3>Customers</h3>
                  <Field label="Search all shared customers">
                    <input
                      type="search"
                      value={customerQuery}
                      placeholder="Name, email or phone"
                      onChange={(e) => {
                        setCustomerQuery(e.target.value);
                        setCustomerOffset(0);
                      }}
                    />
                  </Field>
                </div>
                {customerError && (
                  <p className="alert error" role="alert">
                    Customer directory unavailable: {customerError}
                  </p>
                )}
                {customerListLoading ? (
                  <p role="status">Searching shared customers…</p>
                ) : (
                  <div className="crm-customer-results" aria-label="Shared customers">
                    {customerRows.map((c) => (
                      <button
                        className="secondary-button"
                        key={c.id}
                        aria-pressed={activity?.customer?.id === c.id}
                        onClick={async () => {
                          setActivity(null);
                          setError('');
                          try {
                          const result = await api(
                            '/crm/customers/' + c.id + '/activity?' +
                              new URLSearchParams({ limit: '50', offset: '0' }),
                          );
                          setActivity(result);
                          setProfileContactType(result.profile.contact_type || 'individual');
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        <strong>{c.name}</strong>
                        <small>{c.email || c.phone || 'No contact details'}</small>
                      </button>
                    ))}
                    {!customerRows.length && <p>No shared customers match this search.</p>}
                  </div>
                )}
                <div className="form-actions">
                  <button
                    className="secondary-button"
                    disabled={customerOffset <= 0}
                    onClick={() => setCustomerOffset(Math.max(0, customerOffset - 50))}
                  >
                    Previous
                  </button>
                  <span>
                    {customerTotal ? customerOffset + 1 : 0}–
                    {Math.min(customerOffset + customerRows.length, customerTotal)} of {customerTotal}
                  </span>
                  <button
                    className="secondary-button"
                    disabled={customerOffset + customerRows.length >= customerTotal}
                    onClick={() => setCustomerOffset(customerOffset + 50)}
                  >
                    Next
                  </button>
                </div>
                {activity && (
                  <>
                    <h3>{activity.customer.name}</h3>
                    <p>
                      {activity.customer.email} · {activity.customer.phone}
                    </p>
                    <p>{activity.customer.address}</p>
                    <p>Tags: {activity.profile.tags.join(', ') || 'None'}</p>
                    <p>{activity.coverage}</p>
                    <h4>Interactions & tasks</h4>
                    {activity.entries.map((e: any) => (
                      <p key={e.id}>
                        {e.title} · {e.kind.replaceAll('_', ' ')} · {e.status}
                      </p>
                    ))}
                    <h4>Linked operations</h4>
                    <p>
                      {activity.quotation_count} quotations · {activity.order_count} orders
                    </p>
                    {activity.has_more && (
                      <button
                        className="secondary-button"
                        disabled={activityMoreLoading}
                        onClick={async () => {
                          setActivityMoreLoading(true);
                          try {
                            const offset = activity.offset + activity.limit;
                            const result = await api(
                              '/crm/customers/' + activity.customer.id + '/activity?' +
                                new URLSearchParams({ limit: String(activity.limit), offset: String(offset) }),
                            );
                            setActivity((previous: any) =>
                              previous?.customer?.id === result.customer.id
                                ? { ...result, entries: [...previous.entries, ...result.entries] }
                                : previous,
                            );
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setActivityMoreLoading(false);
                          }
                        }}
                      >
                        {activityMoreLoading ? 'Loading…' : `Load older CRM activity (${activity.entries_total} total)`}
                      </button>
                    )}
                    {activity.financial_activity && (
                      <p>
                        {activity.financial_activity.invoices.length} linked invoices visible to
                        your current role.
                      </p>
                    )}
                    <Form
                      key={activity.customer.id + ':' + activity.profile.version}
                      disabled={!writable}
                      submit={(d) =>
                        write(
                          '/crm/customers/' + activity.customer.id,
                          {
                            expected_version: activity.profile.version,
                            tags: d.tags
                              .split(',')
                              .map((s: string) => s.trim())
                              .filter(Boolean),
                            assigned_to: activity.profile.assigned_to,
                            contact_type: d.contact_type,
                            company_id: profileContactType === 'company' ? null : d.company_id || null,
                          },
                          'PUT',
                        ).then(() => setActivity(null))
                      }
                    >
                      <Field label="Contact type">
                        <select
                          name="contact_type"
                          defaultValue={activity.profile.contact_type || 'individual'}
                          onChange={(event) =>
                            setProfileContactType(event.target.value as 'individual' | 'company')
                          }
                        >
                          <option value="individual">Individual</option>
                          <option value="company">Company</option>
                        </select>
                      </Field>
                      {profileContactType !== 'company' && (
                        <Field label="Company relationship">
                          <CrmCustomerSelect
                            api={api}
                            name="company_id"
                            defaultValue={activity.profile.company_id || ''}
                            companyOnly
                            excludeId={activity.customer.id}
                          />
                        </Field>
                      )}
                      <Field label="Customer tags (comma separated)">
                        <input
                          name="tags"
                          defaultValue={activity.profile.tags.join(', ')}
                          maxLength={1000}
                        />
                      </Field>
                      <button className="secondary-button">Save shared tags</button>
                    </Form>
                  </>
                )}
              </section>
            ) : (
              <>
                {section === 'dashboard' && !board && (
                  <section className="panel">
                    <h3>Opportunity pipeline</h3>
                    <div className="app-pipeline">
                      {data.pipeline.map((p: any) => (
                        <div key={p.stage}>
                          <span>{p.name || p.stage}</span>
                          <strong>{p.count}</strong>
                        </div>
                      ))}
                    </div>
                    <p>Opportunity counts represent recorded stages, not revenue.</p>
                  </section>
                )}
                <div className="ac-odoo-view-root">
                  <div className="ac-odoo-cp">
                    <div className="ac-odoo-cp-left">
                      <button
                        className="button ac-odoo-new-btn"
                        disabled={!writable}
                        onClick={() => {
                          const el = document.getElementById(
                            'crm-create',
                          ) as HTMLDetailsElement | null;
                          if (el) {
                            el.open = true;
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                      >
                        New
                      </button>
                      {section === 'leads' && (
                        <button className="secondary-button" onClick={() => changeSection('import')}>
                          Import
                        </button>
                      )}
                      <div className="ac-breadcrumb">
                        <span className="ac-breadcrumb-parent">CRM</span>
                        <h3 className="ac-breadcrumb-title">
                          {section === 'pipeline'
                            ? 'Opportunities'
                            : section === 'leads'
                              ? 'Leads'
                              : section === 'followups'
                                ? 'Activities'
                                : 'Relationship records'}
                        </h3>
                      </div>
                    </div>

                    <div className="ac-odoo-cp-center">
                      <label className="ac-faceted-search" aria-label="Search all matching records">
                        {section === 'pipeline' && ownerFilter === 'mine' && (
                          <button
                            type="button"
                            className="ac-facet-chip"
                            onClick={() => setOwnerFilter('all')}
                            title="Clear My pipeline filter"
                          >
                            My Pipeline ×
                          </button>
                        )}
                        {section === 'pipeline' && outcomeFilter !== 'all' && (
                          <button
                            type="button"
                            className="ac-facet-chip is-neutral"
                            onClick={() => setOutcomeFilter('all')}
                            title="Clear outcome filter"
                          >
                            {outcomeFilter === 'active' ? 'Active' : outcomeFilter} ×
                          </button>
                        )}
                        <input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search..."
                        />
                        <span className="ac-kbd-hint">⌘K</span>
                      </label>

                      <details className="ac-filter-popover">
                        <summary className="secondary-button">Filters ▾</summary>
                        <div className="ac-filter-popover-panel">
                          {section === 'leads' && (
                            <Field label="Lead assignment">
                              <select value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)}>
                                <option value="all">All leads</option>
                                <option value="mine">My leads</option>
                                <option value="unassigned">Unassigned</option>
                                <option value="open">Open</option>
                                <option value="cancelled">Cancelled</option>
                                {members.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.display_name || m.email}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          )}
                          {section === 'followups' && (
                            <Field label="Activity window">
                              <select value={activityWindow} onChange={(e) => setActivityWindow(e.target.value)}>
                                <option value="all">All activities</option>
                                <option value="today">Due today</option>
                                <option value="overdue">Overdue</option>
                                <option value="upcoming">Upcoming</option>
                                <option value="completed">Completed</option>
                              </select>
                            </Field>
                          )}
                          {section === 'followups' && (
                            <Field label="Salesperson">
                              <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
                                <option value="mine">My activities</option>
                                <option value="all">All activities</option>
                                {members.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.display_name || m.email}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          )}
                          <Field label="Sort">
                            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                              <option value="recent">Newest first</option>
                              <option value="title">Title</option>
                            </select>
                          </Field>
                          {section === 'pipeline' && data.current_actor && (
                            <Field label="Salesperson">
                              <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
                                <option value="mine">My pipeline</option>
                                <option value="all">All authorized opportunities</option>
                                {members.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.display_name || m.email}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          )}
                          {section === 'pipeline' && (
                            <Field label="Stage">
                              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                                <option value="all">All stages</option>
                                {data.configuration.stages.map((s: any) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          )}
                          {section === 'pipeline' && data.configuration.teams.length > 0 && (
                            <Field label="Sales team">
                              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                                <option value="all">All teams</option>
                                {data.configuration.teams.filter((t: any) => t.active).map((t: any) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          )}
                          {section === 'pipeline' && (
                            <Field label="Outcome">
                              <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>
                                <option value="active">Active pipeline</option>
                                <option value="all">All outcomes</option>
                                <option value="won">Won</option>
                                <option value="lost">Lost</option>
                              </select>
                            </Field>
                          )}
                          <Field label="Record status">
                            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                              {['all', 'open', 'completed', 'cancelled', 'archived'].map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Currency">
                            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)}>
                              <option value="all">All currencies</option>
                              {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
                      </details>
                    </div>

                    <div className="ac-odoo-cp-right">
                      <span className="ac-odoo-count" role="status">
                        {listLoading ? 'Searching…' : `${entryPage?.total || 0} records`}
                      </span>
                      <div className="ac-view-switcher" role="group" aria-label="CRM record view">
                        {section === 'pipeline' && (
                          <button
                            type="button"
                            aria-pressed={board}
                            onClick={() => {
                              setBoard(true);
                              setCalendar(false);
                            }}
                          >
                            Kanban
                          </button>
                        )}
                        <button
                          type="button"
                          aria-pressed={!board && !calendar}
                          onClick={() => {
                            setBoard(false);
                            setCalendar(false);
                          }}
                        >
                          List
                        </button>
                        {section === 'pipeline' && (
                          <button
                            type="button"
                            aria-pressed={calendar}
                            onClick={() => {
                              setBoard(false);
                              setCalendar(true);
                            }}
                          >
                            Calendar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={board ? 'ac-odoo-kanban-surface' : 'panel crm-record-list'}>
                  {calendar ? (
                    <CrmCalendar entries={entries} open={openRecord} />
                  ) : board ? (
                    <CrmPipeline
                      stages={data.configuration.stages}
                      entries={entries}
                      stageSummary={entryPage?.stages || []}
                      customers={customers}
                      members={members}
                      writable={writable && !moving}
                      open={openRecord}
                      setPriority={async (e, priority) => {
                        const { id, version, created_at, updated_at, merged_into: _, contact_completeness: __, ...rest } = e;
                        await write(
                          '/crm/entries/' + id,
                          { expected_version: version, entry: { ...rest, priority } },
                          'PATCH',
                        );
                      }}
                      add={(stage) => {
                        setCreateStage(stage);
                        const el = document.getElementById(
                          'crm-create',
                        ) as HTMLDetailsElement | null;
                        if (el) {
                          el.open = true;
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                      move={(e, stage) => status(e, e.status, stage)}
                    />
                  ) : (
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Record</th>
                          <th>Stage / status</th>
                          <th>Due</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.slice((page - 1) * 25, page * 25).map((e: any) => (
                          <tr key={e.id}>
                            <td>
                              <div className="app-cell">
                                <button
                                  className="quiet-button"
                                  onClick={() => openRecord(e.id)}
                                  aria-label={'Open ' + e.title}
                                >
                                  {e.title}
                                </button>
                                <small>{e.kind.replaceAll('_', ' ')} · {customers.find((c) => c.id === e.customer_id)?.name || e.company || e.contact_name || 'Prospect'}</small>
                                {e.notes && <p>{e.notes}</p>}
                              </div>
                            </td>
                            <td>
                              <div className="app-cell">
                                {data.configuration.stages.find((s: any) => s.id === e.stage)
                                  ?.name || e.stage}{' '}
                                · {e.status}
                                {e.amount_minor > 0 && (
                                  <small>
                                    {money(e.amount_minor, e.currency)} opportunity value
                                  </small>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="app-cell">
                                {e.due_at ? new Date(e.due_at).toLocaleString() : 'No due date'}
                              </div>
                            </td>
                            <td>
                              <div className="app-cell">
                                {e.status === 'open' && (
                                  <Form
                                    disabled={!writable}
                                    className="compact-form"
                                    submit={(d) => status(e, d.status, d.stage)}
                                  >
                                    <select
                                      name="stage"
                                      aria-label="Pipeline stage"
                                      defaultValue={e.stage}
                                    >
                                      {data.configuration.stages.map((s: any) => (
                                        <option key={s.id} value={s.id}>
                                          {s.name}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      name="status"
                                      aria-label="Record status"
                                      defaultValue={e.status}
                                    >
                                      {['open', 'completed', 'cancelled', 'archived'].map((s) => (
                                        <option key={s}>{s}</option>
                                      ))}
                                    </select>
                                    <button className="secondary-button">Update</button>
                                  </Form>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  )}
                  {!board && !calendar && entries.length > 25 && (
                    <div className="form-actions">
                      <button
                        className="secondary-button"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Previous
                      </button>
                      <span>
                        Page {page} of {Math.ceil(entries.length / 25)}
                      </span>
                      <button
                        className="secondary-button"
                        disabled={page >= Math.ceil(entries.length / 25)}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                      </button>
                    </div>
                  )}
                  {!board && !listLoading && !entries.length && (
                    <p>No matching relationship records. Add a lead, opportunity or task below.</p>
                  )}
                  </div>
                </div>
                <details className="panel" id="crm-create">
                  <summary>New relationship record</summary>
                  <Form
                    disabled={!writable}
                    submit={(d) => {
                      if (createKind !== 'lead' && !d.customer) throw new Error('Choose a customer from the search results.');
                      return write('/crm/entries', {
                        ...crmExtraValues(d, parseMoney),
                        customer_id: d.customer || null,
                        kind: d.kind,
                        title: d.title,
                        notes: d.notes,
                        contact_name: d.contact_name || '',
                        company: d.company || '',
                        email: d.email || '',
                        phone: d.phone || '',
                        website: d.website || '',
                        country: d.country || '',
                        source: d.source || 'manual',
                        source_ref: d.source_ref || '',
                        business_need: d.business_need || '',
                        qualification_notes: d.qualification_notes || '',
                        stage: d.stage,
                        assigned_to: d.assigned_to || null,
                        due_at: d.due ? new Date(d.due).toISOString() : null,
                        amount_minor: parseMoney(d.amount || '0', d.currency),
                        currency: d.currency,
                      });
                    }}
                  >
                    <div className="form-grid">
                      <Field label={createKind === 'lead' ? 'Link existing Customer (optional for a prospect)' : 'Customer'}>
                        <CrmCustomerSelect api={api} name="customer" required={createKind !== 'lead'} />
                      </Field>
                      <Field label="Type">
                        <select
                          key={section}
                          name="kind"
                          onChange={(event) => setCreateKind(event.target.value)}
                          defaultValue={
                            section === 'pipeline'
                              ? 'opportunity'
                              : section === 'leads'
                                ? 'lead'
                                : 'follow_up'
                          }
                        >
                          {['lead', 'opportunity', 'follow_up', 'interaction'].map((s) => (
                            <option key={s} value={s}>
                              {s.replaceAll('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Title">
                        <input name="title" required minLength={2} maxLength={200} />
                      </Field>
                      {createKind === 'lead' && <>
                        <Field label="Contact name"><input name="contact_name" maxLength={200} placeholder="Person to contact" /></Field>
                        <Field label="Company"><input name="company" maxLength={200} placeholder="Prospect organization" /></Field>
                        <Field label="Email"><input name="email" type="email" maxLength={254} /></Field>
                        <Field label="Phone"><input name="phone" type="tel" maxLength={50} /></Field>
                        <Field label="Website"><input name="website" type="url" maxLength={500} /></Field>
                        <Field label="Country"><input name="country" maxLength={100} /></Field>
                        <Field label="Lead source"><select name="source" defaultValue="manual">{['manual', 'imported', 'website', 'referral', 'campaign', 'other'].map((source) => <option key={source}>{source}</option>)}</select></Field>
                        <Field label="Source reference"><input name="source_ref" maxLength={200} /></Field>
                        <Field label="Business need"><textarea name="business_need" maxLength={2000} /></Field>
                        <Field label="Qualification notes"><textarea name="qualification_notes" maxLength={4000} /></Field>
                      </>}
                      <Field label="Stage">
                        <select
                          key={createStage}
                          name="stage"
                          defaultValue={createStage || data.configuration.stages[0]?.id}
                        >
                          {data.configuration.stages.map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Due time (required for follow-up)">
                        <input name="due" type="datetime-local" required={createKind === 'follow_up'} />
                      </Field>
                      <Field label="Assigned member">
                        <select name="assigned_to">
                          <option value="">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.display_name || m.email} · {m.role}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={createKind === 'lead' ? 'Expected value' : 'Opportunity amount'}>
                        <input name="amount" defaultValue="0" inputMode="decimal" />
                      </Field>
                      <Field label="Currency">
                        <select name="currency">
                          {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Field>
                      <CrmExtraFields configuration={data.configuration} />
                    </div>
                    <Field label="Notes">
                      <textarea name="notes" maxLength={4000} />
                    </Field>
                    <button className="button">Create record</button>
                  </Form>
                </details>
              </>
            ))}
          {hasMore && ['pipeline', 'leads', 'followups'].includes(section) && (
            <button
              className="secondary-button"
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                try {
                  const result = await api(
                    '/crm/entries?' + entryParams(entryPage.offset + entryPage.limit),
                  );
                  setEntryPage((previous: any) => ({
                    ...result,
                    data: [...(previous?.data || []), ...result.data],
                  }));
                  setHasMore(result.has_more);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setLoadingMore(false);
                }
              }}
            >
              {loadingMore ? 'Loading…' : `Load more records (${entryPage?.total || 0} total)`}
            </button>
          )}
          <small>
            {data.coverage} · Updated {new Date(data.as_of).toLocaleString()}
          </small>
          <button className="quiet-button" onClick={() => setRevision((v) => v + 1)}>
            Refresh CRM
          </button>
        </>
      )}
    </div>
  );
}
