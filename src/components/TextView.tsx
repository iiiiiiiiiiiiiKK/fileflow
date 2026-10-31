import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import { copyText } from '../lib/export';

export interface TextViewProps {
  text: string;
  onToast: (message: string, tone?: 'success' | 'error' | 'info' | 'warning') => void;
}

const MAX_RENDER_CHARS = 200_000;

export function TextView({ text, onToast }: TextViewProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  const clipped = text.length > MAX_RENDER_CHARS ? text.slice(0, MAX_RENDER_CHARS) : text;
  const lineCount = useMemo(() => {
    if (clipped === '') return 0;
    return clipped.split(/\r?\n/).length;
  }, [clipped]);

  const segments = useMemo(() => {
    const needle = query.trim();
    if (!needle) return [{ text: clipped, match: false }];
    const parts: { text: string; match: boolean }[] = [];
    const lower = clipped.toLowerCase();
    const target = needle.toLowerCase();
    let cursor = 0;
    let guard = 0;
    while (cursor < clipped.length && guard < 500) {
      const found = lower.indexOf(target, cursor);
      if (found < 0) break;
      if (found > cursor) parts.push({ text: clipped.slice(cursor, found), match: false });
      parts.push({ text: clipped.slice(found, found + needle.length), match: true });
      cursor = found + needle.length;
      guard += 1;
    }
    if (cursor < clipped.length) parts.push({ text: clipped.slice(cursor), match: false });
    return parts;
  }, [clipped, query]);

  const matches = segments.filter((segment) => segment.match).length;

  return (
    <div className="text-view">
      <div className="text-view__toolbar">
        <label className="search-field search-field--compact">
          <Icon name="search" size={14} />
          <input
            type="search"
            value={query}
            placeholder={t('workspace.textSearchHint')}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('workspace.textSearchHint')}
          />
        </label>
        <span className="text-view__meta">
          {lineCount} {t('common.rows')}
          {query.trim() ? ` · ${matches}` : ''}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--xs"
          onClick={async () => {
            const ok = await copyText(text);
            onToast(ok ? t('common.copied') : t('common.copyFailed'), ok ? 'success' : 'error');
          }}
        >
          <Icon name="copy" size={13} />
          {t('common.copy')}
        </button>
      </div>

      {text.length > MAX_RENDER_CHARS && <p className="notice notice--info">{t('workspace.textTooLarge')}</p>}

      <pre className="text-view__body">
        <code>
          {segments.map((segment, index) =>
            segment.match ? (
              <mark key={index} className="text-view__mark">
                {segment.text}
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </code>
      </pre>
    </div>
  );
}
