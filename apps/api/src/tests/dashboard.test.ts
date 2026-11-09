import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { SignJWT } from 'jose';
import { generate } from 'otplib';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { loadConfig, type Config } from '../config/env.js';
import { Invitation, Session } from '../models/auth.js';
import { DoctorModel } from '../models/doctor.js';
import { PatientModel } from '../models/patient.js';
import { hashToken, randomToken } from '../utils/security.js';
import {
  dashboardOverview,
  dashboardDistribution,
  dashboardTrends,
  distributionPipeline,
  trendPipeline,
} from '../services/dashboard.js';
import {
  dashboardDateRange,
  dashboardOverviewSchema,
  dashboardDistributionSchema,
  dashboardTrendsSchema,
  type AdminIdentity,
} from '@doctor-tracker/shared';
import { logger } from '../utils/logger.js';

let database: MongoMemoryReplSet;
let config: Config;
let app: Awaited<ReturnType<typeof createApp>>;
let cookies: string;
let csrf: string;
let challengeCookie: string;
let admin: AdminIdentity;
const origin = 'http://localhost:3000';
const doctor = {
  name: 'Dr. Test Rahman',
  specialization: 'Medicine',
  hospital: 'Test Hospital',
  phone: '01712345678',
  email: 'doctor@example.test',
};
const routes = ['/dashboard/overview', '/dashboard/patients-by-doctor', '/dashboard/trends'];
const read = (path: string) => request(app).get(`/api/v1${path}`).set('Cookie', cookies);
const write = (method: 'post' | 'delete', path: string, input = {}) => {
  const client = request(app);
  return client[method](`/api/v1${path}`)
    .set('Cookie', cookies)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send(input);
};
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
    email: 'analytics@example.test',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const signup = await agent
    .post('/api/v1/auth/signup')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send({
      email: 'analytics@example.test',
      name: 'Analytics Test Admin',
      password: 'Tests-only-Password-582!',
      invitation: token,
    });
  expect(signup.status).toBe(201);
  challengeCookie = (signup.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
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
  admin = verified.body.data.admin;
  cookies =
    (verified.headers['set-cookie'] as unknown as string[])
      .filter((value) => !value.startsWith('dt_challenge='))
      .map((value) => value.split(';')[0])
      .join('; ') + `; dt_csrf=${csrf}`;
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await PatientModel.deleteMany({});
  await DoctorModel.deleteMany({});
  app = await createApp(config);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await mongoose.disconnect();
  await database?.stop();
});

