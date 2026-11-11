import {randomUUID} from 'node:crypto';
import {dbGet,dbRun} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {now} from '../platform/crypto';
import {documentSchema,totals} from '../platform/domain';
import {save,record,update,enqueue} from '../platform/payments';
import {checkLimits,recordUsage,entitlement} from '../marketplace/engine';
import {businessPolicyFor} from '../operations/business-policy';
import {basisPoints} from '../finance/money';
import {createPaymentRequest} from '../finance/payment-requests';
import type {ERPObject} from '../erp/store';

/** Internal, transaction-only conversion. The cart caller holds the workspace
 * lock and has revalidated publication, configured owner, consent and quote.
 * Reuse canonical Sales, stock, invoice and payment services throughout. */
export async function createCheckoutSale(a:Access,s:ERPObject,cart:any,quote:any,policyOwner:string){
 const contact=cart.data.contact,shipping=quote.shipping_snapshot;
 if(!contact)fail(409,'Save your checkout contact details first');
 if(shipping.kind==='shipping'&&!contact.delivery_address)fail(409,'A delivery address is required for this shipping option');
 const businessPolicy=await businessPolicyFor(a);
 if(quote.discount_minor>basisPoints(quote.subtotal_minor,businessPolicy.configuration.discount_approval_bps))fail(409,'This discount requires merchant approval before checkout');
 const metered=['orders','invoicing'];if((await entitlement(a,'customers'))?.status==='active')metered.unshift('customers');
 for(const service of metered)await checkLimits(a,service,1);
 const provenance={channel:'commerce',store_id:s.id,cart_id:cart.id,policy_owner:policyOwner,requested_by:a.actor,contact_verification:'guest_unverified'};
 // A guest email is contact evidence, never an authenticated identity or an
 // instruction to merge existing customers or Neon subjects.
 const address=contact.delivery_address?Object.values(contact.delivery_address).filter(Boolean).join(', '):'';
 const customer=await save(a,'customers',{name:contact.name,type:'individual',email:contact.email,phone:contact.phone,address,notes:'Created by sandbox storefront checkout. Guest contact is unverified.',commerce_source:provenance,marketing_consent:{state:contact.marketing_opt_in?'pending_confirmation':'not_requested',notice_version:contact.consent_notice_version,recorded_at:cart.data.contact_recorded_at}});
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:s.data.settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const items=quote.lines.map((line:any)=>({description:line.name,quantity:line.quantity_milli/1000,unit_price_minor:line.unit_price_minor,product_id:line.product_id,...(s.data.settings.warehouse_id?{warehouse_id:s.data.settings.warehouse_id}:{}),...(s.data.settings.location_id?{location_id:s.data.settings.location_id}:{})}));
 if(quote.shipping_minor)items.push({description:shipping.name,quantity:1,unit_price_minor:quote.shipping_minor});
 const document=documentSchema.parse({customer_id:customer.id,currency:quote.currency,items,discount_minor:quote.discount_minor,tax_bps:s.data.settings.tax_bps,issue_date:date,due_date:date,notes:'Sandbox storefront order. No real funds move.'}),amounts=totals(document);
 if(amounts.total_minor!==quote.total_minor||amounts.tax_minor!==quote.tax_minor)fail(409,'The canonical invoice and checkout quote differ; refresh your cart');
 const order=await save(a,'orders',{...document,...amounts,reference:'ORD-'+randomUUID().slice(0,12).toUpperCase(),status:'draft',paid_minor:0,payment_status:'unpaid',fulfillment_status:'unfulfilled',commerce_source:provenance,delivery_snapshot:shipping,purchase_order_reference:contact.purchase_order_reference});
 // This transition owns stock reservations and any configured draft-invoice
 // automation. Never reserve or dispatch stock in a parallel Commerce ledger.
 await update(a,order.id,{...order,status:'awaiting_payment'});
 const linked=await dbGet('SELECT invoice_id FROM ac_sales_order_links WHERE order_id=? AND org_id=? AND environment=?',[order.id,a.org,a.environment]);
 let invoice:any;
 if(linked)invoice=await record(a,linked.invoice_id,'invoices');
 else{
  invoice=await save(a,'invoices',{...document,...amounts,order_id:order.id,reference:'INV-'+randomUUID().slice(0,12).toUpperCase(),status:'draft',paid_minor:0,commerce_source:provenance});
  await dbRun('INSERT INTO ac_sales_order_links(order_id,org_id,environment,invoice_id,policy_version,created_at) VALUES (?,?,?,?,?,?)',[order.id,a.org,a.environment,invoice.id,businessPolicy.version,now()]);
  await enqueue(a,'invoice.created',{id:invoice.id,order_id:order.id,customer_id:customer.id});
 }
 if(invoice.status!=='draft'||invoice.total_minor!==quote.total_minor||invoice.currency!==quote.currency||invoice.customer_id!==customer.id)fail(409,'The linked invoice requires merchant review');
 await update(a,invoice.id,{...invoice,status:'issued',commerce_source:provenance,customer_snapshot:{id:customer.id,name:customer.name,email:customer.email,phone:customer.phone,address:customer.address}});
 await enqueue(a,'invoice.issued',{id:invoice.id,order_id:order.id,customer_id:customer.id});
 for(const service of metered){await checkLimits(a,service,1);await recordUsage(a,service,'commerce-checkout:'+cart.id,1,'commerce_checkout');}
 const payment=await createPaymentRequest(a,{document_id:invoice.id},'commerce-checkout:'+cart.id);
 if(!payment.data.checkout_url)fail(409,'Checkout payment capability requires merchant review');
 return {order_id:order.id,invoice_id:invoice.id,payment_request_id:payment.data.id,url:payment.data.checkout_url,expires_at:payment.data.expires_at};
}
