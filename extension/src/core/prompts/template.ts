// Pure `{{variable}}` template parser for the prompt library (slice 1).
//
// Two functions over one scanner (design D-D): `tokenizeTemplate` exposes the body
// as an ordered run of text/var tokens for rendering, and `parseVariables` folds
// that token stream into the deduplicated `PromptVar[]` the editor + fill modal
// consume. Deriving both from the same scan means the card highlight and the
// variable list can never disagree about which spans are variables.
//
// Dependencies inward: this imports only shared types — no `store`,
// `messaging`, `adapters`, or `ui`. It is pure text-in / data-out and TOTAL: the
// editor re-parses on every keystroke, so neither function ever throws, for any
// input string (design D-B).

import type { PromptVar, TemplateToken } from '../../shared/types';

/**
 * Scan `body` into an ordered run of `text` and `var` tokens.
 *
 * A `{{…}}` span is a `var` only when its trimmed inner content has a non-empty
 * name and contains no brace characters (`{`/`}`); everything else — `{{}}`,
 * `{{ }}`, an unclosed `{{`, a nested `{{a{{b}}` — folds into surrounding `text`
 * (design D-B). Adjacent literal runs are coalesced into single `text` tokens.
 */
export function tokenizeTemplate(body: string): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  // Pending literal characters not yet flushed into a `text` token.
  let text = '';
  const flush = () => {
    if (text) {
      tokens.push({ kind: 'text', text });
      text = '';
    }
  };

  let i = 0;
  const len = body.length;
  while (i < len) {
    if (body[i] === '{' && body[i + 1] === '{') {
      const close = body.indexOf('}}', i + 2);
      if (close !== -1) {
        const inner = body.slice(i + 2, close);
        // Name is the part before the first `=` (the spec); recognize the token
        // only when that name is non-empty and the inner has no brace chars (which
        // rules out nesting like `{{a{{b}}` and stray braces).
        const eq = inner.indexOf('=');
        const name = (eq === -1 ? inner : inner.slice(0, eq)).trim();
        if (name && !/[{}]/.test(inner)) {
          flush();
          tokens.push({ kind: 'var', name, raw: body.slice(i, close + 2) });
          i = close + 2;
          continue;
        }
        // Closed but malformed: consume the whole `{{…}}` span as literal text so a
        // nested inner token (`{{a{{b}}` → the `{{b}}`) is never re-scanned as a var.
        text += body.slice(i, close + 2);
        i = close + 2;
        continue;
      }
      // Unclosed `{{`: keep it as literal text and advance past it.
      text += '{{';
      i += 2;
      continue;
    }
    text += body[i];
    i += 1;
  }
  flush();
  return tokens;
}

/**
 * Parse one var token's *trimmed* inner content into a {@link PromptVar} per the
 * grammar (design D-A): split on the FIRST `=` into name / spec.
 *   - no `=`              → `{ name, type: 'text' }`
 *   - `name = value`      → `{ name, type: 'text', default: value }` (trimmed;
 *                            empty value yields no default)
 *   - `name = a | b | c`  → `{ name, type: 'select', options, default: first }`
 *                            (options are trimmed, non-empty `|`-segments)
 */
function parseVarSpec(name: string, rawInner: string): PromptVar {
  const eq = rawInner.indexOf('=');
  if (eq === -1) {
    return { name, type: 'text' };
  }
  const value = rawInner.slice(eq + 1).trim();
  if (value.includes('|')) {
    const options = value
      .split('|')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    if (options.length > 0) {
      return { name, type: 'select', options, default: options[0] };
    }
    // All segments empty (`{{x=|}}`) → no usable options; fall back to plain text.
    return { name, type: 'text' };
  }
  if (value) {
    return { name, type: 'text', default: value };
  }
  return { name, type: 'text' };
}

/**
 * Extract the ordered, deduplicated `PromptVar[]` declared by `{{…}}` tokens.
 *
 * Deduplication (design D-C, case-sensitive): the first occurrence fixes the entry
 * and its position; a later occurrence only FILLS fields the first left unset (adds
 * a `default`, upgrades `text` → `select` with options) and never overrides an
 * already-set field or reorders.
 *
 * Total: never throws for any input (design D-B).
 */
export function parseVariables(body: string): PromptVar[] {
  const order: string[] = [];
  const byName = new Map<string, PromptVar>();

  for (const token of tokenizeTemplate(body)) {
    if (token.kind !== 'var') continue;
    // Re-trim the inner content (raw is `{{…}}`); `token.name` is already trimmed.
    const inner = token.raw.slice(2, -2).trim();
    const parsed = parseVarSpec(token.name, inner);

    const existing = byName.get(token.name);
    if (!existing) {
      order.push(token.name);
      byName.set(token.name, parsed);
      continue;
    }
    // Enrich only unset fields; never override or reorder.
    if (existing.default === undefined && parsed.default !== undefined) {
      existing.default = parsed.default;
    }
    if (existing.type === 'text' && parsed.type === 'select') {
      existing.type = 'select';
      existing.options = parsed.options;
      if (existing.default === undefined) existing.default = parsed.default;
    }
  }

  return order.map((name) => byName.get(name)!);
}
