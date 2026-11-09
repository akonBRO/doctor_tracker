import { capturePage } from './visual.js';
import { expect, type Page, type TestInfo } from '@playwright/test';
import type { MongoClient } from 'mongodb';
import AxeBuilder from '@axe-core/playwright';

export async function doctorsFlow(page: Page, info: TestInfo, database: MongoClient) {
  // This connection is supplied only by the isolated test-server fixture, never by local .env.
  await database.db().collection('patients').deleteMany({});
  await database.db().collection('doctors').deleteMany({});
  const checkOverflow = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  const checkA11y = async () => {
    await expect(page).toHaveTitle(/Doctor Tracker/);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      result.violations.map((value) => ({
        id: value.id,
        targets: value.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  };
  await page.goto('/doctors');
  await expect(page.getByRole('heading', { name: 'No doctors yet' })).toBeVisible();
  await checkA11y();
  await checkOverflow();
  await page.getByRole('link', { name: 'Add Doctor', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add Doctor', exact: true })).toBeVisible();
  await capturePage(page, info.project.name, 'doctor-create');
  await checkA11y();
  await checkOverflow();
  await page.getByRole('button', { name: 'Save doctor', exact: true }).click();
  await expect(page.getByText('Enter doctor name.', { exact: true })).toBeVisible();
  await page.getByLabel('Doctor name', { exact: false }).fill('Dr. Nadia Rahman');
  await page.getByLabel('Specialization', { exact: false }).fill('Cardiology');
  await page.getByLabel('Hospital', { exact: false }).fill('Dhaka Medical College Hospital');
  await page.getByLabel('Phone', { exact: false }).fill('+880 (1712) 345-678');
  await page.getByLabel('Email', { exact: false }).fill('nadia@example.test');
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAUTHORIZED', message: 'Your session has expired. Please sign in again.' },
      }),
    }),
  );
  await page.getByRole('button', { name: 'Save doctor', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Sign in in a new tab' })).toBeVisible();
  await expect(page.getByLabel('Doctor name', { exact: false })).toHaveValue('Dr. Nadia Rahman');
  await page.unroute('**/api/v1/auth/me');
  let writes = 0;
  let releaseFailure!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  await page.route('**/api/v1/doctors', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    writes++;
    await held;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAVAILABLE', message: 'The service is temporarily unavailable.' },
      }),
    });
  });
  await page.getByRole('button', { name: 'Save doctor', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving doctor…' })).toBeDisabled();
  await page.locator('.doctor-form').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect.poll(() => writes).toBe(1);
  releaseFailure();
  await expect(
    page.getByText('The service is temporarily unavailable.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Email', { exact: false })).toHaveValue('nadia@example.test');
  expect(await database.db().collection('doctors').countDocuments()).toBe(0);
  await page.unroute('**/api/v1/doctors');
  await page.getByRole('button', { name: 'Save doctor', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dr. Nadia Rahman' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Doctor added.' })).toContainText(
    'Doctor added.',
  );
  await expect(page.getByRole('link', { name: 'nadia@example.test' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No patients found' })).toBeVisible();
  await capturePage(page, info.project.name, 'doctor-detail');
  await checkA11y();
  await checkOverflow();
  const firstRecord = await database
    .db()
    .collection('doctors')
    .findOne({ name: 'Dr. Nadia Rahman' });
  expect(firstRecord).not.toBeNull();
  expect(firstRecord!.phone).toBe('+8801712345678');
  const createdDate = (firstRecord!.createdAt as Date).toISOString().slice(0, 10);
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).data.token as string;
  for (let i = 1; i <= 10; i++) {
    const result = await page.request.post('/api/v1/doctors', {
      headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
      data: {
        name: `Dr. Elias Noor ${String(i).padStart(2, '0')}`,
        specialization: 'Neurology',
        hospital: 'Rangpur Medical College Hospital',
        phone: '+44 20 7946 0958',
        email: `reviewer-${i}@example.test`,
      },
    });
    expect(result.status()).toBe(201);
  }
  await page.getByRole('link', { name: 'Back to doctors', exact: true }).click();
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  const firstPageUrl = page.url();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dr. Nadia Rahman', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(firstPageUrl);
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  await page.getByLabel('Search doctors', { exact: true }).fill('RAH');
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dr. Nadia Rahman', exact: true })).toBeVisible();
  await page.getByLabel('Specialization', { exact: true }).fill('Cardiology');
  await page.getByLabel('Hospital', { exact: true }).fill('Dhaka Medical College Hospital');
  await page.getByLabel('Added from (UTC)', { exact: true }).fill(createdDate);
  await page.getByLabel('Added through (UTC)', { exact: true }).fill(createdDate);
  await expect(page.getByText('1–1 of 1 doctors', { exact: true })).toBeVisible();
  const filteredUrl = page.url();
  await page.reload();
  await expect(page.getByLabel('Search doctors', { exact: true })).toHaveValue('RAH');
  await expect(page.getByText('1–1 of 1 doctors', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Dr. Nadia Rahman', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dr. Nadia Rahman' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to doctors', exact: true }).click();
  await expect(page).toHaveURL(filteredUrl);
  await page.getByLabel('Search doctors', { exact: true }).fill('no-such-doctor');
  await expect(
    page.getByRole('heading', { name: 'No matching doctors', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await page.getByLabel('Sort by', { exact: true }).selectOption('name-asc');
  await expect(page.getByRole('link', { name: 'Dr. Elias Noor 01', exact: true })).toBeVisible();
  await checkA11y();
  await checkOverflow();
  await capturePage(page, info.project.name, 'doctors');
  await page.getByLabel('Rows per page', { exact: true }).selectOption('25');
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await page.getByLabel('Search doctors', { exact: true }).fill('unmatched');
  await expect(
    page.getByRole('heading', { name: 'No matching doctors', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('name-asc');
  await expect(page.getByLabel('Rows per page', { exact: true })).toHaveValue('25');
  let obsoleteStarted = false;
  let releaseObsolete!: () => void;
  const obsolete = new Promise<void>((resolve) => {
    releaseObsolete = resolve;
  });
  const obsoleteRoute = /\/api\/v1\/doctors\?.*q=elias(?:&|$)/;
  await page.route(obsoleteRoute, async (route) => {
    obsoleteStarted = true;
    await obsolete;
    await route.abort('aborted').catch(() => undefined);
  });
  await page.getByLabel('Search doctors', { exact: true }).fill('elias');
  await expect.poll(() => obsoleteStarted).toBe(true);
  await page.getByLabel('Search doctors', { exact: true }).fill('RAH');
  await expect(page.getByText('1–1 of 1 doctors', { exact: true })).toBeVisible();
  releaseObsolete();
  await page.unroute(obsoleteRoute);
  await expect(page.getByRole('link', { name: 'Dr. Nadia Rahman', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  // Inject only a transport failure; successful list/create/detail operations above use the real API/database.
  const listRoute = /\/api\/v1\/doctors(?:\?|$)/;
  await page.route(listRoute, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAVAILABLE', message: 'Directory is temporarily unavailable.' },
      }),
    }),
  );
  await page.getByLabel('Sort by', { exact: true }).selectOption('oldest');
  await expect(
    page.getByText('Directory is temporarily unavailable.', { exact: true }),
  ).toBeVisible();
  await page.unroute(listRoute);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Dr. Nadia Rahman', exact: true })).toBeVisible();
  let releaseList!: () => void;
  const slow = new Promise<void>((resolve) => {
    releaseList = resolve;
  });
  await page.route(listRoute, async (route) => {
    await slow;
    await route.continue();
  });
  await page.getByLabel('Sort by', { exact: true }).selectOption('newest');
  await expect(page.getByRole('status')).toContainText('Loading doctor records');
  releaseList();
  await page.unroute(listRoute);
  await expect(page.getByRole('link', { name: 'Dr. Nadia Rahman', exact: true })).toBeVisible();
  await page.goto('/doctors/invalid-id');
  await expect(page.getByText('This doctor link is invalid.', { exact: true })).toBeVisible();
  await page.goto(`/doctors/${'0'.repeat(24)}`);
  await expect(page.getByRole('heading', { name: 'Doctor not found', exact: true })).toBeVisible();
  const xss = '<img src=x onerror=alert(1)>';
  const literal = await page.request.post('/api/v1/doctors', {
    headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf },
    data: {
      name: xss,
      specialization: 'Neurology',
      hospital: 'Rangpur Medical College Hospital',
      phone: '+44 20 7946 0958',
      email: 'literal@example.test',
    },
  });
  expect(literal.status()).toBe(201);
  await page.goto('/doctors?q=img');
  await expect(page.getByRole('link', { name: xss, exact: true })).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  await page.goto('/doctors');
  await expect(page.getByRole('heading', { name: 'Doctors', exact: true })).toBeVisible();
}
