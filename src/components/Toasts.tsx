import { Icon } from './Icon';
import { useI18n } from '../i18n';
import type { ToastApi } from '../hooks/useToasts';

export interface ToastsProps {
  api: ToastApi;
}

export function Toasts({ api }: ToastsProps) {
  const { t } = useI18n();
  if (api.toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {api.toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <Icon name={toast.tone === 'error' ? 'alert' : toast.tone === 'success' ? 'check' : 'info'} size={14} />
          <span className="toast__message">{toast.message}</span>
          <button type="button" className="toast__close" onClick={() => api.dismiss(toast.id)} aria-label={t('common.dismiss')}>
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
