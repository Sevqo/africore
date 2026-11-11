import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {dbGet,dbRun,dbTransaction} from '../db/adapter';
import {fail} from '../platform/auth';
import {hash,secret,now} from '../platform/crypto';
import {canonical} from '../finance/service';
import {documentBalance} from '../finance/ledger';
import {record} from '../platform/payments';
import {checkLimits,recordUsage} from '../marketplace/engine';
import {operation} from '../erp/store';
import {publishedStoreContext} from './publishing';
import {checkoutExecutor,checkoutReadiness} from './checkout-policy';
import {cartInput,checkoutContact} from './contracts';
import {calculateStoreCart} from './quote';
import {CART_LIFETIME_MS,cartSession,cartAccess,sealCart} from './cart-access';
import {createCheckoutSale} from './checkout-sale';

export const cartCreateInput=z.object({new_cart:z.boolean().default(false)}).strict();
export const cartUpdateInput=z.object({expected_version:z.number().int().positive(),cart:z.object({items:z.array(cartInput.shape.items.element).max(99),discount_code:cartInput.shape.discount_code,shipping_option_id:cartInput.shape.shipping_option_id}).strict().refine(c=>new Set(c.items.map(i=>i.product_id)).size===c.items.length,'Combine repeated product lines'),country:z.string().regex(/^[A-Z]{2}$/),contact:checkoutContact.nullable().optional()}).strict();
export function stableCartQuote(quote:any,cartVersion:number,publicationVersion:number){const {quoted_at:_at,reservation:_reservation,...stable}=quote;return hash(canonical({quote:stable,cart_version:cartVersion,publication_version:publicationVersion}));}
export const cartConfirmInput=z.object({expected_version:z.number().int().positive(),quote_hash:z.string().regex(/^[a-f0-9]{64}$/),acknowledge_test_purchase:z.literal(true)}).strict();

export async function confirmCart(environment:string,slug:string,token:string,input:unknown,key:string){
 const d=cartConfirmInput.parse(input),initial=await cartSession(environment,slug,token),a=cartAccess(initial),fingerprint=hash(canonical(d));
 return operation(a,'commerce.cart.confirm:'+initial.id,key,d,async()=>{await activeCart(environment,slug,token);},async()=>{
  const {cart,published}=await activeCart(environment,slug,token);
  if(cart.status==='converted'){if(cart.data.confirmation_fingerprint!==fingerprint)fail(409,'This cart has already been checked out with different details');return {id:cart.id,version:cart.version};}
  if(cart.status!=='open'||cart.version!==d.expected_version)fail(409,'Cart changed; refresh before placing the order');
  if(!cart.data.contact||cart.data.contact.consent_notice_version!==published.store.data.checkout_policy.consent_notice_version)fail(409,'Review the current checkout notice and save your contact details');
  validatePublishedItems(published.manifest,cart.data.cart.items);
  const quote=await calculateStoreCart(a,published.store,{cart:cart.data.cart,country:cart.data.country});
  if(stableCartQuote(quote,cart.version,Number(published.publication.version))!==d.quote_hash)fail(409,'Price, availability or store settings changed; review your refreshed cart');
  const owner=await checkoutExecutor(published.a,published.store),executor={...a,actor:'commerce-checkout:'+cart.id};
  await checkLimits(a,'commerce',1);
  const checkout=await createCheckoutSale(executor,published.store,cart,quote,owner.actor);
  await dbRun('INSERT INTO ac_commerce_order_links(cart_id,org_id,environment,store_id,order_id,invoice_id,created_at) VALUES (?,?,?,?,?,?,?)',[cart.id,a.org,a.environment,published.store.id,checkout.order_id,checkout.invoice_id,now()]);
  const data={...cart.data,accepted_quote:quote,confirmation_fingerprint:fingerprint,checkout,converted_at:now()};
  const changed=await dbRun("UPDATE ac_commerce_carts SET data=?,status='converted',version=version+1,updated_at=? WHERE id=? AND org_id=? AND environment=? AND version=? AND status='open'",[sealCart(cart,data),now(),cart.id,a.org,a.environment,cart.version]);if(!changed.changes)fail(409,'Cart changed; refresh your order receipt');
  await checkLimits(a,'commerce',1);await recordUsage(a,'commerce','checkout:'+cart.id,1,'commerce_checkout_confirmed');
  return {id:cart.id,version:cart.version+1};
 },{meter:false});
}

