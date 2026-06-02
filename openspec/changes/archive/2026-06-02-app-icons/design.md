## Context

The extension is built with **WXT 0.20** (`extension/wxt.config.ts`), which generates the
per-browser MV3 manifest from `src/manifest.config.ts`. Today that config declares only
`name`, `description`, `host_permissions`, and `permissions` — no icons, no `action`. There
is no `src/public/` directory yet, so nothing is copied verbatim into the build output.

A complete icon set already exists at `~/Downloads/skeinos-icons/App Icons`:

- `App icon -ink-/` — full-colour app icon at **16, 32, 48, 64, 128, 256, 512, 1024** px.
- `Light tile/` — light-background variant at 256/512/1024.
- `Marketing -indigo-/` — marketing tile at 256/1024.
- `Monochrome glyph/` — `skeinos-glyph-ink-*` and `skeinos-glyph-white-*` at 32/64/256/512.
- `favicon.png` — 32×32.

Tooling: no `sharp`/ImageMagick, but **Pillow (PIL 12.1)** is available for any resize.

WXT auto-discovers icons from `src/public/` matching patterns including `icon/{size}.png`
and `icon-{size}.png`, and uses them to populate `manifest.icons`. Chrome falls back to
`manifest.icons` for the toolbar `action` image when `action.default_icon` is absent, so a
bare `action: {}` is enough to get a branded toolbar button. For Firefox, WXT auto-detects
paired `icon-light-{size}.png` / `icon-dark-{size}.png` and emits `theme_icons`.

## Goals / Non-Goals

**Goals:**
- The loaded extension presents the Skeinos icon in the install dialog, the
  `chrome://extensions` management page, the toolbar, and as the favicon of its own pages.
- Required manifest icon sizes (16/32/48/128) are present and valid.
- The Firefox build's toolbar icon adapts to light/dark themes.
- The approach relies on WXT auto-discovery so future size additions are drop-in.

**Non-Goals:**
- Wiring any click behaviour to the toolbar action (popup, command, overlay toggle) — the
  action is icon + title only. That belongs to a later UX change.
- Web Store / AMO listing artwork (screenshots, promo tiles) — those are store-console
  uploads, not repo assets, though the 128px icon doubles as the store icon.
- Re-skinning the in-progress sidebar/folders UI with a brand glyph — out of scope to avoid
  touching unstaged feature work.

## Decisions

**D1 — Use WXT public/ auto-discovery for `manifest.icons` rather than hand-writing the
`icons` map.** Drop `App icon -ink-` PNGs into `src/public/icon/{16,32,48,128}.png`. WXT
fills `manifest.icons` automatically and copies the files into the build output.
*Alternative:* explicitly set `manifest.icons` in `manifest.config.ts`. Rejected — explicit
entries override discovery, duplicate the size list, and are easy to desync from the files.

**D2 — Use the full-colour `App icon -ink-` set for `manifest.icons`/toolbar, the
`Monochrome glyph` set for Firefox `theme_icons`.** Coloured app icon for the store /
management / install surfaces (high recognition); monochrome glyph for the Firefox toolbar
where a single-colour mark that inverts with the theme is the platform convention
(`skeinos-glyph-ink` for light themes, `skeinos-glyph-white` for dark).

**D3 — Add a minimal `action` block (`default_title: "Skeinos"`), no `default_icon`.** Rely
on Chrome's documented fallback to `manifest.icons` for the toolbar button image, so we
don't maintain a second icon map. *Alternative:* set `action.default_icon` explicitly with
16/24/32 — only needed if we later want a toolbar-specific (e.g. monochrome) treatment on
Chrome; deferred.

**D4 — Source sizes are already sufficient; only derive what's missing.** 16/32/48/128 all
exist in `App icon -ink-`, so no resize is needed for the Chrome manifest. Generate
additional sizes (e.g. a 24px action icon, or `icon-light/dark` glyph sizes Firefox wants)
from the largest available PNG with Pillow + Lanczos only if a target size is absent.

**D5 — Options-page favicon via an explicit `<link rel="icon">` in `index.html`** pointing
at a bundled `/icon/32.png` (served from `public/`). WXT does inject the extension favicon
for generated pages, but an explicit link is unambiguous and testable.

## Risks / Trade-offs

- **[Firefox `theme_icons` filename mismatch]** WXT expects `icon-light-{size}` /
  `icon-dark-{size}`; the source glyphs are named `ink`/`white`. → Copy/rename glyph files
  to the WXT-expected names (ink→light, white→dark) when placing them in `public/`, and
  assert the generated `theme_icons` in the Firefox manifest test.
- **[Chrome action fallback not rendering]** If a browser version doesn't fall back to
  `manifest.icons` for the action image, the toolbar button could be blank. → If the
  Firefox/Chrome manifest test shows no action image, add an explicit `action.default_icon`
  (D3 alternative) — cheap, reversible.
- **[Icon files inflate the zip]** The 512/1024 source PNGs are large; only the needed sizes
  (≤128 for manifest, glyphs for theme) go into `public/`. Keep 256+ out of the bundle.
- **[Asset provenance]** Icons are copied from a local Downloads folder, not version-pinned.
  → Commit them into the repo so the build is reproducible from source control alone.

## Migration Plan

Purely additive presentation change. Deploy = include the new assets + manifest tweaks in
the build. Rollback = revert the commit (removes `public/icon/` and the `action`/favicon
lines); the extension returns to the default browser icon with no functional impact. No data
migration, no permission prompt change for existing users.

## Open Questions

- Should the Chrome toolbar icon eventually be the monochrome glyph (cleaner at 16px on busy
  toolbars) rather than the colour app icon? Deferred to the action-UX change.
- Does the team want a distinct "disabled/degraded" toolbar icon variant tied to adapter
  `selfCheck` failure (LLD §4.3)? Out of scope here; flagged for the resilience UX work.
