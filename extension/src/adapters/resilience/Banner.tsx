// The in-product breakage notice (design D-R5). With no docked overlay until M2,
// the notice is a compact banner mounted through the `ui-shell` shadow-DOM harness
// (`mount()`), so it is style-isolated from the host page and themed only from
// `--sk-*` tokens via the base components ([PREACT]). It carries `role="alert"`,
// is fully keyboard-operable (native buttons), and is mounted ONLY on a tab whose
// platform is degraded — isolation is structural (per-tab, platform-scoped content
// scripts mean a degraded platform's banner never appears on another platform).

import { h, type VNode } from 'preact';
import { mount, type MountHandle, type Theme } from '../../ui/mount';
import { Button } from '../../ui/components/Button';
import { Text } from '../../ui/components/Text';
import { CloseIcon } from '../../ui/components/Icon';
import type { PlatformAdapter, PlatformId } from '../types';
import { reportHealth } from './report';

/** User-facing strings kept in one place so they are i18n-ready (no inline copy). */
export const BANNER_LABELS = {
  title: 'Skeinos is paused on this page',
  body: (platform: PlatformId): string =>
    `The ${platform} layout changed, so the workspace overlay can't start here. The rest of the page is unaffected.`,
  retry: 'Retry',
  dismiss: 'Dismiss',
} as const;

export interface BannerProps {
  platform: PlatformId;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * A token-styled, alert-role breakage notice rendered as a compact snackbar
 * pinned to the top-center of the viewport. Retry re-runs the adapter's check;
 * the icon button closes (dismisses) it.
 */
export function Banner({ platform, onRetry, onDismiss }: BannerProps): VNode {
  return (
    <div role="alert" class="sk-snackbar" data-testid="sk-breakage-banner">
      <div class="sk-snackbar__content">
        <Text>{BANNER_LABELS.title}</Text>
        <Text muted>{BANNER_LABELS.body(platform)}</Text>
      </div>
      <div class="sk-snackbar__actions">
        <Button onClick={onRetry}>{BANNER_LABELS.retry}</Button>
        <button
          type="button"
          class="sk-snackbar__close"
          aria-label={BANNER_LABELS.dismiss}
          onClick={onDismiss}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

export interface MountBannerOptions {
  theme?: Theme;
  /** Where to anchor the banner host (defaults to the page `body`). */
  target?: HTMLElement;
}

/**
 * Mount the breakage banner on the current tab and return a disposer. Retry
 * re-runs the adapter's `selfCheck()`: on a pass it disposes the banner and reports
 * the platform healthy (clearing degraded state); a still-failing retry leaves the
 * banner up. Dismiss disposes it for this session.
 */
export function mountBanner(
  adapter: PlatformAdapter,
  platform: PlatformId,
  opts: MountBannerOptions = {},
): () => void {
  const target = opts.target ?? document.body;
  let handle: MountHandle | null = null;

  const dispose = (): void => {
    handle?.dispose();
    handle = null;
  };

  const onRetry = (): void => {
    const check = adapter.selfCheck();
    if (check.ok) {
      dispose();
      void reportHealth(platform, check);
    }
  };

  handle = mount(target, h(Banner, { platform, onRetry, onDismiss: dispose }), {
    theme: opts.theme,
  });

  return dispose;
}
