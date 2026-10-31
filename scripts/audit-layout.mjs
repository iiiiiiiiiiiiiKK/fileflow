/**
 * Layout + contrast audit.
 *
 * I cannot look at pixels, so this script verifies the things a reviewer would
 * look for: nothing wider than the viewport, no overlapping header actions,
 * readable sizes, WCAG AA contrast for text tokens, and tap targets on phones.
 *
 * Usage: node scripts/audit-layout.mjs [baseUrl]
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? process.env.BASE_URL ?? 'http://127.0.0.1:4273/';
const FIXTURES = resolve(process.cwd(), 'e2e', 'fixtures');

function fixture(name) {
  return { name, mimeType: 'text/csv', buffer: readFileSync(resolve(FIXTURES, name)) };
}

/* --------------------------------------------------------------- contrast */

function srgbToLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const problems = [];

function check(label, condition, detail) {
  if (!condition) problems.push(`${label}: ${detail}`);
}

async function auditContrast(page, theme) {
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name) => {
      const value = style.getPropertyValue(name).trim();
      // Tokens may be colours or rgb() strings after resolution.
      if (value.startsWith('#')) return value;
      const probe = document.createElement('div');
      probe.style.color = value;
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(resolved);
      return match ? `#${[1, 2, 3].map((i) => Number(match[i]).toString(16).padStart(2, '0')).join('')}` : null;
    };
    return {
      bg: read('--bg'),
      surface: read('--surface'),
      surface2: read('--surface-2'),
      text: read('--text'),
      soft: read('--text-soft'),
      muted: read('--text-muted'),
      faint: read('--text-faint'),
      accent: read('--accent'),
      accentSoft: read('--accent-soft'),
    };
  });

  const pairs = [
    ['text on bg', tokens.text, tokens.bg, 4.5],
    ['text-soft on surface', tokens.soft, tokens.surface, 4.5],
    ['text-muted on bg', tokens.muted, tokens.bg, 4.5],
    ['text-muted on surface-2', tokens.muted, tokens.surface2, 4.5],
    ['text-faint on surface-2', tokens.faint, tokens.surface2, 4.5],
    ['text-faint on bg', tokens.faint, tokens.bg, 4.5],
    ['accent on bg', tokens.accent, tokens.bg, 4.5],
    ['accent on accent-soft', tokens.accent, tokens.accentSoft, 4.5],
  ];

  const report = pairs.map(([label, fg, bg, min]) => {
    const ratio = contrast(fg, bg);
    check(`${theme} contrast ${label}`, ratio >= min, `${ratio.toFixed(2)} < ${min} (${fg} on ${bg})`);
    return `${label.padEnd(28)} ${ratio.toFixed(2)}`;
  });
  return report;
}

async function auditViewport(page, width, label) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
  const report = await page.evaluate((w) => {
    const issues = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      const offenders = [...document.querySelectorAll('body *')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.right > w + 1 || rect.left < -1);
        })
        .slice(0, 6)
        .map((element) => `${element.tagName.toLowerCase()}.${(element.className || '').toString().split(' ')[0]} right=${Math.round(element.getBoundingClientRect().right)}`);
      issues.push(`horizontal overflow ${doc.scrollWidth} > ${doc.clientWidth}: ${offenders.join(', ')}`);
    }

    const header = document.querySelector('.site-header__inner');
    if (header) {
      const rect = header.getBoundingClientRect();
      if (rect.right > w + 1) issues.push(`header overflows: ${Math.round(rect.right)}`);
    }

    // Header actions must not overlap each other.
    const actions = [...document.querySelectorAll('.site-header__actions > *')]
      .map((element) => ({
        name: element.className.toString().split(' ')[0],
        ...element.getBoundingClientRect().toJSON(),
      }))
      .filter((box) => box.width > 0 && box.height > 0);
    for (let i = 1; i < actions.length; i += 1) {
      const prev = actions[i - 1];
      const current = actions[i];
      if (current.left < prev.right - 0.6) {
        issues.push(`header actions overlap: ${prev.name} / ${current.name}`);
      }
    }

    // Readable type sizes.
    const bodyFont = parseFloat(getComputedStyle(document.body).fontSize);
    if (bodyFont < 13) issues.push(`body font too small: ${bodyFont}`);
    for (const selector of ['.file-item__meta', '.data-table__cell', '.panel-note']) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const size = parseFloat(getComputedStyle(element).fontSize);
      if (size < 10) issues.push(`${selector} font too small: ${size}`);
    }

    // Touch targets for anything that looks like a primary control.
    if (w < 900) {
      for (const element of document.querySelectorAll('.btn, .mobile-tabs__item, .tool-button, .icon-button')) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0) continue;
        if (rect.height < 26) issues.push(`small tap target ${element.className.toString().split(' ')[0]}: ${Math.round(rect.height)}px`);
      }
    }
    return issues;
  }, width);

  for (const issue of report) problems.push(`${label}@${width}: ${issue}`);

  // Header must stay inside the viewport and stay sticky.
  const headerBox = await page.locator('.site-header').boundingBox();
  check(`${label}@${width} header box`, Boolean(headerBox) && headerBox.height >= 44, JSON.stringify(headerBox));
  const authorVisible = await page.locator('.site-header .author-link').isVisible();
  check(`${label}@${width} author link`, authorVisible, 'author link is not visible');
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await context.newPage();

  await page.goto(BASE);
  await page.waitForSelector('.hero__title');

  const lightContrast = await auditContrast(page, 'light');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await auditViewport(page, width, 'home');
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('input[type="file"]').first().setInputFiles(fixture('people.csv'));
  await page.waitForSelector('.data-table');
  await page.waitForTimeout(300);

  for (const width of [390, 768, 1440]) {
    await auditViewport(page, width, 'workspace');
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.site-header__actions .icon-button').last().click();
  await page.waitForTimeout(250);
  const darkContrast = await auditContrast(page, 'dark');
  await auditViewport(page, 1440, 'workspace-dark');

  // Sticky header + sticky table header behaviour.
  const sticky = await page.evaluate(() => {
    const header = document.querySelector('.site-header');
    const tableHead = document.querySelector('.data-table__table thead th');
    return {
      headerPosition: header ? getComputedStyle(header).position : null,
      tableHeadPosition: tableHead ? getComputedStyle(tableHead).position : null,
      rowHeight: (() => {
        const cell = document.querySelector('.data-table tbody .data-table__cell');
        return cell ? Math.round(cell.getBoundingClientRect().height) : null;
      })(),
    };
  });
  check('sticky header', sticky.headerPosition === 'sticky', String(sticky.headerPosition));
  check('sticky table head', sticky.tableHeadPosition === 'sticky', String(sticky.tableHeadPosition));

  await browser.close();

  console.log('--- contrast (light) ---');
  lightContrast.forEach((line) => console.log(line));
  console.log('--- contrast (dark) ---');
  darkContrast.forEach((line) => console.log(line));
  console.log('--- layout ---');
  console.log(JSON.stringify(sticky, null, 2));

  if (problems.length > 0) {
    console.log(`\n${problems.length} problem(s):`);
    problems.forEach((problem) => console.log(` - ${problem}`));
    process.exit(1);
  }
  console.log('\nlayout audit passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
