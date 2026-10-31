import { cellToText, isStructured, normaliseForMatch } from './infer';
import { makeColumns } from './parse';
import type { CellValue, Column, Dataset, ViewState } from './types';

/* ------------------------------------------------------------------ helpers */

export function cloneDataset(dataset: Dataset): Dataset {
  return {
    columns: dataset.columns.map((column) => ({ ...column })),
    rows: dataset.rows.map((row) => row.slice()),
  };
}

export function columnIndex(dataset: Dataset, columnId: string): number {
  return dataset.columns.findIndex((column) => column.id === columnId);
}

/** Column indexes that are not hidden, in display order. */
export function visibleColumnIndexes(dataset: Dataset): number[] {
  const result: number[] = [];
  dataset.columns.forEach((column, index) => {
    if (!column.hidden) result.push(index);
  });
  return result;
}

export function selectedColumnIndexes(dataset: Dataset): number[] {
  const result: number[] = [];
  dataset.columns.forEach((column, index) => {
    if (column.selected && !column.hidden) result.push(index);
  });
  return result;
}

export function isBlankRow(row: CellValue[]): boolean {
  return row.every((cell) => cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === ''));
}

export function rowKey(row: CellValue[], indexes: number[]): string {
  return indexes.map((index) => normaliseForMatch(row[index])).join('\u0001');
}

/* --------------------------------------------------------------- comparison */

