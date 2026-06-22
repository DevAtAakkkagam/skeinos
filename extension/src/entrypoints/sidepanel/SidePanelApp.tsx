// The side-panel root: a single global extension document that scopes itself to
// the platform of the *active tab*. It reads only the active tab's URL (via the
// existing host permissions — never page content) and maps it to a platform with
// `matchPlatform`, re-resolving whenever the active tab changes or navigates
// (`tabs.onActivated` / `tabs.onUpdated`). With a supported host active it mounts
// the `SidebarShell`; once an onboarded user's active tab resolves to an
// unsupported host it closes the panel (it cannot show a workspace there). The
// neutral "open a supported chat" prompt remains as the brief still-resolving
// placeholder and the pre-onboarding fallback (design D3).
//
// Imports `matchPlatform` from its leaf module (not the adapters barrel) so the
// panel pulls in the host-match table without dragging in the adapter runtime.

import { useEffect, useState } from 'preact/hooks';
import { matchPlatform } from '../../adapters/runtime/host-match';
import { ChatIcon } from '../../ui/components/Icon';
import { SidebarShell } from '../../ui/sidebar/SidebarShell';
import { OnboardingSurface } from '../../ui/onboarding/OnboardingSurface';
import { isOnboardingComplete } from '../../ui/onboarding/gate';
import { getSettings, subscribeSettings } from '../../core/settings';
import { extApi } from '../../core/platform/ext-api';
import type { PlatformId } from '../../shared/types';

const STR = {
  emptyTitle: 'Open a supported chat',
  emptyBody: 'Skeinos works alongside Claude, Gemini, and Perplexity. Open one of those tabs to see your workspace here.',
} as const;

interface TabLike {
  url?: string;
}
interface TabsApi {
  query?: (q: { active: boolean; lastFocusedWindow: boolean }) => Promise<TabLike[]>;
  onActivated?: { addListener(cb: () => void): void; removeListener(cb: () => void): void };
  onUpdated?: { addListener(cb: () => void): void; removeListener(cb: () => void): void };
}

function tabsApi(): TabsApi | undefined {
  return extApi<{ tabs?: TabsApi }>()?.tabs;
}

/** Resolve the active tab's platform, or `null` when no supported host is active.
 *  Guarded so a non-extension context (tests without a chrome shim) is null. */
export async function resolveActivePlatform(): Promise<PlatformId | null> {
  const tabs = tabsApi();
  if (!tabs?.query) return null;
  const result = await tabs.query({ active: true, lastFocusedWindow: true });
  const url = result[0]?.url;
  return url ? matchPlatform(url) : null;
}

export function SidePanelApp() {
  // `undefined` = not yet resolved; `null` = resolved, no supported host.
  const [platform, setPlatform] = useState<PlatformId | null | undefined>(undefined);
  // `undefined` = onboarding state not yet resolved from storage; treat as "don't
  // render onboarding yet" so a returning, onboarded user never flashes first-run
  // UI (design D-4, "unresolved" risk).
  const [onboarded, setOnboarded] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const update = () => {
      void resolveActivePlatform().then((p) => {
        if (live) setPlatform(p);
      });
    };
    update();
    // Re-scope when the user switches tabs or the active tab navigates.
    const tabs = tabsApi();
    tabs?.onActivated?.addListener(update);
    tabs?.onUpdated?.addListener(update);
    return () => {
      live = false;
      tabs?.onActivated?.removeListener(update);
      tabs?.onUpdated?.removeListener(update);
    };
  }, []);

  // Close the panel once the active tab resolves to an unsupported host: the side
  // panel is global to the window, so without this it would linger over a tab whose
  // workspace it cannot show. Keyed on the same `platform` state that drives the
  // empty state below — that signal updates on the very first tab switch, so this
  // closes immediately rather than a switch late. `window.close()` is the only way
  // to dismiss a side panel (there is no `chrome.sidePanel.close()`).
  //
  // Firefox is EXEMPT: it has no native global side panel (the `sidePanel` API is
  // Chromium-only — see background/sidePanel.ts), so there is nothing to dismiss and
  // auto-closing would just kill the user's open Skeinos view. There the panel stays
  // put and falls through to the neutral "open a supported chat" empty state below.
  //
  // Strict `=== null` (not `== null`) so the initial `undefined` "still resolving"
  // value never closes the panel mid-open. Gated on `onboarded` so the platform-
  // independent first-run flow can still show on any tab.
  useEffect(() => {
    if (import.meta.env.BROWSER === 'firefox') return;
    if (onboarded === true && platform === null) window.close();
  }, [onboarded, platform]);

  useEffect(() => {
    let live = true;
    // Read the persisted gate on mount (survives worker/panel reload — [SW]) …
    void getSettings().then((s) => {
      if (live) setOnboarded(isOnboardingComplete(s));
    });
    // … and re-scope live when it changes, so completing onboarding in this panel
    // (or anywhere) leaves the onboarding surface without a reload (D-3).
    const dispose = subscribeSettings((s) => {
      if (live) setOnboarded(isOnboardingComplete(s));
    });
    return () => {
      live = false;
      dispose();
    };
  }, []);

  // Onboarding branch sits ABOVE the platform branch (D-4): it is platform-
  // independent and must show even when no supported tab is active. While the
  // gate is still resolving (`undefined`) render nothing to avoid a flash.
  if (onboarded === undefined) return null;
  // Pass the resolved platform so the get-started step can scope the first folder
  // to it (D-5). `undefined` (still resolving) collapses to `null` — the surface
  // simply hides the create-folder action until a supported host is known.
  if (!onboarded) return <OnboardingSurface platform={platform ?? null} />;

  if (platform == null) {
    // Neutral prompt for both "still resolving" and "no supported tab" — either
    // way there is no platform to scope folder data to yet.
    // Wrap in `.sk-shell` so the empty state sits on the same themed full-height
    // surface as the populated view — otherwise it paints no background and the
    // panel falls through to the document's default white (invisible title text
    // in dark mode).
    return (
      <div class="sk-shell">
        <div class="sk-empty" data-testid="sk-panel-empty">
          <div class="sk-empty__icon" aria-hidden="true"><ChatIcon size={40} /></div>
          <p class="sk-empty__title">{STR.emptyTitle}</p>
          <p class="sk-empty__body">{STR.emptyBody}</p>
        </div>
      </div>
    );
  }

  return <SidebarShell platform={platform} />;
}
