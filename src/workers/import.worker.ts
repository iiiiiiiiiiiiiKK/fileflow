/// <reference lib="webworker" />
import { buildImport } from '../lib/importer';
import type { ImportRequest } from '../lib/importer';

interface WorkerRequest {
  id: number;
  request: ImportRequest;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const outcome = buildImport(request);
    (self as unknown as Worker).postMessage({ id, ok: true, outcome });
  } catch (error) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
