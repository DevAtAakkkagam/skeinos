## Context

The Prompts tab (`prompts-library`, shipped) opens to an empty list on a fresh install. We
want curated starter prompts grouped by professional domain, and we want a later onboarding
step to ask the user's field and install only that domain's prompts. The `Prompt` model
(`shared/types.ts`) already carries a user-editable `promptFolderId` category, `tags`, and the
sync envelope; the worker is the single writer (`core/prompts/handlers.ts`), and the store
applies additive, append-only migrations (`core/store/db.ts`). There is no first-run or
onboarding infrastructure yet (`Settings` is just `{theme, telemetry}`).

## Goals / Non-Goals

**Goals:**
- A bundled, versioned catalog of 4 domains × 5 starter prompts (20 total), shipped as data.
- A stable `domain` axis on `Prompt`, independent of the editable category, usable as the
  onboarding filter key.
- An idempotent `installSeeds(store, domain)` that copies one domain's prompts into the store
  as ordinary editable records, safe to re-run.
- One additive store migration; no data backfill.
- A temporary install trigger in the Prompts panel so the mechanism is exercisable now.

**Non-Goals:**
- The onboarding flow (domain picker, first-run gate, `Settings.domain`) — a later change.
- Auto-installing on first run, updating already-installed seeds across catalog versions, or
  any "restore defaults" UX. Out of scope here.
- Prompt insertion / slash-alias behavior (still C13).

## Decisions

### D-A: `domain` is a first-class `Prompt` field, not the category
Add `domain?: DomainId` to `Prompt`. The user-editable `promptFolderId` category is too volatile
to be the onboarding filter key (users rename/move freely); `domain` is set once at install and
stays the stable axis onboarding will filter on. Seeds install **uncategorized**
(`promptFolderId: null`) so the user organizes them into their own categories freely without
losing their domain identity.

### D-B: `seedId` provenance enables idempotent install
Add `seedId?: string` to `Prompt`. Each catalog entry has a stable `seedId` (e.g.
`software-engineering/code-review`). `installSeeds` queries existing prompts, collects present
`seedId`s, and inserts only the missing ones — so re-running a domain, or installing a second
domain, never duplicates. A user-authored prompt has no `seedId` and is never touched.

### D-C: Catalog is bundled data, never the store until installed
The catalog lives in `core/prompts/catalog/<domain>.ts` (one file per domain) exporting plain
`SeedPrompt` objects, aggregated by `catalog/index.ts`. It is read-only module data — it never
writes the store on import. Only `installSeeds` writes, and only the picked domain. This keeps
the catalog versionable across releases with no migration and keeps the store purely the user's.

### D-D: `SeedPrompt` is a catalog shape, not a stored `Prompt`
A `SeedPrompt` carries only authored content: `seedId`, `domain`, `title`, `body`, optional
`description`, `tags`, `targetModels`, `slug`. The installer is the single place that turns it
into a stored `Prompt`: it derives `variables` via `parseVariables(body)` (reusing the worker's
own derivation, never hand-authored in the catalog), sets `promptFolderId: null`, initializes
`usageCount: 0`, mints a fresh `id`, and lets `Repo.put` stamp the sync envelope. This mirrors
the `prompt.create` handler exactly so seeded and hand-created prompts are structurally identical.

### D-E: `installSeeds` lives in `core/prompts/seed.ts`, runs in the single writer
The installer takes the store (the worker's repo set) and a `DomainId`, and performs the
query-existing-then-put-missing loop above. It is invoked from the worker side (the temporary
affordance messages the worker, consistent with SW-1; the worker calls `installSeeds`). It
returns the count installed so the UI can confirm. Because it only uses `store.prompts`, it
adds no new message kind beyond a thin `prompts.install` request handled like other mutations
(broadcasting `state.changed` for `prompts` when count > 0).

### D-F: Migration v5 is a no-op additive bump
`domain` and `seedId` are optional, non-indexed record fields, so existing `prompts` rows stay
valid unchanged — exactly like the v3 `ConversationIndex` field additions. The new migration
step is an empty function that records the version bump in the append-only list; never edit a
shipped step.

### D-G: `DomainId` + `DOMAIN_REGISTRY` in `shared/domains.ts`
A `DomainId` union (`'software-engineering' | 'marketing-content' | 'data-analytics' |
'education-research'`) plus a `DOMAIN_REGISTRY: { id: DomainId; label: string }[]` give a single
source of truth for the four domains, their display labels (i18n-ready), and a stable ordering
the catalog and the future onboarding picker both read.

## Risks / Trade-offs

- **Catalog updates after install**: editing a seed's catalog body later does NOT update an
  already-installed copy (dedupe is by `seedId` presence, not content hash). Accepted — seeds are
  starting points the user owns once installed; a "sync seeds" feature is explicitly out of scope.
- **Two grouping axes** (`domain` vs category) could confuse. Mitigated by installing uncategorized
  and treating `domain` as an invisible filter key, not a second visible folder tree in this change.
- **Content quality is subjective.** The 20 prompts are a curated starting set; they live in data
  and are cheap to revise in a later change without touching the installer or schema.
- **Test authorship**: the spec scenarios below are authored as tests by a sub agent (per the
  proposal); the sub agent pins the `prompts.install` request shape and `installSeeds` return
  contract against these scenarios.
