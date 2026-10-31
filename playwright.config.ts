import { defineConfig, devices } from '@playwright/test';

const PORT = 4193;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * End-to-end configuration.
 *
 * The suite runs against the real production bundle (`vite build` + `vite preview`)
 * so what is tested is exactly what ships to GitHub Pages.
 *
 * Projects:
 *  - `desktop`           full workbench suite at 1440x900 (Desktop Chrome).
 *  - `iphone-13`         touch/layout suite with real iPhone 13 metrics (390x844, DPR 3).
 *  - `iphone-se`         the smallest realistic viewport (320x568) — the hardest case.
 *  - `responsive-matrix` resizes one context across 9 widths and asserts there is no
 *                        horizontal overflow and that primary actions stay reachable.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Deterministic locale/timezone so the Chinese UI is asserted, not sniffed.
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'desktop',
      testMatch: /(workbench|convert)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'iphone-13',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' },
    },
    {
      name: 'iphone-se',
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices['iPhone SE'],
        browserName: 'chromium',
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'responsive-matrix',
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
