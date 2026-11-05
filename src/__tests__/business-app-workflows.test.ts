import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {configureTestEnv} from './helpers';
configureTestEnv('business-app-workflows');
import {hash} from '../platform/crypto';
import {canonical} from '../finance/service';
import {migrate,dbAll,dbGet,dbRun,closeDb} from '../db';
import {createApp} from '../app';
import {stockBalance} from '../inventory/service';
import {processProviderResult} from '../platform/payments';
import {processBusinessEvents} from '../operations/business-worker';
import {runAutomations,notify} from '../operations/automation';
import {quantityMilli} from '../inventory/quantity';
import {day,addDays} from '../operations/store';
let server:any,base:string,cookie='',org='',actor='',customerId='',productId='',warehouseId='',orderId='',invoiceId='',approverCookie='',approverId='';
const path=(suffix:string)=>'/api/v1/organizations/'+org+suffix;
const a=()=>({org,actor,role:'owner',environment:'sandbox',api:false});
async function api(p:string,method='GET',body?:any,session=cookie,key:string=randomUUID()){const r=await fetch(base+p,{method,headers:{Cookie:session,'Content-Type':'application/json','Idempotency-Key':key},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||''};}
async function install(id:string,optional:string[]=[]){const preview=await api(path('/apps/'+id+'/installation-preview')+(optional.length?'?optional='+optional.join(','):''));assert.equal(preview.status,200,JSON.stringify(preview.data));const r=await api(path('/apps/'+id+'/install'),'POST',{review_hash:preview.data.review_hash,optional_services:optional});assert.equal(r.status,200,JSON.stringify(r.data));}
const document=(quantity=3)=>({customer_id:customerId,currency:'KES',items:[{description:'Synthetic shared product',quantity,unit_price_minor:100000,product_id:productId,warehouse_id:warehouseId}],issue_date:'2026-10-01',due_date:'2026-11-01'});
before(async()=>{await migrate();server=createApp().listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;const s=await api('/api/auth/signup','POST',{email:randomUUID()+'@example.test',password:'Synthetic-connected-business-2026!'});cookie=s.cookie;await api('/api/auth/verify','POST',{token:s.data.verification_token});actor=(await api('/api/auth/account')).data.user.id;const w=await api('/api/auth/workspaces','POST',{kind:'business',name:'Synthetic connected apps',display_name:'Synthetic owner',services:[]});assert.equal(w.status,201);org=w.data.id;const other=await api('/api/auth/signup','POST',{email:randomUUID()+'@example.test',password:'Synthetic-second-reviewer-2026!'});approverCookie=other.cookie;await api('/api/auth/verify','POST',{token:other.data.verification_token},approverCookie);approverId=(await api('/api/auth/account','GET',undefined,approverCookie)).data.user.id;await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'owner')",[org,approverId]);});
after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await closeDb();});
test('six installations share customers/services without duplicate entitlements',async()=>{
 for(const id of ['finance','crm','inventory','sales','analytics','automations'])await install(id,id==='finance'?['payments','reconciliation']:[]);
 const apps=await api(path('/apps'));assert.equal(apps.data.apps.filter((a:any)=>a.installation?.status==='installed').length,6);
 assert.equal((await dbAll('SELECT service_id,COUNT(*) AS n FROM ac_service_entitlements WHERE org_id=? GROUP BY service_id HAVING COUNT(*)>1',[org])).length,0);
 const customer=await api(path('/records/customers'),'POST',{name:'Synthetic shared customer',address:'Original fictional address'});assert.equal(customer.status,201);customerId=customer.data.id;
 assert.equal((await api(path('/crm/customers/'+customerId),'PUT',{expected_version:0,tags:['repeat buyer'],assigned_to:actor})).status,200);
 const opportunity=await api(path('/crm/entries'),'POST',{kind:'opportunity',customer_id:customerId,title:'Synthetic desks proposal',stage:'proposal',assigned_to:actor,amount_minor:300000});assert.equal(opportunity.status,201);
 const warehouse=await api(path('/inventory/warehouses'),'POST',{code:'MAIN',name:'Synthetic warehouse'});assert.equal(warehouse.status,201);warehouseId=warehouse.data.id;
 const product=await api(path('/products'),'POST',{sku:'SHARED-001',name:'Synthetic shared product',sale_price_minor:100000,reorder_point_milli:17000});assert.equal(product.status,201);productId=product.data.id;
 assert.equal((await api(path('/inventory/movements'),'POST',{product_id:productId,warehouse_id:warehouseId,kind:'receipt',quantity_milli:20000,reason:'Synthetic opening stock receipt'})).status,201);
 assert.equal((await stockBalance(a(),productId)).on_hand_milli,20000);
});
test('quotation and draft order do not consume stock; confirmation atomically reserves and prepares one draft invoice',async()=>{
 const created=await api(path('/sales/quotations'),'POST',document());assert.equal(created.status,201,JSON.stringify(created.data));assert.equal((await stockBalance(a(),productId)).reserved_milli,0);
 const accepted=await api(path('/sales/quotations/'+created.data.id+'/action'),'POST',{action:'accept',expected_version:1});assert.equal(accepted.status,200);
 const converted=await api(path('/sales/quotations/'+created.data.id+'/action'),'POST',{action:'convert',expected_version:2});assert.equal(converted.status,200,JSON.stringify(converted.data));orderId=converted.data.order_id;
 assert.equal((await stockBalance(a(),productId)).reserved_milli,0);
 const confirmed=await api(path('/records/orders/'+orderId),'PATCH',{status:'awaiting_payment'});assert.equal(confirmed.status,200,JSON.stringify(confirmed.data));
 assert.deepEqual(await stockBalance(a(),productId),{on_hand_milli:20000,reserved_milli:3000,available_milli:17000,incoming_milli:0,outgoing_milli:3000,forecasted_milli:17000});
 const linked=await dbGet('SELECT invoice_id FROM ac_sales_order_links WHERE order_id=?',[orderId]);assert.ok(linked);invoiceId=linked.invoice_id;
 const invoice=await api(path('/records/invoices/'+invoiceId));assert.equal(invoice.data.status,'draft');assert.equal(invoice.data.order_id,orderId);assert.equal(invoice.data.total_minor,300000);
 assert.equal((await api(path('/records/orders/'+orderId),'PATCH',{status:'awaiting_payment'})).status,409);assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_sales_order_links WHERE order_id=?',[orderId])).n),1);
});
test('concurrent reservations cannot oversell and cancelling an unissued order releases only its own stock',async()=>{
 const first=await api(path('/records/orders'),'POST',document(12)),second=await api(path('/records/orders'),'POST',document(12));assert.equal(first.status,201);assert.equal(second.status,201);
 const results=await Promise.all([first,second].map(o=>api(path('/records/orders/'+o.data.id),'PATCH',{status:'awaiting_payment'})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const winner=results[0].status===200?first:second,loser=results[0].status===409?first:second;
 assert.equal((await stockBalance(a(),productId)).reserved_milli,15000);assert.equal((await api(path('/records/orders/'+loser.data.id))).data.status,'draft');
 const cancelled=await api(path('/records/orders/'+winner.data.id),'PATCH',{status:'cancelled'});assert.equal(cancelled.status,200,JSON.stringify(cancelled.data));assert.equal((await stockBalance(a(),productId)).reserved_milli,3000);
});
test('issued customer details remain frozen while shared contact edits and confirmed payment reach Finance and CRM',async()=>{
 assert.equal((await api(path('/records/invoices/'+invoiceId),'PATCH',{status:'issued'})).status,200);
 assert.equal((await api(path('/records/customers/'+customerId),'PATCH',{address:'Updated fictional address',name:'Updated shared customer'})).status,200);
 const invoice=await api(path('/records/invoices/'+invoiceId));assert.equal(invoice.data.customer_snapshot.address,'Original fictional address');assert.equal((await api(path('/crm/customers/'+customerId))).data.customer.address,'Updated fictional address');
 assert.equal((await api(path('/records/invoices/'+invoiceId),'PATCH',{...document(),items:[{description:'Illegal silent change',quantity:1,unit_price_minor:1}]})).status,409);
 const request=await api(path('/payment-requests'),'POST',{document_id:invoiceId,amount_minor:300000});assert.equal(request.status,201);
 await processProviderResult(request.data.id,{reference:'synthetic-apps-'+randomUUID(),status:'succeeded',amount_minor:300000,currency:'KES'});
 const history=await api(path('/crm/customers/'+customerId+'/activity'));assert.equal(history.status,200);assert.ok(history.data.financial_activity.invoices.some((i:any)=>i.id===invoiceId&&i.outstanding_minor===0));
 const before=Number((await dbGet('SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=?',[org])).n);await processBusinessEvents(a());const after=Number((await dbGet('SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=?',[org])).n);assert.ok(after>before);await processBusinessEvents(a());assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=?',[org])).n),after);
 const notifications=await api(path('/notifications/summary'));assert.ok(notifications.data.unread>0);assert.ok(notifications.data.data.some((n:any)=>n.title==='Draft invoice prepared'));
});
test('partial physical dispatch, bounded returns and adjustments preserve exact available stock',async()=>{
 const shipment=await api(path('/shipments'),'POST',{order_id:orderId,courier:'manual',tracking_reference:'Synthetic app shipment',estimated_delivery:'2026-11-01',items:[{item_index:0,quantity:1}]});assert.equal(shipment.status,201,JSON.stringify(shipment.data));
 for(const status of ['processing','ready_for_dispatch','shipped']){const r=await api(path('/shipments/'+shipment.data.id+'/transition'),'POST',{status});assert.equal(r.status,200,JSON.stringify(r.data));}
 assert.equal((await stockBalance(a(),productId)).on_hand_milli,19000);assert.equal((await stockBalance(a(),productId)).reserved_milli,2000);
 const dispatch=await dbGet("SELECT id FROM ac_stock_movements WHERE source_id=? AND kind='dispatch'",[shipment.data.id]);assert.ok(dispatch);
 assert.equal((await api(path('/inventory/movements'),'POST',{product_id:productId,warehouse_id:warehouseId,kind:'return',quantity_milli:1000,source_id:dispatch.id,reason:'Synthetic returned unit received'})).status,201);
 assert.equal((await api(path('/inventory/movements'),'POST',{product_id:productId,warehouse_id:warehouseId,kind:'return',quantity_milli:1000,source_id:dispatch.id,reason:'Duplicate excess physical return'})).status,409);
 assert.equal((await stockBalance(a(),productId)).on_hand_milli,20000);
 assert.equal((await api(path('/inventory/movements'),'POST',{product_id:productId,warehouse_id:warehouseId,kind:'adjustment',quantity_milli:-1000,reason:'Synthetic count correction'})).status,201);
});
test('stock write-off approval binds resource version and exact parameters, rejects replay and stale changes',async()=>{
 const movement={product_id:productId,warehouse_id:warehouseId,kind:'adjustment',quantity_milli:-6000,reason:'Synthetic significant write-off'};
 assert.equal((await api(path('/inventory/movements'),'POST',movement)).status,409);
 const approval=await api(path('/inventory/adjustment-approvals'),'POST',{approver:approverId,movement});assert.equal(approval.status,201,JSON.stringify(approval.data));
 assert.equal((await api(path('/approvals/'+approval.data.id+'/decide'),'POST',{decision:'approved',reason:'Reviewed exact synthetic stock delta'},approverCookie)).status,200);
 assert.equal((await api(path('/inventory/movements'),'POST',{...movement,quantity_milli:-6001,approval_id:approval.data.id})).status,409);
 const key=randomUUID(),posted=await api(path('/inventory/movements'),'POST',{...movement,approval_id:approval.data.id},cookie,key);assert.equal(posted.status,201,JSON.stringify(posted.data));assert.equal((await api(path('/inventory/movements'),'POST',{...movement,approval_id:approval.data.id},cookie,key)).data.id,posted.data.id);
 assert.equal((await api(path('/inventory/movements'),'POST',{...movement,approval_id:approval.data.id})).status,409);
 const stale=await api(path('/inventory/adjustment-approvals'),'POST',{approver:approverId,movement});assert.equal(stale.status,201);assert.equal((await api(path('/inventory/movements'),'POST',{product_id:productId,warehouse_id:warehouseId,kind:'receipt',quantity_milli:1000,reason:'Synthetic later stock change'})).status,201);assert.equal((await api(path('/approvals/'+stale.data.id+'/decide'),'POST',{decision:'approved',reason:'Attempt to approve stale resource'},approverCookie)).status,409);
});
test('business invoice credits require reviewed second-person execution and preserve issued terms',async()=>{
 const created=await api(path('/records/invoices'),'POST',{...document(),items:[{description:'Synthetic additional work',quantity:1,unit_price_minor:10000}]});assert.equal(created.status,201);const id=created.data.id;await api(path('/records/invoices/'+id),'PATCH',{status:'issued'});
 const credit={amount_minor:1000,reason:'Synthetic reviewed commercial correction',issued_on:'2026-10-29'};
 assert.equal((await api(path('/invoices/'+id+'/credits'),'POST',credit)).status,409);
 const context=await api(path('/invoices/'+id+'/finance'));assert.equal(context.status,200,JSON.stringify(context.data));assert.equal(context.data.correction_policy.required,true);assert.ok(context.data.correction_policy.approvers.some((m:any)=>m.id===approverId));assert.ok(!context.data.correction_policy.approvers.some((m:any)=>m.id===actor));const reviewKey=randomUUID();const requested=await api(path('/business/invoices/'+id+'/correction-review'),'POST',{approver:approverId,credit_note:credit},cookie,reviewKey);assert.equal((await api(path('/business/invoices/'+id+'/correction-review'),'POST',{approver:approverId,credit_note:credit},cookie,reviewKey)).data.id,requested.data.id);assert.equal(requested.status,201,JSON.stringify(requested.data));
 assert.equal((await api(path('/approvals/'+requested.data.id+'/decide'),'POST',{decision:'approved',reason:'Reviewed exact synthetic credit'},approverCookie)).status,200);
 const approvedContext=await api(path('/invoices/'+id+'/finance'));assert.ok(approvedContext.data.correction_policy.reviews.some((r:any)=>r.id===requested.data.id&&r.status==='approved'));assert.equal((await api(path('/invoices/'+id+'/credits'),'POST',{...credit,approval_id:requested.data.id})).status,201);assert.ok(!(await api(path('/invoices/'+id+'/finance'))).data.correction_policy.reviews.some((r:any)=>r.id===requested.data.id));
 assert.equal((await api(path('/records/invoices/'+id))).data.total_minor,10000);
});
test('cross-workspace, role, inactive-service and notification boundaries remain enforced',async()=>{
 const signup=await api('/api/auth/signup','POST',{email:randomUUID()+'@example.test',password:'Synthetic-operations-reader-2026!'}),session=signup.cookie;await api('/api/auth/verify','POST',{token:signup.data.verification_token},session);const id=(await api('/api/auth/account','GET',undefined,session)).data.user.id;
 assert.equal((await api(path('/inventory'),'GET',undefined,session)).status,403);await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'operations')",[org,id]);
 const stockReview=await api(path('/inventory/adjustment-approvals'),'POST',{approver:approverId,movement:{product_id:productId,warehouse_id:warehouseId,kind:'adjustment',quantity_milli:-6000,reason:'Synthetic operations requester review'}},session);assert.equal(stockReview.status,201,JSON.stringify(stockReview.data));const ownReviews=await api(path('/business/approvals'),'GET',undefined,session);assert.equal(ownReviews.status,200);assert.equal(ownReviews.data.current_actor,id);assert.ok(ownReviews.data.data.some((r:any)=>r.id===stockReview.data.id&&r.resource_hash));assert.equal((await api(path('/approvals/'+stockReview.data.id+'/cancel'),'POST',{reason:'Synthetic requester cancels stock review'},session)).status,200);
 const history=await api(path('/crm/customers/'+customerId+'/activity'),'GET',undefined,session);assert.equal(history.status,200);assert.equal(history.data.financial_activity,null);
 const notification=await dbGet('SELECT id FROM ac2_notifications WHERE org_id=? AND user_id=? LIMIT 1',[org,actor]);assert.equal((await api(path('/notifications/'+notification.id),'PATCH',{},session)).status,404);
 await dbRun("UPDATE ac_service_entitlements SET status='disabled' WHERE org_id=? AND service_id='inventory'",[org]);assert.equal((await api(path('/inventory/movements'),'POST',{product_id:productId,warehouse_id:warehouseId,kind:'receipt',quantity_milli:1000,reason:'Denied inactive service operation'})).status,402);
 await dbRun("UPDATE ac_service_entitlements SET status='active' WHERE org_id=? AND service_id='inventory'",[org]);assert.equal(quantityMilli('0.125'),125);assert.throws(()=>quantityMilli('0.0001'));
});


test('supported event workflows create one assigned task and one review suggestion without external actions',async()=>{
 const rule=await api(path('/automations'),'POST',{name:'Synthetic customer onboarding',template:'customer_onboarding',enabled:true,conditions:{currency:'KES',minimum_minor:0,days_before_due:2}});assert.equal(rule.status,201,JSON.stringify(rule.data));const preview=await api(path('/business/workflows/'+rule.data.id+'/test'),'POST',{confirm:true});assert.equal(preview.status,200,JSON.stringify(preview.data));assert.equal(preview.data.side_effects_performed,0);assert.equal(preview.data.action,'create_crm_follow_up');assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac2_runs WHERE workflow_id=?',[rule.data.id])).n),0);
 assert.equal((await api(path('/automations'),'POST',{name:'Reject mismatched action',template:'customer_onboarding',action:'in_app_notification'})).status,400);
 const c=await api(path('/records/customers'),'POST',{name:'Synthetic workflow customer'});assert.equal(c.status,201);
 await runAutomations(a());await runAutomations(a());
 const tasks=await dbAll("SELECT * FROM ac_crm_entries WHERE org_id=? AND customer_id=? AND kind='follow_up'",[org,c.data.id]);assert.equal(tasks.length,1);assert.equal(tasks[0].assigned_to,actor);
 const run=await dbGet("SELECT * FROM ac2_runs WHERE workflow_id=? AND status='succeeded'",[rule.data.id]);assert.ok(run);assert.equal(JSON.parse(run.result).external_messages_sent,0);
 const stockRule=await api(path('/automations'),'POST',{name:'Synthetic stock replenishment',template:'stock_replenishment',enabled:true});assert.equal(stockRule.status,201,JSON.stringify(stockRule.data));
 const low=await api(path('/products'),'POST',{sku:'WORKFLOW-LOW',name:'Synthetic low stock workflow',sale_price_minor:100,reorder_point_milli:5000});assert.equal(low.status,201);await api(path('/inventory/movements'),'POST',{product_id:low.data.id,warehouse_id:warehouseId,kind:'receipt',quantity_milli:1000,reason:'Synthetic low stock receipt'});await processBusinessEvents(a());await runAutomations(a());await runAutomations(a());
 const suggestions=await dbAll("SELECT * FROM ac2_objects WHERE org_id=? AND kind='replenishment_suggestions'",[org]);assert.ok(suggestions.length>=1);assert.equal(new Set(suggestions.map((r:any)=>r.id)).size,suggestions.length);
 const stockRun=await dbGet("SELECT * FROM ac2_runs WHERE workflow_id=? AND status='succeeded'",[stockRule.data.id]);assert.ok(stockRun);assert.equal(JSON.parse(stockRun.result).supplier_orders_created,0);
});

test('analytics uses covered sources and actor-private saved reports',async()=>{
 const report=await api(path('/business/analytics?currency=KES&from=2026-10-01&to=2026-10-29'));assert.equal(report.status,200,JSON.stringify(report.data));assert.ok(report.data.inventory.total_products>=1);assert.equal(report.data.inventory.valuation,null);assert.ok(report.data.definitions.sales.includes('not recognized revenue'));
 const saved=await api(path('/business/saved-reports'),'POST',{name:'Synthetic reviewed view',configuration:{query:{currency:'KES',from:'2026-10-01',to:'2026-10-29'},widgets:['financial','inventory']}});assert.equal(saved.status,201,JSON.stringify(saved.data));
 assert.ok((await api(path('/business/saved-reports'))).data.data.some((r:any)=>r.id===saved.data.id));assert.ok(!(await api(path('/business/saved-reports'),'GET',undefined,approverCookie)).data.data.some((r:any)=>r.id===saved.data.id));
 assert.equal((await api(path('/business/saved-reports/'+saved.data.id),'DELETE',{},approverCookie)).status,404);
 assert.equal((await api(path('/business/saved-reports/'+saved.data.id),'DELETE',{})).status,200);
 assert.equal((await api(path('/business/analytics?from=2026-10-29&to=2026-10-01'))).status,400);
});

test('warehouse editing, location transfers, incoming plans and exact fractional stock remain distinct',async()=>{
 const p=await api(path('/products'),'POST',{sku:'MEASURED-001',name:'Synthetic measured material',unit:'kg',sale_price_minor:1000});assert.equal(p.status,201);const target=await api(path('/inventory/warehouses'),'POST',{code:'SECOND',name:'Synthetic second warehouse'});assert.equal(target.status,201);
 const location=await api(path('/inventory/warehouses/'+warehouseId+'/locations'),'POST',{code:'BIN-KG',name:'Synthetic material bin'});assert.equal(location.status,201);
 assert.equal((await api(path('/inventory/movements'),'POST',{product_id:p.data.id,warehouse_id:warehouseId,location_id:location.data.id,kind:'receipt',quantity_milli:1250,reason:'Synthetic measured opening receipt'})).status,201);
 const incoming=await api(path('/inventory/incoming'),'POST',{product_id:p.data.id,warehouse_id:target.data.id,quantity_milli:500,due_on:'2026-11-05',reason:'Synthetic planned incoming material'});assert.equal(incoming.status,201);assert.equal((await stockBalance(a(),p.data.id)).on_hand_milli,1250);assert.equal((await stockBalance(a(),p.data.id)).incoming_milli,500);
 const transferKey=randomUUID(),movement={product_id:p.data.id,warehouse_id:warehouseId,location_id:location.data.id,destination_warehouse_id:target.data.id,kind:'transfer',quantity_milli:1000,reason:'Synthetic paired warehouse transfer'};const transfer=await api(path('/inventory/movements'),'POST',movement,cookie,transferKey);assert.equal(transfer.status,201,JSON.stringify(transfer.data));assert.equal(transfer.data.movements.length,2);assert.equal((await stockBalance(a(),p.data.id,warehouseId)).on_hand_milli,250);assert.equal((await stockBalance(a(),p.data.id,target.data.id)).on_hand_milli,1000);assert.equal((await stockBalance(a(),p.data.id)).on_hand_milli,1250);
 await api(path('/inventory/movements'),'POST',movement,cookie,transferKey);assert.equal((await stockBalance(a(),p.data.id)).on_hand_milli,1250);
 const receiptKey=randomUUID(),receive={action:'receive',reason:'Synthetic physical incoming receipt'};assert.equal((await api(path('/inventory/incoming/'+incoming.data.id+'/action'),'POST',receive,cookie,receiptKey)).status,200);await api(path('/inventory/incoming/'+incoming.data.id+'/action'),'POST',receive,cookie,receiptKey);assert.equal((await stockBalance(a(),p.data.id)).on_hand_milli,1750);assert.equal((await stockBalance(a(),p.data.id)).incoming_milli,0);
 const edited=await api(path('/inventory/warehouses/'+target.data.id),'PATCH',{expected_revision:target.data.revision,warehouse:{code:'SECOND',name:'Synthetic corrected warehouse',address:'Fictional corrected address',status:'active'}});assert.equal(edited.status,200,JSON.stringify(edited.data));assert.notEqual(edited.data.revision,target.data.revision);
 assert.equal((await api(path('/inventory/warehouses/'+target.data.id),'PATCH',{expected_revision:target.data.revision,warehouse:{code:'SECOND',name:'Stale edit',status:'active'}})).status,409);
 assert.equal((await api(path('/inventory/warehouses/'+target.data.id),'PATCH',{expected_revision:edited.data.revision,warehouse:{code:'SECOND',name:'Synthetic corrected warehouse',status:'archived'}})).status,409);
 assert.equal((await api(path('/inventory/movements'),'POST',{product_id:productId,warehouse_id:warehouseId,kind:'receipt',quantity_milli:500,reason:'Invalid fractional whole-unit stock'})).status,400);
});

test('large sales discounts need an exact current quotation review',async()=>{
 const q=await api(path('/sales/quotations'),'POST',{...document(1),items:[{description:'Synthetic untracked service',quantity:1,unit_price_minor:10000}],discount_minor:3000});assert.equal(q.status,201);
 assert.equal((await api(path('/sales/quotations/'+q.data.id+'/action'),'POST',{action:'accept',expected_version:q.data.version})).status,409);
 const key=randomUUID(),review=await api(path('/sales/quotations/'+q.data.id+'/discount-approvals'),'POST',{approver:approverId},cookie,key);assert.equal(review.status,201);assert.equal((await api(path('/sales/quotations/'+q.data.id+'/discount-approvals'),'POST',{approver:approverId},cookie,key)).data.id,review.data.id);
 await api(path('/approvals/'+review.data.id+'/decide'),'POST',{decision:'approved',reason:'Synthetic exact discount review'},approverCookie);
 const changed=await api(path('/sales/quotations/'+q.data.id),'PATCH',{expected_version:q.data.version,document:{...document(1),items:[{description:'Synthetic untracked service',quantity:1,unit_price_minor:10000}],discount_minor:4000}});assert.equal(changed.status,200);
 assert.equal((await api(path('/sales/quotations/'+q.data.id+'/action'),'POST',{action:'accept',expected_version:changed.data.version,approval_id:review.data.id})).status,409);
 const fresh=await api(path('/sales/quotations/'+q.data.id+'/discount-approvals'),'POST',{approver:approverId});assert.equal(fresh.status,201);assert.equal((await api(path('/approvals/'+fresh.data.id+'/decide'),'POST',{decision:'approved',reason:'Synthetic revised exact discount'},approverCookie)).status,200);
 assert.equal((await api(path('/sales/quotations/'+q.data.id+'/action'),'POST',{action:'accept',expected_version:changed.data.version,approval_id:fresh.data.id})).status,200);
});

test('revoked draft-invoice policy authority rolls back order confirmation and stock reservation',async()=>{
 const draft=await api(path('/records/orders'),'POST',document(1),approverCookie);assert.equal(draft.status,201);const held=(await stockBalance(a(),productId)).reserved_milli;
 await dbRun("UPDATE ac_memberships SET role='operations' WHERE org_id=? AND user_id=?",[org,actor]);try{
 const result=await api(path('/records/orders/'+draft.data.id),'PATCH',{status:'awaiting_payment'},approverCookie);assert.equal(result.status,409,JSON.stringify(result.data));assert.equal((await api(path('/records/orders/'+draft.data.id),'GET',undefined,approverCookie)).data.status,'draft');assert.equal((await stockBalance(a(),productId)).reserved_milli,held);assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_stock_reservations WHERE order_id=?',[draft.data.id])).n),0);
 }finally{await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?",[org,actor]);}
});

test('draft order editing preserves shared product allocation, rejects stale edits and replays safely',async()=>{
 const draft=await api(path('/records/orders'),'POST',document(1));assert.equal(draft.status,201);const context=await api(path('/business/orders/'+draft.data.id+'/draft'));assert.equal(context.status,200);assert.equal(context.data.editable,true);const before=(await stockBalance(a(),productId)).reserved_milli;
 const body={expected_revision:context.data.revision,document:{...document(2),notes:'Synthetic reviewed allocation change'}},key=randomUUID();const edit=await api(path('/business/orders/'+draft.data.id+'/draft'),'POST',body,cookie,key);assert.equal(edit.status,200,JSON.stringify(edit.data));assert.equal(edit.data.order.items[0].product_id,productId);assert.equal(edit.data.order.items[0].warehouse_id,warehouseId);assert.equal(edit.data.order.items[0].quantity,2);assert.notEqual(edit.data.revision,context.data.revision);assert.equal((await stockBalance(a(),productId)).reserved_milli,before);
 assert.deepEqual((await api(path('/business/orders/'+draft.data.id+'/draft'),'POST',body,cookie,key)).data,edit.data);assert.equal((await api(path('/business/orders/'+draft.data.id+'/draft'),'POST',body)).status,409);
 assert.equal((await api(path('/records/orders/'+draft.data.id),'PATCH',{status:'awaiting_payment'})).status,200);assert.equal((await stockBalance(a(),productId)).reserved_milli,before+2000);
 assert.equal((await api(path('/business/orders/'+draft.data.id+'/draft'),'POST',{expected_revision:edit.data.revision,document:document(3)})).status,409);
 assert.equal((await api(path('/records/orders/'+draft.data.id),'PATCH',{status:'cancelled'})).status,200);assert.equal((await stockBalance(a(),productId)).reserved_milli,before);
});


test('approval decisions and expiry update notifications without enabling execution or allowing pending dismissal',async()=>{
 const movement={product_id:productId,warehouse_id:warehouseId,kind:'adjustment',quantity_milli:-6000,reason:'Synthetic notification lifecycle review'};
 const expired=await api(path('/inventory/adjustment-approvals'),'POST',{approver:approverId,movement});assert.equal(expired.status,201);const original=await dbGet('SELECT id FROM ac2_notifications WHERE org_id=? AND user_id=? AND resource_id=?',[org,approverId,expired.data.id]);assert.ok(original);
 assert.equal((await api(path('/notifications/'+original.id+'/dismiss'),'POST',{confirm:true},approverCookie)).status,409);
 await dbRun('UPDATE ac2_approvals SET expires_at=? WHERE id=?',['2000-01-01T00:00:00.000Z',expired.data.id]);await processBusinessEvents(a());assert.equal((await dbGet('SELECT status FROM ac2_approvals WHERE id=?',[expired.data.id])).status,'expired');
 assert.equal((await api(path('/notifications/'+original.id+'/dismiss'),'POST',{confirm:true},approverCookie)).status,200);
 const fresh=await api(path('/inventory/adjustment-approvals'),'POST',{approver:approverId,movement});assert.equal(fresh.status,201);assert.equal((await api(path('/approvals/'+fresh.data.id+'/decide'),'POST',{decision:'approved',reason:'Synthetic notification approval only'},approverCookie)).status,200);
 const balance=await stockBalance(a(),productId);await processBusinessEvents(a());const one=await dbGet("SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=? AND user_id=? AND resource_id=? AND title='Review approved'",[org,actor,fresh.data.id]);assert.equal(Number(one.n),1);await processBusinessEvents(a());assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac2_notifications WHERE org_id=? AND user_id=? AND resource_id=? AND title='Review approved'",[org,actor,fresh.data.id])).n),1);assert.equal((await stockBalance(a(),productId)).on_hand_milli,balance.on_hand_milli);
});

test('notification daily cap follows the Nairobi calendar across the UTC date boundary',async()=>{
 const w=await api('/api/auth/workspaces','POST',{kind:'business',name:'Synthetic notification cap',display_name:'Synthetic owner',services:[]});assert.equal(w.status,201);const access={...a(),org:w.data.id},at=new Date('2026-10-29T22:30:00.000Z');
 for(let i=0;i<100;i++)assert.equal((await notify(access,{category:'security',title:'Synthetic cap fixture',body:'No external delivery.',key:'cap:'+i,user_id:actor},at)).inserted,1);
 assert.equal((await notify(access,{category:'security',title:'Suppressed fixture',body:'No external delivery.',key:'cap:overflow',user_id:actor},at)).inserted,0);const first=await api('/api/v1/organizations/'+w.data.id+'/notifications/summary');assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.total,100);assert.equal(first.data.data.length,30);assert.equal((await api('/api/v1/organizations/'+w.data.id+'/notifications/summary?offset=90')).data.data.length,10);assert.equal((await api('/api/v1/organizations/'+w.data.id+'/notifications/summary?offset=-1')).status,400);
});


test('notification preferences stay private and work without business apps in Personal and Developer',async()=>{
 for(const kind of ['personal','developer']){const w=await api('/api/auth/workspaces','POST',{kind,name:'Synthetic '+kind+' notification scope',display_name:'Synthetic owner',services:[]});assert.equal(w.status,201);const base='/api/v1/organizations/'+w.data.id;
 assert.equal((await api(base+'/notifications/preferences')).status,200);assert.equal((await api(base+'/notifications/preferences','PUT',{paused:true,muted_categories:['security']})).status,200);assert.equal((await api(base+'/notifications/preferences')).data.paused,true);assert.equal((await notify({...a(),org:w.data.id},{category:'security',title:'Suppressed preference fixture',body:'No external delivery.',key:'paused:'+kind,user_id:actor})).inserted,0);
 assert.equal((await api(base+'/notifications/preferences','GET',undefined,approverCookie)).status,403);assert.equal((await api(base+'/notifications/summary','GET',undefined,approverCookie)).status,403);assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_app_installations WHERE org_id=?',[w.data.id])).n),0);if(kind==='developer')assert.equal((await api(base+'/apps')).status,403);
 }
});


test('analytics drilldown uses the same Nairobi dates, source authorization and private saved sections',async()=>{
 const c=await api(path('/records/customers'),'POST',{name:'Synthetic Nairobi boundary client',email:'boundary@example.test',address:'Private fictional address'});assert.equal(c.status,201);const date=day(),boundary=new Date(date+'T01:15:00+03:00').toISOString();await dbRun('UPDATE ac_records SET created_at=? WHERE id=?',[boundary,c.data.id]);
 const report=await api(path('/business/analytics?from='+date+'&to='+date));assert.equal(report.status,200);const matching=await api(path('/business/analytics/records?kind=customers&from='+date+'&to='+date+'&date='+date));assert.equal(matching.status,200,JSON.stringify(matching.data));assert.ok(matching.data.data.some((r:any)=>r.id===c.data.id));assert.equal(matching.data.timezone,'Africa/Nairobi');assert.ok(matching.data.data.every((r:any)=>!('email'in r)&&!('address'in r)&&!('total_minor'in r)));
 assert.ok(!(await api(path('/business/analytics/records?kind=customers&from='+addDays(date,-1)+'&to='+addDays(date,-1)))).data.data.some((r:any)=>r.id===c.data.id));assert.equal((await api(path('/business/analytics/records?kind=invoices'))).status,400);
 await dbRun("UPDATE ac_memberships SET role='viewer' WHERE org_id=? AND user_id=?",[org,actor]);try{const view=await api(path('/business/analytics?from='+date+'&to='+date));assert.equal(view.status,200);assert.equal(view.data.financial,null);assert.equal((await api(path('/business/analytics/records?kind=customers&from='+date+'&to='+date))).status,200);const saved=await api(path('/business/saved-reports'),'POST',{name:'Synthetic viewer source view',configuration:{query:{currency:'KES'},widgets:['customers']}});assert.equal(saved.status,201);assert.deepEqual((await api(path('/business/saved-reports'))).data.data.find((r:any)=>r.id===saved.data.id).configuration.widgets,['customers']);}finally{await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?",[org,actor]);}
 const outsider=await api('/api/auth/signup','POST',{email:randomUUID()+'@example.test',password:'Synthetic-analytics-outsider-2026!'});assert.equal((await api(path('/business/analytics/records?kind=customers'),'GET',undefined,outsider.cookie)).status,403);
 const personal=await dbGet("SELECT w.id FROM ac_workspaces w JOIN ac_memberships m ON m.org_id=w.id WHERE m.user_id=? AND w.kind='personal'",[actor]);assert.equal((await api('/api/v1/organizations/'+personal.id+'/business/analytics/records?kind=orders')).status,403);
});

test('a reviewed replenishment suggestion can create one incoming plan without ordering, receiving or paying',async()=>{
 const list=await api(path('/inventory/replenishment-suggestions?status=open'));assert.equal(list.status,200,JSON.stringify(list.data));const suggestion=list.data.data[0];assert.ok(suggestion);const before=await stockBalance(a(),suggestion.product_id),body={expected_version:suggestion.version,decision:'plan_incoming',note:'Synthetic reviewed replenishment plan',incoming:{warehouse_id:warehouseId,quantity_milli:suggestion.suggested_quantity_milli,due_on:'2026-11-05'}},key=randomUUID();const result=await api(path('/inventory/replenishment-suggestions/'+suggestion.id+'/review'),'POST',body,cookie,key);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.suggestion.status,'planned');assert.equal(result.data.supplier_orders_created,0);assert.equal(result.data.payments_created,0);assert.equal(result.data.physical_movements_created,0);
 assert.deepEqual((await api(path('/inventory/replenishment-suggestions/'+suggestion.id+'/review'),'POST',body,cookie,key)).data,result.data);assert.equal((await api(path('/inventory/replenishment-suggestions/'+suggestion.id+'/review'),'POST',body)).status,409);const after=await stockBalance(a(),suggestion.product_id);assert.equal(after.on_hand_milli,before.on_hand_milli);assert.equal(after.incoming_milli,before.incoming_milli+suggestion.suggested_quantity_milli);assert.ok(!(await api(path('/inventory/replenishment-suggestions?status=open'))).data.data.some((r:any)=>r.id===suggestion.id));assert.ok((await api(path('/inventory/replenishment-suggestions?status=planned'))).data.data.some((r:any)=>r.id===suggestion.id));
});

test('a committed stock-operation replay remains available at its hard usage cap',async()=>{
 const period=new Date().toISOString().slice(0,7),units=Number((await dbGet("SELECT COALESCE(SUM(quantity),0) AS n FROM ac_usage_events WHERE org_id=? AND environment='sandbox' AND service_id='inventory' AND period=?",[org,period])).n),limit={monthly_budget_minor:null,quantity_limit:units+1,hard_stop:true,thresholds:[80,100]};assert.equal((await api(path('/usage/limits/inventory'),'PUT',limit)).status,200);
 try{const key=randomUUID(),body={product_id:productId,warehouse_id:warehouseId,kind:'receipt',quantity_milli:1000,reason:'Synthetic replay at a hard inventory cap'},first=await api(path('/inventory/movements'),'POST',body,cookie,key);assert.equal(first.status,201,JSON.stringify(first.data));const replay=await api(path('/inventory/movements'),'POST',body,cookie,key);assert.equal(replay.status,201,JSON.stringify(replay.data));assert.equal(replay.data.id,first.data.id);assert.equal((await api(path('/inventory/movements'),'POST',{...body,reason:'Denied additional operation beyond hard cap'})).status,429);assert.equal(Number((await dbGet("SELECT COALESCE(SUM(quantity),0) AS n FROM ac_usage_events WHERE org_id=? AND environment='sandbox' AND service_id='inventory' AND period=?",[org,period])).n),units+1);
 }finally{await api(path('/usage/limits/inventory'),'PUT',{monthly_budget_minor:null,quantity_limit:null,hard_stop:false,thresholds:[80,100]});}
});

test('new resource creation is metered once and remains replayable at product, CRM and sales caps',async()=>{
 const cases=[{service:'products',route:'/products',body:{sku:'CAP-'+randomUUID(),name:'Synthetic capped product',sale_price_minor:1000}},{service:'crm',route:'/crm/entries',body:{kind:'interaction',customer_id:customerId,title:'Synthetic capped note',notes:'No customer message was sent.'}},{service:'sales',route:'/sales/quotations',body:document(1)}];
 for(const entry of cases){const period=new Date().toISOString().slice(0,7),count=async()=>Number((await dbGet('SELECT COALESCE(SUM(quantity),0) AS n FROM ac_usage_events WHERE org_id=? AND environment=? AND service_id=? AND period=?',[org,'sandbox',entry.service,period])).n),before=await count();assert.equal((await api(path('/usage/limits/'+entry.service),'PUT',{monthly_budget_minor:null,quantity_limit:before+1,hard_stop:true,thresholds:[80,100]})).status,200);
 try{const key=randomUUID(),first=await api(path(entry.route),'POST',entry.body,cookie,key);assert.equal(first.status,201,JSON.stringify(first.data));const replay=await api(path(entry.route),'POST',entry.body,cookie,key);assert.equal(replay.status,201,JSON.stringify(replay.data));assert.equal(replay.data.id,first.data.id);assert.equal(await count(),before+1);assert.equal((await api(path(entry.route),'POST',entry.body)).status,429);assert.equal(await count(),before+1);}finally{await api(path('/usage/limits/'+entry.service),'PUT',{monthly_budget_minor:null,quantity_limit:null,hard_stop:false,thresholds:[80,100]});}
 }
});


test('lead conversion retains shared identity and terms, rejects stale or closed records and replays without duplicates',async()=>{
 const created=await api(path('/crm/entries'),'POST',{kind:'lead',customer_id:customerId,title:'Synthetic conversion lead',notes:'Preserve these notes',assigned_to:actor,amount_minor:120000,currency:'KES'});assert.equal(created.status,201);
 const id=created.data.id,body={expected_version:1},key=randomUUID();
 assert.equal((await api(path('/crm/entries/'+id+'/convert'),'POST',{expected_version:2})).status,409);
 const result=await api(path('/crm/entries/'+id+'/convert'),'POST',body,cookie,key);assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal(result.data.id,id);assert.equal(result.data.customer_id,customerId);assert.equal(result.data.kind,'opportunity');assert.equal(result.data.stage,'qualified');assert.equal(result.data.version,2);assert.equal(result.data.notes,'Preserve these notes');assert.equal(result.data.amount_minor,120000);assert.equal(result.data.assigned_to,actor);
 assert.deepEqual((await api(path('/crm/entries/'+id+'/convert'),'POST',body,cookie,key)).data,result.data);
 assert.equal((await api(path('/crm/entries/'+id+'/convert'),'POST',{expected_version:2})).status,409);
 assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_crm_entries WHERE id=?',[id])).n),1);
 assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac_audit WHERE resource_id=? AND action='crm.lead_converted'",[id])).n),1);
 const outsider=await api('/api/auth/signup','POST',{email:randomUUID()+'@example.test',password:'Synthetic-conversion-outsider-2026!'});await api('/api/auth/verify','POST',{token:outsider.data.verification_token},outsider.cookie);
 assert.equal((await api(path('/crm/entries/'+id+'/convert'),'POST',{expected_version:2},outsider.cookie)).status,403);
 const outsiderId=(await api('/api/auth/account','GET',undefined,outsider.cookie)).data.user.id;await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'viewer')",[org,outsiderId]);
 assert.equal((await api(path('/crm/entries/'+id+'/convert'),'POST',{expected_version:2},outsider.cookie)).status,403);
 const closed=await api(path('/crm/entries'),'POST',{kind:'lead',customer_id:customerId,title:'Closed conversion lead',status:'cancelled'});assert.equal((await api(path('/crm/entries/'+closed.data.id+'/convert'),'POST',{expected_version:1})).status,409);
 await dbRun("UPDATE ac_service_entitlements SET status='disabled' WHERE org_id=? AND service_id='crm'",[org]);assert.equal((await api(path('/crm/entries/'+id+'/convert'),'POST',body,cookie,key)).status,402);await dbRun("UPDATE ac_service_entitlements SET status='active' WHERE org_id=? AND service_id='crm'",[org]);
});


