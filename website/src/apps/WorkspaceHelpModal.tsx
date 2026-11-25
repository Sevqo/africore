import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Overlay } from '../components/Overlay';

type GuideEntry = {
  id: string;
  title: string;
  family: string;
  summary: string;
  steps: string[];
  connections: string;
};

const GUIDES: GuideEntry[] = [
  {
    id: 'getting_started',
    title: 'Getting Started & Team Roles',
    family: 'Workspace Setup',
    summary: 'Invite colleagues with role-scoped access, activate services in 1 click, and switch apps smoothly.',
    steps: [
      'Open Team to invite members with domain roles (Owner, Admin, Finance, Accountant, HR, Sales, Operations, Inventory Manager, Support Agent, Marketing Manager, or Read-Only Viewer).',
      'Open Services to activate or bundle platform capabilities in one click—dependencies are enabled automatically.',
      'Use the 9-dot App Launcher in the top bar or the Apps tab to open any installed workspace app.',
    ],
    connections: 'Team roles automatically filter visible apps and enforce server-side API authorization.',
  },
  {
    id: 'sales_pos_commerce',
    title: 'Sales, POS & Online Storefront',
    family: 'Commerce & Revenue',
    summary: 'Sell across quotations, retail counters, and your online storefront using one shared product catalog.',
    steps: [
      'In Sales -> Products or Commerce -> Catalogue, create canonical products and set reference prices.',
      'In POS, open a register (or click Link Default Warehouse if selling tracked stock) to ring up walk-in orders.',
      'In Commerce -> Storefront, click Preview Storefront to inspect your live draft theme, collections, and buyer cart BEFORE publishing.',
    ],
    connections: 'Orders link directly to Invoices, Inventory stock movements, and Logistics dispatch.',
  },
  {
    id: 'website',
    title: 'Website Builder & Live Preview',
    family: 'Web & Brand',
    summary: 'Create pages from ready-made templates, edit blocks inline, preview across devices, and publish safely.',
    steps: [
      'Open AfriCore Website and click New Page to pick a starter template (Landing Page, Services, About, Pricing, or Contact).',
      'Click any heading or paragraph on the canvas to edit inline, or drag blocks from the right panel.',
      'Click Live Site Preview to test Desktop and Mobile layouts immediately—even in Sandbox—and click Publish to save & publish in one step.',
    ],
    connections: 'Website inquiry forms convert 1-click into CRM leads; Commerce Showcase blocks embed your published store.',
  },
  {
    id: 'procurement_inventory',
    title: 'Procurement, Inventory & Manufacturing',
    family: 'Supply Chain',
    summary: 'Request purchases, approve supplier orders, track multi-warehouse stock, and run BOM production.',
    steps: [
      'In Procurement -> New -> Request, enter a spending ceiling (line items are optional on early requests) and submit for review.',
      'In Inventory, configure warehouses, locations, reordering rules, and inspect inbound/outbound stock moves.',
      'In Manufacturing, define Bills of Materials with scrap/labor rollup and complete Manufacturing Orders with QC pass into stock.',
    ],
    connections: 'Approved vendor bills prepare Accounting entries; completed MOs receive finished lots into Inventory.',
  },
  {
    id: 'calendar_work_people',
    title: 'Calendar, Work & People Sync',
    family: 'People & Collaboration',
    summary: 'Schedule workspace meetings, assign project tasks, and keep employees notified automatically.',
    steps: [
      'Create a meeting in Calendar with Workspace visibility or specific attendees—invited staff are notified immediately.',
      'Assign tasks or project memberships in Work; assignees see their tasks, upcoming Calendar meetings, and cross-app follow-ups in My Work.',
      'HR managers use AfriCore People for employee records, leave approvals, attendance, recruitment, and appraisals.',
    ],
    connections: 'Calendar meetings, Work tasks, CRM follow-ups, and Field Dispatches all converge in My Work and Notifications.',
  },
  {
    id: 'accounting_finance',
    title: 'Accounting, Subscriptions & Analytics',
    family: 'Finance & Intelligence',
    summary: 'Maintain balanced double-entry journals, automate recurring billing, and inspect Shopify-grade charts.',
    steps: [
      'Use Finance & Invoicing to issue customer invoices, record payment evidence, and track receivables.',
      'Use Subscriptions or Property & Hospitality to auto-generate canonical renewal and rent invoices in 1 click.',
      'Open Analytics or any app Reporting tab for interactive time-series charts, bar breakdowns, and donut distributions.',
    ],
    connections: 'Every financial posting requires balanced integer minor units and preserves immutable audit history.',
  },
];

