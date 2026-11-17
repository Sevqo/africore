import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {
  accountingSections,
  accountingViews,
  balanceTotals,
  dashboardCounts,
  defaultViewForSection,
  journalType,
  profitLines,
  sectionForView,
  viewsForSection,
} from '../src/apps/accounting-app-model.ts';
import { serviceOpenDestination } from '../src/marketplace/service-open-destination.ts';
import { appSectionActive, appSectionTarget } from '../src/workspace-navigation.ts';

const appSource = fs.readFileSync(new URL('../../src/apps/catalog.ts', import.meta.url), 'utf8');
const appJs = ts.transpileModule(appSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { appCatalog } = await import(
  'data:text/javascript;base64,' + Buffer.from(appJs).toString('base64')
);
const accounting = appCatalog.find((app) => app.id === 'accounting');
const workspaceSource = fs.readFileSync(
  new URL('../src/apps/AccountingAppWorkspace.tsx', import.meta.url),
  'utf8',
);
const appsWorkspaceSource = fs.readFileSync(
  new URL('../src/apps/AppsWorkspace.tsx', import.meta.url),
  'utf8',
);
const routesSource = fs.readFileSync(new URL('../../src/erp/routes.ts', import.meta.url), 'utf8');
const accountingSource = fs.readFileSync(
  new URL('../../src/erp/accounting.ts', import.meta.url),
  'utf8',
);

test('the Accounting app has Odoo accounting navigation while the service keeps its own interface', () => {
  assert.ok(accounting, 'accounting app is registered');
  assert.deepEqual(
    accounting.navigation.map((item) => item.section),
    ['dashboard', 'customers', 'vendors', 'accounting', 'review', 'reporting', 'configuration'],
  );
  assert.deepEqual(accounting.required, { business: ['accounting'] });
  assert.ok(accounting.optional.includes('invoicing'));
  assert.ok(accounting.optional.includes('payments'));
  assert.equal(
    serviceOpenDestination({ id: 'accounting', tabs: ['Accounting'] }, 'business').tab,
    'Accounting',
  );
  assert.deepEqual(
    accountingSections.map((item) => item.label),
    ['Dashboard', 'Customers', 'Vendors', 'Accounting', 'Review', 'Reporting', 'Configuration'],
  );
});

test('accounting sidebar sections stay inside the installed app', () => {
  const direct = { reporting: 'Reports', accounting: 'Accounting' };
  assert.equal(appSectionTarget(accounting, 'reporting', direct), 'Apps');
  assert.equal(appSectionTarget(accounting, 'accounting', direct), 'Apps');
  assert.equal(appSectionActive(accounting, 'reporting', 'Apps', 'reporting', direct), true);
  assert.equal(appSectionActive(accounting, 'reporting', 'Reports', 'reporting', direct), false);
  assert.equal(appSectionTarget({ id: 'finance' }, 'reporting', direct), 'Apps');
  assert.equal(appSectionActive({ id: 'finance' }, 'reporting', 'Apps', 'reporting', direct), true);
});

test('the installed Accounting app renders the operational workspace, not the service screen', () => {
  assert.match(
    appsWorkspaceSource,
    /app\.id\s*===\s*'accounting'\s*\?\s*\(\s*<AccountingAppWorkspace/,
  );
  assert.doesNotMatch(
    appsWorkspaceSource,
    /app\.id\s*===\s*'accounting'\s*\?\s*\(\s*<AccountingWorkspace/,
  );
  assert.doesNotMatch(workspaceSource, /from '\.\/AccountingWorkspace'/);
  assert.match(workspaceSource, /\/accounting\/entries/);
  assert.match(workspaceSource, /\/accounting\/accounts/);
  assert.match(workspaceSource, /\/accounting\/journals/);
  assert.match(workspaceSource, /\/accounting\/periods/);
  assert.match(workspaceSource, /\/accounting\/report/);
  assert.ok(workspaceSource.includes('Bank synchronization and statement import are unsupported'));
  assert.ok(workspaceSource.includes('separate reviewer'));
});

test('journal configuration routes and optimistic versions are authoritative', () => {
  assert.ok(routesSource.includes("'/organizations/:org/accounting/journals'"));
  assert.ok(routesSource.includes("'/organizations/:org/accounting/journals/:id'"));
  assert.ok(routesSource.includes('saveJournal'));
  assert.match(accountingSource, /journalInput/);
  assert.match(accountingSource, /accounting\.journal_updated/);
});

test('every accounting section resolves to reachable views', () => {
  assert.equal(new Set(accountingViews).size, accountingViews.length);
  for (const item of accountingSections) {
    const allowed = viewsForSection[item.section];
    assert.ok(allowed?.length, `${item.section} exposes views`);
    assert.ok(
      allowed.includes(defaultViewForSection[item.section]),
      `${item.section} default is allowed`,
    );
    for (const view of allowed)
      assert.ok(
        viewsForSection[sectionForView(view)].includes(view),
        `${view} is reachable from its owning section`,
      );
  }
  assert.equal(accountingViews.length, 28);
});

test('journal and reporting projections use real codes and posted ledger shapes', () => {
  assert.equal(journalType({ code: 'SALES' }), 'sales');
  assert.equal(journalType({ code: 'PURCHASE' }), 'purchase');
  assert.equal(journalType({ name: 'Cash register' }), 'cash');
  const report = {
    profit_loss: [
      { id: 'r', type: 'revenue', debit_minor: 100, credit_minor: 1100 },
      { id: 'e', type: 'expense', debit_minor: 400, credit_minor: 50 },
    ],
    net_profit_minor: 650,
    balance_sheet: [
      { id: 'a', type: 'asset', net_debit_minor: 900 },
      { id: 'l', type: 'liability', net_debit_minor: -300 },
      { id: 'q', type: 'equity', net_debit_minor: -500 },
    ],
  };
  const pnl = profitLines(report);
  assert.equal(pnl.revenue.length, 1);
  assert.equal(pnl.expenses.length, 1);
  assert.equal(pnl.net, 650);
  const balance = balanceTotals(report);
  assert.equal(balance.assets, 900);
  assert.equal(balance.liabilities, 300);
  assert.equal(balance.equity, 500);
  assert.equal(balance.difference, 100);
});

test('dashboard counts describe loaded authorized records without fabricating revenue', () => {
  const counts = dashboardCounts({
    entries: [{ status: 'draft' }, { status: 'posted' }],
    invoices: [
      { data: { status: 'issued', total_minor: 100, due_date: '2000-01-01' } },
      { data: { status: 'paid' } },
    ],
    bills: [{ data: { status: 'approved' } }, { data: { status: 'draft' } }],
    events: [{ status: 'succeeded' }, { status: 'succeeded', allocated_at: '2026-01-01' }],
    periods: [{ status: 'open' }, { status: 'locked' }],
  });
  assert.equal(counts.draftEntries, 1);
  assert.equal(counts.postedEntries, 1);
  assert.equal(counts.draftInvoices, 1);
  assert.equal(counts.openPeriods, 1);
  assert.equal(counts.pendingEvents, 1);
});
