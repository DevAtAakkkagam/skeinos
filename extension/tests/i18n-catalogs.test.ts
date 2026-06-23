// Catalog integrity (tasks 4.3 + 6.1): every shipped locale carries exactly the
// English key set (no missing key, no orphan), each locale renders end-to-end for a
// representative spread of keys (plain, plural, interpolated), and parameter/literal
// tokens survive translation.

import { describe, it, expect } from 'vitest';
import { en } from '../src/locales/en';
import { de } from '../src/locales/de';
import { fr } from '../src/locales/fr';
import { es } from '../src/locales/es';
import { pt } from '../src/locales/pt';
import { translate, forceLocale, ensureLocale, type Locale } from '../src/core/i18n';
import type { MessageKey } from '../src/core/i18n/catalog';

const LOCALES: Record<Exclude<Locale, 'en' | 'en-XA'>, Record<string, unknown>> = {
  de,
  fr,
  es,
  pt,
};

const enKeys = Object.keys(en).sort();

describe('catalog completeness', () => {
  for (const [name, catalog] of Object.entries(LOCALES)) {
    it(`${name} has exactly the English key set`, () => {
      expect(Object.keys(catalog).sort()).toEqual(enKeys);
    });

    it(`${name} preserves plural shape where English uses plurals`, () => {
      for (const key of enKeys) {
        const enVal = (en as Record<string, unknown>)[key];
        const locVal = (catalog as Record<string, unknown>)[key];
        if (typeof enVal === 'object') {
          // A plural entry must stay an object with at least `other`.
          expect(typeof locVal).toBe('object');
          expect(locVal).toHaveProperty('other');
        } else {
          expect(typeof locVal).toBe('string');
        }
      }
    });

    it(`${name} keeps interpolation tokens that English declares`, () => {
      const tokenRe = /(?<!\{)\{(\w+)\}(?!\})/g;
      for (const key of enKeys) {
        const enVal = (en as Record<string, unknown>)[key];
        if (typeof enVal !== 'string') continue;
        const enTokens = [...enVal.matchAll(tokenRe)].map((m) => m[1]).sort();
        if (enTokens.length === 0) continue;
        const locVal = (catalog as Record<string, string>)[key];
        const locTokens = [...locVal.matchAll(tokenRe)].map((m) => m[1]).sort();
        expect(locTokens, `tokens for ${name}.${key}`).toEqual(enTokens);
      }
    });
  }
});

describe('each locale renders end-to-end', () => {
  const sampleKeys: MessageKey[] = [
    'prompts.sectionTitle',
    'sidebar.newFolder',
    'shell.search',
    'onboarding.title',
    'search.title',
  ];

  for (const locale of ['en', 'de', 'fr', 'es', 'pt'] as Locale[]) {
    it(`${locale} renders plain, plural, and interpolated messages`, async () => {
      forceLocale(locale);
      try {
        await ensureLocale(); // loads the code-split catalog for non-English locales
        for (const key of sampleKeys) {
          const out = translate(locale, key);
          expect(out).toBeTruthy();
          expect(out).not.toMatch(/^[a-z]+\.[a-zA-Z]/); // not a raw key
        }
        // Plural: singular vs plural differ in every locale here.
        const one = translate(locale, 'prompts.varsCount', { count: 1 });
        const many = translate(locale, 'prompts.varsCount', { count: 5 });
        expect(one).toBeTruthy();
        expect(many).toContain('5');
        expect(many).not.toMatch(/\{count\}/);
        // Interpolation: the value lands, no token remains.
        const interp = translate(locale, 'inputBar.modalTitle', { title: 'Soup' });
        expect(interp).toContain('Soup');
        expect(interp).not.toMatch(/\{title\}/);
      } finally {
        forceLocale(null);
      }
    });
  }
});
