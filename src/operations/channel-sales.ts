import {randomUUID} from 'node:crypto';
import {dbGet,dbRun} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {now} from '../platform/crypto';
import {documentSchema,totals} from '../platform/domain';
import {save,record,update,enqueue} from '../platform/payments';
import {checkLimits,recordUsage,requireServices} from '../marketplace/engine';
import {businessPolicyFor} from './business-policy';
import {basisPoints} from '../finance/money';

/** Trusted channel adapter, called only inside the caller's workspace-locked
 * transaction after current channel authority and an exact quote are checked.
 * This owns no parallel order, invoice, reservation or payment ledger. */
export async function createChannelSale(a:Access,input:{document:unknown;expected_total_minor:number;expected_tax_minor:number;source_field:'commerce_source'|'pos_source';provenance:Record<string,unknown>;usage_key:string;usage_source:string;delivery_snapshot?:unknown;purchase_order_reference?:string}){
 for(const service of ['products','orders','invoicing'])await requireServices(a,[service]);
 const document=documentSchema.parse(input.document),amounts=totals(document),policy=await businessPolicyFor(a);
 if(amounts.total_minor!==input.expected_total_minor||amounts.tax_minor!==input.expected_tax_minor)fail(409,'The canonical invoice and channel quote differ; refresh before confirming');
 if(document.discount_minor>basisPoints(amounts.subtotal_minor,policy.configuration.discount_approval_bps))fail(409,'This discount requires merchant approval before checkout');
 const customer=await record(a,document.customer_id,'customers');
 for(const service of ['orders','invoicing'])await checkLimits(a,service,1);
 const source={[input.source_field]:input.provenance};
 const order=await save(a,'orders',{...document,...amounts,reference:'ORD-'+randomUUID().slice(0,12).toUpperCase(),status:'draft',paid_minor:0,payment_status:'unpaid',fulfillment_status:'unfulfilled',...source,...(input.delivery_snapshot===undefined?{}:{delivery_snapshot:input.delivery_snapshot}),...(input.purchase_order_reference===undefined?{}:{purchase_order_reference:input.purchase_order_reference})});
 // The existing transition owns reservations and any configured draft invoice.
 await update(a,order.id,{...order,status:'awaiting_payment'});
 const linked=await dbGet('SELECT invoice_id FROM ac_sales_order_links WHERE order_id=? AND org_id=? AND environment=?',[order.id,a.org,a.environment]);
 let invoice:any;
 if(linked)invoice=await record(a,linked.invoice_id,'invoices');
 else{
  invoice=await save(a,'invoices',{...document,...amounts,order_id:order.id,reference:'INV-'+randomUUID().slice(0,12).toUpperCase(),status:'draft',paid_minor:0,...source});
  await dbRun('INSERT INTO ac_sales_order_links(order_id,org_id,environment,invoice_id,policy_version,created_at) VALUES (?,?,?,?,?,?)',[order.id,a.org,a.environment,invoice.id,policy.version,now()]);
  await enqueue(a,'invoice.created',{id:invoice.id,order_id:order.id,customer_id:customer.id});
 }
 if(invoice.status!=='draft'||invoice.total_minor!==amounts.total_minor||invoice.currency!==document.currency||invoice.customer_id!==customer.id)fail(409,'The linked invoice requires merchant review');
 await update(a,invoice.id,{...invoice,status:'issued',...source,customer_snapshot:{id:customer.id,name:customer.name,email:customer.email,phone:customer.phone,address:customer.address}});
 await enqueue(a,'invoice.issued',{id:invoice.id,order_id:order.id,customer_id:customer.id});
 for(const service of ['orders','invoicing']){await checkLimits(a,service,1);await recordUsage(a,service,input.usage_key,1,input.usage_source);}
 return {order_id:order.id,invoice_id:invoice.id};
}
