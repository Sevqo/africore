import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {configureTestEnv,productFixtureBody} from './helpers';
configureTestEnv('pos-registers');
import {migrate,dbGet,dbRun,closeDb} from '../db';
import {createApp} from '../app';

import {migratePOS} from '../pos/schema';
import {saveRegister,registerAccess,registers,reauthorizeRegister} from '../pos/registers';
import {openSession,adjustDrawer,closeSession,drawer} from '../pos/sessions';
import type {Access} from '../platform/auth';
import {createProduct,editProduct,createWarehouse,createLocation,postMovement,locationBalance} from '../inventory/service';
import {quotePOSDraft,savePOSDraft,currentSaleQuote} from '../pos/quotes';
import {confirmPOSSale,handoverPOSSale} from '../pos/sales';
import {documentBalance} from '../finance/ledger';
import {record,processProviderResult} from '../platform/payments';
import {returnPOSCash} from '../pos/returns';
import {createPaymentRequest} from '../finance/payment-requests';
import {creditInvoice,allocatePayment} from '../finance/service';
import {checkoutSummary} from '../finance/checkout';
import {accountingSource,prepareAccountingSource} from '../erp/accounting-sources';
import {setupAccounting,createPeriod,requestJournalReview,postJournalEntry} from '../erp/accounting';
import {accountingSourceList} from '../erp/accounting-source-list';
import {financialSnapshot} from '../operations/intelligence';
import {returnPOSStock,stockReturnChoices} from '../pos/stock';
import {posDailyReport} from '../pos/report';

let server:any,base:string,cookie='',cashierCookie='',org:string,actor:string,cashier:string,customer:string,registerId:string;
const access=():Access=>({org,actor,role:'owner',environment:'sandbox',api:false});
const cashierAccess=():Access=>({...access(),actor:cashier,role:'viewer'});
const key=()=>randomUUID();
async function api(path:string,body:any,session=cookie,method='POST'){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:session,'Idempotency-Key':key()},body:body===undefined?undefined:JSON.stringify(productFixtureBody(path,method,body))});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]||''};}
const configuration=()=>({expected_version:0,name:'Fictional test register',default_customer_id:customer,cashier_ids:[cashier],acknowledge_automated_invoicing:true,acknowledge_recorded_cash:true});
before(async()=>{

 await migrate();await migratePOS();await migratePOS();
 server=createApp().listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 const owner=await api('/api/auth/signup',{email:key()+'@example.test',password:'Synthetic-register-owner-2026!'});assert.equal(owner.status,201);cookie=owner.cookie;actor=owner.data.id;
 const workspace=await api('/api/auth/workspaces',{kind:'business',name:'Synthetic POS fixture',country:'KE',currency:'KES',timezone:'Africa/Nairobi',display_name:'Fictional owner'});assert.equal(workspace.status,201);org=workspace.data.id;
 const contact=await api('/api/v1/organizations/'+org+'/records/customers',{name:'Fictional walk-in customer'});assert.equal(contact.status,201);customer=contact.data.id;
 const member=await api('/api/auth/signup',{email:key()+'@example.test',password:'Synthetic-register-cashier-2026!'},'');assert.equal(member.status,201);cashier=member.data.id;cashierCookie=member.cookie;
 await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'viewer')",[org,cashier]);
});
after(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));await closeDb();});

test('register configuration validates current canonical scope, assignments and Sales discount policy',async()=>{
 const a=access();
 await assert.rejects(saveRegister(a,null,{...configuration(),manager_discount_bps:2001},key()),/Sales policy/);
 await assert.rejects(saveRegister(a,null,{...configuration(),manager_ids:[cashier]},key()),/managers require/);
 await assert.rejects(saveRegister(a,null,{...configuration(),cashier_ids:[key()]},key()),/current members/);
 await assert.rejects(saveRegister(a,null,{...configuration(),default_customer_id:key()},key()),/not found/i);
 await assert.rejects(saveRegister(a,null,{...configuration(),warehouse_id:key()},key()),/warehouse/);
 await assert.rejects(saveRegister(a,null,{...configuration(),electronic_method:'daraja_sandbox'},key()),/qualification/);
 const idempotency=key(),r=await saveRegister(a,null,configuration(),idempotency);registerId=r.id;
 assert.equal((await saveRegister(a,null,configuration(),idempotency)).id,r.id);
 assert.equal((await registers(cashierAccess())).data.length,1);
 assert.equal((await registerAccess(cashierAccess(),r.id,{write:true})).manager,false);
 await assert.rejects(saveRegister(cashierAccess(),null,configuration(),key()),/owner or administrator/);
 await assert.rejects(registerAccess({...a,environment:'production'},r.id),/Activate|not found/);
 await assert.rejects(registerAccess({...a,api:true},r.id),/human/);
});

