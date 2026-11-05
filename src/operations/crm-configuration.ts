import {z} from 'zod';
import {dbAll,dbGet} from '../db';
import {type Access,fail} from '../platform/auth';
import {permitted} from '../platform/domain';
import {financialOperation} from '../finance/service';
import {all,create,change} from './store';
import {requireServices} from '../marketplace/engine';

export const defaultCrmStages=['new','qualified','proposal','won','lost'].map(id=>({id,name:id[0].toUpperCase()+id.slice(1)}));
export const crmConfigurationInput=z.object({expected_version:z.number().int().min(0),stages:z.array(z.object({id:z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),name:z.string().trim().min(1).max(80)}).strict()).min(5).max(30),teams:z.array(z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(100),owner:z.string().uuid(),members:z.array(z.string().uuid()).max(100),active:z.boolean()}).strict()).max(50)}).strict();

export async function crmConfiguration(a:Access){
 const value=(await all(a,'crm_configuration'))[0];
 return value?{version:Number(value.version),stages:value.stages as typeof defaultCrmStages,teams:value.teams as z.infer<typeof crmConfigurationInput>['teams']}:{version:0,stages:defaultCrmStages,teams:[]};
}
export async function saveCrmConfiguration(a:Access,input:unknown,key:string){
 const d=crmConfigurationInput.parse(input);
 return financialOperation(a,'crm.configuration',key,d,async()=>{
  await requireServices(a,['crm']);
  const member=await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,a.actor]);
  if(a.api||!member||!['owner','admin'].includes(member.role))fail(403,'Current human owner or administrator required');
  const old=(await all(a,'crm_configuration'))[0];if(Number(old?.version||0)!==d.expected_version)fail(409,'CRM configuration changed; reload before editing');
  if(new Set(d.stages.map(s=>s.id)).size!==d.stages.length||defaultCrmStages.some(s=>!d.stages.some(next=>next.id===s.id)))fail(400,'Keep each canonical stage exactly once');
  if(new Set(d.teams.map(t=>t.id)).size!==d.teams.length)fail(400,'Team identifiers must be unique');
  const members=await dbAll('SELECT user_id,role FROM ac_memberships WHERE org_id=?',[a.org]);
  for(const team of d.teams){if(!team.members.includes(team.owner)||new Set(team.members).size!==team.members.length)fail(400,'A team owner must be a unique team member');for(const id of team.members)if(!members.some(m=>m.user_id===id&&permitted(m.role,'operations')))fail(400,'Teams require current operational members');}
  const history=await dbAll("SELECT data FROM ac2_objects WHERE org_id=? AND environment=? AND kind='crm_entry_revision'",[a.org,a.environment]);if(history.some(r=>!d.stages.some(s=>s.id===JSON.parse(r.data).snapshot.stage)))fail(409,'A historically referenced stage cannot be removed');
  const entries=await dbAll('SELECT data,status FROM ac_crm_entries WHERE org_id=? AND environment=?',[a.org,a.environment]);
  for(const row of entries){const e=JSON.parse(row.data);if(!d.stages.some(s=>s.id===e.stage))fail(409,'A referenced stage cannot be removed');if(e.team_id){const team=d.teams.find(t=>t.id===e.team_id);if(!team)fail(409,'Retain referenced teams and archive them instead');if(row.status==='open'&&(!team!.active||e.assigned_to&&!team!.members.includes(e.assigned_to)))fail(409,'Reassign open team work before changing team membership or archiving');}}
  const value={stages:d.stages,teams:d.teams};if(old)await change(a,old,value);else await create(a,'crm_configuration',value);
  return crmConfiguration(a);
 });
}
