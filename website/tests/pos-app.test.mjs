import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {
  posAppSections,
  posAppViews,
  posPaymentState,
  posReference,
  posRegisterState,
  posSectionForView,
  posSuggestedCashInput,
} from '../src/pos/pos-app-model.ts';
import { serviceOpenDestination } from '../src/marketplace/service-open-destination.ts';
import { appSectionActive, appSectionTarget } from '../src/workspace-navigation.ts';

const appSource = fs.readFileSync(new URL('../../src/apps/catalog.ts', import.meta.url), 'utf8');
const appJs = ts.transpileModule(appSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { appCatalog } = await import(
  'data:text/javascript;base64,' + Buffer.from(appJs).toString('base64')
);
const pos = appCatalog.find((app) => app.id === 'pos');
const workspaceSource = fs.readFileSync(
  new URL('../src/pos/POSAppWorkspace.tsx', import.meta.url),
  'utf8',
);
const cashierSource = fs.readFileSync(
  new URL('../src/pos/POSCashier.tsx', import.meta.url),
  'utf8',
);
const configurationSource = fs.readFileSync(
  new URL('../src/pos/POSAppConfiguration.tsx', import.meta.url),
  'utf8',
);
const dashboardSource = fs.readFileSync(
  new URL('../src/pos/POSAppDashboard.tsx', import.meta.url),
  'utf8',
);
const appsWorkspaceSource = fs.readFileSync(
  new URL('../src/apps/AppsWorkspace.tsx', import.meta.url),
  'utf8',
);
const queriesSource = fs.readFileSync(new URL('../../src/pos/queries.ts', import.meta.url), 'utf8');

test('POS app has management navigation while the independent service keeps the counter', () => {
  assert.ok(pos, 'POS app is registered');
  assert.deepEqual(
    pos.navigation.map((item) => item.section),
    ['dashboard', 'orders', 'products', 'reporting', 'configuration'],
  );
  assert.deepEqual(pos.required, {
    business: ['products', 'orders', 'invoicing', 'cash_flow', 'pos'],
  });
  assert.equal(
    serviceOpenDestination({ id: 'pos', tabs: ['Point of Sale'] }, 'business').tab,
    'Point of Sale',
  );
  assert.deepEqual(
    posAppSections.map((item) => item.label),
    ['Dashboard', 'Orders', 'Products', 'Reporting', 'Configuration'],
  );
  assert.ok(posAppViews.includes('cashier'));
  assert.equal(posSectionForView('cashier'), 'dashboard');
});

test('POS sidebar sections stay inside the installed app', () => {
  const direct = { reporting: 'Reports', products: 'Products' };
  assert.equal(appSectionTarget(pos, 'reporting', direct), 'Apps');
  assert.equal(appSectionTarget(pos, 'products', direct), 'Apps');
  assert.equal(appSectionActive(pos, 'reporting', 'Apps', 'reporting', direct), true);
  assert.equal(appSectionActive(pos, 'reporting', 'Reports', 'reporting', direct), false);
  assert.equal(appSectionTarget({ id: 'analytics' }, 'reporting', direct), 'Apps');
  assert.equal(appSectionActive({ id: 'analytics' }, 'reporting', 'Apps', 'reporting', direct), true);
});

test('the installed POS app renders the operational workspace, not the service screen', () => {
  assert.match(appsWorkspaceSource, /app\.id\s*===\s*'pos'\s*\?\s*\(\s*<POSAppWorkspace/);
  assert.doesNotMatch(appsWorkspaceSource, /app\.id\s*===\s*'pos'\s*\?\s*\(\s*<POSWorkspace/);
  assert.doesNotMatch(workspaceSource, /from '\.\/POSWorkspace'/);
  for (const path of ['/pos/registers', '/sessions/', '/receipt', '/close'])
    assert.ok(workspaceSource.includes(path), path);
  for (const path of ['/draft', '/quote', '/confirm'])
    assert.ok(cashierSource.includes(path), path);
});

test('POS read projections expose real categories, customer identity and payment state', () => {
  assert.ok(queriesSource.includes('category'), 'product category filter is exposed');
  assert.ok(queriesSource.includes('categories'), 'category list is exposed');
  assert.ok(
    queriesSource.includes('customer_name'),
    'sale history includes canonical customer name',
  );
  assert.ok(
    queriesSource.includes('payment_status'),
    'sale history includes invoice payment state',
  );
  assert.ok(
    queriesSource.includes('from') && queriesSource.includes('to'),
    'date filters are supported',
  );
});

test('cashier and payment use authoritative quote, confirmation and acknowledgement fields', () => {
  assert.ok(cashierSource.includes("'/quote'"));
  assert.ok(cashierSource.includes("'/confirm'"));
  assert.ok(cashierSource.includes('quote_hash'));
  assert.ok(cashierSource.includes('acknowledge_recorded_cash'));
  assert.ok(cashierSource.includes('acknowledge_sandbox_electronic'));
  assert.ok(cashierSource.includes('acknowledge_handover'));
  assert.ok(cashierSource.includes('posSuggestedCashInput'));
  assert.ok(cashierSource.includes('Quantity must be greater than zero'));
  assert.ok(dashboardSource.includes('Opening control'));
  assert.ok(dashboardSource.includes('opening cash count'));
});

test('manageable configuration and unsupported capabilities are stated honestly', () => {
  assert.ok(configurationSource.includes('POSRegisterEditor'));
  assert.ok(configurationSource.includes('Tracked products cannot be sold until Inventory'));
  assert.ok(
    configurationSource.includes(
      'Live card terminals, live M-Pesa/Daraja collection, offline transaction queues',
    ),
  );
  assert.ok(dashboardSource.includes('no live terminal, automatic drawer or offline queue'));
  assert.equal(posRegisterState({ status: 'active' }, { occupied: false }).id, 'ready');
  assert.equal(posRegisterState({ status: 'active' }, { occupied: true }).id, 'open');
  assert.equal(posPaymentState({ status: 'confirmed', outstanding_minor: 0 }).id, 'paid');
  assert.equal(posReference({ id: '12345678-0000', status: 'confirmed' }), 'POS-123456780000');
  assert.equal(posSuggestedCashInput(1234, 'KES'), '12.34');
});