test('register policy and cashier grants are checked fresh before writes and idempotent replay',async()=>{
 const a=access(),input={expected_register_version:1,opening_cash_minor:1000,acknowledge_count:true};
 await dbRun("UPDATE ac_memberships SET role='viewer' WHERE org_id=? AND user_id=?",[org,actor]);
 try{await assert.rejects(openSession(cashierAccess(),registerId,input,key()),/policy authorization/);}finally{await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?",[org,actor]);}
 await dbRun("UPDATE ac_service_entitlements SET status='disabled' WHERE org_id=? AND environment='sandbox' AND service_id='invoicing'",[org]);
 try{await assert.rejects(saveRegister(a,registerId,{...configuration(),expected_version:1},key()),/Activate/);await assert.rejects(openSession(cashierAccess(),registerId,input,key()),/Activate/);}finally{await dbRun("UPDATE ac_service_entitlements SET status='active' WHERE org_id=? AND environment='sandbox' AND service_id='invoicing'",[org]);}
 await dbRun('DELETE FROM ac_memberships WHERE org_id=? AND user_id=?',[org,cashier]);
 try{await assert.rejects(registerAccess(cashierAccess(),registerId,{write:true}),/membership/);}finally{await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'viewer')",[org,cashier]);}
});

test('register sessions serialize opening, retain encrypted adjustments and close exact immutable counts',async()=>{
 const a=access(),opening={expected_register_version:1,opening_cash_minor:1000,acknowledge_count:true},openingKey=key();
 const opened=await openSession(cashierAccess(),registerId,opening,openingKey),id=opened.session.id;
 assert.equal(opened.expected_minor,1000);assert.equal((await openSession(cashierAccess(),registerId,opening,openingKey)).session.id,id);
 await dbRun('DELETE FROM ac_memberships WHERE org_id=? AND user_id=?',[org,cashier]);
 try{await assert.rejects(openSession(cashierAccess(),registerId,opening,openingKey),/membership/);}finally{await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'viewer')",[org,cashier]);}
 await assert.rejects(openSession(a,registerId,opening,key()),/already has an open/);
 await assert.rejects(saveRegister(a,registerId,{...configuration(),expected_version:1},key()),/Close the current session/);
 const adjustment={expected_session_version:1,direction:'in',amount_minor:500,reason:'Fictional replenishment',acknowledge_physical_cash:true};
 await assert.rejects(adjustDrawer(cashierAccess(),id,adjustment,key()),/manager authority/);
 const adjustmentKey=key(),adjusted=await adjustDrawer(a,id,adjustment,adjustmentKey);assert.equal(adjusted.expected_minor,1500);assert.equal(adjusted.session.version,2);
 assert.equal((await adjustDrawer(a,id,adjustment,adjustmentKey)).expected_minor,1500);
 const row=await dbGet('SELECT id,data FROM ac_pos_drawer_adjustments WHERE session_id=?',[id]);assert.ok(!row.data.includes(adjustment.reason));
 await assert.rejects(dbRun('UPDATE ac_pos_drawer_adjustments SET amount_minor=1 WHERE id=?',[row.id]),/immutable/);
 await assert.rejects(adjustDrawer(a,id,{...adjustment,expected_session_version:1},key()),/changed/);
 await assert.rejects(closeSession(a,id,{expected_version:2,counted_cash_minor:1400,acknowledge_close:true},key()),/Explain/);
 const closing={expected_version:2,counted_cash_minor:1400,variance_reason:'Fictional count discrepancy',acknowledge_close:true},closingKey=key();
 const closed=await closeSession(a,id,closing,closingKey);assert.equal(closed.session.status,'closed');assert.equal(closed.closure.variance_minor,-100);assert.equal(closed.closure.expected_minor,1500);
 assert.equal((await closeSession(a,id,closing,closingKey)).closure.counted_minor,1400);
 await assert.rejects(adjustDrawer(a,id,{...adjustment,expected_session_version:3},key()),/open session changed/);
 await assert.rejects(dbRun("UPDATE ac_pos_sessions SET status='open' WHERE session_id=?",[id]),/immutable/);
 await assert.rejects(dbRun('DELETE FROM ac_pos_session_closures WHERE session_id=?',[id]),/immutable/);
 assert.equal((await drawer(cashierAccess(),id)).closure.counted_minor,1400);
 await assert.rejects(saveRegister(a,registerId,{...configuration(),expected_version:1,currency:'USD'},key()),/Currency and timezone/);
 const simultaneous=await Promise.allSettled([openSession(cashierAccess(),registerId,opening,key()),openSession(a,registerId,opening,key())]);
 assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1);assert.equal(simultaneous.filter(r=>r.status==='rejected').length,1);
});

