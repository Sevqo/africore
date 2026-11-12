import {Icon} from '../components/Icon';
import {DataTable} from '../components/DataTable';
import {money} from '../operations/UI';

export function CommerceOverview({store,listings,orders,onView,navigate}:{store:any;listings:any;orders:any;onView:(view:string)=>void;navigate:(tab:string)=>void}){
 const published=store.status==='published'&&!!store.data.publication;
 const url='/s/'+store.environment+'/'+store.data.settings.slug;
 return <div className="commerce-overview">
  <div className="app-metric-grid commerce-metrics">
   <article className="panel"><span>Store status</span><strong>{published?'Published':'Draft'}</strong><small>Current publication access</small></article>
   <article className="panel"><span>Catalog selection</span><strong>{listings?.total??listings?.data?.length??'—'}</strong><small>{listings?.has_more?'More listings available':'Saved store listings'}</small></article>
   <article className="panel"><span>Loaded orders</span><strong>{orders?.data?.length??'—'}</strong><small>{orders?.has_more?'Latest page; more available':'Current authorized result'}</small></article>
   <article className="panel"><span>Store version</span><strong>{store.version}</strong><small>Retained configuration revision</small></article>
  </div>
  <div className="commerce-overview-main">
   <section className="panel commerce-preview"><div className="section-heading"><h3>Storefront preview</h3><span className="badge">{published?'Published':'Not published'}</span></div><div className="commerce-preview-browser"><span>Storefront · {store.data.settings.slug}</span><div><span className="eyebrow">Your online store</span><h3>{store.data.settings.name}</h3><p>{store.data.settings.description||'Add your merchant-owned description and reviewed products.'}</p>{published?<a className="button" href={url} target="_blank" rel="noreferrer">View Storefront <Icon name="external"/></a>:<button className="secondary-button" onClick={()=>onView('storefront')}>Prepare storefront</button>}</div></div><p className="muted">Configuration summary. Open the published store to inspect the actual public snapshot.</p></section>
   <section className="panel commerce-quick-actions"><h3>Quick actions</h3>{[['catalog','Manage store listings'],['storefront','Review storefront publication'],['inventory','Inventory integration']].map(([id,label])=><button className="quiet-button" key={id} onClick={()=>onView(id)}>{label}<Icon name="right"/></button>)}<button className="quiet-button" onClick={()=>navigate('Orders')}>Manage shared orders<Icon name="right"/></button><button className="quiet-button" onClick={()=>navigate('Customers')}>Open customers<Icon name="right"/></button></section>
  </div>
  <section className="panel commerce-recent-orders"><div className="section-heading"><h3>Recent storefront orders</h3><button className="quiet-button" onClick={()=>navigate('Orders')}>View shared orders<Icon name="right"/></button></div>{orders?<><p className="muted">{orders.coverage}</p><DataTable><thead><tr><th>Order</th><th>Amount</th><th>Confirmed</th><th>Outstanding</th><th>Fulfillment</th></tr></thead><tbody>{orders.data.slice(0,5).map((o:any)=><tr key={o.id}><td>{o.reference}</td><td>{money(o.total_minor,o.currency)}</td><td>{money(o.paid_minor,o.currency)}</td><td>{money(o.outstanding_minor,o.currency)}</td><td><span className="badge">{o.fulfillment_status}</span></td></tr>)}</tbody></DataTable>{!orders.data.length&&<p>No storefront orders have been recorded.</p>}</>:<p>Order information requires current authorized combined-service access.</p>}</section>
  <section className="commerce-capability-note"><h3>Commerce insights</h3><p>Order values remain separate from confirmed receipts. Visitor conversion, genuine reviews and promotion management are not supplied by the current backend; they are not represented as live metrics.</p></section>
 </div>;
}
