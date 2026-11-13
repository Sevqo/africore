import { appCatalog, type AppDefinition } from '../../../src/apps/catalog';
import { serviceCatalog } from '../../../src/marketplace/catalog';
import { Icon } from '../components/Icon';
import { appIcons } from './appIcons';
import { appPortfolioPath } from './app-portfolio-path';
import './apps-portfolio.css';

const groups = [
  { title: 'Manage money', description: 'Keep invoices, costs and reviewed books distinct.', ids: ['finance', 'accounting'] },
  { title: 'Customers & sales', description: 'Follow relationships, quotations, orders and storefront work.', ids: ['crm', 'sales', 'commerce'] },
  { title: 'Stock & delivery', description: 'Track products, purchasing, counter sales and fulfillment records.', ids: ['inventory', 'procurement', 'pos'] },
  { title: 'People & work', description: 'Manage private employment records, files and participant-scoped projects.', ids: ['people', 'documents', 'work'] },
  { title: 'Identity & trust', description: 'Organize business information, evidence, credentials and consent-based sharing.', ids: ['business_id'] },
  { title: 'Automation & insight', description: 'Inspect authorized information and supported workflow runs.', ids: ['automations', 'analytics'] },
] as const;

const journeys: Record<string, { title: string; steps: string[] }> = {
  pos: { title: 'A counted counter shift', steps: ['Review register and cashier policy', 'Open a counted shift', 'Review and close recorded sales'] },
  commerce: { title: 'A reviewed storefront order', steps: ['Choose canonical products for a store', 'Review publication and checkout readiness', 'Handle sandbox orders without live checkout'] },
  procurement: { title: 'A supplier purchase', steps: ['Review a purchase request', 'Compare supplier offers', 'Receive accepted quantities and match supplier bills'] },
  documents: { title: 'A private file lifecycle', steps: ['Upload a permitted file', 'Review current sharing grants', 'Retain versions or recover a trashed file'] },
  people: { title: 'A private people workflow', steps: ['Review employer policy and access', 'Maintain employment records', 'Review configured leave and recorded attendance'] },
  business_id: { title: 'Business information with clear assurance', steps: ['Build a private business profile', 'Collect evidence and request a review', 'Choose what to share and with whom'] },
  accounting: { title: 'Reviewed double-entry books', steps: ['Set the accounting start boundary', 'Prepare balanced, source-linked entries', 'Request separate approval before posting'] },
  work: { title: 'A participant-scoped project', steps: ['Create a project', 'Assign participants, tasks and dependencies', 'Track discussions and milestones'] },
  finance: { title: 'An invoice and its follow-up', steps: ['Create and issue an invoice', 'Record costs and follow covered receipts', 'Review receivables and source coverage'] },
  crm: { title: 'A customer follow-up', steps: ['Choose a shared customer', 'Record an opportunity or interaction', 'Create the next follow-up task'] },
  inventory: { title: 'A stock movement', steps: ['Choose a product and location', 'Record an authorized movement', 'Review held and available quantities'] },
  sales: { title: 'A quotation through fulfillment', steps: ['Prepare a quotation', 'Confirm the agreed order', 'Review stock and draft invoicing'] },
  analytics: { title: 'A source-aware business view', steps: ['Choose authorized data and a period', 'Inspect descriptive insights', 'Review coverage gaps before acting'] },
  automations: { title: 'A supported workflow rule', steps: ['Choose a supported trigger and action', 'Review the rule and assigned approvals', 'Inspect durable run history'] },
};

const statusLabel = (app: AppDefinition) => app.availability === 'preview' ? 'Evaluation preview' : 'Available';
const serviceNames = new Map(serviceCatalog.map((service) => [service.id, service]));
const allServices = (app: AppDefinition) => [...new Set(Object.values(app.required).flatMap((ids) => ids || []))];
const guideHref = (documentation: string) => documentation.startsWith('/products/') || documentation.startsWith('/learn/') ? documentation : null;

function AppCard({ app }: { app: AppDefinition }) {
  return <article className="app-portfolio-card">
    <span className={'app-mark app-mark-' + app.id}><Icon name={appIcons[app.id] || 'grid'} /></span>
    <div className="app-portfolio-card-copy">
      <div className="app-portfolio-card-heading"><h3><a href={appPortfolioPath(app.id)}>{app.name}</a></h3><span className="badge">{statusLabel(app)}</span></div>
      <p>{app.description}</p>
      <a className="text-link" href={appPortfolioPath(app.id)}>Explore app <Icon name="right" /></a>
    </div>
  </article>;
}

function ServiceLinks({ ids, optional = false }: { ids: string[]; optional?: boolean }) {
  const services = ids.map((id) => serviceNames.get(id)).filter((service): service is NonNullable<typeof service> => !!service);
  if (!services.length) return <p>{optional ? 'No optional services are listed.' : 'No separate service is required.'}</p>;
  return <ul className="app-portfolio-service-list">{services.map((service) => {
    const href = guideHref(service.documentation);
    return <li key={service.id}>{href ? <a href={href}>{service.name}</a> : <span>{service.name}</span>}{optional && <span className="muted"> · Optional</span>}</li>;
  })}</ul>;
}

