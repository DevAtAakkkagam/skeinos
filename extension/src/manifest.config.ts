// Host surface area, derived from the SINGLE platform source of truth: the host
// permissions are exactly the `hostMatch` of each bundled adapter config, so a
// platform that ships an adapter gets (only) its host here automatically and one
// that is removed loses it — no hand-maintained second list to drift. This keeps
// the surface tiny and auditable: every entry traces to a shipped adapter, with no
// broad access and no credential-bearing permissions (decision D6).
import { BUNDLED_CONFIGS } from './adapters/configs';

export const P0_MATCHES: readonly string[] = Object.values(BUNDLED_CONFIGS).flatMap(
  (config) => config?.hostMatch ?? [],
);

export const skeinosManifest = {
  name: 'Skeinos',
  // This is not just the chrome://extensions blurb: the Chrome Web Store renders it
  // as the listing's read-only "Summary from package" (max 132 chars) and AMO seeds
  // the add-on summary from it, so it is store copy and must match the tagline at the
  // top of docs/STORE_LISTING.txt. Neither store lets you edit it in the dashboard —
  // changing it requires shipping a new version.
  description:
    'Folders, search, and a prompt library for Claude, ChatGPT, Gemini & Perplexity. Open source, local-first, no account.',
  // Branded toolbar button. Icon-only for now (no popup/command wiring — that is a
  // later UX change). `default_icon` is declared explicitly: Chrome would fall back to
  // the extension `icons` set, but Firefox does NOT — its `browser_action` renders
  // nothing when only `theme_icons` is present, so the toolbar icon was blank in
  // Firefox. `theme_icons` then overrides the default per light/dark theme. The
  // `icons` map and Firefox `theme_icons` are populated by WXT's public/ discovery
  // (icon/{size}.png and icon-light/icon-dark-{size}.png).
  action: {
    default_title: 'Skeinos',
    default_icon: {
      16: 'icon/16.png',
      24: 'icon/24.png',
      32: 'icon/32.png',
    },
  },
  host_permissions: [...P0_MATCHES],
  // `alarms` powers the adapter-resilience canary watchdog: a durable,
  // worker-death-surviving schedule that re-surfaces a degraded platform within
  // 24h. `sidePanel` lets the workspace UI render in the browser's native side
  // panel (the `side-panel` change), opened from the toolbar action and enabled
  // per supported host — it grants no host access and no credentials.
  //
  // Scoping the panel to the active tab's platform reads only the active tab's
  // *URL* (never page content). That read is already covered by the existing
  // `host_permissions` above — Chrome exposes `tab.url` for tabs whose URL the
  // extension already has host access to — so NO `tabs`/`activeTab` permission is
  // added: unsupported tabs simply report no URL and the panel shows its neutral
  // state. This is the minimum permission surface (spec: "minimum required"),
  // keeping the privacy-first posture intact. Anything added later must be
  // justified against that posture and store review.
  //
  // `scripting` lets the worker inject the content script into supported tabs that
  // were ALREADY OPEN when the extension is installed/updated (content scripts
  // otherwise only auto-inject on a fresh page load). It grants no new host reach —
  // injection is still bounded by the `host_permissions` above, so it can only run
  // on the three P0 hosts — and carries no credentials. Without it, a user's open
  // Claude/Gemini/Perplexity chats stay un-indexed until they manually reload each
  // tab, breaking the "your open chats just appear" promise.
  //
  // `storage` backs `chrome.storage.local`, the settings store (D4): theme,
  // onboarding state, and later per-platform toggles. Without it `chrome.storage` is
  // undefined, so settings writes silently no-op and never persist, and the
  // `storage.onChanged` live-update bus never fires (e.g. the side panel would
  // not re-theme when the options page changes the theme).
  permissions: ['alarms', 'sidePanel', 'scripting', 'storage'] as string[],
};
