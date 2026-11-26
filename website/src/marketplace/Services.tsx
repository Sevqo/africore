import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, apiFetch } from '../lib/api-client';
import { peekQuery } from '../lib/query-cache';
import { Overlay } from '../components/Overlay';
import { Icon, type IconName } from '../components/Icon';
import { CardGridSkeleton } from '../components/Skeleton';
import { serviceCatalog, serviceForTab, foundationTabs } from '../../../src/marketplace/catalog';
import { serviceFamilies, serviceFamilyFor } from '../../../src/marketplace/families';
import {
  WORKSPACE_ALL_APPS_CAP_MINOR,
  commercialRateFor,
  commercialServiceRates,
} from '../../../src/marketplace/pricing-catalog';
import './services.css';
import { allowanceLabel, formatUnits, planLabel, selectUsage } from './usage-presentation';
import { serviceOpenDestination } from './service-open-destination';
import { marketTabs, type WorkspaceKind } from '../workspace-navigation';
export { marketTabs };

const BUNDLE_PARENTS: Record<string, string> = {
  customers: 'crm',
  expenses: 'cash_flow',
  orders: 'sales',
  fulfillment: 'inventory',
  forecasting: 'intelligence',
  verification: 'passport',
  credentials: 'passport',
  trust_network: 'passport',
  blockchain: 'passport',
  connect: 'data',
};

const TIER_LABELS: Record<string, 'Foundation' | 'Essential' | 'Core ERP' | 'Pay-As-You-Go'> = {
  free: 'Foundation',
  essential: 'Essential',
  core_erp: 'Core ERP',
  pay_as_you_go: 'Pay-As-You-Go',
};

/** Reference commercial schedule in KES minor units (cents) sourced from pricing-catalog.ts. */
const COMMERCIAL_TIERS_KES: Record<
  string,
  {
    tier: 'Foundation' | 'Essential' | 'Core ERP' | 'Pay-As-You-Go';
    monthlyMinor: number;
    summary: string;
    bundle?: string;
  }
> = Object.fromEntries(
  Object.entries(commercialServiceRates).map(([id, rate]) => [
    id,
    {
      tier: TIER_LABELS[rate.tier] || 'Essential',
      monthlyMinor: rate.monthly_minor,
      summary: rate.summary,
      ...(BUNDLE_PARENTS[id] ? { bundle: BUNDLE_PARENTS[id] } : {}),
    },
  ]),
);

function serviceIconFor(id: string): IconName {
  if (/payment|reconciliation|protected/.test(id)) return 'payment';
  if (/accounting/.test(id)) return 'calculator';
  if (/report|cash|intelligence|forecast|income|expense/.test(id)) return 'chart';
  if (/customer|crm|people/.test(id)) return 'users';
  if (/product|inventory/.test(id)) return 'box';
  if (/procurement/.test(id)) return 'network';
  if (/fulfillment/.test(id)) return 'truck';
  if (/commerce|order|sale|pos/.test(id)) return 'bag';
  if (/calendar/.test(id)) return 'calendar';
  if (/website/.test(id)) return 'globe';
  if (/passport|verification|credential|trust|blockchain/.test(id)) return 'shield';
  if (/automation|assistant/.test(id)) return 'bolt';
  if (/webhook|connect|developer|data/.test(id)) return 'plug';
  if (/work/.test(id)) return 'grid';
  return 'document';
}
export function useMarketplace(
  org: string,
  environment: string,
  kind: string,
  initial?: any,
  demo = false,
) {
  const scope = org + '\0' + environment;
  const cached = org
    ? peekQuery<any>('/api/v1/organizations/' + org + '/services', environment, demo)
    : undefined;
  const [state, setState] = useState<{ scope: string; catalog: any; error: string; busy: boolean }>(
    {
      scope,
      catalog:
        initial?.workspace_id === org && initial?.environment === environment
          ? initial
          : cached?.workspace_id === org
            ? cached
            : null,
      error: '',
      busy: false,
    },
  );
  const [revision, setRevision] = useState(0);
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (!org) return;
    if (demo) {
      setState({
        scope,
        catalog: {
          workspace_id: org,
          environment,
          services: serviceCatalog
            .filter((s) => s.kinds.includes(kind as any))
            .map((s) => ({
              ...s,
              status: 'active',
              entitlement: { favorite: false, position: 0 },
              price: { model: 'free', description: 'Isolated browser demonstration.' },
            })),
        },
        error: '',
        busy: false,
      });
      return;
    }
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      if (initial?.workspace_id === org && initial?.environment === environment && revision === 0)
        return;
    }
    let live = true;
    setState((s) => ({
      scope,
      catalog: s.scope === scope ? s.catalog : null,
      error: '',
      busy: true,
    }));
    api('/api/v1/organizations/' + org + '/services', 'GET', undefined, environment)
      .then((catalog) => {
        if (live) setState({ scope, catalog, error: '', busy: false });
      })
      .catch((e) => {
        if (live)
          setState((s) => ({
            scope,
            catalog: s.scope === scope ? s.catalog : null,
            error: e.message,
            busy: false,
          }));
      });
    return () => {
      live = false;
    };
  }, [org, environment, kind, revision, demo]);
  const current = state.scope === scope ? state : { catalog: null, error: '', busy: true };
  return { ...current, org, environment, demo, kind, reload: () => setRevision((n) => n + 1) };
}
export type MarketplaceState = ReturnType<typeof useMarketplace>;
const trustServices = ['passport', 'verification', 'credentials', 'trust_network', 'blockchain'];
const apiExplorerServices = [
  'developer_api',
  'customers',
  'orders',
  'invoicing',
  'payments',
  'reconciliation',
  'connect',
  'data',
];
const tabServices = (tab: string) =>
  ['Customers', 'Clients'].includes(tab)
    ? ['customers', 'invoicing', 'orders']
    : tab === 'Business Passport'
      ? trustServices
      : tab === 'API Explorer'
        ? apiExplorerServices
        : [serviceForTab(tab)];