function AppDetails({ app }: { app: AppDefinition }) {
  const journey = journeys[app.id] || { title: 'A focused starting path', steps: app.navigation.slice(0, 3).map((item) => item.label) };
  const required = allServices(app);
  const kinds = app.kinds.map((kind) => ({ personal: 'Personal', business: 'Business', developer: 'Developer' })[kind]).join(', ');
  const start = new URLSearchParams({ app: app.id, section: app.navigation[0]?.section || 'dashboard' }).toString();
  return <>
    <header className="app-portfolio-detail-hero">
      <span className={'app-mark app-mark-' + app.id}><Icon name={appIcons[app.id] || 'grid'} /></span>
      <div>
        <span className="eyebrow">AfriCore app · {statusLabel(app)}</span>
        <h1>{app.name}</h1>
        <p>{app.description}</p>
        <div className="app-portfolio-actions"><a className="button" href={'/get-started?' + start}>Choose a workspace <Icon name="right" /></a><a className="text-link" href="/apps">Browse all apps</a></div>
      </div>
    </header>
    <p className="app-portfolio-boundary">The app label describes this interface, not the live readiness of every service. Service eligibility, workspace permissions, provider setup and sandbox limits are checked separately.</p>
    <div className="app-portfolio-facts"><div><span>Eligible workspace types</span><strong>{kinds}</strong></div><div><span>Availability</span><strong>{statusLabel(app)}</strong></div><div><span>Historical records</span><strong>Retained when the app is uninstalled</strong></div></div>
    <div className="app-portfolio-detail-grid">
      <section className="app-portfolio-panel"><span className="eyebrow">Example workflow</span><h2>{journey.title}</h2><ol>{journey.steps.map((step) => <li key={step}>{step}</li>)}</ol></section>
      <section className="app-portfolio-panel"><span className="eyebrow">Before you start</span><h2>Setup and limitations</h2>{app.setup.length ? app.setup.map((notice) => <p key={notice}>{notice}</p>) : <p>No additional app-specific setup is listed. Current role and service permissions still apply.</p>}<p className="muted">Uninstalling this interface does not silently deactivate shared services or delete their historical records.</p></section>
      <section className="app-portfolio-panel"><span className="eyebrow">Service connections</span><h2>Required services</h2><ServiceLinks ids={required} /><h3>Optional services</h3><ServiceLinks ids={app.optional} optional /></section>
    </div>
    <div className="app-portfolio-actions app-portfolio-bottom-actions"><a className="button" href={'/get-started?' + start}>Choose a workspace <Icon name="right" /></a><a className="text-link" href="/products">Browse the service directory <Icon name="right" /></a></div>
  </>;
}

export function AppsPortfolio({ path }: { path: string }) {
  const slug = path === '/apps' || path === '/apps/' ? '' : path.slice('/apps/'.length).replace(/\/$/, '');
  const app = slug ? appCatalog.find((item) => item.id === slug) : undefined;
  return <div className="app-portfolio">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span>{app ? <><a href="/apps">Apps</a><span>/</span><span>{app.name}</span></> : <span>Apps</span>}</nav>
    {slug && !app ? <section className="app-portfolio-empty"><span className="eyebrow">AfriCore apps</span><h1>App not found.</h1><p>Choose an app from the portfolio to see its workflow, service requirements and setup limits.</p><a className="button" href="/apps">Browse all apps <Icon name="right" /></a></section> : app ? <AppDetails app={app} /> : <>
      <header className="app-portfolio-index-hero"><span className="eyebrow">AfriCore apps · {appCatalog.length} apps</span><h1>One app for each kind of work.</h1><p>Find a focused workspace for money, customers, stock, people, trust or insight. Apps group work; services remain independently discoverable and activatable.</p><div className="app-portfolio-actions"><a className="button" href="/get-started">Choose a workspace <Icon name="right" /></a><a className="text-link" href="/products">Browse services <Icon name="right" /></a></div></header>
      {groups.map((group) => <section className="app-portfolio-group" key={group.title}><div className="app-portfolio-group-heading"><span className="eyebrow">App collection</span><h2>{group.title}</h2><p>{group.description}</p></div><div className="app-portfolio-grid">{group.ids.map((id) => appCatalog.find((item) => item.id === id)).filter((item): item is AppDefinition => !!item).map((item) => <AppCard key={item.id} app={item} />)}</div></section>)}
      <p className="app-portfolio-boundary">Evaluation status is explicit: payment and checkout workflows remain sandbox-only, and no live payment provider or customer charging is implied. Each service has separate permissions and setup.</p>
    </>}
  </div>;
}
