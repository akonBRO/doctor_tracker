import { test, expect, type Page } from '@playwright/test';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { generate } from 'otplib';
import AxeBuilder from '@axe-core/playwright';
import { doctorKey, doctorWords } from '@doctor-tracker/shared';

const { MongoClient, ObjectId } = createRequire(import.meta.url)(
  'mongodb',
) as typeof import('mongodb');
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

test('reproducible isolated quality and performance audit', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const database = await new MongoClient(process.env.E2E_MONGODB_URI!).connect();
  try {
    const token = randomBytes(32).toString('hex');
    const email = `quality-${token.slice(0, 8)}@example.test`;
    await database
      .db()
      .collection('invitations')
      .insertOne({
        email,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
    await page.goto(`/signup#invite=${token}`);
    await page.getByLabel('Full name').fill('Quality Reviewer');
    await page.getByLabel('Work email').fill(email);
    await page
      .getByLabel('Password', { exact: true })
      .fill(`Only-for-tests-${randomBytes(12).toString('hex')}!`);
    await page.getByRole('button', { name: 'Create account & continue' }).click();
    const secret = await page.getByLabel('Your manual setup key').inputValue();
    await page.getByLabel('Authenticator code', { exact: true }).fill(await generate({ secret }));
    await page.getByRole('button', { name: 'Verify & continue' }).click();
    await page.getByLabel('I’ve saved my recovery codes in a safe place.').check();
    await page.getByRole('button', { name: 'Enter your workspace' }).click();
    await expect(page.getByRole('link', { name: '0 total doctors', exact: true })).toBeVisible();
    const storage = await page.context().storageState(); // Memory only; never write authentication state to disk.
    const phase = process.env.QUALITY_PHASE ?? 'after';
    const report: Record<string, unknown> = {
      phase,
      node: process.version,
      browser: browser.version(),
      fixture: { doctors: 200, patients: 4000 },
      conditions:
        'Loopback production build; no throttling; fresh browser context for each page sample; warm API/database; three page samples and five API samples.',
    };
    const pages: Record<string, unknown> = {};
    async function measurePage(name: string, path: string, ready: (p: Page) => Promise<unknown>) {
      const samples: {
        readyMs: number;
        requests: number;
        jsDecodedBytes: number;
        jsTransferBytes: number;
        fontTransferBytes: number;
        fcpMs: number | null;
        cls: number;
        scriptMs: number;
      }[] = [];
      for (let index = 0; index < 3; index++) {
        const context = await browser.newContext({
          storageState: storage,
          viewport: { width: 1440, height: 1000 },
        });
        const target = await context.newPage();
        const session = await context.newCDPSession(target);
        await session.send('Performance.enable');
        let requests = 0;
        target.on('request', (request) => {
          if (request.url().includes('/api/v1/')) requests++;
        });
        await target.addInitScript(() => {
          (window as unknown as { qualityCls: number }).qualityCls = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              if (!(entry as PerformanceEntry & { hadRecentInput: boolean }).hadRecentInput)
                (window as unknown as { qualityCls: number }).qualityCls += (
                  entry as PerformanceEntry & { value: number }
                ).value;
          }).observe({ type: 'layout-shift', buffered: true });
        });
        const start = performance.now();
        await target.goto(path);
        await ready(target);
        await target.waitForLoadState('networkidle');
        const readyMs = performance.now() - start;
        const resources = await target.evaluate(() => {
          const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          return {
            jsDecodedBytes: entries
              .filter(
                (entry) =>
                  entry.name.includes('/_next/') && entry.name.split('?')[0]!.endsWith('.js'),
              )
              .reduce((sum, entry) => sum + entry.decodedBodySize, 0),
            jsTransferBytes: entries
              .filter(
                (entry) =>
                  entry.name.includes('/_next/') && entry.name.split('?')[0]!.endsWith('.js'),
              )
              .reduce((sum, entry) => sum + entry.transferSize, 0),
            fontTransferBytes: entries
              .filter((entry) => /noto-sans-bengali\.(ttf|woff2)/.test(entry.name))
              .reduce((sum, entry) => sum + entry.transferSize, 0),
            fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
            cls: (window as unknown as { qualityCls: number }).qualityCls,
          };
        });
        const metrics = await session.send('Performance.getMetrics');
        samples.push({
          readyMs,
          requests,
          ...resources,
          scriptMs:
            (metrics.metrics.find((item) => item.name === 'ScriptDuration')?.value ?? 0) * 1000,
        });
        await context.close();
      }
      const first = samples[0]!;
      pages[name] = {
        samples,
        median: Object.fromEntries(
          Object.keys(first).map((key) => {
            const values = samples
              .map((sample) => sample[key as keyof typeof sample])
              .filter((value): value is number => typeof value === 'number');
            return [key, values.length ? median(values) : null];
          }),
        ),
      };
    }
    await measurePage('emptyDashboard', '/dashboard', (p) =>
      expect(p.getByRole('heading', { name: 'No doctors registered' })).toBeVisible(),
    );
    const now = new Date();
    const doctors = Array.from({ length: 200 }, (_, index) => {
      const name = `Dr. Fixture Rahman ${String(index).padStart(4, '0')}`;
      const specialization = index % 2 ? 'Medicine' : 'Cardiology';
      const hospital = index % 2 ? 'Test Hospital, Dhaka' : 'Test Hospital, Chattogram';
      return {
        _id: new ObjectId(),
        name,
        specialization,
        hospital,
        phone: '+8801712345678',
        email: `fixture-${index}@example.test`,
        nameKey: doctorKey(name),
        specializationKey: doctorKey(specialization),
        hospitalKey: doctorKey(hospital),
        searchTokens: doctorWords(`${name} ${specialization} ${hospital}`),
        createdAt: new Date(now.getTime() - (index % 28) * 86400_000),
        updatedAt: now,
      };
    });
    const patients = Array.from({ length: 4000 }, (_, index) => {
      const name = `Fixture Patient ${String(index).padStart(4, '0')}`;
      const condition = 'Routine review';
      return {
        _id: new ObjectId(),
        doctorId: doctors[index % 200]!._id,
        name,
        nameBangla: 'পরীক্ষামূলক রোগী',
        condition,
        mobile: '+8801812345678',
        gender: 'unknown',
        approximateAge: { value: 40, unit: 'years' },
        clinicalNotes: 'Fictional quality fixture.',
        nameKey: doctorKey(name),
        conditionKey: doctorKey(condition),
        searchTokens: doctorWords(`${name} ${condition}`),
        createdAt: new Date(now.getTime() - (index % 28) * 86400_000),
        updatedAt: now,
      };
    });
    await database.db().collection('doctors').insertMany(doctors);
    await database.db().collection('patients').insertMany(patients);
    await measurePage('dashboard', '/dashboard', (p) =>
      expect(p.getByTestId('registration-chart').locator('svg.recharts-surface')).toBeVisible(),
    );
    await measurePage('doctors', '/doctors', (p) =>
      expect(p.getByText('Page 1 of 20', { exact: true })).toBeVisible(),
    );
    await measurePage('patients', '/patients', (p) =>
      expect(p.getByText('Page 1 of 400', { exact: true })).toBeVisible(),
    );
    await measurePage('doctorDetail', `/doctors/${doctors[0]!._id}`, (p) =>
      expect(p.getByRole('heading', { name: 'Patients (20)', exact: true })).toBeVisible(),
    );
    await measurePage('patientEdit', `/patients/${patients[0]!._id}/edit`, (p) =>
      expect(p.getByLabel('Patient name (Bangla)', { exact: true })).toHaveValue(
        'পরীক্ষামূলক রোগী',
      ),
    );
    report.pages = pages;
    const apiPaths = {
      overview: '/dashboard/overview',
      distribution: '/dashboard/patients-by-doctor?limit=20',
      trends: '/dashboard/trends?period=30d',
      doctors: '/doctors?limit=10',
      doctorSearch: '/doctors?q=0199&limit=10',
      patients: '/patients?limit=10',
      patientFilter: `/patients?doctorId=${doctors[0]!._id}&condition=Routine%20review&limit=10`,
      deepPatients: '/patients?page=300&limit=10',
    };
    const api: Record<string, unknown> = {};
    for (const [name, path] of Object.entries(apiPaths)) {
      const times = [];
      let bytes = 0;
      for (let index = 0; index < 5; index++) {
        const start = performance.now();
        const response = await page.request.get(`/api/v1${path}`);
        expect(response.status()).toBe(200);
        const body = await response.body();
        times.push(performance.now() - start);
        bytes = body.length;
      }
      api[name] = { medianMs: median(times), maxMs: Math.max(...times), responseBytes: bytes };
    }
    report.api = api;
    const accessibility: Record<string, unknown> = {};
    for (const [name, path] of Object.entries({
      dashboard: '/dashboard',
      patients: '/patients',
      patientEdit: `/patients/${patients[0]!._id}/edit`,
    })) {
      await page.setViewportSize({ width: 320, height: 812 });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const scan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      accessibility[name] = scan.violations.map((item) => ({
        id: item.id,
        targets: item.nodes.map((node) => node.target),
      }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (phase === 'after') expect(accessibility[name]).toEqual([]);
    }
    report.accessibility = accessibility;
    await page.goto('/patients');
    const picker = page.getByLabel('Assigned doctor', { exact: true });
    await picker.fill('0199');
    const option = page.getByRole('button', { name: /Dr\. Fixture Rahman 0199/ });
    await option.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Clear doctor', exact: true })).toBeVisible();
    if (phase === 'after') await expect(picker).toBeFocused();
    report.pickerRetainsKeyboardFocus = await picker.evaluate(
      (input) => document.activeElement === input,
    );
    await picker.click();
    await page.locator('.doctor-picker-options button').first().focus();
    await page.keyboard.press('Escape');
    if (phase === 'after') {
      await expect(page.locator('.doctor-picker-options')).toHaveCount(0);
      await expect(picker).toBeFocused();
    }
    await page.getByRole('button', { name: 'Clear doctor', exact: true }).click();
    if (phase === 'after') await expect(picker).toBeFocused();
    const queries: Record<string, unknown> = {};
    const cases: {
      name: string;
      collection: string;
      filter: Record<string, unknown>;
      sort: Record<string, 1 | -1>;
      skip: number;
    }[] = [
      {
        name: 'doctorNewest',
        collection: 'doctors',
        filter: {},
        sort: { createdAt: -1, _id: -1 },
        skip: 0,
      },
      {
        name: 'doctorCombinedFilter',
        collection: 'doctors',
        filter: { specializationKey: 'medicine', hospitalKey: 'test hospital, dhaka' },
        sort: { createdAt: -1, _id: -1 },
        skip: 0,
      },
      {
        name: 'doctorPrefix',
        collection: 'doctors',
        filter: { searchTokens: { $all: [/^0199/] } },
        sort: { nameKey: 1, _id: 1 },
        skip: 0,
      },
      {
        name: 'patientNewest',
        collection: 'patients',
        filter: {},
        sort: { createdAt: -1, _id: -1 },
        skip: 0,
      },
      {
        name: 'patientDoctorCondition',
        collection: 'patients',
        filter: { doctorId: doctors[0]!._id, conditionKey: 'routine review' },
        sort: { createdAt: -1, _id: -1 },
        skip: 0,
      },
      {
        name: 'patientPrefix',
        collection: 'patients',
        filter: { searchTokens: { $all: [/^3999/] } },
        sort: { nameKey: 1, _id: 1 },
        skip: 0,
      },
      {
        name: 'patientDeepOffset',
        collection: 'patients',
        filter: {},
        sort: { createdAt: -1, _id: -1 },
        skip: 2990,
      },
    ];
    for (const query of cases) {
      const plan = await database
        .db()
        .collection(query.collection)
        .find(query.filter)
        .sort(query.sort)
        .skip(query.skip)
        .limit(10)
        .explain('executionStats');
      const indexes: string[] = [];
      function visit(value: unknown) {
        if (value && typeof value === 'object')
          for (const [key, child] of Object.entries(value)) {
            if (key === 'indexName') indexes.push(String(child));
            else visit(child);
          }
      }
      visit(plan.queryPlanner.winningPlan);
      queries[query.name] = {
        keysExamined: plan.executionStats.totalKeysExamined,
        documentsExamined: plan.executionStats.totalDocsExamined,
        returned: plan.executionStats.nReturned,
        indexes: [...new Set(indexes)],
      };
    }
    report.queries = queries;
    report.indexes = {
      doctors: (await database.db().collection('doctors').indexes()).map((index) => index.key),
      patients: (await database.db().collection('patients').indexes()).map((index) => index.key),
    };
    await mkdir('tmp/quality', { recursive: true });
    await writeFile(`tmp/quality/${phase}.json`, JSON.stringify(report, null, 2));
  } finally {
    await database.close();
  }
});
