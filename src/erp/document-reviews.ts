import {z} from 'zod';
import {dbAll,dbGet} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {now} from '../platform/crypto';
import {canonical} from '../finance/service';
import {requireServices,checkLimits,recordUsage} from '../marketplace/engine';
import {read,update,operation,decode} from './store';
import {documentAccess,documentsContext} from './documents-access';
export const documentReviewInput=z.object({expected_version:z.number().int().positive(),approver:z.string().uuid()}).strict();
export async function documentReviewResource(a:Access,id:string){await documentAccess(a,id);const value=await read(a,id,'document');return {id,kind:'private_document',version:value.version,updated_at:value.updated_at,data:canonical({...value.data,status:value.status})};}
export async function canReviewDocument(a:Access,id:string,active=false){await documentsContext(a);if(active)await requireServices(a,['documents']);const c=await documentAccess(a,id,'download');if(c.row.doc_kind!=='file')fail(400,'Review a retained file, not a folder');return true;}
export async function validateDocumentReviewRequest(a:Access,id:string,parameters:any){await documentAccess(a,id,'edit');await documentAccess(a,id,'download');const value=await read(a,id,'document');if(!parameters||parameters.document_version!==value.version||parameters.version_id!==value.data.current_version_id)fail(409,'Review the exact document and retained content version');}
export async function requestDocumentReview(a:Access,id:string,input:unknown,key:string){const d=documentReviewInput.parse(input);return operation(a,'documents.review:'+id,key,d,async()=>{await documentAccess(a,id,'edit');await documentAccess(a,id,'download');},async()=>{const value=await read(a,id,'document');if(value.version!==d.expected_version)fail(409,'Document changed; reload');const {requestApproval}=await import('../operations/automation');return requestApproval(a,{approver:d.approver,action:'document_review',resource_id:id,parameters:{document_review:{document_version:value.version,version_id:value.data.current_version_id}}});});}
/** A file-content review never changes Passport assurance or financial source status. */
export async function applyDocumentDecision(a:Access,approval:any,decision:'approved'|'rejected'){
 await canReviewDocument(a,approval.resource_id,true);const value=await read(a,approval.resource_id,'document');
 const requests=await dbAll("SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND kind='document_request' AND parent_id=? AND status='in_review'",[a.org,a.environment,value.id]);
 for(const row of requests){const request=decode(a,row);if(request.data.approval_id!==approval.id)fail(409,'This file has a different current document-request review');}
 if(decision==='approved'){
  const member=await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,approval.requester]);if(!member)fail(403,'Review requester membership was revoked');const requester={...a,actor:approval.requester,role:member.role};await documentAccess(requester,value.id,'edit');await checkLimits(requester,'documents',1);const {requireApproval}=await import('../operations/automation');await requireApproval(requester,approval.id,'document_review',value.id,{document_review:{document_version:value.version,version_id:value.data.current_version_id}});await recordUsage(requester,'documents','document-review:'+approval.id,1,'private_file_review_recorded');
 }
 await update(a,value,{...value.data,review:{decision,reviewer:a.actor,approval_id:approval.id,version_id:value.data.current_version_id,at:now(),assurance:'human_file_review_only_not_independent_verification'}},{},'review_'+decision);
 for(const row of requests){const request=decode(a,row);await update(a,request,{...request.data,decision,decided_at:now()},{status:decision},'review_'+decision);}
 const {notify}=await import('../operations/automation');await notify(a,{category:'security',title:'Private file review recorded',body:'A human file-content decision was recorded. Inspect the retained version and current review details; this does not establish independent verification.',user_id:approval.requester,resource_id:value.id,key:'document-review-decision:'+approval.id,action_data:{app_id:'documents',section:'document_review',record_id:value.id},severity:decision==='approved'?'success':'action_required'});
}
