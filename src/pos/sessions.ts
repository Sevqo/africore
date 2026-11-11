import {randomUUID} from 'node:crypto';
import {dbAll,dbGet,dbRun} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {now,seal,unseal} from '../platform/crypto';
import {read,insert,update,operation} from '../erp/store';
import {registerAccess} from './registers';
import {openSessionInput,closeSessionInput,cashAdjustmentInput} from './contracts';
import {calculateDrawer} from './settlement';

const factContext=(a:Access,kind:string,id:string)=>JSON.stringify(['pos',a.org,a.environment,kind,id]);
export async function sessionAccess(a:Access,id:string,options:{write?:boolean;manager?:boolean}={}){
 const session=await read(a,id,'pos_session'),access=await registerAccess(a,session.root_id,options);
 if(!access.manager&&session.data.cashier_id!==a.actor)fail(404,'Register session not found');
 return {...access,session};
}
export async function drawer(a:Access,id:string){
 const {session}=await sessionAccess(a,id);
 const cash=await dbAll('SELECT kind,SUM(amount_minor) AS amount_minor FROM ac_cash_movements WHERE org_id=? AND environment=? AND session_id=? GROUP BY kind',[a.org,a.environment,id]);
 const adjustments=await dbAll('SELECT id,amount_minor,actor,data,created_at FROM ac_pos_drawer_adjustments WHERE org_id=? AND environment=? AND session_id=? ORDER BY created_at DESC,id DESC LIMIT 51',[a.org,a.environment,id]);
 const adjustmentTotal=await dbGet('SELECT COALESCE(SUM(amount_minor),0) AS amount_minor FROM ac_pos_drawer_adjustments WHERE org_id=? AND environment=? AND session_id=?',[a.org,a.environment,id]);
 const movements=[...cash.map(r=>({kind:r.kind as 'receipt'|'return',amount_minor:Number(r.amount_minor)})),...(Number(adjustmentTotal.amount_minor)?[{kind:'adjustment' as const,amount_minor:Number(adjustmentTotal.amount_minor)}]:[])];
 const totals=calculateDrawer(session.data.opening_cash_minor,movements);
 const closed=await dbGet('SELECT * FROM ac_pos_session_closures WHERE session_id=? AND org_id=? AND environment=?',[id,a.org,a.environment]);
 return {session,...totals,adjustments:adjustments.slice(0,50).map(r=>({...r,amount_minor:Number(r.amount_minor),data:JSON.parse(unseal(r.data,factContext(a,'adjustment',r.id)))})),adjustments_has_more:adjustments.length>50,closure:closed?{session_version:Number(closed.session_version),expected_minor:Number(closed.expected_minor),counted_minor:Number(closed.counted_minor),variance_minor:Number(closed.variance_minor),actor:closed.actor,created_at:closed.created_at,...JSON.parse(unseal(closed.data,factContext(a,'closure',id)))}:null,basis:'merchant_observed_physical_cash'};
}
export async function openSession(a:Access,registerId:string,input:unknown,key:string){
 const d=openSessionInput.parse(input);
 const result=await operation(a,'pos.session.open:'+registerId,key,d,()=>registerAccess(a,registerId,{write:true}),async()=>{
  const {register}=await registerAccess(a,registerId,{write:true});
  if(register.version!==d.expected_register_version)fail(409,'Register policy changed; reload before opening');
  if(await dbGet("SELECT session_id FROM ac_pos_sessions WHERE org_id=? AND environment=? AND register_id=? AND status='open'",[a.org,a.environment,registerId]))fail(409,'This register already has an open session');
  const at=now(),session=await insert(a,'pos_session',{cashier_id:a.actor,register_version:register.version,currency:register.data.currency,timezone:register.data.timezone,opening_cash_minor:d.opening_cash_minor,opening_note:d.note,opened_at:at},{root:registerId,status:'open'});
  await dbRun('INSERT INTO ac_pos_sessions(session_id,org_id,environment,register_id,cashier_id,status,opened_at) VALUES (?,?,?,?,?,?,?)',[session.id,a.org,a.environment,registerId,a.actor,'open',at]);
  return {session_id:session.id};
 });return drawer(a,result.session_id);
}
export async function adjustDrawer(a:Access,id:string,input:unknown,key:string){
 const d=cashAdjustmentInput.parse(input);
 await operation(a,'pos.drawer.adjust:'+id,key,d,()=>sessionAccess(a,id,{write:true,manager:true}),async()=>{
  const {session}=await sessionAccess(a,id,{write:true,manager:true});
  if(session.status!=='open'||session.version!==d.expected_session_version)fail(409,'The open session changed; reload before adjusting cash');
  const current=await drawer(a,id),amount=d.direction==='in'?d.amount_minor:-d.amount_minor;
  calculateDrawer(current.expected_minor,[{kind:'adjustment',amount_minor:amount}]);
  const factId=randomUUID();await dbRun('INSERT INTO ac_pos_drawer_adjustments(id,org_id,environment,session_id,amount_minor,actor,data,created_at) VALUES (?,?,?,?,?,?,?,?)',[factId,a.org,a.environment,id,amount,a.actor,seal(JSON.stringify({reason:d.reason}),factContext(a,'adjustment',factId),'2'),now()]);
  await update(a,session,session.data,{},'drawer_adjusted');return {session_id:id,adjustment_id:factId};
 });return drawer(a,id);
}
export async function closeSession(a:Access,id:string,input:unknown,key:string){
 const d=closeSessionInput.parse(input);
 await operation(a,'pos.session.close:'+id,key,d,()=>sessionAccess(a,id,{write:true,manager:true}),async()=>{
  const {session}=await sessionAccess(a,id,{write:true,manager:true});
  if(session.status!=='open'||session.version!==d.expected_version)fail(409,'The open session changed; reload before closing');
  const current=await drawer(a,id),totals=calculateDrawer(current.expected_minor,[],d.counted_cash_minor);
  if(totals.variance_minor!==0&&d.variance_reason.trim().length<8)fail(400,'Explain the difference between expected and counted cash');
  const at=now();await dbRun('INSERT INTO ac_pos_session_closures(session_id,org_id,environment,session_version,expected_minor,counted_minor,variance_minor,actor,data,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[id,a.org,a.environment,session.version,totals.expected_minor,d.counted_cash_minor,totals.variance_minor,a.actor,seal(JSON.stringify({variance_reason:d.variance_reason}),factContext(a,'closure',id),'2'),at]);
  await update(a,session,{...session.data,closed_at:at},{status:'closed'},'closed');
  await dbRun("UPDATE ac_pos_sessions SET status='closed',closed_at=? WHERE session_id=? AND org_id=? AND environment=? AND status='open'",[at,id,a.org,a.environment]);
  return {session_id:id};
 });return drawer(a,id);
}