export function favoriteTabs(m: MarketplaceState): string[] {
  return (m.catalog?.services || [])
    .filter((s: any) => s.status === 'active' && s.entitlement?.favorite)
    .sort(
      (a: any, b: any) =>
        a.entitlement.position - b.entitlement.position || a.name.localeCompare(b.name),
    )
    .flatMap((s: any) => s.tabs.slice(0, 1));
}
export function visibleServiceTab(m: MarketplaceState, tab: string) {
  if (tab === 'Apps' || foundationTabs.includes(tab) || marketTabs.includes(tab)) return true;
  return !!m.catalog?.services.some(
    (s: any) => tabServices(tab).includes(s.id) && ['active', 'requires_setup'].includes(s.status),
  );
}
export function canReadServiceTab(m: MarketplaceState, tab: string) {
  if (
    tab === 'Apps' ||
    foundationTabs.includes(tab) ||
    marketTabs.includes(tab) ||
    tab === 'Engineering'
  )
    return true;
  return !!m.catalog?.services.some(
    (s: any) =>
      tabServices(tab).includes(s.id) && ['active', 'requires_setup', 'disabled'].includes(s.status),
  );
}
export function ServiceGate({
  market,
  tab,
  navigate,
  children,
}: {
  market: MarketplaceState;
  tab: string;
  navigate: (tab: string) => void;
  children: ReactNode;
}) {
  if (!serviceForTab(tab)) return <>{children}</>;
  if (market.busy && !market.catalog) return <p role="status">Loading your service access…</p>;
  if (market.error)
    return (
      <div className="panel">
        <p role="alert">{market.error}</p>
        <button onClick={market.reload}>Retry service access</button>
      </div>
    );
  const candidates =
    market.catalog?.services.filter((s: any) => tabServices(tab).includes(s.id)) || [];
  const service =
    candidates.find((s: any) => s.status === 'active') ||
    candidates.find((s: any) => s.status === 'disabled') ||
    candidates[0];
  if (service?.status === 'active') return <>{children}</>;
  if (service?.status === 'disabled')
    return (
      <>
        <div className="alert">
          This service is off. Historical records remain read-only; use Reports for exports.
        </div>
        <fieldset className="service-history" disabled>
          {children}
        </fieldset>
      </>
    );
  return (
    <section className="panel service-start">
      <h2>{service?.name || tab}</h2>
      <p>{service?.description || 'Choose the services this workspace needs.'}</p>
      <p>
        {service?.status === 'requires_setup'
          ? service.setup.join(' ')
          : 'Activate this service before creating or processing new records.'}
      </p>
      <button className="button" onClick={() => navigate('Explore Services')}>
        Explore services <Icon name="right" />
      </button>
    </section>
  );
}
const money = (n = 0) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n / 100);
const status = (s: string) =>
  ({
    active: 'Active',
    available: 'Available',
    requires_setup: 'Requires setup',
    disabled: 'Off · history retained',
    suspended: 'Suspended',
    unavailable: 'Unavailable',
  })[s] || s;
