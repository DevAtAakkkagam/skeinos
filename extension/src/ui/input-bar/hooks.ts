// Reusable defensive behaviours for the input-bar overlay, extracted from the
// popover so the component reads as intent, not plumbing. Each is host-agnostic
// correctness (or, where noted, opt-in for a class of hostile hosts) rather than a
// per-platform fork — the differences stay in adapter config (the [ADAPT] design).

import { useEffect } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * Dismiss a shadow-DOM popover on an outside pointer-down.
 *
 * The listener sits on the document, where a shadow event's `target` is RETARGETED to
 * the shadow host — never the inner element — so `contains(target)` would read a click
 * on the popover's own field as "outside". `composedPath()` crosses the shadow
 * boundary, so checking it for the panel treats in-popover clicks correctly.
 */
export function useShadowDismiss(panelRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const onPointerDown = (e: Event): void => {
      const panel = panelRef.current;
      if (panel && !e.composedPath().includes(panel)) onClose();
    };
    const doc = panelRef.current?.ownerDocument ?? document;
    doc.addEventListener('pointerdown', onPointerDown, true);
    return () => doc.removeEventListener('pointerdown', onPointerDown, true);
  }, [panelRef, onClose]);
}

/**
 * Focus a field on mount and re-assert it across the next frame and a short timeout,
 * so a host that auto-focuses its own composer on load/click can't win the race and
 * steal initial focus. One-shot — no ongoing listener, so it can't start a focus war.
 */
export function useAutoFocus(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const focus = (): void => ref.current?.focus();
    focus();
    const raf = requestAnimationFrame(focus);
    const timer = setTimeout(focus, 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [ref]);
}

/**
 * Contain focus within a panel while it is open — for hosts that run a global handler
 * force-focusing their own composer whenever focus lands elsewhere (Perplexity), which
 * otherwise bounces focus out of an overlay field and leaks keystrokes to the native
 * box. Opt-in (`enabled`, driven by `behaviors.composerStealsFocus`) because it is
 * invasive: at the window-capture level (above the host's document handler) it
 * `stopImmediatePropagation`s EVERY focusin so the host never learns focus left its
 * composer — and so can't re-steal, which would loop — and pulls focus back to
 * `focusRef` when it slipped outside the panel. Refocusing lands inside the panel,
 * where it only stops (never refocuses), so it converges rather than ping-pongs.
 */
export function useFocusContainment(
  panelRef: RefObject<HTMLElement | null>,
  focusRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onFocusIn = (e: Event): void => {
      const panel = panelRef.current;
      if (!panel) return;
      e.stopImmediatePropagation();
      if (!e.composedPath().includes(panel)) focusRef.current?.focus();
    };
    window.addEventListener('focusin', onFocusIn, true);
    return () => window.removeEventListener('focusin', onFocusIn, true);
  }, [panelRef, focusRef, enabled]);
}
