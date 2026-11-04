/** Preserve HTTP failure categories without interpreting a failed response as empty data. */
export class ApiRequestError extends Error {
 readonly status:number;readonly code:string;readonly retryable:boolean;readonly retryAfterMs?:number;
 constructor(status:number,code:string,message:string,retryAfterMs?:number){super(message);this.name='ApiRequestError';this.status=status;this.retryAfterMs=retryAfterMs;this.code=code;this.retryable=[408,425,429,500,502,503,504].includes(status);}
}
function retryAfter(response:Response){const value=response.headers.get('Retry-After');if(!value)return undefined;const seconds=Number(value),date=Date.parse(value),ms=Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?date-Date.now():NaN;return Number.isFinite(ms)?Math.max(0,ms):undefined;}
function failure(status:number){switch(status){case 401:return {code:'authentication_required',message:'Your sign-in session has expired or is missing. Please sign in.'};case 402:return {code:'service_inactive',message:'This service is not active. Review its requirements in Services.'};case 403:return {code:'permission_denied',message:'You do not have permission to perform this action.'};case 404:return {code:'not_found',message:'The requested record or service could not be found.'};case 409:return {code:'conflict',message:'The record changed or this action conflicts with its current state. Reload and review it.'};case 429:return {code:'rate_limited',message:'Too many requests. Wait briefly, then retry.'};default:return status>=500?{code:'service_unavailable',message:'The service is temporarily unavailable. Please retry shortly.'}:{code:'request_rejected',message:'The request could not be completed. Review the entered information.'};}}
export async function readApiResponse(response:Response){
 let data:any;try{data=await response.json();}catch{const detail=failure(response.status);throw new ApiRequestError(response.status,response.ok?'invalid_response':detail.code,response.ok?'The service returned an unreadable response. Please retry.':detail.message,retryAfter(response));}
 if(response.ok)return data;
 const detail=failure(response.status),issues=Array.isArray(data?.issues)?data.issues.map((issue:any)=>typeof issue?.message==='string'?issue.message:'').filter(Boolean).join(', '):'';
 const message=typeof data?.message==='string'&&!/^request failed[.!]?$/i.test(data.message.trim())?data.message:issues||detail.message;
 throw new ApiRequestError(response.status,typeof data?.error==='string'?data.error:detail.code,message,retryAfter(response));
}
