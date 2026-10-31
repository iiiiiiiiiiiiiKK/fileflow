import { addBom, byteLength, DEFAULT_CONVERSION_OPTIONS, serializeCsv, serializeJson, serializeJsonl, serializeTxt } from './serialize';
import { parseJsonText, jsonToTable } from './parse';
import type {
  ConversionOptions,
  ConversionResult,
  ConversionWarning,
  Dataset,
  FileKind,
  ImportIssue,
  JsonValue,
  TargetKind,
} from './types';

export interface ConversionInput {
  /** Table to serialise. Required for csv/jsonl sources and for any edited data. */
  dataset: Dataset | null;
  /** Original JSON value, when the source was JSON and the data is untouched. */
  jsonValue?: JsonValue | null;
  /** JSONL records, when the source was JSONL and the data is untouched. */
  jsonlRecords?: JsonValue[] | null;
  sourceKind: FileKind;
  target: TargetKind;
  /** Plain text of a TXT source, used by the TXT → JSON path. */
  sourceText?: string;
  baseName: string;
  options?: Partial<ConversionOptions>;
}

const EXTENSION: Record<TargetKind, string> = {
  csv: 'csv',
  json: 'json',
  jsonl: 'jsonl',
  txt: 'txt',
};

export function defaultBaseName(name: string): string {
  const withoutExtension = name.replace(/\.[a-z0-9]+$/i, '');
  return withoutExtension.trim() || 'fileflow-output';
}

export function sanitiseFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return cleaned === '' ? 'fileflow-output' : cleaned.slice(0, 120);
}

export function withExtension(name: string, kind: TargetKind): string {
  const extension = EXTENSION[kind];
  const base = name.replace(/\.[a-z0-9]+$/i, '').trim() || 'fileflow-output';
  return `${sanitiseFileName(base)}.${extension}`;
}

/** Supported pairs, used by the UI to disable impossible conversions. */
export const CONVERSION_MATRIX: Record<FileKind, TargetKind[]> = {
  csv: ['json', 'jsonl', 'txt', 'csv'],
  json: ['csv', 'jsonl', 'txt', 'json'],
  jsonl: ['json', 'csv', 'txt', 'jsonl'],
  txt: ['json', 'txt'],
};

export function optionsWithDefaults(options?: Partial<ConversionOptions>): ConversionOptions {
  return { ...DEFAULT_CONVERSION_OPTIONS, ...(options ?? {}) };
}

/**
 * Single entry point used by both the preview and the download button, so the
 * bytes a user reviews are exactly the bytes they get.
 */
