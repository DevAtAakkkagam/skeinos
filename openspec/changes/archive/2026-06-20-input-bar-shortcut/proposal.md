## Why

The input action bar (C13, complete) exposes its prompt picker through a single trigger rendered as
a bare `/` glyph. Two problems surfaced in review of the live bar:

1. **The trigger reads as ambiguous.** The `/` borrows the *look* of a slash-command without the
   *behavior* — D-1 deliberately rejected host-keystroke interception, so it is a button, not a
   typed slash. Its sibling controls (Profile, Model) are named, but the only live control is an
   unlabelled symbol. The bar should say what the control does.
2. **The picker is mouse-only.** Opening the prompt picker requires clicking the trigger; there is
   no keyboard path to it. A power user mid-compose has to leave the keyboard.

input-bar's design listed a keyboard trigger as a non-goal because the *full* shortcut system
(C16 `shortcuts`: defaults + user customization + conflict avoidance) is a separate capability. This
change ships only the **minimal** piece that belongs with the bar: a single fixed accelerator that
toggles the bar's own popover. The rebindable, focus-independent, conflict-checked shortcut remains
C16's job.

## What Changes

- **Relabel the trigger** from the bare `/` glyph to the text **"Insert prompt"**, aligning the
  visible text with the trigger's existing accessible name (`STR.slashTrigger = "Insert a prompt"`).
  The popover behavior is unchanged.
- **Add a minimal local keyboard accelerator** — **`Cmd/Ctrl + /`** — that toggles the bar's slash
  popover. It is a single chord (not host-keystroke logging), registered on the bar's
  `ownerDocument` in the capture phase so it can pre-empt the host's "type-anywhere-to-focus the
  composer" handler, and torn down with the bar through the existing content-script lifecycle.
- **BREAKING:** none — additive to the existing bar.

## Capabilities

### Modified Capabilities

- `input-bar`: the slash trigger is relabelled "Insert prompt", and a fixed `Cmd/Ctrl + /`
  accelerator toggles the slash popover. No change to the popover, variable modal, insertion path,
  or adapter contract.

## Impact

- **Code:** `ui/input-bar/strings.ts` (trigger label) and `ui/input-bar/InputBar.tsx` (drop the `/`
  glyph child; add a capture-phase `keydown` effect on the bar's `ownerDocument` that toggles
  `open`, disposed on unmount). New tests for the chord toggle and the relabel.
- **Data:** none.
- **Privacy:** none — a single accelerator chord, not keystroke interception; the bar still reads
  the composer only to insert. No new permission, no network. Consistent with D-1's privacy stance.
- **Manifest:** none — this is an in-page document listener, **not** a `chrome.commands` entry. A
  focus-independent, user-rebindable command (which would need the manifest) is deferred to C16.
- **Dependencies:** builds on `input-bar` (C13 ✅). Does not block or alter C16 `shortcuts`, which
  later supersedes this fixed chord with a customizable, conflict-checked binding.
