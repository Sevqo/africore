/** Bounded retries for the account bootstrap GET only; never wrap credential or business writes. */
function wait(ms:number,signal?:AbortSignal){return new Promise<void>((resolve,reject)=>{if(signal?.aborted){reject(signal.reason);return;}const done=()=>{signal?.removeEventListener('abort',cancel);resolve();},timer=setTimeout(done,ms),cancel=()=>{clearTimeout(timer);reject(signal?.reason);};signal?.addEventListener('abort',cancel,{once:true});});}
export async function retryAccountRead<T>(read:()=>Promise<T>,options:{signal?:AbortSignal;pause?:(ms:number)=>Promise<void>}={}){
 const pause=options.pause||((ms:number)=>wait(ms,options.signal));
 for(let attempt=0;attempt<4;attempt++){
  options.signal?.throwIfAborted();
  try{return await read();}catch(error){
   options.signal?.throwIfAborted();
   const e=error as {retryable?:boolean;retryAfterMs?:number};
   if(attempt===3||e?.retryable!==true||(e.retryAfterMs||0)>20000)throw error;
   await pause(Math.max([1000,3000,6000][attempt],e.retryAfterMs||0));
  }
 }
 throw new Error('Account loading could not be completed. Please retry.');
}
