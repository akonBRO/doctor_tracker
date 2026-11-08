import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { SignJWT } from 'jose';
import { generate } from 'otplib';
import { doctorQuerySchema, type Doctor } from '@doctor-tracker/shared';
import { createApp } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { loadConfig, type Config } from '../config/env.js';
import { Invitation, Session } from '../models/auth.js';
import { DoctorModel } from '../models/doctor.js';
import { hashToken, randomToken } from '../utils/security.js';
import { doctorFilter } from '../services/doctors.js';

let database: MongoMemoryReplSet;
let config: Config;
let app: Awaited<ReturnType<typeof createApp>>;
let cookies: string;
let csrf: string;
let challengeCookie: string;
let adminId: string;
const origin = 'http://localhost:3000';
const doctor = {
  name: 'Dr. Amina Rahman',
  specialization: 'Cardiology',
  hospital: 'City Medical Center',
  phone: '+880 (1712) 345-678',
  email: 'amina@example.test',
};
const cookieList = (response: request.Response) =>
  response.headers['set-cookie'] as unknown as string[];
const post = (body: object = doctor) =>
  request(app)
    .post('/api/v1/doctors')
    .set('Cookie', cookies)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send(body);
const get = (path = '') => request(app).get(`/api/v1/doctors${path}`).set('Cookie', cookies);
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
  const agent = request.agent(app);
  csrf = (await agent.get('/api/v1/auth/csrf')).body.data.token;
  const token = randomToken();
  await Invitation.create({
    email: 'doctor-test@example.test',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const signup = await agent
    .post('/api/v1/auth/signup')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send({
      email: 'doctor-test@example.test',
      name: 'Doctor Test Admin',
      password: 'Tests-only-Password-582!',
      invitation: token,
    });
  expect(signup.status).toBe(201);
  challengeCookie = cookieList(signup)[0]!.split(';')[0]!;
  const setup = await agent
    .post('/api/v1/auth/mfa/setup')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send({});
  const verified = await agent
    .post('/api/v1/auth/mfa/verify')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send({ code: await generate({ secret: setup.body.data.secret }) });
  expect(verified.status).toBe(200);
  adminId = verified.body.data.admin.id;
  cookies = [
    ...cookieList(verified)
      .filter((value) => !value.startsWith('dt_challenge='))
      .map((value) => value.split(';')[0]),
    `dt_csrf=${csrf}`,
  ].join('; ');
});
beforeEach(async () => {
  await DoctorModel.deleteMany({});
  app = await createApp(config);
});
afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

