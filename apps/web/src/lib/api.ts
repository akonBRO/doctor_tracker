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
async function send<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  allowRefresh = true,
  signal?: AbortSignal,
): Promise<T> {
  try {
    if (method === 'POST' && !csrf) {
      const data = await send<{ token: string }>('/auth/csrf', 'GET', undefined, false);
      csrf = data.token;
    }
    const response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers:
        method === 'POST' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf! } : {},
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    });
    const payload: ApiEnvelope<T> & ApiErrorBody = await response.json();
    // Retry only safe reads. Never replay a mutation with an uncertain outcome.
    if (
      response.status === 401 &&
      allowRefresh &&
      method === 'GET' &&
      (path === '/auth/me' || path.startsWith('/doctors'))
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
  post: <T>(path: string, body?: unknown) => send<T>(path, 'POST', body),
};
