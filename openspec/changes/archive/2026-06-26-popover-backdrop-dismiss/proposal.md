## Why

When a non-modal floating surface is open — the conversation row context menu (Move / Pin / Archive / Tags…) or the tag picker popover — a click anywhere outside it both dismisses the surface **and** activates the element behind it (opening a conversation, toggling a folder). This violates the existing `ui-interaction-primitives` contract ("Menu closes on outside interaction … without activating any item") and is jarring: the first outside click should only dismiss.

The root cause is structural, not a timing bug. The modal dialog widget already behaves correctly because it renders a full-surface backdrop element that physically absorbs the outside click; the menu and the (custom) tag popover render only the floating panel with nothing behind it, so the click falls through to the content underneath. Attempts to "swallow" the trailing `click` with event listeners failed because the listener's lifetime was tied to the surface's open state, and the surface closes (via Zag's deferred outside-dismiss) before the click fires — tearing the listener down too early. A backdrop avoids all event-timing reasoning.

## What Changes

- Add a reusable, transparent **dismissal scrim** to the interaction-primitives layer: a full-surface element rendered beneath an open non-modal popover (and above page content) that, on pointer interaction, dismisses the popover and absorbs the event so it never reaches the content behind.
- Apply the scrim to the **accessible menu widget** so its outside-dismiss no longer passes the click through to underlying content — honoring the existing "without activating any item" scenario in practice.
- Apply the same scrim to the **tag picker popover** so an outside click only dismisses it.
- Strengthen the `ui-interaction-primitives` spec to require that outside-dismiss of any non-modal popover surface does not deliver a pointer activation to the element behind it.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ui-interaction-primitives`: add a requirement that non-modal popover surfaces (menu, tag picker, and future popovers) dismiss on outside interaction **without** activating the element behind them, provided by a shared backdrop/scrim mechanism; clarify the existing menu outside-dismiss scenario accordingly.

## Impact

- **Spec:** `openspec/specs/ui-interaction-primitives/spec.md` (one new requirement + a clarified scenario).
- **Code (primitives):** `extension/src/ui/primitives/` — new scrim element/primitive and its styles; wired into `Menu.tsx`.
- **Code (consumers):** `extension/src/ui/sidebar/ConversationList.tsx` (per-row context menu) and `extension/src/ui/tags/TagPicker.tsx` (+ `src/ui/tags/styles.ts` z-index) adopt the scrim.
- **Tests:** a real-browser (Playwright) test that reproduces the held-click timing — open the context menu, press a conversation row, assert the menu closes and the row does **not** open — plus happy-dom coverage of the scrim dismiss path. The prior unit test that "passed" against a synchronous synthetic click did not reproduce the bug; the new test must hold the press across a frame.
- **No** new dependencies, permissions, or storage/schema changes. Behavior change is limited to dismissal; the modal dialog and MoveToFolderPicker are unaffected (already correct).
