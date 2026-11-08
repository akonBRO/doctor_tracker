import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { generate } from 'otplib';
import AxeBuilder from '@axe-core/playwright';
const { MongoClient } = createRequire(import.meta.url)('mongodb') as typeof import('mongodb');
let database: InstanceType<typeof MongoClient>;

async function checkAccessibility(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

test.beforeAll(async () => {
  database = await new MongoClient(process.env.E2E_MONGODB_URI!).connect();
  await mkdir('docs/screenshots', { recursive: true });
});
test.afterAll(async () => {
  await database.close();
});

test('public routes, responsive layout, accessibility, and protected redirects', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("'nonce-");
  await expect(
    page.getByRole('heading', { name: 'Less scattered. More connected.' }),
  ).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/landing-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await checkAccessibility(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: /A personal invitation/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Work email' })).toHaveCount(0);
  await checkAccessibility(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const route of ['/dashboard', '/doctors', '/patients']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
  await checkAccessibility(page);
  await page.screenshot({
    path: `docs/screenshots/login-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel('Work email').fill('invalid');
  await page.getByLabel('Password', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Continue securely' }).click();
  await expect(page.getByText('Enter your password.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('real invitation, MFA enrollment, restored session, shell navigation, and logout', async ({
  page,
}, testInfo) => {
  const token = randomBytes(32).toString('hex');
  const email = `${testInfo.project.name}-${token.slice(0, 8)}@example.test`;
  const password = `Browser-test-${randomBytes(12).toString('hex')}!`;
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
  await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
  await checkAccessibility(page);
  await page.getByLabel('Full name').fill('Workspace Reviewer');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account & continue' }).click();
  await expect(page.getByRole('heading', { name: 'Secure your account.' })).toBeVisible();
  const secret = await page.getByLabel('Your manual setup key').inputValue();
  await checkAccessibility(page);
  const unauthorized = await page.request.get('/api/v1/auth/me');
  expect(unauthorized.status()).toBe(401);
  await page.getByLabel('Authenticator code', { exact: true }).fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Verify & continue' }).click();
  await expect(page.getByRole('heading', { name: 'Keep a way back in.' })).toBeVisible();
  const recoveryCode = await page.locator('.recovery-codes code').first().innerText();
  await page.getByLabel('I’ve saved my recovery codes in a safe place.').check();
  await page.getByRole('button', { name: 'Enter your workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'A clear place to begin.' })).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/workspace-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await checkAccessibility(page);
  // Force access expiry while retaining the real rotating refresh cookie; no fake authentication.
  await page.context().clearCookies({ name: 'dt_access' });
  const otherTab = await page.context().newPage();
  await Promise.all([page.reload(), otherTab.goto('/dashboard')]);
  await expect(otherTab.getByRole('heading', { name: 'A clear place to begin.' })).toBeVisible();
  await otherTab.close();
  await expect(page.getByRole('heading', { name: 'A clear place to begin.' })).toBeVisible();
  for (const [label, heading] of [
    ['Doctors', 'The people providing care.'],
    ['Patients', 'Every record, in context.'],
  ]) {
    if (testInfo.project.name.includes('mobile'))
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Workspace navigation' })
      .getByRole('link', { name: label })
      .click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  if (testInfo.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue securely' }).click();
  await expect(page.getByRole('heading', { name: 'Verify it’s you.' })).toBeVisible();
  await page.getByRole('button', { name: /Use a recovery code/ }).click();
  await page.getByLabel('Recovery code', { exact: true }).fill(recoveryCode);
  await page.getByRole('button', { name: 'Verify & continue' }).click();
  await expect(page.getByRole('heading', { name: 'A clear place to begin.' })).toBeVisible();
  if (testInfo.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await database.db().collection('admins').countDocuments({ email, mfaEnabled: true })).toBe(
    1,
  );
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  expect(storage.local).toEqual([]);
  expect(storage.session).toEqual([]);
});
