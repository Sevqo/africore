import {type Access,fail} from '../platform/auth';
import {hash} from '../platform/crypto';
import {documentSchema,totals} from '../platform/domain';
import {canonical} from '../finance/service';
import {basisPoints} from '../finance/money';
import {record} from '../platform/payments';
import {product,warehouse,locationBalance} from '../inventory/service';
import {requireServices} from '../marketplace/engine';
import {businessPolicyFor} from '../operations/business-policy';
import {quoteCart,type CartProduct} from '../commerce/pricing';
import {read,insert,update,operation,type ERPObject} from '../erp/store';
import {saleDraftInput,editSaleDraftInput} from './contracts';
import {sessionAccess} from './sessions';

/** Current register and canonical products determine every monetary amount.
 * The caller's supplied draft contains quantities and an authorized discount,
 * never unit prices, tax rates, currency or claimed provider settlement. */
export async function quotePOSDraft(a:Access,sessionId:string,input:unknown){
 const d=saleDraftInput.parse(input),access=await sessionAccess(a,sessionId,{write:true}),{register,session}=access;
 if(session.status!=='open'||session.version!==d.expected_session_version)fail(409,'The open register session changed; reload its current quote');
 if(!access.manager&&d.customer_id&&d.customer_id!==register.data.default_customer_id)fail(403,'A register manager must select a customer other than the configured walk-in contact');
 const customer=await record(a,d.customer_id||register.data.default_customer_id,'customers');if(customer.status==='archived')fail(409,'Choose a current customer');
 const products:CartProduct[]=[];
 for(const item of d.items){
  const p=await product(a,item.product_id);let available_milli:number|null=null;
  if(p.track_inventory){
   await requireServices(a,['inventory']);
   if(!register.data.warehouse_id)fail(409,'Tracked POS products require a configured warehouse');
   const w=await warehouse(a,register.data.warehouse_id);if(w.status!=='active')fail(409,'The register warehouse is inactive');
   available_milli=(await locationBalance(a,p.id,w.id,register.data.location_id||null)).available_milli;
  }
  products.push({id:p.id,version:p.version,sku:p.sku,name:p.name,currency:p.currency,sale_price_minor:p.sale_price_minor,unit:p.unit,status:p.status,publication_status:'active',minimum_quantity_milli:1,maximum_quantity_milli:100_000_000,track_inventory:p.track_inventory,available_milli});
 }
 const policy=await businessPolicyFor(a),limit=Math.min(access.manager?register.data.manager_discount_bps:register.data.cashier_discount_bps,policy.configuration.discount_approval_bps);
 const current=quoteCart({items:d.items},products,{currency:register.data.currency,tax_bps:0,at:new Date().toISOString()});
 if(d.discount_minor>basisPoints(current.subtotal_minor,limit)||d.discount_minor>current.subtotal_minor)fail(409,'This discount exceeds the current cashier or reviewed Sales policy');
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:register.data.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const document=documentSchema.parse({customer_id:customer.id,currency:register.data.currency,items:current.lines.map(line=>({description:line.name,quantity:line.quantity_milli/1000,unit_price_minor:line.unit_price_minor,product_id:line.product_id,...(register.data.warehouse_id?{warehouse_id:register.data.warehouse_id}:{}),...(register.data.location_id?{location_id:register.data.location_id}:{})})),discount_minor:d.discount_minor,tax_bps:register.data.tax_bps??0,issue_date:date,due_date:date,notes:d.notes});
 const amounts=totals(document);if(amounts.total_minor<=0)fail(409,'POS checkout requires a positive invoice total');
 const binding={register_id:register.id,register_version:register.version,session_id:session.id,session_version:session.version,policy_version:policy.version,document,products:products.map(p=>({id:p.id,version:p.version,available_milli:p.available_milli})),amounts};
 return {...binding,quote_hash:hash(canonical(binding)),discount_limit_bps:limit,reservation:'Preview only; stock is reserved when the sale is confirmed.'};
}
export async function posSale(a:Access,id:string,write=false):Promise<ERPObject>{
 const sale=await read(a,id,'pos_sale');
 const sessionId=sale.parent_id||fail(409,'Sale has no register session');
 const {session}=await sessionAccess(a,sessionId,{write});
 if(sale.root_id!==session.root_id)fail(404,'Register sale not found');return sale;
}
export async function savePOSDraft(a:Access,sessionId:string,id:string|null,input:unknown,key:string){
 const d=id?editSaleDraftInput.parse(input):saleDraftInput.parse(input);
 const result=await operation(a,'pos.sale.draft:'+sessionId+':'+(id||'new'),key,d,()=>sessionAccess(a,sessionId,{write:true}),async()=>{
  const previous=id?await posSale(a,id,true):null;
  if(previous&&(previous.parent_id!==sessionId||previous.status!=='draft'||previous.version!==('expected_version' in d?d.expected_version:0)))fail(409,'Sale draft changed; reload before editing');
  const {expected_version:_version,...draft}='expected_version' in d?d:{...d,expected_version:0};
  const quote=await quotePOSDraft(a,sessionId,draft),data={draft,quote};
  const sale=previous?await update(a,previous,data):await insert(a,'pos_sale',data,{root:quote.register_id,parent:sessionId,status:'draft'});
  return {sale_id:sale.id};
 });return posSale(a,result.sale_id);
}
export async function currentSaleQuote(a:Access,id:string){
 const sale=await posSale(a,id,true);if(sale.status!=='draft')fail(409,'Only an unconfirmed sale can be quoted');
 const {session}=await sessionAccess(a,sale.parent_id!,{write:true});
 const {quote_hash:_hash,...quote}=await quotePOSDraft(a,session.id,{...sale.data.draft,expected_session_version:session.version});
 const binding={...quote,sale_id:sale.id,sale_version:sale.version};return {...binding,quote_hash:hash(canonical(binding))};
}
