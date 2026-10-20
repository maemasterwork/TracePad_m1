import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const shot = async (name, prefs, vp, url, after) => {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1 });
  await ctx.addInitScript((p) => localStorage.setItem('tracepad.prefs', JSON.stringify(p)), prefs);
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173' + url, { waitUntil: 'networkidle' });
  if (after) await after(page);
  await page.screenshot({ path: `/tmp/shots/${name}.png` });
  await ctx.close();
};
const runFirst = async (page) => { const bl = page.locator('.codeblock').first(); await bl.getByRole('button', { name: /Run|اجرا/ }).click(); await bl.locator('.outbox span').first().waitFor({ timeout: 60000 }); await bl.scrollIntoViewIfNeeded(); };
await shot('m-fa-dark-chapter', { theme: 'dark', locale: 'fa' }, { width: 390, height: 844 }, '/lesson/01-objects-and-data-structures/1-numbers', runFirst);
await shot('d-fa-home', { theme: 'light', locale: 'fa' }, { width: 1100, height: 700 }, '/');
await shot('d-settings-dark', { theme: 'dark', locale: 'en' }, { width: 1000, height: 760 }, '/settings');
await shot('d-signup', { theme: 'light', locale: 'en' }, { width: 900, height: 500 }, '/signup');
await b.close();
