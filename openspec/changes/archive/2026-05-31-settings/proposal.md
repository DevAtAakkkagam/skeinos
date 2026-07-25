## Why

The extension needs durable user preferences (theme, per-platform toggles, telemetry opt-in, sync on/off) and an options page to surface them. Per D4 these live in `chrome.storage.local`, which decouples settings from the IndexedDB workspace store — so this change (M0 task T0.5) lands in parallel with `workspace-store` and `messaging`, right after bootstrap.

## What Changes

- Add a typed settings module backed by `chrome.storage.local` (not IndexedDB — D4), with a defined `Settings` schema and defaults.
- Bake the privacy stance into the defaults: **telemetry off**, **theme = system** (§8.3).
- Provide typed `getSettings` / `setSettings(partial)` accessors and a change subscription via `chrome.storage.onChanged` so open UI updates live.
- Add the WXT **options page** entrypoint — a skeleton that opens, reads current settings, and persists a theme change across reloads.

## Capabilities

### New Capabilities
- `settings`: the `chrome.storage.local`-backed settings store (typed schema, privacy-first defaults, typed accessors, change notifications) and the options-page entry that reads and persists them.

### Modified Capabilities
<!-- None — greenfield; the options page is new and ui-shell tokens are consumed, not changed. -->

## Impact

- **New module** `extension/src/core/settings/` (or `shared/settings`) + a WXT options entrypoint.
- **No new dependencies**; uses `chrome.storage.local` / `onChanged`.
- **No IndexedDB dependency** (D4) — explicitly independent of `workspace-store` and of `messaging`.
- **Tested** with Vitest over a mocked `chrome.storage.local` (defaults, persistence, `onChanged`); the options page opening + theme persistence is verified in the browser/e2e lane.
- **Downstream**: the options page is the surface that `shortcuts` (T3.7), `sync-ui` (T5.5), and per-platform toggles fill in later — they extend this skeleton rather than create it.
