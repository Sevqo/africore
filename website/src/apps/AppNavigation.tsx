import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { peekQuery } from '../lib/query-cache';
import { isDemo } from '../demo/transport';
import type { API } from '../operations/UI';
import { appSectionActive, appSectionTarget } from '../workspace-navigation';
import { AppModuleMenuBar } from './MinimalAppChrome';
export const appNavigationEvent = 'africore:app-navigation';

function iconForSection(label: string, section = ''): IconName {
  const text = `${label} ${section}`;
  if (/dashboard|overview|home|board/i.test(text)) return 'home';
  if (/report|analytic|ledger|balance|statement|mrr|forecast|coverage|quality|performance/i.test(text))
    return 'chart';
  if (/setting|policy|config|rule|permission|preference/i.test(text)) return 'settings';
  if (/customer|people|team|supplier|vendor|employee|candidate|lead|recruit|department|org chart/i.test(text))
    return 'users';
  if (/product|stock|inventory|warehouse|catalog|bom|lot|package/i.test(text)) return 'box';
  if (/payment|cash|invoice|bill|price|payroll|compensation|subscription|folio|lease/i.test(text))
    return 'payment';
  if (/calendar|schedule|time off|leave|attendance|shift|planning|timeline|appointment/i.test(text))
    return 'calendar';
  if (/order|quotation|sale|storefront|commerce|purchase|rfq/i.test(text)) return 'bag';
  if (/campaign|marketing|promotion|discount/i.test(text)) return 'megaphone';
  if (/ticket|support|sla|help|inquiry|dispute/i.test(text)) return 'lifebuoy';
  if (/manufactur|production/i.test(text)) return 'factory';
  if (/dispatch|maintenance|field|repair/i.test(text)) return 'wrench';
  if (/shipment|delivery|fulfillment|logistic|fleet|pod/i.test(text)) return 'truck';
  if (/property|unit|room|reservation|hospitality/i.test(text)) return 'building';
  if (/wiki|article|course|knowledge|learn|template/i.test(text)) return 'book';
  if (/studio|custom app|editor|menu|theme|seo|form/i.test(text)) return 'layers';
  if (/connector|pipeline|webhook|integration|topology|event|automation|workflow/i.test(text))
    return 'plug';
  if (/approval|verify|credential|passport|trust|audit/i.test(text)) return 'shield';
  if (/website|site|publication|domain/i.test(text)) return 'globe';
  return 'document';
}

