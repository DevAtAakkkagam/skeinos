## 1. Scrim primitive

- [x] 1.1 Add a `PopoverScrim` primitive in `extension/src/ui/primitives/` that renders a transparent full-surface scrim div, takes an `onDismiss` callback fired on pointer interaction, and accepts a stacking variant (so callers can place it below the menu positioner vs. the tag popover).
- [x] 1.2 Add the scrim CSS to the primitives styles (`extension/src/ui/primitives/styles.ts`): `position: fixed; inset: 0; background: transparent;` with per-variant `z-index` — one below the menu positioner (`2147483646`) and a low-regime variant for the tag popover (`29`).
- [x] 1.3 Export `PopoverScrim` from `extension/src/ui/primitives/index.ts`.

## 2. Menu widget adoption

- [x] 2.1 In `Menu.tsx`, render `PopoverScrim` (menu stacking variant) whenever the menu is open, beneath the positioner; wire `onDismiss` to close the menu. Keep Zag's existing `interact-outside` and focus restoration intact.
- [x] 2.2 In `ConversationList.tsx`, confirm the per-row context menu (which wires the Zag machine by hand) renders the scrim while open, so an outside press dismisses without opening the row behind / toggling a folder.

## 3. Tag picker adoption

- [x] 3.1 In `TagPicker.tsx`, render `PopoverScrim` (tag stacking variant) while the popover is open; wire `onDismiss` to `onClose`.
- [x] 3.2 Replace the popover's outside-`mousedown` dismissal with the scrim (pointer dismissal now owned by the scrim); keep the `Escape` key handler for the keyboard path.
- [x] 3.3 Verify `src/ui/tags/styles.ts` z-index ordering keeps `.sk-tag-popover` (`z-index: 30`) above the scrim variant (`29`).

## 4. Tests

- [x] 4.1 Add a real-browser (Playwright) regression test under `tests/browser/`: open the conversation context menu, press a conversation row and release after a frame, assert the menu closes AND the row's open handler is not called (reproduces the held-press timing that the prior synthetic-click unit test missed).
- [x] 4.2 Add happy-dom coverage for the scrim dismiss path on both surfaces (context menu and tag picker): pressing the scrim dismisses the surface and the underlying control's handler is not invoked.
- [x] 4.3 Assert the popover/menu items remain reachable above the scrim (a click on a menu item still activates it while the scrim is present).

## 5. Verification

- [x] 5.1 `npm run typecheck` and `npm run lint` clean.
- [x] 5.2 `npm test` (happy-dom) and `npm run test:browser` pass, including the new tests. (All 927 happy-dom tests pass; the new browser regression test passes. One unrelated, pre-existing browser failure remains in `profiles.browser.test.tsx` — confirmed failing on a clean tree without this change.)
- [x] 5.3 Manually verify in the side panel: with the context menu and tag picker open, the first outside click only dismisses (no conversation opens, no folder toggles); Escape still closes; menu items and tag toggles still work.
