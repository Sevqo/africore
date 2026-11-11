import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {configureTestEnv} from './helpers';
configureTestEnv('commerce-pricing');
import {cartInput,storeSettings,listingInput,navigationLink,checkoutContact} from '../commerce/contracts';
import {totals} from '../platform/domain';
import {orderedServiceSelection} from '../common/service-selection';
import {quoteCart,type CartProduct} from '../commerce/pricing';
const product:CartProduct={id:randomUUID(),version:3,sku:'SYNTHETIC',name:'Fictional product',currency:'KES',sale_price_minor:12000,unit:'unit',status:'active',publication_status:'active',minimum_quantity_milli:1000,maximum_quantity_milli:100000,track_inventory:true,available_milli:10000};
const cart={items:[{product_id:product.id,quantity_milli:2000}]};
const policy={currency:'KES',tax_bps:1600,at:'2026-11-05T12:00:00.000Z'};

test('commerce quotes canonical integer prices and keeps tax, shipping and discounts explicit',()=>{
 const shipping={id:randomUUID(),name:'Fictional pickup',kind:'pickup' as const,countries:['KE'],rate_minor:1000,free_above_minor:null,active:true};
 const discount={code:'QA10',kind:'percentage' as const,value:1000,minimum_subtotal_minor:0,maximum_discount_minor:null,starts_at:'2026-11-01T00:00:00Z',ends_at:'2026-12-01T00:00:00Z',active:true};
 const result=quoteCart({...cart,discount_code:'qa10',shipping_option_id:shipping.id},[product],{...policy,discount,shipping,country:'KE'});
 assert.equal(result.subtotal_minor,24000);assert.equal(result.discount_minor,2400);assert.equal(result.tax_minor,3616);assert.equal(result.shipping_minor,1000);assert.equal(result.total_minor,26216);assert.equal(result.lines[0].product_version,3);assert.equal(result.tax_basis,'discounted_goods_and_shipping');const canonical=totals({customer_id:product.id,currency:'KES',items:[{description:'Goods',quantity:2,unit_price_minor:12000},{description:'Delivery',quantity:1,unit_price_minor:1000}],discount_minor:2400,tax_bps:1600,issue_date:'2026-11-05',due_date:'2026-11-05',notes:'',terms:'',payment_instructions:''});assert.equal(result.total_minor,canonical.total_minor);assert.equal(result.tax_minor,canonical.tax_minor);
});
test('guest prices, totals, duplicated lines and fractional integer-unit products are rejected',()=>{
 for(const extra of [{total_minor:1},{currency:'USD'},{discount_minor:999999}])assert.throws(()=>cartInput.parse({...cart,...extra}));
 assert.throws(()=>cartInput.parse({items:[...cart.items,...cart.items]}));
 assert.throws(()=>cartInput.parse({items:[{...cart.items[0],unit_price_minor:1}]}));
 assert.throws(()=>quoteCart({items:[{product_id:product.id,quantity_milli:1500}]},[product],policy),/whole units/);
});
test('unpublished, archived, absent and mixed-currency products do not quote',()=>{
 for(const products of [[],[{...product,publication_status:'draft'}],[{...product,status:'archived'}]])assert.throws(()=>quoteCart(cart,products,policy),/available/);
 assert.throws(()=>quoteCart(cart,[{...product,currency:'USD'}],policy),/currency/);
 assert.throws(()=>quoteCart(cart,[product,product],policy),/Ambiguous/);
});
test('stock and merchant quantity boundaries are authoritative',()=>{
 assert.throws(()=>quoteCart(cart,[{...product,available_milli:null}],policy),/coverage/);
 assert.throws(()=>quoteCart(cart,[{...product,available_milli:1000}],policy),/stock/);
 assert.throws(()=>quoteCart(cart,[{...product,minimum_quantity_milli:3000}],policy),/limits/);
 assert.throws(()=>quoteCart(cart,[{...product,maximum_quantity_milli:1000}],policy),/limits/);
});
test('fractional products round once in minor units and reject unsafe totals',()=>{
 const result=quoteCart({items:[{product_id:product.id,quantity_milli:1500}]},[{...product,unit:'kg',sale_price_minor:101}],{...policy,tax_bps:0});assert.equal(result.total_minor,152);
 assert.throws(()=>quoteCart({items:[{product_id:product.id,quantity_milli:100000000}]},[{...product,sale_price_minor:1e10,maximum_quantity_milli:1e8,available_milli:1e8}],policy),/precision/);
});
test('discount dates, minimums, inactive codes and excessive percentages fail closed',()=>{
 const discount={code:'QA10',kind:'percentage' as const,value:1000,minimum_subtotal_minor:0,maximum_discount_minor:null,starts_at:'2026-11-01T00:00:00Z',ends_at:'2026-12-01T00:00:00Z',active:true};
 const input={...cart,discount_code:'QA10'};
 for(const candidate of [null,{...discount,active:false},{...discount,minimum_subtotal_minor:25000},{...discount,value:10001},{...discount,code:'OTHER'}])assert.throws(()=>quoteCart(input,[product],{...policy,discount:candidate}));
 assert.throws(()=>quoteCart(input,[product],{...policy,discount,at:discount.ends_at}),/eligible/);
 const capped=quoteCart(input,[product],{...policy,discount:{...discount,maximum_discount_minor:300}});assert.equal(capped.discount_minor,300);
});
test('shipping requires exact current option and eligible country; free threshold follows discount',()=>{
 const shipping={id:randomUUID(),name:'Fictional delivery',kind:'shipping' as const,countries:['KE'],rate_minor:500,free_above_minor:20000,active:true};
 assert.equal(quoteCart({...cart,shipping_option_id:shipping.id},[product],{...policy,shipping,country:'KE'}).shipping_minor,0);
 for(const changed of [{country:'UG'},{shipping:{...shipping,active:false}},{shipping:{...shipping,id:randomUUID()}}])assert.throws(()=>quoteCart({...cart,shipping_option_id:shipping.id},[product],{...policy,shipping,country:'KE',...changed}),/eligible/);
 assert.throws(()=>quoteCart(cart,[product],{...policy,shipping,country:'KE'}),/Choose/);
});
test('store and listing schemas bound publication separately from canonical inventory',()=>{
 assert.equal(storeSettings.parse({name:'Fictional store',slug:'fictional-store'}).currency,'KES');
 assert.throws(()=>storeSettings.parse({name:'Store',slug:'api'}));assert.throws(()=>storeSettings.parse({name:'Store',slug:'valid-store',timezone:'Invalid/Zone'}));assert.throws(()=>storeSettings.parse({name:'Store',slug:'valid-store',script:'alert(1)'}));
 const parsed=listingInput.parse({expected_version:0,product_id:product.id,expected_product_version:3});assert.equal(parsed.state,'draft');assert.ok(!('track_inventory' in parsed));
});
test('navigation rejects executable, credentialed and encoded authority/control URLs',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,hello','//example.test','https://user:password@example.test','/bad%5cpath','/bad%00path','https://example.test/\\evil'])assert.equal(navigationLink.safeParse(value).success,false,value);
 for(const value of ['/collections/fictional','https://example.test/catalog'])assert.equal(navigationLink.safeParse(value).success,true,value);
});
test('guest checkout contact does not accept account identity, authorization or fabricated consent timestamps',()=>{
 const input={name:'Fictional buyer',email:'buyer@example.test',delivery_address:null,consent_notice_version:'notice-v1'};assert.equal(checkoutContact.parse(input).marketing_opt_in,false);
 for(const extra of [{user_id:randomUUID()},{email_verified:true},{role:'owner'},{consented_at:'2026-11-01'}])assert.throws(()=>checkoutContact.parse({...input,...extra}));
});

test('explicit service dependencies activate in order without adding unselected services',()=>{assert.deepEqual(orderedServiceSelection(['commerce','products']),['products','commerce']);assert.deepEqual(orderedServiceSelection(['commerce']),['commerce']);});
