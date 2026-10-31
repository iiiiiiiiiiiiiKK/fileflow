import { describe, expect, it } from 'vitest';
import { CONVERSION_MATRIX, convert, defaultBaseName, sanitiseFileName, withExtension } from './convert';
import { ensureUniqueName, prepareExport } from './export';
import { parseDelimited, parseJsonl, jsonToTable } from './parse';
import { byteLength, datasetToRecords, DEFAULT_CONVERSION_OPTIONS, serializeCsv, serializeJson, serializeJsonl, serializeTxt } from './serialize';
import type { ConversionOptions, Dataset } from './types';

function csvDataset(text: string): Dataset {
  const parsed = parseDelimited(text);
  if (!parsed.dataset) throw new Error('parse failed');
  return parsed.dataset;
}

function opts(patch: Partial<ConversionOptions> = {}): ConversionOptions {
  return { ...DEFAULT_CONVERSION_OPTIONS, ...patch };
}

const people = csvDataset('id,name,active,score\n1,Ada,true,9.5\n2,小明,false,7');

describe('serialisation', () => {
  it('writes CSV with a header and minimal quoting', () => {
    const csv = serializeCsv(people, opts());
    expect(csv.split('\n')[0]).toBe('id,name,active,score');
    expect(csv).toContain('1,Ada,true,9.5');
  });

  it('quotes values that contain delimiters or newlines', () => {
    const dataset = csvDataset('a,b\n"x,1","line1\nline2"');
    const csv = serializeCsv(dataset, opts());
    expect(csv).toContain('"x,1"');
    expect(csv).toContain('"line1\nline2"');
  });

  it('honours a custom delimiter, CRLF and the header switch', () => {
    const semi = serializeCsv(people, opts({ delimiter: ';' }));
    expect(semi.split('\n')[0]).toBe('id;name;active;score');

    const noHeader = serializeCsv(people, opts({ includeHeader: false }));
    expect(noHeader.split('\n')).toHaveLength(2);
    expect(noHeader.startsWith('1,')).toBe(true);

    const crlf = serializeCsv(people, opts({ crlf: true }));
    expect(crlf).toContain('\r\n');
  });

  it('writes nulls as empty fields or as the NULL literal', () => {
    const dataset: Dataset = { columns: people.columns.slice(0, 1), rows: [[null], [1]] };
    expect(serializeCsv(dataset, opts())).toBe('id\n\n1');
    expect(serializeCsv(dataset, opts({ nullAsText: true }))).toBe('id\nNULL\n1');
  });

  it('keeps types when writing JSON', () => {
    const json = JSON.parse(serializeJson(people, opts()));
    expect(json).toEqual([
      { id: 1, name: 'Ada', active: true, score: 9.5 },
      { id: 2, name: '小明', active: false, score: 7 },
    ]);
  });

  it('writes one object per line for JSONL', () => {
    const lines = serializeJsonl(people, opts()).split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ id: 1, name: 'Ada', active: true, score: 9.5 });
  });

  it('writes TSV text for TXT output', () => {
    const text = serializeTxt(people, opts());
    expect(text.split('\n')[0]).toBe('id\tname\tactive\tscore');
    expect(text).toContain('1\tAda\ttrue\t9.5');
  });

  it('omits unselected columns everywhere', () => {
    const dataset: Dataset = {
      columns: people.columns.map((column, index) => ({ ...column, selected: index !== 1 })),
      rows: people.rows,
    };
    expect(serializeCsv(dataset, opts()).split('\n')[0]).toBe('id,active,score');
    expect(Object.keys(datasetToRecords(dataset).records[0])).toEqual(['id', 'active', 'score']);
  });

  it('counts UTF-8 bytes, not characters', () => {
    expect(byteLength('小明')).toBe(6);
    expect(byteLength('abc')).toBe(3);
  });
});

