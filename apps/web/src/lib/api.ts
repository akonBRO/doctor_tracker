import type { ApiEnvelope, ApiErrorBody } from '@doctor-tracker/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}
let csrf: string | undefined;
let refreshing: Promise<void> | undefined;
async function exchange<T>(path: string, method: string, body: unknown, signal?: AbortSignal) {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 15_000);
  const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  try {
    const response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: combined,
      headers:
        method !== 'GET' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf! } : {},
      ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
    });
    const invalid = () =>
      new ApiError(
        response.ok ? 502 : response.status,
        'INVALID_RESPONSE',
        method === 'GET'
          ? 'The service returned an invalid response. Please try again.'
          : 'The service returned an invalid response. Check the current state before submitting again.',
      );
    let payload: ApiEnvelope<T> & ApiErrorBody;
    try {
      payload = await response.json();
    } catch (error) {
      if (combined.aborted) throw error;
      throw invalid();
    }
    if (!payload || typeof payload !== 'object' || (response.ok && !Object.hasOwn(payload, 'data')))
      throw invalid();
    return { response, payload };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (deadline.signal.aborted)
      throw new ApiError(
        0,
        'REQUEST_TIMEOUT',
        method === 'GET'
          ? 'The request timed out. Please try again.'
          : 'The request timed out. Its result is uncertain. Check the current state before submitting again.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function send<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
  allowRefresh = true,
  signal?: AbortSignal,
): Promise<T> {
  try {
    if (method !== 'GET' && !csrf) {
      const data = await send<{ token: string }>('/auth/csrf', 'GET', undefined, false);
      csrf = data.token;
    }
    const { response, payload } = await exchange<T>(path, method, body, signal);
    // Retry only safe reads. Never replay a mutation with an uncertain outcome.
    if (
      response.status === 401 &&
      allowRefresh &&
      method === 'GET' &&
      (path === '/auth/me' ||
        path.startsWith('/doctors') ||
        path.startsWith('/patients') ||
        path.startsWith('/dashboard/'))
    ) {
      const rotate = async () => {
        await send('/auth/refresh', 'POST', {}, false);
      };
      // Shared cookies rotate once at a time across tabs, avoiding false replay revocation.
      refreshing ??= (
        navigator.locks
          ? navigator.locks.request('doctor-tracker-session-refresh', rotate)
          : rotate()
      ).finally(() => {
        refreshing = undefined;
      });
      await refreshing;
      return send<T>(path, method, body, false, signal);
    }
    if (!response.ok) {
      if (payload.error?.code === 'CSRF_REJECTED') csrf = undefined;
      throw new ApiError(
        response.status,
        payload.error?.code ?? 'REQUEST_FAILED',
        payload.error?.message ?? 'The service could not complete your request.',
        payload.error?.fields,
      );
    }
    if (path === '/auth/logout') csrf = undefined;
    if (
      method !== 'GET' &&
      /^\/(?:doctors|patients)(?:\/|$)/.test(path) &&
      typeof window !== 'undefined'
    )
      window.dispatchEvent(new Event('doctor-tracker-records-changed'));
    return payload.data;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      'CONNECTION_ERROR',
      'Unable to reach the service. Check your connection and try again.',
    );
  }
}
export const api = {
  get: <T>(path: string, options?: { signal?: AbortSignal }) =>
    send<T>(path, 'GET', undefined, true, options?.signal),
  patch: <T>(path: string, body: unknown) => send<T>(path, 'PATCH', body),
  delete: <T>(path: string) => send<T>(path, 'DELETE', {}),
  post: <T>(path: string, body?: unknown) => send<T>(path, 'POST', body),
};
