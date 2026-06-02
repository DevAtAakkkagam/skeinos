## Why

The extension ships with **no branding icons**: `manifest.config.ts` declares no `icons`
block and no toolbar `action`, and the options page has no favicon. As a result the
extension renders with the browser's grey default puzzle-piece in the toolbar, the
`chrome://extensions` management page, and the Web Store listing — and the options tab
shows a blank favicon. A finished icon set already exists at
`~/Downloads/skeinos-icons/App Icons`; this change wires those assets into every standard
slot a Manifest V3 / WXT extension surfaces an icon.

## What Changes

- Add the Skeinos icon raster set (16/32/48/128) to `extension/src/public/icon/` so WXT
  auto-discovers them and populates `manifest.icons` (drives the install dialog,
  `chrome://extensions` page, Web Store, and the favicon of extension-owned pages).
- Add a toolbar `action` to the manifest (`default_title`, icon) so the extension shows a
  branded button in the browser toolbar. Click behaviour is **out of scope** here — the
  action is icon/title only for now (no popup, no command wiring).
- Add Firefox `theme_icons` (light/dark monochrome glyph variants) so the toolbar icon
  adapts to light and dark browser themes on the Firefox build.
- Add a favicon `<link>` to the options page (`entrypoints/options/index.html`) referencing
  a bundled icon, so the settings tab shows the Skeinos mark.
- Resize/derive any missing sizes (e.g. a 24px action icon) from the source PNGs as needed.

No behavioural, permission, or data-model changes — this is presentation only. No new host
or API permissions are requested (icons require none).

## Capabilities

### New Capabilities
<!-- None — icons attach to the existing extension package, not a new capability. -->

### Modified Capabilities
- `extension-shell`: adds a requirement that the built extension package declares branding
  icons in the manifest (extension `icons`, toolbar `action` icon, Firefox `theme_icons`)
  and that extension-owned pages reference a favicon. The existing "Installable MV3 build"
  and "CI package" requirements gain the expectation that the loaded extension presents the
  Skeinos icon rather than the browser default.

## Impact

- **Assets**: new `extension/src/public/icon/{16,32,48,128}.png` (+ optional `icon-24.png`,
  Firefox `theme_icons` glyph variants, options favicon) copied/resized from
  `~/Downloads/skeinos-icons/App Icons`.
- **Code**: `extension/src/manifest.config.ts` gains an `action` block and (for Firefox)
  `theme_icons`; `extension/src/entrypoints/options/index.html` gains a favicon `<link>`.
- **Build**: WXT regenerates `manifest.icons` from the discovered files; the CI zip artifact
  now bundles the `public/icon/` assets (the CI zip step already includes hidden files —
  commit `af49e02`).
- **Tests**: extend the manifest assertions to confirm `icons`, `action.default_icon`/`icons`
  fallback, and required sizes are present.
- **Permissions/privacy**: none — no new permissions, no network, no data flow.
