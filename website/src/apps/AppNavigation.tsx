import {useEffect,useState} from 'react';
import {Icon} from '../components/Icon';
import type {API} from '../operations/UI';
import {appSectionActive,appSectionTarget} from '../workspace-navigation';
export const appNavigationEvent='africore:app-navigation';
export function AppSectionTabs({app,section,navigate}:{app:any;section:string;navigate:(tab:string)=>void}){
 const direct:Record<string,string>={Invoices:'Invoices',Payments:'Payments',Expenses:'Expenses',Reconciliation:'Reconciliation',Reports:'Reports',Customers:'Customers',Orders:'Orders',Fulfillment:'Fulfillment',Intelligence:'Intelligence',Automations:'Automations',Approvals:'Approvals',products:'Products',quotations:'Quotations'};
 return <nav className="app-section-tabs" aria-label={app.name+' sections'}>{app.navigation.map((item:any)=><button type="button" key={item.section} aria-current={section===item.section?'page':undefined} onClick={()=>{
   const url=new URL(location.href);url.searchParams.set('app',app.id);url.searchParams.set('section',item.section);const target=appSectionTarget(app,item.section,direct);url.hash=encodeURIComponent(target);history.pushState(null,'',url.pathname+url.search+url.hash);dispatchEvent(new Event(appNavigationEvent));navigate(target);
 }}>{item.label}</button>)}</nav>;
}
export function useAppContext(api:API,scope:string,enabled=true){
 const [catalog,setCatalog]=useState<{scope:string;apps:any[]}>({scope:'',apps:[]}),[selection,setSelection]=useState(()=>({id:new URLSearchParams(location.search).get('app'),section:new URLSearchParams(location.search).get('section')||''})),[revision,setRevision]=useState(0);
 useEffect(()=>{const sync=()=>setSelection({id:new URLSearchParams(location.search).get('app'),section:new URLSearchParams(location.search).get('section')||''}),refresh=()=>setRevision(v=>v+1);addEventListener('popstate',sync);addEventListener(appNavigationEvent,sync);addEventListener('africore:apps-changed',refresh);return()=>{removeEventListener('popstate',sync);removeEventListener(appNavigationEvent,sync);removeEventListener('africore:apps-changed',refresh);};},[]);
 useEffect(()=>{if(!enabled)return;let current=true;setCatalog({scope,apps:[]});api('/apps').then(r=>{if(current)setCatalog({scope,apps:r.apps});}).catch(()=>{});return()=>{current=false;};},[scope,enabled,revision]);
 const app=catalog.scope===scope?catalog.apps.find(a=>a.id===selection.id&&a.installation?.status==='installed'):null;
 return {app,section:app?.navigation?.some((item:any)=>item.section===selection.section)?selection.section:app?.navigation?.[0]?.section||'dashboard'};
}
export function AppContextNavigation({app,section,tab,navigate}:{app:any;section:string;tab:string;navigate:(tab:string)=>void}){
 const direct:Record<string,string>={Invoices:'Invoices',Payments:'Payments',Expenses:'Expenses',Reconciliation:'Reconciliation',Reports:'Reports',Customers:'Customers',Orders:'Orders',Fulfillment:'Fulfillment',Intelligence:'Intelligence',Automations:'Automations',Approvals:'Approvals',products:'Products',quotations:'Quotations'};
 function open(value:string){const url=new URL(location.href);if(value==='all'){url.searchParams.delete('app');url.searchParams.delete('section');}else{url.searchParams.set('app',app.id);url.searchParams.set('section',value);}const target=value==='all'?'Apps':appSectionTarget(app,value,direct);url.hash=encodeURIComponent(target);history.pushState(null,'',url.pathname+url.search+url.hash);dispatchEvent(new Event(appNavigationEvent));navigate(target);}
 const sections=app.navigation.filter((item:any)=>!['Notifications','My Services','Usage & Billing','Overview','Apps'].includes(item.section));
 return <>
  <button className="app-nav-back" title="Back to all apps" onClick={()=>open('all')}><Icon name="left"/><span>Back to all apps</span></button>
  <p className="workspace-label app-context-label">{app.name}</p>
  <div className="app-context-links">{sections.map((n:any)=>{const active=appSectionActive(app,n.section,tab,section,direct),label=n.section==='dashboard'&&n.label==='Overview'?'Dashboard':n.label;return <button key={n.section} title={label} className={active?'active':''} aria-current={active?'page':undefined} onClick={()=>open(n.section)}><Icon name={/report|analytic|ledger|balance|statement/i.test(label)?'chart':/setting|policy/i.test(label)?'settings':/customer|people|team|supplier/i.test(label)?'users':/product|stock|inventory/i.test(label)?'box':/payment|cash/i.test(label)?'payment':'document'}/><span>{label}</span></button>;})}</div>
 </>;
}

export function WorkspaceAdminNavigation({tab,navigate}:{tab:string;navigate:(tab:string)=>void}){
 const items=[{tab:'Usage & Billing',label:'Usage & billing'},{tab:'Team',label:'Team management'},{tab:'Settings',label:'Workspace settings'}];
 return <details className="workspace-nav-group workspace-admin-group" open={items.some(item=>item.tab===tab)||undefined}>
  <summary title="Workspace administration"><Icon name="settings"/><span>Workspace administration</span><Icon name="down"/></summary>
  <div className="workspace-admin-links">{items.map(item=><button key={item.tab} title={item.label} className={tab===item.tab?'active':''} aria-current={tab===item.tab?'page':undefined} onClick={()=>navigate(item.tab)}><span>{item.label}</span></button>)}</div>
 </details>;
}
