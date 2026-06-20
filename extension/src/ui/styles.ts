// Base component styles. Every rule reads from theme tokens only (no hard-coded
// colors/spacing) so components re-theme automatically. Scoped class names keep
// this from matching host-page elements once injected into the shadow root.

export const COMPONENT_CSS = `
.sk-panel {
  background: var(--sk-color-bg);
  color: var(--sk-color-fg);
  border: 1px solid var(--sk-color-border);
  border-radius: var(--sk-radius);
  padding: var(--sk-space-3);
}
.sk-stack { display: flex; flex-direction: column; gap: var(--sk-space-2); }
.sk-text { color: var(--sk-color-fg); margin: 0; }
.sk-text--muted { color: var(--sk-color-muted); }
.sk-btn {
  background: var(--sk-color-accent);
  color: var(--sk-color-bg);
  border: 0;
  border-radius: var(--sk-radius);
  padding: var(--sk-space-2) var(--sk-space-3);
  font: inherit;
  cursor: pointer;
}
/* Buttons that lead with an inline-SVG icon: center the icon against the label
   and give them a consistent gap. */
.sk-btn--icon { display: inline-flex; align-items: center; gap: var(--sk-space-1); }
/* Inline icons render as blocks so they don't inherit the text baseline gap. */
.sk-btn svg, .sk-icon-btn svg { display: block; }
.sk-select {
  background: var(--sk-color-bg);
  color: var(--sk-color-fg);
  border: 1px solid var(--sk-color-border);
  border-radius: var(--sk-radius);
  padding: var(--sk-space-1) var(--sk-space-2);
  font: inherit;
}
/* Compact, centered-top breakage snackbar. Fixed to the viewport (its shadow host
   has no transform, so fixed resolves against the page) and out of the host page's
   flow, so it never reflows or overlaps page chrome the way a full-width banner did. */
.sk-snackbar {
  position: fixed;
  top: var(--sk-space-3);
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: var(--sk-space-3);
  max-width: min(420px, calc(100vw - 2 * var(--sk-space-3)));
  background: var(--sk-color-bg);
  color: var(--sk-color-fg);
  border: 1px solid var(--sk-color-border);
  border-radius: var(--sk-radius);
  padding: var(--sk-space-2) var(--sk-space-3);
  box-shadow: 0 6px 24px color-mix(in srgb, var(--sk-color-fg) 16%, transparent);
}
.sk-snackbar__content { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sk-snackbar__content .sk-text { font-weight: 600; }
.sk-snackbar__content .sk-text--muted { font-weight: 500; }
.sk-snackbar__actions { display: flex; align-items: center; gap: var(--sk-space-1); flex-shrink: 0; }
.sk-snackbar__actions .sk-btn { padding: var(--sk-space-1) var(--sk-space-2); }
.sk-snackbar__close {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: 0; color: var(--sk-color-muted);
  padding: var(--sk-space-1); border-radius: var(--sk-radius);
  line-height: 1; cursor: pointer;
}
.sk-snackbar__close svg { display: block; }
.sk-snackbar__close:hover, .sk-snackbar__close:focus-visible {
  color: var(--sk-color-fg);
  background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent);
  outline: none;
}
`;
