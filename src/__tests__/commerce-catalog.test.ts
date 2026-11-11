import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {configureTestEnv,productFixtureBody} from './helpers';
configureTestEnv('commerce-catalog');
import {migrate,dbRun,dbGet,closeDb} from '../db';
import {createApp} from '../app';
let server:any,base:string,cookie:string,org:string,actor:string,storeId:string,productId:string,listingId:string;
const root=()=>'/api/v1/organizations/'+org;
async function api(path:string,method='GET',body?:any,key=randomUUID(),environment='sandbox'){const response=await fetch(base+path,{method,headers:{Cookie:cookie||'','Content-Type':'application/json','Idempotency-Key':key,'X-Environment':environment},body:body===undefined?undefined:JSON.stringify(productFixtureBody(path,method,body))});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]||''};}
before(async()=>{await migrate();server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;const signup=await api('/api/auth/signup','POST',{email:randomUUID()+'@example.test',password:'Synthetic-commerce-fixture-2026!'});cookie=signup.cookie;await api('/api/auth/verify','POST',{token:signup.data.verification_token});actor=(await api('/api/auth/account')).data.user.id;const workspace=await api('/api/auth/workspaces','POST',{kind:'business',name:'Fictional Commerce API QA',country:'KE',currency:'KES',timezone:'Africa/Nairobi',display_name:'Fictional merchant'});assert.equal(workspace.status,201,JSON.stringify(workspace.data));org=workspace.data.id;});
after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await closeDb();});
const settings=()=>({name:'Fictional shop',slug:'fictional-shop',currency:'KES'});
test('store setup is scoped, encrypted, versioned and actor-idempotent',async()=>{
 const input={expected_version:0,store:settings()},key=randomUUID(),result=await api(root()+'/commerce/stores','POST',input,key);assert.equal(result.status,201,JSON.stringify(result.data));storeId=result.data.id;
 assert.equal((await api(root()+'/commerce/stores','POST',input,key)).data.id,storeId);assert.equal((await api(root()+'/commerce/stores','POST',{...input,store:{...settings(),name:'Other'}},key)).status,409);
 assert.equal((await api(root()+'/commerce/stores')).data.data.length,1);assert.ok(!(await dbGet('SELECT data FROM ac_erp_objects WHERE id=?',[storeId])).data.includes('Fictional shop'));
 assert.equal((await api(root()+'/commerce/stores/'+storeId,'PUT',{expected_version:0,store:settings()})).status,409);
 assert.equal((await api(root()+'/commerce/stores','POST',input)).status,409);
 const changed=await api(root()+'/commerce/stores/'+storeId,'PUT',{expected_version:1,store:{...settings(),description:'Fictional version two'}});assert.equal(changed.status,200);assert.equal(changed.data.version,2);assert.equal((await api(root()+'/commerce/stores/'+storeId+'/history')).data.data.length,2);
});
test('product publications reuse current canonical products without exposing supplier costing',async()=>{
 const p=await api(root()+'/products','POST',{sku:'COMMERCE-QA',name:'Canonical fictional product',sale_price_minor:12000,purchase_cost_minor:8000,track_inventory:false});assert.equal(p.status,201);productId=p.data.id;
 const body={expected_version:0,product_id:productId,expected_product_version:1,state:'active'},r=await api(root()+'/commerce/stores/'+storeId+'/listings','POST',body);assert.equal(r.status,201,JSON.stringify(r.data));listingId=r.data.id;
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/listings','POST',body)).status,409);
 const list=(await api(root()+'/commerce/stores/'+storeId+'/listings?q=Canonical')).data;assert.equal(list.total,1);assert.equal(list.data[0].canonical_product.sale_price_minor,12000);assert.ok(!('purchase_cost_minor' in list.data[0].canonical_product));
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/listings?q=%')).data.total,0);
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/listings/'+listingId,'PUT',{...body,expected_version:1,expected_product_version:99})).status,409);
 assert.equal((await api(root()+'/commerce/stores/'+storeId,'PUT',{expected_version:2,store:{...settings(),currency:'USD'}})).status,409);
 assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_products WHERE id=?',[productId])).n),1);
});
test('collections and delivery/discount rules retain store versions and reject ambiguous identifiers',async()=>{
 const c=await api(root()+'/commerce/stores/'+storeId+'/collections','POST',{expected_version:0,name:'Fictional collection'});assert.equal(c.status,201);
 const input={expected_version:1,product_id:productId,expected_product_version:1,state:'active',collection_ids:[c.data.id]};assert.equal((await api(root()+'/commerce/stores/'+storeId+'/listings/'+listingId,'PUT',input)).status,200);
 const shipping={id:randomUUID(),name:'Fictional pickup',kind:'pickup',countries:['KE'],rate_minor:0};
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/rules','PUT',{expected_version:2,shipping:[shipping,shipping],discounts:[]})).status,400);
 const saved=await api(root()+'/commerce/stores/'+storeId+'/rules','PUT',{expected_version:2,shipping:[shipping],discounts:[]});assert.equal(saved.status,200);assert.equal(saved.data.version,3);
 const configuration=(await api(root()+'/commerce/stores/'+storeId+'/configuration')).data;assert.equal(configuration.collections.length,1);assert.equal(configuration.shipping[0].id,shipping.id);assert.equal(configuration.store.version,3);
});
test('draft cart quotes current canonical prices and rules without creating orders or money',async()=>{
 const configuration=(await api(root()+'/commerce/stores/'+storeId+'/configuration')).data;
 const body={cart:{items:[{product_id:productId,quantity_milli:2000}],shipping_option_id:configuration.shipping[0].id},country:'KE'};
 const result=await api(root()+'/commerce/stores/'+storeId+'/quote','POST',body);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.total_minor,24000);assert.equal(result.data.lines[0].product_version,1);
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/quote','POST',{...body,total_minor:1})).status,400);
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/quote','POST',{...body,country:'UG'})).status,409);
 assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND kind IN ('orders','invoices')",[org])).n),0);
});

