import { expect, test } from '@playwright/test';
import { LESSON, runFirstBlock } from './helpers';

test('page is cross-origin isolated (needed for live input and Stop)', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});

test('runs a lesson example and shows its output', async ({ page }) => {
  await page.goto(`${LESSON}/1-numbers`);
  const block = await runFirstBlock(page);
  await expect(block.locator('.outbox').last()).toContainText("<class 'complex'>");
  await expect(block.locator('.outbox').last()).toContainText('8100000000');
});

test('editing the code changes what runs, and Reset restores the original', async ({ page }) => {
  await page.goto(`${LESSON}/1-numbers`);
  const block = page.locator('.codeblock').first();
  await block.locator('textarea').first().fill('print(6 * 7)');
  await block.getByRole('button', { name: 'Run' }).click();
  await expect(block.locator('.outbox').last()).toHaveText(/^42\s*$/);
  await block.getByRole('button', { name: 'Reset code' }).click();
  await expect(block.locator('textarea').first()).toHaveValue(/print\(type\(7\)\)/);
});

test('errors show the line and the Python message, never a blank screen', async ({ page }) => {
  await page.goto(`${LESSON}/1-numbers`);
  const block = page.locator('.codeblock').first();
  await block.locator('textarea').first().fill('x = 1\nprint(x)\nprint(1 / 0)');
  await block.getByRole('button', { name: 'Run' }).click();
  await expect(block.locator('.errorcoach')).toContainText('ZeroDivisionError on line 3');
  await expect(block.locator('.errorcoach')).toContainText('division by zero');
  await expect(block.locator('.outbox').last()).toContainText('Traceback');
});

test('syntax errors are reported with their line', async ({ page }) => {
  await page.goto(`${LESSON}/1-numbers`);
  const block = page.locator('.codeblock').first();
  await block.locator('textarea').first().fill('print("a"\nprint("b")');
  await block.getByRole('button', { name: 'Run' }).click();
  await expect(block.locator('.errorcoach')).toContainText('SyntaxError');
});

test('input() pauses for the learner and continues with their answer', async ({ page }) => {
  await page.goto(`${LESSON}/1-numbers`);
  const block = page.locator('.codeblock').first();
  await block.locator('textarea').first().fill('name = input("Name? ")\nprint("Hello", name.upper())');
  await block.getByRole('button', { name: 'Run' }).click();
  const live = block.getByLabel(/waiting for input/i);
  await live.fill('ada');
  await live.press('Enter');
  await expect(block.locator('.outbox').last()).toContainText('Hello ADA');
});

test('Stop interrupts an endless loop and the page stays usable', async ({ page }) => {
  await page.goto(`${LESSON}/1-numbers`);
  const block = page.locator('.codeblock').first();
  await block.locator('textarea').first().fill('n = 0\nwhile True:\n    n += 1');
  await block.getByRole('button', { name: 'Run' }).click();
  await page.waitForTimeout(1500);
  await block.getByRole('button', { name: 'Stop' }).click();
  await expect(block.getByRole('button', { name: 'Run' })).toBeEnabled();
  await expect(block.locator('.outbox').last()).toContainText('Stopped');
  // and a normal run still works afterwards
  await block.locator('textarea').first().fill('print("still alive")');
  await block.getByRole('button', { name: 'Run' }).click();
  await expect(block.locator('.outbox').last()).toContainText('still alive');
});

test('a program that never ends is stopped by the time limit', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`${LESSON}/1-numbers`);
  const block = page.locator('.codeblock').first();
  await block.locator('textarea').first().fill('while True:\n    pass');
  await block.getByRole('button', { name: 'Run' }).click();
  await expect(block.locator('.outbox').last()).toContainText(/ran longer than 10 seconds/, { timeout: 25_000 });
});

test('files written by one run are there for the next run (virtual disk)', async ({ page }) => {
  await page.goto(`${LESSON}/1-numbers`);
  const block = page.locator('.codeblock').first();
  await block.locator('textarea').first().fill('open("n.txt","w").write("kept")');
  await block.getByRole('button', { name: 'Run' }).click();
  await expect(block.getByRole('button', { name: 'Run' })).toBeEnabled();
  await block.locator('textarea').first().fill('print(open("n.txt").read())');
  await block.getByRole('button', { name: 'Run' }).click();
  await expect(block.locator('.outbox').last()).toContainText('kept');
});

test('a block that depends on earlier lesson code runs it first (dictionary comprehension uses scores)', async ({ page }) => {
  await page.goto(`${LESSON}/6-dictionaries`);
  const block = page.locator('[data-block="6.6#1"]');
  await expect(block).toContainText('earlier in the lesson');
  await block.getByRole('button', { name: 'Run' }).click();
  await expect(block.getByRole('button', { name: 'Run' })).toBeEnabled();
  await expect(block.locator('.errorcoach')).toHaveCount(0);
});

test('nested code inside a list item (Try It) is runnable too', async ({ page }) => {
  await page.goto(`${LESSON}/2-variable-assignment`);
  const block = page.locator('[data-block="2.9#1"]');
  await block.getByRole('button', { name: 'Run' }).click();
  await expect(block.locator('.outbox').last()).toContainText('10 5');
});
