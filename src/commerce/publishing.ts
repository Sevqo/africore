import {assetReferences} from '../publishing/assets';
import {checkoutReadiness} from './checkout-policy';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {dbAll,dbGet,dbRun} from '../db/adapter';
import {type Access,fail} from '../platform/auth';
import {seal,unseal,hash,now} from '../platform/crypto';
import {operation,decode,update,read} from '../erp/store';
import {requireServices} from '../marketplace/engine';
import {store} from './catalog';
import {publicSlug} from './contracts';
import {canonical} from '../finance/service';

const publicationContext=(a:Pick<Access,'org'|'environment'>,id:string,version:number)=>JSON.stringify(['commerce-publication',a.org,a.environment,id,version]);
export const publishInput=z.object({expected_version:z.number().int().positive(),review_hash:z.string().regex(/^[a-f0-9]{64}$/),acknowledge_publication:z.literal(true)}).strict();
const publicationStateInput=z.object({expected_publication_version:z.number().int().positive(),acknowledge_unpublish:z.literal(true)}).strict();

async function publicationDraft(a:Access,id:string){
 const s=await store(a,id,true);await requireServices(a,['products']);
 const rows=await dbAll("SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='commerce_listing' AND status='active' ORDER BY position,id LIMIT 501",[a.org,a.environment,id]);if(!rows.length||rows.length>500)fail(409,'Publish between one and 500 active listings');
 const products=await dbAll('SELECT id,name,status,version,data FROM ac_products WHERE org_id=? AND environment=? AND id IN ('+rows.map(()=>'?').join(',')+')',[a.org,a.environment,...rows.map(r=>r.parent_id)]),byId=new Map(products.map(p=>[p.id,p]));
 const mediaIds=[...new Set([...rows.flatMap(row=>decode(a,row).data.asset_ids as string[]),...(s.data.settings.logo_asset_id?[s.data.settings.logo_asset_id]:[])])],media=new Map((await assetReferences(a,mediaIds)).map(asset=>[asset.id,asset]));
 const listings=rows.map(row=>{const l=decode(a,row),p=byId.get(l.parent_id!);if(!p||p.status!=='active')fail(409,'Every published listing needs a current active canonical product');const product=JSON.parse(p.data);if(product.currency!==s.data.settings.currency)fail(409,'Published product currencies must match the store');return {id:l.id,version:l.version,product_id:p.id,product_version:Number(p.version),title:l.data.title||p.name,description:l.data.description,assets:l.data.asset_ids.map((id:string)=>media.get(id)),collection_ids:l.data.collection_ids};});
 const collections=(await dbAll("SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='commerce_collection' AND status='active' ORDER BY created_at,id LIMIT 51",[a.org,a.environment,id])).map(row=>{const c=decode(a,row);return {id:c.id,name:c.data.name,description:c.data.description};});
 const settings=s.data.settings;
 const manifest={schema_version:1,store_id:s.id,store_version:s.version,name:settings.name,slug:settings.slug,currency:settings.currency,theme:settings.theme,logo_asset:settings.logo_asset_id?media.get(settings.logo_asset_id):null,description:settings.description,brand_color:settings.brand_color,navigation:settings.navigation,seo:settings.seo,tax_label:settings.tax_label,tax_bps:settings.tax_bps,listings,collections};
 const serialized=canonical(manifest);if(Buffer.byteLength(serialized)>1048576)fail(413,'The published catalog snapshot must fit within 1 MiB');
 return {store:s,manifest,review_hash:hash(serialized),disclosure:'This publishes the reviewed store name, text, navigation, collections and listing descriptions at an AfriCore storefront URL. Current canonical prices and availability remain authoritative. Separately uploaded, reviewed public-use images are included. No private contact, supplier cost, warehouse, customer, payment or document data is published.'};
}
export async function previewPublication(a:Access,id:string){const d=await publicationDraft(a,id);return {manifest:d.manifest,expected_version:d.store.version,review_hash:d.review_hash,disclosure:d.disclosure};}
export async function publishStore(a:Access,id:string,input:unknown,key:string){const d=publishInput.parse(input);return operation(a,'commerce.store.publish:'+id,key,d,async()=>{await store(a,id,true);},async()=>{
 const draft=await publicationDraft(a,id);if(draft.store.version!==d.expected_version||draft.review_hash!==d.review_hash)fail(409,'Publication changed; preview and review the current version again');
 const prior=await dbGet('SELECT * FROM ac_publications WHERE org_id=? AND environment=? AND source_id=?',[a.org,a.environment,id]),taken=await dbGet('SELECT source_id FROM ac_publications WHERE environment=? AND slug=?',[a.environment,draft.manifest.slug]);if(taken&&taken.source_id!==id)fail(409,'That storefront name is reserved; choose another slug');
 if(prior&&prior.slug!==draft.manifest.slug)fail(409,'A published storefront address cannot be reassigned');
 const publicationId=prior?.id||randomUUID(),version=Number(prior?.version||0)+1,at=now(),snapshot=seal(JSON.stringify(draft.manifest),publicationContext(a,publicationId,version),'2');
 if(prior)await dbRun('UPDATE ac_publications SET slug=?,version=?,snapshot=?,active=1,published_by=?,published_at=? WHERE id=? AND org_id=? AND environment=?',[draft.manifest.slug,version,snapshot,a.actor,at,publicationId,a.org,a.environment]);
 else await dbRun('INSERT INTO ac_publications(id,org_id,environment,source_id,source_kind,slug,version,snapshot,active,published_by,published_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)',[publicationId,a.org,a.environment,id,'commerce',draft.manifest.slug,version,snapshot,a.actor,at]);
 await dbRun('INSERT INTO ac_publication_versions(publication_id,version,snapshot,actor,created_at) VALUES (?,?,?,?,?)',[publicationId,version,snapshot,a.actor,at]);
 await update(a,draft.store,{...draft.store.data,publication:{id:publicationId,version,published_at:at}},{status:'published'},'published');
 return {id:publicationId,version,store_id:id,path:'/s/'+a.environment+'/'+draft.manifest.slug,published_at:at,disclosure:draft.disclosure};
 });}
