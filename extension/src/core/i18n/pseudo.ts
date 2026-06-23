// Pseudo-locale generator (D-i18n-6). Derives `en-XA` from the English catalog at
// runtime: accent each ASCII letter, bracket the whole string, and pad to ≥140%
// length — WITHOUT touching `{param}` tokens (so interpolation still works) or the
// literal `{{variable}}` prompt syntax. Used by the expansion browser test to catch
// truncation/overflow before translators do (D21, ~30% tolerance).

import type { Catalog, MessageValue, PluralForms } from './catalog';
import { en } from '../../locales/en';

// ASCII → accented homoglyphs. Same letter shape, visibly "foreign", and (for the
// test) every transformed string is distinguishable from raw English.
const MAP: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'í', j: 'ĵ',
  k: 'ķ', l: 'ļ', m: 'ɱ', n: 'ñ', o: 'ó', p: 'þ', q: ' q', r: 'ŕ', s: 'š', t: 'ţ',
  u: 'ú', v: 'ṽ', w: 'ŵ', x: 'x', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Í', J: 'Ĵ',
  K: 'Ķ', L: 'Ļ', M: 'Ṁ', N: 'Ñ', O: 'Ó', P: 'Þ', Q: 'Q', R: 'Ŕ', S: 'Š', T: 'Ţ',
  U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'X', Y: 'Ý', Z: 'Ž',
};

// Pad glyphs appended to reach ≥140% width without adding interpolatable tokens.
const PAD = '·';

// Split on `{param}` and `{{...}}` runs so braces and their contents pass through
// verbatim while the surrounding text is accented.
const SEGMENT = /(\{\{[^}]*\}\}|\{\w+\})/g;

function accent(text: string): string {
  return text.replace(/[A-Za-z]/g, (ch) => MAP[ch] ?? ch);
}

/** Transform one phrase: accent the letters, bracket it, pad to ~140% length. */
export function pseudoString(input: string): string {
  const accented = input
    .split(SEGMENT)
    .map((seg) => (seg.startsWith('{') ? seg : accent(seg)))
    .join('');
  // Letters drive perceived width; pad against the letter count, min 2 glyphs.
  const letters = (input.match(/[A-Za-z]/g) ?? []).length;
  const padCount = Math.max(2, Math.ceil(letters * 0.4));
  return `⟦${accented}${' ' + PAD.repeat(padCount)}⟧`;
}

function pseudoValue(value: MessageValue): MessageValue {
  if (typeof value === 'string') return pseudoString(value);
  const out: PluralForms = { other: pseudoString(value.other) };
  for (const k of ['zero', 'one', 'two', 'few', 'many'] as const) {
    const form = value[k];
    if (form !== undefined) out[k] = pseudoString(form);
  }
  return out;
}

let memo: Catalog | null = null;

/** The pseudo-locale catalog, derived once from English. */
export function pseudoCatalog(): Catalog {
  if (memo) return memo;
  const out = {} as Catalog;
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    out[key] = pseudoValue(en[key]);
  }
  return (memo = out);
}
