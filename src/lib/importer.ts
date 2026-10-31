import { LIMITS } from './limits';
import {
  kindFromName,
  decodeBytes,
  detectDelimiter,
  parseDelimited,
  parseJsonText,
  parseJsonl,
  sniffKind,
  extensionOf,
} from './parse';
import type { Dataset, Encoding, FileKind, ImportIssue, ImportedFile, SourceDocument } from './types';
import { jsonToTable } from './parse';

export interface ImportRequest {
  name: string;
  size: number;
  buffer: ArrayBuffer;
  /** Overrides content sniffing, e.g. the user said "treat this as CSV". */
  forcedKind?: FileKind | null;
}

export interface ImportOutcome {
  file: ImportedFile;
  dataset: Dataset | null;
}

/** Heuristic used to refuse binary files that happen to decode as text. */
function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4096);
  if (sample.length === 0) return false;
  let control = 0;
  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code === 0xfffd) control += 1;
  }
  return control / sample.length > 0.02;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `f${Date.now().toString(36)}${counter.toString(36)}`;
}

/**
 * Single, synchronous, side-effect free import pipeline.
 * Runs on the main thread for small files and inside a Worker for large ones
 * (see `src/lib/importClient.ts`), which keeps both paths identical.
 */
export function buildImport(request: ImportRequest): ImportOutcome {
  const { name, buffer } = request;
  const size = buffer.byteLength;
  const base: Omit<ImportedFile, 'kind' | 'encoding' | 'text' | 'document' | 'issue' | 'warnings'> = {
    id: nextId(),
    name,
    size,
    extension: extensionOf(name).toUpperCase(),
    importedAt: Date.now(),
  };

  const fail = (kind: FileKind, encoding: Encoding, issue: ImportIssue): ImportOutcome => ({
    file: {
      ...base,
      kind,
      encoding,
      text: '',
      document: null,
      issue,
      warnings: [],
    },
    dataset: null,
  });

  if (size === 0) {
    return fail('txt', 'utf-8', { code: 'empty-file', message: 'errors.emptyFile' });
  }
  if (size > LIMITS.maxFileSize) {
    return fail('txt', 'utf-8', {
      code: 'too-large',
      message: 'errors.tooLarge',
      detail: `${size} bytes > ${LIMITS.maxFileSize} bytes`,
    });
  }

  const decoded = decodeBytes(buffer);
  if (decoded.issue) {
    const kind = request.forcedKind ?? kindFromName(name) ?? 'txt';
    return fail(kind, decoded.encoding, decoded.issue);
  }

  const text = decoded.text;
  const warnings: string[] = [];
  if (decoded.warning) warnings.push(decoded.warning);

  const declaredKind = kindFromName(name);
  const extension = extensionOf(name);

  // An explicit, unsupported extension is reported rather than silently parsed
  // as plain text (a .zip or .xlsx would otherwise "import" as garbage).
  if (!request.forcedKind && extension !== '' && declaredKind === null) {
    return fail('txt', decoded.encoding, {
      code: 'unsupported-format',
      message: 'errors.unsupportedFormat',
      detail: `.${extension}`,
    });
  }

  // Binary content without a usable extension is refused for the same reason.
  if (!request.forcedKind && declaredKind === null && looksBinary(text)) {
    return fail('txt', decoded.encoding, { code: 'unsupported-format', message: 'errors.unsupportedFormat' });
  }

  const kind: FileKind = request.forcedKind ?? declaredKind ?? sniffKind(text);

  if (!declaredKind && !request.forcedKind) {
    warnings.push('warnings.detectedByContent');
  }

  if (text.trim() === '') {
    return fail(kind, decoded.encoding, { code: 'empty-file', message: 'errors.emptyFile' });
  }

  let document: SourceDocument | null = null;
  let dataset: Dataset | null = null;
  let issue: ImportIssue | null = null;

  if (kind === 'csv') {
    const delimiter = detectDelimiter(text);
    const parsed = parseDelimited(text, { delimiter });
    if (parsed.issue) {
      issue = parsed.issue;
    } else {
      document = { kind: 'csv', dataset: parsed.dataset, delimiter, hadHeader: true };
      dataset = parsed.dataset;
      warnings.push(...parsed.warnings);
      if (parsed.dataset.columns.length === 0) {
        issue = { code: 'empty-file', message: 'errors.emptyFile' };
      }
    }
  } else if (kind === 'json') {
    const parsed = parseJsonText(text);
    if (parsed.issue) {
      issue = parsed.issue;
    } else {
      document = { kind: 'json', value: parsed.value };
      const table = jsonToTable(parsed.value ?? null);
      warnings.push(...table.warnings);
      dataset = null; // the original JSON value stays authoritative until edited
    }
  } else if (kind === 'jsonl') {
    const result = parseJsonl(text);
    if (result.records.length === 0 && result.errors.length > 0) {
      issue = {
        code: 'json-syntax',
        message: 'errors.jsonlSyntax',
        detail: `line ${result.errors[0].line}: ${result.errors[0].message}`,
      };
    } else {
      document = { kind: 'jsonl', result };
      if (result.errors.length > 0) warnings.push('warnings.jsonlPartial');
      dataset = null;
    }
  } else {
    document = { kind: 'txt', text };
    dataset = null;
  }

  return {
    file: {
      ...base,
      kind,
      encoding: decoded.encoding,
      text,
      document: issue ? null : document,
      issue,
      warnings,
    },
    dataset,
  };
}

/** Derives a table view for sources that are not tables by nature. */
export function deriveDataset(file: ImportedFile): Dataset | null {
  if (!file.document) return null;
  if (file.document.kind === 'csv') return file.document.dataset;
  if (file.document.kind === 'json') {
    return jsonToTable(file.document.value).dataset;
  }
  if (file.document.kind === 'jsonl') {
    const records = file.document.result.records;
    const table = jsonToTable(records);
    if (table.dataset.columns.length === 0 && table.dataset.rows.length === 0) return null;
    return table.dataset;
  }
  return null;
}
