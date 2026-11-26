import { useState } from 'react';
import { ServiceFinder } from './ServiceFinder';
import { Icon } from '../components/Icon';
import { EditorialCard, MediaCarousel } from '../components/Media';
import { editorial } from '../editorial';
import { HeroWorkflow } from './Components';
import { appCatalog } from '../../../src/apps/catalog';
import { serviceCatalog } from '../../../src/marketplace/catalog';
import { WORKSPACE_ALL_APPS_CAP_MINOR } from '../../../src/marketplace/pricing-catalog';

export function ProductComposition() {
  return (
    <figure
      className="product-composition"
      aria-label="AfriCore workspace, hosted checkout and invoice together"
    >
      <div className="device-laptop">
        <div className="device-camera" />
        <img
          src="/media/product/workspace.webp"
          width="1200"
          height="800"
          alt="AfriCore connected business workspace showing 26 apps, confirmed inflows, open receivables and live cross-app activity."
          fetchPriority="high"
        />
        <div className="device-base" />
      </div>
      <div className="device-phone">
        <img
          src="/media/product/checkout.webp"
          width="390"
          height="760"
          alt="Sandbox checkout showing Amani Supplies Ltd, invoice reference, KSh 650 and pending confirmation."
        />
      </div>
      <div className="device-invoice">
        <span>Invoice record</span>
        <strong>KSh 650</strong>
        <span>Issued · Awaiting payment</span>
      </div>
      <figcaption>Example interfaces · illustrative records</figcaption>
    </figure>
  );
}

const groups = [
  [
    'Run your business',
    'Sales, CRM, Inventory, Procurement, POS, Commerce and 20 more connected apps.',
    '/apps',
    'Explore all 26 apps',
  ],
  [
    'Manage your money',
    'Double-entry Accounting, Invoicing, Pay links, receipt matching and cash movement.',
    '/products/pay',
    'Follow a payment',
  ],
  [
    'Connect and automate',
    '37 modular services, authorized data connectors, workflow rules and Integrations Hub.',
    '/products',
    'Explore all 37 services',
  ],
  [
    'Build business credibility',
    'A private Business Passport, signed verifiable credentials and corroborated relationships.',
    '/products/business-passport',
    'Explore Business Passport',
  ],
];

const SUITE_DOMAINS: {
  id: string;
  label: string;
  summary: string;
  appIds: string[];
  serviceIds: string[];
}[] = [
  {
    id: 'sales_commerce',
    label: 'Sales, CRM & Commerce',
    summary:
      'Convert CRM pipeline deals into quotations, retail POS shifts, online storefront orders and recurring subscriptions without re-entering data.',
    appIds: ['sales', 'crm', 'pos', 'commerce', 'subscriptions', 'marketing', 'website'],
    serviceIds: ['customers', 'products', 'sales', 'crm', 'orders', 'pos', 'commerce', 'website'],
  },
  {
    id: 'finance_accounting',
    label: 'Finance & Accounting',
    summary:
      'Maintain balanced double-entry books, tax schedules, fixed assets, FX revaluation, budgets, invoices, payment links and smart reconciliation.',
    appIds: ['finance', 'accounting'],
    serviceIds: [
      'accounting',
      'invoicing',
      'payments',
      'reconciliation',
      'cash_flow',
      'expenses',
      'income',
      'protected_payments',
    ],
  },
  {
    id: 'supply_production',
    label: 'Inventory, Supply & Field',
    summary:
      'Manage multi-warehouse stock, FIFO/AVCO valuation, automated procurement RFQs, BOM manufacturing, freight logistics and field dispatches.',
    appIds: ['inventory', 'procurement', 'manufacturing', 'logistics', 'field_operations', 'property_hospitality'],
    serviceIds: ['inventory', 'procurement', 'fulfillment'],
  },
  {
    id: 'people_work',
    label: 'People, Work & Support',
    summary:
      'Coordinate HR profiles, leave, attendance, Kanban projects, shared calendars, encrypted e-sign documents, helpdesk SLAs and staff training.',
    appIds: ['people', 'work', 'calendar', 'documents', 'support', 'knowledge_learning'],
    serviceIds: ['people', 'work', 'calendar', 'documents'],
  },
  {
    id: 'trust_platform',
    label: 'Analytics, AI, Studio & Trust',
    summary:
      'Combine Shopify-style analytics, 90-day cash forecasts, consent-gated AI explanations, custom Studio apps, Integrations Hub and Business Passport.',
    appIds: ['analytics', 'automations', 'business_id', 'studio', 'integrations_hub'],
    serviceIds: [
      'intelligence',
      'forecasting',
      'assistant',
      'automations',
      'data',
      'connect',
      'passport',
      'verification',
      'credentials',
      'trust_network',
      'blockchain',
      'developer_api',
      'webhooks',
      'verification_api',
    ],
  },
];

