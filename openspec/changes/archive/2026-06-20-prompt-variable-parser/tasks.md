## 1. Finalize the Prompt data model

- [x] 1.1 In `extension/src/shared/types.ts`, add `slug?: string` to `Prompt` and change
  `targetModel?: PlatformId` → `targetModels: PlatformId[]` (keep `PromptVar` as `{ name, default?, type:
  'text' | 'select', options? }`).
- [x] 1.2 Export a `TemplateToken` type — `{ kind: 'text'; text: string } | { kind: 'var'; name: string;
  raw: string }` — for the tokenizer's return shape.
- [x] 1.3 Run `npm run typecheck`; confirm there are no readers of the old `targetModel` field to update
  (the `prompts` store is empty, so this is a type-only change with no schema/migration impact).

## 2. Implement the pure template parser

- [x] 2.1 Create `extension/src/core/prompts/template.ts` importing only the shared types (no `store`,
  `messaging`, `adapters`, or `ui` imports — dependencies inward).
- [x] 2.2 Implement the low-level scanner producing the ordered `TemplateToken[]`: recognize a `{{…}}`
  as a `var` only when its trimmed inner content has a non-empty name and no brace chars; everything
  else (incl. `{{}}`, `{{ }}`, unclosed `{{`, nested `{{a{{b}}`) folds into `text` tokens.
- [x] 2.3 Implement `tokenizeTemplate(body): TemplateToken[]` over the scanner, with each `var` token
  carrying `name` and the original `raw` token text.
- [x] 2.4 Implement `parseVariables(body): PromptVar[]` as a fold over the token stream: parse each var's
  inner content per the grammar (split on first `=`; `|` in the value → `select` with trimmed non-empty
  options and first-option default; else `text` with optional trimmed default).
- [x] 2.5 Apply deduplication (case-sensitive): first occurrence fixes the entry and order; later
  occurrences only fill unset fields (add a `default`, upgrade `text` → `select`) and never override or
  reorder.
- [x] 2.6 Guarantee totality — neither function throws for any input string (cover with a fuzz-ish
  "never throws" assertion in tests).

## 3. Tests (Vitest)

- [x] 3.1 `parseVariables`: plain var, var with default (trimmed), `select` with options + first-option
  default + dropped empty segments.
- [x] 3.2 `parseVariables`: duplicate coalescing with order-by-first-appearance, and first-non-empty-field
  -wins on conflicting defaults.
- [x] 3.3 `parseVariables`: malformed/empty/unclosed/nested tokens yield no variable; whitespace inside
  braces is trimmed.
- [x] 3.4 `tokenizeTemplate`: interleaved text/var ordering, malformed token stays in a `text` token, and
  `raw` round-trips the original token text.
- [x] 3.5 Cross-check: the set of distinct `var`-token names from `tokenizeTemplate` equals the set of
  `name`s from `parseVariables` for a shared corpus of bodies.

## 4. Verify

- [x] 4.1 Run `npm run typecheck`, `npm run lint`, and `npm test` (the new file is happy-dom-free pure
  logic); all green.
