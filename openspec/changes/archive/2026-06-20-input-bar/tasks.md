## 1. Adapter re-anchor signal

- [x] 1.1 In `adapters/runtime/adapter.ts`, extend `observe()` to track the current composer
      element (`getInputElement()`) and re-emit `composer-ready` when its identity changes (in the
      existing MutationObserver callback), in addition to the initial emit. No new event type.
- [x] 1.2 Add a contract-suite case asserting `composer-ready` re-emits when the fixture swaps the
      composer element, and that the initial-emit + disposer behavior is unchanged.

## 2. Input-bar overlay shell

- [x] 2.1 Add `ui/input-bar/InputBar.tsx`: the bar shell (the `/` trigger + disabled Profile/model
      stubs reserving layout), token-styled, i18n-ready `STR` const.
- [x] 2.2 Add `ui/input-bar/styles.ts` (tokens only) and a `mountInputBar` helper that uses the
      shared `ui/mount` harness (mirror `mountSidebar`) to mount into a light-DOM anchor and inject
      the bar's CSS into the shadow root.

## 3. Slash-command popover

- [x] 3.1 Add the popover (built on `useFloating`, shadow-scoped, anchored to the bar, opening
      upward) with its own search field; debounce input and call a content-reachable
      `queryPromptLibraryRemote({ kind: 'prompt.search', terms })` leaf client.
- [x] 3.2 Render result rows: generic prompt glyph + title + highlighted snippet + `/slug` alias;
      keyboard navigation + dismiss from the primitive; explicit empty state on no matches.

## 4. Variable-fill modal + insertion

- [x] 4.1 On select, run `parseVariables(body)`: if non-empty, open a `Dialog` modal with one input
      per variable pre-filled with its default (text/select by parsed type); confirm substitutes
      values into the body. Empty → skip the modal.
- [x] 4.2 Insert the final text via `adapter.insertText(text)` — append (no `replace`), never call
      `adapter.submit()`. Close the popover/modal after insertion.

## 5. Content-script lifecycle wiring

- [x] 5.1 In `content/index.ts`, after self-check passes, resolve `adapter.mountPoints()` and mount
      the bar at `inputBar`; hold the mount handle alongside the existing disposers.
- [x] 5.2 Subscribe through the existing `observe()` wiring: on `composer-ready`, dispose the prior
      bar mount handle and re-mount at the fresh `inputBar` anchor (idempotent; tolerate a null
      `mountPoints()` until the next signal).
- [x] 5.3 Dispose the bar (and any open popover/modal) in the existing `teardown()`; ensure
      callbacks guard on `isContextValid()` like the ingest loop.

## 6. Tests (authored by a sub agent)

- [x] 6.1 Adapter: `observe()` re-emits `composer-ready` on composer-element swap; initial emit and
      disposer unchanged (contract suite + unit).
- [x] 6.2 Bar lifecycle: mounts at `inputBar` on ready self-check; does not mount on failure;
      re-mounts (exactly one bar) on `composer-ready` after an anchor swap; disposed on context
      invalidation.
- [x] 6.3 Popover: `/` opens it; query drives `prompt.search` (stubbed client) and renders
      title/snippet/`/slug`; empty state on no matches; dismiss inserts nothing.
- [x] 6.4 Variable modal: a prompt with variables opens a pre-filled modal (text/select), confirm
      substitutes values; a prompt with none skips the modal.
- [x] 6.5 Insertion: confirmed text goes through `adapter.insertText` appended (draft preserved) and
      `adapter.submit` is never called.

## 7. Verification

- [x] 7.1 Run `npm run typecheck` and `npm test`; then `npm run test:browser` for the bar overlay
      (shadow-DOM mount, popover/modal positioning, token resolution).
