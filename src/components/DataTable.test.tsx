import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';
import { I18nProvider } from '../i18n';
import { makeColumns } from '../lib/parse';
import type { ViewState } from '../lib/types';

const rows = Array.from({ length: 150 }, (_, index) => [index + 1, `name-${index + 1}`, index % 2 === 0] as const).map((row) => [
  row[0],
  row[1],
  row[2],
]);

const dataset = { columns: makeColumns(['id', 'name', 'active']), rows };

function renderTable(overrides: Partial<Parameters<typeof DataTable>[0]> = {}) {
  const props = {
    dataset,
    view: { search: '', filterColumnId: null, sort: null, page: 0 } as ViewState,
    rows,
    indexes: rows.map((_, index) => index),
    total: rows.length,
    onSort: vi.fn(),
    onClearSort: vi.fn(),
    onClearSearch: vi.fn(),
    selected: new Set<number>(),
    onToggleRow: vi.fn(),
    onToggleAll: vi.fn(),
    onPageChange: vi.fn(),
    ...overrides,
  };
  const result = render(
    <I18nProvider>
      <DataTable {...props} />
    </I18nProvider>,
  );
  return { ...result, props };
}

function headerButton(name: RegExp) {
  const headers = screen.getAllByRole('columnheader');
  const header = headers.find((element) => name.test(element.textContent ?? ''));
  if (!header) throw new Error(`no header matching ${name}`);
  return within(header).getByRole('button');
}

describe('DataTable', () => {
  it('renders the header row and one page of data', () => {
    renderTable();
    expect(headerButton(/name/)).toBeInTheDocument();
    expect(screen.getByText('name-1')).toBeInTheDocument();
    // 100 rows per page
    expect(screen.getByText('name-100')).toBeInTheDocument();
    expect(screen.queryByText('name-101')).toBeNull();
  });

  it('shows the row count and does not page backwards from the first page', async () => {
    const user = userEvent.setup();
    const { props } = renderTable();
    expect(screen.getByText(/1–100/)).toBeInTheDocument();
    const pager = screen.getAllByRole('button').filter((button) => button.getAttribute('aria-label')?.match(/上一页|Previous/));
    expect(pager).toHaveLength(1);
    await user.click(pager[0]);
    expect(props.onPageChange).not.toHaveBeenCalled(); // disabled on page 0
  });

  it('asks for a sort when a header is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderTable();
    await user.click(headerButton(/name/));
    expect(props.onSort).toHaveBeenCalledWith(dataset.columns[1].id, 'asc');
  });

  it('requests a descending sort when the same header is clicked twice', async () => {
    const user = userEvent.setup();
    const { props } = renderTable({
      view: { search: '', filterColumnId: null, sort: { columnId: dataset.columns[1].id, direction: 'asc' }, page: 0 },
    });
    await user.click(headerButton(/name/));
    expect(props.onSort).toHaveBeenCalledWith(dataset.columns[1].id, 'desc');
  });

  it('toggles row selection', async () => {
    const user = userEvent.setup();
    const { props } = renderTable();
    const boxes = screen.getAllByRole('checkbox');
    await user.click(boxes[1]);
    expect(props.onToggleRow).toHaveBeenCalledWith(0);
  });

  it('renders an empty state when the filter matches nothing', () => {
    renderTable({ rows: [], indexes: [], total: 150 });
    expect(screen.getByText(/No rows match|没有匹配的行/)).toBeInTheDocument();
  });

  it('marks empty and null cells distinctly', () => {
    const mixed = [[null, '', 0]];
    renderTable({
      dataset: { columns: makeColumns(['a', 'b', 'c']), rows: mixed },
      rows: mixed,
      indexes: [0],
      total: 1,
    });
    expect(screen.getByText('null')).toBeInTheDocument();
  });
});
