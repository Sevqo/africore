/** Public provider discovery retries only transient reads, never credential submissions. */
export type AuthConfiguration = {provider:'legacy'}|{provider:'neon';auth_url:string};
export class AuthenticationUnavailable extends Error {
 readonly code='authentication_unavailable';
 readonly status?:number;
 constructor(status?:number){super('Sign-in is temporarily unavailable. Please retry shortly.');this.name='AuthenticationUnavailable';this.status=status;}
}
type Options={fetcher?:typeof fetch;pause?:(ms:number)=>Promise<void>;now?:()=>number};
const transient=new Set([408,425,429,500,502,503,504]);
export async function loadAuthConfiguration({fetcher=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now}:Options={}):Promise<AuthConfiguration>{
 for(let attempt=0;attempt<4;attempt++){
  let response:Response;
  try{response=await fetcher('/api/auth/config',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});}
  catch{if(attempt===3)throw new AuthenticationUnavailable();await pause([1000,3000,6000][attempt]);continue;}
  if(!response.ok){
   if(!transient.has(response.status)||attempt===3)throw new AuthenticationUnavailable(response.status);
   const retry=response.headers.get('Retry-After');let delay=[1000,3000,6000][attempt];
   if(retry){const seconds=Number(retry),date=Date.parse(retry),requested=Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?date-now():0;if(requested>20000)throw new AuthenticationUnavailable(response.status);delay=Math.max(delay,requested);}
   await pause(delay);continue;
  }
  let data:any;try{data=await response.json();}catch{throw new Error('Authentication configuration could not be read. Please retry.');}
  if(data?.provider==='legacy')return {provider:'legacy'};
  if(data?.provider==='neon'&&typeof data.auth_url==='string'){
   let url:URL;try{url=new URL(data.auth_url);}catch{throw new Error('Authentication is not configured correctly. Contact support.');}
   if(url.protocol==='https:'&&url.hostname.includes('.neonauth.')&&/\.(neon\.tech|neon\.build)$/.test(url.hostname)&&!url.username&&!url.password&&!url.search&&!url.hash)return {provider:'neon',auth_url:data.auth_url};
  }
  throw new Error('Authentication is not configured correctly. Contact support.');
 }
 throw new AuthenticationUnavailable();
}
