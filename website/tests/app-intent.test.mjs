import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appIntentQuery,appIntentDestination} from '../src/accounts/app-intent.ts';

const apps=[{id:'commerce',kinds:['business'],navigation:[{section:'dashboard'},{section:'orders'}]}];

test('sign-in preserves a known app and section without carrying credential or arbitrary redirect parameters',()=>{
 const q=appIntentQuery('?app=commerce&section=orders&token=private&returnTo=https://attacker.example&email=private@example.test',apps);assert.equal(q.toString(),'app=commerce&section=orders');
 assert.equal(appIntentDestination('/app/business/12345678-abcd#Overview','?'+q,apps),'/app/business/12345678-abcd?app=commerce&section=orders#Apps');
 assert.equal(appIntentDestination('/app/workspaces?create=business','?'+q,apps),'/app/workspaces?create=business&app=commerce&section=orders');
});
test('app intents do not change destination authority, unsupported workspace kinds or unknown app routes',()=>{
 const q='?app=commerce&section=private-admin';assert.equal(appIntentQuery(q,apps).get('section'),'dashboard');
 for(const path of ['/app/personal','/app/developer','https://attacker.example/app/business/abcd','//attacker.example/app/business/abcd','/app/business/abcd%2fadmin'])assert.equal(appIntentDestination(path,q,apps),path);
 assert.equal(appIntentQuery('?app=unknown',apps).size,0);
});
