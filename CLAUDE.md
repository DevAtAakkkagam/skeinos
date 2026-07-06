# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Skeinos** — a Manifest V3 browser extension that overlays a unified organization,
search, prompt-library, and multi-model-comparison layer on top of LLM chat sites
(Claude, ChatGPT, Gemini, Perplexity, and later Grok, DeepSeek, Mistral). It is **local-first
and privacy-first**: conversation content never leaves the device on the free tier; only
encrypted metadata syncs on paid tiers.

**Current state: bootstrapped.** `bootstrap-skeinos` (M0 tasks T0.1+T0.2) is applied and archived —
the `extension/` scaffold builds an installable MV3 extension that mounts a shadow-DOM Preact panel
with theme tokens, base components, and CI. Two capabilities exist (`extension-shell`, `ui-shell`).
The next ready, independent slices are `workspace-store`, `messaging`, and `settings`. See
`docs/OPENSPEC_CHANGES.md` for the full M0–M8 change map and dependency graph.

## Commands

All commands run from `extension/` (the only npm package — there is no root `package.json`).

```bash
npm run dev               # WXT dev server (Chrome); dev:firefox for Firefox
npm run build             # production build → .output/ ; build:firefox, zip for store artifact
npm run typecheck         # tsc --noEmit
npm run lint              # eslint . ; lint:fix to autofix
npm test                  # Vitest unit/integration (happy-dom)
npm run test:browser      # real-Chromium tests (shadow-DOM + token resolution) via Playwright system Chrome
npm run test:all          # both suites
npm run check:size        # enforce extension/bundle-budgets.json against the last build
```

Run a single test file or pattern: `npm test -- tests/messaging.test.ts` or `npm test -- -t "name substring"`.
Real-browser tests live in `tests/browser/**/*.browser.test.{ts,tsx}` and need a local Chrome (Playwright `chrome` channel — no download); everything else runs under happy-dom. After a UI/manifest change, run `typecheck` + `test` before `test:browser`.

## Source of truth — read these before designing or coding

The three planning docs are layered (each builds on the previous); when they conflict, the
**most specific / most recent wins**, and `docs/DECISIONS.md` overrides all of them:

- `docs/PRD_Multi_LLM_Workspace_Extension.md` — product requirements, tiers, personas, NFRs.
- `docs/TDD_Multi_LLM_Workspace.docx` — high-level architecture (binary `.docx`; some lines
  superseded — see DECISIONS.md).
- `docs/LLD_Multi_LLM_Workspace.md` — implementation-level design: module boundaries, interfaces,
  data model, message protocol, algorithms, and the M0–M8 task plan. **This is the primary
  reference for any implementation work.**
- `docs/DECISIONS.md` — **authoritative decision log (D1–D23).** Reconciles doc conflicts. Read first.
- `docs/OPENSPEC_CHANGES.md` — the M0–M8 task plan clustered into 35 OpenSpec changes, with the
  change-level dependency graph and what's ready to start now.
- `docs/DEV_GUARDRAILS.md` — full engineering rules (MV3 / service worker / Preact / store / adapter /
  privacy / test), with tagged rule IDs to cite in review. The terse version is the section below.

## Locked stack decisions (from DECISIONS.md — do not re-litigate without reason)

- **Build:** WXT (generates per-browser MV3 manifest; Firefox-ready).
- **UI:** Preact + TypeScript, mounted in a **shadow-DOM overlay** for host-CSS isolation.
- **Settings storage:** `chrome.storage.local`. **Workspace storage:** IndexedDB via the `idb`
  wrapper, behind a typed `Repo<T>` + explicit migration list.
- **Search:** a **custom sharded postings index** (LLD §8) — *not* MiniSearch/lunr.
- **Sync envelope wired from day one:** every `Repo.put()` bumps `rev`/`updatedAt`/`deviceId`/`hash`;
  deletes write tombstones — even though sync itself ships in M5 (avoids a later data migration).

## Architecture spine (non-obvious, load-bearing)

```
Content script (per LLM tab)  ──typed Request/Response + Broadcast──▶  Service worker
  · platform adapters (DOM read/write via JSON config)                  · the SINGLE WRITER
  · shadow-DOM UI overlay (sidebar, search, input bar)                  · owns IndexedDB
                                                                        · search index, sync, tier gate
```

Three rules that ripple through every module:

1. **The service worker is the single writer.** Content scripts NEVER write storage directly —
   they message the worker. This keeps multi-tab state consistent and avoids races.
2. **No memory-only state in the service worker.** MV3 kills the worker after ~30s idle; all durable
   state lives in IndexedDB and the worker rehydrates on wake. Any new state must survive worker death.
