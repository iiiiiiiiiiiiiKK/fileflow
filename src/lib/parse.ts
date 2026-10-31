import Papa from 'papaparse';
import { inferCellValue } from './infer';
import { LIMITS } from './limits';
import type {
  CellValue,
  Column,
  Dataset,
  Encoding,
  FileKind,
  ImportIssue,
  JsonValue,
  JsonlError,
  JsonlResult,
} from './types';

/* ------------------------------------------------------------------ decoding */

export interface DecodeResult {
  text: string;
  encoding: Encoding;
  issue: ImportIssue | null;
  warning: string | null;
}

function startsWith(bytes: Uint8Array, pattern: number[]): boolean {
  if (bytes.length < pattern.length) return false;
  return pattern.every((byte, index) => bytes[index] === byte);
}

/**
 * Decodes raw bytes with a documented, deterministic order:
 * BOM first, then strict UTF-8, and only then a clearly announced GB18030 guess.
 * Anything else is reported instead of silently mangled.
 */
export function decodeBytes(buffer: ArrayBuffer): DecodeResult {
  const bytes = new Uint8Array(buffer);

  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) {
    return {
      text: new TextDecoder('utf-8').decode(bytes.subarray(3)),
      encoding: 'utf-8-bom',
      issue: null,
      warning: null,
    };
  }
  if (startsWith(bytes, [0xff, 0xfe])) {
    return {
      text: new TextDecoder('utf-16le').decode(bytes.subarray(2)),
      encoding: 'utf-16le',
      issue: null,
      warning: null,
    };
  }
  if (startsWith(bytes, [0xfe, 0xff])) {
    return {
      text: new TextDecoder('utf-16be').decode(bytes.subarray(2)),
      encoding: 'utf-16be',
      issue: null,
      warning: null,
    };
  }

  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      encoding: 'utf-8',
      issue: null,
      warning: null,
    };
  } catch {
    // Not valid UTF-8. Try GB18030 (a superset of GBK/GB2312) once.
    try {
      const text = new TextDecoder('gb18030', { fatal: true }).decode(bytes);
      return { text, encoding: 'gb18030', issue: null, warning: 'warnings.guessedEncoding' };
    } catch {
      return {
        text: '',
        encoding: 'utf-8',
        issue: {
          code: 'unsupported-encoding',
          message: 'errors.unsupportedEncoding',
          detail: 'Bytes are neither UTF-8, UTF-8 BOM, UTF-16 (LE/BE) nor GB18030.',
        },
        warning: null,
      };
    }
  }
}

/* ------------------------------------------------------- format recognition */

const EXTENSION_KIND: Record<string, FileKind> = {
  csv: 'csv',
  tsv: 'csv',
  tab: 'csv',
  txt: 'txt',
  text: 'txt',
  json: 'json',
  jsonl: 'jsonl',
  ndjson: 'jsonl',
  jsonlines: 'jsonl',
  ldjson: 'jsonl',
};

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : '';
}

export function kindFromName(name: string): FileKind | null {
  return EXTENSION_KIND[extensionOf(name)] ?? null;
}

const DELIMITER_CANDIDATES = [',', ';', '\t', '|'];

/**
 * Counts candidates outside quoted regions across the first lines of the text.
 * Ties are broken by the order in `DELIMITER_CANDIDATES` (comma first).
 */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 64 * 1024);
  const counts = new Map<string, number[]>();
  for (const candidate of DELIMITER_CANDIDATES) counts.set(candidate, [0, 0, 0]);

  let lineIndex = 0;
  let inQuotes = false;
  for (let i = 0; i < sample.length && lineIndex < 3; i += 1) {
    const char = sample[i];
    if (char === '"') {
      if (inQuotes && sample[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === '\n') {
      lineIndex += 1;
      continue;
    }
    const bucket = counts.get(char);
    if (bucket) bucket[lineIndex] += 1;
  }

  let best = ',';
  let bestScore = -1;
  for (const candidate of DELIMITER_CANDIDATES) {
    const bucket = counts.get(candidate) ?? [0, 0, 0];
    const positive = bucket.filter((count) => count > 0);
    if (positive.length === 0) continue;
    // Prefer a delimiter that appears the same number of times on every line.
    const consistent = new Set(bucket.filter((count) => count >= 0)).size === 1;
    const score = bucket[0] * 10 + positive.length + (consistent ? 5 : 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Sniffs the content when the extension is missing or unreliable. */
export function sniffKind(text: string): FileKind {
  const trimmed = text.trim();
  if (!trimmed) return 'txt';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      /* fall through */
    }
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length > 1) {
    let objectLines = 0;
    for (const line of lines.slice(0, 20)) {
      const value = line.trim();
      if (!value.startsWith('{') && !value.startsWith('[')) continue;
      try {
        JSON.parse(value);
        objectLines += 1;
      } catch {
        /* ignore */
      }
    }
    if (objectLines >= Math.min(2, lines.length)) return 'jsonl';
  }

  if (lines.length >= 2) {
    const delimiter = detectDelimiter(trimmed);
    const headerCount = countOutsideQuotes(lines[0], delimiter);
    if (headerCount > 0) {
      const consistent = lines.slice(0, 10).every((line) => countOutsideQuotes(line, delimiter) === headerCount);
      if (consistent) return 'csv';
    }
  }
  return 'txt';
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (delimiter === '\t' ? char === '\t' : char === delimiter)) count += 1;
  }
  return count;
}

