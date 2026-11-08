import { randomBytes } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { generate } from 'otplib';
import { SignJWT } from 'jose';
import { createApp } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { loadConfig, type Config } from '../config/env.js';
import { Admin, Challenge, Invitation, Session } from '../models/auth.js';
import {
  hashPassword,
  hashToken,
  randomToken,
  verifyPassword,
  decryptSecret,
  encryptSecret,
} from '../utils/security.js';

let database: MongoMemoryReplSet;
let app: Awaited<ReturnType<typeof createApp>>;
let config: Config;
const origin = 'http://localhost:3000';
const password = 'Test-only-Password-918!';
let emailCounter = 0;
const nextEmail = () => `test-${++emailCounter}@example.test`;
type Client = { agent: ReturnType<typeof request.agent>; csrf: string };

beforeAll(async () => {
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: database.getUri(),
    WEB_ORIGIN: origin,
    JWT_SECRET: randomToken(),
    MFA_ENCRYPTION_KEY: randomToken(),
    CSRF_SECRET: randomToken(),
    COOKIE_SECURE: 'false',
  });
  await connectDatabase(config);
  app = await createApp(config);
});
afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});
beforeEach(async () => {
  await Promise.all([
    Admin.deleteMany({}),
    Challenge.deleteMany({}),
    Invitation.deleteMany({}),
    Session.deleteMany({}),
  ]);
  app = await createApp(config);
});