test('POS drafts price current canonical products, enforce cashier discounts and create no financial or stock records',async()=>{
 const a=access(),r=await saveRegister(a,null,{...configuration(),name:'Fictional quoted register',tax_bps:1600,cashier_discount_bps:1000},key());
 const session=(await openSession(cashierAccess(),r.id,{expected_register_version:1,opening_cash_minor:0,acknowledge_count:true},key())).session;
 const productData={sku:'POS-QUOTE-'+key(),name:'Fictional counter product',sale_price_minor:12000,currency:'KES',track_inventory:false};
 const p=await createProduct(a,productData,key()),input={expected_session_version:session.version,items:[{product_id:p.id,quantity_milli:2000}],discount_minor:1200,notes:'Fictional quote memo'};
 const count=async()=>Number((await dbGet("SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND environment='sandbox' AND kind IN ('orders','invoices')",[org])).n),beforeCount=await count();
 const quote=await quotePOSDraft(cashierAccess(),session.id,input);assert.equal(quote.amounts.subtotal_minor,24000);assert.equal(quote.amounts.tax_minor,3648);assert.equal(quote.amounts.total_minor,26448);
 await assert.rejects(quotePOSDraft(cashierAccess(),session.id,{...input,discount_minor:2401}),/cashier/);
 await assert.rejects(quotePOSDraft(cashierAccess(),session.id,{...input,unit_price_minor:1}),/Unrecognized|unrecognized/);
 await assert.rejects(quotePOSDraft(cashierAccess(),session.id,{...input,items:[{product_id:p.id,quantity_milli:1500}]}),/whole units/);
 const draftKey=key(),sale=await savePOSDraft(cashierAccess(),session.id,null,input,draftKey);
 assert.equal((await savePOSDraft(cashierAccess(),session.id,null,input,draftKey)).id,sale.id);
 const first=await currentSaleQuote(cashierAccess(),sale.id);assert.equal(first.sale_id,sale.id);assert.equal(first.sale_version,1);
 const stored=await dbGet('SELECT data FROM ac_erp_objects WHERE id=?',[sale.id]);assert.ok(!stored.data.includes(input.notes));
 await editProduct(a,p.id,{expected_version:1,product:{...productData,sale_price_minor:13000}},key());
 const repriced=await currentSaleQuote(cashierAccess(),sale.id);assert.equal(repriced.amounts.total_minor,28768);assert.notEqual(repriced.quote_hash,first.quote_hash);
 const tracked=await createProduct(a,{...productData,sku:'TRACKED-'+key(),track_inventory:true},key());
 await assert.rejects(quotePOSDraft(cashierAccess(),session.id,{...input,items:[{product_id:tracked.id,quantity_milli:1000}]}),/configured warehouse/);
 assert.equal(await count(),beforeCount);
 await closeSession(a,session.id,{expected_version:1,counted_cash_minor:0,acknowledge_close:true},key());
 await assert.rejects(currentSaleQuote(cashierAccess(),sale.id),/open register session changed/);
});

test('POS cash confirms one canonical sale with exact change and works with Pay deactivated',async()=>{
 const a=access(),r=await saveRegister(a,null,{...configuration(),name:'Fictional cash register'},key());
 const session=(await openSession(cashierAccess(),r.id,{expected_register_version:1,opening_cash_minor:1000,acknowledge_count:true},key())).session;
 const p=await createProduct(a,{sku:'CASH-'+key(),name:'Fictional cash product',sale_price_minor:1200,track_inventory:false},key());
 const draft=await savePOSDraft(cashierAccess(),session.id,null,{expected_session_version:1,items:[{product_id:p.id,quantity_milli:2000}]},key());
 const quote=await currentSaleQuote(cashierAccess(),draft.id),input={expected_version:draft.version,quote_hash:quote.quote_hash,payment_intent:'cash',cash_amount_minor:2400,tendered_cash_minor:3000,acknowledge_recorded_cash:true,handover_now:true,acknowledge_handover:true},confirmationKey=key();
 const evidenceBefore=Number((await dbGet('SELECT COUNT(*) AS n FROM ac_events WHERE org_id=?',[org])).n);
 await dbRun("UPDATE ac_service_entitlements SET status='disabled' WHERE org_id=? AND environment='sandbox' AND service_id='payments'",[org]);
 try{
  const sale=await confirmPOSSale(cashierAccess(),draft.id,input,confirmationKey);assert.equal(sale.status,'confirmed');assert.equal(sale.data.tender.change_minor,600);
  const balance=await documentBalance(a,sale.data.invoice_id);assert.equal(balance.outstanding_minor,0);assert.equal(balance.recorded_cash_paid_minor,2400);assert.equal(balance.provider_paid_minor,0);
  assert.equal((await record(a,sale.data.order_id,'orders')).fulfillment_status,'fulfilled');
  assert.equal((await drawer(cashierAccess(),session.id)).expected_minor,3400);
  assert.equal((await confirmPOSSale(cashierAccess(),draft.id,input,confirmationKey)).id,sale.id);
  await assert.rejects(confirmPOSSale(cashierAccess(),draft.id,input,key()),/already confirmed/);
  assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_cash_movements WHERE source_id=?',[sale.id])).n),1);
  assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_events WHERE org_id=?',[org])).n),evidenceBefore);
  const report=await posDailyReport(cashierAccess(),r.id);
  assert.equal(report.sales.total_count,1);assert.equal(report.sales.gross_invoice_minor,2400);
  assert.equal(report.sales.recorded_cash_retained_minor,2400);assert.equal(report.sales.simulated_electronic_paid_minor,0);
  assert.equal(report.cash_activity.received_minor,2400);assert.equal(report.shifts.currently_open,1);
  assert.equal(report.top_products[0].quantity_milli,2000);assert.equal(report.top_products[0].line_subtotal_minor,2400);
  const yesterday=new Date(Date.now()-3*86400000).toISOString().slice(0,10);
  assert.equal((await posDailyReport(a,r.id,{date:yesterday})).sales.total_count,0);
  await assert.rejects(posDailyReport({...a,api:true},r.id),/human/);
  await assert.rejects(posDailyReport({...a,environment:'production'},r.id),/Activate|not found/);
  await closeSession(a,session.id,{expected_version:2,counted_cash_minor:3400,acknowledge_close:true},key());
  const ownerShift=(await openSession(a,r.id,{expected_register_version:1,opening_cash_minor:0,acknowledge_count:true},key())).session;
  const ownerDraft=await savePOSDraft(a,ownerShift.id,null,{expected_session_version:1,items:[{product_id:p.id,quantity_milli:1000}]},key()),ownerQuote=await currentSaleQuote(a,ownerDraft.id);
  await confirmPOSSale(a,ownerDraft.id,{expected_version:1,quote_hash:ownerQuote.quote_hash,payment_intent:'cash',cash_amount_minor:1200,tendered_cash_minor:1200,acknowledge_recorded_cash:true},key());
  assert.equal((await posDailyReport(a,r.id)).sales.gross_invoice_minor,3600);
  assert.equal((await posDailyReport(cashierAccess(),r.id)).sales.gross_invoice_minor,2400);
  assert.equal((await posDailyReport(cashierAccess(),r.id)).shifts.currently_open,0);
  await assert.rejects(dbRun('UPDATE ac_cash_movements SET amount_minor=1 WHERE source_id=?',[sale.id]),/immutable/);
 }finally{await dbRun("UPDATE ac_service_entitlements SET status='active' WHERE org_id=? AND environment='sandbox' AND service_id='payments'",[org]);}
});

