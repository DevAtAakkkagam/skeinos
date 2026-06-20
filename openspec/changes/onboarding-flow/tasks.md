## 1. Gate helper

- [ ] 1.1 Add `setOnboardingDomain(domain: DomainId)` to `ui/onboarding/gate.ts` (writes
      `Settings.domain` via `setSettings`); keep `isOnboardingComplete`/`completeOnboarding`.

## 2. Stepper shell

- [ ] 2.1 Convert `OnboardingSurface.tsx` from the single placeholder into a 4-step stepper:
      local `step` state (0..3), an ordered step list, a progress-dots indicator bound to the
      current step, and shared `next`/`back` handlers. Preserve the `onComplete` prop and mount
      point so the foundation's branch/precedence/no-flash behavior is unchanged.
- [ ] 2.2 Move all step copy into the i18n-ready `STR` const(s) and grow `ui/onboarding/styles.ts`
      to cover the new steps (cards, badges, picker, confirmation), tokens only.

## 3. Step 1 — Welcome

- [ ] 3.1 Keep the existing welcome content (hero + two privacy cards). Footer: "I already have an
      account" → `completeOnboarding()` (skip); "Get started ›" → `next` (does NOT complete).

## 4. Step 2 — Permissions priming (informational)

- [ ] 4.1 Render a static per-platform list (claude.ai, gemini.google.com, perplexity.ai) with
      icon, what-it's-for/what-it-isn't copy, and a "Read & type" badge, plus the per-site /
      revocable / no-credentials / no-content assurance. No `chrome.permissions` call, no prompt.
      Footer: "Back" → `back`; "Continue ›" → `next`.

## 5. Step 3 — Starter library (domain picker → seed → confirm)

- [ ] 5.1 Render the `DOMAIN_REGISTRY` choices. On select: call `installPromptSeedsRemote(domain)`,
      call `setOnboardingDomain(domain)`, transition to the confirmation sub-state.
- [ ] 5.2 Confirmation sub-state: show the installed count from the install reply (never
      hard-coded) and a sample of seeded prompt titles. Footer: "Browse library" (alt) +
      "Continue ›" → `next`. Surface a non-blocking error + retry if the install fails (gate not
      yet complete, so nothing is lost; install is idempotent).

## 6. Step 4 — Get started

- [ ] 6.1 Render "Create your first folder" and "Open a platform" action cards + "Finish setup".
- [ ] 6.2 Wire "Create your first folder" to the `folder.create` workspace mutation, then
      `completeOnboarding()`.
- [ ] 6.3 Wire "Open a platform" to open a P0 host tab (reuse the `openConversation`/
      `platformOrigin` tab pattern), then `completeOnboarding()`.
- [ ] 6.4 Wire "Finish setup" to `completeOnboarding()`.

## 7. Remove temporary seed affordance

- [ ] 7.1 Remove the "Add starter prompts" control + its strings from `ui/prompts/PromptsPanel.tsx`
      / `strings.ts`; keep the `installSeeds` controller method and the worker `prompts.install`
      path (now driven by onboarding).

## 8. Tests (authored by a sub agent)

- [ ] 8.1 Stepper navigation: starts on welcome; "Get started"/"Continue" advance through the four
      steps in order; "Back" returns; progress indicator tracks the step; none of these complete
      onboarding.
- [ ] 8.2 Completion timing: only the welcome skip and the final-step actions call the completion
      writer; intermediate navigation does not.
- [ ] 8.3 Permissions priming: lists the three P0 hosts with per-site copy; advancing triggers no
      `chrome.permissions`/permission request.
- [ ] 8.4 Starter library: selecting a domain calls the install client with that domain, persists
      `Settings.domain`, and renders the count from the (stubbed) install reply; re-selecting an
      already-installed domain shows zero inserted and adds no duplicates; install failure shows a
      retryable error and does not complete the gate.
- [ ] 8.5 Get-started actions: "Create your first folder" issues `folder.create` then completes;
      "Open a platform" opens a platform tab then completes; "Finish setup" completes.
- [ ] 8.6 Regression: removing the PromptsPanel affordance leaves the prompts panel and the
      `installSeeds`/`prompts.install` path working.

## 9. Verification

- [ ] 9.1 Run `npm run typecheck` and `npm test`; then `npm run test:browser` for the onboarding
      surface (shadow-DOM mount of the stepper).