export function compareCells(a: CellValue | undefined, b: CellValue | undefined): number {
  const aBlank = a === null || a === undefined || a === '';
  const bBlank = b === null || b === undefined || b === '';
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1; // blanks always sort last
  if (bBlank) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (typeof a !== typeof b) {
    const rank = (value: CellValue) => (typeof value === 'number' ? 0 : typeof value === 'boolean' ? 1 : typeof value === 'string' ? 2 : 3);
    return rank(a) - rank(b);
  }
  return cellToText(a).localeCompare(cellToText(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Comparator used by every sort in the app.
 * Empty values stay at the bottom in both directions, which is what people
 * expect when they flip a column.
 */
export function rowComparator(index: number, direction: 'asc' | 'desc') {
  return (left: CellValue[], right: CellValue[]): number => {
    const a = left[index];
    const b = right[index];
    const aBlank = a === null || a === undefined || a === '';
    const bBlank = b === null || b === undefined || b === '';
    if (aBlank && bBlank) return 0;
    if (aBlank) return 1;
    if (bBlank) return -1;
    const result = compareCells(a, b);
    return direction === 'asc' ? result : -result;
  };
}

export function sortRows(rows: CellValue[][], index: number, direction: 'asc' | 'desc'): CellValue[][] {
  return rows.slice().sort(rowComparator(index, direction));
}

/* ------------------------------------------------------------- view pipeline */

export interface VisibleResult {
  rows: CellValue[][];
  /** Row indexes in the source dataset, in display order. */
  indexes: number[];
  filtered: boolean;
  sorted: boolean;
}

export function matchesSearch(row: CellValue[], term: string, indexes?: number[]): boolean {
  if (!term) return true;
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const columns = indexes ?? row.map((_, index) => index);
  return columns.some((index) => cellToText(row[index]).toLowerCase().includes(needle));
}

export function computeVisible(dataset: Dataset, view: ViewState): VisibleResult {
  let entries = dataset.rows.map((row, index) => ({ row, index }));
  let filtered = false;
  const term = view.search.trim();
  if (term) {
    filtered = true;
    const filterIndex = view.filterColumnId ? columnIndex(dataset, view.filterColumnId) : -1;
    if (filterIndex >= 0) {
      const needle = term.toLowerCase();
      entries = entries.filter((entry) => cellToText(entry.row[filterIndex]).toLowerCase().includes(needle));
    } else {
      entries = entries.filter((entry) => matchesSearch(entry.row, view.search));
    }
  }
  let sorted = false;
  if (view.sort) {
    const index = columnIndex(dataset, view.sort.columnId);
    if (index >= 0) {
      sorted = true;
      entries.sort((left, right) => rowComparator(index, view.sort?.direction ?? 'asc')(left.row, right.row));
    }
  }
  return {
    rows: entries.map((entry) => entry.row),
    indexes: entries.map((entry) => entry.index),
    filtered,
    sorted,
  };
}

/* ------------------------------------------------------------- row operations */

export interface OpResult {
  dataset: Dataset;
  /** i18n key + numeric count describing what changed. */
  count: number;
  /** Number of rows removed / cells changed. */
  detail?: string;
}

export function removeBlankRows(dataset: Dataset): OpResult {
  const rows = dataset.rows.filter((row) => !isBlankRow(row));
  return { dataset: { ...dataset, rows }, count: dataset.rows.length - rows.length };
}

export function removeEmptyColumns(dataset: Dataset): OpResult {
  const keep: number[] = [];
  dataset.columns.forEach((_column, index) => {
    const empty = dataset.rows.every((row) => {
      const cell = row[index];
      return cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '');
    });
    if (!empty) keep.push(index);
  });
  const removed = dataset.columns.length - keep.length;
  if (removed === 0) return { dataset, count: 0 };
  return {
    dataset: {
      columns: keep.map((index) => ({ ...dataset.columns[index] })),
      rows: dataset.rows.map((row) => keep.map((index) => row[index])),
    },
    count: removed,
  };
}

/**
 * Resolves the columns a duplicate check should compare.
 * An empty or unknown selection falls back to "every column" instead of
 * comparing nothing (which would collapse the whole table into one row).
 */
function resolveSubset(dataset: Dataset, subset?: string[]): number[] {
  if (subset && subset.length > 0) {
    const indexes = subset.map((id) => columnIndex(dataset, id)).filter((index) => index >= 0);
    if (indexes.length > 0) return indexes;
  }
  return dataset.columns.map((_, index) => index);
}

export function findDuplicateRowIndexes(dataset: Dataset, subset?: string[]): number[] {
  const indexes = resolveSubset(dataset, subset);
  const seen = new Set<string>();
  const duplicates: number[] = [];
  dataset.rows.forEach((row, index) => {
    const key = rowKey(row, indexes);
    if (seen.has(key)) duplicates.push(index);
    else seen.add(key);
  });
  return duplicates;
}

export function countDuplicateRows(dataset: Dataset): number {
  return findDuplicateRowIndexes(dataset).length;
}

export function removeDuplicateRows(dataset: Dataset, subset?: string[]): OpResult {
  const indexes = resolveSubset(dataset, subset);
  const seen = new Set<string>();
  const rows: CellValue[][] = [];
  dataset.rows.forEach((row) => {
    const key = rowKey(row, indexes);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  });
  return { dataset: { ...dataset, rows }, count: dataset.rows.length - rows.length };
}

export function removeRowsAt(dataset: Dataset, rowIndexes: number[]): OpResult {
  const drop = new Set(rowIndexes);
  const rows = dataset.rows.filter((_, index) => !drop.has(index));
  return { dataset: { ...dataset, rows }, count: dataset.rows.length - rows.length };
}

/* ---------------------------------------------------------- column operations */

export function removeColumns(dataset: Dataset, columnIds: string[]): OpResult {
  const drop = new Set(columnIds);
  const keep: number[] = [];
  dataset.columns.forEach((column, index) => {
    if (!drop.has(column.id)) keep.push(index);
  });
  if (keep.length === dataset.columns.length) return { dataset, count: 0 };
  return {
    dataset: {
      columns: keep.map((index) => ({ ...dataset.columns[index] })),
      rows: dataset.rows.map((row) => keep.map((index) => row[index])),
    },
    count: drop.size,
  };
}

export function renameColumn(dataset: Dataset, columnId: string, name: string): Dataset {
  const trimmed = name.trim();
  if (!trimmed) return dataset;
  return {
    ...dataset,
    columns: dataset.columns.map((column) => (column.id === columnId ? { ...column, name: trimmed } : column)),
  };
}

export function moveColumn(dataset: Dataset, columnId: string, targetIndex: number): Dataset {
  const current = columnIndex(dataset, columnId);
  if (current < 0) return dataset;
  const clamp = Math.max(0, Math.min(dataset.columns.length - 1, targetIndex));
  if (current === clamp) return dataset;
  const columns = dataset.columns.slice();
  const [moved] = columns.splice(current, 1);
  columns.splice(clamp, 0, moved);
  const order = columns.map((column) => columnIndex(dataset, column.id));
  return {
    columns,
    rows: dataset.rows.map((row) => order.map((index) => row[index])),
  };
}

export function setColumnHidden(dataset: Dataset, columnId: string, hidden: boolean): Dataset {
  return {
    ...dataset,
    columns: dataset.columns.map((column) => (column.id === columnId ? { ...column, hidden } : column)),
  };
}

export function setColumnSelected(dataset: Dataset, columnId: string, selected: boolean): Dataset {
  return {
    ...dataset,
    columns: dataset.columns.map((column) => (column.id === columnId ? { ...column, selected } : column)),
  };
}

export function setAllColumns(dataset: Dataset, patch: Partial<Pick<Column, 'hidden' | 'selected'>>): Dataset {
  return { ...dataset, columns: dataset.columns.map((column) => ({ ...column, ...patch })) };
}

/* ------------------------------------------------------------- cell operations */

export interface ReplaceOptions {
  find: string;
  replace: string;
  columnIds: string[] | null;
  matchCase: boolean;
  wholeCell: boolean;
  useRegex: boolean;
}

export interface ReplaceResult extends OpResult {
  cellsChanged: number;
  error: string | null;
}

export function replaceText(dataset: Dataset, options: ReplaceOptions): ReplaceResult {
  const { find, replace, matchCase, wholeCell, useRegex } = options;
  if (find === '') {
    return { dataset, count: 0, cellsChanged: 0, error: 'errors.emptySearch' };
  }
  let expression: RegExp | null = null;
  if (useRegex) {
    try {
      expression = new RegExp(find, matchCase ? 'gu' : 'giu');
    } catch (error) {
      return {
        dataset,
        count: 0,
        cellsChanged: 0,
        error: error instanceof Error ? error.message : 'errors.invalidRegex',
      };
    }
  }
  const targetIndexes = options.columnIds
    ? options.columnIds.map((id) => columnIndex(dataset, id)).filter((index) => index >= 0)
    : dataset.columns.map((_, index) => index);
  const target = new Set(targetIndexes);

  let cellsChanged = 0;
  const rows = dataset.rows.map((row) => {
    let changed = false;
    const next = row.map((cell, index) => {
      if (!target.has(index)) return cell;
      const text = cellToText(cell);
      let updated = text;
      if (expression) {
        updated = text.replace(expression, replace);
      } else if (wholeCell) {
        const same = matchCase ? text === find : text.toLowerCase() === find.toLowerCase();
        if (same) updated = replace;
      } else if (matchCase) {
        updated = text.split(find).join(replace);
      } else {
        const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        updated = text.replace(new RegExp(escaped, 'giu'), replace);
      }
      if (updated !== text) {
        changed = true;
        return updated;
      }
      return cell;
    });
    if (changed) cellsChanged += 1;
    return next;
  });

  return { dataset: { ...dataset, rows }, count: cellsChanged, cellsChanged, error: null };
}

export function trimCells(dataset: Dataset, columnIds: string[] | null): OpResult {
  const target = columnIds
    ? new Set(columnIds.map((id) => columnIndex(dataset, id)).filter((index) => index >= 0))
    : null;
  let cellsChanged = 0;
  const rows = dataset.rows.map((row) =>
    row.map((cell, index) => {
      if (typeof cell !== 'string') return cell;
      if (target && !target.has(index)) return cell;
      const trimmed = cell.replace(/^[\s\u00a0]+|[\s\u00a0]+$/g, '');
      if (trimmed !== cell) cellsChanged += 1;
      return trimmed;
    }),
  );
  return { dataset: { ...dataset, rows }, count: cellsChanged };
}

export function normaliseNulls(dataset: Dataset, tokens: string[], columnIds: string[] | null): OpResult {
  const lowered = new Set(tokens.map((token) => token.trim().toLowerCase()).filter(Boolean));
  const target = columnIds
    ? new Set(columnIds.map((id) => columnIndex(dataset, id)).filter((index) => index >= 0))
    : null;
  let cellsChanged = 0;
  const rows = dataset.rows.map((row) =>
    row.map((cell, index) => {
      if (target && !target.has(index)) return cell;
      if (typeof cell !== 'string') return cell;
      if (lowered.has(cell.trim().toLowerCase())) {
        cellsChanged += 1;
        return null;
      }
      return cell;
    }),
  );
  return { dataset: { ...dataset, rows }, count: cellsChanged };
}

/* --------------------------------------------------------------- date helpers */

export type DateSourcePattern =
  | 'iso-date'
  | 'iso-datetime'
  | 'ymd-slash'
  | 'ymd-dot'
  | 'dmy-slash'
  | 'mdy-slash'
  | 'dmy-dash';

export type DateTargetFormat = 'YYYY-MM-DD' | 'YYYY/MM/DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD HH:mm:ss';

const DATE_SOURCE_REGEX: Record<DateSourcePattern, RegExp> = {
  'iso-date': /^(\d{4})-(\d{2})-(\d{2})$/,
  'iso-datetime': /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/,
  'ymd-slash': /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
  'ymd-dot': /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,
  'dmy-slash': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  'mdy-slash': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  'dmy-dash': /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
};

export interface ParsedDate {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function parseDateValue(value: string, pattern: DateSourcePattern): ParsedDate | null {
  const match = DATE_SOURCE_REGEX[pattern].exec(value.trim());
  if (!match) return null;
  let year: number;
  let month: number;
  let day: number;
  if (pattern === 'dmy-slash' || pattern === 'mdy-slash') {
    day = Number(match[pattern === 'mdy-slash' ? 2 : 1]);
    month = Number(match[pattern === 'mdy-slash' ? 1 : 2]);
    year = Number(match[3]);
  } else if (pattern === 'dmy-dash') {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  } else {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  const second = match[6] ? Number(match[6]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { year, month, day, hour, minute, second };
}

const pad2 = (value: number) => String(value).padStart(2, '0');

export function formatParsedDate(date: ParsedDate, format: DateTargetFormat): string {
  const y = String(date.year).padStart(4, '0');
  const m = pad2(date.month);
  const d = pad2(date.day);
  switch (format) {
    case 'YYYY/MM/DD':
      return `${y}/${m}/${d}`;
    case 'DD/MM/YYYY':
      return `${d}/${m}/${y}`;
    case 'MM/DD/YYYY':
      return `${m}/${d}/${y}`;
    case 'YYYY-MM-DD HH:mm:ss':
      return `${y}-${m}-${d} ${pad2(date.hour)}:${pad2(date.minute)}:${pad2(date.second)}`;
    case 'YYYY-MM-DD':
    default:
      return `${y}-${m}-${d}`;
  }
}

export interface DateConvertResult extends OpResult {
  converted: number;
  skipped: number;
  failed: number;
  failedSamples: string[];
}

export function convertDates(
  dataset: Dataset,
  columnId: string,
  source: DateSourcePattern,
  target: DateTargetFormat,
): DateConvertResult {
  const index = columnIndex(dataset, columnId);
  if (index < 0) {
    return { dataset, count: 0, converted: 0, skipped: 0, failed: 0, failedSamples: [] };
  }
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  const failedSamples: string[] = [];
  const rows = dataset.rows.map((row) => {
    const cell = row[index];
    if (cell === null || cell === undefined || cell === '') {
      skipped += 1;
      return row;
    }
    const text = cellToText(cell);
    const parsed = parseDateValue(text, source);
    if (!parsed) {
      failed += 1;
      if (failedSamples.length < 5) failedSamples.push(text);
      return row;
    }
    converted += 1;
    const next = row.slice();
    next[index] = formatParsedDate(parsed, target);
    return next;
  });
  return { dataset: { ...dataset, rows }, count: converted, converted, skipped, failed, failedSamples };
}

/** Suggests the source pattern whose values parse best for the given column. */
export function suggestDatePattern(dataset: Dataset, columnId: string): { pattern: DateSourcePattern; matchRate: number } | null {
  const index = columnIndex(dataset, columnId);
  if (index < 0) return null;
  const samples = dataset.rows
    .map((row) => row[index])
    .filter((cell) => cell !== null && cell !== undefined && cell !== '')
    .slice(0, 200)
    .map((cell) => cellToText(cell));
  if (samples.length === 0) return null;
  let best: { pattern: DateSourcePattern; matchRate: number } | null = null;
  for (const pattern of Object.keys(DATE_SOURCE_REGEX) as DateSourcePattern[]) {
    const matches = samples.filter((value) => parseDateValue(value, pattern) !== null).length;
    const rate = matches / samples.length;
    if (!best || rate > best.matchRate) best = { pattern, matchRate: rate };
  }
  return best && best.matchRate > 0 ? best : null;
}

/* -------------------------------------------------------------- misc utilities */

export function emptyDataset(columns: string[]): Dataset {
  return { columns: makeColumns(columns), rows: [] };
}

export function hasStructuredCells(dataset: Dataset): boolean {
  return dataset.rows.some((row) => row.some((cell) => isStructured(cell)));
}

export function countStructuredCells(dataset: Dataset): number {
  let count = 0;
  for (const row of dataset.rows) for (const cell of row) if (isStructured(cell)) count += 1;
  return count;
}
