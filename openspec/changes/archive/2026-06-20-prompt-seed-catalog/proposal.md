## Why

A fresh install opens the Prompts tab to an empty library — no starting material, no
sense of what a good prompt looks like. We want curated, domain-grouped starter prompts
so a new user can be productive immediately, and so a later onboarding step can ask the
user's field and install only that domain's prompts ("show only my domain").

## What Changes

- Add an explicit `domain` axis to the `Prompt` model (`domain?: DomainId`) plus a
  `seedId?` provenance field — independent of the user-editable category, so it stays a
  stable filter key for onboarding.
- Introduce a `DomainId` union + `DOMAIN_REGISTRY` (four domains: software-engineering,
  marketing-content, data-analytics, education-research).
- Ship a **bundled, read-only catalog** of starter prompts — 4 domains × 5 prompts = 20 —
  as data in the extension bundle, never written to the store until installed.
- Add an idempotent `installSeeds(store, domain)` that copies one domain's prompts into the
  workspace store as ordinary editable `Prompt` records (uncategorized), deduping by `seedId`
  so re-running never duplicates.
- Bump the workspace-store schema version for the two additive optional fields (no data
  backfill needed; old prompts read back with `domain`/`seedId` undefined).
- Add a temporary "Add starter prompts" affordance in the Prompts panel as the install
  trigger for this change. **The onboarding domain-picker is deferred to a later change**
  that simply calls `installSeeds(pickedDomain)`.

Tests for all of the above are authored by a sub agent (see tasks.md).

## Capabilities

### New Capabilities

- `prompt-catalog`: the bundled domain registry + starter-prompt catalog and the idempotent
  installer that copies a domain's seeds into the workspace store.

### Modified Capabilities

- `prompts`: the `Prompt` record gains the optional `domain` and `seedId` fields.
- `workspace-store`: schema version bump adding the two optional `Prompt` fields via a
  no-backfill migration.

## Impact

- **Code:** `shared/types.ts` (Prompt fields), new `shared/domains.ts`, new
  `core/prompts/catalog/**`, new `core/prompts/seed.ts`, store migration list, `ui/prompts/PromptsPanel.tsx`
  (temporary install affordance + strings).
- **Data:** one additive store migration (optional fields → no backfill).
- **Privacy:** none — seeds become normal `Prompt` records riding the existing sync envelope;
  no new data boundary, no network. Catalog is local bundle data.
- **Deferred:** onboarding flow (domain picker + first-run gate + `Settings.domain`).
