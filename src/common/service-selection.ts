import {z} from 'zod';
import {serviceCatalog} from '../marketplace/catalog';
/** Bound onboarding work without tying catalog growth to an obsolete UI count. */
export const serviceSelectionInput=z.array(z.string().regex(/^[a-z][a-z0-9_]{1,60}$/)).max(100).refine(values=>new Set(values).size===values.length,'Select each service once').default([]);

/** Order only the explicitly selected services. Never add an unconsented
 * dependency; activate still rejects missing dependencies/current eligibility. */
export function orderedServiceSelection(values:readonly string[]){
 const selected=new Set(values),done=new Set<string>(),visiting=new Set<string>(),result:string[]=[];
 const visit=(id:string)=>{if(done.has(id))return;if(visiting.has(id))throw Object.assign(new Error('Service dependencies contain a cycle'),{status:409});visiting.add(id);for(const dep of serviceCatalog.find(s=>s.id===id)?.dependencies||[])if(selected.has(dep))visit(dep);visiting.delete(id);done.add(id);result.push(id);};
 for(const id of values)visit(id);return result;
}
