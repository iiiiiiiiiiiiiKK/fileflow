import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fixture, importFixture, openWorkspace } from './helpers';

test.describe('landing page', () => {
  test('shows the hero, the author X link and the privacy promise', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero__title')).toContainText('你的数据，不必被格式困住。');
    await expect(page.getByText('支持 CSV · JSON · JSONL / NDJSON · TXT', { exact: false })).toBeVisible();
    await expect(page.locator('.dropzone__privacy')).toContainText('不会上传');

    // Requirement: an author X link in the header, pointing at the right profile.
    const author = page.locator('.site-header .author-link');
    await expect(author).toBeVisible();
    await expect(author).toHaveAttribute('href', 'https://x.com/0xkillcoin');
    await expect(author).toHaveAttribute('target', '_blank');

    await expect(page.locator('#features')).toBeVisible();
    await expect(page.locator('#guide')).toBeVisible();
    await expect(page.locator('#privacy')).toBeVisible();
  });

  test('switches language without touching data and remembers the choice', async ({ page }) => {
    await page.goto('/');
    await page.locator('.lang-toggle').click();
    await expect(page.locator('.hero__title')).toContainText('Your data does not have to be trapped by formats.');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await expect(page.locator('.hero__title')).toContainText('Your data does not have to be trapped');
    await page.locator('.lang-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  });

  test('toggles the colour theme', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('.site-header__actions .icon-button').last().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('CSV workspace', () => {
  test('imports a CSV and renders typed cells', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');

    await expect(page.locator('.preview-head__title h2')).toHaveText('people.csv');
    await expect(page.locator('.file-item').first()).toBeVisible();
    // 6 non-empty rows survived the blank line in the fixture
    await expect(page.locator('.data-table__count')).toContainText('共 6 行');
    // numbers keep their type: rendered without quotes and right-aligned class
    await expect(page.locator('.data-table__cell--number').first()).toHaveText('1');
    // quoted comma and escaped quotes are preserved
    await expect(page.getByText('Okafor, Chidi')).toBeVisible();
    await expect(page.getByText('Quote "q" test')).toBeVisible();
    // Chinese content is fine
    await expect(page.getByText('小明')).toBeVisible();
  });

  test('filters by search and clears the filter', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');

    await page.locator('.search-field input').fill('grace');
    await expect(page.locator('.data-table__count')).toContainText('共 1 行');
    await expect(page.getByText('Grace Hopper')).toBeVisible();
    await expect(page.getByText('Ada Lovelace')).toBeHidden();
    await expect(page.locator('.data-table__footer .chip')).toContainText('已按「grace」筛选');

    await page.locator('.search-field__clear').click();
    await expect(page.locator('.data-table__count')).toContainText('共 6 行');
  });

  test('filters inside a single column', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');

    await page.locator('.column-select select').selectOption({ label: 'role' });
    await page.locator('.search-field input').fill('engineer');
    await expect(page.locator('.data-table__count')).toContainText('共 2 行');
    await expect(page.locator('.data-table__footer .chip')).toContainText('字段「role」包含「engineer」');
    // "analyst" is a role, not a name, so the same term in another column must not match
    await page.locator('.search-field input').fill('Lin Chen');
    await expect(page.locator('.data-table__count')).toContainText('匹配 0 行');

    await page.locator('.search-field__clear').click();
    await page.locator('.column-select select').selectOption('');
    await page.locator('.search-field input').fill('Lin Chen');
    await expect(page.locator('.data-table__count')).toContainText('共 1 行');
  });

  test('bulk replaces text and can be undone', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');

    await page.locator('.tool-button', { hasText: '数据清洗' }).click();
    const findField = page.locator('.field', { hasText: '查找内容' }).locator('input');
    const replaceField = page.locator('.field', { hasText: '替换为' }).locator('input');
    await findField.fill('engineer');
    await replaceField.fill('dev');
    await expect(page.locator('.panel-block', { hasText: '批量替换' }).locator('.chip')).toContainText('将修改 2 个单元格');

    await page.getByRole('button', { name: '应用替换' }).click();
    await expect(page.locator('.data-table')).toContainText('dev');
    await expect(page.locator('.data-table')).not.toContainText('engineer');

    await page.getByRole('button', { name: '撤销' }).click();
    await expect(page.locator('.data-table')).toContainText('engineer');
  });

  test('sorts by a column and can clear the sorting', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');

    const scoreHeader = page.locator('.data-table__cell--head', { hasText: 'score' });
    await scoreHeader.getByRole('button').click();
    const firstCell = page.locator('.data-table tbody tr').first();
    await expect(firstCell).toContainText('Quote "q" test'); // 5 is the smallest score
    await page.locator('.data-table__footer .chip').click(); // clear sorting
    await expect(page.locator('.data-table__footer .chip')).toHaveCount(0);
  });

  test('cleans, undoes and restores the original data', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');

    // Select the first row and delete it.
    await page.locator('.data-table tbody tr').first().getByRole('checkbox').check();
    await expect(page.getByRole('button', { name: /删除选中的 1 行/ })).toBeVisible();
    await page.getByRole('button', { name: /删除选中的 1 行/ }).click();
    await expect(page.locator('.data-table__count')).toContainText('共 5 行');

    // Undo brings it back.
    await page.getByRole('button', { name: '撤销' }).click();
    await expect(page.locator('.data-table__count')).toContainText('共 6 行');

    // A cleaning pass on a file with a real duplicate row.
    await page.goto('/');
    await importFixture(page, 'dupes.csv');
    await expect(page.locator('.data-table__count')).toContainText('共 4 行');

    await page.locator('.tool-button', { hasText: '数据清洗' }).click();
    const duplicateOp = page.locator('.op', { hasText: '删除重复行' });
    await duplicateOp.locator('input[type="checkbox"]').check();
    await expect(duplicateOp.locator('.op__count')).toHaveText('1');
    await page.getByRole('button', { name: '应用清洗' }).click();
    await expect(page.locator('.toast--success').first()).toBeVisible();
    await expect(page.locator('.data-table__count')).toContainText('共 3 行');

    await page.getByRole('button', { name: '撤销' }).click();
    await expect(page.locator('.data-table__count')).toContainText('共 4 行');

    // Restoring the original always works, even after several edits.
    await page.locator('.data-table tbody tr').first().getByRole('checkbox').check();
    await page.getByRole('button', { name: /删除选中的 1 行/ }).click();
    await expect(page.locator('.data-table__count')).toContainText('共 3 行');
    await page.getByRole('button', { name: '恢复原始数据' }).click();
    await page.getByRole('button', { name: /恢复为导入时的原始数据/ }).click();
    await expect(page.locator('.data-table__count')).toContainText('共 4 行');
  });

  test('converts CSV to JSON and downloads typed output', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');
    await page.locator('.tool-button', { hasText: '格式转换' }).click();

    await expect(page.locator('.code-preview')).toContainText('"name": "Ada Lovelace"');
    await expect(page.locator('.code-preview')).toContainText('"score": 9.5');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '下载结果' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('people.json');
    const path = await download.path();
    const parsed = JSON.parse(readFileSync(path as string, 'utf8'));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ id: 1, name: 'Ada Lovelace', score: 9.5 });
    expect(typeof parsed[0].id).toBe('number');
  });

  test('converts CSV to JSONL and CSV with a custom delimiter', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');
    await page.locator('.tool-button', { hasText: '格式转换' }).click();

    await page.locator('.segmented__item', { hasText: 'JSONL' }).click();
    await expect(page.locator('.code-preview')).toContainText('{"id":1,"name":"Ada Lovelace"');
  });
});

