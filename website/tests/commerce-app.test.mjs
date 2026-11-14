import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {commerceMerchantSections} from '../src/commerce/merchant-sections.ts';
import {serviceOpenDestination} from '../src/marketplace/service-open-destination.ts';
import {appSectionActive,appSectionTarget} from '../src/workspace-navigation.ts';

const appSource=fs.readFileSync(new URL('../../src/apps/catalog.ts',import.meta.url),'utf8');
const appJs=ts.transpileModule(appSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {appCatalog}=await import('data:text/javascript;base64,'+Buffer.from(appJs).toString('base64'));
const commerce=appCatalog.find(app=>app.id==='commerce');
const merchantSource=fs.readFileSync(new URL('../src/commerce/CommerceMerchantWorkspace.tsx',import.meta.url),'utf8');
const appsWorkspaceSource=fs.readFileSync(new URL('../src/apps/AppsWorkspace.tsx',import.meta.url),'utf8');

test('the Commerce app has workflow navigation distinct from the service tab',()=>{
 assert.ok(commerce,'commerce app is registered');
 assert.deepEqual(commerce.navigation.map(item=>item.section),commerceMerchantSections.map(item=>item.section),'app navigation and merchant sections share one workflow order');
 assert.deepEqual(commerceMerchantSections.map(item=>item.section),['dashboard','catalog','orders','storefront','inventory','payments','reports','settings']);
 assert.equal(serviceOpenDestination({id:'commerce',tabs:['Commerce']},'business').tab,'Commerce','the independent service still opens its own Commerce interface');
});

test('the installed Commerce app renders a merchant workspace instead of the service screen',()=>{
 assert.match(appsWorkspaceSource,/app\.id==='commerce'\?<CommerceMerchantWorkspace/);
 assert.doesNotMatch(appsWorkspaceSource,/app\.id==='commerce'\?<CommerceWorkspace/);
 assert.doesNotMatch(merchantSource,/from '\.\/CommerceWorkspace'/,'the merchant app must not wrap the service component');
 assert.doesNotMatch(merchantSource,/from '\.\.\/commerce\/CommerceWorkspace'/);
 for(const section of commerceMerchantSections){
  assert.match(merchantSource,new RegExp("view==='"+section.section+"'"),'merchant section missing: '+section.section);
 }
 assert.match(merchantSource,/\/configuration/);
 assert.match(merchantSource,/\/listings\?/);
 assert.match(merchantSource,/\/orders\?/);
 assert.match(merchantSource,/No live funds move/,'merchant checkout copy must separate sandbox evidence from real collection');
 assert.match(merchantSource,/Visitor conversion|conversion,/,'unsupported reporting must be stated, not fabricated');
});

test('merchant sidebar sections stay inside the installed app',()=>{
 const direct={Orders:'Orders',Reports:'Reports',products:'Products'};
 assert.equal(appSectionTarget(commerce,'orders',direct),'Apps','Commerce orders must not leave for the shared Orders tab');
 assert.equal(appSectionTarget({id:'finance'},'Orders',direct),'Orders','other apps keep their existing shared-tab mapping');
 assert.equal(appSectionActive(commerce,'orders','Apps','orders',direct),true);
 assert.equal(appSectionActive(commerce,'orders','Orders','orders',direct),false);
 assert.equal(appSectionActive({id:'finance'},'Orders','Orders','Orders',direct),true);
});

test('the Commerce app keeps its canonical service requirements and preview availability',()=>{
 assert.deepEqual(commerce.required.business,['products','commerce','orders','invoicing','payments']);
 assert.deepEqual(commerce.optional,['inventory','fulfillment']);
 assert.equal(commerce.availability,'preview');
 assert.equal(commerce.kinds[0],'business');
});
