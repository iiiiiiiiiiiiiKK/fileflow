import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { CONVERSION_MATRIX, convert, defaultBaseName, sanitiseFileName, withExtension } from '../lib/convert';
import { buildZip, downloadBlob, ensureUniqueName, prepareExport, triggerDownload } from '../lib/export';
import { formatBytes, LIMITS } from '../lib/limits';
import type { CellValue, Dataset, ImportedFile, TargetKind } from '../lib/types';
import type { PanelProps } from './panelTypes';

export interface ExportEntry {
  file: ImportedFile;
  dataset: Dataset | null;
  rows: CellValue[][];
}

export interface ExportPanelProps extends PanelProps {
  entries: ExportEntry[];
}

export function ExportPanel({ file, dataset, viewRows, totalRows, onToast, entries }: ExportPanelProps) {
  const { t } = useI18n();
  const supported = useMemo(() => CONVERSION_MATRIX[file.kind] ?? ['json'], [file.kind]);
  const initial = supported.find((kind) => kind !== file.kind) ?? supported[0] ?? 'json';
  const [target, setTarget] = useState<TargetKind>(initial);
  const [baseName, setBaseName] = useState(() => defaultBaseName(file.name));
  const [bom, setBom] = useState(false);
  const [zipName, setZipName] = useState('fileflow-export');
  const [zipping, setZipping] = useState(false);

  const result = useMemo(() => {
    if (!supported.includes(target)) return null;
    const prepared: Dataset | null = dataset
      ? { columns: dataset.columns.map((column) => ({ ...column, hidden: false })), rows: viewRows }
      : null;
    return convert({
      dataset: prepared,
      sourceKind: file.kind,
      target,
      baseName,
      sourceText: file.text,
      jsonValue: file.document?.kind === 'json' ? file.document.value : null,
      jsonlRecords: file.document?.kind === 'jsonl' ? file.document.result.records : null,
      options: { bom },
    });
  }, [baseName, bom, dataset, file, supported, target, viewRows]);

  const downloadSingle = () => {
    if (!result?.ok) return;
    triggerDownload(prepareExport(result.fileName, result.text, result.targetKind, bom));
    onToast(`${result.fileName} · ${formatBytes(result.byteLength)}`, 'success');
  };

  const downloadZip = async () => {
    setZipping(true);
    try {
      const used = new Set<string>();
      const zipped: { fileName: string; text: string }[] = [];
      let skipped = 0;
      for (const entry of entries) {
        if (entry.file.issue) {
          skipped += 1;
          continue;
        }
        const entrySupported = CONVERSION_MATRIX[entry.file.kind] ?? [];
        const entryTarget: TargetKind = entrySupported.includes(entry.file.kind) ? entry.file.kind : entrySupported[0] ?? 'txt';
        const prepared: Dataset | null = entry.dataset
          ? { columns: entry.dataset.columns.map((column) => ({ ...column, hidden: false })), rows: entry.rows }
          : null;
        const conversion = convert({
          dataset: prepared,
          sourceKind: entry.file.kind,
          target: entryTarget,
          baseName: defaultBaseName(entry.file.name),
          sourceText: entry.file.text,
          jsonValue: entry.file.document?.kind === 'json' ? entry.file.document.value : null,
          jsonlRecords: entry.file.document?.kind === 'jsonl' ? entry.file.document.result.records : null,
          options: { bom },
        });
        if (!conversion.ok) {
          skipped += 1;
          continue;
        }
        const fileName = ensureUniqueName(withExtension(conversion.fileName.replace(/\.[a-z0-9]+$/i, ''), conversion.targetKind), used);
        zipped.push({ fileName, text: conversion.text });
      }

      if (zipped.length === 0) {
        onToast(t('exportPanel.zipEmpty'), 'warning');
        return;
      }
      const { blob, result: zipResult } = await buildZip(zipped, LIMITS.maxZipBytes);
      if (!blob) {
        onToast(t('errors.zipTooLarge'), 'error');
        return;
      }
      const archiveName = `${sanitiseFileName(zipName || 'fileflow-export').replace(/\.zip$/i, '')}.zip`;
      downloadBlob(blob, archiveName);
      onToast(
        `${t('exportPanel.zipDone', { name: archiveName, size: formatBytes(zipResult.bytes) })}${
          skipped > 0 ? ` · ${t('exportPanel.onlyValid')}` : ''
        }`,
        'success',
      );
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="panel-section">
      <header className="panel-section__head">
        <h3>{t('exportPanel.title')}</h3>
        <p>{t('exportPanel.subtitle')}</p>
      </header>

      <div className="field-row">
        <label className="field">
          <span className="field__label">{t('exportPanel.format')}</span>
          <select value={target} onChange={(event) => setTarget(event.target.value as TargetKind)}>
            {supported.map((kind) => (
              <option key={kind} value={kind}>
                {kind.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('exportPanel.encoding')}</span>
          <select value={bom ? 'bom' : 'plain'} onChange={(event) => setBom(event.target.value === 'bom')}>
            <option value="plain">{t('exportPanel.encodingUtf8')}</option>
            <option value="bom">{t('exportPanel.encodingUtf8Bom')}</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field__label">{t('exportPanel.fileName')}</span>
        <div className="input-with-suffix">
          <input type="text" value={baseName} onChange={(event) => setBaseName(event.target.value)} spellCheck={false} />
          <span className="input-with-suffix__suffix">.{target}</span>
        </div>
      </label>

      <p className="panel-note">
        <Icon name="info" size={13} />
        {viewRows.length !== totalRows
          ? t('convert.filtersApplied', { rows: viewRows.length })
          : t('convert.noFilters', { rows: totalRows })}
      </p>

      {result && !result.ok && (
        <p className="notice notice--error">
          {t((result.issue?.message ?? 'errors.unknown') as MessageKey, { limit: '25 MB' })}
        </p>
      )}

      {result?.ok && (
        <div className="export-summary">
          <span className="chip">{result.fileName}</span>
          <span className="export-summary__meta">{formatBytes(result.byteLength)}</span>
        </div>
      )}

      <button type="button" className="btn btn--primary btn--block" onClick={downloadSingle} disabled={!result?.ok}>
        <Icon name="download" size={14} />
        {t('exportPanel.downloadOne')}
      </button>

      <hr className="rule" />

      <label className="field">
        <span className="field__label">{t('exportPanel.zipName')}</span>
        <div className="input-with-suffix">
          <input type="text" value={zipName} onChange={(event) => setZipName(event.target.value)} spellCheck={false} />
          <span className="input-with-suffix__suffix">.zip</span>
        </div>
      </label>
      <button type="button" className="btn btn--ghost btn--block" onClick={downloadZip} disabled={zipping}>
        <Icon name="archive" size={14} />
        {zipping ? t('exportPanel.zipPreparing') : t('exportPanel.downloadZip')}
      </button>
      <p className="panel-note panel-note--muted">{t('exportPanel.onlyValid')}</p>
    </div>
  );
}
