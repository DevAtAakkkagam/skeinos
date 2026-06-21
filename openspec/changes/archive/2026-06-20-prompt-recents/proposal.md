## Why

When the user opens the input-bar prompt popover, its empty (pre-search) state shows only the hint
"Type to search your prompts." — wasted space and a cold start. A short **"Last used"** list of the
prompts the user reaches for most would make the popover useful the instant it opens, with one
keystroke or click.

The data model already reserves the fields for this — `Prompt.lastUsedAt` and `Prompt.usageCount`,
plus a `lastUsedAt` store index — but **nothing writes them**: usage tracking was deferred to C25
(`usage`). Showing a truthful "Last used" list therefore requires bringing forward the *minimal*
usage-write slice: record a use when a prompt is inserted. This change does exactly that slice and
the popover surface on top of it, leaving C25 to build the richer usage features (popularity sort,
analytics) on the same fields. It also folds in a small padding polish on the bar itself.

## What Changes

- **Record prompt usage on insertion** (the minimal slice of C25): add a `prompt.recordUse`
  mutation op; the worker sets `lastUsedAt` to now and increments `usageCount`, then persists. Fired
  fire-and-forget at the real insertion moments (no-variable insert and variable-modal confirm) — a
  cancelled variable modal does **not** count as a use.
- **Add a recents read**: a `prompt.recents` selector returning up to `limit` prompts that have a
  `lastUsedAt`, most-recent first, shaped as `PromptSearchResult[]` so the popover renders them with
  the existing row.
- **Show "Last used" in the popover's empty state**: when the search field is empty, list up to 5
  recent prompts under a "Last used" heading and feed them into the existing results/keyboard-nav/
  select machinery (recents are the default result set). With no recorded uses yet, the existing
  "Type to search…" hint is kept. Typing switches to live search.
- **Padding polish**: increase the input bar's padding on all sides for more breathing room.
- **BREAKING:** none — additive selector, additive mutation op, additive UI state.

## Capabilities

### Modified Capabilities

- `prompts`: a `prompt.recordUse` mutation op stamps `lastUsedAt`/`usageCount` on insertion (the
  minimal usage-write slice formerly deferred to C25), and a `prompt.recents` read returns the most
  recently used prompts.
- `input-bar`: the slash popover's empty state lists the last-used prompts (selectable via the
  existing flow) instead of only a hint, and the bar gains additional padding.

## Impact

- **Code:** `shared/prompts.ts` (`prompt.recents` selector + snapshot; `prompt.recordUse` op);
  `core/prompts/handlers.ts` (recents query sorted by `lastUsedAt`; `recordUse` write);
  `ui/input-bar/InputBar.tsx` (fire `mutatePromptLibraryRemote({ op: 'prompt.recordUse' })` on
  insert); `ui/input-bar/SlashPopover.tsx` (recents in the empty state, "Last used" header, nav
  reuse); `ui/input-bar/strings.ts` ("Last used" label); `ui/input-bar/styles.ts` (bar padding).
- **Data:** no schema change — `lastUsedAt`/`usageCount` and the `lastUsedAt` index already exist;
  this change is the first writer of those fields.
- **Privacy / sync:** usage fields live on the syncable `Prompt` metadata, so recording a use bumps
  the sync envelope and "last used" follows the user across devices as ciphertext on paid tiers.
  This is within the boundary — only `ConversationIndex`, `searchPostings`, and `Comparison` are
  device-only. No new permission, no network beyond existing metadata sync.
- **Dependencies:** builds on `input-bar` (C13 ✅) and `prompts` (C12 ✅). Brings forward the
  usage-write portion of **C25 `usage`**; C25 should build its richer usage surface on these same
  fields rather than re-introducing the write.
