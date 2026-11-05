import {dbGet} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {permitted} from '../platform/domain';
import {now} from '../platform/crypto';
import {requireServices,entitlement} from '../marketplace/engine';
import {currentMember,read} from './store';
import {employeeAccess,peopleContext} from './people-access';

export async function documentsContext(a:Access,write=false){const role=await currentMember(a,write);await requireServices(a,['documents'],!write);const service_active=(await entitlement(a,'documents'))?.status==='active';return {role,service_active,write:permitted(role,'operations')&&service_active};}
/** Direct and inherited access are recomputed from current grants on every request. */
export function documentRights(a:Access){return {sql:`WITH RECURSIVE rights(id,permission,download,depth) AS (
 SELECT d.id,CASE WHEN d.owner_id=? THEN 3 WHEN g.permission='editor' THEN 2 ELSE 1 END,CASE WHEN d.owner_id=? THEN 1 ELSE COALESCE(g.download,0) END,0
 FROM ac_documents d LEFT JOIN ac_document_grants g ON g.document_id=d.id AND g.org_id=d.org_id AND g.environment=d.environment AND g.user_id=? AND (g.expires_at IS NULL OR g.expires_at>?)
 WHERE d.org_id=? AND d.environment=? AND (d.owner_id=? OR g.user_id IS NOT NULL OR (d.visibility='company' AND d.employee_id IS NULL))
 UNION ALL SELECT child.id,r.permission,r.download,r.depth+1 FROM rights r JOIN ac_documents parent ON parent.id=r.id JOIN ac_documents child ON child.folder_id=parent.id AND child.org_id=parent.org_id AND child.environment=parent.environment
 WHERE parent.status='active' AND parent.doc_kind='folder' AND child.inherit_folder=1 AND r.depth<100
), allowed AS (SELECT id,MAX(permission) AS permission,MAX(download) AS download FROM rights GROUP BY id) `,params:[a.actor,a.actor,a.actor,now(),a.org,a.environment,a.actor]};}
export async function documentRow(a:Access,id:string){const row=await dbGet('SELECT * FROM ac_documents WHERE id=? AND org_id=? AND environment=?',[id,a.org,a.environment]);if(!row)fail(404,'Document not found');return row;}
export async function documentAccess(a:Access,id:string,purpose:'read'|'edit'|'manage'|'download'='read',allowTrash=false){
 const context=await documentsContext(a,purpose==='edit'||purpose==='manage'),rights=documentRights(a),row=await dbGet(rights.sql+'SELECT d.*,r.permission,r.download FROM ac_documents d JOIN allowed r ON r.id=d.id WHERE d.id=? AND d.org_id=? AND d.environment=?',[...rights.params,id,a.org,a.environment]);
 if(!row||row.status!=='active'&&(!allowTrash||row.owner_id!==a.actor))fail(404,'Document not found');
 if(row.employee_id){const personnel=await employeeAccess(a,row.employee_id,'personnel');if(['edit','manage'].includes(purpose)){if(!personnel.service_active)fail(402,'Activate People before changing personnel files');if(!personnel.hr_write){if(!personnel.self)fail(403,'Personnel file changes require current HR write authority');await employeeAccess(a,row.employee_id,'self_write');}}}
 await (await import('./document-links')).sensitiveDocumentLinks(a,id);
 if(purpose==='manage'&&row.owner_id!==a.actor||purpose==='edit'&&Number(row.permission)<2||purpose==='download'&&!Number(row.download))fail(403,'Current document permission does not allow this action');
 return {...context,row,can_edit:context.write&&Number(row.permission)>=2,can_manage:context.write&&row.owner_id===a.actor,can_download:!!Number(row.download)};
}
/** This predicate is applied before limiting a directory or exposing its counts. */
export async function personnelDocumentFilter(a:Access){
 try{const c=await peopleContext(a);if(c.hr_view)return {sql:'1=1',params:[]};if(c.policy.share_self_personnel_files)return {sql:"(d.employee_id IS NULL OR d.employee_id IN (SELECT e.employee_id FROM ac_people_employees e WHERE e.org_id=d.org_id AND e.environment=d.environment AND e.linked_user_id=?))",params:[a.actor]};}
 catch(e){if(![402,403].includes((e as any).status))throw e;}
 return {sql:'d.employee_id IS NULL',params:[]};
}
export async function documentDetails(a:Access,id:string,allowTrash=false){const c=await documentAccess(a,id,'read',allowTrash),value=await read(a,id,'document');return {...value,permissions:{edit:c.can_edit,manage:c.can_manage,download:c.can_download},kind:c.row.doc_kind,folder_id:c.row.folder_id,classification:c.row.employee_id?'personnel':'general',employee_id:c.row.employee_id};}
