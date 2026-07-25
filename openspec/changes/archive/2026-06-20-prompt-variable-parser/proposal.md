## Why

The prompt library (C12 `prompts-library`, –T3.2) is the next free-tier promise after folders
and search, but every visible part of it — the library cards, the editor's live variable preview, and
later the fill-in-on-insert modal (D14, C13) — depends on one pure thing that does not exist yet:
turning a template body like `Summarise results with a {{metric}} and a {{tone=neutral}} note.` into a
structured, deduplicated list of variables with defaults and input types. This change is **slice 1 of
`prompts-library`**: it establishes the canonical `Prompt` data model and the `{{variable}}` parser
 as a pure, fully unit-tested core module, so the worker capability (slice 2) and the Prompts
tab UI (slice 3) build on a settled contract instead of reshaping it later.

It is deliberately scoped to pure logic — no store writes, no worker handlers, no UI — because the
parser is the most edge-case-heavy atom in the whole feature and the one every later slice consumes.

## What Changes

- Introduce `core/prompts/template`: a **pure parser** with no `store`/`messaging`/DOM dependencies.
  - `parseVariables(body) → PromptVar[]`: extracts each `{{…}}` variable as `{ name, default?, type,
    options? }`, **deduplicated** by name (first occurrence wins, but a later occurrence that adds a
    default/options enriches the first), **ordered by first appearance**.
  - `tokenizeTemplate(body) → TemplateToken[]`: an ordered run of `text` / `var` tokens over the same
    scanner, so card-preview highlighting (slice 3) and the future fill-modal (C13) share one source of
    truth and never drift from `parseVariables`.
  - A defined, forgiving grammar (see design.md): `{{name}}` → text; `{{name=default}}` → text with a
    default; `{{name=a|b|c}}` → `select` with options (default = first). Whitespace inside braces is
    trimmed; empty/unclosed/malformed tokens (`{{}}`, `{{ }}`, a lone `{{`) are left as literal text,
    not emitted as variables.
- Finalize the canonical `Prompt` / `PromptVar` model in `shared/types.ts` so the shape is settled once
  (mirroring the "sync envelope wired from day one" principle):
  - Add `slug?: string` — the slash alias (`/exp`) shown on library cards; **inert in this slice and
    until insertion lands (C13)**. Defining it now avoids a later model change.
  - **BREAKING (internal, no-data):** change `targetModel?: PlatformId` → `targetModels: PlatformId[]`
    so a prompt can declare multiple target platforms (the cross-platform portability value prop; the
    design's multi-logo cards). Safe: the `prompts` store is empty and no code reads the field today.
  - `PromptVar` keeps `{ name, default?, type: 'text'|'select', options? }` (already present, D14).

Out of scope (later slices / changes, clean seams left here): the worker `prompts.query`/`prompts.mutate`
capability and derived counts (slice 2); the Prompts tab, card list, chip filter, and editor (slice 3,
); search → prompt navigation (slice 4); slash-command **insertion** and the variable-fill modal
(C13, –T3.4); usage analytics (C25). The `slug` field is **defined but unused** here; the
`targetModels` editor control arrives with slice 3.

## Capabilities

### New Capabilities
- `prompts`: the prompt-library capability, introduced here with its first two requirements — the
  canonical `Prompt`/`PromptVar` data model (title, body, variables, tags, `slug`, `targetModels`,
  folder, dormant usage fields) and the pure `{{variable}}` template parser (extraction with
  defaults/types + deduplication, plus tokenization for rendering). Later slices add the worker
  query/mutate layer and the Prompts tab UI as further requirements on this same capability.

### Modified Capabilities
<!-- None. The `prompts` / `promptFolders` stores and their indexes already exist (workspace-store, M0
     D6); this slice changes only non-indexed value fields on the Prompt record, so no store/index
     schema requirement changes and no migration is needed. -->

## Impact

- **New module** `extension/src/core/prompts/template.ts` (parser + tokenizer) — pure functions,
  imports nothing from `store/`, `messaging/`, `adapters/`, or `ui/` (dependencies inward).
- **Modified** `extension/src/shared/types.ts`: add `Prompt.slug?`, change `targetModel?` →
  `targetModels: PlatformId[]`, and (if not already exported) the `TemplateToken` type for the
  tokenizer. No change to `core/store/schema.ts` — the `prompts`/`promptFolders` stores and their
  `promptFolderId` / `tags*` / `lastUsedAt` / `parentId` indexes are untouched; only non-indexed value
  fields change, so **no DB version bump and no migration**.
- **No new permissions, no network, no privacy-boundary movement** — pure in-memory text processing.
  `Prompt` records remain syncable metadata (`synced: true`) exactly as before; nothing here syncs or
  persists.
- **Tested** with Vitest only (no browser, no fake-indexeddb needed): the parser's full edge-case
  surface — defaults, `select` options, duplicates/coalescing, ordering by first appearance, whitespace
  trimming, and malformed/unclosed/empty tokens treated as literal text — plus `tokenizeTemplate`
  agreeing with `parseVariables` on which spans are variables.
- **Downstream**: unblocks slice 2 (`core/prompts` worker capability) and slice 3 (Prompts tab UI),
  both of which consume `parseVariables` (variable count / metadata) and `tokenizeTemplate` (card +
  editor highlighting). The `slug` and `targetModels` fields are consumed by slice 3's editor and by
  C13 insertion.
