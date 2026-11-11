import {dbAll} from '../db/adapter';
import {documentBalance} from './ledger';
import {now} from '../platform/crypto';

/** Public capability projection: only the linked request and its document. */
export async function checkoutSummary(request:any){
 const document=await documentBalance({org:request.org_id,environment:request.environment,actor:'checkout',role:'viewer',api:false},request.document_id);
 const open=['pending','failed'].includes(request.status);
 const documentOpen=['issued','partially_paid','awaiting_payment'].includes(document.status)&&document.outstanding_minor>0;
 const expired=request.expires_at<now();
 const status=open&&!documentOpen&&document.outstanding_minor===0?document.status:open&&expired?'expired':request.status;
 const receipts=await dbAll("SELECT e.id,e.status,e.amount_minor,e.currency,COALESCE(d.occurred_at,e.created_at) AS occurred_at,d.related_event_id FROM ac_events e LEFT JOIN ac_payment_event_details d ON d.event_id=e.id WHERE e.request_id=? AND e.org_id=? AND e.environment=? AND e.status IN ('succeeded','reversed','refunded') ORDER BY e.created_at DESC,e.id DESC LIMIT 20",[request.id,request.org_id,request.environment]);
 const amountFits=Number(request.amount_minor)<=document.outstanding_minor;
 return {status,request_status:request.status,document_status:document.status,outstanding_minor:document.outstanding_minor,can_pay:open&&documentOpen&&amountFits&&!expired,payment_unavailable_reason:open&&documentOpen&&!amountFits?'request_exceeds_remaining_balance':null,receipts:receipts.map(r=>({id:r.id,status:r.status,amount_minor:Number(r.amount_minor),currency:r.currency,occurred_at:r.occurred_at,effect:r.status==='succeeded'?'recorded_confirmation':r.related_event_id?'applied_return':'requires_review'})),receipt_coverage:'Latest 20 confirmation/return records for this payment request only. An unlinked return report does not undo a settlement.'};
}
