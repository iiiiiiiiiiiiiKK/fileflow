import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { DataTable } from './DataTable';
import { Dropzone } from './Dropzone';
import { JsonView } from './JsonView';
import { TextView } from './TextView';
import { ConvertPanel } from './ConvertPanel';
import { CleanPanel } from './CleanPanel';
import { ExportPanel } from './ExportPanel';
import type { ExportEntry } from './ExportPanel';
import { FieldsPanel } from './FieldsPanel';
import { StatsPanel } from './StatsPanel';
import { InfoPanel } from './InfoPanel';
import type { ToastFn } from './panelTypes';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { WorkspaceApi } from '../hooks/useWorkspace';
import { deriveDataset } from '../lib/importer';
import { computeVisible, removeRowsAt } from '../lib/table';
import { formatBytes, formatNumber } from '../lib/limits';
import type { CellValue, Dataset, ImportedFile, ViewState } from '../lib/types';

type ToolId = 'convert' | 'clean' | 'export';
type PanelTab = 'info' | 'fields' | 'stats';
type MobileTab = 'files' | 'data' | 'tools' | 'panel';
type ViewMode = 'table' | 'json' | 'text';

export interface WorkspaceProps {
  workspace: WorkspaceApi;
  onToast: ToastFn;
  onHome: () => void;
}

const TOOL_LABEL: Record<ToolId, MessageKey> = {
  convert: 'workspace.toolConvert',
  clean: 'workspace.toolClean',
  export: 'workspace.toolExport',
};

const PANEL_LABEL: Record<PanelTab, MessageKey> = {
  info: 'workspace.panelInfo',
  fields: 'workspace.panelFields',
  stats: 'workspace.panelStats',
};

const KIND_ICON = { csv: 'table', json: 'tree', jsonl: 'tree', txt: 'text' } as const;

function kindOf(file: ImportedFile): string {
  return file.extension || file.kind.toUpperCase();
}

