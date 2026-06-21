## 1. Relabel the trigger

- [x] 1.1 In `ui/input-bar/InputBar.tsx`, remove the bare `/` glyph child of the trigger button and
      render the `STR.slashTrigger` text as its visible label (the `aria-label`/`title` already use
      it). Keep `aria-haspopup`/`aria-expanded`/`ref`/`onClick` unchanged.
- [x] 1.2 Confirm `STR.slashTrigger` ("Insert a prompt") reads well as a visible chip; adjust the
      string only if needed (no new key).

## 2. Keyboard accelerator

- [x] 2.1 In `InputBar.tsx`, add a `useEffect` that registers a capture-phase `keydown` listener on
      the bar's `ownerDocument` matching `(e.metaKey || e.ctrlKey) && e.key === '/'` with no other
      modifier; on match `preventDefault()` + `stopPropagation()` and toggle `open`. Clean up the
      listener on unmount.
- [x] 2.2 Ensure opening via the chord focuses the popover search field (same path as the button
      open) and closing via the chord inserts nothing.

## 3. Tests

- [x] 3.1 Test that the trigger renders the visible "Insert prompt" label and its accessible name
      matches.
- [x] 3.2 Test that `Cmd/Ctrl + /` opens the popover (search field focused) and that a second press
      closes it; assert the host-page default is prevented.
- [x] 3.3 Test that unmounting the bar removes the accelerator (no toggle after teardown).
