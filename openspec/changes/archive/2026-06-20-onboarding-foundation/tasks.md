## 1. Settings schema

- [x] 1.1 Add `onboardingCompleted: boolean` and `domain?: DomainId` to the `Settings`
      interface in `shared/settings.ts` (import `DomainId` from `./domains`); document them as
      additive optional keys that fall back on read.
- [x] 1.2 Add `onboardingCompleted: false` to `DEFAULT_SETTINGS` (leave `domain` absent so it
      defaults to undefined); confirm `core/settings/index.ts` needs no change (the fields ride
      the existing `{ ...DEFAULT_SETTINGS, ...stored }` merge).

## 2. Onboarding gate (UI module)

- [x] 2.1 Create `ui/onboarding/gate.ts`: an `isOnboardingComplete(settings)` selector and an
      async `completeOnboarding()` writer that sets `onboardingCompleted: true` via `setSettings`.
- [x] 2.2 Create `ui/onboarding/OnboardingSurface.tsx`: a minimal `.sk-shell` placeholder with a
      title/body and one "Get started" button wired to `completeOnboarding()`; strings in an
      i18n-ready `STR` const; mark in code as temporary (replaced by `onboarding-flow`).

## 3. Side-panel router branch

- [x] 3.1 In `SidePanelApp.tsx`, resolve onboarding state from settings (`getSettings` +
      `subscribeSettings`), tracking an unresolved (`undefined`) phase distinct from
      complete/not-complete.
- [x] 3.2 Add the router branch ABOVE the existing platform branch: render `<OnboardingSurface/>`
      when resolved and not complete; render nothing/neutral while unresolved; otherwise fall
      through to the existing `platform == null ? empty : SidebarShell` logic.
- [x] 3.3 Ensure completing onboarding re-scopes the panel live via the `subscribeSettings`
      subscription (no reload), and dispose the subscription on unmount.

## 4. Tests (authored by a sub agent)

- [x] 4.1 Settings defaults: fresh read yields `onboardingCompleted === false` and `domain`
      undefined; a stored object missing the keys falls back without dropping other keys; a
      written `onboardingCompleted`/`domain` round-trips.
- [x] 4.2 Gate helpers: `isOnboardingComplete` reflects the flag; `completeOnboarding` writes
      `onboardingCompleted: true` through `setSettings`.
- [x] 4.3 Panel branch precedence: not-complete renders the onboarding surface with AND without a
      supported tab (never the empty/workspace branch); complete + supported tab renders the
      workspace; unresolved renders neither (no flash).
- [x] 4.4 Live re-scope: invoking the surface's action marks onboarding complete and the panel
      leaves the onboarding surface without a reload; completion persists across a reload.

## 5. Verification

- [x] 5.1 Run `npm run typecheck` and `npm test`; then `npm run test:browser` for the panel
      branch if it touches shadow-DOM mounting.
