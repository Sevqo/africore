import { ServiceExercise } from './ServiceExercise';
import { serviceCatalog } from '../../../src/marketplace/catalog';
import { appCatalog } from '../../../src/apps/catalog';
import { WORKSPACE_ALL_APPS_CAP_MINOR, commercialRateFor } from '../../../src/marketplace/pricing-catalog';
import { appPortfolioPath } from '../apps/app-portfolio-path';
import { serviceEducation } from './serviceEducation';
import { ServiceFinder } from './ServiceFinder';

export function ServiceEducationPage({ id }: { id: string }) {
  const service = serviceCatalog.find((s) => s.id === id)!,
    copy = serviceEducation[id],
    rate = commercialRateFor(id),
    relatedApps = appCatalog.filter(
      (app) =>
        Object.values(app.required).some((ids) => ids?.includes(id)) || app.optional.includes(id),
    );
  return (
    <article className="learn-article">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span>/</span>
        <a href="/products">All services</a>
        <span>/</span>
        <span>{service.name}</span>
      </nav>
      <span className="eyebrow">{service.category}</span>
      <h1>{service.name}</h1>
      <p className="article-deck">{copy.problem}</p>
      <p>{service.detail}</p>
      <h2>Who can use it?</h2>
      <p>
        Eligible workspaces: {service.kinds.join(', ')}. Role-based permissions (Owner, Admin,
        Finance, Accountant, HR, Sales, Operations, Inventory Manager, Support Agent, Marketing
        Manager, or Read-Only Viewer) are enforced automatically.
      </p>
      <section className="article-example">
        <h2>A fictional example</h2>
        <p>{copy.example}</p>
      </section>
      <ServiceExercise id={id} />
      <h2>What to prepare</h2>
      <p>{copy.input}</p>
      <h2>Your workflow</h2>
      <ol>
        {service.workflow.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h2>What to expect</h2>
      <p>{service.description}</p>
      <p className="content-limitation">{copy.limit}</p>
      <h2>Pricing, availability and usage</h2>
      <p>
        <strong>Commercial SME rate:</strong> {rate.summary} (capped at KSh{' '}
        {(WORKSPACE_ALL_APPS_CAP_MINOR / 100).toLocaleString('en-KE')}/month across all active
        workspace modules, with unlimited staff seats).
      </p>
      <p>
        Catalog state: {service.availability.replaceAll('_', ' ')}. Usage measure: {service.unit}.
      </p>
      {service.setup.map((s) => (
        <p key={s}>{s}</p>
      ))}
      <p>
        {service.dependencies.length
          ? 'Required services: ' +
            service.dependencies
              .map((depId) => serviceCatalog.find((s) => s.id === depId)!.name)
              .join(', ') +
            '.'
          : 'No other optional service is required.'}
      </p>
      <p>
        Sandbox evaluation is KSh 0 with customer charging disabled. Review current published
        prices, your applicable price version and workspace limits before activating.
      </p>
      {relatedApps.length > 0 && (
        <section className="article-example app-related-services">
          <h2>Apps that use this service</h2>
          <p>Apps group related work and share canonical records without double entry.</p>
          <ul className="related-app-pills">
            {relatedApps.map((app) => (
              <li key={app.id}>
                <a href={appPortfolioPath(app.id)}>{app.name}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <h2>Get started</h2>
      <p>
        Sign in with your existing identity or create an eligible workspace, review the service,
        then activate it explicitly.
      </p>
      <div className="actions service-page-actions">
        {service.kinds.map((kind) => (
          <a
            key={kind}
            className={kind === 'business' ? 'button' : 'secondary-button'}
            href={'/app?create=' + kind + '&service=' + service.id}
          >
            Review in {kind} workspace
          </a>
        ))}
        <a className="secondary-button" href="/products">
          Browse all 37 services
        </a>
      </div>
      <ServiceFinder />
    </article>
  );
}
