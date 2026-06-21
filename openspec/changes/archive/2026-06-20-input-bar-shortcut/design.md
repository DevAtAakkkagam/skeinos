## Context

The input action bar (C13) is complete. Its prompt-picker trigger renders a bare `/` glyph
(`InputBar.tsx`); the accessible name is already `STR.slashTrigger = "Insert a prompt"`. The popover
it opens (`SlashPopover.tsx`) owns its own search field and keyboard nav, and is closed via Escape /
outside-click. D-1 of input-bar rejected host-keystroke interception (privacy + complexity); D-6
made the content script own the bar's mount/teardown lifecycle.

This change makes two small, additive refinements to that bar.

## Goals / Non-Goals

**Goals:**
- Replace the ambiguous `/` glyph with the legible label "Insert prompt".
- Add one fixed accelerator (`Cmd/Ctrl + /`) that toggles the existing popover from the keyboard.

**Non-Goals (deferred to C16 `shortcuts`):**
- User-rebindable shortcuts, a shortcuts settings surface, conflict detection/resolution.
- A focus-independent global command (`chrome.commands` / manifest entry) that works when the host
  composer is not focused.
- Host-composer `/`-typing to open the popover (input-bar's rejected Option 2).

## Decisions

### D-1: Visible label is "Insert prompt", matching the existing accessible name
The bare `/` is relabelled to the text already used for its `aria-label`/`title`
(`STR.slashTrigger`). Visible text and accessible name converge, the bar reads as a row of named
controls (Insert prompt · Profile · Model), and no new string key is needed. The `/slug` aliases in
the popover rows still carry the slash convention where it actually has meaning.

### D-2: A single capture-phase `keydown` accelerator owned by the bar
A `useEffect` in `InputBar` registers `keydown` on the bar's `ownerDocument` in the **capture
phase** and toggles the popover `open` state when the chord matches; the effect's cleanup removes
the listener, so the existing content-script `teardown()` (which unmounts the bar) disposes it for
free. Capture phase + `preventDefault()` + `stopPropagation()` let it pre-empt the host's
document-level "type-anywhere-to-focus-the-composer" handler (the same hazard `SlashPopover` already
guards against with its bubble-phase stoppers).

A single named chord is **not** keystroke interception — it never inspects what the user types into
the composer — so it stays within D-1's privacy stance for the input-bar capability.

### D-3: The chord is `Cmd/Ctrl + /`
`event.key === '/'` with `metaKey` (macOS) or `ctrlKey` (others), and no other modifier. Chosen for
its mnemonic tie to the `/slug` alias convention shown in the popover rows. It has no default Chrome
binding. Known soft collisions exist (Slack/Gmail use `Ctrl+/` for a shortcut-help panel); because
this is a fixed binding without the C16 conflict machinery, the collision risk is **accepted** for
now and is one of the reasons the durable binding lives in C16.

### D-4: Toggle semantics
The accelerator toggles: closed → open (and the popover focuses its search field, as today),
open → closed. Escape and outside-click still close the popover unchanged. This keeps a single,
predictable entry/exit and reuses all existing popover behavior.

## Risks / Trade-offs

- **[Risk] A host registers `Ctrl+/` in capture phase before us** → capture-phase listeners fire in
  registration order along the path; we cannot guarantee winning against an earlier host listener.
  Accepted for the minimal version; C16's `chrome.commands` path is focus/handler-independent and
  resolves this properly.
- **[Risk] Accelerator fires only when the host tab has focus** → inherent to an in-page document
  listener. Acceptable: the bar is a composer-adjacent tool, so "press it while in the chat" is the
  expected usage. Focus-independence is a C16 goal.
- **[Trade-off] Fixed, non-rebindable chord** → deliberately minimal; C16 supersedes it with a
  customizable binding. If C16's default differs, this chord is replaced, not layered.
