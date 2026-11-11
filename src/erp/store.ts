import {randomUUID} from 'node:crypto';
import {dbGet,dbAll,dbRun,dbTransaction} from '../db/adapter';
import {type Access,fail,audit} from '../platform/auth';
import {seal,unseal,hash,now} from '../platform/crypto';
import {permitted} from '../platform/domain';
import {canonical} from '../finance/service';
import {requireServices,checkLimits,recordUsage} from '../marketplace/engine';

export type ERPKind='commerce_store'|'commerce_listing'|'commerce_collection'|'work_rule_run'|'work_sales_link'|'accounting_tax_code'|'accounting_tax_case'|'supplier_profile'|'purchase_rfq'|'supplier_payment'|'supplier_credit'|'work_project'|'work_task'|'work_message'|'people_settings'|'department'|'employee'|'employee_compensation'|'leave_type'|'leave_request'|'attendance'|'document'|'document_version'|'document_request'|'purchase_request'|'purchase_order'|'purchase_receipt'|'supplier_bill';
export interface ERPObject {id:string;org_id:string;environment:string;kind:ERPKind;root_id:string;parent_id:string|null;owner_id:string;status:string;stage:string;position:number;due_on:string|null;version:number;created_at:string;updated_at:string;data:any;}
const context=(a:Access,kind:string,id:string)=>JSON.stringify(['erp',a.org,a.environment,kind,id]);
const protect=(value:string,scope:string)=>seal(value,scope,'2');
export async function currentMember(a:Access,write=false){
 if(a.api)fail(403,'A current human workspace member is required');
 const m=await dbGet('SELECT m.role,w.kind,w.status FROM ac_memberships m JOIN ac_workspaces w ON w.id=m.org_id WHERE m.org_id=? AND m.user_id=?',[a.org,a.actor]);
 if(!m||m.kind!=='business'||m.status!=='active')fail(403,'Current active Business membership required');
 if(write&&!permitted(m.role,'operations'))fail(403,'Operational write authority required');
 return m.role as string;
}
export async function authorize(a:Access,service:string,resource?:string,write=false){
 const role=await currentMember(a,write);await requireServices(a,[service],!write);
 if(resource){const root=await dbGet('SELECT id FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=?',[resource,a.org,a.environment]);if(!root)fail(404,'Resource not found');
  if(!['owner','admin'].includes(role)){const grant=await dbGet('SELECT permission FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=? AND user_id=?',[a.org,a.environment,resource,a.actor]);if(!grant||write&&!['edit','manage'].includes(grant.permission))fail(404,'Resource not found');}}
 return role;
}
export function decode(a:Access,r:any):ERPObject{return {...r,version:Number(r.version),position:Number(r.position),data:JSON.parse(unseal(r.data,context(a,r.kind,r.id)))};}
/** Internal reader: callers must establish the resource's current ACL first. */
export async function read(a:Access,id:string,kind:ERPKind){const r=await dbGet('SELECT * FROM ac_erp_objects WHERE id=? AND org_id=? AND environment=? AND kind=?',[id,a.org,a.environment,kind]);if(!r)fail(404,'Resource not found');return decode(a,r);}
export async function visible(a:Access,kind:ERPKind,root?:string){
 const role=await currentMember(a);return (await dbAll('SELECT o.* FROM ac_erp_objects o WHERE o.org_id=? AND o.environment=? AND o.kind=?'+(root?' AND o.root_id=?':'')+(!['owner','admin'].includes(role)?' AND EXISTS (SELECT 1 FROM ac_erp_grants g WHERE g.org_id=o.org_id AND g.environment=o.environment AND g.resource_id=o.root_id AND g.user_id=?)':'')+(kind==='work_message'?' ORDER BY o.created_at DESC,o.id DESC LIMIT 101':' ORDER BY o.position,o.created_at,o.id LIMIT 1001'),[a.org,a.environment,kind,...(root?[root]:[]),...(!['owner','admin'].includes(role)?[a.actor]:[])])).map(r=>decode(a,r));
}
export async function insert(a:Access,kind:ERPKind,data:any,meta:{id?:string;root?:string;parent?:string|null;owner?:string;status?:string;stage?:string;position?:number;due?:string|null}={}){
 const id=meta.id||randomUUID(),at=now();await dbRun('INSERT INTO ac_erp_objects(id,org_id,environment,kind,root_id,parent_id,owner_id,status,stage,position,due_on,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,a.org,a.environment,kind,meta.root||id,meta.parent||null,meta.owner||a.actor,meta.status||'active',meta.stage||'',meta.position||0,meta.due||null,protect(JSON.stringify(data),context(a,kind,id)),at,at]);const value=await read(a,id,kind);await snapshot(a,value,'created');return value;
}
export async function update(a:Access,o:ERPObject,data:any,meta:Partial<Pick<ERPObject,'status'|'stage'|'position'|'due_on'|'owner_id'|'parent_id'>>={},action='updated'){
 const r=await dbRun('UPDATE ac_erp_objects SET data=?,status=?,stage=?,position=?,due_on=?,owner_id=?,parent_id=?,version=version+1,updated_at=? WHERE id=? AND org_id=? AND environment=? AND version=?',[protect(JSON.stringify(data),context(a,o.kind,o.id)),meta.status??o.status,meta.stage??o.stage,meta.position??o.position,meta.due_on===undefined?o.due_on:meta.due_on,meta.owner_id??o.owner_id,meta.parent_id===undefined?o.parent_id:meta.parent_id,now(),o.id,a.org,a.environment,o.version]);if(!r.changes)fail(409,'Resource changed; reload before editing');const value=await read(a,o.id,o.kind);await snapshot(a,value,action);return value;
}
async function snapshot(a:Access,o:ERPObject,action:string){const id=randomUUID();await dbRun('INSERT INTO ac_erp_history(id,org_id,environment,resource_id,version,actor,action,data,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[id,a.org,a.environment,o.id,o.version,a.actor,action,protect(JSON.stringify(o),context(a,'history',id)),now()]);await audit(a.org,a.actor,o.kind+'.'+action,o.id);}
export async function history(a:Access,o:ERPObject,limit=100,offset=0){return (await dbAll('SELECT * FROM ac_erp_history WHERE org_id=? AND environment=? AND resource_id=? ORDER BY version LIMIT ? OFFSET ?',[a.org,a.environment,o.id,limit,offset])).map(r=>({version:Number(r.version),actor:r.actor,action:r.action,created_at:r.created_at,snapshot:JSON.parse(unseal(r.data,context(a,'history',r.id)))}));}
/** Caller repeats authorization inside run; receipts never retain confidential plaintext. */
export async function operation<T>(a:Access,operationName:string,key:string,input:unknown,authorizeNow:()=>Promise<unknown>,run:()=>Promise<T>,options:{meter?:boolean;authorizeReplay?:(response:T)=>Promise<unknown>}={}):Promise<T>{
 if(key.length<8||key.length>200)fail(400,'A bounded idempotency key is required');
 return dbTransaction(async()=>{await dbRun('UPDATE ac_organizations SET name=name WHERE id=?',[a.org]);await authorizeNow();const old=await dbGet('SELECT fingerprint,response FROM ac_erp_operations WHERE org_id=? AND environment=? AND actor=? AND operation=? AND idempotency_key=?',[a.org,a.environment,a.actor,operationName,key]),fingerprint=hash(canonical(input)),receiptContext=context(a,'operation',JSON.stringify([a.actor,operationName,key]));
  if(old){if(old.fingerprint!==fingerprint)fail(409,'Idempotency key conflicts with original input');const response=JSON.parse(unseal(old.response,receiptContext));if(options.authorizeReplay)await options.authorizeReplay(response);return response;}
  const service=operationName.split('.')[0];if(options.meter!==false)await checkLimits(a,service,1);
  const response=await run();if(options.meter!==false){await checkLimits(a,service,1);await recordUsage(a,service,'erp:'+hash(JSON.stringify([a.actor,operationName,key])),1,'committed_erp_operation');}await dbRun('INSERT INTO ac_erp_operations(org_id,environment,actor,operation,idempotency_key,fingerprint,response,created_at) VALUES (?,?,?,?,?,?,?,?)',[a.org,a.environment,a.actor,operationName,key,fingerprint,protect(JSON.stringify(response),receiptContext),now()]);return response;
 });
}
