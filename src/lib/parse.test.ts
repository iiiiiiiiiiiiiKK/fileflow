import { describe, expect, it } from 'vitest';
import {
  decodeBytes,
  detectDelimiter,
  jsonToTable,
  kindFromName,
  measureJsonDepth,
  parseDelimited,
  parseJsonl,
  parseJsonText,
  sniffKind,
} from './parse';

function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function bytesOfWithBom(text: string): ArrayBuffer {
  const body = new TextEncoder().encode(text);
  const withBom = new Uint8Array(body.length + 3);
  withBom.set([0xef, 0xbb, 0xbf], 0);
  withBom.set(body, 3);
  return withBom.buffer;
}

describe('decodeBytes', () => {
  it('strips a UTF-8 BOM and reports it', () => {
    const result = decodeBytes(bytesOfWithBom('name,age\n小明,12'));
    expect(result.encoding).toBe('utf-8-bom');
    expect(result.text.startsWith('name')).toBe(true);
    expect(result.text).toContain('小明');
  });

  it('decodes plain UTF-8 including emoji', () => {
    const result = decodeBytes(bytesOf('名称\n测试🚀'));
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe('名称\n测试🚀');
  });

  it('decodes UTF-16LE with BOM', () => {
    const buffer = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x62, 0x00]).buffer;
    const result = decodeBytes(buffer);
    expect(result.encoding).toBe('utf-16le');
    expect(result.text).toBe('ab');
  });

  it('reports an unusable encoding instead of mangling the bytes', () => {
    const buffer = new Uint8Array([0x81, 0xff, 0xfe, 0x00, 0x81]).buffer;
    const result = decodeBytes(buffer);
    expect(result.text).toBe('');
    expect(result.issue?.code).toBe('unsupported-encoding');
  });
});

describe('format recognition', () => {
  it('maps extensions to kinds', () => {
    expect(kindFromName('a.CSV')).toBe('csv');
    expect(kindFromName('a.jsonl')).toBe('jsonl');
    expect(kindFromName('a.ndjson')).toBe('jsonl');
    expect(kindFromName('a.exe')).toBeNull();
    expect(kindFromName('noext')).toBeNull();
  });

  it('detects delimiters outside quoted regions', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('a|b\n1|2')).toBe('|');
    expect(detectDelimiter('"x,y",b\n1,2')).toBe(',');
  });

  it('sniffs JSON, JSONL, CSV and plain text', () => {
    expect(sniffKind('{"a":1}')).toBe('json');
    expect(sniffKind('[1,2,3]')).toBe('json');
    expect(sniffKind('{"a":1}\n{"a":2}')).toBe('jsonl');
    expect(sniffKind('a,b\n1,2\n3,4')).toBe('csv');
    expect(sniffKind('just some words\nand another line')).toBe('txt');
  });
});

