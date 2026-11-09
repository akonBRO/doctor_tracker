import { expect, type Locator, type Page } from '@playwright/test';

export async function capturePage(page: Page, project: string, name: string, mask: Locator[] = []) {
  if (process.env.E2E_WEB_MODE !== 'development')
    await expect(page.locator('nextjs-portal')).toHaveCount(0);
  // Full-page captures retain sticky/fixed elements at the current scroll position.
  // Start at the top and clear transient keyboard focus without hiding application UI.
  await page.evaluate(async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  const directory =
    process.env.E2E_WEB_MODE === 'development' ? 'tmp/screenshots-development' : 'docs/screenshots';
  if (process.env.E2E_CAPTURE_SCREENSHOTS !== 'true') return;
  await page.screenshot({
    path: `${directory}/${name}-${project}.png`,
    fullPage: true,
    mask,
    maskColor: '#d9e6ef',
  });
}
