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
  await expect(page.getByLabel('Patient name (English)', { exact: false })).toBeFocused();
  await page.getByLabel('Patient name (English)', { exact: false }).fill('Fixture Patient Amina');
  await page.getByLabel('Patient name (Bangla)', { exact: true }).fill('পরীক্ষামূলক আমিনা');
  await page.getByLabel('Date of birth', { exact: false }).fill('1992-06-14');
  await expect(page.getByText(/^Age: \d+ years$/)).toBeVisible();
  await page.getByLabel('Gender', { exact: false }).selectOption('female');
  await expect(page.getByLabel('Blood group', { exact: true }).locator('option')).toHaveText([
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-',
    'O+',
    'O-',
    'Unknown',
  ]);
  await expect(page.getByLabel('Blood group', { exact: true })).toHaveValue('Unknown');
  await page.getByLabel('Blood group', { exact: true }).selectOption('B+');
  await page.getByLabel(/^Mobile number/).fill('12345');
  await page.getByLabel('Email', { exact: true }).fill('amina@example.test');
  await expect(page.getByLabel('District', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Division', { exact: true }).locator('option')).toHaveCount(9);
  await page.getByLabel('Division', { exact: true }).selectOption('Dhaka');
  await expect(page.getByLabel('District', { exact: true }).locator('option')).toHaveCount(14);
  await page.getByLabel('District', { exact: true }).selectOption('Dhaka');
  await page.getByLabel('Upazila / Thana', { exact: true }).fill('Dhanmondi');
  await page.getByLabel('Division', { exact: true }).selectOption('Sylhet');
  await expect(page.getByLabel('District', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Upazila / Thana', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('District', { exact: true }).locator('option')).toHaveText([
    'Select district',
    'Habiganj',
    'Moulvibazar',
    'Sunamganj',
    'Sylhet',
  ]);
  await page.getByLabel('Division', { exact: true }).selectOption('Dhaka');
  await page.getByLabel('District', { exact: true }).selectOption('Dhaka');
  await page.getByLabel('Upazila / Thana', { exact: true }).fill('Dhanmondi');
  await page.getByLabel('Postal code', { exact: true }).fill('1209');
  await page.getByLabel('House / Road / Village', { exact: true }).fill('Test address, Dhanmondi');
  await page.getByLabel('Contact name', { exact: true }).fill('Fixture Contact Rahim');
  await expect(page.getByLabel('Relationship', { exact: true }).locator('option')).toHaveText([
    'Select relationship',
    'Parent',
    'Spouse',
    'Child',
    'Sibling',
    'Guardian',
    'Relative',
    'Other',
  ]);
  await page.getByLabel('Relationship', { exact: true }).selectOption('Sibling');
  await page.getByLabel('Emergency mobile number', { exact: true }).fill('01812345678');
  await page.getByLabel('Condition', { exact: false }).fill('Cardiac follow-up');
  await page
    .getByLabel('Symptoms / chief complaint', { exact: true })
    .fill('Disposable test symptom record');
  await page.getByLabel('Allergy status', { exact: true }).selectOption('known');
  await page.getByLabel('Known allergies', { exact: false }).fill('Test allergy record');
  await page.getByLabel('Medical history', { exact: true }).fill('Disposable test medical history');
  await page
    .getByLabel('Current medications', { exact: true })
    .fill('Disposable test medication record');
  await page
    .getByLabel('Additional notes', { exact: true })
    .fill('Fictional browser-test patient.');
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByLabel(/^Mobile number/)).toHaveAttribute('aria-invalid', 'true');
  expect(await db.collection('patients').countDocuments()).toBe(0);
  await page.getByLabel(/^Mobile number/).fill('01712345678');
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
  await expect(page.getByLabel('Patient name (English)', { exact: false })).toHaveValue(
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
  await page.getByLabel('Search assigned patients', { exact: true }).fill('no-such-patient');
  await expect(page.getByRole('heading', { name: 'Patients (0)', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Search assigned patients', { exact: true })).toHaveValue(
    'no-such-patient',
  );
  await page.getByLabel('Search assigned patients', { exact: true }).fill('AMIN');
  await expect(page.getByRole('heading', { name: 'Patients (1)', exact: true })).toBeVisible();
  await page.getByLabel('Search assigned patients', { exact: true }).fill('');
  await expect(page).not.toHaveURL(/patientQ=/);
  expect(stored).toMatchObject({
    nameBangla: 'পরীক্ষামূলক আমিনা',
    dateOfBirth: '1992-06-14',
    gender: 'female',
    bloodGroup: 'B+',
    mobile: '+8801712345678',
    email: 'amina@example.test',
    division: 'Dhaka',
    district: 'Dhaka',
    upazila: 'Dhanmondi',
    postalCode: '1209',
    addressLine: 'Test address, Dhanmondi',
    emergencyContact: {
      name: 'Fixture Contact Rahim',
      relationship: 'Sibling',
      mobile: '+8801812345678',
    },
    chiefComplaint: 'Disposable test symptom record',
    allergyStatus: 'known',
    allergies: 'Test allergy record',
    medicalHistory: 'Disposable test medical history',
    currentMedications: 'Disposable test medication record',
    clinicalNotes: 'Fictional browser-test patient.',
  });
  expect(stored!.approximateAge ?? null).toBeNull();
  await capture('doctor-detail');
  await page.getByRole('link', { name: 'Fixture Patient Amina', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fixture Patient Amina', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dr. Nadia Rahman', exact: true })).toHaveAttribute(
    'href',
    `/doctors/${doctorId}`,
  );
  await expect(page.getByText('Test allergy record', { exact: true })).toBeVisible();
  await capture('patient-detail');
  await page.getByRole('link', { name: 'Back to records', exact: true }).click();
  // All seed writes go through the real API against the disposable fixture only.
  const csrf = (await page.request.get('/api/v1/auth/csrf')).json();
  const token = (await csrf).data.token as string;
  for (let i = 0; i < 10; i++) {
    const result = await page.request.post(`/api/v1/doctors/${doctorId}/patients`, {
      headers: { Origin: 'http://127.0.0.1:3100', 'X-CSRF-Token': token },
      data: {
        name: `Fixture Patient ${String(i).padStart(2, '0')}`,
        condition: 'Routine review',
        mobile: '01912345678',
        gender: 'unknown',
        approximateAge: { value: 40 + i, unit: 'years' },
      },
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
  await expect(page.getByLabel('Patient name (Bangla)', { exact: true })).toHaveValue(
    'পরীক্ষামূলক আমিনা',
  );
  await expect(page.getByLabel('Date of birth', { exact: false })).toHaveValue('1992-06-14');
  await expect(page.getByLabel('Blood group', { exact: true })).toHaveValue('B+');
  await expect(page.getByLabel('District', { exact: true })).toHaveValue('Dhaka');
  await expect(page.getByLabel('Emergency mobile number', { exact: true })).toHaveValue(
    '+8801812345678',
  );
  await expect(page.getByLabel('Known allergies', { exact: false })).toHaveValue(
    'Test allergy record',
  );
  await capture('patient-edit');
  await page.getByLabel('Condition', { exact: false }).fill('Updated review');
  await page.getByLabel('Patient name (Bangla)', { exact: true }).fill('পরীক্ষামূলক আমিনা সংশোধিত');
  await page.getByLabel('Birth date or age', { exact: false }).selectOption('approximate');
  await page.getByLabel('Approximate age', { exact: false }).fill('34');
  await page.getByLabel('Age unit', { exact: true }).selectOption('years');
  await expect(page.getByLabel('Date of birth', { exact: false })).toHaveCount(0);
  await page.getByLabel('Gender', { exact: false }).selectOption('prefer-not-to-say');
  await page.getByLabel('Blood group', { exact: true }).selectOption('Unknown');
  await page.getByLabel(/^Mobile number/).fill('+8801898765432');
  await page.getByLabel('Email', { exact: true }).fill('');
  await page.getByLabel('Division', { exact: true }).selectOption('Chattogram');
  await page.getByLabel('District', { exact: true }).selectOption('Cumilla');
  await page.getByLabel('Upazila / Thana', { exact: true }).fill('Cumilla Sadar');
  await page.getByLabel('Postal code', { exact: true }).fill('3500');
  await page
    .getByLabel('House / Road / Village', { exact: true })
    .fill('Updated fictional test address');
  await page.getByLabel('Contact name', { exact: true }).fill('Fixture Contact Farida');
  await page.getByLabel('Relationship', { exact: true }).selectOption('Other');
  await page.getByLabel('Relationship details', { exact: true }).fill('Neighbour');
  await page.getByLabel('Emergency mobile number', { exact: true }).fill('01998765432');
  await page
    .getByLabel('Symptoms / chief complaint', { exact: true })
    .fill('Updated test symptom record');
  await page.getByLabel('Allergy status', { exact: true }).selectOption('none-known');
  await expect(page.getByLabel('Known allergies', { exact: false })).toHaveCount(0);
  await page.getByLabel('Medical history', { exact: true }).fill('Updated test history');
  await page
    .getByLabel('Current medications', { exact: true })
    .fill('Updated test medication record');
  await page.getByLabel('Additional notes', { exact: true }).fill('Updated disposable record.');
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
  await expect(page.getByLabel('Approximate age', { exact: false })).toHaveValue('34');
  await expect(page.getByLabel('Relationship details', { exact: true })).toHaveValue('Neighbour');
  expect((await db.collection('patients').findOne({ _id: stored!._id }))!.condition).toBe(
    'Cardiac follow-up',
  );
  await page.unroute(sessionRoute);
  await page.unroute('**/api/v1/auth/refresh');
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByText('Patient updated.', { exact: true })).toBeVisible();
  await expect(page.getByText('Updated review', { exact: true })).toBeVisible();
  const updated = await db.collection('patients').findOne({ _id: stored!._id });
  expect(updated).toMatchObject({
    nameBangla: 'পরীক্ষামূলক আমিনা সংশোধিত',
    approximateAge: { value: 34, unit: 'years' },
    gender: 'prefer-not-to-say',
    bloodGroup: 'Unknown',
    mobile: '+8801898765432',
    division: 'Chattogram',
    district: 'Cumilla',
    upazila: 'Cumilla Sadar',
    postalCode: '3500',
    addressLine: 'Updated fictional test address',
    emergencyContact: {
      name: 'Fixture Contact Farida',
      relationship: 'Other',
      relationshipOther: 'Neighbour',
      mobile: '+8801998765432',
    },
    chiefComplaint: 'Updated test symptom record',
    allergyStatus: 'none-known',
    medicalHistory: 'Updated test history',
    currentMedications: 'Updated test medication record',
    clinicalNotes: 'Updated disposable record.',
  });
  expect(updated!.dateOfBirth ?? null).toBeNull();
  expect(updated!.allergies ?? null).toBeNull();
  expect(updated!.email ?? null).toBeNull();
  expect(updated!.doctorId.toString()).toBe(doctorId);
  await expect(page.getByText('No known allergies', { exact: true })).toBeVisible();
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
  await page.getByLabel('Patient name (English)', { exact: false }).fill(literal);
  await page.getByLabel('Condition', { exact: false }).fill('Browser literal text test');
  await page.getByLabel('Birth date or age', { exact: false }).selectOption('approximate');
  await page.getByLabel('Approximate age', { exact: false }).fill('7');
  await page.getByLabel('Age unit', { exact: true }).selectOption('days');
  await page.getByLabel('Gender', { exact: false }).selectOption('unknown');
  await page.getByLabel(/^Mobile number/).fill('+44 7700 900123');
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByRole('heading', { name: literal, exact: true })).toBeVisible();
  await expect(page.getByText('Patient added.', { exact: true })).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  const infant = await db.collection('patients').findOne({ name: literal });
  expect(infant).toMatchObject({
    approximateAge: { value: 7, unit: 'days' },
    bloodGroup: 'Unknown',
    mobile: '+447700900123',
  });
  expect(infant!.dateOfBirth ?? null).toBeNull();
  // Emulate a pre-extension record directly in this disposable database only.
  const oldRecord = await db.collection('patients').insertOne({
    name: 'Fixture Legacy Patient',
    condition: 'Legacy review',
    doctorId: doctor!._id,
    nameKey: 'fixture legacy patient',
    conditionKey: 'legacy review',
    searchTokens: ['fixture', 'legacy', 'patient', 'review'],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await page.goto(`/patients/${oldRecord.insertedId}`);
  await expect(
    page.getByRole('heading', { name: 'Fixture Legacy Patient', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator('.patient-contact-list > div')
      .filter({ has: page.getByText('Age', { exact: true }) }),
  ).toContainText('Not recorded');
  await page.getByRole('link', { name: 'Edit patient', exact: true }).click();
  await expect(page.getByLabel('Birth date or age', { exact: false })).toHaveValue('');
  await expect(page.getByLabel('Gender', { exact: false })).toHaveValue('');
  await expect(page.getByLabel(/^Mobile number/)).toHaveValue('');
  await page.getByLabel('Condition', { exact: false }).fill('Legacy review updated');
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByText('Patient updated.', { exact: true })).toBeVisible();
  const oldUpdated = await db.collection('patients').findOne({ _id: oldRecord.insertedId });
  expect(oldUpdated!.condition).toBe('Legacy review updated');
  for (const field of [
    'mobile',
    'gender',
    'dateOfBirth',
    'approximateAge',
    'bloodGroup',
    'allergyStatus',
    'medicalHistory',
  ])
    expect(oldUpdated).not.toHaveProperty(field);
  expect(oldUpdated!.doctorId.toString()).toBe(doctorId);
  await page.goto('/patients/invalid');
  await expect(page.getByText('This patient link is invalid.', { exact: true })).toBeVisible();
  await page.goto('/patients');
  await expect(page.getByRole('heading', { name: 'Patients', exact: true })).toBeVisible();
}
