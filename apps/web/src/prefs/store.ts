import { useSyncExternalStore } from 'react';

export type Theme = 'system' | 'light' | 'dark' | 'contrast';
export type Locale = 'en' | 'fa';
export interface Prefs {
  theme: Theme;
  locale: Locale;
  fontSize: number; // percent, 80-200
  dyslexia: boolean;
  spacing: 'normal' | 'relaxed' | 'wide';
  reduceMotion: boolean;
  palette: 'default' | 'cb';
  simpleLanguage: boolean;
}

const KEY = 'tracepad.prefs';

export function defaultLocale(): Locale {
  try {
    return (navigator.language || 'en').toLowerCase().startsWith('fa') ? 'fa' : 'en';
  } catch {
    return 'en';
  }
}

export const DEFAULTS: Prefs = {
  theme: 'system', locale: 'en', fontSize: 100, dyslexia: false, spacing: 'normal', reduceMotion: false, palette: 'default', simpleLanguage: false,
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return sanitize({ ...DEFAULTS, locale: defaultLocale(), ...saved });
  } catch {
    return { ...DEFAULTS, locale: defaultLocale() };
  }
}

/** Never trust stored or server-provided prefs: clamp and whitelist every field. */
export function sanitize(p: Partial<Prefs>): Prefs {
  const d = DEFAULTS;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  const fs = Number(p.fontSize);
  return {
    theme: pick(p.theme, ['system', 'light', 'dark', 'contrast'] as const, d.theme),
    locale: pick(p.locale, ['en', 'fa'] as const, defaultLocale()),
    fontSize: Number.isFinite(fs) ? Math.min(200, Math.max(80, Math.round(fs))) : d.fontSize,
    dyslexia: !!p.dyslexia,
    spacing: pick(p.spacing, ['normal', 'relaxed', 'wide'] as const, d.spacing),
    reduceMotion: !!p.reduceMotion,
    palette: pick(p.palette, ['default', 'cb'] as const, d.palette),
    simpleLanguage: !!p.simpleLanguage,
  };
}

/** Write the preferences onto <html> so CSS can react (also done before first paint by public/boot.js). */
export function applyToDocument(p: Prefs, root: HTMLElement = document.documentElement): void {
  if (p.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', p.theme);
  root.lang = p.locale;
  root.dir = p.locale === 'fa' ? 'rtl' : 'ltr';
  root.style.setProperty('--user-font-scale', String(p.fontSize / 100));
  p.dyslexia ? root.setAttribute('data-dyslexia', '1') : root.removeAttribute('data-dyslexia');
  p.spacing === 'normal' ? root.removeAttribute('data-spacing') : root.setAttribute('data-spacing', p.spacing);
  p.reduceMotion ? root.setAttribute('data-motion', 'reduce') : root.removeAttribute('data-motion');
  p.palette === 'cb' ? root.setAttribute('data-palette', 'cb') : root.removeAttribute('data-palette');
}

let state: Prefs = load();
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return state;
}

export function setPrefs(patch: Partial<Prefs>): void {
  state = sanitize({ ...state, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode: preferences simply do not persist */
  }
  applyToDocument(state);
  listeners.forEach((l) => l());
}

export function initPrefs(): void {
  applyToDocument(state);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getPrefs,
    getPrefs,
  );
}
