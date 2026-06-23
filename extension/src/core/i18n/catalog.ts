// The message-catalog shape (D-i18n-3). The English catalog (`locales/en.ts`) is
// the single source of truth: `MessageKey` is derived from it, so every other
// locale — typed `Catalog` — is a compile error if it drops or misspells a key.
// (The type-only import of `en` is erased at build time, so there is no runtime
// import cycle with the catalog modules.)

import type { en } from '../../locales/en';

/**
 * CLDR plural categories for a count-bearing message (D-i18n-5). `other` is
 * required (the universal fallback); the rest are filled per locale as its rules
 * need them. Selection is by `Intl.PluralRules(locale).select(count)`.
 */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/** A catalog entry: a plain phrase or a set of plural forms. */
export type MessageValue = string | PluralForms;

/** The union of every message key, derived from the English source of truth. */
export type MessageKey = keyof typeof en;

/** A full catalog for one locale — every English key, no orphans (enforced by type). */
export type Catalog = Record<MessageKey, MessageValue>;
