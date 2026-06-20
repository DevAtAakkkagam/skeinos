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
import type { Folder } from '../../shared/types';

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

/** "Expand all" — two chevrons fanning outward (unfold more). */
export function ExpandAllIcon({ size = 16, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />
    </Svg>
  );
}

/** "Collapse all" — two chevrons folding inward (unfold less). */
export function CollapseAllIcon({ size = 16, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <path d="m8 5 4 4 4-4M8 19l4-4 4 4" />
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

/** Sentinel `Folder.icon` value meaning "draw the default folder glyph" (vs. an
 *  emoji the user picked). Stored, so it must stay a stable string. */
export const FOLDER_ICON_SENTINEL = 'folder';

/** A folder's leading icon for tree/list/picker rows: the default folder glyph in
 *  the folder's colour for the sentinel, a user-chosen emoji otherwise, or nothing. */
export function FolderRowIcon({ folder }: { folder: Folder }) {
  if (folder.icon === FOLDER_ICON_SENTINEL) {
    return (
      <span class="sk-row__icon" data-testid="sk-row-folder-icon" style={{ color: folder.color }}>
        <FolderIcon size={14} />
      </span>
    );
  }
  if (folder.icon) return <span class="sk-row__icon">{folder.icon}</span>;
  return null;
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

/** A filled push-pin badge marking a pinned row. Drawn filled (not stroke-only) so
 *  it reads as an at-a-glance status marker against the row's text, not an action. */
export function PinIcon({ size = 12, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls} fill="currentColor" stroke="none">
      <path d="M14.6 2.6a1 1 0 0 0-1.5 0l-.6.6a2 2 0 0 0-.5 2L8.9 8.3a3 3 0 0 0-2.7.8l-.3.3a1 1 0 0 0 0 1.4l2.7 2.7-4.3 4.3a1 1 0 1 0 1.4 1.4l4.3-4.3 2.7 2.7a1 1 0 0 0 1.4 0l.3-.3a3 3 0 0 0 .8-2.7l3.1-3.1a2 2 0 0 0 2-.5l.6-.6a1 1 0 0 0 0-1.5z" />
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

/** The Prompts-tab empty-state glyph: a document with text lines (the prompt-library
 *  analog of {@link FolderIcon}). */
export function PromptIcon({ size = 40, class: cls }: IconProps) {
  return (
    <Svg size={size} class={cls}>
      <path d="M6 3h8l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M13 3v5h5" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </Svg>
  );
}