test('explicit publication binds a reviewed projection, retains immutable revisions and exposes no private product data',async()=>{
 const preview=(await api(root()+'/commerce/stores/'+storeId+'/publication-preview')).data;
 assert.equal(preview.manifest.listings.length,1);assert.ok(!JSON.stringify(preview.manifest).includes('purchase_cost_minor'));assert.ok(!('warehouse_id' in preview.manifest));
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/publish','POST',{expected_version:preview.expected_version,review_hash:preview.review_hash,acknowledge_publication:false})).status,400);
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/publish','POST',{expected_version:preview.expected_version,review_hash:'0'.repeat(64),acknowledge_publication:true})).status,409);
 const input={expected_version:preview.expected_version,review_hash:preview.review_hash,acknowledge_publication:true},key=randomUUID(),published=await api(root()+'/commerce/stores/'+storeId+'/publish','POST',input,key);assert.equal(published.status,200,JSON.stringify(published.data));assert.equal(published.data.path,'/s/sandbox/fictional-shop');assert.equal((await api(root()+'/commerce/stores/'+storeId+'/publish','POST',input,key)).data.version,1);
 const savedCookie=cookie;cookie='';try{const publicView=await api('/api/v1/storefronts/sandbox/fictional-shop');assert.equal(publicView.status,200,JSON.stringify(publicView.data));assert.equal(publicView.data.products.length,1);assert.equal(publicView.data.products[0].unit_price_minor,12000);assert.ok(!JSON.stringify(publicView.data).includes('purchase_cost'));assert.ok(!('org_id' in publicView.data));assert.equal((await api('/api/v1/storefronts/sandbox/fictional-shop?q=%')).data.total,0);assert.equal((await api(root()+'/commerce/stores/'+storeId+'/publish','POST',input)).status,401);}finally{cookie=savedCookie;}
 const changed=await api(root()+'/products/'+productId,'PATCH',{expected_version:1,product:{sku:'COMMERCE-QA',name:'Canonical fictional product',sale_price_minor:13000,purchase_cost_minor:8000,track_inventory:false}});assert.equal(changed.status,200,JSON.stringify(changed.data));assert.equal((await api('/api/v1/storefronts/sandbox/fictional-shop')).data.products[0].unit_price_minor,13000);
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/publish','POST',input)).status,409);
 const config=(await api(root()+'/commerce/stores/'+storeId+'/configuration')).data;assert.equal((await api(root()+'/commerce/stores/'+storeId,'PUT',{expected_version:config.store.version,store:{...settings(),slug:'other-address'}})).status,409);
 await assert.rejects(dbRun('UPDATE ac_publication_versions SET actor=? WHERE publication_id=?',['forged',published.data.id]),/immutable/);
 const unpublished=await api(root()+'/commerce/stores/'+storeId+'/unpublish','POST',{expected_publication_version:1,acknowledge_unpublish:true});assert.equal(unpublished.status,200);assert.equal((await api('/api/v1/storefronts/sandbox/fictional-shop')).status,404);assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_publication_versions WHERE publication_id=?',[published.data.id])).n),1);
});