describe('dashboard security and contracts', () => {
  it.each(routes)('requires full authenticated MFA on %s', async (path) => {
    expect((await request(app).get(`/api/v1${path}`)).status).toBe(401);
    expect((await request(app).get(`/api/v1${path}`).set('Cookie', challengeCookie)).status).toBe(
      401,
    );
    expect(
      (await request(app).get(`/api/v1${path}`).set('Cookie', 'dt_access=invalid')).status,
    ).toBe(401);
    const sid = (await Session.findOne({ adminId: admin.id, revokedAt: null }))!.id;
    for (const claims of [
      { role: 'doctor', amr: ['pwd', 'mfa'] },
      { role: 'admin', amr: ['pwd'] },
      { role: 'admin', amr: ['pwd', 'mfa'], expired: true },
    ]) {
      const jwt = await new SignJWT({ sid, ...claims })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(admin.id)
        .setIssuer('doctor-tracker-api')
        .setAudience('doctor-tracker-web')
        .setIssuedAt()
        .setExpirationTime('expired' in claims ? '0s' : '5m')
        .sign(Buffer.from(config.JWT_SECRET, 'hex'));
      expect(
        (await request(app).get(`/api/v1${path}`).set('Cookie', `dt_access=${jwt}`)).status,
      ).toBe(401);
    }
  });
  it('enforces service role guards', async () => {
    const invalid = { ...admin, role: 'doctor' } as unknown as AdminIdentity;
    await expect(dashboardOverview(invalid)).rejects.toMatchObject({ status: 403 });
    await expect(dashboardDistribution(invalid, { page: 1, limit: 5 })).rejects.toMatchObject({
      status: 403,
    });
    await expect(dashboardTrends(invalid, '7d')).rejects.toMatchObject({ status: 403 });
  });
  it.each([
    '/dashboard/overview?period=7d',
    '/dashboard/trends?period=365d',
    '/dashboard/trends?period=',
    '/dashboard/trends?period=7d&period=30d',
    '/dashboard/trends?from=2026-01-01',
    '/dashboard/trends?period[$ne]=7d',
    '/dashboard/trends?__proto__[role]=admin',
    '/dashboard/patients-by-doctor?sort=name',
    '/dashboard/patients-by-doctor?doctorId=bad',
    '/dashboard/patients-by-doctor?limit=21',
    '/dashboard/patients-by-doctor?limit=0',
    '/dashboard/patients-by-doctor?page=10001',
    '/dashboard/patients-by-doctor?page=-1',
    '/dashboard/patients-by-doctor?page=1.5',
    '/dashboard/patients-by-doctor?page=1e2',
    '/dashboard/patients-by-doctor?page=1&page=2',
    '/dashboard/patients-by-doctor?page[$gt]=0',
  ])('rejects unsafe or unbounded inputs %s', async (path) => {
    expect([400, 422]).toContain((await read(path)).status);
  });
  it('keeps no-store headers, exact CORS, read-only routes and a per-admin request budget', async () => {
    const result = await read(routes[0]!);
    expect(result.headers['cache-control']).toBe('no-store');
    expect((await read(routes[0]!).set('Origin', 'https://untrusted.test')).status).toBe(403);
    expect((await write('post', routes[0]!)).status).toBe(404);
    // Reset only this disposable app's in-memory limiter; production limits remain unchanged.
    app = await createApp(config);
    for (let i = 0; i < 60; i++) expect((await read(routes[0]!)).status).toBe(200);
    expect((await read(routes[0]!)).status).toBe(429);
  });
  it('rejects a revoked valid database session', async () => {
    const session = (await Session.findOne({ adminId: admin.id, revokedAt: null }))!;
    await Session.updateOne({ _id: session.id }, { $set: { revokedAt: new Date() } });
    try {
      for (const path of routes) expect((await read(path)).status).toBe(401);
    } finally {
      await Session.updateOne({ _id: session.id }, { $set: { revokedAt: null } });
    }
  });
  it('returns sanitized retriable errors without logging patient/database contents', async () => {
    const log = vi.spyOn(logger, 'error');
    const failure = vi.spyOn(DoctorModel, 'aggregate').mockImplementation(() => {
      throw new Error('secret-patient-detail mongodb-private-host');
    });
    const result = await read(routes[1]!);
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('DASHBOARD_UNAVAILABLE');
    expect(JSON.stringify([result.body, log.mock.calls])).not.toMatch(
      /secret-patient|mongodb-private/,
    );
    failure.mockRestore();
    expect((await read(routes[1]!)).status).toBe(200);
  });
});

