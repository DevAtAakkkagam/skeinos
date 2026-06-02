import { defineConfig } from 'wxt';
import { skeinosManifest } from './src/manifest.config';

// WXT generates the per-browser MV3 manifest. Background + content entries live
// in src/entrypoints/; everything else (ui, core, adapters) is plain modules.
export default defineConfig({
  srcDir: 'src',
  // Icons/assets live in <root>/public (WXT's default publicDir resolves against the
  // project root, not srcDir). Stated explicitly so the icon auto-discovery is obvious.
  publicDir: 'public',
  manifest: {
    name: skeinosManifest.name,
    description: skeinosManifest.description,
    // Branded toolbar button; the extension `icons` map and (Firefox) `theme_icons`
    // are auto-discovered by WXT from src/public/icon/*.png and icon-light/icon-dark-*.png.
    action: skeinosManifest.action,
    host_permissions: skeinosManifest.host_permissions,
    permissions: skeinosManifest.permissions,
  },
  // Compile JSX to Preact (decision D3) without pulling in a React-compat layer.
  vite: () => ({
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  }),
});
