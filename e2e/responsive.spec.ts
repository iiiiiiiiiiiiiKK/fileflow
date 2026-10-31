import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, importFixture } from './helpers';

const WIDTHS = [320, 360, 390, 414, 480, 768, 900, 1024, 1280, 1920];

test.describe('responsive matrix', () => {
  for (const width of WIDTHS) {
    test(`landing and workspace fit ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.locator('.hero__title')).toBeVisible();
      await expect(page.locator('.site-header .author-link')).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await importFixture(page, 'people.csv');
      await expect(page.locator('.preview-head__title h2')).toHaveText('people.csv');
      await expectNoHorizontalOverflow(page);

      // The primary toolbar actions must be reachable without side scrolling.
      const undo = page.getByRole('button', { name: '撤销' });
      await expect(undo).toBeVisible();
      const box = await undo.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    });
  }

  test('switches between the three column layout and the mobile shell', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await importFixture(page, 'people.csv');
    await expect(page.locator('.workspace__rail')).toBeVisible();
    await expect(page.locator('.mobile-tabs')).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.mobile-tabs')).toBeVisible();
    await expect(page.locator('.workspace__rail')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('keeps the JSON tree inside the viewport on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/');
    await importFixture(page, 'nested.json');
    await expect(page.locator('.json-view__tree')).toContainText('project');
    await expectNoHorizontalOverflow(page);
  });
});
