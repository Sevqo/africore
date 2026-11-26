import { serviceEducation } from './serviceEducation';
import { useState } from 'react';
import { serviceCatalog, type WorkspaceKind } from '../../../src/marketplace/catalog';
import { commercialRateFor } from '../../../src/marketplace/pricing-catalog';

const goals: Record<string, string[]> = {
  'Send invoices': ['invoicing'],
  'Win deals, quotes & sales orders': ['customers', 'crm', 'products', 'sales', 'orders'],
  'Run retail POS & online storefront': ['pos', 'commerce', 'fulfillment', 'protected_payments'],
  'Manage warehouses, stock & purchasing': ['inventory', 'procurement'],
  'Maintain double-entry accounting & costs': ['accounting', 'expenses', 'cash_flow', 'income'],
  'Collect & reconcile payments': ['payments', 'reconciliation'],
  'Coordinate people, projects & schedules': ['people', 'work', 'calendar', 'documents'],
  'Publish public websites & pages': ['website'],
  'Review financial patterns & AI insights': ['intelligence', 'forecasting', 'assistant'],
  'Automate routine follow-up': ['automations'],
  'Import & sync external records': ['connect', 'data'],
  'Verify business identity & share credentials': [
    'passport',
    'verification',
    'credentials',
    'trust_network',
    'blockchain',
  ],
  'Build with APIs & signed webhooks': ['developer_api', 'webhooks', 'verification_api'],
};

const availability = {
  available: 'Available',
  evaluation: 'Evaluation',
  requires_configuration: 'Requires setup',
  unavailable: 'Unavailable',
};

export function ServiceFinder() {
  const [goal, setGoal] = useState('Send invoices'),
    [kind, setKind] = useState<WorkspaceKind>('business');
  const candidates = serviceCatalog.filter((s) => goals[goal].includes(s.id)),
    eligible = candidates.filter((s) => s.kinds.includes(kind));
  return (
    <section className="learning-paths" id="service-finder">
      <span className="eyebrow">Choose only what you need · All 37 platform services</span>
      <h2>What would you like to do with AfriCore?</h2>
      <p>
        Explore without an account. Recommendations are optional; review setup and the applicable
        workspace rate before activating a service.
      </p>
      <div className="learning-filters">
        <label>
          Your task
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            {Object.keys(goals).map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          Workspace
          <select value={kind} onChange={(e) => setKind(e.target.value as WorkspaceKind)}>
            <option value="personal">Personal</option>
            <option value="business">Business</option>
            <option value="developer">Developer</option>
          </select>
        </label>
      </div>
      <p role="status">
        {eligible.length} eligible {eligible.length === 1 ? 'service' : 'services'} for this task in{' '}
        {kind}.
      </p>
      <div className="lesson-grid">
        {eligible.map((s) => {
          const rate = commercialRateFor(s.id);
          return (
            <article key={s.id} className="service-finder-card">
              <div className="service-finder-meta">
                <span className="badge">{availability[s.availability]}</span>
                <span className="service-finder-rate">{rate.summary.split('·')[0].trim()}</span>
              </div>
              <h3>{s.name}</h3>
              <p>{s.description}</p>
              <p>{s.detail}</p>
              <p>
                <strong>Usage measure:</strong> {s.unit}.
              </p>
              <p>
                <strong>Dependencies:</strong>{' '}
                {s.dependencies.length
                  ? s.dependencies
                      .map((id) => serviceCatalog.find((p) => p.id === id)!.name)
                      .join(', ')
                  : 'No other optional service required.'}
              </p>
              {s.setup.map((t) => (
                <p key={t}>{t}</p>
              ))}
              <p>
                <strong>Commercial SME plan:</strong> {rate.summary}. Sandbox evaluation is KSh 0
                with customer charging disabled.
              </p>
              <div className="service-finder-actions">
                <a className="text-link" href={serviceEducation[s.id]?.route || s.documentation}>
                  Explore how it works →
                </a>
                <a className="secondary-button" href={'/app?create=' + kind + '&service=' + s.id}>
                  Review {s.name} in workspace
                </a>
              </div>
            </article>
          );
        })}
      </div>
      {!eligible.length && (
        <p>
          This task is not available in the selected workspace. Choose another workspace to inspect
          eligible options; your account will not be changed.
        </p>
      )}
      <p className="service-finder-footnote">
        Availability describes the software service. External providers, live collection and
        institutional verification require their own configuration and authorization. Capital
        remains deferred.
      </p>
    </section>
  );
}
