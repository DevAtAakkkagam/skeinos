# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Skeinos** — a Manifest V3 browser extension that overlays a unified organization,
search, prompt-library, and multi-model-comparison layer on top of LLM chat sites
(Claude, Gemini, Perplexity, and later Grok, DeepSeek, ChatGPT, Mistral). It is **local-first
and privacy-first**: conversation content never leaves the device on the free tier; only
encrypted metadata syncs on paid tiers.

**Current state: greenfield.** There is no application code yet — only planning docs and an
OpenSpec change queued for implementation. The first code lands when `bootstrap-skeinos` is applied.

## Source of truth — read these before designing or coding

The three planning docs are layered (each builds on the previous); when they conflict, the
**most specific / most recent wins**, and `docs/DECISIONS.md` overrides all of them:

- `docs/PRD_Multi_LLM_Workspace_Extension.md` — product requirements, tiers, personas, NFRs.
- `docs/TDD_Multi_LLM_Workspace.docx` — high-level architecture (binary `.docx`; some lines
  superseded — see DECISIONS.md).
- `docs/LLD_Multi_LLM_Workspace.md` — implementation-level design: module boundaries, interfaces,
  data model, message protocol, algorithms, and the M0–M8 task plan. **This is the primary
  reference for any implementation work.**
- `docs/DECISIONS.md` — **authoritative decision log (D1–D8).** Reconciles doc conflicts. Read first.

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
- The active change is `openspec/changes/bootstrap-skeinos/` (M0 tasks T0.1 + T0.2: build scaffold +
  shadow-DOM mount harness). Apply it with the `/opsx:apply` skill.
- Spec scenarios are written to be testable — each `#### Scenario` maps to roughly one test, and
  `tasks.md` checkboxes are the merge gates. Keep them in sync when implementing.

The LLD plan is sized so **one task ≈ one PR**, and M0 is deliberately **split** into independent changes:
`bootstrap` first, then store / messaging / settings as siblings (settings does not depend on the store).

## Conventions

- Modules depend **inward toward the core**; nothing in `core/` imports adapter or UI code (LLD §2).
- Minimum permissions: the manifest requests host permissions for supported platforms only — never
  `<all_urls>`, never credential-bearing permissions.
- Planned test stack (LLD §12): Vitest (unit/integration, with fake-indexeddb), Playwright (E2E on mock
  host pages), adapter contract suite against recorded DOM fixtures, CI benchmarks for NFR budgets.
