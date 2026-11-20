import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceCatalog } from '../marketplace/catalog';
import { serviceFamilies } from '../marketplace/families';
import { appCatalog } from '../apps/catalog';

test('all legacy service IDs appear in one stable family without changing identities', () => {
  const expected = ['income','expenses','cash_flow','payments','reconciliation','protected_payments','invoicing','accounting','commerce','products','customers','orders','sales','crm','pos','inventory','procurement','fulfillment','people','work','intelligence','forecasting','assistant','automations','passport','verification','credentials','trust_network','blockchain','data','connect','developer_api','webhooks','verification_api','documents'];
  const memberships = serviceFamilies.flatMap(f => f.services);
  assert.deepEqual([...serviceCatalog.map(s=>s.id)].filter(id=>expected.includes(id)).sort(), [...expected].sort());
  for (const id of expected) assert.equal(memberships.filter(x=>x===id).length,1,id);
  assert.equal(new Set(memberships).size,memberships.length);
  assert.equal(serviceCatalog.length,37);
});

test('catalog preserves the original fourteen apps and adds Calendar and Website', () => {
  assert.equal(appCatalog.length,16);
  assert.deepEqual(appCatalog.slice(0,2).map(a=>a.id),['calendar','website']);
  assert(appCatalog.some(a=>a.id==='calendar'&&a.required.business?.includes('calendar')));
  assert(appCatalog.some(a=>a.id==='website'&&a.required.business?.includes('website')));
});
