import {useEffect,useRef} from 'react';
import {Field,Form,money} from '../operations/UI';
import {parseMoney} from '../../../src/finance/money';
export function CrmEntryDetails({entry,customers,members,writable,save,convert,close}:{entry:any;customers:any[];members:any[];writable:boolean;save:(entry:any)=>Promise<any>;convert:()=>Promise<any>;close:()=>void}){
 const ref=useRef<HTMLElement>(null);useEffect(()=>{ref.current?.focus();},[entry.id]);
 return <section ref={ref} tabIndex={-1} className="panel" aria-labelledby="crm-record-title">
  <div className="app-heading"><div><h3 id="crm-record-title">{entry.title}</h3><p>{entry.kind.replaceAll('_',' ')} · Version {entry.version}</p></div><button className="quiet-button" onClick={close}>Close record</button></div>
  <p>Customer: {customers.find(c=>c.id===entry.customer_id)?.name||'Shared customer'} · {money(entry.amount_minor,entry.currency)} opportunity value</p>
  <p>Created {new Date(entry.created_at).toLocaleString()}{entry.updated_at&&' · Updated '+new Date(entry.updated_at).toLocaleString()}</p>
  {entry.quotation_id&&<p>Linked quotation: {entry.quotation_id}</p>}{entry.order_id&&<p>Linked order: {entry.order_id}</p>}
  <Form key={entry.id+':'+entry.version} disabled={!writable} submit={d=>{const {id:_,version:__,created_at:___,updated_at:____,...rest}=entry;return save({...rest,title:d.title,notes:d.notes,status:d.status,stage:d.stage,assigned_to:d.assigned_to||null,due_at:d.due?new Date(d.due).toISOString():null,amount_minor:parseMoney(d.amount,d.currency),currency:d.currency});}}>
   <div className="form-grid"><Field label="Title"><input name="title" required minLength={2} maxLength={200} defaultValue={entry.title}/></Field>
   <Field label="Stage"><select name="stage" defaultValue={entry.stage}>{['new','qualified','proposal','won','lost'].map(s=><option key={s}>{s}</option>)}</select></Field>
   <Field label="Status"><select name="status" defaultValue={entry.status}>{['open','completed','cancelled'].map(s=><option key={s}>{s}</option>)}</select></Field>
   <Field label="Assigned member"><select name="assigned_to" defaultValue={entry.assigned_to||''}><option value="">Unassigned</option>{members.map(m=><option key={m.id} value={m.id}>{m.display_name||m.email} · {m.role}</option>)}</select></Field>
   <Field label="Due time"><input name="due" type="datetime-local" required={entry.kind==='follow_up'} defaultValue={entry.due_at?new Date(new Date(entry.due_at).getTime()-new Date(entry.due_at).getTimezoneOffset()*60000).toISOString().slice(0,16):''}/></Field>
   <Field label="Opportunity amount"><input name="amount" required inputMode="decimal" defaultValue={String(entry.amount_minor/(['UGX','RWF'].includes(entry.currency)?1:100))}/></Field>
   <Field label="Currency"><select name="currency" defaultValue={entry.currency}>{['KES','USD','EUR','GBP','UGX','TZS','RWF'].map(s=><option key={s}>{s}</option>)}</select></Field></div>
   <Field label="Notes"><textarea name="notes" maxLength={4000} defaultValue={entry.notes}/></Field><button className="secondary-button">Save record</button>
  </Form>
  {entry.kind==='lead'&&entry.status==='open'&&!['won','lost'].includes(entry.stage)&&<Form disabled={!writable} submit={convert}><p>Convert this lead to a qualified opportunity. The customer, notes, owner, amount and record history are retained.</p><button className="button">Convert to opportunity</button></Form>}
 </section>;
}
