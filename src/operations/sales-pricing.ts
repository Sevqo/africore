import {z} from 'zod';
import {dbGet} from '../db';
import {type Access,fail} from '../platform/auth';
import {currencySchema,documentSchema,totals} from '../platform/domain';
import {record} from '../platform/payments';
import {financialOperation} from '../finance/service';
import {product,snapshotCatalogItems} from '../inventory/service';
import {quantityMilli} from '../inventory/quantity';
import {requireServices} from '../marketplace/engine';
import {all,get,create,change,day} from './store';

export const priceListInput=z.object({name:z.string().trim().min(2).max(120),currency:currencySchema,customer_id:z.string().uuid().nullable().default(null),starts_on:z.string().date(),ends_on:z.string().date().nullable().default(null),active:z.boolean().default(true),rules:z.array(z.object({product_id:z.string().uuid(),minimum_quantity_milli:z.number().int().positive().max(1e12),unit_price_minor:z.number().int().min(0).max(1e10)}).strict()).min(1).max(200)}).strict();
export const priceListEditInput=z.object({expected_version:z.number().int().min(0),configuration:priceListInput}).strict();
export const pricingPreviewInput=z.object({price_list_id:z.string().uuid(),document:documentSchema}).strict();
export async function priceLists(a:Access){return {data:await all(a,'sales_pricelist')};}
export async function savePriceList(a:Access,id:string|null,input:unknown,key:string){
 const d=priceListEditInput.parse(input);
 return financialOperation(a,'sales.pricelist:'+String(id),key,d,async()=>{
  await requireServices(a,['sales']);
  const member=await dbGet('SELECT role FROM ac_memberships WHERE org_id=? AND user_id=?',[a.org,a.actor]);if(a.api||!member||!['owner','admin'].includes(member.role))fail(403,'Current human owner or administrator required');
  const old=id?await get(a,id,'sales_pricelist'):null;if(Number(old?.version||0)!==d.expected_version)fail(409,'Price list changed; reload');
  const c=d.configuration;if(c.ends_on&&c.ends_on<c.starts_on)fail(400,'Price list dates are reversed');if(c.customer_id)await record(a,c.customer_id,'customers');
  const unique=new Set<string>();for(const rule of c.rules){const p=await product(a,rule.product_id);if(p.status!=='active'||p.currency!==c.currency)fail(400,'Price rules require active products in the same currency');if(['unit','box'].includes(p.unit)&&rule.minimum_quantity_milli%1000)fail(400,'Whole product units require whole pricing thresholds');const key=rule.product_id+':'+rule.minimum_quantity_milli;if(unique.has(key))fail(400,'Duplicate product quantity tier');unique.add(key);}
  return old?change(a,old,c):create(a,'sales_pricelist',c);
 });
}
export async function pricingPreview(a:Access,input:unknown){
 const d=pricingPreviewInput.parse(input);await requireServices(a,['sales']);const list=await get(a,d.price_list_id,'sales_pricelist'),customer=await record(a,d.document.customer_id,'customers');
 if(customer.status==='archived'||!list.active||list.starts_on>day()||list.ends_on&&list.ends_on<day())fail(409,'Price list or customer is not currently available');
 if(list.currency!==d.document.currency||list.customer_id&&list.customer_id!==d.document.customer_id)fail(400,'Price list customer and currency must match');
 const items=[];for(const item of d.document.items){if(!item.product_id){items.push(item);continue;}const p=await product(a,item.product_id);if(p.status!=='active'||p.currency!==d.document.currency)fail(400,'Choose an active product in this currency');const rules=(list.rules as z.infer<typeof priceListInput>['rules']).filter(r=>r.product_id===item.product_id&&r.minimum_quantity_milli<=quantityMilli(item.quantity)).sort((x,y)=>y.minimum_quantity_milli-x.minimum_quantity_milli);items.push({...item,unit_price_minor:rules[0]?.unit_price_minor??item.unit_price_minor});}
 const document={...d.document,items};return {document:{...document,...totals(document)},price_list:{id:list.id,name:list.name,version:list.version,currency:list.currency},notice:'Review these exact prices before saving. This preview creates no quotation, reservation, invoice or payment.'};
}

export const salesTemplateInput=z.object({expected_version:z.number().int().min(0),name:z.string().trim().min(2).max(120),active:z.boolean().default(true),configuration:documentSchema.omit({customer_id:true,issue_date:true,due_date:true,order_id:true,number:true}).extend({due_days:z.number().int().min(0).max(365).default(30),valid_days:z.number().int().min(0).max(365).default(30)})}).strict();
export async function salesTemplates(a:Access){return {data:await all(a,'sales_template')};}
export async function saveSalesTemplate(a:Access,id:string|null,input:unknown,key:string){const d=salesTemplateInput.parse(input);return financialOperation(a,'sales.template:'+String(id),key,d,async()=>{await requireServices(a,['sales']);const old=id?await get(a,id,'sales_template'):null;if(Number(old?.version||0)!==d.expected_version)fail(409,'Quotation template changed; reload');await snapshotCatalogItems(a,d.configuration.items);for(const item of d.configuration.items)if(item.product_id&&(await product(a,item.product_id)).currency!==d.configuration.currency)fail(400,'Template products must use its currency');totals({...d.configuration,customer_id:'',issue_date:day(),due_date:day()});const data={name:d.name,active:d.active,configuration:d.configuration};return old?change(a,old,data):create(a,'sales_template',data);});}