describe('doctor creation and security', () => {
  it('persists and projects exactly the authorized doctor fields', async () => {
    const result = await post({
      ...doctor,
      name: '  Dr. Amina   Rahman  ',
      email: ' AMINA@Example.Test ',
    });
    expect(result.status).toBe(201);
    expect(result.body.data.doctor.name).toBe(doctor.name);
    expect(result.body.data.doctor.email).toBe(doctor.email);
    expect(Object.keys(result.body.data.doctor).sort()).toEqual(
      [
        'id',
        'name',
        'specialization',
        'hospital',
        'phone',
        'email',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    const stored = await DoctorModel.findById(result.body.data.doctor.id).select(
      '+nameKey +searchTokens',
    );
    expect(stored!.nameKey).toBe('dr. amina rahman');
    expect(stored!.searchTokens).toContain('rahman');
  });
  it('accepts international names and formatted international phone numbers without contact uniqueness', async () => {
    for (const phone of ['+44 20 7946 0958', '+1 (212) 555-0123', '01712 345678'])
      expect(
        (
          await post({
            ...doctor,
            name: phone === '01712 345678' ? '李' : 'ডা. নাদিয়া — José O’Neill',
            phone,
          })
        ).status,
      ).toBe(201);
    expect(await DoctorModel.countDocuments()).toBe(3);
  });
  it.each(['name', 'specialization', 'hospital', 'phone', 'email'])(
    'rejects missing %s',
    async (field) => {
      const input: Record<string, string> = { ...doctor };
      delete input[field];
      expect((await post(input)).status).toBe(422);
    },
  );
  it.each([
    { email: 'not-an-email' },
    { phone: 'abc123' },
    { phone: '+1 123' },
    { phone: '+1234567890123456' },
    { name: ' '.repeat(20) },
    { name: '--' },
    { hospital: 'x'.repeat(261) },
    { role: 'admin' },
    { _id: new mongoose.Types.ObjectId().toString() },
    { createdAt: '2020-01-01' },
  ])('rejects invalid or internal fields: %j', async (invalid) => {
    expect((await post({ ...doctor, ...invalid })).status).toBe(422);
    expect(await DoctorModel.countDocuments()).toBe(0);
  });
  it('rejects unauthenticated and incomplete-MFA access to every doctor read/write endpoint', async () => {
    for (const cookie of ['', challengeCookie]) {
      for (const path of ['', '/options?field=hospital', `/${new mongoose.Types.ObjectId()}`])
        expect(
          (await request(app).get(`/api/v1/doctors${path}`).set('Cookie', cookie)).status,
        ).toBe(401);
      expect(
        (
          await request(app)
            .post('/api/v1/doctors')
            .set('Cookie', `${cookie}; dt_csrf=${csrf}`)
            .set('Origin', origin)
            .set('X-CSRF-Token', csrf)
            .send(doctor)
        ).status,
      ).toBe(401);
    }
  });
  it('rejects non-admin tokens, unverified-MFA claims, forged sessions and revoked sessions', async () => {
    const session = await Session.findOne({ adminId });
    for (const claims of [
      { role: 'doctor', sid: session!._id.toString(), amr: ['pwd', 'mfa'] },
      { role: 'admin', sid: session!._id.toString(), amr: ['pwd'] },
      { role: 'admin', sid: new mongoose.Types.ObjectId().toString(), amr: ['pwd', 'mfa'] },
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
        (await request(app).get('/api/v1/doctors').set('Cookie', `dt_access=${token}`)).status,
      ).toBe(401);
    }
    await Session.updateOne({ _id: session!._id }, { revokedAt: new Date() });
    expect((await get()).status).toBe(401);
    await Session.updateOne({ _id: session!._id }, { revokedAt: null });
  });
  it('enforces CSRF, Origin, operator rejection and prototype pollution defenses', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/doctors')
          .set('Cookie', cookies)
          .set('Origin', origin)
          .send(doctor)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/doctors')
          .set('Cookie', cookies)
          .set('Origin', 'https://evil.example')
          .set('X-CSRF-Token', csrf)
          .send(doctor)
      ).status,
    ).toBe(403);
    expect((await post({ ...doctor, name: { $ne: '' } })).status).toBe(400);
    const polluted = await request(app)
      .post('/api/v1/doctors')
      .set('Cookie', cookies)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .type('json')
      .send('{"__proto__":{"admin":true}}');
    expect(polluted.status).toBe(400);
    for (const query of [
      '?%24where=x',
      '?nameKey=x',
      '?q[$ne]=x',
      '?sort=nameKey',
      '?limit=999999',
    ])
      expect([400, 422]).toContain((await get(query)).status);
    expect(await DoctorModel.countDocuments()).toBe(0);
  });
  it('rate-limits doctor writes independently of ordinary browsing', async () => {
    for (let i = 0; i < 60; i++) expect((await post({})).status).toBe(422);
    const limited = await post();
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect((await get()).status).toBe(200);
    expect(await DoctorModel.countDocuments()).toBe(0);
  });
  it('applies model validation and safely preserves user text instead of rendering HTML', async () => {
    await expect(DoctorModel.create({ ...doctor, email: 'broken' })).rejects.toThrow();
    const result = await post({ ...doctor, name: '<img src=x onerror=alert(1)>' });
    expect(result.status).toBe(201);
    expect(result.body.data.doctor.name).toContain('<img');
  });
});

