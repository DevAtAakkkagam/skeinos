// Theme tokens as shadow-scoped CSS custom properties (decision D5).
//
// `all: initial` on :host is the boundary reset (task 3.2) — it blocks inherited
// host-page properties (color, font, etc.) from leaking into our UI. Per the CSS
// `all` spec it does NOT touch custom properties, so the `--sk-*` tokens declared
// in the same block survive and define our baseline.
//
// Light is the default (plain :host). `data-theme="dark"` overrides; `system`
// follows prefers-color-scheme. The attribute is flipped on the host element by
// the mount harness, so :host([data-theme=...]) selects the active mode.
//
// Scrollbar convention: every scroll container (anything with `overflow:auto`
// or `overflow:scroll`) MUST also set `scrollbar-gutter: stable`, so the
// scrollbar's width is reserved as a permanent gutter and the layout never
// shifts when the bar appears/disappears. This is per-container by design — a
// blanket `*` rule would wrongly reserve a gutter on `overflow:hidden` ellipsis
// boxes, which are scroll containers too.

export const THEME_CSS = `
:host {
  all: initial;
  display: block;

  /* Lattice Design System typefaces (bundled in fonts.ts). */
  --sk-font-ui: "Urbanist", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  --sk-font-dot: "Handjet", "Urbanist", system-ui, sans-serif;
  --sk-font-system: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;

  font-family: var(--sk-font-ui);
  /* Body · 500 · 13 / 20 (Lattice type scale). */
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;

  --sk-color-bg: #ffffff;
  --sk-color-fg: #1a1a1a;
  --sk-color-muted: #6b7280;
  --sk-color-accent: #4f46e5;
  --sk-color-success: #84c9b0;
  --sk-color-border: #e5e7eb;
  --sk-space-1: 4px;
  --sk-space-2: 8px;
  --sk-space-3: 12px;
  --sk-radius: 6px;

  color: var(--sk-color-fg);
}

:host([data-theme="dark"]) {
  --sk-color-bg: #1a1a1a;
  --sk-color-fg: #f5f5f5;
  --sk-color-muted: #9ca3af;
  --sk-color-accent: #818cf8;
  --sk-color-success: #84c9b0;
  --sk-color-border: #374151;
}

@media (prefers-color-scheme: dark) {
  :host([data-theme="system"]) {
    --sk-color-bg: #1a1a1a;
    --sk-color-fg: #f5f5f5;
    --sk-color-muted: #9ca3af;
    --sk-color-accent: #818cf8;
    --sk-color-success: #84c9b0;
    --sk-color-border: #374151;
  }
}
`;
