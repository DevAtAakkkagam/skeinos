import { defineConfig } from 'wxt';
import { skeinosManifest } from './src/manifest.config';

// WXT generates the per-browser MV3 manifest. Background + content entries live
// in src/entrypoints/; everything else (ui, core, adapters) is plain modules.
export default defineConfig({
  srcDir: 'src',
  // Icons/assets live in <root>/public (WXT's default publicDir resolves against the
  // project root, not srcDir). Stated explicitly so the icon auto-discovery is obvious.
  publicDir: 'public',
  manifest: ({ browser }) => ({
    name: skeinosManifest.name,
    description: skeinosManifest.description,
    // Branded toolbar button; the extension `icons` map and (Firefox) `theme_icons`
    // are auto-discovered by WXT from src/public/icon/*.png and icon-light/icon-dark-*.png.
    action: skeinosManifest.action,
    host_permissions: skeinosManifest.host_permissions,
    // `sidePanel` is a Chromium-only permission (Firefox uses `sidebar_action` and
    // rejects the whole manifest if it's present). Drop it on the Firefox target so
    // the build installs cleanly; the native side panel is a Chromium feature anyway.
    permissions: skeinosManifest.permissions.filter((p) =>
      browser === 'firefox' ? p !== 'sidePanel' : true,
    ),
    // Firefox (AMO) needs a stable add-on id so updates map to the same listing.
    // Set it explicitly rather than letting Mozilla auto-assign one on first upload,
    // since the id is permanent once published. Chromium ignores this block.
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'skeinos@aakkagam.com',
              // Firefox data-consent declaration (required for new AMO versions).
              // `required: ['none']` and NO optional entry: Skeinos collects
              // nothing, on any tier, with or without consent — the diagnostics
              // stream was deleted outright (remove-observability, supersedes D29),
              // so there is no optional technical data left to declare.
              // Mirrors docs/STORE_DATA_USE.md / the Chrome data disclosure.
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
  hooks: {
    // Firefox renders its OWN sidebar chrome (a header with the icon + title) from
    // `sidebar_action`. WXT auto-generates that block (default_panel/default_title)
    // from the sidepanel entrypoint *after* the manifest factory above runs, so a
    // `default_icon` set there is overwritten and the sidebar header showed the
    // "Skeinos" text with no icon. Inject the brand icon into the final manifest
    // here. Chromium's side panel has no such header, so this is Firefox-only.
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.browser === 'firefox' && manifest.sidebar_action) {
        manifest.sidebar_action.default_icon = { 16: 'icon/16.png', 32: 'icon/32.png' };
      }
    },
  },
  // Compile JSX to Preact (decision D3) without pulling in a React-compat layer.
  vite: () => ({
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  }),
});