test('POS split tender collects only the remainder and provider confirmation never changes physical cash',async()=>{
 const a=access(),r=await saveRegister(a,null,{...configuration(),name:'Fictional split register',electronic_method:'sandbox_simulator'},key());
 const session=(await openSession(cashierAccess(),r.id,{expected_register_version:1,opening_cash_minor:0,acknowledge_count:true},key())).session;
 const p=await createProduct(a,{sku:'SPLIT-'+key(),name:'Fictional split product',sale_price_minor:2400,track_inventory:false},key());
 const draft=await savePOSDraft(cashierAccess(),session.id,null,{expected_session_version:1,items:[{product_id:p.id,quantity_milli:1000}]},key()),quote=await currentSaleQuote(cashierAccess(),draft.id);
 const input={expected_version:1,quote_hash:quote.quote_hash,payment_intent:'split',cash_amount_minor:1000,tendered_cash_minor:1000,acknowledge_recorded_cash:true,acknowledge_sandbox_electronic:true};
 await assert.rejects(confirmPOSSale(cashierAccess(),draft.id,{...input,handover_now:true,acknowledge_handover:true},key()),/Await confirmed payment/);
 const sale=await confirmPOSSale(cashierAccess(),draft.id,input,key()),request=await dbGet('SELECT amount_minor FROM ac_requests WHERE id=?',[sale.data.checkout.request_id]);assert.equal(Number(request.amount_minor),1400);
 let invoice=await documentBalance(a,sale.data.invoice_id);assert.equal(invoice.recorded_cash_paid_minor,1000);assert.equal(invoice.outstanding_minor,1400);
 const handover={expected_sale_version:sale.version,session_id:session.id,expected_session_version:2,acknowledge_handover:true};
 await assert.rejects(handoverPOSSale(cashierAccess(),sale.id,handover,key()),/full recorded payment/);
 await processProviderResult(sale.data.checkout.request_id,{reference:'synthetic-pos-split-'+key(),status:'succeeded',amount_minor:1400,currency:'KES'});
 invoice=await documentBalance(a,sale.data.invoice_id);assert.equal(invoice.provider_paid_minor,1400);assert.equal(invoice.recorded_cash_paid_minor,1000);assert.equal(invoice.outstanding_minor,0);
 assert.equal((await drawer(cashierAccess(),session.id)).expected_minor,1000);assert.equal((await record(a,sale.data.order_id,'orders')).fulfillment_status,'unfulfilled');
 const handoverKey=key(),fulfilled=await handoverPOSSale(cashierAccess(),sale.id,handover,handoverKey);assert.equal(fulfilled.data.handover,'recorded');
 assert.equal((await record(a,sale.data.order_id,'orders')).fulfillment_status,'fulfilled');
 assert.equal((await handoverPOSSale(cashierAccess(),sale.id,handover,handoverKey)).version,fulfilled.version);
 await assert.rejects(handoverPOSSale(cashierAccess(),sale.id,handover,key()),/already recorded/);
 const returned=await returnPOSCash(a,sale.id,{expected_sale_version:fulfilled.version,return_session_id:session.id,expected_session_version:3,original_receipt_id:sale.data.cash_receipt_id,amount_minor:500,reason:'Fictional partial cash returned',acknowledge_physical_cash_return:true},key());
 assert.equal(returned.data.handover,'recorded');assert.equal((await drawer(cashierAccess(),session.id)).expected_minor,500);
 const checkout=await checkoutSummary(await dbGet('SELECT * FROM ac_requests WHERE id=?',[sale.data.checkout.request_id]));assert.equal(checkout.status,'correction_pending');assert.equal(checkout.can_pay,false);
 const late=await processProviderResult(sale.data.checkout.request_id,{reference:'synthetic-late-held-'+key(),status:'succeeded',amount_minor:500,currency:'KES'});assert.equal(late.reconciliation,'cash_return_invoice_review');
 await assert.rejects(allocatePayment(a,late.event_id,{allocations:[{document_id:sale.data.invoice_id,amount_minor:500}],reason:'Fictional attempt to allocate a held late payment'},key()),/Review the recorded cash return/);
 assert.equal((await documentBalance(a,sale.data.invoice_id)).outstanding_minor,500);
 await assert.rejects(createPaymentRequest(a,{document_id:sale.data.invoice_id},key()),/reviewed invoice correction/);
 assert.equal((await documentBalance(a,sale.data.invoice_id)).provider_paid_minor,1400);
 await creditInvoice(a,sale.data.invoice_id,{amount_minor:500,reason:'Fictional reviewed cash-return correction',issued_on:(await record(a,sale.data.invoice_id,'invoices')).issue_date},key());
 assert.equal((await documentBalance(a,sale.data.invoice_id)).collection_hold,null);assert.equal((await documentBalance(a,sale.data.invoice_id)).outstanding_minor,0);
});

