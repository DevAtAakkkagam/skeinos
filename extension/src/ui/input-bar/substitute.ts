// Substitute filled values back into a prompt body for insertion (design D-5).
//
// Reuses the same `tokenizeTemplate` scan that drives `parseVariables`, so the
// spans replaced here are exactly the spans the fill modal surfaced — the two can
// never disagree about which `{{…}}` runs are variables. A `var` token is replaced
// by its entered value; an unfilled variable falls back to the empty string (the
// modal pre-fills defaults, so this only bites when a value is explicitly cleared).
// Literal text — including malformed `{{…}}` that tokenized as text — is preserved
// verbatim. Pure and total: never throws for any input (mirrors `template.ts`).

import { tokenizeTemplate } from '../../core/prompts/template';

export function substituteVariables(body: string, values: Record<string, string>): string {
  return tokenizeTemplate(body)
    .map((token) => (token.kind === 'var' ? (values[token.name] ?? '') : token.text))
    .join('');
}
