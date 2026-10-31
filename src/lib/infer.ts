import type { CellValue, Primitive } from './types';

/**
 * Conservative value sniffing for text based sources (CSV / TXT columns).
 *
 * Design rules — every one of them exists to avoid destroying meaning:
 *  - empty text stays an empty string; it is never turned into `null` or `0`;
 *  - leading zeros are preserved (postal codes, "00123" account numbers);
 *  - long digit strings are preserved (phone numbers, national IDs) because a
 *    JS number cannot hold them losslessly;
 *  - only `true` / `false` become booleans, not "yes", "Y", "1";
 *  - the literals `null`, `NULL`, `NaN` stay text so the user, not the tool,
 *    decides what they mean;
 *  - anything ambiguous stays a string, which is always lossless.
 */

const BOOLEAN_TRUE = new Set(['true']);
const BOOLEAN_FALSE = new Set(['false']);

/** Maximum digits for an integer to be safely representable as a JS number. */
const MAX_SAFE_DIGITS = 15;

const INTEGER_RE = /^-?\d+$/;
const DECIMAL_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export function isBlankText(value: string): boolean {
  return value.trim() === '';
}

export function looksLikeNumber(text: string): boolean {
  if (!text) return false;
  if (!DECIMAL_RE.test(text)) return false;
  if (INTEGER_RE.test(text)) {
    const digits = text.startsWith('-') ? text.slice(1) : text;
    if (digits.length > 1 && digits.startsWith('0')) return false;
    if (digits.replace(/^0+(?=\d)/, '').length > MAX_SAFE_DIGITS) return false;
    const num = Number(text);
    return Number.isSafeInteger(num);
  }
  // Decimals: `01.5` is rejected by DECIMAL_RE, `0.5` accepted.
  const num = Number(text);
  return Number.isFinite(num);
}

/**
 * Converts a raw text cell into a typed value.
 * When `infer` is false the text is returned untouched.
 */
export function inferCellValue(text: string, infer = true): CellValue {
  if (!infer || text === '') return text;
  if (looksLikeNumber(text)) return Number(text);
  const lower = text.toLowerCase();
  if (BOOLEAN_TRUE.has(lower)) return true;
  if (BOOLEAN_FALSE.has(lower)) return false;
  return text;
}

/** Infers a column type from a sample of already typed cells. */
export function guessColumnType(
  values: CellValue[],
): 'number' | 'text' | 'boolean' | 'mixed' | 'empty' {
  let seen = 0;
  let numbers = 0;
  let booleans = 0;
  let strings = 0;
  let structures = 0;
  for (const value of values) {
    if (value === null || value === '' || value === undefined) continue;
    seen += 1;
    if (typeof value === 'number') numbers += 1;
    else if (typeof value === 'boolean') booleans += 1;
    else if (typeof value === 'string') strings += 1;
    else structures += 1;
  }
  if (seen === 0) return 'empty';
  if (structures > 0) return 'mixed';
  if (strings === 0 && numbers === 0) return 'boolean';
  if (strings === 0 && booleans === 0) return 'number';
  if (numbers === 0 && booleans === 0) return 'text';
  return 'mixed';
}

/** Renders any cell as the text that CSV / TXT output needs (lossless for scalars). */
export function cellToText(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Strict, single-line preview used by the virtualised grid. */
export function cellPreview(value: CellValue | undefined, max = 400): string {
  const text = cellToText(value);
  const single = text.replace(/\r?\n/g, ' ⏎ ');
  return single.length > max ? `${single.slice(0, max)}…` : single;
}

export function isStructured(value: CellValue | undefined): boolean {
  return value !== null && typeof value === 'object';
}

/** Human readable cell type, used by the field and statistics panels. */
export function describeCellType(value: CellValue | undefined): 'empty' | 'null' | 'number' | 'boolean' | 'text' | 'structured' {
  if (value === undefined || value === '') return 'empty';
  if (value === null) return 'null';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'text';
  return 'structured';
}

/** Case/diacritic-insensitive key used for duplicate detection and search. */
export function normaliseForMatch(value: CellValue | undefined): string {
  return cellToText(value).trim().toLowerCase();
}

export function toPrimitive(value: CellValue | undefined): Primitive {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}
