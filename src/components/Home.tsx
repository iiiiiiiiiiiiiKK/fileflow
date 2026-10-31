import { Dropzone } from './Dropzone';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { AUTHOR_X_URL, GITHUB_URL, LIVE_URL } from '../lib/links';

export interface HomeProps {
  onFiles: (files: File[]) => void;
  onOpenWorkspace: () => void;
  busy: boolean;
}

const FEATURES: { icon: 'upload' | 'table' | 'swap' | 'sliders' | 'wand' | 'chart' | 'archive'; title: MessageKey; desc: MessageKey }[] = [
  { icon: 'upload', title: 'landing.feature1Title', desc: 'landing.feature1Desc' },
  { icon: 'table', title: 'landing.feature2Title', desc: 'landing.feature2Desc' },
  { icon: 'swap', title: 'landing.feature3Title', desc: 'landing.feature3Desc' },
  { icon: 'sliders', title: 'landing.feature4Title', desc: 'landing.feature4Desc' },
  { icon: 'wand', title: 'landing.feature5Title', desc: 'landing.feature5Desc' },
  { icon: 'chart', title: 'landing.feature6Title', desc: 'landing.feature6Desc' },
  { icon: 'archive', title: 'landing.feature7Title', desc: 'landing.feature7Desc' },
];

const STEPS = [
  { title: 'landing.step1Title', desc: 'landing.step1Desc' },
  { title: 'landing.step2Title', desc: 'landing.step2Desc' },
  { title: 'landing.step3Title', desc: 'landing.step3Desc' },
] as const;

const GUIDE = [
  { title: 'landing.guide1Title', desc: 'landing.guide1Desc' },
  { title: 'landing.guide2Title', desc: 'landing.guide2Desc' },
  { title: 'landing.guide3Title', desc: 'landing.guide3Desc' },
  { title: 'landing.guide4Title', desc: 'landing.guide4Desc' },
  { title: 'landing.guide5Title', desc: 'landing.guide5Desc' },
] as const;

const FAQ = [
  { q: 'landing.faq1Q', a: 'landing.faq1A' },
  { q: 'landing.faq2Q', a: 'landing.faq2A' },
  { q: 'landing.faq3Q', a: 'landing.faq3A' },
  { q: 'landing.faq4Q', a: 'landing.faq4A' },
] as const;

export function Home({ onFiles, onOpenWorkspace, busy }: HomeProps) {
  const { t } = useI18n();

  return (
    <main className="home" id="top">
      <section className="hero">
        <p className="hero__eyebrow">
          <span className="dot" aria-hidden="true" />
          {t('landing.eyebrow')}
        </p>
        <h1 className="hero__title">{t('landing.title')}</h1>
        <p className="hero__subtitle">{t('landing.subtitle')}</p>
        <div className="hero__drop">
          <Dropzone onFiles={onFiles} busy={busy} />
        </div>
        <ul className="hero__facts">
          <li>
            <Icon name="lock" size={13} />
            {t('landing.privacyLead')}
          </li>
          <li>
            <Icon name="swap" size={13} />
            CSV · JSON · JSONL · TXT
          </li>
          <li>
            <Icon name="archive" size={13} />
            ZIP
          </li>
        </ul>
      </section>

      <section className="section" id="features">
        <header className="section__head">
          <h2>{t('landing.featuresTitle')}</h2>
          <p>{t('landing.featuresSubtitle')}</p>
        </header>
        <div className="feature-grid">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="feature">
              <span className="feature__icon">
                <Icon name={feature.icon} size={17} />
              </span>
              <h3>{t(feature.title)}</h3>
              <p>{t(feature.desc)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--steps">
        <header className="section__head">
          <h2>{t('landing.stepsTitle')}</h2>
          <p>{t('landing.stepsSubtitle')}</p>
        </header>
        <ol className="steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="step-card">
              <span className="step-card__index">{String(index + 1).padStart(2, '0')}</span>
              <h3>{t(step.title)}</h3>
              <p>{t(step.desc)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" id="guide">
        <header className="section__head">
          <h2>{t('landing.guideTitle')}</h2>
          <p>{t('landing.guideSubtitle')}</p>
        </header>
        <div className="guide">
          {GUIDE.map((item, index) => (
            <article key={item.title} className="guide__item">
              <span className="guide__index">{index + 1}</span>
              <div>
                <h3>{t(item.title)}</h3>
                <p>{t(item.desc)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--privacy" id="privacy">
        <div className="privacy-card">
          <div className="privacy-card__head">
            <span className="feature__icon">
              <Icon name="lock" size={17} />
            </span>
            <h2>{t('landing.privacyTitle')}</h2>
          </div>
          <p className="privacy-card__lead">{t('landing.privacyLead')}</p>
          <ul className="privacy-card__list">
            <li>{t('landing.privacy1')}</li>
            <li>{t('landing.privacy2')}</li>
            <li>{t('landing.privacy3')}</li>
            <li>{t('landing.privacy4')}</li>
          </ul>
        </div>
      </section>

      <section className="section" id="faq">
        <header className="section__head">
          <h2>{t('landing.faqTitle')}</h2>
        </header>
        <div className="faq">
          {FAQ.map((item) => (
            <details key={item.q} className="faq__item">
              <summary>{t(item.q)}</summary>
              <p>{t(item.a)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cta">
        <h2>{t('landing.ctaTitle')}</h2>
        <p>{t('landing.ctaBody')}</p>
        <button type="button" className="btn btn--primary btn--lg" onClick={onOpenWorkspace}>
          {t('landing.ctaButton')}
          <Icon name="chevronRight" size={15} />
        </button>
      </section>

      <footer className="footer">
        <div className="footer__inner">
          <div className="footer__brand">
            <span className="brand__name">FileFlow</span>
            <span className="footer__tagline">{t('common.tagline')}</span>
            <span className="footer__note">{t('landing.footerNote')}</span>
          </div>
          <nav className="footer__links" aria-label={t('a11y.mainNav')}>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Icon name="github" size={14} />
              GitHub
            </a>
            <a href={AUTHOR_X_URL} target="_blank" rel="noopener noreferrer">
              <Icon name="x" size={14} />
              @0xkillcoin
            </a>
            <a href={LIVE_URL} target="_blank" rel="noopener noreferrer">
              <Icon name="globe" size={14} />
              {t('landing.license')}: MIT
            </a>
          </nav>
        </div>
        <p className="footer__legal">
          © {new Date().getFullYear()} FileFlow · {t('landing.madeBy')}: KK (@0xkillcoin) · MIT License
        </p>
      </footer>
    </main>
  );
}
