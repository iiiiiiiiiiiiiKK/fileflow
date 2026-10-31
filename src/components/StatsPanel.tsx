import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { computeStats } from '../lib/stats';
import { formatNumber, LIMITS } from '../lib/limits';
import type { PanelProps } from './panelTypes';

function numeric(value: number | null, fraction = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(fraction));
  return formatNumber(rounded);
}

export function StatsPanel({ dataset }: PanelProps) {
  const { t } = useI18n();
  const stats = useMemo(() => (dataset ? computeStats(dataset, LIMITS.statsSampleRows) : null), [dataset]);

  if (!dataset || !stats) {
    return (
      <div className="panel-section">
        <header className="panel-section__head">
          <h3>{t('stats.title')}</h3>
        </header>
        <p className="notice notice--info">{t('stats.noData')}</p>
      </div>
    );
  }

  const sampled = stats.rows > LIMITS.statsSampleRows;

  return (
    <div className="panel-section">
      <header className="panel-section__head">
        <h3>{t('stats.title')}</h3>
        {sampled && <p>{t('stats.sampled', { rows: formatNumber(LIMITS.statsSampleRows) })}</p>}
      </header>

      <dl className="stat-grid">
        <div className="stat-grid__item">
          <dt>{t('stats.totalRows')}</dt>
          <dd>{formatNumber(stats.rows)}</dd>
        </div>
        <div className="stat-grid__item">
          <dt>{t('stats.totalColumns')}</dt>
          <dd>{formatNumber(stats.columns)}</dd>
        </div>
        <div className="stat-grid__item">
          <dt>{t('stats.emptyCells')}</dt>
          <dd>{formatNumber(stats.emptyCells)}</dd>
        </div>
        <div className="stat-grid__item">
          <dt>{t('stats.duplicateRows')}</dt>
          <dd>{formatNumber(stats.duplicateRows)}</dd>
        </div>
      </dl>

      <h4 className="panel-subtitle">{t('stats.perColumn')}</h4>
      <div className="stat-table" role="table">
        <div className="stat-table__row stat-table__row--head" role="row">
          <span role="columnheader">{t('common.name')}</span>
          <span role="columnheader">{t('stats.unique')}</span>
          <span role="columnheader">{t('stats.min')}</span>
          <span role="columnheader">{t('stats.max')}</span>
          <span role="columnheader">{t('stats.average')}</span>
        </div>
        {stats.perColumn.map((column) => (
          <div key={column.columnId} className="stat-table__row" role="row">
            <span className="stat-table__name" role="cell" title={column.name}>
              {column.name}
            </span>
            <span role="cell">{formatNumber(column.distinct)}</span>
            <span role="cell">{column.min === null ? '—' : numeric(column.min)}</span>
            <span role="cell">{column.max === null ? '—' : numeric(column.max)}</span>
            <span role="cell">{column.average === null ? '—' : numeric(column.average)}</span>
          </div>
        ))}
      </div>
      <p className="panel-note panel-note--muted">{t('stats.numericOnly')}</p>

      <h4 className="panel-subtitle">{t('stats.topValues')}</h4>
      <div className="top-values">
        {stats.perColumn.slice(0, 12).map((column) => (
          <div key={column.columnId} className="top-values__group">
            <div className="top-values__title">{column.name}</div>
            <ul>
              {column.topValues.length === 0 && <li className="top-values__empty">{t('common.notApplicable')}</li>}
              {column.topValues.map((value) => (
                <li key={value.value}>
                  <span className="top-values__value" title={value.value}>
                    {value.value === '' ? '∅' : value.value}
                  </span>
                  <span className="top-values__count">{formatNumber(value.count)}</span>
                  <span className="top-values__bar">
                    <span
                      style={{
                        width: `${Math.max(4, (value.count / Math.max(1, column.topValues[0]?.count ?? 1)) * 100)}%`,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