async function activeCart(environment:string,slug:string,token:string){
 const cart=await cartSession(environment,slug,token),published=await publishedStoreContext(environment,slug);if(cart.store_id!==published.store.id||cart.org_id!==published.a.org)fail(404,'Cart not found');await checkoutExecutor(published.a,published.store);return {cart,published};
}
export function validatePublishedItems(manifest:any,items:{product_id:string}[]){const published=new Set(manifest.listings.map((l:any)=>l.product_id));if(items.some(item=>!published.has(item.product_id)))fail(404,'A product is not published in this store');}
export async function createCart(environment:string,slug:string,input:unknown,existingToken:string|null){
 const d=cartCreateInput.parse(input);
 if(existingToken&&!d.new_cart){try{const existing=await cartSession(environment,slug,existingToken);return {cart:await getCart(environment,slug,existingToken),token:null,created:false,id:existing.id};}catch(e){if(![404,410].includes((e as any).status))throw e;}}
 return dbTransaction(async()=>{
  const published=await publishedStoreContext(environment,slug),a=published.a;await dbRun('UPDATE ac_organizations SET name=name WHERE id=?',[a.org]);
  // Re-resolve after taking the organization lock so publication, service and
  // policy changes cannot race cart creation.
  const current=await publishedStoreContext(environment,slug);await checkoutExecutor(current.a,current.store);await checkLimits(a,'commerce',1);
  const count=await dbGet('SELECT COUNT(*) AS n FROM ac_commerce_carts WHERE org_id=? AND environment=? AND store_id=? AND created_at>=?',[a.org,environment,current.store.id,new Date(Date.now()-86400000).toISOString()]);if(Number(count.n)>=500)fail(429,'This store has reached its evaluation checkout limit. Please try later.');
  const id=randomUUID(),token=secret(),at=now(),row={id,org_id:a.org,environment,store_id:current.store.id},data={cart:{items:[],discount_code:'',shipping_option_id:null},country:'KE',contact:null};
  await dbRun("INSERT INTO ac_commerce_carts(id,org_id,environment,store_id,token_hash,status,data,version,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'open',?,1,?,?,?)",[id,a.org,environment,row.store_id,hash(token),sealCart(row,data),new Date(Date.now()+CART_LIFETIME_MS).toISOString(),at,at]);await recordUsage({...a,actor:'guest-cart:'+id},'commerce','cart-created:'+id,1,'guest_cart_created');
  return {cart:await getCart(environment,slug,token),token,created:true,id};
 });
}
export async function getCart(environment:string,slug:string,token:string|null){
 if(!token)return {status:'empty',version:0,items:[],quote:null,contact:null};
 const row=await cartSession(environment,slug,token),a=cartAccess(row);
 if(row.status==='converted'){
  const link=await dbGet('SELECT order_id,invoice_id FROM ac_commerce_order_links WHERE cart_id=? AND org_id=? AND environment=?',[row.id,row.org_id,row.environment]);if(!link)fail(409,'The checkout requires merchant review');
  const invoice=await documentBalance(a,link.invoice_id),order=await record(a,link.order_id,'orders');
  return {id:row.id,status:'converted',version:row.version,expires_at:row.expires_at,order:{reference:order.reference,status:order.status,payment_status:order.payment_status,fulfillment_status:order.fulfillment_status},invoice:{reference:invoice.reference,status:invoice.status,currency:invoice.currency,total_minor:invoice.total_minor,paid_minor:invoice.paid_minor,credited_minor:invoice.credited_minor,outstanding_minor:invoice.outstanding_minor},items:invoice.items.map((i:any)=>({description:i.description,quantity:i.quantity,unit_price_minor:i.unit_price_minor})),checkout_url:row.data.checkout?.url||null};
 }
 const result:any={id:row.id,status:'open',version:row.version,expires_at:row.expires_at,items:row.data.cart.items,cart:row.data.cart,country:row.data.country,contact:row.data.contact,quote:null,quote_hash:null};
 const published=await publishedStoreContext(environment,slug),readiness=await checkoutReadiness(published.a,published.store);result.checkout_available=readiness.available;result.consent_notice_version=readiness.consent_notice_version;result.shipping_options=(published.store.data.shipping||[]).filter((s:any)=>s.active&&s.countries.includes(row.data.country));
 if(!readiness.available){result.quote_error=readiness.reason;return result;}
 if(!row.data.cart.items.length)return result;
 try{validatePublishedItems(published.manifest,row.data.cart.items);const quote=await calculateStoreCart(a,published.store,{cart:row.data.cart,country:row.data.country});result.quote=quote;result.quote_hash=stableCartQuote(quote,row.version,Number(published.publication.version));if(quote.total_minor<=0)result.quote_error='This checkout requires a positive total. Contact the merchant for a free order.';}catch(e){if(![400,402,403,404,409].includes((e as any).status))throw e;result.quote_error=(e as Error).message;}
 return result;
}
export async function updateCart(environment:string,slug:string,token:string,input:unknown,key:string){
 const d=cartUpdateInput.parse(input),initial=await cartSession(environment,slug,token),a=cartAccess(initial);
 return operation(a,'commerce.cart.update:'+initial.id,key,d,async()=>{await activeCart(environment,slug,token);},async()=>{
  const {cart,published}=await activeCart(environment,slug,token);if(cart.status!=='open')fail(409,'This cart has already been checked out');if(cart.version!==d.expected_version)fail(409,'Cart changed; refresh it before saving');
  validatePublishedItems(published.manifest,d.cart.items);if(d.cart.items.length)await calculateStoreCart(a,published.store,{cart:d.cart,country:d.country});
  if(d.contact){if(d.contact.consent_notice_version!==published.store.data.checkout_policy.consent_notice_version)fail(409,'Review the current checkout notice before saving contact details');if(d.contact.delivery_address&&d.contact.delivery_address.country!==d.country)fail(400,'Delivery address and selected country must match');}
  const data={...cart.data,cart:d.cart,country:d.country,contact:d.contact===undefined?cart.data.contact:d.contact,contact_recorded_at:d.contact?now():cart.data.contact_recorded_at||null};
  const changed=await dbRun('UPDATE ac_commerce_carts SET data=?,version=version+1,updated_at=? WHERE id=? AND org_id=? AND environment=? AND version=?',[sealCart(cart,data),now(),cart.id,a.org,a.environment,cart.version]);if(!changed.changes)fail(409,'Cart changed; refresh before saving');
  return {id:cart.id,version:cart.version+1};
 });
}
