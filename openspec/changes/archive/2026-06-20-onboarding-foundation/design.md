## Context

The side panel (`entrypoints/sidepanel/SidePanelApp.tsx`) today has exactly one decision:
resolve the active tab's platform, then render `platform == null ? <empty> : <SidebarShell>`.
There is no concept of a "first run." `Settings` is `{ theme, telemetry }` (plus a
`sidebarCollapsed` UI preference), read/written through `core/settings` over
`chrome.storage.local` with a defaults-merge-on-read pattern that keeps old installs valid as
keys are added.

The `prompt-seed-catalog` change (active) already shipped the pieces a domain picker will call:
`DomainId` + `DOMAIN_REGISTRY` (`shared/domains.ts`), the `prompts.install` request, and
`installSeeds`. Its design explicitly defers "the onboarding flow (domain picker, first-run
gate, `Settings.domain`)" to a later change. This is that change — but scoped to the **gate
and settings only**, not the screens, so the D17 flow lands afterward as pure UI.

Constraints that shape the design:
- **[SW] no memory-only state.** The "have we onboarded?" bit must survive a worker/panel
  reload. `chrome.storage.local` (where settings already live) satisfies this for free.
- **[PREACT] UI is a pure view over stored state.** The gate is read reactively and re-scopes
  on change; no imperative one-shot.
- **Additive settings.** The merge-on-read accessor means new keys must be optional with a
  default, never a required shape change.

## Goals / Non-Goals

**Goals:**
- A durable first-run gate: a persisted, defaulted `onboardingCompleted` flag plus a `domain`
  field, exposed through the existing settings accessors.
- A router branch that shows an onboarding surface before the workspace when the gate is open,
  and re-scopes live when it closes.
- A minimal placeholder surface with one action that closes the gate — enough to prove the
  spine end to end and unblock the next slice.

**Non-Goals:**
- The D17 screens (welcome, privacy pitch, host-permission priming, domain picker, first-action
  CTA) — `onboarding-flow`.
- Calling `installSeeds` / wiring the domain picker to seeding — `onboarding-flow`.
- Any manifest / `optional_host_permissions` work — `onboarding-permission-priming`.
- A reset / "re-run onboarding" affordance.

## Decisions

### D-1: Store the gate in `Settings`, not the workspace store
`onboardingCompleted` and `domain` go in `shared/settings.ts` (`chrome.storage.local`), not
IndexedDB. Rationale: the gate must be readable before the workspace DB opens and on every cold
panel mount; settings are already that pre-DB, multi-context-safe, worker-death-surviving layer
(D4, [SW]). Alternative — a dedicated `onboarding` store record — was rejected: it adds a
migration, needs the worker to be awake to read, and duplicates the defaults-merge machinery
settings already provide.

### D-2: Both fields additive and optional, defaulting on read
`onboardingCompleted: boolean` defaults to `false`; `domain?: DomainId` is optional (undefined
until the user picks one). They ride the existing `{ ...DEFAULT_SETTINGS, ...stored }` merge, so
a settings object written before this change reads back as "not yet onboarded" with no domain —
exactly the first-run state we want. No migration, no accessor signature change.

### D-3: Gate read + write reuse `getSettings`/`setSettings`/`subscribeSettings`
No new persistence API. The onboarding module exposes thin helpers over the existing accessors
(e.g. an `isOnboardingComplete(settings)` selector and a `completeOnboarding()` writer that sets
`onboardingCompleted: true`). The panel subscribes via `subscribeSettings` so finishing
onboarding in any surface updates the panel live — mirroring how theme changes already propagate.

### D-4: Router branch sits ABOVE the platform branch
`SidePanelApp` resolves onboarding state alongside the active platform. Order:
```
onboarding not complete   → <OnboardingSurface/>     (new, this slice = placeholder)
else platform == null     → <empty>                  (existing)
else                      → <SidebarShell/>          (existing)
```
Onboarding takes precedence over the platform branch because it is platform-independent and must
show even when no supported tab is active (a fresh install often has no LLM tab open yet). While
settings are still resolving, render nothing/neutral (same treatment as the existing
"still resolving platform" case) to avoid a flash of the wrong surface.

### D-5: Placeholder surface, not the real screens
The surface this slice ships is intentionally minimal: themed `.sk-shell` container, a short
title/body, and one "Get started" button that calls `completeOnboarding()`. It is marked in code
as temporary — `onboarding-flow` replaces its body with the D17 screens while keeping the same
mount point and gate contract. This keeps the foundation independently shippable and testable.

### D-6: Tests authored by a sub agent
Per the repo's established pattern (see `prompt-seed-catalog`), the test suite is authored by a
sub agent against the contracts pinned in tasks.md: the settings defaults, the selector/writer
behavior, and the panel's branch precedence + live re-scope. Implementation and tests converge on
those pins.

## Risks / Trade-offs

- **[Risk] Gate shows on every install forever if the flag is never written** → the placeholder's
  single action writes `onboardingCompleted: true`; a test asserts the panel leaves the onboarding
  branch after it fires and stays out across a reload.
- **[Risk] Flash of onboarding before settings resolve on a returning user** → treat
  `undefined` (unresolved) settings as "don't render the onboarding branch yet," same neutral
  treatment the panel already uses for unresolved platform; only render onboarding once settings
  resolve to `onboardingCompleted === false`.
- **[Trade-off] Placeholder is throwaway UI.** Accepted: it is a few lines, it proves the gate
  end to end, and it lets the foundation merge before the (larger) screens are designed.
- **[Risk] `sidebarCollapsed` already extends `Settings` in a parallel change** → both are purely
  additive optional keys on the same object; they compose through the merge with no conflict.
