## Context

The tier is hardcoded in the UI (`SidebarShell` renders a static `PRO` "coming soon" badge) and
no quota is enforced anywhere. Creates flow through the single-writer service worker via mutation
handlers — `workspace.mutate` (`folder.create`), `prompts.mutate` (`prompt.create`),
`profiles.mutate` (`profile.create`) — each ending in a `store.<repo>.put()` after a
`store.<repo>.query()` that already materializes the current set. Tags have a store but **no
create handler** (the `tags` change, C7, is unbuilt). Settings live in `chrome.storage.local`
(`shared/settings.ts` + `core/settings/`), merged onto `DEFAULT_SETTINGS`, observable via
`subscribeSettings`. Errors thrown in a handler are wrapped by the hub into
`{ ok: false, error: AppError }` and surface to the UI client with a stable `code`.

Constraints: single-writer ([SW]), block-with-nudge that never loses input ([PRIV]), no
schema/migration churn, no new dependency, Pro not purchasable until M5.

## Goals / Non-Goals

**Goals:**
- One source of truth for tier and limits; identical numbers for worker enforcement and UI copy.
- Reject over-quota creates atomically in the worker with a structured, typed error.
- Non-destructive UI nudge that keeps the user's draft and is informational (no checkout).
- Dynamic tier badge driven by settings.

**Non-Goals:**
- Billing/checkout, Pro purchase, or any Pro feature unlock (multi-model, analytics) — M5.
- Tag-create enforcement (no handler yet) — wired by C7 using the same guard.
- Sync of tier (tier is device-local settings until billing exists).
- Retroactively pruning workspaces that already exceed limits (see Risks).

## Decisions

**D1 — Centralized limits in `core/tier/`.** A new `core/tier/limits.ts` exports
`type Tier = 'FREE' | 'PRO'`, `RESOURCES = ['folders','prompts','profiles','tags']`, and
`TIER_LIMITS: Record<Tier, Record<Resource, number>>` with `FREE` = {5,25,3,10} and `PRO` =
`Infinity`. A pure `assertWithinQuota(resource, currentCount, tier)` throws a typed
`QuotaError` (code `quota_exceeded`, detail `{ resource, count, limit }`) or returns void.
*Why:* keeps the numbers testable and shared; UI imports the same constants for copy.
*Alternative:* per-handler magic numbers — rejected (drift between worker and UI, untestable).

**D2 — Enforce at the existing query→put seam.** Each create branch already calls
`store.<repo>.query()`; pass `result.length` and the current tier to `assertWithinQuota` before
`put()`. *Why:* zero extra reads, naturally atomic (throw aborts before write, no broadcast).
*Alternative:* a generic guard wrapping every mutation op — rejected as over-broad; only creates
are quota-governed, and op shapes differ per capability.

**D3 — Tier read path in the worker.** Handlers read tier via `getSettings()` (already used by
the worker context) at enforcement time, defaulting `FREE`. *Why:* avoids threading tier through
every call site and survives worker cold-start (no memory-only state). Counts come from the live
`query()`, never cached.

**D4 — `quota_exceeded` is one shared code, resource in `detail`.** UI switches on
`error.code === 'quota_exceeded'` and reads `error.detail.resource` to pick copy. *Why:* one
catch path across folders/prompts/profiles; new resources (tags) need no new code.

**D5 — UI nudge reuses the `.sk-nudge` pattern, rendered inside the create surface.** The folder/
prompt/profile create components catch the typed error and set local nudge state without clearing
fields. *Why:* preserves input by construction (no unmount/reset); reuses existing style tokens.
*Alternative:* a global toast — rejected; a toast that auto-dismisses risks reading as data loss
and detaches the explanation from the form.

**D6 — Badge from settings.** `SidebarShell` reads `tier` (via the settings hook/`getSettings`)
and renders `FREE`/`PRO`; drop the hardcoded `STR.tier='PRO'`. Strings stay in the `STR` table
(i18n-ready, [PREACT]).

## Risks / Trade-offs

- **[Pre-existing over-limit workspaces]** A user who created data before enforcement (or via a
  future import) may sit above a limit. → Enforce only on *create* (never delete/migrate user
  data); over-limit state is allowed and simply blocks new creates until the user is back under.
- **[Count race across tabs]** Two tabs creating concurrently could both pass the check. → The
  single writer serializes mutations; worst case is one extra record over the limit, self-correcting
  on the next create. Acceptable (no data loss, matches single-writer guarantees).
- **[Nudge fatigue / wrong tone]** Informational-only nudge with no action could frustrate. →
  Copy states the concrete limit and that Pro raises it later; revisited when billing ships (M5).
- **[Limit drift]** UI and worker disagreeing on numbers. → Mitigated by D1 (single constant).

## Migration Plan

No data migration. `tier` defaults to `FREE` for all existing settings records via the existing
default-merge in `getSettings()`. Rollout is additive: enforcement is live as soon as the handlers
ship. Rollback = revert the change; no persisted shape depends on it (the `tier` settings key is
simply ignored by older code).

## Open Questions

- Exact free-tier nudge copy and whether to link to a (future) pricing page placeholder — deferred
  to implementation; default to plain informational text now.
- Should the badge be clickable to a "what's in Pro" panel pre-M5? Default: non-interactive label
  now; revisit with billing.
