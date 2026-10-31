import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { computeStats } from '../lib/stats';
import {
  convertDates,
  removeBlankRows,
  removeDuplicateRows,
  removeEmptyColumns,
  normaliseNulls,
  replaceText,
  suggestDatePattern,
  trimCells,
} from '../lib/table';
import type { DateSourcePattern, DateTargetFormat } from '../lib/table';
import type { Dataset } from '../lib/types';
import type { PanelProps } from './panelTypes';

interface StepInfo {
  key: string;
  label: string;
  count: number;
}

const DEFAULT_TOKENS = 'NULL, null, N/A, -, —, 无';

const SOURCE_OPTIONS: DateSourcePattern[] = [
  'iso-date',
  'iso-datetime',
  'ymd-slash',
  'ymd-dot',
  'dmy-slash',
  'mdy-slash',
  'dmy-dash',
];

const TARGET_OPTIONS: DateTargetFormat[] = ['YYYY-MM-DD', 'YYYY/MM/DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD HH:mm:ss'];

function runPipeline(
  dataset: Dataset,
  state: {
    blankRows: boolean;
    blankColumns: boolean;
    trim: boolean;
    nulls: boolean;
    duplicates: boolean;
    date: boolean;
    tokens: string;
    scope: string[] | null;
    dateColumnId: string;
    dateSource: DateSourcePattern;
    dateTarget: DateTargetFormat;
  },
  labels: Record<string, string>,
): { dataset: Dataset; steps: StepInfo[]; dateFailures: { count: number; samples: string[] } } {
  let current = dataset;
  const steps: StepInfo[] = [];
  let dateFailures = { count: 0, samples: [] as string[] };

  if (state.blankRows) {
    const result = removeBlankRows(current);
    current = result.dataset;
    steps.push({ key: 'blankRows', label: labels.blankRows, count: result.count });
  }
  if (state.blankColumns) {
    const result = removeEmptyColumns(current);
    current = result.dataset;
    steps.push({ key: 'blankColumns', label: labels.blankColumns, count: result.count });
  }
  if (state.trim) {
    const result = trimCells(current, state.scope);
    current = result.dataset;
    steps.push({ key: 'trim', label: labels.trim, count: result.count });
  }
  if (state.nulls) {
    const tokens = state.tokens
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);
    const result = normaliseNulls(current, tokens, state.scope);
    current = result.dataset;
    steps.push({ key: 'nulls', label: labels.nulls, count: result.count });
  }
  if (state.date && state.dateColumnId) {
    const result = convertDates(current, state.dateColumnId, state.dateSource, state.dateTarget);
    current = result.dataset;
    dateFailures = { count: result.failed, samples: result.failedSamples };
    steps.push({ key: 'date', label: labels.date, count: result.converted });
  }
  if (state.duplicates) {
    const result = removeDuplicateRows(current, state.scope ?? undefined);
    current = result.dataset;
    steps.push({ key: 'duplicates', label: labels.duplicates, count: result.count });
  }
  return { dataset: current, steps, dateFailures };
}

