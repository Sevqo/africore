import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {dbGet,dbRun,dbTransaction} from '../db/adapter';
import {type Access,fail,audit} from '../platform/auth';
import {hash,now,seal,unseal} from '../platform/crypto';
import {requireServices,checkLimits,recordUsage} from '../marketplace/engine';
import {documentBalance,refreshDocument} from './ledger';
import {canonical} from './service';
import {sumMinor} from './money';

const minor=z.number().int().min(0).max(100_000_000_000);
const receiptInput=z.object({sale_id:z.string().uuid(),session_id:z.string().uuid(),amount_minor:minor.refine(n=>n>0),tendered_minor:minor}).strict().refine(d=>d.tendered_minor>=d.amount_minor,'Tendered cash is below the applied receipt');
const returnInput=z.object({sale_id:z.string().uuid(),session_id:z.string().uuid(),original_receipt_id:z.string().uuid(),amount_minor:minor.refine(n=>n>0),reason:z.string().trim().min(8).max(1000)}).strict();
export const cashFactContext=(a:Access,id:string)=>JSON.stringify(['cash-movement',a.org,a.environment,id]);

/** Shared Finance custody for POS cash. The caller supplies its current
 * register/cashier authorization, repeated inside the workspace lock and on
 * replay. No browser assertion becomes a provider event or bank transaction. */
export async function recordPOSCashReceipt(a:Access,input:unknown,authorizeNow:()=>Promise<unknown>){
 const d=receiptInput.parse(input);
 return dbTransaction(async()=>{
  await dbRun('UPDATE ac_organizations SET name=name WHERE id=?',[a.org]);
  const member=await dbGet('SELECT w.kind,w.status FROM ac_memberships m JOIN ac_workspaces w ON w.id=m.org_id WHERE m.org_id=? AND m.user_id=?',[a.org,a.actor]);
  if(a.api||!member||member.kind!=='business'||member.status!=='active')fail(403,'A current human Business member must record physical cash');
  await authorizeNow();for(const service of ['invoicing','cash_flow'])await requireServices(a,[service]);
  const link=await dbGet('SELECT invoice_id FROM ac_pos_sale_links WHERE sale_id=? AND session_id=? AND org_id=? AND environment=?',[d.sale_id,d.session_id,a.org,a.environment]);
  if(!link)fail(404,'Canonical POS invoice link not found');
  const fingerprint=hash(canonical(d)),old=await dbGet("SELECT id,data FROM ac_cash_movements WHERE org_id=? AND environment=? AND source_type='pos_sale' AND source_id=? AND kind='receipt'",[a.org,a.environment,d.sale_id]);
  if(old){const data=JSON.parse(unseal(old.data,cashFactContext(a,old.id)));if(data.input_fingerprint!==fingerprint)fail(409,'This sale already has a different recorded cash receipt');return {receipt_id:old.id};}
  const session=await dbGet("SELECT session_id FROM ac_pos_sessions WHERE session_id=? AND org_id=? AND environment=? AND status='open'",[d.session_id,a.org,a.environment]);if(!session)fail(409,'Cash must be recorded in an open register session');
  const invoice=await documentBalance(a,link.invoice_id);
  if(invoice.kind!=='invoices'||!['issued','partially_paid'].includes(invoice.status)||d.amount_minor>invoice.outstanding_minor)fail(409,'Recorded cash exceeds the collectible invoice balance');
  const {all}=await import('../operations/store');
  if((await all(a,'protected_sales')).some(s=>[invoice.id,invoice.order_id].filter(Boolean).includes(s.order_id)&&!['cancelled','expired'].includes(s.state)))fail(409,'Use the protected-payment workflow for this order');
  await checkLimits(a,'cash_flow',1);
  const id=randomUUID(),at=now(),data={input_fingerprint:fingerprint,tendered_minor:d.tendered_minor,change_minor:d.tendered_minor-d.amount_minor,assurance:'merchant_observed_physical_cash',recorded_by:a.actor};
  await dbRun("INSERT INTO ac_cash_movements(id,org_id,environment,document_id,amount_minor,currency,kind,related_receipt_id,source_type,source_id,session_id,occurred_at,actor,data,created_at) VALUES (?,?,?,?,?,?,'receipt',NULL,'pos_sale',?,?,?,?,?,?)",[id,a.org,a.environment,invoice.id,d.amount_minor,invoice.currency,d.sale_id,d.session_id,at,a.actor,seal(JSON.stringify(data),cashFactContext(a,id),'2'),at]);
  await refreshDocument(a,invoice.id);
  await checkLimits(a,'cash_flow',1);await recordUsage(a,'cash_flow','cash-receipt:'+id,1,'merchant_observed_cash_receipt');await audit(a.org,a.actor,'cash.receipt.recorded',id);
  return {receipt_id:id};
 });
}

