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
  permissions: ['alarms', 'sidePanel'] as string[],
};
