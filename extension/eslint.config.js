import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import globals from 'globals';

// Flat config (ESLint 9/10). The repo is ESM (`"type": "module"`), so this file
// is loaded as an ES module.
export default tseslint.config(
  // Never lint generated output, deps, or coverage. `.wxt` and `.output` are
  // WXT build artifacts; `*.d.ts` includes generated WXT/Vite typings.
  {
    ignores: [
      '.wxt/**',
      '.output/**',
      'dist/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      '**/*.d.ts',
    ],
  },

  // Baseline JS + TypeScript recommended rules. `recommended` (not the
  // type-checked variant) keeps lint fast and decoupled from a full type build;
  // `tsc --noEmit` (npm run typecheck) already covers type correctness.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Source + tests: browser + web-extension runtime globals (`chrome`, etc.).
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.serviceworker,
      },
    },
    plugins: { 'react-hooks': reactHooks, react },
    rules: {
      // Preact uses the same hooks model as React, so these rules apply to our
      // shadow-DOM UI (PREACT guardrail).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Count identifiers referenced only inside JSX (`<Dialog/>`) as used, so
      // no-unused-vars doesn't false-positive on components. We use the
      // automatic JSX runtime (Preact), so `jsx-uses-react` isn't needed.
      'react/jsx-uses-vars': 'error',
      // Allow intentionally-unused args/vars when prefixed with `_`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Tests, build config, and scripts also run under Node and Vitest globals.
  {
    files: [
      'tests/**',
      'scripts/**',
      '*.config.ts',
      'vitest*.config.ts',
      'wxt.config.ts',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: {
      // Tests poke at dynamically-built artifacts (parsed manifests, mock
      // returns) where `any` is pragmatic; production code stays strict.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // i18n guard ([PREACT-7] / D-i18n-7): no hard-coded user-facing text in the shadow
  // DOM UI. Every visible string must come from a catalog via `t()`/`useT()`, so the
  // German pass and the ~40% pseudo-locale expansion are catalog work, not component
  // surgery. Scoped to `src/ui/**`; non-letter literals (punctuation, symbols,
  // separators) are allow-listed since they carry no translatable content, and props/
  // attributes are left to review (`noAttributeStrings` off) to avoid flagging the
  // structural `class`/`data-testid`/`role` plumbing.
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    plugins: { react },
    rules: {
      'react/jsx-no-literals': [
        'error',
        {
          allowedStrings: ['·', '•', '—', '–', '/', '✓', '⌘/', ':', '%', '+', '…', '↵', '↑', '↓'],
        },
      ],
    },
  },

  // Flag stale `eslint-disable` directives so they don't rot silently.
  {
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
  },
);
