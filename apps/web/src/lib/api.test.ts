import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const json = (data: unknown) =>
  new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
const stalled = (_input: unknown, options?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
      once: true,
    });
  });

it('bounds a stalled read and clears its timer', async () => {
  const transport = vi.fn(stalled);
  vi.stubGlobal('fetch', transport);
  const { api } = await import('./api');
  const result = expect(api.get('/doctors')).rejects.toMatchObject({
    status: 0,
    code: 'REQUEST_TIMEOUT',
  });
  await vi.advanceTimersByTimeAsync(15_001);
  await result;
  expect(transport).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('bounds response-body reads as well as the initial response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((_input, options?: RequestInit) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              options?.signal?.addEventListener(
                'abort',
                () => controller.error(options.signal?.reason),
                { once: true },
              );
            },
          }),
        ),
      ),
    ),
  );
  const { api } = await import('./api');
  const result = expect(api.get('/patients')).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(15_001);
  await result;
});
it('does not replay a timed-out mutation or expose its input', async () => {
  const transport = vi.fn((path, options?: RequestInit) =>
    String(path).endsWith('/auth/csrf')
      ? Promise.resolve(json({ token: 'unit-test-only-csrf' }))
      : stalled(path, options),
  );
  vi.stubGlobal('fetch', transport);
  const { api } = await import('./api');
  const result = expect(
    api.post('/doctors/id/patients', { clinicalNotes: 'DO-NOT-ECHO' }),
  ).rejects.toMatchObject({
    status: 0,
    code: 'REQUEST_TIMEOUT',
    message: expect.stringContaining('result is uncertain'),
  });
  await vi.advanceTimersByTimeAsync(15_001);
  await result;
  expect(transport.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});
it('preserves caller cancellation without calling it a timeout', async () => {
  vi.stubGlobal('fetch', vi.fn(stalled));
  const { api } = await import('./api');
  const controller = new AbortController();
  const result = expect(api.get('/patients', { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  controller.abort();
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
it.each(['{}', '<html>proxy failure</html>'])(
  'rejects malformed successful envelopes without returning undefined: %s',
  async (body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(body))),
    );
    const { api } = await import('./api');
    await expect(api.get('/dashboard/overview')).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_RESPONSE',
    });
    expect(vi.getTimerCount()).toBe(0);
  },
);
it('keeps successful requests private and removes their deadline', async () => {
  const transport = vi.fn(() => Promise.resolve(json({ value: 4 })));
  vi.stubGlobal('fetch', transport);
  const { api } = await import('./api');
  await expect(api.get('/dashboard/overview')).resolves.toEqual({ value: 4 });
  expect(transport).toHaveBeenCalledWith(
    '/api/v1/dashboard/overview',
    expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }),
  );
  expect(vi.getTimerCount()).toBe(0);
});
