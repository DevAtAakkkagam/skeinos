<!-- Thanks for contributing. Delete any section that doesn't apply. -->

## What this changes

<!-- One or two sentences. Link the issue if there is one: Fixes #123 -->

## Checks

- [ ] `npm run typecheck && npm run lint && npm test` pass (run from `extension/`)
- [ ] No new network requests, telemetry, or analytics
- [ ] No new permissions (or: justified below, with the adapter that needs it)
- [ ] No hardcoded user-facing strings — new copy has a key in `src/locales/en.ts`

## If this touches a platform config

- [ ] `configVersion` bumped
- [ ] Selectors avoid `aria-label` values, text matching, and generated/hashed classes
- [ ] Fixture re-recorded if needed, and **scrubbed of real conversation content,
      names, emails, and account identifiers**
- [ ] `npm test -- tests/adapter-<platform>.test.ts` passes

**Which site, and what visibly broke:**

<!-- Old selector → new selector, and roughly when the site changed. -->

## If this touches the UI

- [ ] Mounts in the shadow root, styles only from `--sk-*` tokens
- [ ] Keyboard-operable and ARIA-labelled
- [ ] `prefers-reduced-motion` honored for any animation
