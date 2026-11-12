import {useEffect,useState} from 'react';
import {Field,money,type API} from '../operations/UI';
import {displayQuantity} from '../../../src/inventory/quantity';

export function POSDailyReport({api,register,revision,online}:{api:API;register:any;revision:number;online:boolean}){
 const [date,setDate]=useState(''),[report,setReport]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{let current=true;setReport(null);setError('');if(online)api('/pos/registers/'+register.id+'/report'+(date?'?date='+encodeURIComponent(date):'')).then(value=>{if(current)setReport(value);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[api,register.id,date,revision,online]);
 return <section className="panel pos-daily-report"><header><h3>Daily register overview</h3><p>Invoice sales and current settlement, with separately dated cash and shift observations.</p></header><Field label="Register-local report date"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><p>{register.data.timezone} · Leave the date empty for today at this register.</p>{error&&<p role="alert" className="alert error">{error}</p>}{!online&&<p role="status">Reconnect to load current financial observations.</p>}{online&&!report&&!error&&<p role="status">Loading the scoped daily overview…</p>}{report&&<><p>{report.date} · {report.currency} · {report.scope==='own_cashier_shifts'?'Your cashier shifts only':'Assigned register'} · Updated {new Date(report.as_of).toLocaleString()}</p>{report.sales.truncated&&<p role="status" className="alert">Partial coverage: {report.sales.covered_count} of {report.sales.total_count} sales. Monetary totals and top products below cover only those sales.</p>}<div className="pos-metrics">{[
  ['Confirmed sales',String(report.sales.total_count)],
  ['Covered invoice value',money(report.sales.gross_invoice_minor,report.currency)],
  ['Current invoice credits',money(report.sales.credited_minor,report.currency)],
  ['Current outstanding',money(report.sales.outstanding_minor,report.currency)],
  ['Recorded cash retained',money(report.sales.recorded_cash_retained_minor,report.currency)],
  ['Simulated electronic paid',money(report.sales.simulated_electronic_paid_minor,report.currency)],
  ['Cash received on date',money(report.cash_activity.received_minor,report.currency)],
  ['Cash returned on date',money(report.cash_activity.returned_minor,report.currency)],
  ['Cash returns on date',String(report.cash_activity.return_count)],
  ['Currently open shifts',String(report.shifts.currently_open)],
  ['Shifts closed on date',String(report.shifts.closed_on_date)],
  ['Closed cash variance',money(report.shifts.closed_variance_minor,report.currency)],
 ].map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><h4>Top products in covered sales</h4><p>Ranked by line subtotal before invoice discount and tax. Physical returns do not rewrite original sold quantities.</p>{!report.top_products.length&&<p>No product sales in the covered period.</p>}<div className="pos-sale-list">{report.top_products.map((item:any)=><article className="pos-sale-card" key={item.id}><strong>{item.name}</strong><p>{displayQuantity(item.quantity_milli)} {item.unit}</p><p>{money(item.line_subtotal_minor,report.currency)} line subtotal</p></article>)}</div><h4>Current stock warnings</h4><p>{report.stock.definition}</p>{report.stock.available&&<><div className="pos-sale-list">{report.stock.data.map((item:any)=><article className="pos-sale-card" key={item.id}><strong>{item.name}</strong><p>{displayQuantity(item.available_milli)} {item.unit} available</p><p>Reorder point: {displayQuantity(item.reorder_point_milli)} {item.unit}</p></article>)}</div>{!report.stock.data.length&&<p>No current stock warnings at this location.</p>}{report.stock.has_more&&<p>Showing the first 50 matching warnings. Review shared Inventory for the full catalog.</p>}</>}<p>{report.definition}</p></>}</section>;
}
