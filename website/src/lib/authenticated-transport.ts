type Transport = (path:string, options?:RequestInit)=>Promise<Response>;
/** These handlers authorize their own public capability/publication, never a
 * merchant session. Do not initialize managed auth just to browse a store. */
export function anonymousApiPath(path:string){return /^\/api\/v1\/(?:checkout\/[a-f0-9]{64}(?:\/pay)?|storefronts\/(?:sandbox|production)\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/cart(?:\/confirm)?)?)(?:\?[^#]*)?$/.test(path);}
export function createAuthenticatedTransport(send:Transport, identity:()=>Promise<Record<string,string>>, demo:()=>boolean) {
  const publicAuth = new Set(['/api/auth/signup','/api/auth/signin','/api/auth/recover','/api/auth/reset','/api/auth/verify']);
  return async (path:string,options:RequestInit={}) => {
    if (!path.startsWith('/api/') || path.includes('://')) throw new Error('Only same-origin API requests are supported.');
    const headers=new Headers(options.headers);
    if(!demo()&&!publicAuth.has(path)&&!anonymousApiPath(path)&&!headers.has('Authorization'))for(const [key,value] of Object.entries(await identity()))headers.set(key,value);
    return send(path,{...options,credentials:'same-origin',headers});
  };
}