function SuiteExplorer() {
  const [activeDomain, setActiveDomain] = useState(SUITE_DOMAINS[0].id);
  const current = SUITE_DOMAINS.find((d) => d.id === activeDomain) || SUITE_DOMAINS[0];
  const domainApps = current.appIds
    .map((id) => appCatalog.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a);
  const domainServices = current.serviceIds
    .map((id) => serviceCatalog.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <section className="home-suite-explorer" aria-labelledby="suite-explorer-heading">
      <div className="home-suite-header">
        <div>
          <span className="eyebrow">
            {appCatalog.length} connected apps · {serviceCatalog.length} modular services
          </span>
          <h2 id="suite-explorer-heading">Every department working in unison.</h2>
        </div>
        <span className="suite-price-pill">
          Capped at KSh {(WORKSPACE_ALL_APPS_CAP_MINOR / 100).toLocaleString('en-KE')}/mo per
          workspace · Unlimited staff seats
        </span>
      </div>
      <div className="suite-tab-bar" role="tablist" aria-label="Platform suite domains">
        {SUITE_DOMAINS.map((domain) => (
          <button
            key={domain.id}
            type="button"
            role="tab"
            aria-selected={domain.id === current.id}
            className={'suite-tab' + (domain.id === current.id ? ' is-active' : '')}
            onClick={() => setActiveDomain(domain.id)}
          >
            {domain.label}
          </button>
        ))}
      </div>
      <p className="suite-domain-summary">{current.summary}</p>
      <div className="suite-columns">
        <div className="suite-column-panel">
          <h3>Connected apps ({domainApps.length})</h3>
          <ul className="suite-pill-grid">
            {domainApps.map((app) => (
              <li key={app.id} className="suite-item-card">
                <strong>{app.name}</strong>
                <span>{app.description}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="suite-column-panel">
          <h3>Underlying services ({domainServices.length})</h3>
          <ul className="suite-pill-grid">
            {domainServices.map((svc) => (
              <li key={svc.id} className="suite-item-card">
                <strong>{svc.name}</strong>
                <span>{svc.description}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function RefinedHome() {
  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-copy">
          <span className="eyebrow">
            AfriCore Platform · {appCatalog.length} Apps · {serviceCatalog.length} Services
          </span>
          <h1>
            Your business,
            <br /> all connected.
          </h1>
          <p>
            Run sales, accounting, inventory, POS, HR, projects, analytics and business credentials
            in one unified workspace — with role-based permissions and fair per-workspace pricing.
          </p>
          <div className="actions">
            <a className="button" href="/get-started">
              Get started free <Icon name="right" />
            </a>
            <a className="text-link light" href="#how-it-works">
              See how it works <Icon name="down" />
            </a>
          </div>
        </div>
        <ProductComposition />
      </section>
      <section className="home-groups" aria-labelledby="product-groups">
        <span className="eyebrow">One workspace. Complete operational unison.</span>
        <h2 id="product-groups">Start with what your business needs.</h2>
        <div>
          {groups.map(([name, text, href, cta]) => (
            <article key={href}>
              <h3>{name}</h3>
              <p>{text}</p>
              <a className="text-link" href={href}>
                {cta}
                <Icon name="right" />
              </a>
            </article>
          ))}
        </div>
      </section>
      <SuiteExplorer />
      <section className="home-example" id="how-it-works">
        <div>
          <span className="eyebrow">One sale, followed through</span>
          <h2>A payment is part of a bigger record.</h2>
          <p>
            A fictional shop issues an invoice for KSh 2,500. A trusted receipt covers KSh 1,500.
            Matching the receipt leaves KSh 1,000 still owed.
          </p>
          <p>
            Requesting a payment, confirming it and allocating it are separate steps. Settlement
            depends on the payment provider.
          </p>
          <a className="text-link" href="/products/reconciliation">
            Try the matching exercise <Icon name="right" />
          </a>
        </div>
        <HeroWorkflow />
      </section>
      <section className="home-working-day">
        <span className="eyebrow">How the platform works</span>
        <h2>Keep the next action clear.</h2>
        <ol>
          <li>
            <b>01</b>
            <h3>Record the work</h3>
            <p>
              Convert CRM leads into Sales orders, reserve Inventory stock and issue itemized
              invoices without duplicate typing.
            </p>
          </li>
          <li>
            <b>02</b>
            <h3>Follow the evidence</h3>
            <p>
              Inspect confirmed payment events, reconcile unmatched receipts and post balanced
              Accounting journals with second-person approval.
            </p>
          </li>
          <li>
            <b>03</b>
            <h3>Scale with role permissions</h3>
            <p>
              Assign Owner, Admin, Finance, Accountant, HR, Sales, Inventory, Support, Marketing or
              Viewer permissions across your entire team.
            </p>
          </li>
        </ol>
      </section>
      <section className="solutions-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Built around your working day</span>
            <h2>Find a familiar business situation.</h2>
          </div>
        </div>
        <MediaCarousel>
          {[
            [
              'Social commerce',
              'Follow a chat order through checkout and confirmation.',
              'social-commerce',
              'payments',
            ],
            [
              'Growing SMEs',
              'Coordinate customers, invoices and employee responsibilities.',
              'smes',
              'business',
            ],
            [
              'Contractors & suppliers',
              'Track deliveries, due dates and unpaid amounts.',
              'contractors',
              'invoicing',
            ],
          ].map(([title, text, slug, art]) => (
            <EditorialCard
              key={slug}
              title={title}
              text={text}
              href={'/solutions/' + slug}
              media={editorial[art]}
            />
          ))}
        </MediaCarousel>
      </section>
      <section className="home-assurance">
        <div>
          <span className="eyebrow">Trust and security</span>
          <h2>Know what a record can prove.</h2>
          <p>
            Eleven granular workspace roles enforce least-privilege access. Source labels
            distinguish a merchant statement from provider evidence, and credential signatures stay
            separate from claim quality.
          </p>
          <a className="text-link" href="/security">
            Review the safeguards <Icon name="right" />
          </a>
        </div>
        <div>
          <span className="eyebrow">Transparent Pricing &amp; Availability</span>
          <h3>Fair SME pricing. Honest sandbox boundaries.</h3>
          <p>
            Starter services are KSh 0/month and the entire 26-app suite is capped at KSh{' '}
            {(WORKSPACE_ALL_APPS_CAP_MINOR / 100).toLocaleString('en-KE')}/month per workspace
            (unlimited staff seats). Sandbox evaluation never charges your account; live provider
            settlement remains gated.
          </p>
          <p>Kenya first. Built for the continent.</p>
        </div>
      </section>
      <ServiceFinder />
      <section className="home-resources">
        <article>
          <span className="eyebrow">For developers</span>
          <h2>Build against explicit records and states.</h2>
          <p>
            Start with a scoped sandbox request, then verify signed webhook events and safe retries.
          </p>
          <a className="text-link" href="/developers">
            Open the developer guide <Icon name="right" />
          </a>
        </article>
        <article>
          <span className="eyebrow">AfriCore Learn</span>
          <h2>Understand the work behind the numbers.</h2>
          <p>
            Learn what reconciliation, receivables, forecasts and business proof mean in everyday
            operations.
          </p>
          <a className="text-link" href="/learn">
            Find a practical guide <Icon name="right" />
          </a>
        </article>
      </section>
      <section className="final-cta">
        <span className="eyebrow">Start with one workflow</span>
        <h2>See your next working day.</h2>
        <a className="button" href="/get-started">
          Find your workspace <Icon name="right" />
        </a>
        <p>Start free in sandbox with all 26 apps and 37 modular services ready to explore.</p>
      </section>
    </>
  );
}
