import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {configureTestEnv,productFixtureBody} from './helpers';
configureTestEnv('pos-registers');
import {migrate,dbGet,dbRun,closeDb} from '../db';
import {createApp} from '../app';
import {serviceCatalog} from '../marketplace/catalog';
import {migratePOS} from '../pos/schema';
import {saveRegister,registerAccess,registers} from '../pos/registers';
import {openSession,adjustDrawer,closeSession,drawer} from '../pos/sessions';
import type {Access} from '../platform/auth';

let server:any,base:string,cookie='',org:string,actor:string,cashier:string,customer:string,registerId:string;
const access=():Access=>({org,actor,role:'owner',environment:'sandbox',api:false});
const cashierAccess=():Access=>({...access(),actor:cashier,role:'viewer'});
const key=()=>randomUUID();
async function api(path:string,body:any,session=cookie){const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:session},body:JSON.stringify(productFixtureBody(path,'POST',body))});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]||''};}
const configuration=()=>({expected_version:0,name:'Fictional test register',default_customer_id:customer,cashier_ids:[cashier],acknowledge_automated_invoicing:true,acknowledge_recorded_cash:true});
before(async()=>{
 // Exercise dormant POS services without publishing unfinished POS discovery.
 // This process-local fixture definition is not added to the product catalog.
 serviceCatalog.push({...serviceCatalog.find(s=>s.id==='commerce')!,id:'pos',name:'Synthetic POS fixture',tabs:[],dependencies:[],meter:'pos.operations',unit:'pos operations'});
 await migrate();await migratePOS();await migratePOS();
 server=createApp().listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 const owner=await api('/api/auth/signup',{email:key()+'@example.test',password:'Synthetic-register-owner-2026!'});assert.equal(owner.status,201);cookie=owner.cookie;actor=owner.data.id;
 const workspace=await api('/api/auth/workspaces',{kind:'business',name:'Synthetic POS fixture',country:'KE',currency:'KES',timezone:'Africa/Nairobi',display_name:'Fictional owner'});assert.equal(workspace.status,201);org=workspace.data.id;
 const contact=await api('/api/v1/organizations/'+org+'/records/customers',{name:'Fictional walk-in customer'});assert.equal(contact.status,201);customer=contact.data.id;
 const member=await api('/api/auth/signup',{email:key()+'@example.test',password:'Synthetic-register-cashier-2026!'},'');assert.equal(member.status,201);cashier=member.data.id;
 await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'viewer')",[org,cashier]);
});
after(async()=>{serviceCatalog.splice(serviceCatalog.findIndex(s=>s.id==='pos'),1);if(server)await new Promise<void>(r=>server.close(()=>r()));await closeDb();});

test('register configuration validates current canonical scope, assignments and Sales discount policy',async()=>{
 const a=access();
 await assert.rejects(saveRegister(a,null,{...configuration(),manager_discount_bps:2001},key()),/Sales policy/);
 await assert.rejects(saveRegister(a,null,{...configuration(),manager_ids:[cashier]},key()),/managers require/);
 await assert.rejects(saveRegister(a,null,{...configuration(),cashier_ids:[key()]},key()),/current members/);
 await assert.rejects(saveRegister(a,null,{...configuration(),default_customer_id:key()},key()),/not found/i);
 await assert.rejects(saveRegister(a,null,{...configuration(),warehouse_id:key()},key()),/warehouse/);
 await assert.rejects(saveRegister(a,null,{...configuration(),electronic_method:'daraja_sandbox'},key()),/qualification/);
 const idempotency=key(),r=await saveRegister(a,null,configuration(),idempotency);registerId=r.id;
 assert.equal((await saveRegister(a,null,configuration(),idempotency)).id,r.id);
 assert.equal((await registers(cashierAccess())).data.length,1);
 assert.equal((await registerAccess(cashierAccess(),r.id,{write:true})).manager,false);
 await assert.rejects(saveRegister(cashierAccess(),null,configuration(),key()),/owner or administrator/);
 await assert.rejects(registerAccess({...a,environment:'production'},r.id),/Activate|not found/);
 await assert.rejects(registerAccess({...a,api:true},r.id),/human/);
});

