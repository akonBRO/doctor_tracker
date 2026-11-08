import { capturePage } from './visual.js';
import { expect, type Page, type TestInfo } from '@playwright/test';
import type { MongoClient } from 'mongodb';
import AxeBuilder from '@axe-core/playwright';
export async function patientsFlow(page: Page, info: TestInfo, database: MongoClient) {
  const db = database.db();
  const doctor = await db.collection('doctors').findOne({ name: 'Dr. Nadia Rahman' });
  expect(doctor).toBeTruthy();
  const doctorId = doctor!._id.toString();
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page).toHaveTitle(/Doctor Tracker/);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      axe.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    await capturePage(page, info.project.name, name);
  };
  await page.goto(`/doctors/${doctorId}`);
  await expect(page.getByRole('heading', { name: 'Patients (0)', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Add patient', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add patient', exact: true })).toBeVisible();
  await capture('patient-create');
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByText('Enter patient name.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Patient name', { exact: false })).toBeFocused();
  await page.getByLabel('Patient name', { exact: false }).fill('Fixture Patient Amina');
  await page.getByLabel('Condition', { exact: false }).fill('Cardiac follow-up');
  let writes = 0;
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const path = `**/api/v1/doctors/${doctorId}/patients`;
  await page.route(path, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    await held;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAVAILABLE', message: 'Patient service temporarily unavailable.' },
      }),
    });
  });
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving patient...' })).toBeDisabled();
  await page.locator('.patient-form').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect.poll(() => writes).toBe(1);
  release();
  await expect(
    page.getByText('Patient service temporarily unavailable.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Patient name', { exact: false })).toHaveValue(
    'Fixture Patient Amina',
  );
  expect(await db.collection('patients').countDocuments()).toBe(0);
  await page.unroute(path);
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Patients (1)', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Fixture Patient Amina', exact: true }),
  ).toBeVisible();
  const stored = await db.collection('patients').findOne({ name: 'Fixture Patient Amina' });
  expect(stored!.doctorId.toString()).toBe(doctorId);
  await capture('doctor-detail');
  // All seed writes go through the real API against the disposable fixture only.
  const csrf = (await page.request.get('/api/v1/auth/csrf')).json();
  const token = (await csrf).data.token as string;
  for (let i = 0; i < 10; i++) {
    const result = await page.request.post(`/api/v1/doctors/${doctorId}/patients`, {
      headers: { Origin: 'http://localhost:3000', 'X-CSRF-Token': token },
      data: { name: `Fixture Patient ${String(i).padStart(2, '0')}`, condition: 'Routine review' },
    });
    expect(result.status()).toBe(201);
  }
  await page.getByRole('link', { name: 'View in patient directory' }).click();
  await expect(page.getByRole('heading', { name: 'Patients', exact: true })).toBeVisible();
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Fixture Patient Amina', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Search patients', { exact: true }).fill('AMINA');
  await page.getByLabel('Condition', { exact: true }).fill('cardiac follow-up');
  const day = stored!.createdAt.toISOString().slice(0, 10);
  await page.getByLabel('Added from (UTC)').fill(day);
  await page.getByLabel('Added through (UTC)').fill(day);
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Search patients', { exact: true })).toHaveValue('AMINA');
  await expect(
    page.getByRole('link', { name: 'Fixture Patient Amina', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear doctor' }).click();
  await page.getByLabel('Assigned doctor', { exact: true }).fill('Nadia');
  await page.getByRole('button', { name: /Dr. Nadia Rahman Cardiology/ }).click();
  await expect(page).toHaveURL(new RegExp(`doctorId=${doctorId}`));
  const filtered = page.url();
  await capture('patients');
  await page.getByRole('link', { name: 'Edit Fixture Patient Amina', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit patient', exact: true })).toBeVisible();
  await expect(page.getByLabel('Condition', { exact: false })).toHaveValue('Cardiac follow-up');
  await capture('patient-edit');
  await page.getByLabel('Condition', { exact: false }).fill('Updated review');
  const sessionRoute = '**/api/v1/auth/me';
  await page.route(sessionRoute, (r) =>
    r.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Session expired.' } }),
    }),
  );
  await page.route('**/api/v1/auth/refresh', (r) =>
    r.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Session expired.' } }),
    }),
  );
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByText('Your entries have been kept.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Condition', { exact: false })).toHaveValue('Updated review');
  expect((await db.collection('patients').findOne({ _id: stored!._id }))!.condition).toBe(
    'Cardiac follow-up',
  );
  await page.unroute(sessionRoute);
  await page.unroute('**/api/v1/auth/refresh');
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByText('Patient updated.', { exact: true })).toBeVisible();
  await expect(page.getByText('Updated review', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Updated review', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to records', exact: true }).click();
  await expect(page).toHaveURL(filtered);
  await expect(page.getByRole('heading', { name: 'No patients found', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await page.getByLabel('Search patients', { exact: true }).fill('Amina');
  await page.getByRole('button', { name: 'Delete Fixture Patient Amina', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await db.collection('patients').countDocuments({ _id: stored!._id })).toBe(1);
  await page.getByRole('button', { name: 'Delete Fixture Patient Amina', exact: true }).click();
  await page.getByRole('button', { name: 'Delete patient', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No patients found', exact: true })).toBeVisible();
  expect(await db.collection('patients').countDocuments({ _id: stored!._id })).toBe(0);
  await page.goto(`/doctors/${doctorId}`);
  await expect(page.getByRole('heading', { name: 'Patients (10)', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fixture Patient Amina', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Delete Fixture Patient 09', exact: true }).click();
  await page.getByRole('button', { name: 'Delete patient', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Patients (9)', exact: true })).toBeVisible();
  await page.goto('/patients');
  const unavailable = '**/api/v1/patients*';
  await page.route(unavailable, (r) =>
    r.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAVAILABLE', message: 'Patient list unavailable.' },
      }),
    }),
  );
  await page.reload();
  await expect(page.getByText('Patient list unavailable.', { exact: true })).toBeVisible();
  await page.unroute(unavailable);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await page.getByLabel('Sort by', { exact: true }).selectOption('name-asc');
  await capture('patients');
  await page.getByRole('link', { name: 'Add patient', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add patient', exact: true })).toBeVisible();
  await expect(page.getByLabel('Assigned doctor', { exact: true })).toBeVisible();
  await page.getByLabel('Assigned doctor', { exact: true }).fill('Nadia');
  await page.getByRole('button', { name: /Dr. Nadia Rahman Cardiology/ }).click();
  const literal = '<img src=x onerror=alert(1)> Fixture';
  await page.getByLabel('Patient name', { exact: false }).fill(literal);
  await page.getByLabel('Condition', { exact: false }).fill('Browser literal text test');
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByRole('heading', { name: literal, exact: true })).toBeVisible();
  await expect(page.getByText('Patient added.', { exact: true })).toBeVisible();
  expect(await page.locator('.patient-name img').count()).toBe(0);
  await page.goto('/patients/invalid');
  await expect(page.getByText('This patient link is invalid.', { exact: true })).toBeVisible();
  await page.goto('/patients');
  await expect(page.getByRole('heading', { name: 'Patients', exact: true })).toBeVisible();
}
