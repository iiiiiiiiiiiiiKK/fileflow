import { buildImport } from './importer';
import type { ImportOutcome, ImportRequest } from './importer';

interface WorkerReply {
  id: number;
  ok: boolean;
  outcome?: ImportOutcome;
  message?: string;
}

interface PendingEntry {
  resolve: (value: ImportOutcome) => void;
  reject: (error: Error) => void;
  request: ImportRequest;
}

/** Files above this size are parsed in a Worker so the UI keeps painting. */
const WORKER_THRESHOLD = 1024 * 1024;

let worker: Worker | null = null;
let workerBroken = false;
let sequence = 0;
const pending = new Map<number, PendingEntry>();

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/import.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (reply.ok && reply.outcome) entry.resolve(reply.outcome);
      else entry.reject(new Error(reply.message ?? 'worker failed'));
    };
    worker.onerror = () => {
      // Fall back to the main thread for everything still waiting.
      workerBroken = true;
      for (const [id, entry] of pending.entries()) {
        pending.delete(id);
        try {
          entry.resolve(buildImport(entry.request));
        } catch (error) {
          entry.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

function parseInWorker(request: ImportRequest): Promise<ImportOutcome> {
  const instance = getWorker();
  if (!instance) return Promise.reject(new Error('worker-unavailable'));
  sequence += 1;
  const id = sequence;
  return new Promise<ImportOutcome>((resolve, reject) => {
    pending.set(id, { resolve, reject, request });
    instance.postMessage({ id, request });
  });
}

/** Lets the browser paint between two synchronous parses. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export interface ImportProgress {
  (info: { name: string; index: number; total: number }): void;
}

export async function importFile(file: File, signal?: AbortSignal): Promise<ImportOutcome> {
  const buffer = await file.arrayBuffer();
  if (signal?.aborted) throw new Error('aborted');
  const request: ImportRequest = { name: file.name, size: buffer.byteLength, buffer };

  if (buffer.byteLength >= WORKER_THRESHOLD) {
    try {
      return await parseInWorker(request);
    } catch {
      // Worker path failed (older browser, CSP, module worker unsupported).
      await yieldToBrowser();
      return buildImport(request);
    }
  }
  await yieldToBrowser();
  return buildImport(request);
}

export async function importFiles(
  files: File[],
  onProgress?: ImportProgress,
  signal?: AbortSignal,
): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];
  for (let index = 0; index < files.length; index += 1) {
    if (signal?.aborted) break;
    onProgress?.({ name: files[index].name, index: index + 1, total: files.length });
    outcomes.push(await importFile(files[index], signal));
  }
  return outcomes;
}

export function disposeImportWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}
