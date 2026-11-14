import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {
  defaultViewForSection,
  filterProducts,
  incomingIsOverdue,
  inventorySections,
  inventoryViews,
  movementLabels,
  pageCount,
  pageSlice,
  sectionForView,
  shipmentIsLate,
  shipmentIsOpen,
  shipmentNext,
  shipmentQuantity,
  transferDestination,
  viewsForSection,
} from '../src/apps/inventory-app-model.ts';
import {serviceOpenDestination} from '../src/marketplace/service-open-destination.ts';
import {appSectionActive, appSectionTarget} from '../src/workspace-navigation.ts';

const appSource = fs.readFileSync(new URL('../../src/apps/catalog.ts', import.meta.url), 'utf8');
const appJs = ts.transpileModule(appSource, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const {appCatalog} = await import('data:text/javascript;base64,' + Buffer.from(appJs).toString('base64'));
const inventory = appCatalog.find((app) => app.id === 'inventory');
const workspaceSource = fs.readFileSync(new URL('../src/apps/InventoryAppWorkspace.tsx', import.meta.url), 'utf8');
const appsWorkspaceSource = fs.readFileSync(new URL('../src/apps/AppsWorkspace.tsx', import.meta.url), 'utf8');

test('the Inventory app has Odoo-style navigation while the service keeps its own interface', () => {
  assert.ok(inventory, 'inventory app is registered');
  assert.deepEqual(inventory.navigation.map((item) => item.section), ['dashboard', 'operations', 'products', 'reporting', 'configuration']);
  assert.deepEqual(inventory.required, {business: ['products', 'inventory']});
  assert.deepEqual(inventory.optional, ['orders', 'fulfillment']);
  assert.equal(serviceOpenDestination({id: 'inventory', tabs: ['Inventory']}, 'business').tab, 'Inventory');
});

test('inventory sidebar sections stay inside the installed app', () => {
  const direct = {products: 'Products', reporting: 'Reports'};
  assert.equal(appSectionTarget(inventory, 'products', direct), 'Apps');
  assert.equal(appSectionTarget(inventory, 'reporting', direct), 'Apps');
  assert.equal(appSectionActive(inventory, 'products', 'Apps', 'products', direct), true);
  assert.equal(appSectionActive(inventory, 'products', 'Products', 'products', direct), false);
  assert.equal(appSectionTarget({id: 'finance'}, 'products', direct), 'Products');
});

test('the installed Inventory app renders the operational workspace, not the service screen', () => {
  assert.match(appsWorkspaceSource, /app\.id==='inventory'\?<InventoryAppWorkspace/);
  assert.doesNotMatch(appsWorkspaceSource, /app\.id==='inventory'\?<InventoryWorkspace/);
  assert.doesNotMatch(workspaceSource, /from '\.\/InventoryWorkspace'/);
  assert.match(workspaceSource, /\/inventory\/stock-counts/);
  assert.match(workspaceSource, /\/inventory\/movements/);
  assert.match(workspaceSource, /\/inventory\/incoming/);
  assert.match(workspaceSource, /\/shipments\?limit=100/);
  assert.ok(workspaceSource.includes("optional('fulfillment', '/shipments?limit=100')"));
  assert.ok(workspaceSource.includes("optional('orders', '/records/orders?limit=100')"));
  assert.ok(workspaceSource.includes("optional('customers', '/records/customers?limit=100')"));
  assert.match(workspaceSource, /Fulfillment service required/);
  assert.match(workspaceSource, /\/inventory\/replenishment-suggestions/);
  assert.match(workspaceSource, /No valuation is inferred/);
  assert.match(workspaceSource, /seller-reported/);
  assert.match(workspaceSource, /There is no draft, waiting or backorder state/);
});

test('inventory sections and views resolve without unsupported operational states', () => {
  assert.deepEqual(inventorySections.map((item) => item.section), ['dashboard', 'operations', 'products', 'reporting', 'configuration']);
  assert.deepEqual(Object.keys(viewsForSection), ['dashboard', 'operations', 'products', 'reporting', 'configuration']);
  for (const view of inventoryViews) assert.ok(viewsForSection[sectionForView[view]].includes(view), 'view must be reachable from its section: ' + view);
  assert.equal(defaultViewForSection.operations, 'receipts');
  assert.equal(defaultViewForSection.reporting, 'stock');
  assert.equal(movementLabels.transfer, 'Internal transfer');
  assert.equal(shipmentNext.ready_for_dispatch.includes('shipped'), true);
  assert.equal(shipmentNext.delivered.includes('cancelled'), false);
});

test('shipment and incoming status helpers use authoritative lifecycle states', () => {
  assert.equal(shipmentIsOpen('shipped'), true);
  assert.equal(shipmentIsOpen('delivered'), false);
  assert.equal(shipmentIsLate({status: 'processing', estimated_delivery: '2026-01-01'}, '2026-01-02'), true);
  assert.equal(shipmentIsLate({status: 'delivered', estimated_delivery: '2026-01-01'}, '2026-01-02'), false);
  assert.equal(incomingIsOverdue({status: 'planned', due_on: '2026-01-01'}, '2026-01-02'), true);
  assert.equal(incomingIsOverdue({status: 'received', due_on: '2026-01-01'}, '2026-01-02'), false);
});

test('stock filters, paging, transfers and shipment quantities use real records only', () => {
  const products = [
    {id: '1', name: 'Maize flour', sku: 'MF-1', category: 'Food', track_inventory: true, available_milli: 0, low_stock: true},
    {id: '2', name: 'Rice', sku: 'RC-2', category: 'Food', track_inventory: true, available_milli: 12000, low_stock: false},
    {id: '3', name: 'Delivery service', sku: 'SV-3', category: 'Services', track_inventory: false, available_milli: 0, low_stock: false},
  ];
  assert.deepEqual(filterProducts(products, 'out', '').map((p) => p.id), ['1']);
  assert.deepEqual(filterProducts(products, 'in', '').map((p) => p.id), ['2']);
  assert.deepEqual(filterProducts(products, 'tracked', '').map((p) => p.id), ['1', '2']);
  assert.deepEqual(filterProducts(products, 'low', 'maize').map((p) => p.id), ['1']);
  assert.equal(pageCount(51, 25), 3);
  assert.deepEqual(pageSlice([1, 2, 3, 4], 1, 2), [3, 4]);

  const movements = [
    {id: 'out1', kind: 'transfer', quantity_milli: -2000, source_id: null, warehouse_id: 'w1'},
    {id: 'in1', kind: 'receipt', quantity_milli: 2000, source_id: 'out1', warehouse_id: 'w2'},
  ];
  assert.equal(transferDestination(movements)[0].destination_warehouse_id, 'w2');
  assert.equal(shipmentQuantity([{quantity: '2.5'}, {quantity: 1}]), 3500);
});