test('register policy and cashier grants are checked fresh before writes and idempotent replay',async()=>{
 const a=access(),input={expected_register_version:1,opening_cash_minor:1000,acknowledge_count:true};
 await dbRun("UPDATE ac_memberships SET role='viewer' WHERE org_id=? AND user_id=?",[org,actor]);
 try{await assert.rejects(openSession(cashierAccess(),registerId,input,key()),/policy authorization/);}finally{await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?",[org,actor]);}
 await dbRun("UPDATE ac_service_entitlements SET status='disabled' WHERE org_id=? AND environment='sandbox' AND service_id='invoicing'",[org]);
 try{await assert.rejects(saveRegister(a,registerId,{...configuration(),expected_version:1},key()),/Activate/);await assert.rejects(openSession(cashierAccess(),registerId,input,key()),/Activate/);}finally{await dbRun("UPDATE ac_service_entitlements SET status='active' WHERE org_id=? AND environment='sandbox' AND service_id='invoicing'",[org]);}
 await dbRun('DELETE FROM ac_memberships WHERE org_id=? AND user_id=?',[org,cashier]);
 try{await assert.rejects(registerAccess(cashierAccess(),registerId,{write:true}),/membership/);}finally{await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'viewer')",[org,cashier]);}
});

test('register sessions serialize opening, retain encrypted adjustments and close exact immutable counts',async()=>{
 const a=access(),opening={expected_register_version:1,opening_cash_minor:1000,acknowledge_count:true},openingKey=key();
 const opened=await openSession(cashierAccess(),registerId,opening,openingKey),id=opened.session.id;
 assert.equal(opened.expected_minor,1000);assert.equal((await openSession(cashierAccess(),registerId,opening,openingKey)).session.id,id);
 await dbRun('DELETE FROM ac_memberships WHERE org_id=? AND user_id=?',[org,cashier]);
 try{await assert.rejects(openSession(cashierAccess(),registerId,opening,openingKey),/membership/);}finally{await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'viewer')",[org,cashier]);}
 await assert.rejects(openSession(a,registerId,opening,key()),/already has an open/);
 await assert.rejects(saveRegister(a,registerId,{...configuration(),expected_version:1},key()),/Close the current session/);
 const adjustment={expected_session_version:1,direction:'in',amount_minor:500,reason:'Fictional replenishment',acknowledge_physical_cash:true};
 await assert.rejects(adjustDrawer(cashierAccess(),id,adjustment,key()),/manager authority/);
 const adjustmentKey=key(),adjusted=await adjustDrawer(a,id,adjustment,adjustmentKey);assert.equal(adjusted.expected_minor,1500);assert.equal(adjusted.session.version,2);
 assert.equal((await adjustDrawer(a,id,adjustment,adjustmentKey)).expected_minor,1500);
 const row=await dbGet('SELECT id,data FROM ac_pos_drawer_adjustments WHERE session_id=?',[id]);assert.ok(!row.data.includes(adjustment.reason));
 await assert.rejects(dbRun('UPDATE ac_pos_drawer_adjustments SET amount_minor=1 WHERE id=?',[row.id]),/immutable/);
 await assert.rejects(adjustDrawer(a,id,{...adjustment,expected_session_version:1},key()),/changed/);
 await assert.rejects(closeSession(a,id,{expected_version:2,counted_cash_minor:1400,acknowledge_close:true},key()),/Explain/);
 const closing={expected_version:2,counted_cash_minor:1400,variance_reason:'Fictional count discrepancy',acknowledge_close:true},closingKey=key();
 const closed=await closeSession(a,id,closing,closingKey);assert.equal(closed.session.status,'closed');assert.equal(closed.closure.variance_minor,-100);assert.equal(closed.closure.expected_minor,1500);
 assert.equal((await closeSession(a,id,closing,closingKey)).closure.counted_minor,1400);
 await assert.rejects(adjustDrawer(a,id,{...adjustment,expected_session_version:3},key()),/open session changed/);
 await assert.rejects(dbRun("UPDATE ac_pos_sessions SET status='open' WHERE session_id=?",[id]),/immutable/);
 await assert.rejects(dbRun('DELETE FROM ac_pos_session_closures WHERE session_id=?',[id]),/immutable/);
 assert.equal((await drawer(cashierAccess(),id)).closure.counted_minor,1400);
 await assert.rejects(saveRegister(a,registerId,{...configuration(),expected_version:1,currency:'USD'},key()),/Currency and timezone/);
 const simultaneous=await Promise.allSettled([openSession(cashierAccess(),registerId,opening,key()),openSession(a,registerId,opening,key())]);
 assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1);assert.equal(simultaneous.filter(r=>r.status==='rejected').length,1);
});
