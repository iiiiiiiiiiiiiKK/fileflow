import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import { cellPreview, describeCellType } from '../lib/infer';
import { LIMITS } from '../lib/limits';
import type { CellValue, Dataset, ViewState } from '../lib/types';

export interface DataTableProps {
  dataset: Dataset;
  view: ViewState;
  rows: CellValue[][];
  indexes: number[];
  total: number;
  onSort: (columnId: string, direction: 'asc' | 'desc') => void;
  onClearSort: () => void;
  onClearSearch: () => void;
  selected: Set<number>;
  onToggleRow: (index: number) => void;
  onToggleAll: (checked: boolean) => void;
  onPageChange: (page: number) => void;
}

const DEFAULT_WIDTH = 168;
const MIN_WIDTH = 72;
const MAX_WIDTH = 560;

export function DataTable({
  dataset,
  view,
  rows,
  indexes,
  total,
  onSort,
  onClearSort,
  onClearSearch,
  selected,
  onToggleRow,
  onToggleAll,
  onPageChange,
}: DataTableProps) {
  const { t } = useI18n();
  const [widths, setWidths] = useState<Record<string, number>>({});
  const dragState = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);

  const pageSize = LIMITS.pageSize;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(view.page, pageCount - 1);
  const start = page * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  useEffect(() => {
    if (view.page !== page) onPageChange(page);
  }, [page, view.page, onPageChange]);

  const visibleColumns = useMemo(
    () => dataset.columns.map((column, index) => ({ column, index })).filter((entry) => !entry.column.hidden),
    [dataset.columns],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const state = dragState.current;
      if (!state) return;
      const delta = event.clientX - state.startX;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, state.startWidth + delta));
      setWidths((current) => ({ ...current, [state.columnId]: next }));
    };
    const onUp = () => {
      dragState.current = null;
      document.body.classList.remove('is-resizing');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const allVisibleSelected = pageRows.length > 0 && pageRows.every((_, offset) => selected.has(indexes[start + offset] ?? -1));

  const sortColumn = view.sort ? dataset.columns.find((column) => column.id === view.sort?.columnId) ?? null : null;

  return (
    <div className="data-table" aria-label={t('a11y.tableRegion')} role="region" tabIndex={0}>
      <div className="data-table__scroll">
        <table className="data-table__table">
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 56 }} />
            {visibleColumns.map(({ column }) => (
              <col key={column.id} style={{ width: widths[column.id] ?? DEFAULT_WIDTH }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="data-table__cell data-table__cell--check" scope="col">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  aria-label={t('common.selectAll')}
                  onChange={(event) => onToggleAll(event.target.checked)}
                />
              </th>
              <th className="data-table__cell data-table__cell--index" scope="col">
                #
              </th>
              {visibleColumns.map(({ column }) => {
                const active = view.sort?.columnId === column.id;
                return (
                  <th key={column.id} className={`data-table__cell data-table__cell--head${active ? ' is-sorted' : ''}`} scope="col">
                    <button
                      type="button"
                      className="data-table__sort"
                      onClick={() => {
                        if (!active) onSort(column.id, 'asc');
                        else if (view.sort?.direction === 'asc') onSort(column.id, 'desc');
                        else onClearSort();
                      }}
                      title={active && view.sort?.direction === 'asc' ? t('common.sortDesc') : t('common.sortAsc')}
                    >
                      <span className="data-table__name">{column.name}</span>
                      <span className={`data-table__sort-icon${active ? ' is-active' : ''}`} aria-hidden="true">
                        <Icon name={active && view.sort?.direction === 'desc' ? 'arrowDown' : 'arrowUp'} size={12} />
                      </span>
                    </button>
                    <span
                      className="data-table__resizer"
                      role="separator"
                      aria-hidden="true"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        dragState.current = {
                          columnId: column.id,
                          startX: event.clientX,
                          startWidth: widths[column.id] ?? DEFAULT_WIDTH,
                        };
                        document.body.classList.add('is-resizing');
                      }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, offset) => {
              const rowIndex = indexes[start + offset] ?? start + offset;
              const isSelected = selected.has(rowIndex);
              return (
                <tr key={rowIndex} className={isSelected ? 'is-selected' : undefined}>
                  <td className="data-table__cell data-table__cell--check">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      aria-label={`${t('common.rows')} ${rowIndex + 1}`}
                      onChange={() => onToggleRow(rowIndex)}
                    />
                  </td>
                  <td className="data-table__cell data-table__cell--index">{rowIndex + 1}</td>
                  {visibleColumns.map(({ column, index }) => {
                    const value = row[index];
                    const kind = describeCellType(value);
                    return (
                      <td
                        key={column.id}
                        className={`data-table__cell data-table__cell--${kind}`}
                        title={kind === 'structured' ? cellPreview(value, 240) : undefined}
                      >
                        {kind === 'empty' ? (
                          <span className="data-table__empty">·</span>
                        ) : kind === 'null' ? (
                          <span className="data-table__null">null</span>
                        ) : kind === 'structured' ? (
                          <span className="data-table__json">{cellPreview(value, LIMITS.cellPreviewChars)}</span>
                        ) : (
                          cellPreview(value, LIMITS.cellPreviewChars)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td className="data-table__cell data-table__cell--empty" colSpan={visibleColumns.length + 2}>
                  {t('workspace.noRowsMatch')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="data-table__footer">
        <span className="data-table__count">
          {rows.length === 0
            ? t('workspace.matchingRows', { total: 0 })
            : t('workspace.showingRows', {
                from: start + 1,
                to: Math.min(start + pageSize, rows.length),
                total: rows.length,
              })}
          {total !== rows.length && rows.length > 0 ? ` · ${t('common.of', { total: Math.ceil(total / pageSize) })}` : ''}
        </span>
        {view.search.trim() !== '' && (
          <button type="button" className="chip chip--button" onClick={onClearSearch}>
            {view.filterColumnId
              ? t('workspace.filteredInColumn', {
                  column: dataset.columns.find((column) => column.id === view.filterColumnId)?.name ?? '',
                  term: view.search.trim(),
                })
              : t('workspace.filteredBy', { term: view.search.trim() })}
            <Icon name="close" size={11} />
          </button>
        )}
        {sortColumn && (
          <button type="button" className="chip chip--button" onClick={onClearSort}>
            {t('workspace.sortedBy', {
              column: sortColumn.name,
              direction: view.sort?.direction === 'asc' ? '↑' : '↓',
            })}
            <Icon name="close" size={11} />
          </button>
        )}
        {pageCount > 1 && (
          <div className="pager">
            <button type="button" className="pager__button" onClick={() => onPageChange(page - 1)} disabled={page === 0} aria-label={t('common.prevPage')}>
              <Icon name="chevronLeft" size={14} />
            </button>
            <span className="pager__label">
              {t('common.page', { page: page + 1 })}
              {t('common.of', { total: pageCount })}
            </span>
            <button
              type="button"
              className="pager__button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount - 1}
              aria-label={t('common.nextPage')}
            >
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