test('competing lead conversions commit once and archived customers cannot enter the opportunity pipeline',async()=>{
 const created=await api(path('/crm/entries'),'POST',{kind:'lead',customer_id:customerId,title:'Concurrent conversion fixture'});assert.equal(created.status,201);
 const converted=await Promise.all([1,2].map(()=>api(path('/crm/entries/'+created.data.id+'/convert'),'POST',{expected_version:1})));assert.deepEqual(converted.map(r=>r.status).sort(),[200,409]);
 const lead=await api(path('/crm/entries'),'POST',{kind:'lead',customer_id:customerId,title:'Archived contact conversion fixture'});assert.equal(lead.status,201);
 assert.equal((await api(path('/records/customers/'+customerId),'PATCH',{status:'archived'})).status,200);
 try{assert.equal((await api(path('/crm/entries/'+lead.data.id+'/convert'),'POST',{expected_version:1})).status,409);assert.equal((await dbGet('SELECT kind FROM ac_crm_entries WHERE id=?',[lead.data.id])).kind,'lead');}finally{await api(path('/records/customers/'+customerId),'PATCH',{status:'active'});}
});


test('reviewed stock counts append one exact adjustment, replay safely and reject stale observations',async()=>{
 const created=await api(path('/products'),'POST',{sku:'COUNT-'+randomUUID(),name:'Synthetic counted product',sale_price_minor:1000});assert.equal(created.status,201);const id=created.data.id,target={product_id:id,warehouse_id:warehouseId,location_id:null};
 assert.equal((await api(path('/inventory/movements'),'POST',{...target,kind:'receipt',quantity_milli:10000,reason:'Synthetic count opening receipt'})).status,201);
 const previewPath='/inventory/stock-counts/preview?product_id='+id+'&warehouse_id='+warehouseId,preview=await api(path(previewPath));assert.equal(preview.status,200);assert.equal(preview.data.on_hand_milli,10000);
 const before=Number((await dbGet('SELECT COUNT(*) AS n FROM ac_stock_movements WHERE product_id=?',[id])).n),body={...target,expected_revision:preview.data.revision,counted_quantity_milli:9000,reason:'Synthetic physical count reconciliation'},key='count-'+randomUUID()+'x'.repeat(158);
 const result=await api(path('/inventory/stock-counts'),'POST',body,cookie,key);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.delta_milli,-1000);assert.ok(result.data.movement_id);assert.equal((await stockBalance(a(),id)).on_hand_milli,9000);
 assert.deepEqual((await api(path('/inventory/stock-counts'),'POST',body,cookie,key)).data,result.data);assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_stock_movements WHERE product_id=?',[id])).n),before+1);
 assert.equal((await api(path('/inventory/stock-counts'),'POST',body)).status,409);
 const next=await api(path(previewPath)),noop=await api(path('/inventory/stock-counts'),'POST',{...body,expected_revision:next.data.revision,counted_quantity_milli:9000});assert.equal(noop.status,200);assert.equal(noop.data.movement_id,null);assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_stock_movements WHERE product_id=?',[id])).n),before+1);
 assert.equal((await api(path('/inventory/stock-counts'),'POST',{...body,expected_revision:next.data.revision,counted_quantity_milli:8500})).status,400);
 const competing=await Promise.all([10000,11000].map(counted_quantity_milli=>api(path('/inventory/stock-counts'),'POST',{...body,expected_revision:next.data.revision,counted_quantity_milli})));assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
 const latest=await api(path(previewPath)),negative={...body,expected_revision:latest.data.revision,counted_quantity_milli:0};assert.equal((await api(path('/inventory/stock-counts'),'POST',negative)).status,409);
 const movement={...target,kind:'adjustment',quantity_milli:-latest.data.on_hand_milli,reason:'Stock count: '+body.reason},review=await api(path('/inventory/adjustment-approvals'),'POST',{approver:approverId,movement});assert.equal(review.status,201);assert.equal((await api(path('/approvals/'+review.data.id+'/decide'),'POST',{decision:'approved',reason:'Reviewed exact synthetic count difference'},approverCookie)).status,200);
 const posted=await api(path('/inventory/stock-counts'),'POST',{...negative,approval_id:review.data.id});assert.equal(posted.status,200,JSON.stringify(posted.data));assert.equal((await stockBalance(a(),id)).on_hand_milli,0);
});

