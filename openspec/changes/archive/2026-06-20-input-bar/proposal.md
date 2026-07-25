## Why

Prompts exist in the library (C12) but there is no in-context way to use one: the user must
leave the chat, find the prompt, copy it, and paste it back. –T3.4 (D14) call
for an **input action bar** docked above the host composer with a **slash-command popover** to
pick a prompt and a **variable-fill modal** to complete its `{{variables}}` before insertion.
The adapter framework (C4) already reserved every platform seam for this — `mountPoints().inputBar`,
`getInputElement`, `insertText`, `observe` — and `prompt.search` + `parseVariables` already exist,
so this is largely an assembly of built parts plus one small adapter enhancement. This change is
the last functional slice before the **end-of-M3 first public beta**.

## What Changes

- Add an **input action bar**: a content-script shadow-DOM overlay mounted at
  `adapter.mountPoints().inputBar` on supported hosts after `selfCheck` passes, torn down through
  the existing content-script `teardown()` (context-invalidation safe).
- Add a **slash-command popover** (Skeinos-owned `/` trigger button — not host-composer keystroke
  interception): it has its own search field, queries the library via
  `queryPromptLibraryRemote({ kind: 'prompt.search' })`, and lists matches as rows showing title,
  a highlighted snippet, and the `/slug` alias (slug is already searched and returned). A generic
  prompt glyph is used per row (no per-prompt icon field is added).
- Add a **variable-fill modal**: picking a prompt with `{{variables}}` opens a modal (the
  `Dialog` primitive) pre-filled with each variable's default from `parseVariables` (text/select
  inputs); a prompt with no variables skips the modal.
- **Insert via the adapter**: the completed text is committed with `adapter.insertText(text)` —
  insert-only, appended to the composer (never clobbering an existing draft), and never
  auto-submitted.
- **Re-anchor on composer churn**: extend the adapter's `observe()` to re-emit `composer-ready`
  when the composer element identity changes, so the bar re-mounts into the fresh anchor after SPA
  navigation swaps the composer subtree. **BREAKING:** none — additive to the existing event.
- **Disabled stubs** reserve layout for the deferred Profile (C14) and models (C24) controls, per
  the established "disabled stubs reserve layout for unbuilt features" convention.
- Tests for all of the above are authored by a sub agent (see tasks.md).

## Capabilities

### New Capabilities

- `input-bar`: the host-docked input action bar overlay, the slash-command prompt popover, the
  variable-fill modal, and adapter-driven insertion. Bundles (bar + slash + insert) and
  T3.4 (variable modal), per the LLD note that the variable-fill modal lives with the input bar.

### Modified Capabilities

- `platform-adapter`: `observe()` additionally re-emits `composer-ready` when the composer element
  changes identity (e.g. an SPA navigation replaces the composer subtree), so overlays anchored to
  the composer can re-attach. The existing event set and disposer contract are unchanged.

## Impact

- **Code:** new `ui/input-bar/**` (bar shell, slash popover, variable-fill modal, controller);
  `content/index.ts` (mount the bar at `mountPoints().inputBar` after self-check; dispose it in
  `teardown()`; re-mount on `composer-ready`); `adapters/runtime/adapter.ts` (`observe()`
  re-emits `composer-ready` on composer-element change) + the contract test suite. Reuses
  `ui/mount`, `ui/primitives` (`useFloating`, `Dialog`), `parseVariables`, and
  `queryPromptLibraryRemote`.
- **Data:** none — reads the library through the existing worker query; no store or schema change.
- **Privacy:** none — no host-composer keystroke interception (Option 1); the bar reads the
  composer only to insert (write), and prompt content is local. No new permission, no network.
- **Dependencies:** builds on `prompts` (C12 ✅), `platform-adapter`/`adapter-claude` (C4 ✅),
  `ui-interaction-primitives` (✅), `ui-shell` mount harness (✅). Unblocks `profiles` (C14) and
  `shortcuts` (C16), which reuse the bar and the re-anchor signal.
