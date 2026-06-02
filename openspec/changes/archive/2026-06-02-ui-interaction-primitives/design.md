## Context

The overlay UI is Preact mounted in an **open shadow root** by `ui/mount.ts`, with a
`:host { all: initial }` boundary reset and `--sk-*` design tokens (`ui/theme/tokens.ts`).
All CSS is injected as a single `<style>` into the shadow root; there is no CSS-in-JS
runtime and there are zero UI dependencies today. Base primitives (`Panel`, `Button`,
`Text`) and the sidebar are hand-rolled.

Two interactive widgets already exist and expose the gap this change closes
(`ui/sidebar/Sidebar.tsx`):

- **`ContextMenu`** — rendered at `position: fixed` from raw `clientX/clientY`
  (`Sidebar.tsx:131`, `styles.ts:24`). It clips off-screen near a viewport edge, has
  no roving keyboard focus, no `Escape`/outside-click dismissal beyond the parent's
  `onClick={closeMenu}`, and no focus restoration.
- **`FolderDialog`** — a `role="dialog"` with a backdrop (`Sidebar.tsx:288`,
  `styles.ts:27`). It has no focus trap, no `Escape`-to-close, no focus restoration,
  no `aria-modal`, and no scroll lock.

Several not-yet-built widgets will need the same machinery: the M3 search command
palette (combobox), the M2 tag picker, the M4 prompt library, and tooltips for the
many `title=`-only affordances in the shell. The `[PREACT]` guardrail requires every
widget to be keyboard-operable, ARIA-labelled, and shadow-DOM-scoped — re-deriving
that per widget is error-prone.

Hard constraints that shape every decision here:

1. **Preact, not React** — `mount.ts` imports from `preact`. A React-only library
   would require `preact/compat` aliasing (bundle + compat risk).
2. **Shadow DOM** — any portaled element that defaults to `document.body` escapes the
   shadow root: host CSS hits it and `--sk-*` tokens do not reach it.
3. **Single injected `<style>`, no CSS runtime** — a styled/themed library that
   injects into `document.head` fights both the shadow boundary and MV3 CSP.
4. **`[MV3]` no remote code** — only data/logic dependencies are acceptable.
5. **Existing token system + bundled "Lattice" fonts** — an opinionated theme is
   unwanted; we want headless behavior only.

## Goals / Non-Goals

**Goals:**

- Add a small, headless interaction layer that solves positioning and accessibility
  once, behind Preact-friendly wrappers, scoped to the shadow root.
- Retrofit the two existing consumers (`ContextMenu`, `FolderDialog`) onto it without
  changing their markup contract — existing `data-testid`s and `--sk-*` styling stay,
  so the current folder tests keep passing.
- Keep the libraries quarantined to `ui/primitives/`; the rest of the UI imports the
  wrappers, never `@floating-ui/*` or `@zag-js/*` directly.
- Leave a clear, documented home for the future widgets (search palette, tag picker,
  prompts, tooltips) so they build on this layer.

**Non-Goals:**

- Building the future widgets themselves (search/tags/prompts/tooltips) — out of scope;
  this change only establishes the layer and migrates the two existing consumers.
- Replacing the visual base components (`Panel`/`Button`/`Text`) or the token system.
- Adopting a full component library or any styled/themed/React-coupled UI kit.
- Changing any storage, messaging, permission, or privacy boundary.

## Decisions

### D-IP1: Headless primitives over a component library

Adopt **`@floating-ui/dom`** (positioning) + **Zag.js** (accessible interaction state
machines) as a headless layer, rather than a batteries-included component library.

- **Why:** Both are framework-agnostic (no React dependency), ship logic/data only
  (no remote code, MV3-safe), let us point the portal/positioning context at our
  shadow root, and impose no theme — we keep `--sk-*` and our markup. We import only
  the machines we use, bounding bundle growth.
- **Alternatives considered:**
  - *MUI / Chakra / Mantine / Ant* — styled, React-coupled, emotion-into-`document.head`,
    opinionated themes. Three simultaneous fights (compat, shadow-DOM style injection,
    token conflict) for components we are already replacing. Rejected.
  - *Radix / Headless UI / React Aria Components* — headless and accessible (the right
    tier) but React → `preact/compat`, and portals default to `document.body`. Viable
    only with a compat shim plus per-widget portal-container overrides. Rejected on
    Preact; **Ark UI** (the React binding of Zag) is the same trade-off.
  - *Hand-roll everything* — status quo; re-derives focus traps, roving tabindex,
    typeahead, and edge-aware positioning per widget. Rejected as error-prone and the
    reason this change exists.

### D-IP2: Per-machine Zag.js packages, not the umbrella

Depend on the specific machine packages actually used (`@zag-js/menu`, `@zag-js/dialog`)
plus the framework-agnostic core they require — not a meta-package.

- **Why:** Keeps the bundle (and the MV3 review surface) proportional to what we ship.
  New widgets add their own machine package in their own change.
- **Trade-off:** A short list of dependencies to maintain instead of one. Acceptable
  and explicit.

