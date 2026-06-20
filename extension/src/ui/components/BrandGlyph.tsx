// The Skeinos brand glyph — a skein (#) with one thread highlighted, vendored
// inline (matches `public/logo.svg`). Mounts in the shadow root like the Icon set
// (no <img>, no remote fetch — MV3 "no remote code", D2). Two strokes inherit
// `currentColor` so the mark recolours with its chip; the highlighted thread keeps
// its fixed brand purple as the identity accent.

import type { JSX } from 'preact';

export interface BrandGlyphProps {
  /** Rendered size in px (width = height). */
  size?: number;
  class?: string;
}

export function BrandGlyph({ size = 22, class: cls }: BrandGlyphProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Skeinos"
      class={cls}
    >
      <g stroke-width="4.2" stroke-linecap="round">
        <line x1="2.2" y1="8" x2="21.8" y2="8" stroke="currentColor" />
        <line x1="16" y1="2.2" x2="16" y2="21.8" stroke="currentColor" />
        <line x1="8" y1="2.2" x2="8" y2="21.8" stroke="#8b7fed" />
        <line x1="2.2" y1="16" x2="21.8" y2="16" stroke="currentColor" />
      </g>
    </svg>
  );
}