test('guest carts use scoped cookies, current checkout authority and versioned server quotes',async()=>{
 for(const service of ['orders','invoicing','payments']){const r=await api(root()+'/services/'+service+'/activate','POST',{});assert.ok([200,201].includes(r.status),JSON.stringify(r.data));}
 const config=(await api(root()+'/commerce/stores/'+storeId+'/configuration')).data;
 const policy=await api(root()+'/commerce/stores/'+storeId+'/checkout-policy','PUT',{expected_version:config.store.version,enabled:true,consent_notice_version:'checkout-v1',acknowledge_automated_invoicing:true,acknowledge_sandbox_only:true});assert.equal(policy.status,200,JSON.stringify(policy.data));
 const preview=(await api(root()+'/commerce/stores/'+storeId+'/publication-preview')).data;
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/publish','POST',{expected_version:preview.expected_version,review_hash:preview.review_hash,acknowledge_publication:true})).status,200);
 const merchantCookie=cookie,path='/api/v1/storefronts/sandbox/fictional-shop/cart';let cartCookie='';
 try{
  cookie='';assert.equal((await api(path)).data.status,'empty');assert.equal((await api(path,'PUT',{})).status,401);
  const raw=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),created=await raw.json(),header=raw.headers.get('set-cookie')||'';
  assert.equal(raw.status,201,JSON.stringify(created));assert.match(header,/HttpOnly/i);assert.match(header,/SameSite=Lax/i);assert.match(header,/Path=\/api\/v1\/storefronts\/sandbox\/fictional-shop/);assert.ok(!('token' in created));assert.equal(raw.headers.get('cache-control'),'no-store');cartCookie=header.split(';')[0];cookie=cartCookie;
  const repeated=await api(path,'POST',{});assert.equal(repeated.status,200);assert.equal(repeated.data.id,created.id);
  const body={expected_version:1,cart:{items:[{product_id:productId,quantity_milli:2000}],shipping_option_id:config.shipping[0].id},country:'KE'},key=randomUUID();
  const saved=await api(path,'PUT',body,key);assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.version,2);assert.equal(saved.data.quote.total_minor,26000);assert.match(saved.data.quote_hash,/^[a-f0-9]{64}$/);
  assert.equal((await api(path,'PUT',body,key)).data.version,2);assert.equal((await api(path,'PUT',body)).status,409);
  assert.equal((await api(path,'PUT',{...body,expected_version:2,total_minor:1})).status,400);
  assert.equal((await api(path,'PUT',{...body,expected_version:2,cart:{...body.cart,items:[{product_id:randomUUID(),quantity_milli:1000}]}})).status,404);
  assert.equal((await api('/api/v1/storefronts/sandbox/different-shop/cart')).data.status,'empty');
  const ciphertext=(await dbGet('SELECT data FROM ac_commerce_carts WHERE id=?',[created.id])).data;assert.ok(!ciphertext.includes(productId));assert.ok(!ciphertext.includes('quantity_milli'));
  const crossSite=await fetch(base+path,{method:'PUT',headers:{Cookie:cartCookie,'Content-Type':'application/json','Sec-Fetch-Site':'cross-site','Idempotency-Key':randomUUID()},body:JSON.stringify({...body,expected_version:2})});assert.equal(crossSite.status,403);
  await dbRun("UPDATE ac_memberships SET role='viewer' WHERE org_id=? AND user_id=?",[org,actor]);assert.equal((await api(path,'PUT',{...body,expected_version:2})).status,409);
  await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?",[org,actor]);
  await dbRun('UPDATE ac_commerce_carts SET expires_at=? WHERE id=?',['2000-01-01T00:00:00.000Z',created.id]);assert.equal((await api(path)).status,410);
  assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND kind IN ('orders','invoices')",[org])).n),0);
 }finally{cookie=merchantCookie;await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?",[org,actor]);}
});

