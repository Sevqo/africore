import { ApiRequestError, readApiResponse } from './api-response';
import { transport, isDemo } from '../demo/transport';
import { identityHeaders } from '../accounts/auth';
import { createAuthenticatedTransport, anonymousApiPath } from './authenticated-transport';
import {
  protectedQueries,
  queryIdentity,
  queryKey,
  cacheable,
  clearPrivateQueries,
  setQueryIdentity,
  invalidateWorkspace,
} from './query-cache';
export const apiFetch = createAuthenticatedTransport(transport, identityHeaders, isDemo);

function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return false;
  return (
    error.name === 'TypeError' ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(error.message)
  );
}

export async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  environment = 'sandbox',
  headers: Record<string, string> = {},
) {
  const anonymous = anonymousApiPath(path);
  const identity = isDemo() || anonymous ? {} : await identityHeaders();
  const hasIdempotencyKey = Boolean(headers['Idempotency-Key'] || headers['idempotency-key']);
  const canRetryNetwork = ['GET', 'HEAD'].includes(method) || hasIdempotencyKey;

  const send = async (signal?: AbortSignal) => {
    const performFetch = () =>
      apiFetch(path, {
        method,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
          : AbortSignal.timeout(45000),
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Environment': environment,
          ...headers,
          ...(!headers.Authorization && !headers.authorization ? identity : {}),
        },
        body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify(body ?? {}),
      });

    let r: Response;
    try {
      r = await performFetch();
    } catch (error) {
      if (canRetryNetwork && isTransientNetworkError(error) && !signal?.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        try {
          r = await performFetch();
        } catch (retryError) {
          if (isTransientNetworkError(retryError)) {
            throw new ApiRequestError(
              0,
              'network_error',
              'Could not reach the workspace server. Check your connection or retry in a moment.',
            );
          }
          throw retryError;
        }
      } else if (isTransientNetworkError(error)) {
        throw new ApiRequestError(
          0,
          'network_error',
          'Could not reach the workspace server. Check your connection or retry in a moment.',
        );
      } else {
        throw error;
      }
    }
    let data;
    try {
      data = await readApiResponse(r);
    } catch (error) {
      if (r.status === 401 && !anonymous && !headers.Authorization && !headers.authorization) {
        clearPrivateQueries();
        window.dispatchEvent(new CustomEvent('africore:access-changed'));
      }
      if (r.status === 403) invalidateWorkspace(path, environment);
      throw error;
    }
    if (method !== 'GET') invalidateWorkspace(path, environment);
    if (path === '/api/auth/account' && !identity.Authorization && data.user?.id)
      setQueryIdentity('legacy:' + data.user.id);
    return data;
  };
  const subject = isDemo() ? 'isolated-browser-demo' : queryIdentity();
  return method === 'GET' && subject && cacheable(path) && !Object.keys(headers).length
    ? protectedQueries.read(queryKey(subject, environment, path), send)
    : send();
}