export function CleanPanel({ dataset, onCommit, onToast }: PanelProps) {
  const { t } = useI18n();
  const [flags, setFlags] = useState({
    blankRows: false,
    blankColumns: false,
    trim: false,
    nulls: false,
    duplicates: false,
    date: false,
  });
  const [tokens, setTokens] = useState(DEFAULT_TOKENS);
  const [useSelectedScope, setUseSelectedScope] = useState(false);
  const [dateColumnId, setDateColumnId] = useState('');
  const [dateSource, setDateSource] = useState<DateSourcePattern>('iso-date');
  const [dateTarget, setDateTarget] = useState<DateTargetFormat>('YYYY-MM-DD');
  const [showReport, setShowReport] = useState(true);
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeCell, setWholeCell] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const dateCandidates = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns
      .map((column) => ({ column, suggestion: suggestDatePattern(dataset, column.id) }))
      .filter((entry) => entry.suggestion && entry.suggestion.matchRate >= 0.8)
      .map((entry) => entry.column);
  }, [dataset]);

  const effectiveDateColumn = dateColumnId || dateCandidates[0]?.id || '';

  const scope = useMemo(() => {
    if (!dataset || !useSelectedScope) return null;
    const ids = dataset.columns.filter((column) => column.selected && !column.hidden).map((column) => column.id);
    return ids.length > 0 ? ids : null;
  }, [dataset, useSelectedScope]);

  const state = useMemo(
    () => ({ ...flags, tokens, scope, dateColumnId: effectiveDateColumn, dateSource, dateTarget }),
    [flags, tokens, scope, effectiveDateColumn, dateSource, dateTarget],
  );

  const labels = useMemo(
    () => ({
      blankRows: t('clean.blankRows'),
      blankColumns: t('clean.blankColumns'),
      trim: t('clean.trim'),
      nulls: t('clean.nulls'),
      duplicates: t('clean.duplicates'),
      date: t('clean.dateFormat'),
    }),
    [t],
  );

  const preview = useMemo(() => (dataset ? runPipeline(dataset, state, labels) : null), [dataset, state, labels]);

  const replacement = useMemo(() => {
    if (!dataset || find === '') return null;
    return replaceText(dataset, { find, replace, columnIds: scope, matchCase, wholeCell, useRegex });
  }, [dataset, find, replace, scope, matchCase, wholeCell, useRegex]);

  const stats = useMemo(() => (dataset ? computeStats(dataset, 20_000) : null), [dataset]);

  const anomalyCount = useMemo(() => {
    if (!stats) return 0;
    return stats.perColumn.reduce((total, column) => (column.guessedType === 'mixed' ? total + 1 : total), 0);
  }, [stats]);

  const activeSteps = preview?.steps.filter((step) => step.count > 0) ?? [];
  const totalChanges = activeSteps.reduce((sum, step) => sum + step.count, 0);
  const dateBlocked = (preview?.dateFailures.count ?? 0) > 0;

  if (!dataset) {
    return (
      <div className="panel-section">
        <header className="panel-section__head">
          <h3>{t('clean.title')}</h3>
          <p>{t('clean.subtitle')}</p>
        </header>
        <p className="notice notice--info">{t('workspace.noPreview')}</p>
      </div>
    );
  }

  const toggle = (key: keyof typeof flags) => setFlags((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="panel-section">
      <header className="panel-section__head">
        <h3>{t('clean.title')}</h3>
        <p>{t('clean.subtitle')}</p>
      </header>

      <fieldset className="field">
        <legend className="field__label">{t('clean.columnScope')}</legend>
        <div className="radio-row">
          <label className="checkbox">
            <input type="radio" checked={!useSelectedScope} onChange={() => setUseSelectedScope(false)} />
            <span>{t('clean.allColumns')}</span>
          </label>
          <label className="checkbox">
            <input type="radio" checked={useSelectedScope} onChange={() => setUseSelectedScope(true)} />
            <span>{t('clean.selectedColumns')}</span>
          </label>
        </div>
      </fieldset>

      <div className="op-list">
        <label className="op">
          <input type="checkbox" checked={flags.blankRows} onChange={() => toggle('blankRows')} />
          <span className="op__text">
            <span className="op__title">{t('clean.blankRows')}</span>
            <span className="op__hint">{t('clean.blankRowsHint')}</span>
          </span>
          <span className="op__count">{preview?.steps.find((step) => step.key === 'blankRows')?.count ?? 0}</span>
        </label>

        <label className="op">
          <input type="checkbox" checked={flags.blankColumns} onChange={() => toggle('blankColumns')} />
          <span className="op__text">
            <span className="op__title">{t('clean.blankColumns')}</span>
            <span className="op__hint">{t('clean.blankColumnsHint')}</span>
          </span>
          <span className="op__count">{preview?.steps.find((step) => step.key === 'blankColumns')?.count ?? 0}</span>
        </label>

        <label className="op">
          <input type="checkbox" checked={flags.trim} onChange={() => toggle('trim')} />
          <span className="op__text">
            <span className="op__title">{t('clean.trim')}</span>
            <span className="op__hint">{t('clean.trimHint')}</span>
          </span>
          <span className="op__count">{preview?.steps.find((step) => step.key === 'trim')?.count ?? 0}</span>
        </label>

        <label className="op">
          <input type="checkbox" checked={flags.nulls} onChange={() => toggle('nulls')} />
          <span className="op__text">
            <span className="op__title">{t('clean.nulls')}</span>
            <span className="op__hint">{t('clean.nullsHint')}</span>
          </span>
          <span className="op__count">{preview?.steps.find((step) => step.key === 'nulls')?.count ?? 0}</span>
        </label>
        {flags.nulls && (
          <label className="field field--nested">
            <span className="field__label">{t('clean.nullTokens')}</span>
            <input type="text" value={tokens} onChange={(event) => setTokens(event.target.value)} spellCheck={false} />
          </label>
        )}

        <label className="op">
          <input type="checkbox" checked={flags.date} onChange={() => toggle('date')} />
          <span className="op__text">
            <span className="op__title">{t('clean.dateFormat')}</span>
            <span className="op__hint">{t('clean.dateFormatHint')}</span>
          </span>
          <span className="op__count">{preview?.steps.find((step) => step.key === 'date')?.count ?? 0}</span>
        </label>
        {flags.date && (
          <div className="field field--nested field--stack">
            <label className="field">
              <span className="field__label">{t('clean.dateColumn')}</span>
              <select value={effectiveDateColumn} onChange={(event) => setDateColumnId(event.target.value)}>
                {dataset.columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-row">
              <label className="field">
                <span className="field__label">{t('clean.dateSource')}</span>
                <select value={dateSource} onChange={(event) => setDateSource(event.target.value as DateSourcePattern)}>
                  {SOURCE_OPTIONS.map((pattern) => (
                    <option key={pattern} value={pattern}>
                      {pattern}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">{t('clean.dateTarget')}</span>
                <select value={dateTarget} onChange={(event) => setDateTarget(event.target.value as DateTargetFormat)}>
                  {TARGET_OPTIONS.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--xs"
              onClick={() => {
                if (!effectiveDateColumn) return;
                const suggestion = suggestDatePattern(dataset, effectiveDateColumn);
                if (suggestion) {
                  setDateSource(suggestion.pattern);
                  onToast(t('clean.dateDetected', { pattern: suggestion.pattern }), 'info');
                }
              }}
            >
              <Icon name="wand" size={13} />
              {t('clean.dateDetect')}
            </button>
            {(preview?.dateFailures.count ?? 0) > 0 && (
              <p className="notice notice--warning">
                {t('clean.dateFailures', { count: preview?.dateFailures.count ?? 0 })}
                {preview && preview.dateFailures.samples.length > 0
                  ? ` ${t('clean.dateFailedSamples', { samples: preview.dateFailures.samples.join(', ') })}`
                  : ''}
              </p>
            )}
          </div>
        )}

        <label className="op">
          <input type="checkbox" checked={flags.duplicates} onChange={() => toggle('duplicates')} />
          <span className="op__text">
            <span className="op__title">{t('clean.duplicates')}</span>
            <span className="op__hint">{t('clean.duplicatesHint')}</span>
          </span>
          <span className="op__count">{preview?.steps.find((step) => step.key === 'duplicates')?.count ?? 0}</span>
        </label>
      </div>

      <div className="panel-block">
        <div className="panel-block__head">
          <h4>{t('clean.previewTitle')}</h4>
          <span className="chip">{t('clean.summary', { ops: activeSteps.length, count: totalChanges })}</span>
        </div>
        {activeSteps.length === 0 ? (
          <p className="panel-note">{t('clean.previewEmpty')}</p>
        ) : (
          <ul className="step-list">
            {activeSteps.map((step) => (
              <li key={step.key}>
                <Icon name="check" size={13} />
                <span>{step.label}</span>
                <span className="step-list__count">−{step.count}</span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={activeSteps.length === 0 || dateBlocked}
          onClick={() => {
            if (!preview) return;
            onCommit(preview.dataset, t('history.clean'));
            onToast(t('clean.summary', { ops: activeSteps.length, count: totalChanges }), 'success');
          }}
        >
          <Icon name="check" size={14} />
          {t('clean.apply')}
        </button>
        {dateBlocked && <p className="notice notice--warning">{t('clean.dateFailures', { count: preview?.dateFailures.count ?? 0 })}</p>}
      </div>

      <div className="panel-block">
        <div className="panel-block__head">
          <h4>{t('workspace.replaceTitle')}</h4>
          <span className="chip">{t('workspace.replacePreview', { count: replacement?.cellsChanged ?? 0 })}</span>
        </div>
        <div className="field-row">
          <label className="field">
            <span className="field__label">{t('workspace.replaceFind')}</span>
            <input type="text" value={find} onChange={(event) => setFind(event.target.value)} spellCheck={false} />
          </label>
          <label className="field">
            <span className="field__label">{t('workspace.replaceWith')}</span>
            <input type="text" value={replace} onChange={(event) => setReplace(event.target.value)} spellCheck={false} />
          </label>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={matchCase} onChange={() => setMatchCase((value) => !value)} />
          <span>{t('workspace.replaceMatchCase')}</span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={wholeCell} onChange={() => setWholeCell((value) => !value)} />
          <span>{t('workspace.replaceWholeCell')}</span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={useRegex} onChange={() => setUseRegex((value) => !value)} />
          <span>{t('workspace.replaceRegex')}</span>
        </label>
        {replacement?.error && <p className="notice notice--error">{t(`${replacement.error}` as MessageKey)}</p>}
        {!replacement?.error && find !== '' && replacement?.cellsChanged === 0 && <p className="panel-note">{t('workspace.replaceNone')}</p>}
        <button
          type="button"
          className="btn btn--ghost btn--block"
          disabled={!replacement || Boolean(replacement.error) || replacement.cellsChanged === 0}
          onClick={() => {
            if (!replacement) return;
            onCommit(replacement.dataset, t('history.replace'));
            onToast(t('workspace.replacePreview', { count: replacement.cellsChanged }), 'success');
          }}
        >
          <Icon name="swap" size={14} />
          {t('workspace.replaceApply')}
        </button>
      </div>

      <div className="panel-block">
        <button type="button" className="panel-block__toggle" onClick={() => setShowReport((value) => !value)}>
          <Icon name={showReport ? 'chevronDown' : 'chevronRight'} size={13} />
          {t('clean.checkMissing')}
        </button>
        {showReport && (
          <div className="report">
            {stats && (
              <p className="panel-note">
                {t('clean.missingReport', {
                  nulls: stats.perColumn.reduce((total, column) => total + column.nulls, 0),
                  empty: stats.perColumn.reduce((total, column) => total + column.empty, 0),
                })}
              </p>
            )}
            <p className="panel-note">
              {anomalyCount > 0 ? t('clean.anomalyReport', { count: anomalyCount }) : t('clean.noAnomaly')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
