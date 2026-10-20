import { expect, test } from '@playwright/test';
import { axeClean, LESSON, runFirstBlock, setPrefs } from './helpers';

const PAGES = [
  ['home', '/'],
  ['chapter', `${LESSON}/1-numbers`],
  ['chapter with tables', `${LESSON}/11-appendix`],
  ['settings', '/settings'],
  ['sign in', '/signin'],
  ['sign up', '/signup'],
  ['not found', '/nope'],
] as const;

for (const theme of ['light', 'dark', 'contrast'] as const) {
  for (const locale of ['en', 'fa'] as const) {
    test(`accessibility (axe, WCAG 2.2 AA): every page, ${theme}, ${locale}`, async ({ page }) => {
      await setPrefs(page, { theme, locale });
      for (const [name, url] of PAGES) {
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForSelector('main h1, main h2');
        await axeClean(page, `${name} / ${theme} / ${locale}`);
      }
    });
  }
}

test('accessibility: a code block with output and an error, colour-blind palette, large text', async ({ page }) => {
  await setPrefs(page, { theme: 'light', locale: 'en', palette: 'cb', fontSize: 150, dyslexia: true });
  await page.goto(`${LESSON}/1-numbers`);
  const block = page.locator('.codeblock').first();
  await block.locator('textarea').first().fill('print(1)\nprint(1/0)');
  await block.getByRole('button', { name: 'Run' }).click();
  await expect(block.locator('.errorcoach')).toBeVisible();
  await axeClean(page, 'chapter with error output');
});

test('Persian: the page is right-to-left, code stays left-to-right', async ({ page }) => {
  await setPrefs(page, { locale: 'fa' });
  await page.goto(`${LESSON}/1-numbers`);
  expect(await page.evaluate(() => [document.documentElement.dir, document.documentElement.lang])).toEqual(['rtl', 'fa']);
  const dir = await page.locator('.codeblock textarea').first().evaluate((el) => getComputedStyle(el).direction);
  expect(dir).toBe('ltr');
  await expect(page.getByRole('link', { name: 'تنظیمات' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('پایتون از صفر');
  await expect(page.getByText('درس ۱').first()).toBeAttached(); // Persian digits
});

test('language and theme choices survive a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'فارسی' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: /پوسته/ }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('settings change the page immediately: text size, dyslexia font, contrast', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel(/Text size/).fill('150');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('24px');
  await page.getByLabel('Use a dyslexia-friendly font').check();
  await expect(page.locator('html')).toHaveAttribute('data-dyslexia', '1');
  await page.getByLabel('Theme', { exact: true }).selectOption('contrast');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
});

test('keyboard: skip link is the first stop, and Ctrl+Enter runs code', async ({ page }) => {
  await page.goto(`${LESSON}/1-numbers`);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  const ta = page.locator('.codeblock textarea').first();
  await ta.fill('print("kb")');
  await ta.press('Control+Enter');
  await expect(page.locator('.codeblock').first().locator('.outbox').last()).toContainText('kb');
});

for (const w of [320, 360, 768]) {
  test(`no horizontal scrolling at ${w}px wide (home, a chapter with wide tables, settings)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    for (const url of ['/', `${LESSON}/4-print-formatting-with-strings`, `${LESSON}/11-appendix`, '/settings']) {
      await page.goto(url, { waitUntil: 'networkidle' });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${url} overflows by ${over}px`).toBeLessThanOrEqual(0);
    }
  });
}

test('200% text size at 320px still has no sideways scrolling', async ({ page }) => {
  await setPrefs(page, { fontSize: 200 });
  await page.setViewportSize({ width: 320, height: 800 });
  for (const url of ['/', `${LESSON}/1-numbers`]) {
    await page.goto(url, { waitUntil: 'networkidle' });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `${url} overflows by ${over}px`).toBeLessThanOrEqual(0);
  }
});

test('offline: a lesson you opened and ran still works with no network', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto(`${LESSON}/1-numbers`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'networkidle' }); // now controlled by the service worker
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const block = await runFirstBlock(page); // downloads and caches Python
  await expect(block.locator('.outbox').last()).toContainText('8100000000');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '1. Numbers' })).toBeVisible();
  await expect(page.getByText(/Offline/).first()).toBeVisible();
  const b2 = await runFirstBlock(page);
  await expect(b2.locator('.outbox').last()).toContainText('8100000000');
});

test('guest progress is saved on the device and survives a reload', async ({ page }) => {
  await page.goto(`${LESSON}/2-variable-assignment`);
  await page.getByRole('button', { name: 'Mark as read' }).click();
  await expect(page.getByRole('button', { name: /Read/ })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: /✓ Read/ })).toBeDisabled();
  await expect(page.getByRole('link', { name: /2\. Variable Assignment ✓/ })).toBeVisible();
});

test('unknown chapter shows a helpful message', async ({ page }) => {
  await page.goto(`${LESSON}/99-nope`);
  await expect(page.getByText('That lesson or chapter does not exist.')).toBeVisible();
});

test('in-lesson table-of-contents links go to the chapter', async ({ page }) => {
  await page.goto(LESSON);
  await page.locator('article a', { hasText: 'Strings' }).first().click();
  await expect(page).toHaveURL(/3-strings$/);
  await expect(page.getByRole('heading', { name: '3. Strings' })).toBeVisible();
});

test('content security policy blocks inline script injection', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => { if (m.text().includes('Content Security Policy')) violations.push(m.text()); });
  await page.goto('/');
  await page.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__pwned = 1'; document.body.appendChild(s); });
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(violations.length).toBeGreaterThan(0);
});

test('lesson text cannot inject HTML (raw HTML in markdown is escaped)', async ({ page }) => {
  await page.goto(`${LESSON}/1-numbers`);
  expect(await page.locator('article script, article iframe, article img[onerror]').count()).toBe(0);
});
