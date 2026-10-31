import { useCallback, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../i18n';

export interface DropzoneProps {
  onFiles: (files: File[]) => void;
  compact?: boolean;
  busy?: boolean;
}

export function Dropzone({ onFiles, compact = false, busy = false }: DropzoneProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFiles(Array.from(list));
    },
    [onFiles],
  );

  return (
    <div
      className={`dropzone${dragging ? ' is-dragging' : ''}${compact ? ' dropzone--compact' : ''}`}
      role="region"
      aria-label={t('a11y.dropzone')}
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="visually-hidden"
        multiple
        accept=".csv,.tsv,.txt,.json,.jsonl,.ndjson,.jsonlines,.ldjson,text/csv,application/json,text/plain"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <div className="dropzone__icon" aria-hidden="true">
        <Icon name="upload" size={compact ? 18 : 26} />
      </div>

      <div className="dropzone__body">
        <p className="dropzone__title">{t('landing.dropTitle')}</p>
        <p className="dropzone__hint">
          {t('landing.dropHint')}{' '}
          <button type="button" className="link-button" onClick={() => inputRef.current?.click()} disabled={busy}>
            {t('landing.browse')}
          </button>
        </p>
      </div>

      {!compact && (
        <>
          <p className="dropzone__formats">{t('landing.formats')}</p>
          <p className="dropzone__privacy">
            <Icon name="lock" size={13} />
            {t('landing.privacyNote')}
          </p>
        </>
      )}
    </div>
  );
}
