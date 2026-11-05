import {z} from 'zod';
import {dbAll,isPostgres} from '../db';
import type {Access} from '../platform/auth';
import {fail} from '../platform/auth';
import {currencySchema} from '../platform/domain';
import {sumMinor,basisPoints} from '../finance/money';
import {day,addDays} from './store';

export async function crmReport(a:Access,input:unknown){
 const q=z.object({from:z.string().date().default(addDays(day(),-89)),to:z.string().date().default(day()),currency:currencySchema.default('KES'),team:z.string().uuid().optional(),assignee:z.string().uuid().optional()}).strict().parse(input);
 if(q.from>q.to||Date.parse(q.to)-Date.parse(q.from)>366*86400000)fail(400,'Choose an ordered date range of at most one year');
 const from=new Date(q.from+'T00:00:00+03:00').toISOString(),to=new Date(addDays(q.to,1)+'T00:00:00+03:00').toISOString();
 const json=(key:string)=>isPostgres?"(data::jsonb->>'"+key+"')":"json_extract(data,'$."+key+"')";
 const raw=await dbAll("SELECT id,data,created_at,updated_at FROM ac_crm_entries WHERE org_id=? AND environment=? AND kind='opportunity' AND status NOT IN ('archived','cancelled') AND created_at>=? AND created_at<? AND "+json('currency')+"=?"+(q.team?" AND "+json('team_id')+"=?":"")+(q.assignee?" AND "+json('assigned_to')+"=?":"")+" ORDER BY created_at,id LIMIT 10001",[a.org,a.environment,from,to,q.currency,...(q.team?[q.team]:[]),...(q.assignee?[q.assignee]:[])]);
 const records=raw.slice(0,10000).map(r=>({...JSON.parse(r.data),id:r.id,created_at:r.created_at,updated_at:r.updated_at})).filter(r=>r.currency===q.currency&&(!q.team||r.team_id===q.team)&&(!q.assignee||r.assigned_to===q.assignee));
 const group=(key:string)=>[...new Set(records.map(r=>r[key]||'unassigned'))].map(id=>{const rows=records.filter(r=>(r[key]||'unassigned')===id),open=rows.filter(r=>!['won','lost'].includes(r.stage));return {id,count:rows.length,won:rows.filter(r=>r.stage==='won').length,lost:rows.filter(r=>r.stage==='lost').length,open_amount_minor:sumMinor(open.map(r=>r.amount_minor)),weighted_open_minor:sumMinor(open.filter(r=>r.probability_bps!==null&&r.probability_bps!==undefined).map(r=>basisPoints(r.amount_minor,r.probability_bps))),without_probability:open.filter(r=>r.probability_bps===null||r.probability_bps===undefined).length};});
 return {truncated:raw.length>10000,covered_records:records.length,period:{from:q.from,to:q.to},currency:q.currency,timezone:'Africa/Nairobi',by_team:group('team_id'),by_assignee:group('assigned_to'),records,as_of:new Date().toISOString(),definition:'Opportunities created in the selected Nairobi dates, excluding archived/cancelled records. At most 10,000 filtered records are covered; truncation is explicit. Open value excludes won/lost; weighted amounts use only explicitly recorded probabilities. Opportunity values are not recognized revenue.',source:'canonical CRM entries',permission:'Current workspace membership and CRM read entitlement'};
}
