import {exactNumber} from '../finance/money';

const limit=100_000_000_000;
function reject(message:string):never{throw Object.assign(new Error(message),{status:409});}
function amount(value:number,label:string,signed=false){
 if(!Number.isSafeInteger(value)||Math.abs(value)>limit||!signed&&value<0)reject(label+' exceeds supported minor-unit bounds');
 return BigInt(value);
}
/** Internal calculation: invoice balance and register policy must be loaded by
 * the authorized transaction. A browser total is never an invoice balance. */
export function calculateTender(input:{outstanding_minor:number;intent:'cash'|'electronic'|'split'|'pending';cash_minor:number;tendered_minor:number;allow_cash:boolean;allow_electronic:boolean;allow_pending:boolean}){
 const outstanding=amount(input.outstanding_minor,'Invoice balance'),cash=amount(input.cash_minor,'Cash receipt'),tendered=amount(input.tendered_minor,'Tendered cash');
 if(outstanding===0n)reject('This invoice has no collectible balance');
 if(cash>outstanding||tendered<cash)reject('Cash receipt exceeds the invoice balance or tendered cash');
 if(cash>0n&&!input.allow_cash)reject('Cash is disabled for this register');
 switch(input.intent){
 case 'cash':if(cash!==outstanding)reject('Cash tender must cover the complete remaining balance');break;
 case 'split':if(!input.allow_electronic||cash===0n||cash>=outstanding)reject('Split tender requires cash and an enabled electronic remainder');break;
 case 'electronic':if(!input.allow_electronic||cash!==0n||tendered!==0n)reject('Electronic tender requires an enabled method and no cash');break;
 case 'pending':if(!input.allow_pending||cash!==0n||tendered!==0n)reject('Pending orders require register permission and no cash');break;
 default:reject('Unsupported tender intent');
 }
 return {cash_applied_minor:exactNumber(cash),tendered_cash_minor:exactNumber(tendered),change_minor:exactNumber(tendered-cash),electronic_request_minor:input.intent==='electronic'||input.intent==='split'?exactNumber(outstanding-cash):0,pending_minor:input.intent==='pending'?exactNumber(outstanding):0};
}

/** Opening float and adjustments affect the drawer, never sales or provider
 * evidence. Pass only scoped, immutable cash movements, not electronic events. */
export function calculateDrawer(opening:number,movements:ReadonlyArray<{kind:'receipt'|'return'|'adjustment';amount_minor:number}>,counted?:number){
 let expected=amount(opening,'Opening float');
 for(const movement of movements){
  const value=amount(movement.amount_minor,'Drawer movement',true);
  if(value===0n||movement.kind==='receipt'&&value<0n||movement.kind==='return'&&value>0n||!['receipt','return','adjustment'].includes(movement.kind))reject('Invalid recorded drawer movement');
  expected+=value;
 }
 if(expected<0n||expected>BigInt(limit))reject('Expected drawer cash requires review');
 return {expected_minor:exactNumber(expected),...(counted===undefined?{}:{counted_minor:exactNumber(amount(counted,'Counted cash')),variance_minor:exactNumber(BigInt(counted)-expected)})};
}

export function remainingCashReturn(receipt:number,returns:readonly number[],requested:number){
 const original=amount(receipt,'Original cash receipt');
 if(original===0n)reject('An original positive cash receipt is required');
 let returned=0n;
 for(const value of returns){const signed=amount(value,'Previous cash return',true);if(signed>=0n)reject('Previous returns must retain their negative cash movement');returned-=signed;}
 const next=amount(requested,'Cash return');
 if(next===0n||returned+next>original)reject('Cash return exceeds the remaining original receipt');
 return exactNumber(original-returned-next);
}
