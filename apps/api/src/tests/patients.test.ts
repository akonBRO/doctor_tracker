import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { SignJWT } from 'jose';
import { generate } from 'otplib';
import { createApp } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { loadConfig, type Config } from '../config/env.js';
import { Invitation, Session } from '../models/auth.js';
import { DoctorModel } from '../models/doctor.js';
import { hashToken, randomToken } from '../utils/security.js';
import { PatientModel } from '../models/patient.js';
import { listPatients, createPatient } from '../services/patients.js';
import { patientQuerySchema } from '@doctor-tracker/shared';

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
    email: 'patient-test@example.test',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const signup = await agent
    .post('/api/v1/auth/signup')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send({
      email: 'patient-test@example.test',
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
  await PatientModel.deleteMany({});
  await DoctorModel.deleteMany({});
  app = await createApp(config);
});
afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

function endpoint(method: 'post' | 'patch' | 'delete', path: string) {
  const client = request(app);
  return client[method](path);
}
const input = { name: 'Amina Rahman', condition: 'Follow-up / cardiology' };
const id = () => new mongoose.Types.ObjectId().toString();
const read = (path: string) => request(app).get(`/api/v1${path}`).set('Cookie', cookies);
const write = (method: 'post' | 'patch' | 'delete', path: string, body: object = {}) =>
  endpoint(method, `/api/v1${path}`)
    .set('Cookie', cookies)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send(body);
