import { discoveryPages } from './discoveryPages';
import { ServiceFinder } from './ServiceFinder';
import { serviceEducation } from './serviceEducation';
import { serviceCatalog } from '../../../src/marketplace/catalog';
import { serviceFamilies, serviceFamilyFor } from '../../../src/marketplace/families';
import { appCatalog } from '../../../src/apps/catalog';
import { WORKSPACE_ALL_APPS_CAP_MINOR, commercialRateFor } from '../../../src/marketplace/pricing-catalog';
import { Icon } from '../components/Icon';

export function PublicDiscovery({ path }: { path: string }) {
  const page = discoveryPages[path];
  if (path === '/products') {
    return (
      <div className="services-directory-page">
        <header className="services-directory-hero">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span>/</span>
            <span>Services</span>
          </nav>
          <span className="eyebrow">
            Platform service catalog · {serviceCatalog.length} modular services
          </span>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
          <div className="actions">
            <a className="button" href="/get-started">
              Create your workspace <Icon name="right" />
            </a>
            <a className="secondary-button" href="/apps">
              Browse all {appCatalog.length} connected apps <Icon name="right" />
            </a>
            <a className="text-link" href="/pricing">
              View SME pricing (KSh {(WORKSPACE_ALL_APPS_CAP_MINOR / 100).toLocaleString('en-KE')}/mo cap) <Icon name="right" />
            </a>
          </div>
        </header>

        <div className="services-directory-stats">
          <div>
            <span>Modular services</span>
            <strong>{serviceCatalog.length} services</strong>
          </div>
          <div>
            <span>Connected business apps</span>
            <strong>{appCatalog.length} apps</strong>
          </div>
          <div>
            <span>Starter &amp; sandbox evaluation</span>
            <strong>KSh 0 / month</strong>
          </div>
          <div>
            <span>All-apps SME workspace cap</span>
            <strong>KSh {(WORKSPACE_ALL_APPS_CAP_MINOR / 100).toLocaleString('en-KE')} / mo</strong>
          </div>
        </div>

        {serviceFamilies.map((family) => {
          const familyServices = serviceCatalog.filter(
            (s) => serviceFamilyFor(s.id)?.id === family.id,
          );
          if (!familyServices.length) return null;
          return (
            <section className="services-family-section" key={family.id}>
              <div className="services-family-heading">
                <span className="eyebrow">Service family</span>
                <h2>{family.name}</h2>
                <p>{family.description}</p>
              </div>
              <div className="services-directory-grid">
                {familyServices.map((s) => {
                  const rate = commercialRateFor(s.id);
                  const learnHref = serviceEducation[s.id]?.route || s.documentation;
                  return (
                    <article className="service-directory-card" key={s.id}>
                      <div className="service-directory-card-top">
                        <span className="badge">
                          {rate.monthly_minor === 0 && rate.tier === 'free'
                            ? 'Free Foundation'
                            : rate.tier === 'pay_as_you_go'
                              ? 'Pay-as-you-go'
                              : `KSh ${(rate.monthly_minor / 100).toLocaleString('en-KE')}/mo`}
                        </span>
                        <span className="service-directory-workspaces">
                          {s.kinds.join(' · ')}
                        </span>
                      </div>
                      <h3>
                        <a href={learnHref}>{s.name}</a>
                      </h3>
                      <p>{s.description}</p>
                      <small className="service-directory-rate">{rate.summary}</small>
                      <div className="service-directory-actions">
                        <a className="text-link" href={learnHref}>
                          How it works <Icon name="right" />
                        </a>
                        <a
                          className="secondary-button"
                          href={'/app?service=' + encodeURIComponent(s.id)}
                        >
                          Open in workspace
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}

        <ServiceFinder />
      </div>
    );
  }

  return (
    <article className="learn-article">
      <span className="eyebrow">AfriCore · Service discovery</span>
      <h1>{page.title}</h1>
      <p className="article-deck">{page.description}</p>
      {path === '/how-it-works' ? (
        <>
          <h2>Four useful distinctions</h2>
          <dl className="glossary">
            <div>
              <dt>Apps ({appCatalog.length} connected workspaces)</dt>
              <dd>
                Focused operational workspaces — Sales, Accounting, CRM, Inventory, POS,
                Procurement, People, Work, Commerce, Manufacturing, Logistics, Field Operations,
                Support, Subscriptions, Property &amp; Hospitality, Studio and more.
              </dd>
            </div>
            <div>
              <dt>Services ({serviceCatalog.length} modular capabilities)</dt>
              <dd>
                Individual capabilities such as Invoicing, Reconciliation, Business Passport and
                Forecasts that power apps and scoped APIs without duplicate data entry.
              </dd>
            </div>
            <div>
              <dt>Role-based permissions</dt>
              <dd>
                Eleven granular workspace roles (Owner, Admin, Finance, Accountant, HR, Sales,
                Operations, Inventory Manager, Support Agent, Marketing Manager and Read-Only
                Viewer) protect sensitive records automatically.
              </dd>
            </div>
            <div>
              <dt>Integrations &amp; Developer APIs</dt>
              <dd>
                Authorized connectors, CSV imports, signed HTTPS webhooks and scoped REST keys
                with strict sandbox/production isolation.
              </dd>
            </div>
          </dl>
          <h2>From discovery to your first record</h2>
          <ol>
            <li>Choose a task and inspect its example, availability and requirements.</li>
            <li>Sign in with your existing identity or create one.</li>
            <li>Choose an eligible workspace with your current membership and role.</li>
            <li>Review the service, dependencies, applicable workspace rate and setup.</li>
            <li>Activate explicitly, then complete the connected workflow across apps.</li>
          </ol>
          <p>
            Deactivation stops new operations according to the service policy; authorized historical
            review and export remain.
          </p>
          <div className="actions" style={{ marginTop: 24 }}>
            <a className="button" href="/apps">
              Explore {appCatalog.length} apps <Icon name="right" />
            </a>
            <a className="secondary-button" href="/products">
              Explore {serviceCatalog.length} services
            </a>
            <a className="text-link" href="/learn">
              Guided learning paths <Icon name="right" />
            </a>
          </div>
        </>
      ) : page.services.length ? (
        <>
          <h2>A practical starting combination</h2>
          <p>Recommendations, not a mandatory bundle. Begin with one eligible service.</p>
          <ol>
            {page.services.map((id) => {
              const s = serviceCatalog.find((item) => item.id === id)!;
              const rate = commercialRateFor(id);
              return (
                <li key={id}>
                  <a href={serviceEducation[id]?.route || s.documentation}>
                    <strong>{s.name}</strong>
                  </a>
                  <p>{s.description}</p>
                  <p>
                    Usage measure: {s.unit} · Commercial SME rate: {rate.summary}.
                  </p>
                </li>
              );
            })}
          </ol>
          <div className="actions" style={{ marginTop: 24 }}>
            <a className="button" href={'/app?create=' + page.kind}>
              Create {page.kind} workspace <Icon name="right" />
            </a>
            <a className="secondary-button" href="/products">
              Browse all {serviceCatalog.length} services
            </a>
          </div>
        </>
      ) : null}
      <ServiceFinder />
      <h2>Keep exploring</h2>
      <div className="actions" style={{ marginTop: 12 }}>
        <a className="secondary-button" href="/how-it-works">
          How AfriCore works
        </a>
        <a className="secondary-button" href="/apps">
          Browse {appCatalog.length} apps
        </a>
        <a className="secondary-button" href="/pricing">
          SME pricing
        </a>
        <a className="secondary-button" href="/developers">
          Developer docs
        </a>
      </div>
    </article>
  );
}
