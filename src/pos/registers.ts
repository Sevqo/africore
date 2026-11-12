import {dbAll,dbGet} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {currentMember,read,insert,update,decode,operation} from '../erp/store';
import {requireServices} from '../marketplace/engine';
import {record} from '../platform/payments';
import {registerInput,reauthorizeRegisterInput} from './contracts';
import {now} from '../platform/crypto';
import {businessPolicyFor} from '../operations/business-policy';

export async function posManager(a:Access,write=false){
 const role=await currentMember(a);await requireServices(a,['pos'],!write);
 if(!['owner','admin'].includes(role))fail(403,'Current owner or administrator authority is required for register configuration');
 if(write&&a.environment!=='sandbox')fail(409,'POS configuration is currently qualified for sandbox evaluation only');
 return role;
}
/** Register assignment confers no general Finance or Operations permission.
 * Recheck the configuring member as well as the current cashier on every use. */
export async function registerAccess(a:Access,id:string,options:{write?:boolean;manager?:boolean}={}){
 const role=await currentMember(a);await requireServices(a,['pos'],!options.write);
 const register=await read(a,id,'pos_register');
 const configuring=await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,register.data.policy_authorized_by]);
 const workspaceManager=['owner','admin'].includes(role);
 const assignedManager=['owner','admin','finance'].includes(role)&&register.data.manager_ids.includes(a.actor);
 if(!workspaceManager&&!assignedManager&&!register.data.cashier_ids.includes(a.actor))fail(404,'Register not found');
 if(options.manager&&!workspaceManager&&!assignedManager)fail(403,'Register manager authority is required');
 if(options.write&&(!register.data.active||!configuring||!['owner','admin'].includes(configuring.role)))fail(409,'This register requires current owner policy authorization');
 if(options.write&&a.environment!=='sandbox')fail(409,'POS operations are currently qualified for sandbox evaluation only');
 if(options.write)for(const service of ['products','orders','invoicing','cash_flow'])await requireServices(a,[service]);
 const dependencies=await dbGet("SELECT COUNT(*) AS n FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment=? AND e.service_id IN ('pos','products','orders','invoicing','cash_flow') AND e.status='active' AND s.enabled=1",[a.org,a.environment]);
 const write_allowed=a.environment==='sandbox'&&!!register.data.active&&!!configuring&&['owner','admin'].includes(configuring.role)&&Number(dependencies.n)===5;
 return {register,manager:workspaceManager||assignedManager,role,write_allowed};
}
export async function registers(a:Access){
 const role=await currentMember(a);await requireServices(a,['pos'],true);
 const rows=await dbAll("SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='pos_register' ORDER BY created_at,id LIMIT 101",[a.org,a.environment]);
 if(rows.length>100)fail(409,'Register coverage exceeds the supported limit');
 const service=await dbGet("SELECT e.status,s.enabled FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment=? AND e.service_id='pos'",[a.org,a.environment]);
 return {data:rows.map(row=>decode(a,row)).filter(r=>['owner','admin'].includes(role)||r.data.cashier_ids.includes(a.actor)||['finance'].includes(role)&&r.data.manager_ids.includes(a.actor)),permissions:{configure:a.environment==='sandbox'&&['owner','admin'].includes(role)&&service?.status==='active'&&Number(service.enabled)===1}};
}
export async function saveRegister(a:Access,id:string|null,input:unknown,key:string){
 const d=registerInput.parse(input);
 return operation(a,'pos.register.save:'+(id||'new'),key,d,()=>posManager(a,true),async()=>{
  const previous=id?await read(a,id,'pos_register'):null;
  if((previous?.version||0)!==d.expected_version)fail(409,'Register changed; reload before saving');
  if(!previous){const count=await dbGet("SELECT COUNT(*) AS n FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='pos_register'",[a.org,a.environment]);if(Number(count.n)>=100)fail(409,'A workspace environment supports up to 100 registers');}
  const customer=await record(a,d.default_customer_id,'customers');if(customer.status==='archived')fail(409,'Choose a current canonical customer');
  for(const service of ['products','orders','invoicing','cash_flow'])await requireServices(a,[service]);
  const policy=await businessPolicyFor(a);
  if(d.manager_discount_bps>policy.configuration.discount_approval_bps)fail(409,'Register discounts cannot exceed the current reviewed Sales policy');
  if(d.electronic_method!=='disabled'){
   if(a.environment!=='sandbox')fail(409,'POS electronic methods are sandbox-only');
   await requireServices(a,['payments']);
   if(d.electronic_method==='daraja_sandbox')fail(409,'POS Daraja checkout requires separate provider qualification');
  }
  for(const memberId of new Set([...d.cashier_ids,...d.manager_ids])){
   const member=await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,memberId]);
   if(!member)fail(400,'Register assignments require current members of this workspace');
   if(d.manager_ids.includes(memberId)&&!['owner','admin','finance'].includes(member.role))fail(400,'Register managers require current finance, owner or administrator authority');
  }
  if(d.warehouse_id){await requireServices(a,['inventory']);if(!await dbGet("SELECT id FROM ac_warehouses WHERE id=? AND org_id=? AND environment=? AND status='active'",[d.warehouse_id,a.org,a.environment]))fail(400,'Choose an active warehouse in this workspace');}
  if(d.location_id&&!await dbGet('SELECT id FROM ac_stock_locations WHERE id=? AND warehouse_id=? AND org_id=? AND environment=?',[d.location_id,d.warehouse_id,a.org,a.environment]))fail(400,'Choose a location belonging to the register warehouse');
  if(previous){
   const history=await dbGet('SELECT session_id FROM ac_pos_sessions WHERE register_id=? AND org_id=? AND environment=? LIMIT 1',[previous.id,a.org,a.environment]);
   if(history&&(previous.data.currency!==d.currency||previous.data.timezone!==d.timezone))fail(409,'Currency and timezone are fixed after register sessions exist');
   const open=await dbGet("SELECT session_id FROM ac_pos_sessions WHERE register_id=? AND org_id=? AND environment=? AND status='open'",[previous.id,a.org,a.environment]);
   if(open)fail(409,'Close the current session before changing register configuration');
  }
  const {expected_version:_version,...configuration}=d,data={...configuration,policy_authorized_by:a.actor,policy_authorized_at:now()};
  return previous?update(a,previous,data,{status:d.active?'active':'inactive'}):insert(a,'pos_register',data,{status:d.active?'active':'inactive'});
 });
}

/** An open shift must remain closeable after its configuring owner is revoked.
 * A current owner explicitly adopts unchanged settings; no grant, tax, price,
 * currency, warehouse or original shift observation is silently rewritten. */
export async function reauthorizeRegister(a:Access,id:string,input:unknown,key:string){
 const d=reauthorizeRegisterInput.parse(input);
 return operation(a,'pos.register.authorize:'+id,key,d,()=>posManager(a,true),async()=>{
  const register=await read(a,id,'pos_register');if(register.version!==d.expected_version)fail(409,'Review the current register policy before authorizing it');
  for(const service of ['products','orders','invoicing','cash_flow'])await requireServices(a,[service]);
  return update(a,register,{...register.data,policy_authorized_by:a.actor,policy_authorized_at:now()},{},'policy_authorized');
 });
}
