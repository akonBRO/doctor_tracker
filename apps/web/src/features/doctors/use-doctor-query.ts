'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '../../lib/api';

export function useDoctorQuery<T>(path: string | null, delay = 0) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const key = `${path}:${attempt}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: ApiError }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      api
        .get<T>(path, { signal: controller.signal })
        .then((data) => {
          if (active) setResult({ key, data });
        })
        .catch((error) => {
          if (!active || controller.signal.aborted) return;
          if (error instanceof ApiError && error.status === 401) {
            router.replace('/login');
            router.refresh();
          }
          setResult({
            key,
            error:
              error instanceof ApiError
                ? error
                : new ApiError(
                    0,
                    'CONNECTION_ERROR',
                    'Unable to reach the service. Please try again.',
                  ),
          });
        });
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, key, delay, router]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: !!path && result?.key !== key,
    retry: () => setAttempt((value) => value + 1),
  };
}
