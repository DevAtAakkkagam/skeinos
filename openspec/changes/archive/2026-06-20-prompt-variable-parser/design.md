## Context

The prompt library renders a template body in three places that must all agree on "what is a variable":
the library card preview (highlighted `{{…}}` chips), the editor's live variable list, and — later, in
C13 — the fill-in-on-insert modal pre-filled with each variable's default (D14). Today none of this
parsing exists. This slice builds the single pure module they all consume, and settles the `Prompt`
record shape so later slices don't reshape a synced type.

Constraints carried in from the project:
- **Inward dependencies:** a `core/` module imports nothing from `store/`, `messaging/`,
  `adapters/`, or `ui/`. The parser is pure text-in / data-out.
- **Privacy (PRIV-1):** this is in-memory only; it neither persists nor syncs. `Prompt` stays syncable
  metadata as already defined; no field here changes that classification.
- **Total function:** a prompt body is live user input (the editor re-parses on every keystroke), so the
  parser must never throw on half-typed or malformed input.

## Goals / Non-Goals

**Goals:**
- A defined, minimal `{{variable}}` grammar that encodes the three things T3.1 requires — **name,
  default, type** — directly in the body, with no separate metadata sidecar.
- `parseVariables(body) → PromptVar[]`: deduplicated, ordered by first appearance, total (never throws).
- `tokenizeTemplate(body) → TemplateToken[]`: the same scan exposed as ordered text/var runs for
  rendering, guaranteed consistent with `parseVariables`.
- Finalize `Prompt` / `PromptVar` in `shared/types.ts` (add `slug?`, `targetModels: PlatformId[]`).

**Non-Goals:**
- Worker `prompts.query`/`mutate`, persistence, counts (slice 2).
- Any UI — card, editor, highlighting render (slice 3); the modal + insertion (C13).
- Escaping / literal-brace support (see Open Questions); usage analytics (C25).

## Decisions

### D-A — Grammar: `{{ name }}` · `{{ name = default }}` · `{{ name = a | b | c }}`
A variable token is `{{` … `}}`. The inner content is trimmed, then split on the **first** `=` into a
`name` part and an optional `spec` part:
- No `=` → `{ name, type: 'text' }` (no default).
- `name = value`, no `|` in value → `{ name, type: 'text', default: value }` (trimmed; an empty value
  yields no default).
- `name = a | b | c` → `{ name, type: 'select', options: ['a','b','c'], default: 'a' }` — options are the
  non-empty, trimmed `|`-segments; the **first option is the default**.

Rationale: this is the smallest readable encoding of (name, default, type) that lives inline in the body
the user is already editing — no parallel schema to keep in sync, and it round-trips (the body is stored
verbatim). *Alternatives:* a structured `variables[]` authored separately in the editor (rejected:
duplicates state, drifts from the body, worse paste-in-a-prompt UX); a richer DSL with explicit
`type:` / `default:` keys (rejected: heavier syntax for no slice-1 benefit — can be added additively
later since it's a new token form, not a reinterpretation of today's forms).

### D-B — Malformed tokens are inert literal text; the parser never throws
A `{{…}}` is a variable **only if** its trimmed inner content has a non-empty `name` and contains no
brace characters (`{`/`}`). Otherwise — `{{}}`, `{{ }}`, `{{=x}}`, an unclosed `{{`, or a nested
`{{a{{b}}` — the span is left as ordinary text and emits no `PromptVar`.

Rationale: the editor re-parses on every keystroke, so `{{`, `{{me`, `{{metric=` are *normal transient
states*; throwing or surfacing errors mid-type would be hostile. *Alternative:* surface parse errors
(rejected for slice 1 — totality is simpler and matches a live-preview editor).

### D-C — Deduplication: first wins, later mentions enrich; order by first appearance
Repeated names collapse to one `PromptVar`. The first occurrence fixes the entry and its position; a
later occurrence only **fills fields the first left unset** (adds a `default`, or upgrades `text` →
`select` with options) and never overrides an already-set field or reorders.

Rationale: the fill-modal lists each variable once, in reading order; `{{topic}} … {{topic=AI}}` should
show one `topic` defaulting to `AI`, while `{{topic=AI}} … {{topic=ML}}` keeps the first author's
default. Names are compared **case-sensitively** (`{{Topic}}` ≠ `{{topic}}`) — predictable and matches
common template engines.

### D-D — One scanner backs both `parseVariables` and `tokenizeTemplate`
A single low-level scan produces the ordered `TemplateToken[]`
(`{ kind: 'text', text } | { kind: 'var', name, raw }`, `raw` being the original `{{…}}` for faithful
rendering). `parseVariables` is then a fold over that token stream (collect `var` tokens → apply D-A/D-C).

Rationale: the card highlight (UI) and the variable list (model) can never disagree about which spans are
variables, because they derive from the same pass.

### D-E — Settle the persisted shape now: `targetModels: PlatformId[]`, `slug?` defined-but-unused
`targetModel?: PlatformId` becomes `targetModels: PlatformId[]` (multi-platform targeting), and `slug?:
string` (the `/exp` alias) is added. Both ship in this slice even though the editor (slice 3) and
insertion (C13) are what populate them.

Rationale: `Prompt` is a synced record; settling its shape once — like the day-one sync envelope — avoids
a later migration on a syncable store. Both fields are **non-indexed values**, so adding/reshaping them
needs no `schema.ts` change and no DB version bump. The rename is safe today: the `prompts` store is
empty and a repo-wide search finds no reader of `targetModel`.

## Risks / Trade-offs

- **Grammar lock-in — stored bodies encode today's syntax.** → The body is persisted *verbatim* and
  parsing is always derived, so future grammar work must remain **additive** (new token forms) and keep
  today's three forms meaning what they mean now. Documented as the compatibility rule for later slices.
- **Literal `=` / `|` inside an intended value is reinterpreted** (e.g. a default containing a pipe
  becomes select options). → Accepted limitation for v1; the escape mechanism is an Open Question. `|`
  *always* means select; `=` splits on the first occurrence only (so a default may itself contain `=`).
- **Case-sensitive dedup may surprise a user typing `{{Topic}}` and `{{topic}}`.** → Low impact;
  documented behavior, revisitable cheaply (pure function, no stored state).

## Migration Plan

No data or schema migration. `prompts`/`promptFolders` stores and indexes are untouched (only non-indexed
value fields change), so there is no DB version bump. The `targetModel → targetModels` change is a
compile-time type change with no readers in the repo; rollback is reverting the diff.

## Open Questions

- **Escaping literal braces** — should `\{{not a var}}` (or `{{{{`) render literal `{{ }}`? Deferred; no
  current need, and adding an escape later is additive.
- **Independent `select` default** — v1 fixes the default to the first option. Do we later want
  `{{name=a|*b|c}}`-style explicit-default marking? Revisit when the editor's select control is designed
  (slice 3).
