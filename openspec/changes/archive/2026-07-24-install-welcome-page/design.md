## Context

Onboarding today lives entirely inside the side panel (`OnboardingSurface`), which only surfaces on the four supported hosts — and on Chrome the toolbar icon is disabled per-tab everywhere else (`sidePanel.ts` `syncTab`). So right after a store install, a user who is not already on a supported site sees nothing and cannot open the panel. `chrome.sidePanel` cannot help: it is Chromium-only and cannot be opened programmatically without a user gesture. The portable fix that works in Chrome and Firefox is to open a normal extension page in a new tab on first install. The `onInstalled` plumbing already exists (`background/injectOpenTabs.ts`).

## Goals / Non-Goals

**Goals:**
- Orient a brand-new user to where Skeinos lives in *their* browser, and pre-empt the "clicked the icon, nothing happened" confusion on Chrome.
- Work identically in Chrome and Firefox with no new permissions.
- Be diagram-led and jargon-free; reuse the existing shadow-DOM mount, theme tokens, and i18n so it never diverges from the rest of the UI.

**Non-Goals:**
- Not a second store listing or a marketing page; value-prop selling stays on the website/store.
- Not onboarding: it does not seed the library, create folders, or complete the onboarding gate.
- No runtime browser detection, no analytics on the page, no new host permissions.

## Decisions

- **Decoupled signpost, not a merged onboarding flow.** The welcome tab never writes `onboardingCompleted`; the in-panel stepper is untouched. *Alternatives:* (b) a "front door" that sets a flag to skip the panel's welcome step, and (c) moving the whole flow into the tab. Both were rejected: (c) loses the folder-create step's active-platform context and is a large refactor; (b) adds cross-surface coupling for little gain. The signpost is lowest-risk and matches the actual need. Double-"welcome" is avoided by voice: the tab is orientation, the panel is a setup wizard.

- **Open in a new tab on `onInstalled` (reason `install` only), guarded by `welcomeShown`.** An unpacked dev reload also fires `install`; the device-local flag makes the open once-per-user. The guard is set *before* `tabs.create` so a re-entrant event cannot double-open. *Alternative:* open on `update` too for a "what's new" — rejected as nagging.

- **Browser variant chosen at build time via `import.meta.env.BROWSER`.** WXT emits a separate bundle per browser, so the Chrome build ships the toolbar illustration + the "only opens on the four sites" caveat, and the Firefox build ships the sidebar illustration — with zero runtime user-agent sniffing. This mirrors the existing `SidePanelApp` usage of the same flag.

- **Diagram over prose.** The load-bearing block is a hand-built SVG of the user's own browser pointing at the exact spot (toolbar icon vs sidebar button), plus a 3-step flow woven by the skein thread. Illustrations are inline SVG in `--sk-*` tokens (no raster assets, no bundle-size hit, correct theming). *Alternative:* embed the website screenshots — rejected (~700 KB bundled and closer to the SaaS-landing lane PRODUCT.md flags as an anti-reference).

- **Reuse the shared bootstrap.** The entrypoint mounts through `ui/mount` (shadow root + fonts + theme) and `ensureLocale`, exactly like the options page, and injects a `WELCOME_CSS` string into the shadow root (like `ONBOARDING_CSS`). All copy is the new `welcome.*` i18n namespace across en/de/fr/es/pt; the completeness test enforces parity.

## Risks / Trade-offs

- **Firefox behavior differs and was only smoke-tested on the Chromium build here.** → The Firefox sidebar is global (not per-tab-gated), so the Chrome caveat is intentionally omitted there; verify the open-on-install + sidebar illustration on a real Firefox profile before release.
- **`welcomeShown` is device-local and never syncs.** → Intended: a new device should get the orientation once. No migration risk (additive optional key, defaults to `false`).
- **`onInstalled` fires in the worker, which may cold-start.** → The listener is registered as a top-level side effect in `background/index.ts` (SW-3), so it exists before the event is delivered; the handler only reads/writes `chrome.storage.local` and calls `tabs.create`, all worker-safe.
- **Illustration is stylized, not a pixel-accurate browser.** → Acceptable: it points at the right region (toolbar top-right / sidebar top-left) with a labeled arrow; realism is not the goal, recognizability is.

## Migration Plan

Additive only. Ship the new entrypoint + background hook + settings key + locale keys together. No data migration (the `welcomeShown` key defaults via the settings merge). Rollback = remove the `registerWelcomeTab()` call; the orphaned `welcome.html` is harmless and unreferenced.
