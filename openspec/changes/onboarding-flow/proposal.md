## Why

`onboarding-foundation` shipped the first-run gate and a single placeholder welcome screen.
The D17 flow itself — the four screens in `docs/design/Screens Export/01 Onboarding/` (welcome,
permissions priming, starter-library seeding, get-started) — is still missing. This change
replaces the placeholder with the real multi-step onboarding stepper, turning the foundation's
gate into the product's actual first-run experience and completing PRD §6.12 / LLD T3.6 (D17).

## What Changes

- Replace the single-screen `OnboardingSurface` with a **4-step stepper** matching the design
  screens, sharing the same mount point and gate contract the foundation established:
  1. **Welcome** — brand hero, the two privacy assurances (local-first / metadata-only). Footer:
     "I already have an account" (skips to completion) + "Get started ›" (advances).
  2. **Permissions priming** — **informational only** (Option A: no manifest change, no
     `chrome.permissions.request()`). Lists the three P0 hosts (claude.ai, gemini.google.com,
     perplexity.ai) with a per-site "what it's for / what it isn't" line and a "Read & type"
     badge, plus the "per-site, revocable, no credentials, no content sent" assurance. Footer:
     "Back" + "Continue ›".
  3. **Starter library** — a **domain picker** sourced from `DOMAIN_REGISTRY`; choosing a domain
     installs that domain's seeds via the existing `installPromptSeedsRemote(domain)` (idempotent),
     persists `Settings.domain`, and shows the confirmation (actual installed count + a sample of
     the seeded prompts). Footer: "Browse library" + "Continue ›".
  4. **Get started** — "Create your first folder" and "Open a platform" actions, plus
     "Finish setup". Each path marks onboarding complete and lands the user in the workspace.
- **Stepper mechanics:** progress dots reflect the current step; "Back" returns to the prior
  step; onboarding is marked complete **only** at the end (final-step actions or the welcome
  skip), not on intermediate "Continue".
- Wire the get-started actions to existing seams: "Create your first folder" issues the
  `folder.create` workspace op; "Open a platform" opens a P0 host tab (reusing the
  `openConversation` tab-routing pattern / `platformOrigin`).
- Remove the temporary "Add starter prompts" affordance from `PromptsPanel` (onboarding now owns
  seeding); the `installSeeds` controller method and the worker `prompts.install` path stay.
- Tests for all of the above are authored by a sub agent (see tasks.md).

## Capabilities

### Modified Capabilities

- `onboarding`: the first-run surface becomes a four-step stepper (welcome → permissions priming
  → starter-library/domain-picker → get-started). Completion moves to the final step; new
  requirements cover step navigation, the informational permissions screen, domain-pick →
  seed → confirmation, and the create-folder / open-platform / finish actions. The
  foundation's gate, branch precedence, and no-flash requirements are unchanged.

## Impact

- **Code:** `ui/onboarding/OnboardingSurface.tsx` (placeholder → stepper) + new per-step
  components and `ui/onboarding/styles.ts`; `ui/onboarding/gate.ts` (a domain-persist helper);
  `ui/prompts/PromptsPanel.tsx` + `strings.ts` (drop the temporary affordance). No worker,
  messaging, or store changes — seeding, folder-create, and tab-open all reuse existing seams.
- **Data:** none new — writes the already-defined `Settings.domain` and `onboardingCompleted`;
  seeds become ordinary `Prompt` records via the existing installer. No migration.
- **Privacy:** none — permissions priming is informational; no new permission request, no
  network, no new data boundary.
- **Dependencies:** builds on `onboarding-foundation` (gate + branch) and `prompt-catalog`
  (`installSeeds` / `DOMAIN_REGISTRY`), both complete. Subsumes the previously-planned
  `onboarding-permission-priming` slice — under Option A there is no separate manifest work, so
  that slice is dropped (it would only return if real runtime permission requests are later
  adopted).
