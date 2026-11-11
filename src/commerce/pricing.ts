import {cartInput,discountPolicy,shippingOption,type DiscountPolicy,type ShippingOption} from './contracts';
import {basisPoints,exactNumber,sumMinor} from '../finance/money';

export interface CartProduct {id:string;version:number;sku:string;name:string;currency:string;sale_price_minor:number;unit:string;status:string;publication_status:string;minimum_quantity_milli:number;maximum_quantity_milli:number;track_inventory:boolean;available_milli:number|null}
function reject(message:string):never{throw Object.assign(new Error(message),{status:409});}
const bounded=(n:number)=>{if(!Number.isSafeInteger(n)||n<0||n>1e11)reject('Cart amount exceeds supported precision');return n;};
/** Internal calculation only. Callers load current scoped products/rules, never
 * accept these authoritative inputs from a guest request or stored browser cart. */
export function quoteCart(input:unknown,products:CartProduct[],policy:{currency:string;tax_bps:number;discount?:DiscountPolicy|null;shipping?:ShippingOption|null;country?:string;at:string}){
 const cart=cartInput.parse(input);
 if(!Number.isInteger(policy.tax_bps)||policy.tax_bps<0||policy.tax_bps>10000||!Number.isFinite(Date.parse(policy.at)))reject('Invalid current pricing policy');
 const byId=new Map(products.map(p=>[p.id,p]));if(byId.size!==products.length)reject('Ambiguous canonical product identity');
 const lines=cart.items.map(item=>{
  const p=byId.get(item.product_id);if(!p||p.status!=='active'||p.publication_status!=='active')reject('A product is not currently available for this store');
  if(p.currency!==policy.currency)reject('Mixed-currency checkout is not supported');
  if(!Number.isSafeInteger(p.sale_price_minor)||p.sale_price_minor<0||p.sale_price_minor>1e10)reject('Canonical price requires review');
  if(item.quantity_milli<p.minimum_quantity_milli||item.quantity_milli>p.maximum_quantity_milli)reject('Quantity is outside the current publication limits');
  if(['unit','box'].includes(p.unit)&&item.quantity_milli%1000!==0)reject('This product requires whole units');
  if(p.track_inventory&&p.available_milli===null)reject('Current stock coverage is unavailable');
  if(p.available_milli!==null&&(!Number.isSafeInteger(p.available_milli)||item.quantity_milli>p.available_milli))reject('Current stock is insufficient');
  const subtotal_minor=bounded(exactNumber((BigInt(p.sale_price_minor)*BigInt(item.quantity_milli)+500n)/1000n));
  return {product_id:p.id,product_version:p.version,sku:p.sku,name:p.name,quantity_milli:item.quantity_milli,unit_price_minor:p.sale_price_minor,subtotal_minor};
 });
 const subtotal_minor=bounded(sumMinor(lines.map(l=>l.subtotal_minor)));let discount_minor=0;
 if(cart.discount_code){
  const d=policy.discount?discountPolicy.parse(policy.discount):null;
  if(!d||!d.active||d.code!==cart.discount_code.toUpperCase()||Date.parse(policy.at)<Date.parse(d.starts_at)||Date.parse(policy.at)>=Date.parse(d.ends_at)||subtotal_minor<d.minimum_subtotal_minor)reject('Discount is not eligible for this checkout');
  discount_minor=Math.min(subtotal_minor,d.kind==='percentage'?basisPoints(subtotal_minor,d.value):d.value,d.maximum_discount_minor??1e11);
 }
 let shipping_minor=0;let shipping_snapshot:ShippingOption|null=null;
 if(cart.shipping_option_id){
  const s=policy.shipping?shippingOption.parse(policy.shipping):null;if(!s||!s.active||s.id!==cart.shipping_option_id||!policy.country||!s.countries.includes(policy.country))reject('Delivery option is not eligible for this checkout');
  shipping_minor=s.free_above_minor!==null&&subtotal_minor-discount_minor>=s.free_above_minor?0:s.rate_minor;shipping_snapshot=s;
 }else if(policy.shipping)reject('Choose the current delivery option');
 // Match the canonical document policy: shipping is a separate fee line,
 // and the configured rate applies to the discounted invoice subtotal.
 const taxable_minor=sumMinor([subtotal_minor-discount_minor,shipping_minor]),tax_minor=basisPoints(taxable_minor,policy.tax_bps),total_minor=bounded(sumMinor([taxable_minor,tax_minor]));
 return {currency:policy.currency,lines,subtotal_minor,discount_minor,taxable_minor,tax_minor,shipping_minor,total_minor,shipping_snapshot,calculation_version:1,tax_basis:'discounted_goods_and_shipping',quoted_at:policy.at};
}
