import { describe, expect, it } from 'vitest';
import { buildImport, deriveDataset } from './importer';
import { LIMITS } from './limits';

function encode(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function importText(name: string, text: string) {
  const buffer = encode(text);
  return buildImport({ name, size: buffer.byteLength, buffer });
}

describe('buildImport', () => {
  it('imports a CSV file into an editable dataset', () => {
    const outcome = importText('people.csv', 'id,name\n1,Ada\n2,Lin');
    expect(outcome.file.kind).toBe('csv');
    expect(outcome.file.encoding).toBe('utf-8');
    expect(outcome.file.issue).toBeNull();
    expect(outcome.dataset?.rows).toEqual([
      [1, 'Ada'],
      [2, 'Lin'],
    ]);
    expect(outcome.file.document?.kind).toBe('csv');
  });

  it('keeps the original text untouched for previews', () => {
    const text = 'name\n小明';
    const outcome = importText('people.csv', text);
    expect(outcome.file.text).toBe(text);
  });

  it('imports JSON without forcing a table', () => {
    const outcome = importText('data.json', '{"a":1,"nested":{"b":2}}');
    expect(outcome.file.kind).toBe('json');
    expect(outcome.dataset).toBeNull();
    expect(outcome.file.document?.kind).toBe('json');
    expect(outcome.file.warnings).toContain('warnings.nestedValues');
    const derived = deriveDataset(outcome.file);
    expect(derived?.columns.map((column) => column.name)).toEqual(['a', 'nested']);
  });

  it('imports JSONL and records invalid lines', () => {
    const outcome = importText('data.jsonl', '{"a":1}\noops\n{"a":2}');
    expect(outcome.file.kind).toBe('jsonl');
    expect(outcome.file.warnings).toContain('warnings.jsonlPartial');
    expect(outcome.file.document?.kind).toBe('jsonl');
    if (outcome.file.document?.kind === 'jsonl') {
      expect(outcome.file.document.result.errors).toHaveLength(1);
      expect(outcome.file.document.result.errors[0].line).toBe(2);
    }
  });

  it('reports a JSONL file that has no valid record at all', () => {
    const outcome = importText('bad.jsonl', 'nope\nnope');
    expect(outcome.file.issue?.code).toBe('json-syntax');
    expect(outcome.file.document).toBeNull();
  });

  it('keeps TXT as text even when it looks like JSON', () => {
    const outcome = importText('notes.txt', '{"looks":"like json"}');
    expect(outcome.file.kind).toBe('txt');
    expect(outcome.file.document?.kind).toBe('txt');
    expect(outcome.file.warnings).toHaveLength(0);
  });

  it('sniffs the format when the extension is unknown', () => {
    const outcome = importText('export', 'a,b\n1,2');
    expect(outcome.file.kind).toBe('csv');
    expect(outcome.file.warnings).toContain('warnings.detectedByContent');
  });

  it('rejects empty files with a clear message', () => {
    const outcome = buildImport({ name: 'empty.csv', size: 0, buffer: new ArrayBuffer(0) });
    expect(outcome.file.issue?.code).toBe('empty-file');
    expect(outcome.dataset).toBeNull();
  });

  it('rejects files above the size limit before parsing', () => {
    const buffer = new ArrayBuffer(LIMITS.maxFileSize + 1);
    const outcome = buildImport({ name: 'huge.csv', size: buffer.byteLength, buffer });
    expect(outcome.file.issue?.code).toBe('too-large');
  });

  it('reports JSON syntax errors with a technical detail', () => {
    const outcome = importText('broken.json', '{"a":}');
    expect(outcome.file.issue?.code).toBe('json-syntax');
    expect(outcome.file.issue?.detail).toBeTruthy();
  });
});
