import {z} from 'zod';
import {dbGet} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {now} from '../platform/crypto';
import {product,locationBalance,warehouse} from '../inventory/service';
import {decode,type ERPObject} from '../erp/store';
import {requireServices} from '../marketplace/engine';
import {store} from './catalog';
import {cartInput} from './contracts';
import {quoteCart,type CartProduct} from './pricing';

export const quoteInput=z.object({cart:cartInput,country:z.string().regex(/^[A-Z]{2}$/)}).strict();
/** Authenticated draft preview. The later public-cart path must establish its
 * own published-store capability before reusing this authoritative calculation. */
export async function previewStoreCart(a:Access,id:string,input:unknown){
 return calculateStoreCart(a,await store(a,id),input);
}
/** Internal shared calculator: its caller establishes membership or a current
 * published-store capability. Each dependency is required independently. */
export async function calculateStoreCart(a:Access,s:ERPObject,input:unknown){
 const d=quoteInput.parse(input),id=s.id;await requireServices(a,['commerce']);await requireServices(a,['products']);
 const shipping=s.data.shipping?.find((r:any)=>r.id===d.cart.shipping_option_id&&r.active);if(!shipping)fail(409,'Choose a configured active shipping or pickup option');
 const products:CartProduct[]=[];
 for(const item of d.cart.items){
  const row=await dbGet("SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='commerce_listing' AND parent_id=?",[a.org,a.environment,id,item.product_id]);if(!row)fail(404,'Product is not listed in this store');
  const listing=decode(a,row),p=await product(a,item.product_id);let available_milli:number|null=null;
  if(p.track_inventory){await requireServices(a,['inventory']);if(!s.data.settings.warehouse_id)fail(409,'Configure a current fulfillment warehouse for tracked products');const w=await warehouse(a,s.data.settings.warehouse_id);if(w.status!=='active')fail(409,'The configured fulfillment warehouse is inactive');available_milli=(await locationBalance(a,p.id,w.id,s.data.settings.location_id||null)).available_milli;}
  products.push({id:p.id,version:p.version,sku:p.sku,name:listing.data.title||p.name,currency:p.currency,sale_price_minor:p.sale_price_minor,unit:p.unit,status:p.status,publication_status:listing.status,minimum_quantity_milli:listing.data.minimum_quantity_milli,maximum_quantity_milli:listing.data.maximum_quantity_milli,track_inventory:p.track_inventory,available_milli});
 }
 const discount=s.data.discounts?.find((r:any)=>r.code===d.cart.discount_code.toUpperCase());
 return {...quoteCart(d.cart,products,{currency:s.data.settings.currency,tax_bps:s.data.settings.tax_bps,at:now(),shipping,discount,country:d.country}),store_id:s.id,store_version:s.version,reservation:'No stock is reserved and no order or payment is created by this preview. Revalidate at checkout.'};
}
