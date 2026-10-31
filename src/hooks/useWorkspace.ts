import { useCallback, useState } from 'react';
import { importFiles as runImport } from '../lib/importClient';
import type { ImportOutcome } from '../lib/importer';
import { deriveDataset } from '../lib/importer';
import { cloneDataset } from '../lib/table';
import { LIMITS } from '../lib/limits';
import type { Dataset, FileSession, ImportedFile, ViewState } from '../lib/types';

export function createSession(outcome: ImportOutcome): FileSession {
  const dataset = outcome.dataset ? cloneDataset(outcome.dataset) : null;
  const derived = dataset ?? (outcome.file.issue ? null : deriveDataset(outcome.file));
  return {
    history: [],
    dataset: dataset ?? (derived ? cloneDataset(derived) : null),
    original: derived ? cloneDataset(derived) : null,
    view: { search: '', filterColumnId: null, sort: null, page: 0 },
    lastConversion: null,
  };
}

export interface WorkspaceApi {
  files: ImportedFile[];
  sessions: Record<string, FileSession>;
  activeId: string | null;
  activeFile: ImportedFile | null;
  activeSession: FileSession | null;
  importing: { name: string; index: number; total: number } | null;
  addFiles: (incoming: FileList | File[]) => Promise<ImportOutcome[]>;
  removeFile: (id: string) => void;
  clearAll: () => void;
  setActiveId: (id: string | null) => void;
  patchSession: (id: string, patch: Partial<FileSession>) => void;
  updateView: (id: string, patch: Partial<ViewState>) => void;
  commitDataset: (id: string, next: Dataset, label: string) => void;
  undo: (id: string) => { ok: boolean; label: string | null };
  restoreOriginal: (id: string) => void;
  getSession: (id: string) => FileSession | null;
}

function emptySession(): FileSession {
  return {
    history: [],
    dataset: null,
    original: null,
    view: { search: '', filterColumnId: null, sort: null, page: 0 },
    lastConversion: null,
  };
}

export function useWorkspace(): WorkspaceApi {
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [sessions, setSessions] = useState<Record<string, FileSession>>({});
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ name: string; index: number; total: number } | null>(null);

  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const accepted = list.slice(0, LIMITS.maxFiles);
    if (accepted.length === 0) return [];
    const outcomes = await runImport(accepted, (info) => setImporting(info));
    setImporting(null);

    if (outcomes.length > 0) {
      setFiles((current) => {
        const next = [...current];
        for (const outcome of outcomes) {
          const existing = next.findIndex((file) => file.name === outcome.file.name && file.size === outcome.file.size);
          if (existing >= 0) next.splice(existing, 1);
          next.unshift(outcome.file);
        }
        return next;
      });
      setSessions((current) => {
        const next = { ...current };
        for (const outcome of outcomes) next[outcome.file.id] = createSession(outcome);
        return next;
      });
      const first = outcomes[outcomes.length - 1]?.file.id;
      if (first) setActiveIdState(first);
    }
    return outcomes;
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id));
    setSessions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setActiveIdState((current) => (current === id ? null : current));
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    setSessions({});
    setActiveIdState(null);
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
  }, []);

  const patchSession = useCallback((id: string, patch: Partial<FileSession>) => {
    setSessions((current) => {
      const base = current[id] ?? emptySession();
      return { ...current, [id]: { ...base, ...patch } };
    });
  }, []);

  const updateView = useCallback((id: string, patch: Partial<ViewState>) => {
    setSessions((current) => {
      const base = current[id] ?? emptySession();
      const view = { ...base.view, ...patch };
      if (patch.search !== undefined || patch.sort !== undefined || patch.filterColumnId !== undefined) view.page = 0;
      return { ...current, [id]: { ...base, view } };
    });
  }, []);

  const commitDataset = useCallback((id: string, next: Dataset, label: string) => {
    setSessions((current) => {
      const base = current[id] ?? emptySession();
      const snapshot = base.dataset ? cloneDataset(base.dataset) : null;
      const history = snapshot ? [...base.history, { label, dataset: snapshot }] : base.history.slice();
      while (history.length > LIMITS.historyDepth) history.shift();
      return {
        ...current,
        [id]: { ...base, dataset: next, history, lastConversion: null },
      };
    });
  }, []);

  const undo = useCallback((id: string) => {
    let label: string | null = null;
    setSessions((current) => {
      const base = current[id];
      if (!base || base.history.length === 0) return current;
      const history = base.history.slice();
      const entry = history.pop();
      if (!entry) return current;
      label = entry.label;
      return { ...current, [id]: { ...base, dataset: entry.dataset, history, lastConversion: null } };
    });
    return { ok: label !== null, label };
  }, []);

  const restoreOriginal = useCallback((id: string) => {
    setSessions((current) => {
      const base = current[id];
      if (!base || !base.original) return current;
      return {
        ...current,
        [id]: {
          ...base,
          dataset: cloneDataset(base.original),
          history: [],
          view: { search: '', filterColumnId: null, sort: null, page: 0 },
          lastConversion: null,
        },
      };
    });
  }, []);

  const getSession = useCallback((id: string) => sessions[id] ?? null, [sessions]);

  const activeFile = files.find((file) => file.id === activeId) ?? null;
  const activeSession = activeId ? sessions[activeId] ?? null : null;

  return {
    files,
    sessions,
    activeId,
    activeFile,
    activeSession,
    importing,
    addFiles,
    removeFile,
    clearAll,
    setActiveId,
    patchSession,
    updateView,
    commitDataset,
    undo,
    restoreOriginal,
    getSession,
  };
}
