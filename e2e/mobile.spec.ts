import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, importFixture } from './helpers';

test.describe('mobile landing', () => {
  test('fits the viewport and keeps the author link reachable', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero__title')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const author = page.locator('.site-header .author-link');
    await expect(author).toBeVisible();
    await expect(author).toHaveAttribute('href', 'https://x.com/0xkillcoin');
    // The handle collapses to an icon on small screens, the hit area stays tappable.
    const box = await author.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(28);

    await expect(page.locator('.dropzone')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('stacks the feature grid into a single column', async ({ page }) => {
    await page.goto('/');
    const first = await page.locator('.feature').first().boundingBox();
    const second = await page.locator('.feature').nth(1).boundingBox();
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 2);
  });

  test('keeps primary actions large enough for touch', async ({ page }) => {
    await page.goto('/');
    const dropzone = await page.locator('.dropzone').boundingBox();
    expect(dropzone!.width).toBeGreaterThan(240);
  });
});

test.describe('mobile workspace', () => {
  test('uses bottom tabs and shows the data', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');

    const tabs = page.locator('.mobile-tabs');
    await expect(tabs).toBeVisible();
    await expect(tabs.locator('.mobile-tabs__item')).toHaveCount(4);

    // Data tab is the default view after importing.
    await expect(page.locator('.preview-head__title h2')).toHaveText('people.csv');
    await expect(page.locator('.data-table')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // The table itself scrolls sideways inside its own container.
    const scrollable = await page.locator('.data-table__scroll').evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(scrollable).toBe(true);
  });

  test('navigates files, tools and details through the tabs', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');

    await page.locator('.mobile-tabs__item', { hasText: '文件' }).click();
    await expect(page.locator('.file-item')).toHaveCount(1);
    await expect(page.locator('.pane__tools')).toBeVisible();

    await page.locator('.mobile-tabs__item', { hasText: '工具' }).click();
    await page.locator('.tool-button', { hasText: '格式转换' }).click();
    await expect(page.locator('.code-preview')).toContainText('"id": 1');
    await expectNoHorizontalOverflow(page);

    await page.locator('.mobile-tabs__item', { hasText: '详情' }).click();
    await expect(page.locator('.panel-tabs')).toBeVisible();
    await page.locator('.panel-tabs__item', { hasText: '统计' }).click();
    await expect(page.locator('.stat-grid')).toContainText('总行数');

    await page.locator('.mobile-tabs__item', { hasText: '数据' }).click();
    await expect(page.locator('.data-table')).toBeVisible();
  });

  test('filters on mobile without breaking the layout', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');
    await page.locator('.search-field input').fill('ada');
    await expect(page.locator('.data-table__count')).toContainText('共 1 行');
    await expectNoHorizontalOverflow(page);
  });

  test('converts and downloads on mobile', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');
    await page.locator('.mobile-tabs__item', { hasText: '工具' }).click();
    await page.locator('.tool-button', { hasText: '格式转换' }).click();
    await page.locator('.segmented__item', { hasText: 'JSONL' }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '下载结果' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('people.jsonl');
  });

  test('switches to the English UI on mobile', async ({ page }) => {
    await page.goto('/');
    await page.locator('.lang-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await importFixture(page, 'people.csv');
    await expect(page.locator('.mobile-tabs__item').first()).toContainText('Files');
    await expectNoHorizontalOverflow(page);
  });
});
