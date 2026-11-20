import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../db/adapter';
import { fail, type Access } from '../platform/auth';
import { hash, now, seal, unseal } from '../platform/crypto';
import { authorize, insert, operation, read, update, visible } from '../erp/store';
import { publicSlug } from '../commerce/contracts';
import { notify } from '../operations/automation';

const attendee = z.object({ user_id: z.string().min(1).max(200), response: z.enum(['pending','accepted','declined','tentative']).default('pending') }).strict();
const eventInput = z.object({
  title: z.string().trim().min(1).max(180), description: z.string().max(8000).default(''),
  start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }),
  timezone: z.string().min(1).max(100), all_day: z.boolean().default(false),
  location: z.string().max(300).default(''), meeting_url: z.string().url().max(1000).or(z.literal('')).default(''),
  visibility: z.enum(['default','private']).default('default'),
  recurrence: z.enum(['none','daily','weekly','monthly','yearly']).default('none'),
  attendees: z.array(attendee).max(100).default([]), linked_record: z.object({ kind: z.string().max(80), id: z.string().max(200) }).strict().nullable().default(null),
}).strict().superRefine((d, ctx) => {
  if (Date.parse(d.end) <= Date.parse(d.start)) ctx.addIssue({ code: 'custom', message: 'End must be after start', path: ['end'] });
  try { new Intl.DateTimeFormat('en', { timeZone: d.timezone }); } catch { ctx.addIssue({ code: 'custom', message: 'Use a valid IANA timezone', path: ['timezone'] }); }
});
const calendarGrant = async (a: Access, id: string, members: { user_id: string }[]) => {
  for (const member of members) await dbRun('INSERT INTO ac_erp_grants(org_id,environment,resource_id,user_id,permission) VALUES (?,?,?,?,?) ON CONFLICT(org_id,environment,resource_id,user_id) DO NOTHING', [a.org,a.environment,id,member.user_id,'view']);
};
async function validateMembers(a: Access, members: {user_id:string}[]) {
  const ids=[...new Set(members.map(x=>x.user_id))];
  if (!ids.length) return;
  const found=await dbAll('SELECT user_id FROM ac_memberships WHERE org_id=? AND user_id IN ('+ids.map(()=>'?').join(',')+')', [a.org,...ids]);
  if (found.length!==ids.length) fail(400,'Attendees must be current workspace members');
}
export async function calendarEvents(a: Access) {
  const events=await visible(a,'calendar_event');
  return { data: events.filter(e=>e.status==='active').map(e=>{
    const invited=e.data.attendees.some((person:any)=>person.user_id===a.actor);
    const isOrganizer=e.data.organizer_id===a.actor;
    const privateToViewer=e.data.visibility==='private'&&!isOrganizer&&!invited;
    const data=privateToViewer
      ? {...e.data,title:'Busy',description:'',location:'',meeting_url:'',linked_record:null,attendees:[]}
      : {...e.data,my_response:e.data.attendees.find((person:any)=>person.user_id===a.actor)?.response||null};
    return {...e,data};
  }) };
}
export async function createCalendarEvent(a: Access, input: unknown, key: string) {
  const d=eventInput.parse(input); await validateMembers(a,d.attendees);
  return operation(a,'calendar.create',key,d,()=>authorize(a,'calendar',undefined,true),async()=>{
    const event=await insert(a,'calendar_event',{...d,organizer_id:a.actor,cancelled_at:null});
    await calendarGrant(a,event.id,d.attendees);
    for (const invite of d.attendees) await notify(a,{
      category:'calendar',title:'Meeting invitation',body:'You have a new workspace meeting invitation. Open Calendar to review and respond.',
      resource_id:event.id,key:'calendar-invitation:'+event.id,user_id:invite.user_id,capability:'read',
      action_data:{app_id:'calendar',section:'invitations',record_id:event.id},
    });
    return event;
  });
}
export async function editCalendarEvent(a: Access,id:string,input:unknown,key:string) {
  const d=eventInput.extend({expected_version:z.number().int().positive()}).parse(input); await validateMembers(a,d.attendees);
  return operation(a,'calendar.edit',key,{id,...d},async()=>{await authorize(a,'calendar',id,true);},async()=>{
    const old=await read(a,id,'calendar_event');
    if(old.version!==d.expected_version) fail(409,'Event changed; reload before editing');
    if(old.data.organizer_id!==a.actor&&!['owner','admin'].includes(a.role)) fail(403,'Only the organizer or workspace administrator can edit this event');
    const {expected_version:_,...data}=d; await dbRun('DELETE FROM ac_erp_grants WHERE org_id=? AND environment=? AND resource_id=?',[a.org,a.environment,id]); await calendarGrant(a,id,d.attendees);
    return update(a,old,{...data,organizer_id:old.data.organizer_id,cancelled_at:null});
  });
}
export async function respondCalendarInvite(a:Access,id:string,response:'accepted'|'declined'|'tentative',key:string) {
  return operation(a,'calendar.respond',key,{id,response},()=>authorize(a,'calendar',id,false),async()=>{
    const old=await read(a,id,'calendar_event'),person=old.data.attendees.find((x:any)=>x.user_id===a.actor);
    if(!person) fail(404,'Invitation not found');
    const attendees=old.data.attendees.map((x:any)=>x.user_id===a.actor?{...x,response}:x);
    return update(a,old,{...old.data,attendees});
  },{meter:false});
}
export async function cancelCalendarEvent(a:Access,id:string,version:number,key:string) {
  return operation(a,'calendar.cancel',key,{id,version},()=>authorize(a,'calendar',id,true),async()=>{
    const old=await read(a,id,'calendar_event'); if(old.version!==version) fail(409,'Event changed; reload before cancelling');
    if(old.data.organizer_id!==a.actor&&!['owner','admin'].includes(a.role)) fail(403,'Only the organizer can cancel this event');
    return update(a,old,{...old.data,cancelled_at:now()},{status:'cancelled'},'cancelled');
  },{meter:false});
}

