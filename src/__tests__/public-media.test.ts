import {before, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {configureTestEnv} from './helpers';
configureTestEnv('public-media');
import sharp from 'sharp';
import {migrate, dbGet, dbRun, closeDb} from '../db';
import {createApp} from '../app';
import {canonicalPublicImage, MAX_IMAGE_BYTES} from '../publishing/image-validation';

let server:any,base:string,cookie='',org:string,actor:string,asset:any,store:any,listing:any,product:any,inputImage:string;
const root=()=>'/api/v1/organizations/'+org;
async function api(path:string,method='GET',body?:unknown,key=randomUUID()) {
  const r=await fetch(base+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':key},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||''};
}
const imageInput=()=>({label:'Fictional sample image',alt:'Fictional semitransparent blue rectangle',image_base64:inputImage,acknowledge_public_use:true,acknowledge_rights:true});
before(async()=>{
  await migrate();server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;
  const signup=await api('/api/auth/signup','POST',{email:randomUUID()+'@example.test',password:'Synthetic-public-media-2026!'});cookie=signup.cookie;
  await api('/api/auth/verify','POST',{token:signup.data.verification_token});actor=(await api('/api/auth/account')).data.user.id;
  const workspace=await api('/api/auth/workspaces','POST',{kind:'business',name:'Fictional public image tests',display_name:'Fictional owner',services:['products','commerce']});assert.equal(workspace.status,201,JSON.stringify(workspace.data));org=workspace.data.id;
  inputImage=(await sharp({create:{width:40,height:20,channels:4,background:{r:20,g:60,b:180,alpha:0.5}}}).withMetadata({orientation:6}).png().toBuffer()).toString('base64');
});
after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await closeDb();});

test('image decoding applies orientation, keeps transparency and removes embedded metadata',async()=>{
  assert.ok((await sharp(Buffer.from(inputImage,'base64')).metadata()).exif);
  const image=await canonicalPublicImage(inputImage),metadata=await sharp(image.bytes).metadata();
  assert.equal(metadata.format,'webp');assert.equal(image.width,20);assert.equal(image.height,40);assert.equal(metadata.hasAlpha,true);
  for(const field of ['exif','icc','iptc','xmp'])assert.equal((metadata as any)[field],undefined);
  for(const bad of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64'),Buffer.from('not an image').toString('base64'),inputImage+' ',Buffer.alloc(MAX_IMAGE_BYTES+1).toString('base64')])await assert.rejects(canonicalPublicImage(bad),(e:any)=>e.status===400);
  const oversized=await sharp({create:{width:4100,height:4100,channels:3,background:'#334455'}}).png().toBuffer();
  assert.ok(oversized.length<MAX_IMAGE_BYTES);
  await assert.rejects(canonicalPublicImage(oversized.toString('base64')),(e:any)=>e.status===400);
  const concurrent=await Promise.allSettled([canonicalPublicImage(inputImage),canonicalPublicImage(inputImage),canonicalPublicImage(inputImage)]);
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,2);assert.ok(concurrent.some(r=>r.status==='rejected'&&r.reason.status===429));
});

test('uploads require explicit public rights, retain encrypted custody and bind exact replay input',async()=>{
  assert.equal((await api(root()+'/commerce/assets','POST',{...imageInput(),acknowledge_rights:false})).status,400);
  const key=randomUUID(),saved=await api(root()+'/commerce/assets','POST',imageInput(),key);assert.equal(saved.status,201,JSON.stringify(saved.data));asset=saved.data;
  assert.equal(asset.mime,'image/webp');assert.equal(asset.width,20);assert.equal(asset.height,40);assert.ok(!JSON.stringify(asset).includes('image_base64'));
  assert.equal((await api(root()+'/commerce/assets','POST',imageInput(),key)).data.id,asset.id);
  assert.equal((await api(root()+'/commerce/assets','POST',{...imageInput(),alt:'Changed description'},key)).status,409);
  const row=await dbGet('SELECT data,image FROM ac_public_media WHERE id=?',[asset.id]);assert.ok(!row.data.includes('Fictional'));assert.ok(!row.image.includes(inputImage));
  await assert.rejects(dbRun('UPDATE ac_public_media SET image=? WHERE id=?',['changed',asset.id]),/immutable/);
  await assert.rejects(dbRun('DELETE FROM ac_public_media_events WHERE asset_id=?',[asset.id]),/immutable/);
  const list=await api(root()+'/commerce/assets');assert.equal(list.data.data.length,1);assert.ok(!JSON.stringify(list.data).includes(row.image));
  const revision=await api(root()+'/commerce/assets','POST',{...imageInput(),label:'Fictional image descriptive revision',alt:'Corrected fictional image description'});assert.equal(revision.status,201,JSON.stringify(revision.data));assert.notEqual(revision.data.id,asset.id);
  assert.equal((await api(root()+'/commerce/assets')).data.data.find((r:any)=>r.id===asset.id).alt,asset.alt);
});