test('stock counts reject consuming reservations and respect workspace, role and service boundaries',async()=>{
 const target={product_id:productId,warehouse_id:warehouseId,location_id:null},preview=await api(path('/inventory/stock-counts/preview?product_id='+productId+'&warehouse_id='+warehouseId));assert.equal(preview.status,200);assert.ok(preview.data.reserved_milli>0);
 const body={...target,expected_revision:preview.data.revision,counted_quantity_milli:0,reason:'Synthetic count below reserved stock'};assert.equal((await api(path('/inventory/stock-counts'),'POST',body)).status,409);
 assert.equal((await api(path('/inventory/stock-counts'),'POST',{...body,warehouse_id:randomUUID()})).status,404);
 const outsider=await api('/api/auth/signup','POST',{email:randomUUID()+'@example.test',password:'Synthetic-count-outsider-2026!'});await api('/api/auth/verify','POST',{token:outsider.data.verification_token},outsider.cookie);assert.equal((await api(path('/inventory/stock-counts'),'POST',body,outsider.cookie)).status,403);const user=(await api('/api/auth/account','GET',undefined,outsider.cookie)).data.user.id;await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'viewer')",[org,user]);assert.equal((await api(path('/inventory/stock-counts'),'POST',body,outsider.cookie)).status,403);
 await dbRun("UPDATE ac_service_entitlements SET status='disabled' WHERE org_id=? AND service_id='inventory'",[org]);try{assert.equal((await api(path('/inventory/stock-counts'),'POST',body)).status,402);}finally{await dbRun("UPDATE ac_service_entitlements SET status='active' WHERE org_id=? AND service_id='inventory'",[org]);}
});


