import {z} from 'zod';
import {dbGet} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {requireServices} from '../marketplace/engine';
import {record} from '../platform/payments';
import {product,stockBalance} from '../inventory/service';
import {create} from './store';
import {createCrmEntry} from './crm';
import {workflowAction} from './contracts';
export async function executeBusinessWorkflow(a:Access,w:any,run:any,chosenAction?:string){
 const event=await dbGet('SELECT * FROM ac2_events WHERE id=? AND org_id=? AND environment=?',[run.trigger_key,a.org,a.environment]);if(!event)fail(409,'Workflow source event is unavailable');const payload=z.object({id:z.string().uuid()}).passthrough().parse(JSON.parse(event.payload));
 const action=chosenAction||workflowAction(w.template);
 if(action==='create_crm_follow_up'){
  await requireServices(a,['crm']);let customerId=payload.id;if(event.event_type==='crm.stage_changed'){const row=await dbGet('SELECT data,status FROM ac_crm_entries WHERE id=? AND org_id=? AND environment=?',[payload.id,a.org,a.environment]);if(!row||['archived','cancelled'].includes(row.status)||JSON.parse(row.data).stage!==JSON.parse(event.payload).stage)return {action,skipped:true,reason:'source_changed',completed_units:0};customerId=JSON.parse(row.data).customer_id;}else if(event.event_type==='invoice.issued'){await requireServices(a,['invoicing']);const invoice=await record(a,payload.id,'invoices');if(['draft','voided'].includes(invoice.status))return {action,skipped:true,reason:'source_changed',completed_units:0};customerId=invoice.customer_id;}else if(event.event_type!=='customer.created')fail(409,'Unexpected workflow event');const customer=await record(a,customerId,'customers');if(customer.status==='archived')return {action,skipped:true,reason:'customer_archived',completed_units:0};
  const entry=await createCrmEntry(a,{kind:'follow_up',customer_id:customer.id,title:w.name+' · customer onboarding',notes:'Created by a reviewed supported workflow. No customer message was sent.',assigned_to:a.actor,due_at:new Date(Date.parse(run.created_at)+w.conditions.days_before_due*86400000).toISOString()},'workflow:'+run.id,run.id);
  return {action,resource_id:entry.id,completed_units:1,external_messages_sent:0};
 }
 if(action==='replenishment_suggestion'){
  if(event.event_type!=='inventory.reorder_needed')fail(409,'Unexpected workflow event');await requireServices(a,['inventory']);const prior=await dbGet("SELECT id FROM ac2_objects WHERE id=? AND org_id=? AND environment=? AND kind='replenishment_suggestions'",[run.id,a.org,a.environment]);if(prior)return {action,resource_id:prior.id,completed_units:1,supplier_orders_created:0,external_messages_sent:0,replayed:true};const p=await product(a,payload.id),balance=await stockBalance(a,p.id);if(!p.track_inventory||p.status!=='active'||balance.available_milli>p.reorder_point_milli)return {action,skipped:true,reason:'stock_recovered',completed_units:0};
  const raw=Math.min(1e12,Math.max(0,p.reorder_point_milli*2-balance.forecasted_milli)),suggested=['unit','box'].includes(p.unit)?Math.ceil(raw/1000)*1000:raw;if(!suggested)return {action,skipped:true,reason:p.reorder_point_milli?'incoming_covers_reorder_target':'reorder_target_not_configured',completed_units:0};
  const suggestion=await create(a,'replenishment_suggestions',{product_id:p.id,product_name:p.name,sku:p.sku,source_run_id:run.id,status:'open',available_milli:balance.available_milli,reorder_point_milli:p.reorder_point_milli,suggested_quantity_milli:suggested,incoming_milli:balance.incoming_milli,rule:'Twice the configured reorder point less available stock and planned incoming quantities; unit/box quantities round up to whole units',unit:p.unit,policy:'Review suggestion only; no purchase order, supplier message or payment is authorized.'},run.id);
  return {action,resource_id:suggestion.id,completed_units:1,supplier_orders_created:0,external_messages_sent:0};
 }
 return fail(400,'Unsupported business workflow action');
}