test('POS competing sales reserve and dispatch the last exact-location unit once',async()=>{
 const a=access(),w=await createWarehouse(a,{code:'POS-'+key(),name:'Fictional POS warehouse'},key()),location=await createLocation(a,w.id,{code:'COUNTER',name:'Fictional counter'},key()),other=await createLocation(a,w.id,{code:'BACK',name:'Fictional back room'},key());
 const p=await createProduct(a,{sku:'LAST-'+key(),name:'Fictional last counter unit',sale_price_minor:5000,track_inventory:true},key());
 for(const [location_id,quantity_milli] of [[location.id,1000],[other.id,9000]] as const)await postMovement(a,{product_id:p.id,warehouse_id:w.id,location_id,quantity_milli,kind:'receipt',reason:'Fictional local stock fixture'},key());
 const sales=[];
 for(let i=0;i<2;i++){
  const r=await saveRegister(a,null,{...configuration(),name:'Fictional competing register '+i,warehouse_id:w.id,location_id:location.id},key()),session=(await openSession(cashierAccess(),r.id,{expected_register_version:1,opening_cash_minor:0,acknowledge_count:true},key())).session;
  await assert.rejects(quotePOSDraft(cashierAccess(),session.id,{expected_session_version:1,items:[{product_id:p.id,quantity_milli:2000}]}),/stock/);
  const sale=await savePOSDraft(cashierAccess(),session.id,null,{expected_session_version:1,items:[{product_id:p.id,quantity_milli:1000}]},key()),quote=await currentSaleQuote(cashierAccess(),sale.id);
  sales.push({sale,input:{expected_version:1,quote_hash:quote.quote_hash,payment_intent:'cash',cash_amount_minor:5000,tendered_cash_minor:5000,acknowledge_recorded_cash:true,handover_now:true,acknowledge_handover:true}});
 }
 const results=await Promise.allSettled(sales.map(s=>confirmPOSSale(cashierAccess(),s.sale.id,s.input,key())));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.equal((await locationBalance(a,p.id,w.id,location.id)).on_hand_milli,0);assert.equal((await locationBalance(a,p.id,w.id,other.id)).on_hand_milli,9000);
 const report=await posDailyReport(cashierAccess(),sales[0].sale.root_id);
 assert.equal(report.stock.available,true);assert.equal(report.stock.data.find((item:any)=>item.id===p.id)?.available_milli,0);
 assert.equal(report.stock.data.find((item:any)=>item.id===p.id)?.purchase_cost_minor,undefined);
 assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac_stock_movements WHERE org_id=? AND product_id=? AND kind='dispatch'",[org,p.id])).n),1);
});

test('a recorded-cash service cap rolls back the complete canonical POS conversion',async()=>{
 const a=access(),w=await createWarehouse(a,{code:'CAP-'+key(),name:'Fictional capped warehouse'},key()),p=await createProduct(a,{sku:'CAP-'+key(),name:'Fictional capped sale',sale_price_minor:1000,track_inventory:true},key());
 await postMovement(a,{product_id:p.id,warehouse_id:w.id,quantity_milli:1000,kind:'receipt',reason:'Fictional cap rollback stock'},key());
 const r=await saveRegister(a,null,{...configuration(),name:'Fictional capped register',warehouse_id:w.id},key()),session=(await openSession(cashierAccess(),r.id,{expected_register_version:1,opening_cash_minor:0,acknowledge_count:true},key())).session;
 const draft=await savePOSDraft(cashierAccess(),session.id,null,{expected_session_version:1,items:[{product_id:p.id,quantity_milli:1000}]},key()),quote=await currentSaleQuote(cashierAccess(),draft.id);
 const recordCount=async()=>Number((await dbGet("SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND kind IN ('orders','invoices')",[org])).n),before=await recordCount();
 const limitPath='/api/v1/organizations/'+org+'/usage/limits/cash_flow';assert.equal((await api(limitPath,{monthly_budget_minor:null,quantity_limit:0,hard_stop:true,thresholds:[100]},cookie,'PUT')).status,200);
 try{
  await assert.rejects(confirmPOSSale(cashierAccess(),draft.id,{expected_version:1,quote_hash:quote.quote_hash,payment_intent:'cash',cash_amount_minor:1000,tendered_cash_minor:1000,acknowledge_recorded_cash:true},key()),(error:any)=>error.status===429);
  assert.equal(await recordCount(),before);assert.equal((await locationBalance(a,p.id,w.id,null)).available_milli,1000);
  assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_pos_sale_links WHERE sale_id=?',[draft.id])).n),0);
  assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_cash_movements WHERE source_id=?',[draft.id])).n),0);
  assert.equal((await drawer(cashierAccess(),session.id)).session.version,1);assert.equal((await drawer(cashierAccess(),session.id)).expected_minor,0);
 }finally{assert.equal((await api(limitPath,{monthly_budget_minor:null,quantity_limit:null,hard_stop:false,thresholds:[100]},cookie,'PUT')).status,200);}
});

