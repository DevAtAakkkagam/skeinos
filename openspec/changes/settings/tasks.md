## 1. Settings module

- [ ] 1.1 Define the typed `Settings` schema + `DEFAULT_SETTINGS` (telemetry off, theme system) in `shared/`
- [ ] 1.2 Implement `getSettings()` (defaults merged with the stored partial) and `setSettings(partial)` over `chrome.storage.local`
- [ ] 1.3 Implement `subscribeSettings(handler): dispose` via `chrome.storage.onChanged`

## 2. Options page

- [ ] 2.1 Add the WXT options entrypoint mounting a Preact skeleton that reuses the `ui-shell` theme tokens
- [ ] 2.2 Render current settings and a theme control wired to `setSettings`

## 3. Tests

- [ ] 3.1 Defaults: a fresh read returns telemetry off + theme system (spec: settings)
- [ ] 3.2 Persistence: a `setSettings` value survives a simulated reload; a partial store falls back to defaults for missing keys
- [ ] 3.3 `onChanged`: a subscriber fires with the updated settings
- [ ] 3.4 Options page opens and persists a theme change (browser/e2e lane)
