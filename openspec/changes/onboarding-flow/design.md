## Context

`onboarding-foundation` established the spine: `Settings.onboardingCompleted` / `Settings.domain`
in `chrome.storage.local`, a gate (`ui/onboarding/gate.ts` — `isOnboardingComplete` /
`completeOnboarding`), and a `SidePanelApp` router branch that renders `OnboardingSurface` before
the platform branch and re-scopes live via `subscribeSettings`. The current `OnboardingSurface`
is a single placeholder screen (welcome content + a footer that completes the gate immediately).

The design screens (`docs/design/Screens Export/01 Onboarding/`) define a four-step stepper. All
the downstream seams the steps need already exist:
- seeding: `installPromptSeedsRemote(domain)` → worker `prompts.install` → `installSeeds`,
  idempotent, returns the inserted count.
- domains: `DOMAIN_REGISTRY` / `DomainId` (`shared/domains.ts`).
- folder create: the `folder.create` workspace mutation (used by `useWorkspace`).
- open a platform: the tab-routing pattern in `ui/sidebar/openConversation.ts` + `platformOrigin`.

Decisions carried in from exploration: **Option A** (host-permission priming is informational —
no manifest change, no `chrome.permissions.request()`), and the starter-library step uses a
**domain picker** that drives per-domain `installSeeds`.

## Goals / Non-Goals

**Goals:**
- Implement the four design screens as one stepper behind the foundation's existing mount point
  and gate contract.
- Move gate completion to the end of the flow; intermediate steps navigate, they do not complete.
- Wire the get-started actions to existing seams (folder create, open platform) with no new
  worker/store/messaging surface.

**Non-Goals:**
- Any manifest / `optional_host_permissions` / runtime permission request (Option B) — explicitly
  out; the permissions screen is informational copy only.
- Real account sign-in behind "I already have an account" — it skips to completion, same as the
  foundation (sign-in lands with the sync tier).
- Changing the worker seeding path, the `Settings` schema, or the store.
- A "re-run onboarding" / reset affordance.

## Decisions

### D-1: One stepper component owns step state; the gate contract is unchanged
`OnboardingSurface` keeps its identity, mount point, and `onComplete` prop, but its body becomes
a stepper holding the current step index in local component state (ephemeral UI state — it need
not survive a reload, since a reload of an incomplete onboarding simply restarts at step 1, which
is acceptable and matches the gate's "not complete → show onboarding" semantics). The settings
gate stays the only durable state. Rationale: keeps the foundation's branch/precedence/no-flash
requirements intact — `SidePanelApp` still just asks "complete?" and renders the surface or not.

### D-2: Completion happens only at the terminal actions
"Get started"/"Continue"/"Back" move between steps without writing settings. `completeOnboarding()`
is called by exactly: the welcome "I already have an account" skip, and the step-4 actions
("Create your first folder", "Open a platform", "Finish setup"). This is the behavioral change
from the foundation (where the welcome button completed immediately), captured as a MODIFIED
requirement. Rationale: a user who abandons mid-flow should see onboarding again next open.

### D-3: Permissions priming is static informational content (Option A)
Step 2 renders a fixed list derived from the P0 host set (claude.ai / gemini.google.com /
perplexity.ai) with per-site copy and the global assurance. It triggers **no** browser permission
prompt and reads **no** chrome.permissions API — the hosts are already granted at install via the
static `host_permissions`. Alternative (Option B: move hosts to `optional_host_permissions` and
request at runtime) was declined in exploration; it would reopen as its own manifest change.

### D-4: Domain picker drives idempotent per-domain seeding, then confirms
Step 3 first presents the `DOMAIN_REGISTRY` choices. Selecting a domain: (a) calls
`installPromptSeedsRemote(domain)`, (b) persists `Settings.domain` (a new `gate.ts` helper, e.g.
`setOnboardingDomain(domain)` over `setSettings`), and (c) transitions to a confirmation sub-state
showing the **actual** inserted count and a sample of seeded prompt titles. The count comes from
the install reply — never hard-coded (the design's "36" is a mock; the catalog ships 20). Because
the installer dedupes by `seedId`, re-picking the same domain or revisiting the step is a no-op.
"Browse library" and "Continue" both leave the step; "Continue" advances to step 4.

### D-5: Get-started actions reuse existing seams; each completes the gate
- "Create your first folder" issues the existing `folder.create` mutation, then completes
  onboarding so the panel lands on the workspace with the new folder. (A name can come from a
  small inline input or a sensible default — a UI detail, not a contract.)
- "Open a platform" opens a P0 host tab using the `openConversation`/`platformOrigin` tab pattern,
  then completes onboarding.
- "Finish setup" just completes onboarding.
All three end on the workspace via the foundation's live re-scope (no reload).

### D-6: Remove the temporary seed affordance from PromptsPanel
The `prompt-seed-catalog` "Add starter prompts" control was always marked temporary, to be
replaced by the onboarding picker. This change removes it (and its strings), keeping the
`installSeeds` controller method and worker path intact (now driven by step 3). No spec
requirement mandated that affordance, so this is implementation-only.

### D-7: Tests authored by a sub agent
Per repo convention, a sub agent authors the suite against the contracts pinned in tasks.md:
step navigation + completion timing, the informational permissions content, domain-pick → seed
(count from the reply) → confirmation + `Settings.domain` persistence, and the get-started action
wiring. Component tests stub `onComplete`/the install client; the panel-branch behavior is already
covered by the foundation suite.

## Risks / Trade-offs

- **[Risk] Step state lost on reload mid-flow restarts at step 1** → accepted: an incomplete
  onboarding is meant to re-show; restarting at welcome is reasonable and avoids persisting
  ephemeral UI state. Seeding/folder writes already made are idempotent or harmless.
- **[Risk] Seeding fails (worker error) on the starter-library step** → surface a non-blocking
  error and let the user continue/retry; the gate is not completed by step 3, so nothing is lost
  and the picker can be retried (idempotent).
- **[Risk] "36 starter prompts" mock count diverges from the real catalog (20)** → never
  hard-code; render the count from the install reply.
- **[Trade-off] Permissions screen is informational only and does not literally precede a native
  prompt (there is none under static `host_permissions`)** → satisfies D17's intent; flagged in
  the proposal. Reopening Option B is a separate manifest change.
- **[Risk] "Open a platform" with no specific host chosen** → default to the primary P0 host
  (Claude) or offer the three; either way reuse `platformOrigin`, no new permission.
