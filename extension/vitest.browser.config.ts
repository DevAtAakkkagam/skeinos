import { defineConfig } from 'vitest/config';

// Real-browser tests for guarantees a DOM emulator cannot make: shadow-DOM style
// encapsulation and CSS custom-property (token) resolution. Drives the system
// Chrome via Playwright's `chrome` channel — no browser download required.
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  test: {
    include: ['tests/browser/**/*.browser.test.{ts,tsx}'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      // Use the system Chrome via Playwright's channel — no browser download.
      instances: [{ browser: 'chromium', launch: { channel: 'chrome' } }],
    },
  },
});
