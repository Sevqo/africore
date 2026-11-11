import {readApiResponse} from './api-response';
import { transport, isDemo } from '../demo/transport';
import { identityHeaders } from '../accounts/auth';
import { createAuthenticatedTransport,anonymousApiPath } from './authenticated-transport';
import { protectedQueries, queryIdentity, queryKey, cacheable, clearPrivateQueries, setQueryIdentity, invalidateWorkspace } from './query-cache';
export const apiFetch = createAuthenticatedTransport(transport, identityHeaders, isDemo);
export async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  environment = 'sandbox',
  headers: Record<string, string> = {},
) {
  const anonymous=anonymousApiPath(path);
  const identity = isDemo()||anonymous ? {} : await identityHeaders();
  const send=async(signal?:AbortSignal)=>{
  const r = await apiFetch(path, {
    method,
    signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000),
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Environment': environment,
      ...headers,
      ...(!headers.Authorization && !headers.authorization ? identity : {}),
    },
    body: ['GET','HEAD'].includes(method) ? undefined : JSON.stringify(body ?? {}),
  });
  let data;
  try {data=await readApiResponse(r);} catch(error) {
    if (r.status===401&&!anonymous&&!headers.Authorization&&!headers.authorization) {clearPrivateQueries();window.dispatchEvent(new CustomEvent('africore:access-changed'));}
    if(r.status===403)invalidateWorkspace(path,environment);
    throw error;
  }
  if(method!=='GET')invalidateWorkspace(path,environment);
  if(path==='/api/auth/account'&&!identity.Authorization&&data.user?.id)setQueryIdentity('legacy:'+data.user.id);
  return data;
  };
  const subject=isDemo()?'isolated-browser-demo':queryIdentity();
  return method==='GET'&&subject&&cacheable(path)&&!Object.keys(headers).length
    ? protectedQueries.read(queryKey(subject,environment,path),send):send();
}