### D-IP3: Thin Preact wrappers as the only import surface

Add `ui/primitives/useFloating.ts` (wraps `@floating-ui/dom` with `offset/flip/shift`,
auto-update, and the shadow root as positioning context) and `ui/primitives/useMachine.ts`
(bridges a Zag.js machine to Preact hooks via `useState`/`useEffect` over the machine's
subscribe API, normalizing prop-getters for Preact's `class`/event casing). Build
`Menu` and `Dialog` components on these.

- **Why:** Centralizes the shadow-root wiring and the Preact↔Zag impedance match in one
  place (mirrors how `mount.ts` is "the one place CSS isolation is solved"). Consumers
  stay declarative; swapping a library later touches only `ui/primitives/`.
- **Alternative:** Use the libraries inline in `Sidebar.tsx`. Rejected — leaks the
  dependency across the UI and duplicates the shadow-root/Preact glue.

### D-IP4: Portal into the shadow root, never `document.body`

Configure every floating/overlay element to mount within the overlay's shadow root.
For Floating UI, position against the anchor using the shadow root as the boundary/
context; for Zag.js, pass `getRootNode`/portal-container options pointing at the shadow
root. Floating elements render as siblings inside the mounted app subtree, not via a
body portal.

- **Why:** Constraint #2 — body-portaled nodes lose `--sk-*` and get hit by host CSS.
  This is the single most important wiring detail and the spec encodes it as a
  first-class requirement.
- **Note:** `z-index` stacking stays within the shadow root; the existing
  `z-index: 2147483647` on `.sk-menu` already assumes in-overlay stacking, so this is
  consistent with current behavior.

### D-IP5: Preserve the markup/test contract on retrofit

The retrofitted `ContextMenu` and `FolderDialog` keep their `data-testid`s
(`sk-context-menu`, `sk-menu-*`, `sk-folder-dialog`, `sk-folder-*`), roles, string
table, and `--sk-*` class names. The machines drive open/close, focus, and keyboard
behavior; `styles.ts` rules adapt to the machines' state/position attributes
(e.g. consuming computed `top/left` from `useFloating` instead of inline `clientX/Y`,
reacting to `data-state="open"`).

- **Why:** Keeps the existing folder unit/browser tests green and limits blast radius
  to behavior we are intentionally improving (a11y + positioning).

## Risks / Trade-offs

- **[Zag.js attaches document-level listeners (outside-click, focus) that must reach
  into the shadow root]** → Verify dismissal/focus behavior with the open shadow root
  in a browser test (`@vitest/browser` is already a dev dependency); the `useMachine`
  bridge must pass the shadow root via `getRootNode` and must remove listeners on
  unmount (covered by a spec scenario).
- **[Bundle growth on a reviewed MV3 extension]** → Mitigated by D-IP2 (per-machine
  packages) and by importing only `@floating-ui/dom` (not the React bindings).
  **Measured delta:** the tree-shaken `ui/primitives` layer (zag `menu`+`dialog`+core
  +deps, `@floating-ui/dom`, and the wrappers, with `preact` external) bundles to
  ~112 kB raw / ~36 kB gzipped. All logic/data — no remote code — so it is `[MV3]`-clean.
- **[Floating UI positioning context inside a shadow root / scaled or scrolled host]**
  → Use `autoUpdate` and the shadow root as the boundary; cover the flip/shift behavior
  near a viewport edge with tests so regressions are caught.
- **[Preact↔Zag prop-getter mismatch (`className` vs `class`, ref handling, event
  casing)]** → Normalize in `useMachine` once; unit-test that prop-getters apply to a
  Preact element. If friction is high, the fallback is to consume the machine's
  primitive state and wire props manually in the wrapper.
- **[Two widgets retrofitted at once could regress folder tests]** → D-IP5 preserves
  the test contract; land menu and dialog as separate steps in `tasks.md` so each is
  independently verifiable.

## Migration Plan

1. Add the dependencies to `extension/package.json`; record the bundle delta.
2. Land `ui/primitives/` (`useFloating`, `useMachine`, `Menu`, `Dialog`) with tests
   first — no consumer changes yet.
3. Retrofit `ContextMenu`, then `FolderDialog`, one at a time; keep the existing
   `data-testid`/markup contract and run the folder test suite after each.
4. Update `ui/sidebar/styles.ts` to the machines' positioning/state attributes.

**Rollback:** The change is additive plus two localized retrofits. Reverting the two
`Sidebar.tsx` consumers (and the dependency additions) restores the hand-rolled
widgets; no data, storage, or message-protocol migration is involved.

## Open Questions

- Confirm the exact Zag.js core/runtime package name and version pairing for the
  installed `@zag-js/menu`/`@zag-js/dialog` at apply time (peer-dependency alignment).
- Decide whether to also retrofit native `title=` tooltips in the shell onto a Zag.js
  `tooltip` machine now, or defer with the other future widgets (leaning **defer**, to
  keep this change to the two stateful widgets).