export function WorkspaceHelpModal({
  open,
  onClose,
  activeAppId,
}: {
  open: boolean;
  onClose: () => void;
  activeAppId?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(() => {
    if (activeAppId && ['website'].includes(activeAppId)) return 'website';
    if (activeAppId && ['sales', 'pos', 'commerce', 'crm'].includes(activeAppId)) return 'sales_pos_commerce';
    if (activeAppId && ['procurement', 'inventory', 'manufacturing', 'logistics', 'field_operations'].includes(activeAppId))
      return 'procurement_inventory';
    if (activeAppId && ['calendar', 'work', 'people', 'knowledge_learning'].includes(activeAppId))
      return 'calendar_work_people';
    if (activeAppId && ['accounting', 'finance', 'subscriptions', 'analytics', 'property_hospitality'].includes(activeAppId))
      return 'accounting_finance';
    return 'getting_started';
  });

  if (!open) return null;

  const filtered = GUIDES.filter((g) =>
    !query.trim() ||
    `${g.title} ${g.family} ${g.summary} ${g.steps.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const active = filtered.find((g) => g.id === selectedId) || filtered[0] || GUIDES[0];

  return (
    <Overlay portal onClose={onClose}>
      <section
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-help-title"
        style={{
          width: 'min(920px, 94vw)',
          maxHeight: '86vh',
          overflow: 'auto',
          padding: '24px',
          display: 'grid',
          gap: '18px',
        }}
      >
        <div className="section-heading" style={{ margin: 0 }}>
          <div>
            <span className="eyebrow">AfriCore Help &amp; Interactive Guides</span>
            <h2 id="workspace-help-title" style={{ margin: '4px 0 0' }}>
              Platform Workflow Guides &amp; Documentation
            </h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close help center" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <input
          type="search"
          placeholder="Search guides (e.g. Storefront preview, POS warehouse, Website publish, Team roles, Calendar sync)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search platform guides"
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 270px) minmax(0, 1fr)',
            gap: '18px',
            alignItems: 'start',
          }}
        >
          <nav aria-label="Help topics" style={{ display: 'grid', gap: '6px' }}>
            {filtered.map((guide) => {
              const isCurrent = guide.id === active.id;
              return (
                <button
                  key={guide.id}
                  type="button"
                  onClick={() => setSelectedId(guide.id)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: isCurrent ? '1px solid #0b6e4f' : '1px solid #e2e8f0',
                    background: isCurrent ? '#ecfdf5' : '#ffffff',
                    color: '#0f172a',
                    cursor: 'pointer',
                  }}
                >
                  <small style={{ display: 'block', color: '#0b6e4f', fontWeight: 600, fontSize: '11px' }}>
                    {guide.family}
                  </small>
                  <strong style={{ fontSize: '13.5px' }}>{guide.title}</strong>
                </button>
              );
            })}
          </nav>

          <article
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              background: '#f8fafc',
              display: 'grid',
              gap: '14px',
            }}
          >
            <div>
              <span className="badge">{active.family}</span>
              <h3 style={{ margin: '8px 0 4px' }}>{active.title}</h3>
              <p style={{ margin: 0, color: '#475569' }}>{active.summary}</p>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Step-by-step workflow
              </h4>
              <ol style={{ margin: 0, paddingInlineStart: '20px', display: 'grid', gap: '8px' }}>
                {active.steps.map((step, index) => (
                  <li key={index} style={{ lineHeight: 1.5 }}>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                fontSize: '13px',
              }}
            >
              <strong>Cross-app connection: </strong>
              <span>{active.connections}</span>
            </div>

            <div className="form-actions" style={{ justifyContent: 'space-between', marginTop: '4px' }}>
              <a className="secondary-button" href="/docs">
                Full API &amp; Platform Docs
              </a>
              <button type="button" className="button" onClick={onClose}>
                Got it
              </button>
            </div>
          </article>
        </div>
      </section>
    </Overlay>
  );
}
