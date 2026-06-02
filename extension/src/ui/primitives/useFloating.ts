// Positioning primitive over `@floating-ui/dom` (decision D-IP3). Anchors a
// floating element to a reference and keeps it on-screen with offset → flip → shift.
// `@floating-ui/dom` walks the offsetParent chain and reads `getBoundingClientRect`,
// so it computes correctly inside our shadow root without extra wiring; the clipping
// boundary defaults to the viewport, which is what we want for an overlay (D-IP4).
//
// Zag's menu/dialog machines position themselves (their positioner is also built on
// Floating UI), so this hook is the layer's primitive for *non-machine* floating
// widgets — tooltips and bare popovers — and is unit-tested directly.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  autoUpdate,
  computePosition,
  flip,
  offset as offsetMiddleware,
  shift,
  type Middleware,
  type Placement,
  type Strategy,
} from '@floating-ui/dom';

export interface UseFloatingOptions {
  /** Preferred side; flips to the opposite side near a viewport edge. */
  placement?: Placement;
  /** Gap in px between the anchor and the floating element. */
  offset?: number;
  /** Viewport padding kept when shifting/flipping. */
  padding?: number;
  strategy?: Strategy;
  /** Extra middleware appended after offset/flip/shift. */
  middleware?: Middleware[];
  /** When false, positioning + auto-update are paused. */
  open?: boolean;
}

export interface FloatingResult {
  x: number;
  y: number;
  placement: Placement;
  strategy: Strategy;
  /** Attach to the anchor element. */
  setReference: (el: HTMLElement | null) => void;
  /** Attach to the floating element. */
  setFloating: (el: HTMLElement | null) => void;
  /** Style object to spread on the floating element. */
  floatingStyles: { position: Strategy; top: string; left: string };
  /** Force a re-measure (otherwise auto-updated on scroll/resize). */
  update: () => void;
}

export function useFloating(options: UseFloatingOptions = {}): FloatingResult {
  const {
    placement: preferred = 'bottom-start',
    offset = 6,
    padding = 8,
    strategy = 'absolute',
    middleware,
    open = true,
  } = options;

  const referenceRef = useRef<HTMLElement | null>(null);
  const floatingRef = useRef<HTMLElement | null>(null);

  const [state, setState] = useState<{ x: number; y: number; placement: Placement }>({
    x: 0,
    y: 0,
    placement: preferred,
  });

  const update = useCallback(() => {
    const reference = referenceRef.current;
    const floating = floatingRef.current;
    if (!reference || !floating) return;
    void computePosition(reference, floating, {
      placement: preferred,
      strategy,
      middleware: [
        offsetMiddleware(offset),
        flip({ padding }),
        shift({ padding }),
        ...(middleware ?? []),
      ],
    }).then(({ x, y, placement }) => setState({ x, y, placement }));
  }, [preferred, offset, padding, strategy, middleware]);

  // Re-measure on scroll/resize/layout while open and both elements are present.
  useEffect(() => {
    const reference = referenceRef.current;
    const floating = floatingRef.current;
    if (!open || !reference || !floating) return undefined;
    return autoUpdate(reference, floating, update);
  }, [open, update]);

  const setReference = useCallback(
    (el: HTMLElement | null) => {
      referenceRef.current = el;
      update();
    },
    [update],
  );
  const setFloating = useCallback(
    (el: HTMLElement | null) => {
      floatingRef.current = el;
      update();
    },
    [update],
  );

  return {
    x: state.x,
    y: state.y,
    placement: state.placement,
    strategy,
    setReference,
    setFloating,
    floatingStyles: { position: strategy, top: `${state.y}px`, left: `${state.x}px` },
    update,
  };
}
