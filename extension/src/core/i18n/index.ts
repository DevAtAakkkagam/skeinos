// The translation accessor (D-i18n-4). `t(key, params)` reads the active locale's
// catalog and falls back to the English value key-by-key when a translation is
// absent or empty — it never renders a raw key or an empty string for a known
// message. `useT()` is the Preact view binding: it freezes the locale at mount.

import { useRef } from 'preact/hooks';
import { en } from '../../locales/en';
import { activeLocale, PSEUDO_LOCALE, type Locale, type SupportedLocale } from './locales';
import { pseudoCatalog } from './pseudo';
import { formatMessage, type Params } from './format';
import type { Catalog, MessageKey } from './catalog';

export type { MessageKey } from './catalog';
export type { Params } from './format';
export { activeLocale, forceLocale, resolveLocale, type Locale } from './locales';

/** A locale-bound translator. */
export type TFunction = (key: MessageKey, params?: Params) => string;

// Loaded catalogs. English is statically bundled (the source of truth AND the
// per-key fallback, so it must always be present); the non-English catalogs are
// code-split and load on demand via `ensureLocale()` — this keeps the shadow-DOM
// bundle English-only at rest and within the size budget (D-i18n-1). Until a
// locale's catalog has loaded, `translate()` simply falls back to English per key.
const PROD_CATALOGS: Partial<Record<SupportedLocale, Catalog>> = {
  en: en as Catalog,
};

// Dynamic importers for the non-English catalogs. Each `import()` is a separate
// chunk, so only the active locale's catalog is ever fetched.
const LOADERS: Record<Exclude<SupportedLocale, 'en'>, () => Promise<Catalog>> = {
  de: () => import('../../locales/de').then((m) => m.de),
  fr: () => import('../../locales/fr').then((m) => m.fr),
  es: () => import('../../locales/es').then((m) => m.es),
  pt: () => import('../../locales/pt').then((m) => m.pt),
};

function catalogFor(locale: Locale): Catalog {
  if (locale === PSEUDO_LOCALE) return pseudoCatalog();
  return PROD_CATALOGS[locale] ?? (en as Catalog);
}

/**
 * Ensure the active locale's catalog is loaded, then return it. English and the
 * pseudo-locale (derived from English) need no load. UI entrypoints `await` this
 * once before mounting so the first render is already in the right language;
 * calling it again is cheap (the catalog is cached after the first load).
 */
export async function ensureLocale(): Promise<Locale> {
  const locale = activeLocale();
  if (locale !== 'en' && locale !== PSEUDO_LOCALE && !PROD_CATALOGS[locale]) {
    PROD_CATALOGS[locale] = await LOADERS[locale]();
  }
  return locale;
}

/** Translate `key` against `locale`, falling back to the English value per key. */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const catalog = catalogFor(locale);
  const value = catalog[key];
  // Absent or empty string → English source of truth (D-i18n-4). A PluralForms
  // object is always non-empty, so only string values can trigger the fallback.
  const resolved = value === undefined || value === '' ? en[key] : value;
  return formatMessage(resolved, locale, params);
}

/** Translate against the session's active locale (for non-component callers). */
export function t(key: MessageKey, params?: Params): string {
  return translate(activeLocale(), key, params);
}

/**
 * Preact hook returning a translator bound to the locale resolved at mount. The
 * locale is frozen for the component's life (browser locale doesn't change live),
 * so re-renders never re-resolve.
 */
export function useT(): TFunction {
  const ref = useRef<TFunction | null>(null);
  if (ref.current === null) {
    const locale = activeLocale();
    ref.current = (key, params) => translate(locale, key, params);
  }
  return ref.current;
}