test('images are inaccessible publicly until the current reviewed snapshot references them',async()=>{
  store=(await api(root()+'/commerce/stores','POST',{expected_version:0,store:{name:'Fictional media shop',slug:'fictional-media-shop'}})).data;
  product=(await api(root()+'/products','POST',{sku:'MEDIA-QA',name:'Fictional pictured product',sale_price_minor:12000,track_inventory:false})).data;
  listing=(await api(root()+'/commerce/stores/'+store.id+'/listings','POST',{expected_version:0,product_id:product.id,expected_product_version:product.version,state:'active'})).data;
  const preview=(await api(root()+'/commerce/stores/'+store.id+'/publication-preview')).data;
  assert.equal((await api(root()+'/commerce/stores/'+store.id+'/publish','POST',{expected_version:preview.expected_version,review_hash:preview.review_hash,acknowledge_publication:true})).status,200);
  assert.equal((await fetch(base+'/api/v1/storefronts/sandbox/fictional-media-shop/assets/'+asset.id)).status,404);
  const privateImage=await fetch(base+root()+'/commerce/assets/'+asset.id+'/content',{headers:{Cookie:cookie}});assert.equal(privateImage.status,200);assert.match(privateImage.headers.get('content-type')||'',/^image\/webp/);assert.equal(privateImage.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(base+root()+'/commerce/assets/'+asset.id+'/content')).status,401);
  await dbRun("UPDATE ac_memberships SET role='viewer' WHERE org_id=? AND user_id=?",[org,actor]);
  assert.equal((await fetch(base+root()+'/commerce/assets/'+asset.id+'/content',{headers:{Cookie:cookie}})).status,403);
  await dbRun("UPDATE ac_memberships SET role='owner' WHERE org_id=? AND user_id=?",[org,actor]);
});

