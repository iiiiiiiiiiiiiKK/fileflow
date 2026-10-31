import { describe, expect, it } from 'vitest';
import { makeColumns } from './parse';
import {
  compareCells,
  computeVisible,
  convertDates,
  countDuplicateRows,
  findDuplicateRowIndexes,
  isBlankRow,
  moveColumn,
  normaliseNulls,
  parseDateValue,
  removeBlankRows,
  removeColumns,
  removeDuplicateRows,
  removeEmptyColumns,
  removeRowsAt,
  renameColumn,
  replaceText,
  setColumnHidden,
  setColumnSelected,
  sortRows,
  suggestDatePattern,
  trimCells,
} from './table';
import type { Dataset } from './types';

function makeDataset(rows: Dataset['rows'], names: string[]): Dataset {
  return { columns: makeColumns(names), rows };
}

const sample = makeDataset(
  [
    [1, 'Ada', 'Lovelace'],
    [2, 'Grace', 'Hopper'],
    [2, 'Grace', 'Hopper'],
    ['', '', ''],
    ['  Lin  ', 'Lin', 'Chen'],
  ],
  ['id', 'first', 'last'],
);

describe('row operations', () => {
  it('detects and removes fully blank rows', () => {
    expect(isBlankRow(['', null, '  '])).toBe(true);
    expect(isBlankRow(['', 0, ''])).toBe(false);
    const result = removeBlankRows(sample);
    expect(result.count).toBe(1);
    expect(result.dataset.rows).toHaveLength(4);
  });

  it('removes duplicate rows and reports the count', () => {
    expect(countDuplicateRows(sample)).toBe(1);
    expect(findDuplicateRowIndexes(sample)).toEqual([2]);
    const result = removeDuplicateRows(sample);
    expect(result.count).toBe(1);
    expect(result.dataset.rows.map((row) => row[0])).toEqual([1, 2, '', '  Lin  ']);
  });

  it('supports duplicate detection on a subset of columns', () => {
    const subset = removeDuplicateRows(sample, [sample.columns[0].id]);
    expect(subset.count).toBe(1);
  });

  it('falls back to all columns when the subset matches nothing', () => {
    const result = removeDuplicateRows(sample, ['does-not-exist']);
    expect(result.count).toBe(1);
    expect(result.dataset.rows).toHaveLength(4);
  });

  it('removes rows by index', () => {
    const result = removeRowsAt(sample, [0, 2]);
    expect(result.count).toBe(2);
    expect(result.dataset.rows.map((row) => row[1])).toEqual(['Grace', '', 'Lin']);
  });
});

describe('column operations', () => {
  it('removes completely empty columns only', () => {
    const dataset = makeDataset(
      [
        [1, '', 'x'],
        [2, '', 'y'],
      ],
      ['a', 'b', 'c'],
    );
    const result = removeEmptyColumns(dataset);
    expect(result.count).toBe(1);
    expect(result.dataset.columns.map((column) => column.name)).toEqual(['a', 'c']);
    expect(result.dataset.rows).toEqual([
      [1, 'x'],
      [2, 'y'],
    ]);
  });

  it('removes explicit columns', () => {
    const columnId = sample.columns[1].id;
    const result = removeColumns(sample, [columnId]);
    expect(result.count).toBe(1);
    expect(result.dataset.columns.map((column) => column.name)).toEqual(['id', 'last']);
    expect(result.dataset.rows[0]).toEqual([1, 'Lovelace']);
  });

  it('renames without touching values', () => {
    const renamed = renameColumn(sample, sample.columns[0].id, '  user_id  ');
    expect(renamed.columns[0].name).toBe('user_id');
    expect(renamed.rows[0][0]).toBe(1);
    expect(renameColumn(sample, sample.columns[0].id, '   ')).toBe(sample);
  });

  it('reorders columns together with their data', () => {
    const moved = moveColumn(sample, sample.columns[2].id, 0);
    expect(moved.columns.map((column) => column.name)).toEqual(['last', 'id', 'first']);
    expect(moved.rows[0]).toEqual(['Lovelace', 1, 'Ada']);
  });

  it('toggles hidden and selected flags immutably', () => {
    const hidden = setColumnHidden(sample, sample.columns[0].id, true);
    expect(hidden.columns[0].hidden).toBe(true);
    expect(sample.columns[0].hidden).toBe(false);
    const unselected = setColumnSelected(sample, sample.columns[0].id, false);
    expect(unselected.columns[0].selected).toBe(false);
  });
});

