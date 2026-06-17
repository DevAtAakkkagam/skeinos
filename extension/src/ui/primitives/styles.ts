// Styles for the interaction-primitive widgets (menu, dialog). Like the rest of the
// overlay these read only `--sk-*` tokens (no hard-coded colors/spacing) and are
// injected into the shadow root by whichever feature mounts them. Zag positions the
// menu via inline popper styles and toggles `hidden`/`data-state` on its parts; these
// rules supply the chrome (surface, z-index, centering) Zag does not.

export const PRIMITIVES_CSS = `
/* Wrappers carry the shadow root for Zag and must not affect layout. */
.sk-menu-root, .sk-dialog-host { display: contents; }

/* Menu — Zag's positioner gets absolute popper styles inline; we add stacking. */
.sk-menu__positioner { z-index: 2147483647; }
/* Floating UI computes the position asynchronously, writing --x/--y onto the
   positioner only after the first paint. For an anchor-point (context) menu Zag
   keeps placement defined, so its built-in off-screen guard never engages and the
   menu paints once at the positioner origin before snapping to the pointer. Hide it
   until --x lands so it appears in one place. */
.sk-menu__positioner:not([style*="--x:"]) { visibility: hidden; }
.sk-menu { background: var(--sk-color-bg); color: var(--sk-color-fg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); box-shadow: 0 4px 16px rgba(0,0,0,0.2); display: flex; flex-direction: column; min-width: 160px; padding: var(--sk-space-1); }
.sk-menu:focus-visible { outline: none; }
.sk-menu__item { background: none; border: 0; color: inherit; font: inherit; text-align: left; padding: var(--sk-space-1) var(--sk-space-2); border-radius: var(--sk-radius); cursor: pointer; }
.sk-menu__item[data-highlighted], .sk-menu__item:hover, .sk-menu__item:focus-visible { background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent); outline: none; }
.sk-menu__item[data-disabled] { opacity: 0.55; cursor: not-allowed; }

/* Dialog — backdrop overlays the overlay; positioner centers the content. */
.sk-dialog__backdrop { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,0.32); }
.sk-dialog__positioner { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; }
.sk-dialog { background: var(--sk-color-bg); color: var(--sk-color-fg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); padding: var(--sk-space-3); display: flex; flex-direction: column; gap: var(--sk-space-2); min-width: 260px; }
.sk-dialog:focus-visible { outline: none; }
`;
