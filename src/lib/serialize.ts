import Papa from 'papaparse';
import { cellToText } from './infer';
import type { CellValue, ConversionOptions, Dataset, JsonValue } from './types';

export const DEFAULT_CONVERSION_OPTIONS: ConversionOptions = {
  delimiter: ',',
  includeHeader: true,
  quoteAll: false,
  crlf: false,
  indent: 2,
  nullAsText: false,
  inferTypes: true,
  bom: false,
};

/** Turns a structured cell back into JSON, so nothing is silently flattened. */
function cellToJson(cell: CellValue | undefined): JsonValue {
  if (cell === undefined) return null;
  return cell;
}

export interface RecordsResult {
  headers: string[];
  records: Record<string, JsonValue>[];
  structuredCells: number;
}

export function datasetToRecords(dataset: Dataset, columnIds?: string[]): RecordsResult {
  const keep: number[] = [];
  dataset.columns.forEach((column, index) => {
    const selected = columnIds ? columnIds.includes(column.id) : column.selected && !column.hidden;
    if (selected) keep.push(index);
  });
  const headers = keep.map((index) => dataset.columns[index].name);
  let structuredCells = 0;
  const records = dataset.rows.map((row) => {
    const record: Record<string, JsonValue> = {};
    keep.forEach((index, position) => {
      const cell = cellToJson(row[index]);
      if (cell !== null && typeof cell === 'object') structuredCells += 1;
      record[headers[position]] = cell;
    });
    return record;
  });
  return { headers, records, structuredCells };
}

export function serializeCsv(dataset: Dataset, options: ConversionOptions, columnIds?: string[]): string {
  const keep: number[] = [];
  dataset.columns.forEach((column, index) => {
    const selected = columnIds ? columnIds.includes(column.id) : column.selected && !column.hidden;
    if (selected) keep.push(index);
  });
  const fields = keep.map((index) => dataset.columns[index].name);
  const data = dataset.rows.map((row) =>
    keep.map((index) => {
      const cell = row[index];
      if (cell === null) return options.nullAsText ? 'NULL' : '';
      if (cell === undefined) return '';
      return cellToText(cell);
    }),
  );

  const config: Papa.UnparseConfig = {
    delimiter: options.delimiter,
    newline: options.crlf ? '\r\n' : '\n',
    quotes: options.quoteAll ? true : false,
  };
  if (options.includeHeader) {
    return Papa.unparse({ fields, data }, config);
  }
  return Papa.unparse({ fields: [], data }, config);
}

export function serializeJson(dataset: Dataset, options: ConversionOptions, columnIds?: string[]): string {
  const { records } = datasetToRecords(dataset, columnIds);
  return JSON.stringify(records, null, options.indent === 0 ? undefined : options.indent);
}

export function serializeJsonl(dataset: Dataset, _options: ConversionOptions, columnIds?: string[]): string {
  const { records } = datasetToRecords(dataset, columnIds);
  return records.map((record) => JSON.stringify(record)).join('\n');
}

export function serializeTxt(dataset: Dataset, options: ConversionOptions, columnIds?: string[]): string {
  const keep: number[] = [];
  dataset.columns.forEach((column, index) => {
    const selected = columnIds ? columnIds.includes(column.id) : column.selected && !column.hidden;
    if (selected) keep.push(index);
  });
  const lines: string[] = [];
  if (options.includeHeader) lines.push(keep.map((index) => dataset.columns[index].name).join('\t'));
  for (const row of dataset.rows) {
    lines.push(
      keep
        .map((index) => {
          const cell = row[index];
          if (cell === null) return options.nullAsText ? 'NULL' : '';
          return cellToText(cell).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
        })
        .join('\t'),
    );
  }
  return lines.join(options.crlf ? '\r\n' : '\n');
}

export function addBom(text: string): string {
  return text.startsWith('\ufeff') ? text : `\ufeff${text}`;
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
