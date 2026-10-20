import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const LOCAL = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'; // this repo's dev container; CI uses Playwright's own download
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(LOCAL) ? LOCAL : undefined);

// Runs against the stand-in Supabase (e2e/standin) and a build configured for it. Started by e2e/run-auth.sh.
export default defineConfig({
  testDir: './e2e',
  testMatch: /auth\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    launchOptions: { executablePath, args: ['--no-sandbox'] },
  },
});
