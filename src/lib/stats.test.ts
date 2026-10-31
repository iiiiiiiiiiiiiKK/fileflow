import { describe, expect, it } from 'vitest';
import { makeColumns } from './parse';
import { computeStats, summariseFields } from './stats';
import type { Dataset } from './types';

const dataset: Dataset = {
  columns: makeColumns(['id', 'name', 'score', 'note']),
  rows: [
    [1, 'Ada', 10, ''],
    [2, 'Ada', 20, null],
    [3, '', 30, 'x'],
    [3, '', 30, 'x'],
  ],
};

describe('computeStats', () => {
  const stats = computeStats(dataset);

  it('counts rows, columns, empties and duplicates', () => {
    expect(stats.rows).toBe(4);
    expect(stats.columns).toBe(4);
    expect(stats.duplicateRows).toBe(1);
    // '' in name (2x), '' in note (1x), null in note (1x)
    expect(stats.emptyCells).toBe(4);
  });

  it('counts nulls and empties separately per column', () => {
    const note = stats.perColumn.find((column) => column.name === 'note');
    expect(note?.empty).toBe(1);
    expect(note?.nulls).toBe(1);
  });

  it('computes numeric min, max and average only where possible', () => {
    const score = stats.perColumn.find((column) => column.name === 'score');
    expect(score?.min).toBe(10);
    expect(score?.max).toBe(30);
    expect(score?.average).toBe(22.5);
    expect(score?.numeric).toBe(4);

    const name = stats.perColumn.find((column) => column.name === 'name');
    expect(name?.min).toBeNull();
    expect(name?.average).toBeNull();
  });

  it('reports distinct values and the most common ones', () => {
    const name = stats.perColumn.find((column) => column.name === 'name');
    expect(name?.distinct).toBe(1);
    expect(name?.topValues[0]).toEqual({ value: 'Ada', count: 2 });
  });

  it('reports text length statistics', () => {
    const name = stats.perColumn.find((column) => column.name === 'name');
    expect(name?.minLength).toBe(3);
    expect(name?.maxLength).toBe(3);
    expect(name?.averageLength).toBe(3);
  });

  it('guesses column types', () => {
    expect(stats.perColumn.find((column) => column.name === 'id')?.guessedType).toBe('number');
    expect(stats.perColumn.find((column) => column.name === 'name')?.guessedType).toBe('text');
  });

  it('handles an empty dataset without inventing values', () => {
    const empty = computeStats({ columns: makeColumns(['a']), rows: [] });
    expect(empty.rows).toBe(0);
    expect(empty.perColumn[0].average).toBeNull();
    expect(empty.perColumn[0].guessedType).toBe('empty');
  });
});

describe('summariseFields', () => {
  it('lists every column with counts and a sample', () => {
    const fields = summariseFields(dataset);
    expect(fields).toHaveLength(4);
    expect(fields[1].emptyCount).toBe(2);
    expect(fields[1].distinct).toBe(1);
    expect(fields[1].sample).toBe('Ada · Ada');
  });
});
