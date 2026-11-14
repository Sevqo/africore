import {useState} from 'react';
export function CrmCalendar({entries,open}:{entries:any[];open:(id:string)=>void}){
 const now=new Date(),[month,setMonth]=useState(()=>new Date(now.getFullYear(),now.getMonth(),1));
 const year=month.getFullYear(),index=month.getMonth(),first=new Date(year,index,1),start=new Date(year,index,1-first.getDay());
 const days=Array.from({length:42},(_,n)=>{const d=new Date(start);d.setDate(start.getDate()+n);return d;});
 const key=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 return <section className="crm-calendar"><div className="crm-calendar-heading"><button className="secondary-button" onClick={()=>setMonth(new Date(year,index-1,1))}>Previous month</button><h3>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h3><button className="secondary-button" onClick={()=>setMonth(new Date(year,index+1,1))}>Next month</button></div><p>Expected closing dates from loaded opportunities.</p><div className="crm-calendar-grid">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><strong key={day}>{day}</strong>)}{days.map(day=>{const date=key(day);return <div key={date} className={day.getMonth()===index?'':'outside'}><time dateTime={date}>{day.getDate()}</time>{entries.filter(e=>e.expected_close_on===date).map(e=><button className="quiet-button" key={e.id} onClick={()=>open(e.id)}>{e.title}</button>)}</div>;})}</div></section>;
}