describe('actual records and aggregation', () => {
  it('rejects missing, nonfinite and semantically invalid analytics payloads without throwing', async () => {
    const trends = await dashboardTrends(admin, '7d', new Date('2024-03-02T12:00:00Z'));
    expect(dashboardTrendsSchema.safeParse(undefined).success).toBe(false);
    expect(dashboardTrendsSchema.safeParse({ ...trends, from: 'not-a-date' }).success).toBe(false);
    expect(
      dashboardTrendsSchema.safeParse({
        ...trends,
        points: trends.points.map((point, index) =>
          index === 3 ? { ...point, date: trends.points[2]!.date } : point,
        ),
      }).success,
    ).toBe(false);
    expect(
      dashboardOverviewSchema.safeParse({
        totalDoctors: Infinity,
        totalPatients: -1,
        asOf: trends.asOf,
      }).success,
    ).toBe(false);
    expect(
      dashboardDistributionSchema.safeParse({
        maxPatientCount: 1,
        items: [
          {
            doctorId: new mongoose.Types.ObjectId().toString(),
            doctorName: 'Dr. Fixture',
            patientCount: 2,
          },
        ],
        pagination: {
          page: 1,
          limit: 5,
          totalItems: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        asOf: trends.asOf,
      }).success,
    ).toBe(false);
  });
  it('handles empty collections and zero-fills actual absent days', async () => {
    const totals = await read(routes[0]!);
    expect(totals.status).toBe(200);
    expect(dashboardOverviewSchema.parse(totals.body.data)).toMatchObject({
      totalDoctors: 0,
      totalPatients: 0,
    });
    const distribution = dashboardDistributionSchema.parse((await read(routes[1]!)).body.data);
    expect(distribution).toMatchObject({
      items: [],
      maxPatientCount: 0,
      pagination: { totalItems: 0, totalPages: 0 },
    });
    for (const period of ['7d', '30d', '90d']) {
      const trends = dashboardTrendsSchema.parse(
        (await read(`/dashboard/trends?period=${period}`)).body.data,
      );
      expect(trends.points).toHaveLength(Number(period.slice(0, -1)));
      expect(trends.points.every((point) => point.doctors === 0 && point.patients === 0)).toBe(
        true,
      );
    }
  });
  it('reflects real doctor/patient creation and permanent deletion without changing all-time totals by period', async () => {
    const created = await write('post', '/doctors', doctor);
    expect(created.status).toBe(201);
    const id = created.body.data.doctor.id;
    const saved = await write('post', `/doctors/${id}/patients`, {
      name: 'Disposable test patient',
      condition: 'Review',
      gender: 'unknown',
      approximateAge: { value: 30, unit: 'years' },
      mobile: '01712345678',
      clinicalNotes: 'PRIVATE-NOTES',
      emergencyContact: { name: 'PRIVATE-CONTACT', relationship: 'Parent', mobile: '01812345678' },
    });
    expect(saved.status).toBe(201);
    expect((await read(routes[0]!)).body.data).toMatchObject({ totalDoctors: 1, totalPatients: 1 });
    expect((await read(routes[1]!)).body.data.items).toEqual([
      { doctorId: id, doctorName: doctor.name, patientCount: 1 },
    ]);
    for (const period of ['7d', '90d']) {
      const trends = (await read(`/dashboard/trends?period=${period}`)).body.data;
      expect(trends.points.at(-1)).toMatchObject({ doctors: 1, patients: 1 });
      expect((await read(routes[0]!)).body.data).toMatchObject({
        totalDoctors: 1,
        totalPatients: 1,
      });
    }
    for (const route of routes) {
      const body = JSON.stringify((await read(route)).body);
      expect(body).not.toMatch(
        /PRIVATE-|01712345678|01812345678|clinicalNotes|emergencyContact|condition|mobile|allergies|medications/,
      );
    }
    expect((await write('delete', `/patients/${saved.body.data.patient.id}`)).status).toBe(200);
    expect((await read(routes[0]!)).body.data.totalPatients).toBe(0);
    expect((await read(routes[1]!)).body.data.items[0].patientCount).toBe(0);
    expect((await read('/dashboard/trends?period=7d')).body.data.points.at(-1).patients).toBe(0);
    expect((await read(`/doctors/${id}`)).status).toBe(200);
  });
  it('includes zero-patient doctors, correct assignment and stable ID ties across pages', async () => {
    const doctors = await DoctorModel.create(
      Array.from({ length: 7 }, (_, index) => ({ ...doctor, name: `Dr. Fixture ${index}` })),
    );
    await PatientModel.create([
      { name: 'Legacy one', condition: 'Review', doctorId: doctors[2]!._id },
      { name: 'Legacy two', condition: 'Review', doctorId: doctors[0]!._id },
      { name: 'Legacy three', condition: 'Review', doctorId: doctors[2]!._id },
    ]);
    const first = dashboardDistributionSchema.parse(
      (await read('/dashboard/patients-by-doctor?limit=3')).body.data,
    );
    const second = dashboardDistributionSchema.parse(
      (await read('/dashboard/patients-by-doctor?limit=3&page=2')).body.data,
    );
    const third = dashboardDistributionSchema.parse(
      (await read('/dashboard/patients-by-doctor?limit=3&page=3')).body.data,
    );
    const all = [...first.items, ...second.items, ...third.items];
    expect(all.map((item) => item.patientCount)).toEqual([2, 1, 0, 0, 0, 0, 0]);
    expect(all[0]!.doctorId).toBe(doctors[2]!.id);
    const zeros = doctors
      .filter((_, index) => ![0, 2].includes(index))
      .map((item) => item.id)
      .sort();
    expect(all.slice(2).map((item) => item.doctorId)).toEqual(zeros);
    expect(first.pagination).toMatchObject({
      totalItems: 7,
      totalPages: 3,
      hasPreviousPage: false,
      hasNextPage: true,
    });
    expect(third.maxPatientCount).toBe(2);
    expect((await read('/dashboard/patients-by-doctor?page=10000')).body.data).toMatchObject({
      items: [],
      pagination: { totalItems: 7, page: 10000 },
    });
  });
  it.each(['2024-03-02T00:01:00Z', '2025-01-02T01:00:00Z', '2026-11-09T18:00:00Z'])(
    'handles leap/month/year and UTC versus Dhaka boundaries at %s',
    async (timestamp) => {
      const now = new Date(timestamp);
      const { start, end } = dashboardDateRange('7d', now);
      const id = new mongoose.Types.ObjectId();
      const dates = [
        new Date(start.getTime() - 1),
        start,
        new Date(start.getTime() + 18 * 3600_000),
        new Date(end.getTime() - 1),
        end,
      ];
      await DoctorModel.collection.insertMany(
        dates.map((createdAt) => ({ ...doctor, createdAt, updatedAt: end })),
      );
      await PatientModel.collection.insertMany(
        dates.map((createdAt) => ({
          name: 'Legacy fixture',
          condition: 'Review',
          doctorId: id,
          createdAt,
          updatedAt: end,
        })),
      );
      const trends = dashboardTrendsSchema.parse(await dashboardTrends(admin, '7d', now));
      expect(trends.points[0]).toEqual({
        date: start.toISOString().slice(0, 10),
        doctors: 2,
        patients: 2,
      });
      expect(trends.points.at(-1)).toMatchObject({ doctors: 1, patients: 1 });
      expect(
        trends.points.slice(1, -1).every((point) => point.doctors === 0 && point.patients === 0),
      ).toBe(true);
      expect(trends.timezone).toBe('UTC');
    },
  );
  it('bounds representative collections and verifies existing indexes using explain plans', async () => {
    const now = new Date();
    const docs = Array.from({ length: 200 }, (_, index) => ({
      _id: new mongoose.Types.ObjectId(),
      ...doctor,
      name: `Dr. Fixture ${index}`,
      createdAt: now,
      updatedAt: now,
    }));
    await DoctorModel.collection.insertMany(docs);
    await PatientModel.collection.insertMany(
      Array.from({ length: 4000 }, (_, index) => ({
        doctorId: docs[index % 160]!._id,
        name: 'Disposable fixture',
        condition: 'Review',
        clinicalNotes: 'NOT-RETURNED',
        createdAt: now,
        updatedAt: now,
      })),
    );
    const result = await dashboardDistribution(admin, { page: 1, limit: 20 });
    expect(result.items).toHaveLength(20);
    expect(result.pagination.totalItems).toBe(200);
    expect(result.items.every((item) => item.patientCount === 25)).toBe(true);
    expect(JSON.stringify(result).length).toBeLessThan(5000);
    const distributionPlan = await DoctorModel.aggregate(
      distributionPipeline({ page: 1, limit: 5 }),
    ).explain('executionStats');
    const { start, end } = dashboardDateRange('7d');
    const doctorPlan = await DoctorModel.aggregate(trendPipeline(start, end))
      .hint({ createdAt: -1, _id: -1 })
      .explain('executionStats');
    const patientPlan = await PatientModel.aggregate(trendPipeline(start, end))
      .hint({ createdAt: -1, _id: -1 })
      .explain('executionStats');
    const distributionText = JSON.stringify(distributionPlan);
    expect(distributionText).toContain('doctorId_1_createdAt_-1__id_-1');
    for (const plan of [doctorPlan, patientPlan])
      expect(JSON.stringify(plan)).toContain('createdAt_-1__id_-1');
    await mkdir('tmp', { recursive: true });
    await writeFile(
      'tmp/analytics-query-plans.json',
      JSON.stringify(
        { fixture: { doctors: 200, patients: 4000 }, distributionPlan, doctorPlan, patientPlan },
        null,
        2,
      ),
    );
  });
});