describe('sorting', () => {
  it('sorts numbers numerically and keeps blanks last', () => {
    const rows = sortRows([[10], [2], [''], [33]], 0, 'asc');
    expect(rows.map((row) => row[0])).toEqual([2, 10, 33, '']);
  });

  it('sorts text with natural numeric collation', () => {
    const rows = sortRows([['item10'], ['item2'], ['item1']], 0, 'asc');
    expect(rows.map((row) => row[0])).toEqual(['item1', 'item2', 'item10']);
  });

  it('puts blanks last in both directions', () => {
    const asc = sortRows([[1], [null], [3]], 0, 'asc');
    const desc = sortRows([[1], [null], [3]], 0, 'desc');
    expect(asc[2][0]).toBeNull();
    expect(desc[2][0]).toBeNull();
  });

  it('compares mixed types deterministically', () => {
    expect(compareCells(1, 'a')).toBeLessThan(0);
    expect(compareCells('a', true)).toBeGreaterThan(0);
    expect(compareCells(null, 1)).toBeGreaterThan(0);
  });
});

describe('view pipeline', () => {
  it('filters by search term across all columns', () => {
    const view = { search: 'grace', filterColumnId: null, sort: null, page: 0 };
    const result = computeVisible(sample, view);
    expect(result.filtered).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.indexes).toEqual([1, 2]);
  });

  it('restricts the search to one column when a filter column is set', () => {
    // "Ada" only appears in the `first` column, "Lovelace" only in `last`.
    const byFirst = computeVisible(sample, {
      search: 'lovelace',
      filterColumnId: sample.columns[1].id,
      sort: null,
      page: 0,
    });
    expect(byFirst.rows).toHaveLength(0);

    const byLast = computeVisible(sample, {
      search: 'lovelace',
      filterColumnId: sample.columns[2].id,
      sort: null,
      page: 0,
    });
    expect(byLast.rows).toHaveLength(1);
    expect(byLast.rows[0][1]).toBe('Ada');
  });

  it('ignores a filter column that no longer exists', () => {
    const result = computeVisible(sample, { search: 'grace', filterColumnId: 'gone', sort: null, page: 0 });
    expect(result.rows).toHaveLength(2); // falls back to searching every column
  });

  it('sorts without dropping rows', () => {    const numeric = makeDataset([[1], [3], [2]], ['n']);
    const view = { search: '', filterColumnId: null, sort: { columnId: numeric.columns[0].id, direction: 'desc' as const }, page: 0 };
    const result = computeVisible(numeric, view);
    expect(result.rows.map((row) => row[0])).toEqual([3, 2, 1]);
  });

  it('ignores a missing sort column instead of failing', () => {
    const view = { search: '', filterColumnId: null, sort: { columnId: 'missing', direction: 'asc' as const }, page: 0 };
    expect(computeVisible(sample, view).rows).toHaveLength(5);
  });
});

