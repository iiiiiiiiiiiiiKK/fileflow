import { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { Workspace } from './components/Workspace';
import { Toasts } from './components/Toasts';
import { useWorkspace } from './hooks/useWorkspace';
import { useTheme } from './hooks/useTheme';
import { useToasts } from './hooks/useToasts';
import { useI18n } from './i18n';
import type { MessageKey } from './i18n';
import { LIMITS } from './lib/limits';
import { disposeImportWorker } from './lib/importClient';

type Route = 'home' | 'workspace';

export function App() {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const workspace = useWorkspace();
  const toasts = useToasts();
  const [route, setRoute] = useState<Route>(() => (window.location.hash === '#workspace' ? 'workspace' : 'home'));

  useEffect(() => () => disposeImportWorker(), []);

  useEffect(() => {
    const next = window.location.hash === '#workspace' ? 'workspace' : 'home';
    setRoute(next);
    const onHashChange = () => setRoute(window.location.hash === '#workspace' ? 'workspace' : 'home');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((target: Route) => {
    setRoute(target);
    window.location.hash = target === 'workspace' ? '#workspace' : '';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const addFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return;
      if (incoming.length > LIMITS.maxFiles) {
        toasts.push(t('errors.maxFiles', { limit: LIMITS.maxFiles }), 'warning');
      }
      const outcomes = await workspace.addFiles(incoming.slice(0, LIMITS.maxFiles));
      for (const outcome of outcomes) {
        if (outcome.file.issue) {
          toasts.push(
            `${outcome.file.name}: ${t(outcome.file.issue.message as MessageKey, { limit: '25 MB' })}`,
            'error',
          );
        } else {
          toasts.push(outcome.file.name, 'success');
        }
      }
      if (outcomes.length > 0) navigate('workspace');
    },
    [navigate, t, toasts, workspace],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta || event.key.toLowerCase() !== 'z' || !workspace.activeId) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      const result = workspace.undo(workspace.activeId);
      if (result.ok) toasts.push(t('workspace.undoDone', { label: result.label ?? '' }), 'info');
      else toasts.push(t('workspace.undoEmpty'), 'warning');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [t, toasts, workspace]);

  return (
    <>
      <a className="skip-link" href="#main">
        {t('a11y.skipToContent')}
      </a>
      <Header theme={theme} onToggleTheme={toggleTheme} inWorkspace={route === 'workspace'} onNavigate={navigate} />
      <div id="main" className="app-shell">
        {route === 'home' ? (
          <Home onFiles={(files) => void addFiles(files)} onOpenWorkspace={() => navigate('workspace')} busy={Boolean(workspace.importing)} />
        ) : (
          <Workspace workspace={workspace} onToast={toasts.push} onHome={() => navigate('home')} />
        )}
      </div>
      <Toasts api={toasts} />
    </>
  );
}