const block = z.object({type:z.enum(['hero','heading','text','image','gallery','columns','features','cta','testimonial','pricing','faq','contact','contact_form','footer','commerce_showcase']),title:z.string().max(180).default(''),body:z.string().max(8000).default(''),image_url:z.string().url().max(1000).or(z.literal('')).default(''),alt:z.string().max(500).default(''),button_label:z.string().max(100).default(''),button_url:z.string().max(1000).default(''),background:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff')}).strict();
const safeLink = (value:string) => /^(https:\/\/|mailto:|\/(?!\/)[^\\\r\n]*)/i.test(value);
const pageInput = z.object({title:z.string().trim().min(1).max(180),slug:z.string().min(1).max(100),sections:z.array(block).max(60),meta_title:z.string().max(180).default(''),meta_description:z.string().max(320).default(''),noindex:z.boolean().default(false),theme:z.object({primary:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#087e78'),width:z.enum(['standard','wide']).default('standard')}).strict().default({primary:'#087e78',width:'standard'}),menus:z.array(z.object({label:z.string().min(1).max(80),url:z.string().max(500)}).strict()).max(30).default([])}).strict().superRefine((d,ctx)=>{try{publicSlug.parse(d.slug)}catch{ctx.addIssue({code:'custom',message:'Use a safe page slug',path:['slug']})} for(const [i,s] of d.sections.entries()) if(s.button_url&&!safeLink(s.button_url)) ctx.addIssue({code:'custom',message:'Unsafe link destination',path:['sections',i,'button_url']}); for(const [i,m] of d.menus.entries()) if(m.url&&!safeLink(m.url)) ctx.addIssue({code:'custom',message:'Unsafe link destination',path:['menus',i,'url']});});
export async function websitePages(a:Access) {
 const pages=(await visible(a,'website_page')).filter(p=>p.status!=='deleted');
 const pubs=pages.length?await dbAll("SELECT source_id,slug,version,published_at,active FROM ac_publications WHERE org_id=? AND environment=? AND source_kind='website' AND source_id IN ("+pages.map(()=>'?').join(',')+")",[a.org,a.environment,...pages.map(p=>p.id)]):[];
 return {data:pages.map(page=>{const pub=pubs.find(p=>p.source_id===page.id);return {...page,data:{...page.data,published_version:pub?.active?Number(pub.version):null,public_url:pub?.active&&a.environment==='production'?'/sites/'+pub.slug:null,published_at:pub?.published_at||null}}})};
}
export async function saveWebsitePage(a:Access,id:string|null,input:unknown,key:string) {
  const d=pageInput.extend({expected_version:z.number().int().positive().optional()}).parse(input);
  if(d.sections.some(s=>s.type==='image'&&s.image_url&&!s.image_url.startsWith('/public/'))) fail(400,'Images must use reviewed public media');
  return operation(a,id?'website.edit':'website.create',key,{id,...d},()=>authorize(a,'website',id||undefined,true),async()=>{
    if(!id) return insert(a,'website_page',{...d,template:'blank'});
    const old=await read(a,id,'website_page'); if(old.version!==d.expected_version) fail(409,'Page changed; reload before editing');
    const {expected_version:_,...data}=d; return update(a,old,{...old.data,...data});
  });
}
export async function publishWebsitePage(a:Access,id:string,version:number,key:string) {
 return operation(a,'website.publish',key,{id,version},()=>authorize(a,'website',id,true),async()=>{
   const page=await read(a,id,'website_page'); if(page.version!==version) fail(409,'Page changed; review the current draft');
   const existing=await dbGet("SELECT * FROM ac_publications WHERE org_id=? AND environment=? AND source_id=? AND source_kind='website'",[a.org,a.environment,id]);
   const collision=await dbGet('SELECT id FROM ac_publications WHERE environment=? AND slug=? AND active=1 AND source_id<>?', [a.environment,page.data.slug,id]); if(collision) fail(409,'This public path is already in use');
   const pubId=existing?.id||randomUUID(), pubVersion=Number(existing?.version||0)+1, at=now();
   const snapshot=seal(JSON.stringify({title:page.data.title,slug:page.data.slug,sections:page.data.sections,meta_title:page.data.meta_title,meta_description:page.data.meta_description,noindex:page.data.noindex,theme:page.data.theme,menus:page.data.menus}),JSON.stringify(['website-publication',a.org,a.environment,pubId,pubVersion]),'2');
   if(existing) await dbRun('UPDATE ac_publications SET slug=?,version=?,snapshot=?,active=1,published_by=?,published_at=? WHERE id=? AND org_id=? AND environment=?',[page.data.slug,pubVersion,snapshot,a.actor,at,pubId,a.org,a.environment]);
   else await dbRun("INSERT INTO ac_publications(id,org_id,environment,source_id,source_kind,slug,version,snapshot,active,published_by,published_at) VALUES (?,?,?,?,'website',?,?,?,1,?,?)",[pubId,a.org,a.environment,id,page.data.slug,pubVersion,snapshot,a.actor,at]);
   await dbRun('INSERT INTO ac_publication_versions(publication_id,version,snapshot,actor,created_at) VALUES (?,?,?,?,?)',[pubId,pubVersion,snapshot,a.actor,at]);
   return {id:pubId,slug:page.data.slug,version:pubVersion,published_at:at,url:a.environment==='production'?'/sites/'+page.data.slug:null};
 },{meter:false});
}
export async function unpublishWebsitePage(a:Access,id:string,version:number,key:string) {
 return operation(a,'website.unpublish',key,{id,version},()=>authorize(a,'website',id,true),async()=>{
  const page=await read(a,id,'website_page'); if(page.version!==version) fail(409,'Page changed; review the current draft');
  const publication=await dbGet("SELECT id,version FROM ac_publications WHERE org_id=? AND environment=? AND source_id=? AND source_kind='website' AND active=1",[a.org,a.environment,id]);
  if(!publication) fail(409,'This page is not published');
  await dbRun('UPDATE ac_publications SET active=0 WHERE id=? AND org_id=? AND environment=?',[publication.id,a.org,a.environment]);
  return {id:publication.id,active:false,withdrawn_at:now()};
 },{meter:false});
}
export async function publicWebsitePage(slug:string,path='') {
 const pageSlug=path?slug+'/'+path:slug;
 const p=await dbGet("SELECT * FROM ac_publications WHERE environment='production' AND slug=? AND active=1 AND source_kind='website'",[pageSlug]);
 if(!p) return null;
 const workspace=await dbGet("SELECT kind,status FROM ac_workspaces WHERE id=?",[p.org_id]); if(workspace?.kind!=='business'||workspace.status!=='active') return null;
 try { return JSON.parse(unseal(p.snapshot,JSON.stringify(['website-publication',p.org_id,p.environment,p.id,Number(p.version)]))); } catch { return null; }
}
