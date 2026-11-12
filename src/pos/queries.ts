import {z} from 'zod';
import {dbAll,dbGet,isPostgres} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {decode} from '../erp/store';
import {requireServices} from '../marketplace/engine';
import {documentBalance} from '../finance/ledger';
import {registerAccess} from './registers';
import {posSale} from './quotes';
import {stockReturnChoices} from './stock';

const paging=z.object({offset:z.coerce.number().int().min(0).max(1_000_000).default(0)}).strict();
const productQuery=paging.extend({q:z.string().trim().max(100).default('')}).strict();
const literal=(value:string)=>value.toLowerCase().replace(/[\\%_]/g,'\\$&');
const field=(name:string)=>isPostgres?"(data::jsonb->>'"+name+"')":"json_extract(data,'$."+name+"')";
export async function registerOverview(a:Access,id:string,input:unknown={}){
 const q=paging.parse(input),{register,manager,write_allowed}=await registerAccess(a,id);
 const rows=await dbAll("SELECT o.* FROM ac_erp_objects o JOIN ac_pos_sessions s ON s.session_id=o.id AND s.org_id=o.org_id AND s.environment=o.environment WHERE o.org_id=? AND o.environment=? AND o.root_id=? AND o.kind='pos_session'"+(manager?'':' AND s.cashier_id=?')+' ORDER BY o.created_at DESC,o.id DESC LIMIT 21 OFFSET ?',[a.org,a.environment,id,...(manager?[]:[a.actor]),q.offset]);
 const occupied=!!await dbGet("SELECT session_id FROM ac_pos_sessions WHERE org_id=? AND environment=? AND register_id=? AND status='open'",[a.org,a.environment,id]);
 return {register,manager,occupied,permissions:{write:write_allowed},sessions:rows.slice(0,20).map(row=>decode(a,row)),has_more:rows.length>20,offset:q.offset,limit:20};
}
/** Minimal current product projection. Literal search precedes pagination;
 * private purchase costs and supplier/contact data never enter cashier search. */
