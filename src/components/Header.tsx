import { Icon } from './Icon';
import { useI18n } from '../i18n';
import type { Theme } from '../hooks/useTheme';
import { AUTHOR_X_URL, GITHUB_URL } from '../lib/links';

export interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  inWorkspace: boolean;
  onNavigate: (target: 'home' | 'workspace') => void;
}

export function Header({ theme, onToggleTheme, inWorkspace, onNavigate }: HeaderProps) {
  const { t, locale, toggleLocale } = useI18n();

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <button
          type="button"
          className="brand"
          onClick={() => onNavigate('home')}
          aria-label={t('common.appName')}
        >
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h9a3 3 0 0 1 0 6H7a3 3 0 0 0 0 6h6" />
              <path d="M17 3l3 3-3 3" />
              <path d="M20 15l-3 3 3 3" transform="translate(0 -1)" />
            </svg>
          </span>
          <span className="brand__text">
            <span className="brand__name">FileFlow</span>
            <span className="brand__tagline">Your Data, Under Control.</span>
          </span>
        </button>

        <nav className="site-nav" aria-label={t('a11y.mainNav')}>
          <a
            className="site-nav__link"
            href="#features"
            onClick={(event) => {
              if (inWorkspace) {
                event.preventDefault();
                onNavigate('home');
                requestAnimationFrame(() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }));
              }
            }}
          >
            {t('nav.features')}
          </a>
          <a
            className="site-nav__link"
            href="#guide"
            onClick={(event) => {
              if (inWorkspace) {
                event.preventDefault();
                onNavigate('home');
                requestAnimationFrame(() => document.getElementById('guide')?.scrollIntoView({ behavior: 'smooth' }));
              }
            }}
          >
            {t('nav.guide')}
          </a>
          <a
            className="site-nav__link"
            href="#privacy"
            onClick={(event) => {
              if (inWorkspace) {
                event.preventDefault();
                onNavigate('home');
                requestAnimationFrame(() => document.getElementById('privacy')?.scrollIntoView({ behavior: 'smooth' }));
              }
            }}
          >
            {t('nav.privacy')}
          </a>
        </nav>

        <div className="site-header__actions">
          <a
            className="author-link"
            href={AUTHOR_X_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={t('a11y.authorLink')}
            aria-label={t('a11y.authorLink')}
          >
            <Icon name="x" size={15} />
            <span className="author-link__handle">@0xkillcoin</span>
          </a>

          <a
            className="icon-button icon-button--quiet"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('nav.github')}
            title={t('nav.github')}
          >
            <Icon name="github" size={17} />
          </a>

          <button
            type="button"
            className="lang-toggle"
            onClick={toggleLocale}
            aria-label={t('a11y.toggleLanguage')}
            title={t('nav.language')}
          >
            <Icon name="globe" size={15} />
            <span>{locale === 'zh' ? 'EN' : '中文'}</span>
          </button>

          <button
            type="button"
            className="icon-button icon-button--quiet"
            onClick={onToggleTheme}
            aria-label={t('a11y.toggleTheme')}
            title={theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark')}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
          </button>

          {!inWorkspace && (
            <button type="button" className="btn btn--primary btn--sm header-cta" onClick={() => onNavigate('workspace')}>
              {t('common.openWorkspace')}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
