/**
 * Post-deployment smoke test.
 *
 * Verifies the *deployed* site, not the local build: the page loads with no console
 * errors, the author X link is present, CSP-free assets load, and a real CSV can be
 * imported and converted in the browser.
 *
 * Usage: node scripts/verify-live.mjs https://user.github.io/fileflow/
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? process.env.LIVE_URL ?? 'https://iiiiiiiiiiiiiKK.github.io/fileflow/';
const CSV = 'id,name,role,score\n1,Ada,engineer,9.5\n2,Grace,engineer,8.75\n3,小明,analyst,7\n';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

try {
  const response = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
  check('HTTP 200', response?.status() === 200, `status=${response?.status()}`);

  await page.waitForSelector('.hero__title', { timeout: 20000 });
  const title = await page.title();
  check('page title', /FileFlow/i.test(title), title);

  const hero = (await page.locator('.hero__title').textContent())?.trim() ?? '';
  check('hero renders', hero.length > 6, hero);

  const author = page.locator('.site-header .author-link');
  check('author X link', (await author.getAttribute('href')) === 'https://x.com/0xkillcoin', await author.getAttribute('href'));

  // Real interaction against the deployed bundle.
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'smoke.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV, 'utf8'),
  });
  await page.waitForSelector('.data-table, .preview-head', { timeout: 20000 });
  const rowCount = (await page.locator('.data-table__count').textContent())?.trim() ?? '';
  check('CSV import', rowCount.includes('3'), rowCount);

  await page.locator('.tool-button', { hasText: /格式转换|Convert/ }).click();
  await page.waitForSelector('.code-preview', { timeout: 20000 });
  const preview = (await page.locator('.code-preview').textContent()) ?? '';
  check('conversion preview', preview.includes('"name": "Ada"'), preview.slice(0, 60).replace(/\s+/g, ' '));

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: /下载结果|Download result/ }).click(),
  ]);
  check('download works', download.suggestedFilename().endsWith('.json'), download.suggestedFilename());

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
} catch (error) {
  check('run completed', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${BASE}`);
if (failed.length > 0) process.exit(1);
