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

  /* Neutrals are tinted toward the accent hue (~277°), never pure #fff/#000:
     the surface reads as one woven layer, not stock white + Tailwind gray. Hex
     here is the canonical OKLCH retuned to sRGB (light bg oklch(99% .004 277),
     fg oklch(22% .018 277), muted oklch(52% .035 277), border oklch(91% .008 277)).
     Muted holds AA on bg (5.4:1); accent keeps the brand indigo. */
  --sk-color-bg: #fbfcff;
  --sk-color-fg: #181a23;
  --sk-color-muted: #63677d;
  --sk-color-accent: #4f46e5;
  --sk-color-success: #84c9b0;
  --sk-color-danger: #c74b47;
  --sk-color-border: #e0e1e7;
  --sk-space-1: 4px;
  --sk-space-2: 8px;
  --sk-space-3: 12px;
  --sk-radius: 6px;

  color: var(--sk-color-fg);
}

:host([data-theme="dark"]) {
  /* Same indigo-tinted neutrals, dark end of the ramp (bg oklch(22% .014 277),
     fg oklch(96% .005 277), muted oklch(72% .025 277), border oklch(38% .02 277)).
     Muted holds AA on dark bg (7:1). */
  --sk-color-bg: #191a21;
  --sk-color-fg: #f2f3f7;
  --sk-color-muted: #a0a4b5;
  --sk-color-accent: #818cf8;
  --sk-color-success: #84c9b0;
  --sk-color-danger: #e66e68;
  --sk-color-border: #3f424d;
}

@media (prefers-color-scheme: dark) {
  :host([data-theme="system"]) {
    --sk-color-bg: #191a21;
    --sk-color-fg: #f2f3f7;
    --sk-color-muted: #a0a4b5;
    --sk-color-accent: #818cf8;
    --sk-color-success: #84c9b0;
    --sk-color-danger: #e66e68;
    --sk-color-border: #3f424d;
  }
}
`;
