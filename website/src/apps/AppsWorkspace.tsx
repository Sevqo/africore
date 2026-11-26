import { CommerceMerchantWorkspace } from './lazy-workspaces';
import { POSAppWorkspace } from './lazy-workspaces';
import { ProcurementAppWorkspace } from './lazy-workspaces';
import { DocumentsWorkspace } from './lazy-workspaces';
import { PeopleWorkspace } from './lazy-workspaces';
import { WorkWorkspace } from './lazy-workspaces';
import { AccountingAppWorkspace } from './lazy-workspaces';
import { BusinessIDWorkspace } from './lazy-workspaces';
import { useIdempotentAPI } from './useIdempotentAPI';
import { appNavigationEvent, AppSectionTabs } from './AppNavigation';
import { allowanceLabel } from '../marketplace/usage-presentation';
import { AutomationsWorkspace } from './lazy-workspaces';
import { SalesAppWorkspace } from './lazy-workspaces';
import { AnalyticsWorkspace } from './lazy-workspaces';
import { CrmWorkspace } from './lazy-workspaces';
import { InventoryAppWorkspace } from './lazy-workspaces';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Overlay } from '../components/Overlay';
import { CardGridSkeleton } from '../components/Skeleton';
import { peekQuery } from '../lib/query-cache';
import { isDemo } from '../demo/transport';
import { money, type API } from '../operations/UI';
import {
  ExtendedAppWorkspace,
  FinanceAppWorkspace,
  OdooSuiteExpansionWorkspace,
} from './lazy-workspaces';
import { CalendarWorkspace, WebsiteWorkspace } from './lazy-workspaces';
import { PersonalSubscriptions } from '../accounts/PersonalSubscriptions';
import { appIcons as icons } from './appIcons';
import { appPortfolioPath } from './app-portfolio-path';
import './apps.css';
import './minimal-workspace-shell.css';
type Props = {
  openRecord?: (tab: string, id: string) => void;
  role?: string;
  services?: any[];
  api: API;
  scope: string;
  manager: boolean;
  navigate: (tab: string) => void;
  onServicesChanged: () => void;
  timezone?: string;
};
export function AppsWorkspace({
  api: providedApi,
  scope,
  manager,
  navigate,
  onServicesChanged,
  services = [],
  role,
  openRecord,
  timezone,
}: Props) {
  const api = useIdempotentAPI(providedApi, scope),
    [orgId = '', env = 'sandbox'] = scope.split('\0'),
    writable = [
      'owner',
      'admin',
      'finance',
      'accountant',
      'hr',
      'sales',
      'operations',
      'inventory_manager',
      'support_agent',
      'marketing_manager',
    ].includes(role || ''),
    financeWritable = ['owner', 'admin', 'finance', 'accountant'].includes(role || '');
  const [catalog, setCatalog] = useState<any>(() =>
      orgId ? peekQuery<any>('/api/v1/organizations/' + orgId + '/apps', env, isDemo()) || null : null,
    ),
    [selected, setSelectedState] = useState(
      () => new URLSearchParams(location.search).get('app') || '',
    ),
    [review, setReview] = useState<any>(null),
    [optional, setOptional] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [section, setSection] = useState(
      () => new URLSearchParams(location.search).get('section') || '',
    ),
    [remove, setRemove] = useState(false),
    [serviceAction, setServiceAction] = useState('keep');
  useEffect(() => {
    let current = true;
    const warm = orgId
      ? peekQuery<any>('/api/v1/organizations/' + orgId + '/apps', env, isDemo())
      : null;
    if (warm) setCatalog(warm);
    else setCatalog(null);
    setError('');
    api('/apps')
      .then((r) => {
        if (current) setCatalog(r);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [scope, revision]);
  useEffect(() => {
    setSelectedState(new URLSearchParams(location.search).get('app') || '');
    setReview(null);
    setOptional([]);
  }, [scope]);
  useEffect(() => {
    const pop = () => {
      setSelectedState(new URLSearchParams(location.search).get('app') || '');
      setSection(new URLSearchParams(location.search).get('section') || '');
    };
    addEventListener('popstate', pop);
    addEventListener(appNavigationEvent, pop);
    return () => {
      removeEventListener('popstate', pop);
      removeEventListener(appNavigationEvent, pop);
    };
  }, []);
  function setSelected(value: string) {
    const url = new URL(location.href);
    if (value) url.searchParams.set('app', value);
    else url.searchParams.delete('app');
    url.searchParams.delete('section');
    history.pushState(null, '', url.pathname + url.search + url.hash);
    setSelectedState(value);
    setSection('');
    dispatchEvent(new Event(appNavigationEvent));
  }
  const [directoryQuery, setDirectoryQuery] = useState(''),
    [installedOnly, setInstalledOnly] = useState(false);
  const roleTitles: Record<string, string> = {
    owner: 'Workspace Owner',
    admin: 'Administrator',
    finance: 'Finance Manager',
    accountant: 'Accountant',
    hr: 'HR & People Manager',
    sales: 'Sales Representative',
    operations: 'Operations Lead',
    inventory_manager: 'Inventory & Warehouse Manager',
    support_agent: 'Customer Support Agent',
    marketing_manager: 'Marketing Manager',
    viewer: 'Workspace Viewer',
  };
  const effectiveRole = catalog?.role || role || 'viewer',
    roleLabel = roleTitles[effectiveRole] || effectiveRole,
    workspaceKind = catalog?.kind || 'business',
    restrictedApps: { id: string; name: string; description: string }[] =
      catalog?.restricted_apps || [],
    totalWorkspaceApps: number =
      catalog?.total_workspace_apps ?? (catalog?.apps?.length || 0) + restrictedApps.length;
  const directoryApps = (catalog?.apps || []).filter(
    (a: any) =>
      (!installedOnly || a.installation?.status === 'installed') &&
      (a.name + ' ' + a.description).toLowerCase().includes(directoryQuery.trim().toLowerCase()),
  );
  const app = catalog?.apps.find((a: any) => a.id === selected),
    installed = app?.installation?.status === 'installed',
    activeSection = app?.navigation?.some((item: any) => item.section === section)
      ? section
      : app?.navigation?.[0]?.section || 'dashboard';
  async function prepare(uninstall = false) {
    setBusy(true);
    setError('');
    try {
      const value = await api(
        '/apps/' +
          app.id +
          (uninstall
            ? '/uninstallation-preview'
            : '/installation-preview' +
              (optional.length ? '?optional=' + encodeURIComponent(optional.join(',')) : '')),
      );
      setRemove(uninstall);
      setReview(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!review) return;
    setBusy(true);
    setError('');
    try {
      await api(
        '/apps/' + app.id + (remove ? '/uninstall' : '/install'),
        'POST',
        remove
          ? { review_hash: review.review_hash, service_action: serviceAction }
          : { review_hash: review.review_hash, optional_services: review.optional_services },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setReview(null);
      setRevision((v) => v + 1);
      onServicesChanged();
      dispatchEvent(new Event('africore:apps-changed'));
    } catch (e) {
      setReview(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="apps-workspace"
      data-app-selected={!!app}
      data-app-installed={installed}
      data-app-id={app?.id}
    >
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!catalog && !error && <CardGridSkeleton count={8} label="Loading workspace apps…" />}
      {!app && catalog && (
        <>
          <section
            className={
              'panel app-permission-banner' +
              (restrictedApps.length > 0 ? ' is-role-scoped' : '')
            }
            aria-label="Workspace app permissions"
          >
            <div className="app-permission-banner-main">
              <div className="app-permission-badges">
                <span className="badge">
                  {workspaceKind === 'personal'
                    ? 'Personal workspace'
                    : workspaceKind === 'developer'
                      ? 'Developer console'
                      : `Your role: ${roleLabel}`}
                </span>
                <span className="badge app-permission-count">
                  {restrictedApps.length > 0
                    ? `${catalog.apps.length} of ${totalWorkspaceApps} apps permitted`
                    : `${catalog.apps.length} workspace apps included`}
                </span>
              </div>
              {restrictedApps.length > 0 ? (
                <p>
                  Showing the <strong>{catalog.apps.length} apps</strong> you have permission to
                  access in this workspace for your <strong>{roleLabel}</strong> role. The remaining{' '}
                  {restrictedApps.length} company apps are assigned to other department roles or
                  administrators.
                </p>
              ) : workspaceKind === 'personal' ? (
                <p>
                  Personal workspace suite — equipped with the{' '}
                  <strong>{catalog.apps.length} essential apps</strong> for individual work, client
                  invoicing, personal finances, projects, documents, scheduling, and personal pages
                  (without company HR or retail bloat).
                </p>
              ) : workspaceKind === 'developer' ? (
                <p>
                  Developer sandbox suite — equipped with{' '}
                  <strong>{catalog.apps.length} engineering apps</strong> for custom schemas,
                  connectors, event pipelines, workflow automations, and API telemetry.
                </p>
              ) : (
                <p>
                  Full workspace access — your <strong>{roleLabel}</strong> role has permission to
                  open and manage all <strong>{catalog.apps.length} business apps</strong> in this
                  workspace.
                </p>
              )}
            </div>
            {restrictedApps.length > 0 && (
              <details className="app-restricted-disclosure">
                <summary>
                  View {restrictedApps.length} apps restricted from your current role
                </summary>
                <p className="app-restricted-note">
                  Need access to one of these modules? Ask a Workspace Owner or Administrator in{' '}
                  <strong>Team</strong> settings to update your role.
                </p>
                <div className="app-restricted-grid">
                  {restrictedApps.map((item) => (
                    <div className="app-restricted-item" key={item.id}>
                      <span className="app-mark app-mark-locked" aria-hidden="true">
                        <Icon name={icons[item.id] || 'grid'} />
                      </span>
                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </div>
                      <span className="badge">Role restricted</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
          <div className="ac-control-panel app-directory-toolbar">
            <label className="ac-faceted-search">
              <span className="ac-facet-chip">
                {restrictedApps.length > 0 ? 'Permitted Apps' : 'App Directory'}
              </span>
              <input
                type="search"
                value={directoryQuery}
                onChange={(e) => setDirectoryQuery(e.target.value)}
                placeholder={
                  restrictedApps.length > 0
                    ? `Search your ${catalog.apps.length} permitted apps...`
                    : `Search ${catalog.apps.length} workspace apps...`
                }
              />
              <span className="ac-kbd-hint">⌘K</span>
            </label>
            <div className="ac-filter-pills">
              <button
                type="button"
                className="ac-pill"
                aria-pressed={!installedOnly}
                onClick={() => setInstalledOnly(false)}
              >
                All ({(catalog?.apps || []).length})
              </button>
              <button
                type="button"
                className="ac-pill"
                aria-pressed={installedOnly}
                onClick={() => setInstalledOnly(true)}
              >
                Installed ({(catalog?.apps || []).filter((a: any) => a.installation?.status === 'installed').length})
              </button>
              <span role="status" className="badge">
                {directoryApps.length} apps
              </span>
            </div>
          </div>
          {!directoryApps.length && (
            <section className="panel">
              <h2>No matching apps</h2>
              <p>Try another name or turn off the installed filter.</p>
            </section>
          )}
          <div className="app-directory">
            {directoryApps.map((a: any) => (
              <article className="panel app-directory-card" key={a.id}>
                <span className={'app-mark app-mark-' + a.id}>
                  <Icon name={icons[a.id]} />
                </span>
                <div>
                  <h2>{a.name}</h2>
                  <p>{a.description}</p>
                  <span className="badge">
                    {a.installation?.status === 'installed' ? 'Installed' : 'Available to install'}
                  </span>
                  {a.required_services?.length > 0 && (
                    <p className="app-directory-requirements">
                      Requires{' '}
                      {a.required_services
                        .map((id: string) => {
                          const service = services.find((candidate: any) => candidate.id === id);
                          const state = service?.status || 'catalog check required';
                          return `${id.replaceAll('_', ' ')} (${state.replaceAll('_', ' ')})`;
                        })
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <button
                  className="secondary-button"
                  aria-label={
                    a.installation?.status === 'installed'
                      ? `Open ${a.name}`
                      : `Review ${a.name} installation`
                  }
                  onClick={() => {
                    setSelected(a.id);
                    setOptional([]);
                  }}
                >
                  {a.installation?.status === 'installed' ? 'Open app' : 'Install'}{' '}
                  <Icon name="right" />
                </button>
              </article>
            ))}
          </div>
          {workspaceKind === 'business' &&
            ['owner', 'admin', 'operations'].includes(effectiveRole) && (
              <details className="panel">
                <summary>
                  Extended Operations Suite (POS · CRM · Work · Payroll · Subscriptions · Support ·
                  Marketing · MRP · Fleet · Logistics)
                </summary>
                <OdooSuiteExpansionWorkspace
                  api={api}
                  scope={scope}
                  writable={writable}
                  financeWritable={financeWritable}
                />
              </details>
            )}
        </>
      )}
      {app && (
        <>
          <header className="app-identity">
            <span className={'app-mark app-mark-' + app.id}>
              <Icon name={icons[app.id]} />
            </span>
            <div>
              <div className="app-title">
                <h1>{app.name}</h1>
                <span className="badge">
                  {installed
                    ? 'Installed'
                    : app.availability === 'preview'
                      ? 'Evaluation preview'
                      : 'Available'}
                </span>
                {app.degraded && <span className="badge">Service attention needed</span>}
              </div>
              <p>{app.description}</p>
            </div>
          </header>
          <p className="environment-note">
            {catalog.environment === 'sandbox'
              ? (
                  {
                    finance:
                      'Sandbox · Recorded financial activity remains separate from simulated payment confirmations.',
                    commerce: 'Storefront evaluation · Sandbox checkout only.',
                    pos: 'Counter evaluation · Network connection required.',
                    people:
                      'Sandbox workspace · People access controls apply to employment records.',
                    documents:
                      'Sandbox workspace · Files retain their individual sharing permissions.',
                    business_id: 'Sandbox workspace · Review each record’s source and assurance.',
                  } as Record<string, string>
                )[app.id] || 'Sandbox workspace · Test records'
              : 'Production record environment'}
          </p>
          <details className="app-service-details">
            <summary>Included services &amp; app information</summary>
            <section className="app-inclusions">
              <div>
                <h3>This app includes the following services</h3>
                <div className="app-service-chips">
                  {app.required_services.map((id: string) => (
                    <span key={id}>
                      <Icon
                        name={
                          id === 'cash_flow' ? 'chart' : id === 'payments' ? 'payment' : 'document'
                        }
                      />
                      <span>
                        {services.find((s) => s.id === id)?.name || id.replaceAll('_', ' ')}
                        <small>
                          {services.find((s) => s.id === id)?.status?.replaceAll('_', ' ') ||
                            'Review service access'}
                        </small>
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              <aside>
                <h3>About this app</h3>
                <p>{app.description}</p>
                <a href={appPortfolioPath(app.id)}>
                  Learn more <Icon name="right" />
                </a>
              </aside>
            </section>
          </details>
          {!installed ? (
            <section className="panel">
              <h3>Review services before installing</h3>
              {app.setup.map((notice: string) => (
                <p key={notice}>{notice}</p>
              ))}
              <p>
                Required services are reviewed together. Choose optional services only if you need
                them.
              </p>
              {app.optional_services.map((id: string) => (
                <label className="checkbox-field" key={id}>
                  <input
                    type="checkbox"
                    checked={optional.includes(id)}
                    disabled={!manager || busy}
                    onChange={(e) =>
                      setOptional((v) =>
                        e.target.checked ? [...v, id] : v.filter((s) => s !== id),
                      )
                    }
                  />
                  {id.replaceAll('_', ' ')}
                </label>
              ))}
              {manager ? (
                <button className="button" disabled={busy} onClick={() => prepare()}>
                  Review installation
                </button>
              ) : (
                <p>A workspace owner or administrator can install this app.</p>
              )}
            </section>
          ) : (
            <>
              {!['crm', 'accounting', 'pos', 'procurement', 'sales', 'inventory'].includes(
                app.id,
              ) &&
                app.navigation?.length > 1 && (
                  <AppSectionTabs app={app} section={activeSection} navigate={navigate} />
                )}
              {app.id === 'pos' ? (
                <POSAppWorkspace
                  key={scope}
                  api={api}
                  scope={scope}
                  section={activeSection}
                  navigate={navigate}
                  services={services}
                />
              ) : app.id === 'commerce' ? (
                <CommerceMerchantWorkspace
                  key={scope}
                  api={api}
                  scope={scope}
                  manager={manager}
                  section={activeSection}
                  navigate={navigate}
                />
              ) : app.id === 'procurement' ? (
                <ProcurementAppWorkspace
                  key={scope}
                  api={api}
                  scope={scope}
                  section={activeSection}
                  navigate={navigate}
                />
              ) : app.id === 'documents' ? (
                <DocumentsWorkspace
                  embedded
                  key={scope}
                  api={api}
                  scope={scope}
                  section={activeSection}
                />
              ) : app.id === 'people' ? (
                <PeopleWorkspace key={scope} api={api} scope={scope} section={activeSection} />
              ) : app.id === 'business_id' ? (
                <BusinessIDWorkspace
                  key={scope}
                  scope={scope}
                  role={role || 'viewer'}
                  services={services}
                  section={activeSection}
                />
              ) : app.id === 'accounting' ? (
                <AccountingAppWorkspace
                  key={scope}
                  api={api}
                  scope={scope}
                  manager={manager}
                  navigate={navigate}
                  section={activeSection}
                />
              ) : app.id === 'work' ? (
                <WorkWorkspace
                  key={scope}
                  api={api}
                  scope={scope}
                  section={activeSection}
                  openRecord={openRecord}
                />
              ) : app.id === 'finance' ? (
                <FinanceAppWorkspace
                  key={scope}
                  api={api}
                  scope={scope}
                  navigate={navigate}
                  section={activeSection}
                  services={services}
                  writable={financeWritable}
                  role={role || 'viewer'}
                  admin={manager}
                  timezone={timezone}
                  openRecord={openRecord}
                />
              ) : app.id === 'crm' ? (
                <CrmWorkspace
                  admin={manager}
                  api={api}
                  scope={scope}
                  navigate={navigate}
                  initialSection={activeSection}
                  writable={writable}
                  salesEnabled={services.some(
                    (service) => service.id === 'sales' && service.status === 'active',
                  )}
                />
              ) : app.id === 'inventory' ? (
                <InventoryAppWorkspace
                  api={api}
                  scope={scope}
                  section={activeSection}
                  navigate={navigate}
                  services={services}
                  writable={writable}
                />
              ) : app.id === 'sales' ? (
                <SalesAppWorkspace
                  admin={manager}
                  api={api}
                  scope={scope}
                  navigate={navigate}
                  services={services}
                  writable={writable}
                  section={activeSection}
                />
              ) : app.id === 'analytics' ? (
                <AnalyticsWorkspace
                  api={api}
                  scope={scope}
                  manager={manager}
                  section={activeSection}
                  kind={catalog.kind}
                  navigate={navigate}
                  openRecord={openRecord}
                />
              ) : app.id === 'automations' ? (
                <AutomationsWorkspace
                  role={role}
                  api={api}
                  scope={scope}
                  navigate={navigate}
                  section={activeSection}
                />
              ) : app.id === 'calendar' ? (
                <CalendarWorkspace key={scope} api={api} scope={scope} section={activeSection} />
              ) : app.id === 'website' ? (
                <WebsiteWorkspace key={scope} api={api} scope={scope} section={activeSection} />
              ) : app.id === 'subscriptions' && catalog.kind === 'personal' ? (
                <PersonalSubscriptions
                  key={scope}
                  api={api}
                  scope={scope}
                  timezone={timezone}
                  writable={writable}
                />
              ) : [
                  'marketing',
                  'support',
                  'subscriptions',
                  'manufacturing',
                  'field_operations',
                  'logistics',
                  'property_hospitality',
                  'knowledge_learning',
                  'studio',
                  'integrations_hub',
                ].includes(app.id) ? (
                <ExtendedAppWorkspace
                  key={scope + ':' + app.id}
                  appId={app.id}
                  section={activeSection}
                  api={api}
                  scope={scope}
                  writable={writable}
                />
              ) : (
                <section className="panel">
                  <h2>Workspace interface update required</h2>
                  <p>
                    This app needs a newer interface. Your shared records remain in their existing
                    services.
                  </p>
                  <button className="secondary-button" onClick={() => location.reload()}>
                    Reload the workspace interface
                  </button>
                </section>
              )}
              <details className="panel related-apps">
                <summary>Switch to another app</summary>
                <section>
                  <div className="section-heading">
                    <h3>Other AfriCore Apps</h3>
                    <button className="quiet-button" onClick={() => setSelected('')}>
                      View all apps <Icon name="right" />
                    </button>
                  </div>
                  <div>
                    {catalog.apps
                      .filter((a: any) => a.id !== app.id)
                      .map((a: any) => (
                        <button
                          key={a.id}
                          className="related-app"
                          onClick={() => {
                            setSelected(a.id);
                            setOptional([]);
                          }}
                        >
                          <span className={'app-mark app-mark-' + a.id}>
                            <Icon name={icons[a.id]} />
                          </span>
                          <span>
                            <strong>{a.name.replace('AfriCore ', '')}</strong>
                            <small>
                              {a.installation?.status === 'installed' ? 'Installed' : 'Explore app'}
                            </small>
                          </span>
                        </button>
                      ))}
                  </div>
                </section>
              </details>
              {manager && (
                <details className="panel">
                  <summary>Installation settings</summary>
                  <p>{app.uninstall}</p>
                  {app.setup.map((notice: string) => (
                    <p key={notice}>{notice}</p>
                  ))}
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => prepare(true)}
                  >
                    Review uninstall
                  </button>
                </details>
              )}
            </>
          )}
        </>
      )}
      {review && (
        <Overlay onClose={() => !busy && setReview(null)}>
          <section
            className="panel app-install-review"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-review-title"
          >
            <h2 id="app-review-title">
              {remove ? 'Review uninstall' : 'Review installation'} · {app.name}
            </h2>
            {remove ? (
              <>
                <p>All historical records are retained. Shared services remain available.</p>
                {review.services.map((s: any) => (
                  <p key={s.id}>
                    {s.id.replaceAll('_', ' ')} ·{' '}
                    {s.shared ? 'Used by another activation' : 'Sole app reference'}
                  </p>
                ))}
                <label className="field">
                  <span>Sole-use services</span>
                  <select value={serviceAction} onChange={(e) => setServiceAction(e.target.value)}>
                    <option value="keep">Keep active for direct use</option>
                    <option value="deactivate_sole">
                      Deactivate services used only by this app
                    </option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <p>{review.notice}</p>
                <p>
                  Installation: {money(0, 'KES')} · {review.environment}
                </p>
                {review.services.map((s: any) => (
                  <article className="app-price-review" key={s.id}>
                    <h3>{s.name}</h3>
                    <p>
                      {s.status.replaceAll('_', ' ')} · {s.price.description}
                    </p>
                    <p>
                      {s.price.model} · {s.unit} · Original price version {s.price.version}
                    </p>
                    <p>
                      Fixed: {money(s.price.fixed_minor, s.price.currency)} · Unit:{' '}
                      {money(s.price.unit_minor, s.price.currency)} · Included:{' '}
                      {allowanceLabel({ ...s.price, remaining_allowance: s.price.included })}
                    </p>
                    {s.price.tiers?.length > 0 && (
                      <p>{s.price.tiers.map((t: any) => JSON.stringify(t)).join(' · ')}</p>
                    )}
                    {s.setup?.length > 0 && <p>Setup requirements: {s.setup.join(', ')}</p>}
                  </article>
                ))}
                {review.policy_review && (
                  <p className="alert">
                    {review.policy_review.notice} Issued-invoice credits require a different
                    authorized reviewer.
                  </p>
                )}
                <p>Collection remains disabled. This confirmation does not enable live funds.</p>
              </>
            )}
            <div className="form-actions">
              <button className="secondary-button" disabled={busy} onClick={() => setReview(null)}>
                Cancel
              </button>
              <button className="button" disabled={busy} onClick={confirm}>
                {busy ? 'Saving…' : remove ? 'Confirm uninstall' : 'Confirm reviewed installation'}
              </button>
            </div>
          </section>
        </Overlay>
      )}
    </div>
  );
}
