import { IntlMessageFormat } from 'intl-messageformat';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { setPrefs, usePrefs, type Locale } from '../prefs/store';
import en from './locales/en.json';
import fa from './locales/fa.json';
import labEn from './locales/lab.en.json';
import labFa from './locales/lab.fa.json';

type Dict = Record<string, string>;
const APP: Record<Locale, Dict> = { en: en as Dict, fa: fa as Dict };
const LAB: Record<Locale, Dict> = { en: labEn as Dict, fa: labFa as Dict };
const ICU_LOCALE: Record<Locale, string> = { en: 'en', fa: 'fa-IR' };

const cache = new Map<string, IntlMessageFormat>();

function format(locale: Locale, source: string, values?: Record<string, unknown>): string {
  if (!values && !source.includes('{')) return source;
  const k = locale + '\u0000' + source;
  let f = cache.get(k);
  if (!f) {
    try {
      f = new IntlMessageFormat(source, ICU_LOCALE[locale]);
    } catch {
      return source;
    }
    cache.set(k, f);
  }
  try {
    return String(f.format(values as never));
  } catch {
    return source;
  }
}

/** Look a key up in the locale, then English, then show the key itself (never a blank). */
export function translate(locale: Locale, key: string, values?: Record<string, unknown>, ns: 'app' | 'lab' = 'app'): string {
  const table = ns === 'app' ? APP : LAB;
  const src = table[locale][key] ?? table.en[key] ?? key;
  return format(locale, src, values);
}

export interface I18n {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: (key: string, values?: Record<string, unknown>) => string;
  tl: (key: string, values?: Record<string, unknown>) => string; // prototype lab strings
  setLocale: (l: Locale) => void;
  num: (n: number, opts?: Intl.NumberFormatOptions) => string;
  date: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
  /** Pick the learner's language from a {en, fa} object, falling back to English when a translation is missing. */
  pick: (text: { en: string; fa?: string } | undefined) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale } = usePrefs();
  const setLocale = useCallback((l: Locale) => setPrefs({ locale: l }), []);
  const value = useMemo<I18n>(() => {
    const intlTag = locale === 'fa' ? 'fa-IR-u-nu-arabext' : 'en';
    // Persian dates use the Jalali (solar hijri) calendar; English uses the Gregorian calendar.
    const dateTag = locale === 'fa' ? 'fa-IR-u-ca-persian-nu-arabext' : 'en';
    return {
      locale,
      dir: locale === 'fa' ? 'rtl' : 'ltr',
      t: (k, v) => translate(locale, k, v),
      tl: (k, v) => translate(locale, k, v, 'lab'),
      setLocale,
      num: (n, o) => new Intl.NumberFormat(intlTag, o).format(n),
      date: (d, o) => new Intl.DateTimeFormat(dateTag, o ?? { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(d)),
      pick: (text) => (text ? (locale === 'fa' && text.fa ? text.fa : text.en) : ''),
    };
  }, [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
  return v;
}

export const _test = { APP, LAB };