async function client(): Promise<Client> {
  const agent = request.agent(app);
  const response = await agent.get('/api/v1/auth/csrf');
  return { agent, csrf: response.body.data.token };
}
function post(c: Client, path: string, body: object = {}) {
  return c.agent
    .post(`/api/v1/auth/${path}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .send(body);
}
async function invitation(email: string, expiresAt = new Date(Date.now() + 60_000)) {
  const token = randomToken();
  await Invitation.create({ email, tokenHash: hashToken(token), expiresAt });
  return token;
}
async function signup(c: Client, email = nextEmail()) {
  const token = await invitation(email);
  const response = await post(c, 'signup', {
    name: 'Test Administrator',
    email,
    password,
    invitation: token,
  });
  expect(response.status).toBe(201);
  return { token, email };
}
async function enroll(c: Client) {
  await signup(c);
  const setup = await post(c, 'mfa/setup');
  expect(setup.status).toBe(200);
  const code = await generate({ secret: setup.body.data.secret });
  const response = await post(c, 'mfa/verify', { code });
  expect(response.status).toBe(200);
  return { response, secret: setup.body.data.secret as string };
}
const responseCookies = (response: request.Response) =>
  response.headers['set-cookie'] as unknown as string[];

describe('configuration and cryptography', () => {
  it('requires independent secrets and HTTPS with secure production cookies', () => {
    expect(() => loadConfig({})).toThrow('Invalid environment');
    expect(() =>
      loadConfig({
        ...process.env,
        ...config,
        COOKIE_SECURE: 'false',
        NODE_ENV: 'production',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow();
    expect(() =>
      loadConfig({
        MONGODB_URI: 'mongodb://localhost/test',
        WEB_ORIGIN: origin,
        JWT_SECRET: 'x'.repeat(64),
        MFA_ENCRYPTION_KEY: randomToken(),
        CSRF_SECRET: randomToken(),
        COOKIE_SECURE: 'false',
      }),
    ).toThrow();
  });
  it('uses salted Argon2id password hashes and rejects incorrect passwords', async () => {
    const hash = await hashPassword(password);
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain(password);
    expect(await verifyPassword(hash, password)).toBe(true);
    expect(await verifyPassword(hash, 'incorrect')).toBe(false);
  });
  it('encrypts MFA secrets with authenticated AES-GCM and rejects tampering', () => {
    const encrypted = encryptSecret('PRIVATE-MFA-SECRET', config.MFA_ENCRYPTION_KEY);
    expect(encrypted).not.toContain('PRIVATE');
    expect(decryptSecret(encrypted, config.MFA_ENCRYPTION_KEY)).toBe('PRIVATE-MFA-SECRET');
    const parts = encrypted.split('.');
    parts[2] = randomBytes(18).toString('hex');
    expect(() => decryptSecret(parts.join('.'), config.MFA_ENCRYPTION_KEY)).toThrow();
  });
  it('connects to real MongoDB with unique and TTL indexes and reports health', async () => {
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
    const indexes = await Invitation.collection.indexes();
    expect(indexes.some((index) => index.key.tokenHash && index.unique)).toBe(true);
    expect(indexes.some((index) => index.key.expiresAt && index.expireAfterSeconds === 0)).toBe(
      true,
    );
  });
});

describe('invitation-only registration', () => {
  it('rejects arbitrary signup and extra role input', async () => {
    const c = await client();
    const email = nextEmail();
    expect((await post(c, 'signup', { name: 'Visitor', email, password })).status).toBe(422);
    expect(
      (
        await post(c, 'signup', {
          name: 'Visitor',
          email,
          password,
          invitation: randomToken(),
          role: 'admin',
        })
      ).status,
    ).toBe(422);
    expect(await Admin.countDocuments()).toBe(0);
  });
  it('rejects expired invitations, wrong email, and reused invitations', async () => {
    const c = await client();
    const email = nextEmail();
    const expired = await invitation(email, new Date(Date.now() - 1000));
    expect(
      (await post(c, 'signup', { name: 'Test Admin', email, password, invitation: expired }))
        .status,
    ).toBe(400);
    const token = await invitation(email);
    expect(
      (
        await post(c, 'signup', {
          name: 'Test Admin',
          email: nextEmail(),
          password,
          invitation: token,
        })
      ).status,
    ).toBe(400);
    expect(
      (await post(c, 'signup', { name: 'Test Admin', email, password, invitation: token })).status,
    ).toBe(201);
    expect(
      (await post(c, 'signup', { name: 'Test Admin', email, password, invitation: token })).status,
    ).toBe(400);
    expect(await Admin.countDocuments()).toBe(1);
  });
  it('consumes a concurrent invitation exactly once', async () => {
    const a = await client();
    const b = await client();
    const email = nextEmail();
    const token = await invitation(email);
    const results = await Promise.all([
      post(a, 'signup', { name: 'Test Admin', email, password, invitation: token }),
      post(b, 'signup', { name: 'Test Admin', email, password, invitation: token }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    expect(await Admin.countDocuments()).toBe(1);
  });
});

describe('password and MFA authentication', () => {
  it('returns the same error for incorrect password and unknown email', async () => {
    const c = await client();
    const { email } = await signup(c);
    const wrong = await post(c, 'login', { email, password: 'incorrect' });
    const unknown = await post(c, 'login', { email: nextEmail(), password });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });
  it('does not grant a session before MFA and rejects invalid codes', async () => {
    const c = await client();
    await signup(c);
    expect((await c.agent.get('/api/v1/auth/me')).status).toBe(401);
    expect(await Session.countDocuments()).toBe(0);
    expect((await post(c, 'mfa/verify', { code: '000000' })).status).toBe(401);
    await post(c, 'mfa/setup');
    expect((await post(c, 'mfa/verify', { code: '12345' })).status).toBe(422);
    expect(await Session.countDocuments()).toBe(0);
  });
  it('enrolls an authenticator, returns recovery codes once, and stores secrets securely', async () => {
    const c = await client();
    const { response, secret } = await enroll(c);
    expect(response.body.data.recoveryCodes).toHaveLength(8);
    expect((await c.agent.get('/api/v1/auth/me')).body.data.admin.role).toBe('admin');
    const admin = await Admin.findOne().select('+mfaSecret +recoveryHashes +passwordHash');
    expect(admin!.mfaEnabled).toBe(true);
    expect(admin!.mfaSecret).not.toContain(secret);
    expect(admin!.recoveryHashes).not.toContain(response.body.data.recoveryCodes[0]);
    expect(admin!.passwordHash).toMatch(/^\$argon2id\$/);
    expect((await post(c, 'mfa/setup')).status).toBe(401);
  });
  it('rejects expired challenges even before TTL cleanup', async () => {
    const c = await client();
    await signup(c);
    await Challenge.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await post(c, 'mfa/setup')).status).toBe(401);
  });
  it('locks a challenge after five failed verification attempts', async () => {
    const c = await client();
    await signup(c);
    await post(c, 'mfa/setup');
    const broken = '000000';
    for (let i = 0; i < 5; i++)
      expect((await post(c, 'mfa/verify', { code: broken })).status).toBe(401);
    const response = await post(c, 'mfa/verify', { code: broken });
    expect(response.body.error.code).toBe('CHALLENGE_EXPIRED');
  });
  it('rejects TOTP replay and permits single-use recovery after password authentication', async () => {
    const c = await client();
    const { response, secret } = await enroll(c);
    const email = response.body.data.admin.email;
    await post(c, 'logout');
    const fresh = await client();
    await post(fresh, 'login', { email, password });
    const replay = await post(fresh, 'mfa/verify', { code: await generate({ secret }) });
    expect(replay.status).toBe(401);
    const code = response.body.data.recoveryCodes[0];
    const recovered = await post(fresh, 'mfa/recovery', { code });
    expect(recovered.status).toBe(200);
    expect(recovered.body.data.recoveryCodes).toBeUndefined();
    await post(fresh, 'logout');
    const again = await client();
    await post(again, 'login', { email, password });
    expect((await post(again, 'mfa/recovery', { code })).status).toBe(401);
  });
  it('issues a new password challenge and verifies an actual fresh TOTP during login', async () => {
    const c = await client();
    const { response, secret } = await enroll(c);
    const email = response.body.data.admin.email;
    await post(c, 'logout');
    const fresh = await client();
    expect((await post(fresh, 'login', { email, password })).body.data.step).toBe('verify');
    // Move last accepted step back to isolate a new valid login without waiting 30 seconds.
    await Admin.updateOne({ email }, { $set: { lastTotpStep: -1 } });
    expect((await post(fresh, 'mfa/verify', { code: await generate({ secret }) })).status).toBe(
      200,
    );
    expect((await fresh.agent.get('/api/v1/auth/me')).status).toBe(200);
  });
});

describe('sessions and authorization', () => {
  it('rejects missing, forged, wrong-audience, non-admin, and pre-MFA tokens', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    const c = await client();
    const { response } = await enroll(c);
    const adminId = response.body.data.admin.id;
    const session = await Session.findOne();
    for (const claims of [
      { role: 'patient', sid: session!._id.toString(), amr: ['pwd', 'mfa'] },
      { role: 'admin', sid: session!._id.toString(), amr: ['pwd'] },
    ]) {
      const token = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(adminId)
        .setIssuer('doctor-tracker-api')
        .setAudience('doctor-tracker-web')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(Buffer.from(config.JWT_SECRET, 'hex'));
      expect(
        (await request(app).get('/api/v1/auth/me').set('Cookie', `dt_access=${token}`)).status,
      ).toBe(401);
    }
    const wrong = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('wrong')
      .setExpirationTime('5m')
      .sign(Buffer.from(config.JWT_SECRET, 'hex'));
    expect(
      (await request(app).get('/api/v1/auth/me').set('Cookie', `dt_access=${wrong}`)).status,
    ).toBe(401);
    expect(
      (await request(app).get('/api/v1/auth/me').set('Cookie', 'dt_access=forged')).status,
    ).toBe(401);
  });
  it('rotates refresh tokens and revokes the whole family on replay', async () => {
    const c = await client();
    const { response } = await enroll(c);
    const oldRefresh = responseCookies(response)
      .find((cookie) => cookie.startsWith('dt_refresh='))!
      .split(';')[0]!;
    const refreshed = await post(c, 'refresh');
    expect(refreshed.status).toBe(200);
    expect((await c.agent.get('/api/v1/auth/me')).status).toBe(200);
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('X-CSRF-Token', c.csrf)
      .set('Cookie', `${oldRefresh}; dt_csrf=${c.csrf}`)
      .send({});
    expect(replay.status).toBe(401);
    expect((await c.agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await post(c, 'refresh')).status).toBe(401);
  });
  it('immediately revokes access and refresh on logout', async () => {
    const c = await client();
    const { response } = await enroll(c);
    const savedCookies = [
      ...responseCookies(response).map((cookie) => cookie.split(';')[0]),
      `dt_csrf=${c.csrf}`,
    ].join('; ');
    expect((await post(c, 'logout')).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', savedCookies)).status).toBe(
      401,
    );
    expect(
      (
        await request(app)
          .post('/api/v1/auth/refresh')
          .set('Origin', origin)
          .set('X-CSRF-Token', c.csrf)
          .set('Cookie', savedCookies)
          .send({})
      ).status,
    ).toBe(401);
  });
  it('rejects disabled admins and expired refresh tokens', async () => {
    const c = await client();
    await enroll(c);
    await Admin.updateMany({}, { disabled: true });
    expect((await c.agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await post(c, 'refresh')).status).toBe(401);
    await Admin.updateMany({}, { disabled: false });
    await Session.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await post(c, 'refresh')).status).toBe(401);
  });
  it('uses HttpOnly, SameSite cookies and enforces Secure production cookie prefixes', async () => {
    const c = await client();
    const { response } = await enroll(c);
    for (const name of ['dt_access=', 'dt_refresh=']) {
      const cookie = responseCookies(response).find((cookie) => cookie.startsWith(name))!;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).not.toContain('; Secure');
    }
    const secureApp = await createApp({
      ...config,
      COOKIE_SECURE: true,
      WEB_ORIGIN: 'https://doctor.example.test',
      NODE_ENV: 'production',
    });
    const responseSecure = await request(secureApp).get('/api/v1/auth/csrf');
    const cookie = responseCookies(responseSecure)[0]!;
    expect(cookie).toContain('__Host-dt_csrf=');
    expect(cookie).toContain('; Secure');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Domain=');
  });
});

describe('request defenses', () => {
  it('rejects missing or forged CSRF, missing Origin, and unauthorized CORS', async () => {
    expect(
      (await request(app).post('/api/v1/auth/login').set('Origin', origin).send({})).status,
    ).toBe(403);
    const c = await client();
    expect(
      (
        await c.agent
          .post('/api/v1/auth/login')
          .set('Origin', origin)
          .set('X-CSRF-Token', 'forged')
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (await c.agent.post('/api/v1/auth/logout').set('X-CSRF-Token', c.csrf).send({})).status,
    ).toBe(403);
    const cors = await request(app)
      .get('/api/v1/auth/csrf')
      .set('Origin', 'https://attacker.example');
    expect(cors.status).toBe(403);
    expect(cors.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('rejects MongoDB operators, prototype keys, query injection, and malformed JSON', async () => {
    const c = await client();
    expect((await post(c, 'login', { email: { $ne: '' }, password })).status).toBe(400);
    const pollution = await c.agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', c.csrf)
      .set('Content-Type', 'application/json')
      .send('{"__proto__":{"admin":true}}');
    expect(pollution.status).toBe(400);
    expect((await c.agent.get('/api/v1/auth/me?role=admin')).status).toBe(400);
    const malformed = await c.agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', c.csrf)
      .set('Content-Type', 'application/json')
      .send('{invalid');
    expect(malformed.status).toBe(400);
  });
  it('enforces JSON content type, payload limits, and safe errors', async () => {
    const c = await client();
    expect(
      (
        await c.agent
          .post('/api/v1/auth/logout')
          .set('Origin', origin)
          .set('X-CSRF-Token', c.csrf)
          .type('form')
          .send({})
      ).status,
    ).toBe(415);
    const huge = await post(c, 'login', { email: nextEmail(), password: 'x'.repeat(17000) });
    expect(huge.status).toBe(413);
    expect(JSON.stringify(huge.body)).not.toContain('stack');
  });
  it('rate-limits sensitive login attempts', async () => {
    const c = await client();
    const email = nextEmail();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push((await post(c, 'login', { email, password })).status);
    expect(statuses[10]).toBe(429);
  });
});