describe('directory queries, details and indexes', () => {
  async function fixture() {
    const docs = await DoctorModel.create([
      { ...doctor },
      { ...doctor, name: 'Dr. Bina Sen', specialization: 'Neurology', hospital: 'North Hospital' },
      { ...doctor, name: 'Dr. Zara Rahman', hospital: 'North Hospital' },
      { ...doctor, name: 'Dr. Amina Rahman', hospital: 'West Hospital' },
    ]);
    for (let i = 0; i < docs.length; i++)
      await DoctorModel.collection.updateOne(
        { _id: docs[i]!._id },
        { $set: { createdAt: new Date(`2026-01-0${i + 1}T23:59:59.999Z`) } },
      );
    return docs;
  }
  it('reads actual persisted records and all detail fields without internal keys', async () => {
    const docs = await fixture();
    const list = await get();
    expect(list.body.data.pagination.totalItems).toBe(4);
    const detail = await get(`/${docs[0]!._id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.doctor.email).toBe(doctor.email);
    expect(detail.body.data.doctor.searchTokens).toBeUndefined();
  });
  it.each(['RAH', '  amina  ', 'city med', 'card'])(
    'searches case-insensitive word prefixes: %s',
    async (q) => {
      await fixture();
      const result = await get(`?q=${encodeURIComponent(q)}`);
      expect(result.status).toBe(200);
      expect(result.body.data.items.length).toBeGreaterThan(0);
    },
  );
  it('treats regex metacharacters as non-executable text', async () => {
    await fixture();
    expect((await get('?q=.*')).body.data.pagination.totalItems).toBe(0);
    expect((await get('?q=' + encodeURIComponent('(a+)+$'))).status).toBe(200);
  });
  it('combines search, both exact normalized filters, inclusive UTC dates, sort and pagination', async () => {
    await fixture();
    const params = new URLSearchParams({
      q: 'rah',
      specialization: ' cardiology ',
      hospital: ' CITY MEDICAL CENTER ',
      from: '2026-01-01',
      to: '2026-01-01',
      limit: '1',
      page: '1',
      sort: 'oldest',
    });
    const response = await get(`?${params}`);
    expect(response.status).toBe(200);
    expect(response.body.data.pagination.totalItems).toBe(1);
    expect(response.body.data.items[0].name).toBe(doctor.name);
    expect((await get('?specialization=neurology')).body.data.pagination.totalItems).toBe(1);
    expect((await get('?hospital=North%20Hospital')).body.data.pagination.totalItems).toBe(2);
  });
  it('counts filtered pages accurately and handles empty/out-of-range pages consistently', async () => {
    expect((await get()).body.data.pagination.totalPages).toBe(0);
    await fixture();
    const first = (await get('?limit=2&page=1')).body.data;
    const last = (await get('?limit=2&page=2')).body.data;
    expect(first.pagination).toEqual({
      page: 1,
      limit: 2,
      totalItems: 4,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(last.pagination.hasNextPage).toBe(false);
    expect(new Set([...first.items, ...last.items].map((row) => row.id)).size).toBe(4);
    const beyond = (await get('?limit=2&page=3')).body.data;
    expect(beyond.items).toEqual([]);
    expect(beyond.pagination.page).toBe(3);
  });
  it('uses deterministic id tie-breaks for equal names and timestamps', async () => {
    const docs = await fixture();
    await DoctorModel.collection.updateMany({}, { $set: { createdAt: new Date('2026-01-01') } });
    const newest = (await get('?sort=newest')).body.data.items;
    expect(newest.map((row: Doctor) => row.id)).toEqual(
      docs.map((row) => row._id.toString()).reverse(),
    );
    const asc = (await get('?sort=name-asc')).body.data.items;
    const desc = (await get('?sort=name-desc')).body.data.items;
    expect(asc.map((row: Doctor) => row.id)).toEqual(desc.map((row: Doctor) => row.id).reverse());
  });
  it.each([
    '?page=0',
    '?page=-1',
    '?page=1.5',
    '?page=10001',
    '?page=abc',
    '?limit=0',
    '?limit=51',
    '?limit=1.5',
    '?sort=unknown',
    '?from=2026-02-30',
    '?from=2026-02-01&to=2026-01-01',
    '?q=a&q=b',
    '?from=not-date',
    '?to=2026-02-29',
  ])('rejects malformed or unbounded query: %s', async (query) => {
    expect((await get(query)).status).toBe(422);
  });
  it('distinguishes malformed and nonexistent doctor identifiers', async () => {
    expect((await get('/invalid-id')).status).toBe(422);
    expect((await get(`/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });
  it('returns actual bounded specialization/hospital suggestions with prefix lookup', async () => {
    await fixture();
    expect((await get('/options?field=specialization')).body.data.values).toEqual([
      'Cardiology',
      'Neurology',
    ]);
    expect((await get('/options?field=hospital&q=north')).body.data.values).toEqual([
      'North Hospital',
    ]);
    expect((await get('/options?field=password')).status).toBe(422);
  });
  it('verifies representative query plans use the intended indexes on real data', async () => {
    await DoctorModel.create(
      Array.from({ length: 250 }, (_, i) => ({
        ...doctor,
        name: i === 100 ? 'RarePrefix Doctor' : `Test Doctor ${i}`,
        specialization: i % 2 ? 'Neurology' : 'Cardiology',
        hospital: `Hospital ${i % 10}`,
      })),
    );
    const summaries: Record<string, unknown> = {};
    for (const [label, query] of [
      ['newest', {}],
      ['specialization', { specialization: 'Neurology' }],
      ['prefix', { q: 'rareprefix' }],
    ] as const) {
      const plan = await DoctorModel.collection
        .find(doctorFilter(doctorQuerySchema.parse(query)))
        .sort({ createdAt: -1, _id: -1 })
        .limit(10)
        .explain('executionStats');
      expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain('IXSCAN');
      summaries[label] = {
        returned: plan.executionStats.nReturned,
        keysExamined: plan.executionStats.totalKeysExamined,
        docsExamined: plan.executionStats.totalDocsExamined,
        plan: plan.queryPlanner.winningPlan,
      };
    }
    mkdirSync('tmp', { recursive: true });
    writeFileSync('tmp/doctor-query-plans.json', JSON.stringify(summaries, null, 2));
  });
});
