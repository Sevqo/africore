import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {
  comparisonRows,
  dashboardCounts,
  filterRecords,
  labelForStatus,
  lineTotal,
  orderHasOpenReceipt,
  orderOpenQuantity,
  pageSlice,
  procurementSections,
  procurementViews,
  sectionForView,
  viewsForSection,
} from '../src/apps/procurement-app-model.ts';
import {serviceOpenDestination} from '../src/marketplace/service-open-destination.ts';
import {appSectionActive, appSectionTarget} from '../src/workspace-navigation.ts';

const appSource = fs.readFileSync(new URL('../../src/apps/catalog.ts', import.meta.url), 'utf8');
const appJs = ts.transpileModule(appSource, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const {appCatalog} = await import('data:text/javascript;base64,' + Buffer.from(appJs).toString('base64'));
const procurement = appCatalog.find((app) => app.id === 'procurement');
const workspaceSource = fs.readFileSync(new URL('../src/apps/ProcurementAppWorkspace.tsx', import.meta.url), 'utf8');
const appsWorkspaceSource = fs.readFileSync(new URL('../src/apps/AppsWorkspace.tsx', import.meta.url), 'utf8');

const order = {id: 'o1', status: 'issued', data: {currency: 'KES', total_minor: 50000, delivery_on: '2020-01-01', lines: [
  {id: 'l1', quantity_milli: 5000, unit_price_minor: 10000, product_snapshot: {id: 'p1', name: 'Carton', sku: 'C1', unit: 'box', track_inventory: true}},
  {id: 'l2', quantity_milli: 1000, unit_price_minor: 2500, product_snapshot: {id: 'p2', name: 'Service', sku: 'S1', unit: 'unit', track_inventory: false}},
]}};

test('the Procurement app has Odoo purchasing navigation while the service keeps its own interface', () => {
  assert.ok(procurement, 'procurement app is registered');
  assert.deepEqual(procurement.navigation.map((item) => item.section), ['dashboard', 'orders', 'products', 'reporting', 'configuration']);
  assert.deepEqual(procurement.required, {business: ['customers', 'products', 'procurement']});
  assert.ok(procurement.optional.includes('inventory'));
  assert.equal(serviceOpenDestination({id: 'procurement', tabs: ['Procurement']}, 'business').tab, 'Procurement');
});

test('procurement sidebar sections stay inside the installed app', () => {
  const direct = {products: 'Products', reporting: 'Reports'};
  assert.equal(appSectionTarget(procurement, 'products', direct), 'Apps');
  assert.equal(appSectionTarget(procurement, 'reporting', direct), 'Apps');
  assert.equal(appSectionActive(procurement, 'products', 'Apps', 'products', direct), true);
  assert.equal(appSectionActive(procurement, 'products', 'Products', 'products', direct), false);
  assert.equal(appSectionTarget({id: 'finance'}, 'reporting', direct), 'Reports');
});

test('the installed Procurement app renders the operational workspace, not the service screen', () => {
  assert.match(appsWorkspaceSource, /app\.id==='procurement'\?<ProcurementAppWorkspace/);
  assert.doesNotMatch(appsWorkspaceSource, /app\.id==='procurement'\?<ProcurementWorkspace/);
  assert.doesNotMatch(workspaceSource, /from '\.\/ProcurementWorkspace'/);
  assert.match(workspaceSource, /\/procurement\?type=/);
  assert.match(workspaceSource, /\/procurement\/orders\/.*\/receive/);
  assert.match(workspaceSource, /\/procurement\/bills\/.*\/payment/);
  assert.match(workspaceSource, /\/procurement\/.*\/decision/);
  assert.ok(workspaceSource.includes('403'));
});

test('procurement screens keep real purchasing and financial boundaries', () => {
  assert.ok(workspaceSource.includes('No email, order transmission, supplier portal or bank payment is performed by this workspace.'));
  assert.ok(workspaceSource.includes('no live supplier connection, bank movement or statutory filing is performed'));
  assert.ok(workspaceSource.includes('Vendor pricelists are not available'));
  assert.ok(workspaceSource.includes('The current procurement backend has no vendor-specific price-list record.'));
  assert.ok(!workspaceSource.includes('email sent'));
  assert.ok(!workspaceSource.includes('payment successful'));
  assert.ok(workspaceSource.includes('Only accepted quantities increased stock.'));
  assert.ok(workspaceSource.includes('Confirmed purchase value'));
});

test('procurement model projects real document relationships and exact money', () => {
  assert.equal(lineTotal({quantity_milli: 1500, unit_price_minor: 1000}), 1500);
  assert.equal(lineTotal({amount_minor: 777, quantity_milli: 1, unit_price_minor: 1}), 777);
  const detail = {received: {l1: 1000}};
  assert.equal(orderOpenQuantity(order, detail), 5000);
  assert.equal(orderHasOpenReceipt(order, detail), true);
  assert.equal(orderHasOpenReceipt(order, {received: {l1: 5000}}), false);
  const metrics = dashboardCounts({
    requests: [{id: 'r1', status: 'draft'}],
    rfqs: [{id: 'f1', status: 'draft'}, {id: 'f2', status: 'accepted'}],
    orders: [order],
    receipts: [{id: 'x1', status: 'posted'}],
    bills: [{id: 'b1', status: 'draft'}],
  });
  assert.equal(metrics.newRfqs, 1);
  assert.equal(metrics.sentRfqs, 1);
  assert.equal(metrics.awaitingApproval, 2);
  assert.equal(metrics.received, 1);
  assert.equal(metrics.confirmedOrders, 1);
});

test('procurement comparison, filtering and paging are deterministic', () => {
  const offers = [
    {id: 'f1', status: 'draft', data: {reference: 'P0001', currency: 'KES', supplier_snapshot: {name: 'Acme'}, lines: [{id: 'l1', product_id: 'p1', quantity_milli: 1000, unit_price_minor: 1500, product_snapshot: {name: 'Carton', sku: 'C1', unit: 'box'}}]}},
    {id: 'f2', status: 'draft', data: {reference: 'P0002', currency: 'KES', supplier_snapshot: {name: 'Beta'}, lines: [{id: 'l2', product_id: 'p1', quantity_milli: 1000, unit_price_minor: 1000, product_snapshot: {name: 'Carton', sku: 'C1', unit: 'box'}}]}},
  ];
  const groups = comparisonRows(offers);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].offers.map((offer) => offer.supplier), ['Beta', 'Acme']);
  const rows = filterRecords(offers, 'acme');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'f1');
  assert.equal(filterRecords(offers, '', 'draft').length, 2);
  assert.equal(pageSlice([1, 2, 3], 0, 2).length, 2);
  assert.equal(labelForStatus('approved'), 'Awaiting Issue');
});

test('procurement sections expose every view and keep source-of-truth paths', () => {
  assert.deepEqual(procurementSections.map((section) => section.section), ['dashboard', 'orders', 'products', 'reporting', 'configuration']);
  for (const view of procurementViews) {
    assert.ok(viewsForSection[sectionForView(view)].includes(view), view + ' is reachable from its section');
  }
  assert.ok(procurementViews.includes('pricelists'));
  assert.ok(procurementViews.includes('receipt-report'));
  assert.ok(procurementViews.includes('approval-report'));
});
