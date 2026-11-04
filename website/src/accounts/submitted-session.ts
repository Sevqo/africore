type SessionResult={data?:{user?:{email?:string;emailVerified?:boolean}|null}|null;error?:unknown};
type Client={getSession(options:{fetchOptions:{credentials:'include';headers:Record<string,string>}}):Promise<SessionResult>};
/** A previously signed-in account must never satisfy a new account's verification. */
export async function submittedSession(client:Client,email:string){
 const result=await client.getSession({fetchOptions:{credentials:'include',headers:{'X-Force-Fetch':'true'}}});
 if(result.error)throw new Error('The authentication session could not be confirmed. Please retry sign-in.');
 const user=result.data?.user;
 return user&&user.email?.trim().toLowerCase()===email.trim().toLowerCase()?user:null;
}
