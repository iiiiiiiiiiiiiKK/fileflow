import { addBom } from './serialize';
import type { TargetKind } from './types';

export const MIME_BY_KIND: Record<TargetKind, string> = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
  jsonl: 'application/x-ndjson;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
};

/**
 * Appends `-2`, `-3`, … until the name is unique inside `used`.
 * Collisions are real: exporting in1.csv as JSON and in1.json as CSV is common.
 */
export function ensureUniqueName(name: string, used: Set<string>): string {
  if (!used.has(name.toLowerCase())) {
    used.add(name.toLowerCase());
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let counter = 2;
  let candidate = `${base}-${counter}${extension}`;
  while (used.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${base}-${counter}${extension}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export interface PreparedExport {
  fileName: string;
  text: string;
  mime: string;
  byteLength: number;
}

export function prepareExport(fileName: string, text: string, kind: TargetKind, bom: boolean): PreparedExport {
  const payload = kind === 'json' || kind === 'jsonl' ? text : bom ? addBom(text) : text;
  return {
    fileName,
    text: payload,
    mime: MIME_BY_KIND[kind],
    byteLength: new TextEncoder().encode(payload).length,
  };
}

export function triggerDownload(prepared: PreparedExport): void {
  const blob = new Blob([prepared.text], { type: prepared.mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = prepared.fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1500);
}

export interface ZipEntry {
  fileName: string;
  text: string;
}

export interface ZipResult {
  ok: boolean;
  bytes: number;
  error: string | null;
}

/** Builds the ZIP in memory with JSZip (loaded on demand to keep the bundle lean). */
export async function buildZip(entries: ZipEntry[], limit: number): Promise<{ blob: Blob | null; result: ZipResult }> {
  const total = entries.reduce((sum, entry) => sum + new TextEncoder().encode(entry.text).length, 0);
  if (total > limit) {
    return { blob: null, result: { ok: false, bytes: total, error: 'errors.zipTooLarge' } };
  }
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.fileName, entry.text);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, result: { ok: true, bytes: blob.size, error: null } };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1500);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'true');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