export function Services({
  market,
  view,
  navigate,
  manager,
}: {
  market: MarketplaceState;
  view: string;
  navigate: (tab: string) => void;
  manager: boolean;
}) {
  const [serviceLayout, setServiceLayout] = useState<'grid' | 'list'>('grid');
  const [consolidateSuites, setConsolidateSuites] = useState(true);
  const [search, setSearch] = useState(''),
    [family, setFamily] = useState('all'),
    [pricing, setPricing] = useState('all'),
    [detail, setDetail] = useState<string | null>(
      new URLSearchParams(location.search).get('service'),
    ),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [cancel, setCancel] = useState<string | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [goal, setGoal] = useState('');
  const all = market.catalog?.services || [],
    service = all.find((s: any) => s.id === detail);
  const [usage, setUsage] = useState<any>(null),
    [usageError, setUsageError] = useState('');
  useEffect(() => {
    let live = true;
    setUsage(null);
    setUsageError('');
    if (view === 'My Services' && !market.demo)
      api('/api/v1/organizations/' + market.org + '/usage', 'GET', undefined, market.environment)
        .then((data) => {
          if (live) setUsage(data);
        })
        .catch((e) => {
          if (live) setUsageError(e.message);
        });
    return () => {
      live = false;
    };
  }, [view, market.org, market.environment, market.catalog, market.demo]);
  const active = all.filter((s: any) => ['active', 'requires_setup'].includes(s.status));
  const goals: Record<string, string[]> = {
    'Send invoices': ['invoicing'],
    'Manage customers': ['customers'],
    'Track money': ['expenses', 'cash_flow'],
    'Receive payments': ['payments'],
    'Automate work': ['automations'],
    'Build business identity': ['passport'],
    'Connect software': ['developer_api'],
  };
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      market.reload();
      setBusy(false);
    }
  }
  const call = (suffix: string, method = 'POST', body: any = {}) =>
    api('/api/v1/organizations/' + market.org + suffix, method, body, market.environment);
  const open = (s: any) => {
    setDetail(null);
    const destination = serviceOpenDestination(
      s,
      (market.catalog?.kind || market.kind) as WorkspaceKind,
    );
    const url = new URL(location.href);
    url.searchParams.delete('service');
    if (destination.app) {
      url.searchParams.set('app', destination.app);
      url.searchParams.set('section', destination.section || '');
    } else {
      url.searchParams.delete('app');
      if (destination.section) url.searchParams.set('section', destination.section);
      else url.searchParams.delete('section');
    }
    url.hash = encodeURIComponent(destination.tab);
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event('africore:app-navigation'));
    navigate(destination.tab);
  };
  const activateFluent = async (targetService: any) => {
    const orderedDeps: any[] = [];
    const seen = new Set<string>();
    const visit = (svcId: string) => {
      if (seen.has(svcId)) return;
      seen.add(svcId);
      const found = all.find((x: any) => x.id === svcId);
      if (!found) return;
      for (const dep of found.dependencies || []) visit(dep);
      orderedDeps.push(found);
    };
    visit(targetService.id);
    // Also activate bundled sub-services when activating Business Passport
    if (targetService.id === 'passport' && consolidateSuites) {
      for (const subId of ['verification', 'credentials', 'trust_network']) {
        const sub = all.find((x: any) => x.id === subId);
        if (sub && sub.price?.model === 'free') orderedDeps.push(sub);
      }
    }
    let lastResult: any = null;
    for (const item of orderedDeps) {
      if (item.status === 'active' && item.id !== targetService.id) continue;
      lastResult = await call('/services/' + item.id + '/activate', 'POST', {
        confirm_price_version: item.price?.version,
      });
    }
    setNotice(
      lastResult?.status === 'active'
        ? `${targetService.name} is now active and ready to use.`
        : `${targetService.name} saved (${status(lastResult?.status || 'requires_setup')}).`,
    );
  };

  const items = all
    .filter((s: any) => {
      const tierInfo = COMMERCIAL_TIERS_KES[s.id];
      const isFreeTier = s.price?.model === 'free' && (!tierInfo || tierInfo.monthlyMinor === 0);
      if (
        consolidateSuites &&
        view === 'Explore Services' &&
        !search.trim() &&
        tierInfo?.bundle &&
        !['active', 'requires_setup'].includes(s.status)
      ) {
        return false;
      }
      return (
        (view === 'Explore Services' || s.entitlement) &&
        [s.name, s.description, s.detail, tierInfo?.summary || '']
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (family === 'all' || serviceFamilyFor(s.id)?.id === family) &&
        (pricing === 'all' ||
          (pricing === 'free' && isFreeTier) ||
          (pricing === 'paid' && !isFreeTier) ||
          (pricing === 'active' && s.status === 'active'))
      );
    })
    .sort(
      (a: any, b: any) =>
        Number(b.entitlement?.favorite || 0) - Number(a.entitlement?.favorite || 0) ||
        (serviceFamilyFor(a.id)?.order || 99) - (serviceFamilyFor(b.id)?.order || 99) ||
        a.name.localeCompare(b.name),
    );
  if (view === 'Usage & Billing') return <UsageBilling market={market} manager={manager} />;
  return (
    <div className="service-marketplace">
      <div className="service-intro">
        <p>
          Choose only what you need. Identity, workspaces, security, basic reporting and exports are
          included.
        </p>
        <p className="muted">
          Evaluation pricing · no subscriptions are collected and no customer charges are enabled.
          Test payment and trust products retain their own availability limits.
        </p>
      </div>
      {market.demo && (
        <div className="alert">
          Isolated browser demonstration. Manage real service access in your own signed-in
          workspace.
        </div>
      )}
      {market.error && (
        <p className="alert error" role="alert">
          {market.error}
        </p>
      )}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="alert">
          {notice}
        </p>
      )}
      {!active.length && view === 'Explore Services' && (
        <section className="panel service-goals">
          <h2>What would you like help with?</h2>
          <div className="service-goal-options">
            {Object.keys(goals)
              .filter((label) => goals[label].some((id) => all.some((s: any) => s.id === id)))
              .map((label) => (
                <button
                  key={label}
                  aria-pressed={goal === label}
                  className="secondary-button"
                  onClick={() => {
                    setGoal(label);
                    setSelected(goals[label].filter((id) => all.some((s: any) => s.id === id)));
                  }}
                >
                  {label}
                </button>
              ))}
          </div>
          {selected.length > 0 && (
            <div>
              <p>
                Recommended:{' '}
                {selected.map((id) => all.find((s: any) => s.id === id)?.name).join(', ')}. You can
                change this selection below.
              </p>
              <button
                className="button"
                disabled={!manager || busy || market.demo}
                onClick={() =>
                  action(async () => {
                    for (const id of selected) {
                      const s = all.find((s: any) => s.id === id);
                      if (s.price?.model !== 'free')
                        throw Error('Review paid estimate pricing individually before activation');
                      await call('/services/' + id + '/activate', 'POST', {});
                    }
                    setNotice('Selected services updated.');
                    setSelected([]);
                  })
                }
              >
                Activate selected free services
              </button>
            </div>
          )}
          <button className="quiet-button" onClick={() => navigate('Overview')}>
            Skip for now
          </button>
        </section>
      )}
      {view === 'My Services' && (
        <section className="panel service-overview">
          <h2>Usage overview</h2>
          {usageError && (
            <p role="alert">
              Usage unavailable: {usageError}{' '}
              <button className="secondary-button" onClick={market.reload}>
                Retry usage
              </button>
            </p>
          )}
          <p>
            {new Date().toLocaleDateString('en-KE', {
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })}{' '}
            · UTC
          </p>
          <dl>
            <div>
              <dt>Active services</dt>
              <dd>{all.filter((s: any) => s.status === 'active').length}</dd>
            </div>
            <div>
              <dt>Estimated charges</dt>
              <dd>{usage ? money(usage.estimated_minor) : '—'}</dd>
            </div>
            <div>
              <dt>Services with recorded usage</dt>
              <dd>
                {usage
                  ? new Set(
                      usage.lines.filter((l: any) => l.quantity > 0).map((l: any) => l.service_id),
                    ).size
                  : '—'}
              </dd>
            </div>
          </dl>
          <p className="muted">Evaluation estimates only. Customer charging is disabled.</p>
          <button className="secondary-button" onClick={() => navigate('Usage & Billing')}>
            View Usage & Billing
          </button>
        </section>
      )}
      <div className="service-filters" style={{ alignItems: 'end' }}>
        <label className="field">
          <span>Search services</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoices, webhooks, inventory, payroll…"
          />
        </label>
        <label className="field">
          <span>Domain family</span>
          <select value={family} onChange={(e) => setFamily(e.target.value)}>
            <option value="all">All domains ({serviceFamilies.filter((f) => f.kinds.includes((market.catalog?.kind || market.kind) as any)).length})</option>
            {serviceFamilies
              .filter((f) => f.kinds.includes((market.catalog?.kind || market.kind) as any))
              .map((f) => (
                <option value={f.id} key={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Tier &amp; status</span>
          <select value={pricing} onChange={(e) => setPricing(e.target.value)}>
            <option value="all">All tiers</option>
            <option value="free">Included Free Foundation</option>
            <option value="paid">Commercial Tiers (Free in Sandbox)</option>
            <option value="active">Active in Workspace</option>
          </select>
        </label>
        {view === 'Explore Services' && (
          <label className="checkbox-field" style={{ paddingBottom: 8 }}>
            <input
              type="checkbox"
              checked={consolidateSuites}
              onChange={(e) => setConsolidateSuites(e.target.checked)}
            />
            Group bundled add-ons into suites
          </label>
        )}
      </div>
      <div className="ac-filter-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        <button
          type="button"
          className="ac-pill"
          aria-pressed={family === 'all'}
          onClick={() => setFamily('all')}
        >
          All domains
        </button>
        {serviceFamilies
          .filter((f) => f.kinds.includes((market.catalog?.kind || market.kind) as any))
          .map((f) => (
            <button
              type="button"
              key={f.id}
              className="ac-pill"
              aria-pressed={family === f.id}
              onClick={() => setFamily(f.id)}
            >
              {f.name}
            </button>
          ))}
      </div>
      {market.busy && !market.catalog ? (
        <CardGridSkeleton count={6} label="Loading service catalog…" />
      ) : (
        <>
          <div className="service-results-toolbar">
            <p role="status">
              {items.length} services · Per-workspace pricing (unlimited users), capped at{' '}
              {money(WORKSPACE_ALL_APPS_CAP_MINOR)}/mo for all apps · KSh 0 in Sandbox
            </p>
            <div className="segmented-control" role="group" aria-label="Service layout">
              <button
                type="button"
                aria-pressed={serviceLayout === 'grid'}
                onClick={() => setServiceLayout('grid')}
              >
                Cards
              </button>
              <button
                type="button"
                aria-pressed={serviceLayout === 'list'}
                onClick={() => setServiceLayout('list')}
              >
                List
              </button>
            </div>
          </div>
          <div
            className={'service-grid' + (serviceLayout === 'list' ? ' service-list-layout' : '')}
          >
            {items.map((s: any) => {
              const tierInfo = COMMERCIAL_TIERS_KES[s.id];
              const bundledChildren = consolidateSuites
                ? all.filter((child: any) => COMMERCIAL_TIERS_KES[child.id]?.bundle === s.id)
                : [];
              return (
                <article className="service-card" key={s.id}>
                  <span className="service-icon">
                    <Icon name={serviceIconFor(s.id)} />
                  </span>
                  <div>
                    <div className="service-card-meta" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: '#475569' }}>
                        {serviceFamilyFor(s.id)?.name || s.category}
                      </span>
                      <span className="badge">{status(s.status)}</span>
                      {tierInfo && (
                        <span
                          className="badge"
                          style={{
                            background: tierInfo.monthlyMinor === 0 ? '#ecfdf5' : '#f3f4f6',
                            color: tierInfo.monthlyMinor === 0 ? '#166534' : '#374151',
                          }}
                        >
                          {tierInfo.tier}
                        </span>
                      )}
                    </div>
                    <h2 style={{ margin: '2px 0 4px', fontSize: 16 }}>{s.name}</h2>
                    <p className="service-price" style={{ margin: 0, fontWeight: 600, color: '#0f172a', fontSize: 12.5 }}>
                      {s.price?.model !== 'free'
                        ? s.price?.description
                        : tierInfo?.summary || 'Included free'}
                    </p>
                    <small style={{ color: '#64748b', display: 'block', marginTop: 2 }}>
                      {market.environment === 'sandbox'
                        ? 'Ksh 0.00 in Sandbox evaluation'
                        : 'Billing collection disabled'}
                      {usage
                        ? ` · ${formatUnits(
                            usage.lines
                              .filter((l: any) => l.service_id === s.id)
                              .reduce((n: number, l: any) => n + l.quantity, 0),
                          )} ${s.unit}`
                        : ''}
                    </small>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: '#334155' }}>{s.description}</p>
                    {bundledChildren.length > 0 && (
                      <small style={{ display: 'block', marginTop: 6, color: '#166534', fontWeight: 500 }}>
                        Suite includes: {bundledChildren.map((c: any) => c.name).join(' · ')}
                      </small>
                    )}
                    {s.dependencies?.length > 0 && s.status !== 'active' && (
                      <small style={{ display: 'block', marginTop: 4, color: '#64748b' }}>
                        Auto-enables prerequisite:{' '}
                        {s.dependencies
                          .map((depId: string) => all.find((x: any) => x.id === depId)?.name || depId)
                          .join(', ')}
                      </small>
                    )}
                  </div>
                  <div className="service-actions">
                    {s.status !== 'active' && manager && !market.demo && s.price?.model === 'free' && (
                      <button
                        className="button"
                        disabled={busy || ['suspended', 'unavailable'].includes(s.status)}
                        onClick={() => action(() => activateFluent(s))}
                      >
                        {s.status === 'requires_setup' ? 'Enable now' : 'Activate'}
                      </button>
                    )}
                    {s.status === 'active' && (
                      <button className="button" onClick={() => open(s)}>
                        Open Service <Icon name="right" />
                      </button>
                    )}
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setDetail(s.id);
                        setConfirmed(false);
                      }}
                    >
                      {s.status === 'active' ? 'Manage' : 'Details'}
                    </button>
                    {view === 'My Services' && manager && s.entitlement && (
                      <details className="service-overflow">
                        <summary aria-label={'More actions for ' + s.name}>•••</summary>
                        <div className="service-overflow-actions">
                          <button className="quiet-button" onClick={() => setDetail(s.id)}>
                            View details
                          </button>
                          <button
                            className="quiet-button"
                            disabled={busy || market.demo}
                            aria-pressed={s.entitlement.favorite}
                            onClick={() =>
                              action(() =>
                                call('/services/' + s.id + '/preferences', 'PATCH', {
                                  favorite: !s.entitlement.favorite,
                                  position: s.entitlement.position || 0,
                                }),
                              )
                            }
                          >
                            {s.entitlement.favorite ? 'Unpin' : 'Pin'}
                          </button>
                          {['active', 'requires_setup'].includes(s.status) && (
                            <button className="quiet-button" onClick={() => setCancel(s.id)}>
                              Deactivate
                            </button>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      {!market.busy && !items.length && (
        <section className="panel">
          <h2>{view === 'My Services' ? 'Choose your first service' : 'No matching services'}</h2>
          <p>
            {view === 'My Services'
              ? 'Your workspace foundation is ready. Explore services to add the tools you need.'
              : 'Try another search or pricing filter. No paid rates have been published for the initial evaluation.'}
          </p>
          <button onClick={() => navigate('Explore Services')}>Explore services</button>
        </section>
      )}
      {service && (
        <Overlay onClose={() => setDetail(null)}>
          <section
            className="service-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-detail-title"
          >
            <button
              data-autofocus
              className="icon-button"
              aria-label="Close service details"
              onClick={() => setDetail(null)}
            >
              <Icon name="close" />
            </button>
            <span className="eyebrow">
              {service.category} · {status(service.status)}
            </span>
            <h2 id="service-detail-title">{service.name}</h2>
            <p>{service.detail}</p>
            <ol>
              {service.workflow.map((step: string) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <img
              loading="lazy"
              alt={service.name + ' illustrative workflow'}
              src={
                '/media/explainers/' +
                (service.documentation.startsWith('/products/')
                  ? service.documentation.slice(1).replaceAll('/', '-')
                  : 'developers') +
                '.svg'
              }
            />
            <h3>Setup and dependencies</h3>
            <p>
              {service.setup.length
                ? service.setup.join(' ')
                : 'Use your existing workspace identity and records. No separate payment integration is required.'}
            </p>
            {service.dependencies.length > 0 && (
              <p>
                Activate first:{' '}
                {service.dependencies
                  .map((id: string) => all.find((s: any) => s.id === id)?.name || id)
                  .join(', ')}
                . These are disclosed separately; activation will not silently add another product.
              </p>
            )}
            <h3>Pricing and usage</h3>
            <p>
              <strong>Commercial SME rate:</strong> {commercialRateFor(service.id).summary} (whole
              workspace capped at {money(WORKSPACE_ALL_APPS_CAP_MINOR)}/mo across all active modules,
              unlimited staff seats).
            </p>
            <p>{service.price?.description || 'No effective price is published.'}</p>
            <p>
              Meter: {service.unit}. Price version: {service.price?.version || 'unpublished'}. All
              amounts are evaluation estimates; nothing is collected.
            </p>
            <p>{service.retention}</p>
            <a href={service.documentation}>Read the product walkthrough</a>
            {service.price?.model !== 'free' && (
              <label className="service-select">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I have reviewed this estimate price version and cancellation policy.
              </label>
            )}
            <div className="service-actions">
              <button
                className="button"
                disabled={
                  !manager ||
                  busy ||
                  market.demo ||
                  ['suspended', 'unavailable'].includes(service.status) ||
                  (service.price?.model !== 'free' && !confirmed)
                }
                onClick={() =>
                  action(async () => {
                    await activateFluent(service);
                    setDetail(null);
                  })
                }
              >
                {service.status === 'active'
                  ? 'Already active'
                  : service.status === 'requires_setup'
                    ? 'Recheck setup'
                    : 'Activate service'}
              </button>
              {service.status === 'active' && (
                <button onClick={() => open(service)}>Open service</button>
              )}
            </div>
          </section>
        </Overlay>
      )}
      {cancel && (
        <Overlay onClose={() => setCancel(null)}>
          <section
            className="service-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-title"
          >
            <h2 id="deactivate-title">Deactivate {all.find((s: any) => s.id === cancel)?.name}?</h2>
            <p>
              New operations stop. Historical records, financial evidence and audit logs remain
              available for authorized review and export. No real subscription or payment collection
              was started. Configured fixed estimate fees, if any, cover the activation month
              without proration; historical estimates retain their original price.
            </p>
            <div className="service-actions">
              <button data-autofocus className="secondary-button" onClick={() => setCancel(null)}>
                Keep service
              </button>
              <button
                className="button"
                disabled={busy || market.demo}
                onClick={() =>
                  action(async () => {
                    await call('/services/' + cancel + '/deactivate', 'POST', { confirm: true });
                    setCancel(null);
                    setNotice('Service deactivated. Historical records were retained.');
                  })
                }
              >
                Confirm deactivation
              </button>
            </div>
          </section>
        </Overlay>
      )}
    </div>
  );
}
function UsageBilling({ market, manager }: { market: MarketplaceState; manager: boolean }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [statement, setStatement] = useState<any>(null),
    [notice, setNotice] = useState('');
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('all'),
    [sort, setSort] = useState('name'),
    [page, setPage] = useState(0);
  const filtered = selectUsage(
      data?.lines || [],
      market.catalog?.services || [],
      search,
      category,
      sort,
    ),
    pageCount = Math.max(1, Math.ceil(filtered.length / 12)),
    currentPage = Math.min(page, pageCount - 1),
    rows = filtered.slice(currentPage * 12, (currentPage + 1) * 12);
  useEffect(() => setPage(0), [search, category, sort, period, market.org, market.environment]);
  const base = '/api/v1/organizations/' + market.org;
  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    if (market.demo) {
      setData({
        lines: [],
        limits: [],
        alerts: [],
        statements: [],
        estimated_minor: 0,
        classification: 'isolated demonstration',
      });
      return;
    }
    api(base + '/usage?period=' + period, 'GET', undefined, market.environment)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [base, period, market.environment, revision, market.demo]);
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="service-marketplace">
      <p>
        Platform service usage is separate from the invoices you send to your customers. Amounts
        below are estimates, never a balance owed. Automated collection is disabled.
      </p>
      <label className="field service-period">
        <span>Billing period · UTC</span>
        <input
          type="month"
          value={period}
          onChange={(e) => {
            if (e.target.value) setPeriod(e.target.value);
          }}
        />
      </label>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        error ? (
          <button className="secondary-button" onClick={() => setRevision((n) => n + 1)}>
            Retry usage
          </button>
        ) : (
          <p role="status">Loading usage…</p>
        )
      ) : (
        <>
          <div className="account-metrics">
            <section>
              <span>Estimated service cost</span>
              <strong>{money(data.estimated_minor)}</strong>
              <small>{period} · KES · estimate only</small>
            </section>
            <section>
              <span>Amount due</span>
              <strong>{money(0)}</strong>
              <small>No collection provider is configured</small>
            </section>
          </div>
          <div className="service-filters">
            <label className="field">
              <span>Search usage</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Service or usage unit"
              />
            </label>
            <label className="field">
              <span>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">All categories</option>
                {[...new Set((market.catalog?.services || []).map((s: any) => s.category))].map(
                  (c: any) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>
            </label>
            <label className="field">
              <span>Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="name">Service name</option>
                <option value="charges">Highest estimated charges</option>
                <option value="usage">Highest usage quantity</option>
              </select>
            </label>
          </div>
          <div className="service-usage-table">
            <table>
              <caption>Service usage · {period} · estimates in KES</caption>
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Usage</th>
                  <th scope="col">Allowance</th>
                  <th scope="col">Estimated charges</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l: any) => (
                  <tr key={l.price_id}>
                    <th scope="row">
                      {l.service?.name || l.service_id}
                      <small>{planLabel(l)}</small>
                    </th>
                    <td>
                      {formatUnits(l.quantity)} {l.unit}
                    </td>
                    <td>{allowanceLabel(l)}</td>
                    <td>{money(l.estimated_minor)}</td>
                    <td>
                      <details>
                        <summary>Details</summary>
                        <p>Price version: {l.price_version}</p>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="service-usage-cards" aria-label="Service usage">
            {rows.map((l: any) => (
              <li key={l.price_id}>
                <article>
                  <h2>{l.service?.name || l.service_id}</h2>
                  <dl>
                    <div>
                      <dt>Usage</dt>
                      <dd>
                        {formatUnits(l.quantity)} {l.unit}
                      </dd>
                    </div>
                    <div>
                      <dt>Plan</dt>
                      <dd>{planLabel(l)}</dd>
                    </div>
                    <div>
                      <dt>Allowance</dt>
                      <dd>{allowanceLabel(l)}</dd>
                    </div>
                    <div>
                      <dt>Estimated charges</dt>
                      <dd>{money(l.estimated_minor)}</dd>
                    </div>
                  </dl>
                  <details>
                    <summary>View billing details</summary>
                    <p>Price version: {l.price_version}</p>
                  </details>
                </article>
              </li>
            ))}
          </ul>
          {!filtered.length && (
            <p role="status">
              {data.lines.length
                ? 'No matching usage. Try another search or category.'
                : 'No service usage in this period.'}
            </p>
          )}
          {filtered.length > 12 && (
            <nav className="service-actions" aria-label="Usage pages">
              <button
                className="secondary-button"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <span role="status">
                Page {currentPage + 1} of {pageCount}
              </span>
              <button
                className="secondary-button"
                disabled={currentPage + 1 >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </nav>
          )}
          <div className="service-actions">
            <button
              disabled={busy || market.demo}
              onClick={() =>
                run(async () => {
                  const r = await apiFetch(base + '/usage/export?period=' + period, {
                    headers: { 'X-Environment': market.environment },
                  });
                  if (!r.ok) throw Error('Export unavailable');
                  const url = URL.createObjectURL(await r.blob()),
                    link = document.createElement('a');
                  link.href = url;
                  link.download = 'africore-service-usage-' + period + '.csv';
                  link.click();
                  URL.revokeObjectURL(url);
                })
              }
            >
              Export usage CSV
            </button>
            {manager && (
              <button
                disabled={busy || market.demo}
                onClick={() =>
                  run(async () => {
                    await api(base + '/billing/statements', 'POST', { period }, market.environment);
                    setNotice(
                      'Estimate snapshot saved. No payable invoice or payment attempt was created.',
                    );
                  })
                }
              >
                Save estimate snapshot
              </button>
            )}
          </div>
          {data.pending_reservations?.length > 0 && (
            <div className="alert">
              {data.pending_reservations.reduce((n: number, r: any) => n + Number(r.operations), 0)}{' '}
              operations are reserved. Pending units are included in hard-stop checks but are not
              charged. Stale reservations require operator review.
            </div>
          )}
          {manager && (
            <form
              className="panel service-limit-form"
              onSubmit={(e) => {
                e.preventDefault();
                const d = Object.fromEntries(new FormData(e.currentTarget));
                run(() =>
                  api(
                    base + '/usage/limits/' + d.service,
                    'PUT',
                    {
                      monthly_budget_minor:
                        d.budget === '' ? null : Math.round(Number(d.budget) * 100),
                      quantity_limit: d.quantity === '' ? null : Number(d.quantity),
                      hard_stop: d.hard === 'on',
                      thresholds: String(d.thresholds).split(',').map(Number),
                    },
                    market.environment,
                  ),
                );
              }}
            >
              <h2>Control usage</h2>
              <label className="field">
                <span>Scope</span>
                <select name="service">
                  <option value="all">Whole workspace</option>
                  {market.catalog?.services.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Monthly estimate budget · KES</span>
                <input
                  name="budget"
                  type="number"
                  min="0"
                  max="10000000"
                  step="0.01"
                  placeholder="No limit"
                />
              </label>
              <label className="field">
                <span>Monthly units</span>
                <input
                  name="quantity"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1"
                  placeholder="No limit"
                />
              </label>
              <label className="field">
                <span>Warning percentages</span>
                <input name="thresholds" defaultValue="50,80,100" required pattern="[0-9, ]+" />
              </label>
              <label className="service-select">
                <input name="hard" type="checkbox" defaultChecked />
                Stop new metered operations at the limit
              </label>
              <button className="button" disabled={busy || market.demo}>
                Save limits
              </button>
            </form>
          )}
          <section className="panel">
            <h2>Current limits and alerts</h2>
            {data.limits.map((l: any) => (
              <p key={l.service_id}>
                {l.service_id}: {l.quantity_limit ?? 'no configured limit'} units;{' '}
                {l.monthly_budget_minor === null
                  ? 'no estimate budget'
                  : money(l.monthly_budget_minor)}
                ; {l.hard_stop ? 'hard stop' : 'warning only'}.
              </p>
            ))}
            {data.alerts.map((a: any, i: number) => (
              <p key={i}>
                {a.service_id} reached {a.threshold}% of its {a.kind} limit.
              </p>
            ))}
            {!data.limits.length && (
              <p>
                No workspace-specific limits are configured. Platform safety limits still apply.
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Estimate history</h2>
            {data.statements.map((s: any) => (
              <button
                className="text-link"
                key={s.id}
                onClick={() =>
                  run(async () =>
                    setStatement(
                      await api(
                        base + '/billing/statements/' + s.id,
                        'GET',
                        undefined,
                        market.environment,
                      ),
                    ),
                  )
                }
              >
                {s.period} · saved estimate
              </button>
            ))}
            {!data.statements.length && (
              <p>No saved estimate snapshots. No platform payment attempts have occurred.</p>
            )}
            {statement && (
              <p>
                {statement.period}: {money(statement.estimated_minor)} · original frozen estimate ·
                amount due {money(0)}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
