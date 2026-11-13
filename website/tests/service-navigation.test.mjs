import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { serviceOpenDestination } from '../src/marketplace/service-open-destination.ts';
import { businessTabs, personalTabs, developerTabs, workspaceTabs } from '../src/workspace-navigation.ts';

const catalogSource = fs.readFileSync(new URL('../../src/marketplace/catalog.ts', import.meta.url), 'utf8');
const catalogJs = ts.transpileModule(catalogSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { serviceCatalog } = await import(
  'data:text/javascript;base64,' + Buffer.from(catalogJs).toString('base64')
);

const requiredServices = [
  'customers', 'products', 'crm', 'orders', 'sales', 'invoicing', 'inventory', 'fulfillment',
  'income', 'expenses', 'cash_flow', 'payments', 'reconciliation', 'accounting', 'protected_payments',
  'pos', 'commerce', 'procurement', 'documents', 'people', 'work', 'automations',
  'intelligence', 'forecasting', 'assistant', 'data', 'connect',
  'passport', 'verification', 'credentials', 'trust_network', 'blockchain', 'verification_api',
  'developer_api', 'webhooks',
];
const trustServices = new Set(['passport', 'verification', 'credentials', 'trust_network', 'blockchain']);
const passportSections = new Set(['Overview', 'Verification Requests', 'Credentials', 'Business Network']);

test('every registered service resolves to a real destination in each workspace it supports', () => {
  assert.deepEqual(serviceCatalog.map((service) => service.id).sort(), [...requiredServices].sort());
  for (const service of serviceCatalog) {
    for (const kind of service.kinds) {
      const destination = serviceOpenDestination(service, kind);
      assert.ok(workspaceTabs[kind].includes(destination.tab), `${service.id}/${kind} opens missing tab ${destination.tab}`);
      if (trustServices.has(service.id)) {
        assert.equal(destination.tab, 'Business Passport', `${service.id}/${kind} must open the Passport trust interface`);
        assert.ok(passportSections.has(destination.section), `${service.id} needs a real Passport section`);
      } else {
        assert.notEqual(destination.tab, 'Business Passport', `${service.id}/${kind} must not fall back to the generic Passport page`);
      }
    }
  }
});

test('trust services open their own Passport section without requiring the Business ID app', () => {
  const expected = {
    passport: 'Overview',
    verification: 'Verification Requests',
    credentials: 'Credentials',
    trust_network: 'Business Network',
    blockchain: 'Credentials',
  };
  for (const [id, section] of Object.entries(expected)) {
    const destination = serviceOpenDestination({ id, tabs: [] }, 'business');
    assert.deepEqual(destination, { tab: 'Business Passport', section });
    assert.equal(destination.app, undefined);
  }
});

test('personal and developer workspaces use their own tab labels instead of dead ends', () => {
  assert.equal(serviceOpenDestination({ id: 'customers', tabs: ['Customers', 'Clients'] }, 'personal').tab, 'Clients');
  assert.equal(serviceOpenDestination({ id: 'payments', tabs: ['Payments', 'Payment Records'] }, 'personal').tab, 'Payment Records');
  for (const id of ['orders', 'invoicing', 'payments', 'reconciliation', 'connect']) {
    assert.equal(serviceOpenDestination({ id, tabs: [] }, 'developer').tab, 'API Explorer');
  }
  assert.equal(serviceOpenDestination({ id: 'developer_api', tabs: ['Developers'] }, 'developer').tab, 'My Applications');
  for (const id of ['webhooks', 'verification_api', 'products', 'data', 'assistant']) {
    const destination = serviceOpenDestination({ id, tabs: [] }, 'developer');
    assert.ok(developerTabs.includes(destination.tab), `${id} has no developer destination`);
  }
});

test('unknown or unsupported destinations fail back to the service catalogue, never an unrelated page', () => {
  assert.deepEqual(serviceOpenDestination({ id: 'not_registered', tabs: [] }, 'business'), { tab: 'My Services' });
  assert.deepEqual(serviceOpenDestination({ id: 'not_registered', tabs: ['Nope'] }, 'personal'), { tab: 'My Services' });
  assert.deepEqual(serviceOpenDestination({ id: 'income', tabs: ['Income'] }, 'developer'), { tab: 'My Services' });
});

test('the workspace tab registries stay the navigation allowlist used by the apps', () => {
  assert.ok(businessTabs.includes('Webhooks'));
  assert.ok(businessTabs.includes('Verification APIs'));
  assert.ok(businessTabs.includes('Business Passport'));
  assert.ok(personalTabs.includes('Clients') && personalTabs.includes('Payment Records'));
  assert.ok(developerTabs.includes('My Applications') && developerTabs.includes('API Explorer'));
});
