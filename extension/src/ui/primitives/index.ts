// The interaction-primitives layer (decision D-IP3): positioning + accessible Zag.js
// widgets for the shadow-DOM overlay. The Floating UI / Zag.js dependencies are
// imported only within this directory; everything else consumes these exports.
//
// This is the designated home for every floating/dismissable widget. Build the
// not-yet-shipped ones here on the same primitives rather than re-rolling
// positioning/ARIA: the M3 search command palette and M2 tag picker (Zag `combobox`),
// the M4 prompt library, and shell tooltips (`useFloating`, or Zag `tooltip`).

export { useFloating } from './useFloating';
export type { UseFloatingOptions, FloatingResult } from './useFloating';

export { Menu, useMenu } from './Menu';
export type { MenuApi, MenuProps, MenuItemSpec, UseMenuOptions } from './Menu';

export { Dialog, useDialog } from './Dialog';
export type { DialogApi, DialogProps, UseDialogOptions } from './Dialog';

// Re-exported for consumers that wire a machine's prop-getters by hand (e.g. the
// sidebar's per-row context triggers).
export { mergeProps } from './machine';
export { getNodeRoot } from './shadow';

export { PRIMITIVES_CSS } from './styles';