async function fixture() {
  const d = await DoctorModel.create(doctor);
  const other = await DoctorModel.create({ ...doctor, name: 'Dr. Other' });
  const created = await write('post', `/doctors/${d.id}/patients`, input);
  expect(created.status).toBe(201);
  return {
    d: d.id as string,
    other: other.id as string,
    p: created.body.data.patient.id as string,
  };
}
describe('patient persistence and object security', () => {
  it('stores only the intended fields and returns a minimal doctor projection', async () => {
    const { d, p } = await fixture();
    const result = await read(`/patients/${p}`);
    expect(result.status).toBe(200);
    expect(result.body.data.patient).toMatchObject({
      ...input,
      doctorId: d,
      doctor: { id: d, name: doctor.name, specialization: doctor.specialization },
    });
    expect(Object.keys(result.body.data.patient).sort()).toEqual(
      ['id', 'name', 'condition', 'doctorId', 'doctor', 'createdAt', 'updatedAt'].sort(),
    );
    expect(Object.keys(result.body.data.patient.doctor).sort()).toEqual([
      'id',
      'name',
      'specialization',
    ]);
    expect((await PatientModel.findById(p))?.doctorId.toString()).toBe(d);
  });
  it.each([
    { name: '' },
    { condition: '' },
    { name: '--' },
    { condition: ' '.repeat(8) },
    { name: 'a'.repeat(121) },
    { condition: 'a'.repeat(161) },
    { name: { $ne: null } },
    { doctorId: id() },
    { role: 'admin' },
    { createdAt: new Date().toISOString() },
  ])('rejects invalid or unassigned create properties %j', async (extra) => {
    const d = await DoctorModel.create(doctor);
    expect([400, 422]).toContain(
      (await write('post', `/doctors/${d.id}/patients`, { ...input, ...extra })).status,
    );
    expect(await PatientModel.countDocuments()).toBe(0);
  });
  it('normalizes whitespace while retaining international display text and free-text conditions', async () => {
    const d = await DoctorModel.create(doctor);
    const r = await write('post', `/doctors/${d.id}/patients`, {
      name: '  José   李 ',
      condition: '  Review / BP  ',
    });
    expect(r.status).toBe(201);
    expect(r.body.data.patient.name).toBe('José 李');
    expect(r.body.data.patient.condition).toBe('Review / BP');
  });
  it('rejects invalid and absent parents without creating dangling records', async () => {
    expect((await write('post', '/doctors/invalid/patients', input)).status).toBe(422);
    expect((await write('post', `/doctors/${id()}/patients`, input)).status).toBe(404);
    expect(await PatientModel.countDocuments()).toBe(0);
  });
  it('requires authenticated, completed MFA for all patient endpoints', async () => {
    const { d, p } = await fixture();
    for (const path of ['/patients', `/patients/${p}`, `/doctors/${d}/patients`]) {
      expect((await request(app).get(`/api/v1${path}`)).status).toBe(401);
      expect((await request(app).get(`/api/v1${path}`).set('Cookie', challengeCookie)).status).toBe(
        401,
      );
    }
    for (const method of ['post', 'patch', 'delete'] as const) {
      const path = method === 'post' ? `/doctors/${d}/patients` : `/patients/${p}`;
      expect(
        (
          await endpoint(method, `/api/v1${path}`)
            .set('Cookie', `dt_csrf=${csrf}`)
            .set('Origin', origin)
            .set('X-CSRF-Token', csrf)
            .send(method === 'delete' ? {} : input)
        ).status,
      ).toBe(401);
    }
  });
  it('rejects forged role and incomplete MFA signed claims even with a valid session id', async () => {
    const sid = (await Session.findOne({ adminId }))!.id;
    for (const claims of [
      { role: 'doctor', amr: ['pwd', 'mfa'] },
      { role: 'admin', amr: ['pwd'] },
    ]) {
      const token = await new SignJWT({ sid, ...claims })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(adminId)
        .setIssuer('doctor-tracker-api')
        .setAudience('doctor-tracker-web')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(Buffer.from(config.JWT_SECRET, 'hex'));
      expect(
        (await request(app).get('/api/v1/patients').set('Cookie', `dt_access=${token}`)).status,
      ).toBe(401);
    }
  });
  it('protects create edit global delete and scoped delete with CSRF and exact origin', async () => {
    const { d, p } = await fixture();
    for (const [method, path, body] of [
      ['post', `/doctors/${d}/patients`, input],
      ['patch', `/patients/${p}`, input],
      ['delete', `/patients/${p}`, {}],
      ['delete', `/doctors/${d}/patients/${p}`, {}],
    ] as const) {
      expect(
        (
          await endpoint(method, `/api/v1${path}`)
            .set('Cookie', cookies)
            .set('Origin', origin)
            .send(body)
        ).status,
      ).toBe(403);
      expect(
        (
          await endpoint(method, `/api/v1${path}`)
            .set('Cookie', cookies)
            .set('Origin', 'https://untrusted.test')
            .set('X-CSRF-Token', csrf)
            .send(body)
        ).status,
      ).toBe(403);
    }
    expect(await PatientModel.countDocuments()).toBe(1);
  });
  it('enforces parent scope and rejects scope overrides rather than falling back globally', async () => {
    const { d, other, p } = await fixture();
    expect((await read(`/doctors/${other}/patients`)).body.data.items).toEqual([]);
    expect((await read(`/doctors/${d}/patients`)).body.data.items[0].id).toBe(p);
    expect((await read(`/doctors/${other}/patients?doctorId=${d}`)).status).toBe(422);
    expect((await write('delete', `/doctors/${other}/patients/${p}`)).status).toBe(404);
    expect(await PatientModel.countDocuments()).toBe(1);
    expect((await write('delete', `/doctors/${d}/patients/${p}`)).status).toBe(200);
    expect((await read(`/patients/${p}`)).status).toBe(404);
    expect((await read('/patients')).body.data.pagination.totalItems).toBe(0);
    expect((await read(`/doctors/${d}/patients`)).body.data.pagination.totalItems).toBe(0);
  });
  it.each(['invalid', '123', 'a'.repeat(25)])('handles invalid patient IDs %s', async (bad) => {
    expect((await read(`/patients/${bad}`)).status).toBe(422);
    expect((await write('patch', `/patients/${bad}`, input)).status).toBe(422);
    expect((await write('delete', `/patients/${bad}`)).status).toBe(422);
  });
  it('handles nonexistent parents, filters, and repeated removal', async () => {
    const { p } = await fixture();
    expect((await read(`/doctors/${id()}/patients`)).status).toBe(404);
    expect((await read(`/patients?doctorId=${id()}`)).status).toBe(404);
    expect((await read('/patients?doctorId=invalid')).status).toBe(422);
    expect((await write('delete', `/patients/${p}`)).status).toBe(200);
    expect((await write('delete', `/patients/${p}`)).status).toBe(404);
    expect((await write('patch', `/patients/${p}`, input)).status).toBe(404);
  });
  it.each([
    {},
    { doctorId: id() },
    { _id: id() },
    { updatedAt: '2020-01-01' },
    { role: 'admin' },
    { name: '' },
    { condition: 'x'.repeat(161) },
  ])('strictly allowlists edit fields %j', async (body) => {
    const { p } = await fixture();
    expect((await write('patch', `/patients/${p}`, body)).status).toBe(422);
    expect((await PatientModel.findById(p))?.name).toBe(input.name);
  });
  it('atomically updates display, derived filters, and timestamps including literal dollar text', async () => {
    const { p } = await fixture();
    const result = await write('patch', `/patients/${p}`, {
      name: 'New José 李',
      condition: '$Follow-up / review',
    });
    expect(result.status).toBe(200);
    expect(result.body.data.patient.condition).toBe('$Follow-up / review');
    expect(
      (await read('/patients?q=jos&condition=%24follow-up%20%2F%20review')).body.data.items[0].id,
    ).toBe(p);
    expect((await read('/patients?q=amina')).body.data.items).toEqual([]);
  });
  it('does not execute operator or regex input and keeps stored markup as literal text', async () => {
    const { d, p } = await fixture();
    for (const q of ['q[$ne]=x', 'doctorId[$ne]=x', 'condition[$regex]=.*', 'q=x&q=y', 'unknown=1'])
      expect([400, 422]).toContain((await read(`/patients?${q}`)).status);
    expect((await write('patch', `/patients/${p}`, { $set: { name: 'Injected' } })).status).toBe(
      400,
    );
    const mark = '<img src=x onerror=alert(1)> Example';
    expect(
      (await write('post', `/doctors/${d}/patients`, { ...input, name: mark })).body.data.patient
        .name,
    ).toBe(mark);
    expect((await read('/patients?q=%5B.*')).body.data.items).toEqual([]);
  });
  it('does not claim duplicate delete success or resurrect a deleted patient', async () => {
    const { p } = await fixture();
    const results = await Promise.all([
      write('delete', `/patients/${p}`),
      write('delete', `/patients/${p}`),
      write('patch', `/patients/${p}`, { condition: 'Concurrent review' }),
    ]);
    expect(
      results
        .slice(0, 2)
        .map((r) => r.status)
        .sort(),
    ).toEqual([200, 404]);
    expect([200, 404]).toContain(results[2]!.status);
    expect(await PatientModel.findById(p)).toBeNull();
  });
  it('enforces the per-admin patient mutation budget across global and nested routes', async () => {
    const { d, p } = await fixture();
    for (let i = 0; i < 99; i++)
      expect((await write('delete', `/patients/${id()}`)).status).toBe(404);
    expect((await write('delete', `/doctors/${d}/patients/${p}`)).status).toBe(429);
    expect(await PatientModel.countDocuments()).toBe(1);
  });
  it('keeps disjoint concurrent edits without losing changes', async () => {
    const { p } = await fixture();
    const results = await Promise.all([
      write('patch', `/patients/${p}`, { name: 'Parallel name' }),
      write('patch', `/patients/${p}`, { condition: 'Parallel condition' }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await read(`/patients/${p}`)).body.data.patient).toMatchObject({
      name: 'Parallel name',
      condition: 'Parallel condition',
    });
  });
  it('applies service role checks without relying on router authentication', async () => {
    await expect(
      listPatients({ role: 'doctor' } as never, patientQuerySchema.parse({})),
    ).rejects.toMatchObject({ status: 403 });
    await expect(createPatient({ role: 'doctor' } as never, id(), input)).rejects.toMatchObject({
      status: 403,
    });
  });
});
describe('patient directory queries', () => {
  it('combines stored search condition doctor UTC date sorting and bounded pagination', async () => {
    const { d, other } = await fixture();
    for (let i = 0; i < 12; i++)
      await PatientModel.create({
        ...input,
        name: `Review Patient ${String(i).padStart(2, '0')}`,
        condition: i === 11 ? 'Other' : 'Follow-up',
        doctorId: i === 10 ? other : d,
      });
    await PatientModel.collection.updateMany(
      {},
      { $set: { createdAt: new Date('2026-02-15T23:59:59.999Z') } },
    );
    await PatientModel.create({
      ...input,
      name: 'Review outside',
      condition: 'Follow-up',
      doctorId: d,
      createdAt: new Date('2026-02-16T00:00:00Z'),
    });
    const suffix = `q=rev&condition=FOLLOW-UP&doctorId=${d}&from=2026-02-15&to=2026-02-15&sort=name-asc&limit=3`;
    const first = await read(`/patients?${suffix}`);
    expect(first.status).toBe(200);
    expect(first.body.data.pagination).toMatchObject({
      totalItems: 10,
      totalPages: 4,
      page: 1,
      limit: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(first.body.data.items.map((r: { name: string }) => r.name)).toEqual([
      'Review Patient 00',
      'Review Patient 01',
      'Review Patient 02',
    ]);
    const last = await read(`/patients?${suffix}&page=4`);
    expect(last.body.data.items).toHaveLength(1);
    expect(last.body.data.pagination.hasNextPage).toBe(false);
    const beyond = await read(`/patients?${suffix}&page=9`);
    expect(beyond.body.data.items).toEqual([]);
    expect(beyond.body.data.pagination.totalItems).toBe(10);
    for (const sort of ['newest', 'oldest', 'name-asc', 'name-desc']) {
      const one = await read(`/patients?sort=${sort}&limit=2`);
      const two = await read(`/patients?sort=${sort}&limit=2&page=2`);
      expect(
        one.body.data.items.filter((a: { id: string }) =>
          two.body.data.items.some((b: { id: string }) => a.id === b.id),
        ),
      ).toEqual([]);
    }
  });
  it.each([
    'page=0',
    'limit=51',
    'from=2026-02-30',
    'from=2026-05-01&to=2026-04-01',
    'sort=unsafe',
    'page=10001',
    'q=one+two+three+four+five+six',
  ])('rejects invalid bounded queries %s', async (q) =>
    expect((await read(`/patients?${q}`)).status).toBe(422),
  );
  it('has bounded parent and combined directory indexes', async () => {
    const indexes = await PatientModel.collection.indexes();
    expect(
      indexes.some(
        (i) => i.key.doctorId === 1 && i.key.conditionKey === 1 && i.key.createdAt === -1,
      ),
    ).toBe(true);
    expect(indexes.some((i) => i.key.searchTokens === 1)).toBe(true);
  });
});
