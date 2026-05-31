import { defineConfig } from 'wxt';
import { skeinosManifest } from './src/manifest.config';

// WXT generates the per-browser MV3 manifest. Background + content entries live
// in src/entrypoints/; everything else (ui, core, adapters) is plain modules.
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: skeinosManifest.name,
    description: skeinosManifest.description,
    host_permissions: skeinosManifest.host_permissions,
    permissions: skeinosManifest.permissions,
  },
  // Compile JSX to Preact (decision D3) without pulling in a React-compat layer.
  vite: () => ({
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  }),
});