describe('CSV parsing', () => {
  it('parses a simple file with typed values', () => {
    const { dataset, issue } = parseDelimited('id,name,score\n1,Ada,9.5\n2,Lin,7');
    expect(issue).toBeNull();
    expect(dataset.columns.map((column) => column.name)).toEqual(['id', 'name', 'score']);
    expect(dataset.rows).toEqual([
      [1, 'Ada', 9.5],
      [2, 'Lin', 7],
    ]);
  });

  it('keeps quoted commas, newlines and quotes intact', () => {
    const text = 'a,b\n"x,1","line1\nline2"\n"say ""hi""",2';
    const { dataset } = parseDelimited(text);
    expect(dataset.rows[0][0]).toBe('x,1');
    expect(dataset.rows[0][1]).toBe('line1\nline2');
    expect(dataset.rows[1][0]).toBe('say "hi"');
    expect(dataset.rows[1][1]).toBe(2);
  });

  it('preserves leading zeros and long IDs as text', () => {
    const { dataset } = parseDelimited('code,id\n00123,110101199003071234');
    expect(dataset.rows[0][0]).toBe('00123');
    expect(dataset.rows[0][1]).toBe('110101199003071234');
  });

  it('de-duplicates empty and repeated headers', () => {
    const { dataset } = parseDelimited('a,a,,a\n1,2,3,4');
    expect(dataset.columns.map((column) => column.name)).toEqual(['a', 'a (2)', 'column_3', 'a (3)']);
  });

  it('fills short rows with empty strings instead of shifting values', () => {
    const { dataset } = parseDelimited('a,b,c\n1,2\n3,4,5');
    expect(dataset.rows[0]).toEqual([1, 2, '']);
    expect(dataset.rows[1]).toEqual([3, 4, 5]);
  });

  it('can disable type inference', () => {
    const { dataset } = parseDelimited('a\n123', { inferTypes: false });
    expect(dataset.rows[0][0]).toBe('123');
  });

  it('reports an empty file', () => {
    expect(parseDelimited('').issue?.code).toBe('empty-file');
    expect(parseDelimited('   \n  ').issue?.code).toBe('empty-file');
  });

  it('parses semicolon and tab delimited files', () => {
    const semi = parseDelimited('a;b\n1;2', { delimiter: ';' });
    expect(semi.dataset.rows[0]).toEqual([1, 2]);
    const tab = parseDelimited('a\tb\n1\t2', { delimiter: '\t' });
    expect(tab.dataset.rows[0]).toEqual([1, 2]);
  });
});

describe('JSON parsing guards', () => {
  it('parses valid JSON', () => {
    const result = parseJsonText('{"a":[1,2]}');
    expect(result.issue).toBeNull();
    expect(result.value).toEqual({ a: [1, 2] });
  });

  it('reports syntax errors with a detail message', () => {
    const result = parseJsonText('{"a": }');
    expect(result.issue?.code).toBe('json-syntax');
    expect(result.issue?.detail).toBeTruthy();
  });

  it('measures depth and refuses absurdly nested input', () => {
    expect(measureJsonDepth('[[[1]]]')).toBe(3);
    const deep = '['.repeat(80) + ']'.repeat(80);
    expect(measureJsonDepth(deep)).toBeGreaterThan(64);
    expect(parseJsonText(deep).issue?.code).toBe('json-too-deep');
  });

  it('treats an empty JSON document as empty', () => {
    expect(parseJsonText('   ').issue?.code).toBe('empty-file');
  });
});

describe('jsonToTable', () => {
  it('turns an array of objects into rows with the union of keys', () => {
    const { dataset, shape } = jsonToTable([
      { a: 1, b: 'x' },
      { b: 'y', c: true },
    ]);
    expect(shape).toBe('records');
    expect(dataset.columns.map((column) => column.name)).toEqual(['a', 'b', 'c']);
    expect(dataset.rows).toEqual([
      [1, 'x', null],
      [null, 'y', true],
    ]);
  });

  it('turns a single object into one row', () => {
    const { dataset, shape } = jsonToTable({ a: 1, b: { c: 2 } });
    expect(shape).toBe('object');
    expect(dataset.rows).toHaveLength(1);
    expect(dataset.rows[0][1]).toEqual({ c: 2 });
  });

  it('turns a scalar array into a single column', () => {
    const { dataset, shape } = jsonToTable([1, 2, 3]);
    expect(shape).toBe('scalar-list');
    expect(dataset.columns).toHaveLength(1);
    expect(dataset.rows).toEqual([[1], [2], [3]]);
  });

  it('warns when nested values have to become text', () => {
    const result = jsonToTable([{ a: { nested: true } }]);
    expect(result.warnings).toContain('warnings.nestedValues');
  });
});

describe('JSONL parsing', () => {
  it('collects valid records and localises invalid lines', () => {
    const text = '{"a":1}\n{"a":2}\nnot json\n\n{"a":3}';
    const result = parseJsonl(text);
    expect(result.records).toHaveLength(3);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(3);
    expect(result.errors[0].excerpt).toBe('not json');
    expect(result.blankLines).toBe(1);
  });

  it('handles a file where every line is invalid', () => {
    const result = parseJsonl('nope\nnope');
    expect(result.records).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
  });
});
