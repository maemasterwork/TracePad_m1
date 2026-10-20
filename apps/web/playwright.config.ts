import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const LOCAL = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'; // this repo's dev container; CI uses Playwright's own download
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(LOCAL) ? LOCAL : undefined);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  testIgnore: /auth\.spec\.ts/, // needs the stand-in backend: run with e2e/run-auth.sh
  timeout: 90_000,
  expect: { timeout: 30_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { executablePath, args: ['--no-sandbox'] },
  },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
});
