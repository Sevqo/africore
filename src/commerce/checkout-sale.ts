import {type Access,fail} from '../platform/auth';
import {save} from '../platform/payments';
import {checkLimits,recordUsage,entitlement} from '../marketplace/engine';
import {businessPolicyFor} from '../operations/business-policy';
import {createChannelSale} from '../operations/channel-sales';
import {basisPoints} from '../finance/money';
import {createPaymentRequest} from '../finance/payment-requests';
import type {ERPObject} from '../erp/store';

/** Internal, transaction-only conversion. The cart caller holds the workspace
 * lock and has revalidated publication, configured owner, consent and quote. */
export async function createCheckoutSale(a:Access,s:ERPObject,cart:any,quote:any,policyOwner:string){
 const contact=cart.data.contact,shipping=quote.shipping_snapshot;
 if(!contact)fail(409,'Save your checkout contact details first');
 if(shipping.kind==='shipping'&&!contact.delivery_address)fail(409,'A delivery address is required for this shipping option');
 const businessPolicy=await businessPolicyFor(a);
 if(quote.discount_minor>basisPoints(quote.subtotal_minor,businessPolicy.configuration.discount_approval_bps))fail(409,'This discount requires merchant approval before checkout');
 const meterCustomer=(await entitlement(a,'customers'))?.status==='active';
 for(const service of [...(meterCustomer?['customers']:[]),'orders','invoicing'])await checkLimits(a,service,1);
 const provenance={channel:'commerce',store_id:s.id,cart_id:cart.id,policy_owner:policyOwner,requested_by:a.actor,contact_verification:'guest_unverified'};
 // Guest contact never merges existing customers or Neon subjects.
 const address=contact.delivery_address?Object.values(contact.delivery_address).filter(Boolean).join(', '):'';
 const customer=await save(a,'customers',{name:contact.name,type:'individual',email:contact.email,phone:contact.phone,address,notes:'Created by sandbox storefront checkout. Guest contact is unverified.',commerce_source:provenance,marketing_consent:{state:contact.marketing_opt_in?'pending_confirmation':'not_requested',notice_version:contact.consent_notice_version,recorded_at:cart.data.contact_recorded_at}});
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:s.data.settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const items=quote.lines.map((line:any)=>({description:line.name,quantity:line.quantity_milli/1000,unit_price_minor:line.unit_price_minor,product_id:line.product_id,...(s.data.settings.warehouse_id?{warehouse_id:s.data.settings.warehouse_id}:{}),...(s.data.settings.location_id?{location_id:s.data.settings.location_id}:{})}));
 if(quote.shipping_minor)items.push({description:shipping.name,quantity:1,unit_price_minor:quote.shipping_minor});
 const sale=await createChannelSale(a,{document:{customer_id:customer.id,currency:quote.currency,items,discount_minor:quote.discount_minor,tax_bps:s.data.settings.tax_bps,issue_date:date,due_date:date,notes:'Sandbox storefront order. No real funds move.'},expected_total_minor:quote.total_minor,expected_tax_minor:quote.tax_minor,source_field:'commerce_source',provenance,usage_key:'commerce-checkout:'+cart.id,usage_source:'commerce_checkout',delivery_snapshot:shipping,purchase_order_reference:contact.purchase_order_reference});
 if(meterCustomer){await checkLimits(a,'customers',1);await recordUsage(a,'customers','commerce-checkout:'+cart.id,1,'commerce_checkout');}
 const payment=await createPaymentRequest(a,{document_id:sale.invoice_id},'commerce-checkout:'+cart.id);
 if(!payment.data.checkout_url)fail(409,'Checkout payment capability requires merchant review');
 return {...sale,payment_request_id:payment.data.id,url:payment.data.checkout_url,expires_at:payment.data.expires_at};
}
