import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { CONVERSION_MATRIX, convert, defaultBaseName } from '../lib/convert';
import { DEFAULT_CONVERSION_OPTIONS } from '../lib/serialize';
import { copyText, prepareExport, triggerDownload } from '../lib/export';
import { formatBytes } from '../lib/limits';
import type { ConversionOptions, Dataset, TargetKind } from '../lib/types';
import type { PanelProps } from './panelTypes';

const TARGETS: TargetKind[] = ['csv', 'json', 'jsonl', 'txt'];

export function ConvertPanel({ file, dataset, viewRows, totalRows, onToast }: PanelProps) {
  const { t } = useI18n();
  const supported = useMemo(() => CONVERSION_MATRIX[file.kind] ?? [], [file.kind]);
  const [target, setTarget] = useState<TargetKind>(() => supported.find((kind) => kind !== file.kind) ?? supported[0] ?? 'json');
  const [baseName, setBaseName] = useState(() => defaultBaseName(file.name));
  const [options, setOptions] = useState<ConversionOptions>(DEFAULT_CONVERSION_OPTIONS);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());

  const prepared: Dataset | null = useMemo(() => {
    if (!dataset) return null;
    const columns = dataset.columns.map((column) => ({
      ...column,
      hidden: false,
      selected: column.selected && !excluded.has(column.id),
    }));
    return { columns, rows: viewRows };
  }, [dataset, excluded, viewRows]);

  const result = useMemo(() => {
    if (!supported.includes(target)) return null;
    return convert({
      dataset: prepared,
      sourceKind: file.kind,
      target,
      baseName,
      sourceText: file.text,
      jsonValue: file.document?.kind === 'json' ? file.document.value : null,
      jsonlRecords: file.document?.kind === 'jsonl' ? file.document.result.records : null,
      options,
    });
  }, [baseName, file, options, prepared, supported, target]);

  const preview = result ? result.text.slice(0, 2000) : '';
  const filteredView = viewRows.length !== totalRows;

  const setOption = <K extends keyof ConversionOptions>(key: K, value: ConversionOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  return (
    <div className="panel-section">
      <header className="panel-section__head">
        <h3>{t('convert.title')}</h3>
        <p>{t('convert.subtitle')}</p>
      </header>

      <fieldset className="field">
        <legend className="field__label">{t('convert.target')}</legend>
        <div className="segmented segmented--wrap" role="group">
          {TARGETS.map((kind) => {
            const enabled = supported.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                className={`segmented__item${target === kind ? ' is-active' : ''}`}
                disabled={!enabled}
                title={enabled ? kind.toUpperCase() : t('convert.unsupported', { target: kind.toUpperCase() })}
                onClick={() => setTarget(kind)}
              >
                {kind.toUpperCase()}
                {kind === file.kind ? ' ·' : ''}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="field">
        <span className="field__label">{t('convert.outputName')}</span>
        <div className="input-with-suffix">
          <input
            type="text"
            value={baseName}
            onChange={(event) => setBaseName(event.target.value)}
            spellCheck={false}
            aria-label={t('convert.outputName')}
          />
          <span className="input-with-suffix__suffix">.{target}</span>
        </div>
        <span className="field__hint">{t('convert.outputNameHint')}</span>
      </label>

      {dataset && dataset.columns.length > 0 && (
        <fieldset className="field">
          <legend className="field__label">{t('convert.columns')}</legend>
          <div className="checkbox-grid">
            {dataset.columns.map((column) => (
              <label key={column.id} className="checkbox">
                <input
                  type="checkbox"
                  checked={column.selected && !excluded.has(column.id)}
                  onChange={(event) => {
                    setExcluded((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.delete(column.id);
                      else next.add(column.id);
                      return next;
                    });
                  }}
                />
                <span>{column.name}</span>
              </label>
            ))}
          </div>
          <span className="field__hint">{t('convert.columnsHint')}</span>
        </fieldset>
      )}

      <details className="disclosure" open>
        <summary>{t('common.options')}</summary>
        <div className="disclosure__body">
          {target === 'csv' && (
            <>
              <label className="field field--inline">
                <span className="field__label">{t('convert.delimiter')}</span>
                <select value={options.delimiter} onChange={(event) => setOption('delimiter', event.target.value)}>
                  <option value=",">, (comma)</option>
                  <option value=";">; (semicolon)</option>
                  <option value={'\t'}>tab</option>
                  <option value="|">| (pipe)</option>
                </select>
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={options.includeHeader} onChange={(event) => setOption('includeHeader', event.target.checked)} />
                <span>{t('convert.includeHeader')}</span>
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={options.quoteAll} onChange={(event) => setOption('quoteAll', event.target.checked)} />
                <span>{t('convert.quoteAll')}</span>
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={options.crlf} onChange={(event) => setOption('crlf', event.target.checked)} />
                <span>{t('convert.crlf')}</span>
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={options.nullAsText} onChange={(event) => setOption('nullAsText', event.target.checked)} />
                <span>{t('convert.nullAsText')}</span>
              </label>
            </>
          )}

          {(target === 'json' || target === 'jsonl') && (
            <label className="field field--inline">
              <span className="field__label">{t('convert.indent')}</span>
              <select
                value={options.indent}
                onChange={(event) => setOption('indent', Number(event.target.value) as ConversionOptions['indent'])}
                disabled={target === 'jsonl'}
              >
                <option value={2}>2</option>
                <option value={4}>4</option>
                <option value={0}>{t('convert.indentNone')}</option>
              </select>
            </label>
          )}

          <label className="checkbox">
            <input type="checkbox" checked={options.bom} onChange={(event) => setOption('bom', event.target.checked)} />
            <span>{t('convert.bom')}</span>
          </label>
        </div>
      </details>

      <p className="panel-note">
        <Icon name="info" size={13} />
        {filteredView
          ? t('convert.filtersApplied', { rows: viewRows.length })
          : t('convert.noFilters', { rows: totalRows })}
      </p>

      {result && !result.ok && (
        <p className="notice notice--error">
          {t((result.issue?.message ?? 'errors.unknown') as MessageKey, { limit: formatBytes(25 * 1024 * 1024) })}
        </p>
      )}

      {result?.ok && (
        <div className="convert-result">
          <div className="convert-result__head">
            <span className="convert-result__summary">
              {t('convert.resultSummary', { rows: result.rowCount, size: formatBytes(result.byteLength) })}
            </span>
            <span className="chip">{result.fileName}</span>
          </div>

          {result.warnings.length > 0 && (
            <ul className="warning-list">
              {result.warnings.map((warning) => (
                <li key={warning.code}>
                  <Icon name="alert" size={13} />
                  <span>
                    {t(warning.message as MessageKey, {
                      count: warning.detail ?? '',
                      value: warning.detail ?? '',
                      limit: '200,000',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <pre className="code-preview" aria-label={t('common.preview')}>
            <code>{preview}</code>
          </pre>
          {result.text.length > 2000 && <p className="panel-note">{t('convert.previewTruncated')}</p>}

          <div className="button-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                triggerDownload(prepareExport(result.fileName, result.text, result.targetKind, options.bom));
                onToast(`${result.fileName} · ${formatBytes(result.byteLength)}`, 'success');
              }}
            >
              <Icon name="download" size={14} />
              {t('convert.downloadResult')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={async () => {
                const ok = await copyText(result.text);
                onToast(ok ? t('common.copied') : t('common.copyFailed'), ok ? 'success' : 'error');
              }}
            >
              <Icon name="copy" size={14} />
              {t('convert.copyResult')}
            </button>
          </div>
        </div>
      )}

      <p className="panel-note panel-note--muted">
        <Icon name="lock" size={13} />
        {t('convert.typeInferenceNote')}
      </p>
    </div>
  );
}
