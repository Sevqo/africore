import {POSCashier} from './POSCashier';
import type {API} from '../operations/UI';

export function POSCounter(props:{api:API;register:any;session:any;canWrite:boolean;manager:boolean;online:boolean;initialDraft?:any;onDirty:(value:boolean)=>void;onConfirmed:(receipt:any)=>void;mutate:(work:()=>Promise<any>)=>Promise<any>}){
 return <POSCashier {...props}/>;
}
