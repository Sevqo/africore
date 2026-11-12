import {dbRun,dbGet} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {now} from '../platform/crypto';
import {record,update as updateRecord} from '../platform/payments';
import {operation,update} from '../erp/store';
import {createChannelSale} from '../operations/channel-sales';
import {recordPOSCashReceipt} from '../finance/cash-ledger';
import {createPaymentRequest} from '../finance/payment-requests';
import {confirmSaleInput,handoverInput} from './contracts';
import {documentBalance} from '../finance/ledger';
import {calculateTender,calculateDrawer} from './settlement';
import {posSale,currentSaleQuote} from './quotes';
import {sessionAccess,drawer} from './sessions';

/** A confirmed local sale always maps to the canonical order/invoice. Payment
 * observation and physical handover are independent, explicitly authorized facts. */
export async function confirmPOSSale(a:Access,id:string,input:unknown,key:string){
 const d=confirmSaleInput.parse(input);
 await operation(a,'pos.sale.confirm:'+id,key,d,async()=>{await posSale(a,id,true);},async()=>{
  if(a.environment!=='sandbox')fail(409,'POS checkout is currently qualified for sandbox evaluation only');
  const sale=await posSale(a,id,true);
  if(sale.status!=='draft'||sale.version!==d.expected_version)fail(409,'Sale draft changed or was already confirmed; reload its receipt');
  const quote=await currentSaleQuote(a,id);
  if(quote.quote_hash!==d.quote_hash)fail(409,'The current product, stock or register quote changed; review it again');
  const {session,register}=await sessionAccess(a,sale.parent_id!,{write:true});
  const tender=calculateTender({outstanding_minor:quote.amounts.total_minor,intent:d.payment_intent,cash_minor:d.cash_amount_minor,tendered_minor:d.tendered_cash_minor,allow_cash:register.data.allow_cash,allow_electronic:register.data.electronic_method==='sandbox_simulator',allow_pending:register.data.allow_pending_orders});
  if(d.handover_now&&d.payment_intent!=='cash')fail(409,'Await confirmed payment before an electronic or pending sale handover');
  if(tender.cash_applied_minor){const current=await drawer(a,session.id);calculateDrawer(current.expected_minor,[{kind:'receipt',amount_minor:tender.cash_applied_minor}]);}
  const provenance={channel:'pos',register_id:register.id,session_id:session.id,sale_id:sale.id,policy_owner:register.data.policy_authorized_by,requested_by:a.actor,timezone:register.data.timezone,document_date_basis:'register_calendar'};
  const canonical=await createChannelSale(a,{document:quote.document,expected_total_minor:quote.amounts.total_minor,expected_tax_minor:quote.amounts.tax_minor,source_field:'pos_source',provenance,usage_key:'pos-sale:'+sale.id,usage_source:'pos_sale'});
  const at=now();await dbRun('INSERT INTO ac_pos_sale_links(sale_id,org_id,environment,register_id,session_id,order_id,invoice_id,created_at) VALUES (?,?,?,?,?,?,?,?)',[sale.id,a.org,a.environment,register.id,session.id,canonical.order_id,canonical.invoice_id,at]);
  const cash=tender.cash_applied_minor?await recordPOSCashReceipt(a,{sale_id:sale.id,session_id:session.id,amount_minor:tender.cash_applied_minor,tendered_minor:tender.tendered_cash_minor},()=>sessionAccess(a,session.id,{write:true})):null;
  let checkout:null|{request_id:string;url:string;expires_at:string}=null;
  if(tender.electronic_request_minor){
   const payment=await createPaymentRequest(a,{document_id:canonical.invoice_id,amount_minor:tender.electronic_request_minor},'pos-sale:'+sale.id);
   if(!payment.data.checkout_url)fail(409,'The payment capability requires review; no second request will be created');
   checkout={request_id:payment.data.id,url:payment.data.checkout_url,expires_at:payment.data.expires_at};
  }
  if(d.handover_now){const order=await record(a,canonical.order_id,'orders');await updateRecord(a,order.id,{...order,fulfillment_status:'fulfilled',pos_handover:{session_id:session.id,actor:a.actor,recorded_at:at}});}
  await update(a,session,{...session.data,last_sale_id:sale.id},{},'sale_confirmed');
  const profile=await dbGet('SELECT u.email,p.display_name FROM ac_users u LEFT JOIN ac_profiles p ON p.user_id=u.id WHERE u.id=?',[a.actor]);
  await update(a,sale,{...sale.data,confirmed_quote:quote,confirmed_at:at,confirmed_by:a.actor,confirmed_by_label:profile?.display_name||profile?.email||a.actor,...canonical,tender,cash_receipt_id:cash?.receipt_id||null,checkout,handover:d.handover_now?'recorded':'not_recorded'},{status:'confirmed'},'confirmed');
  // Checkout capabilities remain in encrypted, currently scoped sale custody;
  // the permanent idempotency receipt contains only the sale identity.
  return {sale_id:id};
 });return posSale(a,id);
}

export async function handoverPOSSale(a:Access,id:string,input:unknown,key:string){
 const d=handoverInput.parse(input);
 await operation(a,'pos.sale.handover:'+id,key,d,async()=>{await posSale(a,id,true);await sessionAccess(a,d.session_id,{write:true});},async()=>{
  const sale=await posSale(a,id,true),{session}=await sessionAccess(a,d.session_id,{write:true});
  if(sale.root_id!==session.root_id)fail(404,'Handover session does not belong to this register');
  if(sale.status!=='confirmed'||sale.version!==d.expected_sale_version||sale.data.handover==='recorded')fail(409,'Sale changed or handover was already recorded; reload its receipt');
  if(session.status!=='open'||session.version!==d.expected_session_version)fail(409,'The open handover session changed; reload');
  const invoice=await documentBalance(a,sale.data.invoice_id);
  if(invoice.outstanding_minor!==0||invoice.credited_minor!==0||invoice.paid_minor!==invoice.total_minor)fail(409,'This sale requires full recorded payment without pending credits before POS handover');
  const order=await record(a,sale.data.order_id,'orders');
  if(order.fulfillment_status!=='unfulfilled'||order.status==='cancelled')fail(409,'Review this order through its existing fulfillment workflow');
  const handover={session_id:session.id,actor:a.actor,recorded_at:now()};
  await updateRecord(a,order.id,{...order,fulfillment_status:'fulfilled',pos_handover:handover});
  await update(a,session,{...session.data,last_handover_sale_id:sale.id},{},'handover_recorded');
  await update(a,sale,{...sale.data,handover:'recorded',handover_observation:handover},{},'handover_recorded');
  return {sale_id:id};
 });return posSale(a,id);
}
