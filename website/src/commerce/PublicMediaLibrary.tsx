import {useEffect,useState,type ChangeEvent} from 'react';
import {Field,Form,type API} from '../operations/UI';
import {apiFetch} from '../lib/api-client';
import {readApiResponse} from '../lib/api-response';

export interface PublicImageAsset {id:string;label:string;alt:string;width:number;height:number;byte_size:number;status:string;version:number}
async function preparedImage(file:File) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>10*1024*1024)
    throw new Error('Choose a JPEG, PNG or WebP image smaller than 10 MiB.');
  const bitmap=await createImageBitmap(file);
  try {
    if(bitmap.width*bitmap.height>16_000_000)throw new Error('Choose an image of at most 16 million pixels.');
    const scale=Math.min(1,1200/bitmap.width,1200/bitmap.height),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');if(!context)throw new Error('Image preparation is unavailable in this browser.');
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Image preparation failed.')),'image/webp',0.82));
    if(blob.size>512*1024)throw new Error('The resized image is too large. Choose a simpler or smaller image.');
    const encoded=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('The selected image could not be read.'));reader.readAsDataURL(blob);});
    return {blob,encoded,width:canvas.width,height:canvas.height};
  } finally {bitmap.close();}
}

export function PrivateImagePreview({asset,scope}:{asset:Pick<PublicImageAsset,'id'|'alt'|'width'|'height'>;scope:string}) {
  const [show,setShow]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState('');
  useEffect(()=>{
    if(!show)return;const controller=new AbortController();let objectUrl='';setError('');
    const [org,environment]=scope.split('\0');
    apiFetch('/api/v1/organizations/'+encodeURIComponent(org)+'/commerce/assets/'+asset.id+'/content',{headers:{'X-Environment':environment},signal:controller.signal})
      .then(async response=>{if(!response.ok){await readApiResponse(response);throw new Error('Image preview is unavailable.');}return response.blob();})
      .then(blob=>{if(!controller.signal.aborted){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}})
      .catch(e=>{if(!controller.signal.aborted)setError((e as Error).message);});
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);setUrl('');};
  },[show,asset.id,scope]);
  return <><button type="button" className="quiet-button" onClick={()=>setShow(v=>!v)}>{show?'Hide image preview':'Preview image'}</button>{error&&<p role="alert">{error}</p>}{show&&url&&<img className="commerce-media-preview" src={url} alt={asset.alt} width={asset.width} height={asset.height}/>}</>;
}

export function MediaSelection({assets,selected}:{assets:PublicImageAsset[];selected:string[]}) {
  const [ids,setIds]=useState(selected);
  return <div className="commerce-image-selection"><input type="hidden" name="asset_ids" value={ids.join(',')}/><Field label="Add product image"><select value="" disabled={ids.length>=12} onChange={e=>{const id=e.target.value;if(id&&!ids.includes(id))setIds(v=>[...v,id]);}}><option value="">Choose a public-use image</option>{assets.filter(a=>a.status==='active'&&!ids.includes(a.id)).map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></Field><p>Up to 12 images. Only the reviewed publication makes them visible in this store.</p><ul>{ids.map(id=><li key={id}><span>{assets.find(a=>a.id===id)?.label||'Previously attached image'}{assets.find(a=>a.id===id)?.status==='withdrawn'?' · Withdrawn; remove before saving':''}</span><button type="button" className="quiet-button" onClick={()=>setIds(v=>v.filter(i=>i!==id))}>Remove image</button></li>)}</ul></div>;
}

export function PublicMediaLibrary({api,scope,assets,writable,onChanged}:{api:API;scope:string;assets:PublicImageAsset[];writable:boolean;onChanged:()=>void}) {
  const [prepared,setPrepared]=useState<Awaited<ReturnType<typeof preparedImage>>|null>(null),[preview,setPreview]=useState(''),[error,setError]=useState(''),[processing,setProcessing]=useState(false),[revision,setRevision]=useState(0),[offset,setOffset]=useState(0);
  useEffect(()=>{if(!prepared){setPreview('');return;}const url=URL.createObjectURL(prepared.blob);setPreview(url);return()=>URL.revokeObjectURL(url);},[prepared]);
  async function selectImage(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];setPrepared(null);setError('');if(!file)return;setProcessing(true);
    try{setPrepared(await preparedImage(file));}catch(e){setError((e as Error).message);}finally{setProcessing(false);}
  }
  return <section className="panel commerce-media-library"><h3>Public-use image library</h3><p>Upload images you have permission to publish. This library is separate from private Documents. The server validates raster pixels and strips embedded metadata; it is not a malware-scanning or rights-verification service.</p><p>Evaluation limits: 500 retained images, 50 MiB total; 512 KiB per processed image. Withdrawal stops new public delivery but retains the original canonical asset and audit history.</p>{error&&<p className="alert error" role="alert">{error}</p>}
    <Form key={revision} disabled={processing||!writable} submit={async d=>{if(!prepared)throw new Error('Choose and prepare an image first.');if(d.public_use!=='on'||d.rights!=='on')throw new Error('Acknowledge public use and your publication rights.');await api('/commerce/assets','POST',{label:d.label,alt:d.alt,image_base64:prepared.encoded,acknowledge_public_use:true,acknowledge_rights:true});setPrepared(null);setRevision(v=>v+1);onChanged();}}>
      <Field label="Choose image"><input type="file" accept="image/jpeg,image/png,image/webp" required onChange={selectImage}/></Field>
      {processing&&<p role="status">Preparing image pixels…</p>}{preview&&prepared&&<><img src={preview} className="commerce-media-preview" width={prepared.width} height={prepared.height} alt="Selected image preview before upload"/><p>{prepared.width} × {prepared.height} pixels · {Math.ceil(prepared.blob.size/1024)} KiB prepared</p></>}
      <Field label="Library name"><input name="label" required maxLength={160}/></Field><Field label="Image description for readers"><input name="alt" required maxLength={300}/></Field>
      <label className="checkbox-field"><input name="rights" type="checkbox" required/>I have permission to publish this image</label><label className="checkbox-field"><input name="public_use" type="checkbox" required/>I approve public use when this image is included in a reviewed storefront publication</label><button className="button" disabled={!prepared||processing}>Upload public-use image</button>
    </Form>
    <div className="app-directory">{assets.slice(offset,offset+20).map(asset=><article className="panel" key={asset.id}><h4>{asset.label}</h4><p>{asset.alt}</p><p>{asset.width} × {asset.height} pixels · {Math.ceil(asset.byte_size/1024)} KiB · {asset.status}</p><PrivateImagePreview asset={asset} scope={scope}/>{writable&&asset.status==='active'&&<Form submit={async d=>{if(d.withdraw!=='on')throw new Error('Acknowledge that public delivery will stop.');await api('/commerce/assets/'+asset.id+'/withdraw','POST',{expected_version:asset.version,acknowledge_withdrawal:true});onChanged();}}><label className="checkbox-field"><input name="withdraw" type="checkbox" required/>Stop public delivery everywhere this image is used</label><button className="secondary-button">Withdraw image</button></Form>}</article>)}</div>
    {!assets.length&&<p>No public-use images uploaded yet.</p>}<div className="form-actions"><button type="button" className="secondary-button" disabled={!offset} onClick={()=>setOffset(v=>Math.max(0,v-20))}>Previous images</button><button type="button" className="secondary-button" disabled={offset+20>=assets.length} onClick={()=>setOffset(v=>v+20)}>More images</button></div>
  </section>;
}
