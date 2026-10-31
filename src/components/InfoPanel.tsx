import type { PanelProps } from './panelTypes';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { formatBytes, formatNumber } from '../lib/limits';

export function InfoPanel({ file, dataset, session }: PanelProps) {
  const { t } = useI18n();

  return (
    <div className="panel-section">
      <header className="panel-section__head">
        <h3>{t('workspace.fileInfo')}</h3>
      </header>

      <dl className="info-list">
        <div>
          <dt>{t('common.name')}</dt>
          <dd title={file.name}>{file.name}</dd>
        </div>
        <div>
          <dt>{t('workspace.sourceFormat')}</dt>
          <dd>{file.kind.toUpperCase()}</dd>
        </div>
        <div>
          <dt>{t('common.size')}</dt>
          <dd>{formatBytes(file.size)}</dd>
        </div>
        <div>
          <dt>{t('workspace.detectedEncoding')}</dt>
          <dd>{file.encoding.toUpperCase()}</dd>
        </div>
        <div>
          <dt>{t('workspace.shape')}</dt>
          <dd>{dataset ? `${formatNumber(dataset.rows.length)} × ${formatNumber(dataset.columns.length)}` : '—'}</dd>
        </div>
        <div>
          <dt>{t('workspace.importedAt')}</dt>
          <dd>{new Date(file.importedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>{t('common.undo')}</dt>
          <dd>{formatNumber(session.history.length)}</dd>
        </div>
      </dl>

      {file.issue && (
        <div className="notice notice--error">
          <strong>{t(file.issue.message as MessageKey, { limit: '25 MB' })}</strong>
          {file.issue.detail && <code className="notice__detail">{file.issue.detail}</code>}
        </div>
      )}

      {file.warnings.length > 0 && (
        <ul className="warning-list">
          {file.warnings.map((warning) => (
            <li key={warning}>
              <span>{t(warning as MessageKey, { limit: '200,000' })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
