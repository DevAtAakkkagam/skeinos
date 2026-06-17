// Shared inline-SVG icon set. The chrome previously drew its icons as Unicode
// glyphs (⌕ ⚙ +), which inherit the small body font-size and underfill their em
// box, so they rendered tiny and inconsistently across OS fonts. These SVGs draw
// at an explicit pixel size and inherit color via `currentColor`, so they stay
// crisp and uniform wherever they mount.
//
// Style matches the folder empty-state glyph: 24×24 viewBox, no fill, 1.5 stroke,
// round caps/joins. `size` is the rendered px (width = height); icons are marked
// `aria-hidden` since every call site already supplies an accessible label.

import type { JSX } from 'preact';

export interface IconProps {
  /** Rendered size in px (applied to width and height). */
  size?: number;
  class?: string;
}

type SvgProps = JSX.SVGAttributes<SVGSVGElement> & { size: number };

/** Shared <svg> frame so every icon keeps identical geometry and stroke style. */
function Svg({ size, children, ...rest }: SvgProps & { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function SearchIcon({ size = 16, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  );
}

export function SettingsIcon({ size = 16, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

export function PlusIcon({ size = 16, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function CloseIcon({ size = 16, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function CheckIcon({ size = 16, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function ChevronIcon({ size = 16, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function FolderIcon({ size = 40, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  );
}

export function MoreIcon({ size = 16, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Svg>
  );
}

export function ChatIcon({ size = 40, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Svg>
  );
}