test('publication includes only validated scoped media references and serves canonical raster bytes',async()=>{
  const foreign=(await api('/api/auth/workspaces','POST',{kind:'business',name:'Other fictional image scope',display_name:'Owner',services:['products','commerce']})).data;
  assert.equal((await fetch(base+'/api/v1/organizations/'+foreign.id+'/commerce/assets/'+asset.id+'/content',{headers:{Cookie:cookie}})).status,404);
  const saved=await api(root()+'/commerce/stores/'+store.id+'/listings/'+listing.id,'PUT',{expected_version:listing.version,product_id:product.id,expected_product_version:product.version,state:'active',asset_ids:[asset.id]});assert.equal(saved.status,200,JSON.stringify(saved.data));listing=saved.data;
  const preview=(await api(root()+'/commerce/stores/'+store.id+'/publication-preview')).data;assert.equal(preview.manifest.listings[0].assets[0].alt,asset.alt);assert.ok(!JSON.stringify(preview).includes('image_base64'));
  assert.equal((await api(root()+'/commerce/stores/'+store.id+'/publish','POST',{expected_version:preview.expected_version,review_hash:preview.review_hash,acknowledge_publication:true})).status,200);
  const publicView=await api('/api/v1/storefronts/sandbox/fictional-media-shop');assert.equal(publicView.data.products[0].images[0].id,asset.id);
  const image=await fetch(base+'/api/v1/storefronts/sandbox/fictional-media-shop/assets/'+asset.id);assert.equal(image.status,200);assert.match(image.headers.get('content-type')||'',/^image\/webp/);assert.equal(image.headers.get('x-content-type-options'),'nosniff');assert.equal(image.headers.get('cache-control'),'no-store');
  assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).exif,undefined);
  assert.equal((await fetch(base+'/api/v1/storefronts/sandbox/fictional-media-shop/assets/'+randomUUID())).status,404);
  const archived=await api(root()+'/commerce/stores/'+store.id+'/listings/'+listing.id,'PUT',{...listing.data,expected_version:listing.version,expected_product_version:product.version,state:'archived'});assert.equal(archived.status,200,JSON.stringify(archived.data));
  assert.equal((await fetch(base+'/api/v1/storefronts/sandbox/fictional-media-shop/assets/'+asset.id)).status,404);
  const restored=await api(root()+'/commerce/stores/'+store.id+'/listings/'+listing.id,'PUT',{...listing.data,expected_version:archived.data.version,expected_product_version:product.version,state:'active'});assert.equal(restored.status,200,JSON.stringify(restored.data));listing=restored.data;
  const archivedProduct=await api(root()+'/products/'+product.id,'PATCH',{expected_version:product.version,product:{sku:'MEDIA-QA',name:'Fictional pictured product',sale_price_minor:12000,track_inventory:false,status:'archived'}});assert.equal(archivedProduct.status,200,JSON.stringify(archivedProduct.data));
  assert.equal((await fetch(base+'/api/v1/storefronts/sandbox/fictional-media-shop/assets/'+asset.id)).status,404);
  const restoredProduct=await api(root()+'/products/'+product.id,'PATCH',{expected_version:archivedProduct.data.version,product:{sku:'MEDIA-QA',name:'Fictional pictured product',sale_price_minor:12000,track_inventory:false,status:'active'}});assert.equal(restoredProduct.status,200,JSON.stringify(restoredProduct.data));product=restoredProduct.data;
  assert.equal((await fetch(base+'/api/v1/storefronts/sandbox/fictional-media-shop/assets/'+asset.id)).status,200);
});

test('withdrawal stops public delivery immediately and retains immutable custody and history',async()=>{
  const before=await dbGet('SELECT data,image FROM ac_public_media WHERE id=?',[asset.id]),key=randomUUID(),input={expected_version:1,acknowledge_withdrawal:true};
  const result=await api(root()+'/commerce/assets/'+asset.id+'/withdraw','POST',input,key);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.status,'withdrawn');
  assert.equal((await api(root()+'/commerce/assets/'+asset.id+'/withdraw','POST',input,key)).status,200);
  assert.equal((await fetch(base+'/api/v1/storefronts/sandbox/fictional-media-shop/assets/'+asset.id)).status,404);
  assert.equal((await fetch(base+root()+'/commerce/assets/'+asset.id+'/content',{headers:{Cookie:cookie}})).status,200);
  const after=await dbGet('SELECT data,image FROM ac_public_media WHERE id=?',[asset.id]);assert.deepEqual(after,before);
  assert.equal(Number((await dbGet('SELECT COUNT(*) AS n FROM ac_public_media_events WHERE asset_id=?',[asset.id])).n),2);
  assert.equal((await api(root()+'/commerce/stores/'+store.id+'/publication-preview')).status,404);
});

test('deactivation preserves owner media history while blocking new public-use writes',async()=>{
  const off=await api(root()+'/services/commerce/deactivate','POST',{confirm:true});assert.equal(off.status,200,JSON.stringify(off.data));
  assert.equal((await api(root()+'/commerce/assets')).status,200);
  assert.equal((await fetch(base+root()+'/commerce/assets/'+asset.id+'/content',{headers:{Cookie:cookie}})).status,200);
  assert.equal((await api(root()+'/commerce/assets','POST',imageInput())).status,402);
  assert.equal((await api(root()+'/commerce/stores')).data.permissions.write,false);
  await dbRun("UPDATE ac_memberships SET role='viewer' WHERE org_id=? AND user_id=?",[org,actor]);
  assert.equal((await api(root()+'/commerce/assets')).status,403);
});