test('checkout atomically creates one canonical order, issued invoice and sandbox payment capability',async()=>{
 const merchantCookie=cookie,path='/api/v1/storefronts/sandbox/fictional-shop/cart',config=(await api(root()+'/commerce/stores/'+storeId+'/configuration')).data;
 try{
  cookie='';const created=await api(path,'POST',{});assert.equal(created.status,201,JSON.stringify(created.data));cookie=created.cookie;
  const contact={name:'Fictional guest',email:'guest@example.test',phone:'',delivery_address:null,marketing_opt_in:true,consent_notice_version:'checkout-v1'};
  const saved=await api(path,'PUT',{expected_version:1,cart:{items:[{product_id:productId,quantity_milli:1000}],shipping_option_id:config.shipping[0].id},country:'KE',contact});assert.equal(saved.status,200,JSON.stringify(saved.data));
  const input={expected_version:saved.data.version,quote_hash:saved.data.quote_hash,acknowledge_test_purchase:true},key=randomUUID();
  assert.equal((await api(path+'/confirm','POST',{...input,quote_hash:'0'.repeat(64)})).status,409);
  assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND kind='orders'",[org])).n),0);
  const confirmed=await api(path+'/confirm','POST',input,key);assert.equal(confirmed.status,200,JSON.stringify(confirmed.data));assert.equal(confirmed.data.status,'converted');assert.equal(confirmed.data.invoice.total_minor,13000);assert.equal(confirmed.data.invoice.status,'issued');assert.equal(confirmed.data.invoice.outstanding_minor,13000);assert.equal(confirmed.data.order.fulfillment_status,'unfulfilled');assert.match(confirmed.data.checkout_url,/^\/checkout\/[a-f0-9]{64}$/);assert.ok(!JSON.stringify(confirmed.data).includes('guest@example.test'));
  assert.equal((await api(path+'/confirm','POST',input,key)).data.checkout_url,confirmed.data.checkout_url);assert.equal((await api(path+'/confirm','POST',input)).data.checkout_url,confirmed.data.checkout_url);
  const count=await dbGet("SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND kind IN ('orders','invoices')",[org]);assert.equal(Number(count.n),2);
  assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_requests WHERE org_id=?',[org])).n),1);
  const customer=await dbGet("SELECT data FROM ac_records WHERE org_id=? AND kind='customers'",[org]),data=JSON.parse(customer.data);assert.equal(data.marketing_consent.state,'pending_confirmation');assert.equal(data.commerce_source.contact_verification,'guest_unverified');assert.match(data.commerce_source.requested_by,/^commerce-checkout:/);
  const paid=await api('/api/v1'+confirmed.data.checkout_url,'GET');assert.equal(paid.status,200,JSON.stringify(paid.data));
  const payment=await api('/api/v1'+confirmed.data.checkout_url+'/pay','POST',{scenario:'success'},randomUUID());assert.equal(payment.status,200,JSON.stringify(payment.data));
  const receipt=await api(path);assert.equal(receipt.data.invoice.outstanding_minor,0);assert.equal(receipt.data.invoice.paid_minor,13000);assert.equal(receipt.data.order.payment_status,'paid');assert.equal(receipt.data.order.fulfillment_status,'unfulfilled');
  assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac_accounting_entries WHERE org_id=? AND status='posted'",[org])).n),0);
  const buyerCookie=cookie;cookie=merchantCookie;const current=(await api(root()+'/commerce/stores/'+storeId+'/configuration')).data;
  assert.equal((await api(root()+'/commerce/stores/'+storeId+'/unpublish','POST',{expected_publication_version:current.store.data.publication.version,acknowledge_unpublish:true})).status,200);
  cookie=buyerCookie;assert.equal((await api(path)).data.invoice.paid_minor,13000);assert.equal((await api(path,'POST',{new_cart:true})).status,404);
  cookie=merchantCookie;const preview=(await api(root()+'/commerce/stores/'+storeId+'/publication-preview')).data;
  assert.equal((await api(root()+'/commerce/stores/'+storeId+'/publish','POST',{expected_version:preview.expected_version,review_hash:preview.review_hash,acknowledge_publication:true})).status,200);
 }finally{cookie=merchantCookie;}
});