test('CRM configuration, team ownership, archive and version history retain authorization and historical stages',async()=>{
 const configuration=await api(path('/crm/configuration'));assert.equal(configuration.status,200);const teamId=randomUUID(),stages=[...configuration.data.stages,{id:'negotiation',name:'Negotiation'}],teams=[{id:teamId,name:'Synthetic sales team',owner:actor,members:[actor,approverId],active:true}];
 const saved=await api(path('/crm/configuration'),'PUT',{expected_version:configuration.data.version,stages,teams});assert.equal(saved.status,200,JSON.stringify(saved.data));
 const lead=await api(path('/crm/entries'),'POST',{kind:'opportunity',customer_id:customerId,title:'Configurable pipeline fixture',stage:'negotiation',team_id:teamId,assigned_to:actor,probability_bps:7500,expected_close_on:'2026-12-01',tags:['priority']});assert.equal(lead.status,201,JSON.stringify(lead.data));
 const {id,version,created_at,updated_at,...entry}=lead.data;const changed=await api(path('/crm/entries/'+id),'PATCH',{expected_version:version,entry:{...entry,stage:'won',outcome_reason:'Synthetic commercial review complete'}});assert.equal(changed.status,200);const history=await api(path('/crm/entries/'+id+'/history'));assert.equal(history.status,200);assert.equal(history.data.data.length,2);assert.equal(history.data.data[0].snapshot.stage,'negotiation');assert.equal(history.data.data[1].snapshot.stage,'won');
 assert.equal((await api(path('/crm/configuration'),'PUT',{expected_version:saved.data.version,stages:configuration.data.stages,teams})).status,409);
 assert.equal((await api(path('/crm/configuration'),'PUT',{expected_version:configuration.data.version,stages,teams})).status,409);
 assert.equal((await api(path('/crm/configuration'),'PUT',{expected_version:saved.data.version,stages,teams:[{...teams[0],members:[approverId],owner:approverId}]})).status,409);
 assert.ok(Number((await dbGet("SELECT COUNT(*) AS n FROM ac2_events WHERE org_id=? AND resource_id=? AND event_type='crm.stage_changed'",[org,id])).n)===1);
 const archived=await api(path('/crm/entries/'+id),'PATCH',{expected_version:2,entry:{...entry,stage:'won',status:'archived'}});assert.equal(archived.status,200);assert.equal((await api(path('/crm/entries/'+id+'/history'))).data.data.length,3);
});