export async function unpublishStore(a:Access,id:string,input:unknown,key:string){const d=publicationStateInput.parse(input);return operation(a,'commerce.store.unpublish:'+id,key,d,async()=>{await store(a,id,true);},async()=>{const s=await store(a,id,true),p=await dbGet('SELECT id,version FROM ac_publications WHERE org_id=? AND environment=? AND source_id=?',[a.org,a.environment,id]);if(!p||Number(p.version)!==d.expected_publication_version)fail(409,'Published revision changed; reload');await dbRun('UPDATE ac_publications SET active=0 WHERE id=?',[p.id]);await update(a,s,{...s.data,publication:{...s.data.publication,active:false}},{status:'draft'},'unpublished');return {id:p.id,unpublished:true,history_retained:true};});}

/** Intentionally public projection. No tenant/member cookies grant extra data. */
export async function publishedStoreContext(environment:string,slug:string){
 z.enum(['sandbox','production']).parse(environment);publicSlug.parse(slug);
 const p=await dbGet("SELECT p.* FROM ac_publications p JOIN ac_workspaces w ON w.id=p.org_id WHERE p.environment=? AND p.slug=? AND p.active=1 AND p.source_kind='commerce' AND w.kind='business' AND w.status='active'",[environment,slug]);if(!p)fail(404,'Storefront not found');
 const a:Access={org:p.org_id,environment,actor:'public-store',role:'viewer',api:false};for(const id of ['commerce','products']){const service=await dbGet('SELECT e.status,s.enabled FROM ac_service_entitlements e JOIN ac_services s ON s.id=e.service_id WHERE e.org_id=? AND e.environment=? AND e.service_id=?',[a.org,environment,id]);if(!service||Number(service.enabled)!==1||service.status!=='active')fail(404,'Storefront not found');}
 const manifest=JSON.parse(unseal(p.snapshot,publicationContext(a,p.id,Number(p.version)))),s=await read(a,p.source_id,'commerce_store');
 return {a,publication:p,manifest,store:s};
}
export async function publicStore(environment:string,slug:string,input:unknown={}){
 const q=z.object({q:z.string().max(100).default(''),collection:z.string().uuid().optional(),offset:z.coerce.number().int().min(0).max(500).default(0)}).strict().parse(input),context=await publishedStoreContext(environment,slug),{a,manifest,publication:p}=context,ids=manifest.listings.map((l:any)=>l.product_id);
 const current=ids.length?await dbAll('SELECT id,name,status,version,data FROM ac_products WHERE org_id=? AND environment=? AND id IN ('+ids.map(()=>'?').join(',')+')',[a.org,environment,...ids]):[],byId=new Map(current.map(row=>[row.id,row]));
 const listed=await dbAll("SELECT * FROM ac_erp_objects WHERE org_id=? AND environment=? AND root_id=? AND kind='commerce_listing' AND status='active'",[a.org,environment,manifest.store_id]),active=new Map(listed.map(l=>[l.id,decode(a,l)]));
 const visible=manifest.listings.flatMap((l:any)=>{const row=byId.get(l.product_id);if(!row||row.status!=='active'||!active.has(l.id))return [];const d=JSON.parse(row.data);if(d.currency!==manifest.currency||q.collection&&!l.collection_ids.includes(q.collection))return [];if(q.q&&![l.title,l.description,row.name,d.sku].join(' ').toLowerCase().includes(q.q.toLowerCase()))return [];return [{listing_id:l.id,product_id:row.id,product_version:Number(row.version),name:l.title,description:l.description,sku:d.sku,variant:d.variant,images:l.assets||[],compare_at_minor:active.get(l.id)!.data.compare_at_minor>Number(d.sale_price_minor)?active.get(l.id)!.data.compare_at_minor:null,parent_id:d.parent_id,unit:d.unit,unit_price_minor:Number(d.sale_price_minor),currency:d.currency,track_inventory:d.track_inventory,minimum_quantity_milli:active.get(l.id)!.data.minimum_quantity_milli,maximum_quantity_milli:active.get(l.id)!.data.maximum_quantity_milli}];});
 const {listings:_listings,store_version:_storeVersion,...presentation}=manifest;
 const readiness=await checkoutReadiness(a,context.store),shipping_options=(context.store.data.shipping||[]).filter((o:any)=>o.active).map((o:any)=>({id:o.id,name:o.name,kind:o.kind,countries:o.countries,rate_minor:o.rate_minor}));
 return {...presentation,environment,publication_version:Number(p.version),published_at:p.published_at,products:visible.slice(q.offset,q.offset+24),has_more:visible.length>q.offset+24,total:visible.length,catalog_limit:500,coverage:'Only published products are shown. Price and availability are checked again before an order can be placed. Store content is supplied by the merchant.',checkout_available:readiness.available,payment_readiness:readiness.reason,shipping_options};
}