/* ---------------------------------------------------------------- JSON guards */

/** Measures nesting depth iteratively so a hostile file cannot blow the stack. */
export function measureJsonDepth(text: string): number {
  let depth = 0;
  let max = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') {
      depth += 1;
      if (depth > max) max = depth;
      if (max > LIMITS.maxJsonDepth) return max;
    } else if (char === '}' || char === ']') {
      depth = Math.max(0, depth - 1);
    }
  }
  return max;
}

export interface JsonParseResult {
  value: JsonValue | null;
  issue: ImportIssue | null;
}

export function parseJsonText(text: string): JsonParseResult {
  if (text.trim() === '') {
    return { value: null, issue: { code: 'empty-file', message: 'errors.emptyFile' } };
  }
  const depth = measureJsonDepth(text);
  if (depth > LIMITS.maxJsonDepth) {
    return {
      value: null,
      issue: {
        code: 'json-too-deep',
        message: 'errors.jsonTooDeep',
        detail: `depth=${depth}, limit=${LIMITS.maxJsonDepth}`,
      },
    };
  }
  try {
    return { value: JSON.parse(text) as JsonValue, issue: null };
  } catch (error) {
    return {
      value: null,
      issue: {
        code: 'json-syntax',
        message: 'errors.jsonSyntax',
        detail: describeSyntaxError(error),
      },
    };
  }
}

export function describeSyntaxError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const position = /position (\d+)/i.exec(message);
  return position ? `${message}` : message;
}

/* ------------------------------------------------------------------ JSONL */

export function parseJsonl(text: string): JsonlResult {
  const records: JsonValue[] = [];
  const errors: JsonlError[] = [];
  const lines = text.split(/\r?\n/);
  let blankLines = 0;

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === '') {
      blankLines += 1;
      return;
    }
    try {
      records.push(JSON.parse(line) as JsonValue);
    } catch (error) {
      errors.push({
        line: index + 1,
        message: describeSyntaxError(error),
        excerpt: raw.length > 120 ? `${raw.slice(0, 120)}…` : raw,
      });
    }
  });

  return { records, errors, blankLines, totalLines: lines.length };
}

/* ------------------------------------------------------------------- CSV */

export interface DelimitedParseResult {
  dataset: Dataset;
  warnings: string[];
  issue: ImportIssue | null;
}

