// i18n runtime (happy-dom): locale resolution order, subtag mapping, the
// unsupported→en fallback, named-parameter interpolation, locale-correct plural
// selection, and per-key English fallback for missing/empty values. (Task 1.5.)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forceLocale, resolveLocale, t, translate } from '../src/core/i18n';
import { interpolate, selectPlural } from '../src/core/i18n/format';
import { pseudoString } from '../src/core/i18n/pseudo';

// `resolveLocale` reads `browser.i18n.getUILanguage()` (via extApi → globalThis)
// then `navigator.languages`. Drive both through the globals.
function setUiLanguage(lang: string | undefined): void {
  (globalThis as { chrome?: unknown }).chrome = lang
    ? { i18n: { getUILanguage: () => lang } }
    : undefined;
}

function setNavLanguages(langs: string[]): void {
  Object.defineProperty(navigator, 'languages', { value: langs, configurable: true });
}

beforeEach(() => {
  forceLocale(null);
  setUiLanguage(undefined);
  setNavLanguages([]);
});

afterEach(() => {
  forceLocale(null);
  setUiLanguage(undefined);
  vi.restoreAllMocks();
});

describe('resolveLocale', () => {
  it('matches a supported browser UI language', () => {
    setUiLanguage('de');
    expect(resolveLocale()).toBe('de');
  });

  it('maps a regional variant to its base locale', () => {
    setUiLanguage('de-AT');
    expect(resolveLocale()).toBe('de');
  });

  it('falls back to English for an unsupported locale', () => {
    setUiLanguage('ja');
    setNavLanguages(['ja-JP']);
    expect(resolveLocale()).toBe('en');
  });

  it('prefers the extension UI language over navigator.languages', () => {
    setUiLanguage('fr');
    setNavLanguages(['es-ES']);
    expect(resolveLocale()).toBe('fr');
  });

  it('falls through to navigator.languages when the UI language is unsupported', () => {
    setUiLanguage('ja');
    setNavLanguages(['ja-JP', 'es-ES']);
    expect(resolveLocale()).toBe('es');
  });

  it('honours a forced locale above all browser signals', () => {
    setUiLanguage('de');
    forceLocale('fr');
    expect(resolveLocale()).toBe('fr');
  });
});

describe('interpolate', () => {
  it('substitutes a named parameter and leaves no token', () => {
    const out = interpolate('Fill in: {title}', { title: 'Greeting' });
    expect(out).toBe('Fill in: Greeting');
    expect(out).not.toMatch(/\{title\}/);
  });

  it('stringifies numeric params', () => {
    expect(interpolate('{count} vars', { count: 3 })).toBe('3 vars');
  });

  it('leaves the literal {{variable}} prompt syntax untouched', () => {
    expect(interpolate('add {{name}} to the prompt', {})).toBe('add {{name}} to the prompt');
  });
});

describe('selectPlural', () => {
  const forms = { one: '1 var', other: '{count} vars' };

  it('selects the English one/other forms', () => {
    expect(selectPlural(forms, 'en', 1)).toBe('1 var');
    expect(selectPlural(forms, 'en', 2)).toBe('{count} vars');
  });

  it('falls back to other when a category form is absent', () => {
    expect(selectPlural({ other: '{count} items' }, 'en', 1)).toBe('{count} items');
  });
});

describe('translate', () => {
  it('renders a plain English key', () => {
    expect(translate('en', 'prompts.sectionTitle')).toBe('Prompts');
  });

  it('selects and interpolates a plural message by count', () => {
    expect(translate('en', 'prompts.varsCount', { count: 1 })).toBe('1 var');
    expect(translate('en', 'prompts.varsCount', { count: 4 })).toBe('4 vars');
  });

  it('interpolates a parameterized message', () => {
    expect(translate('en', 'inputBar.modalTitle', { title: 'Recipe' })).toBe('Fill in: Recipe');
  });

  it('falls back to the English value for a locale with no catalog yet', () => {
    // `fr` resolves but its catalog may not be registered — per-key English fallback.
    expect(translate('fr', 'prompts.sectionTitle')).toBe('Prompts');
  });
});

describe('t', () => {
  it('translates against the active (forced) locale', () => {
    forceLocale('en');
    expect(t('profiles.sectionTitle')).toBe('Profiles');
  });
});

describe('pseudo-locale', () => {
  it('accents, brackets, and pads the text', () => {
    const out = pseudoString('Folders');
    expect(out.startsWith('⟦')).toBe(true);
    expect(out.endsWith('⟧')).toBe(true);
    expect(out).not.toContain('Folders'); // letters were accented
    expect(out.length).toBeGreaterThan('Folders'.length * 1.3); // ≥30% padded
  });

  it('leaves interpolation tokens intact so they still interpolate', () => {
    const out = pseudoString('Fill in: {title}');
    expect(out).toContain('{title}');
    expect(interpolate(out, { title: 'Soup' })).toContain('Soup');
  });

  it('leaves the literal {{variable}} prompt syntax untouched', () => {
    expect(pseudoString('add {{name}} to the prompt')).toContain('{{name}}');
  });

  it('renders the catalog through the pseudo-locale via translate', () => {
    const out = translate('en-XA', 'inputBar.modalTitle', { title: 'Soup' });
    expect(out).toContain('⟦');
    expect(out).toContain('Soup');
    expect(out).not.toMatch(/\{title\}/);
  });
});
