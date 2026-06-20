## 1. Model + domain registry

- [x] 1.1 Add optional `domain?: DomainId` and `seedId?: string` to `Prompt` in `shared/types.ts`.
- [x] 1.2 Create `shared/domains.ts`: `DomainId` union and ordered `DOMAIN_REGISTRY` with the four
      domains (`software-engineering`, `marketing-content`, `data-analytics`, `education-research`)
      and i18n-ready labels.

## 2. Store migration

- [x] 2.1 Append a v5 no-op migration step to `MIGRATIONS` in `core/store/db.ts` recording the
      `domain`/`seedId` additive field bump (mirror the v3 empty-step comment; never edit a shipped step).

## 3. Catalog data

- [x] 3.1 Define the `SeedPrompt` shape (authored content only — `seedId`, `domain`, `title`, `body`,
      optional `description`/`tags`/`targetModels`/`slug`; no `variables`/`id`/envelope) in
      `core/prompts/catalog/index.ts`.
- [x] 3.2 Author one file per domain under `core/prompts/catalog/` with exactly five `SeedPrompt`
      entries each (use `{{var}}` templates where natural); `seedId`s unique and domain-scoped.
- [x] 3.3 Aggregate all domain files into `CATALOG: SeedPrompt[]` in `catalog/index.ts`.

## 4. Installer + worker wiring

- [x] 4.1 Implement `installSeeds(store, domain)` in `core/prompts/seed.ts`: query existing prompts,
      collect present `seedId`s, build a `Prompt` for each missing catalog seed of that domain
      (derive `variables` via `parseVariables`, `promptFolderId: null`, `usageCount: 0`, mint `id`,
      carry `seedId`/`domain`), `put` it, and return the inserted count. Idempotent; never touches
      `seedId`-less prompts.
- [x] 4.2 Add a typed `prompts.install` request (declaration-merged kind, `{ domain }`) and handle it
      in `core/prompts/handlers.ts` by calling `installSeeds`; broadcast `state.changed` for `prompts`
      only when count > 0; reply with the count.
- [x] 4.3 Add the client wrapper (mirrors `mutatePromptLibraryRemote`) in `core/prompts/client.ts`.

## 5. Temporary install affordance (UI)

- [x] 5.1 Add an "Add starter prompts" control to `ui/prompts/PromptsPanel.tsx` (with a domain choice
      sourced from `DOMAIN_REGISTRY`) that issues `prompts.install` and lets the existing
      observe-don't-replay flow re-render; add strings to `ui/prompts/strings.ts`. Mark in code as
      temporary — replaced by the onboarding picker in a later change.

## 6. Tests (authored by a sub agent)

- [x] 6.1 Catalog validity: five seeds per registry domain, 20 total, unique `seedId`s, every
      `body` parses via `parseVariables` without throwing.
- [x] 6.2 Installer: per-domain insert returns 5 and stamps `domain`/`seedId`/`null` category/derived
      `variables`; re-run returns 0; second domain leaves first untouched; `seedId`-less user prompts
      are never modified.
- [x] 6.3 Worker `prompts.install`: returns count, broadcasts `prompts` only when count > 0.
- [x] 6.4 Migration: v5 is a no-op bump; pre-v5 `prompts` rows stay readable with `domain`/`seedId`
      `undefined`.

Test-contract pins (so sub-agent tests and implementation converge): the request kind is
`prompts.install` with payload `{ domain: DomainId }`; `installSeeds(store, domain)` returns the
inserted `number`; the install reply payload is `{ installed: number }`.
