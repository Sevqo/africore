import {dbAll,dbGet} from '../db/adapter';
import {fail} from '../platform/auth';
import {now} from '../platform/crypto';
import {permitted} from '../platform/domain';
import type {Access} from '../platform/auth';
import {seal,unseal} from '../platform/crypto';
export const privateApprovalActions=new Set(['journal_posting','leave_approval','document_review','work_project_review']);
const context=(a:Access,id:string,field:string)=>JSON.stringify(['private-approval',a.org,a.environment,id,field]);
export function encodeApprovalField(a:Access,id:string,action:string,field:string,value:string){return privateApprovalActions.has(action)?seal(value,context(a,id,field),'2'):value;}
/** Plain historical bindings remain readable; all new private bindings use v2. */
export function decodeApprovalField(a:Access,id:string,action:string,field:string,value:string|null|undefined){if(!value)return '';return privateApprovalActions.has(action)&&value.startsWith('v2.')?unseal(value,context(a,id,field)):value;}
export function protectedApprovalReader(a:Access){
 let accounting:Promise<boolean>|undefined,people:Promise<any>|undefined,member:Promise<any>|undefined;
 return async (approval:any)=>{
  if(approval.action==='journal_posting'){accounting||=import('./accounting').then(m=>m.accountingAccess(a)).then(()=>true).catch(()=>false);return accounting;}
  if(approval.action==='work_project_review'){try{await (await import('./work-reviews')).canReviewProject(a,approval.resource_id);return true;}catch(e){if([400,402,403,404,409].includes((e as any).status))return false;throw e;}}
  if(approval.action==='document_review'){try{await (await import('./document-reviews')).canReviewDocument(a,approval.resource_id);return true;}catch(e){if([400,402,403,404,409].includes((e as any).status))return false;throw e;}}
  if(approval.action==='leave_approval'){
   people||=import('./people-access').then(m=>m.peopleContext(a)).catch(()=>null);const c=await people;if(!c)return false;if(c.hr_view)return true;
   try{await (await import('./people-leave')).leaveApprovalResource(a,approval.resource_id);return true;}catch(e){if([402,403,404,409].includes((e as any).status))return false;throw e;}
  }
  member||=dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,a.actor]);const current=await member;if(!current)return false;
  if(['stock_adjustment','sales_discount'].includes(approval.action))return permitted(current.role,'operations');
  if(approval.action==='sensitive_integration_change')return ['owner','admin'].includes(current.role);
  if(['protected_release','protected_refund','dispute_resolution','invoice_adjustment','manual_reconciliation'].includes(approval.action))return permitted(current.role,'finance');
  return false;
 };
}

/** Filter current domain authority before paginating or decrypting private reviews. */
export async function approvalQueue(a:Access,limit=100,offset=0){
 if(a.api)fail(403,'Human member required');
 const rows=await dbAll('SELECT a.*,b.parameters,b.review_summary,b.resource_hash,b.consumed_at FROM ac2_approvals a LEFT JOIN ac_approval_bindings b ON b.approval_id=a.id AND b.org_id=a.org_id AND b.environment=a.environment WHERE a.org_id=? AND a.environment=? AND (a.requester=? OR a.approver=?) ORDER BY a.created_at DESC,a.id DESC LIMIT 5001',[a.org,a.environment,a.actor,a.actor]);
 const readable=protectedApprovalReader(a),visible:any[]=[],data:any[]=[];
 const member=await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,a.actor]);
 if(!member)fail(403,'Current membership required');
 for(const row of rows.slice(0,5000))if(await readable(row))visible.push(row);
 // Decrypt review bodies only after current-domain filtering and paging.
 for(const row of visible.slice(offset,offset+limit)){
  const value={...row};
  for(const field of ['parameters','review_summary','reason'])value[field]=decodeApprovalField(a,row.id,row.action,field,row[field]);
  if(value.status==='pending'&&value.expires_at<=now())value.status='expired';
  value.can_decide=value.status==='pending'&&row.approver===a.actor&&row.requester!==a.actor&&['owner','admin'].includes(member.role);
  if(value.status==='pending'&&row.action==='journal_posting')value.can_decide=value.can_decide&&(await (await import('../marketplace/engine')).entitlement(a,'accounting'))?.status==='active';
  if(value.status==='pending'&&row.action==='leave_approval'&&row.approver===a.actor&&row.requester!==a.actor){try{await (await import('./people-leave')).canApproveLeave(a,row.resource_id);value.can_decide=(await (await import('./people-access')).peopleContext(a)).service_active;}catch(e){value.can_decide=false;if(![402,403,404,409].includes((e as any).status))throw e;}}
  if(value.status==='pending'&&row.action==='document_review'&&row.approver===a.actor&&row.requester!==a.actor)value.can_decide=(await (await import('./documents-access')).documentsContext(a)).service_active;
  if(value.status==='pending'&&row.action==='work_project_review'&&row.approver===a.actor&&row.requester!==a.actor){try{await (await import('./work-reviews')).canApproveProjectReview(a,row.resource_id);value.can_decide=true;}catch(e){value.can_decide=false;if(![402,403,404,409].includes((e as any).status))throw e;}}
  if(value.status==='pending'&&['work_project_review','document_review','journal_posting'].includes(row.action)){const parameters=JSON.parse(value.parameters||'{}'),journal=row.action==='journal_posting',expected=journal?parameters.journal_posting?.entry_version:row.action==='document_review'?parameters.document_review?.document_version:parameters.work_project_review?.project_version,current=await dbGet('SELECT version FROM '+(journal?'ac_accounting_entries':'ac_erp_objects')+' WHERE id=? AND org_id=? AND environment=?',[row.resource_id,a.org,a.environment]);value.source_changed=!current||Number(current.version)!==expected;if(value.source_changed)value.can_decide=false;}
  data.push(value);
 }
 return {current_actor:a.actor,data,has_more:visible.length>offset+limit,truncated:rows.length>5000,limit,offset};
}
