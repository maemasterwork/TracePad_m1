import { expect, test, type Page } from '@playwright/test';
import { LESSON } from './helpers';

const API = 'http://127.0.0.1:54321';
const PW = 'correct-horse-9';

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const r = await fetch(`${API}/__test/sql`, { method: 'POST', body: JSON.stringify({ sql: query, params }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message);
  return j as T[];
}

test.beforeEach(async () => { await fetch(`${API}/__test/reset`); });

async function signUp(page: Page, o: { name: string; age?: string; waitIn?: boolean; username?: string; email?: string; pw?: string }) {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(o.name);
  await page.getByLabel('Your age').selectOption(o.age ?? 'adult');
  if (o.username) {
    await page.getByLabel(/no email address/i).check();
    await page.getByRole('textbox', { name: 'Username' }).fill(o.username);
  } else await page.getByRole('textbox', { name: 'Email', exact: true }).fill(o.email!);
  await page.getByLabel('Password', { exact: true }).fill(o.pw ?? PW);
  await page.getByRole('button', { name: 'Create your account' }).click();
  if (o.waitIn !== false) await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

async function openChapter1(page: Page) {
  await page.goto(LESSON);
  await page.locator('.rail ol li a').nth(1).click();
}

test('sign up with an email, land signed in, profile row has the right data', async ({ page }) => {
  await signUp(page, { name: 'Ada Lovelace', email: 'ada@example.com' });
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  const rows = await sql<{ full_name: string; role: string; age_band: string | null }>(`select full_name, role, age_band from public.profiles`);
  expect(rows).toHaveLength(1);
  expect(rows[0].full_name).toBe('Ada Lovelace');
  expect(rows[0].role).toBe('student');
});

test('sign up with a username only, sign out, sign in again; wrong password is refused', async ({ page }) => {
  await signUp(page, { name: 'Sam', username: 'sam_01', age: '13_15' });
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  expect((await sql<{ username: string }>(`select username from public.profiles`))[0].username).toBe('sam_01');
  await expect.poll(async () => (await sql<{ age_band: string | null }>(`select age_band from public.profiles`))[0].age_band, { message: 'age band from sign-up is applied at first sign-in' }).toBe('13_15');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/signin');
  await page.getByLabel(/Email \/ Username/).fill('sam_01');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('That email or password is not right.')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('a username that already has an account is reported', async ({ page, browser }) => {
  await signUp(page, { name: 'One', username: 'dup_user' });
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  const ctx = await browser.newContext(); const p2 = await ctx.newPage();
  await signUp(p2, { name: 'Two', username: 'dup_user', waitIn: false });
  await expect(p2.getByText('That username or email already has an account.')).toBeVisible();
  await ctx.close();
});

test('under 13 cannot create an account', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Your age').selectOption('under13');
  await expect(page.getByRole('button', { name: 'Create your account' })).toBeDisabled();
});

test('marking a chapter read is saved to the database', async ({ page }) => {
  await signUp(page, { name: 'Ada', email: 'ada@example.com' });
  await openChapter1(page);
  await page.getByRole('button', { name: 'Mark as read' }).click();
  await expect.poll(async () => (await sql(`select key, data from public.progress`)).length).toBe(1);
  const [row] = await sql<{ key: string; data: { done: boolean } }>(`select key, data from public.progress`);
  expect(row.key).toMatch(/^read:/);
  expect(row.data.done).toBe(true);
});

test('work done offline is kept and sent when the connection returns', async ({ page, context }) => {
  await signUp(page, { name: 'Ada', email: 'ada@example.com' });
  await openChapter1(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Mark as read' }).click();
  await expect(page.getByRole('button', { name: /Read$/ })).toBeDisabled();
  expect(await sql(`select 1 from public.progress`)).toHaveLength(0);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await sql(`select 1 from public.progress`)).length, { timeout: 40_000 }).toBe(1);
});

test('progress made on one device appears on another', async ({ page, browser }) => {
  await signUp(page, { name: 'Ada', email: 'ada@example.com' });
  await openChapter1(page);
  await page.getByRole('button', { name: 'Mark as read' }).click();
  await expect.poll(async () => (await sql(`select 1 from public.progress`)).length).toBe(1);
  const ctx = await browser.newContext(); const p2 = await ctx.newPage();
  await p2.goto('/signin');
  await p2.getByLabel(/Email \/ Username/).fill('ada@example.com');
  await p2.getByLabel('Password', { exact: true }).fill(PW);
  await p2.getByRole('button', { name: 'Sign in', exact: true }).click();
  await openChapter1(p2);
  await expect(p2.getByRole('button', { name: /Read$/ })).toBeDisabled();
  await ctx.close();
});

test('guest progress is adopted into the account at sign-in', async ({ page }) => {
  await openChapter1(page);
  await page.getByRole('button', { name: 'Mark as read' }).click();
  await expect(page.getByRole('button', { name: /Read$/ })).toBeDisabled();
  await signUp(page, { name: 'Ada', email: 'ada@example.com' });
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await expect.poll(async () => (await sql(`select 1 from public.progress`)).length, { timeout: 30_000 }).toBe(1);
});

test('claiming the teacher code makes the account a teacher; a wrong code does not', async ({ page }) => {
  await sql(`update public.app_settings set value = 'open-sesame-123' where key = 'teacher_code'`);
  await signUp(page, { name: 'Tess', email: 'tess@example.com' });
  await page.goto('/account');
  await page.getByLabel('Teacher invite code').fill('nope');
  await page.getByRole('button', { name: /use code/i }).click();
  await expect(page.getByText(/not valid/i).first()).toBeVisible();
  await page.getByLabel('Teacher invite code').fill('open-sesame-123');
  await page.getByRole('button', { name: /use code/i }).click();
  await expect(page.getByText('You are now a teacher.')).toBeVisible();
  expect((await sql<{ role: string }>(`select role from public.profiles`))[0].role).toBe('teacher');
});

test('export my data downloads a file with my rows', async ({ page }) => {
  await signUp(page, { name: 'Ada', email: 'ada@example.com' });
  await page.goto('/account');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe('tracepad-my-data.json');
  const text = await (await import('node:fs/promises')).readFile((await d.path())!, 'utf8');
  expect(JSON.parse(text)).toBeTruthy();
  expect(text).toContain('Ada');
});

test('deleting the account removes everything and signs out', async ({ page }) => {
  await signUp(page, { name: 'Ada', email: 'ada@example.com' });
  await openChapter1(page);
  await page.getByRole('button', { name: 'Mark as read' }).click();
  await expect.poll(async () => (await sql(`select 1 from public.progress`)).length).toBe(1);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByLabel('DELETE', { exact: false }).fill('DELETE');
  await page.getByRole('button', { name: 'Delete my account' }).last().click();
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  expect(await sql(`select 1 from public.profiles`)).toHaveLength(0);
  expect(await sql(`select 1 from public.progress`)).toHaveLength(0);
  expect(await sql(`select 1 from auth.users`)).toHaveLength(0);
});

test('password reset: link from the outbox sets a new password', async ({ page }) => {
  await signUp(page, { name: 'Ada', email: 'ada@example.com' });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/reset');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('ada@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('a reset link is on its way', { exact: false })).toBeVisible();
  const box = await (await fetch(`${API}/__test/outbox`)).json() as { to: string; link: string }[];
  const code = (box as unknown as { to: string; code?: string; type: string }[]).filter((m) => m.to === 'ada@example.com' && m.type === 'recovery').pop()!.code!;
  await page.goto('/auth/update-password?code=' + code);
  await page.getByLabel('New password').fill('brand-new-pass-1');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByText('Your password was changed.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/signin');
  await page.getByLabel(/Email \/ Username/).fill('ada@example.com');
  await page.getByLabel('Password', { exact: true }).fill('brand-new-pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('sign out other devices ends the other session', async ({ page, browser }) => {
  await signUp(page, { name: 'Ada', email: 'ada@example.com' });
  const ctx = await browser.newContext(); const p2 = await ctx.newPage();
  await p2.goto('/signin');
  await p2.getByLabel(/Email \/ Username/).fill('ada@example.com');
  await p2.getByLabel('Password', { exact: true }).fill(PW);
  await p2.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(p2.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out everywhere else' }).click();
  await expect(page.getByText('All other devices were signed out.')).toBeVisible();
  // The other device keeps its short-lived access token until it expires (same as real GoTrue), but its refresh token is dead.
  const stored = await p2.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.endsWith('-auth-token'))!; return JSON.parse(localStorage.getItem(k)!) as { refresh_token: string }; });
  const anon = (await (await fetch(`${API}/__test/anon`)).json()).key as string;
  const r = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: anon, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: stored.refresh_token }) });
  expect(r.ok).toBe(false);
  // ...while this device's own session still works.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await ctx.close();
});
