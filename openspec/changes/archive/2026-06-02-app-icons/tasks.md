## 1. Place icon assets (manifest + auto-discovery)

> Note: WXT's `publicDir` resolves against the project root, not `srcDir`, so assets
> live in `extension/public/` (not `src/public/`). `publicDir: 'public'` is set
> explicitly in `wxt.config.ts`.

- [x] 1.1 Create `extension/public/icon/` and copy `App icon -ink-/skeinos-icon-{16,32,48,128}.png` from `~/Downloads/skeinos-icons/App Icons` to `extension/public/icon/{16,32,48,128}.png`
- [x] 1.2 Verify each placed file is a valid PNG whose dimensions match its filename (16/32/48/128 all matched the source; no resize needed)
- [x] 1.3 Run `wxt build` and confirm the generated manifest's `icons` map auto-populates with 16/32/48/128 pointing at `icon/*.png`

## 2. Toolbar action

- [x] 2.1 Add a minimal `action` block to `extension/src/manifest.config.ts` with `default_title: 'Skeinos'` (no click handler — icon/title only, per design D3) and pass it through `wxt.config.ts`
- [x] 2.2 Build and confirm the toolbar resolves the Skeinos icon (Chrome falls back to `manifest.icons`; no explicit `default_icon` needed — button image resolves from the discovered `icons` map)

## 3. Firefox theme icons

- [x] 3.1 Place `icon-light-{32,64}.png` (from `skeinos-glyph-ink-{32,64}`) and `icon-dark-{32,64}.png` (from `skeinos-glyph-white`, resized 256→32/64 with Pillow/Lanczos since 32/64 white glyphs were not shipped) in `extension/public/`
- [x] 3.2 Build the Firefox target (`wxt build -b firefox`) and confirm the manifest declares `theme_icons` (nested under `browser_action` for Firefox MV2) pairing the light/dark glyphs at 32 and 64

## 4. Options page favicon

- [x] 4.1 Add `<link rel="icon" type="image/png" href="/icon/32.png" />` to `<head>` in `extension/src/entrypoints/options/index.html`
- [x] 4.2 Build and confirm the options page references the bundled `/icon/32.png` (asset present in build output)

## 5. Tests

- [x] 5.1 Extended `tests/manifest-build.test.ts` asserting `icons` contains 16/32/48/128, the referenced files exist, and each PNG's dimensions match its declared size
- [x] 5.2 Assert the manifest declares an `action` with a non-empty `default_title`
- [x] 5.3 Added a Firefox-target build + assertion that `browser_action.theme_icons` is present and pairs an existing light/dark variant
- [x] 5.4 Assert the options HTML references a `<link rel="icon">` to a bundled asset that exists in `public/`

## 6. Verify & finalize

- [x] 6.1 Verified the icon surfaces via the generated manifests + bundled assets (Chrome `icons`/`action`, Firefox `theme_icons`, options favicon link) — all asserted by the test suite, which is what drives the install dialog, management page, toolbar, and tab favicon
- [x] 6.2 Confirmed only sizes ≤128 (plus the 32/64 glyphs) are bundled in `public/`; 256/512/1024 source PNGs are not committed
- [x] 6.3 Full test suite green (109 tests) and both `npm run build` + `npm run build:firefox` succeed