export async function posProducts(a:Access,id:string,input:unknown={}){
 const q=productQuery.parse(input),{register}=await registerAccess(a,id);await requireServices(a,['products'],true);
 const search='%'+literal(q.q)+'%',rows=await dbAll("SELECT id,version,sku,name,data FROM ac_products WHERE org_id=? AND environment=? AND status='active' AND "+field('currency')+"=? AND (LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(sku) LIKE ? ESCAPE '\\' OR LOWER(COALESCE("+field('barcode')+",'')) LIKE ? ESCAPE '\\') ORDER BY name,id LIMIT 26 OFFSET ?",[a.org,a.environment,register.data.currency,search,search,search,q.offset]);
 return {data:rows.slice(0,25).map(row=>{const p=JSON.parse(row.data);return {id:row.id,version:Number(row.version),sku:row.sku,name:row.name,barcode:p.barcode,variant:p.variant,unit:p.unit,currency:p.currency,sale_price_minor:p.sale_price_minor,track_inventory:p.track_inventory};}),has_more:rows.length>25,offset:q.offset,limit:25,notice:'Current canonical catalog. Exact location stock and prices are revalidated in the sale quote. Keyboard barcode input is supported; no camera or payment terminal is connected.'};
}
export async function posSales(a:Access,id:string,input:unknown={}){
 const q=paging.extend({state:z.enum(['draft','confirmed']).optional()}).parse(input),{manager}=await registerAccess(a,id);
 const rows=await dbAll("SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='pos_sale'"+(manager?'':" AND EXISTS(SELECT 1 FROM ac_pos_sessions ps WHERE ps.session_id=ac_erp_objects.parent_id AND ps.org_id=ac_erp_objects.org_id AND ps.environment=ac_erp_objects.environment AND ps.cashier_id=?)")+(q.state?' AND status=?':'')+' ORDER BY created_at DESC,id DESC LIMIT 26 OFFSET ?',[a.org,a.environment,id,...(manager?[]:[a.actor]),...(q.state?[q.state]:[]),q.offset]);
 return {data:rows.slice(0,25).map(row=>{const sale=decode(a,row),quote=sale.data.confirmed_quote||sale.data.quote;return {id:sale.id,version:sale.version,status:sale.status,created_at:sale.created_at,session_id:sale.parent_id,currency:quote?.document.currency,total_minor:quote?.amounts.total_minor,invoice_id:sale.data.invoice_id||null,order_id:sale.data.order_id||null,handover:sale.data.handover||'not_recorded'};}),has_more:rows.length>25,offset:q.offset,limit:25};
}
export async function posReceipt(a:Access,id:string){
 const sale=await posSale(a,id);if(sale.status!=='confirmed')fail(409,'Confirm this draft before opening a sale receipt');
 const {register,manager}=await registerAccess(a,sale.root_id),invoice=await documentBalance(a,sale.data.invoice_id),merchant=await dbGet('SELECT name FROM ac_organizations WHERE id=?',[a.org]);
 const returns=await dbAll("SELECT id,amount_minor,occurred_at,related_receipt_id FROM ac_cash_movements WHERE org_id=? AND environment=? AND document_id=? AND kind='return' ORDER BY occurred_at DESC,id DESC LIMIT 21",[a.org,a.environment,invoice.id]);
 const request=sale.data.checkout?await dbGet('SELECT id,status,amount_minor,expires_at FROM ac_requests WHERE id=? AND org_id=? AND environment=? AND document_id=?',[sale.data.checkout.request_id,a.org,a.environment,invoice.id]):null;
 const canOpenCheckout=request&&['pending','failed'].includes(request.status)&&!invoice.collection_hold&&Number(request.amount_minor)<=invoice.outstanding_minor&&request.expires_at>new Date().toISOString();
 const stock_returns=await stockReturnChoices(a,id);
 const stockService=await dbGet("SELECT e.status,s.enabled FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment=? AND e.service_id='inventory'",[a.org,a.environment]);
 const receivingWarehouse=register.data.warehouse_id?await dbGet("SELECT id FROM ac_warehouses WHERE id=? AND org_id=? AND environment=? AND status='active'",[register.data.warehouse_id,a.org,a.environment]):null;
 const canReturnStock=manager&&stockService?.status==='active'&&Number(stockService.enabled)===1&&!!receivingWarehouse;
 return {id:sale.id,version:sale.version,reference:'POS-'+sale.id.slice(0,12).toUpperCase(),merchant:merchant?.name,register_id:register.id,register_name:register.data.name,timezone:register.data.timezone,environment:a.environment,confirmed_at:sale.data.confirmed_at,recorded_by_label:sale.data.confirmed_by_label||sale.data.confirmed_by,lines:invoice.items,currency:invoice.currency,subtotal_minor:invoice.subtotal_minor,discount_minor:invoice.discount_minor,tax_minor:invoice.tax_minor,total_minor:invoice.total_minor,invoice_id:invoice.id,order_id:sale.data.order_id,payment:{status:invoice.status,provider_paid_minor:invoice.provider_paid_minor,recorded_cash_paid_minor:invoice.recorded_cash_paid_minor,cash_returned_minor:invoice.cash_returned_minor,credited_minor:invoice.credited_minor,outstanding_minor:invoice.outstanding_minor,collection_hold:invoice.collection_hold},tender:sale.data.tender,cash_receipt_id:sale.data.cash_receipt_id,handover:sale.data.handover,stock_returns,returns:returns.slice(0,20).map(row=>({...row,amount_minor:Number(row.amount_minor)})),returns_has_more:returns.length>20,checkout:canOpenCheckout?{request_id:request.id,amount_minor:Number(request.amount_minor),url:sale.data.checkout.url,expires_at:request.expires_at}:null,permissions:{manager,stock_return:canReturnStock},notice:'Sandbox sale receipt. Recorded physical cash is a merchant observation; electronic confirmations are test simulations. Handover, invoice corrections, stock returns and independent journal posting remain separate.'};
}
