// A token-styled skeleton placeholder (loading-states, D-1). A cross-cutting base
// primitive: a shimmer block that stands in for a line, a row, or a block of content
// while it loads. It styles itself exclusively from `--sk-*` theme tokens (its CSS
// lives in the base COMPONENT_CSS barrel, injected into every shadow mount), so it
// re-themes with everything else, and it is `aria-hidden` so assistive tech never
// announces the placeholder as real content (PREACT: keyboard/ARIA-correct).

import type { JSX } from 'preact';

/** The placeholder shape: a text `line`, a list `row`, or a `block`. */
export type SkeletonVariant = 'line' | 'row' | 'block';

export interface SkeletonProps {
  /** Placeholder shape — sets the default height/width (overridable below). */
  variant?: SkeletonVariant;
  /** Explicit width (any CSS length/percent), overriding the variant default. */
  width?: string;
  /** Explicit height (any CSS length), overriding the variant default. */
  height?: string;
  /** Extra class(es) for layout-specific tweaks at the call site. */
  class?: string;
}

export function Skeleton({ variant = 'line', width, height, class: cls }: SkeletonProps): JSX.Element {
  const style: JSX.CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;
  return (
    <span
      class={`sk-skeleton sk-skeleton--${variant}${cls ? ` ${cls}` : ''}`}
      style={style}
      data-testid="sk-skeleton"
      aria-hidden="true"
    />
  );
}
