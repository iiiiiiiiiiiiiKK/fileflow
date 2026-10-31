import { describe, expect, it } from 'vitest';
import { detectLocale, translate } from './index';
import { en, zh } from './messages';

function flatten(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('message catalogue', () => {
  it('has exactly the same keys in both languages', () => {
    const zhKeys = flatten(zh).sort();
    const enKeys = flatten(en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('has no empty strings', () => {
    for (const key of flatten(zh)) {
      expect(translate('zh', key).length).toBeGreaterThan(0);
      expect(translate('en', key).length).toBeGreaterThan(0);
    }
  });

  it('never returns a raw key for an existing message', () => {
    expect(translate('zh', 'common.undo')).toBe('撤销');
    expect(translate('en', 'common.undo')).toBe('Undo');
  });
});

describe('translate', () => {
  it('interpolates placeholders', () => {
    expect(translate('zh', 'common.page', { page: 3 })).toBe('第 3 页');
    expect(translate('en', 'landing.step1Desc', {})).toContain('detects');
  });

  it('falls back to the key itself for unknown messages', () => {
    expect(translate('en', 'does.not.exist')).toBe('does.not.exist');
  });

  it('keeps a Chinese fallback when a translation is missing', () => {
    expect(translate('en', 'common.page', { page: 1, total: 2 })).toBe('Page 1');
  });
});

describe('detectLocale', () => {
  it('prefers a stored preference', () => {
    localStorage.setItem('fileflow.locale', 'en');
    expect(detectLocale()).toBe('en');
    localStorage.setItem('fileflow.locale', 'zh');
    expect(detectLocale()).toBe('zh');
  });

  it('falls back to the browser language', () => {
    localStorage.removeItem('fileflow.locale');
    const value = detectLocale();
    expect(['zh', 'en']).toContain(value);
  });
});
