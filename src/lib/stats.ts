import { cellToText, guessColumnType, isStructured } from './infer';
import { findDuplicateRowIndexes } from './table';
import type { CellValue, ColumnStat, Dataset, DatasetStats } from './types';

function percentileSample<T>(values: T[], limit: number): T[] {
  if (values.length <= limit) return values;
  const step = values.length / limit;
  const sample: T[] = [];
  for (let i = 0; i < limit; i += 1) sample.push(values[Math.floor(i * step)]);
  return sample;
}

/** Computes honest statistics: anything that cannot be computed stays `null`. */
export function computeStats(dataset: Dataset, sampleLimit = 50_000): DatasetStats {
  const emptyCells = dataset.rows.reduce((total, row) => {
    let count = 0;
    for (const cell of row) {
      if (cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '')) count += 1;
    }
    return total + count;
  }, 0);

  const perColumn: ColumnStat[] = dataset.columns.map((column, index) => {
    const sampled = percentileSample(dataset.rows, sampleLimit);
    let empty = 0;
    let nulls = 0;
    let numeric = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let minLength: number | null = null;
    let maxLength: number | null = null;
    let lengthSum = 0;
    let lengthCount = 0;
    let structured = 0;
    const uniques = new Set<string>();
    const frequencies = new Map<string, number>();

    for (const row of sampled) {
      const cell: CellValue | undefined = row[index];
      if (cell === null) {
        nulls += 1;
        continue;
      }
      if (cell === undefined || (typeof cell === 'string' && cell === '')) {
        empty += 1;
        continue;
      }
      if (typeof cell === 'number') {
        numeric += 1;
        if (cell < min) min = cell;
        if (cell > max) max = cell;
        sum += cell;
      }
      if (isStructured(cell)) structured += 1;

      const text = cellToText(cell);
      uniques.add(text);
      frequencies.set(text, (frequencies.get(text) ?? 0) + 1);
      const length = text.length;
      minLength = minLength === null ? length : Math.min(minLength, length);
      maxLength = maxLength === null ? length : Math.max(maxLength, length);
      lengthSum += length;
      lengthCount += 1;
    }

    const topValues = [...frequencies.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value: value.length > 60 ? `${value.slice(0, 60)}…` : value, count }));

    const guessedType =
      structured > 0
        ? 'mixed'
        : guessColumnType(sampled.map((row) => row[index]));

    return {
      columnId: column.id,
      name: column.name,
      total: sampled.length,
      empty,
      nulls,
      distinct: uniques.size,
      numeric,
      min: numeric > 0 ? min : null,
      max: numeric > 0 ? max : null,
      average: numeric > 0 ? sum / numeric : null,
      minLength,
      maxLength,
      averageLength: lengthCount > 0 ? lengthSum / lengthCount : null,
      guessedType,
      topValues,
    };
  });

  return {
    rows: dataset.rows.length,
    columns: dataset.columns.length,
    emptyCells,
    duplicateRows: findDuplicateRowIndexes(dataset).length,
    perColumn,
  };
}

export interface FieldSummary {
  columnId: string;
  name: string;
  emptyCount: number;
  nullCount: number;
  distinct: number;
  guessedType: ColumnStat['guessedType'];
  sample: string;
}

export function summariseFields(dataset: Dataset, previews: number = 3): FieldSummary[] {
  const sampleRows = dataset.rows.slice(0, 200);
  return dataset.columns.map((column, index) => {
    let empty = 0;
    let nulls = 0;
    const uniques = new Set<string>();
    const samples: string[] = [];
    for (const row of sampleRows) {
      const cell = row[index];
      if (cell === null) {
        nulls += 1;
        continue;
      }
      if (cell === undefined || (typeof cell === 'string' && cell === '')) {
        empty += 1;
        continue;
      }
      const text = cellToText(cell);
      uniques.add(text);
      if (samples.length < previews) samples.push(text);
    }
    return {
      columnId: column.id,
      name: column.name,
      emptyCount: empty,
      nullCount: nulls,
      distinct: uniques.size,
      guessedType: guessColumnType(sampleRows.map((row) => row[index])),
      sample: samples.join(' · '),
    };
  });
}