function dedupeHeaders(raw: string[]): string[] {
  const used = new Map<string, number>();
  return raw.map((value, index) => {
    const base = value.trim() === '' ? `column_${index + 1}` : value.trim();
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

export function makeColumns(names: string[]): Column[] {
  return names.map((name, index) => ({
    id: `c${index}`,
    name,
    originalName: name,
    hidden: false,
    selected: true,
  }));
}

export interface DelimitedOptions {
  delimiter?: string;
  hasHeader?: boolean;
  inferTypes?: boolean;
  maxRows?: number;
}

export function parseDelimited(text: string, options: DelimitedOptions = {}): DelimitedParseResult {
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const hasHeader = options.hasHeader ?? true;
  const inferTypes = options.inferTypes ?? true;
  const maxRows = options.maxRows ?? LIMITS.maxRows;
  const warnings: string[] = [];

  if (text.trim() === '') {
    return {
      dataset: { columns: [], rows: [] },
      warnings,
      issue: { code: 'empty-file', message: 'errors.emptyFile' },
    };
  }

  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: 'greedy',
    newline: undefined,
  });

  const fatal = parsed.errors.find((error) => error.type === 'Quotes' || error.type === 'Delimiter');
  if (fatal) {
    return {
      dataset: { columns: [], rows: [] },
      warnings,
      issue: {
        code: 'csv-parse',
        message: 'errors.csvParse',
        detail: `row ${(fatal.row ?? 0) + 1}: ${fatal.message}`,
      },
    };
  }
  if (parsed.errors.length > 0) {
    warnings.push('warnings.csvRecovered');
  }

  const matrix = parsed.data.map((row) => (Array.isArray(row) ? row : [String(row)]));
  if (matrix.length === 0) {
    return {
      dataset: { columns: [], rows: [] },
      warnings,
      issue: { code: 'empty-file', message: 'errors.emptyFile' },
    };
  }

  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  if (width > LIMITS.maxColumns) {
    return {
      dataset: { columns: [], rows: [] },
      warnings,
      issue: {
        code: 'csv-parse',
        message: 'errors.tooManyColumns',
        detail: `columns=${width}, limit=${LIMITS.maxColumns}`,
      },
    };
  }

  const headerRow = hasHeader ? matrix[0] : null;
  const names = dedupeHeaders(headerRow ?? Array.from({ length: width }, (_, i) => `column_${i + 1}`));
  const bodyRows = hasHeader ? matrix.slice(1) : matrix;

  let truncated = false;
  const rows: CellValue[][] = [];
  for (const row of bodyRows) {
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
    const cells: CellValue[] = [];
    for (let index = 0; index < names.length; index += 1) {
      cells.push(inferCellValue(row[index] ?? '', inferTypes));
    }
    rows.push(cells);
  }
  if (truncated) warnings.push('warnings.rowLimit');
  if (bodyRows.some((row) => row.length > names.length)) warnings.push('warnings.extraCells');

  return { dataset: { columns: makeColumns(names), rows }, warnings, issue: null };
}

/** Converts any JSON shaped value into a table, documenting every structural rule. */
export interface JsonTableResult {
  dataset: Dataset;
  shape: 'records' | 'scalar-list' | 'object' | 'scalar';
  warnings: string[];
}

export function jsonToTable(value: JsonValue): JsonTableResult {
  const warnings: string[] = [];

  if (Array.isArray(value)) {
    const allObjects = value.length > 0 && value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item));
    if (allObjects) {
      const keys: string[] = [];
      const seen = new Set<string>();
      for (const item of value as Record<string, JsonValue>[]) {
        for (const key of Object.keys(item)) {
          if (!seen.has(key)) {
            seen.add(key);
            keys.push(key);
          }
        }
      }
      if (keys.length > LIMITS.maxColumns) {
        warnings.push('warnings.tooManyColumns');
      }
      const rows = (value as Record<string, JsonValue>[]).slice(0, LIMITS.maxRows).map((item) =>
        keys.map((key) => (Object.prototype.hasOwnProperty.call(item, key) ? item[key] : null)),
      );
      if (value.length > LIMITS.maxRows) warnings.push('warnings.rowLimit');
      if (value.some((item) => Object.values(item as Record<string, JsonValue>).some((cell) => cell !== null && typeof cell === 'object'))) {
        warnings.push('warnings.nestedValues');
      }
      return { dataset: { columns: makeColumns(keys), rows }, shape: 'records', warnings };
    }
    const rows = value.slice(0, LIMITS.maxRows).map((item) => [item]);
    if (value.length > LIMITS.maxRows) warnings.push('warnings.rowLimit');
    return { dataset: { columns: makeColumns(['value']), rows }, shape: 'scalar-list', warnings };
  }

  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    const row = keys.map((key) => (value as Record<string, JsonValue>)[key]);
    if (keys.some((key) => {
      const cell = (value as Record<string, JsonValue>)[key];
      return cell !== null && typeof cell === 'object';
    })) {
      warnings.push('warnings.nestedValues');
    }
    return { dataset: { columns: makeColumns(keys), rows: [row] }, shape: 'object', warnings };
  }

  return {
    dataset: { columns: makeColumns(['value']), rows: [[value]] },
    shape: 'scalar',
    warnings,
  };
}
