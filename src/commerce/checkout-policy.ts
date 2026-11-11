import {z} from 'zod';
import {dbGet} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {now} from '../platform/crypto';
import {requireServices} from '../marketplace/engine';
import {operation,update,type ERPObject} from '../erp/store';
import {store} from './catalog';

export const checkoutPolicyInput=z.object({expected_version:z.number().int().positive(),enabled:z.boolean(),consent_notice_version:z.string().regex(/^[a-zA-Z0-9._-]{1,40}$/),acknowledge_automated_invoicing:z.boolean(),acknowledge_sandbox_only:z.boolean()}).strict().refine(d=>!d.enabled||(d.acknowledge_automated_invoicing&&d.acknowledge_sandbox_only),'Enabling checkout requires explicit test-only order and invoice authorization');
export const checkoutServices=['commerce','products','orders','invoicing','payments'];
export async function requireCheckoutServices(a:Access){for(const id of checkoutServices)await requireServices(a,[id]);}
export async function checkoutReadiness(a:Access,s:ERPObject){
 const policy=s.data.checkout_policy;
 if(a.environment!=='sandbox')return {available:false,reason:'Live checkout is not enabled.'};
 if(!policy?.enabled)return {available:false,reason:'Online ordering is not available for this store yet.'};
 const member=await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,policy.configured_by]);if(!member||!['owner','admin'].includes(member.role))return {available:false,reason:'The merchant needs to review its checkout authorization.'};
 for(const id of checkoutServices){const service=await dbGet('SELECT e.status,s.enabled FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment=? AND e.service_id=?',[a.org,a.environment,id]);if(!service||Number(service.enabled)!==1||service.status!=='active')return {available:false,reason:'The merchant needs to finish its checkout service setup.'};}
 return {available:true,reason:'Sandbox checkout only. No real funds move.',consent_notice_version:policy.consent_notice_version};
}
export async function checkoutExecutor(a:Access,s:ERPObject){const readiness=await checkoutReadiness(a,s);if(!readiness.available)fail(409,readiness.reason);await requireCheckoutServices(a);const member=await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,s.data.checkout_policy.configured_by]);if(!member||!['owner','admin'].includes(member.role))fail(403,'Checkout authorization changed');return {...a,actor:s.data.checkout_policy.configured_by,role:member.role,api:false};}
export async function saveCheckoutPolicy(a:Access,id:string,input:unknown,key:string){const d=checkoutPolicyInput.parse(input);return operation(a,'commerce.checkout-policy:'+id,key,d,async()=>{await store(a,id,true);},async()=>{
 const s=await store(a,id,true);if(s.version!==d.expected_version)fail(409,'Store changed; reload checkout setup');if(d.enabled){if(a.environment!=='sandbox')fail(503,'Live checkout is not enabled');await requireCheckoutServices(a);if(!(s.data.shipping||[]).some((r:any)=>r.active))fail(409,'Configure a current shipping or pickup option first');}
 return update(a,s,{...s.data,checkout_policy:{enabled:d.enabled,configured_by:a.actor,configured_at:now(),consent_notice_version:d.consent_notice_version,acknowledged_test_only:d.acknowledge_sandbox_only,acknowledged_automated_invoicing:d.acknowledge_automated_invoicing}},undefined,'checkout_policy_updated');
 });}
