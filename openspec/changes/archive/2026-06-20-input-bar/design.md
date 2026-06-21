## Context

The prompt library (C12) ships, but prompts can't be used in-context. The design screen
(`docs/design/Screens Export/05 Input action bar/01 Slash open`) shows a bar docked above the host
composer with a `/` trigger, a Profile chip, a models selector, and a save icon; opening `/`
reveals a prompt popover (own search, rows of title · snippet · `/slug`), and picking a prompt with
variables fills them before insertion.

The adapter framework reserved the seams for exactly this:
- `mountPoints(): { sidebar, inputBar }` — the `inputBar` anchor resolves from the required
  `inputBarAnchor` selector (in `REQUIRED_ANCHORS`), so every shipped config provides it.
- `getInputElement()`, `insertText(text, {replace})`, `submit()` — composer read/write.
- `observe(onChange)` — emits `conversation-changed` / `list-changed` / `composer-ready`.

Already-built reuse: `ui/mount` (shadow-DOM harness, pattern in `mountSidebar`); `ui/primitives`
`useFloating` (shadow-scoped positioning) and `Dialog` (modal) — whose stated purpose names the
"prompt library" as an intended consumer; `parseVariables` (defaults/types); and
`queryPromptLibraryRemote({ kind: 'prompt.search' })`, whose `searchPrompts` already matches AND
across terms over title/body/description/tags/**slug** and returns `{ title, snippet, slug,
targetModels }`.

The content script today mounts **no** UI (the sidebar moved to the side panel) but runs a mature
lifecycle: `waitForSelfCheck` → `reportHealth`/`mountBanner` on failure → an `observe()`-driven
ingest loop → a `teardown()` that disposes observers/timers and is invoked whenever
`isContextValid()` goes false. The bar plugs into this lifecycle.

## Goals / Non-Goals

**Goals:**
- A host-docked input action bar with a Skeinos-owned `/` trigger.
- A slash popover that searches the library and inserts the chosen prompt via the adapter, filling
  `{{variables}}` through a modal first.
- Robust mount/teardown/re-anchor across SPA navigation, reusing the content-script lifecycle.

**Non-Goals (deferred):**
- Profile control (C14) and models selector (C24) — rendered as disabled stubs only.
- Save-composer-as-prompt (the `⊕` icon).
- Keyboard-shortcut trigger (C16) and host-composer `/`-typing (the rejected Option 2).
- Auto-submit after insertion; multi-model fan-out.
- Any worker-contract, store, or manifest change.

## Decisions

### D-1: Trigger is a Skeinos-owned `/` button, not host-keystroke interception (Option 1)
`observe()` does not emit keystrokes, and intercepting the host composer would mean keydown/caret/
replace handling across contenteditable and textarea. Instead the bar owns a `/` button that opens
a popover with its own search field (as the screen shows). Simpler, privacy-clean (no reading of
the user's typing), and faithful to the screen. The literal "type `/` in the composer" path is
deferred (it can later reuse the same popover).

### D-2: The bar is a content-script overlay mounted at `mountPoints().inputBar`
After `selfCheck` passes (the existing "adapter ready" branch in `content/index.ts`), resolve
`mountPoints()` and `mount()` the bar into the `inputBar` anchor (shadow-DOM harness → host-CSS
isolation, `--sk-*` tokens). On `selfCheck` failure the bar does not mount (the breakage banner
shows instead) — consistent with the overlay-isolation guardrail.

### D-3: Re-anchor by extending `observe()` to re-emit `composer-ready` on composer swap
SPA hosts replace the composer subtree on navigation, orphaning a bar mounted into the old anchor;
`composer-ready` currently fires only once. Extend `observe()` to track the composer element and
re-emit `composer-ready` when its identity changes. The bar's consumer disposes the previous mount
handle and re-`mount()`s into the fresh anchor (idempotent). Chosen over a bar-owned
MutationObserver (which would duplicate DOM observation the adapter centralizes — against the
[ADAPT] guardrail) and over piggybacking `conversation-changed` (fragile: composer can swap without
a conversation change). The signal is reused later by C14/C16.

### D-4: Slash popover reuses `prompt.search`; rows show title · snippet · `/slug`
The popover's search field calls `queryPromptLibraryRemote({ kind: 'prompt.search', terms })` (a
content-reachable leaf client, like the existing conversation-index/folders clients). Rows render
the returned `title`, highlighted `snippet`, and `/slug` alias, with a single generic prompt glyph
(no per-prompt icon field is added — D-7). Positioning uses `useFloating` anchored to the bar,
opening upward over the composer; keyboard nav and dismiss come from the primitive.

### D-5: Variable-fill modal pre-filled from `parseVariables`; insert-only via adapter
On pick: if the prompt has variables (`parseVariables(body)` non-empty), open a `Dialog` modal with
one input per variable pre-filled with its default (text or select per the parsed type, D14);
"Insert" composes the filled body. A prompt with no variables skips straight to insertion. The
final text is committed with `adapter.insertText(text)` — **insert-only, appended** (no `replace`,
so an existing draft is preserved) and **never `submit()`-ed**; the user reviews and sends.

### D-6: Bar lifecycle is owned by the content script's existing teardown
The mount handle is held alongside the existing content-script disposers; `teardown()` disposes the
bar (and any open popover/modal) when the context is invalidated or self-check later fails. Each
host-driven callback already guards on `isContextValid()` — the bar follows the same rule.

### D-7: Deferred controls are disabled stubs; no per-prompt icon field
The Profile (C14) and models (C24) controls render as disabled placeholders that reserve layout
(matching the existing "disabled stubs reserve layout for unbuilt features" convention) so the bar
matches the screen and won't reflow when those changes land. The mock's per-prompt row emojis are
treated as illustrative: a generic glyph is used, keeping this change out of the `prompts`
capability and the store.

### D-8: Tests authored by a sub agent
Per repo convention, a sub agent authors the suite against the contracts pinned in tasks.md: the
`observe()` re-emit (a new contract-suite case), bar mount/teardown/re-anchor, slash popover search
+ selection, variable-modal pre-fill + filled insertion, and insert-only/append/no-submit behavior.

## Risks / Trade-offs

- **[Risk] Composer swap without an identity change (in-place re-render)** → tracking element
  identity catches replacement; an in-place mutation keeps the same node and the existing mount
  stays valid, so no action is needed. Acceptable.
- **[Risk] `inputBar` anchor present at self-check but transiently absent mid-session** →
  `mountPoints()` returns null when the anchor is missing; the bar consumer no-ops until the next
  `composer-ready`, mirroring the ingest loop's tolerance of an unhydrated DOM.
- **[Risk] Popover/modal escaping shadow isolation onto the host page** → both use the shadow-root-
  scoped primitives (`useFloating`/`Dialog` render inside the overlay's shadow root), so host CSS
  cannot leak in and `--sk-*` tokens apply.
- **[Trade-off] Generic row glyph diverges from the mock's per-prompt emojis** → accepted to keep
  the change out of the prompts model/store; a `Prompt.icon` field can be added later if desired.
- **[Trade-off] No host-composer `/`-typing yet** → the button trigger covers the core flow; the
  popover is structured so the typed-`/` path can reuse it without rework.
