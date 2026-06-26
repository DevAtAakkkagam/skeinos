## Context

The overlay UI mounts in a shadow root (`ui/mount.tsx`) inside the side panel document. Three floating surfaces exist today:

| Surface | Built on | Backdrop? | Bug? |
| --- | --- | --- | --- |
| `MoveToFolderPicker` | Zag `Dialog` (modal) | yes — `.sk-dialog__backdrop`, `z-index: 2147483646` | no |
| Conversation context menu | Zag `Menu` (non-modal) | none | **yes** |
| Tag picker | custom popover `.sk-tag-popover`, `z-index: 30` | none | **yes** |

The Dialog renders a real full-surface backdrop element below the dialog and above content. An outside click physically lands on the backdrop, which both dismisses and **absorbs** the event — so the content behind never receives it. The menu and tag popover render only the floating panel, so an outside click falls through to the conversation row / folder toggle underneath (both activate on `onClick`).

Why the obvious "swallow the trailing click" approach was tried and failed: a capture-phase `click` listener was armed on an outside `mousedown` and disarmed in the surface's open-state effect cleanup. But Zag's `interact-outside` runs **deferred** (`defer: true` → one `requestAnimationFrame`), and a deliberate human press is held ~50–100ms:

```
  t0    pointerdown + mousedown   → swallow armed
  t~16  (rAF) Zag onInteractOutside → CLOSE → open = false
  t~16+ Preact re-renders → effect CLEANUP → swallow REMOVED  ← too early
  t~80  mouseup → click → no swallow left → row activates      ← bug persists
```

The unit test that "passed" dispatched a synthetic `mousedown`+`click` in one synchronous tick, before any rAF/cleanup, so it never reproduced the held-press timing. A backdrop sidesteps all of this: there is no event to cancel because a real element is in the path.

## Goals / Non-Goals

**Goals:**
- A non-modal popover's first outside interaction only dismisses — the element behind is never activated.
- Reuse the proven Dialog mechanism (a real scrim element) so the fix needs no event-timing reasoning.
- One shared primitive, consumed by the Zag menu and the tag picker (and available to future popovers).
- A regression test that reproduces the held-press timing in a real browser.

**Non-Goals:**
- No change to the modal `Dialog` / `MoveToFolderPicker` (already correct).
- No fork of Zag's menu machine or its `interact-outside` wiring; the existing outside-dismiss stays (with a scrim it is redundant but harmless).
- No visual dimming for non-modal popovers — the scrim is transparent (unlike the modal backdrop).
- Not converting the menu or tag picker into modal dialogs (they keep menu/popover semantics, roving focus, anchored positioning).

## Decisions

### Decision 1: Transparent backdrop scrim, mirroring the Dialog backdrop

Render a transparent, full-surface scrim element beneath an open non-modal popover and above page content. On pointer interaction the scrim dismisses the popover; because it is a real element on top of the rows, it absorbs the interaction and the content behind never receives it.

- **Why over a click-swallow listener:** structural, not temporal. No dependence on event ordering, `defer`, or effect-cleanup timing — the failure modes that defeated the previous attempts. Matches the one floating surface that already works.
- **Why transparent:** these are lightweight contextual popovers, not modal tasks; dimming the panel would be visually heavy and inconsistent with current menu UX. Only the *pointer-absorbing* property of the Dialog backdrop is wanted, not the tint.
- **Alternatives considered:**
  - *Swallow trailing click that outlives close* — fragile (drag-without-click leaves a dangling listener; timing windows); already failed.
  - *Zag `pointerBlocking`/modal on the menu machine* — the menu machine does not expose it; would require forking.
  - *Global `pointer-events: none` on the rest of the panel* — hard to scope correctly within the shadow root and conflicts with the popover's own subtree.

### Decision 2: A shared `PopoverScrim` primitive in `ui/primitives/`

Add a small primitive (e.g. `PopoverScrim`) that renders the scrim div and takes an `onDismiss` callback, plus a CSS class in the primitives styles. `Menu.tsx` renders it whenever the menu is open; `TagPicker.tsx` renders it whenever the popover is open. Stacking is set per surface so the scrim sits exactly one level below its popover:

```
  Zag menu:     scrim z-index 2147483646   (popover positioner 2147483647)
  Tag picker:   scrim z-index 29           (popover 30)
```

- **Why a primitive over inlining twice:** `ui/primitives/` is the designated home for floating/overlay behavior; a single primitive keeps the stacking contract and the dismiss semantics in one place and lets future popovers (search palette, prompt library) opt in.
- **Why per-surface z-index rather than one global value:** the menu and tag popover live in different stacking regimes (max-int vs. low local values); the scrim must track whichever popover it guards. The primitive accepts the stacking via a class/variant so each call site stays correct.

### Decision 3: Keep Zag's existing outside-dismiss for the menu

Leave `Menu`'s Zag `interact-outside` in place. With a scrim present, the dismissing pointer lands on the scrim (which is "outside" the content), so Zag still closes the menu and restores focus to the trigger; the scrim's own handler is a belt-and-braces dismiss. This avoids touching the machine bridge and preserves focus restoration and Escape handling.

- **Trade-off:** two paths may both request close on the same interaction. Closing an already-closing menu is idempotent, so this is harmless.

### Decision 4: Dismiss on the scrim's pointer-down, and absorb the click

The scrim handles the press so the popover closes promptly, and it must also absorb the resulting `click` so nothing behind it fires. Because the scrim is the topmost element at the pointer location, the `click` target is the scrim itself — the row never receives it regardless of how the scrim closes the popover. The scrim does not need to `preventDefault`/`stopPropagation` to protect the row; it only needs to *exist in the path*. (It may still stop propagation to keep the event from bubbling to unrelated panel handlers.)

## Risks / Trade-offs

- **Scrim covers the trigger while open** → Clicking the trigger again hits the scrim (dismiss) instead of toggling. This is acceptable, expected modal-dismiss behavior and matches the Dialog; re-opening is a second click.
- **Full-surface fixed scrim could intercept scroll/hover meant for the panel while open** → The popover is a transient, focused moment; the modal Dialog already does this without complaint. Scope the scrim to the overlay surface (`position: fixed; inset: 0` within the shadow root) like the Dialog backdrop.
- **Stacking regressions** → A wrong z-index could place the scrim above the popover (popover unclickable) or below the content (no effect). Mitigation: per-surface values pinned one below the popover, plus a real-browser test that asserts the popover items remain clickable while the scrim is present.
- **Test that doesn't reproduce timing** → The previous false green came from a synchronous synthetic click. Mitigation: the regression test must hold the press across a frame (or assert via the scrim being in the hit path), and ideally run under the real-browser suite where the rAF-deferred dismiss actually occurs.

## Migration Plan

Pure UI behavior change; no data, storage, schema, permission, or dependency changes. Ships in one slice. Rollback is reverting the primitive + the two call-site adoptions. No migration of stored state.

## Open Questions

- Should the scrim primitive also be adopted by any *other* current floating surface (e.g. the input-bar profile chip popover, if non-modal) in this change, or left for a follow-up once the pattern is proven on the two reported surfaces? Default: scope to the two reported surfaces now.
- Should the tag picker's existing Esc/outside-`mousedown` dismissal be removed in favor of the scrim, or kept alongside it? Default: keep Esc (keyboard path), let the scrim own pointer dismissal, and drop the now-redundant outside-`mousedown` listener to avoid double-close churn.
