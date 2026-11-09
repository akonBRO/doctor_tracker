import { expect, type Page, type TestInfo } from '@playwright/test';
import type { MongoClient } from 'mongodb';
import AxeBuilder from '@axe-core/playwright';
import { capturePage } from './visual.js';

export async function dashboardFlow(page: Page, info: TestInfo, database: MongoClient) {
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(error.message);
  page.on('pageerror', onError);
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      axe.violations.map((item) => ({
        id: item.id,
        targets: item.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
    await capturePage(page, info.project.name, name);
  };
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: '0 total doctors', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '0 total patients', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No doctors registered' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No registrations in this period' }),
  ).toBeVisible();
  await expect(page.getByTestId('registration-chart')).toHaveCount(0);
  await capture('dashboard-empty');
  await page.goto('/doctors/new');
  const name =
    'Dr. Fixture Nadia Rahman Chowdhury — Internal Medicine, Dhaka Medical College Hospital';
  await page.getByLabel('Doctor name', { exact: false }).fill(name);
  await page.getByLabel('Specialization', { exact: false }).fill('Medicine');
  await page.getByLabel('Hospital', { exact: false }).fill('Dhaka Medical College Hospital');
  await page.getByLabel('Phone', { exact: false }).fill('01712345678');
  await page.getByLabel('Email', { exact: false }).fill('dashboard@example.test');
  await page.getByRole('button', { name: 'Save doctor', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const doctor = await database.db().collection('doctors').findOne({ name });
  const doctorId = doctor!._id.toString();
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: '1 total doctors', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '0 total patients', exact: true })).toBeVisible();
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/doctors/${doctorId}$`));
  await page.getByRole('link', { name: 'Add patient', exact: true }).click();
  await page
    .getByLabel('Patient name (English)', { exact: false })
    .fill('Dashboard Disposable Patient');
  await page.getByLabel('Date of birth', { exact: false }).fill('1992-06-14');
  await page.getByLabel('Gender', { exact: false }).selectOption('female');
  await page.getByLabel(/^Mobile number/).fill('01812345678');
  await page.getByLabel('Condition', { exact: false }).fill('Disposable review');
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Patients (1)', exact: true })).toBeVisible();
  const patient = await database
    .db()
    .collection('patients')
    .findOne({ name: 'Dashboard Disposable Patient' });
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: '1 total patients', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: 'Patient counts by doctor' })
      .locator('.doctor-bar-label > span'),
  ).toHaveText('1 patient');

  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).data.token as string;
  const headers = { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf };
  const doctorIds = [doctorId];
  const now = new Date();
  // All successful fixture registrations use the actual REST API. Only their timestamps
  // are adjusted in this disposable test database to verify historical chart buckets.
  for (let index = 1; index <= 8; index++) {
    const result = await page.request.post('/api/v1/doctors', {
      headers,
      data: {
        name: `Dr. Fixture Rahman ${index}`,
        specialization: 'Medicine',
        hospital: 'Test Hospital, Dhaka',
        phone: '01712345678',
        email: `fixture-${index}@example.test`,
      },
    });
    expect(result.status()).toBe(201);
    const id = (await result.json()).data.doctor.id as string;
    doctorIds.push(id);
    const record = await database
      .db()
      .collection('doctors')
      .findOne({ name: `Dr. Fixture Rahman ${index}` });
    await database
      .db()
      .collection('doctors')
      .updateOne(
        { _id: record!._id },
        {
          $set: {
            createdAt: new Date(
              now.getTime() - [2, 2, 7, 10, 12, 17, 24, 26][index - 1]! * 86400_000,
            ),
          },
        },
      );
  }
  for (let index = 0; index < 11; index++) {
    const id = doctorIds[index < 6 ? 0 : index < 9 ? 1 : 2]!;
    const result = await page.request.post(`/api/v1/doctors/${id}/patients`, {
      headers,
      data: {
        name: `Dashboard Historical Fixture ${index}`,
        condition: 'Disposable review',
        gender: 'unknown',
        approximateAge: { value: 40, unit: 'years' },
        mobile: '01912345678',
      },
    });
    expect(result.status()).toBe(201);
    const record = await database
      .db()
      .collection('patients')
      .findOne({ name: `Dashboard Historical Fixture ${index}` });
    await database
      .db()
      .collection('patients')
      .updateOne(
        { _id: record!._id },
        {
          $set: {
            createdAt: new Date(
              now.getTime() - [1, 1, 3, 3, 3, 7, 8, 12, 12, 17, 21][index]! * 86400_000,
            ),
          },
        },
      );
  }
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByRole('link', { name: '9 total doctors', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '12 total patients', exact: true })).toBeVisible();
  await expect(
    page.getByTestId('registration-chart').locator('svg.recharts-surface'),
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Patient counts by doctor' }).locator('li'),
  ).toHaveCount(5);
  await expect(page.getByText('Showing 1–5 of 9 doctors', { exact: true })).toBeVisible();
  await capture('dashboard');
  const chart = page.getByTestId('registration-chart').locator('svg.recharts-surface');
  await chart.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.recharts-tooltip-wrapper')).toBeVisible();
  await page.getByText('View daily counts', { exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Daily registration counts' }).locator('tbody tr'),
  ).toHaveCount(30);
  for (const [period, length] of [
    ['7d', 7],
    ['90d', 90],
  ] as const) {
    await page.getByLabel('Period', { exact: true }).selectOption(period);
    await expect(
      page.getByRole('region', { name: 'Daily registration counts' }).locator('tbody tr'),
    ).toHaveCount(length);
    await expect(page.getByRole('link', { name: '9 total doctors', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '12 total patients', exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByLabel('Period', { exact: true })).toHaveValue('90d');
  const pages = page.getByRole('navigation', { name: 'Doctor distribution pages' });
  await pages.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Showing 6–9 of 9 doctors', { exact: true })).toBeVisible();
  for (const row of await page
    .getByRole('list', { name: 'Patient counts by doctor' })
    .locator('li')
    .all())
    await expect(row).toContainText('0');
  await expect(pages.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await pages.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  await page.goto(`/patients/${patient!._id}`);
  await page.getByRole('button', { name: 'Delete patient', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete patient', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Patients', exact: true })).toBeVisible();
  await page.goto('/dashboard?period=30d');
  await expect(page.getByRole('link', { name: '11 total patients', exact: true })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Patient counts by doctor' }).locator('li').first(),
  ).toContainText('6');

  let release!: () => void;
  let heldRequest = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/dashboard/trends?*', async (route) => {
    heldRequest = true;
    await held;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect.poll(() => heldRequest).toBe(true);
  await expect(page.getByRole('button', { name: 'Refreshing…', exact: true })).toBeDisabled();
  await expect(page.getByTestId('registration-chart')).toBeVisible();
  const finished = page.waitForResponse(
    (response) => response.url().includes('/api/v1/dashboard/trends?') && response.status() === 200,
  );
  release();
  await finished;
  await page.unroute('**/api/v1/dashboard/trends?*');
  await expect(page.getByTestId('registration-chart')).toBeVisible();
  await page.route('**/api/v1/dashboard/overview', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'DASHBOARD_UNAVAILABLE',
          message: 'Dashboard data is temporarily unavailable. Please try again.',
        },
      }),
    }),
  );
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(
    page.getByText('Dashboard data is temporarily unavailable. Please try again.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('registration-chart')).toBeVisible();
  await capture('dashboard-error');
  await page.unroute('**/api/v1/dashboard/overview');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('link', { name: '11 total patients', exact: true })).toBeVisible();
  await page.route('**/api/v1/dashboard/trends?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { period: '7d', from: 'not-a-date', points: [{ doctors: -1, patients: 1 }] },
      }),
    }),
  );
  await page.getByLabel('Period', { exact: true }).selectOption('7d');
  await expect(
    page.getByText('The dashboard received invalid data. Please try again.', { exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/v1/dashboard/trends?*');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('registration-chart')).toBeVisible();
  await page.route('**/api/v1/dashboard/trends?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.getByLabel('Period', { exact: true }).selectOption('90d');
  await expect(
    page.getByText('The service returned an invalid response. Please try again.', { exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/v1/dashboard/trends?*');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('registration-chart')).toBeVisible();
  await page.goto('/dashboard?period=bad&doctorPage=0');
  await expect(page.getByText('Choose a valid reporting period.', { exact: true })).toBeVisible();
  await expect(
    page.getByText('This doctor distribution page is invalid.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Period', { exact: true }).selectOption('30d');
  await page.getByRole('button', { name: 'Show first page', exact: true }).click();
  await expect(page.getByTestId('registration-chart')).toBeVisible();
  const unauthorized = {
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({
      error: { code: 'UNAUTHORIZED', message: 'Your session has expired. Please sign in again.' },
    }),
  };
  await page.route('**/api/v1/dashboard/overview', (route) => route.fulfill(unauthorized));
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill(unauthorized));
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.unroute('**/api/v1/dashboard/overview');
  await page.unroute('**/api/v1/auth/refresh');
  expect(errors).toEqual([]);
  page.off('pageerror', onError);
}