describe('convert', () => {
  it('CSV → JSON keeps numbers and booleans typed', () => {
    const result = convert({ dataset: people, sourceKind: 'csv', target: 'json', baseName: 'people' });
    expect(result.ok).toBe(true);
    expect(result.fileName).toBe('people.json');
    const parsed = JSON.parse(result.text);
    expect(parsed[0].id).toBe(1);
    expect(parsed[0].active).toBe(true);
  });

  it('CSV → JSONL and CSV → CSV round trip', () => {
    const jsonl = convert({ dataset: people, sourceKind: 'csv', target: 'jsonl', baseName: 'x' });
    expect(jsonl.text.split('\n')).toHaveLength(2);
    const csv = convert({ dataset: people, sourceKind: 'csv', target: 'csv', baseName: 'x' });
    expect(csv.text.startsWith('id,name')).toBe(true);
  });

  it('JSON → CSV warns when nested values become JSON text', () => {
    const table = jsonToTable([{ id: 1, meta: { a: 1 } }, { id: 2, meta: { b: 2 } }]).dataset;
    const result = convert({ dataset: table, sourceKind: 'json', target: 'csv', baseName: 'out' });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'nested-values')).toBe(true);
    expect(result.text).toContain('"{""a"":1}"');
  });

  it('JSON → JSON without edits keeps the original structure', () => {
    const value = { nested: [1, 2, 3], name: 'x' };
    const result = convert({ dataset: null, jsonValue: value, sourceKind: 'json', target: 'json', baseName: 'keep' });
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.text)).toEqual(value);
  });

  it('JSONL → JSON collects records into an array', () => {
    const jsonl = parseJsonl('{"a":1}\n{"a":2}');
    const result = convert({
      dataset: null,
      jsonlRecords: jsonl.records,
      sourceKind: 'jsonl',
      target: 'json',
      baseName: 'records',
    });
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.text)).toHaveLength(2);
  });

  it('JSONL → CSV builds a table from the union of keys', () => {
    const jsonl = parseJsonl('{"a":1,"b":2}\n{"a":3,"c":4}');
    const table = jsonToTable(jsonl.records).dataset;
    const result = convert({ dataset: table, sourceKind: 'jsonl', target: 'csv', baseName: 'out' });
    expect(result.text.split('\n')[0]).toBe('a,b,c');
  });

  it('TXT → JSON only succeeds for real JSON', () => {
    const ok = convert({ dataset: null, sourceKind: 'txt', target: 'json', baseName: 't', sourceText: '{"a":1}' });
    expect(ok.ok).toBe(true);
    const bad = convert({ dataset: null, sourceKind: 'txt', target: 'json', baseName: 't', sourceText: 'hello' });
    expect(bad.ok).toBe(false);
    expect(bad.issue?.code).toBe('txt-not-json');
  });

  it('fails clearly when nothing is exportable', () => {
    const dataset: Dataset = {
      columns: people.columns.map((column) => ({ ...column, selected: false })),
      rows: people.rows,
    };
    const result = convert({ dataset, sourceKind: 'csv', target: 'json', baseName: 'x' });
    expect(result.ok).toBe(false);
    expect(result.issue?.message).toBe('errors.noSelectedColumns');
  });

  it('reports the byte length of the result', () => {
    const result = convert({ dataset: people, sourceKind: 'csv', target: 'json', baseName: 'x' });
    expect(result.byteLength).toBe(byteLength(result.text));
  });

  it('describes which conversions exist per format', () => {
    expect(CONVERSION_MATRIX.csv).toContain('json');
    expect(CONVERSION_MATRIX.txt).toEqual(['json', 'txt']);
    expect(CONVERSION_MATRIX.json).toContain('csv');
  });
});

describe('file naming and export preparation', () => {
  it('derives a base name and a correct extension', () => {
    expect(defaultBaseName('data.final.csv')).toBe('data.final');
    expect(withExtension('report', 'jsonl')).toBe('report.jsonl');
    expect(withExtension('report.csv', 'json')).toBe('report.json');
  });

  it('sanitises unsafe characters', () => {
    expect(sanitiseFileName('a/b:c*?.csv')).toBe('a-b-c--.csv');
    expect(sanitiseFileName('   ')).toBe('fileflow-output');
  });

  it('de-duplicates colliding names case-insensitively', () => {
    const used = new Set<string>();
    expect(ensureUniqueName('out.json', used)).toBe('out.json');
    expect(ensureUniqueName('OUT.json', used)).toBe('OUT-2.json');
    expect(ensureUniqueName('out.json', used)).toBe('out-3.json');
  });

  it('adds a BOM only for text-ish exports', () => {
    expect(prepareExport('a.csv', 'x', 'csv', true).text.startsWith('\ufeff')).toBe(true);
    expect(prepareExport('a.csv', 'x', 'csv', false).text).toBe('x');
    expect(prepareExport('a.json', 'x', 'json', true).text).toBe('x');
    expect(prepareExport('a.json', 'x', 'json', false).mime).toContain('application/json');
  });
});