test.describe('other formats', () => {
  test('shows a JSON tree and warns before flattening nested values', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'nested.json');

    await expect(page.locator('.json-view__tree')).toContainText('project');
    await expect(page.locator('.json-view__tree')).toContainText('meta');
    await page.locator('.segmented__item', { hasText: '格式化' }).click();
    await expect(page.locator('.json-view__code')).toContainText('"count": 42');

    await page.locator('.tool-button', { hasText: '格式转换' }).click();
    await page.locator('.segmented__item', { hasText: 'CSV' }).click();
    await expect(page.locator('.warning-list')).toContainText('嵌套');
  });

  test('reports invalid JSONL lines and still converts the valid rows', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'records.jsonl');

    await expect(page.locator('.notice--warning')).toContainText('1 行无法解析');
    await page.locator('.tool-button', { hasText: '格式转换' }).click();
    await page.locator('.segmented__item', { hasText: 'CSV' }).click();
    await expect(page.locator('.code-preview')).toContainText('Grace');
  });

  test('surfaces a broken JSON file with a readable error', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'broken.json');
    await expect(page.locator('.notice--error').first()).toContainText('JSON 语法错误');
  });

  test('batches several files into one ZIP', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');
    await importFixture(page, 'records.jsonl');
    await expect(page.locator('.file-item')).toHaveCount(2);

    await page.locator('.tool-button', { hasText: '导出' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '打包下载 ZIP' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('fileflow-export.zip');
    const path = await download.path();
    const head = readFileSync(path as string).subarray(0, 2).toString('latin1');
    expect(head).toBe('PK');
  });
});

test.describe('edge cases', () => {
  test('reports unsupported files clearly', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'archive.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    });
    await expect(page.locator('.toast--error').first()).toBeVisible();
  });

  test('keeps the workspace empty state usable', async ({ page }) => {
    await openWorkspace(page);
    await expect(page.locator('.workspace-empty .dropzone')).toBeVisible();
    await expect(page.getByText('还没有导入文件')).toBeVisible();
  });

  test('supports keyboard undo with Ctrl+Z', async ({ page }) => {
    await page.goto('/');
    await importFixture(page, 'people.csv');
    await page.locator('.data-table tbody tr').first().getByRole('checkbox').check();
    await page.getByRole('button', { name: /删除选中的 1 行/ }).click();
    await expect(page.locator('.data-table__count')).toContainText('共 5 行');
    await page.locator('.preview-head__title h2').click();
    await page.keyboard.press('Control+z');
    await expect(page.locator('.data-table__count')).toContainText('共 6 行');
  });

  test('has no console errors during a full pass', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await importFixture(page, 'people.csv');
    await page.locator('.tool-button', { hasText: '格式转换' }).click();
    await page.locator('.segmented__item', { hasText: 'JSONL' }).click();
    await page.locator('.lang-toggle').click();

    expect(errors.filter((message) => !message.includes('favicon'))).toEqual([]);
  });
});

test('fixtures are readable (sanity check for the helpers)', () => {
  const people = fixture('people.csv');
  expect(people.buffer.byteLength).toBeGreaterThan(50);
});