3. **Platform adapters are config-driven and isolated.** One generic adapter + a per-platform JSON
   config (selectors/anchors); a broken platform disables only its own overlay. Configs are hot-fixable
   without a store release. The `PlatformAdapter` interface (LLD §4.1) is the only platform contract
   the rest of the system sees.

**Sync boundary (hard rule):** only metadata records sync, and only as ciphertext. `ConversationIndex`,
`searchPostings`, and `Comparison` records never leave the device.

## Working with OpenSpec (the change workflow)

This repo uses OpenSpec (`openspec/`) for spec-driven changes. Work is organized as **changes**, each
with `proposal.md` → `design.md` → `specs/**` → `tasks.md`, gated in that dependency order.

- Inspect: `openspec list --json`, `openspec status --change "<name>" --json`
- `bootstrap-skeinos` is applied and archived. Start the next change with `/opsx:propose <name>`
  (the ready ones are `workspace-store`, `messaging`, `settings`), then `/opsx:apply <name>`.
- Spec scenarios are written to be testable — each `#### Scenario` maps to roughly one test, and
  `tasks.md` checkboxes are the merge gates. Keep them in sync when implementing.

The LLD's ~50 tasks are clustered into **35 capability-aligned changes** in `docs/OPENSPEC_CHANGES.md`.
M0 is deliberately **split**: `bootstrap` (done), then store / messaging / settings as independent
siblings (settings does not depend on the store, per D4).

## Dev guardrails (terse — full rationale in `docs/DEV_GUARDRAILS.md`)

- **[SW] Single writer, no memory-only state.** Only the service worker writes IndexedDB; content
  scripts/UI message it. Assume the worker cold-starts on every event — register listeners
  synchronously at top level, keep durable state in storage, use `chrome.alarms` (not `setTimeout`).
- **[STORE] `Repo<T>` only.** All persistence through `core/store`; every `put()` bumps the sync
  envelope (`rev/updatedAt/deviceId/hash`), `delete()` writes a tombstone; schema changes add a
  migration (never mutate one). `searchPostings` exists in the M0 schema (D6).
- **[PREACT] Shadow DOM + tokens.** All UI mounts in a shadow root; style only from `--sk-*` tokens
  (no host classes, no hard-coded colors); no hard-coded user-facing strings — add a key to
  `src/locales/en.ts` and read it via `t()`/`useT()` from `core/i18n` (a lint rule + completeness
  test enforce this); everything keyboard-operable + ARIA-labelled. UI is a pure view over worker state.
- **[ADAPT] Config-driven + isolated.** One generic adapter + per-platform JSON config; `PlatformAdapter`
  is the only contract outside `adapters/`; `selfCheck` failure disables only that platform; every
  adapter passes the shared contract suite against its fixture.
- **[MV3] Minimum permissions, no remote code.** Never `<all_urls>`, never credential permissions;
  add a host permission only when its platform's adapter ships, with a justification in the proposal.
  Remote adapter *config* (data) is fine and schema-validated; remote *code* is not.
- **[PRIV] Hard boundary.** `ConversationIndex`, `searchPostings`, `Comparison` never leave the
  device — any tier. Only metadata syncs, only AES-GCM ciphertext, backend in the EU. No credentials.
  Telemetry off by default. Tier limits block-with-nudge; never lose user input.

## Where code lives (`extension/src/`)

The directory layout mirrors the architecture spine — `core/` is the inward dependency target:

- `core/` — the worker's domain logic: `store/` (`Repo<T>` + IndexedDB + migrations), `messaging/`
  (typed Request/Response hub + client), `folders/`, `settings/`, `i18n/` (locale resolution +
  `t()`/`useT()`; catalogs live in `src/locales/`). Imports nothing from `adapters/` or `ui/`.
- `adapters/` — generic platform adapter + per-platform `configs/`, `resilience/` (fallback banners),
  `runtime/` (readiness gating). `PlatformAdapter` is the only contract exposed outward.
- `background/` — service-worker entry (the single writer); `content/` — per-tab content script.
- `ui/` — shadow-DOM Preact: `primitives/`, `components/`, `theme/` (`--sk-*` tokens), `sidebar/`, `options/`.
- `entrypoints/` — WXT entrypoints (`sidepanel/`, `options/`) that mount the UI.

Tests live in `extension/tests/` (flat, one file per unit) with the real-browser suite under `tests/browser/`.

## Conventions

- Modules depend **inward toward the core**; nothing in `core/` imports adapter or UI code (LLD §2).
- Minimum permissions: the manifest requests host permissions for supported platforms only — never
  `<all_urls>`, never credential-bearing permissions.
- Planned test stack (LLD §12): Vitest (unit/integration, with fake-indexeddb), Playwright (E2E on mock
  host pages), adapter contract suite against recorded DOM fixtures, CI benchmarks for NFR budgets.