test('manager cash returns bind the original receipt and preserve closed shift and invoice correction history',async()=>{
 const a=access(),r=await saveRegister(a,null,{...configuration(),name:'Fictional cash-return register'},key()),opened=await openSession(cashierAccess(),r.id,{expected_register_version:1,opening_cash_minor:5000,acknowledge_count:true},key()),session=opened.session;
 const p=await createProduct(a,{sku:'RETURN-'+key(),name:'Fictional returned purchase',sale_price_minor:1000,track_inventory:false},key()),draft=await savePOSDraft(cashierAccess(),session.id,null,{expected_session_version:1,items:[{product_id:p.id,quantity_milli:1000}]},key()),quote=await currentSaleQuote(cashierAccess(),draft.id);
 const sale=await confirmPOSSale(cashierAccess(),draft.id,{expected_version:1,quote_hash:quote.quote_hash,payment_intent:'cash',cash_amount_minor:1000,tendered_cash_minor:1000,acknowledge_recorded_cash:true},key());
 await closeSession(a,session.id,{expected_version:2,counted_cash_minor:6000,acknowledge_close:true},key());
 const returns=await openSession(a,r.id,{expected_register_version:1,opening_cash_minor:6000,acknowledge_count:true},key()),input={expected_sale_version:sale.version,return_session_id:returns.session.id,expected_session_version:1,original_receipt_id:sale.data.cash_receipt_id,amount_minor:500,reason:'Fictional physical cash returned',acknowledge_physical_cash_return:true};
 await assert.rejects(returnPOSCash(cashierAccess(),sale.id,input,key()),/manager authority/);
 await assert.rejects(returnPOSCash(a,sale.id,{...input,amount_minor:1500},key()),/remaining original receipt/);
 await assert.rejects(returnPOSCash(a,sale.id,{...input,original_receipt_id:key()},key()),/Original recorded cash receipt not found/);
 const returnKey=key(),returned=await returnPOSCash(a,sale.id,input,returnKey);assert.equal((await returnPOSCash(a,sale.id,input,returnKey)).version,returned.version);
 await assert.rejects(returnPOSCash(a,sale.id,input,key()),/Sale changed/);
 assert.equal((await drawer(a,returns.session.id)).expected_minor,5500);assert.equal((await drawer(a,session.id)).closure.expected_minor,6000);
 const balance=await documentBalance(a,sale.data.invoice_id);assert.equal(balance.recorded_cash_paid_minor,500);assert.equal(balance.cash_returned_minor,500);assert.equal(balance.outstanding_minor,500);assert.ok(balance.collection_hold);
 assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_credit_notes WHERE invoice_id=?',[sale.data.invoice_id])).n),0);
 const fact=await dbGet("SELECT data,amount_minor FROM ac_cash_movements WHERE related_receipt_id=? AND kind='return'",[sale.data.cash_receipt_id]);assert.equal(Number(fact.amount_minor),-500);assert.ok(!fact.data.includes(input.reason));
});

