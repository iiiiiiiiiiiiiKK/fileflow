import type { CellValue, Dataset, FileSession, ImportedFile } from '../lib/types';

export type ToastFn = (message: string, tone?: 'success' | 'error' | 'info' | 'warning') => void;

export interface PanelProps {
  file: ImportedFile;
  session: FileSession;
  /** Table currently in use (derived for JSON/JSONL sources). */
  dataset: Dataset | null;
  /** Rows after search + sorting, in display order. */
  viewRows: CellValue[][];
  /** Total rows in the dataset (before the view filter). */
  totalRows: number;
  onCommit: (next: Dataset, label: string) => void;
  onToast: ToastFn;
}
