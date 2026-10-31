/** Core domain types for FileFlow. Everything below is browser-local. */

export type Primitive = string | number | boolean | null;

export type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue };

/** A single table cell. Structured values (objects/arrays) are preserved verbatim. */
export type CellValue = JsonValue;

export type FileKind = 'csv' | 'json' | 'jsonl' | 'txt';

export type Encoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'gb18030';

export interface Column {
  /** Stable id that survives renames and reordering. */
  id: string;
  /** Display / export name (user editable). */
  name: string;
  /** Name as it was read from the file. */
  originalName: string;
  hidden: boolean;
  /** Included in exports. */
  selected: boolean;
}

export interface Dataset {
  columns: Column[];
  rows: CellValue[][];
}

export interface JsonlError {
  /** 1-based line number in the source text. */
  line: number;
  message: string;
  /** First ~120 characters of the offending line. */
  excerpt: string;
}

export interface JsonlResult {
  records: JsonValue[];
  errors: JsonlError[];
  blankLines: number;
  totalLines: number;
}

export type SourceDocument =
  | { kind: 'csv'; dataset: Dataset; delimiter: string; hadHeader: boolean }
  | { kind: 'json'; value: JsonValue }
  | { kind: 'jsonl'; result: JsonlResult }
  | { kind: 'txt'; text: string };

export type ImportStage = 'reading' | 'decoding' | 'parsing' | 'ready' | 'error';

export interface ImportIssue {
  code:
    | 'unsupported-encoding'
    | 'unsupported-format'
    | 'empty-file'
    | 'too-large'
    | 'json-syntax'
    | 'json-too-deep'
    | 'csv-parse'
    | 'txt-not-json'
    | 'unknown';
  /** i18n key for a human readable explanation. */
  message: string;
  /** Optional technical detail (never HTML). */
  detail?: string;
}

export interface ImportedFile {
  id: string;
  name: string;
  size: number;
  kind: FileKind;
  /** Text detected from the extension, e.g. "CSV". */
  extension: string;
  encoding: Encoding;
  /** Decoded source text — the pristine copy, never mutated by any operation. */
  text: string;
  document: SourceDocument | null;
  issue: ImportIssue | null;
  warnings: string[];
  importedAt: number;
}

export interface FileSession {
  /** Undo stack of previous dataset snapshots (most recent last). */
  history: { label: string; dataset: Dataset }[];
  /** Dataset currently being edited (a deep copy of the parsed result). */
  dataset: Dataset | null;
  /** Pristine parse result, used by "restore original". */
  original: Dataset | null;
  /** Non destructive view state. */
  view: ViewState;
  /** Pending result produced by a conversion preview. */
  lastConversion: ConversionResult | null;
}

export interface ViewState {
  search: string;
  /** Restricts the search to one column; `null` searches every column. */
  filterColumnId: string | null;
  sort: { columnId: string; direction: 'asc' | 'desc' } | null;
  /** Index of the visible page (0 based) for the paginated table. */
  page: number;
}

export interface ColumnStat {
  columnId: string;
  name: string;
  total: number;
  empty: number;
  nulls: number;
  distinct: number;
  numeric: number;
  min: number | null;
  max: number | null;
  average: number | null;
  minLength: number | null;
  maxLength: number | null;
  averageLength: number | null;
  guessedType: 'number' | 'text' | 'boolean' | 'mixed' | 'empty';
  topValues: { value: string; count: number }[];
}

export interface DatasetStats {
  rows: number;
  columns: number;
  emptyCells: number;
  duplicateRows: number;
  perColumn: ColumnStat[];
}

export type TargetKind = 'csv' | 'json' | 'jsonl' | 'txt';

export interface ConversionOptions {
  /** CSV output */
  delimiter: string;
  includeHeader: boolean;
  quoteAll: boolean;
  crlf: boolean;
  /** JSON output */
  indent: 2 | 4 | 0;
  /** Root array vs. object-per-line */
  nullAsText: boolean;
  /** Keep numbers/booleans/null typed when parsing text input. */
  inferTypes: boolean;
  /** Prefix the export with a UTF-8 BOM. */
  bom: boolean;
}

export interface ConversionWarning {
  code: string;
  message: string;
  /** Optional extra context such as a column name. */
  detail?: string;
}

export interface ConversionResult {
  ok: boolean;
  text: string;
  targetKind: TargetKind;
  fileName: string;
  rowCount: number;
  byteLength: number;
  warnings: ConversionWarning[];
  issue: ImportIssue | null;
  options: ConversionOptions;
  generatedAt: number;
}
