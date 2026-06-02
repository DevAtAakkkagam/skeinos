## 1. Dependencies

- [x] 1.1 Add `@floating-ui/dom` to `extension/package.json` dependencies and install
- [x] 1.2 Add `@zag-js/menu` and `@zag-js/dialog` (plus the matching Zag.js core/runtime) to dependencies and install
- [x] 1.3 Record the production bundle-size delta from the new dependencies in the change notes
- [x] 1.4 Confirm both libraries are logic/data-only (no remote code) — note this against the `[MV3]` guardrail

## 2. Positioning helper (`useFloating`)

- [x] 2.1 Create `extension/src/ui/primitives/useFloating.ts` wrapping `@floating-ui/dom` with `offset`, `flip`, and `shift` middleware
- [x] 2.2 Resolve the positioning context/boundary from the overlay's shadow root (not the host document) and wire `autoUpdate`
- [x] 2.3 Expose computed `x/y`/placement as a Preact hook and clean up the `autoUpdate` subscription on unmount

## 3. Machine bridge (`useMachine`)

- [x] 3.1 Create `extension/src/ui/primitives/machine.ts` that initializes a Zag.js machine, subscribes to its state, and re-renders on transitions
- [x] 3.2 Pass the shadow root via the machine's `getRootNode`/portal-container option so document-level listeners and portaling resolve inside the shadow root
- [x] 3.3 Normalize prop-getters for Preact (`class` vs `className`, event casing, refs) and remove all listeners on unmount

## 4. Headless widgets

- [x] 4.1 Build a `Menu` component on `useMachine(@zag-js/menu)` (+ `useFloating` exposed for non-machine widgets), rendering inside the shadow root with `--sk-*` styling
- [x] 4.2 Build a `Dialog` component on `useMachine(@zag-js/dialog)` with focus trap, `aria-modal`, `Escape`/backdrop close, and focus restoration
- [x] 4.3 Add `extension/src/ui/primitives/styles.ts` (or extend the sidebar styles) for the widgets, reading only `--sk-*` tokens

## 5. Retrofit existing consumers

- [x] 5.1 Replace `ContextMenu` in `ui/sidebar/Sidebar.tsx` with the `useMenu` widget, anchored to the right-clicked folder row; drop the raw `clientX/clientY` positioning
- [x] 5.2 Map the seven menu actions onto menu items, preserving `data-testid`s (`sk-context-menu`, `sk-menu-rename`/`-pin`/`-archive`/`-move-top`/`-delete`) and the string table
- [x] 5.3 Replace `FolderDialog` with the `Dialog` widget, preserving `sk-folder-dialog`, `sk-folder-name`/`-icon`/`-color`/`-submit` and form behavior
- [x] 5.4 Remove the dead `.sk-menu`/`.sk-dialog*` inline-position rules from `ui/sidebar/styles.ts`; primitives CSS now owns the surfaces

## 6. Tests

- [x] 6.1 Browser-test `useFloating` (real layout): offset applied, flip near a viewport edge, shift to stay on-screen
- [x] 6.2 Browser-test (`@vitest/browser`) the `Menu`: keyboard navigation, `Escape` + focus restoration, outside-click close, nodes inside the shadow root
- [x] 6.3 Browser-test the `Dialog`: focus trap, `Escape` close + focus restoration, `role="dialog"`/`aria-modal`, nodes inside the shadow root
- [x] 6.4 Confirm the existing folder unit/browser tests still pass against the retrofitted widgets

## 7. Wrap-up

- [x] 7.1 Verify no module outside `ui/primitives/` imports `@floating-ui/*` or `@zag-js/*` directly
- [x] 7.2 Run the full lint/type/test suite and the production build; confirm the manifest/permissions are unchanged
- [x] 7.3 Note the layer as the designated home for the future search palette / tag picker / prompts / tooltip widgets
