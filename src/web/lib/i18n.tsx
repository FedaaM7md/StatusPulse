/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import ar from '../../shared/i18n/ar.json';
import en from '../../shared/i18n/en.json';
import type { Lang } from './lang';

export type { Lang };
export type TranslationKey = keyof typeof en;

const dictionaries: Record<Lang, Record<string, string>> = {
  ar: ar as Record<string, string>,
  en: en as Record<string, string>,
};

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const template = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, token: string) =>
    params[token] === undefined ? match : String(params[token]),
  );
}

interface I18nValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  try {
    const query = new URLSearchParams(window.location.search).get('lang');
    if (query === 'ar' || query === 'en') return query;
    const stored = localStorage.getItem('sp_lang');
    if (stored === 'ar' || stored === 'en') return stored;
  } catch {
    // localStorage can be unavailable in hardened browsers.
  }
  return 'ar';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = translate(lang, 'app.name');
  }, [lang, dir]);

  useEffect(() => {
    if (lang === 'en') document.documentElement.dataset.locale = 'en';
    else document.documentElement.dataset.locale = 'ar';
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem('sp_lang', next);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang],
  );

  const value = useMemo<I18nValue>(() => ({ lang, dir, setLang, t }), [lang, dir, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

/** Page titles follow the required "Page — Product" pattern. */
export function usePageTitle(key: string): void {
  const { t, lang } = useI18n();
  useEffect(() => {
    const product = translate(lang, 'app.name');
    const page = translate(lang, key);
    document.title = key === 'app.name' || page === product ? product : `${page} — ${product}`;
  }, [key, lang, t]);
}
