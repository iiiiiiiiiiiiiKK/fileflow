import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import { copyText } from '../lib/export';
import type { JsonValue } from '../lib/types';

interface JsonViewProps {
  value: JsonValue;
  onToast: (message: string, tone?: 'success' | 'error' | 'info' | 'warning') => void;
}

function typeOf(value: JsonValue): 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as 'object' | 'string' | 'number' | 'boolean';
}

function summarise(value: JsonValue): string {
  if (Array.isArray(value)) return `${value.length}`;
  if (value !== null && typeof value === 'object') return `${Object.keys(value).length}`;
  return '';
}

function pathLabel(path: (string | number)[]): string {
  if (path.length === 0) return '$';
  let label = '$';
  for (const part of path) {
    if (typeof part === 'number') label += `[${part}]`;
    else label += /^[A-Za-z_$][\w$]*$/.test(part) ? `.${part}` : `["${part}"]`;
  }
  return label;
}

interface NodeProps {
  label: string;
  value: JsonValue;
  path: (string | number)[];
  depth: number;
  onCopy: (path: (string | number)[], value: JsonValue) => void;
  openByDefault: boolean;
}

function JsonNode({ label, value, path, depth, onCopy, openByDefault }: NodeProps) {
  const kind = typeOf(value);
  const [open, setOpen] = useState(openByDefault && depth < 2);
  const container = kind === 'array' || kind === 'object';
  const entries = container
    ? kind === 'array'
      ? (value as JsonValue[]).map((item, index) => [index, item] as const)
      : Object.entries(value as Record<string, JsonValue>)
    : [];

  return (
    <div className="json-node" style={{ '--depth': depth } as CSSProperties}>
      <div className="json-node__row">
        {container ? (
          <button type="button" className="json-node__toggle" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
          </button>
        ) : (
          <span className="json-node__spacer" />
        )}
        <span className="json-node__label">{label}</span>
        {container ? (
          <span className="json-node__summary">
            {kind === 'array' ? '[' : '{'}
            {summarise(value)}
            {kind === 'array' ? ']' : '}'}
          </span>
        ) : (
          <span className={`json-node__value json-node__value--${kind}`}>
            {kind === 'string' ? `"${String(value)}"` : String(value)}
          </span>
        )}
        <button
          type="button"
          className="json-node__copy"
          title={`${pathLabel(path)}`}
          aria-label={pathLabel(path)}
          onClick={() => onCopy(path, value)}
        >
          <Icon name="copy" size={12} />
        </button>
      </div>
      {container && open && (
        <div className="json-node__children">
          {entries.map(([key, child]) => (
            <JsonNode
              key={String(key)}
              label={String(key)}
              value={child}
              path={[...path, key]}
              depth={depth + 1}
              onCopy={onCopy}
              openByDefault={openByDefault}
            />
          ))}
          {entries.length === 0 && <div className="json-node__empty">∅</div>}
        </div>
      )}
    </div>
  );
}

export function JsonView({ value, onToast }: JsonViewProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'tree' | 'formatted'>('tree');
  const formatted = useMemo(() => JSON.stringify(value, null, 2) ?? '', [value]);

  const handleCopy = async (path: (string | number)[], node: JsonValue) => {
    const ok = await copyText(JSON.stringify(node, null, 2) ?? '');
    onToast(ok ? t('common.copied') : t('common.copyFailed'), ok ? 'success' : 'error');
    if (ok) onToast(pathLabel(path), 'info');
  };

  return (
    <div className="json-view">
      <div className="json-view__toolbar">
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'tree'}
            className={`segmented__item${mode === 'tree' ? ' is-active' : ''}`}
            onClick={() => setMode('tree')}
          >
            <Icon name="tree" size={13} />
            {t('workspace.treeView')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'formatted'}
            className={`segmented__item${mode === 'formatted' ? ' is-active' : ''}`}
            onClick={() => setMode('formatted')}
          >
            <Icon name="text" size={13} />
            {t('workspace.formattedView')}
          </button>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--xs"
          onClick={async () => {
            const ok = await copyText(formatted);
            onToast(ok ? t('common.copied') : t('common.copyFailed'), ok ? 'success' : 'error');
          }}
        >
          <Icon name="copy" size={13} />
          {t('workspace.copyAll')}
        </button>
      </div>

      {mode === 'tree' ? (
        <div className="json-view__tree">
          <JsonNode label="$" value={value} path={[]} depth={0} onCopy={handleCopy} openByDefault />
        </div>
      ) : (
        <pre className="json-view__code">
          <code>{formatted}</code>
        </pre>
      )}
    </div>
  );
}
