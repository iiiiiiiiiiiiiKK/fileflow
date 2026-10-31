/**
 * Captures the README screenshots from the real production build.
 * Usage: npm run build && npx vite preview --port 4173 & node scripts/screenshots.mjs
 */
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4273/';
const OUT = resolve(process.cwd(), 'docs');
const FIXTURES = resolve(process.cwd(), 'e2e', 'fixtures');

function file(name) {
  const mimeType = name.endsWith('.csv') ? 'text/csv' : name.endsWith('.jsonl') ? 'application/x-ndjson' : 'application/json';
  return { name, mimeType, buffer: readFileSync(resolve(FIXTURES, name)) };
}

async function importFixture(page, name) {
  await page.locator('input[type="file"]').first().setInputFiles(file(name));
  await page.waitForSelector('.preview-head__title h2', { timeout: 15000 });
  await page.waitForTimeout(350);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // Desktop, light theme
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    colorScheme: 'light',
  });
  const page = await desktop.newPage();
  await page.goto(BASE);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, 'home-light.png'), fullPage: false });
  await page.screenshot({ path: resolve(OUT, 'home-full.png'), fullPage: true });

  await importFixture(page, 'people.csv');
  await page.screenshot({ path: resolve(OUT, 'workspace-table.png') });

  await page.locator('.tool-button', { hasText: '格式转换' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'workspace-convert.png') });

  await page.locator('.pane__head--tool .icon-button').click();
  await page.locator('.panel-tabs__item', { hasText: '统计' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT, 'workspace-stats.png') });

  await page.locator('.panel-tabs__item', { hasText: '字段' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT, 'workspace-fields.png') });

  // Clean panel on a file that actually has duplicates
  await importFixture(page, 'dupes.csv');
  await page.locator('.tool-button', { hasText: '数据清洗' }).click();
  await page.locator('.op', { hasText: '删除重复行' }).locator('input[type="checkbox"]').check();
  await page.locator('.op', { hasText: '去除文本前后空格' }).locator('input[type="checkbox"]').check();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'workspace-clean.png') });

  // JSON tree
  await importFixture(page, 'nested.json');
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, 'workspace-json.png') });

  // Dark theme
  await page.locator('.site-header__actions .icon-button').last().click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(OUT, 'workspace-dark.png') });

  // English UI
  await page.locator('.lang-toggle').click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(OUT, 'workspace-dark-en.png') });

  // Mobile
  const mobile = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const phone = await mobile.newPage();
  await phone.goto(BASE);
  await phone.waitForTimeout(400);
  await phone.screenshot({ path: resolve(OUT, 'mobile-home.png') });
  await phone.screenshot({ path: resolve(OUT, 'mobile-home-full.png'), fullPage: true });
  await importFixture(phone, 'people.csv');
  await phone.screenshot({ path: resolve(OUT, 'mobile-table.png') });
  await phone.locator('.mobile-tabs__item', { hasText: '工具' }).click();
  await phone.locator('.tool-button', { hasText: '格式转换' }).click();
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: resolve(OUT, 'mobile-convert.png') });
  await phone.locator('.mobile-tabs__item', { hasText: '详情' }).click();
  await phone.locator('.panel-tabs__item', { hasText: '统计' }).click();
  await phone.waitForTimeout(250);
  await phone.screenshot({ path: resolve(OUT, 'mobile-stats.png') });

  await browser.close();
  console.log('screenshots written to', OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