export function Workspace({ workspace, onToast, onHome }: WorkspaceProps) {
  const { t } = useI18n();
  const compact = useMediaQuery('(max-width: 899px)');
  const { files, activeId, activeFile, activeSession, importing, sessions, setActiveId, removeFile, clearAll, addFiles, updateView, commitDataset, undo, restoreOriginal } = workspace;

  const [tool, setTool] = useState<ToolId | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('info');
  const [mobileTab, setMobileTab] = useState<MobileTab>('data');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [confirmRestore, setConfirmRestore] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const session = activeSession;
  const view = useMemo<ViewState>(() => session?.view ?? { search: '', filterColumnId: null, sort: null, page: 0 }, [session]);

  const dataset: Dataset | null = useMemo(() => {
    if (!activeFile || !session) return null;
    if (session.dataset) return session.dataset;
    return deriveDataset(activeFile);
  }, [activeFile, session]);

  const visible = useMemo(() => (dataset ? computeVisible(dataset, view) : { rows: [] as CellValue[][], indexes: [] as number[], filtered: false, sorted: false }), [dataset, view]);

  useEffect(() => {
    setSelectedRows(new Set());
    setConfirmRestore(false);
  }, [activeId]);

  useEffect(() => {
    if (!activeFile) return;
    if (activeFile.kind === 'csv') setViewMode('table');
    else if (activeFile.kind === 'txt') setViewMode('text');
    else setViewMode('json');
  }, [activeFile]);

  const jsonValue = useMemo(() => {
    if (!activeFile?.document) return null;
    if (activeFile.document.kind === 'json') return activeFile.document.value;
    if (activeFile.document.kind === 'jsonl') return activeFile.document.result.records;
    return null;
  }, [activeFile]);

  const entries: ExportEntry[] = useMemo(
    () =>
      files.map((file) => {
        const fileSession = sessions[file.id];
        const fileDataset = fileSession?.dataset ?? deriveDataset(file);
        const rows = fileDataset ? computeVisible(fileDataset, fileSession?.view ?? { search: '', filterColumnId: null, sort: null, page: 0 }).rows : [];
        return { file, dataset: fileDataset, rows };
      }),
    [files, sessions],
  );

  const handleSort = useCallback(
    (columnId: string, direction: 'asc' | 'desc') => {
      if (!activeId) return;
      updateView(activeId, { sort: { columnId, direction } });
    },
    [activeId, updateView],
  );

  const clearSort = useCallback(() => {
    if (!activeId) return;
    updateView(activeId, { sort: null });
  }, [activeId, updateView]);

  const pageChange = useCallback(
    (page: number) => {
      if (!activeId) return;
      updateView(activeId, { page });
    },
    [activeId, updateView],
  );

  const performUndo = () => {
    if (!activeId) return;
    const result = undo(activeId);
    if (result.ok) onToast(t('workspace.undoDone', { label: result.label ?? '' }), 'info');
    else onToast(t('workspace.undoEmpty'), 'warning');
  };

  const performRestore = () => {
    if (!activeId) return;
    if (!confirmRestore) {
      setConfirmRestore(true);
      return;
    }
    restoreOriginal(activeId);
    setConfirmRestore(false);
    onToast(t('workspace.restored'), 'success');
  };

  const deleteSelected = () => {
    if (!activeId || !dataset || selectedRows.size === 0) return;
    const result = removeRowsAt(dataset, [...selectedRows]);
    commitDataset(activeId, result.dataset, t('history.deleteRows'));
    setSelectedRows(new Set());
    onToast(`${t('history.deleteRows')} · ${result.count}`, 'success');
  };

  const fileList = (
    <div className="pane pane--files">
      <div className="pane__head">
        <h2>
          {t('workspace.filesTitle')}
          <span className="pane__count">{files.length}</span>
        </h2>
        <div className="pane__head-actions">
          <button type="button" className="icon-button icon-button--tiny" onClick={() => fileInputRef.current?.click()} title={t('workspace.addFiles')} aria-label={t('workspace.addFiles')}>
            <Icon name="plus" size={14} />
          </button>
          {files.length > 0 && (
            <button type="button" className="icon-button icon-button--tiny" onClick={clearAll} title={t('workspace.clearAll')} aria-label={t('workspace.clearAll')}>
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="visually-hidden"
        accept=".csv,.tsv,.txt,.json,.jsonl,.ndjson,.jsonlines,.ldjson"
        onChange={async (event) => {
          if (event.target.files) await addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {importing && (
        <p className="pane__progress">
          <Icon name="refresh" size={13} />
          {t('workspace.importProgress', { name: importing.name })}
        </p>
      )}

      {files.length === 0 ? (
        <div className="pane__empty">
          <p>{t('workspace.emptyTitle')}</p>
          <span>{t('workspace.emptyBody')}</span>
        </div>
      ) : (
        <ul className="file-list">
          {files.map((file) => {
            const fileSession = sessions[file.id];
            const modified = Boolean(fileSession?.history.length);
            return (
              <li key={file.id}>
                <div className={`file-item${file.id === activeId ? ' is-active' : ''}${file.issue ? ' is-error' : ''}`}>
                  <button type="button" className="file-item__main" onClick={() => setActiveId(file.id)}>
                    <span className={`file-item__icon file-item__icon--${file.kind}`}>
                      <Icon name={KIND_ICON[file.kind]} size={14} />
                    </span>
                    <span className="file-item__text">
                      <span className="file-item__name" title={file.name}>
                        {file.name}
                      </span>
                      <span className="file-item__meta">
                        {kindOf(file)} · {formatBytes(file.size)}
                        {modified && <span className="file-item__badge">{t('workspace.modifiedLabel')}</span>}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--tiny file-item__remove"
                    onClick={() => removeFile(file.id)}
                    aria-label={t('common.remove')}
                    title={t('common.remove')}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pane__tools">
        <button type="button" className="tool-button" onClick={() => fileInputRef.current?.click()}>
          <Icon name="upload" size={14} />
          {t('workspace.addFiles')}
        </button>
        {(['convert', 'clean', 'export'] as ToolId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`tool-button${tool === id ? ' is-active' : ''}`}
            onClick={() => {
              setTool(id);
              if (compact) setMobileTab('tools');
            }}
            disabled={!activeFile}
          >
            <Icon name={id === 'convert' ? 'swap' : id === 'clean' ? 'wand' : 'download'} size={14} />
            {t(TOOL_LABEL[id])}
          </button>
        ))}
      </div>
    </div>
  );

  const previewArea = !activeFile ? (
    <div className="pane pane--preview">
      <div className="workspace-empty">
        <Dropzone onFiles={(list) => void addFiles(list)} busy={Boolean(importing)} />
      </div>
    </div>
  ) : (
    <div className="pane pane--preview">
      <div className="preview-head">
        <div className="preview-head__title">
          <span className={`file-item__icon file-item__icon--${activeFile.kind}`}>
            <Icon name={KIND_ICON[activeFile.kind]} size={14} />
          </span>
          <div>
            <h2 title={activeFile.name}>{activeFile.name}</h2>
            <p>
              {activeFile.kind.toUpperCase()} · {formatBytes(activeFile.size)} · {activeFile.encoding.toUpperCase()}
              {dataset ? ` · ${formatNumber(dataset.rows.length)} × ${formatNumber(dataset.columns.length)}` : ''}
            </p>
          </div>
        </div>

        <div className="preview-head__actions">
          <div className="segmented segmented--small" role="tablist">
            {dataset && (
              <button type="button" role="tab" aria-selected={viewMode === 'table'} className={`segmented__item${viewMode === 'table' ? ' is-active' : ''}`} onClick={() => setViewMode('table')}>
                <Icon name="table" size={13} />
                {t('workspace.tableView')}
              </button>
            )}
            {jsonValue !== null && (
              <button type="button" role="tab" aria-selected={viewMode === 'json'} className={`segmented__item${viewMode === 'json' ? ' is-active' : ''}`} onClick={() => setViewMode('json')}>
                <Icon name="tree" size={13} />
                {t('workspace.jsonView')}
              </button>
            )}
            <button type="button" role="tab" aria-selected={viewMode === 'text'} className={`segmented__item${viewMode === 'text' ? ' is-active' : ''}`} onClick={() => setViewMode('text')}>
              <Icon name="text" size={13} />
              {t('workspace.textView')}
            </button>
          </div>
        </div>
      </div>

      {activeFile.issue && (
        <div className="notice notice--error notice--block">
          <strong>{t(activeFile.issue.message as MessageKey, { limit: '25 MB' })}</strong>
          {activeFile.issue.detail && <code className="notice__detail">{activeFile.issue.detail}</code>}
        </div>
      )}

      {activeFile.document?.kind === 'jsonl' && activeFile.document.result.errors.length > 0 && (
        <details className="notice notice--warning notice--block">
          <summary>{t('workspace.invalidRecords', { count: activeFile.document.result.errors.length })}</summary>
          <ul className="error-lines">
            {activeFile.document.result.errors.slice(0, 8).map((error) => (
              <li key={error.line}>
                <span className="error-lines__line">{t('workspace.jumpToLine', { line: error.line })}</span>
                <code>{error.excerpt}</code>
                <span className="error-lines__message">{error.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {dataset && (
        <div className="preview-toolbar">
          <div className="preview-toolbar__filters">
            <label className="column-select" title={t('workspace.filterAllColumns')}>
              <Icon name="sliders" size={13} />
              <select
                value={view.filterColumnId ?? ''}
                onChange={(event) => activeId && updateView(activeId, { filterColumnId: event.target.value || null })}
                aria-label={t('workspace.filterAllColumns')}
              >
                <option value="">{t('workspace.filterAllColumns')}</option>
                {dataset.columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="search-field">
              <Icon name="search" size={14} />
              <input
                type="search"
                value={view.search}
                placeholder={t('workspace.searchPlaceholder')}
                onChange={(event) => activeId && updateView(activeId, { search: event.target.value })}
                aria-label={t('workspace.search')}
              />
              {view.search && (
                <button type="button" className="search-field__clear" onClick={() => activeId && updateView(activeId, { search: '' })} aria-label={t('common.clear')}>
                  <Icon name="close" size={12} />
                </button>
              )}
            </label>
          </div>

          <div className="preview-toolbar__actions">
            {selectedRows.size > 0 && (
              <button type="button" className="btn btn--danger btn--xs" onClick={deleteSelected}>
                <Icon name="trash" size={13} />
                {t('workspace.deleteSelectedRows', { count: selectedRows.size })}
              </button>
            )}
            <button type="button" className="btn btn--ghost btn--xs" onClick={performUndo} disabled={!session?.history.length}>
              <Icon name="undo" size={13} />
              {t('common.undo')}
            </button>
            <button
              type="button"
              className={`btn btn--xs ${confirmRestore ? 'btn--danger' : 'btn--ghost'}`}
              onClick={performRestore}
              disabled={!session?.original}
            >
              <Icon name="refresh" size={13} />
              {confirmRestore ? t('workspace.restoreConfirm') : t('workspace.restoreOriginal')}
            </button>
          </div>
        </div>
      )}

      <div className="preview-body">
        {viewMode === 'table' && dataset && (
          <DataTable
            dataset={dataset}
            view={view}
            rows={visible.rows}
            indexes={visible.indexes}
            total={dataset.rows.length}
            onSort={handleSort}
            onClearSort={clearSort}
            onClearSearch={() => activeId && updateView(activeId, { search: '' })}
            selected={selectedRows}
            onToggleRow={(index) =>
              setSelectedRows((current) => {
                const next = new Set(current);
                if (next.has(index)) next.delete(index);
                else next.add(index);
                return next;
              })
            }
            onToggleAll={(checked) => {
              if (!checked) setSelectedRows(new Set());
              else setSelectedRows(new Set(visible.indexes));
            }}
            onPageChange={pageChange}
          />
        )}

        {viewMode === 'json' && jsonValue !== null && <JsonView value={jsonValue} onToast={onToast} />}

        {viewMode === 'text' && <TextView text={activeFile.text} onToast={onToast} />}

        {viewMode === 'table' && !dataset && <p className="notice notice--info notice--block">{t('workspace.noPreview')}</p>}
      </div>
    </div>
  );

  const panelProps = {
    file: activeFile as ImportedFile,
    session: session ?? { history: [], dataset: null, original: null, view, lastConversion: null },
    dataset,
    viewRows: visible.rows,
    totalRows: dataset?.rows.length ?? 0,
    onCommit: (next: Dataset, label: string) => {
      if (!activeId) return;
      commitDataset(activeId, next, label);
      setSelectedRows(new Set());
    },
    onToast,
  };

  const detailPane = activeFile ? (
    <div className="pane pane--detail">
      {tool ? (
        <>
          <div className="pane__head pane__head--tool">
            <h2>{t(TOOL_LABEL[tool])}</h2>
            <button type="button" className="icon-button icon-button--tiny" onClick={() => setTool(null)} aria-label={t('common.close')}>
              <Icon name="close" size={14} />
            </button>
          </div>
          <div className="pane__scroll">
            {tool === 'convert' && <ConvertPanel {...panelProps} />}
            {tool === 'clean' && <CleanPanel {...panelProps} />}
            {tool === 'export' && <ExportPanel {...panelProps} entries={entries} />}
          </div>
        </>
      ) : (
        <>
          <div className="panel-tabs" role="tablist">
            {(['info', 'fields', 'stats'] as PanelTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={panelTab === tab}
                className={`panel-tabs__item${panelTab === tab ? ' is-active' : ''}`}
                onClick={() => setPanelTab(tab)}
              >
                {t(PANEL_LABEL[tab])}
              </button>
            ))}
          </div>
          <div className="pane__scroll">
            {panelTab === 'info' && <InfoPanel {...panelProps} />}
            {panelTab === 'fields' && <FieldsPanel {...panelProps} />}
            {panelTab === 'stats' && <StatsPanel {...panelProps} />}
          </div>
        </>
      )}
    </div>
  ) : (
    <div className="pane pane--detail pane--empty">
      <p>{t('workspace.emptyBody')}</p>
    </div>
  );

  if (compact) {
    return (
      <div className="workspace workspace--compact">
        <div className="workspace__mobile-body">
          {mobileTab === 'files' && fileList}
          {mobileTab === 'data' && previewArea}
          {mobileTab === 'tools' && (
            <div className="pane pane--detail">
              {tool ? (
                <>
                  <div className="pane__head pane__head--tool">
                    <h2>{t(TOOL_LABEL[tool])}</h2>
                    <button type="button" className="icon-button icon-button--tiny" onClick={() => setTool(null)} aria-label={t('common.close')}>
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  <div className="pane__scroll">
                    {tool === 'convert' && <ConvertPanel {...panelProps} />}
                    {tool === 'clean' && <CleanPanel {...panelProps} />}
                    {tool === 'export' && <ExportPanel {...panelProps} entries={entries} />}
                  </div>
                </>
              ) : (
                <div className="pane__scroll">
                  <div className="panel-section">
                    <header className="panel-section__head">
                      <h3>{t('workspace.tools')}</h3>
                      <p>{t('workspace.mobileHint')}</p>
                    </header>
                    {(['convert', 'clean', 'export'] as ToolId[]).map((id) => (
                      <button key={id} type="button" className="tool-button tool-button--block" onClick={() => setTool(id)} disabled={!activeFile}>
                        <Icon name={id === 'convert' ? 'swap' : id === 'clean' ? 'wand' : 'download'} size={15} />
                        {t(TOOL_LABEL[id])}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {mobileTab === 'panel' && detailPane}
        </div>

        <nav className="mobile-tabs" aria-label={t('workspace.tools')}>
          {(
            [
              ['files', 'folder', 'workspace.tabFiles'],
              ['data', 'table', 'workspace.tabData'],
              ['tools', 'sliders', 'workspace.tabTools'],
              ['panel', 'chart', 'workspace.tabPanel'],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              className={`mobile-tabs__item${mobileTab === id ? ' is-active' : ''}`}
              onClick={() => {
                // Tapping "Details" is an explicit request for the info/fields/stats
                // tabs, so an open tool panel is closed instead of hijacking the view.
                if (id === 'panel') setTool(null);
                setMobileTab(id);
              }}
              aria-current={mobileTab === id ? 'page' : undefined}
            >
              <Icon name={icon} size={17} />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="workspace">
      <aside className="workspace__rail">
        <button type="button" className="rail-back" onClick={onHome} title={t('common.close')}>
          <Icon name="chevronLeft" size={14} />
        </button>
        {fileList}
      </aside>
      <main className="workspace__main">{previewArea}</main>
      <aside className="workspace__detail">{detailPane}</aside>
    </div>
  );
}