export function AppSectionTabs({
  app,
  section,
  navigate,
}: {
  app: any;
  section: string;
  navigate: (tab: string) => void;
}) {
  const direct: Record<string, string> = {
    Invoices: 'Invoices',
    Payments: 'Payments',
    Expenses: 'Expenses',
    Reconciliation: 'Reconciliation',
    Reports: 'Reports',
    Customers: 'Customers',
    Orders: 'Orders',
    Fulfillment: 'Fulfillment',
    Intelligence: 'Intelligence',
    Automations: 'Automations',
    Approvals: 'Approvals',
    products: 'Products',
    quotations: 'Quotations',
  };
  const selectSection = (targetSection: string) => {
    const url = new URL(location.href);
    url.searchParams.set('app', app.id);
    url.searchParams.set('section', targetSection);
    const target = appSectionTarget(app, targetSection, direct);
    url.hash = encodeURIComponent(target);
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event(appNavigationEvent));
    navigate(target);
  };
  const navItems: any[] = app.navigation || [];
  const primary = navItems.slice(0, 6);
  const overflow = navItems.slice(6);
  return (
    <AppModuleMenuBar
      className="app-section-tabs"
      ariaLabel={app.name + ' sections'}
      menus={[
        ...primary.map((item: any) => ({
          id: item.section,
          label: item.label,
          active: section === item.section,
          onSelect: () => selectSection(item.section),
        })),
        ...(overflow.length > 0
          ? [
              {
                id: '__more_sections',
                label: 'More',
                active: overflow.some((item: any) => item.section === section),
                children: overflow.map((item: any) => ({
                  id: item.section,
                  label: item.label,
                  active: section === item.section,
                  onSelect: () => selectSection(item.section),
                })),
              },
            ]
          : []),
      ]}
    />
  );
}
export function useAppContext(api: API, scope: string, enabled = true) {
  const [orgId = '', env = 'sandbox'] = scope.split('\0');
  const cachedApps = orgId
    ? peekQuery<any>('/api/v1/organizations/' + orgId + '/apps', env, isDemo())
    : undefined;
  const [catalog, setCatalog] = useState<{ scope: string; apps: any[] }>(() =>
      cachedApps?.apps ? { scope, apps: cachedApps.apps } : { scope: '', apps: [] },
    ),
    [selection, setSelection] = useState(() => ({
      id: new URLSearchParams(location.search).get('app'),
      section: new URLSearchParams(location.search).get('section') || '',
    })),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const sync = () =>
        setSelection({
          id: new URLSearchParams(location.search).get('app'),
          section: new URLSearchParams(location.search).get('section') || '',
        }),
      refresh = () => setRevision((v) => v + 1);
    addEventListener('popstate', sync);
    addEventListener(appNavigationEvent, sync);
    addEventListener('africore:apps-changed', refresh);
    return () => {
      removeEventListener('popstate', sync);
      removeEventListener(appNavigationEvent, sync);
      removeEventListener('africore:apps-changed', refresh);
    };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const warm = orgId
      ? peekQuery<any>('/api/v1/organizations/' + orgId + '/apps', env, isDemo())
      : undefined;
    if (warm?.apps) setCatalog({ scope, apps: warm.apps });
    else setCatalog((prev) => (prev.scope === scope ? prev : { scope, apps: [] }));
    api('/apps')
      .then((r) => {
        if (current) setCatalog({ scope, apps: r.apps });
      })
      .catch(() => {
        if (current) setCatalog({ scope, apps: [] });
      });
    return () => {
      current = false;
    };
  }, [scope, enabled, revision]);
  const app =
    catalog.scope === scope
      ? catalog.apps.find((a) => a.id === selection.id && a.installation?.status === 'installed')
      : null;
  return {
    app,
    resolving: enabled && !!selection.id && catalog.scope !== scope,
    section: app?.navigation?.some((item: any) => item.section === selection.section)
      ? selection.section
      : app?.navigation?.[0]?.section || 'dashboard',
  };
}
export function AppContextNavigation({
  app,
  section,
  tab,
  navigate,
}: {
  app: any;
  section: string;
  tab: string;
  navigate: (tab: string) => void;
}) {
  const direct: Record<string, string> = {
    Invoices: 'Invoices',
    Payments: 'Payments',
    Expenses: 'Expenses',
    Reconciliation: 'Reconciliation',
    Reports: 'Reports',
    Customers: 'Customers',
    Orders: 'Orders',
    Fulfillment: 'Fulfillment',
    Intelligence: 'Intelligence',
    Automations: 'Automations',
    Approvals: 'Approvals',
    products: 'Products',
    quotations: 'Quotations',
  };
  function open(value: string) {
    const url = new URL(location.href);
    if (value === 'all') {
      url.searchParams.delete('app');
      url.searchParams.delete('section');
    } else {
      url.searchParams.set('app', app.id);
      url.searchParams.set('section', value);
    }
    const target = value === 'all' ? 'Apps' : appSectionTarget(app, value, direct);
    url.hash = encodeURIComponent(target);
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event(appNavigationEvent));
    navigate(target);
  }
  const sections = app.navigation.filter(
    (item: any) =>
      !['Notifications', 'My Services', 'Usage & Billing', 'Overview', 'Apps'].includes(
        item.section,
      ),
  );
  return (
    <>
      <button className="app-nav-back" title="Back to all apps" onClick={() => open('all')}>
        <Icon name="left" />
        <span>Back to all apps</span>
      </button>
      <p className="workspace-label app-context-label">{app.name}</p>
      <div className="app-context-links">
        {sections.map((n: any) => {
          const active = appSectionActive(app, n.section, tab, section, direct),
            label = n.section === 'dashboard' && n.label === 'Overview' ? 'Dashboard' : n.label;
          return (
            <button
              key={n.section}
              title={label}
              className={active ? 'active' : ''}
              aria-current={active ? 'page' : undefined}
              onClick={() => open(n.section)}
            >
              <Icon name={iconForSection(label, n.section)} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function WorkspaceAdminNavigation({
  tab,
  navigate,
}: {
  tab: string;
  navigate: (tab: string) => void;
}) {
  const items = [
    { tab: 'Usage & Billing', label: 'Usage & billing' },
    { tab: 'Team', label: 'Team management' },
    { tab: 'Settings', label: 'Workspace settings' },
  ];
  return (
    <details
      className="workspace-nav-group workspace-admin-group"
      open={items.some((item) => item.tab === tab) || undefined}
    >
      <summary title="Workspace administration">
        <Icon name="settings" />
        <span>Workspace administration</span>
        <Icon name="down" />
      </summary>
      <div className="workspace-admin-links">
        {items.map((item) => (
          <button
            key={item.tab}
            title={item.label}
            className={tab === item.tab ? 'active' : ''}
            aria-current={tab === item.tab ? 'page' : undefined}
            onClick={() => navigate(item.tab)}
          >
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