test('CRM bulk import is atomic and deduplicated by stable source even with a different retry key',async()=>{
 const source_id='source-'+randomUUID(),row={kind:'lead',customer_id:customerId,title:'Imported controlled lead'},body={source_id,rows:[row]};const first=await api(path('/crm/import'),'POST',body);assert.equal(first.status,200,JSON.stringify(first.data));const replay=await api(path('/crm/import'),'POST',body);assert.deepEqual(replay.data,first.data);assert.equal((await api(path('/crm/import'),'POST',{source_id,rows:[{...row,title:'Changed imported content'}]})).status,409);
 const before=Number((await dbGet('SELECT COUNT(*) AS n FROM ac_crm_entries WHERE org_id=?',[org])).n);assert.equal((await api(path('/crm/import'),'POST',{source_id:'invalid-'+randomUUID(),rows:[row,{...row,customer_id:randomUUID()}]})).status,404);assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_crm_entries WHERE org_id=?',[org])).n),before);
});


test('CRM reporting filters before grouping, retains exact probability arithmetic and isolates currencies and history',async()=>{
 const opportunity=await api(path('/crm/entries'),'POST',{kind:'opportunity',customer_id:customerId,title:'Synthetic weighted report',assigned_to:actor,amount_minor:12345,currency:'KES',probability_bps:7500,expected_close_on:'2026-12-10'});assert.equal(opportunity.status,201);
 const foreign=await api(path('/crm/entries'),'POST',{kind:'opportunity',customer_id:customerId,title:'Separate currency fixture',amount_minor:9000000,currency:'USD'});assert.equal(foreign.status,201);
 const report=await api(path('/crm/report?currency=KES&assignee='+actor));assert.equal(report.status,200,JSON.stringify(report.data));assert.ok(report.data.records.some((r:any)=>r.id===opportunity.data.id));assert.ok(report.data.records.every((r:any)=>r.currency==='KES'&&r.assigned_to===actor));assert.equal(report.data.timezone,'Africa/Nairobi');const before=report.data.by_assignee.find((r:any)=>r.id===actor);assert.ok(before.weighted_open_minor>=9259);
 assert.equal((await api(path('/crm/report?from=2026-12-31&to=2026-01-01'))).status,400);
 const stranger=await api('/api/auth/signup','POST',{email:randomUUID()+'@example.test',password:'Synthetic-crm-report-outsider-2026!'});assert.equal((await api(path('/crm/entries/'+opportunity.data.id+'/history'),'GET',undefined,stranger.cookie)).status,403);assert.equal((await api(path('/crm/report'),'GET',undefined,stranger.cookie)).status,403);
 const body=await api('/api/auth/account','GET',undefined,stranger.cookie);await dbRun("INSERT INTO ac_memberships(org_id,user_id,role) VALUES (?,?,'operations')",[org,body.data.user.id]);await api('/api/auth/verify','POST',{token:stranger.data.verification_token},stranger.cookie);const config=await api(path('/crm/configuration'));assert.equal((await api(path('/crm/configuration'),'PUT',{expected_version:config.data.version,stages:config.data.stages,teams:config.data.teams},stranger.cookie)).status,403);
});


