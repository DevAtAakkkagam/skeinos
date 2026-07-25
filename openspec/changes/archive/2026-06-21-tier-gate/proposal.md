## Why

The free/Pro tier model is the product's monetization spine, yet today the tier is
hardcoded (`SidebarShell` renders a static `PRO` "coming soon" badge) and nothing enforces
the free-tier limits the PRD promises (§7: 5 folders, 25 prompts, 3 profiles, 10 tags).
Enforcing from day one — before Pro is purchasable (M5) — avoids a painful retroactive
workspace-shrink migration when paid tiers ship, and it makes the limits a real,
testable contract rather than marketing copy. Per `docs/OPENSPEC_CHANGES.md` C9 and
`docs/DEV_GUARDRAILS.md` [PRIV] ("tier limits block-with-nudge; never lose user input").

## What Changes

- Add a single source of truth for tier state (`FREE` | `PRO`) and the per-tier limit
  table (folders / prompts / profiles / tags), centralized as constants from the contract.
- Enforce quotas **in the service worker** (the single writer) on the create paths that
  exist today: `folder.create`, `prompt.create`, `profile.create`. A create at-or-over the
  tier limit is rejected with a typed `quota_exceeded` error carrying the resource, current
  count, and limit — **the worker never silently drops or truncates user data**.
- Surface a **block-with-nudge** UI: when a create is refused, the entered values are
  preserved (modal/draft stays open) and an informational upgrade nudge explains the limit.
  Because Pro is not yet purchasable, the nudge is informational (no checkout), consistent
  with the M5 sequencing.
- Make the tier badge reflect real state from settings instead of the hardcoded `PRO`.
- Define the **tags** limit in the table now; tag-create enforcement is wired by the
  `tags` change (C7), which has no create handler yet. Out of scope here: billing/checkout,
  sync, and any Pro-only feature unlocks (multi-model, analytics) — all M5.

## Capabilities

### New Capabilities
- `tier-gate`: the tier state (`FREE`/`PRO`), the per-tier quota table, the worker-side
  enforcement contract (quota-governed creates are rejected at limit with a structured
  error), the non-destructive block-with-nudge UX, and the dynamic tier badge.

### Modified Capabilities
- `settings`: gains a persisted `tier` field (defaults to `FREE`) read by worker and UI.
- `folders`: `folder.create` is rejected when the folder quota is reached.
- `prompts`: `prompt.create` is rejected when the prompt quota is reached.
- `profiles`: `profile.create` is rejected when the profile quota is reached.

## Impact

- **Code (worker):** new `core/tier/` (limits table + `assertWithinQuota` guard); create
  branches in `core/folders/handlers.ts`, `core/prompts/handlers.ts`,
  `core/profiles/handlers.ts` consult the guard before `put()`.
- **Code (shared):** `shared/settings.ts` adds `tier`; a shared `quota_exceeded` error
  code/shape and the limits constants.
- **Code (UI):** create flows in `ui/folders`, `ui/prompts`, `ui/profiles` catch the error
  and render the upgrade nudge while preserving input; `ui/sidebar/SidebarShell.tsx` badge
  becomes tier-driven; reuse the existing `.sk-nudge` style pattern.
- **Data:** no schema/migration change (tier lives in `chrome.storage.local` settings; counts
  derive from existing stores via `Repo.query()`).
- **Tests:** quota boundary tests per resource (at limit, over limit, PRO unlimited), the
  non-destructive nudge behavior, and the dynamic badge.
- **Dependencies:** none new. Unblocks C24/C26 (Pro unlock + billing) in M5.