test('competing guest checkouts cannot oversell canonical stock or dispatch it during payment setup',async()=>{
 const merchantCookie=cookie,warehouse=await api(root()+'/inventory/warehouses','POST',{code:'COMMERCE',name:'Fictional checkout warehouse'});assert.equal(warehouse.status,201,JSON.stringify(warehouse.data));
 const tracked=await api(root()+'/products','POST',{sku:'COMMERCE-TRACKED',name:'Last fictional stocked item',sale_price_minor:5000,track_inventory:true});assert.equal(tracked.status,201,JSON.stringify(tracked.data));
 assert.equal((await api(root()+'/inventory/movements','POST',{product_id:tracked.data.id,warehouse_id:warehouse.data.id,kind:'receipt',quantity_milli:1000,reason:'Fictional checkout stock fixture'})).status,201);
 const config=(await api(root()+'/commerce/stores/'+storeId+'/configuration')).data;
 assert.equal((await api(root()+'/commerce/stores/'+storeId,'PUT',{expected_version:config.store.version,store:{...config.store.data.settings,warehouse_id:warehouse.data.id}})).status,200);
 const currentProduct=(await api(root()+'/products/'+tracked.data.id)).data;
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/listings','POST',{expected_version:0,product_id:tracked.data.id,expected_product_version:currentProduct.version,state:'active'})).status,201);
 const preview=(await api(root()+'/commerce/stores/'+storeId+'/publication-preview')).data;assert.equal((await api(root()+'/commerce/stores/'+storeId+'/publish','POST',{expected_version:preview.expected_version,review_hash:preview.review_hash,acknowledge_publication:true})).status,200);
 const path='/api/v1/storefronts/sandbox/fictional-shop/cart',buyers:{cookie:string;input:any}[]=[];
 try{
  for(let i=0;i<2;i++){
   cookie='';const created=await api(path,'POST',{});cookie=created.cookie;
   const saved=await api(path,'PUT',{expected_version:1,cart:{items:[{product_id:tracked.data.id,quantity_milli:1000}],shipping_option_id:config.shipping[0].id},country:'KE',contact:{name:'Fictional competing guest '+i,email:'competing-'+i+'@example.test',delivery_address:null,consent_notice_version:'checkout-v1'}});assert.equal(saved.status,200,JSON.stringify(saved.data));
   buyers.push({cookie,input:{expected_version:saved.data.version,quote_hash:saved.data.quote_hash,acknowledge_test_purchase:true}});
  }
  cookie=merchantCookie;assert.equal((await api(root()+'/usage/limits/invoicing','PUT',{monthly_budget_minor:null,quantity_limit:1,hard_stop:true,thresholds:[100]})).status,200);
  cookie=buyers[0].cookie;assert.equal((await api(path+'/confirm','POST',buyers[0].input)).status,429);
  assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND kind='customers'",[org])).n),1);
  assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_stock_reservations WHERE org_id=? AND product_id=?',[org,tracked.data.id])).n),0);
  cookie=merchantCookie;assert.equal((await api(root()+'/usage/limits/invoicing','PUT',{monthly_budget_minor:null,quantity_limit:null,hard_stop:false,thresholds:[100]})).status,200);
  const competing=await Promise.all(buyers.map(async buyer=>{const r=await fetch(base+path+'/confirm',{method:'POST',headers:{Cookie:buyer.cookie,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(buyer.input)});return {status:r.status,data:await r.json()};}));
  assert.deepEqual(competing.map(r=>r.status).sort(),[200,409],JSON.stringify(competing));assert.match(competing.find(r=>r.status===409)!.data.message,/stock/i);
  assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac_stock_reservations WHERE org_id=? AND product_id=? AND status='held'",[org,tracked.data.id])).n),1);
  assert.equal(Number((await dbGet('SELECT SUM(quantity_milli) AS n FROM ac_stock_movements WHERE org_id=? AND product_id=?',[org,tracked.data.id])).n),1000);
  assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND kind='orders'",[org])).n),2);
  assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM ac_records WHERE org_id=? AND kind='customers'",[org])).n),2);
  cookie=merchantCookie;const report=await api(root()+'/commerce/stores/'+storeId+'/orders');assert.equal(report.status,200,JSON.stringify(report.data));assert.equal(report.data.data.length,2);assert.ok(report.data.data.some((o:any)=>o.paid_minor===13000));assert.equal((await api(root()+'/commerce/stores/'+storeId+'/orders?q=%')).data.data.length,0);
 }finally{cookie=merchantCookie;}
});

test('foreign workspace/environment resources and revoked admin retries fail closed',async()=>{
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/configuration','GET',undefined,randomUUID(),'production')).status,402);
 const other=await api('/api/auth/workspaces','POST',{kind:'business',name:'Other fictional shop',country:'KE',currency:'KES',timezone:'Africa/Nairobi',display_name:'Merchant'});assert.equal(other.status,201);
 assert.equal((await api('/api/v1/organizations/'+other.data.id+'/commerce/stores/'+storeId+'/configuration')).status,404);
 const key=randomUUID(),body={expected_version:0,store:{...settings(),slug:'second-fictional-shop'}};assert.equal((await api(root()+'/commerce/stores','POST',body,key)).status,201);
 await dbRun("UPDATE ac_memberships SET role='operations' WHERE org_id=? AND user_id=?",[org,actor]);
 assert.equal((await api(root()+'/commerce/stores','POST',body,key)).status,403);assert.equal((await api(root()+'/commerce/stores')).status,200);
 await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?",[org,actor]);
});
test('deactivation keeps authorized draft history while blocking new store writes',async()=>{
 const off=await api(root()+'/services/commerce/deactivate','POST',{confirm:true});assert.equal(off.status,200);
 assert.equal((await api(root()+'/commerce/stores/'+storeId+'/configuration')).status,200);
 assert.equal((await api(root()+'/commerce/stores/'+storeId,'PUT',{expected_version:3,store:settings()})).status,402);
});

test('Commerce installation reviews only its dependencies and leaves checkout disabled',async()=>{
 const w=await api('/api/auth/workspaces','POST',{kind:'business',name:'Fictional Commerce installation',country:'KE',currency:'KES',timezone:'Africa/Nairobi',display_name:'Fictional merchant',services:[]});assert.equal(w.status,201,JSON.stringify(w.data));
 const path='/api/v1/organizations/'+w.data.id,preview=await api(path+'/apps/commerce/installation-preview');assert.equal(preview.status,200,JSON.stringify(preview.data));assert.deepEqual(preview.data.services.map((s:any)=>s.id),['products','commerce','orders','invoicing','payments']);
 const installed=await api(path+'/apps/commerce/install','POST',{review_hash:preview.data.review_hash,optional_services:[]});assert.equal(installed.status,200,JSON.stringify(installed.data));assert.equal(installed.data.status,'installed');
 assert.equal((await api(path+'/commerce/stores')).data.data.length,0);
 assert.equal((await dbGet('SELECT status FROM ac_service_entitlements WHERE org_id=? AND service_id=?',[w.data.id,'inventory']))?.status,undefined);
 assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_commerce_carts WHERE org_id=?',[w.data.id])).n),0);
});
