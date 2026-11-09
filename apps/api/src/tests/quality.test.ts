import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { randomToken } from '../utils/security.js';
import { SignJWT } from 'jose';
let signingKey: string;

let app: Awaited<ReturnType<typeof createApp>>;
beforeEach(async () => {
  signingKey = randomToken();
  app = await createApp(
    loadConfig({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:1/disconnected-test-only',
      WEB_ORIGIN: 'http://localhost:3000',
      JWT_SECRET: signingKey,
      MFA_ENCRYPTION_KEY: randomToken(),
      CSRF_SECRET: randomToken(),
      COOKIE_SECURE: 'false',
    }),
  );
});
describe('bounded input and global abuse budget', () => {
  it('reports a disconnected database without buffering a valid signed request', async () => {
    const id = '000000000000000000000000';
    const token = await new SignJWT({ role: 'admin', sid: id, amr: ['pwd', 'mfa'] })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('doctor-tracker-api')
      .setAudience('doctor-tracker-web')
      .setSubject(id)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(Buffer.from(signingKey, 'hex'));
    expect((await request(app).get('/api/v1/health')).status).toBe(503);
    const result = await request(app).get('/api/v1/patients').set('Cookie', `dt_access=${token}`);
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });
  it('rejects deeply nested JSON before recursive inspection can exhaust the stack', async () => {
    const agent = request.agent(app);
    const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.token as string;
    const nested = '{"x":'.repeat(9000) + '0' + '}'.repeat(9000);
    const result = await agent
      .post('/api/v1/doctors/000000000000000000000000/patients')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .set('X-CSRF-Token', csrf)
      .send(nested);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('INVALID_INPUT');
  });
  it('charges rejected mutations to the global budget before validation', async () => {
    for (let index = 0; index < 200; index++)
      expect((await request(app).post('/api/v1/auth/login').send({})).status).toBe(403);
    expect((await request(app).post('/api/v1/auth/login').send({})).status).toBe(429);
  });
});