test('quotation revision retains shared history and expired terms cannot be accepted without review',async()=>{
 const old=await api(path('/sales/quotations'),'POST',{...document(1),issue_date:addDays(day(),-30),valid_until:addDays(day(),-1)});assert.equal(old.status,201);const id=old.data.id;const shared=await api(path('/sales/quotations/'+id+'/action'),'POST',{action:'mark_shared',expected_version:1});assert.equal(shared.status,200);assert.equal((await api(path('/sales/quotations/'+id+'/action'),'POST',{action:'accept',expected_version:2})).status,409);
 assert.equal((await api(path('/sales/quotations/'+id),'PATCH',{expected_version:2,document:document(2)})).status,409);
 const revised=await api(path('/sales/quotations/'+id+'/action'),'POST',{action:'revise',expected_version:2,reason:'Synthetic validity extension requested'});assert.equal(revised.status,200,JSON.stringify(revised.data));assert.equal(revised.data.status,'draft');
 const updated=await api(path('/sales/quotations/'+id),'PATCH',{expected_version:3,document:{...document(2),valid_until:addDays(day(),30)}});assert.equal(updated.status,200);const history=await api(path('/sales/quotations/'+id+'/history'));assert.equal(history.status,200);assert.deepEqual(history.data.data.map((r:any)=>r.quotation_version),[1,2,3,4]);assert.equal(history.data.data[1].snapshot.status,'shared');assert.equal(history.data.data[1].snapshot.valid_until,addDays(day(),-1));assert.equal(history.data.data[3].snapshot.items[0].quantity,2);
});

