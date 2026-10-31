/** Hard limits that keep the tab responsive and protect memory. */
export const LIMITS = {
  /** 25 MB per file — beyond this parsing in a single tab becomes unreliable. */
  maxFileSize: 25 * 1024 * 1024,
  /** Import at most this many files at once. */
  maxFiles: 12,
  /** Table rows kept in memory. */
  maxRows: 200_000,
  /** Columns kept in memory. */
  maxColumns: 512,
  /** CSV cells scanned per file while parsing. */
  maxCells: 4_000_000,
  /** Deepest JSON structure accepted (guards against stack blow-ups). */
  maxJsonDepth: 64,
  /** Characters of a very long cell rendered in the grid before truncation. */
  cellPreviewChars: 400,
  /** Rows rendered per table page. */
  pageSize: 100,
  /** Undo depth per file. */
  historyDepth: 30,
  /** Rows used for "value distribution" statistics. */
  statsSampleRows: 50_000,
  /** Largest ZIP we are willing to assemble in memory. */
  maxZipBytes: 120 * 1024 * 1024,
} as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US').format(value);
}
