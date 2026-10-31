/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { en, zh } from './messages';
import type { Dict, Locale } from './messages';

export type MessageKey = {
  [K in keyof Dict & string]: Dict[K] extends string ? K : `${K}.${LeafKeys<Dict[K]>}`
}[keyof Dict & string];

type LeafKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafKeys<T[K]>}`
}[keyof T & string];

const CATALOGUES: Record<Locale, unknown> = { zh, en };
const STORAGE_KEY = 'fileflow.locale';

export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    /* storage can be unavailable in private mode */
  }
  const languages = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const language of languages) {
    if (!language) continue;
    if (language.toLowerCase().startsWith('zh')) return 'zh';
    if (language.toLowerCase().startsWith('en')) return 'en';
  }
  return 'zh';
}

function lookup(catalogue: unknown, key: string): string | undefined {
  let node: unknown = catalogue;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const primary = lookup(CATALOGUES[locale], key);
  const fallback = lookup(CATALOGUES.zh, key);
  let text = primary ?? fallback ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* ignore quota / disabled storage */
    }
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const toggleLocale = useCallback(() => setLocaleState((current) => (current === 'zh' ? 'en' : 'zh')), []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale, toggleLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>');
  return context;
}