/** Record physical cash returned; do not execute a provider refund, return
 * stock, approve an invoice credit or post accounting entries. */
export async function recordPOSCashReturn(a:Access,input:unknown,authorizeNow:()=>Promise<unknown>){
 const d=returnInput.parse(input);
 return dbTransaction(async()=>{
  await dbRun('UPDATE ac_organizations SET name=name WHERE id=?',[a.org]);
  const member=await dbGet('SELECT w.kind,w.status FROM ac_memberships m JOIN ac_workspaces w ON w.id=m.org_id WHERE m.org_id=? AND m.user_id=?',[a.org,a.actor]);
  if(a.api||!member||member.kind!=='business'||member.status!=='active')fail(403,'A current human register manager must record a cash return');
  await authorizeNow();for(const service of ['invoicing','cash_flow'])await requireServices(a,[service]);
  const original=await dbGet("SELECT m.id,m.document_id,m.amount_minor,m.currency,l.register_id FROM ac_cash_movements m JOIN ac_pos_sale_links l ON l.sale_id=m.source_id AND l.org_id=m.org_id AND l.environment=m.environment AND l.invoice_id=m.document_id WHERE m.id=? AND m.source_type='pos_sale' AND m.kind='receipt' AND l.sale_id=? AND m.org_id=? AND m.environment=?",[d.original_receipt_id,d.sale_id,a.org,a.environment]);
  if(!original)fail(404,'Original recorded cash receipt not found for this sale');
  const session=await dbGet("SELECT register_id FROM ac_pos_sessions WHERE session_id=? AND org_id=? AND environment=? AND status='open'",[d.session_id,a.org,a.environment]);if(!session||session.register_id!==original.register_id)fail(409,'Return cash through an open session of the original register');
  const prior=await dbGet("SELECT COALESCE(SUM(amount_minor),0) AS amount_minor FROM ac_cash_movements WHERE related_receipt_id=? AND org_id=? AND environment=? AND kind='return'",[original.id,a.org,a.environment]);
  if(d.amount_minor>sumMinor([original.amount_minor,prior.amount_minor]))fail(409,'Cash return exceeds the remaining original receipt');
  const invoice=await documentBalance(a,original.document_id);
  if(invoice.outstanding_minor!==0||invoice.recorded_cash_paid_minor<d.amount_minor||invoice.currency!==original.currency)fail(409,'Resolve the current payment balance and any earlier invoice correction before recording a cash return');
  const pending=await dbGet("SELECT p.id FROM ac_payment_attempts p JOIN ac_requests r ON r.id=p.request_id AND r.org_id=p.org_id AND r.environment=p.environment WHERE r.document_id=? AND r.org_id=? AND r.environment=? AND p.status IN ('initiating','pending','unknown') LIMIT 1",[invoice.id,a.org,a.environment]);
  if(pending)fail(409,'Resolve the outstanding provider attempt before recording cash returned');
  await checkLimits(a,'cash_flow',1);
  const id=randomUUID(),at=now(),data={reason:d.reason,assurance:'merchant_observed_physical_cash_return',recorded_by:a.actor};
  await dbRun("INSERT INTO ac_cash_movements(id,org_id,environment,document_id,amount_minor,currency,kind,related_receipt_id,source_type,source_id,session_id,occurred_at,actor,data,created_at) VALUES (?,?,?,?,?,?,'return',?,'pos_cash_return',?,?,?,?,?,?)",[id,a.org,a.environment,invoice.id,-d.amount_minor,original.currency,original.id,id,d.session_id,at,a.actor,seal(JSON.stringify(data),cashFactContext(a,id),'2'),at]);
  await refreshDocument(a,invoice.id);
  await dbRun("UPDATE ac_requests SET status='cancelled' WHERE document_id=? AND org_id=? AND environment=? AND status IN ('pending','failed')",[invoice.id,a.org,a.environment]);
  await checkLimits(a,'cash_flow',1);await recordUsage(a,'cash_flow','cash-return:'+id,1,'merchant_observed_cash_return');await audit(a.org,a.actor,'cash.return.recorded',id);
  return {return_id:id};
 });
}