test('customer price tiers are explicit, scoped and version-bound without changing saved quotations',async()=>{
 const configuration={name:'Synthetic repeat-customer pricing',currency:'KES',customer_id:customerId,starts_on:'2026-01-01',active:true,rules:[{product_id:productId,minimum_quantity_milli:1000,unit_price_minor:90000},{product_id:productId,minimum_quantity_milli:3000,unit_price_minor:80000}]};const list=await api(path('/sales/price-lists'),'POST',{expected_version:0,configuration});assert.equal(list.status,201,JSON.stringify(list.data));
 const preview=await api(path('/sales/pricing-preview'),'POST',{price_list_id:list.data.id,document:document(3)});assert.equal(preview.status,200);assert.equal(preview.data.document.items[0].unit_price_minor,80000);assert.equal(preview.data.document.total_minor,240000);
 const priced={...preview.data.document,price_list_id:list.data.id,expected_price_list_version:1},saved=await api(path('/sales/quotations'),'POST',priced);assert.equal(saved.status,201,JSON.stringify(saved.data));assert.equal(saved.data.price_list_snapshot.version,1);
 assert.equal((await api(path('/sales/price-lists/'+list.data.id),'PUT',{expected_version:1,configuration:{...configuration,rules:[{product_id:productId,minimum_quantity_milli:1000,unit_price_minor:75000}]}})).status,200);
 assert.equal((await api(path('/sales/quotations'),'POST',priced)).status,409);assert.equal((await api(path('/sales/quotations/'+saved.data.id))).data.total_minor,240000);
 const other=await api(path('/records/customers'),'POST',{name:'Other price customer'});assert.equal((await api(path('/sales/pricing-preview'),'POST',{price_list_id:list.data.id,document:{...document(3),customer_id:other.data.id}})).status,400);
});