describe('cell operations', () => {
  it('replaces text case-insensitively by default', () => {
    const result = replaceText(sample, {
      find: 'ada',
      replace: 'ADA',
      columnIds: null,
      matchCase: false,
      wholeCell: false,
      useRegex: false,
    });
    expect(result.cellsChanged).toBe(1);
    expect(result.dataset.rows[0][1]).toBe('ADA');
  });

  it('replaces only inside the chosen columns', () => {
    const result = replaceText(sample, {
      find: 'Grace',
      replace: 'G',
      columnIds: [sample.columns[1].id],
      matchCase: true,
      wholeCell: true,
      useRegex: false,
    });
    expect(result.cellsChanged).toBe(2);
    expect(result.dataset.rows[1][1]).toBe('G');
    expect(result.dataset.rows[1][2]).toBe('Hopper');
  });

  it('supports regular expressions and reports invalid ones', () => {
    const ok = replaceText(sample, {
      find: '^(\\d+)$',
      replace: 'n$1',
      columnIds: [sample.columns[0].id],
      matchCase: true,
      wholeCell: false,
      useRegex: true,
    });
    expect(ok.dataset.rows[0][0]).toBe('n1');
    const bad = replaceText(sample, {
      find: '(',
      replace: 'x',
      columnIds: null,
      matchCase: false,
      wholeCell: false,
      useRegex: true,
    });
    expect(bad.error).toBeTruthy();
    expect(bad.dataset).toBe(sample);
  });

  it('refuses empty search strings', () => {
    const result = replaceText(sample, {
      find: '',
      replace: 'x',
      columnIds: null,
      matchCase: false,
      wholeCell: false,
      useRegex: false,
    });
    expect(result.error).toBe('errors.emptySearch');
  });

  it('trims whitespace and reports how many cells changed', () => {
    const result = trimCells(sample, null);
    expect(result.count).toBe(1);
    expect(result.dataset.rows[4][0]).toBe('Lin');
  });

  it('normalises blank tokens to real nulls', () => {
    const dataset = makeDataset([['NULL'], ['n/a'], ['kept'], ['']], ['a']);
    const result = normaliseNulls(dataset, ['NULL', 'N/A'], null);
    expect(result.count).toBe(2);
    expect(result.dataset.rows.map((row) => row[0])).toEqual([null, null, 'kept', '']);
  });
});

describe('date handling', () => {
  it('parses supported patterns strictly', () => {
    expect(parseDateValue('2024-03-05', 'iso-date')).toEqual({ year: 2024, month: 3, day: 5, hour: 0, minute: 0, second: 0 });
    expect(parseDateValue('2024-02-30', 'iso-date')).toBeNull();
    expect(parseDateValue('05/03/2024', 'dmy-slash')).toMatchObject({ day: 5, month: 3, year: 2024 });
    expect(parseDateValue('03/05/2024', 'mdy-slash')).toMatchObject({ day: 5, month: 3, year: 2024 });
    expect(parseDateValue('2024/3/5', 'ymd-slash')).toMatchObject({ day: 5, month: 3 });
    expect(parseDateValue('nope', 'iso-date')).toBeNull();
  });

  it('converts a column to the requested format', () => {
    const dataset = makeDataset([['2024-03-05'], ['2024-12-31'], ['']], ['date']);
    const result = convertDates(dataset, dataset.columns[0].id, 'iso-date', 'DD/MM/YYYY');
    expect(result.converted).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.dataset.rows[0][0]).toBe('05/03/2024');
  });

  it('reports values it cannot parse instead of guessing', () => {
    const dataset = makeDataset([['2024-03-05'], ['05/03/2024']], ['date']);
    const result = convertDates(dataset, dataset.columns[0].id, 'iso-date', 'YYYY-MM-DD');
    expect(result.failed).toBe(1);
    expect(result.failedSamples).toEqual(['05/03/2024']);
    expect(result.dataset.rows[1][0]).toBe('05/03/2024');
  });

  it('suggests the best matching source pattern', () => {
    const dataset = makeDataset([['05/03/2024'], ['06/04/2024']], ['date']);
    const suggestion = suggestDatePattern(dataset, dataset.columns[0].id);
    expect(suggestion?.matchRate).toBe(1);
    expect(['dmy-slash', 'mdy-slash']).toContain(suggestion?.pattern);
  });
});
