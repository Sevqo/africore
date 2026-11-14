import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {
  documentTotals,
  lineAmountMinor,
  orderIsConfirmed,
  orderIsOpenForDelivery,
  orderNeedsInvoice,
  pageOf,
  quotationInvoiceState,
  salesDashboard,
  searchOrders,
  searchQuotations,
  toMinor,
} from '../src/apps/sales-app-model.ts';
import {serviceOpenDestination} from '../src/marketplace/service-open-destination.ts';
import {appSectionActive,appSectionTarget} from '../src/workspace-navigation.ts';

const appSource=fs.readFileSync(new URL('../../src/apps/catalog.ts',import.meta.url),'utf8');
const appJs=ts.transpileModule(appSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {appCatalog}=await import('data:text/javascript;base64,'+Buffer.from(appJs).toString('base64'));
const sales=appCatalog.find(app=>app.id==='sales');
const workspaceSource=fs.readFileSync(new URL('../src/apps/SalesAppWorkspace.tsx',import.meta.url),'utf8');
const appsWorkspaceSource=fs.readFileSync(new URL('../src/apps/AppsWorkspace.tsx',import.meta.url),'utf8');

test('the Sales app has Odoo-style workflow navigation distinct from the service tab',()=>{
  assert.ok(sales,'sales app is registered');
  assert.deepEqual(sales.navigation.map(item=>item.section),['quotations','orders','catalog','reporting','configuration']);
  assert.equal(serviceOpenDestination({id:'sales',tabs:['Quotations']},'business').tab,'Quotations','the independent Sales service still opens its own quotation interface');
});

test('the installed Sales app renders the sales application workspace, not the service screen',()=>{
  assert.match(appsWorkspaceSource,/app\.id==='sales'\?<SalesAppWorkspace/);
  assert.doesNotMatch(appsWorkspaceSource,/app\.id==='sales'\?<SalesWorkspace/);
  assert.doesNotMatch(workspaceSource,/from '\.\/SalesWorkspace'/,'the sales app must not wrap the service component');
  for(const section of ['quotations','orders','catalog','reporting','configuration']){
    assert.match(workspaceSource,new RegExp("section==='"+section+"'|view==='"+section+"'|'"+section+"'"),'sales section missing: '+section);
  }
  assert.match(workspaceSource,/\/sales\/quotations/);
  assert.match(workspaceSource,/\/records\/orders/);
  assert.match(workspaceSource,/\/records\/invoices/);
  assert.match(workspaceSource,/outbound quotation email provider/i,'Send must not claim a message was delivered');
  assert.match(workspaceSource,/order document value/i,'reporting must define that order value is not revenue');
});

test('sales sidebar sections stay inside the installed app',()=>{
  const direct={Orders:'Orders',Reports:'Reports',products:'Products',quotations:'Quotations'};
  assert.equal(appSectionTarget(sales,'orders',direct),'Apps','Sales orders must not leave for the shared Orders tab');
  assert.equal(appSectionTarget(sales,'quotations',direct),'Apps');
  assert.equal(appSectionActive(sales,'orders','Apps','orders',direct),true);
  assert.equal(appSectionActive(sales,'orders','Orders','orders',direct),false);
  assert.equal(appSectionTarget({id:'finance'},'Orders',direct),'Orders','other apps keep their shared-tab mapping');
});

test('quotation and order lifecycle filters use canonical status fields',()=>{
  const invoices=[{id:'i1',order_id:'o1',status:'draft'}];
  const orders=[
    {id:'o1',status:'awaiting_payment',fulfillment_status:'pending',issue_date:'2026-11-01'},
    {id:'o2',status:'draft',issue_date:'2026-11-02'},
    {id:'o3',status:'cancelled',issue_date:'2026-11-03'},
  ];
  assert.equal(orderIsConfirmed(orders[0]),true);
  assert.equal(orderIsConfirmed(orders[1]),false);
  assert.equal(orderIsOpenForDelivery(orders[0]),true);
  assert.equal(orderNeedsInvoice(orders[0],[]),true);
  assert.equal(orderNeedsInvoice(orders[0],invoices),false,'a draft invoice already covers the order');
  const quotations=[
    {id:'q1',status:'converted',reference:'S0001',customer_id:'c1',order_id:'o1'},
    {id:'q2',status:'converted',reference:'S0002',customer_id:'c1',order_id:'o2'},
    {id:'q3',status:'draft',reference:'S0003',customer_id:'c1'},
  ];
  assert.equal(quotationInvoiceState(quotations[0],invoices),'Draft invoice');
  assert.equal(quotationInvoiceState(quotations[1],invoices),'To invoice');
  assert.equal(searchQuotations(quotations,'s0001',[],'to_invoice',invoices).length,0);
  assert.equal(searchQuotations(quotations,'',[],'to_invoice',invoices).length,1);
  assert.equal(searchOrders(orders,'',[],invoices,'to_invoice').length,0);
  assert.equal(searchOrders(orders,'',[],invoices,'confirmed').length,1);
  assert.deepEqual(salesDashboard(quotations,orders,invoices),{toConfirm:1,toDeliver:1,toInvoice:0});
});

test('decimal inputs and money stay in integer minor units',()=>{
  assert.equal(toMinor('1,234.50','KES'),123450);
  assert.equal(toMinor('1250','UGX'),1250);
  assert.equal(lineAmountMinor(1.5,10000),15000);
  assert.equal(lineAmountMinor(1.005,10000),10050);
  assert.deepEqual(documentTotals([{quantity:2,priceMinor:1250}],0,1600),{subtotal:2500,discount:0,tax:400,total:2900});
  assert.deepEqual(documentTotals([{quantity:1,priceMinor:1000}],300,0),{subtotal:1000,discount:300,tax:0,total:700});
  assert.deepEqual(pageOf([1,2,3,4,5],2,2),{rows:[3,4],page:2,pages:3,total:5});
});

test('the Sales app keeps its canonical service requirements',()=>{
  assert.deepEqual(sales.required.business,['customers','products','sales','orders','invoicing','fulfillment']);
  assert.deepEqual(sales.optional,['inventory','payments']);
  assert.equal(sales.availability,'available');
  assert.equal(sales.kinds[0],'business');
});
