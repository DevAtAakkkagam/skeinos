// A transparent, full-surface dismissal scrim for NON-MODAL popovers (decision D-IP:
// popover-backdrop-dismiss). Rendered beneath an open menu/popover and above page
// content, it absorbs the outside pointer interaction structurally — so the first
// outside press only dismisses the surface and never falls through to the row/control
// behind it (the failure a click-swallow listener could not fix, because Zag's
// deferred outside-dismiss tears the listener down before the trailing click fires).
//
// Unlike the modal Dialog backdrop it is fully transparent (no dimming); only the
// pointer-absorbing property is wanted. Stacking is set per surface via `variant` so
// the scrim always sits exactly one level below the popover it guards.

import type { JSX } from 'preact';

export type PopoverScrimVariant = 'menu' | 'tag';

export interface PopoverScrimProps {
  /** Dismiss the guarded surface (fired on the scrim's pointer-down). */
  onDismiss: () => void;
  /** Stacking regime of the popover this scrim guards. */
  variant: PopoverScrimVariant;
  /** `data-testid` for the scrim element. */
  testid?: string;
}

/**
 * The scrim closes the surface on `pointerdown` so dismissal feels immediate, and —
 * being the topmost element at the pointer — it is itself the `click` target, so the
 * control behind never receives the activation regardless of how the surface closes.
 * Propagation is stopped to keep the press from reaching unrelated panel handlers.
 */
export function PopoverScrim({ onDismiss, variant, testid }: PopoverScrimProps) {
  return (
    <div
      class={`sk-popover-scrim sk-popover-scrim--${variant}`}
      data-testid={testid}
      aria-hidden="true"
      onPointerDown={(e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        onDismiss();
      }}
    />
  );
}
