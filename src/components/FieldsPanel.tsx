import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import { summariseFields } from '../lib/stats';
import { moveColumn, removeColumns, renameColumn, setColumnHidden, setColumnSelected, setAllColumns } from '../lib/table';
import type { PanelProps } from './panelTypes';

const TYPE_LABEL = {
  number: 'fields.typeNumber',
  text: 'fields.typeText',
  boolean: 'fields.typeBoolean',
  mixed: 'fields.typeMixed',
  empty: 'fields.typeEmpty',
} as const;

export function FieldsPanel({ dataset, onCommit, onToast }: PanelProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const fields = useMemo(() => (dataset ? summariseFields(dataset) : []), [dataset]);
  const duplicates = useMemo(() => {
    if (!dataset) return false;
    const names = dataset.columns.map((column) => column.name.trim().toLowerCase());
    return new Set(names).size !== names.length;
  }, [dataset]);

  if (!dataset) {
    return (
      <div className="panel-section">
        <header className="panel-section__head">
          <h3>{t('fields.title')}</h3>
          <p>{t('fields.subtitle')}</p>
        </header>
        <p className="notice notice--info">{t('workspace.noPreview')}</p>
      </div>
    );
  }

  const commitRename = (columnId: string, value: string) => {
    const next = renameColumn(dataset, columnId, value);
    if (next !== dataset) onCommit(next, t('history.rename'));
    setEditing(null);
  };

  return (
    <div className="panel-section">
      <header className="panel-section__head">
        <h3>{t('fields.title')}</h3>
        <p>{t('fields.subtitle')}</p>
      </header>

      {duplicates && <p className="notice notice--warning">{t('fields.duplicateNames')}</p>}

      <div className="button-row button-row--tight">
        <button type="button" className="btn btn--ghost btn--xs" onClick={() => onCommit(setAllColumns(dataset, { selected: true }), t('history.rename'))}>
          {t('common.selectAll')}
        </button>
        <button type="button" className="btn btn--ghost btn--xs" onClick={() => onCommit(setAllColumns(dataset, { selected: false }), t('history.rename'))}>
          {t('common.selectNone')}
        </button>
      </div>

      <ul className="field-list">
        {fields.map((field, index) => {
          const column = dataset.columns[index];
          if (!column) return null;
          return (
            <li key={field.columnId} className={`field-item${column.hidden ? ' is-hidden' : ''}`}>
              <div className="field-item__top">
                {editing?.id === column.id ? (
                  <input
                    className="field-item__input"
                    autoFocus
                    value={editing.value}
                    onChange={(event) => setEditing({ id: column.id, value: event.target.value })}
                    onBlur={() => commitRename(column.id, editing.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename(column.id, editing.value);
                      if (event.key === 'Escape') setEditing(null);
                    }}
                    aria-label={t('fields.rename')}
                  />
                ) : (
                  <button
                    type="button"
                    className="field-item__name"
                    onClick={() => setEditing({ id: column.id, value: column.name })}
                    title={t('fields.rename')}
                  >
                    {column.name}
                    {column.hidden && <span className="field-item__badge">{t('fields.hidden')}</span>}
                  </button>
                )}
                <div className="field-item__actions">
                  <button
                    type="button"
                    className="icon-button icon-button--tiny"
                    title={t('fields.moveUp')}
                    aria-label={t('fields.moveUp')}
                    disabled={index === 0}
                    onClick={() => onCommit(moveColumn(dataset, column.id, index - 1), t('history.reorder'))}
                  >
                    <Icon name="arrowUp" size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--tiny"
                    title={t('fields.moveDown')}
                    aria-label={t('fields.moveDown')}
                    disabled={index === dataset.columns.length - 1}
                    onClick={() => onCommit(moveColumn(dataset, column.id, index + 1), t('history.reorder'))}
                  >
                    <Icon name="arrowDown" size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--tiny"
                    title={column.hidden ? t('fields.toggleShow') : t('fields.toggleHide')}
                    aria-label={column.hidden ? t('fields.toggleShow') : t('fields.toggleHide')}
                    onClick={() => onCommit(setColumnHidden(dataset, column.id, !column.hidden), t('history.hide'))}
                  >
                    <Icon name={column.hidden ? 'eyeOff' : 'eye'} size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--tiny icon-button--danger"
                    title={t('common.remove')}
                    aria-label={t('common.remove')}
                    onClick={() => {
                      onCommit(removeColumns(dataset, [column.id]).dataset, t('history.deleteColumns'));
                      onToast(`${column.name} · ${t('common.remove')}`, 'info');
                    }}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
              <div className="field-item__meta">
                <label className="checkbox checkbox--tight">
                  <input
                    type="checkbox"
                    checked={column.selected}
                    onChange={(event) => onCommit(setColumnSelected(dataset, column.id, event.target.checked), t('history.hide'))}
                  />
                  <span>{t('fields.include')}</span>
                </label>
                <span className="chip chip--muted">{t(TYPE_LABEL[field.guessedType])}</span>
                <span className="field-item__stat">
                  {t('fields.emptyCount')} {field.emptyCount + field.nullCount}
                </span>
                <span className="field-item__stat">
                  {t('fields.distinct')} {field.distinct}
                </span>
              </div>
              {field.sample && <p className="field-item__sample">{field.sample}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
