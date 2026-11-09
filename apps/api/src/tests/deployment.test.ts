import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { once } from 'node:events';
import { loadConfig } from '../config/env.js';
import { createApp } from '../app.js';
import { createRuntime } from '../runtime.js';

const env = () => ({
  NODE_ENV: 'production',
  WEB_ORIGIN: 'https://app.example.test',
  MONGODB_URI: 'mongodb+srv://cluster.example.test/doctor_tracker',
  JWT_SECRET: randomBytes(32).toString('hex'),
  MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  CSRF_SECRET: randomBytes(32).toString('hex'),
  COOKIE_SECURE: 'true',
  TRUST_PROXY_HOPS: '1',
  API_INSTANCE_COUNT: '1',
});
describe('production configuration', () => {
  it.each([
    { API_INSTANCE_COUNT: '2' },
    { WEB_CONCURRENCY: '2' },
    { NODE_APP_INSTANCE: '0' },
    { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { TRUST_PROXY_HOPS: undefined },
    { API_INSTANCE_COUNT: undefined },
    { COOKIE_SECURE: 'false' },
    { WEB_ORIGIN: 'http://app.example.test' },
  ])('rejects unsafe or undeclared production controls: %j', (invalid) =>
    expect(() => loadConfig({ ...env(), ...invalid })).toThrow(),
  );
  it.each([
    'mongodb://host.example.test/doctor_tracker',
    'mongodb+srv://cluster.example.test/doctor_tracker?tls=false',
    'mongodb+srv://cluster.example.test/doctor_tracker?ssl=false',
    'mongodb+srv://cluster.example.test/doctor_tracker?tlsAllowInvalidCertificates=true',
    'mongodb+srv://cluster.example.test/doctor_tracker?tlsAllowInvalidHostnames=true',
    'mongodb+srv://cluster.example.test/doctor_tracker?tlsInsecure=true',
    'mongodb+srv://cluster.example.test',
  ])('rejects unsafe database configuration: %s', (MONGODB_URI) =>
    expect(() => loadConfig({ ...env(), MONGODB_URI })).toThrow(),
  );
  it.each([
    'mongodb+srv://cluster.example.test/doctor_tracker',
    'mongodb://db1.example.test:27017,db2.example.test:27017/doctor_tracker?tls=true&replicaSet=rs0',
  ])('accepts explicit verified TLS: %s', (MONGODB_URI) =>
    expect(loadConfig({ ...env(), MONGODB_URI }).MONGODB_URI).toBe(MONGODB_URI),
  );
  it('never echoes rejected credentials in configuration errors', () => {
    expect(() =>
      loadConfig({ ...env(), MONGODB_URI: 'mongodb://user:DO-NOT-ECHO@host/db' }),
    ).toThrow();
    try {
      loadConfig({ ...env(), MONGODB_URI: 'mongodb://user:DO-NOT-ECHO@host/db' });
    } catch (error) {
      expect(String(error)).not.toContain('DO-NOT-ECHO');
    }
  });
});

describe('production transport and probe policy', () => {
  it('sets host-only secure CSRF cookies and refuses untrusted origins', async () => {
    const app = await createApp(loadConfig(env()));
    const csrf = await request(app)
      .get('/api/v1/auth/csrf')
      .set('Origin', 'https://app.example.test');
    expect(csrf.status).toBe(200);
    const cookie = (csrf.headers['set-cookie'] as unknown as string[])[0]!;
    for (const value of ['__Host-dt_csrf=', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/'])
      expect(cookie).toContain(value);
    expect(cookie).not.toContain('Domain=');
    expect(csrf.headers['cache-control']).toBe('no-store');
    expect(csrf.headers['access-control-allow-origin']).toBe('https://app.example.test');
    expect(
      (await request(app).get('/api/v1/auth/csrf').set('Origin', 'https://evil.example.test'))
        .status,
    ).toBe(403);
  });
  it('keeps liveness independent from database readiness and draining', async () => {
    const state = { draining: true };
    const app = await createApp(loadConfig(env()), state);
    expect((await request(app).get('/api/v1/health/live')).body).toEqual({
      data: { status: 'ok' },
    });
    expect((await request(app).get('/api/v1/health/ready')).status).toBe(503);
    expect((await request(app).get('/api/v1/health')).status).toBe(503);
    expect((await request(app).get('/api/v1/patients')).body.error.code).toBe('SERVICE_DRAINING');
  });
  it('uses only the configured proxy hop for global rate-limit identification', async () => {
    const app = await createApp(loadConfig(env()));
    for (let i = 0; i < 200; i++)
      await request(app).get('/api/v1/auth/csrf').set('X-Forwarded-For', '192.0.2.3');
    expect(
      (await request(app).get('/api/v1/auth/csrf').set('X-Forwarded-For', '192.0.2.3')).status,
    ).toBe(429);
    expect(
      (await request(app).get('/api/v1/auth/csrf').set('X-Forwarded-For', '192.0.2.4')).status,
    ).toBe(200);
    const direct = await createApp(loadConfig({ ...env(), TRUST_PROXY_HOPS: '0' }));
    for (let i = 0; i < 200; i++)
      await request(direct)
        .get('/api/v1/auth/csrf')
        .set('X-Forwarded-For', `192.0.2.${i % 10}`);
    expect(
      (await request(direct).get('/api/v1/auth/csrf').set('X-Forwarded-For', '192.0.2.99')).status,
    ).toBe(429);
  });
});

describe('HTTP lifecycle', () => {
  const cleanups: (() => Promise<unknown>)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });
  it('drains a real in-flight request before disconnecting and coalesces repeated shutdown', async () => {
    const app = express();
    let finish!: () => void;
    let entered!: () => void;
    const active = new Promise<void>((resolve) => {
      entered = resolve;
    });
    app.get('/slow', (_req, res) => {
      entered();
      finish = () => res.end('complete');
    });
    let disconnected = false;
    const state = { draining: false };
    const runtime = createRuntime(app, state, async () => {
      disconnected = true;
    });
    runtime.server.listen(0, '127.0.0.1');
    await once(runtime.server, 'listening');
    cleanups.push(() => runtime.shutdown());
    const port = (runtime.server.address() as { port: number }).port;
    const response = fetch(`http://127.0.0.1:${port}/slow`);
    await active;
    const stopping = runtime.shutdown();
    expect(runtime.shutdown()).toBe(stopping);
    expect(state.draining).toBe(true);
    expect(disconnected).toBe(false);
    finish();
    expect(await (await response).text()).toBe('complete');
    expect(await stopping).toBe(0);
    expect(disconnected).toBe(true);
    expect(runtime.server.headersTimeout).toBe(10000);
    expect(runtime.server.requestTimeout).toBe(30000);
  });
  it('reports disconnect failures as a failed shutdown', async () => {
    const runtime = createRuntime(express(), { draining: false }, async () => {
      throw new Error('private');
    });
    runtime.server.listen(0, '127.0.0.1');
    await once(runtime.server, 'listening');
    expect(await runtime.shutdown()).toBe(1);
  });
  it('forces a bounded failure when an active request will not drain', async () => {
    const app = express();
    let entered!: () => void;
    const active = new Promise<void>((resolve) => {
      entered = resolve;
    });
    app.get('/stuck', () => entered());
    const runtime = createRuntime(app, { draining: false }, async () => {}, 80);
    runtime.server.listen(0, '127.0.0.1');
    await once(runtime.server, 'listening');
    const port = (runtime.server.address() as { port: number }).port;
    const response = fetch(`http://127.0.0.1:${port}/stuck`).catch(() => undefined);
    await active;
    expect(await runtime.shutdown()).toBe(1);
    await response;
  });
});