export function convert(input: ConversionInput): ConversionResult {
  const options = optionsWithDefaults(input.options);
  const warnings: ConversionWarning[] = [];
  const fileName = withExtension(input.baseName, input.target);

  const fail = (issue: ImportIssue): ConversionResult => ({
    ok: false,
    text: '',
    targetKind: input.target,
    fileName,
    rowCount: 0,
    byteLength: 0,
    warnings,
    issue,
    options,
    generatedAt: Date.now(),
  });

  // TXT → JSON is only allowed when the text really is JSON.
  if (input.sourceKind === 'txt' && input.target === 'json') {
    const parsed = parseJsonText(input.sourceText ?? '');
    if (parsed.issue) {
      return fail({
        code: 'txt-not-json',
        message: 'errors.txtNotJson',
        detail: parsed.issue.detail ?? parsed.issue.message,
      });
    }
    const text = JSON.stringify(parsed.value, null, options.indent === 0 ? undefined : options.indent);
    return {
      ok: true,
      text,
      targetKind: 'json',
      fileName,
      rowCount: Array.isArray(parsed.value) ? parsed.value.length : 1,
      byteLength: byteLength(text),
      warnings,
      issue: null,
      options,
      generatedAt: Date.now(),
    };
  }

  if (input.sourceKind === 'txt' && input.target === 'txt') {
    const text = input.sourceText ?? '';
    return {
      ok: true,
      text,
      targetKind: 'txt',
      fileName,
      rowCount: text === '' ? 0 : text.split(/\r?\n/).length,
      byteLength: byteLength(text),
      warnings,
      issue: null,
      options,
      generatedAt: Date.now(),
    };
  }

  // JSON → JSON without edits keeps the original structure.
  if (input.sourceKind === 'json' && input.target === 'json' && input.dataset === null) {
    const value = input.jsonValue ?? null;
    const text = JSON.stringify(value, null, options.indent === 0 ? undefined : options.indent);
    return {
      ok: true,
      text,
      targetKind: 'json',
      fileName,
      rowCount: Array.isArray(value) ? value.length : 1,
      byteLength: byteLength(text),
      warnings,
      issue: null,
      options,
      generatedAt: Date.now(),
    };
  }

  // JSONL → JSONL without edits keeps every original record verbatim.
  if (input.sourceKind === 'jsonl' && input.target === 'jsonl' && input.dataset === null) {
    const records = input.jsonlRecords ?? [];
    const text = records.map((record) => JSON.stringify(record)).join('\n');
    return {
      ok: true,
      text,
      targetKind: 'jsonl',
      fileName,
      rowCount: records.length,
      byteLength: byteLength(text),
      warnings,
      issue: null,
      options,
      generatedAt: Date.now(),
    };
  }

  // JSONL → JSON without edits keeps every record, including non-tabular ones.
  if (input.sourceKind === 'jsonl' && input.target === 'json' && input.dataset === null) {
    const records = input.jsonlRecords ?? [];
    const text = JSON.stringify(records, null, options.indent === 0 ? undefined : options.indent);
    return {
      ok: true,
      text,
      targetKind: 'json',
      fileName,
      rowCount: records.length,
      byteLength: byteLength(text),
      warnings,
      issue: null,
      options,
      generatedAt: Date.now(),
    };
  }

  // JSON → JSONL without edits: one record per line, wrapping single values.
  if (input.sourceKind === 'json' && input.target === 'jsonl' && input.dataset === null) {
    const value = input.jsonValue ?? null;
    const records = Array.isArray(value) ? value : [value];
    const text = records.map((record) => JSON.stringify(record)).join('\n');
    return {
      ok: true,
      text,
      targetKind: 'jsonl',
      fileName,
      rowCount: records.length,
      byteLength: byteLength(text),
      warnings,
      issue: null,
      options,
      generatedAt: Date.now(),
    };
  }

  const dataset = input.dataset ?? deriveTable(input);
  if (!dataset) {
    return fail({ code: 'unknown', message: 'errors.nothingToConvert' });
  }
  if (dataset.columns.length === 0) {
    return fail({ code: 'empty-file', message: 'errors.noColumns' });
  }

  const exportableColumns = dataset.columns.filter((column) => column.selected && !column.hidden);
  if (exportableColumns.length === 0) {
    return fail({ code: 'unknown', message: 'errors.noSelectedColumns' });
  }

  if ((input.target === 'csv' || input.target === 'txt') && dataset.rows.length === 0) {
    warnings.push({ code: 'empty-rows', message: 'warnings.emptyRows' });
  }

  const structuredCells = countStructured(dataset, exportableColumns.map((column) => column.id));
  if (structuredCells > 0 && (input.target === 'csv' || input.target === 'txt')) {
    warnings.push({
      code: 'nested-values',
      message: 'warnings.nestedToText',
      detail: String(structuredCells),
    });
  }
  if (input.sourceKind === 'json' && input.target === 'csv') {
    warnings.push({ code: 'json-shape', message: 'warnings.jsonShapeCsv' });
  }
  if (options.delimiter !== ',' && input.target === 'csv') {
    warnings.push({ code: 'delimiter', message: 'warnings.customDelimiter', detail: options.delimiter });
  }

  let text = '';
  const rowCount = dataset.rows.length;
  const columnIds = exportableColumns.map((column) => column.id);
  switch (input.target) {
    case 'csv':
      text = serializeCsv(dataset, options, columnIds);
      break;
    case 'json':
      text = serializeJson(dataset, options, columnIds);
      break;
    case 'jsonl':
      text = serializeJsonl(dataset, options, columnIds);
      break;
    case 'txt':
      text = serializeTxt(dataset, options, columnIds);
      break;
  }

  return {
    ok: true,
    text,
    targetKind: input.target,
    fileName,
    rowCount,
    byteLength: byteLength(text),
    warnings,
    issue: null,
    options,
    generatedAt: Date.now(),
  };
}

function countStructured(dataset: Dataset, columnIds: string[]): number {  const indexes = dataset.columns
    .map((column, index) => (columnIds.includes(column.id) ? index : -1))
    .filter((index) => index >= 0);
  let count = 0;
  for (const row of dataset.rows) {
    for (const index of indexes) {
      const cell = row[index];
      if (cell !== null && cell !== undefined && typeof cell === 'object') count += 1;
    }
  }
  return count;
}

/** Builds the preview dataset used for a JSON source without touching the original. */
export function tableForJson(value: JsonValue): { dataset: Dataset; warnings: string[] } {
  const result = jsonToTable(value);
  return { dataset: result.dataset, warnings: result.warnings };
}

/** Last-resort table for JSON/JSONL sources when the caller passed no dataset. */
function deriveTable(input: ConversionInput): Dataset | null {
  if (input.sourceKind === 'json' && input.jsonValue !== undefined && input.jsonValue !== null) {
    return jsonToTable(input.jsonValue).dataset;
  }
  if (input.sourceKind === 'jsonl' && input.jsonlRecords && input.jsonlRecords.length > 0) {
    return jsonToTable(input.jsonlRecords).dataset;
  }
  return null;
}

export function exportWithBom(text: string, bom: boolean): string {
  return bom ? addBom(text) : text;
}

export { EXTENSION };
