import {z} from 'zod';
import {dbAll,dbGet,dbTransaction,isPostgres} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {quantityMilli} from '../inventory/quantity';
import {calendarDay,sumMinor,exactNumber} from '../finance/money';
import {documentBalance} from '../finance/ledger';
import {registerAccess} from './registers';
import {registerDayWindow} from './calendar';

/** All totals name their coverage; register assignment is never general Finance
 * or Inventory access. Filtering happens before the bounded encrypted read. */
export async function posDailyReport(a:Access,id:string,input:unknown={}){
 const q=z.object({date:z.string().date().optional()}).strict().parse(input);
 return dbTransaction(async()=>{
  // Serialize with every register financial write for a coherent readback.
  await dbGet('SELECT id FROM ac_organizations WHERE id=?'+(isPostgres?' FOR UPDATE':''),[a.org]);
  const {register,manager}=await registerAccess(a,id),date=q.date||calendarDay(new Date().toISOString(),register.data.timezone);
  let window:{from:string;to:string};try{window=registerDayWindow(date,register.data.timezone);}catch(e){fail(400,(e as Error).message);}
  const scope='l.org_id=? AND l.environment=? AND l.register_id=?'+(manager?'':' AND s.cashier_id=?');
  const params=[a.org,a.environment,id,...(manager?[]:[a.actor])];
  const filter=scope+' AND l.created_at>=? AND l.created_at<?',filtered=[...params,window!.from,window!.to];
  const total=await dbGet('SELECT COUNT(*) AS n FROM ac_pos_sale_links l JOIN ac_pos_sessions s ON s.session_id=l.session_id AND s.org_id=l.org_id AND s.environment=l.environment WHERE '+filter,filtered);
  const rows=await dbAll('SELECT l.invoice_id FROM ac_pos_sale_links l JOIN ac_pos_sessions s ON s.session_id=l.session_id AND s.org_id=l.org_id AND s.environment=l.environment WHERE '+filter+' ORDER BY l.created_at,l.sale_id LIMIT 1000',filtered);
  const balances:Awaited<ReturnType<typeof documentBalance>>[]=[];
  for(const row of rows)balances.push(await documentBalance(a,row.invoice_id));
  const productTotals=new Map<string,{id:string;name:string;unit:string;quantity_milli:number;line_subtotal_minor:number}>();
  for(const invoice of balances)for(const line of invoice.items){if(!line.product_id)continue;const quantity=quantityMilli(line.quantity),prior=productTotals.get(line.product_id)||{id:line.product_id,name:line.product_snapshot?.name||line.description,unit:line.product_snapshot?.unit||'unit',quantity_milli:0,line_subtotal_minor:0};prior.quantity_milli=sumMinor([prior.quantity_milli,quantity]);prior.line_subtotal_minor=sumMinor([prior.line_subtotal_minor,exactNumber((BigInt(quantity)*BigInt(line.unit_price_minor)+500n)/1000n)]);productTotals.set(prior.id,prior);}
  const cash=await dbAll('SELECT c.kind,SUM(c.amount_minor) AS amount_minor,COUNT(*) AS n FROM ac_cash_movements c JOIN ac_pos_sessions s ON s.session_id=c.session_id AND s.org_id=c.org_id AND s.environment=c.environment WHERE c.org_id=? AND c.environment=? AND s.register_id=?'+(manager?'':' AND s.cashier_id=?')+' AND c.occurred_at>=? AND c.occurred_at<? GROUP BY c.kind',filtered);
  const closures=await dbAll('SELECT COUNT(*) AS n,COALESCE(SUM(c.variance_minor),0) AS variance_minor FROM ac_pos_session_closures c JOIN ac_pos_sessions s ON s.session_id=c.session_id AND s.org_id=c.org_id AND s.environment=c.environment WHERE c.org_id=? AND c.environment=? AND s.register_id=?'+(manager?'':' AND s.cashier_id=?')+' AND c.created_at>=? AND c.created_at<?',filtered);
  const open=await dbGet("SELECT COUNT(*) AS n FROM ac_pos_sessions s WHERE s.org_id=? AND s.environment=? AND s.register_id=? AND s.status='open'"+(manager?'':' AND s.cashier_id=?'),params);
  const inventory=await dbGet("SELECT e.status,s.enabled FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment=? AND e.service_id='inventory'",[a.org,a.environment]);
  const warehouse=register.data.warehouse_id&&await dbGet("SELECT id FROM ac_warehouses WHERE id=? AND org_id=? AND environment=? AND status='active'",[register.data.warehouse_id,a.org,a.environment]);
  let stock:{available:boolean;data:any[];has_more:boolean;definition:string}={available:false,data:[],has_more:false,definition:'Activate Inventory and configure a current register warehouse for exact-location stock warnings.'};
  if(warehouse&&inventory?.status==='active'&&Number(inventory.enabled)===1){
   const json=(name:string)=>isPostgres?"(p.data::jsonb->>'"+name+"')":"json_extract(p.data,'$."+name+"')";
   const stockRows=await dbAll('SELECT * FROM (SELECT p.id,p.name,p.data,COALESCE(m.n,0)-COALESCE(r.n,0) AS available_milli FROM ac_products p LEFT JOIN (SELECT product_id,SUM(quantity_milli) AS n FROM ac_stock_movements WHERE org_id=? AND environment=? AND warehouse_id=? AND COALESCE(location_id,\'\')=? GROUP BY product_id) m ON m.product_id=p.id LEFT JOIN (SELECT product_id,SUM(quantity_milli-dispatched_milli) AS n FROM ac_stock_reservations WHERE org_id=? AND environment=? AND warehouse_id=? AND COALESCE(location_id,\'\')=? AND status=\'held\' GROUP BY product_id) r ON r.product_id=p.id WHERE p.org_id=? AND p.environment=? AND p.status=\'active\' AND '+json('currency')+'=? AND '+(isPostgres?json('track_inventory')+"='true'":json('track_inventory')+'=1')+' AND COALESCE(m.n,0)-COALESCE(r.n,0)<=CAST('+json('reorder_point_milli')+' AS BIGINT)) low ORDER BY available_milli,name,id LIMIT 51',[...Array(2).fill([a.org,a.environment,register.data.warehouse_id,register.data.location_id||'']).flat(),a.org,a.environment,register.data.currency]);
   stock={available:true,data:stockRows.slice(0,50).map(row=>({id:row.id,name:row.name,unit:JSON.parse(row.data).unit,available_milli:sumMinor([row.available_milli]),reorder_point_milli:JSON.parse(row.data).reorder_point_milli})),has_more:stockRows.length>50,definition:'Current active tracked products in this currency at the exact register warehouse/location. Available stock subtracts held reservations; warnings use each product reorder point. At most 50 matching warnings are shown. Not historical inventory or valuation.'};
  }
  return {date,timezone:register.data.timezone,currency:register.data.currency,register_id:id,window:window!,scope:manager?'assigned_register':'own_cashier_shifts',sales:{total_count:Number(total.n),covered_count:rows.length,truncated:Number(total.n)>rows.length,gross_invoice_minor:sumMinor(balances.map(b=>b.total_minor)),credited_minor:sumMinor(balances.map(b=>b.credited_minor)),outstanding_minor:sumMinor(balances.map(b=>b.outstanding_minor)),recorded_cash_retained_minor:sumMinor(balances.map(b=>b.recorded_cash_paid_minor)),simulated_electronic_paid_minor:sumMinor(balances.map(b=>b.provider_paid_minor))},cash_activity:{received_minor:sumMinor(cash.filter(r=>r.kind==='receipt').map(r=>r.amount_minor)),returned_minor:-sumMinor(cash.filter(r=>r.kind==='return').map(r=>r.amount_minor)),return_count:Number(cash.find(r=>r.kind==='return')?.n||0)},shifts:{currently_open:Number(open.n),closed_on_date:Number(closures[0].n),closed_variance_minor:Number(closures[0].variance_minor)},stock,top_products:[...productTotals.values()].sort((x,y)=>y.line_subtotal_minor-x.line_subtotal_minor||x.id.localeCompare(y.id)).slice(0,10),as_of:new Date().toISOString(),definition:'Sales are invoices confirmed on the selected register-local date, with current settlement and credits as of refresh. At most 1,000 matching sales are covered; truncation applies to monetary totals and top products. Cash activity and closed-shift variance cover all matching facts occurring on the selected date, including older sales. Open shifts are current. Product subtotals precede document discount/tax and physical returns; units are not combined. No recognized revenue, profit, bank balance or live provider qualification is implied.'};
 });
}
