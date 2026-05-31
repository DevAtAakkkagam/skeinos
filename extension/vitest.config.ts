import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Match the extension's Preact JSX so .tsx test/components compile.
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    // Browser-mode tests (real Chromium) run via vitest.browser.config.ts.
    exclude: ['tests/browser/**', 'node_modules/**'],
  },
});
