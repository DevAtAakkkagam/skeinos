// Single source of truth for the host surface area. Kept tiny and auditable:
// host permissions cover the P0 launch platforms ONLY (PRD §5), with no broad
// access and no credential-bearing permissions (PRD §8.3-8.4, decision D6).

export const P0_MATCHES = [
  '*://claude.ai/*',
  '*://gemini.google.com/*',
  '*://*.perplexity.ai/*',
] as const;

export const skeinosManifest = {
  name: 'Skeinos',
  description: 'A unified workspace layer for your LLM chats.',
  // Branded toolbar button. Icon-only for now (no popup/command wiring — that is a
  // later UX change); Chrome falls back to the extension `icons` set (auto-discovered
  // by WXT from src/public/icon/*.png) for the toolbar image, so no `default_icon` is
  // declared here. The `icons` map and Firefox `theme_icons` are likewise populated by
  // WXT's public/ discovery (icon/{size}.png and icon-light/icon-dark-{size}.png).
  action: { default_title: 'Skeinos' },
  host_permissions: [...P0_MATCHES],
  // `alarms` powers the adapter-resilience canary watchdog (LLD §4.3): a durable,
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
  // telemetry, and later per-platform toggles. Without it `chrome.storage` is
  // undefined, so settings writes silently no-op and never persist, and the
  // `storage.onChanged` live-update bus never fires (e.g. the side panel would
  // not re-theme when the options page changes the theme).
  permissions: ['alarms', 'sidePanel', 'scripting', 'storage'] as string[],
};
