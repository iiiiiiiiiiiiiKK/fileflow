import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

const FIXTURES = resolve(process.cwd(), 'e2e', 'fixtures');

export function fixture(name: string): { name: string; mimeType: string; buffer: Buffer } {
  const mimeType = name.endsWith('.csv')
    ? 'text/csv'
    : name.endsWith('.jsonl')
      ? 'application/x-ndjson'
      : name.endsWith('.json')
        ? 'application/json'
        : 'text/plain';
  return { name, mimeType, buffer: readFileSync(resolve(FIXTURES, name)) };
}

/** Imports a fixture through the real file input (home page or workspace). */
export async function importFixture(page: Page, name: string): Promise<void> {
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(fixture(name));
  await page.waitForSelector('.file-item, .notice--error, .preview-head', { timeout: 15_000 });
}

export async function openWorkspace(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /打开工作台|Open workspace/ }).first().click();
  await page.waitForSelector('.workspace', { timeout: 10_000 });
}

/** Asserts the document never scrolls horizontally (a classic mobile bug). */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      bodyScroll: document.body.scrollWidth,
    };
  });
  if (overflow.scrollWidth > overflow.clientWidth + 1 || overflow.bodyScroll > overflow.clientWidth + 1) {
    throw new Error(`horizontal overflow: ${JSON.stringify(overflow)}`);
  }
}
