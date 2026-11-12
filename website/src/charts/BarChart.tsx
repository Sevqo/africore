import {useId} from 'react';

/** Values come from the caller's authorized aggregate; never fills missing categories. */
export function BarChart({title,rows,onInspect}:{title:string;rows:{key:string;label:string;value:number}[];onInspect?:(key:string)=>void}) {
 const id=useId(),valid=rows.filter(row=>Number.isFinite(row.value)&&row.value>=0),max=Math.max(1,...valid.map(row=>row.value));
 return <figure className="workspace-bar-chart" aria-labelledby={id}><figcaption id={id}>{title}</figcaption>{!valid.length?<p>No covered records for this period.</p>:<ul>{valid.map(row=><li key={row.key}>{onInspect?<button type="button" aria-label={`${row.label}: ${row.value.toLocaleString('en-KE')} records. Inspect matching records.`} onClick={()=>onInspect(row.key)}><span>{row.label}</span><span className="workspace-bar-track" aria-hidden="true"><span style={{width:row.value/max*100+'%'}}/></span><strong>{row.value.toLocaleString('en-KE')}</strong></button>:<div><span>{row.label}</span><span className="workspace-bar-track" aria-hidden="true"><span style={{width:row.value/max*100+'%'}}/></span><strong>{row.value.toLocaleString('en-KE')}</strong></div>}</li>)}</ul>}</figure>;
}