test('conditional CRM workflows bind current stage and version, skip unmatched branches and deduplicate tasks',async()=>{
 const config={name:'Synthetic stage branch',template:'crm_stage_follow_up',enabled:true,conditions:{currency:'KES',minimum_minor:0,days_before_due:1},branches:[{conditions:[{field:'stage',operator:'eq',value:'qualified'}],action:'create_crm_follow_up'}],fallback_action:'skip',retry_policy:{max_attempts:2,base_delay_seconds:3}};
 const workflow=await api(path('/automations'),'POST',config);assert.equal(workflow.status,201,JSON.stringify(workflow.data));
 const lead=await api(path('/crm/entries'),'POST',{kind:'opportunity',customer_id:customerId,title:'Conditional stage source'});assert.equal(lead.status,201);const {id,version,created_at,updated_at,...entry}=lead.data;
 assert.equal((await api(path('/crm/entries/'+id),'PATCH',{expected_version:1,entry:{...entry,stage:'qualified'}})).status,200);await runAutomations(a(),new Date(Date.now()+1000));
 let runs=await dbAll('SELECT * FROM ac2_runs WHERE workflow_id=?',[workflow.data.id]);assert.equal(runs.length,1);assert.equal(runs[0].status,'succeeded');assert.equal(JSON.parse(runs[0].result).action,'create_crm_follow_up');const task=await dbGet('SELECT * FROM ac_crm_entries WHERE id=?',[runs[0].id]);assert.equal(task.kind,'follow_up');await runAutomations(a(),new Date(Date.now()+2000));assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_crm_entries WHERE id=?',[runs[0].id])).n),1);
 assert.equal((await api(path('/crm/entries/'+id),'PATCH',{expected_version:2,entry:{...entry,stage:'proposal'}})).status,200);await runAutomations(a(),new Date(Date.now()+3000));runs=await dbAll('SELECT * FROM ac2_runs WHERE workflow_id=? ORDER BY created_at,id',[workflow.data.id]);assert.equal(runs.length,2);assert.ok(runs.some(r=>JSON.parse(r.result).action==='skip'));
 const invalid=await api(path('/automations'),'POST',{...config,branches:[{conditions:[{field:'stage',operator:'eq',value:'won'}],action:'replenishment_suggestion'}]});assert.equal(invalid.status,400);
 const delayed=await api(path('/automations'),'POST',{...config,name:'Synthetic stale-stage delayed branch',delay_minutes:1});assert.equal(delayed.status,201);
 const source=await api(path('/crm/entries'),'POST',{kind:'opportunity',customer_id:customerId,title:'Delayed current-stage source'}),{id:sourceId,version:sv,created_at:sc,updated_at:su,...sourceEntry}=source.data;
 await api(path('/crm/entries/'+sourceId),'PATCH',{expected_version:1,entry:{...sourceEntry,stage:'qualified'}});await runAutomations(a());await api(path('/crm/entries/'+sourceId),'PATCH',{expected_version:2,entry:{...sourceEntry,stage:'proposal'}});await runAutomations(a(),new Date(Date.now()+120000));const delayedRuns=await dbAll('SELECT * FROM ac2_runs WHERE workflow_id=?',[delayed.data.id]);assert.ok(delayedRuns.some(r=>r.status==='cancelled'&&JSON.parse(r.result).reason==='source_changed'));
});


test('company contacts and legacy tag edits retain canonical relationships without cross-workspace lookup',async()=>{
 const company=await api(path('/records/customers'),'POST',{name:'Synthetic parent company'}),person=await api(path('/records/customers'),'POST',{name:'Synthetic company contact'});assert.equal((await api(path('/crm/customers/'+company.data.id),'PUT',{expected_version:0,tags:[],assigned_to:null,contact_type:'company',company_id:null})).status,200);const linked=await api(path('/crm/customers/'+person.data.id),'PUT',{expected_version:0,tags:['buyer'],assigned_to:actor,contact_type:'individual',company_id:company.data.id});assert.equal(linked.status,200,JSON.stringify(linked.data));
 const legacy=await api(path('/crm/customers/'+person.data.id),'PUT',{expected_version:1,tags:['repeat'],assigned_to:actor});assert.equal(legacy.status,200);assert.equal(legacy.data.profile.company_id,company.data.id);
 assert.equal((await api(path('/crm/customers/'+company.data.id),'PUT',{expected_version:1,tags:[],assigned_to:null,contact_type:'individual',company_id:null})).status,409);assert.equal((await api(path('/crm/customers/'+person.data.id),'PUT',{expected_version:2,tags:[],assigned_to:null,contact_type:'individual',company_id:randomUUID()})).status,404);
});

test('legacy completed CRM creation remains replayable after adding defaulted opportunity metadata',async()=>{
 const input={kind:'lead',customer_id:customerId,title:'Synthetic legacy request'},created=await api(path('/crm/entries'),'POST',input);assert.equal(created.status,201);const key=randomUUID(),legacy={...input,notes:'',stage:'new',status:'open',assigned_to:null,due_at:null,amount_minor:0,currency:'KES',quotation_id:null,order_id:null};await dbRun('INSERT INTO ac_finance_operations(org_id,environment,operation,idempotency_key,fingerprint,response,created_at) VALUES (?,?,?,?,?,?,?)',[org,'sandbox','crm.entry.create',key,hash(canonical(legacy)),JSON.stringify(created.data),new Date().toISOString()]);const replay=await api(path('/crm/entries'),'POST',input,cookie,key);assert.equal(replay.status,201,JSON.stringify(replay.data));assert.equal(replay.data.id,created.data.id);
});

test('quotation templates retain reusable terms without creating customer documents and workflow creation replays safely',async()=>{
 const template=await api(path('/sales/templates'),'POST',{expected_version:0,name:'Synthetic reusable service offer',active:true,configuration:{...document(1),due_days:14,valid_days:7}});assert.equal(template.status,201,JSON.stringify(template.data));assert.ok(!('customer_id'in template.data.configuration));assert.equal(template.data.configuration.due_days,14);assert.equal((await api(path('/sales/templates/'+template.data.id),'PUT',{expected_version:0,name:'Stale template change',active:false,configuration:template.data.configuration})).status,409);
 const key=randomUUID(),body={name:'Synthetic idempotent workflow setup',template:'daily_summary',enabled:false},first=await api(path('/automations'),'POST',body,cookie,key),second=await api(path('/automations'),'POST',body,cookie,key);assert.equal(first.status,201);assert.equal(second.data.id,first.data.id);
});
