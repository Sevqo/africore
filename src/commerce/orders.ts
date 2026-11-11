import {z} from 'zod';
import {dbAll} from '../db/adapter';
import {requireServices} from '../marketplace/engine';
import {documentBalance} from '../finance/ledger';
import {type Access,fail} from '../platform/auth';
import {currentMember} from '../erp/store';
import {store} from './catalog';

/** Merchant report is a scoped view of canonical records, not a second order
 * store or an assertion that physical fulfillment follows payment. */
export async function storeOrders(a:Access,id:string,input:unknown){
 await store(a,id);if(!['owner','admin'].includes(await currentMember(a)))fail(403,'Current owner or administrator required');for(const service of ['orders','invoicing','payments'])await requireServices(a,[service],true);
 const q=z.object({q:z.string().trim().max(100).default(''),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict().parse(input);
 const filter=q.q?' AND LOWER(r.data) LIKE ? ESCAPE \'\\\'':'',parameters=[a.org,a.environment,id,...(q.q?['%'+q.q.toLowerCase().replace(/[\\%_]/g,'\\$&')+'%']:[])];
 const rows=await dbAll("SELECT l.order_id,l.invoice_id,l.created_at,r.data FROM ac_commerce_order_links l JOIN ac_records r ON r.id=l.order_id AND r.org_id=l.org_id AND r.environment=l.environment AND r.kind='orders' WHERE l.org_id=? AND l.environment=? AND l.store_id=?"+filter+' ORDER BY l.created_at DESC,l.order_id DESC LIMIT 51 OFFSET ?',[...parameters,q.offset]);
 const data=[];for(const row of rows.slice(0,50)){const order=JSON.parse(row.data),invoice=await documentBalance(a,row.invoice_id);data.push({id:row.order_id,invoice_id:row.invoice_id,reference:order.reference,invoice_reference:invoice.reference,created_at:row.created_at,currency:invoice.currency,total_minor:invoice.total_minor,paid_minor:invoice.paid_minor,credited_minor:invoice.credited_minor,outstanding_minor:invoice.outstanding_minor,status:order.status,payment_status:order.payment_status,fulfillment_status:order.fulfillment_status});}
 return {data,offset:q.offset,has_more:rows.length>50,coverage:'Canonical storefront orders and linked invoices in this store and environment. Payments and credits do not automatically dispatch goods or post journals.'};
}