test('shared reporting separates physical cash and Accounting retains independent source posting review',async()=>{
 const a=access(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const snapshot=await financialSnapshot(a,{currency:'KES',range:'all'}),cash=await dbGet("SELECT SUM(CASE WHEN amount_minor>0 THEN amount_minor ELSE 0 END) AS receipts,SUM(CASE WHEN amount_minor<0 THEN -amount_minor ELSE 0 END) AS returns FROM ac_cash_movements WHERE org_id=? AND environment='sandbox'",[org]);
 assert.equal(snapshot.totals.recorded_cash_receipts_minor,Number(cash.receipts));assert.equal(snapshot.totals.recorded_cash_returns_minor,Number(cash.returns));assert.equal(snapshot.totals.recorded_cash_net_minor,Number(cash.receipts)-Number(cash.returns));
 assert.equal(snapshot.metric_metadata.recorded_cash_net_minor.source,'merchant_observed_physical_cash');
 const original=await dbGet("SELECT id,document_id,related_receipt_id FROM ac_cash_movements WHERE org_id=? AND kind='return' ORDER BY created_at DESC,id DESC LIMIT 1",[org]);
 const source=await accountingSource(a,'cash_receipt',original.related_receipt_id);assert.equal(source.facts.assurance,'merchant_observed_physical_cash_not_provider_confirmation');assert.equal(source.amount_minor,1000);
 await assert.rejects(accountingSource(a,'allocation',original.related_receipt_id),/not confirmed provider allocation/);
 assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_accounting_entries WHERE org_id=?',[org])).n),0);
 await setupAccounting(a,{start_on:date,currency:'KES',opening_policy:'new_books_no_prior_balances',acknowledge_history_boundary:true},key());
 await createPeriod(a,{name:'Fictional POS accounting day',starts_on:date,ends_on:date},key());
 assert.ok((await accountingSourceList(a,{source_type:'cash_receipt',currency:'KES'})).data.some(r=>r.id===original.related_receipt_id));
 assert.equal((await accountingSourceList(a,{source_type:'cash_receipt',currency:'USD'})).data.length,0);
 await assert.rejects(prepareAccountingSource(a,{source_type:'cash_return',source_id:original.id},key()),/Post the original invoice/);
 const reviewer=await api('/api/auth/signup',{email:key()+'@example.test',password:'Synthetic-cash-accounting-review-2026!'},'');assert.equal(reviewer.status,201);
 await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'admin')",[org,reviewer.data.id]);
 const post=async(type:string,id:string)=>{
  const entry=await prepareAccountingSource(a,{source_type:type,source_id:id},key());
  await assert.rejects(postJournalEntry(a,entry.id,{expected_version:entry.version,approval_id:key()},key()));
  const review=await requestJournalReview(a,entry.id,{approver:reviewer.data.id,expected_version:entry.version},key());
  const decision=await api('/api/v1/organizations/'+org+'/approvals/'+review.id+'/decide',{decision:'approved',reason:'Fictional independent recorded-cash review'},reviewer.cookie);assert.equal(decision.status,200,JSON.stringify(decision.data));
  return postJournalEntry(a,entry.id,{expected_version:entry.version,approval_id:review.id},key());
 };
 await post('invoice',original.document_id);
 await assert.rejects(prepareAccountingSource(a,{source_type:'cash_return',source_id:original.id},key()),/Post the original recorded cash receipt/);
 const receipt=await post('cash_receipt',original.related_receipt_id);assert.equal(receipt.status,'posted');assert.equal(receipt.data.source_snapshot.facts.assurance,'merchant_observed_physical_cash_not_provider_confirmation');
 const returned=await post('cash_return',original.id);assert.equal(returned.status,'posted');assert.equal(returned.data.source_snapshot.amount_minor,-500);
 assert.equal((await prepareAccountingSource(a,{source_type:'cash_return',source_id:original.id},key())).id,returned.id);
});

test('cashier HTTP routes enforce register authority and literal product search before pagination',async()=>{
 const root='/api/v1/organizations/'+org+'/pos',a=access();
 const directory=await api(root+'/registers',undefined,cashierCookie,'GET');assert.equal(directory.status,200);assert.ok(directory.data.data.some((r:any)=>r.id===registerId));
 assert.equal((await api(root+'/registers',configuration(),cashierCookie)).status,403);
 for(let i=0;i<26;i++)await createProduct(a,{sku:'SEARCH-'+i+'-'+key(),name:'A fictional search product '+i,sale_price_minor:100,track_inventory:false},key());
 const target=await createProduct(a,{sku:'LITERAL-'+key(),name:'Z fictional literal % _ product',barcode:'COUNTER_%_MATCH',sale_price_minor:1200,purchase_cost_minor:900,track_inventory:false},key());
 const result=await api(root+'/registers/'+registerId+'/products?q='+encodeURIComponent('% _'),undefined,cashierCookie,'GET');assert.equal(result.status,200,JSON.stringify(result.data));assert.deepEqual(result.data.data.map((p:any)=>p.id),[target.id]);assert.equal(result.data.data[0].purchase_cost_minor,undefined);assert.equal(result.data.data[0].supplier_id,undefined);
 const barcode=await api(root+'/registers/'+registerId+'/products?q='+encodeURIComponent('COUNTER_%_MATCH'),undefined,cashierCookie,'GET');assert.equal(barcode.data.data.length,1);assert.equal(barcode.data.data[0].id,target.id);
 assert.equal((await api(root+'/registers/'+key()+'/products',undefined,cashierCookie,'GET')).status,404);
 const sales=await api(root+'/registers/'+registerId+'/sales',undefined,cashierCookie,'GET');assert.equal(sales.status,200);assert.ok(sales.data.data.every((s:any)=>s.checkout===undefined));
});

