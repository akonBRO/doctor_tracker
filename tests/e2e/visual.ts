import type { Locator, Page } from '@playwright/test';

export async function capturePage(page: Page, project: string, name: string, mask: Locator[] = []) {
  // Full-page captures retain sticky/fixed elements at the current scroll position.
  // Start at the top and clear transient keyboard focus without hiding application UI.
  await page.evaluate(async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  await page.screenshot({
    path: `docs/screenshots/${name}-${project}.png`,
    fullPage: true,
    mask,
    maskColor: '#d7d9d6',
  });
}
