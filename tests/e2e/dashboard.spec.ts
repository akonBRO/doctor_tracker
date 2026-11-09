import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { generate } from 'otplib';
import { dashboardFlow } from './dashboard-flow.js';

const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb');
let database: InstanceType<typeof MongoClient>;
test.beforeAll(async () => {
  database = await new MongoClient(process.env.E2E_MONGODB_URI!).connect();
});
test.afterAll(async () => {
  await database.close();
});

test('real dashboard totals, historical registrations, distribution, freshness and recovery', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const token = randomBytes(32).toString('hex');
  const email = `analytics-${info.project.name}-${token.slice(0, 8)}@example.test`;
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
  await page.getByLabel('Full name').fill('Analytics Reviewer');
  await page.getByLabel('Work email').fill(email);
  await page
    .getByLabel('Password', { exact: true })
    .fill(`Browser-only-${randomBytes(12).toString('hex')}!`);
  await page.getByRole('button', { name: 'Create account & continue' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your authenticator' })).toBeVisible();
  const secret = await page.getByLabel('Your manual setup key').inputValue();
  await page.getByLabel('Authenticator code', { exact: true }).fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Verify & continue' }).click();
  await page.getByLabel('I’ve saved my recovery codes in a safe place.').check();
  await page.getByRole('button', { name: 'Enter your workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await dashboardFlow(page, info, database);
});
