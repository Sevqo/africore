import {dbAll,isPostgres} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {hash} from '../platform/crypto';
import {record,update as updateRecord} from '../platform/payments';
import {operation,update,type ERPObject} from '../erp/store';
import {product,postMovement} from '../inventory/service';
import {requireServices} from '../marketplace/engine';
import {sumMinor} from '../finance/money';
import {posSale} from './quotes';
import {sessionAccess} from './sessions';
import {stockReturnInput} from './contracts';

function dispatchQuery(a:Access,sale:ERPObject,id?:string){
 const shipmentOrder=isPostgres?"(sh.data::jsonb->>'order_id')":"json_extract(sh.data,'$.order_id')";
 const sql="SELECT d.*,COALESCE((SELECT SUM(r.quantity_milli) FROM ac_stock_movements r WHERE r.org_id=d.org_id AND r.environment=d.environment AND r.kind='return' AND r.source_id=d.id),0) AS returned_milli FROM ac_stock_movements d WHERE d.org_id=? AND d.environment=? AND d.kind='dispatch' AND (d.source_id=? OR EXISTS(SELECT 1 FROM ac2_objects sh WHERE sh.id=d.source_id AND sh.org_id=d.org_id AND sh.environment=d.environment AND sh.kind='shipments' AND "+shipmentOrder+"=?))"+(id?' AND d.id=?':'')+' ORDER BY d.created_at,d.id LIMIT '+(id?'1':'101');
 return dbAll(sql,[a.org,a.environment,sale.data.order_id,sale.data.order_id,...(id?[id]:[])]);
}
/** Receipt-scoped dispatch projection, not access to general inventory. */
export async function stockReturnChoices(a:Access,id:string){
 const sale=await posSale(a,id);if(sale.status!=='confirmed')return {data:[],has_more:false,limit:100};
 const order=await record(a,sale.data.order_id,'orders'),rows=await dispatchQuery(a,sale);
 return {data:rows.slice(0,100).map(row=>{const line=order.items.find((item:any)=>item.product_id===row.product_id),dispatched_milli=-Number(row.quantity_milli),returned_milli=Number(row.returned_milli);return {id:row.id,product_id:row.product_id,name:line?.product_snapshot?.name||line?.description||'Recorded product',unit:line?.product_snapshot?.unit||'unit',dispatched_milli,returned_milli,remaining_milli:sumMinor([dispatched_milli,-returned_milli])};}),has_more:rows.length>100,limit:100};
}
export async function returnPOSStock(a:Access,id:string,input:unknown,key:string){
 const d=stockReturnInput.parse(input);
 await operation(a,'pos.sale.stock-return:'+id,key,d,async()=>{await posSale(a,id,true);await sessionAccess(a,d.receiving_session_id,{write:true,manager:true});},async()=>{
  const sale=await posSale(a,id,true),{session,register}=await sessionAccess(a,d.receiving_session_id,{write:true,manager:true});
  if(sale.status!=='confirmed'||sale.version!==d.expected_sale_version)fail(409,'Sale changed; reload before recording stock received back');
  if(session.root_id!==sale.root_id||session.status!=='open'||session.version!==d.expected_session_version)fail(409,'Receive returned goods in a current open session of the original register');
  await requireServices(a,['inventory']);
  if(!register.data.warehouse_id)fail(409,'Configure the receiving register warehouse before recording a physical stock return');
  const [dispatch]=await dispatchQuery(a,sale,d.original_dispatch_id);if(!dispatch)fail(404,'Original dispatch does not belong to this sale');
  const p=await product(a,dispatch.product_id);if(['unit','box'].includes(p.unit)&&d.quantity_milli%1000!==0)fail(400,'This returned product requires a whole quantity');
  const movement=await postMovement(a,{product_id:p.id,warehouse_id:register.data.warehouse_id,location_id:register.data.location_id||null,kind:'return',quantity_milli:d.quantity_milli,source_id:dispatch.id,reason:d.reason},'pos-stock-return:'+hash(JSON.stringify([a.actor,id,key])));
  const order=await record(a,sale.data.order_id,'orders');await updateRecord(a,order.id,{...order,pos_last_stock_return_id:movement.id});
  await update(a,session,{...session.data,last_stock_return_id:movement.id},{},'stock_return_recorded');
  await update(a,sale,{...sale.data,last_stock_return_id:movement.id},{},'stock_return_recorded');
  return {sale_id:id,movement_id:movement.id};
 });return posSale(a,id);
}
