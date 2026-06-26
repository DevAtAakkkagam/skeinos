// Styles for the interaction-primitive widgets (menu, dialog). Like the rest of the
// overlay these read only `--sk-*` tokens (no hard-coded colors/spacing) and are
// injected into the shadow root by whichever feature mounts them. Zag positions the
// menu via inline popper styles and toggles `hidden`/`data-state` on its parts; these
// rules supply the chrome (surface, z-index, centering) Zag does not.

export const PRIMITIVES_CSS = `
/* Wrappers carry the shadow root for Zag and must not affect layout. */
.sk-menu-root, .sk-dialog-host { display: contents; }

/* Menu — Zag's positioner gets absolute popper styles inline; we add stacking. Zag
   writes "z-index: var(--z-index)" inline with "--z-index: auto", so a plain rule here
   is overridden and the menu only floats by being positioned — it then collides with
   wrapping chip rows beneath it. !important is required to beat Zag's inline value and
   lift the popover onto the top layer. */
.sk-menu__positioner { z-index: 2147483647 !important; }
/* Floating UI computes the position asynchronously, writing --x/--y onto the
   positioner only after the first paint. For an anchor-point (context) menu Zag
   keeps placement defined, so its built-in off-screen guard never engages and the
   menu paints once at the positioner origin before snapping to the pointer. Hide it
   until --x lands so it appears in one place. */
.sk-menu__positioner:not([style*="--x:"]) { visibility: hidden; }
/* Crisp elevation so the popover reads as a distinct floating layer over the busy
   chip grid (bg and border tokens are both near-white, so a faint shadow alone let the
   surface blend and overlapped chips appeared to bleed through). A contrast-tinted ring
   plus a two-stop shadow lifts it cleanly. */
.sk-menu { background: var(--sk-color-bg); color: var(--sk-color-fg); border: 1px solid color-mix(in srgb, var(--sk-color-fg) 14%, var(--sk-color-border)); border-radius: var(--sk-radius); box-shadow: 0 12px 32px -8px color-mix(in srgb, var(--sk-color-shadow) 40%, transparent), 0 2px 6px color-mix(in srgb, var(--sk-color-shadow) 24%, transparent); display: flex; flex-direction: column; min-width: 160px; padding: var(--sk-space-1); }
.sk-menu:focus-visible { outline: none; }
.sk-menu__item { background: none; border: 0; color: inherit; font: inherit; text-align: left; padding: var(--sk-space-1) var(--sk-space-2); border-radius: var(--sk-radius); cursor: pointer; }
.sk-menu__item[data-highlighted], .sk-menu__item:hover, .sk-menu__item:focus-visible { background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent); outline: none; }
.sk-menu__item[data-disabled] { opacity: 0.55; cursor: not-allowed; }
/* A hairline separator between menu groups — sets the destructive action apart from
   the routine ones above it. One weight (1px), token-tinted like every other rule. */
.sk-menu__divider { height: 1px; margin: var(--sk-space-1) 0; background: var(--sk-color-border); }

/* Non-modal popover dismissal scrim (decision: popover-backdrop-dismiss). A real,
   transparent full-surface element under an open menu/popover that absorbs the
   outside pointer interaction so the control behind never receives it — no dimming
   (unlike the modal dialog backdrop). Stacking is per-variant so the scrim sits one
   level below the popover it guards: the Zag menu lives on the top layer (positioner
   2147483647), the tag popover in a low local regime (.sk-tag-popover z-index 30). */
.sk-popover-scrim { position: fixed; inset: 0; background: transparent; }
.sk-popover-scrim--menu { z-index: 2147483646; }
.sk-popover-scrim--tag { z-index: 29; }

/* Dialog — backdrop overlays the overlay; positioner centers the content. */
/* Tinted-dark scrim (indigo-tinted, never pure black) that darkens in both themes. */
.sk-dialog__backdrop { position: fixed; inset: 0; z-index: 2147483646; background: rgba(22, 21, 31, 0.4); }
.sk-dialog__positioner { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; }
/* Bound the width so long content (e.g. an upgrade nudge) wraps in place instead
   of stretching the dialog toward the viewport edge (no CLS / layout-shift). */
.sk-dialog { background: var(--sk-color-bg); color: var(--sk-color-fg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); padding: var(--sk-space-3); display: flex; flex-direction: column; gap: var(--sk-space-2); min-width: 260px; max-width: min(440px, calc(100vw - 24px)); box-sizing: border-box; }
.sk-dialog:focus-visible { outline: none; }
`;
