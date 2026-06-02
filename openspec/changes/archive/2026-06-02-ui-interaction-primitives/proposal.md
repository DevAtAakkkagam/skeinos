## Why

The overlay's interactive widgets (the folder context menu, the create/edit
folder dialog) are hand-rolled and only partially accessible: the context menu is
positioned from raw `clientX/clientY` so it clips off-screen near a viewport edge,
neither widget has a focus trap, roving keyboard navigation, `Escape`-to-close, or
focus restoration, and every future floating widget (the M3 search command palette,
M2 tag picker, M4 prompt library, tooltips) would re-solve the same positioning and
ARIA problems by hand. Two small, framework-agnostic, shadow-DOM-aware libraries —
`@floating-ui/dom` for positioning and Zag.js for accessible interaction state
machines — give us a reusable headless layer without importing a React shim, a CSS
runtime, or an opinionated theme that would fight our `--sk-*` tokens (the rejected
alternatives are recorded in the design doc).

## What Changes

- Add two runtime dependencies to `extension/`: `@floating-ui/dom` (positioning
  engine) and the per-feature Zag.js machine packages we actually use
  (`@zag-js/menu`, `@zag-js/dialog` to start), plus the framework-agnostic core.
- Introduce a thin **`core/ui`-adjacent interaction layer** under `ui/primitives/`
  that wraps both libraries into Preact-friendly helpers: a `useFloating` hook over
  `@floating-ui/dom` (with `flip`/`shift`/`offset` and the shadow root as the
  positioning context) and a small `useMachine` bridge that drives a Zag.js machine
  from Preact hooks. These are the only modules that import the libraries directly;
  the rest of the UI consumes the wrappers.
- **Retrofit the two existing consumers** in `ui/sidebar/Sidebar.tsx`:
  - `ContextMenu` → Zag.js `menu` machine (roving focus, typeahead, `Escape`,
    outside-click dismissal, ARIA) positioned by `useFloating` so it flips/shifts to
    stay on-screen, anchored to the right-clicked folder row.
  - `FolderDialog` → Zag.js `dialog` machine (focus trap, focus restoration,
    `Escape`-to-close, scroll lock, `aria-modal`), keeping the existing markup,
    `data-testid`s, and `--sk-*` styling.
- Configure all floating/portal elements to render **inside our shadow root**, not
  `document.body`, so they stay isolated and keep our token styling (the constraint
  that disqualifies most off-the-shelf libraries — see design).
- Establish the layer as the **designated home** for the not-yet-built widgets so
  later changes (search palette, tag picker, prompts, tooltips) build on it rather
  than re-rolling positioning/ARIA. Those consumers are out of scope here.

## Capabilities

### New Capabilities

- `ui-interaction-primitives`: A headless interaction layer for the shadow-DOM
  overlay — a Floating UI-based positioning helper (flip/shift/offset, anchored,
  shadow-root-scoped) and a Zag.js machine bridge for Preact — together with the
  accessibility and isolation guarantees (focus management, keyboard operation,
  ARIA, shadow-root portaling) that every floating/dismissable widget in the UI
  must meet.

### Modified Capabilities

<!-- None. The `ui-shell` capability (mount harness, isolation, tokens, base
     components) is unchanged; this adds a new sibling layer above it. The folder
     menu/dialog retrofit is code-level impact, not a spec-requirement change to a
     currently-archived capability. -->

## Impact

- **New dependencies:** `@floating-ui/dom`, `@zag-js/menu`, `@zag-js/dialog`, and
  the Zag.js core/runtime they require — added to `extension/package.json`. All are
  data/logic-only (no remote code), so they are compatible with the `[MV3]`
  no-remote-code guardrail; bundle-size impact is bounded by importing only the
  machines in use.
- **New code:** `extension/src/ui/primitives/` (the `useFloating` and `useMachine`
  wrappers + their styles), with unit/browser tests under `extension/tests/`.
- **Modified code:** `extension/src/ui/sidebar/Sidebar.tsx` (`ContextMenu`,
  `FolderDialog`) and `extension/src/ui/sidebar/styles.ts` (the `.sk-menu` and
  `.sk-dialog*` rules adapt to the machines' positioning/state attributes; existing
  `data-testid`s preserved so current folder tests keep passing).
- **Guardrails touched:** `[PREACT]` (keyboard-operable + ARIA, shadow-DOM only) is
  strengthened; `[MV3]` (no remote code) is respected; no new host permissions and
  no change to the privacy/storage boundaries.
- **Downstream:** unblocks accessible, on-screen-safe implementations of the M3
  search palette, M2 tag picker, and M4 prompt library without per-feature
  positioning/ARIA work.
