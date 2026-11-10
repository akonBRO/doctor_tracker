// Disposable rehearsal: no API env file or external database URI is used. Next still
// runs its normal web env loader; explicit fixture origins override local values.
import assert from 'node:assert/strict';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { request as httpRequest, get as httpGet } from 'node:http';
import { createServer as httpsServer, get as httpsGet } from 'node:https';
import { createServer as tlsServer } from 'node:tls';
import { createServer as portProbe, connect } from 'node:net';
import type { Duplex } from 'node:stream';
import { mkdtemp, readFile, rm, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { chromium, expect } from '@playwright/test';
import { generate } from 'otplib';
import { loadConfig } from '../apps/api/src/config/env.js';
import { connectDatabase, databaseModels } from '../apps/api/src/config/database.js';
import { hashToken, randomToken, decryptSecret } from '../apps/api/src/utils/security.js';
import { renderCaddy, caddyBinary } from './lib/infrastructure.js';

const { MongoClient, BSON } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb');
const children = new Set<ChildProcess>();
const sockets = new Set<Duplex>();
const tlsSockets = new Set<Duplex>();
const passed: string[] = [];
const useCaddy = process.argv.includes('--caddy');
let profileDirectory: string | undefined;
const pass = (name: string) => {
  passed.push(name);
  process.stdout.write(`PASS ${name}\n`);
};
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
function child(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd = process.cwd(),
  role = 'worker',
) {
  const nodeProfile = command === process.execPath && profileDirectory;
  const processChild = spawn(
    command,
    nodeProfile
      ? ['--import', pathToFileURL(resolve('scripts/operations-resource-probe.mjs')).href, ...args]
      : args,
    {
      cwd,
      env: nodeProfile
        ? { ...env, OPERATIONS_PROFILE_DIR: profileDirectory, OPERATIONS_PROFILE_ROLE: role }
        : env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    },
  );
  let output = '';
  processChild.stdout!.on('data', (value) => {
    output += String(value);
  });
  processChild.stderr!.on('data', (value) => {
    output += String(value);
  });
  children.add(processChild);
  // 'close' follows stdio drain, so signal assertions inspect complete lifecycle logs.
  const done = once(processChild, 'close').then(([code, signal]) => ({ code, signal }));
  processChild.once('error', () => undefined);
  return { process: processChild, done, output: () => output };
}
async function stop(processChild: ChildProcess) {
  if (processChild.exitCode !== null || processChild.signalCode !== null) return;
  const done = once(processChild, 'exit');
  if (process.platform === 'win32') {
    const kill = spawn('taskkill', ['/pid', String(processChild.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    await once(kill, 'exit');
  } else process.kill(-processChild.pid!, 'SIGTERM');
  await done;
}
async function poll(check: () => Promise<boolean>, label: string, attempts = 60) {
  for (let index = 0; index < attempts; index++) {
    if (await check().catch(() => false)) return;
    await delay(500);
  }
  throw new Error(`Timed out: ${label}`);
}
async function requirePort(port: number) {
  const server = portProbe();
  await new Promise<void>((done, reject) => {
    server.once('error', () =>
      reject(new Error('Operational fixture ports are occupied; refusing to reuse services.')),
    );
    server.listen(port, '127.0.0.1', () => server.close(() => done()));
  });
}
async function main() {
  await requirePort(3100);
  await requirePort(4100);
  const temp = await mkdtemp(join(tmpdir(), 'doctor-tracker-operations-'));
  if (useCaddy) {
    await mkdir('tmp/stage7', { recursive: true });
    profileDirectory = await mkdtemp(resolve('tmp/stage7/resources-'));
  }
  let database: MongoMemoryReplSet | undefined;
  let client: InstanceType<typeof MongoClient> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let edge: ReturnType<typeof httpsServer> | undefined;
  let bridge: ReturnType<typeof tlsServer> | undefined;
  let proxy: ReturnType<typeof child> | undefined;
  try {
    const openssl =
      process.env.TEST_OPENSSL ??
      (process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe')
        ? 'C:/Program Files/Git/usr/bin/openssl.exe'
        : 'openssl');
    const keyFile = join(temp, 'local-fixture.key');
    const certFile = join(temp, 'local-fixture.crt');
    execFileSync(
      openssl,
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-sha256',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
        '-keyout',
        keyFile,
        '-out',
        certFile,
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    const key = await readFile(keyFile);
    const cert = await readFile(certFile);
    database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = database.getUri('operations_source'); // Only this program-created replica set can be targeted.
    client = await new MongoClient(uri).connect();
    const source = client.db();
    const secrets = {
      JWT_SECRET: randomToken(),
      MFA_ENCRYPTION_KEY: randomToken(),
      CSRF_SECRET: randomToken(),
    };
    await connectDatabase(
      loadConfig({
        NODE_ENV: 'test',
        MONGODB_URI: uri,
        WEB_ORIGIN: 'http://localhost:3100',
        COOKIE_SECURE: 'false',
        ...secrets,
      }),
    );
    const invitation = randomToken();
    await source.collection('invitations').insertOne({
      email: 'operations@example.test',
      tokenHash: hashToken(invitation),
      consumedAt: null,
      expiresAt: new Date(Date.now() + 300000),
    });
    const inventory = async () =>
      Promise.all(
        databaseModels.map(async (model) => ({
          collection: model.collection.name,
          indexes: await source.collection(model.collection.name).indexes(),
        })),
      );
    const beforeIndexes = await inventory();
    bridge = tlsServer({ key, cert }, (socket) => {
      tlsSockets.add(socket);
      socket.on('close', () => tlsSockets.delete(socket));
      const upstream = connect({
        host: '127.0.0.1',
        port: new URL(uri).port ? Number(new URL(uri).port) : 27017,
      });
      tlsSockets.add(upstream);
      upstream.on('close', () => tlsSockets.delete(upstream));
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
      socket.pipe(upstream).pipe(socket);
    });
    bridge.listen(0, '127.0.0.1');
    await once(bridge, 'listening');
    const bridgePort = (bridge.address() as { port: number }).port;
    const replicaSetName = new URL(uri).searchParams.get('replicaSet');
    assert(replicaSetName);
    const tlsUri = (name: string) =>
      `mongodb://127.0.0.1:${bridgePort}/${name}?tls=true&tlsCAFile=${encodeURIComponent(certFile)}&replicaSet=${encodeURIComponent(replicaSetName)}&directConnection=true`;
    let origin: string;
    let redirectOrigin: string | undefined;
    if (useCaddy) {
      const freePort = async () => {
        const probe = portProbe();
        probe.listen(0, '127.0.0.1');
        await once(probe, 'listening');
        const port = (probe.address() as { port: number }).port;
        await new Promise<void>((done) => probe.close(() => done()));
        return port;
      };
      const httpsPort = await freePort();
      const httpPort = await freePort();
      // Use a DNS SAN so clients send SNI, matching the production hostname path.
      origin = `https://localhost:${httpsPort}`;
      redirectOrigin = `http://localhost:${httpPort}`;
      const configuration = await renderCaddy({
        origin,
        httpPort,
        webUpstream: '127.0.0.1:3100',
        certificate: { cert: certFile, key: keyFile },
      });
      const configFile = join(temp, 'Caddyfile');
      await writeFile(configFile, configuration);
      const binary = await caddyBinary();
      const proxyEnv = {
        ...process.env,
        XDG_DATA_HOME: join(temp, 'caddy-data'),
        XDG_CONFIG_HOME: join(temp, 'caddy-config'),
      };
      execFileSync(binary, ['validate', '--config', configFile, '--adapter', 'caddyfile'], {
        stdio: 'pipe',
        env: proxyEnv,
        windowsHide: true,
      });
      proxy = child(binary, ['run', '--config', configFile, '--adapter', 'caddyfile'], proxyEnv);
      await poll(
        async () =>
          proxy!.process.exitCode === null &&
          proxy!.output().includes('serving initial configuration'),
        'owned Caddy fixture ready',
      );
      pass('pinned Caddy syntax and temporary-certificate startup; no public certificate request');
    } else {
      edge = httpsServer({ key, cert }, (req, res) => {
        const upstream = httpRequest(
          {
            host: '127.0.0.1',
            port: 3100,
            path: req.url,
            method: req.method,
            headers: {
              ...req.headers,
              'x-forwarded-for': req.socket.remoteAddress,
              'x-forwarded-proto': 'https',
              'x-forwarded-host': req.headers.host,
            },
          },
          (reply) => {
            res.writeHead(reply.statusCode ?? 502, reply.headers);
            reply.pipe(res);
          },
        );
        upstream.on('error', () => {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
        req.pipe(upstream);
      });
      edge.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      });
      edge.listen(0, '127.0.0.1');
      await once(edge, 'listening');
      origin = `https://127.0.0.1:${(edge.address() as { port: number }).port}`;
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...secrets,
      NODE_ENV: 'production',
      NODE_TLS_REJECT_UNAUTHORIZED: '1',
      MONGODB_URI: tlsUri('operations_source'),
      WEB_ORIGIN: origin,
      API_ORIGIN: 'http://127.0.0.1:4100',
      APP_ORIGIN: origin,
      COOKIE_SECURE: 'true',
      TRUST_PROXY_HOPS: '2',
      API_INSTANCE_COUNT: '1',
      WEB_CONCURRENCY: '1',
      HOST: '127.0.0.1',
      PORT: '4100',
      WEB_ALLOW_LOCAL_HTTP: 'false',
      E2E_WEB_MODE: undefined,
      NEXT_TELEMETRY_DISABLED: '1',
    };
    // Validate the real production TLS connection and read-only startup index path.
    await mongoose.disconnect();
    await connectDatabase(loadConfig(env));
    assert.deepEqual(await inventory(), beforeIndexes);
    pass('production MongoDB TLS with explicit CA and existing-index verification');
    const apiPath = resolve('apps/api/dist/server.js');
    const launchApi = (settings = env, role = 'api-source') =>
      child(process.execPath, [apiPath, '--require-production'], settings, process.cwd(), role);
    for (const invalid of [
      { NODE_ENV: 'development' },
      { WEB_CONCURRENCY: '2' },
      { MONGODB_URI: 'mongodb://127.0.0.1:1/unsafe' },
    ]) {
      const rejected = launchApi({ ...env, ...invalid });
      assert.equal((await rejected.done).code, 1);
      assert(rejected.output().includes('configuration_invalid'));
      assert(
        !rejected.output().includes('unsafe@') && !rejected.output().includes(secrets.JWT_SECRET),
      );
    }
    pass(
      'compiled API rejects missing production mode, unsafe scaling and plaintext database configuration',
    );
    await source.collection('patients').dropIndex('searchTokens_1');
    const missingIndex = launchApi();
    assert.equal((await missingIndex.done).code, 1);
    const preparePath = resolve('apps/api/dist/cli/prepare-database.js');
    const deniedPreparation = child(process.execPath, [preparePath], env);
    assert.equal((await deniedPreparation.done).code, 1);
    assert(
      !(await source.collection('patients').indexes()).some(
        (index) => index.name === 'searchTokens_1',
      ),
    );
    const approvedFixturePreparation = child(
      process.execPath,
      [preparePath, '--apply-indexes'],
      env,
    );
    assert.equal((await approvedFixturePreparation.done).code, 0);
    assert.deepEqual(await inventory(), beforeIndexes);
    pass(
      'missing indexes fail startup; explicit preparation flag restores only disposable fixture indexes',
    );
    let api = launchApi();
    const apiReady = async () =>
      api.process.exitCode === null &&
      api.process.signalCode === null &&
      api.output().includes('server_started') &&
      (await fetch('http://127.0.0.1:4100/api/v1/health/ready')).ok;
    await poll(apiReady, 'production API ready');
    const bindFailure = launchApi();
    assert.equal((await bindFailure.done).code, 1);
    pass('production API startup, private binding, sanitized bind failure and readiness');
    const next = resolve('node_modules/next/dist/bin/next');
    const build = child(process.execPath, [next, 'build'], env, resolve('apps/web'), 'web-build');
    assert.equal((await build.done).code, 0, 'Operational HTTPS web build failed');
    const mismatch = child(
      process.execPath,
      [next, 'start', '--hostname', '127.0.0.1', '--port', '3100'],
      { ...env, API_ORIGIN: 'http://127.0.0.1:1' },
      resolve('apps/web'),
    );
    assert.equal((await mismatch.done).code, 1);
    assert(mismatch.output().includes('Rebuild'));
    pass('production web build and startup rejection of API rewrite drift');
    const web = child(
      process.execPath,
      [next, 'start', '--hostname', '127.0.0.1', '--port', '3100'],
      env,
      resolve('apps/web'),
      'web-runtime',
    );
    await poll(
      async () =>
        web.process.exitCode === null &&
        web.process.signalCode === null &&
        web.output().includes('Ready in') &&
        (await fetch('http://127.0.0.1:3100')).ok,
      'production web ready',
      120,
    );
    await new Promise<void>((done, reject) => {
      const req = httpsGet(`${origin}/api/v1/health/ready`, { ca: cert }, (res) => {
        res.resume();
        assert.equal(res.statusCode, 200);
        res.once('end', done);
      });
      req.once('error', reject);
    });
    const secureRequest = (path: string, headers: Record<string, string> = {}) =>
      new Promise<{ status: number; body: string }>((done, reject) => {
        // Hold TLS SNI canonical while independently testing the HTTP Host policy.
        const request = httpsGet(
          `${origin}${path}`,
          { ca: cert, headers, servername: new URL(origin).hostname },
          (response) => {
            let body = '';
            response.on('data', (bytes) => {
              body += String(bytes);
            });
            response.once('end', () => done({ status: response.statusCode ?? 0, body }));
          },
        );
        request.once('error', reject);
      });
    if (useCaddy) {
      assert.equal(
        (await secureRequest('/api/v1/health/ready', { Host: 'unrecognized.example.test' })).status,
        421,
        'Unknown HTTP Host with canonical SNI must be rejected by Caddy.',
      );
      const redirected = await new Promise<{ status: number; location?: string }>(
        (done, reject) => {
          httpGet(`${redirectOrigin}/login`, (response) => {
            response.resume();
            response.once('end', () =>
              done({ status: response.statusCode ?? 0, location: response.headers.location }),
            );
          }).once('error', reject);
        },
      );
      assert.equal(redirected.status, 308);
      assert.equal(redirected.location, `${origin}/login`);
      pass('Caddy rejects unknown Host and redirects only to the fixed HTTPS origin');
    }
    browser = await chromium.launch();
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const landing = await page.goto(origin);
    assert(landing?.headers()['strict-transport-security']);
    assert(landing.headers()['content-security-policy']?.includes('upgrade-insecure-requests'));
    await page.goto(`${origin}/signup#invite=${invitation}`);
    const password = `Operations-only-${randomToken()}!`;
    await page.getByLabel('Full name').fill('Operations Fixture');
    await page.getByLabel('Work email').fill('operations@example.test');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account & continue' }).click();
    const mfaSecret = await page.getByLabel('Your manual setup key').inputValue();
    await page
      .getByLabel('Authenticator code', { exact: true })
      .fill(await generate({ secret: mfaSecret }));
    await page.getByRole('button', { name: 'Verify & continue' }).click();
    await expect(page.locator('.recovery-codes code')).toHaveCount(8);
    const recovery = await page.locator('.recovery-codes code').allTextContents();
    await page.getByRole('checkbox', { name: /saved my recovery codes/ }).check();
    await page.getByRole('button', { name: 'Enter your workspace' }).click();
    await expect(page.getByRole('link', { name: '0 total doctors', exact: true })).toBeVisible();
    const authCookies = (await context.cookies()).filter((cookie) =>
      cookie.name.startsWith('__Host-'),
    );
    assert(
      authCookies.length >= 3 &&
        authCookies.every(
          (cookie) =>
            cookie.secure && cookie.httpOnly && cookie.sameSite === 'Strict' && cookie.path === '/',
        ),
    );
    pass('HTTPS edge, production HSTS/CSP, real invitation/MFA and Secure HttpOnly host cookies');
    assert.equal(
      (
        await page.request.post(`${origin}/api/v1/auth/logout`, {
          data: {},
          headers: { Origin: origin, 'X-CSRF-Token': 'invalid' },
        })
      ).status(),
      403,
    );
    assert.equal(
      (
        await page.request.get(`${origin}/api/v1/auth/csrf`, {
          headers: { Origin: 'https://evil.example.test' },
        })
      ).status(),
      403,
    );
    await context.clearCookies({ name: '__Host-dt_access' });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    pass('production CSRF/CORS rejection and real refresh-cookie rotation over HTTPS');
    await page.goto(`${origin}/doctors/new`);
    await page.getByLabel('Doctor name', { exact: false }).fill('Dr. Operations Fixture');
    await page.getByLabel('Specialization', { exact: false }).fill('Medicine');
    await page.getByLabel('Hospital', { exact: false }).fill('Disposable Hospital, Dhaka');
    await page.getByLabel('Phone', { exact: false }).fill('01712345678');
    await page.getByLabel('Email', { exact: false }).fill('doctor@example.test');
    await page.getByRole('button', { name: 'Save doctor', exact: true }).click();
    await page.getByRole('link', { name: 'Add patient', exact: true }).click();
    await page.getByLabel('Patient name (English)', { exact: false }).fill('Operations Patient');
    await page.getByLabel('Patient name (Bangla)', { exact: false }).fill('পরীক্ষামূলক রোগী');
    await page.getByLabel('Date of birth', { exact: false }).fill('1992-06-14');
    await page.getByLabel('Gender', { exact: false }).selectOption('female');
    await page.getByLabel(/^Mobile number/).fill('01812345678');
    await page.getByLabel('Condition', { exact: false }).fill('Disposable review');
    await page.getByRole('button', { name: 'Save patient', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Patients (1)', exact: true })).toBeVisible();
    await page.goto(`${origin}/dashboard`);
    await expect(page.getByRole('link', { name: '1 total patients', exact: true })).toBeVisible();
    assert.deepEqual(
      await page.evaluate(() => [Object.keys(localStorage), Object.keys(sessionStorage)]),
      [[], []],
    );
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    // Wait for the actual mutation/redirect before issuing another navigation.
    // Otherwise page.goto can abort the pending logout.
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(`${origin}/dashboard`);
    await expect(page).toHaveURL(/\/login$/);
    pass(
      'production HTTPS doctor/patient persistence, Bengali input, analytics, logout and protected redirect',
    );
    // BSON snapshot is in memory only. This is an application restore rehearsal, not an Atlas backup.
    const target = client.db('operations_restored');
    for (const model of databaseModels) {
      const name = model.collection.name;
      const documents = (await source.collection(name).find({}).toArray()).map((document) =>
        BSON.serialize(document),
      );
      const indexes = (await source.collection(name).indexes())
        .filter((index) => index.name !== '_id_')
        .map(({ v: _v, ns: _ns, ...index }) => index);
      await target.createCollection(name);
      if (documents.length)
        await target
          .collection(name)
          .insertMany(documents.map((document) => BSON.deserialize(document)));
      if (indexes.length) await target.collection(name).createIndexes(indexes);
    }
    await target.collection('sessions').updateMany({}, { $set: { revokedAt: new Date() } });
    await source.collection('patients').deleteOne({ name: 'Operations Patient' });
    assert.equal(await source.collection('patients').countDocuments(), 0);
    assert.equal(await target.collection('patients').countDocuments(), 1);
    const restoredAdmin = await target
      .collection('admins')
      .findOne({ email: 'operations@example.test' });
    assert.equal(decryptSecret(restoredAdmin!.mfaSecret, secrets.MFA_ENCRYPTION_KEY), mfaSecret);
    const restoredPatient = await target
      .collection('patients')
      .findOne({ name: 'Operations Patient' });
    assert(await target.collection('doctors').findOne({ _id: restoredPatient!.doctorId }));
    if (process.platform !== 'win32') {
      api.process.kill('SIGTERM');
      const exited = await api.done;
      assert.equal(exited.code, 0);
      assert(api.output().includes('server_stopped'));
      pass('real Linux/Unix SIGTERM drains compiled API and exits zero');
    } else {
      await stop(api.process);
      pass(
        'Windows cleanup; real SIGTERM remains a Linux CI check (shared lifecycle tested separately)',
      );
    }
    api = launchApi({ ...env, MONGODB_URI: tlsUri('operations_restored') }, 'api-restored');
    await poll(apiReady, 'restored API ready');
    await page.goto(`${origin}/login`);
    await page.getByLabel('Work email').fill('operations@example.test');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('button', { name: /Use a recovery code/ }).click();
    await page.getByLabel('Recovery code', { exact: true }).fill(recovery[0]!);
    await page.getByRole('button', { name: 'Verify & continue' }).click();
    await expect(page.getByRole('link', { name: '1 total patients', exact: true })).toBeVisible();
    pass(
      'disposable BSON/index restore preserves records, relationships, encrypted MFA and real recovery login',
    );
    // Sever only the fixture TLS bridge; observe the real driver's disconnect/reconnect path.
    for (const socket of tlsSockets) socket.destroy();
    await new Promise<void>((done) => bridge!.close(() => done()));
    await poll(
      async () => (await fetch('http://127.0.0.1:4100/api/v1/health/ready')).status === 503,
      'database outage readiness',
      80,
    );
    assert.equal((await fetch('http://127.0.0.1:4100/api/v1/health/live')).status, 200);
    bridge.listen(bridgePort, '127.0.0.1');
    await once(bridge, 'listening');
    await poll(
      async () => (await fetch('http://127.0.0.1:4100/api/v1/health/ready')).ok,
      'database recovery',
      80,
    );
    pass(
      'real fixture database outage yields unavailable readiness, live process and automatic recovery',
    );
    async function maps(path: string): Promise<string[]> {
      const files = await readdir(path, { withFileTypes: true });
      return (
        await Promise.all(
          files.map((file) =>
            file.isDirectory()
              ? maps(join(path, file.name))
              : Promise.resolve(file.name.endsWith('.map') ? [file.name] : []),
          ),
        )
      ).flat();
    }
    assert.equal((await maps('apps/web/.next/static')).length, 0);
    assert.equal((await maps('apps/api/dist')).length, 0);
    pass('built browser/API artifacts contain no public source maps');
    await browser.close();
    browser = undefined;
    if (useCaddy) {
      let limited = false;
      for (let index = 0; index <= 200; index++) {
        const result = await secureRequest('/api/v1/auth/csrf', {
          'X-Forwarded-For': `192.0.2.${index % 250}`,
          'X-Forwarded-Proto': 'http',
          'X-Forwarded-Host': 'unrecognized.example.test',
          Forwarded: `for=192.0.2.${index % 250};proto=http`,
        });
        if (result.status === 429) {
          limited = true;
          break;
        }
        assert.equal(result.status, 200);
      }
      assert(limited, 'Forged forwarding headers must not split the client rate budget.');
      assert.equal(
        (await secureRequest('/api/v1/auth/csrf', { 'X-Forwarded-For': '198.51.100.2' })).status,
        429,
      );
      pass('Caddy forwarding-header overwrite preserves one client rate budget under spoofing');
      await stop(web.process);
      const marker = 'SYNTHETIC_DO_NOT_LOG';
      const failure = await secureRequest(`/patients/${marker}?token=${marker}`, {
        Cookie: `session=${marker}`,
        Authorization: marker,
      });
      assert.equal(failure.status, 502);
      assert(!failure.body.includes(marker));
      await delay(100);
      assert(!proxy!.output().includes(marker));
      pass(
        'Caddy upstream failure is opaque and runtime logs omit request URL, headers and credentials',
      );
    }
    if (process.platform !== 'win32') {
      api.process.kill('SIGINT');
      assert.equal((await api.done).code, 0);
      pass('real Linux/Unix SIGINT shutdown exits zero');
    }
    process.stdout.write(
      `Operational rehearsal completed: ${passed.length} checks. No external database was targeted or .env file modified.\n`,
    );
  } finally {
    await browser?.close();
    for (const processChild of children) await stop(processChild);
    if (profileDirectory) {
      const records = await Promise.all(
        (await readdir(profileDirectory))
          .filter((name) => name.endsWith('.json'))
          .map(async (name) => JSON.parse(await readFile(join(profileDirectory!, name), 'utf8'))),
      );
      await writeFile(
        'tmp/stage7/resource-profile.json',
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            conditions:
              'Bounded disposable rehearsal; one-second numeric process samples plus exit snapshots; process peak RSS is not simultaneous whole-server RAM; Windows forced cleanup can leave last sampled values.',
            records,
          },
          null,
          2,
        ),
      );
      for (const role of [...new Set(records.map((record) => String(record.role)))].sort()) {
        const samples = records.filter((record) => record.role === role);
        process.stdout.write(
          `RESOURCE ${role}: processes=${samples.length}, largest individual peak RSS MiB=${(Math.max(...samples.map((record) => record.peakRssBytes)) / 1048576).toFixed(1)}, largest sampled CPU ms=${Math.max(...samples.map((record) => record.userCpuMs + record.systemCpuMs)).toFixed(0)}\n`,
        );
      }
    }
    for (const socket of [...sockets, ...tlsSockets]) socket.destroy();
    if (edge?.listening) await new Promise<void>((done) => edge!.close(() => done()));
    if (bridge?.listening) await new Promise<void>((done) => bridge!.close(() => done()));
    await mongoose.disconnect();
    await client?.close();
    await database?.stop();
    // Delete only this mkdtemp-owned directory, after verifying its absolute parent/prefix.
    assert.equal(dirname(resolve(temp)), resolve(tmpdir()));
    assert(basename(temp).startsWith('doctor-tracker-operations-'));
    await rm(temp, { recursive: true, force: true });
  }
}
main().catch((error: unknown) => {
  process.stderr.write(
    `Operational rehearsal failed after ${passed.length} checks: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
