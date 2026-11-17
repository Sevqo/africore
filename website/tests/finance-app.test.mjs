import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { appSectionActive, appSectionTarget } from '../src/workspace-navigation.ts';

const appSource = fs.readFileSync(new URL('../../src/apps/catalog.ts', import.meta.url), 'utf8');
const appJs = ts.transpileModule(appSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { appCatalog } = await import(
  'data:text/javascript;base64,' + Buffer.from(appJs).toString('base64')
);
const finance = appCatalog.find((app) => app.id === 'finance');
const workspace = fs.readFileSync(
  new URL('../src/apps/FinanceAppWorkspace.tsx', import.meta.url),
  'utf8',
);
const appsWorkspace = fs.readFileSync(
  new URL('../src/apps/AppsWorkspace.tsx', import.meta.url),
  'utf8',
);
const operationsRoute = fs.readFileSync(
  new URL('../../src/operations/routes.ts', import.meta.url),
  'utf8',
);
const platformRoute = fs.readFileSync(
  new URL('../../src/platform/routes.ts', import.meta.url),
  'utf8',
);
const financeRoute = fs.readFileSync(
  new URL('../../src/finance/routes.ts', import.meta.url),
  'utf8',
);
const dashboard = fs.readFileSync(
  new URL('../src/apps/FinanceDashboard.tsx', import.meta.url),
  'utf8',
);
const operationsOverview = fs.readFileSync(
  new URL('../src/apps/FinanceOperationsOverview.tsx', import.meta.url),
  'utf8',
);
const moneyTools = fs.readFileSync(
  new URL('../src/marketplace/MoneyTools.tsx', import.meta.url),
  'utf8',
);
const paymentCentre = fs.readFileSync(
  new URL('../src/finance/PaymentCentre.tsx', import.meta.url),
  'utf8',
);

test('Finance app exposes the eight requested operational sections', () => {
  assert.deepEqual(
    finance.navigation.map((item) => item.section),
    [
      'dashboard',
      'Invoices',
      'Customers',
      'Payments',
      'Expenses',
      'Reconciliation',
      'receivables',
      'Reports',
    ],
  );
  assert.deepEqual(finance.required.business, ['invoicing', 'expenses', 'cash_flow']);
  assert.ok(finance.optional.includes('payments'));
  assert.ok(finance.optional.includes('reconciliation'));
});

test('Finance section routing stays in the installed app and preserves direct links', () => {
  assert.equal(appSectionTarget(finance, 'Invoices', { Invoices: 'Invoices' }), 'Apps');
  assert.equal(appSectionTarget(finance, 'Reports', { Reports: 'Reports' }), 'Apps');
  assert.equal(
    appSectionActive(finance, 'Invoices', 'Apps', 'Invoices', { Invoices: 'Invoices' }),
    true,
  );
  assert.match(workspace, /searchParams\.set\('section', value\)/);
  assert.match(workspace, /navigate\('Apps'\)/);
});

test('Finance dispatches to dedicated operation screens while retaining the approved landing dashboard', () => {
  assert.match(appsWorkspace, /app\.id\s*===\s*'finance'\s*\?\s*\(\s*<FinanceAppWorkspace/);
  assert.match(workspace, /section === 'dashboard'[\s\S]*?<FinanceDashboard/);
  for (const label of [
    'Invoices',
    'Customers',
    'Payments',
    'Expenses',
    'Reconciliation',
    'Aged receivables',
    'Financial reports',
  ]) {
    assert.ok(workspace.includes(label), `Finance workspace includes ${label}`);
  }
  assert.match(dashboard, /finance-app-main/);
  assert.match(dashboard, /Recent invoices/);
});

test('Odoo financial source overview is a separate operational page with live sources and navigation', () => {
  assert.match(workspace, /navigateFromMenu\('operations'\)/);
  assert.match(workspace, /section === 'operations'[\s\S]*?<FinanceOperationsOverview/);
  for (const label of ['Invoicing', 'Expenses', 'Payments', 'Cash flow', 'Reconciliation'])
    assert.ok(operationsOverview.includes(label), `Source overview includes ${label}`);
  assert.match(operationsOverview, /\/financial-summary/);
  assert.match(operationsOverview, /\/records\/invoices/);
  assert.match(operationsOverview, /\/payment-events/);
  assert.match(operationsOverview, /onClick=\{\(\) => navigate\('Reconciliation'\)\}/);
  assert.match(operationsOverview, /not a bank\s+balance or profit/);
});

test('invoice register uses server pagination, literal search, status and date/currency/customer filters', () => {
  assert.match(workspace, /\/records\/\$\{kind\}\?\$\{filterQuery\}/);
  assert.match(workspace, /issue_from/);
  assert.match(workspace, /due_to/);
  assert.match(workspace, /customer_id/);
  assert.match(platformRoute, /issue_from/);
  assert.match(platformRoute, /due_to/);
  assert.match(platformRoute, /SELECT COUNT\(\*\) AS total FROM ac_records/);
  assert.match(platformRoute, /q\.toLowerCase\(\)\.replace/);
  assert.match(workspace, /params\.set\('q', customerLookup\.trim\(\)\)/);
  assert.match(workspace, /placeholder="Search all customers"/);
});

test('expenses are paginated and exclude archived and superseded entries by default', () => {
  assert.match(operationsRoute, /include_history/);
  assert.match(operationsRoute, /replacement\.kind='expenses'/);
  assert.match(operationsRoute, /SELECT COUNT\(\*\) AS total FROM ac2_objects/);
  assert.match(workspace, /<MoneyTools[\s\S]*?cashFlow=\{false\}[\s\S]*?compact/);
  assert.match(moneyTools, /include_history/);
  assert.match(moneyTools, /total/);
  assert.match(moneyTools, /filterCurrency/);
  assert.match(operationsRoute, /currency: currencySchema\.optional\(\)/);
});

test('payment and reconciliation views consume authoritative events and explicit allocation review', () => {
  assert.match(financeRoute, /COUNT\(DISTINCT e\.id\) AS total FROM ac_financial_events/);
  assert.match(paymentCentre, /\/reconciliation\/.*\/candidates/);
  assert.match(paymentCentre, /\/payment-events\/.*\/allocate/);
  assert.match(workspace, /reconciliationAvailable/);
  assert.match(workspace, /paymentAvailable/);
  assert.match(paymentCentre, /params\.set\('currency', currency\)/);
  assert.match(paymentCentre, /params\.set\('from', from\)/);
  assert.match(paymentCentre, /params\.set\('q', query\.trim\(\)\)/);
  assert.match(financeRoute, /currency: currencySchema\.optional\(\)/);
  assert.match(financeRoute, /q: z\.string\(\)\.trim\(\)\.max\(200\)/);
});

test('receivables and reports disclose their evidence coverage and do not claim accounting statements', () => {
  assert.match(workspace, /financial-summary/);
  assert.match(workspace, /historical\s+payment or credit status is limited to evidence retained/i);
  const overview = fs.readFileSync(
    new URL('../src/finance/FinancialOverview.tsx', import.meta.url),
    'utf8',
  );
  assert.match(overview, /Net confirmed collections/);
  assert.match(overview, /not a bank balance, profit statement or complete financial/);
  assert.match(overview, /Export displayed activity CSV/);
  assert.match(overview, /view === 'table'/);
});

test('Finance remains separate from Accounting and Procurement', () => {
  assert.match(workspace, /Vendor bills remain in Procurement/);
  assert.match(workspace, /does not post an accounting journal/);
  assert.doesNotMatch(workspace, /\/accounting\/(?:journals|entries)/);
  assert.doesNotMatch(workspace, /\/procurement\/bills\/.*\/payment/);
});
