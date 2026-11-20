import {useEffect,useState} from 'react';
import './phase3-apps.css';
export function PublicWebsite({slug}:{slug:string}){
 const [page,setPage]=useState<any>(null),[missing,setMissing]=useState(false);
 useEffect(()=>{let live=true;fetch('/api/public/sites/'+encodeURIComponent(slug)).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(live)setPage(d)}).catch(()=>{if(live)setMissing(true)});return()=>{live=false}},[slug]);
 if(missing)return <main className="public-site-missing"><h1>Page not found</h1><p>This website page is unpublished or unavailable.</p></main>;
 if(!page)return <main className="public-site-missing" role="status">Loading page…</main>;
 return <main className="public-site"><header><strong>{page.title}</strong><nav><a href="/">Home</a></nav></header>{page.sections.map((s:any,i:number)=><section key={i} className={'website-section website-block-'+s.type} style={{background:s.background||'#fff'}}><div><h1>{s.title}</h1><p>{s.body}</p>{s.image_url&&<img src={s.image_url} alt={s.alt||''}/ >}{s.button_label&&<a className="button" href={safeHref(s.button_url)}>{s.button_label}</a>}</div></section>)}<footer className="website-footer">{page.title}</footer></main>
}
function safeHref(value:string){return /^(https:\/\/|mailto:|\/(?!\/)[^\\\r\n]*)/i.test(value||'')?value:'#'}
