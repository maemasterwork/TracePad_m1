import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const LESSON = '/lesson/01-objects-and-data-structures';

export async function setPrefs(page: Page, prefs: Record<string, unknown>) {
  await page.addInitScript((p) => localStorage.setItem('tracepad.prefs', JSON.stringify(p)), prefs);
}

export async function axeClean(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical' || v.impact === 'moderate');
  const msg = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' => ' + (n.failureSummary ?? '').split('\n').slice(1, 3).join(' ')).join(' | ')}`).join('\n');
  expect(bad, `${label}\n${msg}`).toEqual([]);
}

export async function runFirstBlock(page: Page) {
  const block = page.locator('.codeblock').first();
  await block.getByRole('button', { name: /^(Run|اجرا)$/ }).click();
  return block;
}
