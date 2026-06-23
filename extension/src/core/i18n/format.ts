// Message formatting (D-i18n-1, D-i18n-5): named-parameter interpolation and
// locale-correct plural selection. A ~tiny in-repo formatter — no ICU library —
// to keep the shadow-DOM bundle dependency-free.

import type { MessageValue, PluralForms } from './catalog';

/** Values a message can interpolate. Numbers are stringified at substitution. */
export type Params = Record<string, string | number>;

// A single-brace `{name}` token, but NOT one nested inside double braces. The app
// shows the literal prompt-variable syntax `{{variable}}` to users (e.g. "add
// {{name}} to the prompt"), so the lookbehind/lookahead keep those doubled braces
// untouched while still interpolating real `{param}` tokens.
const TOKEN = /(?<!\{)\{(\w+)\}(?!\})/g;

/** Substitute `{name}` tokens from `params`. Tokens with no matching param are
 *  left intact (a visible signal of a missing value rather than a silent blank). */
export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(TOKEN, (token, name: string) =>
    name in params ? String(params[name]) : token,
  );
}

/** Pick the plural form for `count` under the active locale's CLDR rules. */
export function selectPlural(forms: PluralForms, locale: string, count: number): string {
  const category = new Intl.PluralRules(locale).select(count);
  return forms[category] ?? forms.other;
}

/**
 * Render a catalog value to a string: select the plural branch (by `params.count`)
 * when the value carries plural forms, then interpolate named parameters.
 */
export function formatMessage(value: MessageValue, locale: string, params?: Params): string {
  const template =
    typeof value === 'string' ? value : selectPlural(value, locale, Number(params?.count ?? 0));
  return interpolate(template, params);
}
