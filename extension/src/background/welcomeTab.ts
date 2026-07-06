// Open the welcome page in a new tab on first install (install-welcome).
//
// A freshly-installed extension does nothing visible until the user happens onto
// a supported site and finds the panel — and on Chrome the toolbar icon is
// disabled off the four hosts, so clicking it does nothing and the extension
// reads as broken. This module closes that gap: on `onInstalled` with reason
// `install`, it opens `welcome.html` — a browser-specific getting-started guide.
//
// Trigger is `install` ONLY, never `update` (no "what's new" nag). A `welcomeShown`
// settings flag makes it idempotent: an unpacked dev *reload* also fires
// `onInstalled` with reason `install`, so without the guard the tab would reopen
// on every reload. The page is a decoupled signpost — it never touches
// `onboardingCompleted`; the in-panel stepper still runs on the first P0 visit.

import { extApi } from '../core/platform/ext-api';
import { getSettings, setSettings } from '../core/settings';

const WELCOME_PAGE = 'welcome.html';

interface RuntimeApi {
  getURL?(path: string): string;
  onInstalled?: { addListener(cb: (details: { reason?: string }) => void): void };
}
interface TabsApi {
  create?(props: { url: string }): Promise<unknown> | void;
}

function runtimeApi(): RuntimeApi | undefined {
  return extApi<{ runtime?: RuntimeApi }>()?.runtime;
}
function tabsApi(): TabsApi | undefined {
  return extApi<{ tabs?: TabsApi }>()?.tabs;
}

/** Open the welcome tab once, guarded by the `welcomeShown` flag. Best-effort:
 *  any failure (no `tabs`/`runtime`, storage error) is logged, never fatal —
 *  onboarding does not depend on this. */
export async function openWelcomeOnce(): Promise<void> {
  const runtime = runtimeApi();
  const tabs = tabsApi();
  if (!runtime?.getURL || !tabs?.create) return;

  try {
    const settings = await getSettings();
    if (settings.welcomeShown) return; // already shown (e.g. a dev reload).
    // Set the guard before opening so a re-entrant install event can't double-open.
    await setSettings({ welcomeShown: true });
    await tabs.create({ url: runtime.getURL(WELCOME_PAGE) });
  } catch (err) {
    console.warn('[Skeinos] openWelcomeOnce failed', err);
  }
}

/** Register the install hook. Top-level side effect (SW-3): the listener must
 *  exist before the `onInstalled` event the worker is woken to deliver. */
export function registerWelcomeTab(): void {
  const installed = runtimeApi()?.onInstalled;
  if (!installed) return;
  installed.addListener((details) => {
    // Only a genuine first install opens the welcome tab; `update` and the various
    // browser/module updates do not (no re-onboarding, no "what's new" nag).
    if (details.reason === 'install') void openWelcomeOnce();
  });
}