test('a different current administrator can reauthorize unchanged policy so a revoked-owner shift can close',async()=>{
 const a=access(),r=await saveRegister(a,null,{...configuration(),name:'Fictional policy recovery register'},key()),session=(await openSession(cashierAccess(),r.id,{expected_register_version:1,opening_cash_minor:0,acknowledge_count:true},key())).session;
 const successor=await api('/api/auth/signup',{email:key()+'@example.test',password:'Synthetic-policy-successor-2026!'},'');assert.equal(successor.status,201);
 await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'admin')",[org,successor.data.id]);const next={...a,actor:successor.data.id,role:'admin'};
 await dbRun("UPDATE ac_memberships SET role='viewer' WHERE org_id=? AND user_id=?",[org,actor]);
 try{
  assert.equal((await registerAccess(cashierAccess(),r.id)).write_allowed,false);
  await assert.rejects(closeSession(next,session.id,{expected_version:1,counted_cash_minor:0,acknowledge_close:true},key()),/policy authorization/);
  const acknowledgement={expected_version:1,acknowledge_current_register_policy:true,acknowledge_automated_invoicing:true,acknowledge_recorded_cash:true};
  await assert.rejects(reauthorizeRegister(a,r.id,acknowledgement,key()),/owner or administrator/);
  await assert.rejects(reauthorizeRegister(next,r.id,{...acknowledgement,tax_bps:9999},key()),/Unrecognized|unrecognized/);
  const adopted=await reauthorizeRegister(next,r.id,acknowledgement,key());assert.equal(adopted.version,2);assert.deepEqual(adopted.data.cashier_ids,r.data.cashier_ids);assert.equal(adopted.data.currency,r.data.currency);assert.equal(adopted.data.policy_authorized_by,next.actor);
  assert.equal((await registerAccess(cashierAccess(),r.id)).write_allowed,true);
  const closed=await closeSession(next,session.id,{expected_version:1,counted_cash_minor:0,acknowledge_close:true},key());assert.equal(closed.session.status,'closed');assert.equal(closed.session.data.register_version,1);
 }finally{await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?",[org,actor]);}
});

test('POS physical returns reuse globally bounded dispatch returns without refunding money',async()=>{
 const a=access(),w=await createWarehouse(a,{code:'RET-'+key(),name:'Fictional goods-return warehouse'},key()),p=await createProduct(a,{sku:'GOODS-'+key(),name:'Fictional returned stock',sale_price_minor:1000,track_inventory:true},key());
 await postMovement(a,{product_id:p.id,warehouse_id:w.id,quantity_milli:2000,kind:'receipt',reason:'Fictional physical returns fixture'},key());
 const r=await saveRegister(a,null,{...configuration(),name:'Fictional receiving register',warehouse_id:w.id},key()),session=(await openSession(cashierAccess(),r.id,{expected_register_version:1,opening_cash_minor:0,acknowledge_count:true},key())).session;
 const draft=await savePOSDraft(cashierAccess(),session.id,null,{expected_session_version:1,items:[{product_id:p.id,quantity_milli:2000}]},key()),quote=await currentSaleQuote(cashierAccess(),draft.id),sale=await confirmPOSSale(cashierAccess(),draft.id,{expected_version:1,quote_hash:quote.quote_hash,payment_intent:'cash',cash_amount_minor:2000,tendered_cash_minor:2000,acknowledge_recorded_cash:true,handover_now:true,acknowledge_handover:true},key());
 const dispatch=(await stockReturnChoices(a,sale.id)).data[0],input={expected_sale_version:sale.version,receiving_session_id:session.id,expected_session_version:2,original_dispatch_id:dispatch.id,quantity_milli:1000,reason:'Fictional goods received back',acknowledge_physical_return:true};
 assert.equal(dispatch.dispatched_milli,2000);assert.equal(dispatch.remaining_milli,2000);
 await assert.rejects(returnPOSStock(cashierAccess(),sale.id,input,key()),/manager authority/);
 await assert.rejects(returnPOSStock(a,sale.id,{...input,original_dispatch_id:key()},key()),/does not belong/);
 await assert.rejects(returnPOSStock(a,sale.id,{...input,quantity_milli:1500},key()),/whole quantity/);
 await assert.rejects(returnPOSStock(a,sale.id,{...input,quantity_milli:3000},key()),/exceeds the original dispatched/);
 const returnKey=key(),returned=await returnPOSStock(a,sale.id,input,returnKey);assert.equal((await returnPOSStock(a,sale.id,input,returnKey)).version,returned.version);
 assert.equal((await locationBalance(a,p.id,w.id,null)).on_hand_milli,1000);assert.equal((await drawer(a,session.id)).expected_minor,2000);
 const invoice=await documentBalance(a,sale.data.invoice_id);assert.equal(invoice.paid_minor,2000);assert.equal(invoice.credited_minor,0);assert.equal(invoice.outstanding_minor,0);
 await postMovement(a,{product_id:p.id,warehouse_id:w.id,kind:'return',quantity_milli:1000,source_id:dispatch.id,reason:'Fictional shared Inventory return'},key());
 assert.equal((await stockReturnChoices(a,sale.id)).data[0].remaining_milli,0);
 await assert.rejects(returnPOSStock(a,sale.id,{...input,expected_sale_version:returned.version,expected_session_version:3},key()),/exceeds the original dispatched/);
 assert.equal((await locationBalance(a,p.id,w.id,null)).on_hand_milli,2000);assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac_stock_movements WHERE org_id=? AND source_id=? AND kind='return'",[org,dispatch.id])).n),2);
});
