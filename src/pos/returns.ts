import {type Access,fail} from '../platform/auth';
import {operation,update} from '../erp/store';
import {recordPOSCashReturn} from '../finance/cash-ledger';
import {cashReturnInput} from './contracts';
import {posSale} from './quotes';
import {sessionAccess,drawer} from './sessions';
import {calculateDrawer} from './settlement';

export async function returnPOSCash(a:Access,id:string,input:unknown,key:string){
 const d=cashReturnInput.parse(input);
 await operation(a,'pos.sale.cash-return:'+id,key,d,async()=>{await posSale(a,id,true);await sessionAccess(a,d.return_session_id,{write:true,manager:true});},async()=>{
  const sale=await posSale(a,id,true),{session}=await sessionAccess(a,d.return_session_id,{write:true,manager:true});
  if(sale.status!=='confirmed'||sale.version!==d.expected_sale_version)fail(409,'Sale changed; reload before recording cash returned');
  if(session.root_id!==sale.root_id||session.status!=='open'||session.version!==d.expected_session_version)fail(409,'The original register requires a current open return session');
  const current=await drawer(a,session.id);calculateDrawer(current.expected_minor,[{kind:'return',amount_minor:-d.amount_minor}]);
  const result=await recordPOSCashReturn(a,{sale_id:id,session_id:session.id,original_receipt_id:d.original_receipt_id,amount_minor:d.amount_minor,reason:d.reason},()=>sessionAccess(a,session.id,{write:true,manager:true}));
  await update(a,session,{...session.data,last_cash_return_id:result.return_id},{},'cash_return_recorded');
  await update(a,sale,{...sale.data,last_cash_return_id:result.return_id},{},'cash_return_recorded');
  return {sale_id:id,return_id:result.return_id};
 });return posSale(a,id);
}
