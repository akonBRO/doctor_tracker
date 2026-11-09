import { expect, it } from 'vitest';
import { loadWebConfig, assertBuiltApiOrigin } from '../../config/environment';

const production = {
  NODE_ENV: 'production',
  API_ORIGIN: 'http://api.internal:4000',
  APP_ORIGIN: 'https://app.example.test',
};
it('requires explicit production origins without exposing rejected values', () => {
  expect(() => loadWebConfig({ NODE_ENV: 'production' })).toThrow('API_ORIGIN, APP_ORIGIN');
  expect(() =>
    loadWebConfig({ ...production, API_ORIGIN: 'http://DO-NOT-ECHO:password@host/' }),
  ).toThrow('API_ORIGIN');
  try {
    loadWebConfig({ ...production, API_ORIGIN: 'http://DO-NOT-ECHO:password@host/' });
  } catch (error) {
    expect(String(error)).not.toContain('DO-NOT-ECHO');
  }
});
it.each([
  'https://app.example.test/',
  'https://app.example.test/path',
  'https://app.example.test#x',
  'ftp://app.example.test',
  'http://app.example.test',
])('rejects an unsafe public production origin: %s', (APP_ORIGIN) => {
  expect(() => loadWebConfig({ ...production, APP_ORIGIN })).toThrow();
});
it('allows private HTTP API transport with a secure public origin', () => {
  expect(loadWebConfig(production)).toEqual({
    apiOrigin: production.API_ORIGIN,
    appOrigin: production.APP_ORIGIN,
  });
});
it('bounds local production HTTP opt-in to explicit loopback origins', () => {
  const local = {
    NODE_ENV: 'production',
    API_ORIGIN: 'http://127.0.0.1:4100',
    APP_ORIGIN: 'http://127.0.0.1:3100',
    WEB_ALLOW_LOCAL_HTTP: 'true',
  };
  expect(loadWebConfig(local).appOrigin).toBe(local.APP_ORIGIN);
  expect(() => loadWebConfig({ ...local, WEB_ALLOW_LOCAL_HTTP: undefined })).toThrow();
  expect(() => loadWebConfig({ ...local, APP_ORIGIN: 'http://localhost.example.test' })).toThrow();
  expect(() => loadWebConfig({ ...production, WEB_ALLOW_LOCAL_HTTP: 'true' })).toThrow();
  expect(() => loadWebConfig({ ...production, NODE_TLS_REJECT_UNAUTHORIZED: '0' })).toThrow();
});
it('rejects build/runtime API drift before serving a release', () => {
  const manifest = {
    rewrites: {
      afterFiles: [
        { source: '/api/v1/:path*', destination: `${production.API_ORIGIN}/api/v1/:path*` },
      ],
    },
  };
  expect(() => assertBuiltApiOrigin(manifest, production.API_ORIGIN)).not.toThrow();
  expect(() => assertBuiltApiOrigin(manifest, 'http://wrong.internal:4000')).toThrow('Rebuild');
});
it('retains development defaults', () =>
  expect(loadWebConfig({})).toEqual({
    apiOrigin: 'http://127.0.0.1:4000',
    appOrigin: 'http://localhost:3000',
  }));
it('rejects a build whose HSTS transport differs from runtime', () => {
  const manifest = {
    rewrites: {
      afterFiles: [
        { source: '/api/v1/:path*', destination: `${production.API_ORIGIN}/api/v1/:path*` },
      ],
    },
    headers: [],
  };
  expect(() =>
    assertBuiltApiOrigin(manifest, production.API_ORIGIN, production.APP_ORIGIN),
  ).toThrow('security headers');
});
