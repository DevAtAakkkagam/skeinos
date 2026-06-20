// The side-panel root: a single global extension document that scopes itself to
// the platform of the *active tab*. It reads only the active tab's URL (via the
// existing host permissions — never page content) and maps it to a platform with
// `matchPlatform`, re-resolving whenever the active tab changes or navigates
// (`tabs.onActivated` / `tabs.onUpdated`). With a supported host active it mounts
// the `SidebarShell`; otherwise it shows a neutral "open a supported chat" prompt
// rather than stale or wrong-platform data (design D3).
//
// Imports `matchPlatform` from its leaf module (not the adapters barrel) so the
// panel pulls in the host-match table without dragging in the adapter runtime.

import { useEffect, useState } from 'preact/hooks';
import { matchPlatform } from '../../adapters/runtime/host-match';
import { ChatIcon } from '../../ui/components/Icon';
import { SidebarShell } from '../../ui/sidebar/SidebarShell';
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
  return (globalThis as { chrome?: { tabs?: TabsApi } }).chrome?.tabs;
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
